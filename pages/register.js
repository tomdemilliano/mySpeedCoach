import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import {
  AuthFactory, UserFactory,
} from '../constants/dbSchema';
import { useAuth } from '../contexts/AuthContext';
import {
  Zap, Mail, Lock, User, AlertCircle, Check,
  ChevronRight, CheckCircle2,
} from 'lucide-react';

// ─── Step dots ────────────────────────────────────────────────────────────────
function StepDots({ current, total }) {
  return (
    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '28px' }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: i === current ? '20px' : '8px', height: '8px', borderRadius: '4px',
          backgroundColor: i === current ? '#3b82f6' : i < current ? '#22c55e' : '#334155',
          transition: 'all 0.3s',
        }} />
      ))}
    </div>
  );
}

// ─── Password strength ────────────────────────────────────────────────────────
function PasswordStrength({ password }) {
  const checks = [
    { label: 'Minimaal 8 tekens',     ok: password.length >= 8 },
    { label: 'Een hoofdletter',        ok: /[A-Z]/.test(password) },
    { label: 'Een cijfer of symbool',  ok: /[0-9!@#$%^&*]/.test(password) },
  ];
  const score = checks.filter(c => c.ok).length;
  const colors = ['#ef4444', '#f59e0b', '#22c55e'];
  const labels = ['Zwak', 'Matig', 'Sterk'];
  if (!password) return null;
  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ flex: 1, height: '3px', borderRadius: '2px', backgroundColor: i < score ? colors[score - 1] : '#334155', transition: 'background-color 0.2s' }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
        <span style={{ fontSize: '11px', color: score > 0 ? colors[score - 1] : '#475569', fontWeight: '600' }}>
          {score > 0 ? labels[score - 1] : ''}
        </span>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {checks.map(c => (
            <span key={c.label} style={{ fontSize: '10px', color: c.ok ? '#22c55e' : '#475569', display: 'flex', alignItems: 'center', gap: '3px' }}>
              <Check size={9} style={{ opacity: c.ok ? 1 : 0.3 }} /> {c.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ErrorBanner({ message }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#ef444422', color: '#ef4444', fontSize: '13px', padding: '10px 14px', borderRadius: '8px', border: '1px solid #ef444433' }}>
      <AlertCircle size={14} style={{ flexShrink: 0 }} /><span>{message}</span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function RegisterPage() {
  const router = useRouter();
  const { uid } = useAuth();

  const [step, setStep] = useState(0); // 0=credentials, 1=name, 2=done

  // Step 0
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');

  // Step 1
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');

  // Shared
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  // Redirect if registration was already fully completed
  useEffect(() => {
    if (uid) {
      UserFactory.get(uid).then(snap => {
        if (snap.exists() && snap.data().registrationDone) router.replace('/');
      });
    }
  }, [uid]);

  // ── Step 0: Create Firebase Auth account ──────────────────────────────────
  const handleCredentials = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim())        { setError('Vul een e-mailadres in.'); return; }
    if (password.length < 8)  { setError('Wachtwoord moet minimaal 8 tekens zijn.'); return; }
    if (password !== confirm)  { setError('Wachtwoorden komen niet overeen.'); return; }
    setLoading(true);
    try {
      await AuthFactory.registerWithEmail(email.trim(), password);
      try { await AuthFactory.sendEmailVerification(); } catch (_) {}
      setStep(1);
    } catch (err) {
      setError(getFriendlyError(err.code));
    } finally {
      setLoading(false);
    }
  };

  // ── Step 1: Save name ─────────────────────────────────────────────────────
  const handleName = async (e) => {
    e.preventDefault();
    setError('');
    if (!firstName.trim()) { setError('Voornaam is verplicht.'); return; }
    if (!lastName.trim())  { setError('Achternaam is verplicht.'); return; }
    setLoading(true);
    try {
      const currentUid = AuthFactory.getCurrentUser()?.uid;
      if (currentUid) {
        await UserFactory.updateProfile(currentUid, {
          firstName: firstName.trim(),
          lastName:  lastName.trim(),
        });
      }
      setStep(2);
    } catch {
      setError('Opslaan mislukt. Probeer opnieuw.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <style>{css}</style>

      <div style={s.card}>
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={s.logo}><Zap size={24} color="#3b82f6" /></div>
          <h1 style={s.title}>Account aanmaken</h1>
        </div>

        <StepDots current={step} total={3} />

        {/* ── STEP 0: Credentials ── */}
        {step === 0 && (
          <form onSubmit={handleCredentials} style={s.form}>
            <div style={s.stepHeader}>
              <div style={s.stepLabel}>Stap 1 van 3</div>
              <h2 style={s.stepTitle}>Inloggegevens</h2>
            </div>

            <div>
              <label style={s.label}>E-mailadres</label>
              <div style={s.inputWrap}>
                <Mail size={15} color="#475569" style={s.inputIcon} />
                <input type="email" autoComplete="email" placeholder="jouw@email.com" value={email} onChange={e => setEmail(e.target.value)} style={s.input} autoFocus />
              </div>
            </div>

            <div>
              <label style={s.label}>Wachtwoord</label>
              <div style={s.inputWrap}>
                <Lock size={15} color="#475569" style={s.inputIcon} />
                <input type="password" autoComplete="new-password" placeholder="Minimaal 8 tekens" value={password} onChange={e => setPassword(e.target.value)} style={s.input} />
              </div>
              <PasswordStrength password={password} />
            </div>

            <div>
              <label style={s.label}>Wachtwoord bevestigen</label>
              <div style={s.inputWrap}>
                <Lock size={15} color={confirm && confirm !== password ? '#ef4444' : '#475569'} style={s.inputIcon} />
                <input type="password" autoComplete="new-password" placeholder="Herhaal wachtwoord" value={confirm} onChange={e => setConfirm(e.target.value)} style={{ ...s.input, borderColor: confirm && confirm !== password ? '#ef444466' : '#334155' }} />
              </div>
            </div>

            {error && <ErrorBanner message={error} />}

            <button type="submit" disabled={loading} style={{ ...s.btn, opacity: loading ? 0.65 : 1 }}>
              {loading ? 'Account aanmaken…' : <>Verder <ChevronRight size={16} /></>}
            </button>

            <p style={s.switchLink}>Al een account? <a href="/login" style={s.link}>Inloggen</a></p>
          </form>
        )}

        {/* ── STEP 1: Name ── */}
        {step === 1 && (
          <form onSubmit={handleName} style={s.form}>
            <div style={s.stepHeader}>
              <div style={s.stepLabel}>Stap 2 van 3</div>
              <h2 style={s.stepTitle}>Jouw naam</h2>
              <p style={s.stepSubtitle}>Zo herkennen coaches en teamgenoten je.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={s.label}>Voornaam</label>
                <div style={s.inputWrap}>
                  <User size={15} color="#475569" style={s.inputIcon} />
                  <input placeholder="Emma" value={firstName} onChange={e => setFirstName(e.target.value)} style={s.input} autoFocus />
                </div>
              </div>
              <div>
                <label style={s.label}>Achternaam</label>
                <input placeholder="De Smet" value={lastName} onChange={e => setLastName(e.target.value)} style={{ ...s.input, paddingLeft: '12px' }} />
              </div>
            </div>

            {error && <ErrorBanner message={error} />}

            <button type="submit" disabled={loading} style={{ ...s.btn, opacity: loading ? 0.65 : 1 }}>
              {loading ? 'Opslaan…' : <>Verder <ChevronRight size={16} /></>}
            </button>
          </form>
        )}

        {/* ── STEP 2: Done ── */}
        {step === 2 && (
          <div style={{ ...s.form, textAlign: 'center' }}>
            <div style={{ width: '72px', height: '72px', borderRadius: '50%', backgroundColor: '#22c55e22', border: '2px solid #22c55e44', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <CheckCircle2 size={36} color="#22c55e" />
            </div>
            <h2 style={{ ...s.stepTitle, marginBottom: '8px' }}>Welkom, {firstName}! 👋</h2>
            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px', lineHeight: 1.6 }}>
              Je account is aangemaakt. Verifieer je e-mailadres en je kunt daarna een club aanvragen via de app.
            </p>
            <p style={{ fontSize: '12px', color: '#475569', marginBottom: '24px', lineHeight: 1.6 }}>
              📬 Check je inbox voor de verificatielink.
            </p>
            <button onClick={async () => {
              const currentUid = AuthFactory.getCurrentUser()?.uid;
              if (currentUid) {
                try { await UserFactory.updateProfile(currentUid, { registrationDone: true }); } catch (_) {}
              }
              router.replace('/verify-email');
            }} style={s.btn}>
              Naar de app <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function getFriendlyError(code) {
  switch (code) {
    case 'auth/email-already-in-use':  return 'Dit e-mailadres is al in gebruik. Probeer in te loggen.';
    case 'auth/invalid-email':          return 'Ongeldig e-mailadres.';
    case 'auth/weak-password':          return 'Wachtwoord is te zwak. Gebruik minimaal 8 tekens.';
    case 'auth/network-request-failed': return 'Geen internetverbinding. Controleer je verbinding.';
    default:                            return 'Er ging iets mis. Probeer het opnieuw.';
  }
}

const css = `
  * { box-sizing: border-box; }
  input:-webkit-autofill, textarea:-webkit-autofill {
    -webkit-box-shadow: 0 0 0 100px #0f172a inset !important;
    -webkit-text-fill-color: white !important;
  }
`;

const s = {
  page:       { minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', fontFamily: 'system-ui, sans-serif' },
  card:       { width: '100%', maxWidth: '420px', backgroundColor: '#1e293b', borderRadius: '20px', padding: '36px 28px', border: '1px solid #334155', boxShadow: '0 24px 48px rgba(0,0,0,0.4)' },
  logo:       { width: '48px', height: '48px', borderRadius: '14px', backgroundColor: '#0f172a', border: '1px solid #334155', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' },
  title:      { fontSize: '22px', fontWeight: '800', color: '#f1f5f9', margin: '0 0 4px', letterSpacing: '-0.3px' },
  form:       { display: 'flex', flexDirection: 'column', gap: '16px' },
  stepHeader: { marginBottom: '4px' },
  stepLabel:  { fontSize: '11px', color: '#475569', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' },
  stepTitle:  { fontSize: '18px', fontWeight: '800', color: '#f1f5f9', margin: '0 0 2px' },
  stepSubtitle: { fontSize: '13px', color: '#64748b', margin: 0 },
  label:      { display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' },
  inputWrap:  { position: 'relative' },
  inputIcon:  { position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' },
  input:      { width: '100%', padding: '11px 11px 11px 38px', borderRadius: '10px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px', outline: 'none', fontFamily: 'inherit' },
  btn:        { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '13px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '10px', color: 'white', fontWeight: '700', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity 0.15s' },
  switchLink: { textAlign: 'center', fontSize: '13px', color: '#64748b', margin: 0 },
  link:       { color: '#3b82f6', textDecoration: 'none', fontWeight: '600' },
};
