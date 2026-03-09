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

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ currentPath, mobileOpen, onClose }) {
  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          onClick={onClose}
          className="mobile-backdrop"
          style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            zIndex: 200,
          }}
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

          {/* Close button — shown on mobile only via CSS */}
          <button
            className="sidebar-close-btn"
            onClick={onClose}
            style={{
              background: 'none', border: 'none',
              color: '#64748b', cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav links */}
        <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentPath === item.href;
            return (
              <a
                key={item.href}
                href={item.href}
                onClick={onClose}
                className="nav-item"
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
              >
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

// ─── Floating hamburger button (mobile only) ─────────────────────────────────
// A small floating button in the top-right corner — never conflicts with
// any page's own header or bottom navigation.
function HamburgerButton({ onMenuOpen }) {
  return (
    <button
      className="hamburger-btn"
      onClick={onMenuOpen}
      title="Menu"
      style={{
        position: 'fixed',
        top: '12px',
        right: '14px',
        zIndex: 150,
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '10px',
        color: '#94a3b8',
        cursor: 'pointer',
        width: '38px',
        height: '38px',
        display: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
      }}
    >
      <Menu size={18} />
    </button>
  );
}

// ─── Main layout wrapper ──────────────────────────────────────────────────────
export default function AppLayout({ children }) {
  const router = useRouter();
  const currentPath = router.pathname;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [currentPath]);

  return (
    <>
      <style>{layoutCSS}</style>

      <Sidebar
        currentPath={currentPath}
        mobileOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      {/* Floating hamburger — only visible on mobile via CSS */}
      <HamburgerButton onMenuOpen={() => setMobileMenuOpen(true)} />

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
    </>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const layoutCSS = `
  * { box-sizing: border-box; }

  .app-sidebar, .app-sidebar * {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  .hamburger-btn {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  .nav-item:hover {
    background-color: rgba(255, 255, 255, 0.04) !important;
    border-color: #1e293b !important;
  }

  /* ── Desktop: sidebar always visible, hamburger hidden ── */
  .app-sidebar {
    transform: translateX(0);
  }

  .sidebar-close-btn {
    display: none;
  }

  /* ── Mobile (≤768px) ── */
  @media (max-width: 768px) {
    /* Slide sidebar off-screen */
    .app-sidebar {
      transform: translateX(-100%);
    }

    /* Slide in when open */
    .app-sidebar.sidebar-open {
      transform: translateX(0);
      box-shadow: 4px 0 40px rgba(0, 0, 0, 0.6);
    }

    /* Show close button inside sidebar */
    .sidebar-close-btn {
      display: flex !important;
    }

    /* Show floating hamburger button */
    .hamburger-btn {
      display: flex !important;
    }

    /* Remove sidebar margin — pages handle their own spacing */
    .app-content {
      margin-left: 0 !important;
    }
  }
`;
