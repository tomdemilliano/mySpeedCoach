import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { doc, deleteDoc, onSnapshot, collection, collectionGroup } from "firebase/firestore";
import { 
  UserFactory, 
  ClubFactory, 
  GroupFactory 
} from '../constants/dbSchema'; 

import { 
  ShieldAlert, UserPlus, Building2, Users, 
  Trash2, PlusCircle, X, Search, Edit2, 
  ChevronRight, ArrowLeft, UserCheck
} from 'lucide-react';

export default function SuperAdmin() {
  const [activeTab, setActiveTab] = useState('users');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Data
  const [users, setUsers] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [selectedClub, setSelectedClub] = useState(null); // Voor diepe navigatie
  const [selectedGroup, setSelectedGroup] = useState(null);

  // Form States
  const [userForm, setUserForm] = useState({ firstName: '', lastName: '', email: '', role: 'user' });
  const [clubForm, setClubForm] = useState({ name: '', logoUrl: '' });
  const [groupForm, setGroupForm] = useState({ name: '', useHRM: true });

  // Real-time Sync
  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubClubs = onSnapshot(collection(db, "clubs"), (snap) => {
      setClubs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubUsers(); unsubClubs(); };
  }, []);

  // Filtered Users
  const filteredUsers = users.filter(u => 
    `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Handlers
  const handleCreateUser = async (e) => {
    e.preventDefault();
    const tempUid = Date.now().toString(); // In productie gebruik je Firebase Auth voor de UID
    await UserFactory.create(tempUid, userForm);
    setUserForm({ firstName: '', lastName: '', email: '', role: 'user' });
  };

  const handleCreateClub = async (e) => {
    e.preventDefault();
    await ClubFactory.create(clubForm);
    setClubForm({ name: '', logoUrl: '' });
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    await GroupFactory.create(selectedClub.id, groupForm);
    setGroupForm({ name: '', useHRM: true });
  };

  const addMemberToGroup = async (user) => {
    if (!selectedClub || !selectedGroup) return;
    await GroupFactory.addMember(selectedClub.id, selectedGroup.id, user.id, {
      isSkipper: true,
      isCoach: false
    });
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}><ShieldAlert size={28} color="#3b82f6" /> SuperAdmin Panel</h1>
        <div style={styles.tabBar}>
          <button onClick={() => {setActiveTab('users'); setSelectedClub(null);}} style={activeTab === 'users' ? styles.activeTab : styles.tab}>Gebruikers</button>
          <button onClick={() => setActiveTab('clubs')} style={activeTab === 'clubs' ? styles.activeTab : styles.tab}>Clubs & Groepen</button>
        </div>
      </header>

      <main style={styles.content}>
        {/* USERS TAB */}
        {activeTab === 'users' && (
          <section>
            <div style={styles.actionBar}>
              <div style={styles.searchWrapper}>
                <Search size={18} style={styles.searchIcon} />
                <input 
                  placeholder="Zoek gebruikers..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={styles.searchInput}
                />
              </div>
              <form onSubmit={handleCreateUser} style={styles.inlineForm}>
                <input placeholder="Voornaam" required value={userForm.firstName} onChange={e => setUserForm({...userForm, firstName: e.target.value})} style={styles.smallInput} />
                <input placeholder="Achternaam" required value={userForm.lastName} onChange={e => setUserForm({...userForm, lastName: e.target.value})} style={styles.smallInput} />
                <input placeholder="Email" type="email" required value={userForm.email} onChange={e => setUserForm({...userForm, email: e.target.value})} style={styles.smallInput} />
                <button type="submit" style={styles.addBtn}><UserPlus size={16}/> Snel Toevoegen</button>
              </form>
            </div>

            <div style={styles.grid}>
              {filteredUsers.map(user => (
                <div key={user.id} style={styles.userCard}>
                  <div style={styles.userAvatar}>{user.firstName[0]}{user.lastName[0]}</div>
                  <div style={styles.userInfo}>
                    <h3 style={styles.userName}>{user.firstName} {user.lastName}</h3>
                    <p style={styles.userEmail}>{user.email}</p>
                    <span style={styles.roleBadge}>{user.role}</span>
                  </div>
                  <div style={styles.cardActions}>
                    <button style={styles.iconBtn}><Edit2 size={16} /></button>
                    <button onClick={() => deleteDoc(doc(db, "users", user.id))} style={{...styles.iconBtn, color: '#ef4444'}}><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* CLUBS TAB */}
        {activeTab === 'clubs' && !selectedClub && (
          <section>
            <div style={styles.sectionHeader}>
              <h2>Beheer Clubs</h2>
              <form onSubmit={handleCreateClub} style={styles.inlineForm}>
                <input placeholder="Club Naam" required value={clubForm.name} onChange={e => setClubForm({...clubForm, name: e.target.value})} style={styles.input} />
                <button type="submit" style={styles.addBtn}><Building2 size={16}/> Club Toevoegen</button>
              </form>
            </div>
            <div style={styles.grid}>
              {clubs.map(club => (
                <div key={club.id} onClick={() => setSelectedClub(club)} style={styles.clubCard}>
                  <Building2 size={40} color="#64748b" />
                  <h3>{club.name}</h3>
                  <p>Klik voor groepen</p>
                  <ChevronRight style={styles.chevron} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* GROUPS NAVIGATION (Inside a club) */}
        {activeTab === 'clubs' && selectedClub && !selectedGroup && (
          <section>
            <button onClick={() => setSelectedClub(null)} style={styles.backBtn}><ArrowLeft size={16}/> Terug naar Clubs</button>
            <div style={styles.sectionHeader}>
              <h2>Groepen in {selectedClub.name}</h2>
              <form onSubmit={handleCreateGroup} style={styles.inlineForm}>
                <input placeholder="Groepsnaam" required value={groupForm.name} onChange={e => setGroupForm({...groupForm, name: e.target.value})} style={styles.input} />
                <button type="submit" style={styles.addBtn}><PlusCircle size={16}/> Groep Toevoegen</button>
              </form>
            </div>
            {/* Hier zou je een fetch doen naar de subcollectie groepen */}
            <div style={styles.grid}>
              <div onClick={() => setSelectedGroup({id: 'demo', name: 'Selectiegroep A'})} style={styles.clubCard}>
                <Users size={30} />
                <h3>Selectiegroep A</h3>
                <p>Beheer leden</p>
              </div>
            </div>
          </section>
        )}

        {/* MEMBER MANAGEMENT (Inside a group) */}
        {activeTab === 'clubs' && selectedGroup && (
          <section style={styles.splitView}>
            <div style={styles.memberPanel}>
              <button onClick={() => setSelectedGroup(null)} style={styles.backBtn}><ArrowLeft size={16}/> Terug naar Groepen</button>
              <h2>Leden van {selectedGroup.name}</h2>
              <div style={styles.list}>
                <p style={{color: '#94a3b8'}}>Ledenlijst wordt geladen vanuit subcollectie...</p>
              </div>
            </div>

            <div style={styles.addPanel}>
              <h3>Gebruiker Toevoegen</h3>
              <div style={{...styles.searchWrapper, marginBottom: '15px'}}>
                <Search size={16} style={styles.searchIcon} />
                <input 
                  placeholder="Zoek user om toe te voegen..." 
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={styles.searchInput}
                />
              </div>
              <div style={styles.miniScroll}>
                {filteredUsers.slice(0, 10).map(u => (
                  <div key={u.id} style={styles.miniUserRow}>
                    <span>{u.firstName} {u.lastName}</span>
                    <button onClick={() => addMemberToGroup(u)} style={styles.miniAddBtn}><PlusCircle size={14}/></button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', backgroundColor: '#0f172a', color: 'white', fontFamily: 'Inter, sans-serif' },
  header: { padding: '20px 40px', backgroundColor: '#1e293b', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: '20px', display: 'flex', alignItems: 'center', gap: '12px' },
  tabBar: { display: 'flex', gap: '10px' },
  tab: { padding: '8px 16px', borderRadius: '6px', border: 'none', backgroundColor: 'transparent', color: '#94a3b8', cursor: 'pointer' },
  activeTab: { padding: '8px 16px', borderRadius: '6px', border: 'none', backgroundColor: '#3b82f6', color: 'white', fontWeight: 'bold' },
  content: { padding: '30px 40px' },
  actionBar: { display: 'flex', justifyContent: 'space-between', marginBottom: '30px', gap: '20px', flexWrap: 'wrap' },
  searchWrapper: { position: 'relative', flex: 1, minWidth: '300px' },
  searchIcon: { position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' },
  searchInput: { width: '100%', padding: '10px 10px 10px 40px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#1e293b', color: 'white', outline: 'none' },
  inlineForm: { display: 'flex', gap: '10px' },
  smallInput: { padding: '10px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#1e293b', color: 'white', width: '120px' },
  input: { padding: '10px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#1e293b', color: 'white', minWidth: '200px' },
  addBtn: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', fontWeight: 'bold' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' },
  userCard: { backgroundColor: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '15px' },
  userAvatar: { width: '45px', height: '45px', borderRadius: '50%', backgroundColor: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#3b82f6' },
  userName: { fontSize: '16px', margin: 0 },
  userEmail: { fontSize: '12px', color: '#94a3b8', margin: '2px 0' },
  roleBadge: { fontSize: '10px', backgroundColor: '#0f172a', padding: '2px 6px', borderRadius: '4px', color: '#3b82f6', textTransform: 'uppercase' },
  cardActions: { marginLeft: 'auto', display: 'flex', gap: '5px' },
  iconBtn: { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '5px' },
  clubCard: { backgroundColor: '#1e293b', padding: '30px', borderRadius: '15px', border: '1px solid #334155', textAlign: 'center', cursor: 'pointer', position: 'relative', transition: 'transform 0.2s' },
  chevron: { position: 'absolute', right: '15px', top: '50%', transform: 'translateY(-50%)', color: '#334155' },
  backBtn: { background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '20px' },
  splitView: { display: 'grid', gridTemplateColumns: '1fr 350px', gap: '30px' },
  memberPanel: { backgroundColor: '#1e293b', padding: '25px', borderRadius: '15px', border: '1px solid #334155' },
  addPanel: { backgroundColor: '#0f172a', padding: '20px', borderRadius: '15px', border: '1px solid #334155' },
  miniUserRow: { display: 'flex', justifyContent: 'space-between', padding: '10px', borderBottom: '1px solid #1e293b', fontSize: '14px' },
  miniAddBtn: { background: 'none', border: 'none', color: '#22c55e', cursor: 'pointer' },
  miniScroll: { maxHeight: '400px', overflowY: 'auto' }
};
