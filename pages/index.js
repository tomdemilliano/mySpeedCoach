import { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { ref, set, get, update, push, onValue } from "firebase/database";
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

  // NIEUW: Luisteren naar de teller via Firebase (Remote Trigger)
  useEffect(() => {
    if (skipperName) {
      const recordingRef = ref(db, `live_sessions/${skipperName}/isRecording`);
      return onValue(recordingRef, (snapshot) => {
        const remoteStatus = snapshot.val();
        setIsRecording(!!remoteStatus);
      });
    }
  }, [skipperName]);

  // 2. Synchronisatie naar Firebase (alleen bij recording)
  useEffect(() => {
    if (isConnected && isRecording && heartRate > 0 && skipperName) {
      const sessionRef = ref(db, 'live_sessions/' + skipperName);
      
      update(sessionRef, {
        name: skipperName,
        bpm: heartRate,
        isRecording: true,
        lastUpdate: Date.now()
      });

      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setHistory(prev => [...prev, { time: now, bpm: heartRate }].slice(-200));
    }
  }, [heartRate, isConnected, isRecording, skipperName]);

  // 3. Bluetooth Logica
  const parseHeartRate = (value) => {
    const flags = value.getUint8(0);
    const is16Bits = flags & 0x1;
    if (is16Bits) {
      return value.getUint16(1, true);
    } else {
      return value.getUint8(1);
    }
  };

  const connectBluetooth = async () => {
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['heart_rate'] }],
      });

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('heart_rate');
      const characteristic = await service.getCharacteristic('heart_rate_measurement');
      
      setDeviceId(device.id);
      setDeviceName(device.name);
      setIsConnected(true);
      
      identifySkipper(device.id);

      characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', (event) => {
        const hr = parseHeartRate(event.target.value);
        setHeartRate(hr);
      });

    } catch (error) {
      console.error(error);
      setIsConnected(false);
    }
  };

  // 4. Sessie acties
  const saveSession = async () => {
    if (history.length === 0) return;
    
    const historyRef = ref(db, 'session_history');
    const finalStepsSnapshot = await get(ref(db, `live_sessions/${skipperName}/steps`));
    
    await push(historyRef, {
      skipper: skipperName,
      date: Date.now(),
      data: history,
      finalSteps: finalStepsSnapshot.val() || 0,
      averageBPM: Math.round(history.reduce((a, b) => a + b.bpm, 0) / history.length),
      maxBPM: Math.max(...history.map(h => h.bpm))
    });
    
    update(ref(db, `live_sessions/${skipperName}`), {
      steps: 0,
      isRecording: false
    });
    
    setHistory([]);
    alert("Sessie succesvol opgeslagen!");
  };

  const styles = {
    container: { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', padding: '20px', fontFamily: 'sans-serif' },
    card: { backgroundColor: '#1e293b', borderRadius: '20px', padding: '25px', marginBottom: '20px', border: '1px solid #334155' },
    button: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 24px', borderRadius: '12px', border: 'none', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s' },
    input: { backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '12px', color: 'white', width: '100%', marginTop: '10px', boxSizing: 'border-box' }
  };

  return (
    <div style={styles.container}>
      <h1 style={{ fontSize: '24px', fontWeight: '900', marginBottom: '25px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Activity color="#ef4444" size={32} /> SKIPPER DASHBOARD
      </h1>

      {/* Connect Card */}
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '5px' }}>APPARAAT</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{isConnected ? deviceName : 'Niet verbonden'}</div>
          </div>
          <button 
            onClick={connectBluetooth} 
            style={{ ...styles.button, backgroundColor: isConnected ? '#065f46' : '#3b82f6', color: 'white' }}
          >
            <Bluetooth size={20} /> {isConnected ? 'Verbonden' : 'Verbind Garmin'}
          </button>
        </div>
        
        <input 
          style={styles.input}
          placeholder="Naam skipper..."
          value={skipperName}
          onChange={(e) => setSkipperName(e.target.value)}
        />
      </div>

      {/* Recording Status Card */}
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '5px' }}>OPNAME STATUS</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ 
                width: '10px', 
                height: '10px', 
                borderRadius: '50%', 
                backgroundColor: isRecording ? '#22c55e' : '#ef4444',
                boxShadow: isRecording ? '0 0 10px #22c55e' : 'none'
              }}></div>
              {isRecording ? "LIVE BEZIG" : "WACHTEN OP START"}
            </div>
          </div>
          <button 
            onClick={saveSession}
            disabled={!history.length}
            style={{ ...styles.button, backgroundColor: '#1e293b', color: '#94a3b8', border: '1px solid #334155', opacity: history.length ? 1 : 0.5 }}
          >
            <Save size={20} /> Opslaan
          </button>
        </div>
      </div>

      {/* Heart Rate Display */}
      <div style={{ ...styles.card, textAlign: 'center' }}>
        <Heart color="#ef4444" size={48} style={{ margin: '0 auto 10px' }} fill="#ef4444" />
        <div style={{ fontSize: '64px', fontWeight: '900' }}>{heartRate}</div>
        <div style={{ color: '#94a3b8', letterSpacing: '2px' }}>BPM</div>
      </div>

      {/* Graph Area */}
      <div style={{ ...styles.card, height: '350px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ fontWeight: 'bold' }}>LIVE MONITOR</div>
          <select 
            style={{ backgroundColor: '#0f172a', border: 'none', color: '#64748b' }}
            onChange={(e) => setViewTime(Number(e.target.value))}
            value={viewTime}
          >
            <option value="60">60 sec</option>
            <option value="120">2 min</option>
            <option value="300">5 min</option>
          </select>
        </div>
        
        <ResponsiveContainer width="100%" height="80%">
          <LineChart data={history.slice(-viewTime)} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="#334155" vertical={false} strokeDasharray="3 3" />
            <XAxis 
              dataKey="time" 
              stroke="#64748b" 
              fontSize={10} 
              tickLine={false} 
              axisLine={false}
            />
            <YAxis 
              stroke="#64748b" 
              fontSize={10} 
              tickLine={false} 
              axisLine={false} 
              domain={['dataMin - 5', 'dataMax + 5']}
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
  );
}
