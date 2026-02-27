import React, { useState, useEffect } from 'react';
import { db, rtdb } from '../firebaseConfig';
import { 
  collection, doc, setDoc, getDocs, 
  serverTimestamp, deleteDoc, query, where 
} from "firebase/firestore";
import { ref, remove } from "firebase/database";
import { 
  ShieldAlert, UserPlus, Building2, Users, 
  Trash2, Database, PlusCircle, UserCheck, X, Save
} from 'lucide-react';

export default function SuperAdmin() {
  const [activeTab, setActiveTab] = useState('users');
  const [message, setMessage] = useState(null);
  
  // Data lists
  const [availableUsers, setAvailableUsers] = useState([]);
  const [availableClubs, setAvailableClubs] = useState([]);
  const [availableGroups, setAvailableGroups] = useState([]);
  const [groupMemberCounts, setGroupMemberCounts] = useState({});

  // Modal State
  const [selectedGroupForMembers, setSelectedGroupForMembers] = useState(null);
  const [membersOfSelectedGroup, setMembersOfSelectedGroup] = useState([]);

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
      const usersData = uSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAvailableUsers(usersData);

      const cSnap = await getDocs(collection(db, "clubs"));
      setAvailableClubs(cSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const gSnap = await getDocs(collection(db, "groups"));
      const groupsData = gSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAvailableGroups(groupsData);

      // Haal ledentelling op voor alle groepen
      const counts = {};
      for (const group of groupsData) {
        const mSnap = await getDocs(collection(db, `groups/${group.id}/members`));
        counts[group.id] = mSnap.size;
      }
      setGroupMemberCounts(counts);

    } catch (e) { console.error("Fout bij laden data:", e); }
  };

  useEffect(() => { refreshData(); }, [activeTab]);

  // Open de modal en laad leden
  const openMemberModal = async (group) => {
    setSelectedGroupForMembers(group);
    const mSnap = await getDocs(collection(db, `groups/${group.id}/members`));
    setMembersOfSelectedGroup(mSnap.docs.map(d => d.id)); // We slaan enkel de UserID's op
  };

  const toggleMemberInGroup = async (userId) => {
    const groupId = selectedGroupForMembers.id;
    const memberRef = doc(db, `groups/${groupId}/members`, userId);

    try {
      if (membersOfSelectedGroup.includes(userId)) {
        await deleteDoc(memberRef);
        setMembersOfSelectedGroup(prev => prev.filter(id => id !== userId));
      } else {
        await setDoc(memberRef, {
          joinedAt: serverTimestamp(),
          isSkipper: true,
          isCoach: false
        });
        setMembersOfSelectedGroup(prev => [...prev, userId]);
      }
      refreshData();
    } catch (e) { notify("Fout bij bijwerken lidmaatschap"); }
  };

  // --- HANDLERS ---
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
      await setDoc(doc(collection(db, "clubs")), { ...clubForm, startDate: serverTimestamp() });
      setClubForm({ name: '', logoUrl: '' });
      refreshData();
    } catch (e) { notify("Fout: " + e.message); }
  };

  const handleCreateGroup = async () => {
    if (!groupForm.clubId || !groupForm.name) return notify("Vul alle velden in.");
    try {
      await setDoc(doc(collection(db, "groups")), { ...groupForm, startDate: serverTimestamp() });
      setGroupForm({ name: '', clubId: '', useHRM: true });
      refreshData();
    } catch (e) { notify("Fout: " + e.message); }
  };

  const handleDelete = async (col, id) => {
    if (!window.confirm("Zeker weten?")) return;
    await deleteDoc(doc(db, col, id));
    refreshData();
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ShieldAlert size={28} style={{ color: '#ef4444' }} />
          <h1 style={styles.title}>SuperAdmin</h1>
        </div>
        <div style={styles.badge}>Data Engine v2</div>
      </div>

      {message && <div style={styles.alert}>{message}</div>}

      <div style={styles.tabBar}>
        <button onClick={() => setActiveTab('users')} style={tabButtonStyle(activeTab === 'users')}><UserPlus size={18} /> Gebruikers</button>
        <button onClick={() => setActiveTab('clubs')} style={tabButtonStyle(activeTab === 'clubs')}><Building2 size={18} /> Clubs & Groepen</button>
        <button onClick={() => setActiveTab('system')} style={tabButtonStyle(activeTab === 'system')}><Database size={18} /> Systeem</button>
      </div>

      <div style={styles.contentCard}>
        {activeTab === 'users' && (
          <div>
            <h2 style={styles.sectionTitle}>Nieuwe Gebruiker</h2>
            <form onSubmit={handleCreateUser} style={styles.formGrid}>
              <input style={styles.input} placeholder="Voornaam" value={userForm.firstName} onChange={e => setUserForm({...userForm, firstName: e.target.value})} required />
              <input style={styles.input} placeholder="Achternaam" value={userForm.lastName} onChange={e => setUserForm({...userForm, lastName: e.target.value})} required />
              <input style={styles.input} placeholder="Email" type="email" value={userForm.email} onChange={e => setUserForm({...userForm, email: e.target.value})} required />
              <select style={styles.input} value={userForm.role} onChange={e => setUserForm({...userForm, role: e.target.value})}>
                <option value="user">Skipper</option>
                <option value="coach">Coach</option>
                <option value="admin">Admin</option>
              </select>
              <button type="submit" style={styles.primaryBtn}><PlusCircle size={18} /> Gebruiker Opslaan</button>
            </form>
            <div style={{marginTop: '30px'}}>
              {availableUsers.map(user => (
                <div key={user.id} style={styles.listItem}>
                  <span>{user.firstName} {user.lastName} <span style={styles.roleTag}>{user.role}</span></span>
                  <button onClick={() => handleDelete("users", user.id)} style={styles.iconBtn}><Trash2 size={16} color="#ef4444" /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'clubs' && (
          <div style={styles.dualGrid}>
            <div style={styles.subCard}>
              <h2 style={styles.sectionTitle}><Building2 size={18} /> Clubs</h2>
              <input style={styles.input} placeholder="Clubnaam" value={clubForm.name} onChange={e => setClubForm({...clubForm, name: e.target.value})} />
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
              <h2 style={styles.sectionTitle}><Users size={18} /> Groepen</h2>
              <select style={styles.input} value={groupForm.clubId} onChange={e => setGroupForm({...groupForm, clubId: e.target.value})}>
                <option value="">Selecteer club...</option>
                {availableClubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input style={styles.input} placeholder="Groepsnaam" value={groupForm.name} onChange={e => setGroupForm({...groupForm, name: e.target.value})} />
              <button onClick={handleCreateGroup} style={styles.primaryBtn}>Groep Opslaan</button>
              <div style={{marginTop: '20px'}}>
                {availableGroups.map(g => (
                  <div key={g.id} style={styles.miniListItem}>
                    <div>
                      <strong>{g.name}</strong>
                      <div style={{fontSize: '11px', color: '#3b82f6'}}>{groupMemberCounts[g.id] || 0} leden</div>
                    </div>
                    <div style={{display: 'flex', gap: '8px'}}>
                      <button onClick={() => openMemberModal(g)} style={{...styles.iconBtn, color: '#3b82f6'}}><UserCheck size={16} /></button>
                      <button onClick={() => handleDelete("groups", g.id)} style={styles.iconBtn}><Trash2 size={14} color="#ef4444" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'system' && (
          <div>
            <h2 style={styles.sectionTitle}>Systeem Onderhoud</h2>
            <button onClick={() => remove(ref(rtdb, 'live_sessions')).then(() => notify("RTDB gewist."))} style={styles.dangerBtn}><Trash2 size={18} /> Reset Live Sessies</button>
          </div>
        )}
      </div>

      {/* MEMBER MODAL */}
      {selectedGroupForMembers && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h3>Leden beheren: {selectedGroupForMembers.name}</h3>
              <button onClick={() => setSelectedGroupForMembers(null)} style={styles.iconBtn}><X size={24} color="white" /></button>
            </div>
            <div style={styles.modalBody}>
              <p style={{fontSize: '13px', color: '#94a3b8', marginBottom: '15px'}}>Klik op een gebruiker om deze toe te voegen of te verwijderen uit de groep.</p>
              <div style={styles.memberGrid}>
                {availableUsers.map(user => {
                  const isMember = membersOfSelectedGroup.includes(user.id);
                  return (
                    <div 
                      key={user.id} 
                      onClick={() => toggleMemberInGroup(user.id)}
                      style={{
                        ...styles.memberItem,
                        borderColor: isMember ? '#3b82f6' : '#334155',
                        backgroundColor: isMember ? '#3b82f620' : '#0f172a'
                      }}
                    >
                      <span>{user.firstName} {user.lastName}</span>
                      {isMember && <UserCheck size={16} color="#3b82f6" />}
                    </div>
                  );
                })}
              </div>
            </div>
            <button onClick={() => setSelectedGroupForMembers(null)} style={{...styles.primaryBtn, marginTop: '20px'}}>Sluiten</button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- STYLES (Aangepast aan jouw dashboard vibe) ---
const tabButtonStyle = (isActive) => ({
  display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px',
  backgroundColor: isActive ? '#3b82f6' : 'transparent',
  color: isActive ? 'white' : '#94a3b8',
  border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '14px'
});

const styles = {
  page: { backgroundColor: '#0f172a', minHeight: '100vh', color: '#f8fafc', padding: '40px 20px', fontFamily: 'ui-sans-serif, system-ui' },
  header: { maxWidth: '1000px', margin: '0 auto 40px auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: '24px', fontWeight: '800', margin: 0 },
  badge: { backgroundColor: '#1e293b', padding: '6px 12px', borderRadius: '99px', fontSize: '11px', color: '#3b82f6', border: '1px solid #334155' },
  tabBar: { maxWidth: '1000px', margin: '0 auto 20px auto', display: 'flex', gap: '10px', backgroundColor: '#1e293b', padding: '6px', borderRadius: '14px' },
  contentCard: { maxWidth: '1000px', margin: '0 auto', backgroundColor: '#1e293b', borderRadius: '16px', padding: '32px', border: '1px solid #334155' },
  sectionTitle: { fontSize: '18px', fontWeight: '700', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' },
  dualGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' },
  subCard: { backgroundColor: '#0f172a', padding: '24px', borderRadius: '12px', border: '1px solid #334155' },
  input: { padding: '12px', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: 'white', width: '100%', boxSizing: 'border-box', marginBottom: '10px' },
  primaryBtn: { backgroundColor: '#3b82f6', color: 'white', padding: '12px', borderRadius: '8px', border: 'none', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', width: '100%' },
  dangerBtn: { backgroundColor: '#ef444415', color: '#ef4444', padding: '12px 24px', borderRadius: '8px', border: '1px solid #ef4444', cursor: 'pointer', display: 'flex', gap: '8px' },
  alert: { maxWidth: '1000px', margin: '0 auto 20px auto', backgroundColor: '#064e3b', color: '#6ee7b7', padding: '12px', borderRadius: '8px' },
  listItem: { display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: '#0f172a', borderRadius: '8px', marginBottom: '8px', border: '1px solid #334155' },
  miniListItem: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1e293b' },
  roleTag: { fontSize: '10px', backgroundColor: '#334155', padding: '2px 6px', borderRadius: '4px', marginLeft: '10px' },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' },
  
  // Modal Styles
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalCard: { backgroundColor: '#1e293b', width: '500px', padding: '30px', borderRadius: '20px', border: '1px solid #334155' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  modalBody: { maxHeight: '400px', overflowY: 'auto' },
  memberGrid: { display: 'grid', gridTemplateColumns: '1fr', gap: '10px' },
  memberItem: { padding: '12px', borderRadius: '10px', border: '1px solid #334155', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', transition: '0.2s' }
};
