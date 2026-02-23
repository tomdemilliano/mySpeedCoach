import { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { ref, onValue, runTransaction, update } from "firebase/database";
import { Hash, ChevronRight, Timer, Square } from 'lucide-react';

export default function CounterPage() {
  const [activeSkippers, setActiveSkippers] = useState({});
  const [selectedSkipper, setSelectedSkipper] = useState(null);
  const [sessionType, setSessionType] = useState(30); // Standaard 30 seconden

  useEffect(() => {
    const sessionsRef = ref(db, 'live_sessions/');
    return onValue(sessionsRef, (snapshot) => {
      const data = snapshot.val() || {};
      setActiveSkippers(data);
    });
  }, []);

  // Functie om stappen te tellen en opname te starten
  const countStep = () => {
    if (!selectedSkipper) return;
    
    const liveRef = ref(db, `live_sessions/${selectedSkipper}`);
    const currentData = activeSkippers[selectedSkipper];

    // ALS dit de eerste klik is EN er wordt nog niet opgenomen: START de opname
    if (!currentData?.isRecording && (currentData?.steps || 0) === 0) {
      update(liveRef, { 
        isRecording: true, 
        sessionType: sessionType,
        startTime: Date.now() 
      });
    }

    const stepRef = ref(db, `live_sessions/${selectedSkipper}/steps`);
    runTransaction(stepRef, (currentSteps) => {
      return (currentSteps || 0) + 1;
    });
  };

  // Functie om de opname handmatig te stoppen
  const stopRecording = () => {
    if (!selectedSkipper) return;
    const liveRef = ref(db, `live_sessions/${selectedSkipper}`);
    update(liveRef, { isRecording: false });
  };

  const styles = {
    container: { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'sans-serif', padding: '20px' },
    card: { backgroundColor: '#1e293b', padding: '20px', borderRadius: '15px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' },
    tapButton: { width: '100%', aspectRatio: '1/1', borderRadius: '50%', border: 'none', backgroundColor: '#3b82f6', color: 'white', fontSize: '80px', fontWeight: 'bold', boxShadow: '0 10px 25px -5px rgba(59, 130, 246, 0.5)', cursor: 'pointer', transition: 'transform 0.1s' },
    backButton: { backgroundColor: 'transparent', border: '1px solid #334155', color: '#94a3b8', padding: '8px 16px', borderRadius: '8px', marginBottom: '20px', cursor: 'pointer' },
    typeSelector: { display: 'flex', gap: '10px', marginBottom: '20px' },
    typeButton: (active) => ({ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: active ? '#facc15' : '#1e293b', color: active ? '#0f172a' : 'white', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s' }),
    stopButton: { marginTop: '20px', width: '100%', padding: '15px', borderRadius: '10px', border: 'none', backgroundColor: '#ef4444', color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }
  };

  // Scherm 1: Kies Skipper
  if (!selectedSkipper) {
    return (
      <div style={styles.container}>
        <h1 style={{ marginBottom: '30px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Hash color="#ef4444" /> KIES SKIPPER
        </h1>
        {Object.keys(activeSkippers).length === 0 ? (
          <p style={{ color: '#64748b' }}>Geen actieve skippers gevonden. Zorg dat Toestel A verbonden is.</p>
        ) : (
          Object.values(activeSkippers).map((skipper) => (
            <div key={skipper.name} style={styles.card} onClick={() => setSelectedSkipper(skipper.name)}>
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '18px' }}>{skipper.name}</div>
                <div style={{ fontSize: '12px', color: '#60a5fa' }}>Status: {skipper.isRecording ? 'Bezig' : 'Stand-by'}</div>
              </div>
              <ChevronRight color="#334155" />
            </div>
          ))
        )}
      </div>
    );
  }

  const currentSkipperData = activeSkippers[selectedSkipper];

  // Scherm 2: De teller
  return (
    <div style={styles.container}>
      <button style={styles.backButton} onClick={() => setSelectedSkipper(null)}>← Andere skipper</button>
      
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: '0 0 10px 0' }}>{selectedSkipper}</h2>
        
        {/* Onderdeel Kiezer (alleen zichtbaar als er nog niet geteld is) */}
        {(!currentSkipperData?.steps || currentSkipperData.steps === 0) && (
          <div style={styles.typeSelector}>
            <button onClick={() => setSessionType(30)} style={styles.typeButton(sessionType === 30)}>30s</button>
            <button onClick={() => setSessionType(120)} style={styles.typeButton(sessionType === 120)}>2m</button>
            <button onClick={() => setSessionType(180)} style={styles.typeButton(sessionType === 180)}>3m</button>
          </div>
        )}

        <div style={{ fontSize: '14px', color: '#94a3b8' }}>
          {currentSkipperData?.isRecording ? 'Opname loopt...' : 'Tik om te starten'}
        </div>
      </div>

      <button 
        style={styles.tapButton} 
        onPointerDown={(e) => {
          e.currentTarget.style.transform = 'scale(0.95)';
          countStep();
        }}
        onPointerUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
      >
        {currentSkipperData?.steps || 0}
      </button>

      {/* Stop knop: Alleen zichtbaar als er een opname loopt */}
      {currentSkipperData?.isRecording && (
        <button style={styles.stopButton} onClick={stopRecording}>
          <Square size={18} fill="white" /> STOP OPNAME
        </button>
      )}

      <div style={{ marginTop: '20px', textAlign: 'center', color: '#64748b' }}>
        <Timer size={16} style={{ verticalAlign: 'middle', marginRight: '5px' }} />
        Onderdeel: {sessionType === 30 ? '30 Seconden' : (sessionType / 60) + ' Minuten'}
      </div>
    </div>
  );
}
