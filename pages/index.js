import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebaseConfig';
import { ref, onValue, update, query, orderByChild, equalTo } from "firebase/database";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from 'recharts';
import { Bluetooth, Heart, User, Settings, History, Save, Trophy, X, Check, Award, Edit2 } from 'lucide-react';

const DEFAULT_ZONES = [
  { name: 'Warm-up', min: 0, max: 120, color: '#94a3b8' },
  { name: 'Fat Burn', min: 120, max: 145, color: '#22c55e' },
  { name: 'Aerobic', min: 145, max: 165, color: '#facc15' },
  { name: 'Anaerobic', min: 165, max: 185, color: '#f97316' },
  { name: 'Red Line', min: 185, max: 250, color: '#ef4444' }
];

export default function SkipperDashboard() {
  const [heartRate, setHeartRate] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [skipperName, setSkipperName] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [isConfirmingName, setIsConfirmingName] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showRecords, setShowRecords] = useState(false);
  const [newRecordAlert, setNewRecordAlert] = useState(null);
  
  const [zones, setZones] = useState(DEFAULT_ZONES);
  const [isClient, setIsClient] = useState(false);

  const [historyData, setHistoryData] = useState([]);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [manualRecords, setManualRecords] = useState({});
  const [editingRecord, setEditingRecord] = useState(null); // { time, cat, value }
  
  const lastSentBpm = useRef(0);
  const prevIsRecording = useRef(false);

  const getZoneColor = (bpm) => {
    const zone = zones.find(z => bpm >= z.min && bpm < z.max);
    return zone ? zone.color : '#94a3b8';
  };

  // Records inladen uit Firebase
  useEffect(() => {
    if (skipperName) {
      const recordsRef = ref(db, `skipper_stats/${skipperName}/records`);
      return onValue(recordsRef, (snapshot) => {
        setManualRecords(snapshot.val() || {});
      });
    }
  }, [skipperName]);

  const connectBluetooth = async () => {
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['heart_rate'] }]
      });
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('heart_rate');
      const characteristic = await service.getCharacteristic('heart_rate_measurement');

      setDeviceName(device.name);
      const savedName = localStorage.getItem(`hrm_${device.name}`);
      
      if (savedName) {
        setSkipperName(savedName);
        setIsConfirmingName(true);
      } else {
        const name = prompt("Wat is jouw naam?");
        if (name) saveUser(name, device.name);
      }

      characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', (e) => {
        setHeartRate(e.target.value.getUint8(1));
      });
      setIsConnected(true);
    } catch (error) { console.error(error); }
  };

  const saveUser = (name, devName) => {
    setSkipperName(name);
    localStorage.setItem(`hrm_${devName}`, name);
    setIsConfirmingName(false);
  };

  const saveManualRecord = () => {
    if (!editingRecord || isNaN(editingRecord.value)) return;
    
    update(ref(db, `skipper_stats/${skipperName}/records/${editingRecord.time}/${editingRecord.cat}`), {
      score: parseInt(editingRecord.value),
      date: Date.now()
    });
    setEditingRecord(null);
  };

  useEffect(() => {
    setIsClient(true);
    const savedZones = localStorage.getItem('hr_zones');
    if (savedZones) setZones(JSON.parse(savedZones));
  }, []);
  
  // Firebase Sync & Live Updates
  useEffect(() => {
    if (isConnected && skipperName && heartRate > 0) {
      if (heartRate !== lastSentBpm.current) {
        update(ref(db, `live_sessions/${skipperName}`), {
          name: skipperName,
          bpm: heartRate,
          lastUpdate: Date.now()
        });
        lastSentBpm.current = heartRate;
      }
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setHistoryData(prev => [...prev, { time: now, bpm: heartRate }].slice(-100));

      return onValue(ref(db, `live_sessions/${skipperName}`), (snapshot) => {
        const data = snapshot.val();
        const currentlyRecording = data?.isRecording || false;

        // Check of sessie zojuist is beëindigd
        if (prevIsRecording.current === true && currentlyRecording === false && data?.isFinished) {
          const sessionType = data.sessionType || 30;
          const category = data.category || 'Training';
          const currentBest = manualRecords[sessionType]?.[category]?.score || 0;

          if (data.steps > currentBest) {
            setNewRecordAlert(data);
          }
        }
        prevIsRecording.current = currentlyRecording;
        setIsRecording(currentlyRecording);
      });
    }
  }, [heartRate, isConnected, skipperName, sessionHistory, manualRecords]);

  useEffect(() => {
    if (skipperName) {
      const hRef = query(ref(db, 'session_history'), orderByChild('skipper'), equalTo(skipperName));
      return onValue(hRef, (snapshot) => {
        const sorted = Object.values(snapshot.val() || {}).sort((a, b) => b.date - a.date);
        setSessionHistory(sorted);
      });
    }
  }, [skipperName]);

  const handleZoneChange = (index, field, value) => {
    const newZones = [...zones];
    newZones[index][field] = parseInt(value) || 0;
    setZones(newZones);
  };

  const saveSettings = () => {
    localStorage.setItem('hr_zones', JSON.stringify(zones));
    setShowSettings(false);
    alert("Instellingen opgeslagen!");
  };

  const styles = {
    container: { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', padding: '20px', fontFamily: 'sans-serif' },
    card: { backgroundColor: '#1e293b', borderRadius: '15px', padding: '20px', marginBottom: '20px', border: '1px solid #334155' },
    bpmText: { fontSize: '72px', fontWeight: '900', color: getZoneColor(heartRate), margin: '10px 0', textAlign: 'center' },
    btn: { backgroundColor: '#3b82f6', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' },
    input: { backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', padding: '8px', borderRadius: '5px', width: '60px' },
    editInput: { backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', padding: '5px', borderRadius: '5px', width: '50px', textAlign: 'center' },
    nameDisplay: { fontSize: '18px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' },
    table: { width: '100%', borderCollapse: 'collapse', marginTop: '10px' },
    th: { textAlign: 'left', padding: '10px', color: '#94a3b8', borderBottom: '1px solid #334155' },
    td: { padding: '10px', borderBottom: '1px solid #334155' },
    modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          {skipperName && <div style={styles.nameDisplay}><User size={18}/> {skipperName}</div>}
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>Skipper Dashboard</h1>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {isConnected && (
            <>
              <button onClick={() => setShowRecords(true)} style={{ ...styles.btn, backgroundColor: '#facc15', color: '#000' }}>
                <Trophy size={20} />
              </button>
              <button onClick={() => setShowSettings(!showSettings)} style={{ ...styles.btn, backgroundColor: '#475569' }}>
                <Settings size={20} />
              </button>
            </>
          )}
          {!isConnected && <button onClick={connectBluetooth} style={styles.btn}><Bluetooth size={20} /> Koppel HRM</button>}
        </div>
      </div>

      {/* NEW RECORD ALERT MODAL */}
      {newRecordAlert && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.card, maxWidth: '400px', textAlign: 'center', borderColor: '#facc15', borderWidth: '2px' }}>
            <Award size={64} color="#facc15" style={{ marginBottom: '15px' }} />
            <h2 style={{ color: '#facc15', margin: '0 0 10px 0' }}>NIEUW RECORD!</h2>
            <p>Je hebt <strong>{newRecordAlert.steps} steps</strong> gehaald op de {newRecordAlert.sessionType}s {newRecordAlert.category}!</p>
            <p style={{ fontSize: '14px', color: '#94a3b8' }}>Klopt dit aantal stappen?</p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => setNewRecordAlert(null)} style={{ ...styles.btn, flex: 1, backgroundColor: '#22c55e' }}><Check size={18}/> Ja, bewaar!</button>
              <button onClick={() => setNewRecordAlert(null)} style={{ ...styles.btn, flex: 1, backgroundColor: '#ef4444' }}><X size={18}/> Nee</button>
            </div>
          </div>
        </div>
      )}

      {/* RECORDS MODAL MET HANDMATIGE AANPASSING */}
      {showRecords && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.card, width: '100%', maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Trophy color="#facc15"/> Persoonlijke Records
              </h3>
              <X cursor="pointer" onClick={() => setShowRecords(false)} />
            </div>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Onderdeel</th>
                  <th style={styles.th}>Training</th>
                  <th style={styles.th}>Wedstrijd</th>
                </tr>
              </thead>
              <tbody>
                {[30, 120, 180].map(time => (
                  <tr key={time}>
                    <td style={styles.td}>{time === 30 ? '30 sec' : (time/60) + ' min'}</td>
                    {['Training', 'Wedstrijd'].map(cat => {
                      const rec = manualRecords[time]?.[cat];
                      const isEditing = editingRecord?.time === time && editingRecord?.cat === cat;
                      return (
                        <td key={cat} style={styles.td}>
                          {isEditing ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <input 
                                autoFocus
                                style={styles.editInput}
                                value={editingRecord.value}
                                onChange={(e) => setEditingRecord({...editingRecord, value: e.target.value})}
                              />
                              <button onClick={saveManualRecord} style={{ background: 'none', border: 'none', color: '#22c55e', cursor: 'pointer' }}>
                                <Check size={16}/>
                              </button>
                            </div>
                          ) : (
                            <div 
                              onClick={() => setEditingRecord({ time, cat, value: rec?.score || 0 })}
                              style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
                            >
                              <div style={{ fontWeight: 'bold', color: rec ? '#3b82f6' : '#475569', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                {rec ? `${rec.score} steps` : '---'}
                                <Edit2 size={10} style={{ opacity: 0.5 }} />
                              </div>
                              {rec && <div style={{ fontSize: '10px', color: '#64748b' }}>{new Date(rec.date).toLocaleDateString()}</div>}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Instellingen Panel */}
      {showSettings && (
        <div style={{ ...styles.card, borderColor: '#3b82f6' }}>
          <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '10px' }}><Settings size={20}/> Beheer Instellingen</h3>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8' }}>Naam aanpassen:</label>
            <input style={{ ...styles.input, width: '200px' }} value={skipperName} onChange={(e) => setSkipperName(e.target.value)} />
          </div>
          <label style={{ display: 'block', marginBottom: '10px', color: '#94a3b8' }}>Hartslagzones (BPM):</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {zones.map((zone, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: zone.color }}></div>
                <span style={{ width: '80px' }}>{zone.name}</span>
                <input style={styles.input} type="number" value={zone.min} onChange={(e) => handleZoneChange(idx, 'min', e.target.value)} />
                <span>tot</span>
                <input style={styles.input} type="number" value={zone.max} onChange={(e) => handleZoneChange(idx, 'max', e.target.value)} />
              </div>
            ))}
          </div>
          <button onClick={saveSettings} style={{ ...styles.btn, marginTop: '20px', width: '100%', justifyContent: 'center' }}>
            <Save size={18} /> Instellingen Opslaan
          </button>
        </div>
      )}

      {/* Main Dashboard UI */}
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#94a3b8', fontWeight: 'bold' }}>LIVE HARTSLAG</span>
          {isRecording && <span style={{ color: '#ef4444', fontSize: '12px', fontWeight: 'bold' }}>● OPNAME BEZIG</span>}
        </div>
        <div style={styles.bpmText}>
          {heartRate || '--'}
          <span style={{ fontSize: '24px', marginLeft: '10px' }}>BPM</span>
        </div>
        
        <div style={{ height: '250px', width: '100%', marginTop: '20px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={historyData}>
              <CartesianGrid stroke="#334155" vertical={false} />
              <XAxis dataKey="time" hide={true} />
              <YAxis domain={[40, 220]} stroke="#64748b" />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none' }} />
              {zones.map(zone => (
                <ReferenceArea key={zone.name} y1={zone.min} y2={zone.max} fill={zone.color} fillOpacity={0.05} />
              ))}
              <Line type="monotone" dataKey="bpm" stroke={getZoneColor(heartRate)} strokeWidth={4} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={styles.card}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}><History size={20} /> Jouw Recente Sessies</h3>
        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {sessionHistory.length === 0 ? (
            <p style={{ color: '#64748b', textAlign: 'center' }}>Nog geen sessies opgenomen.</p>
          ) : (
            sessionHistory.map((s, i) => (
              <div key={i} style={{ borderBottom: '1px solid #334155', padding: '12px 0', display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 'bold' }}>
                    {s.sessionType === 30 ? '30s Speed' : (s.sessionType / 60) + 'm Endurance'}
                    <span style={{ marginLeft: '8px', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: s.category === 'Wedstrijd' ? '#ef4444' : '#475569' }}>
                      {s.category || 'Training'}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>{new Date(s.date).toLocaleString()}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#3b82f6', fontWeight: 'bold', fontSize: '18px' }}>{s.finalSteps} steps</div>
                  <div style={{ fontSize: '12px', color: '#ef4444' }}>Avg: {s.averageBPM} bpm</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
