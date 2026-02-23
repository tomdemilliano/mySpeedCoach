import { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { ref, onValue, runTransaction } from "firebase/database";
import { Hash, User, ChevronRight } from 'lucide-react';

export default function CounterPage() {
  const [activeSkippers, setActiveSkippers] = useState({});
  const [selectedSkipper, setSelectedSkipper] = useState(null);

  useEffect(() => {
    const sessionsRef = ref(db, 'live_sessions/');
    return onValue(sessionsRef, (snapshot) => {
      const data = snapshot.val() || {};
      setActiveSkippers(data);
    });
  }, []);

  // Functie om stappen veilig te verhogen in de database
  const countStep = () => {
    if (!selectedSkipper) return;
    
    const stepRef = ref(db, `live_sessions/${selectedSkipper}/steps`);
    // runTransaction zorgt dat meerdere tellers tegelijkertijd kunnen tellen zonder fouten
    runTransaction(stepRef, (currentSteps) => {
      return (currentSteps || 0) + 1;
    });
  };

  const styles = {
    container: { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'sans-serif', padding: '20px' },
    card: { backgroundColor: '#1e293b', padding: '20px', borderRadius: '15px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' },
    tapButton: { 
      width: '100%', height: '60vh', backgroundColor: '#2563eb', border: 'none', borderRadius: '25px', 
      color: 'white', fontSize: '40px', fontWeight: '900', boxShadow: '0 15px 30px rgba(0,0,0,0.4)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px'
    },
    backButton: { background: 'none', border: '1px solid #334155', color: '#94a3b8', padding: '10px', borderRadius: '8px', marginBottom: '20px', cursor: 'pointer' }
  };

  // Scherm 1: Kies een skipper
  if (!selectedSkipper) {
    return (
      <div style={styles.container}>
        <h1 style={{ marginBottom: '30px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Hash color="#ef4444" /> KIES SKIPPER
        </h1>
        {Object.keys(activeSkippers).length === 0 ? (
          <p style={{ color: '#64748b' }}>Geen actieve skippers gevonden. Start eerst een opname op Toestel A.</p>
        ) : (
          Object.values(activeSkippers).map((skipper) => (
            <div key={skipper.name} style={styles.card} onClick={() => setSelectedSkipper(skipper.name)}>
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '18px' }}>{skipper.name}</div>
                <div style={{ fontSize: '12px', color: '#60a5fa' }}>Hartslag: {skipper.bpm} BPM</div>
              </div>
              <ChevronRight color="#334155" />
            </div>
          ))
        )}
      </div>
    );
  }

  // Scherm 2: De teller
  return (
    <div style={styles.container}>
      <button style={styles.backButton} onClick={() => setSelectedSkipper(null)}>← Andere skipper</button>
      
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>{selectedSkipper}</h2>
        <div style={{ fontSize: '14px', color: '#94a3b8' }}>Tik op de blauwe knop bij elke stap</div>
      </div>

      <button style={styles.tapButton} onClick={countStep}>
        <div style={{ fontSize: '100px' }}>{activeSkippers[selectedSkipper]?.steps || 0}</div>
        <div style={{ fontSize: '20px', opacity: 0.7 }}>TIK HIER</div>
      </button>
    </div>
  );
}
