import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import {
  Zap, Hash, LayoutDashboard, ShieldAlert,
  X, ChevronRight, Medal, Home,
  MoreHorizontal, Trophy, History,
  Building2, Award, Megaphone, Calendar
} from 'lucide-react';

// ─── Role helpers ─────────────────────────────────────────────────────────────
const isSuperAdmin = (role) => role === 'superadmin';
const isAdminRole  = (role) => role === 'clubadmin' || role === 'superadmin';

// ─── Bottom nav ───────────────────────────────────────────────────────────────
// 5 slots: Home · Berichten · LIVE (big primary) · Meer · (role slot)
// Live is the primary action for everyone.
const getBottomNav = (role, isCoach) => {
  return [
    {
      href:  '/',
      label: 'Home',
      icon:  Home,
      color: '#3b82f6',
    },
    {
      href:  '/announcements',
      label: 'Berichten',
      icon:  Megaphone,
      color: '#a78bfa',
    },
    // Slot 3: PRIMARY (large rounded button) — Live for everyone
    {
      href:      '/live',
      label:     'Live',
      icon:      Zap,
      color:     '#22c55e',
      isPrimary: true,
    },
    {
      href:  '/agenda',
      label: 'Agenda',
      icon:  Calendar,
      color: '#22c55e',
    },
    // Slot 5: Meer drawer trigger
    {
      key:   'more',
      label: 'Meer',
      icon:  MoreHorizontal,
      color: '#64748b',
    },
  ];
};

// ─── Sidebar / Meer drawer items ──────────────────────────────────────────────
const getSidebarItems = (role, isCoach) => {
  const hasAdminAccess = isAdminRole(role) || isCoach;
  const items = [];

  // Everyone
  items.push({ href: '/achievements', label: 'Prestaties',    icon: Trophy,        description: 'PR\'s & doelen',       color: '#f59e0b' });
  items.push({ href: '/badges',   label: 'Badge leaderboard', icon: Medal,         description: 'Club klassement',      color: '#f59e0b' });
  items.push({ href: '/history',  label: 'Geschiedenis',      icon: History,       description: 'Sessies & AI analyse', color: '#60a5fa' });
  

  // Coaches + admins
  if (hasAdminAccess) {
    items.push({ href: '/badge-beheer', label: 'Badge beheer', icon: Award,         description: 'Aanmaken & uitreiken', color: '#a78bfa' });
    items.push({ href: '/dashboard',    label: 'Dashboard',    icon: LayoutDashboard, description: 'Live monitoring',    color: '#22c55e' });
    items.push({ href: '/calendar-admin',  label: 'Kalenderbeheer',  icon: Calendar,        description: 'Trainingen & schema\'s', color: '#22c55e' });
  }

  // Admins only
  if (isAdminRole(role)) {
    items.push({ href: '/clubadmin', label: 'Clubbeheer', icon: Building2, description: 'Groepen & leden', color: '#3b82f6' });
  }

  // SuperAdmin only
  if (isSuperAdmin(role)) {
    items.push({ href: '/superadmin', label: 'SuperAdmin', icon: ShieldAlert, description: 'Clubs & gebruikers', color: '#ef4444' });
  }

  return items;
};

// ─── Sidebar Drawer ───────────────────────────────────────────────────────────
function SidebarDrawer({ currentPath, open, onClose, userRole, isCoach }) {
  const items = getSidebarItems(userRole || 'user', isCoach);

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 200 }}
        />
      )}

      <aside style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, width: '260px',
        backgroundColor: '#0d1526', borderRight: '1px solid #1e293b',
        display: 'flex', flexDirection: 'column', zIndex: 300,
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        {/* Logo row */}
        <div style={{
          padding: '20px 20px 16px', borderBottom: '1px solid #1e293b',
          display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '34px', height: '34px', borderRadius: '9px',
              backgroundColor: '#1e293b', border: '1px solid #334155',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Zap size={18} color="#3b82f6" />
            </div>
            <div>
              <div style={{ fontWeight: '800', fontSize: '14px', color: '#f1f5f9', letterSpacing: '-0.2px' }}>
                MySpeedCoach
              </div>
              <div style={{ fontSize: '10px', color: '#475569', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                v1.0
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '16px 20px 8px', fontSize: '10px', color: '#475569', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
          Meer opties
        </div>

        <nav style={{ flex: 1, padding: '4px 10px', overflowY: 'auto' }}>
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = currentPath === item.href;
            return (
              <a key={item.href} href={item.href} onClick={onClose} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '10px 12px', borderRadius: '10px', marginBottom: '4px',
                textDecoration: 'none',
                backgroundColor: isActive ? `${item.color}18` : 'transparent',
                border: `1px solid ${isActive ? `${item.color}33` : 'transparent'}`,
                transition: 'all 0.15s', position: 'relative', overflow: 'hidden',
              }}>
                {isActive && (
                  <div style={{
                    position: 'absolute', left: 0, top: '20%', bottom: '20%',
                    width: '3px', borderRadius: '0 3px 3px 0', backgroundColor: item.color,
                  }} />
                )}
                <div style={{
                  width: '34px', height: '34px', borderRadius: '8px',
                  backgroundColor: isActive ? `${item.color}22` : '#1e293b',
                  border: `1px solid ${isActive ? `${item.color}44` : '#334155'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon size={16} color={isActive ? item.color : '#64748b'} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: isActive ? '700' : '500', color: isActive ? '#f1f5f9' : '#94a3b8', marginBottom: '1px' }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: '10px', color: isActive ? `${item.color}bb` : '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.description}
                  </div>
                </div>
                {isActive && <ChevronRight size={14} color={`${item.color}88`} style={{ flexShrink: 0 }} />}
              </a>
            );
          })}
        </nav>

        <div style={{ padding: '14px 16px', borderTop: '1px solid #1e293b', fontSize: '10px', color: '#334155', textAlign: 'center', letterSpacing: '0.5px' }}>
          MYSPEEDCOACH © 2025
        </div>
      </aside>
    </>
  );
}

// ─── Bottom Navigation Bar ────────────────────────────────────────────────────
function BottomNav({ currentPath, userRole, isCoach, onMoreClick, announcementCount }) {
  const items = getBottomNav(userRole || 'user', isCoach);

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      backgroundColor: '#0d1526', borderTop: '1px solid #1e293b',
      display: 'flex', zIndex: 150,
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {items.map((item, idx) => {
        const Icon = item.icon;
        const isMore = item.key === 'more';
        const isActive = !isMore && currentPath === item.href;
        const isPrimary = item.isPrimary;
        const isBerichten = item.href === '/announcements';

        if (isPrimary) {
          return (
            <a key={item.href} href={item.href} style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: '6px 4px 8px', textDecoration: 'none', position: 'relative',
            }}>
              <div style={{
                width: '52px', height: '52px', borderRadius: '16px',
                backgroundColor: isActive ? item.color : `${item.color}22`,
                border: `1.5px solid ${isActive ? item.color : `${item.color}55`}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: '3px', transition: 'all 0.2s',
                boxShadow: isActive ? `0 0 20px ${item.color}44` : 'none',
              }}>
                <Icon size={22} color={isActive ? 'white' : item.color} />
              </div>
              <span style={{ fontSize: '10px', fontWeight: '700', color: isActive ? item.color : `${item.color}99` }}>
                {item.label}
              </span>
            </a>
          );
        }

        if (isMore) {
          return (
            <button key="more" onClick={onMoreClick} style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: '8px 4px', background: 'none', border: 'none', cursor: 'pointer',
            }}>
              <Icon size={22} color="#475569" />
              <span style={{ fontSize: '10px', fontWeight: '400', color: '#475569', marginTop: '3px' }}>
                {item.label}
              </span>
            </button>
          );
        }

        return (
          <a key={item.href || idx} href={item.href} style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '8px 4px', textDecoration: 'none', position: 'relative',
          }}>
            <div style={{ position: 'relative' }}>
              <Icon size={22} color={isActive ? item.color : '#475569'} />
              {isBerichten && announcementCount > 0 && !isActive && (
                <span style={{
                  position: 'absolute', top: '-4px', right: '-6px',
                  backgroundColor: '#ef4444', color: 'white',
                  fontSize: '9px', fontWeight: '800',
                  width: '15px', height: '15px', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1.5px solid #0d1526',
                }}>
                  {announcementCount > 9 ? '9+' : announcementCount}
                </span>
              )}
            </div>
            <span style={{ fontSize: '10px', fontWeight: isActive ? '700' : '400', color: isActive ? item.color : '#475569', marginTop: '3px' }}>
              {item.label}
            </span>
            {isActive && (
              <div style={{
                position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
                width: '20px', height: '2px', backgroundColor: item.color, borderRadius: '2px 2px 0 0',
              }} />
            )}
          </a>
        );
      })}
    </nav>
  );
}

// ─── Desktop Sidebar ──────────────────────────────────────────────────────────
function DesktopSidebar({ currentPath, userRole, isCoach, announcementCount }) {
  const bottomItems = getBottomNav(userRole || 'user', isCoach).filter(i => !i.key);
  const sidebarItems = getSidebarItems(userRole || 'user', isCoach);

  const NavLink = ({ item }) => {
    const Icon = item.icon;
    const isActive = currentPath === item.href;
    const isBerichten = item.href === '/announcements';
    return (
      <a href={item.href} style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '10px 12px', borderRadius: '10px', marginBottom: '4px',
        textDecoration: 'none',
        backgroundColor: isActive ? `${item.color}18` : 'transparent',
        border: `1px solid ${isActive ? `${item.color}33` : 'transparent'}`,
        transition: 'all 0.15s', position: 'relative', overflow: 'hidden',
      }}>
        {isActive && (
          <div style={{
            position: 'absolute', left: 0, top: '20%', bottom: '20%',
            width: '3px', borderRadius: '0 3px 3px 0', backgroundColor: item.color,
          }} />
        )}
        <div style={{
          width: '34px', height: '34px', borderRadius: '8px',
          backgroundColor: isActive ? `${item.color}22` : '#1e293b',
          border: `1px solid ${isActive ? `${item.color}44` : '#334155'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          position: 'relative',
        }}>
          <Icon size={16} color={isActive ? item.color : '#64748b'} />
          {isBerichten && announcementCount > 0 && !isActive && (
            <span style={{
              position: 'absolute', top: '-4px', right: '-4px',
              backgroundColor: '#ef4444', color: 'white',
              fontSize: '8px', fontWeight: '800',
              width: '14px', height: '14px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1.5px solid #0d1526',
            }}>
              {announcementCount > 9 ? '9+' : announcementCount}
            </span>
          )}
        </div>
        <span style={{ fontSize: '13px', fontWeight: isActive ? '700' : '500', color: isActive ? '#f1f5f9' : '#94a3b8' }}>
          {item.label}
        </span>
        {isActive && <ChevronRight size={14} color={`${item.color}88`} style={{ marginLeft: 'auto', flexShrink: 0 }} />}
      </a>
    );
  };

  return (
    <aside className="desktop-sidebar">
      <div style={{
        padding: '20px 20px 16px', borderBottom: '1px solid #1e293b',
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <div style={{
          width: '34px', height: '34px', borderRadius: '9px',
          backgroundColor: '#1e293b', border: '1px solid #334155',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Zap size={18} color="#3b82f6" />
        </div>
        <div>
          <div style={{ fontWeight: '800', fontSize: '14px', color: '#f1f5f9' }}>MySpeedCoach</div>
          <div style={{ fontSize: '10px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>v1.0</div>
        </div>
      </div>

      <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
        {/* Primary nav — mirrors bottom nav */}
        {bottomItems.map((item) => <NavLink key={item.href} item={item} />)}

        {/* Divider before secondary items */}
        {sidebarItems.length > 0 && (
          <div style={{ margin: '8px 12px', borderTop: '1px solid #1e293b' }} />
        )}

        {/* Secondary nav — unique to sidebar */}
        {sidebarItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPath === item.href;
          return (
            <a key={item.href} href={item.href} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '10px 12px', borderRadius: '10px', marginBottom: '4px',
              textDecoration: 'none',
              backgroundColor: isActive ? `${item.color}18` : 'transparent',
              border: `1px solid ${isActive ? `${item.color}33` : 'transparent'}`,
              transition: 'all 0.15s', position: 'relative', overflow: 'hidden',
            }}>
              {isActive && (
                <div style={{
                  position: 'absolute', left: 0, top: '20%', bottom: '20%',
                  width: '3px', borderRadius: '0 3px 3px 0', backgroundColor: item.color,
                }} />
              )}
              <div style={{
                width: '34px', height: '34px', borderRadius: '8px',
                backgroundColor: isActive ? `${item.color}22` : '#1e293b',
                border: `1px solid ${isActive ? `${item.color}44` : '#334155'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Icon size={16} color={isActive ? item.color : '#64748b'} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: isActive ? '700' : '500', color: isActive ? '#f1f5f9' : '#94a3b8' }}>
                  {item.label}
                </div>
                <div style={{ fontSize: '10px', color: isActive ? `${item.color}bb` : '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.description}
                </div>
              </div>
              {isActive && <ChevronRight size={14} color={`${item.color}88`} style={{ flexShrink: 0 }} />}
            </a>
          );
        })}
      </nav>

      <div style={{ padding: '14px 16px', borderTop: '1px solid #1e293b', fontSize: '10px', color: '#334155', textAlign: 'center' }}>
        MYSPEEDCOACH © 2025
      </div>
    </aside>
  );
}

// ─── Main layout wrapper ──────────────────────────────────────────────────────
export default function AppLayout({ children, userRole, coachView, announcementCount = 0 }) {
  const router = useRouter();
  const currentPath = router.pathname;
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isCoach = !!(coachView || isAdminRole(userRole));

  useEffect(() => {
    setDrawerOpen(false);
  }, [currentPath]);

  return (
    <>
      <style>{layoutCSS}</style>

      <SidebarDrawer
        currentPath={currentPath}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        userRole={userRole}
        isCoach={isCoach}
      />

      <DesktopSidebar
        currentPath={currentPath}
        userRole={userRole}
        isCoach={isCoach}
        announcementCount={announcementCount}
      />

      <div className="mobile-bottom-nav">
        <BottomNav
          currentPath={currentPath}
          userRole={userRole}
          isCoach={isCoach}
          onMoreClick={() => setDrawerOpen(true)}
          announcementCount={announcementCount}
        />
      </div>

      <main className="app-content" style={{ backgroundColor: '#0f172a', minHeight: '100vh' }}>
        {children}
      </main>
    </>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const layoutCSS = `
  * { box-sizing: border-box; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }

  .desktop-sidebar {
    position: fixed;
    top: 0; left: 0; bottom: 0;
    width: 240px;
    background-color: #0d1526;
    border-right: 1px solid #1e293b;
    display: flex;
    flex-direction: column;
    z-index: 100;
  }

  .app-content {
    margin-left: 240px;
  }

  .mobile-bottom-nav {
    display: none;
  }

  @media (max-width: 768px) {
    .desktop-sidebar   { display: none; }
    .mobile-bottom-nav { display: block; }
    .app-content       { margin-left: 0 !important; padding-bottom: 72px; }
  }

  a[href]:hover {
    background-color: rgba(255,255,255,0.04) !important;
  }
`;
