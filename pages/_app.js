import AppLayout from '../components/AppLayout';
import Head from 'next/head';
import { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';

const COOKIE_KEY = 'msc_uid';
const VIEW_MODE_KEY = 'msc_viewmode';

const getCookie = () => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`));
  return match ? match[1] : null;
};

export default function MyApp({ Component, pageProps }) {
  const [userRole, setUserRole] = useState('user');
  const [coachView, setCoachView] = useState(false);

  useEffect(() => {
    const uid = getCookie();
    if (!uid) return;
    getDoc(doc(db, 'users', uid)).then(snap => {
      if (snap.exists()) {
        setUserRole(snap.data().role || 'user');
      }
    }).catch(() => {});

    // Sync viewMode from sessionStorage so bottom nav matches the toggle on index
    const stored = sessionStorage.getItem(VIEW_MODE_KEY);
    if (stored) setCoachView(stored === 'coach');

    // Listen for viewMode changes broadcast from the index page
    const handler = (e) => {
      if (e.key === VIEW_MODE_KEY) setCoachView(e.newValue === 'coach');
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  return (
    <>
      <Head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0f172a" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="icon" href="/icons/icon-192.png" />
        <style>{`
          *, *::before, *::after { box-sizing: border-box; }
          html, body {
            margin: 0;
            padding: 0;
            background-color: #0f172a;
          }
        `}</style>
      </Head>
      <AppLayout userRole={userRole} coachView={coachView}>
        <Component {...pageProps} />
      </AppLayout>
    </>
  );
}
