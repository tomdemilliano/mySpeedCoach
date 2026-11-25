// pages/api/delete-user.js
//
// DELETE { uid }
//
// Deletes a Firebase Auth account server-side using the Admin SDK.
// Called by UserFactory.delete() after it has cleaned up Firestore.
//
// Access: superadmin only (verified via Firebase ID token).

const { getAdminAuth } = require('../../lib/firebaseAdmin');
const { requireUser }  = require('../../lib/apiAuth');

module.exports = async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const caller = await requireUser(req, res, { roles: ['superadmin'] });
  if (!caller) return;

  const { uid } = req.body || {};
  if (!uid || typeof uid !== 'string') {
    return res.status(400).json({ error: 'Missing uid' });
  }
  if (uid === caller.uid) {
    return res.status(400).json({ error: 'Je kan je eigen account niet verwijderen.' });
  }

  try {
    await getAdminAuth().deleteUser(uid);
    return res.status(200).json({ success: true });
  } catch (err) {
    // auth/user-not-found is fine — the account may have already been removed
    // (e.g. superadmin-created docs with a Date.now() id have no Auth account)
    if (err.code === 'auth/user-not-found') {
      return res.status(200).json({ success: true, note: 'user not found in Auth' });
    }
    console.error('Admin SDK deleteUser error:', err);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
};
