// pages/api/push/unsubscribe.js
//
// POST { endpoint }
//
// Removes the CALLER's push subscription matching the given endpoint.
// The uid is taken from the verified ID token — never from the request body.

const crypto          = require('crypto');
const { getAdminDb }  = require('../../../lib/firebaseAdmin');
const { requireUser } = require('../../../lib/apiAuth');

function endpointHash(endpoint) {
  return crypto.createHash('sha256').update(endpoint).digest('base64url').slice(0, 40);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await requireUser(req, res);
  if (!caller) return;

  const { endpoint } = req.body || {};
  if (!endpoint || typeof endpoint !== 'string') {
    return res.status(400).json({ error: 'Missing endpoint' });
  }

  try {
    const db    = getAdminDb();
    const docId = endpointHash(endpoint);

    await db
      .collection('users')
      .doc(caller.uid)
      .collection('pushSubscriptions')
      .doc(docId)
      .delete();

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[push/unsubscribe]', err);
    return res.status(500).json({ error: 'Failed to remove subscription' });
  }
};
