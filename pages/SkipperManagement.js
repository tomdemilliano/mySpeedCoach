import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { ref, onValue, set, remove, update } from "firebase/database";
import { UserPlus, Trash2, Edit3, X, Save, History as HistoryIcon } from 'lucide-react';

export default function SkipperManagement({ onClose }) {
  const [skippers, setSkippers] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  // We gebruiken de velden die index.js verwacht
  const [formData, setFormData] = useState({ 
    name: '', 
    deviceName: '', // hrm-naam in index.js
    deviceId: '',   // hrm-id
    zones: [
      { name: 'Warm-up', min: 0, max: 120, color: '#94a3b8' },
      { name: 'Fat Burn', min: 120, max: 145, color: '#22c55e' },
      { name: 'Aerobic', min: 145, max: 165, color: '#facc15' },
      { name: 'Anaerobic', min: 165, max: 185, color: '#f97316' },
      { name: 'Red Line', min: 185, max: 250, color: '#ef4444' }
    ],
    records: { speed30s: 0, endurance3m: 0 }
  });

  useEffect(() => {
    const skipperRef = ref(db, 'skippers');
    return onValue(skipperRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // We transformeren de object-structuur naar een array voor de lijst
        const list = Object.entries(data).map(([id, val]) => ({ id, ...val }));
        setSkippers(list);
      } else {
        setSkippers([]);
      }
    });
  }, []);

  const handleSave = async () => {
    if (!formData.name) return alert("Naam is verplicht");
    
    // We gebruiken de naam als ID, net zoals in HeartRateMonitor.js
    const skipperId = formData.name.trim(); 
    const targetRef = ref(db, `skippers/${skipperId}`);

    await update(targetRef, {
      name: formData.name,
      deviceName: formData.deviceName || '',
      deviceId: formData.deviceId || '',
      zones: formData.zones,
      records: formData.records
    });
    
    resetForm();
  };

  const resetForm = () => {
    setFormData({ 
      name: '', deviceName: '', deviceId: '', 
      zones: formData.zones, records: { speed30s: 0, endurance3m: 0 } 
    });
    setIsAdding(false);
    setEditingId(null);
  };

  const handleDelete = async (skipper) => {
    if (window.confirm(`WAARSCHUWING: Je verwijdert ${skipper.name}. Hiermee wordt ook ALLE sessie-historiek gewist. Doorgaan?`)) {
      // 1. Verwijder de skipper uit de skippers lijst
      await remove(ref(db, `skippers/${skipper.id}`));
      
      // 2. Verwijder alle sessies uit session_history waar skipper gelijk is aan de naam
      const historyRef = ref(db, 'session_history');
      onValue(historyRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          Object.entries(data).forEach(([key, session]) => {
            if (session.skipper === skipper.name) {
              remove(ref(db, `session_history/${key}`));
            }
          });
        }
      }, { onlyOnce: true });
    }
  };

  return (
    <div style={modalOverlayStyle}>
      <div style={modalContentStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0 }}>Skipper & HRM Beheer</h2>
          <button onClick={onClose} style={closeButtonStyle}><X /></button>
        </div>

        <button onClick={() => setIsAdding(true)} style={addButtonStyle}>
          <UserPlus size={18} /> Nieuwe Skipper Toevoegen
        </button>

        <div style={listContainerStyle}>
          {skippers.map(s => (
            <div key={s.id} style={skipperRowStyle}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{s.name}</div>
                <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                   HRM: {s.deviceName || 'Geen'} | ID: {s.deviceId || '-'}
                </div>
                <div style={{ marginTop: '4px', fontSize: '0.8rem', color: '#60a5fa' }}>
                  🏆 30s: {s.records?.speed30s || 0} | 3m: {s.records?.endurance3m || 0}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button title="Historiek" style={iconButtonStyle} onClick={() => window.location.href='/history'}>
                  <HistoryIcon size={18}/>
                </button>
                <button title="Bewerken" style={iconButtonStyle} onClick={() => { setEditingId(s.id); setFormData(s); setIsAdding(true); }}>
                  <Edit3 size={18}/>
                </button>
                <button title="Verwijderen" style={{...iconButtonStyle, color: '#ef4444'}} onClick={() => handleDelete(s)}>
                  <Trash2 size={18}/>
                </button>
              </div>
            </div>
          ))}
        </div>

        {isAdding && (
          <div style={formOverlayStyle}>
            <div style={formBoxStyle}>
              <h3>{editingId ? 'Skipper Aanpassen' : 'Nieuwe Skipper'}</h3>
              <label style={labelStyle}>Naam Skipper</label>
              <input 
                style={inputStyle} 
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})}
                disabled={editingId} // Naam is de ID, dus liever niet wijzigen
              />
              
              <label style={labelStyle}>Garmin Device Naam</label>
              <input 
                style={inputStyle} 
                placeholder="bijv. vivoactive 4"
                value={formData.deviceName} 
                onChange={e => setFormData({...formData, deviceName: e.target.value})}
              />

              <label style={labelStyle}>Bluetooth Device ID</label>
              <input 
                style={inputStyle} 
                placeholder="Hardware ID"
                value={formData.deviceId} 
                onChange={e => setFormData({...formData, deviceId: e.target.value})}
              />

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button onClick={handleSave} style={saveButtonStyle}><Save size={18}/> Opslaan</button>
                <button onClick={resetForm} style={cancelButtonStyle}>Annuleren</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// STYLES (Inline voor gemak)
const modalOverlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 };
const modalContentStyle = { backgroundColor: '#1e293b', padding: '25px', borderRadius: '12px', width: '95%', maxWidth: '550px', color: 'white', maxHeight: '90vh', overflowY: 'auto' };
const listContainerStyle = { marginTop: '15px', borderTop: '1px solid #334155' };
const skipperRowStyle = { display: 'flex', justifyContent: 'space-between', padding: '15px 0', borderBottom: '1px solid #334155', alignItems: 'center' };
const labelStyle = { display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '5px', marginTop: '10px' };
const inputStyle = { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', boxSizing: 'border-box' };
const addButtonStyle = { width: '100%', backgroundColor: '#3b82f6', color: 'white', padding: '12px', borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'center', gap: '8px', fontWeight: 'bold' };
const iconButtonStyle = { background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '5px' };
const closeButtonStyle = { background: 'none', border: 'none', color: 'white', cursor: 'pointer' };
const saveButtonStyle = { flex: 1, backgroundColor: '#22c55e', color: 'white', padding: '12px', borderRadius: '6px', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'center', gap: '8px' };
const cancelButtonStyle = { flex: 1, backgroundColor: '#475569', color: 'white', padding: '12px', borderRadius: '6px', border: 'none', cursor: 'pointer' };
const formOverlayStyle = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#1e293b', padding: '25px', borderRadius: '12px', zIndex: 10 };
const formBoxStyle = { display: 'flex', flexDirection: 'column' };
