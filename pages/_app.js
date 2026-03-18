import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { UserFactory, AuthFactory, UserMemberLinkFactory } from '../constants/dbSchema';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import AppLayout from '../components/AppLayout';

const COOKIE_KEY    = 'msc_uid';
const VIEW_MODE_KEY = 'msc_viewmode';

// Pages accessible without being logged in
const PUBLIC_PATHS = ['/login', '/register'];

// Pages a logged-in but unverified user CAN access
const EMAIL_VERIFY_EXEMPT = ['/verify-email', '/login', '/register'];

// Pages a verified but club-less user CAN access
const NO_CLUB_EXEMPT = ['/no-club', '/verify-email', '/login', '/register'];

// Roles that bypass the membership check (admins manage clubs, they don't need to be in one)
const ADMIN_ROLES = ['superadmin', 'clubadmin'];

// ─── Inner shell — runs inside AuthProvider so useAuth works ─────────────────
function AppShell({ Component, pageProps }) {
  const router           = useRouter();
  const { uid, loading } = useAuth();
  const isPublicPath     = PUBLIC_PATHS.includes(router.pathname);

  const [userRole,    setUserRole]    = useState('user');
  const [coachView,   setCoachView]   = useState(false);
  const [hasMembership, setHasMembership] = useState(null); // null = unknown, true/false = resolved

  // ── Keep the legacy cookie in sync ──────────────────────────────────────────
  // Many pages still call getCookie() directly. We write the uid into the
  // cookie whenever auth state changes so those reads keep working.
  // This bridge will be removed in Feature 9.6 once all cookie reads are replaced.
  useEffect(() => {
    if (uid) {
      const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toUTCString();
      document.cookie = `${COOKIE_KEY}=${uid}; expires=${expires}; path=/; SameSite=Lax`;
    } else {
      document.cookie = `${COOKIE_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    }
  }, [uid]);

  // ── Auth guard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading) return;

    // Not logged in — send to login
    if (!uid && !isPublicPath) {
      router.replace(`/login?next=${encodeURIComponent(router.asPath)}`);
      return;
    }

    // Logged in but email not verified — hard block to /verify-email
    if (uid && !AuthFactory.isEmailVerified() && !EMAIL_VERIFY_EXEMPT.includes(router.pathname)) {
      router.replace('/verify-email');
      return;
    }

    // Already logged in and on /login or /register — redirect home
    if (uid && (router.pathname === '/login' || router.pathname === '/register')) {
      const next = router.query.next || '/';
      router.replace(next);
    }
  }, [uid, loading, isPublicPath, router.pathname]);

  // ── Resolve userRole from Firestore via UserFactory ───────────────────────
  useEffect(() => {
    if (!uid) { setUserRole('user'); return; }
    UserFactory.get(uid)
      .then(snap => { if (snap.exists()) setUserRole(snap.data().role || 'user'); })
      .catch(() => {});
  }, [uid]);

  // ── Membership check — runs after email is verified ───────────────────────
  // A user "has membership" only if they have at least one approved UserMemberLink
  // (i.e. a coach has added them to a group). A pending ClubJoinRequest does NOT
  // count — those users stay on /no-club where they can see their request status.
  // Admins bypass this check entirely.
  useEffect(() => {
    if (!uid || !AuthFactory.isEmailVerified()) return;

    // Admins always have access
    if (ADMIN_ROLES.includes(userRole)) { setHasMembership(true); return; }

    const unsub = UserMemberLinkFactory.getForUser(uid, (links) => {
      setHasMembership(links.length > 0);
    });
    return () => unsub();
  }, [uid, userRole]);

  // ── Membership guard — redirect to /no-club if no membership ─────────────
  useEffect(() => {
    if (!uid || !AuthFactory.isEmailVerified()) return;
    if (ADMIN_ROLES.includes(userRole)) return;
    if (hasMembership === null) return; // still loading
    if (!hasMembership && !NO_CLUB_EXEMPT.includes(router.pathname)) {
      router.replace('/no-club');
    }
  }, [uid, hasMembership, userRole, router.pathname]);

  // ── coachView toggle — persisted in sessionStorage ───────────────────────────
  useEffect(() => {
    const stored = sessionStorage.getItem(VIEW_MODE_KEY);
    if (stored) setCoachView(stored === 'coach');
    const handler = (e) => {
      if (e.key === VIEW_MODE_KEY) setCoachView(e.newValue === 'coach');
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  // ── Spinner while Firebase resolves auth state ───────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div style={{ width: '36px', height: '36px', border: '3px solid #1e293b', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  // ── Public pages (e.g. /login) — rendered without AppLayout ─────────────────
  if (isPublicPath) return (
    <>
      <PageHead />
      <Component {...pageProps} />
    </>
  );

  // ── Redirect in flight — render nothing to avoid flash ──────────────────────
  if (!uid) return null;

  // ── Authenticated app ────────────────────────────────────────────────────────
  return (
    <>
      <PageHead />
      <AppLayout userRole={userRole} coachView={coachView}>
        <Component {...pageProps} />
      </AppLayout>
    </>
  );
}

// ─── Shared <head> tags ───────────────────────────────────────────────────────
function PageHead() {
  return (
    <Head>
      <link rel="manifest" href="/manifest.json" />
      <meta name="theme-color" content="#0f172a" />
      <meta name="mobile-web-app-capable" content="yes" />
      <link rel="icon" href="/icons/icon-192.png" />
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background-color: #0f172a; }
      `}</style>
    </Head>
  );
}

// ─── Root — provides AuthContext to the entire app ───────────────────────────
export default function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <AppShell Component={Component} pageProps={pageProps} />
    </AuthProvider>
  );
}
