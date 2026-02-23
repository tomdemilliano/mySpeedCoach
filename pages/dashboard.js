import { useState, useEffect, useRef } from 'react';
import { db } from '../firebaseConfig';
import { ref, onValue } from "firebase/database";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Heart, Users, Hash, Zap, Timer } from 'lucide-react';

export default function Dashboard() {
  const [sessions, setSessions] = useState({});
  const [history, setHistory] = useState({});
  const [viewTime, setViewTime] = useState(60);
  
  // Refs gebruiken we voor waarden die we nodig hebben in de berekening zonder re-renders te triggeren
  const lastStepsRef = useRef({});
  const currentSessionsRef = useRef({});

  // 1. Luister continu naar de database en update de 'current' ref
  useEffect(() => {
    const sessionsRef = ref(db, 'live_sessions/');
    return onValue(sessionsRef, (snapshot) => {
      const data = snapshot.val() || {};
      setSessions(data);
      currentSessionsRef.current = data;
    });
  }, []);

  // 2. De "Klok": Elke seconde berekenen we het tempo op basis van het verschil
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
            
            // Tempo is stappen per minuut (gebaseerd op deze seconde)
            const tempo = stepsThisSecond * 60; 

            if (!newHistory[name]) newHistory[name] = [];
            
            // Voeg nieuw datapunt toe
            newHistory[name] = [...newHistory[name], {
              time: now,
              bpm: data[name].bpm || 0,
              steps: currentTotalSteps,
              tempo: tempo
            }].slice(-200); // Houd laatste 200 seconden bij

            // Update de referentie voor de volgende seconde
            lastStepsRef.current[name] = currentTotalSteps;
          }
        });

        return newHistory;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const styles = {
    container: { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', padding: '20px', fontFamily: 'sans-serif' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' },
    card: { backgroundColor: '#1e293b', borderRadius: '15px', padding: '20px', border: '1px solid #334155', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
    statsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '20px' },
    statBox: { backgroundColor: '#0f172a', padding: '10px', borderRadius: '10px', textAlign: 'center', border: '1px solid #1e293b' },
    label: { color: '#94a3b8', fontSize: '10px', fontWeight: 'bold', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.05em' },
    value: { fontSize: '20px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }
  };

  // Helper voor weergave onderdeel
  const formatSessionType = (type) => {
    if (!type) return "---";
    if (type === 30) return "30s";
    return (type / 60) + "m";
  };

  return (
    <div style={styles.container}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', borderBottom: '1px solid #1e293b', paddingBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ backgroundColor: '#ef4444', padding: '8px', borderRadius: '8px' }}>
            <Activity color="white" size={24} />
          </div>
          SPEED MONITORING <span style={{ color: '#ef4444', fontWeight: '400' }}>LIVE</span>
        </h1>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>ACTIEVE SKIPPERS</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#22c55e' }}>
              {Object.keys(sessions).filter(k => sessions[k].isRecording).length}
            </div>
          </div>
        </div>
      </div>

      {Object.keys(sessions).length === 0 ? (
        <div style={{ textAlign: 'center', padding: '100px', color: '#475569', fontSize: '18px' }}>
          Geen actieve sessies gedetecteerd...
        </div>
      ) : (
        <div style={styles.grid}>
          {Object.entries(sessions).map(([name, skipper]) => {
            const skipperHistory = history[name] || [];
            const currentTempo = skipperHistory.length > 0 ? skipperHistory[skipperHistory.length - 1].tempo : 0;
            
            return (
              <div key={name} style={styles.card}>
                <div style={styles.header}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#f8fafc' }}>{name}</h2>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>ID: {name.toLowerCase().replace(' ', '_')}</div>
                  </div>
                  <div style={{ 
                    backgroundColor: skipper.isRecording ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    padding: '6px 12px',
                    borderRadius: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    border: `1px solid ${skipper.isRecording ? '#22c55e' : '#ef4444'}`
                  }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: skipper.isRecording ? '#22c55e' : '#ef4444', boxShadow: skipper.isRecording ? '0 0 8px #22c55e' : 'none' }}></div>
                    <span style={{ fontSize: '10px', fontWeight: 'bold', color: skipper.isRecording ? '#22c55e' : '#ef4444' }}>
                      {skipper.isRecording ? 'RECORDING' : 'IDLE'}
                    </span>
                  </div>
                </div>

                <div style={styles.statsGrid}>
                  <div style={styles.statBox}>
                    <div style={styles.label}>Hartslag</div>
                    <div style={{ ...styles.value, color: '#ef4444' }}>
                      <Heart size={16} fill="#ef4444" />
                      {skipper.bpm || 0}
                    </div>
                  </div>
                  
                  <div style={styles.statBox}>
                    <div style={styles.label}>Stappen</div>
                    <div style={{ ...styles.value, color: '#60a5fa' }}>
                      <Hash size={16} />
                      {skipper.steps || 0}
                    </div>
                  </div>

                  {/* Toegevoegde box voor Onderdeel */}
                  <div style={styles.statBox}>
                    <div style={styles.label}>Onderdeel</div>
                    <div style={{ ...styles.value, color: '#facc15' }}>
                      <Timer size={16} />
                      {formatSessionType(skipper.sessionType)}
                    </div>
                  </div>

                  <div style={styles.statBox}>
                    <div style={styles.label}>Tempo</div>
                    <div style={{ ...styles.value, color: '#22c55e' }}>
                      <Zap size={16} fill="#22c55e" />
                      {currentTempo}
                    </div>
                  </div>
                </div>

                {/* Grafiek Sectie */}
                <div style={{ height: '220px', width: '100%', marginTop: '10px', backgroundColor: '#0f172a', padding: '15px', borderRadius: '12px', boxSizing: 'border-box' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={skipperHistory.slice(-60)} margin={{ top: 5, right: 5, left: -30, bottom: 0 }}>
                      <CartesianGrid stroke="#1e293b" vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="time" hide />
                      <YAxis yAxisId="left" domain={['dataMin - 5', 'dataMax + 5']} hide />
                      <YAxis yAxisId="right" orientation="right" domain={[0, 140]} hide />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                        itemStyle={{ padding: '2px 0' }}
                      />
                      <Line 
                        yAxisId="left"
                        type="monotone" 
                        dataKey="bpm" 
                        stroke="#ef4444" 
                        strokeWidth={3} 
                        dot={false} 
                        isAnimationActive={false} 
                        name="Hartslag"
                      />
                      <Line 
                        yAxisId="right"
                        type="monotone" 
                        dataKey="tempo" 
                        stroke="#60a5fa" 
                        strokeWidth={2} 
                        dot={false} 
                        isAnimationActive={false} 
                        name="Tempo"
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
