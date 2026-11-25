// lib/apiAuth.js
//
// SERVER-ONLY. Authentication / authorisation helpers for pages/api/* routes.
//
// Usage in a route:
//   const caller = await requireUser(req, res, { roles: ['superadmin'] });
//   if (!caller) return;          // response (401/403) already sent
//   caller.uid, caller.role, caller.user
//
// The client must send its Firebase ID token as:
//   Authorization: Bearer <idToken>
// (use `authFetch` from constants/dbSchema.js, which does this automatically).

const { getAdminAuth, getAdminDb } = require('./firebaseAdmin');

/**
 * Verifies the caller's Firebase ID token and loads users/{uid}.
 * Requires: valid token, verified email, existing users doc.
 * Optional: `roles` — array of allowed `users/{uid}.role` values.
 *
 * Returns { uid, role, user } on success, or null after sending an error response.
 */
async function requireUser(req, res, { roles = null } = {}) {
  const header = req.headers.authorization || '';
  const match  = header.match(/^Bearer (.+)$/);
  if (!match) {
    res.status(401).json({ error: 'Niet ingelogd.' });
    return null;
  }

  let decoded;
  try {
    // checkRevoked = true → disabled/deleted accounts are rejected immediately
    decoded = await getAdminAuth().verifyIdToken(match[1], true);
  } catch {
    res.status(401).json({ error: 'Ongeldige of verlopen sessie.' });
    return null;
  }

  if (decoded.email_verified !== true) {
    res.status(403).json({ error: 'E-mailadres niet geverifieerd.' });
    return null;
  }

  const snap = await getAdminDb().collection('users').doc(decoded.uid).get();
  if (!snap.exists) {
    res.status(403).json({ error: 'Geen gebruikersprofiel gevonden.' });
    return null;
  }

  const user = snap.data();
  const role = user.role || 'user';

  if (roles && !roles.includes(role)) {
    res.status(403).json({ error: 'Geen toegang.' });
    return null;
  }

  return { uid: decoded.uid, role, user };
}

/** Club IDs the uid is linked to via userMemberLinks. */
async function getLinkedClubIds(db, uid) {
  const snap = await db.collection('userMemberLinks').where('uid', '==', uid).get();
  return new Set(snap.docs.map(d => d.data().clubId).filter(Boolean));
}

/** memberIds (ClubMember doc IDs) the uid is linked to within one club. */
async function getLinkedMemberIds(db, uid, clubId) {
  const snap = await db.collection('userMemberLinks')
    .where('uid', '==', uid)
    .where('clubId', '==', clubId)
    .get();
  return snap.docs.map(d => d.data().memberId).filter(Boolean);
}

/**
 * True if one of the given memberIds has isCoach === true in the group.
 * Group membership docs may be keyed by memberId or carry a `memberId` field.
 */
async function isCoachOfGroup(db, clubId, groupId, memberIds) {
  const membersRef = db.collection(`clubs/${clubId}/groups/${groupId}/members`);
  for (const memberId of memberIds) {
    const byId = await membersRef.doc(memberId).get();
    if (byId.exists && byId.data().isCoach === true) return true;

    const byField = await membersRef.where('memberId', '==', memberId).limit(1).get();
    if (!byField.empty && byField.docs[0].data().isCoach === true) return true;
  }
  return false;
}

module.exports = { requireUser, getLinkedClubIds, getLinkedMemberIds, isCoachOfGroup };
