// components/PushPermissionBanner.js
//
// A compact banner shown to users who haven't yet decided about push notifications.
// Place it near the top of the home page (index.js), just below the header.
//
// Props:
//   uid : string | null — the logged-in user's Firebase uid

import { useState } from 'react';
import { Bell, BellOff, X } from 'lucide-react';
import { usePushNotifications } from '../hooks/usePushNotifications';

const DISMISSED_KEY = 'msc_push_dismissed';

export default function PushPermissionBanner({ uid }) {
  const { permission, isSubscribed, isSupported, isLoading, error, subscribe, unsubscribe } =
    usePushNotifications(uid);

  // Persisted dismissal — don't show again if user clicked X
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(DISMISSED_KEY) === '1';
  });

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  };

  // Don't render if:
  // • push is not supported in this browser
  // • user has dismissed the banner
  // • user has already granted or explicitly blocked notifications
  if (!isSupported)              return null;
  if (dismissed)                 return null;
  if (permission === 'denied')   return null;
  if (isSubscribed)              return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '12px',
      backgroundColor: '#1e293b',
      border: '1px solid #334155',
      borderLeft: '3px solid #a78bfa',
      borderRadius: '10px',
      padding: '12px 14px',
      marginBottom: '16px',
    }}>
      {/* Icon */}
      <div style={{
        width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
        backgroundColor: '#a78bfa22', border: '1px solid #a78bfa44',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Bell size={16} color="#a78bfa" />
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: '700', fontSize: '13px', color: '#f1f5f9', marginBottom: '2px' }}>
          Meldingen inschakelen
        </div>
        <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>
          Ontvang een melding als je coach een nieuw bericht plaatst.
        </div>

        {error && (
          <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '6px' }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
          <button
            onClick={subscribe}
            disabled={isLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 14px', borderRadius: '8px',
              backgroundColor: '#a78bfa', border: 'none',
              color: 'white', fontSize: '12px', fontWeight: '600',
              cursor: 'pointer', opacity: isLoading ? 0.65 : 1,
              fontFamily: 'inherit',
            }}
          >
            <Bell size={12} />
            {isLoading ? 'Bezig…' : 'Inschakelen'}
          </button>
          <button
            onClick={dismiss}
            style={{
              padding: '7px 12px', borderRadius: '8px',
              backgroundColor: 'transparent', border: '1px solid #334155',
              color: '#64748b', fontSize: '12px', fontWeight: '600',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Niet nu
          </button>
        </div>
      </div>

      {/* Dismiss X */}
      <button
        onClick={dismiss}
        style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: '2px', flexShrink: 0 }}
      >
        <X size={14} />
      </button>
    </div>
  );
}


// ─── Settings toggle (for use inside the settings modal) ─────────────────────
// A smaller inline toggle to manage the subscription from the profile settings.
//
// Usage inside index.js settings modal:
//   import { PushSettingsToggle } from '../components/PushPermissionBanner';
//   <PushSettingsToggle uid={uid} />

export function PushSettingsToggle({ uid }) {
  const { permission, isSubscribed, isSupported, isLoading, error, subscribe, unsubscribe } =
    usePushNotifications(uid);

  if (!isSupported) return (
    <div style={{ fontSize: '12px', color: '#475569' }}>
      Push-notificaties worden niet ondersteund door deze browser.
    </div>
  );

  if (permission === 'denied') return (
    <div style={{ fontSize: '12px', color: '#ef4444' }}>
      Notificaties zijn geblokkeerd in je browserinstellingen. Pas dit aan via de site-instellingen van je browser.
    </div>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
      <div>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isSubscribed ? <Bell size={13} color="#a78bfa" /> : <BellOff size={13} color="#475569" />}
          Push-notificaties
        </div>
        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
          {isSubscribed ? 'Meldingen zijn ingeschakeld op dit apparaat.' : 'Geen meldingen op dit apparaat.'}
        </div>
        {error && <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px' }}>{error}</div>}
      </div>
      <button
        onClick={isSubscribed ? unsubscribe : subscribe}
        disabled={isLoading}
        style={{
          flexShrink: 0,
          padding: '8px 14px', borderRadius: '8px', border: 'none',
          backgroundColor: isSubscribed ? '#334155' : '#a78bfa',
          color: 'white', fontSize: '12px', fontWeight: '600',
          cursor: 'pointer', opacity: isLoading ? 0.65 : 1,
          fontFamily: 'inherit',
        }}
      >
        {isLoading ? '…' : isSubscribed ? 'Uitschakelen' : 'Inschakelen'}
      </button>
    </div>
  );
}
