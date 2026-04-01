import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserFactory, ClubFactory, GroupFactory, LiveSessionFactory, ClubJoinRequestFactory, BadgeFactory, ClubMemberFactory, UserMemberLinkFactory } from '../constants/dbSchema';
import { useAuth } from '../contexts/AuthContext';
import PushPermissionBanner, { PushSettingsToggle } from '../components/PushPermissionBanner';
import AnnouncementsWidget from '../components/AnnouncementsWidget';
import { useDisciplines } from '../hooks/useDisciplines';
import {
  Bluetooth, BluetoothOff, Heart, Settings, Trophy,
  Target, Plus, Edit2, Trash2, Check, X, ChevronRight,
  Building2, Users, Save, LogOut, Award, Zap, AlertCircle,
  Clock, TrendingUp, Star, UserPlus, Send, EyeOff, Eye, Bell,
  CheckCircle2, XCircle, ChevronDown, ChevronUp, MessageSquare,
  ArrowLeft, Medal, Activity, Hash, Calendar, ArrowRight
} from 'lucide-react';
import SeasonBanner from '../components/SeasonBanner';
import UpcomingEventsWidget from '../components/calendar/UpcomingEventsWidget'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const parseHeartRate = (value) => {
  const flags = value.getUint8(0);
  return (flags & 0x1) ? value.getUint16(1, true) : value.getUint8(1);
};

const DEFAULT_ZONES = [
  { name: 'Warm-up',   min: 0,   max: 120, color: '#94a3b8' },
  { name: 'Fat Burn',  min: 120, max: 145, color: '#22c55e' },
  { name: 'Aerobic',   min: 145, max: 165, color: '#facc15' },
  { name: 'Anaerobic', min: 165, max: 185, color: '#f97316' },
  { name: 'Red Line',  min: 185, max: 250, color: '#ef4444' },
];
const getZoneColor = (bpm, zones) => {
  const z = (zones || DEFAULT_ZONES).find(z => bpm >= z.min && bpm < z.max);
  return z ? z.color : '#94a3b8';
};
const getZoneName = (bpm, zones) => {
  const z = (zones || DEFAULT_ZONES).find(z => bpm >= z.min && bpm < z.max);
  return z ? z.name : '—';
};

const DISC_LABELS  = { '30sec': '30 sec', '2min': '2 min', '3min': '3 min' };
const DISCIPLINES  = ['30sec', '2min', '3min'];
const SESSION_TYPES = ['Training', 'Wedstrijd'];

const STATUS_CONFIG = {
  pending:  { label: 'In behandeling', color: '#f59e0b', bg: '#f59e0b22', icon: Clock },
  approved: { label: 'Goedgekeurd',    color: '#22c55e', bg: '#22c55e22', icon: CheckCircle2 },
  rejected: { label: 'Afgewezen',      color: '#ef4444', bg: '#ef444422', icon: XCircle },
};

const SPARK_ANIMS = ['sparkFlyA','sparkFlyB','sparkFlyC','sparkFlyD','sparkFlyE','sparkFlyF'];

// ─── HRM Header Widget ────────────────────────────────────────────────────────
function HrmHeaderWidget({ connected, bpm, deviceName, zones, onConnect, onDisconnect }) {
  const [showMenu, setShowMenu] = useState(false);
  const bpmColor = connected ? getZoneColor(bpm, zones) : '#334155';
  const zoneName = connected ? getZoneName(bpm, zones) : null;

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setShowMenu(v => !v)}
        title={connected ? `${bpm} BPM · ${deviceName}` : 'HRM koppelen'}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderRadius: '20px', backgroundColor: connected ? `${bpmColor}18` : '#1e293b', border: `1px solid ${connected ? `${bpmColor}44` : '#334155'}`, cursor: 'pointer', transition: 'all 0.2s' }}
      >
        <Heart size={16} color={connected ? bpmColor : '#475569'} fill={connected ? bpmColor : 'none'} style={connected ? { animation: 'heartbeat 1s ease-in-out infinite' } : {}} />
        {connected && bpm > 0 && <span style={{ fontSize: '13px', fontWeight: '700', color: bpmColor, fontFamily: 'monospace' }}>{bpm}</span>}
        {!connected && <span style={{ fontSize: '11px', color: '#475569' }}>HRM</span>}
      </button>
      {showMenu && (
        <>
          <div onClick={() => setShowMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
          <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '6px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '12px', zIndex: 100, minWidth: '200px', boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>
            {connected ? (
              <>
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '24px', fontWeight: '900', color: bpmColor, lineHeight: 1 }}>{bpm || '--'}</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>BPM · {zoneName}</div>
                  <div style={{ fontSize: '10px', color: '#475569', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><Bluetooth size={10} color="#3b82f6" /> {deviceName}</div>
                </div>
                <div style={{ display: 'flex', borderRadius: '4px', overflow: 'hidden', height: '4px', marginBottom: '12px' }}>
                  {(zones || DEFAULT_ZONES).map(z => <div key={z.name} style={{ flex: 1, backgroundColor: bpm >= z.min && bpm < z.max ? z.color : `${z.color}33` }} />)}
                </div>
                <button onClick={() => { onDisconnect(); setShowMenu(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', backgroundColor: '#1e293b', border: '1px solid #ef444444', borderRadius: '8px', color: '#ef4444', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                  <BluetoothOff size={13} /> Ontkoppel
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px', lineHeight: 1.5 }}>Koppel een Bluetooth HRM om je hartslag live te volgen.</div>
                <button onClick={() => { onConnect(); setShowMenu(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', backgroundColor: '#3b82f622', border: '1px solid #3b82f644', borderRadius: '8px', color: '#60a5fa', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                  <Bluetooth size={13} /> Koppel HRM
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Celebration Overlay ──────────────────────────────────────────────────────
function CelebrationOverlay({ type, data, onAccept, onDecline }) {
  const isBadge  = type === 'badge';
  const isRecord = type === 'record';
  const isGoal   = type === 'goal';
  const accentColor = isBadge ? '#f59e0b' : isRecord ? '#facc15' : '#22c55e';
  const Icon = isBadge ? Medal : isRecord ? Award : Target;

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 3000, overflow: 'hidden' }}>
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} style={{ position: 'absolute', left: `${10 + (i * 3.5) % 80}%`, top: `${15 + (i * 7) % 70}%`, width: `${5 + (i % 4) * 3}px`, height: `${5 + (i % 4) * 3}px`, borderRadius: '50%', backgroundColor: ['#facc15','#f97316','#ef4444','#22c55e','#60a5fa','#a78bfa'][i % 6], animation: `${SPARK_ANIMS[i % 6]} ${0.9 + (i % 5) * 0.2}s ease-out ${(i % 8) * 0.12}s forwards` }} />
        ))}
      </div>
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 500 }}>
        <div style={{ backgroundColor: '#1e293b', padding: '30px', borderRadius: '20px', width: '100%', maxWidth: '400px', border: `1px solid ${accentColor}`, animation: 'fadeInUp 0.4s ease-out' }}>
          {isBadge && data.badgeImageUrl ? (
            <img src={data.badgeImageUrl} alt={data.badgeName} style={{ width: '90px', height: '90px', borderRadius: '50%', objectFit: 'cover', margin: '0 auto 16px', display: 'block', border: `3px solid ${accentColor}` }} />
          ) : (
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: `${accentColor}22`, border: `2px solid ${accentColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', animation: 'pulse 1.5s ease-in-out infinite', fontSize: isBadge ? '40px' : undefined }}>
              {isBadge ? (data.badgeEmoji || '🏅') : <Icon size={40} color={accentColor} />}
            </div>
          )}
          <h2 style={{ color: accentColor, fontSize: '22px', margin: '0 0 8px', textAlign: 'center' }}>
            {isBadge ? '🎖️ BADGE VERDIEND!' : isRecord ? '🏆 NIEUW RECORD!' : '🎯 DOEL BEREIKT!'}
          </h2>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            {isBadge ? (
              <>
                <div style={{ fontSize: '22px', fontWeight: '900', color: 'white', lineHeight: 1 }}>{data.badgeName}</div>
                <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '8px', lineHeight: 1.5 }}>{data.badgeDescription || ''}</div>
                <div style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>Uitgereikt door: {data.awardedByName || 'Systeem'}</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '42px', fontWeight: '900', color: 'white', lineHeight: 1 }}>{data.score}</div>
                <div style={{ color: '#94a3b8', fontSize: '14px', marginTop: '4px' }}>{DISC_LABELS[data.discipline] || data.discipline} · {data.sessionType}</div>
                {isRecord && data.previousBest > 0 && <div style={{ color: '#22c55e', fontSize: '13px', marginTop: '8px' }}>+{data.score - data.previousBest} beter dan vorig record ({data.previousBest})</div>}
                {isGoal && <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '8px' }}>Doel was: {data.targetScore} stappen</div>}
              </>
            )}
          </div>
          {isBadge ? (
            <button onClick={onAccept} style={{ width: '100%', padding: '14px', backgroundColor: accentColor, border: 'none', borderRadius: '10px', color: 'white', fontWeight: '700', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Check size={20} /> GEWELDIG!
            </button>
          ) : (
            <>
              <p style={{ color: '#cbd5e1', textAlign: 'center', fontSize: '14px', marginBottom: '16px' }}>
                {isRecord ? 'Wil je dit als officieel record registreren?' : 'Wil je dit als doelbereiking vastleggen?'}
              </p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={onAccept} style={{ flex: 1, padding: '14px', backgroundColor: '#22c55e', border: 'none', borderRadius: '10px', color: 'white', fontWeight: '700', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><Check size={20} /> JA</button>
                <button onClick={onDecline} style={{ flex: 1, padding: '14px', backgroundColor: '#475569', border: 'none', borderRadius: '10px', color: 'white', fontWeight: '700', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><X size={20} /> NEE</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Quick stat card ──────────────────────────────────────────────────────────
function StatCard({ icon: Icon, color, label, value, sub, href }) {
  const inner = (
    <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '14px', border: `1px solid ${color}22`, display: 'flex', flexDirection: 'column', gap: '2px', textDecoration: 'none', color: 'inherit', transition: 'border-color 0.15s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
        <div style={{ width: '26px', height: '26px', borderRadius: '6px', backgroundColor: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={13} color={color} /></div>
        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>{label}</span>
      </div>
      <div style={{ fontSize: '26px', fontWeight: '900', color: value != null ? color : '#334155', lineHeight: 1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>{sub}</div>}
    </div>
  );
  return href ? <a href={href} style={{ textDecoration: 'none' }}>{inner}</a> : inner;
}

// ─── Recent sessions mini list ────────────────────────────────────────────────
function RecentSessionsList({ memberContext }) {
  const [sessions, setSessions] = useState([]);
  const { getLabel } = useDisciplines();
  useEffect(() => {
    if (!memberContext) return;
    const { clubId, memberId } = memberContext;
    const unsub = ClubMemberFactory.getSessionHistory(clubId, memberId, (data) => setSessions(data.slice(0, 5)));
    return () => unsub();
  }, [memberContext]);

  if (!memberContext) return <div style={{ textAlign: 'center', padding: '20px 0', color: '#334155', fontSize: '13px' }}>Koppel je account aan een clubprofiel om sessies te zien.</div>;
  if (sessions.length === 0) return <div style={{ textAlign: 'center', padding: '20px 0', color: '#334155', fontSize: '13px' }}>Nog geen sessies</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {sessions.map((s, i) => {
        const typeColor = s.sessionType === 'Wedstrijd' ? '#f97316' : '#3b82f6';
        return (
          <div key={s.id || i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b' }}>
            <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', backgroundColor: `${typeColor}22`, color: typeColor, border: `1px solid ${typeColor}40`, flexShrink: 0 }}>{s.sessionType || 'Training'}</span>
            <span style={{ fontSize: '12px', color: '#64748b', flexShrink: 0 }}>{DISC_LABELS[s.discipline] || getLabel(s.discipline)}</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: '16px', fontWeight: '900', color: '#60a5fa' }}>{s.score}</span>
            <span style={{ fontSize: '10px', color: '#475569' }}>stps</span>
          </div>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function IndexPage() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const { uid, logout: authLogout } = useAuth();

  const [allClubs,     setAllClubs]     = useState([]);
  const [currentUser,  setCurrentUser]  = useState(null);
  const [memberContext, setMemberContext] = useState(null); // { clubId, memberId }

  // HRM
  const [heartRate,    setHeartRate]    = useState(0);
  const [hrmConnected, setHrmConnected] = useState(false);
  const [hrmDeviceName,setHrmDeviceName]= useState('');
  const lastBpmRef = useRef(0);

  // Records, goals, sessions, badges — from ClubMember path
  const [records,        setRecords]        = useState([]);
  const [goals,          setGoals]          = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [earnedBadges,   setEarnedBadges]   = useState([]);
  const { getLabel } = useDisciplines();

  // Achievements queue
  const [achievementQueue,        setAchievementQueue]        = useState([]);
  const [isProcessingAchievements,setIsProcessingAchievements]= useState(false);

  // Modals
  const [showSettings,   setShowSettings]   = useState(false);
  const [settingsForm,   setSettingsForm]   = useState({ firstName: '', lastName: '', email: '' });
  const [zonesForm,      setZonesForm]      = useState(DEFAULT_ZONES);

  const [newRejections,  setNewRejections]  = useState(0);
  const [joinRequests,   setJoinRequests]   = useState([]);
  const [memberships,    setMemberships]    = useState([]); // { clubName, groupName, isSkipper, isCoach }
  const [showJoinForm,   setShowJoinForm]   = useState(false);
  const [joinClubId,     setJoinClubId]     = useState('');
  const [joinMessage,    setJoinMessage]    = useState('');
  const [joinSending,    setJoinSending]    = useState(false);
  const [joinError,      setJoinError]      = useState('');
  const [viewMode,       setViewMode]       = useState('skipper');
  const [isCoachInGroup, setIsCoachInGroup] = useState(false);
  const [primaryClub, setPrimaryClub]       = useState(null);
  const [memberGroupIds, setMemberGroupIds] = useState([]);

  // ── Load clubs ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const u = ClubFactory.getAll(setAllClubs);
    return () => u();
  }, []);

  // ── Load currentUser from Firestore by uid ─────────────────────────────────
  useEffect(() => {
    if (!uid) { setCurrentUser(null); return; }
    UserFactory.get(uid).then(snap => {
      if (snap.exists()) {
        const user = { id: uid, ...snap.data() };
        setCurrentUser(user);
        setSettingsForm({ firstName: user.firstName || '', lastName: user.lastName || '', email: user.email || '' });
        setZonesForm(user.heartrateZones || DEFAULT_ZONES);
      }
    });
  }, [uid]);

  // ── Resolve ClubMember context via UserMemberLink ──────────────────────────
  useEffect(() => {
    if (!uid) return;
    const unsub = UserMemberLinkFactory.getForUser(uid, (profiles) => {
      const selfProfile = profiles.find(p => p.link.relationship === 'self');
      setMemberContext(selfProfile ? { clubId: selfProfile.member.clubId, memberId: selfProfile.member.id } : null);
    });
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!memberContext) return;
    ClubFactory.getById(memberContext.clubId).then(snap => {
      if (snap.exists()) setPrimaryClub({ id: snap.id, ...snap.data() });
    });
  }, [memberContext?.clubId]);

  // ── Resolve memberGroupIds via GroupFactory ────────────────────────────────
  useEffect(() => {
    if (!memberContext) return;
    const { clubId, memberId } = memberContext;
    let cancelled = false;
    
    GroupFactory.getGroupsByClubOnce(clubId).then(async (groups) => {
      const gids = [];
      for (const group of groups) {
        const members = await GroupFactory.getMembersByGroupOnce(clubId, group.id);
        const me = members.find(m => (m.memberId || m.id) === memberId);
        if (me) gids.push(group.id);
      }
      if (!cancelled) setMemberGroupIds(gids);
    });
    
    return () => { cancelled = true; };
  }, [memberContext?.clubId, memberContext?.memberId]);

  // ── Records, goals, sessions, badges ──────────────────────────────────────
  useEffect(() => {
    if (!memberContext) return;
    const { clubId, memberId } = memberContext;
    const unsubs = [];
    DISCIPLINES.forEach(d => SESSION_TYPES.forEach(st => {
      const u = ClubMemberFactory.subscribeToRecords(clubId, memberId, d, st, (rec) => {
        if (rec) setRecords(prev => [...prev.filter(r => !(r.discipline === d && r.sessionType === st)), { ...rec, discipline: d, sessionType: st }]);
        else setRecords(prev => prev.filter(r => !(r.discipline === d && r.sessionType === st)));
      });
      unsubs.push(u);
    }));
    return () => unsubs.forEach(u => u && u());
  }, [memberContext]);

  useEffect(() => {
    if (!memberContext) return;
    const { clubId, memberId } = memberContext;
    const unsub = ClubMemberFactory.getGoals(clubId, memberId, setGoals);
    return () => unsub();
  }, [memberContext]);

  useEffect(() => {
    if (!memberContext) return;
    const { clubId, memberId } = memberContext;
    const unsub = ClubMemberFactory.getSessionHistory(clubId, memberId, (data) => setRecentSessions(data.slice(0, 5)));
    return () => unsub();
  }, [memberContext]);

  useEffect(() => {
    if (!memberContext) return;
    const { clubId, memberId } = memberContext;
    const unsub = BadgeFactory.getEarned(clubId, memberId, setEarnedBadges);
    return () => unsub();
  }, [memberContext]);

  // ── Detect coach role ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!uid || allClubs.length === 0) return;
    const unsubs = [];
    allClubs.forEach(club => {
      const u = GroupFactory.getGroupsByClub(club.id, (groups) => {
        groups.forEach(group => {
          const u2 = GroupFactory.getMembersByGroup(club.id, group.id, (members) => {
            const mine = members.find(m => m.id === uid);
            if (mine?.isCoach) setIsCoachInGroup(true);
          });
          unsubs.push(u2);
        });
      });
      unsubs.push(u);
    });
    return () => unsubs.forEach(u => u && u());
  }, [uid, allClubs]);

  // ── Join requests + memberships (for settings panel) ─────────────────────
  useEffect(() => {
    if (!uid) return;
    const unsub = ClubJoinRequestFactory.getByUser(uid, (requests) => {
      setJoinRequests(requests);
      setNewRejections(requests.filter(r => r.status === 'rejected' && !r.hidden).length);
    });
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid || allClubs.length === 0) return;
    const allUnsubs = [];
    const collected = {};
    allClubs.forEach(club => {
      const u = GroupFactory.getGroupsByClub(club.id, (groups) => {
        groups.forEach(group => {
          const u2 = GroupFactory.getMembersByGroup(club.id, group.id, (members) => {
            const mine = members.find(m => m.id === uid);
            const key = `${club.id}-${group.id}`;
            if (mine) collected[key] = { clubId: club.id, clubName: club.name, groupId: group.id, groupName: group.name, isSkipper: mine.isSkipper, isCoach: mine.isCoach };
            else delete collected[key];
            const vals = Object.values(collected);
            setMemberships(vals);            
          });
          allUnsubs.push(u2);
        });
      });
      allUnsubs.push(u);
    });
    return () => allUnsubs.forEach(u => u && u());
  }, [uid, allClubs]);

  // ── Achievement check on mount ─────────────────────────────────────────────
  const achievementFiredRef = useRef(false);
  const checkNewAchievements = useCallback(async (ctx) => {
    try {
      const lastVisitedRaw = await UserFactory.getLastVisited(uid);
      const lastVisitedMs = lastVisitedRaw?.seconds ? lastVisitedRaw.seconds * 1000 : 0;
      await UserFactory.updateLastVisited(uid);
      if (!lastVisitedMs || !ctx) return;

      const { clubId, memberId } = ctx;
      const queue = [];

      const { getDocs, collection } = await import('firebase/firestore');
      const { db: firestoreDb } = await import('../firebaseConfig');

      const badgesSnap = await getDocs(collection(firestoreDb, `clubs/${clubId}/members/${memberId}/earnedBadges`));
      badgesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(b => (b.earnedAt?.seconds ? b.earnedAt.seconds * 1000 : 0) > lastVisitedMs)
        .sort((a, b) => (a.earnedAt?.seconds || 0) - (b.earnedAt?.seconds || 0))
        .forEach(b => queue.push({ type: 'badge', data: b }));

      const history = await ClubMemberFactory.getSessionHistoryOnce(clubId, memberId);
      const recentSess = history.filter(s => (s.sessionEnd?.seconds ? s.sessionEnd.seconds * 1000 : 0) > lastVisitedMs);
      for (const session of recentSess) {
        if (!session.score) continue;
        const best = await ClubMemberFactory.getBestRecord(clubId, memberId, session.discipline, session.sessionType);
        if (best) {
          const recMs = best.achievedAt?.seconds ? best.achievedAt.seconds * 1000 : 0;
          if (recMs > lastVisitedMs && best.score === session.score) {
            queue.push({ type: 'record', data: { score: session.score, discipline: session.discipline, sessionType: session.sessionType, previousBest: 0, telemetry: session.telemetry || [] } });
          }
        }
      }

      if (queue.length > 0) { setAchievementQueue(queue); setIsProcessingAchievements(true); }
    } catch (err) { console.error('checkNewAchievements error:', err); }
  }, [uid]);

  useEffect(() => {
    if (!uid || !memberContext || achievementFiredRef.current) return;
    achievementFiredRef.current = true;
    checkNewAchievements(memberContext);
  }, [uid, memberContext, checkNewAchievements]);

  // ── HRM → Firebase ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hrmConnected || !uid || heartRate <= 0 || heartRate === lastBpmRef.current) return;
    lastBpmRef.current = heartRate;
    LiveSessionFactory.syncHeartbeat(uid, heartRate, 'online');
  }, [heartRate, hrmConnected, uid]);

  const connectBluetooth = async () => {
    try {
      const device = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('heart_rate');
      const characteristic = await service.getCharacteristic('heart_rate_measurement');
      characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', (e) => setHeartRate(parseHeartRate(e.target.value)));
      setHrmDeviceName(device.name || 'HRM Device');
      setHrmConnected(true);
      if (uid) {
        const knownId = currentUser?.assignedDevice?.deviceId;
        if (device.id && knownId !== device.id) await UserFactory.assignDevice(uid, device.id, device.name || 'HRM Device');
      }
    } catch (err) { console.error('Bluetooth error:', err); }
  };

  const disconnectHrm = () => {
    setHrmConnected(false);
    setHeartRate(0);
    if (uid) LiveSessionFactory.syncHeartbeat(uid, 0, 'offline');
  };

  const saveSettings = async () => {
    if (!uid) return;
    await UserFactory.updateProfile(uid, { firstName: settingsForm.firstName, lastName: settingsForm.lastName, email: settingsForm.email });
    await UserFactory.updateZones(uid, zonesForm);
    setCurrentUser(prev => ({ ...prev, ...settingsForm, heartrateZones: zonesForm }));
    setShowSettings(false);
  };

  const logout = async () => {
    disconnectHrm();
    setCurrentUser(null);
    setMemberContext(null);
    setRecords([]);
    setGoals([]);
    setEarnedBadges([]);
    achievementFiredRef.current = false;
    await authLogout(); // Firebase signOut — _app.js will redirect to /login
  };

  const advanceAchievementQueue = () => {
    setAchievementQueue(prev => {
      const next = prev.slice(1);
      if (next.length === 0) setIsProcessingAchievements(false);
      return next;
    });
  };

  const handleSendJoin = async () => {
    setJoinError('');
    if (!joinClubId) { setJoinError('Selecteer een club.'); return; }
    const already = joinRequests.find(r => r.clubId === joinClubId && r.status === 'pending');
    if (already) { setJoinError('Je hebt al een openstaande aanvraag voor deze club.'); return; }
    setJoinSending(true);
    try {
      const club = allClubs.find(c => c.id === joinClubId);
      await ClubJoinRequestFactory.create(uid, { firstName: currentUser?.firstName || '', lastName: currentUser?.lastName || '', email: currentUser?.email || '' }, joinClubId, club?.name || '', joinMessage.trim());
      setShowJoinForm(false); setJoinClubId(''); setJoinMessage('');
    } catch { setJoinError('Aanvraag kon niet worden verzonden.'); }
    finally { setJoinSending(false); }
  };

  const handleAchievementAccept = async () => {
    const current = achievementQueue[0];
    if (!current) { advanceAchievementQueue(); return; }
    if (current.type === 'record' && memberContext) {
      try { await ClubMemberFactory.addRecord(memberContext.clubId, memberContext.memberId, current.data); }
      catch (e) { console.error('Failed to save record:', e); }
    }
    advanceAchievementQueue();
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const zones        = currentUser?.heartrateZones || DEFAULT_ZONES;
  const bestRecord   = records.reduce((best, r) => r.score > (best?.score || 0) ? r : best, null);
  const lastSession  = recentSessions[0] || null;
  const activeGoals  = goals.filter(g => !g.achievedAt);
  const recentBadges = earnedBadges.slice(0, 4);
  const pendingRequests = joinRequests.filter(r => r.status === 'pending');
  const visibleRequests = joinRequests.filter(r => !r.hidden);

  const hasCoachAccess = currentUser?.role === 'clubadmin' || currentUser?.role === 'superadmin' || isCoachInGroup;
  const isCoach        = viewMode === 'coach' && hasCoachAccess;

  // While currentUser is loading, show a minimal spinner
  if (!currentUser) return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{globalCSS}</style>
      <div style={s.spinner} />
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <style>{globalCSS}</style>

      {isProcessingAchievements && achievementQueue.length > 0 && (
        <CelebrationOverlay type={achievementQueue[0].type} data={achievementQueue[0].data} onAccept={handleAchievementAccept} onDecline={advanceAchievementQueue} />
      )}

      {/* ── HEADER ── */}
      <header style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
          <div style={{ ...s.userAvatar, width: '30px', height: '30px', fontSize: '11px', flexShrink: 0 }}>
            {currentUser.firstName?.[0]}{currentUser.lastName?.[0]}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: '700', fontSize: '15px', color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentUser.firstName} {currentUser.lastName}
            </div>
            {hasCoachAccess && (
              <button
                onClick={() => setViewMode(v => {
                  const next = v === 'coach' ? 'skipper' : 'coach';
                  sessionStorage.setItem('msc_viewmode', next);
                  window.dispatchEvent(new StorageEvent('storage', { key: 'msc_viewmode', newValue: next }));
                  return next;
                })}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '2px', padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '700', cursor: 'pointer', border: '1px solid', backgroundColor: viewMode === 'coach' ? '#f59e0b22' : '#3b82f622', borderColor: viewMode === 'coach' ? '#f59e0b55' : '#3b82f655', color: viewMode === 'coach' ? '#f59e0b' : '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.4px', transition: 'all 0.2s' }}
              >
                {viewMode === 'coach' ? '⚑ Coach' : '⚐ Skipper'} <span style={{ opacity: 0.6, fontSize: '9px' }}>↕</span>
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {newRejections > 0 && (
            <a href="/settings?tab=lidmaatschap" style={{ position: 'relative', display: 'flex', padding: '4px' }}>
            <Bell size={18} color="#f59e0b" />
            <span style={{ position: 'absolute', top: '-2px', right: '-2px', backgroundColor: '#ef4444', color: 'white', fontSize: '9px', fontWeight: 'bold', width: '14px', height: '14px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{newRejections}</span>
            </a>
          )}
          <HrmHeaderWidget connected={hrmConnected} bpm={heartRate} deviceName={hrmDeviceName} zones={zones} onConnect={connectBluetooth} onDisconnect={disconnectHrm} />
          <a href="/settings" style={{ ...s.iconBtn, textDecoration: 'none' }}><Settings size={18} /></a>
          <button style={{ ...s.iconBtn, color: '#ef4444' }} onClick={logout}><LogOut size={18} /></button>
        </div>
      </header>

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '20px 16px 40px' }}>
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#f1f5f9', margin: '0 0 2px' }}>Hallo, {currentUser.firstName} 👋</h2>
          <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>{isCoach ? 'Klaar om skippers te begeleiden?' : 'Klaar voor de training?'}</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '24px' }}>
          <StatCard icon={Hash} color="#60a5fa" label="Laatste sessie" value={lastSession?.score} sub={lastSession ? `${getLabel(lastSession.discipline)} · ${lastSession.sessionType}` : (memberContext ? 'Nog geen sessies' : 'Koppel clubprofiel')} />
          <StatCard icon={Trophy} color="#facc15" label="Beste record" value={bestRecord?.score} sub={bestRecord ? `${getLabel(lastSession.discipline)} · ${bestRecord.sessionType}` : (memberContext ? 'Nog geen record' : 'Koppel clubprofiel')} href="/achievements" />
          <StatCard icon={Target} color="#22c55e" label="Actieve doelen" value={activeGoals.length || null} sub={activeGoals.length > 0 ? `${activeGoals[0].discipline} → ${activeGoals[0].targetScore} stps` : 'Geen doelen'} href="/achievements" />
        </div>

        {isCoach && (
          <a href="/dashboard" style={{ textDecoration: 'none', display: 'block', marginBottom: '20px' }}>
            <div style={{ backgroundColor: '#1e293b', borderRadius: '14px', padding: '16px 20px', border: '1px solid #f59e0b33', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: '#f59e0b22', border: '1px solid #f59e0b44', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Activity size={22} color="#f59e0b" /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '700', fontSize: '15px', color: '#f1f5f9' }}>Live Monitoring</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Bekijk alle skippers live op het dashboard</div>
              </div>
              <ArrowRight size={16} color="#f59e0b" />
            </div>
          </a>
        )}

        <SeasonBanner
          clubId={memberContext?.clubId}
          club={primaryClub}
          userRole={currentUser?.role}
          coachView={isCoach}
        />
        
        <AnnouncementsWidget memberContext={memberContext} />
        <UpcomingEventsWidget clubId={memberContext?.clubId}  memberGroupIds={memberGroupIds} ready={memberGroupIds.length > 0} /> 
        <PushPermissionBanner uid={uid} />
        
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}><Clock size={14} /> Recente sessies</div>
            <a href="/history" style={{ fontSize: '12px', color: '#3b82f6', textDecoration: 'none', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>Alle <ArrowRight size={12} /></a>
          </div>
          <RecentSessionsList memberContext={memberContext} />
        </div>

        {recentBadges.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}><Medal size={14} /> Recent verdiend</div>
              <a href="/achievements" style={{ fontSize: '12px', color: '#3b82f6', textDecoration: 'none', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>Alle <ArrowRight size={12} /></a>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {recentBadges.map(b => (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#1e293b', borderRadius: '10px', padding: '8px 12px', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '20px' }}>{b.badgeImageUrl ? <img src={b.badgeImageUrl} alt={b.badgeName} style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }} /> : b.badgeEmoji || '🏅'}</div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#f1f5f9' }}>{b.badgeName}</div>
                    <div style={{ fontSize: '10px', color: '#475569' }}>{b.earnedAt?.seconds ? new Date(b.earnedAt.seconds * 1000).toLocaleDateString('nl-BE') : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {pendingRequests.length > 0 && (
          <button onClick={() => setShowSettings(true)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', backgroundColor: 'transparent', border: '1px solid #f59e0b33', borderRadius: '10px', color: '#f59e0b', cursor: 'pointer', textAlign: 'left', marginBottom: '8px' }}>
            <Clock size={14} color="#f59e0b" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '12px', fontWeight: '600' }}>
              {pendingRequests.length === 1
                ? `Aanvraag bij ${pendingRequests[0].clubName} in behandeling`
                : `${pendingRequests.length} clubaanvragen in behandeling`}
            </span>
            <ChevronRight size={13} color="#f59e0b" style={{ marginLeft: 'auto', flexShrink: 0 }} />
          </button>
        )}
      </div>

      {/* ── MODALS ── */}
      {showSettings && (
        <div style={s.modalOverlay}>
          <div style={s.modal}>
            <div style={s.modalHeader}><h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}><Settings size={18} /> Instellingen</h3><button style={s.iconBtn} onClick={() => setShowSettings(false)}><X size={18} /></button></div>
            <div style={{ marginBottom: '24px' }}>
              <h4 style={s.sectionLabel}>Profiel</h4>
              <div className="form-grid">
                <div><label style={s.fieldLabel}>Voornaam</label><input style={s.input} value={settingsForm.firstName} onChange={e => setSettingsForm({ ...settingsForm, firstName: e.target.value })} /></div>
                <div><label style={s.fieldLabel}>Achternaam</label><input style={s.input} value={settingsForm.lastName} onChange={e => setSettingsForm({ ...settingsForm, lastName: e.target.value })} /></div>
              </div>
              <div style={{ marginTop: '12px' }}><label style={s.fieldLabel}>E-mailadres</label><input style={s.input} value={settingsForm.email} onChange={e => setSettingsForm({ ...settingsForm, email: e.target.value })} /></div>
            </div>
            <div style={{ marginTop: '20px', borderTop: '1px solid #334155', paddingTop: '20px' }}>
              <h4 style={s.sectionLabel}>Meldingen</h4>
              <PushSettingsToggle uid={uid} />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <h4 style={s.sectionLabel}>Hartslagzones (BPM)</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {zonesForm.map((zone, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: zone.color, flexShrink: 0 }} />
                    <span style={{ width: '72px', fontSize: '13px', color: '#94a3b8' }}>{zone.name}</span>
                    <input style={{ ...s.input, width: '64px', textAlign: 'center', padding: '8px 4px' }} type="number" value={zone.min} onChange={e => { const z = [...zonesForm]; z[idx].min = parseInt(e.target.value) || 0; setZonesForm(z); }} />
                    <span style={{ color: '#475569', fontSize: '12px' }}>–</span>
                    <input style={{ ...s.input, width: '64px', textAlign: 'center', padding: '8px 4px' }} type="number" value={zone.max} onChange={e => { const z = [...zonesForm]; z[idx].max = parseInt(e.target.value) || 0; setZonesForm(z); }} />
                    <span style={{ color: '#475569', fontSize: '12px' }}>BPM</span>
                  </div>
                ))}
              </div>
            </div>
            <button style={s.primaryBtn} onClick={saveSettings}><Save size={16} /> Opslaan</button>

            {/* ── Clubs section ── */}
            <div style={{ marginTop: '28px', borderTop: '1px solid #334155', paddingTop: '20px' }}>
              <h4 style={s.sectionLabel}>Clubs</h4>

              {/* Active memberships */}
              {memberships.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                  {memberships.map((m, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #334155' }}>
                      <Building2 size={14} color="#a78bfa" style={{ flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: '600', fontSize: '13px', color: '#f1f5f9' }}>{m.clubName}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{m.groupName}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {m.isSkipper && <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', backgroundColor: '#3b82f622', color: '#60a5fa', border: '1px solid #3b82f644' }}>Skipper</span>}
                        {m.isCoach   && <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', backgroundColor: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b44' }}>Coach</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Request statuses */}
              {visibleRequests.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                  {visibleRequests.map(req => {
                    const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
                    const StatusIcon = cfg.icon;
                    return (
                      <div key={req.id} style={{ padding: '10px 12px', backgroundColor: '#0f172a', borderRadius: '8px', border: `1px solid ${cfg.color}33` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: '600', fontSize: '13px', color: '#f1f5f9' }}>{req.clubName}</div>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '700', color: cfg.color, marginTop: '2px' }}>
                              <StatusIcon size={9} /> {cfg.label}
                            </div>
                          </div>
                          {req.status !== 'pending' && (
                            <button onClick={() => ClubJoinRequestFactory.hide(req.id)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
                              <EyeOff size={11} /> Verbergen
                            </button>
                          )}
                        </div>
                        {req.status === 'rejected' && req.rejectionReason && (
                          <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #ef444422' }}>
                            Reden: {req.rejectionReason}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Join form */}
              {!showJoinForm ? (
                <button onClick={() => { setShowJoinForm(true); setJoinError(''); }} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px', backgroundColor: '#7c3aed22', border: '1px solid #7c3aed44', borderRadius: '8px', color: '#a78bfa', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>
                  <Send size={13} /> Aanvraag bij nieuwe club indienen
                </button>
              ) : (
                <div style={{ backgroundColor: '#0f172a', borderRadius: '10px', padding: '14px', border: '1px solid #334155' }}>
                  <label style={s.fieldLabel}>Club *</label>
                  <select style={{ ...s.select, marginBottom: '10px' }} value={joinClubId} onChange={e => setJoinClubId(e.target.value)}>
                    <option value="">-- Selecteer een club --</option>
                    {allClubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <label style={s.fieldLabel}>Motivatie (optioneel)</label>
                  <textarea style={{ ...s.input, paddingLeft: '12px', minHeight: '70px', resize: 'vertical', lineHeight: 1.5, marginBottom: '10px', fontFamily: 'inherit' }} placeholder="Vertel iets over jezelf…" value={joinMessage} onChange={e => setJoinMessage(e.target.value)} />
                  {joinError && <div style={{ color: '#ef4444', fontSize: '12px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}><AlertCircle size={12} />{joinError}</div>}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={handleSendJoin} disabled={!joinClubId || joinSending} style={{ flex: 1, padding: '10px', backgroundColor: '#7c3aed', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '700', fontSize: '13px', cursor: 'pointer', opacity: !joinClubId || joinSending ? 0.5 : 1 }}>
                      {joinSending ? 'Versturen…' : 'Versturen'}
                    </button>
                    <button onClick={() => { setShowJoinForm(false); setJoinError(''); setJoinClubId(''); setJoinMessage(''); }} style={{ padding: '10px 14px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '8px', color: '#64748b', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>
                      Annuleren
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Global CSS ───────────────────────────────────────────────────────────────
const globalCSS = `
  * { box-sizing: border-box; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes heartbeat { 0%,100% { transform: scale(1); } 50% { transform: scale(1.2); } }
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes sparkFlyA { 0% { transform:translate(0,0) scale(1); opacity:1; } 100% { transform:translate(-120px,-200px) scale(0); opacity:0; } }
  @keyframes sparkFlyB { 0% { transform:translate(0,0) scale(1); opacity:1; } 100% { transform:translate(80px,-250px) scale(0); opacity:0; } }
  @keyframes sparkFlyC { 0% { transform:translate(0,0) scale(1); opacity:1; } 100% { transform:translate(150px,-180px) scale(0); opacity:0; } }
  @keyframes sparkFlyD { 0% { transform:translate(0,0) scale(1); opacity:1; } 100% { transform:translate(-80px,-220px) scale(0); opacity:0; } }
  @keyframes sparkFlyE { 0% { transform:translate(0,0) scale(1); opacity:1; } 100% { transform:translate(30px,-300px) scale(0); opacity:0; } }
  @keyframes sparkFlyF { 0% { transform:translate(0,0) scale(1); opacity:1; } 100% { transform:translate(-200px,-150px) scale(0); opacity:0; } }
  @keyframes pulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.08); } }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 480px) { .form-grid { grid-template-columns: 1fr; } }
`;

const s = {
  page:       { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'system-ui, sans-serif' },
  spinner:    { width: '36px', height: '36px', border: '3px solid #1e293b', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  header:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', backgroundColor: '#1e293b', borderBottom: '1px solid #334155', position: 'sticky', top: 0, zIndex: 100 },
  iconBtn:    { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' },
  userAvatar: { width: '44px', height: '44px', borderRadius: '50%', backgroundColor: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '14px', flexShrink: 0, color: 'white' },
  primaryBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px 20px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', width: '100%', fontSize: '14px' },
  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 500 },
  modal:      { backgroundColor: '#1e293b', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '560px', border: '1px solid #334155', maxHeight: '92vh', overflowY: 'auto' },
  modalHeader:{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', color: '#f1f5f9', fontSize: '16px', fontWeight: '700' },
  fieldLabel: { display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: '600' },
  input:      { width: '100%', padding: '11px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '16px', boxSizing: 'border-box' },
  select:     { width: '100%', padding: '11px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '16px' },
  sectionLabel: { fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 12px', fontWeight: '700' },
};
