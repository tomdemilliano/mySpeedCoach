import { useState, useEffect, useRef, memo, useCallback } from 'react';
import {
  LiveSessionFactory, GroupFactory, ClubFactory, UserFactory,
  BadgeFactory, CounterBadgeFactory, ClubMemberFactory, UserMemberLinkFactory,
} from '../constants/dbSchema';
import {
  Hash, Timer, Square, History as HistoryIcon,
  Play, Clock, Users, Building2, Trophy, ArrowLeft,
  Award, Check, X, Zap, Medal,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────
const DISCIPLINE_DURATION = { '30sec': 30, '2min': 120, '3min': 180 };
const AUTO_STOP_IDLE_MS   = 15000;

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
    style.id    = styleId;
    style.textContent = `
      @keyframes sparkFlyA { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(-120px,-200px) scale(0);opacity:0} }
      @keyframes sparkFlyB { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(80px,-250px) scale(0);opacity:0} }
      @keyframes sparkFlyC { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(150px,-180px) scale(0);opacity:0} }
      @keyframes sparkFlyD { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(-80px,-220px) scale(0);opacity:0} }
      @keyframes sparkFlyE { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(30px,-300px) scale(0);opacity:0} }
      @keyframes sparkFlyF { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(-200px,-150px) scale(0);opacity:0} }
      @keyframes pulse     { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
      @keyframes fadeInUp  { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
      @keyframes spin      { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
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
          <div key={i} style={{
            position: 'absolute', left: `${10 + (i * 3.5) % 80}%`, top: `${15 + (i * 7) % 70}%`,
            width: `${5 + (i % 4) * 3}px`, height: `${5 + (i % 4) * 3}px`, borderRadius: '50%',
            backgroundColor: ['#facc15','#f97316','#ef4444','#22c55e','#60a5fa','#a78bfa'][i % 6],
            animation: `${SPARK_ANIMS[i % 6]} ${0.9 + (i % 5) * 0.2}s ease-out ${(i % 8) * 0.12}s forwards`,
          }} />
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

// ─── Isolated Timer ────────────────────────────────────────────────────────────
const LiveTimer = memo(({ startTime, durationSeconds, isRecording, isFinished }) => {
  const [display,    setDisplay]    = useState('0:00');
  const [isOvertime, setIsOvertime] = useState(false);

  useEffect(() => {
    if (!isRecording && !isFinished) { setDisplay('0:00'); setIsOvertime(false); return; }
    const interval = setInterval(() => {
      if (isRecording && startTime) {
        const elapsed   = Math.floor((Date.now() - startTime) / 1000);
        const remaining = durationSeconds - elapsed;
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
    <div style={{ fontSize: '28px', fontWeight: 'bold', fontFamily: 'monospace', color: isOvertime ? '#f97316' : '#60a5fa', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <Timer size={22} color={isOvertime ? '#f97316' : '#60a5fa'} />
      {display}
    </div>
  );
});

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function CounterPage() {
  // ── Current user (counter) ───────────────────────────────────────────────
  const [counterUser,   setCounterUser]   = useState(null);
  const isSuperAdminRef = useRef(false);
  const isClubAdminRef  = useRef(false);

  // ── Member-scoped club/group data ────────────────────────────────────────
  const [memberClubs,   setMemberClubs]   = useState([]);
  const [memberGroups,  setMemberGroups]  = useState([]);
  const [bootstrapDone, setBootstrapDone] = useState(false);

  // Selection state
  const [selectedClubId,  setSelectedClubId]  = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');

  // Skippers in the selected group
  const [skippers,    setSkippers]    = useState([]);
  const [clubMembers, setClubMembers] = useState([]);

  // Selected skipper to count for
  const [selectedSkipper, setSelectedSkipper] = useState(null);

  // Session config modal
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [sessionType,     setSessionType]     = useState('Training');
  const [discipline,      setDiscipline]      = useState('30sec');

  // Live session
  const [currentData,    setCurrentData]    = useState(null);
  const [liveBpm,        setLiveBpm]        = useState(0);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [bestRecord,     setBestRecord]     = useState(null);

  // Post-session queue
  const [pendingQueue,      setPendingQueue]      = useState([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [newlyEarnedBadges, setNewlyEarnedBadges] = useState([]);

  const telemetryRef     = useRef([]);
  const sessionStartRef  = useRef(null);
  const autoStopTimerRef = useRef(null);

  // ── Bootstrap: load counter user + their club/group memberships ──────────
  useEffect(() => {
    const uid = getCookie();
    if (!uid) { setBootstrapDone(true); return; }

    let unsubClubs = () => {};
    let cancelled  = false;

    const bootstrap = async () => {
      const snap = await UserFactory.get(uid);
      if (!snap.exists() || cancelled) { setBootstrapDone(true); return; }

      const user = { id: uid, ...snap.data() };
      setCounterUser(user);

      // ── SuperAdmin: all clubs ─────────────────────────────────────────────
      if (user.role === 'superadmin') {
        isSuperAdminRef.current = true;
        unsubClubs = ClubFactory.getAll((clubs) => {
          if (cancelled || clubs.length === 0) return;
          setMemberClubs(clubs);
          setBootstrapDone(true);
        });
        return;
      }

      // ── ClubAdmin: clubs where they are a coach in at least one group ─────
      if (user.role === 'clubadmin') {
        isClubAdminRef.current = true;
        unsubClubs = ClubFactory.getAll(async (allClubs) => {
          if (cancelled || allClubs.length === 0) return;
          const adminClubIds = new Set();
          await Promise.all(
            allClubs.map(async club => {
              const groups = await GroupFactory.getGroupsByClubOnce(club.id);
              await Promise.all(
                groups.map(async group => {
                  const members = await GroupFactory.getMembersByGroupOnce(club.id, group.id);
                  const isCoach = members.some(m => (m.memberId || m.id) === uid && m.isCoach);
                  if (isCoach) adminClubIds.add(club.id);
                })
              );
            })
          );
          if (cancelled) return;
          const adminClubs = allClubs.filter(c => adminClubIds.has(c.id));
          setMemberClubs(adminClubs);
          setBootstrapDone(true);
        });
        return;
      }

      // ── Normal member: clubs via UserMemberLink ───────────────────────────
      unsubClubs = UserMemberLinkFactory.getForUser(uid, async (profiles) => {
        if (cancelled) return;
        if (profiles.length === 0) { setBootstrapDone(true); return; }

        const clubIdSet    = new Set(profiles.map(p => p.member.clubId));
        const allClubSnaps = await Promise.all(
          [...clubIdSet].map(id => ClubFactory.getById(id))
        );
        if (cancelled) return;
        const resolvedClubs = allClubSnaps
          .filter(s => s.exists())
          .map(s => ({ id: s.id, ...s.data() }));

        setMemberClubs(resolvedClubs);
        setBootstrapDone(true);
      });
    };

    bootstrap();
    return () => { cancelled = true; unsubClubs(); };
  }, []);

  // ── Auto-select club if only one ──────────────────────────────────────────
  useEffect(() => {
    if (!bootstrapDone || memberClubs.length === 0) return;
    if (memberClubs.length === 1) setSelectedClubId(memberClubs[0].id);
  }, [bootstrapDone, memberClubs]);

  // ── Load groups the user is in for the selected club ─────────────────────
  useEffect(() => {
    if (!selectedClubId) return;
    setSelectedGroupId('');
    setMemberGroups([]);
    setSkippers([]);
    setClubMembers([]);

    const uid = getCookie();
    if (!uid) return;

    let cancelled = false;

    const load = async () => {
      try {
        // 2. Get all groups in this club via factory (one-shot)
        const allGroups = await GroupFactory.getGroupsByClubOnce(selectedClubId);

        // 3. For each group, fetch members and cache them
        const groupMembersCache = {};
        await Promise.all(
          allGroups.map(async group => {
            const members = await GroupFactory.getMembersByGroupOnce(selectedClubId, group.id);
            groupMembersCache[group.id] = members;
          })
        );

        if (cancelled) return;

        if (isSuperAdminRef.current || isClubAdminRef.current) {
          // SuperAdmin and ClubAdmin see all groups that have at least one skipper
          const filteredGroups = allGroups.filter(
            g => groupMembersCache[g.id]?.some(m => m.isSkipper === true)
          );
          setMemberGroups(filteredGroups);
          if (filteredGroups.length === 1) setSelectedGroupId(filteredGroups[0].id);
          return;
        }

        // 1. Find the current user's memberIds in this club via factory
        const links = await UserMemberLinkFactory.getForUserInClub(uid, selectedClubId);
        if (links.length === 0) return;

        const myMemberIds = new Set(links.map(l => l.memberId).filter(Boolean));

        // 4. Filter to groups the user is in AND that have at least one skipper
        const memberGroupIds = new Set();
        allGroups.forEach(group => {
          const isMember = groupMembersCache[group.id]?.some(
            d => myMemberIds.has(d.memberId || d.id)
          );
          if (isMember) memberGroupIds.add(group.id);
        });

        const filteredGroups = allGroups
          .filter(g => memberGroupIds.has(g.id))
          .filter(g => groupMembersCache[g.id]?.some(m => m.isSkipper === true));

        setMemberGroups(filteredGroups);
        if (filteredGroups.length === 1) setSelectedGroupId(filteredGroups[0].id);
      } catch (e) {
        console.error('Failed to load member groups:', e);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [selectedClubId]);

  // ── Load all skippers in the selected group ───────────────────────────────
  useEffect(() => {
    if (!selectedClubId || !selectedGroupId) return;
    const u1 = GroupFactory.getSkippersByGroup(selectedClubId, selectedGroupId, setSkippers);
    const u2 = ClubMemberFactory.getAll(selectedClubId, setClubMembers);
    return () => { u1(); u2(); };
  }, [selectedClubId, selectedGroupId]);

  // ── Live session subscription ─────────────────────────────────────────────
  useEffect(() => {
    if (!selectedSkipper?.rtdbUid) return;
    const unsub = LiveSessionFactory.subscribeToLive(selectedSkipper.rtdbUid, data => {
      if (!data) return;
      setLiveBpm(data.bpm || 0);
      setCurrentData(data.session || null);
    });
    return () => unsub();
  }, [selectedSkipper]);

  // ── Session history ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedSkipper) return;
    const { clubId, memberId } = selectedSkipper;
    const unsub = ClubMemberFactory.getSessionHistory(clubId, memberId, setSessionHistory);
    return () => unsub();
  }, [selectedSkipper]);

  // ── Best record ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedSkipper) return;
    const { clubId, memberId } = selectedSkipper;
    const unsub = ClubMemberFactory.subscribeToRecords(clubId, memberId, discipline, sessionType, setBestRecord);
    return () => unsub();
  }, [selectedSkipper, discipline, sessionType]);

  // ── Auto-stop on idle ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentData?.isActive) { clearTimeout(autoStopTimerRef.current); return; }
    clearTimeout(autoStopTimerRef.current);
    autoStopTimerRef.current = setTimeout(() => handleStopSession(), AUTO_STOP_IDLE_MS);
    return () => clearTimeout(autoStopTimerRef.current);
  }, [currentData?.lastStepTime, currentData?.isActive]);

  // ── Trigger post-session flow when finished ───────────────────────────────
  useEffect(() => {
    if (currentData?.isFinished && !isProcessingQueue && pendingQueue.length === 0) {
      triggerPostSessionFlow();
    }
  }, [currentData?.isFinished]);

  // ── Resolve skipper profile + RTDB uid ───────────────────────────────────
  const resolveSkipperProfile = async (groupMember) => {
    const memberId  = groupMember.memberId || groupMember.id;
    const profile   = clubMembers.find(m => m.id === memberId);
    const firstName = profile?.firstName || '?';
    const lastName  = profile?.lastName  || '';

    // Resolve uid for RTDB via factory
    const rtdbUid = await UserMemberLinkFactory.getUidForMember(selectedClubId, memberId);
    return { memberId, clubId: selectedClubId, firstName, lastName, rtdbUid };
  };

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleStartSession = async () => {
    telemetryRef.current    = [];
    sessionStartRef.current = null;
    await LiveSessionFactory.startCounter(selectedSkipper.rtdbUid, discipline, sessionType);
    setShowConfigModal(false);
  };

  const handleCountStep = () => {
    if (!currentData || currentData?.isFinished) return;
    if (!sessionStartRef.current) sessionStartRef.current = Date.now();
    LiveSessionFactory.incrementSteps(selectedSkipper.rtdbUid, liveBpm, sessionStartRef.current);
    telemetryRef.current.push({
      time:      Date.now() - sessionStartRef.current,
      steps:     (currentData?.steps || 0) + 1,
      heartRate: liveBpm,
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
    const score     = currentData.steps || 0;
    const disc      = currentData.discipline  || discipline;
    const sType     = currentData.sessionType || sessionType;
    const telemetry = telemetryRef.current;
    const bpmValues = telemetry.map(t => t.heartRate).filter(b => b > 0);
    const avgBpm    = bpmValues.length ? Math.round(bpmValues.reduce((a, b) => a + b, 0) / bpmValues.length) : liveBpm;
    const maxBpm    = bpmValues.length ? Math.max(...bpmValues) : liveBpm;

    try {
      await ClubMemberFactory.saveSessionHistory(clubId, memberId, {
        discipline: disc, sessionType: sType, score, avgBpm, maxBpm,
        sessionStart:  currentData.startTime || sessionStartRef.current,
        telemetry,
        countedBy:     counterUser?.id   || null,
        countedByName: counterUser ? `${counterUser.firstName} ${counterUser.lastName}` : null,
      });
    } catch (e) { console.error('Failed to save session history:', e); }

    const freshHistory = await ClubMemberFactory.getSessionHistoryOnce(clubId, memberId);

    try {
      const newBadges = await BadgeFactory.checkAndAward(
        clubId, memberId,
        { score, discipline: disc, sessionType: sType },
        freshHistory,
      );
      if (newBadges.length > 0) setNewlyEarnedBadges(newBadges);
    } catch (e) { console.error('Badge check failed:', e); }

    if (counterUser) {
      try { await CounterBadgeFactory.checkAndAward(counterUser.id, { discipline: disc, sessionType: sType, score }); }
      catch (e) { console.error('Counter badge check failed:', e); }
    }

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

  // ── Derived ───────────────────────────────────────────────────────────────
  const isRecording  = currentData?.isActive === true;
  const isFinished   = currentData?.isFinished === true && !currentData?.isActive;
  const isStartklaar = currentData !== null && currentData !== undefined && !isRecording && !isFinished;

  const showClubPicker  = memberClubs.length > 1;
  const showGroupPicker = memberGroups.length > 1;

  // ── Loading state ─────────────────────────────────────────────────────────
  if (!bootstrapDone) {
    return (
      <div style={{ ...st.container, alignItems: 'center', justifyContent: 'center' }}>
        <div style={st.spinner} />
      </div>
    );
  }

  // ── No memberships ────────────────────────────────────────────────────────
  if (bootstrapDone && memberClubs.length === 0) {
    return (
      <div style={{ ...st.container, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
        <Users size={40} color="#334155" />
        <p style={{ color: '#64748b', fontSize: '14px', textAlign: 'center', maxWidth: '280px' }}>
          Je bent nog geen lid van een club. Vraag toegang aan via je profiel.
        </p>
        <a href="/" style={{ padding: '10px 20px', backgroundColor: '#3b82f6', color: 'white', borderRadius: '8px', textDecoration: 'none', fontWeight: '600', fontSize: '14px' }}>
          Naar profiel
        </a>
      </div>
    );
  }

  // ── Screen 1: Skipper Selection ───────────────────────────────────────────
  if (!selectedSkipper) {
    return (
      <div style={st.container}>
        <div style={st.header}>
          <h1 style={{ fontSize: '20px', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
            <Users size={24} color="#3b82f6" /> Voor wie ga jij tellen?
          </h1>
        </div>
        <div style={st.selectionPanel}>

          {/* Club picker — only when user is in multiple clubs */}
          {showClubPicker && (
            <div style={st.field}>
              <label style={st.label}>
                <Building2 size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                Club
              </label>
              <div style={st.clubGrid}>
                {memberClubs.map(club => (
                  <button
                    key={club.id}
                    style={{ ...st.clubCard, ...(selectedClubId === club.id ? st.clubCardActive : {}) }}
                    onClick={() => setSelectedClubId(club.id)}
                  >
                    {club.logoUrl
                      ? <img src={club.logoUrl} style={{ width: '36px', height: '36px', borderRadius: '8px', objectFit: 'cover', marginBottom: '8px' }} alt={club.name} />
                      : <Building2 size={28} color={selectedClubId === club.id ? '#3b82f6' : '#475569'} style={{ marginBottom: '8px' }} />
                    }
                    <div style={{ fontSize: '13px', fontWeight: '600', textAlign: 'center' }}>{club.name}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Group picker — only when user is in multiple groups */}
          {selectedClubId && showGroupPicker && (
            <div style={st.field}>
              <label style={st.label}>
                <Users size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                Groep
              </label>
              <div style={st.groupGrid}>
                {memberGroups.map(group => (
                  <button
                    key={group.id}
                    style={{ ...st.groupCard, ...(selectedGroupId === group.id ? st.groupCardActive : {}) }}
                    onClick={() => setSelectedGroupId(group.id)}
                  >
                    <Users size={22} color={selectedGroupId === group.id ? '#22c55e' : '#475569'} style={{ marginBottom: '6px' }} />
                    <div style={{ fontSize: '13px', fontWeight: '600', textAlign: 'center' }}>{group.name}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Skipper grid */}
          {selectedClubId && selectedGroupId && (
            <div style={st.field}>
              <label style={st.label}>
                <Hash size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                Skipper
              </label>
              {skippers.length > 0 ? (
                <div style={st.grid}>
                  {skippers.map(s => {
                    const memberId  = s.memberId || s.id;
                    const profile   = clubMembers.find(m => m.id === memberId);
                    const firstName = profile?.firstName || '?';
                    const lastName  = profile?.lastName  || '';
                    const initials  = `${firstName[0] || '?'}${lastName[0] || ''}`.toUpperCase();
                    return (
                      <button
                        key={memberId}
                        style={st.card}
                        onClick={async () => {
                          const resolved = await resolveSkipperProfile(s);
                          setSelectedSkipper(resolved);
                          setShowConfigModal(true);
                        }}
                      >
                        <div style={st.avatar}>{initials}</div>
                        <div style={{ marginTop: '10px', fontSize: '14px', fontWeight: '600', textAlign: 'center' }}>
                          {firstName} {lastName}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p style={st.infoText}>Geen actieve skippers in deze groep.</p>
              )}
            </div>
          )}

          {/* Prompt when no group selected yet and group picker is shown */}
          {selectedClubId && showGroupPicker && !selectedGroupId && (
            <p style={st.infoText}>Selecteer een groep om de skippers te zien.</p>
          )}

          {/* Prompt when club picker is shown but no club selected */}
          {showClubPicker && !selectedClubId && (
            <p style={st.infoText}>Selecteer een club om verder te gaan.</p>
          )}
        </div>
      </div>
    );
  }

  // ── Screen 2: Config Modal ────────────────────────────────────────────────
  if (showConfigModal) {
    return (
      <div style={st.modalOverlay}>
        <div style={{ ...st.modalContent, fontFamily: 'sans-serif' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ ...st.avatar, margin: '0 auto 12px', width: '60px', height: '60px', fontSize: '20px' }}>
              {selectedSkipper.firstName[0]}{selectedSkipper.lastName[0]}
            </div>
            <h2 style={{ margin: 0, fontSize: '22px', color: '#f1f5f9' }}>{selectedSkipper.firstName} {selectedSkipper.lastName}</h2>
            <p style={{ color: '#94a3b8', margin: '4px 0 0' }}>Kies sessie-instellingen</p>
          </div>

          <label style={{ ...st.label, fontFamily: 'sans-serif' }}>Type sessie</label>
          <div style={st.toggleGroup}>
            {['Training', 'Wedstrijd'].map(t => (
              <button key={t} onClick={() => setSessionType(t)} style={{ ...st.toggleBtn, backgroundColor: sessionType === t ? (t === 'Wedstrijd' ? '#ef4444' : '#3b82f6') : '#0f172a', borderColor: sessionType === t ? (t === 'Wedstrijd' ? '#ef4444' : '#3b82f6') : '#334155' }}>
                {t}
              </button>
            ))}
          </div>

          <label style={{ ...st.label, fontFamily: 'sans-serif' }}>Onderdeel</label>
          <div style={st.toggleGroup}>
            {['30sec', '2min', '3min'].map(d => (
              <button key={d} onClick={() => setDiscipline(d)} style={{ ...st.toggleBtn, backgroundColor: discipline === d ? '#3b82f6' : '#0f172a', borderColor: discipline === d ? '#3b82f6' : '#334155' }}>
                {d}
              </button>
            ))}
          </div>

          {bestRecord && (
            <div style={{ backgroundColor: '#0f172a', borderRadius: '8px', padding: '12px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Trophy size={18} color="#facc15" />
              <div style={{ fontSize: '13px', color: '#94a3b8' }}>Huidig record: <strong style={{ color: '#facc15' }}>{bestRecord.score} steps</strong></div>
            </div>
          )}

          <button onClick={handleStartSession} style={st.mainStartBtn}><Play size={20} fill="white" /> SESSIE STARTEN</button>
          <button onClick={() => { setSelectedSkipper(null); setShowConfigModal(false); }} style={{ ...st.mainStartBtn, backgroundColor: 'transparent', border: '1px solid #334155', marginTop: '10px' }}>
            Annuleren
          </button>
        </div>
      </div>
    );
  }

  // ── Screen 3: Counter ─────────────────────────────────────────────────────
  return (
    <div style={st.container}>
      {isProcessingQueue && pendingQueue.length > 0 && (
        <CelebrationOverlay
          type={pendingQueue[0].type}
          data={pendingQueue[0].data}
          onAccept={handleQueueAccept}
          onDecline={advanceQueue}
        />
      )}

      <div style={st.activeHeader}>
        <button style={st.backBtn} onClick={handleReset}><ArrowLeft size={18} /> Andere skipper</button>
        <div style={st.userInfo}>
          <div style={{ ...st.avatar, width: '44px', height: '44px', fontSize: '15px' }}>
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
          <LiveTimer
            startTime={currentData?.startTime}
            durationSeconds={DISCIPLINE_DURATION[currentData?.discipline] || DISCIPLINE_DURATION[discipline]}
            isRecording={isRecording}
            isFinished={isFinished}
          />
          <div style={{ fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {isRecording
              ? <><span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444', animation: 'pulse 1s ease-in-out infinite', display: 'inline-block' }} /><span style={{ color: '#ef4444' }}>OPNAME</span></>
              : isFinished   ? <span style={{ color: '#22c55e' }}>KLAAR</span>
              : isStartklaar ? <span style={{ color: '#facc15' }}>STARTKLAAR</span>
              :                <span style={{ color: '#64748b' }}>WACHT</span>
            }
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
        style={{
          ...st.counterButton,
          backgroundColor: isFinished ? '#1e293b' : isRecording ? '#1e3a5f' : '#1e293b',
          border:      isRecording ? '3px solid #3b82f6' : isFinished ? '3px solid #22c55e' : '3px solid #334155',
          boxShadow:   isRecording ? '0 0 60px rgba(59, 130, 246, 0.25)' : 'none',
          cursor:      isFinished ? 'default' : 'pointer',
        }}
        disabled={isFinished || !selectedSkipper}
        onPointerDown={e => { if (!isFinished) { e.currentTarget.style.transform = 'scale(0.96)'; handleCountStep(); } }}
        onPointerUp={e   => { e.currentTarget.style.transform = 'scale(1)'; }}
        onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        <span style={st.stepLabel}>STEPS</span>
        <span style={{ fontSize: '100px', lineHeight: 1, fontWeight: '900' }}>{currentData?.steps ?? 0}</span>
        {!isRecording && !isFinished && (
          <span style={{ fontSize: '14px', color: '#64748b', marginTop: '8px' }}>Tik om te starten</span>
        )}
      </button>

      <div style={st.controls}>
        {isRecording ? (
          <button style={st.stopButton} onClick={handleStopSession}><Square size={18} fill="white" /> STOP</button>
        ) : isFinished ? (
          <button style={{ ...st.stopButton, backgroundColor: '#3b82f6' }} onClick={handleNewSession}><Play size={18} fill="white" /> NIEUWE SESSIE</button>
        ) : isStartklaar ? (
          <>
            <div style={{ color: '#facc15', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}><Zap size={16} /> Eerste tik start de opname</div>
            <button style={{ ...st.stopButton, backgroundColor: '#3b82f6' }} onClick={handleNewSession}><Play size={18} fill="white" /> NIEUWE SESSIE</button>
          </>
        ) : (
          <div style={{ color: '#64748b', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}><Zap size={16} /> Selecteer een skipper</div>
        )}
      </div>

      <div style={st.historySection}>
        <h3 style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}><HistoryIcon size={16} /> Recente sessies</h3>
        {sessionHistory.slice(0, 5).map((item, idx) => (
          <div key={idx} style={st.historyItem}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', backgroundColor: item.sessionType === 'Wedstrijd' ? '#ef444422' : '#3b82f622', color: item.sessionType === 'Wedstrijd' ? '#ef4444' : '#60a5fa', border: `1px solid ${item.sessionType === 'Wedstrijd' ? '#ef444440' : '#3b82f640'}` }}>
                {item.sessionType || 'Training'}
              </span>
              <span style={{ color: '#94a3b8', fontSize: '12px' }}>{item.discipline}</span>
            </div>
            <span style={{ fontWeight: 'bold', color: '#60a5fa', fontSize: '16px' }}>{item.score} <span style={{ fontSize: '11px', color: '#64748b' }}>steps</span></span>
          </div>
        ))}
        {sessionHistory.length === 0 && (
          <p style={{ color: '#475569', fontSize: '13px', textAlign: 'center' }}>Nog geen sessies.</p>
        )}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = {
  container:      { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'sans-serif', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  header:         { width: '100%', maxWidth: '500px', padding: '16px 0', borderBottom: '1px solid #1e293b', marginBottom: '24px' },
  selectionPanel: { width: '100%', maxWidth: '500px' },
  spinner:        { width: '36px', height: '36px', border: '3px solid #1e293b', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  field:          { marginBottom: '24px' },
  label:          { display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '10px', fontWeight: '600' },
  clubGrid:       { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' },
  clubCard:       { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '16px 12px', color: 'white', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'border-color 0.15s' },
  clubCardActive: { borderColor: '#3b82f6', backgroundColor: '#1e3a5f' },
  groupGrid:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' },
  groupCard:      { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '16px 12px', color: 'white', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'border-color 0.15s' },
  groupCardActive:{ borderColor: '#22c55e', backgroundColor: '#052e16' },
  grid:           { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' },
  card:           { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '16px', color: 'white', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'border-color 0.2s' },
  avatar:         { width: '50px', height: '50px', backgroundColor: '#3b82f6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '16px' },
  infoText:       { textAlign: 'center', color: '#64748b', fontSize: '14px', marginTop: '20px' },
  modalOverlay:   { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.92)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', zIndex: 100 },
  modalContent:   { backgroundColor: '#1e293b', padding: '30px', borderRadius: '20px', width: '100%', maxWidth: '400px', border: '1px solid #334155' },
  toggleGroup:    { display: 'flex', gap: '10px', marginBottom: '20px' },
  toggleBtn:      { flex: 1, padding: '12px', border: '1px solid #334155', borderRadius: '8px', color: 'white', cursor: 'pointer', fontWeight: 'bold', fontFamily: 'sans-serif' },
  mainStartBtn:   { width: '100%', padding: '15px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '10px', color: 'white', fontWeight: 'bold', marginTop: '10px', display: 'flex', justifyContent: 'center', gap: '10px', alignItems: 'center', cursor: 'pointer', fontSize: '16px', fontFamily: 'sans-serif' },
  activeHeader:   { backgroundColor: '#1e293b', padding: '16px', borderRadius: '14px', marginBottom: '16px', width: '100%', maxWidth: '440px', border: '1px solid #334155' },
  backBtn:        { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', marginBottom: '12px', padding: 0 },
  userInfo:       { display: 'flex', alignItems: 'center', gap: '14px' },
  counterButton:  { width: '280px', height: '280px', borderRadius: '50%', color: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', touchAction: 'manipulation', userSelect: 'none', transition: 'transform 0.08s, box-shadow 0.2s', margin: '10px 0' },
  stepLabel:      { fontSize: '13px', letterSpacing: '4px', color: 'rgba(255,255,255,0.35)', fontWeight: '700' },
  controls:       { display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', marginTop: '16px', marginBottom: '24px' },
  stopButton:     { backgroundColor: '#ef4444', color: 'white', padding: '14px 32px', borderRadius: '12px', border: 'none', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '15px' },
  historySection: { width: '100%', maxWidth: '440px', borderTop: '1px solid #1e293b', paddingTop: '16px' },
  historyItem:    { backgroundColor: '#1e293b', padding: '12px 16px', borderRadius: '10px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '3px solid #3b82f6' },
};
