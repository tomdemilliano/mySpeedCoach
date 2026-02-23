import { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { ref, set, get, onValue } from "firebase/database";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Heart, Activity, Bluetooth, Play, Square } from 'lucide-react';

export default function HeartRateApp() {
  const [skipperName, setSkipperName] = useState('');
  const [heartRate, setHeartRate] = useState(0);
  const [deviceId, setDeviceId] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [history, setHistory] = useState([]);
  const [viewTime, setViewTime] = useState(60);

  // 1. Zoek skipper op basis van Bluetooth ID
  const identifySkipper = async (id) => {
    const skipperRef = ref(db, `registered_devices/${id}`);
    const snapshot = await get(skipperRef);
    if (snapshot.exists()) {
      setSkipperName(snapshot.val().name);
    } else {
      setSkipperName(''); // Nieuw apparaat
    }
  };

  // 2. Data naar Firebase sturen (alleen tijdens opname)
  useEffect(() => {
    if (isConnected && isRecording && heartRate > 0) {
      set(ref(db, `live_sessions/${skipperName}`), {
        name: skipperName,
        bpm: heartRate,
        isRecording: isRecording,
        timestamp: Date.now()
      });
    }
  }, [heartRate, isRecording]);

  // 3. Grafiek data bijhouden (lokaal)
  useEffect(() => {
    let interval;
    if (isConnected && heartRate > 0) {
      interval = setInterval(() => {
        setHistory(prev => [...prev, { time: new Date().toLocaleTimeString(), bpm: heartRate }].slice(-200));
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
      setDeviceName(device.name);
      await identifySkipper(device.id);

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('heart_rate');
      const char = await service.getCharacteristic('heart_rate_measurement');
      
      setIsConnected(true);
      char.startNotifications();
      char.addEventListener('characteristicvaluechanged', (e) => {
        setHeartRate(e.target.value.getUint8(1));
      });
    } catch (err) { console.error(err); }
  };

  const saveSkipperLink = () => {
    if (deviceId && skipperName) {
      set(ref(db, `registered_devices/${deviceId}`), { name: skipperName });
      alert("Skipper gekoppeld aan dit apparaat!");
    }
  };

  // Styles (zie vorige stap, toegevoegd voor knoppen)
  const styles = {
    container: { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'sans-serif', padding: '20px' },
    card: { backgroundColor: '#1e293b', padding: '25px', borderRadius: '15px', marginBottom: '20px' },
    input: { width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', padding: '12px', borderRadius: '8px', marginBottom: '10px' },
    btnRecord: (active) => ({
      width: '100%', padding: '15px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer',
      backgroundColor: active ? '#ef4444' : '#22c55e', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginTop: '10px'
    })
  };

  return (
    <div style={styles.container}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Activity color="#ef4444" /> SKIPPER PRO</h1>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>
          {/* Controls */}
          <div>
            <div style={styles.card}>
              <button style={{ width: '100%', padding: '10px', marginBottom: '15px' }} onClick={connectHRM}>
                {isConnected ? `Verbonden: ${deviceName}` : "SCAN GARMIN"}
              </button>
              
              <label style={{ fontSize: '11px', color: '#94a3b8' }}>SKIPPER</label>
              <input 
                style={styles.input} 
                value={skipperName} 
                onChange={(e) => setSkipperName(e.target.value)} 
                placeholder="Naam skipper..."
              />
              {!isRecording && isConnected && (
                <button onClick={saveSkipperLink} style={{ fontSize: '10px', background: 'none', border: '1px solid #334155', color: '#94a3b8', cursor: 'pointer' }}>
                  Koppel naam aan deze Garmin
                </button>
              )}

              {isConnected && (
                <button 
                  style={styles.btnRecord(isRecording)} 
                  onClick={() => setIsRecording(!isRecording)}
                >
                  {isRecording ? <><Square size={16}/> STOP SESSIE</> : <><Play size={16}/> START RECORDING</>}
                </button>
              )}
            </div>
          </div>

          {/* Live View & Grafiek */}
          <div>
            <div style={styles.card}>
              <div style={{ fontSize: '60px', fontWeight: '900', color: isRecording ? '#ef4444' : 'white' }}>
                {heartRate} <span style={{ fontSize: '20px' }}>BPM</span>
              </div>
              <div style={{ height: '250px', marginTop: '20px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history.slice(-viewTime)}>
                    <CartesianGrid stroke="#334155" vertical={false} />
                    <XAxis dataKey="time" hide />
                    <YAxis domain={['dataMin-5', 'dataMax+5']} stroke="#94a3b8" />
                    <Line type="monotone" dataKey="bpm" stroke="#ef4444" strokeWidth={3} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
