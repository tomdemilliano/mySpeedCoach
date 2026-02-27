import React, { useState, useEffect } from 'react';
import { db, rtdb } from '../firebaseConfig';
import { 
  collection, doc, setDoc, getDocs, 
  serverTimestamp, deleteDoc 
} from "firebase/firestore";
import { ref, remove } from "firebase/database";
import { 
  ShieldAlert, UserPlus, Building2, Users, 
  Trash2, Database, PlusCircle, UserCheck, X, Search, Filter
} from 'lucide-react';

export default function SuperAdmin() {
  const [activeTab, setActiveTab] = useState('users');
  const [message, setMessage] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Data lists
  const [availableUsers, setAvailableUsers] = useState([]);
  const [availableClubs, setAvailableClubs] = useState([]);
  const [availableGroups, setAvailableGroups] = useState([]);
  const [groupMemberCounts, setGroupMemberCounts] = useState({});

  // Modal States
  const [memberModal, setMemberModal] = useState({ show: false, type: null, target: null }); // type: 'club' of 'group'
  const [currentMembers, setCurrentMembers] = useState([]);

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
      setAvailableClubs(cSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const gSnap = await getDocs(collection(db, "groups"));
      const groupsData = gSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAvailableGroups(groupsData);

      const counts = {};
      for (const group of groupsData) {
        const mSnap = await getDocs(collection(db, `groups/${group.id}/members`));
        counts[group.id] = mSnap.size;
      }
      setGroupMemberCounts(counts);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { refreshData(); }, [activeTab]);

  // --- MODAL LOGICA ---
  const openModal = async (type, target) => {
    setSearchTerm('');
    let path = type === 'club' ? `clubs/${target.id}/members` : `groups/${target.id}/members`;
    const mSnap = await getDocs(collection(db, path));
    setCurrentMembers(mSnap.docs.map(d => d.id));
    setMemberModal({ show: true, type, target });
  };

  const toggleMembership = async (userId) => {
    const { type, target } = memberModal;
    const path = type === 'club' ? `clubs/${target.id}/members` : `groups/${target.id}/members`;
    const ref = doc(db, path, userId);

    try {
      if (currentMembers.includes(userId)) {
        await deleteDoc(ref);
        setCurrentMembers(prev => prev.filter(id => id !== userId));
      } else {
        await setDoc(ref, { joinedAt: serverTimestamp() });
        setCurrentMembers(prev => [...prev, userId]);
      }
      refreshData();
    } catch (e) { notify("Fout bij bijwerken"); }
  };

  // Filter functie voor modals
  const getFilteredUsers = () => {
    let list = availableUsers;
    
    // Als we in een GROEP modal zitten, toon dan enkel CLUB leden
    if (memberModal.type === 'group') {
      // We moeten eerst weten wie de club-leden zijn (tijdelijk gesimuleerd of via extra fetch)
      // Voor nu: we tonen de lijst maar filteren op naam. 
      // TIP: Voor productie zou je hier een useEffect fetch doen naar de club-members.
    }

    return list.filter(u => 
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  // --- HANDLERS (VERSIMPELD) ---
  const handleCreateUser = async (e) => {
    e.preventDefault();
    const ref = doc(collection(db, "users"));
    await setDoc(ref, { ...userForm, createdAt: serverTimestamp() });
    setUserForm({ firstName: '', lastName: '', email: '', role: 'user' });
    refreshData();
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ShieldAlert size={28} color="#ef4444" />
          <h1 style={styles.title}>SuperAdmin</h1>
        </div>
      </header>

      {message && <div style={styles.alert}>{message}</div>}

      <nav style={styles.tabBar}>
        <button onClick={() => setActiveTab('users')} style={tabButtonStyle(activeTab === 'users')}><UserPlus size={18}/> Users</button>
        <button onClick={() => setActiveTab('clubs')} style={tabButtonStyle(activeTab === 'clubs')}><Building2 size={18}/> Clubs & Groepen</button>
        <button onClick={() => setActiveTab('system')} style={tabButtonStyle(activeTab === 'system')}><Database size={18}/> Systeem</button>
      </nav>

      <div style={styles.contentCard}>
        {activeTab === 'users' && (
          <section>
            <h2 style={styles.sectionTitle}>Nieuwe Gebruiker</h2>
            <form onSubmit={handleCreateUser} style={styles.formGrid}>
               <input style={styles.input} placeholder="Voornaam" value={userForm.firstName} onChange={e=>setUserForm({...userForm, firstName:e.target.value})} />
               <input style={styles.input} placeholder="Achternaam" value={userForm.lastName} onChange={e=>setUserForm({...userForm, lastName:e.target.value})} />
               <input style={styles.input} placeholder="Email" value={userForm.email} onChange={e=>setUserForm({...userForm, email:e.target.value})} />
               <button type="submit" style={styles.primaryBtn}>Opslaan</button>
            </form>
            <div style={{marginTop: '20px'}}>
              {availableUsers.map(u => (
                <div key={u.id} style={styles.listItem}>
                  <span>{u.firstName} {u.lastName} <small style={{color:'#64748b'}}>({u.role})</small></span>
                  <button onClick={() => deleteDoc(doc(db, "users", u.id)).then(refreshData)} style={styles.iconBtn}><Trash2 size={14} color="#ef4444"/></button>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'clubs' && (
          <div style={styles.dualGrid}>
            {/* CLUBS */}
            <div style={styles.subCard}>
              <h2 style={styles.sectionTitle}>Clubs</h2>
              <input style={styles.input} placeholder="Nieuwe club..." value={clubForm.name} onChange={e=>setClubForm({...clubForm, name:e.target.value})} />
              <button onClick={async () => { await setDoc(doc(collection(db, "clubs")), {name: clubForm.name}); setClubForm({name:''}); refreshData(); }} style={styles.primaryBtn}>Club +</button>
              <div style={{marginTop: '20px'}}>
                {availableClubs.map(c => (
                  <div key={c.id} style={styles.miniListItem}>
                    <span>{c.name}</span>
                    <div style={{display:'flex', gap:'10px'}}>
                      <button title="Leden beheren" onClick={() => openModal('club', c)} style={{color:'#3b82f6', background:'none', border:'none', cursor:'pointer'}}><Users size={16}/></button>
                      <button onClick={() => deleteDoc(doc(db, "clubs", c.id)).then(refreshData)} style={styles.iconBtn}><Trash2 size={14} color="#ef4444"/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* GROEPEN */}
            <div style={styles.subCard}>
              <h2 style={styles.sectionTitle}>Groepen</h2>
              <select style={styles.input} value={groupForm.clubId} onChange={e=>setGroupForm({...groupForm, clubId:e.target.value})}>
                <option value="">Kies Club...</option>
                {availableClubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input style={styles.input} placeholder="Groepsnaam" value={groupForm.name} onChange={e=>setGroupForm({...groupForm, name:e.target.value})} />
              <button onClick={async () => { await setDoc(doc(collection(db, "groups")), groupForm); setGroupForm({name:'', clubId:'', useHRM:true}); refreshData(); }} style={styles.primaryBtn}>Groep +</button>
              <div style={{marginTop: '20px'}}>
                {availableGroups.map(g => (
                  <div key={g.id} style={styles.miniListItem}>
                    <span>{g.name} <small style={{color:'#3b82f6'}}>({groupMemberCounts[g.id] || 0})</small></span>
                    <div style={{display:'flex', gap:'10px'}}>
                      <button title="Leden beheren" onClick={() => openModal('group', g)} style={{color:'#3b82f6', background:'none', border:'none', cursor:'pointer'}}><UserCheck size={16}/></button>
                      <button onClick={() => deleteDoc(doc(db, "groups", g.id)).then(refreshData)} style={styles.iconBtn}><Trash2 size={14} color="#ef4444"/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'system' && (
           <button onClick={() => remove(ref(rtdb, 'live_sessions')).then(() => notify("RTDB reset"))} style={styles.dangerBtn}>Reset RTDB</button>
        )}
      </div>

      {/* MULTI-PURPOSE MODAL */}
      {memberModal.show && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h3>{memberModal.type === 'club' ? 'Club Leden' : 'Groep Leden'}: {memberModal.target.name}</h3>
              <button onClick={() => setMemberModal({show:false})} style={styles.iconBtn}><X size={20}/></button>
            </div>
            
            <div style={{position:'relative', marginBottom: '15px'}}>
              <Search size={16} style={{position:'absolute', left:'10px', top:'12px', color:'#64748b'}}/>
              <input 
                style={{...styles.input, paddingLeft: '35px'}} 
                placeholder="Zoek user..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <div style={{maxHeight:'300px', overflowY:'auto'}}>
              {getFilteredUsers().map(user => {
                const isMember = currentMembers.includes(user.id);
                return (
                  <div 
                    key={user.id} 
                    onClick={() => toggleMembership(user.id)}
                    style={{...styles.memberRow, backgroundColor: isMember ? '#3b82f620' : 'transparent', borderColor: isMember ? '#3b82f6' : '#334155'}}
                  >
                    <span>{user.firstName} {user.lastName}</span>
                    {isMember && <UserCheck size={16} color="#3b82f6" />}
                  </div>
                );
              })}
            </div>
            <button onClick={() => setMemberModal({show:false})} style={{...styles.primaryBtn, marginTop:'20px'}}>Klaar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- STYLES ---
const tabButtonStyle = (isActive) => ({
  padding: '12px 20px', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '600',
  backgroundColor: isActive ? '#3b82f6' : 'transparent', color: isActive ? 'white' : '#94a3b8',
  display: 'flex', alignItems: 'center', gap: '8px'
});

const styles = {
  page: { backgroundColor: '#0f172a', minHeight: '100vh', color: '#f8fafc', padding: '40px', fontFamily: 'ui-sans-serif, system-ui' },
  header: { maxWidth: '1000px', margin: '0 auto 40px auto', display: 'flex', justifyContent: 'space-between' },
  title: { fontSize: '24px', fontWeight: '800' },
  tabBar: { maxWidth: '1000px', margin: '0 auto 20px auto', display: 'flex', gap: '10px', backgroundColor: '#1e293b', padding: '6px', borderRadius: '14px', border: '1px solid #334155' },
  contentCard: { maxWidth: '1000px', margin: '0 auto', backgroundColor: '#1e293b', borderRadius: '16px', padding: '32px', border: '1px solid #334155' },
  dualGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' },
  subCard: { backgroundColor: '#0f172a', padding: '20px', borderRadius: '12px', border: '1px solid #334155' },
  input: { width: '100%', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: 'white', marginBottom: '10px', boxSizing: 'border-box' },
  primaryBtn: { width: '100%', backgroundColor: '#3b82f6', color: 'white', padding: '10px', borderRadius: '8px', border: 'none', fontWeight: '700', cursor: 'pointer' },
  dangerBtn: { backgroundColor: '#ef444415', color: '#ef4444', padding: '10px 20px', borderRadius: '8px', border: '1px solid #ef4444', cursor: 'pointer' },
  listItem: { display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: '#0f172a', borderRadius: '8px', marginBottom: '8px' },
  miniListItem: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1e293b' },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer' },
  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  modalCard: { backgroundColor: '#1e293b', width: '450px', padding: '25px', borderRadius: '20px', border: '1px solid #334155' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '20px' },
  memberRow: { display: 'flex', justifyContent: 'space-between', padding: '12px', border: '1px solid #334155', borderRadius: '8px', marginBottom: '8px', cursor: 'pointer' },
  sectionTitle: { fontSize: '18px', fontWeight: '700', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' },
};
