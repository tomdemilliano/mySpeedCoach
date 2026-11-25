// pages/api/push/subscribe.js
//
// POST { subscription }
//
// Saves a Web Push PushSubscription object for the CALLER to:
//   Firestore: users/{uid}/pushSubscriptions/{endpoint-hash}
//
// The uid is taken from the verified ID token — never from the request body.
// The endpoint URL hash is used as the document ID so that re-subscribing the
// same device upserts rather than duplicates.

const crypto          = require('crypto');
const { getAdminDb }  = require('../../../lib/firebaseAdmin');
const { requireUser } = require('../../../lib/apiAuth');

// Stable document ID derived from the subscription endpoint
function endpointHash(endpoint) {
  return crypto.createHash('sha256').update(endpoint).digest('base64url').slice(0, 40);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await requireUser(req, res);
  if (!caller) return;

  const { subscription } = req.body || {};
  if (
    !subscription?.endpoint || typeof subscription.endpoint !== 'string' ||
    !subscription.endpoint.startsWith('https://') ||
    !subscription?.keys?.p256dh || !subscription?.keys?.auth
  ) {
    return res.status(400).json({ error: 'Invalid subscription object' });
  }

  try {
    const db    = getAdminDb();
    const docId = endpointHash(subscription.endpoint);

    await db
      .collection('users')
      .doc(caller.uid)
      .collection('pushSubscriptions')
      .doc(docId)
      .set({
        // Store only the fields web-push needs
        subscription: {
          endpoint:       subscription.endpoint,
          expirationTime: subscription.expirationTime ?? null,
          keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
        },
        createdAt: new Date(),
        userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
      }, { merge: true });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[push/subscribe]', err);
    return res.status(500).json({ error: 'Failed to save subscription' });
  }
};
