import { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { ref, onValue } from "firebase/database";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Heart, Users } from 'lucide-react';

export default function Dashboard() {
  const [sessions, setSessions] = useState({});
  const [history, setHistory] = useState({});
  const [viewTime, setViewTime] = useState(60);

  useEffect(() => {
    const sessionsRef = ref(db, 'live_sessions/');
    
    // Luister live naar alle actieve sessies in Firebase
    return onValue(sessionsRef, (snapshot) => {
      const data = snapshot.val() || {};
      setSessions(data);

      // Werk de grafiek-geschiedenis bij voor elke skipper
      setHistory(prevHistory => {
        const newHistory = { ...prevHistory };
        const now = new Date().toLocaleTimeString();

        Object.keys(data).forEach(name => {
          if (data[name].isRecording) {
            const skipperPoints = newHistory[name] || [];
            newHistory[name] = [...skipperPoints, { time: now, bpm: data[name].bpm }].slice(-300);
          }
        });
        return newHistory;
      });
    });
  }, []);

  // --- STYLING (Gelijk aan Toestel A voor uniformiteit) ---
  const styles = {
    container: { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'sans-serif', padding: '20px' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1200px', margin: '0 auto 30px', borderBottom: '1px solid #334155', paddingBottom: '15px' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '25px', maxWidth: '1200px', margin: '0 auto' },
    card: { backgroundColor: '#1e293b', padding: '20px', borderRadius: '15px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)' },
    noData: { textAlign: 'center', marginTop: '100px', color: '#64748b' }
  };

  const activeSessions = Object.values(sessions).filter(s => s.isRecording);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Activity color="#ef4444" size={32} />
          <span style={{ fontSize: '28px', fontWeight: '900', letterSpacing: '-1px' }}>LIVE DASHBOARD</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <select 
            style={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: 'white', padding: '5px', borderRadius: '5px' }}
            value={viewTime}
            onChange={(e) => setViewTime(parseInt(e.target.value))}
          >
            <option value={30}>30 sec</option>
            <option value={60}>1 min</option>
            <option value={180}>3 min</option>
          </select>
          <div style={{ backgroundColor: '#334155', padding: '5px 15px', borderRadius: '20px', fontSize: '14px' }}>
            {activeSessions.length} Actieve Skippers
          </div>
        </div>
      </div>

      {activeSessions.length === 0 ? (
        <div style={styles.noData}>
          <Users size={48} style={{ marginBottom: '10px', opacity: 0.5 }} />
          <p>Wachten op actieve sessies...</p>
          <p style={{ fontSize: '12px' }}>Start een opname op Toestel A om hier data te zien.</p>
        </div>
      ) : (
        <div style={styles.grid}>
          {activeSessions.map((skipper) => (
            <div key={skipper.name} style={styles.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>{skipper.name}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '32px', fontWeight: '900', color: '#ef4444' }}>{skipper.bpm}</span>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>BPM</span>
                  <Heart fill="#ef4444" stroke="none" size={20} className="pulse" />
                </div>
              </div>

              <div style={{ height: '200px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={(history[skipper.name] || []).slice(-viewTime)}>
                    <CartesianGrid stroke="#334155" vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="time" hide />
                    <YAxis 
                      domain={['dataMin - 5', 'dataMax + 5']} 
                      stroke="#64748b" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false} 
                    />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '8px' }} />
                    <Line 
                      type="monotone" 
                      dataKey="bpm" 
                      stroke="#ef4444" 
                      strokeWidth={3} 
                      dot={false} 
                      isAnimationActive={false} 
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
