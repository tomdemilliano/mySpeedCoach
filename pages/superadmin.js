import React, { useState } from 'react';
import { db, rtdb } from '../firebaseConfig';
import { collection, doc, setDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, remove } from "firebase/database";
import { ShieldAlert, UserPlus, Building2, Users, Trash2, Database } from 'lucide-react';

export default function SuperAdmin() {
  const [activeTab, setActiveTab] = useState('users');
  const [message, setMessage] = useState(null);

  // Helper om feedback te geven
  const notify = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  // 1. Nieuwe User Aanmaken (Firestore)
  const createTestUser = async () => {
    try {
      const newUserRef = doc(collection(db, "users"));
      await setDoc(newUserRef, {
        firstName: "Test",
        lastName: "Skipper",
        email: "test@speedcoach.be",
        role: "user",
        createdAt: serverTimestamp()
      });
      notify(`User aangemaakt met ID: ${newUserRef.id}`);
    } catch (e) { console.error(e); }
  };

  // 2. RTDB Opschonen (Live sessies resetten)
  const resetLiveSessions = () => {
    remove(ref(rtdb, 'live_sessions'))
      .then(() => notify("RTDB Live Sessies gewist."));
  };

  return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '30px' }}>
        <ShieldAlert size={32} color="#ef4444" />
        <h1>SuperAdmin Control Center</h1>
      </div>

      {message && (
        <div style={{ backgroundColor: '#1e293b', borderLeft: '4px solid #22c55e', padding: '10px', marginBottom: '20px' }}>
          {message}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button onClick={() => setActiveTab('users')} style={tabStyle(activeTab === 'users')}>Users</button>
        <button onClick={() => setActiveTab('clubs')} style={tabStyle(activeTab === 'clubs')}>Clubs & Groups</button>
        <button onClick={() => setActiveTab('system')} style={tabStyle(activeTab === 'system')}>System</button>
      </div>

      <div style={{ backgroundColor: '#1e293b', padding: '20px', borderRadius: '12px' }}>
        {activeTab === 'users' && (
          <div>
            <h3>User Management</h3>
            <button onClick={createTestUser} style={actionButtonStyle}>
              <UserPlus size={18} /> Maak Test Skipper (Firestore)
            </button>
          </div>
        )}

        {activeTab === 'system' && (
          <div>
            <h3>Systeem Onderhoud</h3>
            <p>Gebruik dit om vastgelopen live sessies uit de RTDB te verwijderen.</p>
            <button onClick={resetLiveSessions} style={{...actionButtonStyle, backgroundColor: '#ef4444'}}>
              <Trash2 size={18} /> Reset RTDB Live Sessions
            </button>
          </div>
        )}
        
        {/* Voeg hier de forms toe voor Clubs & Groups conform je schema */}
      </div>
    </div>
  );
}

const tabStyle = (active) => ({
  padding: '10px 20px',
  backgroundColor: active ? '#3b82f6' : '#334155',
  border: 'none',
  borderRadius: '6px',
  color: 'white',
  cursor: 'pointer'
});

const actionButtonStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  backgroundColor: '#22c55e',
  color: 'white',
  padding: '12px 20px',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  marginTop: '10px'
};
