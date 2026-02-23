import { useState, useEffect, useRef } from 'react';
import { db } from '../firebaseConfig';
import { ref, onValue } from "firebase/database";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Heart, Users, Hash, Zap, Timer, TrendingUp } from 'lucide-react';

export default function Dashboard() {
  const [sessions, setSessions] = useState({});
  const [history, setHistory] = useState({});
  const [viewTime, setViewTime] = useState(60);
  const [elapsedTimes, setElapsedTimes] = useState({}); // Voor de live secondeteller
  
  const lastStepsRef = useRef({});
  const currentSessionsRef = useRef({});

  // 1. Luister live naar de database updates
  useEffect(() => {
    const sessionsRef = ref(db, 'live_sessions/');
    return onValue(sessionsRef, (snapshot) => {
      const data = snapshot.val() || {};
      setSessions(data);
      currentSessionsRef.current = data;
    });
  }, []);

  // 2. De Centrale Klok: Elke seconde tempo berekenen + timer bijwerken
  useEffect(() => {
    const interval = setInterval(() => {
      const data = currentSessionsRef.current;
      const now = new Date();
      const nowString = now.toLocaleTimeString();
      const newElapsedTimes = {};

      setHistory(prevHistory => {
        const newHistory = { ...prevHistory };

        Object.keys(data).forEach(name => {
          if (data[name].isRecording) {
            // --- A. Chronometer Logica ---
            if (data[name].startTime) {
              const diffInSecs = Math.floor((Date.now() - data[name].startTime) / 1000);
              const mins = Math.floor(diffInSecs / 60);
              const secs = diffInSecs % 60;
              newElapsedTimes[name] = `${mins}:${secs.toString().padStart(2, '0')}`;
            } else {
              newElapsedTimes[name] = "0:00";
            }

            // --- B. Tempo Logica (Stabiele 1s meting) ---
            const currentTotalSteps = data[name].steps || 0;
            const previousTotalSteps = lastStepsRef.current[name] || 0;
            const stepsThisSecond = Math.max(0, currentTotalSteps - previousTotalSteps);
            const calculatedTempo = stepsThisSecond * 30;

            const skipperPoints = newHistory[name] || [];
            newHistory[name] = [...skipperPoints, { 
              time: nowString, 
              bpm: data[name].bpm || 0,
              tempo: calculatedTempo 
            }].slice(-300);

            // Update referentie voor de volgende seconde
            lastStepsRef.current[name] = currentTotalSteps;
          }
        });
        return newHistory;
      });
      
      setElapsedTimes(newElapsedTimes);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const styles = {
    container: { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'sans-serif', padding: '20px' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1200px', margin: '0 auto 30px', borderBottom: '1px solid #334155', paddingBottom: '15px' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '30px', maxWidth: '1200px', margin: '0 auto' },
    card: { backgroundColor: '#1e293b', padding: '25px', borderRadius: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', border: '1px solid #334155', position: 'relative' },
    statBox: { backgroundColor: '#0f172a', padding: '15px', borderRadius: '12px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', border: '1px solid #1e293b' },
    timerBadge: { display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#334155', padding: '6px 16px', borderRadius: '12px', fontSize: '20px', fontWeight: 'bold', color: '#60a5fa', fontFamily: 'monospace', border: '1px solid #475569' },
    noData: { textAlign: 'center', marginTop: '150px', color: '#64748b' }
  };

  const activeSessions = Object.values(sessions).filter(s => s.isRecording);

  return (
    <div style={styles.container}>
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
          <p>Start de opname op Toestel A om de monitoring te starten.</p>
        </div>
      ) : (
        <div style={styles.grid}>
          {activeSessions.map((skipper) => {
            const skipperHistory = history[skipper.name] || [];
            const currentTempo = skipperHistory.length > 0 ? skipperHistory[skipperHistory.length - 1].tempo : 0;

            return (
              <div key={skipper.name} style={styles.card}>
                {/* Naam en Timer Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h2 style={{ margin: 0, fontSize: '26px', fontWeight: '900', color: '#f8fafc' }}>{skipper.name}</h2>
                  <div style={styles.timerBadge}>
                    <Timer size={20} />
                    {elapsedTimes[skipper.name] || "0:00"}
                  </div>
                </div>

                {/* Hoofdstatistieken: Hartslag, Totaal Steps, Actueel Tempo */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '25px' }}>
                  <div style={styles.statBox}>
                    <div style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 'bold', marginBottom: '5px' }}>HARTSLAG</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px' }}>
                      <span style={{ fontSize: '32px', fontWeight: '900', color: '#ef4444' }}>{skipper.bpm || 0}</span>
                      <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '12px' }}>BPM</span>
                    </div>
                    <Heart fill="#ef4444" stroke="none" size={14} />
                  </div>

                  <div style={{ ...styles.statBox, border: '1px solid #22c55e44' }}>
                    <div style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 'bold', marginBottom: '5px' }}>TOTAAL</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px' }}>
                      <span style={{ fontSize: '32px', fontWeight: '900', color: '#22c55e' }}>{skipper.steps || 0}</span>
                      <span style={{ color: '#22c55e', fontWeight: 'bold', fontSize: '12px' }}>STPS</span>
                    </div>
                    <Hash color="#22c55e" size={14} />
                  </div>

                  <div style={{ ...styles.statBox, border: '1px solid #60a5fa44', backgroundColor: '#0f172a' }}>
                    <div style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 'bold', marginBottom: '5px' }}>TEMPO (/30S)</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px' }}>
                      <span style={{ fontSize: '32px', fontWeight: '900', color: '#60a5fa' }}>{currentTempo}</span>
                    </div>
                    <Zap fill="#60a5fa" stroke="none" size={14} />
                  </div>
                </div>

                {/* Grafiek-sectie */}
                <div style={{ height: '250px', backgroundColor: '#0f172a', padding: '15px', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', gap: '20px', marginBottom: '10px', fontSize: '10px', fontWeight: 'bold' }}>
                    <span style={{ color: '#ef4444' }}>● HARTSLAG (BPM)</span>
                    <span style={{ color: '#60a5fa' }}>● TEMPO (STEPS/30S)</span>
                  </div>
                  <ResponsiveContainer width="100%" height="90%">
                    <LineChart data={skipperHistory.slice(-viewTime)} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                      <CartesianGrid stroke="#1e293b" vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="time" hide />
                      <YAxis yAxisId="left" domain={['dataMin - 10', 'dataMax + 10']} stroke="#ef4444" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="right" orientation="right" domain={[0, 120]} stroke="#60a5fa" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', fontSize: '12px' }} />
                      <Line 
                        yAxisId="left"
                        type="monotone" 
                        dataKey="bpm" 
                        stroke="#ef4444" 
                        strokeWidth={4} 
                        dot={false} 
                        isAnimationActive={false} 
                      />
                      <Line 
                        yAxisId="right"
                        type="monotone" 
                        dataKey="tempo" 
                        stroke="#60a5fa" 
                        strokeWidth={3} 
                        dot={false} 
                        isAnimationActive={false} 
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
