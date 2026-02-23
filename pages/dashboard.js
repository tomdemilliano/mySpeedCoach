import { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { ref, onValue } from "firebase/database";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Heart, Users, Hash, TrendingUp } from 'lucide-react';

export default function Dashboard() {
  const [sessions, setSessions] = useState({});
  const [history, setHistory] = useState({});
  const [viewTime, setViewTime] = useState(60);

  useEffect(() => {
    const sessionsRef = ref(db, 'live_sessions/');
    
    // Luister live naar alle data in de database
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
            // Voeg nieuw punt toe en behoud buffer
            newHistory[name] = [...skipperPoints, { 
              time: now, 
              bpm: data[name].bpm || 0 
            }].slice(-300);
          }
        });
        return newHistory;
      });
    });
  }, []);

  const styles = {
    container: { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'sans-serif', padding: '20px' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1200px', margin: '0 auto 30px', borderBottom: '1px solid #334155', paddingBottom: '15px' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '30px', maxWidth: '1200px', margin: '0 auto' },
    card: { backgroundColor: '#1e293b', padding: '25px', borderRadius: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', border: '1px solid #334155' },
    statBox: { backgroundColor: '#0f172a', padding: '15px', borderRadius: '12px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' },
    noData: { textAlign: 'center', marginTop: '150px', color: '#64748b' }
  };

  const activeSessions = Object.values(sessions).filter(s => s.isRecording);

  return (
    <div style={styles.container}>
      {/* Header sectie */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ backgroundColor: '#ef4444', padding: '8px', borderRadius: '10px' }}>
            <Activity color="white" size={24} />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: '900', margin: 0, letterSpacing: '-0.5px' }}>LIVE COMPETITION MONITOR</h1>
        </div>
        
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select 
            style={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: 'white', padding: '8px 15px', borderRadius: '10px', fontSize: '14px' }}
            value={viewTime}
            onChange={(e) => setViewTime(parseInt(e.target.value))}
          >
            <option value={30}>30 sec focus</option>
            <option value={60}>1 minuut overzicht</option>
            <option value={180}>3 minuten overzicht</option>
          </select>
          <div style={{ backgroundColor: '#22c55e22', border: '1px solid #22c55e', color: '#22c55e', padding: '8px 20px', borderRadius: '25px', fontSize: '14px', fontWeight: 'bold' }}>
             {activeSessions.length} SKIPPERS LIVE
          </div>
        </div>
      </div>

      {activeSessions.length === 0 ? (
        <div style={styles.noData}>
          <Users size={64} style={{ marginBottom: '20px', opacity: 0.2 }} />
          <h2>Wachten op actieve skippers...</h2>
          <p>Zodra een skipper "Start Recording" drukt, verschijnt de data hier.</p>
        </div>
      ) : (
        <div style={styles.grid}>
          {activeSessions.map((skipper) => (
            <div key={skipper.name} style={styles.card}>
              {/* Naam en Status */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, fontSize: '26px', fontWeight: '900', color: '#f8fafc' }}>{skipper.name}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#22c55e' }}>
                  <div style={{ width: '8px', height: '8px', backgroundColor: '#22c55e', borderRadius: '50%', animation: 'pulse 2s infinite' }}></div>
                  LIVE VERBINDING
                </div>
              </div>

              {/* Hoofdstatistieken: Hartslag & Steps */}
              <div style={{ display: 'flex', gap: '15px', marginBottom: '25px' }}>
                <div style={styles.statBox}>
                  <div style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>HARTSLAG</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                    <span style={{ fontSize: '48px', fontWeight: '900', color: '#ef4444' }}>{skipper.bpm || 0}</span>
                    <span style={{ color: '#ef4444', fontWeight: 'bold' }}>BPM</span>
                  </div>
                  <Heart fill="#ef4444" stroke="none" size={16} />
                </div>

                <div style={{ ...styles.statBox, border: '1px solid #22c55e44' }}>
                  <div style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>SPEEDSTEPS</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                    <span style={{ fontSize: '48px', fontWeight: '900', color: '#22c55e' }}>{skipper.steps || 0}</span>
                    <span style={{ color: '#22c55e', fontWeight: 'bold' }}>STPS</span>
                  </div>
                  <TrendingUp color="#22c55e" size={16} />
                </div>
              </div>

              {/* Grafiek-sectie */}
              <div style={{ height: '220px', backgroundColor: '#0f172a', padding: '15px', borderRadius: '12px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={(history[skipper.name] || []).slice(-viewTime)} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                    <CartesianGrid stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="time" hide />
                    <YAxis 
                      domain={['dataMin - 10', 'dataMax + 10']} 
                      stroke="#475569" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false} 
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                      itemStyle={{ color: '#ef4444' }}
                    />
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
          ))}
        </div>
      )}
    </div>
  );
}
