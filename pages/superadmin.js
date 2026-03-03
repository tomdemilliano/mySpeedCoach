import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { doc, deleteDoc, onSnapshot, collection } from "firebase/firestore";
import { UserFactory, ClubFactory, GroupFactory } from '../constants/dbSchema'; 

import { 
  ShieldAlert, UserPlus, Building2, Users, 
  Trash2, Search, Edit2, X, Save, ChevronRight, ArrowLeft 
} from 'lucide-react';

export default function SuperAdmin() {
  const [activeTab, setActiveTab] = useState('users');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Data
  const [users, setUsers] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [selectedClub, setSelectedClub] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);

  // Modal States
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState({ firstName: '', lastName: '', email: '', role: 'user' });

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

  // User Handlers
  const openUserModal = (user = null) => {
    if (user) {
      setEditingUser(user.id);
      setUserForm({ firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role });
    } else {
      setEditingUser(null);
      setUserForm({ firstName: '', lastName: '', email: '', role: 'user' });
    }
    setIsUserModalOpen(true);
  };

  const handleUserSubmit = async (e) => {
    e.preventDefault();
    if (editingUser) {
      await UserFactory.updateProfile(editingUser, userForm);
    } else {
      const tempUid = Date.now().toString(); // In productie vervang je dit door Auth creatie
      await UserFactory.create(tempUid, userForm);
    }
    setIsUserModalOpen(false);
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
        {activeTab === 'users' && (
          <section>
            <div style={styles.actionBar}>
              <div style={styles.searchWrapper}>
                <Search size={18} style={styles.searchIcon} />
                <input 
                  placeholder="Zoek op naam of email..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={styles.searchInput}
                />
              </div>
              <button onClick={() => openUserModal()} style={styles.addBtn}>
                <UserPlus size={18}/> Nieuwe Gebruiker
              </button>
            </div>

            <div style={styles.tableContainer}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeader}>
                    <th style={styles.th}>Naam</th>
                    <th style={styles.th}>Email</th>
                    <th style={styles.th}>Rol</th>
                    <th style={styles.th}>Acties</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(user => (
                    <tr key={user.id} style={styles.tableRow}>
                      <td style={styles.td}><strong>{user.firstName} {user.lastName}</strong></td>
                      <td style={styles.td}>{user.email}</td>
                      <td style={styles.td}>
                        <span style={{...styles.roleBadge, backgroundColor: getRoleColor(user.role)}}>
                          {user.role}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <button onClick={() => openUserModal(user)} style={styles.iconBtn}><Edit2 size={16} /></button>
                        <button onClick={() => deleteDoc(doc(db, "users", user.id))} style={{...styles.iconBtn, color: '#ef4444'}}><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* --- Clubs & Groepen secties blijven hetzelfde als vorige opzet, focus ligt nu op User management --- */}
      </main>

      {/* USER MODAL */}
      {isUserModalOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2>{editingUser ? 'Gebruiker Bewerken' : 'Nieuwe Gebruiker'}</h2>
              <button onClick={() => setIsUserModalOpen(false)} style={styles.closeBtn}><X size={24} /></button>
            </div>
            <form onSubmit={handleUserSubmit} style={styles.form}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Voornaam</label>
                <input required style={styles.input} value={userForm.firstName} onChange={e => setUserForm({...userForm, firstName: e.target.value})} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Achternaam</label>
                <input required style={styles.input} value={userForm.lastName} onChange={e => setUserForm({...userForm, lastName: e.target.value})} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Emailadres</label>
                <input required type="email" style={styles.input} value={userForm.email} onChange={e => setUserForm({...userForm, email: e.target.value})} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Gebruikerstype</label>
                <select style={styles.input} value={userForm.role} onChange={e => setUserForm({...userForm, role: e.target.value})}>
                  <option value="user">User</option>
                  <option value="clubadmin">ClubAdmin</option>
                  <option value="superadmin">SuperAdmin</option>
                </select>
              </div>
              <button type="submit" style={styles.submitBtn}>
                <Save size={18} /> Opslaan
              </button>
            </form>
          </div>
        </div>
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
  
  // Table Styles
  tableContainer: { backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  tableHeader: { backgroundColor: '#334155' },
  th: { padding: '15px 20px', color: '#94a3b8', fontWeight: '600', fontSize: '14px' },
  tableRow: { borderBottom: '1px solid #334155', transition: 'background 0.2s' },
  td: { padding: '15px 20px', fontSize: '14px' },
  roleBadge: { padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' },
  iconBtn: { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '8px' },

  // Modal Styles
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: '#1e293b', width: '450px', padding: '30px', borderRadius: '16px', border: '1px solid #334155' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' },
  closeBtn: { background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' },
  form: { display: 'flex', flexDirection: 'column', gap: '20px' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontSize: '14px', color: '#94a3b8' },
  input: { padding: '12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', outline: 'none' },
  submitBtn: { padding: '14px', backgroundColor: '#22c55e', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginTop: '10px' }
};
