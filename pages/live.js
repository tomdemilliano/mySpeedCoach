/**
 * pages/live.js  —  Live Hub
 *
 * Entry point for all live / counting / monitoring features.
 * Manual and camera counting navigate to /skipper-select for setup.
 *
 * Rules followed:
 *   - No DB access in this page (CLAUDE.md §1)
 *   - No <form> elements (CLAUDE.md §4)
 *   - Inline CSS only (CLAUDE.md §9)
 *   - Dutch UI strings (CLAUDE.md §9)
 */

import { Zap, Hash, Camera, Upload, Heart, LayoutDashboard, ChevronRight, Timer } from 'lucide-react';

function FeatureCard({ icon: Icon, color, title, subtitle, href, disabled, badge }) {
  const inner = (
    <div style={{
      backgroundColor: '#1e293b', borderRadius: '14px',
      border: `1px solid ${disabled ? '#1e293b' : color + '33'}`,
      padding: '18px', opacity: disabled ? 0.45 : 1,
      display: 'flex', flexDirection: 'column', gap: '12px',
      transition: 'border-color 0.15s', textDecoration: 'none', color: 'inherit',
      cursor: disabled ? 'not-allowed' : 'pointer',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{
          width: '44px', height: '44px', borderRadius: '12px',
          backgroundColor: color + '22', border: `1px solid ${color}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={20} color={color} />
        </div>
        {badge ? (
          <span style={{
            fontSize: '9px', fontWeight: '800', letterSpacing: '0.5px',
            padding: '3px 8px', borderRadius: '8px',
            backgroundColor: badge === 'Binnenkort' ? '#334155' : color + '22',
            color: badge === 'Binnenkort' ? '#64748b' : color,
            border: `1px solid ${badge === 'Binnenkort' ? '#475569' : color + '44'}`,
          }}>
            {badge}
          </span>
        ) : (
          !disabled && <ChevronRight size={16} color={color + '88'} />
        )}
      </div>
      <div>
        <div style={{ fontWeight: '700', fontSize: '15px', color: '#f1f5f9', marginBottom: '3px' }}>{title}</div>
        <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>{subtitle}</div>
      </div>
    </div>
  );

  if (href && !disabled) return <a href={href} style={{ textDecoration: 'none' }}>{inner}</a>;
  return inner;
}

export default function LivePage() {
  const cards = [
    { icon: Hash,            color: '#3b82f6', title: 'Manueel tellen',  subtitle: 'Tel stappen handmatig met live hartslag en badgeverificatie', href: '/skipper-select?mode=manual&return=/counter' },
    { icon: Camera,          color: '#f59e0b', title: 'Camera tellen',   subtitle: 'AI-stapteller via live camera',                               href: '/skipper-select?mode=camera&return=/ai-counter', badge: 'BETA' },
    { icon: Upload,          color: '#a78bfa', title: 'Video uploaden',  subtitle: 'Upload een opgenomen video voor automatische staptelling',     href: '/ai-counter?mode=upload', badge: 'BETA' },
    { icon: Heart,           color: '#ef4444', title: 'Hartslag',        subtitle: 'Volledig scherm hartslagweergave via Bluetooth HRM',          href: '/heart-rate' },
    { icon: LayoutDashboard, color: '#22c55e', title: 'Dashboard',       subtitle: 'Live monitoring van skippers tijdens de training',            href: '/dashboard' },
    { icon: Timer,           color: '#f97316', title: 'Speed Challenge', subtitle: 'Hoe snel haal jij 20, 30, 50 of 100 stappen? Meet je tijd en bekijk het leaderboard.', href: '/speed-challenge', badge: 'BETA' },
    { icon: Zap,           color: '#64748b', title: 'Live Training',   subtitle: 'AI-coach die je automatisch begeleidt in intervallen, zone 2, …', badge: 'Binnenkort', disabled: true },
  ];

  return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', backgroundColor: '#1e293b', borderBottom: '1px solid #334155', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '34px', height: '34px', borderRadius: '9px', backgroundColor: '#22c55e22', border: '1px solid #22c55e44', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={17} color="#22c55e" />
          </div>
          <div>
            <div style={{ fontWeight: '800', fontSize: '15px', color: '#f1f5f9' }}>Live</div>
            <div style={{ fontSize: '11px', color: '#475569' }}>Tellen & monitoren</div>
          </div>
        </div>
      </header>
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '24px 16px 48px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
          {cards.map((card, i) => <FeatureCard key={i} {...card} />)}
        </div>
      </div>
    </div>
  );
}
