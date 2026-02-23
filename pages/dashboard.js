import { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { ref, onValue } from "firebase/database";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Heart, Users, Hash, TrendingUp, Zap } from 'lucide-react';

export default function Dashboard() {
  const [sessions, setSessions] = useState({});
  const [history, setHistory] = useState({});
  const [viewTime, setViewTime] = useState(60);
  const [stepsBuffer, setStepsBuffer] = useState({}); // Buffer voor stabiele tempo-berekening

  useEffect(() => {
    const sessionsRef = ref(db, 'live_sessions/');
    
    return onValue(sessionsRef, (snapshot) => {
      const data = snapshot.val() || {};
      setSessions(data);

      setHistory(prevHistory => {
        const newHistory = { ...prevHistory };
        const now = new Date().toLocaleTimeString();

        Object.keys(data).forEach(name => {
          if (data[name].isRecording) {
            const currentTotalSteps = data[name].steps || 0;
            
            // 1. Haal de buffer op voor deze skipper en voeg nieuwe meting toe
            const skipperBuffer = stepsBuffer[name] || [];
            const updatedBuffer = [...skipperBuffer, { t: Date.now(), s: currentTotalSteps }].slice(-4);
            
            // 2. Bereken het gemiddelde tempo over de buffer (ca. 3 seconden)
            let calculatedTempo = 0;
            if (updatedBuffer.length >= 2) {
              const first = updatedBuffer[0];
              const last = updatedBuffer[updatedBuffer.length - 1];
              
              const timeDiffSeconds = (last.t - first.t) / 1000;
              const stepDiff = last.s - first.s;
              
              if (timeDiffSeconds > 0) {
                // (delta stappen / delta tijd) * 30 seconden
                calculatedTempo = Math.round((stepDiff / timeDiffSeconds) * 30);
              }
            }

            // 3. Voeg punt toe aan de grafiek-geschiedenis
            const skipperPoints = newHistory[name] || [];
            newHistory[name] = [...skipperPoints, { 
              time: now, 
              bpm: data[name].bpm || 0,
              tempo: calculatedTempo 
            }].slice(-300);

            // 4. Werk de buffer bij in de state voor de volgende seconde
            setStepsBuffer(prev => ({ ...prev, [name]: updatedBuffer }));
          }
        });
        return newHistory;
      });
    });
  }, [stepsBuffer]); 

  const styles = {
    container: { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'sans-serif', padding: '20px' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1200px', margin: '0 auto 30px', borderBottom: '1px solid #334155', paddingBottom: '15px' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '30px', maxWidth: '1200px', margin: '0 auto' },
    card: { backgroundColor: '#1e293b', padding: '25px', borderRadius: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', border: '1px solid #334155' },
    statBox: { backgroundColor: '#0f172a', padding: '15px', borderRadius: '12px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', border: '1px solid #1e293b' },
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
          <p>Start de opname op Toestel A en begin te tellen op Toestel C.</p>
        </div>
      ) : (
        <div style={styles.grid}>
          {activeSessions.map((skipper) => {
            const skipperHistory = history[skipper.name] || [];
            const currentTempo = skipperHistory.length > 0 ? skipperHistory[skipperHistory.length - 1].tempo : 0;

            return (
              <div key={skipper.name} style={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h2 style={{ margin: 0, fontSize: '26px', fontWeight: '900', color: '#f8fafc' }}>{skipper.name}</h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#22c55e' }}>
                    <div style={{ width: '8px', height: '8px', backgroundColor: '#22c55e', borderRadius: '50%' }}></div>
                    LIVE
                  </div>
                </div>

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

                <div style={{ height: '250px', backgroundColor: '#0f172a', padding: '15px', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', gap: '20px', marginBottom: '10px', fontSize: '10px', fontWeight: 'bold' }}>
                    <span style={{ color: '#ef4444' }}>● HARTSLAG</span>
                    <span style={{ color: '#60a5fa' }}>● TEMPO (/30S)</span>
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
