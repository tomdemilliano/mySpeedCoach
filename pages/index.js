import { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { ref, set } from "firebase/database";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Heart, Activity, Bluetooth } from 'lucide-react';

export default function HeartRateApp() {
  const [skipperName, setSkipperName] = useState('');
  const [heartRate, setHeartRate] = useState(0);
  const [deviceName, setDeviceName] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [history, setHistory] = useState([]);
  const [viewTime, setViewTime] = useState(60);

  useEffect(() => {
    if (isConnected && heartRate > 0) {
      const interval = setInterval(() => {
        setHistory(prev => {
          const newData = [...prev, { time: new Date().toLocaleTimeString(), bpm: heartRate }];
          return newData.slice(-200); 
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isConnected, heartRate]);

  const connectHRM = async () => {
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['heart_rate'] }]
      });
      setDeviceName(device.name || "Garmin Apparaat");
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('heart_rate');
      const char = await service.getCharacteristic('heart_rate_measurement');
      
      setIsConnected(true);
      char.startNotifications();
      char.addEventListener('characteristicvaluechanged', (e) => {
        const value = e.target.value;
        const hr = value.getUint8(1);
        setHeartRate(hr);
        if (skipperName) {
          set(ref(db, 'sessions/' + skipperName), {
            name: skipperName,
            bpm: hr,
            lastUpdate: Date.now()
          });
        }
      });
    } catch (err) {
      console.error(err);
    }
  };

  // --- STYLING OBJECTS ---
  const styles = {
    container: { backgroundColor: '#0f172a', minHeight: '100-vh', color: 'white', fontFamily: 'sans-serif', padding: '20px' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '900px', margin: '0 auto 30px', borderBottom: '1px solid #334155', paddingBottom: '15px' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', maxWidth: '900px', margin: '0 auto' },
    card: { backgroundColor: '#1e293b', padding: '25px', borderRadius: '15px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)' },
    input: { width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white', padding: '12px', borderRadius: '8px', marginBottom: '15px', boxSizing: 'border-box' },
    button: (connected) => ({
      width: '100%', padding: '15px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer',
      backgroundColor: connected ? '#16a34a' : '#2563eb', color: 'white', transition: '0.3s'
    }),
    hrDisplay: { fontSize: '80px', fontWeight: '900', margin: '10px 0' },
    chartContainer: { height: '250px', marginTop: '20px' }
  };

  const filteredData = history.slice(-(viewTime));

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Activity color="#ef4444" />
          <span style={{ fontSize: '24px', fontWeight: '900', letterSpacing: '-1px' }}>SKIPPER PRO</span>
        </div>
        <div style={{ backgroundColor: '#334155', padding: '5px 15px', borderRadius: '20px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bluetooth size={14} color={isConnected ? "#60a5fa" : "#94a3b8"} />
          {isConnected ? deviceName : "Geen verbinding"}
        </div>
      </div>

      <div style={styles.grid}>
        {/* Links: Controls */}
        <div style={styles.card}>
          <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 'bold' }}>SKIPPER NAAM</label>
          <input 
            style={styles.input}
            placeholder="Naam skipper..."
            value={skipperName}
            onChange={(e) => setSkipperName(e.target.value)}
          />
          <button style={styles.button(isConnected)} onClick={connectHRM}>
            {isConnected ? 'GEKOPPELD' : 'VERBIND GARMIN'}
          </button>

          <div style={{ marginTop: '30px' }}>
            <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 'bold' }}>GRAFIEK VENSTER</label>
            <select 
              style={styles.input}
              value={viewTime}
              onChange={(e) => setViewTime(parseInt(e.target.value))}
            >
              <option value={30}>30 Seconden</option>
              <option value={60}>1 Minuut</option>
              <option value={180}>3 Minuten</option>
            </select>
          </div>
        </div>

        {/* Rechts: Live Data */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={styles.card}>
            <span style={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '12px' }}>LIVE HARTSLAG</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
              <div style={styles.hrDisplay}>{heartRate}</div>
              <span style={{ fontSize: '20px', color: '#64748b' }}>BPM</span>
              <Heart 
                fill="#ef4444" 
                stroke="none" 
                style={{ marginLeft: 'auto', opacity: heartRate > 0 ? 1 : 0.2 }} 
                size={40} 
              />
            </div>
          </div>

<div style={{ ...styles.card, height: '300px' }}>
  <ResponsiveContainer width="100%" height="100%">
    <LineChart data={filteredData} margin={{ top: 5, right: 20, left: 0, bottom: 20 }}>
      <CartesianGrid stroke="#334155" vertical={false} strokeDasharray="3 3" />
      
      {/* X-as: Tijd */}
      <XAxis 
        dataKey="time" 
        stroke="#94a3b8" 
        fontSize={12}
        tickLine={false}
        axisLine={false}
        label={{ value: 'Tijd', position: 'insideBottom', offset: -10, fill: '#94a3b8', fontSize: 12, fontWeight: 'bold' }}
      />
      
      {/* Y-as: Hartslag (BPM) */}
      <YAxis 
        stroke="#94a3b8" 
        fontSize={12}
        tickLine={false}
        axisLine={false}
        domain={['dataMin - 10', 'dataMax + 10']}
        label={{ value: 'BPM', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12, fontWeight: 'bold' }}
      />
      
      <Tooltip 
        contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: 'white' }}
        itemStyle={{ color: '#ef4444' }}
      />
      
      <Line 
        type="monotone" 
        dataKey="bpm" 
        stroke="#ef4444" 
        strokeWidth={4} 
        dot={false} 
        isAnimationActive={false} 
        name="Hartslag"
      />
    </LineChart>
  </ResponsiveContainer>
</div>
        </div>
      </div>
    </div>
  );
}
