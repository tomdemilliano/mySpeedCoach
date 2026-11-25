// lib/firebaseAdmin.js
//
// SERVER-ONLY. Shared firebase-admin initialisation for pages/api/* routes.
// Never import this file from a page, component, hook or context.
//
// Required env vars (Vercel dashboard / .env.local):
//   FIREBASE_CLIENT_EMAIL
//   FIREBASE_PRIVATE_KEY

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth }                       = require('firebase-admin/auth');
const { getFirestore }                  = require('firebase-admin/firestore');

// Safe to hardcode — already public in firebaseConfig.js
const PROJECT_ID = 'myspeedcoach-416ac';

function ensureApp() {
  // Guard against re-initialisation (Next.js hot reload / multiple routes)
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId:   PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Vercel stores the key with literal \n — convert back to real newlines.
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
}

function getAdminAuth() { ensureApp(); return getAuth(); }
function getAdminDb()   { ensureApp(); return getFirestore(); }

module.exports = { getAdminAuth, getAdminDb };
