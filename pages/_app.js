import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  UserFactory, AuthFactory, UserMemberLinkFactory,
  GroupFactory, AnnouncementFactory,
} from '../constants/dbSchema';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import AppLayout from '../components/AppLayout';

const COOKIE_KEY      = 'msc_uid';
const VIEW_MODE_KEY   = 'msc_viewmode';
const LAST_SEEN_KEY   = 'msc_ann_last_seen';

const PUBLIC_PATHS        = ['/login', '/register'];
const EMAIL_VERIFY_EXEMPT = ['/verify-email', '/login', '/register'];
const NO_CLUB_EXEMPT      = ['/no-club', '/verify-email', '/login', '/register'];
const ADMIN_ROLES         = ['superadmin', 'clubadmin'];

function AppShell({ Component, pageProps }) {
  const router           = useRouter();
  const { uid, loading } = useAuth();
  const isPublicPath     = PUBLIC_PATHS.includes(router.pathname);

  const [userRole,          setUserRole]          = useState('user');
  const [coachView,         setCoachView]         = useState(false);
  const [hasMembership,     setHasMembership]     = useState(null);
  const [announcementCount, setAnnouncementCount] = useState(0);

  // Legacy cookie sync
  useEffect(() => {
    if (uid) {
      const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toUTCString();
      document.cookie = `${COOKIE_KEY}=${uid}; expires=${expires}; path=/; SameSite=Lax`;
    } else {
      document.cookie = `${COOKIE_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    }
  }, [uid]);

  // Auth guard
  useEffect(() => {
    if (loading) return;
    if (!uid && !isPublicPath) {
      router.replace(`/login?next=${encodeURIComponent(router.asPath)}`);
      return;
    }
    if (uid && !AuthFactory.isEmailVerified() && !EMAIL_VERIFY_EXEMPT.includes(router.pathname)) {
      router.replace('/verify-email');
      return;
    }
    if (uid && (router.pathname === '/login' || router.pathname === '/register')) {
      router.replace(router.query.next || '/');
    }
  }, [uid, loading, isPublicPath, router.pathname]);

  // Role
  useEffect(() => {
    if (!uid) { setUserRole('user'); return; }
    UserFactory.get(uid)
      .then(snap => { if (snap.exists()) setUserRole(snap.data().role || 'user'); })
      .catch(() => {});
  }, [uid]);

  // Membership check
  useEffect(() => {
    if (!uid || !AuthFactory.isEmailVerified()) return;
    if (ADMIN_ROLES.includes(userRole)) { setHasMembership(true); return; }
    const unsub = UserMemberLinkFactory.getForUser(uid, (links) => {
      setHasMembership(links.length > 0);
    });
    return () => unsub();
  }, [uid, userRole]);

  // Membership guard
  useEffect(() => {
    if (!uid || !AuthFactory.isEmailVerified()) return;
    if (ADMIN_ROLES.includes(userRole)) return;
    if (hasMembership === null) return;
    if (!hasMembership && !NO_CLUB_EXEMPT.includes(router.pathname)) {
      router.replace('/no-club');
    }
  }, [uid, hasMembership, userRole, router.pathname]);

  // coachView
useEffect(() => {
  const stored = sessionStorage.getItem(VIEW_MODE_KEY);
  if (stored) setCoachView(stored === 'coach');
  const handler = (e) => { if (e.key === VIEW_MODE_KEY) setCoachView(e.newValue === 'coach'); };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}, []);

// Auto-detect coach status — set coachView true if user is a coach in any group.
// This ensures the badge-beheer and other coach nav items appear without
// requiring the user to manually toggle the coach/skipper switch.
useEffect(() => {
  if (!uid || !hasMembership) return;
  let cancelled = false;

  const check = async () => {
    try {
      const links = await new Promise(resolve => {
        const unsub = UserMemberLinkFactory.getForUser(uid, (profiles) => {
          unsub();
          resolve(profiles);
        });
      });

      const clubIds = [...new Set(links.map(p => p.member.clubId))];

      for (const clubId of clubIds) {
        const groups = await GroupFactory.getGroupsByClubOnce(clubId);
        for (const group of groups) {
          const members = await GroupFactory.getMembersByGroupOnce(clubId, group.id);
          const me = members.find(m => (m.memberId || m.id) === links.find(l => l.member.clubId === clubId)?.member.id);
          if (me?.isCoach) {
            if (!cancelled) {
              setCoachView(true);
              // Only set sessionStorage if the user hasn't explicitly chosen 'skipper'
              if (!sessionStorage.getItem(VIEW_MODE_KEY)) {
                sessionStorage.setItem(VIEW_MODE_KEY, 'coach');
              }
            }
            return;
          }
        }
      }
    } catch (e) {
      console.error('Coach auto-detect error:', e);
    }
  };

  check();
  return () => { cancelled = true; };
}, [uid, hasMembership]);
  // Announcement unread count — only factories, no direct Firestore imports
  useEffect(() => {
    if (!uid || !AuthFactory.isEmailVerified()) return;

    // Clear badge when on announcements page
    if (router.pathname === '/announcements') {
      localStorage.setItem(LAST_SEEN_KEY, Date.now().toString());
      setAnnouncementCount(0);
      return;
    }

    let cancelled = false;
    let unsubAnn   = () => {};
    let unsubLinks = () => {};

    const setup = async () => {
      try {
        const lastSeen = parseInt(localStorage.getItem(LAST_SEEN_KEY) || '0', 10);

        // 1. Resolve member context
        unsubLinks = UserMemberLinkFactory.getForUser(uid, async (profiles) => {
          const self = profiles.find(p => p.link.relationship === 'self');
          if (!self || cancelled) return;
          const clubId   = self.member.clubId;
          const memberId = self.member.id;

          // 2. Resolve group IDs via GroupFactory
          const gids = await new Promise((resolve) => {
            const found = [];
            const u = GroupFactory.getGroupsByClub(clubId, async (groups) => {
              u();
              await Promise.all(groups.map(group =>
                new Promise(res => {
                  const u2 = GroupFactory.getMembersByGroup(clubId, group.id, (members) => {
                    u2();
                    if (members.some(m => (m.memberId || m.id) === memberId)) found.push(group.id);
                    res();
                  });
                })
              ));
              resolve(found);
            });
          });

          if (gids.length === 0 || cancelled) return;

          // 3. Subscribe via AnnouncementFactory — no direct Firestore
          unsubAnn();
          unsubAnn = AnnouncementFactory.subscribeForUser(gids, (items) => {
            if (!cancelled) {
              const unread = items.filter(a => {
                const ts = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0;
                return ts > lastSeen;
              }).length;
              setAnnouncementCount(unread);
            }
          });
        });
      } catch (err) {
        console.error('_app announcement count error:', err);
      }
    };

    setup();
    return () => { cancelled = true; unsubAnn(); unsubLinks(); };
  }, [uid, router.pathname]);

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
      <div style={{ width: '36px', height: '36px', border: '3px solid #1e293b', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  if (isPublicPath) return (<><PageHead /><Component {...pageProps} /></>);
  if (!uid) return null;

  const needsMembershipCheck = uid
    && AuthFactory.isEmailVerified()
    && !ADMIN_ROLES.includes(userRole)
    && !NO_CLUB_EXEMPT.includes(router.pathname);

  if (needsMembershipCheck && hasMembership === null) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
      <div style={{ width: '36px', height: '36px', border: '3px solid #1e293b', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <>
      <PageHead />
      <AppLayout userRole={userRole} coachView={coachView} announcementCount={announcementCount}>
        <Component {...pageProps} />
      </AppLayout>
    </>
  );
}

function PageHead() {
  return (
    <Head>
      <link rel="manifest" href="/manifest.json" />
      <meta name="theme-color" content="#0f172a" />
      <meta name="mobile-web-app-capable" content="yes" />
      <link rel="icon" href="/icons/icon-192.png" />
      <style>{`*, *::before, *::after { box-sizing: border-box; } html, body { margin: 0; padding: 0; background-color: #0f172a; }`}</style>
    </Head>
  );
}

export default function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <AppShell Component={Component} pageProps={pageProps} />
    </AuthProvider>
  );
}
