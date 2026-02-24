import { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { ref, onValue, runTransaction, update, push, query, orderByChild, equalTo } from "firebase/database";
import { Hash, ChevronRight, Timer, Square, History, Play } from 'lucide-react';

export default function CounterPage() {
  const [activeSkippers, setActiveSkippers] = useState({});
  const [selectedSkipper, setSelectedSkipper] = useState(null);
  const [sessionType, setSessionType] = useState(30);
  const [localHistory, setLocalHistory] = useState([]);
  const [isFinished, setIsFinished] = useState(false); // Nieuwe staat voor resultaat-scherm

  // Sync met Firebase
  useEffect(() => {
    const sessionsRef = ref(db, 'live_sessions/');
    return onValue(sessionsRef, (snapshot) => {
      const data = snapshot.val() || {};
      setActiveSkippers(data);
      
      // Sync de lokale isFinished status met de DB
      if (selectedSkipper && data[selectedSkipper]) {
        setIsFinished(data[selectedSkipper].isFinished || false);
      }
    });
  }, [selectedSkipper]);

  // Haal de geschiedenis op
  useEffect(() => {
    if (selectedSkipper) {
      const historyRef = query(
        ref(db, 'session_history'), 
        orderByChild('skipper'), 
        equalTo(selectedSkipper)
      );
      return onValue(historyRef, (snapshot) => {
        const data = snapshot.val() || {};
        const sortedHistory = Object.values(data).sort((a, b) => b.date - a.date);
        setLocalHistory(sortedHistory);
      });
    }
  }, [selectedSkipper]);

  const countStep = () => {
    if (!selectedSkipper || isFinished) return;
    
    const liveRef = ref(db, `live_sessions/${selectedSkipper}`);
    const currentData = activeSkippers[selectedSkipper];

    // Start opname bij de allereerste klik als er nog niet opgenomen wordt
    if (!currentData?.isRecording && !isFinished) {
      update(liveRef, { 
        isRecording: true, 
        sessionType: sessionType,
        startTime: Date.now(),
        isFinished: false,
        steps: 1 // Start direct op 1 bij de eerste tik
      });
    } else {
      // Normale teller transactie
      const stepRef = ref(db, `live_sessions/${selectedSkipper}/steps`);
      runTransaction(stepRef, (currentSteps) => {
        return (currentSteps || 0) + 1;
      });
    }
  };

  const stopRecording = () => {
    if (!selectedSkipper) return;
    const currentData = activeSkippers[selectedSkipper];
    const liveRef = ref(db, `live_sessions/${selectedSkipper}`);
    
    // 1. Zet opname stop in DB maar behoud stappen
    update(liveRef, { 
      isRecording: false,
      isFinished: true 
    });

    // 2. Sla op in geschiedenis (bestaande functionaliteit)
    const historyRef = ref(db, 'session_history');
    push(historyRef, {
      skipper: selectedSkipper,
      date: Date.now(),
      finalSteps: currentData?.steps || 0,
      sessionType: sessionType,
      averageBPM: currentData?.bpm || 0
    });

    setIsFinished(true);
  };

  const startNewSession = () => {
    if (!selectedSkipper) return;
    const liveRef = ref(db, `live_sessions/${selectedSkipper}`);
    
    // Reset alles voor een schone start
    update(liveRef, { 
      steps: 0,
      isRecording: false,
      isFinished: false,
      startTime: null
    });
    setIsFinished(false);
  };

  // STYLES (Identiek aan origineel)
  const styles = {
    container: { padding: '20px', backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center' },
    backButton: { alignSelf: 'flex-start', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '5px' },
    skipperCard: { backgroundColor: '#1e293b', padding: '20px', borderRadius: '15px', width: '100%', maxWidth: '400px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', border: '1px solid #334155' },
    tapButton: { width: '250px', height: '250px', borderRadius: '50%', border: 'none', color: 'white', fontSize: '80px', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', boxShadow: '0 0 50px rgba(59, 130, 246, 0.3)', transition: 'transform 0.1s', userSelect: 'none', touchAction: 'manipulation' },
    stopButton: { marginTop: '30px', backgroundColor: '#ef4444', color: 'white', border: 'none', padding: '15px 30px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' },
    historySection: { marginTop: '40px', width: '100%', maxWidth: '400px' },
    historyItem: { backgroundColor: '#1e293b', padding: '12px', borderRadius: '8px', marginBottom: '8px', fontSize: '14px', display: 'flex', justifyContent: 'space-between', borderLeft: '4px solid #3b82f6' },
    typeSelector: { display: 'flex', gap: '10px', marginBottom: '20px' },
    typeButton: (active) => ({ padding: '10px 20px', borderRadius: '8px', border: 'none', backgroundColor: active ? '#3b82f6' : '#334155', color: 'white', fontWeight: 'bold', cursor: 'pointer' })
  };

  // SCHERM 1: Skipper Kiezen
  if (!selectedSkipper) {
    return (
      <div style={styles.container}>
        <h1 style={{ marginBottom: '30px', fontSize: '24px' }}>Wie gaat er skippen?</h1>
        {Object.keys(activeSkippers).length === 0 ? (
          <p style={{ color: '#94a3b8' }}>Geen actieve skippers gevonden. Koppel eerst een hartslagmeter.</p>
        ) : (
          Object.keys(activeSkippers).map(name => (
            <div key={name} style={styles.skipperCard} onClick={() => setSelectedSkipper(name)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ backgroundColor: '#3b82f6', p: '10px', borderRadius: '10px', width: '40px', height: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  <Hash size={20} />
                </div>
                <span style={{ fontWeight: 'bold', fontSize: '18px' }}>{name}</span>
              </div>
              <ChevronRight color="#64748b" />
            </div>
          ))
        )}
      </div>
    );
  }

  const currentSkipperData = activeSkippers[selectedSkipper];
  const isRecording = currentSkipperData?.isRecording || false;

  // SCHERM 2, 3 & 4: Selectie, Teller en Resultaat
  return (
    <div style={styles.container}>
      <button style={styles.backButton} onClick={() => { setSelectedSkipper(null); setIsFinished(false); }}>
        ← Andere skipper
      </button>
      
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: '0 0 10px 0', fontSize: '28px' }}>{selectedSkipper}</h2>
        
        {/* Stap 2: Onderdeel Kiezer (Alleen tonen als sessie nog niet gestart is) */}
        {!isRecording && !isFinished && (
          <div style={styles.typeSelector}>
            {[30, 120, 180].map(t => (
              <button 
                key={t} 
                onClick={() => setSessionType(t)} 
                style={styles.typeButton(sessionType === t)}
              >
                {t === 30 ? '30s' : (t / 60) + 'm'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stap 3 & 4: De Grote Knop */}
      <button 
        style={{
          ...styles.tapButton, 
          backgroundColor: isFinished ? '#22c55e' : '#3b82f6',
          transform: isFinished ? 'scale(1.05)' : 'none'
        }} 
        onPointerDown={(e) => {
          if(!isFinished) {
            e.currentTarget.style.transform = 'scale(0.95)';
            countStep();
          }
        }}
        onPointerUp={(e) => {
          if(!isFinished) e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        {currentSkipperData?.steps || 0}
      </button>

      {/* Dynamische Actieknop onderaan */}
      {isRecording ? (
        <button style={styles.stopButton} onClick={stopRecording}>
          <Square size={18} fill="white" /> STOP OPNAME
        </button>
      ) : isFinished ? (
        <button style={{...styles.stopButton, backgroundColor: '#3b82f6'}} onClick={startNewSession}>
          <Play size={18} fill="white" /> NIEUWE SESSIE
        </button>
      ) : (
        <div style={{ marginTop: '20px', textAlign: 'center', color: '#64748b' }}>
          <Timer size={16} style={{ verticalAlign: 'middle', marginRight: '5px' }} />
          Tik op de blauwe knop om de {sessionType === 30 ? '30s' : (sessionType / 60) + 'm'} te starten
        </div>
      )}

      {/* Historiek Overzicht (Bestaand) */}
      <div style={styles.historySection}>
        <h3 style={{ fontSize: '16px', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <History size={18} /> Vorige sessies
        </h3>
        {localHistory.length === 0 ? (
          <div style={{ color: '#475569', fontSize: '14px', textAlign: 'center' }}>Nog geen opgeslagen sessies.</div>
        ) : (
          localHistory.slice(0, 5).map((item, idx) => (
            <div key={idx} style={styles.historyItem}>
              <span>{item.sessionType === 30 ? '30s' : (item.sessionType / 60) + 'm'}</span>
              <span style={{ fontWeight: 'bold' }}>{item.finalSteps} steps</span>
              <span style={{ color: '#64748b' }}>{new Date(item.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
