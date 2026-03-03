import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { doc, deleteDoc, onSnapshot, collection } from "firebase/firestore";
import { UserFactory, ClubFactory, GroupFactory } from '../constants/dbSchema'; 

import { 
  ShieldAlert, UserPlus, Building2, Users, 
  Trash2, Search, Edit2, X, Save, ChevronRight, ArrowLeft, Plus, Heart, HeartOff
} from 'lucide-react';

export default function SuperAdmin() {
  const [activeTab, setActiveTab] = useState('users');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [users, setUsers] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [groups, setGroups] = useState([]);
  const [members, setMembers] = useState([]);
  const [memberCounts, setMemberCounts] = useState({}); // Voor de tellers op de kaarten

  const [selectedClub, setSelectedClub] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);

  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isClubModalOpen, setIsClubModalOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [userForm, setUserForm] = useState({ firstName: '', lastName: '', email: '', role: 'user' });
  const [clubForm, setClubForm] = useState({ name: '', logoUrl: '' });
  const [groupForm, setGroupForm] = useState({ name: '', useHRM: true });

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubClubs = onSnapshot(collection(db, "clubs"), (snap) => {
      setClubs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubUsers(); unsubClubs(); };
  }, []);

  useEffect(() => {
    if (!selectedClub) return;
    
    const unsubGroups = onSnapshot(collection(db, `clubs/${selectedClub.id}/groups`), (snap) => {
      const groupsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setGroups(groupsData);

      // Real-time tellers ophalen voor elke groep
      groupsData.forEach(group => {
        onSnapshot(collection(db, `clubs/${selectedClub.id}/groups/${group.id}/members`), (mSnap) => {
          setMemberCounts(prev => ({ ...prev, [group.id]: mSnap.size }));
        });
      });
    });
    
    return () => unsubGroups();
  }, [selectedClub]);

  useEffect(() => {
    if (!selectedGroup || !selectedClub) return;
    const unsubMembers = GroupFactory.getMembersByGroup(selectedClub.id, selectedGroup.id, setMembers);
    return () => unsubMembers();
  }, [selectedGroup, selectedClub]);

  const filteredUsers = users.filter(u => `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredClubs = clubs.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const handleUserSubmit = async (e) => {
    e.preventDefault();
    editingId ? await UserFactory.updateProfile(editingId, userForm) : await UserFactory.create(Date.now().toString(), userForm);
    setIsUserModalOpen(false);
  };

  const handleClubSubmit = async (e) => {
    e.preventDefault();
    editingId ? await ClubFactory.update(editingId, clubForm) : await ClubFactory.create(clubForm);
    setIsClubModalOpen(false);
    setEditingId(null);
  };

  const handleGroupSubmit = async (e) => {
    e.preventDefault();
    editingId ? await GroupFactory.update(selectedClub.id, editingId, groupForm) : await GroupFactory.create(selectedClub.id, groupForm);
    setIsGroupModalOpen(false);
    setEditingId(null);
  };

  const handleDeleteClub = async (clubId) => {
    if (confirm("Club verwijderen? Alle onderliggende data wordt gewist.")) await ClubFactory.delete(clubId);
  };

  const toggleMember = async (user) => {
    const isMember = members.some(m => m.id === user.id);
    isMember ? await GroupFactory.removeMember(selectedClub.id, selectedGroup.id, user.id) : await GroupFactory.addMember(selectedClub.id, selectedGroup.id, user.id, { isSkipper: true });
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}><ShieldAlert size={28} color="#3b82f6" /> SuperAdmin Panel</h1>
        <div style={styles.tabBar}>
          <button onClick={() => {setActiveTab('users'); setSelectedClub(null);}} style={activeTab === 'users' ? styles.activeTab : styles.tab}>Gebruikers</button>
          <button onClick={() => {setActiveTab('clubs'); setSelectedGroup(null);}} style={activeTab === 'clubs' ? styles.activeTab : styles.tab}>Clubs & Groepen</button>
        </div>
      </header>

      <main style={styles.content}>
        
        {/* TAB: USERS (Ongewijzigd) */}
        {activeTab === 'users' && (
          <section>
            <div style={styles.actionBar}>
              <div style={styles.searchWrapper}>
                <Search size={18} style={styles.searchIcon} />
                <input placeholder="Zoek op naam of email..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={styles.searchInput} />
              </div>
              <button onClick={() => {setEditingId(null); setUserForm({firstName:'', lastName:'', email:'', role:'user'}); setIsUserModalOpen(true);}} style={styles.addBtn}><UserPlus size={18}/> Nieuwe Gebruiker</button>
            </div>
            <div style={styles.tableContainer}>
              <table style={styles.table}>
                <thead><tr style={styles.tableHeader}><th style={styles.th}>Naam</th><th style={styles.th}>Email</th><th style={styles.th}>Rol</th><th style={styles.th}>Acties</th></tr></thead>
                <tbody>
                  {filteredUsers.map(user => (
                    <tr key={user.id} style={styles.tableRow}>
                      <td style={styles.td}><strong>{user.firstName} {user.lastName}</strong></td>
                      <td style={styles.td}>{user.email}</td>
                      <td style={styles.td}><span style={{...styles.roleBadge, backgroundColor: getRoleColor(user.role)}}>{user.role}</span></td>
                      <td style={styles.td}>
                        <button onClick={() => {setEditingId(user.id); setUserForm(user); setIsUserModalOpen(true);}} style={styles.iconBtn}><Edit2 size={16} /></button>
                        <button onClick={() => deleteDoc(doc(db, "users", user.id))} style={{...styles.iconBtn, color: '#ef4444'}}><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* TAB: CLUBS & GROEPEN */}
        {activeTab === 'clubs' && (
          <section>
            <div style={styles.breadcrumbBar}>
              {selectedClub && (
                <button onClick={() => {selectedGroup ? setSelectedGroup(null) : setSelectedClub(null)}} style={styles.backBtn}>
                  <ArrowLeft size={18}/> Terug naar {selectedGroup ? 'Club' : 'Overzicht'}
                </button>
              )}
            </div>

            {/* CLUBS */}
            {!selectedClub && (
              <>
                <div style={styles.actionBar}>
                  <div style={styles.searchWrapper}><Search size={18} style={styles.searchIcon} /><input placeholder="Filter clubs..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={styles.searchInput} /></div>
                  <button onClick={() => {setEditingId(null); setClubForm({name:'', logoUrl:''}); setIsClubModalOpen(true);}} style={styles.addBtn}><Building2 size={18}/> Nieuwe Club</button>
                </div>
                <div style={styles.grid}>
                  {filteredClubs.map(club => (
                    <div key={club.id} style={styles.clubCard}>
                      <div onClick={() => setSelectedClub(club)} style={styles.clubClickArea}>
                        {club.logoUrl ? <img src={club.logoUrl} style={styles.clubLogo} /> : <div style={styles.defaultLogo}><Building2 size={40} color="#64748b" /></div>}
                        <h3 style={styles.clubName}>{club.name}</h3>
                      </div>
                      <div style={styles.clubActions}>
                         <button onClick={() => {setEditingId(club.id); setClubForm(club); setIsClubModalOpen(true);}} style={styles.iconBtn}><Edit2 size={14}/></button>
                         <button onClick={() => handleDeleteClub(club.id)} style={{...styles.iconBtn, color: '#ef4444'}}><Trash2 size={14}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* GROEPEN */}
            {selectedClub && !selectedGroup && (
              <>
                <div style={styles.sectionHeader}>
                  {selectedClub.logoUrl ? <img src={selectedClub.logoUrl} style={styles.smallLogo} /> : <Building2 size={30} />}
                  <h2>Groepen van {selectedClub.name}</h2>
                  <button onClick={() => {setEditingId(null); setGroupForm({name:'', useHRM: true}); setIsGroupModalOpen(true);}} style={styles.addBtn}><Plus size={18}/> Groep Toevoegen</button>
                </div>
                <div style={styles.grid}>
                  {groups.map(group => (
                    <div key={group.id} style={styles.groupCard}>
                      <div onClick={() => setSelectedGroup(group)} style={{cursor: 'pointer'}}>
                         <Users size={32} color="#3b82f6" style={{marginBottom: '10px'}} />
                         <h3 style={{marginBottom: '5px'}}>{group.name}</h3>
                         <div style={styles.badgeRow}>
                           <span style={styles.countBadge}>{memberCounts[group.id] || 0} Leden</span>
                           <span style={{...styles.hrmBadge, backgroundColor: group.useHRM ? '#065f46' : '#334155'}}>
                             {group.useHRM ? <Heart size={10} fill="white"/> : <HeartOff size={10}/>} {group.useHRM ? 'GEBRUIKT HRM' : 'GEEN HRM'}
                           </span>
                         </div>
                      </div>
                      <div style={styles.groupCardActions}>
                         <button onClick={() => {setEditingId(group.id); setGroupForm(group); setIsGroupModalOpen(true);}} style={styles.iconBtn}><Edit2 size={14}/></button>
                         <button onClick={() => GroupFactory.delete(selectedClub.id, group.id)} style={{...styles.iconBtn, color: '#ef4444'}}><Trash2 size={14}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* LEDEN BEHEER */}
            {selectedGroup && (
              <div style={styles.memberLayout}>
                <div style={styles.memberListPanel}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <h3>Leden ({members.length})</h3>
                    <div style={{...styles.hrmBadge, backgroundColor: selectedGroup.useHRM ? '#065f46' : '#334155'}}>
                      {selectedGroup.useHRM ? 'HRM Actief' : 'HRM Uitgeschakeld'}
                    </div>
                  </div>
                  <div style={styles.memberGrid}>
                    {members.map(m => {
                      const user = users.find(u => u.id === m.id);
                      return (
                        <div key={m.id} style={styles.memberItem}>
                          <span>{user ? `${user.firstName} ${user.lastName}` : '...'}</span>
                          <button onClick={() => toggleMember(m)} style={styles.removeBtn}><X size={14}/></button>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div style={styles.userPickerPanel}>
                  <h3>Gebruikers toevoegen</h3>
                  <input placeholder="Zoek gebruiker..." onChange={(e) => setSearchTerm(e.target.value)} style={styles.miniInput} />
                  <div style={styles.pickerScroll}>
                    {users.filter(u => !members.some(m => m.id === u.id)).filter(u => `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())).map(u => (
                      <div key={u.id} onClick={() => toggleMember(u)} style={styles.pickerRow}>
                        <span>{u.firstName} {u.lastName}</span>
                        <Plus size={14} color="#22c55e" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* MODALS */}
      {/* User Modal (Ongewijzigd) */}
      {isUserModalOpen && (
        <div style={styles.modalOverlay}><div style={styles.modalContent}>
          <div style={styles.modalHeader}><h2>Gebruiker {editingId ? 'Bewerken' : 'Nieuw'}</h2><button onClick={()=>setIsUserModalOpen(false)} style={styles.closeBtn}><X/></button></div>
          <form onSubmit={handleUserSubmit} style={styles.form}>
            <input placeholder="Voornaam" required style={styles.input} value={userForm.firstName} onChange={e => setUserForm({...userForm, firstName: e.target.value})} />
            <input placeholder="Achternaam" required style={styles.input} value={userForm.lastName} onChange={e => setUserForm({...userForm, lastName: e.target.value})} />
            <input placeholder="Email" required style={styles.input} value={userForm.email} onChange={e => setUserForm({...userForm, email: e.target.value})} />
            <select style={styles.input} value={userForm.role} onChange={e => setUserForm({...userForm, role: e.target.value})}>
              <option value="user">User</option><option value="clubadmin">ClubAdmin</option><option value="superadmin">SuperAdmin</option>
            </select>
            <button type="submit" style={styles.submitBtn}><Save size={18}/> Opslaan</button>
          </form>
        </div></div>
      )}

      {/* Club Modal (Ongewijzigd) */}
      {isClubModalOpen && (
        <div style={styles.modalOverlay}><div style={styles.modalContent}>
          <div style={styles.modalHeader}><h2>Club {editingId ? 'Bewerken' : 'Toevoegen'}</h2><button onClick={()=>setIsClubModalOpen(false)} style={styles.closeBtn}><X/></button></div>
          <form onSubmit={handleClubSubmit} style={styles.form}>
            <input placeholder="Club Naam" required style={styles.input} value={clubForm.name} onChange={e => setClubForm({...clubForm, name: e.target.value})} />
            <input placeholder="Logo URL" style={styles.input} value={clubForm.logoUrl} onChange={e => setClubForm({...clubForm, logoUrl: e.target.value})} />
            <button type="submit" style={styles.submitBtn}><Save size={18}/> Club Opslaan</button>
          </form>
        </div></div>
      )}

      {/* Verbeterde Group Modal met Duidelijke HRM Switch */}
      {isGroupModalOpen && (
        <div style={styles.modalOverlay}><div style={styles.modalContent}>
          <div style={styles.modalHeader}><h2>Groep {editingId ? 'Bewerken' : 'Toevoegen'}</h2><button onClick={()=>setIsGroupModalOpen(false)} style={styles.closeBtn}><X/></button></div>
          <form onSubmit={handleGroupSubmit} style={styles.form}>
            <input placeholder="Groep Naam" required style={styles.input} value={groupForm.name} onChange={e => setGroupForm({...groupForm, name: e.target.value})} />
            
            <label style={{color: '#94a3b8', fontSize: '13px', marginBottom: '-10px'}}>Gebruik Hartslagmeters (HRM)?</label>
            <div style={styles.switchContainer} onClick={() => setGroupForm({...groupForm, useHRM: !groupForm.useHRM})}>
              <div style={{...styles.switchHalf, backgroundColor: groupForm.useHRM ? '#059669' : '#334155', color: groupForm.useHRM ? 'white' : '#94a3b8'}}>JA</div>
              <div style={{...styles.switchHalf, backgroundColor: !groupForm.useHRM ? '#ef4444' : '#334155', color: !groupForm.useHRM ? 'white' : '#94a3b8'}}>NEE</div>
            </div>
            
            <button type="submit" style={styles.submitBtn}><Save size={18}/> Groep Opslaan</button>
          </form>
        </div></div>
      )}

    </div>
  );
}

const getRoleColor = (role) => {
  switch(role) {
    case 'superadmin': return '#ef4444';
    case 'clubadmin': return '#f59e0b';
    default: return '#3b82f6';
  }
};

const styles = {
  // ... Bestaande styles behouden ...
  container: { minHeight: '100vh', backgroundColor: '#0f172a', color: 'white', fontFamily: 'Inter, sans-serif' },
  header: { padding: '20px 40px', backgroundColor: '#1e293b', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: '20px', display: 'flex', alignItems: 'center', gap: '12px', margin: 0 },
  tabBar: { display: 'flex', gap: '10px' },
  tab: { padding: '8px 16px', borderRadius: '6px', border: 'none', backgroundColor: 'transparent', color: '#94a3b8', cursor: 'pointer' },
  activeTab: { padding: '8px 16px', borderRadius: '6px', border: 'none', backgroundColor: '#3b82f6', color: 'white', fontWeight: 'bold' },
  content: { padding: '30px 40px' },
  actionBar: { display: 'flex', justifyContent: 'space-between', marginBottom: '20px', gap: '20px' },
  searchWrapper: { position: 'relative', width: '400px' },
  searchIcon: { position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' },
  searchInput: { width: '100%', padding: '12px 12px 12px 40px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#1e293b', color: 'white', outline: 'none' },
  addBtn: { display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', fontWeight: 'bold' },
  tableContainer: { backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  tableHeader: { backgroundColor: '#334155' },
  th: { padding: '15px 20px', color: '#94a3b8', fontWeight: '600', fontSize: '14px' },
  tableRow: { borderBottom: '1px solid #334155' },
  td: { padding: '15px 20px', fontSize: '14px' },
  roleBadge: { padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' },
  iconBtn: { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '8px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' },
  clubCard: { backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden', position: 'relative' },
  clubClickArea: { padding: '25px', textAlign: 'center', cursor: 'pointer' },
  clubLogo: { width: '80px', height: '80px', borderRadius: '12px', objectFit: 'cover', marginBottom: '15px' },
  defaultLogo: { width: '80px', height: '80px', borderRadius: '12px', backgroundColor: '#0f172a', margin: '0 auto 15px', display: 'flex', justifyContent: 'center', alignItems: 'center' },
  clubName: { margin: 0, fontSize: '18px' },
  clubActions: { position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '5px' },
  groupCard: { backgroundColor: '#1e293b', padding: '25px', borderRadius: '12px', border: '1px solid #334155', textAlign: 'center', position: 'relative' },
  groupCardActions: { position: 'absolute', top: '10px', right: '10px' },
  breadcrumbBar: { marginBottom: '20px' },
  backBtn: { background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '25px' },
  smallLogo: { width: '40px', height: '40px', borderRadius: '8px' },
  memberLayout: { display: 'grid', gridTemplateColumns: '1fr 300px', gap: '30px' },
  memberListPanel: { backgroundColor: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' },
  memberGrid: { display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '15px' },
  memberItem: { backgroundColor: '#0f172a', padding: '8px 12px', borderRadius: '20px', border: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' },
  removeBtn: { background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' },
  userPickerPanel: { backgroundColor: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155' },
  miniInput: { width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', marginBottom: '15px' },
  pickerScroll: { maxHeight: '400px', overflowY: 'auto' },
  pickerRow: { padding: '10px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', cursor: 'pointer', fontSize: '13px' },
  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: '#1e293b', width: '400px', padding: '30px', borderRadius: '16px', border: '1px solid #334155' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  form: { display: 'flex', flexDirection: 'column', gap: '15px' },
  input: { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white' },
  submitBtn: { width: '100%', padding: '12px', backgroundColor: '#22c55e', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' },
  closeBtn: { background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' },

  // Nieuwe specifieke styles
  badgeRow: { display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '10px' },
  countBadge: { fontSize: '10px', padding: '4px 8px', backgroundColor: '#0f172a', borderRadius: '4px', color: '#94a3b8' },
  hrmBadge: { fontSize: '10px', padding: '4px 8px', borderRadius: '4px', color: 'white', display: 'flex', alignItems: 'center', gap: '4px' },
  switchContainer: { display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid #334155', cursor: 'pointer' },
  switchHalf: { flex: 1, padding: '10px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', transition: '0.2s' }
};
