import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: "AIzaSyBh7YT9hGp4S2GTEzsfsCBkuEUMdK6OdaA",
  authDomain: "myspeedcoach-416ac.firebaseapp.com",
  databaseURL: "https://myspeedcoach-416ac-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "myspeedcoach-416ac",
  storageBucket: "myspeedcoach-416ac.firebasestorage.app",
  messagingSenderId: "637458200530",
  appId: "1:637458200530:web:77c17fa5cb39f0b3333a0b",
  measurementId: "G-3XZDT4QFX4"
};

const app = initializeApp(firebaseConfig);

// App Check: proves requests come from this web app (blocks scripts that only
// have the public apiKey). Browser-only, and only active when the reCAPTCHA
// Enterprise site key is configured (Vercel env: NEXT_PUBLIC_RECAPTCHA_SITE_KEY).
// Must run before the other Firebase services are used.
if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) {
  if (process.env.NODE_ENV !== "production") {
    // Local dev: prints a debug token in the browser console — register it in
    // Firebase Console → App Check → Apps → ⋮ → Manage debug tokens.
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}

// De Realtime Database voor live-data
export const rtdb = getDatabase(app);

// FirestoreDB voor vaste gegevens
export const db = getFirestore(app);

// logins & user IDs
export const auth = getAuth(app);
