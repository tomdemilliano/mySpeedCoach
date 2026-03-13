import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserFactory, ClubFactory, GroupFactory, LiveSessionFactory, ClubJoinRequestFactory, BadgeFactory } from '../constants/dbSchema';
import {
  Bluetooth, BluetoothOff, Heart, User, Settings, Trophy,
  Target, Plus, Edit2, Trash2, Check, X, ChevronRight,
  Building2, Users, Save, LogOut, Award, Zap, AlertCircle,
  Clock, TrendingUp, Star, ShieldCheck, Dumbbell,
  UserPlus, Send, EyeOff, Eye, Bell, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, MessageSquare, ArrowLeft, Medal
} from 'lucide-react';
import { MyBadgesPanel } from './badges';

// ─── Cookie helpers ──────────────────────────────────────────────────────────
const COOKIE_KEY = 'msc_uid';
const setCookie = (uid) => {
  const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${COOKIE_KEY}=${uid}; expires=${expires}; path=/; SameSite=Lax`;
};
const getCookie = () => {
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`));
  return match ? match[1] : null;
};
const clearCookie = () => {
  document.cookie = `${COOKIE_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
};

// ─── BPM parser ──────────────────────────────────────────────────────────────
const parseHeartRate = (value) => {
  const flags = value.getUint8(0);
  return (flags & 0x1) ? value.getUint16(1, true) : value.getUint8(1);
};

// ─── Zone helpers ────────────────────────────────────────────────────────────
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

const DISC_LABELS = { '30sec': '30 sec', '2min': '2 min', '3min': '3 min' };

// ─── Status badge helper ─────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:  { label: 'In behandeling', color: '#f59e0b', bg: '#f59e0b22', icon: Clock },
  approved: { label: 'Goedgekeurd',    color: '#22c55e', bg: '#22c55e22', icon: CheckCircle2 },
  rejected: { label: 'Afgewezen',      color: '#ef4444', bg: '#ef444422', icon: XCircle },
};

const SPARK_ANIMS = ['sparkFlyA','sparkFlyB','sparkFlyC','sparkFlyD','sparkFlyE','sparkFlyF'];

// ─── Celebration Overlay (records, goals, badges) ─────────────────────────────
function CelebrationOverlay({ type, data, onAccept, onDecline }) {
  const isBadge  = type === 'badge';
  const isRecord = type === 'record';
  const isGoal   = type === 'goal';

  const accentColor = isBadge ? '#f59e0b' : isRecord ? '#facc15' : '#22c55e';
  const Icon = isBadge ? Medal : isRecord ? Award : Target;

  return (
    <>
      {/* Sparks */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 3000, overflow: 'hidden' }}>
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: `${10 + (i * 3.5) % 80}%`,
            top: `${15 + (i * 7) % 70}%`,
            width: `${5 + (i % 4) * 3}px`,
            height: `${5 + (i % 4) * 3}px`,
            borderRadius: '50%',
            backgroundColor: ['#facc15','#f97316','#ef4444','#22c55e','#60a5fa','#a78bfa'][i % 6],
            animation: `${SPARK_ANIMS[i % 6]} ${0.9 + (i % 5) * 0.2}s ease-out ${(i % 8) * 0.12}s forwards`,
          }} />
        ))}
      </div>

      {/* Modal */}
      <div style={s.modalOverlay}>
        <div style={{ ...s.modalContent, borderColor: accentColor, animation: 'fadeInUp 0.4s ease-out' }}>

          {/* Badge image or icon */}
          {isBadge && data.badgeImageUrl ? (
            <img
              src={data.badgeImageUrl}
              alt={data.badgeName}
              style={{ width: '90px', height: '90px', borderRadius: '50%', objectFit: 'cover', margin: '0 auto 16px', display: 'block', border: `3px solid ${accentColor}` }}
            />
          ) : (
            <div style={{
              width: '80px', height: '80px', borderRadius: '50%',
              backgroundColor: `${accentColor}22`, border: `2px solid ${accentColor}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px', animation: 'pulse 1.5s ease-in-out infinite',
              fontSize: isBadge ? '40px' : undefined,
            }}>
              {isBadge ? (data.badgeEmoji || '🏅') : <Icon size={40} color={accentColor} />}
            </div>
          )}

          <h2 style={{ color: accentColor, fontSize: '24px', margin: '0 0 8px', textAlign: 'center' }}>
            {isBadge ? '🎖️ BADGE VERDIEND!' : isRecord ? '🏆 NIEUW RECORD!' : '🎯 DOEL BEREIKT!'}
          </h2>

          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            {isBadge ? (
              <>
                <div style={{ fontSize: '22px', fontWeight: '900', color: 'white', lineHeight: 1 }}>
                  {data.badgeName}
                </div>
                <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '8px', lineHeight: 1.5 }}>
                  {data.badgeDescription || ''}
                </div>
                <div style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>
                  Uitgereikt door: {data.awardedByName || 'Systeem'}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '42px', fontWeight: '900', color: 'white', lineHeight: 1 }}>
                  {data.score}
                </div>
                <div style={{ color: '#94a3b8', fontSize: '14px', marginTop: '4px' }}>
                  steps · {data.discipline} · {data.sessionType}
                </div>
                {isRecord && data.previousBest > 0 && (
                  <div style={{ color: '#22c55e', fontSize: '13px', marginTop: '8px' }}>
                    +{data.score - data.previousBest} beter dan vorig record ({data.previousBest})
                  </div>
                )}
                {isGoal && (
                  <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '8px' }}>
                    Doel was: {data.targetScore} steps
                  </div>
                )}
              </>
            )}
          </div>

          {/* Badges are auto-saved, no accept/decline needed */}
          {isBadge ? (
            <button onClick={onAccept} style={{
              width: '100%', padding: '14px', backgroundColor: accentColor,
              border: 'none', borderRadius: '10px', color: 'white',
              fontWeight: 'bold', fontSize: '16px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
            }}>
              <Check size={20} /> GEWELDIG!
            </button>
          ) : (
            <>
              <p style={{ color: '#cbd5e1', textAlign: 'center', fontSize: '14px', marginBottom: '20px' }}>
                {isRecord ? 'Wil je dit als officieel record registreren?' : 'Wil je dit als doelbereiking vastleggen?'}
              </p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={onAccept} style={{
                  flex: 1, padding: '14px', backgroundColor: '#22c55e',
                  border: 'none', borderRadius: '10px', color: 'white',
                  fontWeight: 'bold', fontSize: '16px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                }}>
                  <Check size={20} /> JA
                </button>
                <button onClick={onDecline} style={{
                  flex: 1, padding: '14px', backgroundColor: '#475569',
                  border: 'none', borderRadius: '10px', color: 'white',
                  fontWeight: 'bold', fontSize: '16px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                }}>
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

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function IndexPage() {
  // ── Auth / identity state
  const [phase, setPhase] = useState('loading');
  const [allUsers, setAllUsers] = useState([]);
  const [allClubs, setAllClubs] = useState([]);
  const [selectedClubFilter, setSelectedClubFilter] = useState('');
  const [clubMembers, setClubMembers] = useState([]);

  // ── New-user creation form
  const [newUserForm, setNewUserForm] = useState({ firstName: '', lastName: '', email: '' });
  const [newUserError, setNewUserError] = useState('');
  const [newUserSaving, setNewUserSaving] = useState(false);

  // ── Current user
  const [currentUser, setCurrentUser] = useState(null);

  // ── HRM
  const [heartRate, setHeartRate] = useState(0);
  const [hrmConnected, setHrmConnected] = useState(false);
  const [hrmDeviceName, setHrmDeviceName] = useState('');
  const [hrmHistory, setHrmHistory] = useState([]);
  const lastBpmRef = useRef(0);

  // ── Records
  const [records, setRecords] = useState([]);
  const [editingRecord, setEditingRecord] = useState(null);

  // ── Goals
  const [goals, setGoals] = useState([]);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalForm, setGoalForm] = useState({ discipline: '30sec', targetScore: '', targetDate: '' });

  // ── Achievements
  const [achievementQueue, setAchievementQueue] = useState([]);
  const [isProcessingAchievements, setIsProcessingAchievements] = useState(false);
  
  // ── Club memberships
  const [memberships, setMemberships] = useState([]);

  // ── Club join requests
  const [joinRequests, setJoinRequests] = useState([]);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinForm, setJoinForm] = useState({ clubId: '', message: '' });
  const [joinSending, setJoinSending] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [showHiddenRequests, setShowHiddenRequests] = useState(false);

  // ── Settings modal
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ firstName: '', lastName: '', email: '' });
  const [zonesForm, setZonesForm] = useState(DEFAULT_ZONES);

  // ── Mobile tab navigation
  const [mobileTab, setMobileTab] = useState('hrm'); // 'hrm' | 'records' | 'goals' | 'clubs'

  // ── Load all users & clubs
  useEffect(() => {
    const unsubUsers = UserFactory.getAll(setAllUsers);
    const unsubClubs = ClubFactory.getAll(setAllClubs);
    return () => { unsubUsers(); unsubClubs(); };
  }, []);

  // ── Cookie auto-login
  useEffect(() => {
    if (allUsers.length === 0 || phase !== 'loading') return;
    const uid = getCookie();
    if (uid) {
      const user = allUsers.find(u => u.id === uid);
      if (user) { loginUser(user); return; }
    }
    setPhase('identify');
  }, [allUsers]);

  // ── Club filter for identify screen
  useEffect(() => {
    if (!selectedClubFilter) { setClubMembers([]); return; }
    const unsub = GroupFactory.getGroupsByClub(selectedClubFilter, async (groups) => {
      const memberSets = await Promise.all(
        groups.map(g => new Promise(res => {
          GroupFactory.getMembersByGroup(selectedClubFilter, g.id, (members) => res(members));
        }))
      );
      const allMemberUids = [...new Set(memberSets.flat().map(m => m.id))];
      const matched = allUsers.filter(u => allMemberUids.includes(u.id));
      setClubMembers(matched);
    });
    return () => unsub();
  }, [selectedClubFilter, allUsers]);

  const loginUser = useCallback((user) => {
    setCurrentUser(user);
    setCookie(user.id);
    setSettingsForm({ firstName: user.firstName || '', lastName: user.lastName || '', email: user.email || '' });
    setZonesForm(user.heartrateZones || DEFAULT_ZONES);
    setPhase('app');
    checkNewAchievements(user);
  }, []);

  // ── Subscribe to records + goals
  useEffect(() => {
    if (!currentUser) return;
    const disciplines = ['30sec', '2min', '3min'];
    const sessionTypes = ['Training', 'Wedstrijd'];
    const unsubRecords = [];
    disciplines.forEach(d => sessionTypes.forEach(st => {
      const u = UserFactory.subscribeToRecords(currentUser.id, d, st, (rec) => {
        if (rec) {
          setRecords(prev => {
            const filtered = prev.filter(r => !(r.discipline === d && r.sessionType === st));
            return [...filtered, { ...rec, discipline: d, sessionType: st }];
          });
        } else {
          setRecords(prev => prev.filter(r => !(r.discipline === d && r.sessionType === st)));
        }
      });
      unsubRecords.push(u);
    }));
    const unsubGoals = UserFactory.getGoals(currentUser.id, setGoals);
    return () => {
      unsubRecords.forEach(u => u && u());
      unsubGoals && unsubGoals();
    };
  }, [currentUser]);

  // ── Subscribe to join requests
  useEffect(() => {
    if (!currentUser) return;
    const unsub = ClubJoinRequestFactory.getByUser(currentUser.id, setJoinRequests);
    return () => unsub();
  }, [currentUser]);

  // ── Load memberships
  useEffect(() => {
    if (!currentUser || allClubs.length === 0) return;
    const allUnsubs = [];
    const collectedMemberships = {};
    allClubs.forEach(club => {
      const u = GroupFactory.getGroupsByClub(club.id, (groups) => {
        groups.forEach(group => {
          const u2 = GroupFactory.getMembersByGroup(club.id, group.id, (members) => {
            const myMembership = members.find(m => m.id === currentUser.id);
            const key = `${club.id}-${group.id}`;
            if (myMembership) {
              collectedMemberships[key] = {
                clubId: club.id, clubName: club.name,
                groupId: group.id, groupName: group.name,
                isSkipper: myMembership.isSkipper,
                isCoach: myMembership.isCoach,
                startMembership: myMembership.startMembership,
              };
            } else {
              delete collectedMemberships[key];
            }
            setMemberships(Object.values(collectedMemberships));
          });
          allUnsubs.push(u2);
        });
      });
      allUnsubs.push(u);
    });
    return () => allUnsubs.forEach(u => u && u());
  }, [currentUser, allClubs]);

  // ── HRM → Firebase sync
  useEffect(() => {
    if (!hrmConnected || !currentUser || heartRate <= 0) return;
    if (heartRate === lastBpmRef.current) return;
    lastBpmRef.current = heartRate;
    LiveSessionFactory.syncHeartbeat(currentUser.id, heartRate, 'online');
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setHrmHistory(prev => [...prev, { time: now, bpm: heartRate }].slice(-120));
  }, [heartRate, hrmConnected, currentUser]);

  // ── Bluetooth connect
  const connectBluetooth = async () => {
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['heart_rate'] }]
      });
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('heart_rate');
      const characteristic = await service.getCharacteristic('heart_rate_measurement');
      characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', (e) => {
        setHeartRate(parseHeartRate(e.target.value));
      });
      setHrmDeviceName(device.name || 'HRM Device');
      setHrmConnected(true);
      if (currentUser) {
        const knownId = currentUser.assignedDevice?.deviceId;
        if (device.id && knownId !== device.id) {
          await UserFactory.assignDevice(currentUser.id, device.id, device.name || 'HRM Device');
          setCurrentUser(prev => ({ ...prev, assignedDevice: { deviceId: device.id, deviceName: device.name } }));
        }
      }
    } catch (err) {
      console.error('Bluetooth error:', err);
    }
  };

  const disconnectHrm = () => {
    setHrmConnected(false);
    setHeartRate(0);
    setHrmHistory([]);
    if (currentUser) LiveSessionFactory.syncHeartbeat(currentUser.id, 0, 'offline');
  };

  // ── Settings save
  const saveSettings = async () => {
    if (!currentUser) return;
    await UserFactory.updateProfile(currentUser.id, {
      firstName: settingsForm.firstName,
      lastName: settingsForm.lastName,
      email: settingsForm.email,
    });
    await UserFactory.updateZones(currentUser.id, zonesForm);
    setCurrentUser(prev => ({ ...prev, ...settingsForm, heartrateZones: zonesForm }));
    setShowSettings(false);
  };

  // ── New user creation
  const handleCreateUser = async () => {
    setNewUserError('');
    if (!newUserForm.firstName.trim() || !newUserForm.lastName.trim()) {
      setNewUserError('Voornaam en achternaam zijn verplicht.');
      return;
    }
    if (newUserForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUserForm.email)) {
      setNewUserError('Voer een geldig e-mailadres in.');
      return;
    }
    setNewUserSaving(true);
    try {
      const uid = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await UserFactory.create(uid, {
        firstName: newUserForm.firstName.trim(),
        lastName: newUserForm.lastName.trim(),
        email: newUserForm.email.trim(),
        role: 'user',
      });
      const userSnap = await UserFactory.get(uid);
      if (userSnap.exists()) {
        loginUser({ id: uid, ...userSnap.data() });
      }
    } catch (err) {
      console.error(err);
      setNewUserError('Er ging iets mis. Probeer opnieuw.');
    } finally {
      setNewUserSaving(false);
    }
  };

  // ── Goal handlers
  const handleAddGoal = async () => {
    if (!goalForm.targetScore || !currentUser) return;
    const { db: firestoreDb } = await import('../firebaseConfig');
    const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
    await addDoc(collection(firestoreDb, `users/${currentUser.id}/goals`), {
      discipline: goalForm.discipline,
      targetScore: parseInt(goalForm.targetScore),
      targetDate: goalForm.targetDate ? new Date(goalForm.targetDate) : null,
      achievedAt: null,
    });
    setGoalForm({ discipline: '30sec', targetScore: '', targetDate: '' });
    setShowGoalModal(false);
  };

  // ── Record handlers
  const saveRecordEdit = async () => {
    if (!editingRecord || !currentUser) return;
    const { db: firestoreDb } = await import('../firebaseConfig');
    const { updateDoc, doc } = await import('firebase/firestore');
    await updateDoc(doc(firestoreDb, `users/${currentUser.id}/`, editingRecord.id), {
      score: parseInt(editingRecord.score),
    });
    setEditingRecord(null);
  };

  const deleteRecord = async (record) => {
    if (!currentUser || !window.confirm('Record verwijderen?')) return;
    const { db: firestoreDb } = await import('../firebaseConfig');
    const { deleteDoc, doc } = await import('firebase/firestore');
    await deleteDoc(doc(firestoreDb, `users/${currentUser.id}/`, record.id));
  };

  const deleteGoal = async (goal) => {
    if (!currentUser || !window.confirm('Doel verwijderen?')) return;
    const { db: firestoreDb } = await import('../firebaseConfig');
    const { deleteDoc, doc } = await import('firebase/firestore');
    await deleteDoc(doc(firestoreDb, `users/${currentUser.id}/goals`, goal.id));
  };

  // ── Join request handlers
  const handleSendJoinRequest = async () => {
    setJoinError('');
    if (!joinForm.clubId) { setJoinError('Selecteer een club.'); return; }
    const alreadyPending = joinRequests.find(
      r => r.clubId === joinForm.clubId && r.status === 'pending'
    );
    if (alreadyPending) {
      setJoinError('Je hebt al een openstaande aanvraag voor deze club.');
      return;
    }
    setJoinSending(true);
    try {
      const club = allClubs.find(c => c.id === joinForm.clubId);
      await ClubJoinRequestFactory.create(
        currentUser.id,
        { firstName: currentUser.firstName, lastName: currentUser.lastName, email: currentUser.email || '' },
        joinForm.clubId,
        club?.name || '',
        joinForm.message
      );
      setShowJoinModal(false);
      setJoinForm({ clubId: '', message: '' });
    } catch (err) {
      console.error(err);
      setJoinError('Aanvraag kon niet worden verzonden.');
    } finally {
      setJoinSending(false);
    }
  };

  const handleHideRequest = async (requestId) => { await ClubJoinRequestFactory.hide(requestId); };
  const handleUnhideRequest = async (requestId) => { await ClubJoinRequestFactory.unhide(requestId); };
  const handleDeleteRequest = async (requestId) => {
    if (!window.confirm('Aanvraag definitief verwijderen?')) return;
    await ClubJoinRequestFactory.delete(requestId);
  };

  const logout = () => {
    clearCookie();
    setCurrentUser(null);
    setHeartRate(0);
    setHrmConnected(false);
    setHrmHistory([]);
    setRecords([]);
    setGoals([]);
    setMemberships([]);
    setJoinRequests([]);
    setPhase('identify');
  };

  const checkNewAchievements = async (user) => {
    const lastVisitedRaw = await UserFactory.getLastVisited(user.id);
    const lastVisitedMs = lastVisitedRaw?.seconds ? lastVisitedRaw.seconds * 1000 : 0;

    // Update last visited to now
    await UserFactory.updateLastVisited(user.id);

    if (!lastVisitedMs) return; // First visit, nothing to show

    const queue = [];

    // 1. Check for new badges since last visit
    await new Promise(resolve => {
      BadgeFactory.getEarned(user.id, (earned) => {
        earned
          .filter(b => {
            const earnedMs = b.earnedAt?.seconds ? b.earnedAt.seconds * 1000 : 0;
            return earnedMs > lastVisitedMs;
          })
          .forEach(b => queue.push({ type: 'badge', data: b }));
        resolve();
      });
    });

    // 2. Get recent sessions to check records and goals
    const history = await UserFactory.getSessionHistoryOnce(user.id);
    const recentSessions = history.filter(s => {
      const endMs = s.sessionEnd?.seconds ? s.sessionEnd.seconds * 1000 : 0;
      return endMs > lastVisitedMs;
    });

    // 3. Check for new records in recent sessions
    for (const session of recentSessions) {
      if (!session.score) continue;
      const best = await UserFactory.getBestRecord(user.id, session.discipline, session.sessionType);
      if (best) {
        const recordMs = best.achievedAt?.seconds ? best.achievedAt.seconds * 1000 : 0;
        if (recordMs > lastVisitedMs && best.score === session.score) {
          queue.push({
            type: 'record',
            data: {
              score: session.score,
              discipline: session.discipline,
              sessionType: session.sessionType,
              countedByName: session.countedByName || null,
            }
          });
        }
      }
    }

    // 4. Check for newly achieved goals
    await new Promise(resolve => {
      UserFactory.getGoals(user.id, (goals) => {
        goals
          .filter(g => {
            const achievedMs = g.achievedAt?.seconds ? g.achievedAt.seconds * 1000 : 0;
            return achievedMs > lastVisitedMs;
          })
          .forEach(g => {
            const matchingSession = recentSessions.find(s =>
              s.discipline === g.discipline && (s.score || 0) >= g.targetScore
            );
            queue.push({
              type: 'goal',
              data: {
                score: matchingSession?.score || g.targetScore,
                discipline: g.discipline,
                sessionType: matchingSession?.sessionType || 'Training',
                targetScore: g.targetScore,
              }
            });
          });
        resolve();
      });
    });

    if (queue.length > 0) {
      setAchievementQueue(queue);
      setIsProcessingAchievements(true);
    }
  };

  const advanceAchievementQueue = () => {
    setAchievementQueue(prev => {
      const next = prev.slice(1);
      if (next.length === 0) setIsProcessingAchievements(false);
      return next;
    });
  };
  
  // ── Derived data
  const visibleRequests = joinRequests.filter(r => !r.hidden);
  const hiddenRequests = joinRequests.filter(r => r.hidden);
  const pendingCount = joinRequests.filter(r => r.status === 'pending').length;
  const newRejections = joinRequests.filter(r => r.status === 'rejected' && !r.hidden).length;

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: Loading
  // ════════════════════════════════════════════════════════════════════════════
  if (phase === 'loading') {
    return (
      <div style={s.fullCenter}>
        <style>{globalCSS}</style>
        <div style={s.spinner} />
        <p style={{ color: '#64748b', marginTop: '20px', fontFamily: 'sans-serif' }}>Laden…</p>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: Create New User
  // ════════════════════════════════════════════════════════════════════════════
  if (phase === 'createUser') {
    return (
      <div style={s.page}>
        <style>{globalCSS}</style>
        <div style={s.identifyWrap}>
          <button
            style={{ ...s.backBtn, marginBottom: '24px' }}
            onClick={() => { setPhase('identify'); setNewUserForm({ firstName: '', lastName: '', email: '' }); setNewUserError(''); }}
          >
            <ArrowLeft size={16} /> Terug naar selectie
          </button>

          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={s.appLogo}><UserPlus size={28} color="#22c55e" /></div>
            <h1 style={s.appTitle}>Nieuw account</h1>
            <p style={s.appSubtitle}>Maak een nieuw profiel aan</p>
          </div>

          <div style={s.createUserCard}>
            <div className="form-grid">
              <div>
                <label style={s.fieldLabel}>Voornaam <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  style={s.input}
                  placeholder="bijv. Emma"
                  value={newUserForm.firstName}
                  onChange={e => setNewUserForm({ ...newUserForm, firstName: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && handleCreateUser()}
                  autoFocus
                />
              </div>
              <div>
                <label style={s.fieldLabel}>Achternaam <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  style={s.input}
                  placeholder="bijv. De Smet"
                  value={newUserForm.lastName}
                  onChange={e => setNewUserForm({ ...newUserForm, lastName: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && handleCreateUser()}
                />
              </div>
            </div>
            <div style={{ marginTop: '14px' }}>
              <label style={s.fieldLabel}>E-mailadres <span style={{ color: '#64748b', fontWeight: 400 }}>(optioneel)</span></label>
              <input
                style={s.input}
                type="email"
                placeholder="bijv. emma@example.com"
                value={newUserForm.email}
                onChange={e => setNewUserForm({ ...newUserForm, email: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && handleCreateUser()}
              />
            </div>

            {newUserError && (
              <div style={s.errorBanner}>
                <AlertCircle size={14} /> {newUserError}
              </div>
            )}

            <button
              style={{ ...s.primaryBtn, marginTop: '24px', opacity: newUserSaving ? 0.6 : 1 }}
              onClick={handleCreateUser}
              disabled={newUserSaving}
            >
              {newUserSaving ? (
                <><div style={s.btnSpinner} /> Aanmaken…</>
              ) : (
                <><UserPlus size={16} /> Account aanmaken</>
              )}
            </button>

            <p style={{ textAlign: 'center', color: '#475569', fontSize: '12px', marginTop: '16px' }}>
              Na het aanmaken word je direct ingelogd.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: Identify
  // ════════════════════════════════════════════════════════════════════════════
  if (phase === 'identify') {
    const displayUsers = selectedClubFilter && clubMembers.length > 0 ? clubMembers : allUsers;
    return (
      <div style={s.page}>
        <style>{globalCSS}</style>
        <div style={s.identifyWrap}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={s.appLogo}><Zap size={32} color="#3b82f6" /></div>
            <h1 style={s.appTitle}>MySpeedCoach</h1>
            <p style={s.appSubtitle}>Wie ben jij?</p>
          </div>

          {allClubs.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <label style={s.fieldLabel}>
                <Building2 size={13} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                Filter op club
              </label>
              <select
                style={s.select}
                value={selectedClubFilter}
                onChange={e => setSelectedClubFilter(e.target.value)}
              >
                <option value="">Alle gebruikers</option>
                {allClubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          <div className="user-grid">
            {displayUsers.map(u => (
              <button key={u.id} style={s.userTile} onClick={() => loginUser(u)}>
                <div style={s.userAvatar}>
                  {(u.firstName?.[0] || '?')}{(u.lastName?.[0] || '')}
                </div>
                <div style={s.userTileName}>{u.firstName} {u.lastName}</div>
                <div style={s.userTileRole}>{u.role}</div>
              </button>
            ))}

            <button
              style={{ ...s.userTile, borderStyle: 'dashed', borderColor: '#22c55e44', backgroundColor: '#0f172a' }}
              onClick={() => setPhase('createUser')}
            >
              <div style={{ ...s.userAvatar, backgroundColor: '#0d2818', border: '1px dashed #22c55e' }}>
                <UserPlus size={20} color="#22c55e" />
              </div>
              <div style={{ ...s.userTileName, color: '#22c55e' }}>Nieuw account</div>
              <div style={s.userTileRole}>aanmaken</div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: App
  // ════════════════════════════════════════════════════════════════════════════
  const zones = currentUser?.heartrateZones || DEFAULT_ZONES;
  const bpmColor = getZoneColor(heartRate, zones);
  const zoneName = getZoneName(heartRate, zones);
  const disciplines = ['30sec', '2min', '3min'];
  const sessionTypes = ['Training', 'Wedstrijd'];

  // ── HRM Panel
  const HrmPanel = () => (
    <section style={s.card}>
      <div style={s.cardHeader}>
        <Heart size={16} color="#ef4444" fill="#ef4444" />
        <span>Hartslag Monitor</span>
        {hrmConnected && (
          <button style={{ ...s.chipBtn, marginLeft: 'auto', backgroundColor: '#1e3a2f', color: '#22c55e', border: '1px solid #22c55e33' }} onClick={disconnectHrm}>
            <BluetoothOff size={13} /> Ontkoppel
          </button>
        )}
      </div>
      {!hrmConnected ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={s.hrmIdle}><Heart size={40} color="#334155" /></div>
          <p style={{ color: '#64748b', fontSize: '14px', margin: '16px 0' }}>Geen HRM verbonden</p>
          <button style={s.primaryBtn} onClick={connectBluetooth}>
            <Bluetooth size={16} /> Koppel HRM
          </button>
          {currentUser.assignedDevice?.deviceName && (
            <p style={{ color: '#475569', fontSize: '11px', marginTop: '12px' }}>
              Bekend apparaat: {currentUser.assignedDevice.deviceName}
            </p>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '80px', fontWeight: '900', color: bpmColor, lineHeight: 1, margin: '16px 0 8px' }}>
            {heartRate || '--'}
          </div>
          <div style={{ fontSize: '18px', color: '#94a3b8', marginBottom: '8px' }}>BPM</div>
          <div style={{ display: 'inline-block', padding: '4px 14px', borderRadius: '20px', backgroundColor: `${bpmColor}22`, color: bpmColor, fontSize: '12px', fontWeight: '700', border: `1px solid ${bpmColor}44`, marginBottom: '16px' }}>
            {zoneName}
          </div>
          <div style={{ fontSize: '11px', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <Bluetooth size={12} color="#3b82f6" /> {hrmDeviceName}
          </div>
          <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', marginTop: '20px', height: '6px' }}>
            {zones.map(z => (
              <div key={z.name} style={{ flex: 1, backgroundColor: heartRate >= z.min && heartRate < z.max ? z.color : `${z.color}33` }} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            {zones.map(z => (
              <span key={z.name} style={{ fontSize: '9px', color: heartRate >= z.min && heartRate < z.max ? z.color : '#334155' }}>{z.name}</span>
            ))}
          </div>
        </div>
      )}
    </section>
  );

  // ── Records Panel
  const RecordsPanel = () => (
    <section style={s.card}>
      <div style={s.cardHeader}>
        <Trophy size={16} color="#facc15" />
        <span>Persoonlijke Records</span>
      </div>
      {records.length === 0 ? (
        <div style={s.emptyState}>
          <Award size={32} color="#334155" />
          <p>Nog geen records</p>
          <span>Records worden automatisch bijgehouden na sessies.</span>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', margin: '0 -4px' }}>
          <table style={{ ...s.table, minWidth: '320px' }}>
            <thead>
              <tr>
                <th style={s.th}>Onderdeel</th>
                {sessionTypes.map(st => <th key={st} style={s.th}>{st}</th>)}
              </tr>
            </thead>
            <tbody>
              {disciplines.map(d => (
                <tr key={d} style={s.tr}>
                  <td style={s.td}><span style={s.discBadge}>{DISC_LABELS[d]}</span></td>
                  {sessionTypes.map(st => {
                    const rec = records.find(r => r.discipline === d && r.sessionType === st);
                    const isEditThis = editingRecord?.id === rec?.id;
                    return (
                      <td key={st} style={{ ...s.td, minWidth: '110px' }}>
                        {rec ? (
                          isEditThis ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <input autoFocus style={s.miniInput} value={editingRecord.score} type="number"
                                onChange={e => setEditingRecord({ ...editingRecord, score: e.target.value })} />
                              <button style={s.iconBtnGreen} onClick={saveRecordEdit}><Check size={14} /></button>
                              <button style={s.iconBtnGray} onClick={() => setEditingRecord(null)}><X size={14} /></button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontWeight: '700', color: '#facc15', fontSize: '16px' }}>{rec.score}</span>
                              <span style={{ color: '#475569', fontSize: '11px' }}>stps</span>
                              <button style={{ ...s.iconBtnGray, marginLeft: 'auto' }} onClick={() => setEditingRecord({ ...rec })}><Edit2 size={12} /></button>
                              <button style={{ ...s.iconBtnGray, color: '#ef4444' }} onClick={() => deleteRecord(rec)}><Trash2 size={12} /></button>
                            </div>
                          )
                        ) : (
                          <span style={{ color: '#334155', fontSize: '13px' }}>—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  // ── Goals Panel
  const GoalsPanel = () => (
    <section style={s.card}>
      <div style={s.cardHeader}>
        <Target size={16} color="#22c55e" />
        <span>Doelen</span>
        <button style={{ ...s.chipBtn, marginLeft: 'auto' }} onClick={() => setShowGoalModal(true)}>
          <Plus size={13} /> Doel
        </button>
      </div>
      {goals.length === 0 ? (
        <div style={s.emptyState}>
          <Target size={32} color="#334155" />
          <p>Geen doelen gevonden</p>
          <span>Voeg doelen toe om je progressie bij te houden.</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {goals.map(g => {
            const achieved = !!g.achievedAt;
            return (
              <div key={g.id} style={{ ...s.goalRow, borderColor: achieved ? '#22c55e44' : '#334155' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: achieved ? '#22c55e22' : '#3b82f622', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {achieved ? <Check size={16} color="#22c55e" /> : <Target size={16} color="#3b82f6" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: '600', fontSize: '14px', color: achieved ? '#22c55e' : '#f1f5f9' }}>
                    {DISC_LABELS[g.discipline]} — {g.targetScore} steps
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    {achieved ? '✓ Bereikt' : g.targetDate ? `Deadline: ${new Date(g.targetDate?.seconds ? g.targetDate.seconds * 1000 : g.targetDate).toLocaleDateString()}` : 'Geen deadline'}
                  </div>
                </div>
                <button style={{ ...s.iconBtnGray, color: '#ef4444', flexShrink: 0 }} onClick={() => deleteGoal(g)}><Trash2 size={14} /></button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );

  // ── Clubs Panel
  const ClubsPanel = () => (
    <section style={s.card}>
      <div style={s.cardHeader}>
        <Building2 size={16} color="#a78bfa" />
        <span>Clubs & Groepen</span>
        <button style={{ ...s.chipBtn, marginLeft: 'auto' }} onClick={() => { setShowJoinModal(true); setJoinError(''); }}>
          <Send size={13} /> Aanvraag
        </button>
      </div>

      {memberships.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Lidmaatschappen
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {memberships.map((m, i) => (
              <div key={i} style={s.membershipRow}>
                <div style={s.clubIcon}><Building2 size={16} color="#a78bfa" /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: '600', fontSize: '14px', color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.clubName}</div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{m.groupName}</div>
                </div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 0 }}>
                  {m.isSkipper && <span style={s.roleBadge('#3b82f6')}>Skipper</span>}
                  {m.isCoach && <span style={s.roleBadge('#f59e0b')}>Coach</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {memberships.length === 0 && visibleRequests.length === 0 && (
        <div style={s.emptyState}>
          <Users size={32} color="#334155" />
          <p>Geen clublidmaatschappen</p>
          <span>Dien een aanvraag in om toe te treden.</span>
        </div>
      )}

      {visibleRequests.length > 0 && (
        <div>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', marginTop: memberships.length > 0 ? '8px' : 0 }}>
            Aanvragen
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {visibleRequests.map(req => {
              const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
              const StatusIcon = cfg.icon;
              return (
                <div key={req.id} style={{ ...s.requestRow, borderColor: `${cfg.color}44`, backgroundColor: cfg.bg }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: '600', fontSize: '14px', color: '#f1f5f9' }}>{req.clubName}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700', backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}44`, whiteSpace: 'nowrap' }}>
                        <StatusIcon size={11} /> {cfg.label}
                      </span>
                    </div>
                    {req.message && (
                      <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', marginBottom: '4px' }}>
                        "{req.message}"
                      </div>
                    )}
                    {req.status === 'rejected' && req.rejectionReason && (
                      <div style={{ fontSize: '12px', color: '#ef4444', backgroundColor: '#ef444411', padding: '6px 10px', borderRadius: '6px', marginTop: '6px', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                        <MessageSquare size={12} style={{ flexShrink: 0, marginTop: '1px' }} />
                        <span><strong>Reden:</strong> {req.rejectionReason}</span>
                      </div>
                    )}
                    <div style={{ fontSize: '10px', color: '#475569', marginTop: '4px' }}>
                      {req.createdAt?.seconds ? new Date(req.createdAt.seconds * 1000).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                    {req.status !== 'pending' && (
                      <button title="Verbergen" style={{ ...s.iconBtnGray, padding: '4px' }} onClick={() => handleHideRequest(req.id)}>
                        <EyeOff size={14} />
                      </button>
                    )}
                    {(req.status === 'approved' || req.status === 'rejected') && (
                      <button title="Verwijderen" style={{ ...s.iconBtnGray, color: '#ef4444', padding: '4px' }} onClick={() => handleDeleteRequest(req.id)}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hiddenRequests.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <button style={{ ...s.chipBtn, width: '100%', justifyContent: 'center' }} onClick={() => setShowHiddenRequests(v => !v)}>
            {showHiddenRequests ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {showHiddenRequests ? 'Verberg' : `Toon`} {hiddenRequests.length} verborgen aanvraag/aanvragen
          </button>
          {showHiddenRequests && (
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {hiddenRequests.map(req => {
                const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
                return (
                  <div key={req.id} style={{ ...s.requestRow, opacity: 0.6, borderColor: '#334155' }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: '13px', color: '#94a3b8' }}>{req.clubName}</span>
                      <span style={{ marginLeft: '8px', fontSize: '11px', color: cfg.color }}>({cfg.label})</span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button title="Tonen" style={s.iconBtnGray} onClick={() => handleUnhideRequest(req.id)}><Eye size={14} /></button>
                      <button title="Verwijderen" style={{ ...s.iconBtnGray, color: '#ef4444' }} onClick={() => handleDeleteRequest(req.id)}><Trash2 size={14} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );

  return (
    <div style={s.page}>
      <style>{globalCSS}</style>
      {/* Achievement celebrations for the logged-in user */}
      {isProcessingAchievements && achievementQueue.length > 0 && (
        <CelebrationOverlay
          type={achievementQueue[0].type}
          data={achievementQueue[0].data}
          onDismiss={advanceAchievementQueue}
        />
      )}

      {/* ── HEADER ── */}
      <header style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
          <div style={{ ...s.appLogo, width: '32px', height: '32px', borderRadius: '8px', marginBottom: 0 }}>
            <Zap size={18} color="#3b82f6" />
          </div>
          <span style={{ fontWeight: '700', fontSize: '15px', color: '#f1f5f9', fontFamily: 'sans-serif' }}>MySpeedCoach</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0}}>
          {newRejections > 0 && (
            <div style={{ position: 'relative', cursor: 'pointer' }} title={`${newRejections} aanvraag(en) afgewezen`} onClick={() => setMobileTab('clubs')}>
              <Bell size={18} color="#f59e0b" />
              <span style={{ position: 'absolute', top: '-5px', right: '-5px', backgroundColor: '#ef4444', color: 'white', fontSize: '9px', fontWeight: 'bold', width: '14px', height: '14px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {newRejections}
              </span>
            </div>
          )}
          <div style={s.userChip}>
            <div style={{ ...s.userAvatar, width: '26px', height: '26px', fontSize: '10px' }}>
              {currentUser.firstName?.[0]}{currentUser.lastName?.[0]}
            </div>
            <span className="hide-xs" style={{ fontSize: '13px', color: '#cbd5e1' }}>{currentUser.firstName} {currentUser.lastName}</span>
          </div>
          <button style={s.iconBtn} onClick={() => setShowSettings(true)} title="Instellingen"><Settings size={18} /></button>
          <button style={{ ...s.iconBtn, color: '#ef4444' }} onClick={logout} title="Afmelden"><LogOut size={18} /></button>
        </div>
      </header>

      {/* ── DESKTOP LAYOUT ── */}
      <main className="desktop-main" style={s.main}>
        <div className="desktop-row" style={s.row}>
          <div style={{ flex: '0 0 340px', minWidth: 0 }}><HrmPanel /></div>
          <div style={{ flex: 1, minWidth: 0 }}><RecordsPanel /></div>
        </div>
        <div className="desktop-row" style={s.row}>
          <div style={{ flex: 1, minWidth: 0 }}><MyBadgesPanel uid={currentUser} /></div> 
          <div style={{ flex: 1, minWidth: 0 }}><GoalsPanel /></div>
          <div style={{ flex: 1, minWidth: 0 }}><ClubsPanel /></div>
        </div>
      </main>

      {/* ── MOBILE LAYOUT ── */}
      <div className="mobile-main">
        {/* Tab content */}
        <div style={{ padding: '16px', paddingBottom: '80px' }}>
          {mobileTab === 'hrm' && <HrmPanel />}
          {mobileTab === 'records' && <RecordsPanel />}
          {mobileTab === 'badges' && <MyBadgesPanel uid={currentUser} />}
          {mobileTab === 'goals' && <GoalsPanel />}
          {mobileTab === 'clubs' && <ClubsPanel />}
        </div>

        {/* Bottom tab bar */}
        <nav style={s.bottomNav}>
          {[
            { key: 'hrm',     icon: Heart,     label: 'Hartslag',  color: '#ef4444', active: hrmConnected },
            { key: 'records', icon: Trophy,    label: 'Records',   color: '#facc15' },
            { key: 'badges',  icon: Award,     label: 'Badgess',   color: '#facc15' },
            { key: 'goals',   icon: Target,    label: 'Doelen',    color: '#22c55e' },
            { key: 'clubs',   icon: Building2, label: 'Clubs',     color: '#a78bfa', badge: newRejections },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = mobileTab === tab.key;
            return (
              <button
                key={tab.key}
                style={{
                  ...s.bottomNavBtn,
                  color: isActive ? tab.color : '#475569',
                }}
                onClick={() => setMobileTab(tab.key)}
              >
                <div style={{ position: 'relative', display: 'inline-flex' }}>
                  <Icon size={22} fill={isActive && tab.key === 'hrm' && hrmConnected ? tab.color : 'none'} color={isActive ? tab.color : '#475569'} />
                  {tab.badge > 0 && (
                    <span style={{ position: 'absolute', top: '-5px', right: '-5px', backgroundColor: '#ef4444', color: 'white', fontSize: '8px', fontWeight: 'bold', width: '12px', height: '12px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {tab.badge}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '10px', marginTop: '3px', fontWeight: isActive ? '700' : '400' }}>{tab.label}</span>
                {isActive && <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '24px', height: '2px', backgroundColor: tab.color, borderRadius: '2px 2px 0 0' }} />}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ════ SETTINGS MODAL ════ */}
      {showSettings && (
        <div style={s.modalOverlay}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}><Settings size={18} /> Instellingen</h3>
              <button style={s.iconBtnGray} onClick={() => setShowSettings(false)}><X size={18} /></button>
            </div>
            <div style={{ marginBottom: '24px' }}>
              <h4 style={s.sectionLabel}>Profiel</h4>
              <div className="form-grid">
                <div>
                  <label style={s.fieldLabel}>Voornaam</label>
                  <input style={s.input} value={settingsForm.firstName} onChange={e => setSettingsForm({ ...settingsForm, firstName: e.target.value })} />
                </div>
                <div>
                  <label style={s.fieldLabel}>Achternaam</label>
                  <input style={s.input} value={settingsForm.lastName} onChange={e => setSettingsForm({ ...settingsForm, lastName: e.target.value })} />
                </div>
              </div>
              <div style={{ marginTop: '12px' }}>
                <label style={s.fieldLabel}>E-mailadres</label>
                <input style={s.input} value={settingsForm.email} onChange={e => setSettingsForm({ ...settingsForm, email: e.target.value })} />
              </div>
            </div>
            <div style={{ marginBottom: '24px' }}>
              <h4 style={s.sectionLabel}>Hartslagzones (BPM)</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {zonesForm.map((zone, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: zone.color, flexShrink: 0 }} />
                    <span style={{ width: '72px', fontSize: '13px', color: '#94a3b8' }}>{zone.name}</span>
                    <input style={{ ...s.input, width: '64px', textAlign: 'center', padding: '8px 4px' }} type="number" value={zone.min}
                      onChange={e => { const z = [...zonesForm]; z[idx].min = parseInt(e.target.value) || 0; setZonesForm(z); }} />
                    <span style={{ color: '#475569', fontSize: '12px' }}>–</span>
                    <input style={{ ...s.input, width: '64px', textAlign: 'center', padding: '8px 4px' }} type="number" value={zone.max}
                      onChange={e => { const z = [...zonesForm]; z[idx].max = parseInt(e.target.value) || 0; setZonesForm(z); }} />
                    <span style={{ color: '#475569', fontSize: '12px' }}>BPM</span>
                  </div>
                ))}
              </div>
            </div>
            <button style={s.primaryBtn} onClick={saveSettings}><Save size={16} /> Opslaan</button>
          </div>
        </div>
      )}

      {/* ════ ADD GOAL MODAL ════ */}
      {showGoalModal && (
        <div style={s.modalOverlay}>
          <div style={{ ...s.modal, maxWidth: '380px' }}>
            <div style={s.modalHeader}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}><Target size={18} /> Doel toevoegen</h3>
              <button style={s.iconBtnGray} onClick={() => setShowGoalModal(false)}><X size={18} /></button>
            </div>
            <label style={s.fieldLabel}>Onderdeel</label>
            <select style={s.select} value={goalForm.discipline} onChange={e => setGoalForm({ ...goalForm, discipline: e.target.value })}>
              {disciplines.map(d => <option key={d} value={d}>{DISC_LABELS[d]}</option>)}
            </select>
            <label style={{ ...s.fieldLabel, marginTop: '14px' }}>Doelstelling (steps)</label>
            <input style={s.input} type="number" placeholder="bijv. 150" value={goalForm.targetScore}
              onChange={e => setGoalForm({ ...goalForm, targetScore: e.target.value })} />
            <label style={{ ...s.fieldLabel, marginTop: '14px' }}>Deadline (optioneel)</label>
            <input style={s.input} type="date" value={goalForm.targetDate}
              onChange={e => setGoalForm({ ...goalForm, targetDate: e.target.value })} />
            <button style={{ ...s.primaryBtn, marginTop: '20px' }} onClick={handleAddGoal}><Plus size={16} /> Doel Toevoegen</button>
          </div>
        </div>
      )}

      {/* ════ JOIN REQUEST MODAL ════ */}
      {showJoinModal && (
        <div style={s.modalOverlay}>
          <div style={{ ...s.modal, maxWidth: '420px' }}>
            <div style={s.modalHeader}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}><Send size={18} color="#a78bfa" /> Aanvraag voor club</h3>
              <button style={s.iconBtnGray} onClick={() => setShowJoinModal(false)}><X size={18} /></button>
            </div>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px', lineHeight: 1.6 }}>
              Selecteer de club waarbij je wilt aansluiten.
            </p>
            <label style={s.fieldLabel}>Club <span style={{ color: '#ef4444' }}>*</span></label>
            <select style={{ ...s.select, marginBottom: '16px' }} value={joinForm.clubId} onChange={e => setJoinForm({ ...joinForm, clubId: e.target.value })}>
              <option value="">-- Selecteer een club --</option>
              {allClubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label style={s.fieldLabel}>Motivatie <span style={{ color: '#64748b', fontWeight: 400 }}>(optioneel)</span></label>
            <textarea
              style={{ ...s.input, minHeight: '80px', resize: 'vertical', lineHeight: 1.5 }}
              placeholder="Vertel iets over jezelf…"
              value={joinForm.message}
              onChange={e => setJoinForm({ ...joinForm, message: e.target.value })}
            />
            {joinError && (
              <div style={s.errorBanner}><AlertCircle size={14} /> {joinError}</div>
            )}
            <button
              style={{ ...s.primaryBtn, marginTop: '20px', backgroundColor: '#7c3aed', opacity: joinSending ? 0.6 : 1 }}
              onClick={handleSendJoinRequest}
              disabled={joinSending}
            >
              {joinSending ? (
                <><div style={s.btnSpinner} /> Verzenden…</>
              ) : (
                <><Send size={16} /> Aanvraag verzenden</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Global responsive CSS ────────────────────────────────────────────────────
const globalCSS = `
  * { box-sizing: border-box; }

  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

  @keyframes sparkFlyA { 0% { transform:translate(0,0) scale(1); opacity:1; } 100% { transform:translate(-120px,-200px) scale(0); opacity:0; } }
  @keyframes sparkFlyB { 0% { transform:translate(0,0) scale(1); opacity:1; } 100% { transform:translate(80px,-250px) scale(0); opacity:0; } }
  @keyframes sparkFlyC { 0% { transform:translate(0,0) scale(1); opacity:1; } 100% { transform:translate(150px,-180px) scale(0); opacity:0; } }
  @keyframes sparkFlyD { 0% { transform:translate(0,0) scale(1); opacity:1; } 100% { transform:translate(-80px,-220px) scale(0); opacity:0; } }
  @keyframes sparkFlyE { 0% { transform:translate(0,0) scale(1); opacity:1; } 100% { transform:translate(30px,-300px) scale(0); opacity:0; } }
  @keyframes sparkFlyF { 0% { transform:translate(0,0) scale(1); opacity:1; } 100% { transform:translate(-200px,-150px) scale(0); opacity:0; } }
  @keyframes pulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.08); } }

  /* Desktop: show desktop layout, hide mobile */
  .desktop-main { display: flex; flex-direction: column; gap: 20px; padding: 24px; max-width: 1400px; margin: 0 auto; }
  .desktop-row  { display: flex; gap: 20px; flex-wrap: wrap; }
  .mobile-main  { display: none; }

  /* Two-column form grid */
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

  /* User grid on identify screen */
  .user-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }

  /* Hide on xs screens */
  .hide-xs { display: inline; }

  /* ── Mobile breakpoint ── */
  @media (max-width: 640px) {
    .desktop-main { display: none !important; }
    .mobile-main  { display: block !important; }

    .form-grid { grid-template-columns: 1fr; }
    .user-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
    .hide-xs   { display: none !important; }
  }
`;

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  page: { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'system-ui, sans-serif' },
  fullCenter: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#0f172a' },
  spinner: { width: '36px', height: '36px', border: '3px solid #1e293b', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  btnSpinner: { width: '16px', height: '16px', border: '2px solid #ffffff55', borderTop: '2px solid white', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' },

  // Identify / create-user screens
  identifyWrap: { maxWidth: '560px', margin: '0 auto', padding: '40px 16px' },
  backBtn: { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: 0 },
  appLogo: { width: '56px', height: '56px', borderRadius: '16px', backgroundColor: '#1e293b', border: '1px solid #334155', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' },
  appTitle: { fontSize: '28px', fontWeight: '800', margin: '0 0 8px', color: '#f1f5f9' },
  appSubtitle: { color: '#64748b', fontSize: '15px', margin: 0 },
  userTile: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '16px 10px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: 'white' },
  userAvatar: { width: '44px', height: '44px', borderRadius: '50%', backgroundColor: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '14px', flexShrink: 0 },
  userTileName: { fontWeight: '600', fontSize: '13px', textAlign: 'center', lineHeight: 1.3 },
  userTileRole: { fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' },
  createUserCard: { backgroundColor: '#1e293b', borderRadius: '16px', padding: '24px', border: '1px solid #334155' },
  errorBanner: { display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#ef444422', color: '#ef4444', fontSize: '13px', padding: '10px 14px', borderRadius: '8px', marginTop: '12px', border: '1px solid #ef444433' },

  // App layout
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: '#1e293b', borderBottom: '1px solid #334155', position: 'sticky', top: 0, zIndex: 100 },
  userChip: { display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#0f172a', padding: '4px 10px 4px 4px', borderRadius: '20px', border: '1px solid #334155' },
  main: { padding: '24px', maxWidth: '1400px', margin: '0 auto' },
  row: { display: 'flex', gap: '20px', flexWrap: 'wrap' },
  card: { backgroundColor: '#1e293b', borderRadius: '16px', padding: '16px', border: '1px solid #334155' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', fontSize: '14px', fontWeight: '600', color: '#94a3b8', borderBottom: '1px solid #1e3a5f', paddingBottom: '12px' },

  // HRM
  hrmIdle: { width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#0f172a', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' },

  // Table
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '8px 10px', color: '#64748b', fontSize: '12px', fontWeight: '600', borderBottom: '1px solid #334155' },
  tr: { borderBottom: '1px solid #1e293b' },
  td: { padding: '10px 10px', fontSize: '14px' },
  discBadge: { display: 'inline-block', padding: '3px 8px', borderRadius: '6px', backgroundColor: '#0f172a', color: '#94a3b8', fontSize: '12px', fontWeight: '600', border: '1px solid #334155', whiteSpace: 'nowrap' },
  miniInput: { width: '64px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px' },

  // Goal/membership rows
  goalRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', backgroundColor: '#0f172a', borderRadius: '10px', border: '1px solid' },
  membershipRow: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', backgroundColor: '#0f172a', borderRadius: '10px', border: '1px solid #334155' },
  requestRow: { display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px', backgroundColor: 'transparent', borderRadius: '10px', border: '1px solid' },
  clubIcon: { width: '34px', height: '34px', borderRadius: '8px', backgroundColor: '#2d1d4e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  roleBadge: (color) => ({ padding: '3px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', backgroundColor: `${color}22`, color: color, border: `1px solid ${color}44` }),

  // Empty state
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0', gap: '8px', color: '#64748b', fontSize: '13px', textAlign: 'center' },

  // Buttons
  primaryBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px 20px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', width: '100%', fontSize: '14px' },
  chipBtn: { display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', backgroundColor: '#0f172a', color: '#94a3b8', border: '1px solid #334155', cursor: 'pointer' },
  iconBtn: { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' },
  iconBtnGreen: { background: 'none', border: 'none', color: '#22c55e', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' },
  iconBtnGray: { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' },

  // Modals
  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 500, padding: '0' },
  modal: { backgroundColor: '#1e293b', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '560px', border: '1px solid #334155', maxHeight: '92vh', overflowY: 'auto' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', color: '#f1f5f9', fontSize: '16px', fontWeight: '700' },

  // Forms
  fieldLabel: { display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: '600' },
  input: { width: '100%', padding: '11px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '16px', boxSizing: 'border-box' },
  select: { width: '100%', padding: '11px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '16px' },
  sectionLabel: { fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 12px', fontWeight: '700' },

  // Bottom nav (mobile)
  bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#1e293b', borderTop: '1px solid #334155', display: 'flex', zIndex: 200, paddingBottom: 'env(safe-area-inset-bottom, 0px)' },
  bottomNavBtn: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 4px 8px', background: 'none', border: 'none', cursor: 'pointer', position: 'relative', transition: 'color 0.15s' },
};
