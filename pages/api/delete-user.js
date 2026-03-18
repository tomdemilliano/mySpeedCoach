// pages/api/delete-user.js
//
// Deletes a Firebase Auth account server-side using the Admin SDK.
// Called by UserFactory.delete() after it has cleaned up Firestore.
//
// Required environment variables (set in .env.local or your hosting provider):
//   FIREBASE_PROJECT_ID
//   FIREBASE_CLIENT_EMAIL
//   FIREBASE_PRIVATE_KEY   (the full PEM string, including \n newlines)
//
// You can find these values in the Firebase console:
//   Project Settings → Service Accounts → Generate new private key

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

// Initialise the Admin SDK once (Next.js hot-reloads can call this file
// multiple times, so we guard against re-initialisation).
function getAdminAuth() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // The private key comes in as a JSON string with literal \n — convert
        // them back to real newlines so the PEM is valid.
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  return getAuth();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Simple protection: only allow calls from the same origin.
  // In a production app you would verify a session cookie or signed token here.
  const origin = req.headers.origin || req.headers.referer || '';
  const host   = req.headers.host || '';
  if (origin && !origin.includes(host)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { uid } = req.body;
  if (!uid || typeof uid !== 'string') {
    return res.status(400).json({ error: 'Missing uid' });
  }

  try {
    await getAdminAuth().deleteUser(uid);
    return res.status(200).json({ success: true });
  } catch (err) {
    // auth/user-not-found is fine — the account may have already been removed
    if (err.code === 'auth/user-not-found') {
      return res.status(200).json({ success: true, note: 'user not found in Auth' });
    }
    console.error('Admin SDK deleteUser error:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete user' });
  }
}
