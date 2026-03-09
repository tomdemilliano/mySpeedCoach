import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import {
  Zap, User, Hash, LayoutDashboard, ShieldAlert,
  Menu, X, ChevronRight
} from 'lucide-react';

// ─── Nav items ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  {
    href: '/',
    label: 'Mijn Profiel',
    icon: User,
    description: 'HRM, records & doelen',
    color: '#3b82f6',
  },
  {
    href: '/counter',
    label: 'Teller',
    icon: Hash,
    description: 'Sessie tellen',
    color: '#22c55e',
  },
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    description: 'Live monitoring',
    color: '#f59e0b',
  },
  {
    href: '/superadmin',
    label: 'Beheer',
    icon: ShieldAlert,
    description: 'Clubs & gebruikers',
    color: '#a78bfa',
  },
];

// ─── Sidebar (desktop) ────────────────────────────────────────────────────────
function Sidebar({ currentPath, mobileOpen, onClose }) {
  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            zIndex: 200,
            display: 'none',
          }}
          className="mobile-backdrop"
        />
      )}

      <aside
        className={`app-sidebar ${mobileOpen ? 'sidebar-open' : ''}`}
        style={{
          position: 'fixed',
          top: 0, left: 0, bottom: 0,
          width: '240px',
          backgroundColor: '#0d1526',
          borderRight: '1px solid #1e293b',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 300,
          transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Logo */}
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
              width: '34px', height: '34px',
              borderRadius: '9px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
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

          {/* Mobile close button */}
          <button
            className="sidebar-close-btn"
            onClick={onClose}
            style={{
              background: 'none', border: 'none',
              color: '#64748b', cursor: 'pointer',
              padding: '4px', display: 'none',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
          {NAV_ITEMS.map((item) => {
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
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden',
                }}
                className="nav-item"
              >
                {/* Active indicator bar */}
                {isActive && (
                  <div style={{
                    position: 'absolute', left: 0, top: '20%', bottom: '20%',
                    width: '3px', borderRadius: '0 3px 3px 0',
                    backgroundColor: item.color,
                  }} />
                )}

                <div style={{
                  width: '34px', height: '34px',
                  borderRadius: '8px',
                  backgroundColor: isActive ? `${item.color}22` : '#1e293b',
                  border: `1px solid ${isActive ? `${item.color}44` : '#334155'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all 0.15s',
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

                {isActive && (
                  <ChevronRight size={14} color={`${item.color}88`} style={{ flexShrink: 0 }} />
                )}
              </a>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{
          padding: '14px 16px',
          borderTop: '1px solid #1e293b',
          fontSize: '10px',
          color: '#334155',
          textAlign: 'center',
          letterSpacing: '0.5px',
        }}>
          MYSPEEDCOACH © 2025
        </div>
      </aside>
    </>
  );
}

// ─── Mobile bottom nav ────────────────────────────────────────────────────────
function BottomNav({ currentPath }) {
  return (
    <nav
      className="bottom-nav"
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        backgroundColor: '#0d1526',
        borderTop: '1px solid #1e293b',
        display: 'none',
        zIndex: 150,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = currentPath === item.href;
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
              padding: '10px 4px 8px',
              textDecoration: 'none',
              color: isActive ? item.color : '#475569',
              position: 'relative',
              transition: 'color 0.15s',
            }}
          >
            {/* Active top bar */}
            {isActive && (
              <div style={{
                position: 'absolute', top: 0, left: '20%', right: '20%',
                height: '2px', borderRadius: '0 0 3px 3px',
                backgroundColor: item.color,
              }} />
            )}

            <div style={{
              width: '36px', height: '36px',
              borderRadius: '10px',
              backgroundColor: isActive ? `${item.color}1a` : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: '3px',
              transition: 'background-color 0.15s',
            }}>
              <Icon size={20} color={isActive ? item.color : '#475569'} />
            </div>

            <span style={{
              fontSize: '9px',
              fontWeight: isActive ? '700' : '400',
              letterSpacing: '0.3px',
              textTransform: 'uppercase',
            }}>
              {item.label}
            </span>
          </a>
        );
      })}
    </nav>
  );
}

// ─── Mobile top bar ───────────────────────────────────────────────────────────
function MobileTopBar({ currentPath, onMenuOpen }) {
  const current = NAV_ITEMS.find(i => i.href === currentPath) || NAV_ITEMS[0];
  return (
    <header
      className="mobile-topbar"
      style={{
        display: 'none',
        position: 'fixed', top: 0, left: 0, right: 0,
        backgroundColor: '#0d1526',
        borderBottom: '1px solid #1e293b',
        padding: '12px 16px',
        alignItems: 'center',
        gap: '12px',
        zIndex: 150,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
        <div style={{
          width: '28px', height: '28px',
          borderRadius: '7px',
          backgroundColor: '#1e293b',
          border: '1px solid #334155',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Zap size={14} color="#3b82f6" />
        </div>
        <span style={{ fontWeight: '800', fontSize: '14px', color: '#f1f5f9' }}>
          MySpeedCoach
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '11px', color: current.color, fontWeight: '600' }}>
          {current.label}
        </span>
      </div>
    </header>
  );
}

// ─── Main layout wrapper ──────────────────────────────────────────────────────
export default function AppLayout({ children }) {
  const router = useRouter();
  const currentPath = router.pathname;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close sidebar on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [currentPath]);

  return (
    <>
      <style>{layoutCSS}</style>

      {/* Desktop sidebar */}
      <Sidebar
        currentPath={currentPath}
        mobileOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      {/* Mobile top bar */}
      <MobileTopBar
        currentPath={currentPath}
        onMenuOpen={() => setMobileMenuOpen(true)}
      />

      {/* Page content */}
      <main
        className="app-content"
        style={{
          marginLeft: '240px',
          minHeight: '100vh',
          backgroundColor: '#0f172a',
        }}
      >
        {children}
      </main>

      {/* Mobile bottom navigation */}
      <BottomNav currentPath={currentPath} />
    </>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const layoutCSS = `
  * { box-sizing: border-box; }

  /* Hover effects for nav items */
  .nav-item:hover {
    background-color: rgba(255,255,255,0.04) !important;
    border-color: #1e293b !important;
  }

  /* Desktop: sidebar visible, bottom nav hidden */
  .app-sidebar {
    transform: translateX(0);
  }

  /* Mobile layout */
  @media (max-width: 768px) {
    /* Hide desktop sidebar by default */
    .app-sidebar {
      transform: translateX(-100%);
    }

    /* Show sidebar when open */
    .app-sidebar.sidebar-open {
      transform: translateX(0);
      box-shadow: 4px 0 40px rgba(0,0,0,0.6);
    }

    /* Show close button inside sidebar on mobile */
    .sidebar-close-btn {
      display: flex !important;
    }

    /* Show backdrop */
    .mobile-backdrop {
      display: block !important;
    }

    /* Show mobile top bar */
    .mobile-topbar {
      display: flex !important;
    }

    /* Show bottom nav */
    .bottom-nav {
      display: flex !important;
    }

    /* Remove sidebar offset, add top/bottom padding */
    .app-content {
      margin-left: 0 !important;
      padding-top: 56px;
      padding-bottom: 72px;
    }
  }
`;
