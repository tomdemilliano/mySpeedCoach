// ============================================================
// components/SeasonBanner.js
// ============================================================
// Drop-in banner shown on index.js and clubadmin.js for clubadmins.
// Shows ~30 days before the new season should start.
//
// Props:
//   clubId       : string
//   club         : club object
//   userRole     : string
//   coachView    : boolean
 
import { useCurrentSeason } from '../hooks/useCurrentSeason';
import { Calendar, X, ArrowRight } from 'lucide-react';
import { useState } from 'react';
 
const DISMISSED_KEY = 'msc_season_banner_dismissed';
 
export default function SeasonBanner({ clubId, club, userRole, coachView }) {
  const isAdmin = userRole === 'clubadmin' || userRole === 'superadmin';
  if (!isAdmin) return null;
 
  const { showBanner, upcomingStart, loading } = useCurrentSeason(clubId, club);
 
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    // Dismiss key includes the upcoming season year so it resets each year
    const year = upcomingStart ? upcomingStart.getFullYear() : '';
    return localStorage.getItem(`${DISMISSED_KEY}_${year}`) === '1';
  });
 
  if (loading || !showBanner || dismissed) return null;
 
  const handleDismiss = () => {
    const year = upcomingStart ? upcomingStart.getFullYear() : '';
    localStorage.setItem(`${DISMISSED_KEY}_${year}`, '1');
    setDismissed(true);
  };
 
  const daysUntil = upcomingStart
    ? Math.ceil((upcomingStart - new Date()) / (1000 * 60 * 60 * 24))
    : null;
 
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '12px',
      backgroundColor: '#1e293b',
      border: '1px solid #f59e0b44',
      borderLeft: '3px solid #f59e0b',
      borderRadius: '10px',
      padding: '12px 14px',
      marginBottom: '16px',
    }}>
      <div style={{
        width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
        backgroundColor: '#f59e0b22', border: '1px solid #f59e0b44',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Calendar size={16} color="#f59e0b" />
      </div>
 
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: '700', fontSize: '13px', color: '#f1f5f9', marginBottom: '2px' }}>
          Nieuw seizoen naderen
        </div>
        <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>
          {daysUntil !== null && daysUntil > 0
            ? `Over ${daysUntil} dag${daysUntil !== 1 ? 'en' : ''} begint het nieuwe seizoen.`
            : 'Het nieuwe seizoen start binnenkort.'}
          {' '}Vergeet niet een nieuw seizoen aan te maken in het clubbeheer.
        </div>
        <a
          href="/clubadmin"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            marginTop: '8px', fontSize: '12px', fontWeight: '600',
            color: '#f59e0b', textDecoration: 'none',
          }}
        >
          Naar clubbeheer <ArrowRight size={11} />
        </a>
      </div>
 
      <button
        onClick={handleDismiss}
        style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: '2px', flexShrink: 0 }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
 
