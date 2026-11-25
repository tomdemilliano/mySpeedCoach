// pages/api/push/notify-join-request.js
//
// POST { clubId }
//
// Stuurt een push-notificatie naar alle clubadmins van de opgegeven club
// die push-notificaties hebben ingeschakeld EN de instelling
// `notifyJoinRequests` niet hebben uitgeschakeld.
//
// Aangeroepen vanuit ClubJoinRequestFactory.create() via een fire-and-forget
// authFetch() nadat het clubJoinRequests-document is aangemaakt.
//
// Access: any verified user, but only for a pending join request of their own
// that was created in the last 10 minutes. The name in the notification comes
// from that request document, never from the request body.

const { getAdminDb }           = require('../../../lib/firebaseAdmin');
const { sendPushNotification } = require('../../../lib/webpush');
const { requireUser }          = require('../../../lib/apiAuth');

const MAX_REQUEST_AGE_MS = 10 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const caller = await requireUser(req, res);
  if (!caller) return;

  const { clubId } = req.body || {};
  if (!clubId || typeof clubId !== 'string') return res.status(400).json({ error: 'clubId required' });

  const db = getAdminDb();

  try {
    // 0. The caller must have a fresh, pending join request for this club
    const reqSnap = await db.collection('clubJoinRequests')
      .where('uid', '==', caller.uid)
      .where('clubId', '==', clubId)
      .where('status', '==', 'pending')
      .get();

    const now = Date.now();
    const joinRequest = reqSnap.docs
      .map(d => d.data())
      .find(d => d.createdAt?.toMillis && now - d.createdAt.toMillis() < MAX_REQUEST_AGE_MS);

    if (!joinRequest) {
      return res.status(403).json({ error: 'Geen recente aanvraag gevonden.' });
    }

    const firstName = String(joinRequest.firstName || '').slice(0, 60);
    const lastName  = String(joinRequest.lastName  || '').slice(0, 60);

    // 1. Zoek alle users met role === 'clubadmin'
    const usersSnap = await db.collection('users')
      .where('role', '==', 'clubadmin')
      .get();

    // 2. Filter: alleen admins van deze club
    //    We controleren dit via userMemberLinks
    const clubAdminUids = [];
    await Promise.all(usersSnap.docs.map(async (userDoc) => {
      const uid = userDoc.id;
      const userData = userDoc.data();

      // Check of de admin notificaties voor join requests wil ontvangen
      // Default: true (opt-out model)
      if (userData.notifyJoinRequests === false) return;

      const linksSnap = await db.collection('userMemberLinks')
        .where('uid', '==', uid)
        .where('clubId', '==', clubId)
        .limit(1)
        .get();

      if (!linksSnap.empty) {
        clubAdminUids.push(uid);
      }
    }));

    if (clubAdminUids.length === 0) {
      return res.status(200).json({ sent: 0 });
    }

    // 3. Stuur push naar elke admin
    let sent = 0;
    const expiredEndpoints = [];

    await Promise.all(clubAdminUids.map(async (uid) => {
      const subsSnap = await db
        .collection(`users/${uid}/pushSubscriptions`)
        .get();

      await Promise.all(subsSnap.docs.map(async (subDoc) => {
        const { subscription } = subDoc.data();
        if (!subscription?.endpoint) return;
        try {
          await sendPushNotification(subscription, {
            title: 'Nieuwe lidmaatschapsaanvraag',
            body:  `${firstName} ${lastName} vraagt toegang tot je club.`,
            url:   '/clubadmin?tab=leden#aanvragen',
            tag:   `join-request-${clubId}`,
          });
          sent++;
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            expiredEndpoints.push({ uid, docId: subDoc.id });
          }
        }
      }));
    }));

    // 4. Ruim verlopen subscriptions op
    await Promise.all(
      expiredEndpoints.map(({ uid, docId }) =>
        db.doc(`users/${uid}/pushSubscriptions/${docId}`).delete()
      )
    );

    return res.status(200).json({ sent });
  } catch (e) {
    console.error('[notify-join-request]', e);
    return res.status(500).json({ error: 'Push failed' });
  }
}
