import { useRouter } from 'next/router';
import { useState } from 'react';
import { AuthFactory } from '../constants/dbSchema';
import { Zap, Mail, Lock, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const redirectAfterLogin = () => {
    const next = router.query.next || '/';
    router.replace(next);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) { setError('Vul je e-mail en wachtwoord in.'); return; }
    setLoading(true);
    try {
      await AuthFactory.signInWithEmail(email.trim(), password);
      redirectAfterLogin();
    } catch (err) {
      setError(getFriendlyError(err.code));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      await AuthFactory.signInWithGoogle();
      redirectAfterLogin();
    } catch (err) {
      // User closed the popup — not an error worth showing
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(getFriendlyError(err.code));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.page}>
      <style>{css}</style>

      <div style={s.card}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={s.logo}>
            <Zap size={28} color="#3b82f6" />
          </div>
          <h1 style={s.title}>MySpeedCoach</h1>
          <p style={s.subtitle}>Log in om verder te gaan</p>
        </div>

        {/* Google button */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          style={{ ...s.googleBtn, opacity: loading ? 0.65 : 1 }}
        >
          <GoogleIcon />
          Doorgaan met Google
        </button>

        {/* Divider */}
        <div style={s.divider}>
          <div style={s.dividerLine} />
          <span style={s.dividerLabel}>of</span>
          <div style={s.dividerLine} />
        </div>

        {/* Email + password form */}
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={s.label}>E-mailadres</label>
            <div style={s.inputWrap}>
              <Mail size={16} color="#475569" style={s.inputIcon} />
              <input
                type="email"
                autoComplete="email"
                placeholder="jouw@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={s.input}
                autoFocus
              />
            </div>
          </div>

          <div>
            <label style={s.label}>Wachtwoord</label>
            <div style={s.inputWrap}>
              <Lock size={16} color="#475569" style={s.inputIcon} />
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={s.input}
              />
            </div>
          </div>

          {error && (
            <div style={s.errorBanner}>
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ ...s.btn, opacity: loading ? 0.65 : 1 }}
          >
            {loading ? 'Inloggen…' : 'Inloggen'}
          </button>
        </form>

        {/* Forgot password — added in Feature 9.4 */}

        {/* Register link */}
        <p style={{ textAlign: 'center', fontSize: '13px', color: '#64748b', marginTop: '16px' }}>
          Nog geen account?{' '}
          <a href="/register" style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: '600' }}>Account aanmaken</a>
        </p>
        {/* Register — added in Feature 9.2 */}
      </div>
    </div>
  );
}

// ─── Google icon SVG ──────────────────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

// ─── Error mapping ────────────────────────────────────────────────────────────
function getFriendlyError(code) {
  switch (code) {
    case 'auth/invalid-email':
      return 'Ongeldig e-mailadres.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'E-mail of wachtwoord is onjuist.';
    case 'auth/too-many-requests':
      return 'Te veel pogingen. Probeer het later opnieuw.';
    case 'auth/user-disabled':
      return 'Dit account is uitgeschakeld.';
    case 'auth/network-request-failed':
      return 'Geen internetverbinding. Controleer je verbinding.';
    case 'auth/popup-blocked':
      return 'Pop-up geblokkeerd door de browser. Sta pop-ups toe en probeer opnieuw.';
    default:
      return 'Inloggen mislukt. Probeer het opnieuw.';
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const css = `
  * { box-sizing: border-box; }
  input:-webkit-autofill {
    -webkit-box-shadow: 0 0 0 100px #0f172a inset !important;
    -webkit-text-fill-color: white !important;
  }
`;

const s = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#0f172a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    fontFamily: 'system-ui, sans-serif',
  },
  card: {
    width: '100%',
    maxWidth: '400px',
    backgroundColor: '#1e293b',
    borderRadius: '20px',
    padding: '36px 28px',
    border: '1px solid #334155',
    boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
  },
  logo: {
    width: '56px',
    height: '56px',
    borderRadius: '16px',
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px',
  },
  title: {
    fontSize: '24px',
    fontWeight: '800',
    color: '#f1f5f9',
    margin: '0 0 6px',
    letterSpacing: '-0.3px',
  },
  subtitle: {
    fontSize: '14px',
    color: '#64748b',
    margin: 0,
  },
  googleBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '12px',
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '10px',
    color: '#f1f5f9',
    fontWeight: '600',
    fontSize: '14px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'border-color 0.15s, opacity 0.15s',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    margin: '20px 0',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    backgroundColor: '#334155',
  },
  dividerLabel: {
    fontSize: '12px',
    color: '#475569',
    fontWeight: '600',
  },
  label: {
    display: 'block',
    fontSize: '12px',
    fontWeight: '600',
    color: '#64748b',
    marginBottom: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  },
  inputWrap: {
    position: 'relative',
  },
  inputIcon: {
    position: 'absolute',
    left: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    pointerEvents: 'none',
  },
  input: {
    width: '100%',
    padding: '12px 12px 12px 40px',
    borderRadius: '10px',
    border: '1px solid #334155',
    backgroundColor: '#0f172a',
    color: 'white',
    fontSize: '15px',
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#ef444422',
    color: '#ef4444',
    fontSize: '13px',
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #ef444433',
  },
  btn: {
    width: '100%',
    padding: '13px',
    backgroundColor: '#3b82f6',
    border: 'none',
    borderRadius: '10px',
    color: 'white',
    fontWeight: '700',
    fontSize: '15px',
    cursor: 'pointer',
    marginTop: '4px',
    fontFamily: 'inherit',
    transition: 'opacity 0.15s',
  },
};
