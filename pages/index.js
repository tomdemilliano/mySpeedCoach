import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebaseConfig';
import { ref, onValue, update, query, orderByChild, equalTo } from "firebase/database";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from 'recharts';
import { Bluetooth, Heart, User, Settings, History, Check, X } from 'lucide-react';

// Configuratie van de zones (kan later dynamisch gemaakt worden)
const HR_ZONES = [
  { name: 'Warm-up', min: 0, max: 120, color: '#94a3b8' },   // Grijs
  { name: 'Fat Burn', min: 120, max: 145, color: '#22c55e' }, // Groen
  { name: 'Aerobic', min: 145, max: 165, color: '#facc15' },  // Geel
  { name: 'Anaerobic', min: 165, max: 185, color: '#f97316' }, // Oranje
  { name: 'Red Line', min: 185, max: 250, color: '#ef4444' }   // Rood
];

const getZoneColor = (bpm) => {
  const zone = HR_ZONES.find(z => bpm >= z.min && bpm < z.max);
  return zone ? zone.color : '#94a3b8';
};

export default function SkipperDashboard() {
  const [heartRate, setHeartRate] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [skipperName, setSkipperName] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [isConfirmingName, setIsConfirmingName] = useState(false);
  const [historyData, setHistoryData] = useState([]);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [isRecording, setIsRecording] = useState(false);

  // 1. Koppeling & Device Memory
  const connectBluetooth = async () => {
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['heart_rate'] }]
      });
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('heart_rate');
      const characteristic = await service.getCharacteristic('heart_rate_measurement');

      setDeviceName(device.name);
      
      // Check of device bekend is in localStorage
      const savedName = localStorage.getItem(`hrm_${device.name}`);
      if (savedName) {
        setSkipperName(savedName);
        setIsConfirmingName(true);
      } else {
        askNewName(device.name);
      }

      characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', (event) => {
        const value = event.target.value;
        const bpm = value.getUint8(1);
        setHeartRate(bpm);
      });

      setIsConnected(true);
    } catch (error) {
      console.error("Bluetooth Error:", error);
    }
  };

  const askNewName = (devName) => {
    const name = prompt("Nieuwe hartslagmeter gedetecteerd. Wat is jouw naam?");
    if (name) {
      saveUser(name, devName);
    }
  };

  const saveUser = (name, devName) => {
    setSkipperName(name);
    localStorage.setItem(`hrm_${devName}`, name);
    setIsConfirmingName(false);
  };

  // 2. Continue Monitoring & Firebase Sync
  useEffect(() => {
    if (isConnected && skipperName) {
      const liveRef = ref(db, `live_sessions/${skipperName}`);
      
      // Update hartslag in Firebase (altijd)
      update(liveRef, {
        name: skipperName,
        bpm: heartRate,
        lastUpdate: Date.now()
      });

      // Voeg toe aan lokale grafiek (altijd)
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setHistoryData(prev => [...prev, { time: now, bpm: heartRate }].slice(-100));

      // Check of er een opname loopt via de counter-app
      return onValue(liveRef, (snapshot) => {
        const data = snapshot.val();
        setIsRecording(data?.isRecording || false);
      });
    }
  }, [heartRate, isConnected, skipperName]);

  // 3. Sessie Historiek ophalen
  useEffect(() => {
    if (skipperName) {
      const hRef = query(ref(db, 'session_history'), orderByChild('skipper'), equalTo(skipperName));
      return onValue(hRef, (snapshot) => {
        const data = snapshot.val() || {};
        const sorted = Object.values(data).sort((a, b) => b.date - a.date);
        setSessionHistory(sorted);
      });
    }
  }, [skipperName]);

  const styles = {
    container: { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', padding: '20px', fontFamily: 'sans-serif' },
    card: { backgroundColor: '#1e293b', borderRadius: '15px', padding: '20px', marginBottom: '20px', border: '1px solid #334155' },
    bpmText: { fontSize: '72px', fontWeight: '900', color: getZoneColor(heartRate), margin: '10px 0', textAlign: 'center', transition: 'color 0.3s' },
    btn: { backgroundColor: '#3b82f6', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' },
    confirmBox: { backgroundColor: '#3b82f6', padding: '15px', borderRadius: '10px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
  };

  return (
    <div style={styles.container}>
      {/* Header & Connect */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>Skipper Dashboard</h1>
        {!isConnected ? (
          <button onClick={connectBluetooth} style={styles.btn}><Bluetooth size={20} /> Koppel HRM</button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#22c55e' }}>
            <Check size={20} /> Verbonden ({deviceName})
          </div>
        )}
      </div>

      {/* Naam Bevestiging */}
      {isConfirmingName && (
        <div style={styles.confirmBox}>
          <span>Ben jij <strong>{skipperName}</strong>?</span>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setIsConfirmingName(false)} style={{ backgroundColor: '#22c55e', border: 'none', color: 'white', padding: '5px 15px', borderRadius: '5px', cursor: 'pointer' }}>Ja</button>
            <button onClick={() => askNewName(deviceName)} style={{ backgroundColor: '#ef4444', border: 'none', color: 'white', padding: '5px 15px', borderRadius: '5px', cursor: 'pointer' }}>Nee</button>
          </div>
        </div>
      )}

      {/* Main Stats */}
      <div style={styles.grid}>
        <div style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#94a3b8', fontWeight: 'bold' }}>LIVE HARTSLAG</span>
            {isRecording && <span style={{ color: '#ef4444', fontSize: '12px', fontWeight: 'bold' }}>● OPNAME BEZIG</span>}
          </div>
          <div style={styles.bpmText}>
            {heartRate || '--'}
            <span style={{ fontSize: '24px', marginLeft: '10px' }}>BPM</span>
          </div>
          
          {/* Grafiek met Zones */}
          <div style={{ height: '250px', width: '100%', marginTop: '20px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historyData}>
                <CartesianGrid stroke="#334155" vertical={false} />
                <XAxis dataKey="time" hide={true} />
                <YAxis domain={[40, 220]} stroke="#64748b" />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none' }} />
                
                {/* Visuele zones in de achtergrond */}
                {HR_ZONES.map(zone => (
                  <ReferenceArea key={zone.name} y1={zone.min} y2={zone.max} fill={zone.color} fillOpacity={0.05} />
                ))}

                <Line 
                  type="monotone" 
                  dataKey="bpm" 
                  stroke={getZoneColor(heartRate)} 
                  strokeWidth={4} 
                  dot={false} 
                  isAnimationActive={false} 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Historiek Lijst */}
        <div style={styles.card}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <History size={20} /> Jouw Recente Sessies
          </h3>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {sessionHistory.length === 0 ? (
              <p style={{ color: '#64748b', textAlign: 'center' }}>Nog geen sessies opgenomen.</p>
            ) : (
              sessionHistory.map((s, i) => (
                <div key={i} style={{ borderBottom: '1px solid #334155', padding: '12px 0', display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{s.sessionType === 30 ? '30s Speed' : (s.sessionType / 60) + 'm Endurance'}</div>
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
    </div>
  );
}
