import React, { useState, useEffect } from 'react';
import { db, rtdb } from '../firebaseConfig';
import { 
  collection, doc, setDoc, getDocs, 
  serverTimestamp 
} from "firebase/firestore";
import { ref, remove } from "firebase/database";
import { 
  ShieldAlert, UserPlus, Building2, Users, 
  Trash2, Database, LayoutDashboard, PlusCircle
} from 'lucide-react';

export default function SuperAdmin() {
  const [activeTab, setActiveTab] = useState('users');
  const [message, setMessage] = useState(null);
  const [availableClubs, setAvailableClubs] = useState([]);

  // Form states
  const [userForm, setUserForm] = useState({ firstName: '', lastName: '', email: '', role: 'user' });
  const [clubForm, setClubForm] = useState({ name: '', logoUrl: '' });
  const [groupForm, setGroupForm] = useState({ name: '', clubId: '', useHRM: true });

  const notify = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 4000);
  };

  useEffect(() => {
    const fetchClubs = async () => {
      try {
        const snap = await getDocs(collection(db, "clubs"));
        setAvailableClubs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error("Fout bij laden clubs:", e); }
    };
    fetchClubs();
  }, [activeTab]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      const newUserRef = doc(collection(db, "users"));
      await setDoc(newUserRef, { ...userForm, createdAt: serverTimestamp() });
      notify(`User '${userForm.firstName}' toegevoegd.`);
      setUserForm({ firstName: '', lastName: '', email: '', role: 'user' });
    } catch (e) { notify("Fout: " + e.message); }
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ShieldAlert size={28} className="text-red-500" style={{ color: '#ef4444' }} />
          <h1 style={styles.title}>SuperAdmin</h1>
        </div>
        <div style={styles.badge}>Systeembeheer</div>
      </div>

      {message && <div style={styles.alert}>{message}</div>}

      {/* Tabs Menu */}
      <div style={styles.tabBar}>
        <button onClick={() => setActiveTab('users')} style={tabButtonStyle(activeTab === 'users')}>
          <UserPlus size={18} /> Gebruikers
        </button>
        <button onClick={() => setActiveTab('clubs')} style={tabButtonStyle(activeTab === 'clubs')}>
          <Building2 size={18} /> Clubs & Groepen
        </button>
        <button onClick={() => setActiveTab('system')} style={tabButtonStyle(activeTab === 'system')}>
          <Database size={18} /> Systeem
        </button>
      </div>

      {/* Content Area */}
      <div style={styles.contentCard}>
        {activeTab === 'users' && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Nieuwe Gebruiker Toevoegen</h2>
            <form onSubmit={handleCreateUser} style={styles.formGrid}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Voornaam</label>
                <input style={styles.input} value={userForm.firstName} onChange={e => setUserForm({...userForm, firstName: e.target.value})} required />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Achternaam</label>
                <input style={styles.input} value={userForm.lastName} onChange={e => setUserForm({...userForm, lastName: e.target.value})} required />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>E-mailadres</label>
                <input style={styles.input} type="email" value={userForm.email} onChange={e => setUserForm({...userForm, email: e.target.value})} required />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Rol</label>
                <select style={styles.input} value={userForm.role} onChange={e => setUserForm({...userForm, role: e.target.value})}>
                  <option value="user">Skipper</option>
                  <option value="coach">Coach</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button type="submit" style={styles.primaryBtn}>
                <PlusCircle size={18} /> Gebruiker Opslaan
              </button>
            </form>
          </div>
        )}

        {activeTab === 'clubs' && (
          <div style={styles.dualGrid}>
            <div style={styles.subCard}>
              <h2 style={styles.sectionTitle}>Club Toevoegen</h2>
              <input style={styles.input} placeholder="Naam van de club" />
              <button style={styles.primaryBtn}>Club Opslaan</button>
            </div>
            <div style={styles.subCard}>
              <h2 style={styles.sectionTitle}>Groep Toevoegen</h2>
              <select style={styles.input}>
                <option>Kies een club...</option>
                {availableClubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input style={styles.input} placeholder="Naam van de groep" />
              <button style={styles.primaryBtn}>Groep Opslaan</button>
            </div>
          </div>
        )}

        {activeTab === 'system' && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Database Onderhoud</h2>
            <p style={{ color: '#94a3b8', marginBottom: '20px' }}>
              Deze actie verwijdert alle actieve sessies uit de Realtime Database. Gebruik dit alleen bij synchronisatiefouten.
            </p>
            <button 
              onClick={() => remove(ref(rtdb, 'live_sessions')).then(() => notify("RTDB live data gewist."))}
              style={styles.dangerBtn}
            >
              <Trash2 size={18} /> Reset Live Sessies
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// --- STYLING (Aangepast aan dashboard.js & index.js vibe) ---
const tabButtonStyle = (isActive) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '12px 20px',
  backgroundColor: isActive ? '#3b82f6' : 'transparent',
  color: isActive ? 'white' : '#94a3b8',
  border: 'none',
  borderRadius: '10px',
  cursor: 'pointer',
  fontWeight: '600',
  fontSize: '14px',
  transition: 'all 0.2s ease',
});

const styles = {
  page: {
    backgroundColor: '#0f172a',
    minHeight: '100vh',
    color: '#f8fafc',
    padding: '40px 20px',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  header: {
    maxWidth: '1000px',
    margin: '0 auto 40px auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: '24px', fontWeight: '800', margin: 0, letterSpacing: '-0.025em' },
  badge: { backgroundColor: '#1e293b', padding: '6px 12px', borderRadius: '99px', fontSize: '12px', color: '#3b82f6', fontWeight: 'bold', border: '1px solid #334155' },
  tabBar: {
    maxWidth: '1000px',
    margin: '0 auto 20px auto',
    display: 'flex',
    gap: '10px',
    backgroundColor: '#1e293b',
    padding: '6px',
    borderRadius: '14px',
    border: '1px solid #334155',
  },
  contentCard: {
    maxWidth: '1000px',
    margin: '0 auto',
    backgroundColor: '#1e293b',
    borderRadius: '16px',
    padding: '32px',
    border: '1px solid #334155',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
  },
  section: { width: '100%' },
  sectionTitle: { fontSize: '18px', fontWeight: '700', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' },
  dualGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' },
  subCard: { backgroundColor: '#0f172a', padding: '24px', borderRadius: '12px', border: '1px solid #334155' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontSize: '12px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: {
    padding: '12px 16px',
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '8px',
    color: 'white',
    fontSize: '15px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    marginBottom: '15px'
  },
  primaryBtn: {
    gridColumn: 'span 2',
    backgroundColor: '#3b82f6',
    color: 'white',
    padding: '14px',
    borderRadius: '8px',
    border: 'none',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    transition: 'background 0.2s',
  },
  dangerBtn: {
    backgroundColor: '#ef444415',
    color: '#ef4444',
    padding: '12px 24px',
    borderRadius: '8px',
    border: '1px solid #ef4444',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  alert: {
    maxWidth: '1000px',
    margin: '0 auto 20px auto',
    backgroundColor: '#064e3b',
    color: '#6ee7b7',
    padding: '12px 20px',
    borderRadius: '8px',
    borderLeft: '4px solid #10b981',
    fontSize: '14px'
  }
};
