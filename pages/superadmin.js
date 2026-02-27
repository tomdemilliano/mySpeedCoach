import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { doc, deleteDoc } from "firebase/firestore";
// Importeer de factories uit je dbSchema bestand
import { 
  UserFactory, 
  ClubFactory, 
  GroupFactory, 
  LiveSessionFactory 
} from '../src/constants/dbSchema'; 

import { 
  ShieldAlert, UserPlus, Building2, Users, 
  Trash2, Database, PlusCircle, UserCheck, X, Search 
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
  const [memberModal, setMemberModal] = useState({ show: false, type: null, target: null }); 
  const [currentMembers, setCurrentMembers] = useState([]);
  const [clubMembersForSelectedGroup, setClubMembersForSelectedGroup] = useState([]);

  // Form states
  const [userForm, setUserForm] = useState({ firstName: '', lastName: '', email: '', role: 'user' });
  const [clubForm, setClubForm] = useState({ name: '', logoUrl: '' });
  const [groupForm, setGroupForm] = useState({ name: '', clubId: '', useHRM: true });

  const notify = (msg, isError = false) => {
    setMessage({ text: msg, isError });
    setTimeout(() => setMessage(null), 4000);
  };

  const refreshData = async () => {
    try {
      // Gebruik Factories voor ophalen data
      const users = await UserFactory.getAll();
      setAvailableUsers(users);

      const clubs = await ClubFactory.getAll(); // Voeg getAll toe aan ClubFactory indien nodig, of gebruik getDocs
      setAvailableClubs(clubs);

      const groups = await GroupFactory.getAll(); 
      setAvailableGroups(groups);

      const counts = {};
      for (const group of groups) {
        const members = await GroupFactory.getMembers(group.id);
        counts[group.id] = members.length;
      }
      setGroupMemberCounts(counts);
    } catch (e) { 
      console.error("Refresh error:", e); 
    }
  };

  useEffect(() => { refreshData(); }, [activeTab]);

  // --- MODAL LOGICA VIA FACTORIES ---
  const openModal = async (type, target) => {
    setSearchTerm('');
    try {
      if (type === 'club') {
        const members = await ClubFactory.getMembers(target.id);
        setCurrentMembers(members);
      } else {
        const members = await GroupFactory.getMembers(target.id);
        setCurrentMembers(members.map(m => m.id));
        
        // Filter: Alleen clubleden mogen in de groep
        const clubMembers = await ClubFactory.getMembers(target.clubId);
        setClubMembersForSelectedGroup(clubMembers);
      }
      setMemberModal({ show: true, type, target });
    } catch (e) {
      notify("Kon leden niet laden", true);
    }
  };

  const toggleMembership = async (userId) => {
    const { type, target } = memberModal;
    try {
      if (currentMembers.includes(userId)) {
        type === 'club' 
          ? await ClubFactory.removeMember(target.id, userId)
          : await GroupFactory.removeMember(target.id, userId);
        setCurrentMembers(prev => prev.filter(id => id !== userId));
      } else {
        type === 'club'
          ? await ClubFactory.addMember(target.id, userId)
          : await GroupFactory.addMember(target.id, userId);
        setCurrentMembers(prev => [...prev, userId]);
      }
      refreshData();
    } catch (e) { 
      notify("Fout bij bijwerken lidmaatschap", true); 
    }
  };

  const getFilteredUsers = () => {
    let list = availableUsers;
    if (memberModal.type === 'group') {
      list = availableUsers.filter(u => clubMembersForSelectedGroup.includes(u.id));
    }
    return list.filter(u => 
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  // --- FORM HANDLERS VIA FACTORIES ---
  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await UserFactory.create(userForm);
      setUserForm({ firstName: '', lastName: '', email: '', role: 'user' });
      refreshData();
      notify("Gebruiker succesvol aangemaakt");
    } catch (e) { notify(e.message, true); }
  };

  const handleCreateClub = async () => {
    try {
      await ClubFactory.create(clubForm);
      setClubForm({ name: '', logoUrl: '' });
      refreshData();
      notify("Club succesvol toegevoegd");
    } catch (e) { notify(e.message, true); }
  };

  const handleCreateGroup = async () => {
    try {
      await GroupFactory.create(groupForm);
      setGroupForm({ name: '', clubId: '', useHRM: true });
      refreshData();
      notify("Groep succesvol toegevoegd");
    } catch (e) { notify(e.message, true); }
  };

  // --- RENDER SECTIE (Onveranderd qua layout) ---
  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ShieldAlert size={28} color="#ef4444" />
          <h1 style={styles.title}>SuperAdmin <span style={{fontWeight: '300', color: '#64748b'}}>| Factory Engine</span></h1>
        </div>
      </header>

      {message && (
        <div style={{...styles.alert, backgroundColor: message.isError ? '#450a0a' : '#064e3b', color: message.isError ? '#fca5a5' : '#6ee7b7'}}>
          {message.text}
        </div>
      )}

      <nav style={styles.tabBar}>
        <button onClick={() => setActiveTab('users')} style={tabButtonStyle(activeTab === 'users')}><UserPlus size={18}/> Users</button>
        <button onClick={() => setActiveTab('clubs')} style={tabButtonStyle(activeTab === 'clubs')}><Building2 size={18}/> Clubs & Groepen</button>
        <button onClick={() => setActiveTab('system')} style={tabButtonStyle(activeTab === 'system')}><Database size={18}/> Systeem</button>
      </nav>

      <div style={styles.contentCard}>
        {activeTab === 'users' && (
          <section>
            <h2 style={styles.sectionTitle}>Nieuwe Gebruiker Toevoegen</h2>
            <form onSubmit={handleCreateUser} style={styles.formGrid}>
               <div style={styles.inputGroup}><label style={styles.label}>Voornaam</label><input style={styles.input} value={userForm.firstName} onChange={e=>setUserForm({...userForm, firstName:e.target.value})} required /></div>
               <div style={styles.inputGroup}><label style={styles.label}>Achternaam</label><input style={styles.input} value={userForm.lastName} onChange={e=>setUserForm({...userForm, lastName:e.target.value})} required /></div>
               <div style={styles.inputGroup}><label style={styles.label}>Email</label><input style={styles.input} type="email" value={userForm.email} onChange={e=>setUserForm({...userForm, email:e.target.value})} required /></div>
               <div style={styles.inputGroup}>
                 <label style={styles.label}>Rol</label>
                 <select style={styles.input} value={userForm.role} onChange={e=>setUserForm({...userForm, role:e.target.value})}>
                    <option value="user">Skipper</option>
                    <option value="coach">Coach</option>
                    <option value="admin">Admin</option>
                 </select>
               </div>
               <button type="submit" style={{...styles.primaryBtn, gridColumn: 'span 4'}}><PlusCircle size={18}/> Gebruiker Opslaan</button>
            </form>
            <div style={{marginTop: '30px'}}>
              <h3 style={styles.label}>Bestaande Users</h3>
              {availableUsers.map(u => (
                <div key={u.id} style={styles.listItem}>
                  <span>{u.firstName} {u.lastName} <span style={styles.roleTag}>{u.role}</span></span>
                  <button onClick={() => UserFactory.delete(u.id).then(refreshData)} style={styles.iconBtn}><Trash2 size={14} color="#ef4444"/></button>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'clubs' && (
          <div style={styles.dualGrid}>
            <div style={styles.subCard}>
              <h2 style={styles.sectionTitle}><Building2 size={18} /> Clubs</h2>
              <label style={styles.label}>Clubnaam</label>
              <input style={styles.input} placeholder="bijv. Gentse Rope Skippers" value={clubForm.name} onChange={e=>setClubForm({...clubForm, name:e.target.value})} />
              <label style={styles.label}>Logo URL</label>
              <input style={styles.input} placeholder="https://logo-url.png" value={clubForm.logoUrl} onChange={e=>setClubForm({...clubForm, logoUrl:e.target.value})} />
              <button onClick={handleCreateClub} style={styles.primaryBtn}>Club Aanmaken</button>
              <div style={{marginTop: '20px'}}>
                {availableClubs.map(c => (
                  <div key={c.id} style={styles.miniListItem}>
                    <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                      {c.logoUrl ? <img src={c.logoUrl} alt="logo" style={{width:20, height:20, borderRadius:4}}/> : <Building2 size={14}/>}
                      <span>{c.name}</span>
                    </div>
                    <div style={{display:'flex', gap:'10px'}}>
                      <button title="Clubleden beheren" onClick={() => openModal('club', c)} style={{color:'#3b82f6', background:'none', border:'none', cursor:'pointer'}}><Users size={16}/></button>
                      <button onClick={() => ClubFactory.delete(c.id).then(refreshData)} style={styles.iconBtn}><Trash2 size={14} color="#ef4444"/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={styles.subCard}>
              <h2 style={styles.sectionTitle}><Users size={18} /> Groepen</h2>
              <label style={styles.label}>Behoort tot club</label>
              <select style={styles.input} value={groupForm.clubId} onChange={e=>setGroupForm({...groupForm, clubId:e.target.value})}>
                <option value="">Selecteer club...</option>
                {availableClubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <label style={styles.label}>Groepsnaam</label>
              <input style={styles.input} placeholder="bijv. Groep A" value={groupForm.name} onChange={e=>setGroupForm({...groupForm, name:e.target.value})} />
              <button onClick={handleCreateGroup} style={styles.primaryBtn}>Groep Aanmaken</button>
              <div style={{marginTop: '20px'}}>
                {availableGroups.map(g => (
                  <div key={g.id} style={styles.miniListItem}>
                    <div>
                      <strong>{g.name}</strong>
                      <div style={{fontSize: '10px', color:'#64748b'}}>{availableClubs.find(c=>c.id===g.clubId)?.name}</div>
                    </div>
                    <div style={{display:'flex', gap:'10px'}}>
                      <span style={{fontSize:11, color:'#3b82f6', alignSelf:'center'}}>{groupMemberCounts[g.id] || 0} p.</span>
                      <button title="Groepsleden beheren" onClick={() => openModal('group', g)} style={{color:'#3b82f6', background:'none', border:'none', cursor:'pointer'}}><UserCheck size={16}/></button>
                      <button onClick={() => GroupFactory.delete(g.id).then(refreshData)} style={styles.iconBtn}><Trash2 size={14} color="#ef4444"/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'system' && (
           <div style={styles.subCard}>
             <h2 style={styles.sectionTitle}><Database size={18}/> Database Maintenance</h2>
             <button onClick={() => LiveSessionFactory.resetAll().then(() => notify("Live sessies gereset"))} style={styles.dangerBtn}>
               <Trash2 size={16}/> Clear Realtime Database Sessions
             </button>
           </div>
        )}
      </div>

      {/* MODAL (Onveranderd) */}
      {memberModal.show && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <div>
                <h3 style={{margin:0}}>{memberModal.type === 'club' ? 'Club Leden' : 'Groepsleden'}</h3>
                <small style={{color:'#94a3b8'}}>{memberModal.target.name}</small>
              </div>
              <button onClick={() => setMemberModal({show:false})} style={styles.iconBtn}><X size={20}/></button>
            </div>
            
            <div style={{position:'relative', marginBottom: '15px'}}>
              <Search size={16} style={{position:'absolute', left:'10px', top:'12px', color:'#64748b'}}/>
              <input style={{...styles.input, paddingLeft: '35px', marginBottom:0}} placeholder="Zoek op naam..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>

            <div style={{maxHeight:'350px', overflowY:'auto', marginTop:'10px'}}>
              {getFilteredUsers().length === 0 ? (
                <div style={{textAlign:'center', padding:'20px', color:'#64748b', fontSize:13}}>
                  {memberModal.type === 'group' ? "Geen clubleden gevonden om toe te voegen." : "Geen gebruikers gevonden."}
                </div>
              ) : (
                getFilteredUsers().map(user => {
                  const isMember = currentMembers.includes(user.id);
                  return (
                    <div key={user.id} onClick={() => toggleMembership(user.id)} style={{...styles.memberRow, backgroundColor: isMember ? '#3b82f620' : 'transparent', borderColor: isMember ? '#3b82f6' : '#334155'}}>
                      <span>{user.firstName} {user.lastName}</span>
                      {isMember && <UserCheck size={16} color="#3b82f6" />}
                    </div>
                  );
                })
              )}
            </div>
            <button onClick={() => setMemberModal({show:false})} style={{...styles.primaryBtn, marginTop:'20px'}}>Sluiten</button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- STYLES (Hetzelfde als voorheen) ---
const tabButtonStyle = (isActive) => ({
  padding: '12px 20px', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '14px',
  backgroundColor: isActive ? '#3b82f6' : 'transparent', color: isActive ? 'white' : '#94a3b8',
  display: 'flex', alignItems: 'center', gap: '8px', transition: '0.2s'
});

const styles = {
  page: { backgroundColor: '#0f172a', minHeight: '100vh', color: '#f8fafc', padding: '40px', fontFamily: 'ui-sans-serif, system-ui' },
  header: { maxWidth: '1000px', margin: '0 auto 40px auto' },
  title: { fontSize: '24px', fontWeight: '800' },
  tabBar: { maxWidth: '1000px', margin: '0 auto 20px auto', display: 'flex', gap: '10px', backgroundColor: '#1e293b', padding: '6px', borderRadius: '14px', border: '1px solid #334155' },
  contentCard: { maxWidth: '1000px', margin: '0 auto', backgroundColor: '#1e293b', borderRadius: '16px', padding: '32px', border: '1px solid #334155', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)' },
  dualGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' },
  subCard: { backgroundColor: '#0f172a', padding: '24px', borderRadius: '12px', border: '1px solid #334155' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
  label: { fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' },
  input: { width: '100%', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: 'white', marginBottom: '15px', boxSizing: 'border-box', outline: 'none' },
  primaryBtn: { backgroundColor: '#3b82f6', color: 'white', padding: '12px', borderRadius: '8px', border: 'none', fontWeight: '700', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' },
  dangerBtn: { backgroundColor: '#ef444415', color: '#ef4444', padding: '12px 20px', borderRadius: '8px', border: '1px solid #ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' },
  listItem: { display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: '#0f172a', borderRadius: '8px', marginBottom: '8px', border: '1px solid #334155' },
  miniListItem: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #1e293b' },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer' },
  roleTag: { fontSize: '10px', backgroundColor: '#334155', padding: '2px 6px', borderRadius: '4px', marginLeft: '10px', color: '#94a3b8' },
  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100, backdropFilter: 'blur(4px)' },
  modalCard: { backgroundColor: '#1e293b', width: '450px', padding: '25px', borderRadius: '20px', border: '1px solid #334155' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '20px', alignItems: 'center' },
  memberRow: { display: 'flex', justifyContent: 'space-between', padding: '12px', border: '1px solid #334155', borderRadius: '8px', marginBottom: '8px', cursor: 'pointer', transition: '0.2s' },
  sectionTitle: { fontSize: '18px', fontWeight: '700', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px' },
  alert: { maxWidth: '1000px', margin: '0 auto 20px auto', padding: '12px 20px', borderRadius: '8px', borderLeft: '4px solid', fontSize: '14px' }
};
