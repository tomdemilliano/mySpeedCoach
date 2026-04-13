// pages/api/push/notify-join-request.js
//
// POST { clubId, firstName, lastName }
//
// Stuurt een push-notificatie naar alle clubadmins van de opgegeven club
// die push-notificaties hebben ingeschakeld EN de instelling
// `notifyJoinRequests` niet hebben uitgeschakeld.
//
// Aangeroepen vanuit ClubJoinRequestFactory.create() via een fire-and-forget
// fetch() in de settings.js / register flow.

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore }                  = require('firebase-admin/firestore');
const { sendPushNotification }          = require('../../../lib/webpush');

function getAdminDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId:   'myspeedcoach-416ac',
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  return getFirestore();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { clubId, firstName, lastName } = req.body;
  if (!clubId) return res.status(400).json({ error: 'clubId required' });

  const db = getAdminDb();

  try {
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
        const subscription = subDoc.data();
        try {
          await sendPushNotification(subscription, {
            title: 'Nieuwe lidmaatschapsaanvraag',
            body:  `${firstName} ${lastName} vraagt toegang tot je club.`,
            url:   '/clubadmin?tab=leden#aanvragen',
            tag:   `join-request-${clubId}`,
          });
          sent++;
        } catch (err) {
          if (err.statusCode === 410) {
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
    return res.status(500).json({ error: e.message });
  }
}
