import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebaseConfig';
import { ref, onValue, update, query, orderByChild, equalTo } from "firebase/database";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from 'recharts';
import { Bluetooth, Heart, User, Settings, History, Check, X, Save, AlertCircle } from 'lucide-react';

// Default hartslagzones
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
  
  const [zones, setZones] = useState(DEFAULT_ZONES);
  const [isClient, setIsClient] = useState(false);

  const [historyData, setHistoryData] = useState([]);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const lastSentBpm = useRef(0);

  const getZoneColor = (bpm) => {
    const zone = zones.find(z => bpm >= z.min && bpm < z.max);
    return zone ? zone.color : '#94a3b8';
  };

  // 1. Bluetooth & Pairing Logica
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

  // Gebruik een useEffect om data uit localStorage te laden bij de start
  useEffect(() => {
    setIsClient(true);
  
    // Laad zones
    const savedZones = localStorage.getItem('hr_zones');
    if (savedZones) {
      setZones(JSON.parse(savedZones));
    }

    // Als er al een verbonden device was, probeer de naam te herstellen
    // (Optioneel: je kan hier ook checken op deviceName als die nog in state staat)
  }, []);
  
  // 2. Firebase Sync & Monitoring
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
        setIsRecording(snapshot.val()?.isRecording || false);
      });
    }
  }, [heartRate, isConnected, skipperName]);

  // 3. Historiek ophalen
  useEffect(() => {
    if (skipperName) {
      const hRef = query(ref(db, 'session_history'), orderByChild('skipper'), equalTo(skipperName));
      return onValue(hRef, (snapshot) => {
        const sorted = Object.values(snapshot.val() || {}).sort((a, b) => b.date - a.date);
        setSessionHistory(sorted);
      });
    }
  }, [skipperName]);

  // 4. Instellingen Validatie & Opslaan
  const handleZoneChange = (index, field, value) => {
    const newZones = [...zones];
    newZones[index][field] = parseInt(value) || 0;
    setZones(newZones);
  };

  const saveSettings = () => {
    if (typeof window === 'undefined') return;
    
    // Validatie: Sluiten ze op elkaar aan? Geen overlap?
    for (let i = 0; i < zones.length; i++) {
      if (zones[i].min >= zones[i].max) {
        alert(`Fout in ${zones[i].name}: Minimum moet lager zijn dan maximum.`);
        return;
      }
      if (i > 0 && zones[i].min !== zones[i-1].max) {
        alert(`Zones moeten op elkaar aansluiten. ${zones[i].name} moet starten op ${zones[i-1].max}.`);
        return;
      }
    }
    localStorage.setItem('hr_zones', JSON.stringify(zones));
    localStorage.setItem(`hrm_${deviceName}`, skipperName);
    setShowSettings(false);
    alert("Instellingen opgeslagen!");
  };

  const styles = {
    container: { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', padding: '20px', fontFamily: 'sans-serif' },
    card: { backgroundColor: '#1e293b', borderRadius: '15px', padding: '20px', marginBottom: '20px', border: '1px solid #334155' },
    bpmText: { fontSize: '72px', fontWeight: '900', color: getZoneColor(heartRate), margin: '10px 0', textAlign: 'center' },
    btn: { backgroundColor: '#3b82f6', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' },
    input: { backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', padding: '8px', borderRadius: '5px', width: '60px' },
    nameDisplay: { fontSize: '18px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }
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
            <button onClick={() => setShowSettings(!showSettings)} style={{ ...styles.btn, backgroundColor: '#475569' }}>
              <Settings size={20} />
            </button>
          )}
          {!isConnected && <button onClick={connectBluetooth} style={styles.btn}><Bluetooth size={20} /> Koppel HRM</button>}
        </div>
      </div>

      {/* Instellingen Panel */}
      {showSettings && (
        <div style={{ ...styles.card, borderColor: '#3b82f6' }}>
          <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '10px' }}><Settings size={20}/> Beheer Instellingen</h3>
          
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8' }}>Naam aanpassen:</label>
            <input 
              style={{ ...styles.input, width: '200px' }} 
              value={skipperName} 
              onChange={(e) => setSkipperName(e.target.value)} 
            />
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

      {/* Naam Bevestiging (Quick actions) */}
      {isConfirmingName && !showSettings && (
        <div style={{ backgroundColor: '#3b82f6', padding: '15px', borderRadius: '10px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Ben jij <strong>{skipperName}</strong>?</span>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setIsConfirmingName(false)} style={{ backgroundColor: '#22c55e', border: 'none', color: 'white', padding: '5px 15px', borderRadius: '5px', cursor: 'pointer' }}>Ja</button>
            <button onClick={() => setShowSettings(true)} style={{ backgroundColor: '#ef4444', border: 'none', color: 'white', padding: '5px 15px', borderRadius: '5px', cursor: 'pointer' }}>Nee, aanpassen</button>
          </div>
        </div>
      )}

      {/* Main Dashboard UI (Bestaande layout behouden) */}
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
