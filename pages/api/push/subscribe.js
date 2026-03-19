// pages/api/push/subscribe.js
//
// POST { uid, subscription }
//
// Saves a Web Push PushSubscription object to:
//   Firestore: users/{uid}/pushSubscriptions/{endpoint-hash}
//
// The endpoint URL itself is used as the document ID (URL-safe base64 hash)
// so that re-subscribing the same device upserts rather than duplicates.

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore }                  = require('firebase-admin/firestore');
const crypto                            = require('crypto');

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

// Stable document ID derived from the subscription endpoint
function endpointHash(endpoint) {
  return crypto.createHash('sha256').update(endpoint).digest('base64url').slice(0, 40);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { uid, subscription } = req.body || {};

  if (!uid || typeof uid !== 'string') {
    return res.status(400).json({ error: 'Missing uid' });
  }
  if (!subscription?.endpoint || !subscription?.keys) {
    return res.status(400).json({ error: 'Invalid subscription object' });
  }

  try {
    const db  = getAdminDb();
    const docId = endpointHash(subscription.endpoint);

    await db
      .collection('users')
      .doc(uid)
      .collection('pushSubscriptions')
      .doc(docId)
      .set({
        subscription,           // full PushSubscription JSON
        createdAt: new Date(),
        userAgent: req.headers['user-agent'] || '',
      }, { merge: true });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[push/subscribe]', err);
    return res.status(500).json({ error: 'Failed to save subscription' });
  }
};
