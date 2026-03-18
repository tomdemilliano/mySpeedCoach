import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { AuthFactory } from '../constants/dbSchema';
import { useAuth } from '../contexts/AuthContext';
import { Mail, RefreshCw, LogOut, CheckCircle2 } from 'lucide-react';

export default function VerifyEmailPage() {
  const router = useRouter();
  const { uid, logout } = useAuth();

  const [resendCooldown, setResendCooldown] = useState(0); // seconds remaining
  const [checking,       setChecking]       = useState(false);
  const [resending,      setResending]      = useState(false);

  // Redirect away if already verified
  useEffect(() => {
    if (!uid) { router.replace('/login'); return; }
    if (AuthFactory.isEmailVerified()) { router.replace('/'); }
  }, [uid]);

  // Countdown timer for resend button
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // Poll for verification every 5s so the user doesn't have to click manually
  useEffect(() => {
    if (!uid) return;
    const interval = setInterval(async () => {
      try {
        // Reload the Firebase Auth user to get fresh emailVerified status
        const user = AuthFactory.getCurrentUser();
        if (user) {
          await user.reload();
          if (user.emailVerified) {
            clearInterval(interval);
            router.replace('/');
          }
        }
      } catch (_) {}
    }, 5000);
    return () => clearInterval(interval);
  }, [uid]);

  const handleResend = async () => {
    setResending(true);
    try {
      await AuthFactory.sendEmailVerification();
      setResendCooldown(60);
    } catch (err) {
      if (err.code === 'auth/too-many-requests') setResendCooldown(60);
    } finally {
      setResending(false);
    }
  };

  const handleCheckNow = async () => {
    setChecking(true);
    try {
      const user = AuthFactory.getCurrentUser();
      if (user) {
        await user.reload();
        if (user.emailVerified) router.replace('/');
      }
    } catch (_) {}
    finally { setChecking(false); }
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const email = AuthFactory.getCurrentUser()?.email || '';

  return (
    <div style={s.page}>
      <style>{css}</style>

      <div style={s.card}>
        {/* Icon */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={s.iconWrap}>
            <Mail size={32} color="#3b82f6" />
          </div>
          <h1 style={s.title}>Verifieer je e-mailadres</h1>
          <p style={s.subtitle}>
            We hebben een verificatielink gestuurd naar<br />
            <strong style={{ color: '#f1f5f9' }}>{email}</strong>
          </p>
        </div>

        {/* Steps */}
        <div style={s.steps}>
          {[
            'Open je inbox',
            'Klik op de verificatielink in de e-mail',
            'Kom terug naar de app',
          ].map((step, i) => (
            <div key={i} style={s.step}>
              <div style={s.stepNum}>{i + 1}</div>
              <span style={{ fontSize: '13px', color: '#94a3b8' }}>{step}</span>
            </div>
          ))}
        </div>

        {/* Check manually */}
        <button
          onClick={handleCheckNow}
          disabled={checking}
          style={{ ...s.btn, marginBottom: '10px', opacity: checking ? 0.65 : 1 }}
        >
          <RefreshCw size={16} style={checking ? { animation: 'spin 1s linear infinite' } : {}} />
          {checking ? 'Controleren…' : 'Ik heb geverifieerd'}
        </button>

        {/* Resend */}
        <button
          onClick={handleResend}
          disabled={resendCooldown > 0 || resending}
          style={{ ...s.btnSecondary, opacity: resendCooldown > 0 || resending ? 0.5 : 1 }}
        >
          {resending
            ? 'Versturen…'
            : resendCooldown > 0
            ? `Opnieuw versturen (${resendCooldown}s)`
            : 'E-mail opnieuw versturen'}
        </button>

        {/* Spam note */}
        <p style={s.note}>
          Geen e-mail ontvangen? Controleer je spammap.
        </p>

        {/* Logout */}
        <button onClick={handleLogout} style={s.logoutBtn}>
          <LogOut size={14} /> Uitloggen en ander account gebruiken
        </button>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const css = `* { box-sizing: border-box; }`;

const s = {
  page:    { minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', fontFamily: 'system-ui, sans-serif' },
  card:    { width: '100%', maxWidth: '400px', backgroundColor: '#1e293b', borderRadius: '20px', padding: '36px 28px', border: '1px solid #334155', boxShadow: '0 24px 48px rgba(0,0,0,0.4)' },
  iconWrap:{ width: '72px', height: '72px', borderRadius: '20px', backgroundColor: '#3b82f622', border: '1px solid #3b82f644', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' },
  title:   { fontSize: '22px', fontWeight: '800', color: '#f1f5f9', margin: '0 0 8px', letterSpacing: '-0.3px' },
  subtitle:{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: 1.6 },
  steps:   { backgroundColor: '#0f172a', borderRadius: '12px', padding: '14px', border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' },
  step:    { display: 'flex', alignItems: 'center', gap: '10px' },
  stepNum: { width: '22px', height: '22px', borderRadius: '50%', backgroundColor: '#3b82f633', border: '1px solid #3b82f655', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: '#60a5fa', flexShrink: 0 },
  btn:     { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '13px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '10px', color: 'white', fontWeight: '700', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' },
  btnSecondary: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '10px', color: '#94a3b8', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', marginBottom: '12px' },
  note:    { fontSize: '12px', color: '#475569', textAlign: 'center', margin: '0 0 20px' },
  logoutBtn: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'none', border: 'none', color: '#475569', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', padding: '4px' },
};
