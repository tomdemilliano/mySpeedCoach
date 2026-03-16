import { useState, useEffect, useRef, memo, useCallback } from 'react';
import { LiveSessionFactory, GroupFactory, ClubFactory, UserFactory, BadgeFactory, CounterBadgeFactory, ClubMemberFactory, UserMemberLinkFactory } from '../constants/dbSchema';
import {
  Hash, ChevronRight, Timer, Square, History as HistoryIcon,
  Play, Clock, Users, Building2, Trophy, ArrowLeft,
  Award, Check, X, Target, Star, Zap, Medal
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────
const DISCIPLINE_DURATION = { '30sec': 30, '2min': 120, '3min': 180 };
const AUTO_STOP_IDLE_MS = 15000;

const COOKIE_KEY = 'msc_uid';
const getCookie = () => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`));
  return match ? match[1] : null;
};

if (typeof document !== 'undefined') {
  const styleId = 'newcounter-keyframes';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes sparkFlyA { 0% { transform:translate(0,0) scale(1); opacity:1; } 100% { transform:translate(-120px,-200px) scale(0); opacity:0; } }
      @keyframes sparkFlyB { 0% { transform:translate(0,0) scale(1); opacity:1; } 100% { transform:translate(80px,-250px) scale(0); opacity:0; } }
      @keyframes sparkFlyC { 0% { transform:translate(0,0) scale(1); opacity:1; } 100% { transform:translate(150px,-180px) scale(0); opacity:0; } }
      @keyframes sparkFlyD { 0% { transform:translate(0,0) scale(1); opacity:1; } 100% { transform:translate(-80px,-220px) scale(0); opacity:0; } }
      @keyframes sparkFlyE { 0% { transform:translate(0,0) scale(1); opacity:1; } 100% { transform:translate(30px,-300px) scale(0); opacity:0; } }
      @keyframes sparkFlyF { 0% { transform:translate(0,0) scale(1); opacity:1; } 100% { transform:translate(-200px,-150px) scale(0); opacity:0; } }
      @keyframes pulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.08); } }
      @keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
      @keyframes counterPop { 0% { transform:scale(1); } 50% { transform:scale(1.15); } 100% { transform:scale(1); } }
    `;
    document.head.appendChild(style);
  }
}

const SPARK_ANIMS = ['sparkFlyA','sparkFlyB','sparkFlyC','sparkFlyD','sparkFlyE','sparkFlyF'];

// ─── Celebration Overlay ──────────────────────────────────────────────────────
function CelebrationOverlay({ type, data, onAccept, onDecline }) {
  const isBadge  = type === 'badge';
  const isRecord = type === 'record';
  const accentColor = isBadge ? '#f59e0b' : '#facc15';
  const Icon = isBadge ? Medal : Award;

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 3000, overflow: 'hidden' }}>
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: `${10 + (i * 3.5) % 80}%`, top: `${15 + (i * 7) % 70}%`,
            width: `${5 + (i % 4) * 3}px`, height: `${5 + (i % 4) * 3}px`,
            borderRadius: '50%',
            backgroundColor: ['#facc15','#f97316','#ef4444','#22c55e','#60a5fa','#a78bfa'][i % 6],
            animation: `${SPARK_ANIMS[i % 6]} ${0.9 + (i % 5) * 0.2}s ease-out ${(i % 8) * 0.12}s forwards`,
          }} />
        ))}
      </div>
      <div style={styles.modalOverlay}>
        <div style={{ ...styles.modalContent, borderColor: accentColor, animation: 'fadeInUp 0.4s ease-out' }}>
          {isBadge && data.badgeImageUrl ? (
            <img src={data.badgeImageUrl} alt={data.badgeName} style={{ width: '90px', height: '90px', borderRadius: '50%', objectFit: 'cover', margin: '0 auto 16px', display: 'block', border: `3px solid ${accentColor}` }} />
          ) : (
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: `${accentColor}22`, border: `2px solid ${accentColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', animation: 'pulse 1.5s ease-in-out infinite', fontSize: isBadge ? '40px' : undefined }}>
              {isBadge ? (data.badgeEmoji || '🏅') : <Icon size={40} color={accentColor} />}
            </div>
          )}
          <h2 style={{ color: accentColor, fontSize: '24px', margin: '0 0 8px', textAlign: 'center' }}>
            {isBadge ? '🎖️ BADGE VERDIEND!' : '🏆 NIEUW RECORD!'}
          </h2>
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            {isBadge ? (
              <>
                <div style={{ fontSize: '22px', fontWeight: '900', color: 'white', lineHeight: 1 }}>{data.badgeName}</div>
                <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '8px' }}>{data.badgeDescription || ''}</div>
                <div style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>Uitgereikt door: {data.awardedByName || 'Systeem'}</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '42px', fontWeight: '900', color: 'white', lineHeight: 1 }}>{data.score}</div>
                <div style={{ color: '#94a3b8', fontSize: '14px', marginTop: '4px' }}>steps · {data.discipline} · {data.sessionType}</div>
                {data.previousBest > 0 && (
                  <div style={{ color: '#22c55e', fontSize: '13px', marginTop: '8px' }}>+{data.score - data.previousBest} beter dan vorig record ({data.previousBest})</div>
                )}
              </>
            )}
          </div>
          {isBadge ? (
            <button onClick={onAccept} style={{ width: '100%', padding: '14px', backgroundColor: accentColor, border: 'none', borderRadius: '10px', color: 'white', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Check size={20} /> GEWELDIG!
            </button>
          ) : (
            <>
              <p style={{ color: '#cbd5e1', textAlign: 'center', fontSize: '14px', marginBottom: '20px' }}>Wil je dit als officieel record registreren?</p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={onAccept} style={{ flex: 1, padding: '14px', backgroundColor: '#22c55e', border: 'none', borderRadius: '10px', color: 'white', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <Check size={20} /> JA
                </button>
                <button onClick={onDecline} style={{ flex: 1, padding: '14px', backgroundColor: '#475569', border: 'none', borderRadius: '10px', color: 'white', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <X size={20} /> NEE
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Isolated Timer ────────────────────────────────────────────────────────────
const LiveTimer = memo(({ startTime, durationSeconds, isRecording, isFinished }) => {
  const [display, setDisplay] = useState('0:00');
  const [isOvertime, setIsOvertime] = useState(false);

  useEffect(() => {
    if (!isRecording && !isFinished) { setDisplay('0:00'); setIsOvertime(false); return; }
    const interval = setInterval(() => {
      if (isRecording && startTime) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const remaining = durationSeconds - elapsed;
        const abs = Math.abs(remaining);
        const mins = Math.floor(abs / 60);
        const secs = abs % 60;
        setIsOvertime(remaining < 0);
        setDisplay(`${remaining < 0 ? '+' : ''}${mins}:${secs.toString().padStart(2, '0')}`);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [startTime, durationSeconds, isRecording, isFinished]);

  return (
    <div style={{ fontSize: '28px', fontWeight: 'bold', fontFamily: 'monospace', color: isOvertime ? '#f97316' : '#60a5fa', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <Timer size={22} color={isOvertime ? '#f97316' : '#60a5fa'} />
      {display}
    </div>
  );
});

// ─── Main Component ────────────────────────────────────────────────────────────
export default function CounterPage() {
  const [clubs, setClubs] = useState([]);
  const [groups, setGroups] = useState([]);
  // Feature 8.3: skippers now have { id (=memberId), memberId, isSkipper, isCoach, … }
  const [skippers, setSkippers] = useState([]);
  // Feature 8.4: we also need ClubMember profiles to get names
  const [clubMembers, setClubMembers] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedClubId, setSelectedClubId] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  // Feature 8.3: selectedSkipper now carries { memberId, firstName, lastName, clubId }
  const [selectedSkipper, setSelectedSkipper] = useState(null);

  const [showConfigModal, setShowConfigModal] = useState(false);
  const [sessionType, setSessionType] = useState('Training');
  const [discipline, setDiscipline] = useState('30sec');

  const [currentData, setCurrentData] = useState(null);
  const [liveBpm, setLiveBpm] = useState(0);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [bestRecord, setBestRecord] = useState(null);

  const [pendingQueue, setPendingQueue] = useState([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);

  const [counterUser, setCounterUser] = useState(null);
  const [newlyEarnedBadges, setNewlyEarnedBadges] = useState([]);

  const telemetryRef    = useRef([]);
  const sessionStartRef = useRef(null);
  const autoStopTimerRef = useRef(null);

  useEffect(() => {
    const unsubClubs = ClubFactory.getAll(setClubs);
    const unsubUsers = UserFactory.getAll(setUsers);
    return () => { unsubClubs(); unsubUsers(); };
  }, []);

  useEffect(() => {
    if (!selectedClubId) return;
    const unsub = GroupFactory.getGroupsByClub(selectedClubId, (data) => {
      setGroups(data); setSelectedGroupId(''); setSkippers([]); setClubMembers([]);
    });
    return () => unsub();
  }, [selectedClubId]);

  useEffect(() => {
    if (!selectedClubId || !selectedGroupId) return;
    // Feature 8.3: group members are now keyed by memberId
    const unsubGroup = GroupFactory.getSkippersByGroup(selectedClubId, selectedGroupId, (data) => {
      setSkippers(data);
    });
    // Feature 8.4: also subscribe to ClubMember profiles for names
    const unsubMembers = ClubMemberFactory.getAll(selectedClubId, setClubMembers);
    return () => { unsubGroup(); unsubMembers(); };
  }, [selectedClubId, selectedGroupId]);

  // Feature 8.4: live session still keyed by uid (RTDB unchanged)
  // but we need to resolve uid from the UserMemberLink for the selected skipper
  useEffect(() => {
    if (!selectedSkipper) return;
    // selectedSkipper.rtdbUid is the uid used in live_sessions (resolved at selection time)
    const uid = selectedSkipper.rtdbUid;
    if (!uid) return;
    const unsubLive = LiveSessionFactory.subscribeToLive(uid, (data) => {
      if (!data) return;
      setLiveBpm(data.bpm || 0);
      setCurrentData(data.session || null);
    });
    return () => unsubLive();
  }, [selectedSkipper]);

  // Feature 8.4: session history now from ClubMemberFactory
  useEffect(() => {
    if (!selectedSkipper) return;
    const { clubId, memberId } = selectedSkipper;
    const unsub = ClubMemberFactory.getSessionHistory(clubId, memberId, setSessionHistory);
    return () => unsub();
  }, [selectedSkipper]);

  // Feature 8.4: records now from ClubMemberFactory
  useEffect(() => {
    if (!selectedSkipper) return;
    const { clubId, memberId } = selectedSkipper;
    const unsub = ClubMemberFactory.subscribeToRecords(clubId, memberId, discipline, sessionType, setBestRecord);
    return () => unsub();
  }, [selectedSkipper, discipline, sessionType]);

  useEffect(() => {
    if (!currentData?.isActive) { clearTimeout(autoStopTimerRef.current); return; }
    clearTimeout(autoStopTimerRef.current);
    autoStopTimerRef.current = setTimeout(() => handleStopSession(), AUTO_STOP_IDLE_MS);
    return () => clearTimeout(autoStopTimerRef.current);
  }, [currentData?.lastStepTime, currentData?.isActive]);

  useEffect(() => {
    if (currentData?.isFinished && !isProcessingQueue && pendingQueue.length === 0) {
      triggerPostSessionFlow();
    }
  }, [currentData?.isFinished]);

  useEffect(() => {
    if (!users.length) return;
    const uid = getCookie();
    if (!uid) return;
    const u = users.find(x => x.id === uid);
    if (u) setCounterUser(u);
  }, [users]);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleStartSession = async () => {
    telemetryRef.current = [];
    sessionStartRef.current = null;
    await LiveSessionFactory.startCounter(selectedSkipper.rtdbUid, discipline, sessionType);
    setShowConfigModal(false);
  };

  const handleCountStep = () => {
    if (!currentData || currentData?.isFinished) return;
    if (!sessionStartRef.current) sessionStartRef.current = Date.now();
    LiveSessionFactory.incrementSteps(selectedSkipper.rtdbUid, liveBpm, sessionStartRef.current);
    telemetryRef.current.push({
      time: Date.now() - sessionStartRef.current,
      steps: (currentData?.steps || 0) + 1,
      heartRate: liveBpm
    });
  };

  const handleStopSession = useCallback(async () => {
    if (!selectedSkipper || !currentData?.isActive) return;
    clearTimeout(autoStopTimerRef.current);
    await LiveSessionFactory.stopCounter(selectedSkipper.rtdbUid);
  }, [selectedSkipper, currentData]);

  const triggerPostSessionFlow = async () => {
    if (!selectedSkipper || !currentData) return;

    const { clubId, memberId } = selectedSkipper;
    const score    = currentData.steps || 0;
    const disc     = currentData.discipline  || discipline;
    const sType    = currentData.sessionType || sessionType;
    const telemetry = telemetryRef.current;
    const bpmValues = telemetry.map(t => t.heartRate).filter(b => b > 0);
    const avgBpm = bpmValues.length ? Math.round(bpmValues.reduce((a, b) => a + b, 0) / bpmValues.length) : liveBpm;
    const maxBpm = bpmValues.length ? Math.max(...bpmValues) : liveBpm;

    // Feature 8.4: save session history to ClubMember path
    try {
      await ClubMemberFactory.saveSessionHistory(clubId, memberId, {
        discipline: disc, sessionType: sType, score, avgBpm, maxBpm,
        sessionStart: currentData.startTime || sessionStartRef.current,
        telemetry,
        countedBy:     counterUser?.id   || null,
        countedByName: counterUser ? `${counterUser.firstName} ${counterUser.lastName}` : null,
      });
    } catch (e) { console.error('Failed to save session history:', e); }

    // Feature 8.4: fresh history from ClubMember path
    const freshHistory = await ClubMemberFactory.getSessionHistoryOnce(clubId, memberId);

    // Feature 8.4: badge check on ClubMember path
    try {
      const newBadges = await BadgeFactory.checkAndAward(
        clubId, memberId,
        { score, discipline: disc, sessionType: sType },
        freshHistory
      );
      if (newBadges.length > 0) setNewlyEarnedBadges(newBadges);
    } catch (e) { console.error('Badge check failed:', e); }

    if (counterUser) {
      try {
        await CounterBadgeFactory.checkAndAward(counterUser.id, { discipline: disc, sessionType: sType, score });
      } catch (e) { console.error('Counter badge check failed:', e); }
    }

    // Feature 8.4: record check on ClubMember path
    const previousBest = bestRecord?.score || 0;
    if (score > previousBest) {
      setPendingQueue([{ type: 'record', data: { score, discipline: disc, sessionType: sType, previousBest, telemetry } }]);
      setIsProcessingQueue(true);
    }
  };

  const handleQueueAccept = async () => {
    const current = pendingQueue[0];
    if (!current) return;
    if (current.type === 'record') {
      const { clubId, memberId } = selectedSkipper;
      try { await ClubMemberFactory.addRecord(clubId, memberId, current.data); }
      catch (e) { console.error('Failed to save record:', e); }
    }
    advanceQueue();
  };

  const handleQueueDecline = () => advanceQueue();

  const advanceQueue = () => {
    setPendingQueue(prev => {
      const next = prev.slice(1);
      if (next.length === 0) setIsProcessingQueue(false);
      return next;
    });
  };

  const handleReset = async () => {
    clearTimeout(autoStopTimerRef.current);
    telemetryRef.current = [];
    if (selectedSkipper?.rtdbUid) await LiveSessionFactory.resetSession(selectedSkipper.rtdbUid);
    setSelectedSkipper(null);
    setShowConfigModal(false);
    setIsProcessingQueue(false);
    setPendingQueue([]);
    setNewlyEarnedBadges([]);
  };

  const handleNewSession = async () => {
    clearTimeout(autoStopTimerRef.current);
    telemetryRef.current = [];
    if (selectedSkipper?.rtdbUid) await LiveSessionFactory.resetSession(selectedSkipper.rtdbUid);
    setIsProcessingQueue(false);
    setPendingQueue([]);
    setShowConfigModal(true);
    setNewlyEarnedBadges([]);
  };

  // ─── Render helpers ───────────────────────────────────────────────────────────
  const isRecording  = currentData?.isActive === true;
  const isFinished   = currentData?.isFinished === true && !currentData?.isActive;
  const isStartklaar = currentData !== null && currentData !== undefined && !isRecording && !isFinished;

  // Helper: resolve ClubMember name + rtdbUid for skipper selection
  // Group member doc has { memberId, isSkipper, isCoach }
  // ClubMember profile has { firstName, lastName }
  // UserMemberLink gives us the uid for RTDB
  const resolveSkipperProfile = async (groupMember) => {
    const memberId = groupMember.memberId || groupMember.id;
    const profile  = clubMembers.find(m => m.id === memberId);
    const firstName = profile?.firstName || '?';
    const lastName  = profile?.lastName  || '';

    // Resolve uid for RTDB — find a "self" link for this member
    const { getDocs, collection, query, where } = await import('firebase/firestore');
    const { db } = await import('../firebaseConfig');
    const linksSnap = await getDocs(
      query(collection(db, 'userMemberLinks'),
        where('clubId',   '==', selectedClubId),
        where('memberId', '==', memberId),
        where('relationship', '==', 'self')
      )
    );
    const rtdbUid = linksSnap.empty ? null : linksSnap.docs[0].data().uid;

    return { memberId, clubId: selectedClubId, firstName, lastName, rtdbUid };
  };

  // ─── Screen 1: Skipper Selection ──────────────────────────────────────────────
  if (!selectedSkipper) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={{ fontSize: '20px', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
            <Users size={24} color="#3b82f6" /> Skipper Selectie
          </h1>
        </div>
        <div style={styles.selectionPanel}>
          <div style={styles.field}>
            <label style={styles.label}><Building2 size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />1. Selecteer Club</label>
            <select style={styles.select} value={selectedClubId} onChange={(e) => setSelectedClubId(e.target.value)}>
              <option value="">-- Kies een club --</option>
              {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.label}><Users size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />2. Selecteer Groep</label>
            <select style={styles.select} value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)} disabled={!selectedClubId}>
              <option value="">-- Kies een groep --</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div style={{ marginTop: '30px' }}>
            <label style={styles.label}><Hash size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />3. Kies de Skipper</label>
            {selectedGroupId ? (
              skippers.length > 0 ? (
                <div style={styles.grid}>
                  {skippers.map(s => {
                    // Feature 8.3: s.id is now memberId; resolve name from clubMembers
                    const memberId = s.memberId || s.id;
                    const profile  = clubMembers.find(m => m.id === memberId);
                    const firstName = profile?.firstName || '?';
                    const lastName  = profile?.lastName  || '';
                    const initials  = `${firstName[0] || '?'}${lastName[0] || ''}`;
                    return (
                      <button
                        key={memberId}
                        style={styles.card}
                        onClick={async () => {
                          const resolved = await resolveSkipperProfile(s);
                          setSelectedSkipper(resolved);
                          setShowConfigModal(true);
                        }}
                      >
                        <div style={styles.avatar}>{initials.toUpperCase()}</div>
                        <div style={{ marginTop: '10px', fontSize: '14px', fontWeight: '600' }}>
                          {firstName} {lastName}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p style={styles.infoText}>Geen actieve skippers in deze groep.</p>
              )
            ) : (
              <p style={styles.infoText}>Selecteer eerst een club en groep.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Screen 2: Config Modal ───────────────────────────────────────────────────
  if (showConfigModal) {
    return (
      <div style={styles.modalOverlay}>
        <div style={{ ...styles.modalContent, fontFamily: 'sans-serif' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ ...styles.avatar, margin: '0 auto 12px', width: '60px', height: '60px', fontSize: '20px' }}>
              {selectedSkipper.firstName[0]}{selectedSkipper.lastName[0]}
            </div>
            <h2 style={{ margin: 0, fontSize: '22px', color: '#f1f5f9' }}>{selectedSkipper.firstName} {selectedSkipper.lastName}</h2>
            <p style={{ color: '#94a3b8', margin: '4px 0 0', fontFamily: 'sans-serif' }}>Kies sessie-instellingen</p>
          </div>

          <label style={{ ...styles.label, fontFamily: 'sans-serif' }}>Type sessie</label>
          <div style={styles.toggleGroup}>
            {['Training', 'Wedstrijd'].map(t => (
              <button key={t} onClick={() => setSessionType(t)} style={{ ...styles.toggleBtn, backgroundColor: sessionType === t ? (t === 'Wedstrijd' ? '#ef4444' : '#3b82f6') : '#0f172a', borderColor: sessionType === t ? (t === 'Wedstrijd' ? '#ef4444' : '#3b82f6') : '#334155' }}>{t}</button>
            ))}
          </div>

          <label style={{ ...styles.label, fontFamily: 'sans-serif' }}>Onderdeel</label>
          <div style={styles.toggleGroup}>
            {['30sec', '2min', '3min'].map(d => (
              <button key={d} onClick={() => setDiscipline(d)} style={{ ...styles.toggleBtn, backgroundColor: discipline === d ? '#3b82f6' : '#0f172a', borderColor: discipline === d ? '#3b82f6' : '#334155' }}>{d}</button>
            ))}
          </div>

          {bestRecord && (
            <div style={{ backgroundColor: '#0f172a', borderRadius: '8px', padding: '12px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Trophy size={18} color="#facc15" />
              <div style={{ fontSize: '13px', color: '#94a3b8' }}>Huidig record: <strong style={{ color: '#facc15' }}>{bestRecord.score} steps</strong></div>
            </div>
          )}

          <button onClick={handleStartSession} style={styles.mainStartBtn}><Play size={20} fill="white" /> SESSIE STARTEN</button>
          <button onClick={() => { setSelectedSkipper(null); setShowConfigModal(false); }} style={{ ...styles.mainStartBtn, backgroundColor: 'transparent', border: '1px solid #334155', marginTop: '10px' }}>Annuleren</button>
        </div>
      </div>
    );
  }

  // ─── Screen 3: Counter ────────────────────────────────────────────────────────
  return (
    <div style={styles.container}>
      {isProcessingQueue && pendingQueue.length > 0 && (
        <CelebrationOverlay type={pendingQueue[0].type} data={pendingQueue[0].data} onAccept={handleQueueAccept} onDecline={handleQueueDecline} />
      )}

      <div style={styles.activeHeader}>
        <button style={styles.backBtn} onClick={handleReset}><ArrowLeft size={18} /> Andere skipper</button>
        <div style={styles.userInfo}>
          <div style={{ ...styles.avatar, width: '44px', height: '44px', fontSize: '15px' }}>
            {selectedSkipper.firstName[0]}{selectedSkipper.lastName[0]}
          </div>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '18px' }}>{selectedSkipper.firstName} {selectedSkipper.lastName}</div>
            <div style={{ fontSize: '12px', display: 'flex', gap: '8px', marginTop: '2px' }}>
              <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold', backgroundColor: sessionType === 'Wedstrijd' ? '#ef4444' : '#3b82f6' }}>{sessionType}</span>
              <span style={{ color: '#94a3b8' }}>{discipline}</span>
            </div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: '22px', fontWeight: '900', color: '#ef4444' }}>{liveBpm > 0 ? liveBpm : '--'}</div>
            <div style={{ fontSize: '10px', color: '#94a3b8' }}>BPM</div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
          <LiveTimer startTime={currentData?.startTime} durationSeconds={DISCIPLINE_DURATION[currentData?.discipline] || DISCIPLINE_DURATION[discipline]} isRecording={isRecording} isFinished={isFinished} />
          <div style={{ fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {isRecording ? (<><span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444', animation: 'pulse 1s ease-in-out infinite', display: 'inline-block' }} /><span style={{ color: '#ef4444' }}>OPNAME</span></>) : isFinished ? (<span style={{ color: '#22c55e' }}>KLAAR</span>) : isStartklaar ? (<span style={{ color: '#facc15' }}>STARTKLAAR</span>) : (<span style={{ color: '#64748b' }}>WACHT</span>)}
          </div>
        </div>
      </div>

      {newlyEarnedBadges.length > 0 && (
        <div style={{ width: '100%', maxWidth: '440px', backgroundColor: '#1a1a2e', border: '1px solid #f59e0b44', borderRadius: '12px', padding: '12px 16px', marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#f59e0b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            🎖️ Nieuwe badges verdiend door {selectedSkipper?.firstName}!
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {newlyEarnedBadges.map(b => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#0f172a', borderRadius: '8px', padding: '6px 10px', border: '1px solid #334155' }}>
                {b.imageUrl ? <img src={b.imageUrl} style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }} alt={b.name} /> : <span style={{ fontSize: '20px' }}>{b.emoji}</span>}
                <span style={{ fontSize: '12px', color: '#f1f5f9', fontWeight: '600' }}>{b.name}</span>
              </div>
            ))}
          </div>
          <button onClick={() => setNewlyEarnedBadges([])} style={{ marginTop: '10px', background: 'none', border: 'none', color: '#64748b', fontSize: '11px', cursor: 'pointer', padding: 0 }}>Sluiten</button>
        </div>
      )}

      {bestRecord && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '8px 16px', backgroundColor: '#1e293b', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', color: '#facc15' }}>
          <Trophy size={14} /> Record: <strong>{bestRecord.score} steps</strong>
        </div>
      )}

      <button
        style={{ ...styles.counterButton, backgroundColor: isFinished ? '#1e293b' : isRecording ? '#1e3a5f' : '#1e293b', border: isRecording ? '3px solid #3b82f6' : isFinished ? '3px solid #22c55e' : '3px solid #334155', boxShadow: isRecording ? '0 0 60px rgba(59, 130, 246, 0.25)' : 'none', cursor: isFinished ? 'default' : 'pointer' }}
        disabled={isFinished || !selectedSkipper}
        onPointerDown={(e) => { if (!isFinished) { e.currentTarget.style.transform = 'scale(0.96)'; handleCountStep(); } }}
        onPointerUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        onPointerLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        <span style={styles.stepLabel}>STEPS</span>
        <span style={{ fontSize: '100px', lineHeight: 1, fontWeight: '900' }}>{currentData?.steps ?? 0}</span>
        {!isRecording && !isFinished && (<span style={{ fontSize: '14px', color: '#64748b', marginTop: '8px' }}>Tik om te starten</span>)}
      </button>

      <div style={styles.controls}>
        {isRecording ? (
          <button style={styles.stopButton} onClick={handleStopSession}><Square size={18} fill="white" /> STOP</button>
        ) : isFinished ? (
          <button style={{ ...styles.stopButton, backgroundColor: '#3b82f6' }} onClick={handleNewSession}><Play size={18} fill="white" /> NIEUWE SESSIE</button>
        ) : isStartklaar ? (
          <>
            <div style={{ color: '#facc15', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}><Zap size={16} /> Eerste tik start de opname</div>
            <button style={{ ...styles.stopButton, backgroundColor: '#3b82f6' }} onClick={handleNewSession}><Play size={18} fill="white" /> NIEUWE SESSIE</button>
          </>
        ) : (
          <div style={{ color: '#64748b', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}><Zap size={16} /> Selecteer een skipper</div>
        )}
      </div>

      <div style={styles.historySection}>
        <h3 style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}><HistoryIcon size={16} /> Recente sessies</h3>
        {sessionHistory.slice(0, 5).map((item, idx) => (
          <div key={idx} style={styles.historyItem}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', backgroundColor: item.sessionType === 'Wedstrijd' ? '#ef444422' : '#3b82f622', color: item.sessionType === 'Wedstrijd' ? '#ef4444' : '#60a5fa', border: `1px solid ${item.sessionType === 'Wedstrijd' ? '#ef444440' : '#3b82f640'}` }}>{item.sessionType || 'Training'}</span>
              <span style={{ color: '#94a3b8', fontSize: '12px' }}>{item.discipline}</span>
            </div>
            <span style={{ fontWeight: 'bold', color: '#60a5fa', fontSize: '16px' }}>{item.score} <span style={{ fontSize: '11px', color: '#64748b' }}>steps</span></span>
          </div>
        ))}
        {sessionHistory.length === 0 && (<p style={{ color: '#475569', fontSize: '13px', textAlign: 'center' }}>Nog geen sessies.</p>)}
      </div>
    </div>
  );
}

const styles = {
  container: { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'sans-serif', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  header: { width: '100%', maxWidth: '500px', padding: '16px 0', borderBottom: '1px solid #1e293b', marginBottom: '24px' },
  selectionPanel: { width: '100%', maxWidth: '500px' },
  field: { marginBottom: '20px' },
  label: { display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '8px', fontWeight: '600' },
  select: { width: '100%', padding: '12px', borderRadius: '8px', backgroundColor: '#1e293b', border: '1px solid #334155', color: 'white', fontSize: '16px' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' },
  card: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '16px', color: 'white', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'border-color 0.2s' },
  avatar: { width: '50px', height: '50px', backgroundColor: '#3b82f6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '16px' },
  infoText: { textAlign: 'center', color: '#64748b', fontSize: '14px', marginTop: '20px' },
  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.92)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', zIndex: 100 },
  modalContent: { backgroundColor: '#1e293b', padding: '30px', borderRadius: '20px', width: '100%', maxWidth: '400px', border: '1px solid #334155' },
  toggleGroup: { display: 'flex', gap: '10px', marginBottom: '20px' },
  toggleBtn: { flex: 1, padding: '12px', border: '1px solid #334155', borderRadius: '8px', color: 'white', cursor: 'pointer', fontWeight: 'bold', fontFamily: 'sans-serif' },
  mainStartBtn: { width: '100%', padding: '15px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '10px', color: 'white', fontWeight: 'bold', marginTop: '10px', display: 'flex', justifyContent: 'center', gap: '10px', alignItems: 'center', cursor: 'pointer', fontSize: '16px', fontFamily: 'sans-serif' },
  activeHeader: { backgroundColor: '#1e293b', padding: '16px', borderRadius: '14px', marginBottom: '16px', width: '100%', maxWidth: '440px', border: '1px solid #334155' },
  backBtn: { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', marginBottom: '12px', padding: 0 },
  userInfo: { display: 'flex', alignItems: 'center', gap: '14px' },
  counterButton: { width: '280px', height: '280px', borderRadius: '50%', color: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', touchAction: 'manipulation', userSelect: 'none', transition: 'transform 0.08s, box-shadow 0.2s', margin: '10px 0' },
  stepLabel: { fontSize: '13px', letterSpacing: '4px', color: 'rgba(255,255,255,0.35)', fontWeight: '700' },
  controls: { display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', marginTop: '16px', marginBottom: '24px' },
  stopButton: { backgroundColor: '#ef4444', color: 'white', padding: '14px 32px', borderRadius: '12px', border: 'none', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '15px' },
  historySection: { width: '100%', maxWidth: '440px', borderTop: '1px solid #1e293b', paddingTop: '16px' },
  historyItem: { backgroundColor: '#1e293b', padding: '12px 16px', borderRadius: '10px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '3px solid #3b82f6' },
};
