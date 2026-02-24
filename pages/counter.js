import { useState, useEffect, memo } from 'react';
import { db } from '../firebaseConfig';
import { ref, onValue, runTransaction, update, push, query, orderByChild, equalTo } from "firebase/database";
import { Hash, ChevronRight, Timer, Square, History, Play, Clock } from 'lucide-react';

// --- GEÏSOLEERDE TIMER COMPONENT ---
// Deze component voorkomt dat de timer bevriest wanneer de hoofd-app re-rendert door het klikken.
const LiveTimer = memo(({ startTime, sessionType, isRecording, isFinished }) => {
  const [display, setDisplay] = useState("0:00");

  useEffect(() => {
    if (!isRecording && !isFinished) {
      setDisplay("0:00");
      return;
    }

    const interval = setInterval(() => {
      if (isRecording && startTime) {
        const now = Date.now();
        const elapsed = Math.floor((now - startTime) / 1000);
        const remaining = sessionType - elapsed;

        if (remaining >= 0) {
          const mins = Math.floor(remaining / 60);
          const secs = remaining % 60;
          setDisplay(`${mins}:${secs.toString().padStart(2, '0')}`);
        } else {
          const overtime = Math.abs(remaining);
          const mins = Math.floor(overtime / 60);
          const secs = overtime % 60;
          setDisplay(`+${mins}:${secs.toString().padStart(2, '0')}`);
        }
      }
    }, 100); // Hoge frequentie voor vloeiende weergave

    return () => clearInterval(interval);
  }, [startTime, sessionType, isRecording, isFinished]);

  return (
    <div style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: 'monospace', color: '#60a5fa', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <Clock size={22} /> {display}
    </div>
  );
});

export default function CounterPage() {
  const [activeSkippers, setActiveSkippers] = useState({});
  const [selectedSkipper, setSelectedSkipper] = useState(null);
  const [sessionType, setSessionType] = useState(30);
  const [localHistory, setLocalHistory] = useState([]);
  const [isFinished, setIsFinished] = useState(false);
  const [sessionCategory, setSessionCategory] = useState('Training');

  // 1. Firebase Sync: Luisteren naar actieve sessies
  useEffect(() => {
    const sessionsRef = ref(db, 'live_sessions/');
    return onValue(sessionsRef, (snapshot) => {
      const data = snapshot.val() || {};
      setActiveSkippers(data);
      
      if (selectedSkipper && data[selectedSkipper]) {
        setIsFinished(data[selectedSkipper].isFinished || false);
      }
    });
  }, [selectedSkipper]);

  // 2. Geschiedenis ophalen
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

  // 3. Auto-stop Logica (gebaseerd op inactiviteit)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!selectedSkipper) return;
      const data = activeSkippers[selectedSkipper];
      
      if (data?.isRecording && data?.startTime) {
        const now = Date.now();
        const lastActivity = data.lastStepTime || data.startTime;
        
        // AUTO-STOP check: 15 seconden geen step gedetecteerd
        if (now - lastActivity > 15000) {
          stopRecording();
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [activeSkippers, selectedSkipper]);

  const countStep = () => {
    if (!selectedSkipper || isFinished) return;
    
    const liveRef = ref(db, `live_sessions/${selectedSkipper}`);
    const currentData = activeSkippers[selectedSkipper];
    const now = Date.now();

    if (!currentData?.isRecording && !isFinished) {
      update(liveRef, { 
        isRecording: true, 
        sessionType: sessionType,
        startTime: now,
        lastStepTime: now,
        isFinished: false,
        steps: 1 
      });
    } else {
      update(liveRef, { lastStepTime: now });
      const stepRef = ref(db, `live_sessions/${selectedSkipper}/steps`);
      runTransaction(stepRef, (currentSteps) => {
        return (currentSteps || 0) + 1;
      });
    }
  };

  const stopRecording = () => {
    if (!selectedSkipper) return;
    const currentData = activeSkippers[selectedSkipper];
    if (!currentData || !currentData.isRecording) return;

    const liveRef = ref(db, `live_sessions/${selectedSkipper}`);
    update(liveRef, { isRecording: false, isFinished: true });

    push(ref(db, 'session_history'), {
      skipper: selectedSkipper,
      date: Date.now(),
      finalSteps: currentData.steps || 0,
      sessionType: currentData.sessionType || sessionType,
      category: sessionCategory,
      averageBPM: currentData.bpm || 0
    });

    setIsFinished(true);
  };

  const startNewSession = () => {
    if (!selectedSkipper) return;
    const liveRef = ref(db, `live_sessions/${selectedSkipper}`);
    update(liveRef, { 
      steps: 0, isRecording: false, isFinished: false, startTime: null, lastStepTime: null
    });
    setIsFinished(false);
  };

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

  if (!selectedSkipper) {
    return (
      <div style={styles.container}>
        <h1 style={{ marginBottom: '30px', fontSize: '24px' }}>Wie gaat er skippen?</h1>
        {Object.keys(activeSkippers).map(name => (
          <div key={name} style={styles.skipperCard} onClick={() => setSelectedSkipper(name)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <div style={{ backgroundColor: '#3b82f6', borderRadius: '10px', width: '40px', height: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <Hash size={20} />
              </div>
              <span style={{ fontWeight: 'bold', fontSize: '18px' }}>{name}</span>
            </div>
            <ChevronRight color="#64748b" />
          </div>
        ))}
      </div>
    );
  }

  const currentData = activeSkippers[selectedSkipper];

  return (
    <div style={styles.container}>
      <button style={styles.backButton} onClick={() => { setSelectedSkipper(null); setIsFinished(false); }}>
        ← Andere skipper
      </button>
      
      <div style={{ textAlign: 'center', marginBottom: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <h2 style={{ margin: '0 0 10px 0', fontSize: '28px' }}>{selectedSkipper}</h2>
        
        {/* De LiveTimer component zorgt voor een soepele timer die niet blokkeert */}
        <LiveTimer 
          startTime={currentData?.startTime} 
          sessionType={currentData?.sessionType || sessionType}
          isRecording={currentData?.isRecording}
          isFinished={isFinished}
        />
        
        {!currentData?.isRecording && !isFinished && (
          <div style={{...styles.typeSelector, marginTop: '10px'}}>
            {['Training', 'Wedstrijd'].map(cat => (
              <button 
                key={cat} 
                onClick={() => setSessionCategory(cat)} 
                style={{
                  ...styles.typeButton(sessionCategory === cat),
                  backgroundColor: sessionCategory === cat ? (cat === 'Wedstrijd' ? '#ef4444' : '#3b82f6') : '#334155'}}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
  
        {!currentData?.isRecording && !isFinished && (
          <div style={styles.typeSelector}>
            {[30, 120, 180].map(t => (
              <button key={t} onClick={() => setSessionType(t)} style={styles.typeButton(sessionType === t)}>
                {t === 30 ? '30s' : (t / 60) + 'm'}
              </button>
            ))}
          </div>
        )}
      </div>

      <button 
        style={{ ...styles.tapButton, backgroundColor: isFinished ? '#22c55e' : '#3b82f6' }} 
        onPointerDown={(e) => { if(!isFinished) { e.currentTarget.style.transform = 'scale(0.95)'; countStep(); } }}
        onPointerUp={(e) => { if(!isFinished) e.currentTarget.style.transform = 'scale(1)'; }}
      >
        {currentData?.steps || 0}
      </button>

      {currentData?.isRecording ? (
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
          Tik op de knop om {sessionType === 30 ? '30s' : (sessionType / 60) + 'm'} te starten
        </div>
      )}

      <div style={styles.historySection}>
        <h3 style={{ fontSize: '16px', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <History size={18} /> Vorige sessies
        </h3>
        {localHistory.slice(0, 5).map((item, idx) => (
          <div key={idx} style={styles.historyItem}>
            <span>{item.sessionType === 30 ? '30s' : (item.sessionType / 60) + 'm'}</span>
            <span style={{ fontWeight: 'bold' }}>{item.finalSteps} steps</span>
            <span style={{ color: '#64748b' }}>{new Date(item.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
