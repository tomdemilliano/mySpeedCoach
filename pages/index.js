import { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { ref, set, get, update, push } from "firebase/database";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Heart, Activity, Bluetooth, Play, Square, Save } from 'lucide-react';

export default function HeartRateApp() {
  const [skipperName, setSkipperName] = useState('');
  const [heartRate, setHeartRate] = useState(0);
  const [deviceId, setDeviceId] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [history, setHistory] = useState([]);
  const [viewTime, setViewTime] = useState(60);

  // 1. Automatische herkenning van de skipper
  const identifySkipper = async (id) => {
    const skipperRef = ref(db, `registered_devices/${id}`);
    const snapshot = await get(skipperRef);
    if (snapshot.exists()) {
      setSkipperName(snapshot.val().name);
    }
  };

  // 2. Synchronisatie naar Firebase (alleen bij recording)
  useEffect(() => {
    if (isConnected && isRecording && heartRate > 0 && skipperName) {
      const sessionRef = ref(db, 'live_sessions/' + skipperName);
      
      update(sessionRef, {
        name: skipperName,
        bpm: heartRate,
        isRecording: isRecording,
        startTime: isRecording ? (skipper.startTime || Date.now()) : null,
        lastUpdate: Date.now()
      });
    }
  }, [heartRate, isRecording, skipperName, isConnected]);

  // 3. Grafiek data lokaal bijhouden
  useEffect(() => {
    let interval;
    if (isConnected && heartRate > 0) {
      interval = setInterval(() => {
        setHistory(prev => {
          const newData = [...prev, { time: new Date().toLocaleTimeString(), bpm: heartRate }];
          return newData.slice(-300); // Buffer voor 5 minuten
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isConnected, heartRate]);

  const connectHRM = async () => {
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['heart_rate'] }]
      });
      setDeviceId(device.id);
      setDeviceName(device.name || "Garmin Apparaat");
      await identifySkipper(device.id);

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('heart_rate');
      const char = await service.getCharacteristic('heart_rate_measurement');
      
      setIsConnected(true);
      char.startNotifications();
      char.addEventListener('characteristicvaluechanged', (e) => {
        setHeartRate(e.target.value.getUint8(1));
      });
    } catch (err) { console.error("Bluetooth Error:", err); }
  };

  const saveSkipperLink = () => {
    if (deviceId && skipperName) {
      set(ref(db, `registered_devices/${deviceId}`), { name: skipperName });
      alert(`Toestel gekoppeld aan ${skipperName}`);
    }
  };

const stopRecording = async () => {
  setIsRecording(false);

  if (history.length > 0) {
    // 1. Maak een uniek historiek-object
    const sessionData = {
      skipper: skipperName,
      date: new Date().toISOString(),
      finalSteps: 0, // Dit halen we zo op uit de live-data
      heartRateHistory: history, // De volledige array van de grafiek
      averageBPM: Math.round(history.reduce((a, b) => a + b.bpm, 0) / history.length),
      maxBPM: Math.max(...history.map(o => o.bpm))
    };

    // 2. Haal de laatste stappenstand op uit de live sessie
    const liveRef = ref(db, `live_sessions/${skipperName}`);
    const snapshot = await get(liveRef);
    if (snapshot.exists()) {
      sessionData.finalSteps = snapshot.val().steps || 0;
    }

    // 3. Opslaan in het archief
    const historyRef = ref(db, 'session_history');
    await push(historyRef, sessionData);

    // 4. Optioneel: de live sessie opschonen
    update(liveRef, { isRecording: false, steps: 0 });
    
    alert("Sessie opgeslagen in historiek!");
    setHistory([]); // Reset lokale grafiek voor volgende ronde
  }
};

  // --- STYLING (Hetzelfde als de gewenste versie) ---
  const styles = {
    container: { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'sans-serif', padding: '20px' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1000px', margin: '0 auto 30px', borderBottom: '1px solid #334155', paddingBottom: '15px' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '25px', maxWidth: '1000px', margin: '0 auto' },
    card: { backgroundColor: '#1e293b', padding: '25px', borderRadius: '15px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)', position: 'relative', overflow: 'hidden' },
    input: { width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', padding: '12px', borderRadius: '8px', marginBottom: '10px', boxSizing: 'border-box' },
    button: (active, color) => ({
      width: '100%', padding: '15px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer',
      backgroundColor: active ? color : '#334155', color: 'white', transition: '0.3s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
    }),
    hrDisplay: { fontSize: '80px', fontWeight: '900', margin: '10px 0', color: isRecording ? '#ef4444' : 'white' }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Activity color="#ef4444" size={32} />
          <span style={{ fontSize: '28px', fontWeight: '900', letterSpacing: '-1px' }}>SKIPPER PRO</span>
        </div>
        <div style={{ backgroundColor: '#1e293b', padding: '8px 20px', borderRadius: '25px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #334155' }}>
          <Bluetooth size={16} color={isConnected ? "#60a5fa" : "#94a3b8"} />
          <span style={{ color: isConnected ? "#60a5fa" : "#94a3b8", fontWeight: 'bold' }}>
            {isConnected ? deviceName : "GEEN VERBINDING"}
          </span>
        </div>
      </div>

      <div style={styles.grid}>
        {/* LINKER KOLOM: CONFIGURATIE */}
        <div style={styles.card}>
          <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>STAP 1: VERBINDEN</label>
          <button style={styles.button(!isConnected, '#2563eb')} onClick={connectHRM} disabled={isConnected}>
            <Bluetooth size={18} /> {isConnected ? 'GARMIN VERBONDEN' : 'SCAN GARMIN'}
          </button>

          <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 'bold', display: 'block', marginTop: '25px', marginBottom: '8px' }}>STAP 2: SKIPPER KOPPELEN</label>
          <input 
            style={styles.input}
            placeholder="Naam van de skipper..."
            value={skipperName}
            onChange={(e) => setSkipperName(e.target.value)}
          />
          {isConnected && (
            <button onClick={saveSkipperLink} style={{ width: '100%', background: 'none', border: '1px solid #334155', color: '#94a3b8', padding: '8px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', marginBottom: '20px' }}>
              <Save size={14} style={{ marginRight: '5px' }} /> Onthoud deze koppeling
            </button>
          )}

          <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 'bold', display: 'block', marginTop: '10px', marginBottom: '8px' }}>STAP 3: SESSIE</label>
            <button 
              style={styles.button(isConnected, isRecording ? '#ef4444' : '#22c55e')} 
              onClick={() => { 
                if(!isConnected || !skipperName) return alert("Verbind eerst!");
                if(isRecording) stopRecording(); 
                else setIsRecording(true); 
              }}>
              {isRecording ? <><Square size={18} fill="white" /> STOP & BEWAAR</> : <><Play size={18} fill="white" /> START OPNAME</>}
            </button>
        </div>

        {/* RECHTER KOLOM: LIVE DATA */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
          <div style={styles.card}>
            <span style={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '12px' }}>HUIDIGE HARTSLAG</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
              <div style={styles.hrDisplay}>{heartRate}</div>
              <span style={{ fontSize: '24px', color: '#64748b', fontWeight: 'bold' }}>BPM</span>
              <Heart 
                fill={isRecording ? "#ef4444" : "#334155"} 
                stroke="none" 
                style={{ marginLeft: 'auto', opacity: heartRate > 0 ? 1 : 0.2 }} 
                size={50} 
              />
            </div>
            {isRecording && <div style={{ color: '#ef4444', fontSize: '12px', fontWeight: 'bold', animate: 'pulse' }}>● LIVE RECORDING NAAR DASHBOARD</div>}
          </div>

          <div style={{ ...styles.card, height: '350px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
              <span style={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '12px' }}>HISTORIEK</span>
              <select 
                style={{ backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '4px', fontSize: '11px' }}
                value={viewTime}
                onChange={(e) => setViewTime(parseInt(e.target.value))}
              >
                <option value={30}>30 sec</option>
                <option value={60}>1 min</option>
                <option value={180}>3 min</option>
              </select>
            </div>
            
            <ResponsiveContainer width="100%" height="85%">
              <LineChart data={history.slice(-viewTime)} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#334155" vertical={false} strokeDasharray="3 3" />
                <XAxis 
                  dataKey="time" 
                  stroke="#64748b" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  label={{ value: 'Tijdstip', position: 'insideBottom', offset: -5, fill: '#64748b', fontSize: 10 }}
                />
                <YAxis 
                  stroke="#64748b" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  domain={['dataMin - 5', 'dataMax + 5']}
                  label={{ value: 'BPM', angle: -90, position: 'insideLeft', offset: 10, fill: '#64748b', fontSize: 10 }}
                />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', color: 'white', borderRadius: '8px' }} />
                <Line 
                  type="monotone" 
                  dataKey="bpm" 
                  stroke="#ef4444" 
                  strokeWidth={4} 
                  dot={false} 
                  isAnimationActive={false} 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
