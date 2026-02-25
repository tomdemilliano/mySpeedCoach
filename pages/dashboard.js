import { useState, useEffect, useRef } from 'react';
import { db } from '../firebaseConfig';
import { ref, onValue } from "firebase/database";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from 'recharts';
import { Activity, Heart, Hash, Zap, Timer, Users, CheckCircle2, Trophy, XCircle } from 'lucide-react';
import SkipperManagement from './SkipperManagement';

const DEFAULT_ZONES = [
  { name: 'Warm-up', min: 0, max: 120, color: '#94a3b8' },
  { name: 'Fat Burn', min: 120, max: 145, color: '#22c55e' },
  { name: 'Aerobic', min: 145, max: 165, color: '#facc15' },
  { name: 'Anaerobic', min: 165, max: 185, color: '#f97316' },
  { name: 'Red Line', min: 185, max: 250, color: '#ef4444' }
];

export default function Dashboard() {
  const [sessions, setSessions] = useState({});
  const [history, setHistory] = useState({});
  const [selectedSkippers, setSelectedSkippers] = useState([]);
  const [allStats, setAllStats] = useState({}); // Bevat nu records én zones
  const [viewMode, setViewMode] = useState('selection');
  
  const lastStepsRef = useRef({});
  const currentSessionsRef = useRef({});

  // Functie om de juiste zones voor een specifieke skipper te bepalen
  const getSkipperZones = (name) => {
    return allStats[name]?.zones || DEFAULT_ZONES;
  };

  // Functie om kleur te bepalen op basis van persoonlijke zones
  const getZoneColor = (bpm, name) => {
    const zones = getSkipperZones(name);
    const zone = zones.find(z => bpm >= z.min && bpm < z.max);
    return zone ? zone.color : '#94a3b8';
  };

  useEffect(() => {
    const sessionsRef = ref(db, 'live_sessions/');
    const statsRef = ref(db, 'skipper_stats/');

    const unsubSessions = onValue(sessionsRef, (snapshot) => {
      const data = snapshot.val() || {};
      setSessions(data);
      currentSessionsRef.current = data;
    });

    const unsubStats = onValue(statsRef, (snapshot) => {
      setAllStats(snapshot.val() || {});
    });

    return () => {
      unsubSessions();
      unsubStats();
    };
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

  const toggleSkipperSelection = (name) => {
    if (selectedSkippers.includes(name)) {
      setSelectedSkippers(prev => prev.filter(s => s !== name));
    } else {
      if (selectedSkippers.length < 4) {
        setSelectedSkippers(prev => [...prev, name]);
      } else {
        alert("Je kunt maximaal 4 skippers tegelijk monitoren.");
      }
    }
  };

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

  const getPersonalRecord = (name, type, cat) => {
    const sessionType = type || 30;
    const sessionCat = cat || 'Training';
    return allStats[name]?.records?.[sessionType]?.[sessionCat]?.score || '---';
  };

  const styles = {
    container: { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', padding: '20px', fontFamily: 'sans-serif' },
    selectionGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px', marginTop: '20px' },
    skipperCard: (isSelected) => ({
      backgroundColor: isSelected ? '#1e293b' : '#0f172a',
      borderRadius: '12px', padding: '15px', cursor: 'pointer', border: `2px solid ${isSelected ? '#3b82f6' : '#1e293b'}`,
      transition: 'all 0.2s', position: 'relative'
    }),
    monitoringGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '20px' },
    card: { backgroundColor: '#1e293b', borderRadius: '15px', padding: '20px', border: '1px solid #334155' },
    statBox: { backgroundColor: '#0f172a', padding: '10px', borderRadius: '10px', textAlign: 'center', border: '1px solid #1e293b' },
    label: { color: '#94a3b8', fontSize: '10px', fontWeight: 'bold', marginBottom: '5px', textTransform: 'uppercase' },
    value: { fontSize: '20px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' },
    btn: { padding: '10px 20px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }
  };

  if (viewMode === 'selection') {
    return (
      <div style={styles.container}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '800' }}>SELECTEER SKIPPERS ({selectedSkippers.length}/4)</h1>
          <button 
            disabled={selectedSkippers.length === 0}
            onClick={() => setViewMode('monitoring')}
            style={{ ...styles.btn, backgroundColor: '#22c55e', color: 'white', opacity: selectedSkippers.length === 0 ? 0.5 : 1 }}
          >
            START MONITORING
          </button>
          <button 
            onClick={() => setShowManagement(true)}
              style={{ 
                backgroundColor: '#475569', 
                color: 'white', 
                padding: '8px 16px', 
                borderRadius: '8px', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <Settings size={18} /> Skipper Beheer
            </button>
        </div>

        <div style={styles.selectionGrid}>
          {Object.keys(sessions).map(name => {
            const isSelected = selectedSkippers.includes(name);
            const hasHRM = (Date.now() - sessions[name].lastUpdate) < 10000;

            return (
              <div key={name} style={styles.skipperCard(isSelected)} onClick={() => toggleSkipperSelection(name)}>
                {isSelected && <CheckCircle2 style={{ position: 'absolute', top: 10, right: 10, color: '#3b82f6' }} size={20} />}
                <h3 style={{ margin: '0 0 10px 0' }}>{name}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: hasHRM ? '#22c55e' : '#64748b' }}>
                  <Heart size={14} fill={hasHRM ? '#22c55e' : 'none'} />
                  {hasHRM ? 'HRM Gekoppeld' : 'Geen HRM'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '800' }}>SPEED MONITORING LIVE</h1>
        <button onClick={() => setViewMode('selection')} style={{ ...styles.btn, backgroundColor: '#475569', color: 'white' }}>
          <Users size={18} style={{ verticalAlign: 'middle', marginRight: '8px' }} /> WIJZIG SELECTIE
        </button>
      </div>

      <div style={styles.monitoringGrid}>
        {selectedSkippers.map(name => {
          const skipper = sessions[name] || { name };
          const skipperHistory = history[name] || [];
          const currentTempo = skipperHistory.length > 0 ? skipperHistory[skipperHistory.length - 1].tempo : 0;
          const personalRecord = getPersonalRecord(name, skipper.sessionType, skipper.category);
          const currentBpm = skipper.bpm || 0;
          
          // Haal persoonlijke zones voor deze skipper op
          const currentZones = getSkipperZones(name);
          const currentHrColor = getZoneColor(currentBpm, name);

          const getTimerValue = (s) => {
            if (!s.startTime) return "0:00";
            const endTime = s.isRecording ? Date.now() : (s.lastStepTime || s.lastUpdate || Date.now());
            const elapsed = Math.floor((endTime - s.startTime) / 1000);
            const remaining = (s.sessionType || 30) - elapsed;
            const mins = Math.floor(Math.abs(remaining) / 60);
            const secs = Math.abs(remaining) % 60;
            return `${remaining < 0 ? '+' : ''}${mins}:${secs.toString().padStart(2, '0')}`;
          };

          return (
            <div key={name} style={styles.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '22px' }}>{name}</h2>
                  <span style={{ fontSize: '12px', color: '#facc15', fontWeight: 'bold' }}>
                    {skipper.sessionType === 30 ? '30s' : (skipper.sessionType / 60) + 'm'} | {skipper.category || 'Training'}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#60a5fa', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <div style={{ color: currentHrColor, display: 'flex', alignItems: 'center', gap: '4px', marginRight: '10px' }}>
                       <Heart size={14} fill={currentHrColor} /> {currentBpm}
                    </div>
                    <Timer size={16} /> {getTimerValue(skipper)}
                  </div>
                  <div style={{ fontSize: '10px', color: skipper.isRecording ? '#22c55e' : '#ef4444' }}>
                    {skipper.isRecording ? '● RECORDING' : '○ IDLE'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '15px' }}>
                <div style={styles.statBox}>
                  <div style={styles.label}>Hartslag</div>
                  <div style={{ ...styles.value, color: currentHrColor }}>
                    <Heart size={16} fill={currentHrColor} /> {currentBpm || '--'}
                  </div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.label}>Stappen</div>
                  <div style={{ ...styles.value, color: '#60a5fa' }}><Hash size={16} /> {skipper.steps || 0}</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.label}>Tempo</div>
                  <div style={{ ...styles.value, color: '#22c55e' }}><Zap size={16} fill="#22c55e" /> {currentTempo}</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.label}>Record</div>
                  <div style={{ ...styles.value, color: '#facc15' }}><Trophy size={16} /> {personalRecord}</div>
                </div>
              </div>

              <div style={{ ...styles.statBox, marginBottom: '20px', backgroundColor: 'rgba(34, 197, 94, 0.05)', borderColor: '#22c55e' }}>
                <div style={{ ...styles.label, color: '#22c55e' }}>Verwachte Eindscore</div>
                <div style={{ ...styles.value, color: '#22c55e', fontSize: '32px' }}>{calculateExpectedSteps(skipper)}</div>
              </div>

              <div style={{ height: '220px', width: '100%', backgroundColor: '#0f172a', padding: '10px', borderRadius: '12px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={skipperHistory.slice(-60)}>
                    <CartesianGrid stroke="#1e293b" vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="time" stroke="#64748b" fontSize={10} hide={true} />
                    <YAxis yAxisId="left" domain={[40, 200]} stroke="#ef4444" fontSize={10} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 140]} stroke="#60a5fa" fontSize={10} />
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', fontSize: '12px' }} />
                    
                    {/* Persoonlijke Hartslagzones op de achtergrond */}
                    {currentZones.map(zone => (
                      <ReferenceArea 
                        key={zone.name} 
                        yAxisId="left"
                        y1={zone.min} 
                        y2={zone.max} 
                        fill={zone.color} 
                        fillOpacity={0.05} 
                      />
                    ))}

                    <Line yAxisId="left" type="monotone" dataKey="bpm" stroke={currentHrColor} strokeWidth={3} dot={false} isAnimationActive={false} />
                    <Line yAxisId="right" type="monotone" dataKey="tempo" stroke="#60a5fa" strokeWidth={2} dot={false} isAnimationActive={false} />
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
