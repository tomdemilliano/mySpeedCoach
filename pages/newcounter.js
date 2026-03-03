import { useState, useEffect, memo } from 'react';
import { LiveSessionFactory, GroupFactory, ClubFactory } from '../constants/dbSchema';
import { 
  Hash, ChevronRight, Timer, Square, History, 
  Play, Clock, User, Users, Building2, Trophy, ArrowLeft 
} from 'lucide-react';

// --- GEÏSOLEERDE TIMER COMPONENT ---
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
  // --- SELECTIE FLOW STATES ---
  const [clubs, setClubs] = useState([]);
  const [groups, setGroups] = useState([]);
  const [skippers, setSkippers] = useState([]);
  
  const [selectedClubId, setSelectedClubId] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedSkipper, setSelectedSkipper] = useState(null);
  
  // --- CONFIGURATIE STATES ---
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [discipline, setDiscipline] = useState('Speed');
  const [sessionType, setSessionType] = useState(30);

  // --- LIVE DATA STATE ---
  const [currentData, setCurrentData] = useState(null);

  // 1. Laad alle clubs bij mount
  useEffect(() => {
    const unsub = ClubFactory.getAll((data) => setClubs(data));
    return () => unsub();
  }, []);

  // 2. Laad groepen zodra club wijzigt
  useEffect(() => {
    if (selectedClubId) {
      const unsub = GroupFactory.getGroupsByClub(selectedClubId, (data) => {
        setGroups(data);
        setSelectedGroupId(''); // Reset groep bij club-wissel
        setSkippers([]);
      });
      return () => unsub();
    }
  }, [selectedClubId]);

  // 3. Laad skippers zodra groep wijzigt
  useEffect(() => {
    if (selectedClubId && selectedGroupId) {
      // We gebruiken getMembersByGroup en filteren hier op isSkipper
      const unsub = GroupFactory.getMembersByGroup(selectedClubId, selectedGroupId, (data) => {
        const filtered = data.filter(m => m.isSkipper === true);
        setSkippers(filtered);
      });
      return () => unsub();
    }
  }, [selectedClubId, selectedGroupId]);

  // 4. Luister naar de live sessie in RTDB
  useEffect(() => {
    if (selectedSkipper) {
      const unsub = LiveSessionFactory.subscribeToSession(selectedSkipper.id, (data) => {
        setCurrentData(data);
      });
      return () => unsub();
    }
  }, [selectedSkipper]);

  // --- HANDLERS ---
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

  // --- RENDER LOGICA ---

  // STAP 1: Selectie van de skipper
  if (!selectedSkipper) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
            <h1 style={{ fontSize: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Users /> Skipper Selectie
            </h1>
        </div>

        <div style={styles.selectionPanel}>
            {/* Club Dropdown */}
            <div style={styles.field}>
                <label style={styles.label}>1. Selecteer Club</label>
                <select 
                    style={styles.select} 
                    value={selectedClubId} 
                    onChange={(e) => setSelectedClubId(e.target.value)}
                >
                    <option value="">-- Kies een club --</option>
                    {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            </div>

            {/* Groep Dropdown */}
            <div style={styles.field}>
                <label style={styles.label}>2. Selecteer Groep</label>
                <select 
                    style={styles.select} 
                    value={selectedGroupId} 
                    onChange={(e) => setSelectedGroupId(e.target.value)}
                    disabled={!selectedClubId}
                >
                    <option value="">-- Kies een groep --</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
            </div>

            {/* Skipper Grid */}
            <div style={{ marginTop: '30px' }}>
                <label style={styles.label}>3. Kies de Skipper</label>
                {selectedGroupId ? (
                    <div style={styles.grid}>
                        {skippers.length > 0 ? skippers.map(s => (
                            <button key={s.id} style={styles.card} onClick={() => { setSelectedSkipper(s); setShowConfigModal(true); }}>
                                <div style={styles.avatar}>{s.firstName[0]}{s.lastName[0]}</div>
                                <div style={{marginTop: '10px', fontSize: '14px'}}>{s.firstName} {s.lastName}</div>
                            </button>
                        )) : <p style={styles.infoText}>Geen actieve skippers gevonden in deze groep.</p>}
                    </div>
                ) : (
                    <p style={styles.infoText}>Selecteer eerst een club en groep.</p>
                )}
            </div>
        </div>
      </div>
    );
  }

  // STAP 2: Configuratie Modal
  if (showConfigModal) {
    return (
      <div style={styles.modalOverlay}>
        <div style={styles.modalContent}>
          <h2 style={{marginBottom: '20px'}}>Sessie voor {selectedSkipper.firstName}</h2>
          
          <label style={styles.label}>Discipline</label>
          <div style={styles.toggleGroup}>
            {['Speed', 'Double Dutch'].map(d => (
              <button 
                key={d} 
                onClick={() => setDiscipline(d)}
                style={{...styles.toggleBtn, backgroundColor: discipline === d ? '#3b82f6' : '#0f172a'}}
              >{d}</button>
            ))}
          </div>

          <label style={styles.label}>Duur (seconden)</label>
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
            <Play size={20} fill="white" /> STARTEN
          </button>
          <button onClick={() => setSelectedSkipper(null)} style={{...styles.mainStartBtn, backgroundColor: 'transparent', marginTop: '10px'}}>Annuleren</button>
        </div>
      </div>
    );
  }

  // STAP 3: De Teller (Bestaande layout)
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
                <div style={{fontWeight: 'bold'}}>{selectedSkipper.firstName} {selectedSkipper.lastName}</div>
                <div style={{fontSize: '12px', color: '#94a3b8'}}>{discipline} - {sessionType}s</div>
            </div>
        </div>
      </div>

      <button 
        style={{
            ...styles.counterButton, 
            backgroundColor: isRecording ? '#3b82f6' : '#1e293b',
            boxShadow: isRecording ? '0 0 40px rgba(59, 130, 246, 0.4)' : 'none'
        }}
        disabled={!isRecording}
        onClick={countStep}
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
  selectionPanel: { maxWidth: '500px', margin: '0 auto' },
  field: { marginBottom: '20px' },
  label: { display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '8px' },
  select: { width: '100%', padding: '12px', borderRadius: '8px', backgroundColor: '#1e293b', border: '1px solid #334155', color: 'white', fontSize: '16px' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' },
  card: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '15px', color: 'white', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  avatar: { width: '50px', height: '50px', backgroundColor: '#3b82f6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' },
  infoText: { textAlign: 'center', color: '#64748b', fontSize: '14px', marginTop: '20px' },
  
  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', zIndex: 100 },
  modalContent: { backgroundColor: '#1e293b', padding: '30px', borderRadius: '20px', width: '100%', maxWidth: '400px' },
  toggleGroup: { display: 'flex', gap: '10px', marginBottom: '20px' },
  toggleBtn: { flex: 1, padding: '12px', border: '1px solid #334155', borderRadius: '8px', color: 'white', cursor: 'pointer' },
  mainStartBtn: { width: '100%', padding: '15px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '10px', color: 'white', fontWeight: 'bold', marginTop: '10px', display: 'flex', justifyContent: 'center', gap: '10px', alignItems: 'center' },

  activeHeader: { backgroundColor: '#1e293b', padding: '15px', borderRadius: '12px', marginBottom: '20px' },
  userInfo: { display: 'flex', alignItems: 'center', gap: '15px' },
  counterButton: { width: '100%', height: '300px', borderRadius: '30px', border: 'none', color: 'white', fontSize: '100px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' },
  stepLabel: { fontSize: '20px', color: 'rgba(255,255,255,0.5)', letterSpacing: '4px' },
  controls: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '30px' },
  stopButton: { backgroundColor: '#ef4444', color: 'white', padding: '15px 30px', borderRadius: '12px', border: 'none', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }
};
