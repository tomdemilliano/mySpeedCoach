import React, { createContext, useContext, useEffect, useState } from 'react';
import { AuthFactory, UserFactory } from '../constants/dbSchema';

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthContext = createContext(null);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [uid,     setUid]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = AuthFactory.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Provision Firestore user doc on first login if it doesn't exist yet
          const snap = await UserFactory.get(firebaseUser.uid);
          if (!snap.exists()) {
            await UserFactory.create(firebaseUser.uid, {
              firstName: firebaseUser.displayName?.split(' ')[0] || '',
              lastName:  firebaseUser.displayName?.split(' ').slice(1).join(' ') || '',
              email:     firebaseUser.email || '',
              role:      'user',
            });
          }
        } catch (e) {
          console.error('Failed to provision user doc:', e);
        }
        setUid(firebaseUser.uid);
      } else {
        setUid(null);
      }
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const logout = () => AuthFactory.signOut();

  return (
    <AuthContext.Provider value={{ uid, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
