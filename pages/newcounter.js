import { useState, useEffect, memo } from 'react';
import { LiveSessionFactory, GroupFactory, ClubFactory } from '../constants/dbSchema';
import { 
  Hash, ChevronRight, Timer, Square, History, 
  Play, Clock, User, Users, Building2, Trophy, ArrowLeft 
} from 'lucide-react';

// --- GEÏSOLEERDE TIMER COMPONENT (Blijft ongewijzigd voor performance) ---
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
    }, 100);

    return () => clearInterval(interval);
  }, [startTime, sessionType, isRecording, isFinished]);

  return (
    <div style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: 'monospace', color: isFinished ? '#94a3b8' : '#fff' }}>
      <Timer size={20} style={{ verticalAlign: 'middle', marginRight: '8px', color: '#3b82f6' }} />
      {display}
    </div>
  );
});

export default function CounterPage() {
  // Selectie Flow States
  const [clubs, setClubs] = useState([]);
  const [groups, setGroups] = useState([]);
  const [skippers, setSkippers] = useState([]);
  
  const [selectedClub, setSelectedClub] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedSkipper, setSelectedSkipper] = useState(null);
  
  // Configuratie States
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [discipline, setDiscipline] = useState('Speed');
  const [sessionType, setSessionType] = useState(30);

  // Live Data State
  const [currentData, setCurrentData] = useState(null);

  // 1. Laad Clubs bij start
  useEffect(() => {
    return ClubFactory.getAll((data) => setClubs(data));
  }, []);

  // 2. Laad Groepen zodra club is gekozen
  useEffect(() => {
    if (selectedClub) {
      return GroupFactory.getGroupsByClub(selectedClub.id, (data) => setGroups(data));
    }
  }, [selectedClub]);

  // 3. Laad Skippers zodra groep is gekozen (gefilterd op isSkipper in Factory)
  useEffect(() => {
    if (selectedClub && selectedGroup) {
      return GroupFactory.getSkippersByGroup(selectedClub.id, selectedGroup.id, (data) => {
        setSkippers(data);
      });
    }
  }, [selectedClub, selectedGroup]);

  // 4. Luister naar RTDB sessie updates voor de gekozen skipper
  useEffect(() => {
    if (selectedSkipper) {
      return LiveSessionFactory.subscribeToSession(selectedSkipper.id, (data) => {
        setCurrentData(data);
      });
    }
  }, [selectedSkipper]);

  // --- ACTIES ---
  const handleStartSession = async () => {
    await LiveSessionFactory.startCounter(selectedSkipper.id, discipline, sessionType);
    setShowConfigModal(false);
  };

  const stopRecording = () => LiveSessionFactory.stopCounter(selectedSkipper.id);
  const countStep = () => {
    if (currentData?.isActive) {
      LiveSessionFactory.incrementSteps(selectedSkipper.id);
    }
  };

  const resetFlow = () => {
    LiveSessionFactory.resetSession(selectedSkipper.id);
    setSelectedSkipper(null);
    setShowConfigModal(false);
  };

  // --- RENDERING ONDERDELEN ---

  // Scherm 1: De Selectie (Club -> Groep -> Skipper)
  if (!selectedSkipper) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
            <h1 style={{ fontSize: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Users /> Wie gaat er skippen?
            </h1>
        </div>

        <div style={styles.selectionBody}>
            {!selectedClub ? (
                <div style={styles.grid}>
                    {clubs.map(c => (
                        <button key={c.id} style={styles.card} onClick={() => setSelectedClub(c)}>
                            <Building2 size={32} color="#3b82f6" />
                            <div style={{marginTop: '10px'}}>{c.name}</div>
                        </button>
                    ))}
                </div>
            ) : !selectedGroup ? (
                <>
                    <button style={styles.backButton} onClick={() => setSelectedClub(null)}><ArrowLeft size={16}/> Terug naar clubs</button>
                    <div style={styles.grid}>
                        {groups.map(g => (
                            <button key={g.id} style={styles.card} onClick={() => setSelectedGroup(g)}>
                                <Users size={32} color="#10b981" />
                                <div style={{marginTop: '10px'}}>{g.name}</div>
                            </button>
                        ))}
                    </div>
                </>
            ) : (
                <>
                    <button style={styles.backButton} onClick={() => setSelectedGroup(null)}><ArrowLeft size={16}/> Terug naar groepen</button>
                    <div style={styles.grid}>
                        {skippers.length > 0 ? skippers.map(s => (
                            <button key={s.id} style={styles.card} onClick={() => { setSelectedSkipper(s); setShowConfigModal(true); }}>
                                <div style={styles.avatar}>{s.firstName[0]}{s.lastName[0]}</div>
                                <div style={{marginTop: '10px'}}>{s.firstName} {s.lastName}</div>
                            </button>
                        )) : <p style={{textAlign: 'center', color: '#64748b'}}>Geen skippers gevonden in deze groep.</p>}
                    </div>
                </>
            )}
        </div>
      </div>
    );
  }

  // Scherm 2: Modal voor Configuratie
  if (showConfigModal) {
    return (
      <div style={styles.modalOverlay}>
        <div style={styles.modalContent}>
          <h2 style={{marginBottom: '20px'}}>Sessie Instellingen</h2>
          
          <label style={styles.label}>Discipline (Categorie)</label>
          <div style={styles.toggleGroup}>
            {['Speed', 'Double Dutch'].map(d => (
              <button 
                key={d} 
                onClick={() => setDiscipline(d)}
                style={{...styles.toggleBtn, backgroundColor: discipline === d ? '#3b82f6' : '#0f172a'}}
              >{d}</button>
            ))}
          </div>

          <label style={styles.label}>Duur (Seconden)</label>
          <div style={styles.toggleGroup}>
            {[30, 60, 180].map(t => (
              <button 
                key={t} 
                onClick={() => setSessionType(t)}
                style={{...styles.toggleBtn, backgroundColor: sessionType === t ? '#3b82f6' : '#0f172a'}}
              >{t}s</button>
            ))}
          </div>

          <button onClick={handleStartSession} style={styles.mainStartBtn}>
            <Play size={20} fill="white" /> START DE TELLER
          </button>
          <button onClick={() => setSelectedSkipper(null)} style={{...styles.mainStartBtn, backgroundColor: 'transparent', marginTop: '10px'}}>Annuleren</button>
        </div>
      </div>
    );
  }

  // Scherm 3: De Effectieve Teller
  const isRecording = currentData?.isActive;
  const isFinished = currentData?.isFinished;

  return (
    <div style={styles.container}>
      <div style={styles.activeHeader}>
        <div style={styles.userInfo}>
            <div style={{...styles.avatar, width: '40px', height: '40px', fontSize: '14px'}}>
                {selectedSkipper.firstName[0]}{selectedSkipper.lastName[0]}
            </div>
            <div>
                <div style={{fontWeight: 'bold'}}>{selectedSkipper.firstName}</div>
                <div style={{fontSize: '12px', color: '#94a3b8'}}>{discipline} - {sessionType}s</div>
            </div>
        </div>
      </div>

      <button 
        style={{
            ...styles.counterButton, 
            backgroundColor: isRecording ? '#3b82f6' : '#1e293b',
            boxShadow: isRecording ? '0 0 40px rgba(59, 130, 246, 0.4)' : 'none',
            transform: isRecording ? 'scale(1)' : 'scale(0.98)'
        }}
        disabled={!isRecording}
        onClick={countStep}
        onPointerDown={(e) => { if(isRecording) e.currentTarget.style.transform = 'scale(0.95)'; }}
        onPointerUp={(e) => { if(isRecording) e.currentTarget.style.transform = 'scale(1)'; }}
      >
        <span style={styles.stepLabel}>STEPS</span>
        {currentData?.steps || 0}
      </button>

      <div style={styles.controls}>
        <LiveTimer 
          startTime={currentData?.startTime} 
          sessionType={sessionType} 
          isRecording={isRecording} 
          isFinished={isFinished} 
        />
        
        {isRecording ? (
          <button style={styles.stopButton} onClick={stopRecording}>
            <Square size={18} fill="white" /> STOP
          </button>
        ) : isFinished ? (
          <button style={{...styles.stopButton, backgroundColor: '#10b981'}} onClick={resetFlow}>
            <Trophy size={18} /> KLAAR / NIEUW
          </button>
        ) : (
          <div style={{color: '#64748b'}}>Wachten op start...</div>
        )}
      </div>
    </div>
  );
}

// --- STYLES ---
const styles = {
  container: { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'sans-serif', padding: '20px' },
  header: { padding: '20px 0', borderBottom: '1px solid #334155', marginBottom: '20px' },
  activeHeader: { backgroundColor: '#1e293b', padding: '15px', borderRadius: '12px', marginBottom: '20px' },
  userInfo: { display: 'flex', alignItems: 'center', gap: '15px' },
  avatar: { width: '60px', height: '60px', backgroundColor: '#3b82f6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '20px' },
  selectionBody: { maxWidth: '600px', margin: '0 auto' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' },
  card: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '25px', color: 'white', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', transition: '0.2s' },
  backButton: { background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '5px' },
  
  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', zIndex: 100 },
  modalContent: { backgroundColor: '#1e293b', padding: '30px', borderRadius: '20px', width: '100%', maxWidth: '400px' },
  label: { display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '10px', marginTop: '20px' },
  toggleGroup: { display: 'flex', gap: '10px' },
  toggleBtn: { flex: 1, padding: '12px', border: '1px solid #334155', borderRadius: '8px', color: 'white', cursor: 'pointer' },
  mainStartBtn: { width: '100%', padding: '15px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '10px', color: 'white', fontWeight: 'bold', marginTop: '30px', display: 'flex', justifyContent: 'center', gap: '10px', alignItems: 'center' },

  counterButton: { width: '100%', height: '300px', borderRadius: '30px', border: 'none', color: 'white', fontSize: '100px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', transition: 'all 0.1s cubic-bezier(0.175, 0.885, 0.32, 1.275)' },
  stepLabel: { fontSize: '20px', color: 'rgba(255,255,255,0.5)', letterSpacing: '4px' },
  controls: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '30px', padding: '0 10px' },
  stopButton: { backgroundColor: '#ef4444', color: 'white', padding: '15px 30px', borderRadius: '12px', border: 'none', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }
};
