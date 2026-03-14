import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import {
  Zap, User, Hash, LayoutDashboard, ShieldAlert,
  Menu, X, ChevronRight, Clock, Medal, Home,
  Calendar, MoreHorizontal, Trophy, Target, History,
  Building2, Users
} from 'lucide-react';

// ─── Nav items for the sidebar (More panel) ───────────────────────────────────
const SIDEBAR_ITEMS = [
  {
    href: '/history',
    label: 'Geschiedenis',
    icon: History,
    description: 'Sessies & AI analyse',
    color: '#60a5fa',
    roles: ['user', 'clubadmin', 'superadmin'],
  },
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    description: 'Live monitoring',
    color: '#f59e0b',
    roles: ['user', 'clubadmin', 'superadmin'],
  },
  {
    href: '/badges',
    label: 'Badge Leaderboard',
    icon: Medal,
    description: 'Club klassement',
    color: '#f59e0b',
    roles: ['user', 'clubadmin', 'superadmin'],
  },
  {
    href: '/superadmin',
    label: 'Beheer',
    icon: ShieldAlert,
    description: 'Clubs & gebruikers',
    color: '#a78bfa',
    roles: ['superadmin', 'clubadmin'],
  },
];

// ─── Role helper ──────────────────────────────────────────────────────────────
const isCoachRole = (role) => role === 'clubadmin' || role === 'superadmin';

// ─── Bottom nav config per role ───────────────────────────────────────────────
const getBottomNav = (role) => {
  const coach = isCoachRole(role);
  return [
    {
      href: '/',
      label: 'Home',
      icon: Home,
      color: '#3b82f6',
    },
    coach
      ? { href: '/counter', label: 'Tellen', icon: Hash, color: '#22c55e' }
      : { href: '/achievements', label: 'Prestaties', icon: Trophy, color: '#f59e0b' },
    {
      href: coach ? '/dashboard' : '/counter',
      label: coach ? 'Dashboard' : 'Tellen',
      icon: coach ? LayoutDashboard : Hash,
      color: coach ? '#f59e0b' : '#22c55e',
      isPrimary: true,
    },
    {
      href: '/agenda',
      label: 'Agenda',
      icon: Calendar,
      color: '#a78bfa',
    },
    {
      key: 'more',
      label: 'Meer',
      icon: MoreHorizontal,
      color: '#64748b',
    },
  ];
};

// ─── More / Sidebar Drawer ────────────────────────────────────────────────────
function SidebarDrawer({ currentPath, open, onClose, userRole }) {
  const role = userRole || 'user';
  const visibleItems = SIDEBAR_ITEMS.filter(item => item.roles.includes(role));

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            zIndex: 200,
          }}
        />
      )}

      <aside
        style={{
          position: 'fixed',
          top: 0, left: 0, bottom: 0,
          width: '260px',
          backgroundColor: '#0d1526',
          borderRight: '1px solid #1e293b',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 300,
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Logo row */}
        <div style={{
          padding: '20px 20px 16px',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          justifyContent: 'space-between',
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
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Section label */}
        <div style={{ padding: '16px 20px 8px', fontSize: '10px', color: '#475569', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
          Meer opties
        </div>

        {/* Nav links */}
        <nav style={{ flex: 1, padding: '4px 10px', overflowY: 'auto' }}>
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPath === item.href;
            return (
              <a
                key={item.href}
                href={item.href}
                onClick={onClose}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  marginBottom: '4px',
                  textDecoration: 'none',
                  backgroundColor: isActive ? `${item.color}18` : 'transparent',
                  border: `1px solid ${isActive ? `${item.color}33` : 'transparent'}`,
                  transition: 'all 0.15s',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {isActive && (
                  <div style={{
                    position: 'absolute', left: 0, top: '20%', bottom: '20%',
                    width: '3px', borderRadius: '0 3px 3px 0',
                    backgroundColor: item.color,
                  }} />
                )}
                <div style={{
                  width: '34px', height: '34px', borderRadius: '8px',
                  backgroundColor: isActive ? `${item.color}22` : '#1e293b',
                  border: `1px solid ${isActive ? `${item.color}44` : '#334155'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Icon size={16} color={isActive ? item.color : '#64748b'} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: isActive ? '700' : '500',
                    color: isActive ? '#f1f5f9' : '#94a3b8',
                    marginBottom: '1px',
                  }}>
                    {item.label}
                  </div>
                  <div style={{
                    fontSize: '10px',
                    color: isActive ? `${item.color}bb` : '#475569',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {item.description}
                  </div>
                </div>
                {isActive && <ChevronRight size={14} color={`${item.color}88`} style={{ flexShrink: 0 }} />}
              </a>
            );
          })}

          {/* Memberships link */}
          <div style={{ margin: '12px 12px 6px', fontSize: '10px', color: '#475569', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Account
          </div>
          <a
            href="/?tab=memberships"
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '10px 12px', borderRadius: '10px', marginBottom: '4px',
              textDecoration: 'none', backgroundColor: 'transparent',
              border: '1px solid transparent', transition: 'all 0.15s',
            }}
          >
            <div style={{
              width: '34px', height: '34px', borderRadius: '8px',
              backgroundColor: '#1e293b', border: '1px solid #334155',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Building2 size={16} color="#64748b" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: '500', color: '#94a3b8', marginBottom: '1px' }}>
                Lidmaatschappen
              </div>
              <div style={{ fontSize: '10px', color: '#475569' }}>
                Clubs & groepen
              </div>
            </div>
          </a>
        </nav>

        {/* Footer */}
        <div style={{
          padding: '14px 16px',
          borderTop: '1px solid #1e293b',
          fontSize: '10px', color: '#334155',
          textAlign: 'center', letterSpacing: '0.5px',
        }}>
          MYSPEEDCOACH © 2025
        </div>
      </aside>
    </>
  );
}

// ─── Bottom Navigation Bar ────────────────────────────────────────────────────
function BottomNav({ currentPath, userRole, onMoreClick }) {
  const items = getBottomNav(effectiveRole);

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      backgroundColor: '#0d1526',
      borderTop: '1px solid #1e293b',
      display: 'flex',
      zIndex: 150,
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {items.map((item, idx) => {
        const Icon = item.icon;
        const isMore = item.key === 'more';
        const isActive = !isMore && currentPath === item.href;
        const isPrimary = item.isPrimary;

        if (isPrimary) {
          return (
            <a
              key={item.href}
              href={item.href}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px 4px 8px',
                textDecoration: 'none',
                position: 'relative',
              }}
            >
              {/* Primary action pill */}
              <div style={{
                width: '52px', height: '52px',
                borderRadius: '16px',
                backgroundColor: isActive ? item.color : `${item.color}22`,
                border: `1.5px solid ${isActive ? item.color : `${item.color}55`}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: '3px',
                transition: 'all 0.2s',
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
            <button
              key="more"
              onClick={onMoreClick}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: '8px 4px', background: 'none', border: 'none',
                cursor: 'pointer', position: 'relative',
              }}
            >
              <Icon size={22} color="#475569" />
              <span style={{ fontSize: '10px', fontWeight: '400', color: '#475569', marginTop: '3px' }}>
                {item.label}
              </span>
            </button>
          );
        }

        return (
          <a
            key={item.href || idx}
            href={item.href}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: '8px 4px', textDecoration: 'none',
              position: 'relative',
            }}
          >
            <Icon size={22} color={isActive ? item.color : '#475569'} />
            <span style={{ fontSize: '10px', fontWeight: isActive ? '700' : '400', color: isActive ? item.color : '#475569', marginTop: '3px' }}>
              {item.label}
            </span>
            {isActive && (
              <div style={{
                position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
                width: '20px', height: '2px',
                backgroundColor: item.color,
                borderRadius: '2px 2px 0 0',
              }} />
            )}
          </a>
        );
      })}
    </nav>
  );
}

// ─── Main layout wrapper ──────────────────────────────────────────────────────
export default function AppLayout({ children, userRole, coachView }) {
  const router = useRouter();
  const currentPath = router.pathname;
  const [drawerOpen, setDrawerOpen] = useState(false);
  // coachView overrides role-based detection when explicitly set
  const effectiveRole = coachView ? 'clubadmin' : (userRole || 'user');

  useEffect(() => {
    setDrawerOpen(false);
  }, [currentPath]);

  // On desktop, we keep a slim sidebar for the "more" items
  // On mobile, everything is bottom nav + drawer

  return (
    <>
      <style>{layoutCSS}</style>

      <SidebarDrawer
        currentPath={currentPath}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        userRole={userRole}
      />

      {/* Desktop sidebar — always visible on desktop */}
      <aside className="desktop-sidebar">
        <div style={{
          padding: '20px 20px 16px',
          borderBottom: '1px solid #1e293b',
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
          {/* Primary nav items based on role */}
          {getBottomNav(effectiveRole).filter(i => !i.key).map((item) => {
            const Icon = item.icon;
            const isActive = currentPath === item.href;
            return (
              <a
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 12px', borderRadius: '10px', marginBottom: '4px',
                  textDecoration: 'none',
                  backgroundColor: isActive ? `${item.color}18` : 'transparent',
                  border: `1px solid ${isActive ? `${item.color}33` : 'transparent'}`,
                  transition: 'all 0.15s', position: 'relative', overflow: 'hidden',
                }}
              >
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
                <span style={{ fontSize: '13px', fontWeight: isActive ? '700' : '500', color: isActive ? '#f1f5f9' : '#94a3b8' }}>
                  {item.label}
                </span>
                {isActive && <ChevronRight size={14} color={`${item.color}88`} style={{ marginLeft: 'auto', flexShrink: 0 }} />}
              </a>
            );
          })}

          {/* Divider */}
          <div style={{ margin: '8px 12px', borderTop: '1px solid #1e293b' }} />

          {/* More items */}
          {SIDEBAR_ITEMS.filter(i => i.roles.includes(effectiveRole)).map((item) => {
            const Icon = item.icon;
            const isActive = currentPath === item.href;
            return (
              <a
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 12px', borderRadius: '10px', marginBottom: '4px',
                  textDecoration: 'none',
                  backgroundColor: isActive ? `${item.color}18` : 'transparent',
                  border: `1px solid ${isActive ? `${item.color}33` : 'transparent'}`,
                  transition: 'all 0.15s', position: 'relative', overflow: 'hidden',
                }}
              >
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
              </a>
            );
          })}

          {/* Memberships */}
          <a
            href="/?tab=memberships"
            style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '10px 12px', borderRadius: '10px', marginBottom: '4px',
              textDecoration: 'none', backgroundColor: 'transparent',
              border: '1px solid transparent', transition: 'all 0.15s',
            }}
          >
            <div style={{
              width: '34px', height: '34px', borderRadius: '8px',
              backgroundColor: '#1e293b', border: '1px solid #334155',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Building2 size={16} color="#64748b" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: '500', color: '#94a3b8' }}>Lidmaatschappen</div>
              <div style={{ fontSize: '10px', color: '#475569' }}>Clubs & groepen</div>
            </div>
          </a>
        </nav>

        <div style={{ padding: '14px 16px', borderTop: '1px solid #1e293b', fontSize: '10px', color: '#334155', textAlign: 'center' }}>
          MYSPEEDCOACH © 2025
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <div className="mobile-bottom-nav">
        <BottomNav
          currentPath={currentPath}
          userRole={userRole}
          onMoreClick={() => setDrawerOpen(true)}
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
  * { box-sizing: border-box; }

  .desktop-sidebar {
    position: fixed;
    top: 0; left: 0; bottom: 0;
    width: 240px;
    background-color: #0d1526;
    border-right: 1px solid #1e293b;
    display: flex;
    flex-direction: column;
    z-index: 100;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  .app-content {
    margin-left: 240px;
  }

  .mobile-bottom-nav {
    display: none;
  }

  @media (max-width: 768px) {
    .desktop-sidebar {
      display: none;
    }

    .mobile-bottom-nav {
      display: block;
    }

    .app-content {
      margin-left: 0 !important;
      padding-bottom: 72px;
    }
  }

  a[href]:hover {
    background-color: rgba(255,255,255,0.04) !important;
  }
`;
