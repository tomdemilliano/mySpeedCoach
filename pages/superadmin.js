import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { doc, deleteDoc, onSnapshot, collection, serverTimestamp, updateDoc } from "firebase/firestore";
import { UserFactory, ClubFactory, GroupFactory } from '../constants/dbSchema'; 

import { 
  ShieldAlert, UserPlus, Building2, Users, 
  Trash2, Search, Edit2, X, Save, ArrowLeft, Plus, 
  Heart, HeartOff, PlusCircle, Calendar
} from 'lucide-react';

export default function SuperAdmin() {
  const [activeTab, setActiveTab] = useState('users');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [users, setUsers] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [groups, setGroups] = useState([]);
  const [members, setMembers] = useState([]);
  const [memberCounts, setMemberCounts] = useState({});

  const [selectedClub, setSelectedClub] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);

  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isClubModalOpen, setIsClubModalOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editingMemberUid, setEditingMemberUid] = useState(null);

  const [userForm, setUserForm] = useState({ firstName: '', lastName: '', email: '', role: 'user' });
  const [clubForm, setClubForm] = useState({ name: '', logoUrl: '' });
  const [groupForm, setGroupForm] = useState({ name: '', useHRM: true });
  const [memberEditForm, setMemberEditForm] = useState({});

  // Real-time data sync
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
    const unsubMembers = onSnapshot(collection(db, `clubs/${selectedClub.id}/groups/${selectedGroup.id}/members`), (snap) => {
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsubMembers();
  }, [selectedGroup, selectedClub]);

  const filteredUsers = users.filter(u => `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredClubs = clubs.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

  // Handlers
  const handleUserSubmit = async (e) => {
    e.preventDefault();
    editingId ? await UserFactory.updateProfile(editingId, userForm) : await UserFactory.create(Date.now().toString(), userForm);
    setIsUserModalOpen(false);
  };

  const handleClubSubmit = async (e) => {
    e.preventDefault();
    editingId ? await ClubFactory.update(editingId, clubForm) : await ClubFactory.create(clubForm);
    setIsClubModalOpen(false);
  };

  const handleGroupSubmit = async (e) => {
    e.preventDefault();
    editingId ? await GroupFactory.update(selectedClub.id, editingId, groupForm) : await GroupFactory.create(selectedClub.id, groupForm);
    setIsGroupModalOpen(false);
  };

  const handleDeleteClub = async (clubId) => {
    if (confirm("Club verwijderen? Dit wist ook alle groepen en lidmaatschappen!")) await ClubFactory.delete(clubId);
  };

  // Lidmaatschap Handlers
  const handleAddMember = async (user) => {
    await GroupFactory.addMember(selectedClub.id, selectedGroup.id, user.id, {
      isSkipper: true,
      isCoach: false,
      startMembership: new Date(),
      endMembership: null
    });
  };

  const handleUpdateMember = async (uid, data) => {
    await GroupFactory.updateMember(selectedClub.id, selectedGroup.id, uid, data);
    setEditingMemberUid(null);
  };

  const handleRemoveMember = async (uid) => {
    // Punt 1: Gebruiker echt verwijderen uit de collectie
    if (confirm("Weet je zeker dat je dit lidmaatschap definitief wilt verwijderen?")) {
      await GroupFactory.removeMember(selectedClub.id, selectedGroup.id, uid);
    }
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
                        <button onClick={() => { if(confirm("Gebruiker wissen?")) UserFactory.delete(user.id); }} style={{...styles.iconBtn, color: '#ef4444'}}><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'clubs' && (
          <section>
            <div style={styles.breadcrumbBar}>
              {selectedClub && (
                <button onClick={() => {selectedGroup ? setSelectedGroup(null) : setSelectedClub(null)}} style={styles.backBtn}>
                  <ArrowLeft size={18}/> Terug naar {selectedGroup ? 'Club Overzicht' : 'Clubs'}
                </button>
              )}
            </div>

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

            {selectedClub && !selectedGroup && (
              <>
                <div style={styles.sectionHeader}>
                  {selectedClub.logoUrl ? <img src={selectedClub.logoUrl} style={styles.smallLogo} /> : <Building2 size={30} />}
                  <h2>{selectedClub.name} - Groepen</h2>
                  <button onClick={() => {setEditingId(null); setGroupForm({name:'', useHRM: true}); setIsGroupModalOpen(true);}} style={styles.addBtn}><Plus size={18}/> Groep Toevoegen</button>
                </div>
                <div style={styles.grid}>
                  {groups.map(group => (
                    <div key={group.id} style={styles.groupCard}>
                      <div onClick={() => setSelectedGroup(group)} style={{cursor: 'pointer'}}>
                         <Users size={32} color="#3b82f6" style={{marginBottom: '10px'}} />
                         <h3>{group.name}</h3>
                         <div style={styles.badgeRow}>
                           <span style={styles.countBadge}>{memberCounts[group.id] || 0} Leden</span>
                           <span style={{...styles.hrmBadge, backgroundColor: group.useHRM ? '#065f46' : '#334155'}}>
                             {group.useHRM ? <Heart size={10} fill="white"/> : <HeartOff size={10}/>} HRM {group.useHRM ? 'AAN' : 'UIT'}
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

            {selectedGroup && (
              <div style={styles.memberLayout}>
                <div style={styles.memberListPanel}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
                    <h2>Groepsleden ({members.length})</h2>
                  </div>

                  <div style={styles.memberGridDisplay}>
                    {members.map(m => {
                      const user = users.find(u => u.id === m.id);
                      const isEditing = editingMemberUid === m.id;
                      
                      return (
                        <div key={m.id} style={styles.memberCard}>
                          <div style={styles.memberCardHeader}>
                            <div style={{flex: 1}}>
                              <div style={styles.memberName}>{user ? `${user.firstName} ${user.lastName}` : 'Onbekend'}</div>
                              <div style={styles.memberEmail}>{user?.email || 'geen email'}</div>
                            </div>
                            {/* Punt 1: Lidmaatschap document echt verwijderen */}
                            <button onClick={() => handleRemoveMember(m.id)} style={styles.deleteMemberBtn} title="Lid verwijderen"><Trash2 size={16}/></button>
                          </div>

                          <div style={styles.memberRoles}>
                            <button 
                              onClick={() => handleUpdateMember(m.id, { isSkipper: !m.isSkipper })}
                              style={{...styles.roleToggle, backgroundColor: m.isSkipper ? '#3b82f6' : '#334155'}}
                            >
                              Skipper: {m.isSkipper ? 'JA' : 'NEE'}
                            </button>
                            <button 
                              onClick={() => handleUpdateMember(m.id, { isCoach: !m.isCoach })}
                              style={{...styles.roleToggle, backgroundColor: m.isCoach ? '#f59e0b' : '#334155'}}
                            >
                              Coach: {m.isCoach ? 'JA' : 'NEE'}
                            </button>
                          </div>

                          <div style={styles.memberDates}>
                            <div style={styles.dateInfo}>
                              <span style={{display:'flex', alignItems:'center', gap: '5px'}}><Calendar size={12}/> Start:</span>
                              {isEditing ? (
                                <input type="date" style={styles.miniDateInput} 
                                  defaultValue={m.startMembership?.toDate ? m.startMembership.toDate().toISOString().split('T')[0] : ''}
                                  onChange={(e) => setMemberEditForm({...memberEditForm, startMembership: new Date(e.target.value)})}
                                />
                              ) : (
                                <strong>{m.startMembership?.toDate ? m.startMembership.toDate().toLocaleDateString() : '-'}</strong>
                              )}
                            </div>
                            <div style={styles.dateInfo}>
                              <span style={{display:'flex', alignItems:'center', gap: '5px'}}><Calendar size={12}/> Eind:</span>
                              {isEditing ? (
                                <input type="date" style={styles.miniDateInput} 
                                  defaultValue={m.endMembership?.toDate ? m.endMembership.toDate().toISOString().split('T')[0] : ''}
                                  onChange={(e) => setMemberEditForm({...memberEditForm, endMembership: e.target.value ? new Date(e.target.value) : null})}
                                />
                              ) : (
                                <strong>{m.endMembership?.toDate ? m.endMembership.toDate().toLocaleDateString() : 'Geen'}</strong>
                              )}
                            </div>
                          </div>

                          <div style={styles.memberCardFooter}>
                            {isEditing ? (
                              <button onClick={() => handleUpdateMember(m.id, memberEditForm)} style={styles.saveMemberBtn}><Save size={14}/> Gegevens Opslaan</button>
                            ) : (
                              <button onClick={() => {setEditingMemberUid(m.id); setMemberEditForm(m);}} style={styles.editMemberBtn}><Edit2 size={14}/> Wijzig Lidmaatschap</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={styles.userPickerPanel}>
                  <h3>Snel Toevoegen</h3>
                  <input placeholder="Zoek gebruiker..." onChange={(e) => setSearchTerm(e.target.value)} style={styles.miniInput} />
                  <div style={styles.pickerScroll}>
                    {users.filter(u => !members.some(m => m.id === u.id))
                          .filter(u => `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()))
                          .map(u => (
                      <div key={u.id} onClick={() => handleAddMember(u)} style={styles.pickerRow}>
                        <span>{u.firstName} {u.lastName}</span>
                        <PlusCircle size={18} color="#22c55e" />
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

      {isGroupModalOpen && (
        <div style={styles.modalOverlay}><div style={styles.modalContent}>
          <div style={styles.modalHeader}><h2>Groep {editingId ? 'Bewerken' : 'Toevoegen'}</h2><button onClick={()=>setIsGroupModalOpen(false)} style={styles.closeBtn}><X/></button></div>
          <form onSubmit={handleGroupSubmit} style={styles.form}>
            <input placeholder="Groep Naam" required style={styles.input} value={groupForm.name} onChange={e => setGroupForm({...groupForm, name: e.target.value})} />
            <label style={{color: '#94a3b8', fontSize: '12px', marginBottom: '-10px'}}>Gebruik Hartslagmeters?</label>
            <div style={styles.switchContainer} onClick={() => setGroupForm({...groupForm, useHRM: !groupForm.useHRM})}>
              <div style={{...styles.switchHalf, backgroundColor: groupForm.useHRM ? '#059669' : '#334155', color: 'white'}}>AAN</div>
              <div style={{...styles.switchHalf, backgroundColor: !groupForm.useHRM ? '#ef4444' : '#334155', color: 'white'}}>UIT</div>
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
  badgeRow: { display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '10px' },
  countBadge: { fontSize: '10px', padding: '4px 8px', backgroundColor: '#0f172a', borderRadius: '4px', color: '#94a3b8' },
  hrmBadge: { fontSize: '10px', padding: '4px 8px', borderRadius: '4px', color: 'white', display: 'flex', alignItems: 'center', gap: '4px' },
  switchContainer: { display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid #334155', cursor: 'pointer', marginTop: '5px' },
  switchHalf: { flex: 1, padding: '10px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold' },

  memberLayout: { display: 'grid', gridTemplateColumns: '1fr 300px', gap: '30px' },
  memberListPanel: { backgroundColor: '#1e293b', padding: '25px', borderRadius: '12px', border: '1px solid #334155' },
  memberGridDisplay: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' },
  memberCard: { backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #334155', padding: '15px', display: 'flex', flexDirection: 'column', gap: '12px' },
  memberCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  memberName: { fontWeight: 'bold', fontSize: '15px' },
  memberEmail: { fontSize: '12px', color: '#64748b' },
  deleteMemberBtn: { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px', transition: 'color 0.2s' },
  memberRoles: { display: 'flex', gap: '8px' },
  roleToggle: { flex: 1, padding: '6px', borderRadius: '6px', border: 'none', color: 'white', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' },
  memberDates: { backgroundColor: '#1e293b', borderRadius: '8px', padding: '10px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '5px' },
  dateInfo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  miniDateInput: { backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '4px', padding: '2px 4px', fontSize: '11px', width: '105px' },
  memberCardFooter: { marginTop: '5px' },
  editMemberBtn: { width: '100%', background: 'none', border: '1px solid #334155', color: '#94a3b8', padding: '6px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px' },
  saveMemberBtn: { width: '100%', backgroundColor: '#22c55e', border: 'none', color: 'white', padding: '6px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' },

  userPickerPanel: { backgroundColor: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155', height: 'fit-content' },
  miniInput: { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', marginBottom: '15px' },
  pickerScroll: { maxHeight: '500px', overflowY: 'auto' },
  pickerRow: { padding: '12px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' },

  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: '#1e293b', width: '400px', padding: '30px', borderRadius: '16px', border: '1px solid #334155' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  form: { display: 'flex', flexDirection: 'column', gap: '15px' },
  input: { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white' },
  submitBtn: { width: '100%', padding: '12px', backgroundColor: '#22c55e', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 'bold', cursor: 'pointer' },
  closeBtn: { background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }
};
