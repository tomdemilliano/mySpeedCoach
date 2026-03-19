// hooks/usePushNotifications.js
//
// Manages the full Web Push lifecycle for a logged-in user:
//   1. Registers /sw.js as the service worker
//   2. Checks current Notification.permission
//   3. Subscribes to push (using the VAPID public key) and POSTs to /api/push/subscribe
//   4. Exposes subscribe / unsubscribe functions and current state
//
// Usage:
//   const { permission, isSubscribed, subscribe, unsubscribe, isSupported } = usePushNotifications(uid);

import { useState, useEffect, useCallback } from 'react';

// Convert the URL-safe base64 VAPID public key to a Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export function usePushNotifications(uid) {
  const [permission,    setPermission]    = useState('default'); // 'default' | 'granted' | 'denied'
  const [isSubscribed,  setIsSubscribed]  = useState(false);
  const [subscription,  setSubscription]  = useState(null);
  const [isSupported,   setIsSupported]   = useState(false);
  const [isLoading,     setIsLoading]     = useState(false);
  const [error,         setError]         = useState(null);

  // ── Check support + existing subscription on mount ──────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    setIsSupported(true);
    setPermission(Notification.permission);

    // Register the service worker (next-pwa may already have done this,
    // but calling register() again is safe — it returns the existing registration)
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(async (reg) => {
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          setSubscription(existing);
          setIsSubscribed(true);
        }
      })
      .catch(err => console.warn('[usePushNotifications] SW registration failed:', err));
  }, []);

  // ── Subscribe ────────────────────────────────────────────────────────────
  const subscribe = useCallback(async () => {
    if (!uid || !isSupported) return;
    setIsLoading(true);
    setError(null);

    try {
      // 1. Request permission
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setError('Notificaties zijn geblokkeerd. Pas de browserinstellingen aan om ze toe te staan.');
        setIsLoading(false);
        return;
      }

      // 2. Get the service worker registration
      const reg = await navigator.serviceWorker.ready;

      // 3. Create a push subscription
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) throw new Error('NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set');

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      // 4. Save to Firestore via API
      const res = await fetch('/api/push/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ uid, subscription: sub.toJSON() }),
      });

      if (!res.ok) throw new Error('Failed to save subscription on server');

      setSubscription(sub);
      setIsSubscribed(true);
    } catch (err) {
      console.error('[usePushNotifications] subscribe error:', err);
      setError(err.message || 'Inschrijven voor notificaties mislukt.');
    } finally {
      setIsLoading(false);
    }
  }, [uid, isSupported]);

  // ── Unsubscribe ──────────────────────────────────────────────────────────
  const unsubscribe = useCallback(async () => {
    if (!uid || !subscription) return;
    setIsLoading(true);
    setError(null);

    try {
      const endpoint = subscription.endpoint;

      // 1. Unsubscribe from the browser push manager
      await subscription.unsubscribe();

      // 2. Remove from Firestore via API
      await fetch('/api/push/unsubscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ uid, endpoint }),
      });

      setSubscription(null);
      setIsSubscribed(false);
    } catch (err) {
      console.error('[usePushNotifications] unsubscribe error:', err);
      setError(err.message || 'Uitschrijven mislukt.');
    } finally {
      setIsLoading(false);
    }
  }, [uid, subscription]);

  return { permission, isSubscribed, isSupported, isLoading, error, subscribe, unsubscribe };
}
