import { useState, useEffect, useRef, memo, useCallback } from 'react';
import {
  LiveSessionFactory, GroupFactory, UserFactory,
  BadgeFactory, CounterBadgeFactory, ClubMemberFactory, UserMemberLinkFactory,
} from '../constants/dbSchema';
import { useDisciplines } from '../hooks/useDisciplines';
import {
  Hash, Timer, Square, History as HistoryIcon,
  Play, Users, Trophy, ArrowLeft,
  Award, Check, X, Zap, Medal,
  SkipForward, AlertTriangle,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────
const AUTO_STOP_IDLE_MS = 15000;
const TRIPLE_UNDER_IDLE = 15000;

const COOKIE_KEY = 'msc_uid';
const getCookie = () => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`));
  return match ? match[1] : null;
};

if (typeof document !== 'undefined') {
  const styleId = 'counter-keyframes';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes sparkFlyA { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(-120px,-200px) scale(0);opacity:0} }
      @keyframes sparkFlyB { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(80px,-250px) scale(0);opacity:0} }
      @keyframes sparkFlyC { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(150px,-180px) scale(0);opacity:0} }
      @keyframes sparkFlyD { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(-80px,-220px) scale(0);opacity:0} }
      @keyframes sparkFlyE { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(30px,-300px) scale(0);opacity:0} }
      @keyframes sparkFlyF { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(-200px,-150px) scale(0);opacity:0} }
      @keyframes pulse      { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
      @keyframes fadeInUp   { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
      @keyframes spin       { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      @keyframes countPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.15)} }
    `;
    document.head.appendChild(style);
  }
}

const SPARK_ANIMS = ['sparkFlyA','sparkFlyB','sparkFlyC','sparkFlyD','sparkFlyE','sparkFlyF'];

// ─── Celebration Overlay ──────────────────────────────────────────────────────
function CelebrationOverlay({ type, data, onAccept, onDecline }) {
  const isBadge     = type === 'badge';
  const accentColor = isBadge ? '#f59e0b' : '#facc15';
  const Icon        = isBadge ? Medal : Award;
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 3000, overflow: 'hidden' }}>
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} style={{ position: 'absolute', left: `${10 + (i * 3.5) % 80}%`, top: `${15 + (i * 7) % 70}%`, width: `${5 + (i % 4) * 3}px`, height: `${5 + (i % 4) * 3}px`, borderRadius: '50%', backgroundColor: ['#facc15','#f97316','#ef4444','#22c55e','#60a5fa','#a78bfa'][i % 6], animation: `${SPARK_ANIMS[i % 6]} ${0.9 + (i % 5) * 0.2}s ease-out ${(i % 8) * 0.12}s forwards` }} />
        ))}
      </div>
      <div style={st.modalOverlay}>
        <div style={{ ...st.modalContent, borderColor: accentColor, animation: 'fadeInUp 0.4s ease-out' }}>
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
                <div style={{ color: '#94a3b8', fontSize: '14px', marginTop: '4px' }}>stappen</div>
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
                <button onClick={onAccept}  style={{ flex: 1, padding: '14px', backgroundColor: '#22c55e', border: 'none', borderRadius: '10px', color: 'white', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><Check size={20} /> JA</button>
                <button onClick={onDecline} style={{ flex: 1, padding: '14px', backgroundColor: '#475569', border: 'none', borderRadius: '10px', color: 'white', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><X size={20} /> NEE</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Isolated Timer ───────────────────────────────────────────────────────────
const LiveTimer = memo(({ startTime, durationSeconds, isRecording, isFinished, overtimeColor = '#f97316' }) => {
  const [display,    setDisplay]    = useState('0:00');
  const [isOvertime, setIsOvertime] = useState(false);

  useEffect(() => {
    if (!isRecording && !isFinished) { setDisplay('0:00'); setIsOvertime(false); return; }
    const interval = setInterval(() => {
      if (isRecording && startTime) {
        const elapsed   = Math.floor((Date.now() - startTime) / 1000);
        const remaining = durationSeconds ? durationSeconds - elapsed : -elapsed;
        const abs  = Math.abs(remaining);
        const mins = Math.floor(abs / 60);
        const secs = abs % 60;
        setIsOvertime(remaining < 0);
        setDisplay(`${remaining < 0 ? '+' : ''}${mins}:${secs.toString().padStart(2, '0')}`);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [startTime, durationSeconds, isRecording, isFinished]);

  return (
    <div style={{ fontSize: '28px', fontWeight: 'bold', fontFamily: 'monospace', color: isOvertime ? overtimeColor : '#60a5fa', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <Timer size={22} color={isOvertime ? overtimeColor : '#60a5fa'} />
      {display}
    </div>
  );
});

// ─── Relay scoreboard ─────────────────────────────────────────────────────────
function RelayScoreboard({ relayOrder, relayResults, currentSkipperIndex, discName }) {
  const total = relayResults.reduce((s, r) => s + (r.steps || 0), 0);
  return (
    <div style={{ width: '100%', maxWidth: '440px', backgroundColor: '#1e293b', borderRadius: '14px', border: '1px solid #334155', padding: '14px', marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{discName} · Teamtotaal</div>
        <div style={{ fontSize: '22px', fontWeight: '900', color: '#60a5fa' }}>{total} <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '400' }}>stappen</span></div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {relayOrder.map((item, idx) => {
          const result    = relayResults[idx] || { steps: 0 };
          const isCurrent = idx === currentSkipperIndex;
          const isDone    = idx < currentSkipperIndex;
          return (
            <div key={item.memberId} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '8px', backgroundColor: isCurrent ? '#1e3a5f' : '#0f172a', border: `1px solid ${isCurrent ? '#3b82f688' : isDone ? '#22c55e33' : '#1e293b'}`, opacity: !isCurrent && !isDone ? 0.45 : 1, transition: 'all 0.3s' }}>
              <div style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: isCurrent ? '#3b82f6' : isDone ? '#22c55e' : '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', color: 'white', flexShrink: 0 }}>{isDone ? '✓' : idx + 1}</div>
              <div style={{ flex: 1, fontSize: '13px', fontWeight: isCurrent ? '700' : '400', color: isCurrent ? '#f1f5f9' : isDone ? '#94a3b8' : '#475569' }}>{item.name}</div>
              <div style={{ fontSize: '16px', fontWeight: '800', color: isCurrent ? '#60a5fa' : isDone ? '#22c55e' : '#334155' }}>{result.steps ?? '—'}</div>
              {isCurrent && <div style={{ fontSize: '9px', fontWeight: '700', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.5px' }}>ACTIEF</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Relay results summary ────────────────────────────────────────────────────
function RelayResultsSummary({ relayOrder, relayResults, discName, sessionType, onNewSession, onReset }) {
  const total = relayResults.reduce((s, r) => s + (r.steps || 0), 0);
  return (
    <div style={{ width: '100%', maxWidth: '440px', backgroundColor: '#1e293b', borderRadius: '14px', border: '1px solid #22c55e44', padding: '20px', animation: 'fadeInUp 0.4s ease-out' }}>
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <div style={{ fontSize: '36px', marginBottom: '6px' }}>🏆</div>
        <div style={{ fontSize: '14px', fontWeight: '700', color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sessie voltooid!</div>
        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{discName} · {sessionType}</div>
      </div>
      <div style={{ backgroundColor: '#0f172a', borderRadius: '10px', padding: '14px', marginBottom: '14px', textAlign: 'center', border: '1px solid #22c55e33' }}>
        <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Teamtotaal</div>
        <div style={{ fontSize: '44px', fontWeight: '900', color: '#22c55e', lineHeight: 1 }}>{total}</div>
        <div style={{ fontSize: '12px', color: '#64748b' }}>stappen</div>
      </div>
      <div style={{ marginBottom: '8px', fontSize: '11px', color: '#475569', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Individueel</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '16px' }}>
        {relayOrder.map((item, idx) => {
          const result = relayResults[idx] || { steps: 0 };
          return (
            <div key={item.memberId} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b' }}>
              <div style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', color: '#94a3b8', flexShrink: 0 }}>{idx + 1}</div>
              <div style={{ flex: 1, fontSize: '13px', color: '#94a3b8' }}>{item.name}</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#60a5fa' }}>{result.steps ?? 0}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
        <button onClick={onNewSession} style={{ flex: 1, padding: '13px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '10px', color: 'white', fontWeight: '700', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <Play size={16} fill="white" /> Nieuwe sessie
        </button>
        <button onClick={onReset} style={{ padding: '13px 16px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '10px', color: '#94a3b8', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
          Andere skipper
        </button>
      </div>
    </div>
  );
}

// ─── Triple Under display ─────────────────────────────────────────────────────
function TripleUnderDisplay({ attempts, currentAttempt, missCountdown, onMisser }) {
  const best = Math.max(...attempts.map(a => a.steps), 0);
  return (
    <div style={{ width: '100%', maxWidth: '440px' }}>
      {attempts.length > 0 && (
        <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '12px 14px', marginBottom: '10px' }}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Pogingen · Beste: <span style={{ color: '#facc15' }}>{best}</span>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {attempts.map((a, i) => (
              <div key={i} style={{ padding: '4px 10px', borderRadius: '6px', backgroundColor: a.steps === best && best > 0 ? '#facc1522' : '#0f172a', border: `1px solid ${a.steps === best && best > 0 ? '#facc1544' : '#334155'}`, fontSize: '13px', fontWeight: '700', color: a.steps === best && best > 0 ? '#facc15' : '#94a3b8' }}>
                #{i + 1}: {a.steps}
              </div>
            ))}
          </div>
        </div>
      )}
      {missCountdown !== null && (
        <div style={{ backgroundColor: '#ef444422', border: '1px solid #ef444444', borderRadius: '12px', padding: '12px 16px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ fontSize: '28px', fontWeight: '900', color: '#ef4444', fontFamily: 'monospace', animation: 'countPulse 1s ease-in-out infinite', minWidth: '36px', textAlign: 'center' }}>{missCountdown}</div>
          <div>
            <div style={{ fontWeight: '700', fontSize: '13px', color: '#ef4444' }}>Misser! Nog {missCountdown}s om verder te gaan</div>
            <div style={{ fontSize: '11px', color: '#ef444488', marginTop: '2px' }}>Begin opnieuw te tellen om poging {attempts.length + 2} te starten</div>
          </div>
        </div>
      )}
      {missCountdown === null && (
        <button onClick={onMisser} style={{ width: '100%', padding: '12px', backgroundColor: '#ef444422', border: '2px solid #ef444466', borderRadius: '12px', color: '#ef4444', fontWeight: '700', fontSize: '15px', cursor: 'pointer', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <AlertTriangle size={18} /> MISSER (start 15s countdown)
        </button>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function CounterPage() {
  const { disciplines, getDisc, getLabel } = useDisciplines();

  // ── Read all params from URL (set by /skipper-select) ─────────────────────
  const urlParams = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();

  const paramDisciplineId = urlParams.get('disciplineId') || '';
  const paramSessionType  = urlParams.get('sessionType')  || 'Training';
  const paramMemberId     = urlParams.get('memberId')     || '';
  const paramFirstName    = urlParams.get('firstName')    || '';
  const paramLastName     = urlParams.get('lastName')     || '';
  const paramRtdbUid      = urlParams.get('rtdbUid')      || '';
  const paramClubId       = urlParams.get('clubId')       || '';
  const paramGroupId      = urlParams.get('groupId')      || '';
  const teamOrderRaw      = urlParams.get('teamOrder')    || '';

  // Whether the page was reached via the normal flow (skipper-select → /counter)
  const hasParams = !!(paramDisciplineId && paramClubId && paramGroupId);

  // Parse relay team order from URL param (set by RelayTeamBuilder in skipper-select)
  let initialTeamOrder = [];
  try {
    if (teamOrderRaw) initialTeamOrder = JSON.parse(decodeURIComponent(teamOrderRaw));
  } catch {}

  // ── Derived from params — read-only, never editable mid-session ───────────
  const disciplineId = paramDisciplineId;
  const sessionType  = paramSessionType;

  const currentDisc = getDisc(disciplineId);
  const sessionMode = !currentDisc ? 'individual'
    : currentDisc.specialRule === 'triple_under' ? 'triple_under'
    : currentDisc.specialRule === 'relay'        ? 'relay'
    : 'individual';

  // ── State ─────────────────────────────────────────────────────────────────
  const [counterUser,    setCounterUser]    = useState(null);
  const [selectedSkipper] = useState(
    paramMemberId
      ? { memberId: paramMemberId, clubId: paramClubId, firstName: paramFirstName, lastName: paramLastName, rtdbUid: paramRtdbUid }
      : null
  );
  // Relay team order comes fully formed from URL params
  const [selectedTeamOrder] = useState(initialTeamOrder);

  const [currentData,    setCurrentData]    = useState(null);
  const [liveBpm,        setLiveBpm]        = useState(0);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [bestRecord,     setBestRecord]     = useState(null);

  const [pendingQueue,      setPendingQueue]      = useState([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [newlyEarnedBadges, setNewlyEarnedBadges] = useState([]);

  const [tuAttempts,      setTuAttempts]      = useState([]);
  const [tuCurrentSteps,  setTuCurrentSteps]  = useState(0);
  const [tuMissCountdown, setTuMissCountdown] = useState(null);
  const [tuIsActive,      setTuIsActive]      = useState(false);
  const [tuIsFinished,    setTuIsFinished]    = useState(false);
  const tuCountdownRef = useRef(null);

  const [relayOrder,          setRelayOrder]          = useState([]);
  const [relayResults,        setRelayResults]        = useState([]);
  const [currentSkipperIndex, setCurrentSkipperIndex] = useState(0);
  const [relayIsActive,       setRelayIsActive]       = useState(false);
  const [relayIsFinished,     setRelayIsFinished]     = useState(false);
  const [relaySkipperStart,   setRelaySkipperStart]   = useState(null);
  const [isStarting, setIsStarting]                   = useState(false);
  const relayTimerRef        = useRef(null);
  const relayCurrentStepsRef = useRef(0);
  const relayLeadUidRef      = useRef(null);

  const telemetryRef          = useRef([]);
  const sessionStartRef       = useRef(null);
  const autoStopTimerRef      = useRef(null);
  const postSessionRunningRef = useRef(false);

  // ── Load counter user ─────────────────────────────────────────────────────
  useEffect(() => {
    const uid = getCookie(); if (!uid) return;
    UserFactory.get(uid).then(s => { if (s.exists()) setCounterUser({ id: uid, ...s.data() }); });
  }, []);

  // ── Subscribe to live RTDB session (individual only) ──────────────────────
  useEffect(() => {
    if (!selectedSkipper?.rtdbUid || sessionMode !== 'individual') return;
    const unsub = LiveSessionFactory.subscribeToLive(selectedSkipper.rtdbUid, data => {
      if (!data) return;
      setLiveBpm(data.bpm || 0);
      setCurrentData(data.session || null);
    });
    return () => unsub();
  }, [selectedSkipper, sessionMode]);

  // ── Load session history ──────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedSkipper || sessionMode !== 'individual') return;
    const { clubId, memberId } = selectedSkipper;
    const unsub = ClubMemberFactory.getSessionHistory(clubId, memberId, setSessionHistory);
    return () => unsub();
  }, [selectedSkipper, sessionMode]);

  // ── Subscribe to best record ──────────────────────────────────────────────
  useEffect(() => {
    if (!selectedSkipper || sessionMode !== 'individual' || !disciplineId) return;
    const { clubId, memberId } = selectedSkipper;
    const unsub = ClubMemberFactory.subscribeToRecords(clubId, memberId, disciplineId, sessionType, setBestRecord);
    return () => unsub();
  }, [selectedSkipper, disciplineId, sessionType, sessionMode]);

  // ── Auto-stop on idle (individual only) ───────────────────────────────────
  useEffect(() => {
    if (sessionMode !== 'individual') return;
    if (!currentData?.isActive) { clearTimeout(autoStopTimerRef.current); return; }
    clearTimeout(autoStopTimerRef.current);
    autoStopTimerRef.current = setTimeout(() => handleStopSession(), AUTO_STOP_IDLE_MS);
    return () => clearTimeout(autoStopTimerRef.current);
  }, [currentData?.lastStepTime, currentData?.isActive, sessionMode]);

  // ── Trigger post-session flow when session finishes ───────────────────────
  useEffect(() => {
    if (sessionMode !== 'individual') return;
    if (currentData?.isFinished && !postSessionRunningRef.current) {
      triggerPostSessionFlow();
    }
  }, [currentData?.isFinished]);

  // ── Relay timer — auto-advance when duration elapses ─────────────────────
  useEffect(() => {
    if (sessionMode !== 'relay' || !relayIsActive || relayIsFinished) return;
    const disc = currentDisc; if (!disc?.durationSeconds) return;
    clearInterval(relayTimerRef.current);
    relayTimerRef.current = setInterval(() => {
      if (!relaySkipperStart) return;
      const elapsed   = (Date.now() - relaySkipperStart) / 1000;
      const remaining = disc.durationSeconds - elapsed;
      if (remaining <= 0) { clearInterval(relayTimerRef.current); advanceRelaySkipper(); }
    }, 200);
    return () => clearInterval(relayTimerRef.current);
  }, [relayIsActive, relayIsFinished, relaySkipperStart, currentSkipperIndex, sessionMode]);

  // ── Sync relay state to RTDB ──────────────────────────────────────────────
  useEffect(() => {
    if (sessionMode !== 'relay') return;
    if (!relayIsActive && !relayIsFinished) return;
    const rtdbUid = relayLeadUidRef.current; if (!rtdbUid) return;
    const currentItem = relayOrder[currentSkipperIndex];
    const total = relayResults.reduce((s, r) => s + (r.steps || 0), 0);
    import('../firebaseConfig').then(({ rtdb }) => {
      import('firebase/database').then(({ ref, update }) => {
        update(ref(rtdb, `live_sessions/${rtdbUid}/relaySession`), {
          isActive: relayIsActive, isFinished: relayIsFinished, currentSkipperIndex,
          currentSkipperName: currentItem?.name || '', currentSkipperMemberId: currentItem?.memberId || '',
          totalSteps: total, skipperCount: relayOrder.length,
          results: relayResults.map((r, i) => ({ memberId: relayOrder[i]?.memberId || '', name: relayOrder[i]?.name || '', steps: r.steps || 0 })),
          updatedAt: Date.now(),
        }).catch(() => {});
      });
    });
  }, [relayResults, currentSkipperIndex, relayIsActive, relayIsFinished, sessionMode]);

  // ── Clean up relay RTDB node on unmount ───────────────────────────────────
  useEffect(() => {
    if (sessionMode !== 'relay') return;
    return () => {
      const rtdbUid = relayLeadUidRef.current; if (!rtdbUid) return;
      import('../firebaseConfig').then(({ rtdb }) => {
        import('firebase/database').then(({ ref, remove }) => {
          remove(ref(rtdb, `live_sessions/${rtdbUid}/relaySession`)).catch(() => {});
        });
      });
    };
  }, [sessionMode]);

  // ── Triple-under miss countdown ───────────────────────────────────────────
  useEffect(() => {
    if (tuMissCountdown === null) return;
    if (tuMissCountdown <= 0) { clearInterval(tuCountdownRef.current); finishTripleUnder(); return; }
    clearInterval(tuCountdownRef.current);
    tuCountdownRef.current = setInterval(() => {
      setTuMissCountdown(prev => { if (prev === null || prev <= 1) { clearInterval(tuCountdownRef.current); return 0; } return prev - 1; });
    }, 1000);
    return () => clearInterval(tuCountdownRef.current);
  }, [tuMissCountdown]);

  // ─── Session handlers ─────────────────────────────────────────────────────
  const handleStartSession = async () => {
    telemetryRef.current = []; sessionStartRef.current = null;

    if (sessionMode === 'triple_under') {
      setTuAttempts([]); setTuCurrentSteps(0); setTuMissCountdown(null);
      setTuIsActive(true); setTuIsFinished(false);
      return;
    }

    if (sessionMode === 'relay') {
      // Team order comes from URL params (set in skipper-select)
      const order = selectedTeamOrder.length > 0
        ? selectedTeamOrder
        : [];
      setRelayOrder(order);
      setRelayResults(new Array(order.length).fill({ steps: 0 }));
      setCurrentSkipperIndex(0); setRelayIsActive(false); setRelayIsFinished(false); setRelaySkipperStart(null);
      relayCurrentStepsRef.current = 0;
      if (order.length > 0) {
        UserMemberLinkFactory.getUidForMember(paramClubId, order[0].memberId)
          .then(uid => { relayLeadUidRef.current = uid || null; })
          .catch(() => { relayLeadUidRef.current = null; });
      }
      return;
    }

    // Individual
    setIsStarting(true);
    await LiveSessionFactory.startCounter(selectedSkipper.rtdbUid, disciplineId, sessionType);
    setIsStarting(false);
  };

  const handleCountStep = () => {
    if (sessionMode === 'triple_under') { handleTuStep(); return; }
    if (sessionMode === 'relay')        { handleRelayStep(); return; }
    if (!currentData?.isActive || currentData?.isFinished) return;
    if (!sessionStartRef.current) sessionStartRef.current = Date.now();
    LiveSessionFactory.incrementSteps(selectedSkipper.rtdbUid, liveBpm, sessionStartRef.current);
    telemetryRef.current.push({ time: Date.now() - sessionStartRef.current, steps: (currentData?.steps || 0) + 1, heartRate: liveBpm });
  };

  const handleStopSession = useCallback(async () => {
    if (sessionMode === 'triple_under') { handleTuMisser(); return; }
    if (!selectedSkipper || !currentData?.isActive) return;
    clearTimeout(autoStopTimerRef.current);
    await LiveSessionFactory.stopCounter(selectedSkipper.rtdbUid);
  }, [selectedSkipper, currentData, sessionMode]);

  const handleTuStep = () => {
    if (tuIsFinished) return;
    if (tuMissCountdown !== null) {
      setTuAttempts(prev => [...prev, { steps: tuCurrentSteps }]);
      setTuCurrentSteps(1); setTuMissCountdown(null); clearInterval(tuCountdownRef.current); return;
    }
    setTuCurrentSteps(prev => prev + 1); setTuIsActive(true);
  };

  const handleTuMisser = () => {
    if (tuIsFinished || tuMissCountdown !== null) return;
    if (tuCurrentSteps > 0) { setTuAttempts(prev => [...prev, { steps: tuCurrentSteps }]); setTuCurrentSteps(0); }
    setTuMissCountdown(Math.ceil(TRIPLE_UNDER_IDLE / 1000));
  };

  const finishTripleUnder = () => {
    setTuIsActive(false); setTuIsFinished(true);
    setTuMissCountdown(null); clearInterval(tuCountdownRef.current);
  };

  // Save triple-under session when it finishes
  useEffect(() => {
    if (!tuIsFinished || !selectedSkipper) return;
    const saveSession = async () => {
      const { clubId, memberId } = selectedSkipper;
      const allAttempts = tuAttempts.length > 0 ? tuAttempts : [{ steps: tuCurrentSteps }];
      const bestScore   = Math.max(...allAttempts.map(a => a.steps), 0);
      try {
        const _disc = getDisc(disciplineId);
        await ClubMemberFactory.saveSessionHistory(clubId, memberId, {
          discipline: disciplineId, disciplineName: _disc?.name || disciplineId, ropeType: _disc?.ropeType || 'SR',
          sessionType, score: bestScore, avgBpm: 0, maxBpm: 0, sessionStart: null, telemetry: [],
          countedBy: counterUser?.id || null, countedByName: counterUser ? `${counterUser.firstName} ${counterUser.lastName}` : null,
        });
      } catch (e) { console.error('Failed to save TU session:', e); }
      const freshHistory = await ClubMemberFactory.getSessionHistoryOnce(clubId, memberId);
      try {
        const _discBadge = getDisc(disciplineId);
        const newBadges = await BadgeFactory.checkAndAward(clubId, memberId, { score: bestScore, discipline: disciplineId, disciplineName: _discBadge?.name || disciplineId, ropeType: _discBadge?.ropeType || 'SR', sessionType }, freshHistory);
        if (newBadges.length > 0) setNewlyEarnedBadges(newBadges);
      } catch (e) { console.error('Badge check failed:', e); }
      const prevBest = bestRecord?.score || 0;
      if (bestScore > prevBest) {
        setPendingQueue([{ type: 'record', data: { score: bestScore, discipline: disciplineId, sessionType, previousBest: prevBest, telemetry: [] } }]);
        setIsProcessingQueue(true);
      }
    };
    saveSession();
  }, [tuIsFinished]);

  const handleRelayStep = () => {
    if (relayIsFinished) return;
    if (!relayIsActive) { setRelayIsActive(true); setRelaySkipperStart(Date.now()); relayCurrentStepsRef.current = 0; }
    relayCurrentStepsRef.current += 1;
    setRelayResults(prev => {
      const next = [...prev];
      next[currentSkipperIndex] = { ...(next[currentSkipperIndex] || {}), memberId: relayOrder[currentSkipperIndex]?.memberId, steps: relayCurrentStepsRef.current };
      return next;
    });
  };

  const advanceRelaySkipper = () => {
    clearInterval(relayTimerRef.current);
    const nextIdx = currentSkipperIndex + 1;
    if (nextIdx >= relayOrder.length) { setRelayIsActive(false); setRelayIsFinished(true); return; }
    setCurrentSkipperIndex(nextIdx); setRelaySkipperStart(Date.now()); relayCurrentStepsRef.current = 0;
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([200, 100, 200]);
  };

  const handleManualAdvance = () => { if (!relayIsActive || relayIsFinished) return; advanceRelaySkipper(); };

  // Save relay session when it finishes
  useEffect(() => {
    if (!relayIsFinished || relayOrder.length === 0) return;
    const saveRelaySession = async () => {
      const total        = relayResults.reduce((s, r) => s + (r.steps || 0), 0);
      const leadMemberId = relayOrder[0].memberId;
      const clubId       = paramClubId;
      try {
        const _disc = getDisc(disciplineId);
        await ClubMemberFactory.saveSessionHistory(clubId, leadMemberId, {
          discipline: disciplineId, disciplineName: _disc?.name || disciplineId, ropeType: _disc?.ropeType || 'SR',
          sessionType, score: total, avgBpm: 0, maxBpm: 0, sessionStart: null, telemetry: [],
          teamResults: relayResults.map((r, i) => ({ ...r, name: relayOrder[i]?.name || '' })),
          countedBy: counterUser?.id || null, countedByName: counterUser ? `${counterUser.firstName} ${counterUser.lastName}` : null,
        });
      } catch (e) { console.error('Failed to save relay session:', e); }
      const freshHistory = await ClubMemberFactory.getSessionHistoryOnce(clubId, leadMemberId);
      try {
        const _discBadge = getDisc(disciplineId);
        const newBadges = await BadgeFactory.checkAndAward(clubId, leadMemberId, { score: total, discipline: disciplineId, disciplineName: _discBadge?.name || disciplineId, ropeType: _discBadge?.ropeType || 'SR', sessionType }, freshHistory);
        if (newBadges.length > 0) setNewlyEarnedBadges(newBadges);
      } catch (e) { console.error('Badge check failed:', e); }
    };
    saveRelaySession();
  }, [relayIsFinished]);

  const triggerPostSessionFlow = async () => {
    if (!selectedSkipper || !currentData) return;
    if (postSessionRunningRef.current) return;
    postSessionRunningRef.current = true;

    const { clubId, memberId } = selectedSkipper;
    const score     = currentData.steps || 0;
    const telemetry = telemetryRef.current;
    const bpmValues = telemetry.map(t => t.heartRate).filter(b => b > 0);
    const avgBpm    = bpmValues.length ? Math.round(bpmValues.reduce((a, b) => a + b, 0) / bpmValues.length) : liveBpm;
    const maxBpm    = bpmValues.length ? Math.max(...bpmValues) : liveBpm;
    try {
      const _disc = getDisc(disciplineId);
      await ClubMemberFactory.saveSessionHistory(clubId, memberId, {
        discipline: disciplineId, disciplineName: _disc?.name || disciplineId, ropeType: _disc?.ropeType || 'SR',
        sessionType, score, avgBpm, maxBpm, sessionStart: currentData.startTime || sessionStartRef.current, telemetry,
        countedBy: counterUser?.id || null, countedByName: counterUser ? `${counterUser.firstName} ${counterUser.lastName}` : null,
      });
    } catch (e) { console.error('Failed to save session history:', e); }
    const freshHistory = await ClubMemberFactory.getSessionHistoryOnce(clubId, memberId);
    try {
      const _discBadge = getDisc(disciplineId);
      const newBadges = await BadgeFactory.checkAndAward(clubId, memberId, { score, discipline: disciplineId, disciplineName: _discBadge?.name || disciplineId, ropeType: _discBadge?.ropeType || 'SR', sessionType }, freshHistory);
      if (newBadges.length > 0) setNewlyEarnedBadges(newBadges);
    } catch (e) { console.error('Badge check failed:', e); }
    if (counterUser) {
      try { await CounterBadgeFactory.checkAndAward(counterUser.id, { discipline: disciplineId, sessionType, score }); }
      catch (e) { console.error('Counter badge check failed:', e); }
    }
    const previousBest = bestRecord?.score || 0;
    if (score > previousBest) {
      setPendingQueue([{ type: 'record', data: { score, discipline: disciplineId, sessionType, previousBest, telemetry } }]);
      setIsProcessingQueue(true);
    }
    postSessionRunningRef.current = false;
  };

  const handleQueueAccept = async () => {
    const current = pendingQueue[0]; if (!current) return;
    if (current.type === 'record') {
      const { clubId, memberId } = selectedSkipper;
      try { await ClubMemberFactory.addRecord(clubId, memberId, current.data); }
      catch (e) { console.error('Failed to save record:', e); }
    }
    advanceQueue();
  };

  const advanceQueue = () => {
    setPendingQueue(prev => { const next = prev.slice(1); if (next.length === 0) setIsProcessingQueue(false); return next; });
  };

  // ── Navigation helpers ────────────────────────────────────────────────────
  const cleanupSession = async () => {
    clearTimeout(autoStopTimerRef.current);
    clearInterval(relayTimerRef.current);
    clearInterval(tuCountdownRef.current);
    telemetryRef.current = [];
    postSessionRunningRef.current = false;
    if (selectedSkipper?.rtdbUid) {
      await LiveSessionFactory.resetSession(selectedSkipper.rtdbUid).catch(() => {});
    }
  };

  // "Andere skipper" — navigate to skipper-select with NO pre-fill
  const handleReset = useCallback(async () => {
    await cleanupSession();
    window.location.href = '/skipper-select?mode=manual&return=/counter';
  }, [selectedSkipper]);

  // "Nieuwe sessie" — navigate to skipper-select WITH previous selection pre-filled
  const handleNewSession = useCallback(async () => {
    await cleanupSession();
    const prev = encodeURIComponent(JSON.stringify({
      disciplineId,
      sessionType,
      clubId:          paramClubId,
      groupId:         paramGroupId,
      selectedSkipper,
      teamOrder:       selectedTeamOrder,
    }));
    window.location.href = `/skipper-select?mode=manual&return=/counter&prev=${prev}`;
  }, [selectedSkipper, disciplineId, sessionType, paramClubId, paramGroupId, selectedTeamOrder]);

  // ── Derived rendering flags ───────────────────────────────────────────────
  const isRecording  = sessionMode === 'individual' && currentData?.isActive === true;
  const isFinished   = sessionMode === 'individual' && currentData?.isFinished === true && !currentData?.isActive;
  const isStartklaar = sessionMode === 'individual' && currentData !== null && !isRecording && !isFinished;
  const relayDurationSec = currentDisc?.durationSeconds || 30;

  // ── Empty state: page loaded directly without params ─────────────────────
  if (!hasParams) {
    return (
      <div style={{ ...st.container, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', maxWidth: '280px', textAlign: 'center' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '18px', backgroundColor: '#1e293b', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Hash size={28} color="#334155" />
          </div>
          <div>
            <div style={{ fontWeight: '700', fontSize: '16px', color: '#f1f5f9', marginBottom: '6px' }}>Geen sessie geselecteerd</div>
            <div style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.6 }}>
              Kies een skipper en onderdeel via de Live-pagina.
            </div>
          </div>
          <a
            href="/skipper-select?mode=manual&return=/counter"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '13px 24px', borderRadius: '12px', backgroundColor: '#3b82f6', color: 'white', fontWeight: '700', fontSize: '15px', textDecoration: 'none' }}
          >
            <Hash size={16} /> Kies skipper
          </a>
          <a href="/live" style={{ fontSize: '13px', color: '#475569', textDecoration: 'none' }}>
            ← Terug naar Live
          </a>
        </div>
      </div>
    );
  }

  // ── Screen: RELAY counter ─────────────────────────────────────────────────
  if (sessionMode === 'relay') {
    const currentItem     = relayOrder[currentSkipperIndex];
    const currentName     = currentItem?.name || '?';
    const currentInitials = currentName.split(' ').map(n => n[0] || '').join('').toUpperCase().slice(0, 2) || '??';
    const totalSteps      = relayResults.reduce((s, r) => s + (r.steps || 0), 0);
    const discName        = currentDisc?.name || disciplineId;

    // Relay hasn't been started yet (team order loaded, waiting for first tap)
    const relayReady = relayOrder.length === 0 && selectedTeamOrder.length > 0;

    // Initialise relay on first render if not yet started
    useEffect(() => {
      if (selectedTeamOrder.length > 0 && relayOrder.length === 0) {
        setRelayOrder(selectedTeamOrder);
        setRelayResults(new Array(selectedTeamOrder.length).fill({ steps: 0 }));
        UserMemberLinkFactory.getUidForMember(paramClubId, selectedTeamOrder[0].memberId)
          .then(uid => { relayLeadUidRef.current = uid || null; })
          .catch(() => { relayLeadUidRef.current = null; });
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (relayIsFinished) {
      return (
        <div style={st.container}>
          {isProcessingQueue && pendingQueue.length > 0 && <CelebrationOverlay type={pendingQueue[0].type} data={pendingQueue[0].data} onAccept={handleQueueAccept} onDecline={advanceQueue} />}
          <RelayResultsSummary relayOrder={relayOrder} relayResults={relayResults} discName={discName} sessionType={sessionType} onNewSession={handleNewSession} onReset={handleReset} />
        </div>
      );
    }

    return (
      <div style={st.container}>
        {isProcessingQueue && pendingQueue.length > 0 && <CelebrationOverlay type={pendingQueue[0].type} data={pendingQueue[0].data} onAccept={handleQueueAccept} onDecline={advanceQueue} />}
        <div style={st.activeHeader}>
          <button style={st.backBtn} onClick={handleReset}><ArrowLeft size={18} /> Andere skipper</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ ...st.avatar, width: '44px', height: '44px', fontSize: '15px' }}>{currentInitials}</div>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '18px' }}>{currentName}</div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>{discName} · Skipper {currentSkipperIndex + 1} van {relayOrder.length}</div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#60a5fa', fontFamily: 'monospace' }}>
                {relayIsActive ? `${Math.max(0, Math.ceil(relayDurationSec - (Date.now() - relaySkipperStart) / 1000))}s` : `${relayDurationSec}s`}
              </div>
              <div style={{ fontSize: '9px', color: '#475569', fontWeight: '700', textTransform: 'uppercase' }}>{relayIsActive ? 'RESTERENDE TIJD' : 'WACHT OP TELLER'}</div>
            </div>
          </div>
        </div>
        <RelayScoreboard relayOrder={relayOrder} relayResults={relayResults} currentSkipperIndex={currentSkipperIndex} discName={discName} />
        <button
          style={{ ...st.counterButton, backgroundColor: '#1e293b', border: `3px solid ${relayIsActive ? '#3b82f6' : '#334155'}`, boxShadow: relayIsActive ? '0 0 60px rgba(59,130,246,0.25)' : 'none' }}
          onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.96)'; handleCountStep(); }}
          onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
          onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <span style={st.stepLabel}>STAPPEN</span>
          <span style={{ fontSize: '100px', lineHeight: 1, fontWeight: '900' }}>{relayResults[currentSkipperIndex]?.steps ?? 0}</span>
          {!relayIsActive && <span style={{ fontSize: '14px', color: '#64748b', marginTop: '8px' }}>Tik om te starten</span>}
        </button>
        <div style={st.controls}>
          {relayIsActive && (
            <button onClick={handleManualAdvance} style={{ ...st.stopButton, backgroundColor: '#f59e0b', marginBottom: '10px' }}>
              <SkipForward size={18} /> VOLGENDE SKIPPER
            </button>
          )}
          <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
            Teamtotaal: <strong style={{ color: '#60a5fa' }}>{totalSteps}</strong> stappen
          </div>
        </div>
      </div>
    );
  }

  // ── Screen: TRIPLE UNDER counter ──────────────────────────────────────────
  if (sessionMode === 'triple_under') {
    const discName  = currentDisc?.name || disciplineId;
    const bestSoFar = Math.max(...tuAttempts.map(a => a.steps), tuCurrentSteps, 0);

    if (tuIsFinished) {
      return (
        <div style={st.container}>
          {isProcessingQueue && pendingQueue.length > 0 && <CelebrationOverlay type={pendingQueue[0].type} data={pendingQueue[0].data} onAccept={handleQueueAccept} onDecline={advanceQueue} />}
          <div style={{ width: '100%', maxWidth: '440px', backgroundColor: '#1e293b', borderRadius: '14px', border: '1px solid #22c55e44', padding: '20px', animation: 'fadeInUp 0.4s ease-out' }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '36px', marginBottom: '6px' }}>⚡</div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sessie voltooid!</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{discName}</div>
            </div>
            <div style={{ backgroundColor: '#0f172a', borderRadius: '10px', padding: '14px', marginBottom: '14px', textAlign: 'center', border: '1px solid #facc1533' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Beste poging</div>
              <div style={{ fontSize: '44px', fontWeight: '900', color: '#facc15', lineHeight: 1 }}>{bestSoFar}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>stappen · {tuAttempts.length} pogi{tuAttempts.length === 1 ? 'ng' : 'ngen'}</div>
            </div>
            {tuAttempts.length > 1 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
                {tuAttempts.map((a, i) => (
                  <div key={i} style={{ padding: '4px 10px', borderRadius: '6px', backgroundColor: a.steps === bestSoFar ? '#facc1522' : '#0f172a', border: `1px solid ${a.steps === bestSoFar ? '#facc1544' : '#334155'}`, fontSize: '13px', fontWeight: '700', color: a.steps === bestSoFar ? '#facc15' : '#64748b' }}>
                    #{i + 1}: {a.steps}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleNewSession} style={{ flex: 1, padding: '13px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '10px', color: 'white', fontWeight: '700', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Play size={16} fill="white" /> Nieuwe sessie
              </button>
              <button onClick={handleReset} style={{ padding: '13px 16px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '10px', color: '#94a3b8', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
                Andere skipper
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Triple-under counting screen
    if (!tuIsActive) {
      // Not yet started — show start button
      return (
        <div style={st.container}>
          <div style={st.activeHeader}>
            <button style={st.backBtn} onClick={handleReset}><ArrowLeft size={18} /> Andere skipper</button>
            <div style={st.userInfo}>
              <div style={{ ...st.avatar, width: '44px', height: '44px', fontSize: '15px' }}>{selectedSkipper.firstName[0]}{selectedSkipper.lastName[0]}</div>
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '18px' }}>{selectedSkipper.firstName} {selectedSkipper.lastName}</div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>{discName} · {sessionType}</div>
              </div>
            </div>
          </div>
          <button
            onClick={handleStartSession}
            style={{ ...st.counterButton, backgroundColor: '#1e293b', border: '3px solid #334155' }}
          >
            <span style={st.stepLabel}>TRIPLE UNDER</span>
            <span style={{ fontSize: '60px', lineHeight: 1 }}>⚡</span>
            <span style={{ fontSize: '14px', color: '#64748b', marginTop: '8px' }}>Tik om te starten</span>
          </button>
        </div>
      );
    }

    return (
      <div style={st.container}>
        {isProcessingQueue && pendingQueue.length > 0 && <CelebrationOverlay type={pendingQueue[0].type} data={pendingQueue[0].data} onAccept={handleQueueAccept} onDecline={advanceQueue} />}
        <div style={st.activeHeader}>
          <button style={st.backBtn} onClick={handleReset}><ArrowLeft size={18} /> Andere skipper</button>
          <div style={st.userInfo}>
            <div style={{ ...st.avatar, width: '44px', height: '44px', fontSize: '15px' }}>{selectedSkipper.firstName[0]}{selectedSkipper.lastName[0]}</div>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '18px' }}>{selectedSkipper.firstName} {selectedSkipper.lastName}</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>{discName} · {sessionType}</div>
            </div>
            {bestSoFar > 0 && (
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div style={{ fontSize: '18px', fontWeight: '900', color: '#facc15' }}>{bestSoFar}</div>
                <div style={{ fontSize: '9px', color: '#475569' }}>BESTE</div>
              </div>
            )}
          </div>
        </div>
        <TripleUnderDisplay attempts={tuAttempts} currentAttempt={tuCurrentSteps} missCountdown={tuMissCountdown} onMisser={handleTuMisser} />
        <button
          style={{ ...st.counterButton, backgroundColor: tuMissCountdown !== null ? '#1a0a0a' : '#1e293b', border: `3px solid ${tuMissCountdown !== null ? '#ef444466' : tuIsActive ? '#3b82f6' : '#334155'}`, boxShadow: tuIsActive && tuMissCountdown === null ? '0 0 60px rgba(59,130,246,0.25)' : 'none' }}
          onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.96)'; handleCountStep(); }}
          onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
          onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <span style={st.stepLabel}>{tuMissCountdown !== null ? 'POGING KLAAR' : 'STAPPEN'}</span>
          <span style={{ fontSize: '100px', lineHeight: 1, fontWeight: '900' }}>{tuCurrentSteps}</span>
          {tuMissCountdown !== null && <span style={{ fontSize: '14px', color: '#ef4444', marginTop: '8px' }}>Tik om nieuwe poging te starten</span>}
        </button>
        <div style={st.controls}>
          <button onClick={handleTuMisser} style={{ ...st.stopButton, backgroundColor: '#475569' }}>
            <Square size={18} fill="white" /> STOPPEN
          </button>
        </div>
      </div>
    );
  }

  // ── Screen: INDIVIDUAL counter ────────────────────────────────────────────
  // Not yet started — show start button
  if (!currentData && !isStarting) {
    return (
      <div style={st.container}>
        <div style={st.activeHeader}>
          <button style={st.backBtn} onClick={handleReset}><ArrowLeft size={18} /> Andere skipper</button>
          <div style={st.userInfo}>
            <div style={{ ...st.avatar, width: '44px', height: '44px', fontSize: '15px' }}>{selectedSkipper.firstName[0]}{selectedSkipper.lastName[0]}</div>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '18px' }}>{selectedSkipper.firstName} {selectedSkipper.lastName}</div>
              <div style={{ fontSize: '12px', display: 'flex', gap: '8px', marginTop: '2px' }}>
                <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold', backgroundColor: sessionType === 'Wedstrijd' ? '#ef4444' : '#3b82f6' }}>{sessionType}</span>
                <span style={{ color: '#94a3b8' }}>{currentDisc?.name || disciplineId}</span>
              </div>
            </div>
          </div>
        </div>
        {bestRecord && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '8px 16px', backgroundColor: '#1e293b', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', color: '#facc15' }}>
            <Trophy size={14} /> Record: <strong>{bestRecord.score} stappen</strong>
          </div>
        )}
        <button
          onClick={handleStartSession}
          style={{ ...st.counterButton, backgroundColor: '#1e293b', border: '3px solid #334155' }}
        >
          <span style={st.stepLabel}>STAPPEN</span>
          <span style={{ fontSize: '60px', lineHeight: 1, fontWeight: '900', color: '#334155' }}>0</span>
          <span style={{ fontSize: '14px', color: '#64748b', marginTop: '8px' }}>Tik om te starten</span>
        </button>
      </div>
    );
  }

  return (
    <div style={st.container}>
      {isProcessingQueue && pendingQueue.length > 0 && (
        <CelebrationOverlay type={pendingQueue[0].type} data={pendingQueue[0].data} onAccept={handleQueueAccept} onDecline={advanceQueue} />
      )}

      <div style={st.activeHeader}>
        <button style={st.backBtn} onClick={handleReset}><ArrowLeft size={18} /> Andere skipper</button>
        <div style={st.userInfo}>
          <div style={{ ...st.avatar, width: '44px', height: '44px', fontSize: '15px' }}>{selectedSkipper.firstName[0]}{selectedSkipper.lastName[0]}</div>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '18px' }}>{selectedSkipper.firstName} {selectedSkipper.lastName}</div>
            <div style={{ fontSize: '12px', display: 'flex', gap: '8px', marginTop: '2px' }}>
              <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold', backgroundColor: sessionType === 'Wedstrijd' ? '#ef4444' : '#3b82f6' }}>{sessionType}</span>
              <span style={{ color: '#94a3b8' }}>{currentDisc?.name || disciplineId}</span>
            </div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: '22px', fontWeight: '900', color: '#ef4444' }}>{liveBpm > 0 ? liveBpm : '--'}</div>
            <div style={{ fontSize: '10px', color: '#94a3b8' }}>BPM</div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
          <LiveTimer startTime={currentData?.startTime} durationSeconds={currentDisc?.durationSeconds || null} isRecording={isRecording} isFinished={isFinished} />
          <div style={{ fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {isRecording  ? <><span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444', animation: 'pulse 1s ease-in-out infinite', display: 'inline-block' }} /><span style={{ color: '#ef4444' }}>OPNAME</span></> :
             isFinished   ? <span style={{ color: '#22c55e' }}>KLAAR</span> :
             isStartklaar ? <span style={{ color: '#facc15' }}>STARTKLAAR</span> :
                            <span style={{ color: '#64748b' }}>WACHT</span>}
          </div>
        </div>
      </div>

      {newlyEarnedBadges.length > 0 && (
        <div style={{ width: '100%', maxWidth: '440px', backgroundColor: '#1a1a2e', border: '1px solid #f59e0b44', borderRadius: '12px', padding: '12px 16px', marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#f59e0b', marginBottom: '8px' }}>🎖️ Nieuwe badges verdiend door {selectedSkipper?.firstName}!</div>
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
          <Trophy size={14} /> Record: <strong>{bestRecord.score} stappen</strong>
        </div>
      )}

      <button
        style={{ ...st.counterButton, backgroundColor: isFinished ? '#1e293b' : isRecording ? '#1e3a5f' : '#1e293b', border: isRecording ? '3px solid #3b82f6' : isFinished ? '3px solid #22c55e' : '3px solid #334155', boxShadow: isRecording ? '0 0 60px rgba(59,130,246,0.25)' : 'none', cursor: isFinished ? 'default' : 'pointer' }}
        disabled={isFinished}
        onPointerDown={e => { if (!isFinished) { e.currentTarget.style.transform = 'scale(0.96)'; handleCountStep(); } }}
        onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        <span style={st.stepLabel}>STEPS</span>
        <span style={{ fontSize: '100px', lineHeight: 1, fontWeight: '900' }}>{currentData?.steps ?? 0}</span>
        {!isRecording && !isFinished && <span style={{ fontSize: '14px', color: '#64748b', marginTop: '8px' }}>Tik om te starten</span>}
      </button>

      <div style={st.controls}>
        {isRecording ? (
          <button style={st.stopButton} onClick={handleStopSession}><Square size={18} fill="white" /> STOP</button>
        ) : isFinished ? (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button style={{ ...st.stopButton, backgroundColor: '#3b82f6' }} onClick={handleNewSession}><Play size={18} fill="white" /> NIEUWE SESSIE</button>
            <button style={{ ...st.stopButton, backgroundColor: 'transparent', border: '1px solid #334155', color: '#94a3b8' }} onClick={handleReset}>Andere skipper</button>
          </div>
        ) : isStartklaar ? (
          <>
            <div style={{ color: '#facc15', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}><Zap size={16} /> Eerste tik start de opname</div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button style={{ ...st.stopButton, backgroundColor: '#3b82f6' }} onClick={handleNewSession}><Play size={18} fill="white" /> NIEUWE SESSIE</button>
              <button style={{ ...st.stopButton, backgroundColor: 'transparent', border: '1px solid #334155', color: '#94a3b8' }} onClick={handleReset}>Andere skipper</button>
            </div>
          </>
        ) : null}
      </div>

      <div style={st.historySection}>
        <h3 style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}><HistoryIcon size={16} /> Recente sessies</h3>
        {sessionHistory.slice(0, 5).map((item, idx) => {
          const discLabel = item.disciplineName || getLabel(item.discipline);
          return (
            <div key={idx} style={st.historyItem}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', backgroundColor: item.sessionType === 'Wedstrijd' ? '#ef444422' : '#3b82f622', color: item.sessionType === 'Wedstrijd' ? '#ef4444' : '#60a5fa', border: `1px solid ${item.sessionType === 'Wedstrijd' ? '#ef444440' : '#3b82f640'}` }}>{item.sessionType || 'Training'}</span>
                <span style={{ color: '#94a3b8', fontSize: '12px' }}>{discLabel}</span>
              </div>
              <span style={{ fontWeight: 'bold', color: '#60a5fa', fontSize: '16px' }}>{item.score} <span style={{ fontSize: '11px', color: '#64748b' }}>stappen</span></span>
            </div>
          );
        })}
        {sessionHistory.length === 0 && <p style={{ color: '#475569', fontSize: '13px', textAlign: 'center' }}>Nog geen sessies.</p>}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = {
  container:     { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'sans-serif', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  spinner:       { width: '36px', height: '36px', border: '3px solid #1e293b', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  avatar:        { width: '50px', height: '50px', backgroundColor: '#3b82f6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '16px' },
  modalOverlay:  { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.92)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', zIndex: 100 },
  modalContent:  { backgroundColor: '#1e293b', padding: '30px', borderRadius: '20px', width: '100%', maxWidth: '440px', border: '1px solid #334155' },
  activeHeader:  { backgroundColor: '#1e293b', padding: '16px', borderRadius: '14px', marginBottom: '16px', width: '100%', maxWidth: '440px', border: '1px solid #334155', transition: 'border-color 0.3s' },
  backBtn:       { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', marginBottom: '12px', padding: 0 },
  userInfo:      { display: 'flex', alignItems: 'center', gap: '14px' },
  counterButton: { width: '280px', height: '280px', borderRadius: '50%', color: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', touchAction: 'manipulation', userSelect: 'none', transition: 'transform 0.08s, box-shadow 0.2s', margin: '10px 0' },
  stepLabel:     { fontSize: '13px', letterSpacing: '4px', color: 'rgba(255,255,255,0.35)', fontWeight: '700' },
  controls:      { display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', marginTop: '16px', marginBottom: '24px' },
  stopButton:    { backgroundColor: '#ef4444', color: 'white', padding: '14px 32px', borderRadius: '12px', border: 'none', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '15px' },
  historySection:{ width: '100%', maxWidth: '440px', borderTop: '1px solid #1e293b', paddingTop: '16px' },
  historyItem:   { backgroundColor: '#1e293b', padding: '12px 16px', borderRadius: '10px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '3px solid #3b82f6' },
};
