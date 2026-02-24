import { useState, useEffect, useRef } from 'react';
import { db } from '../firebaseConfig';
import { ref, onValue } from "firebase/database";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Heart, Users, Hash, Zap, Timer } from 'lucide-react';

export default function Dashboard() {
  const [sessions, setSessions] = useState({});
  const [history, setHistory] = useState({});
  const [viewTime, setViewTime] = useState(60);
  
  const lastStepsRef = useRef({});
  const currentSessionsRef = useRef({});

  useEffect(() => {
    const sessionsRef = ref(db, 'live_sessions/');
    return onValue(sessionsRef, (snapshot) => {
      const data = snapshot.val() || {};
      setSessions(data);
      currentSessionsRef.current = data;
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const data = currentSessionsRef.current;
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      setHistory(prevHistory => {
        const newHistory = { ...prevHistory };

        Object.keys(data).forEach(name => {
          if (data[name].isRecording) {
            const currentTotalSteps = data[name].steps || 0;
            const lastSteps = lastStepsRef.current[name] || 0;
            const stepsThisSecond = currentTotalSteps - lastSteps;
            const tempo = stepsThisSecond * 60; 

            if (!newHistory[name]) newHistory[name] = [];
            
            newHistory[name] = [...newHistory[name], {
              time: now,
              bpm: data[name].bpm || 0,
              steps: currentTotalSteps,
              tempo: tempo
            }].slice(-200);

            lastStepsRef.current[name] = currentTotalSteps;
          }
        });

        return newHistory;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Logica voor de prognose (Verwachte stappen)
  const calculateExpectedSteps = (skipper) => {
    if (skipper.isFinished) return skipper.steps || 0;
    
    if (!skipper.isRecording || !skipper.startTime || !skipper.sessionType) return 0;
    
    const elapsedSeconds = (Date.now() - skipper.startTime) / 1000;
    const remainingSeconds = Math.max(0, skipper.sessionType - elapsedSeconds);
    const currentSteps = skipper.steps || 0;
    
    const skipperHistory = history[skipper.name] || [];
    const currentTempo = skipperHistory.length > 0 ? skipperHistory[skipperHistory.length - 1].tempo : 0;
    const stepsPerSecond = currentTempo / 60;

    return Math.round(currentSteps + (remainingSeconds * stepsPerSecond));
  };

  const styles = {
    container: { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', padding: '20px', fontFamily: 'sans-serif' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' },
    card: { backgroundColor: '#1e293b', borderRadius: '15px', padding: '20px', border: '1px solid #334155', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
    statsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' },
    statBox: { backgroundColor: '#0f172a', padding: '10px', borderRadius: '10px', textAlign: 'center', border: '1px solid #1e293b' },
    label: { color: '#94a3b8', fontSize: '10px', fontWeight: 'bold', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.05em' },
    value: { fontSize: '20px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' },
    badge: { backgroundColor: 'rgba(250, 204, 21, 0.2)', color: '#facc15', padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', marginLeft: '10px', border: '1px solid #facc15' }
  };

  const formatSessionType = (type) => {
    if (!type) return "---";
    if (type === 30) return "30s";
    return (type / 60) + "m";
  };

  return (
    <div style={styles.container}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', borderBottom: '1px solid #1e293b', paddingBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ backgroundColor: '#ef4444', padding: '8px', borderRadius: '8px' }}>
            <Activity color="white" size={24} />
          </div>
          SPEED MONITORING <span style={{ color: '#ef4444', fontWeight: '400' }}>LIVE</span>
        </h1>
        <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#22c55e' }}>
          {Object.keys(sessions).filter(k => sessions[k].isRecording).length} SKIPPERS LIVE
        </div>
      </div>

      <div style={styles.grid}>
        {Object.entries(sessions).map(([name, skipper]) => {
          const skipperHistory = history[name] || [];
          const currentTempo = skipperHistory.length > 0 ? skipperHistory[skipperHistory.length - 1].tempo : 0;

          // AANGEPASTE TIMER LOGICA: stopt als recording false is
          const getTimerValue = (skipper) => {
            if (!skipper.startTime) return "0:00";
            
            // Als de sessie nog loopt, gebruik de huidige tijd.
            // Als de sessie gestopt is, gebruik de lastStepTime (het moment van de laatste klik/stop).
            const endTime = skipper.isRecording ? Date.now() : (skipper.lastStepTime || skipper.lastUpdate || Date.now());
            
            const elapsed = Math.floor((endTime - skipper.startTime) / 1000);
            const remaining = (skipper.sessionType || 30) - elapsed;
            
            if (remaining >= 0) {
              const mins = Math.floor(remaining / 60);
              const secs = remaining % 60;
              return `${mins}:${secs.toString().padStart(2, '0')}`;
            } else {
              const overtime = Math.abs(remaining);
              const mins = Math.floor(overtime / 60);
              const secs = overtime % 60;
              return `+${mins}:${secs.toString().padStart(2, '0')}`;
            }
          };
          
          return (
            <div key={name} style={styles.card}>
              <div style={styles.header}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#f8fafc' }}>{name}</h2>
                  <span style={styles.badge}>{formatSessionType(skipper.sessionType)}</span>
                </div>
                <div style={{ color: skipper.isRecording ? '#22c55e' : (skipper.isFinished ? '#facc15' : '#ef4444'), fontSize: '10px', fontWeight: 'bold' }}>
                  {skipper.isRecording ? '● LIVE' : (skipper.isFinished ? '✓ FINISHED' : '○ IDLE')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#60a5fa', fontWeight: 'bold' }}>
                  <Timer size={14} />
                  {getTimerValue(skipper)}
                </div>
              </div>
              <div style={styles.statsGrid}>
                <div style={styles.statBox}>
                  <div style={styles.label}>Hartslag</div>
                  <div style={{ ...styles.value, color: '#ef4444' }}><Heart size={16} fill="#ef4444" /> {skipper.bpm || 0}</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.label}>Stappen</div>
                  <div style={{ ...styles.value, color: '#60a5fa' }}><Hash size={16} /> {skipper.steps || 0}</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.label}>Tempo</div>
                  <div style={{ ...styles.value, color: '#22c55e' }}><Zap size={16} fill="#22c55e" /> {currentTempo}</div>
                </div>
              </div>

              {/* Prognose box over volledige breedte */}
              <div style={{ ...styles.statBox, marginBottom: '20px', backgroundColor: 'rgba(34, 197, 94, 0.05)', borderColor: '#22c55e' }}>
                <div style={{ ...styles.label, color: '#22c55e' }}>Verwachte Eindscore (Prognose)</div>
                <div style={{ ...styles.value, color: '#22c55e', fontSize: '28px' }}>{calculateExpectedSteps(skipper)}</div>
              </div>

              <div style={{ height: '220px', width: '100%', backgroundColor: '#0f172a', padding: '15px', borderRadius: '12px', boxSizing: 'border-box' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={skipperHistory.slice(-60)} margin={{ top: 5, right: 35, left: -20, bottom: 20 }}>
                    <CartesianGrid stroke="#1e293b" vertical={false} strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="time" 
                      stroke="#64748b" 
                      fontSize={10} 
                      label={{ value: 'Tijd', position: 'insideBottom', offset: -10, fill: '#64748b' }}
                    />
                    <YAxis 
                      yAxisId="left" 
                      domain={['dataMin - 5', 'dataMax + 5']} 
                      stroke="#ef4444" 
                      fontSize={10}
                      label={{ value: 'BPM', angle: -90, position: 'insideLeft', fill: '#ef4444', offset: 10 }}
                    />
                    <YAxis 
                      yAxisId="right" 
                      orientation="right" 
                      domain={[0, 140]} 
                      stroke="#60a5fa" 
                      fontSize={10}
                      label={{ value: 'Tempo', angle: 90, position: 'insideRight', fill: '#60a5fa', offset: 10 }}
                    />
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }} />
                    <Line yAxisId="left" type="monotone" dataKey="bpm" stroke="#ef4444" strokeWidth={3} dot={false} isAnimationActive={false} name="Hartslag" />
                    <Line yAxisId="right" type="monotone" dataKey="tempo" stroke="#60a5fa" strokeWidth={2} dot={false} isAnimationActive={false} name="Tempo" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
