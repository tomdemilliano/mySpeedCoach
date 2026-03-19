// pages/api/push/send.js
//
// POST { announcementId, title, body, groupIds, clubId }
//
// Internal API — called by the announcements page after creating a new announcement.
// NOT meant to be called directly from the browser by end-users.
//
// Flow:
//   1. For each groupId, fetch all members from the group's Firestore sub-collection
//   2. For each memberId, resolve the uid via userMemberLinks
//   3. For each uid, fetch all pushSubscriptions
//   4. Send a push notification to every subscription
//   5. Auto-clean expired subscriptions (HTTP 410 Gone)
//
// Special groupIds:
//   __ALL_USERS__      → send to every user in the system
//   __ALL_CLUBADMINS__ → send to every user with role === 'clubadmin'

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore }                  = require('firebase-admin/firestore');
const { sendPushNotification }          = require('../../../lib/webpush');

const PROJECT_ID = 'myspeedcoach-416ac';

function getAdminDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId:   PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  return getFirestore();
}

const BROADCAST_ALL       = '__ALL_USERS__';
const BROADCAST_CLUBADMIN = '__ALL_CLUBADMINS__';

// ── Resolve the set of uids to notify ────────────────────────────────────────
async function resolveTargetUids(db, groupIds, clubId) {
  const uidSet = new Set();

  for (const gid of groupIds) {

    // Broadcast: all users
    if (gid === BROADCAST_ALL) {
      const snap = await db.collection('users').get();
      snap.docs.forEach(d => uidSet.add(d.id));
      continue;
    }

    // Broadcast: all clubadmins
    if (gid === BROADCAST_CLUBADMIN) {
      const snap = await db.collection('users').where('role', '==', 'clubadmin').get();
      snap.docs.forEach(d => uidSet.add(d.id));
      continue;
    }

    // Regular group — get members, then resolve their uids via userMemberLinks
    if (!clubId) continue;
    const membersSnap = await db
      .collection(`clubs/${clubId}/groups/${gid}/members`)
      .get();

    const memberIds = membersSnap.docs.map(d => d.data().memberId || d.id);

    // Batch-resolve uids: query userMemberLinks where clubId + memberId in batch
    // Firestore 'in' supports up to 30 values — chunk if needed
    const chunks = [];
    for (let i = 0; i < memberIds.length; i += 30) chunks.push(memberIds.slice(i, i + 30));

    for (const chunk of chunks) {
      if (chunk.length === 0) continue;
      const linksSnap = await db
        .collection('userMemberLinks')
        .where('clubId',       '==', clubId)
        .where('memberId',     'in', chunk)
        .where('relationship', '==', 'self')
        .get();
      linksSnap.docs.forEach(d => {
        const uid = d.data().uid;
        if (uid) uidSet.add(uid);
      });
    }
  }

  return [...uidSet];
}

// ── Main handler ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { title, body, groupIds, clubId, url } = req.body || {};

  if (!title || !Array.isArray(groupIds) || groupIds.length === 0) {
    return res.status(400).json({ error: 'Missing title or groupIds' });
  }

  try {
    const db   = getAdminDb();
    const uids = await resolveTargetUids(db, groupIds, clubId);

    if (uids.length === 0) {
      return res.status(200).json({ ok: true, sent: 0, message: 'No target users found' });
    }

    const payload = {
      title,
      body:  body  || '',
      url:   url   || '/announcements',
      tag:   'msc-announcement',
    };

    let sent    = 0;
    let failed  = 0;
    const expiredEndpoints = []; // subscriptions to clean up

    // Process each uid — fetch their push subscriptions then send
    await Promise.all(uids.map(async (uid) => {
      let subsSnap;
      try {
        subsSnap = await db
          .collection('users')
          .doc(uid)
          .collection('pushSubscriptions')
          .get();
      } catch {
        return; // user may not exist
      }

      await Promise.all(subsSnap.docs.map(async (subDoc) => {
        const { subscription } = subDoc.data();
        if (!subscription?.endpoint) return;

        try {
          await sendPushNotification(subscription, payload);
          sent++;
        } catch (err) {
          failed++;
          // 410 Gone or 404 = subscription is no longer valid, clean it up
          if (err.statusCode === 410 || err.statusCode === 404) {
            expiredEndpoints.push({ uid, docId: subDoc.id });
          } else {
            console.warn(`[push/send] Failed for uid=${uid}:`, err.statusCode, err.body);
          }
        }
      }));
    }));

    // Clean up expired subscriptions asynchronously (don't block the response)
    if (expiredEndpoints.length > 0) {
      Promise.all(
        expiredEndpoints.map(({ uid, docId }) =>
          db.collection('users').doc(uid).collection('pushSubscriptions').doc(docId).delete()
            .catch(() => {}) // best-effort
        )
      );
    }

    console.log(`[push/send] sent=${sent} failed=${failed} expired_cleaned=${expiredEndpoints.length}`);
    return res.status(200).json({ ok: true, sent, failed });

  } catch (err) {
    console.error('[push/send]', err);
    return res.status(500).json({ error: 'Push send failed', detail: err.message });
  }
};
