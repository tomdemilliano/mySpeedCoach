import React, { useState, useEffect } from 'react';
import { db, rtdb } from '../firebaseConfig';
import { 
  collection, doc, setDoc, getDocs, 
  serverTimestamp, deleteDoc 
} from "firebase/firestore";
import { ref, remove } from "firebase/database";
import { 
  ShieldAlert, UserPlus, Building2, Users, 
  Trash2, Database, PlusCircle, Link as LinkIcon 
} from 'lucide-react';

export default function SuperAdmin() {
  const [activeTab, setActiveTab] = useState('users');
  const [message, setMessage] = useState(null);
  
  // Data lists
  const [availableUsers, setAvailableUsers] = useState([]);
  const [availableClubs, setAvailableClubs] = useState([]);
  const [availableGroups, setAvailableGroups] = useState([]);

  // Form states
  const [userForm, setUserForm] = useState({ firstName: '', lastName: '', email: '', role: 'user' });
  const [clubForm, setClubForm] = useState({ name: '', logoUrl: '' });
  const [groupForm, setGroupForm] = useState({ name: '', clubId: '', useHRM: true });

  const notify = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 4000);
  };

  const refreshData = async () => {
    try {
      const uSnap = await getDocs(collection(db, "users"));
      setAvailableUsers(uSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const cSnap = await getDocs(collection(db, "clubs"));
      const clubsData = cSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAvailableClubs(clubsData);

      const gSnap = await getDocs(collection(db, "groups"));
      setAvailableGroups(gSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("Fout bij laden data:", e);
    }
  };

  useEffect(() => {
    refreshData();
  }, [activeTab]);

  // --- ACTIONS ---

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      const newUserRef = doc(collection(db, "users"));
      await setDoc(newUserRef, { ...userForm, createdAt: serverTimestamp() });
      notify(`User '${userForm.firstName}' toegevoegd.`);
      setUserForm({ firstName: '', lastName: '', email: '', role: 'user' });
      refreshData();
    } catch (e) { notify("Fout: " + e.message); }
  };

  const handleCreateClub = async () => {
    if (!clubForm.name) return notify("Clubnaam is verplicht!");
    try {
      const newClubRef = doc(collection(db, "clubs"));
      await setDoc(newClubRef, { ...clubForm, startDate: serverTimestamp() });
      notify("Club aangemaakt!");
      setClubForm({ name: '', logoUrl: '' });
      refreshData();
    } catch (e) { notify("Fout: " + e.message); }
  };

  const handleCreateGroup = async () => {
    if (!groupForm.clubId || !groupForm.name) return notify("Selecteer een club en geef een groepsnaam op.");
    try {
      const newGroupRef = doc(collection(db, "groups"));
      await setDoc(newGroupRef, { ...groupForm, startDate: serverTimestamp() });
      notify("Groep aangemaakt!");
      setGroupForm({ name: '', clubId: '', useHRM: true });
      refreshData();
    } catch (e) { notify("Fout: " + e.message); }
  };

  const handleDelete = async (collectionName, id) => {
    if (!window.confirm("Weet je zeker dat je dit wilt verwijderen?")) return;
    try {
      await deleteDoc(doc(db, collectionName, id));
      notify("Item verwijderd.");
      refreshData();
    } catch (e) { notify("Fout: " + e.message); }
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ShieldAlert size={28} style={{ color: '#ef4444' }} />
          <h1 style={styles.title}>SuperAdmin</h1>
        </div>
        <div style={styles.badge}>Master Database Control</div>
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
        
        {/* USERS TAB */}
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

            <h2 style={{...styles.sectionTitle, marginTop: '40px'}}>Bestaande Gebruikers</h2>
            <div style={styles.listContainer}>
              {availableUsers.map(user => (
                <div key={user.id} style={styles.listItem}>
                  <div>
                    <span style={{ fontWeight: '700' }}>{user.firstName} {user.lastName}</span>
                    <span style={{ color: '#64748b', marginLeft: '10px', fontSize: '13px' }}>{user.email}</span>
                    <span style={styles.roleTag}>{user.role}</span>
                  </div>
                  <button onClick={() => handleDelete("users", user.id)} style={styles.iconBtn}>
                    <Trash2 size={16} color="#ef4444" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CLUBS & GROUPS TAB */}
        {activeTab === 'clubs' && (
          <div style={styles.dualGrid}>
            <div style={styles.subCard}>
              <h2 style={styles.sectionTitle}><Building2 size={18} /> Club Beheer</h2>
              <input style={styles.input} placeholder="Clubnaam" value={clubForm.name} onChange={e => setClubForm({...clubForm, name: e.target.value})} />
              <input style={styles.input} placeholder="Logo URL" value={clubForm.logoUrl} onChange={e => setClubForm({...clubForm, logoUrl: e.target.value})} />
              <button onClick={handleCreateClub} style={styles.primaryBtn}>Club Opslaan</button>
              
              <div style={{marginTop: '20px'}}>
                {availableClubs.map(c => (
                  <div key={c.id} style={styles.miniListItem}>
                    <span>{c.name}</span>
                    <button onClick={() => handleDelete("clubs", c.id)} style={styles.iconBtn}><Trash2 size={14} color="#ef4444" /></button>
                  </div>
                ))}
              </div>
            </div>

            <div style={styles.subCard}>
              <h2 style={styles.sectionTitle}><Users size={18} /> Groep Beheer</h2>
              <select style={styles.input} value={groupForm.clubId} onChange={e => setGroupForm({...groupForm, clubId: e.target.value})}>
                <option value="">Kies een club...</option>
                {availableClubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input style={styles.input} placeholder="Groepsnaam" value={groupForm.name} onChange={e => setGroupForm({...groupForm, name: e.target.value})} />
              <button onClick={handleCreateGroup} style={styles.primaryBtn}>Groep Opslaan</button>
              
              <div style={{marginTop: '20px'}}>
                {availableGroups.map(g => (
                  <div key={g.id} style={styles.miniListItem}>
                    <div>
                      <div>{g.name}</div>
                      <div style={{fontSize: '10px', color: '#475569'}}>{availableClubs.find(c => c.id === g.clubId)?.name}</div>
                    </div>
                    <button onClick={() => handleDelete("groups", g.id)} style={styles.iconBtn}><Trash2 size={14} color="#ef4444" /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SYSTEM TAB */}
        {activeTab === 'system' && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Database Onderhoud</h2>
            <p style={{ color: '#94a3b8', marginBottom: '20px', fontSize: '14px' }}>
              Reset de Realtime Database bij synchronisatieproblemen. Dit verwijdert alle huidige <code>live_sessions</code>.
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

// --- STYLES ---
const tabButtonStyle = (isActive) => ({
  display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px',
  backgroundColor: isActive ? '#3b82f6' : 'transparent',
  color: isActive ? 'white' : '#94a3b8',
  border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', transition: 'all 0.2s ease',
});

const styles = {
  page: { backgroundColor: '#0f172a', minHeight: '100vh', color: '#f8fafc', padding: '40px 20px', fontFamily: 'ui-sans-serif, system-ui, sans-serif' },
  header: { maxWidth: '1000px', margin: '0 auto 40px auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: '24px', fontWeight: '800', margin: 0 },
  badge: { backgroundColor: '#1e293b', padding: '6px 12px', borderRadius: '99px', fontSize: '11px', color: '#3b82f6', fontWeight: 'bold', border: '1px solid #334155', textTransform: 'uppercase' },
  tabBar: { maxWidth: '1000px', margin: '0 auto 20px auto', display: 'flex', gap: '10px', backgroundColor: '#1e293b', padding: '6px', borderRadius: '14px', border: '1px solid #334155' },
  contentCard: { maxWidth: '1000px', margin: '0 auto', backgroundColor: '#1e293b', borderRadius: '16px', padding: '32px', border: '1px solid #334155' },
  sectionTitle: { fontSize: '18px', fontWeight: '700', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' },
  dualGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' },
  subCard: { backgroundColor: '#0f172a', padding: '24px', borderRadius: '12px', border: '1px solid #334155' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' },
  input: { padding: '12px', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: 'white', fontSize: '15px', width: '100%', boxSizing: 'border-box', marginBottom: '10px' },
  primaryBtn: { gridColumn: 'span 2', backgroundColor: '#3b82f6', color: 'white', padding: '12px', borderRadius: '8px', border: 'none', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' },
  dangerBtn: { backgroundColor: '#ef444415', color: '#ef4444', padding: '12px 24px', borderRadius: '8px', border: '1px solid #ef4444', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' },
  alert: { maxWidth: '1000px', margin: '0 auto 20px auto', backgroundColor: '#064e3b', color: '#6ee7b7', padding: '12px 20px', borderRadius: '8px', borderLeft: '4px solid #10b981' },
  listContainer: { display: 'flex', flexDirection: 'column', gap: '10px' },
  listItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: '#0f172a', borderRadius: '10px', border: '1px solid #334155' },
  miniListItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #1e293b' },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer' },
  roleTag: { fontSize: '10px', backgroundColor: '#334155', padding: '2px 8px', borderRadius: '4px', marginLeft: '10px', color: '#94a3b8', textTransform: 'uppercase' }
};
