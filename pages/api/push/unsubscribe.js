// pages/api/push/unsubscribe.js
//
// POST { uid, endpoint }
//
// Removes the push subscription matching the given endpoint from Firestore.
// Called when the user opts out or when web-push returns a 410 Gone (expired subscription).

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

function endpointHash(endpoint) {
  return crypto.createHash('sha256').update(endpoint).digest('base64url').slice(0, 40);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { uid, endpoint } = req.body || {};

  if (!uid || !endpoint) return res.status(400).json({ error: 'Missing uid or endpoint' });

  try {
    const db    = getAdminDb();
    const docId = endpointHash(endpoint);

    await db
      .collection('users')
      .doc(uid)
      .collection('pushSubscriptions')
      .doc(docId)
      .delete();

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[push/unsubscribe]', err);
    return res.status(500).json({ error: 'Failed to remove subscription' });
  }
};
