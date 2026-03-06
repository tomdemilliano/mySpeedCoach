import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserFactory, ClubFactory, GroupFactory, LiveSessionFactory } from '../constants/dbSchema';
import {
  Bluetooth, BluetoothOff, Heart, User, Settings, Trophy,
  Target, Plus, Edit2, Trash2, Check, X, ChevronRight,
  Building2, Users, Save, LogOut, Award, Zap, AlertCircle,
  Clock, TrendingUp, Star, ShieldCheck, Dumbbell
} from 'lucide-react';

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

// ─── DISCIPLINE LABELS ───────────────────────────────────────────────────────
const DISC_LABELS = { '30sec': '30 sec', '2min': '2 min', '3min': '3 min' };

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function IndexPage() {
  // ── Auth / identity state
  const [phase, setPhase] = useState('loading'); // loading | identify | app
  const [allUsers, setAllUsers] = useState([]);
  const [allClubs, setAllClubs] = useState([]);
  const [selectedClubFilter, setSelectedClubFilter] = useState('');
  const [clubMembers, setClubMembers] = useState([]); // {uid, firstName, lastName}

  // ── Current user
  const [currentUser, setCurrentUser] = useState(null); // full user doc

  // ── HRM
  const [heartRate, setHeartRate] = useState(0);
  const [hrmConnected, setHrmConnected] = useState(false);
  const [hrmDeviceName, setHrmDeviceName] = useState('');
  const [hrmHistory, setHrmHistory] = useState([]);
  const lastBpmRef = useRef(0);

  // ── Records
  const [records, setRecords] = useState([]); // flat list from subcollection
  const [editingRecord, setEditingRecord] = useState(null);

  // ── Goals
  const [goals, setGoals] = useState([]);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalForm, setGoalForm] = useState({ discipline: '30sec', targetScore: '', targetDate: '' });

  // ── Club memberships of the user
  const [memberships, setMemberships] = useState([]); // [{clubId, clubName, groupId, groupName, isSkipper, isCoach}]

  // ── Settings modal
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ firstName: '', lastName: '', email: '' });
  const [zonesForm, setZonesForm] = useState(DEFAULT_ZONES);

  // ── Load all users & clubs for identification
  useEffect(() => {
    const unsubUsers = UserFactory.getAll(setAllUsers);
    const unsubClubs = ClubFactory.getAll(setAllClubs);
    return () => { unsubUsers(); unsubClubs(); };
  }, []);

  // ── Try cookie identification after users loaded
  useEffect(() => {
    if (allUsers.length === 0 || phase !== 'loading') return;
    const uid = getCookie();
    if (uid) {
      const user = allUsers.find(u => u.id === uid);
      if (user) { loginUser(user); return; }
    }
    setPhase('identify');
  }, [allUsers]);

  // ── When club filter changes in identify screen load members
  useEffect(() => {
    if (!selectedClubFilter) { setClubMembers([]); return; }
    // Get all groups for this club and collect member UIDs
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
  }, []);

  // ── Subscribe to records, goals when user identified
  useEffect(() => {
    if (!currentUser) return;
    // Records: fetch all disciplines/types
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

  // ── Load memberships across all clubs/groups
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

      // Check if device is known; if not, save it
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
    if (currentUser) {
      LiveSessionFactory.syncHeartbeat(currentUser.id, 0, 'offline');
    }
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

  // ── Goal add
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

  // ── Record edit save
  const saveRecordEdit = async () => {
    if (!editingRecord || !currentUser) return;
    const { db: firestoreDb } = await import('../firebaseConfig');
    const { updateDoc, doc } = await import('firebase/firestore');
    await updateDoc(doc(firestoreDb, `users/${currentUser.id}/records`, editingRecord.id), {
      score: parseInt(editingRecord.score),
    });
    setEditingRecord(null);
  };

  const deleteRecord = async (record) => {
    if (!currentUser || !window.confirm('Record verwijderen?')) return;
    const { db: firestoreDb } = await import('../firebaseConfig');
    const { deleteDoc, doc } = await import('firebase/firestore');
    await deleteDoc(doc(firestoreDb, `users/${currentUser.id}/records`, record.id));
  };

  const deleteGoal = async (goal) => {
    if (!currentUser || !window.confirm('Doel verwijderen?')) return;
    const { db: firestoreDb } = await import('../firebaseConfig');
    const { deleteDoc, doc } = await import('firebase/firestore');
    await deleteDoc(doc(firestoreDb, `users/${currentUser.id}/goals`, goal.id));
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
    setPhase('identify');
  };

  // ════════════════════════════════════════════════════════════════════════
  // RENDER: Loading
  // ════════════════════════════════════════════════════════════════════════
  if (phase === 'loading') {
    return (
      <div style={s.fullCenter}>
        <div style={s.spinner} />
        <p style={{ color: '#64748b', marginTop: '20px', fontFamily: 'sans-serif' }}>Laden…</p>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // RENDER: Identify
  // ════════════════════════════════════════════════════════════════════════
  if (phase === 'identify') {
    const displayUsers = selectedClubFilter && clubMembers.length > 0 ? clubMembers : allUsers;
    return (
      <div style={s.page}>
        <div style={s.identifyWrap}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={s.appLogo}><Zap size={32} color="#3b82f6" /></div>
            <h1 style={s.appTitle}>MySpeedCoach</h1>
            <p style={s.appSubtitle}>Wie ben jij?</p>
          </div>

          {allClubs.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <label style={s.fieldLabel}><Building2 size={13} style={{ verticalAlign: 'middle', marginRight: '6px' }} />Filter op club</label>
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

          <div style={s.userGrid}>
            {displayUsers.map(u => (
              <button key={u.id} style={s.userTile} onClick={() => loginUser(u)}>
                <div style={s.userAvatar}>
                  {(u.firstName?.[0] || '?')}{(u.lastName?.[0] || '')}
                </div>
                <div style={s.userTileName}>{u.firstName} {u.lastName}</div>
                <div style={s.userTileRole}>{u.role}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // RENDER: App
  // ════════════════════════════════════════════════════════════════════════
  const zones = currentUser?.heartrateZones || DEFAULT_ZONES;
  const bpmColor = getZoneColor(heartRate, zones);
  const zoneName = getZoneName(heartRate, zones);

  // Group records by discipline for table
  const disciplines = ['30sec', '2min', '3min'];
  const sessionTypes = ['Training', 'Wedstrijd'];

  return (
    <div style={s.page}>
      {/* ── HEADER ── */}
      <header style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={s.appLogo}><Zap size={20} color="#3b82f6" /></div>
          <span style={{ fontWeight: '700', fontSize: '16px', color: '#f1f5f9', fontFamily: 'sans-serif' }}>MySpeedCoach</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={s.userChip}>
            <div style={{ ...s.userAvatar, width: '28px', height: '28px', fontSize: '11px' }}>
              {currentUser.firstName?.[0]}{currentUser.lastName?.[0]}
            </div>
            <span style={{ fontSize: '13px', color: '#cbd5e1' }}>{currentUser.firstName} {currentUser.lastName}</span>
          </div>
          <button style={s.iconBtn} onClick={() => setShowSettings(true)} title="Instellingen"><Settings size={18} /></button>
          <button style={{ ...s.iconBtn, color: '#ef4444' }} onClick={logout} title="Afmelden"><LogOut size={18} /></button>
        </div>
      </header>

      <main style={s.main}>
        {/* ── ROW 1: HRM + Records ── */}
        <div style={s.row}>

          {/* ── HRM BOX ── */}
          <section style={{ ...s.card, flex: '0 0 340px' }}>
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
              <div style={{ textAlign: 'center', padding: '30px 0' }}>
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

                {/* Mini zone bar */}
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

          {/* ── RECORDS ── */}
          <section style={{ ...s.card, flex: 1 }}>
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
              <table style={s.table}>
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
                          <td key={st} style={{ ...s.td, minWidth: '120px' }}>
                            {rec ? (
                              isEditThis ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <input
                                    autoFocus
                                    style={s.miniInput}
                                    value={editingRecord.score}
                                    type="number"
                                    onChange={e => setEditingRecord({ ...editingRecord, score: e.target.value })}
                                  />
                                  <button style={s.iconBtnGreen} onClick={saveRecordEdit}><Check size={14} /></button>
                                  <button style={s.iconBtnGray} onClick={() => setEditingRecord(null)}><X size={14} /></button>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
            )}
          </section>
        </div>

        {/* ── ROW 2: Goals + Memberships ── */}
        <div style={s.row}>

          {/* ── GOALS ── */}
          <section style={{ ...s.card, flex: 1 }}>
            <div style={s.cardHeader}>
              <Target size={16} color="#22c55e" />
              <span>Doelen</span>
              <button style={{ ...s.chipBtn, marginLeft: 'auto' }} onClick={() => setShowGoalModal(true)}>
                <Plus size={13} /> Doel toevoegen
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: achieved ? '#22c55e22' : '#3b82f622', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {achieved ? <Check size={16} color="#22c55e" /> : <Target size={16} color="#3b82f6" />}
                        </div>
                        <div>
                          <div style={{ fontWeight: '600', fontSize: '14px', color: achieved ? '#22c55e' : '#f1f5f9' }}>
                            {DISC_LABELS[g.discipline]} — {g.targetScore} steps
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            {achieved ? `✓ Bereikt` : g.targetDate ? `Deadline: ${new Date(g.targetDate?.seconds ? g.targetDate.seconds * 1000 : g.targetDate).toLocaleDateString()}` : 'Geen deadline'}
                          </div>
                        </div>
                      </div>
                      <button style={{ ...s.iconBtnGray, color: '#ef4444' }} onClick={() => deleteGoal(g)}><Trash2 size={14} /></button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── MEMBERSHIPS ── */}
          <section style={{ ...s.card, flex: 1 }}>
            <div style={s.cardHeader}>
              <Building2 size={16} color="#a78bfa" />
              <span>Clubs & Groepen</span>
            </div>

            {memberships.length === 0 ? (
              <div style={s.emptyState}>
                <Users size={32} color="#334155" />
                <p>Geen clublidmaatschappen</p>
                <span>Vraag een beheerder om je toe te voegen aan een club.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {memberships.map((m, i) => (
                  <div key={i} style={s.membershipRow}>
                    <div style={s.clubIcon}><Building2 size={16} color="#a78bfa" /></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', fontSize: '14px', color: '#f1f5f9' }}>{m.clubName}</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{m.groupName}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {m.isSkipper && <span style={s.roleBadge('#3b82f6')}>Skipper</span>}
                      {m.isCoach && <span style={s.roleBadge('#f59e0b')}>Coach</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

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
              <div style={s.formGrid}>
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
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: zone.color, flexShrink: 0 }} />
                    <span style={{ width: '80px', fontSize: '13px', color: '#94a3b8' }}>{zone.name}</span>
                    <input style={{ ...s.input, width: '70px', textAlign: 'center' }} type="number" value={zone.min}
                      onChange={e => { const z = [...zonesForm]; z[idx].min = parseInt(e.target.value) || 0; setZonesForm(z); }} />
                    <span style={{ color: '#475569', fontSize: '12px' }}>–</span>
                    <input style={{ ...s.input, width: '70px', textAlign: 'center' }} type="number" value={zone.max}
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
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  page: { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'system-ui, sans-serif' },
  fullCenter: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#0f172a' },
  spinner: { width: '36px', height: '36px', border: '3px solid #1e293b', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },

  // Identify screen
  identifyWrap: { maxWidth: '560px', margin: '0 auto', padding: '60px 20px' },
  appLogo: { width: '56px', height: '56px', borderRadius: '16px', backgroundColor: '#1e293b', border: '1px solid #334155', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' },
  appTitle: { fontSize: '28px', fontWeight: '800', margin: '0 0 8px', color: '#f1f5f9' },
  appSubtitle: { color: '#64748b', fontSize: '15px', margin: 0 },
  userGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' },
  userTile: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '20px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: 'white', transition: 'border-color 0.2s' },
  userAvatar: { width: '44px', height: '44px', borderRadius: '50%', backgroundColor: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '14px', flexShrink: 0 },
  userTileName: { fontWeight: '600', fontSize: '13px', textAlign: 'center', lineHeight: 1.3 },
  userTileRole: { fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' },

  // App layout
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', backgroundColor: '#1e293b', borderBottom: '1px solid #334155', position: 'sticky', top: 0, zIndex: 100 },
  userChip: { display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#0f172a', padding: '4px 12px 4px 4px', borderRadius: '20px', border: '1px solid #334155' },
  main: { padding: '24px', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' },
  row: { display: 'flex', gap: '20px', flexWrap: 'wrap' },
  card: { backgroundColor: '#1e293b', borderRadius: '16px', padding: '20px', border: '1px solid #334155', minWidth: '280px' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', fontSize: '14px', fontWeight: '600', color: '#94a3b8', borderBottom: '1px solid #1e3a5f', paddingBottom: '12px' },

  // HRM
  hrmIdle: { width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#0f172a', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' },

  // Table
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '8px 12px', color: '#64748b', fontSize: '12px', fontWeight: '600', borderBottom: '1px solid #334155' },
  tr: { borderBottom: '1px solid #1e293b' },
  td: { padding: '10px 12px', fontSize: '14px' },
  discBadge: { display: 'inline-block', padding: '3px 10px', borderRadius: '6px', backgroundColor: '#0f172a', color: '#94a3b8', fontSize: '12px', fontWeight: '600', border: '1px solid #334155' },
  miniInput: { width: '64px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px' },

  // Goal/membership rows
  goalRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', backgroundColor: '#0f172a', borderRadius: '10px', border: '1px solid' },
  membershipRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', backgroundColor: '#0f172a', borderRadius: '10px', border: '1px solid #334155' },
  clubIcon: { width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#2d1d4e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  roleBadge: (color) => ({ padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', backgroundColor: `${color}22`, color: color, border: `1px solid ${color}44` }),

  // Empty state
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '30px 0', gap: '8px', '& p': { margin: 0 } },

  // Buttons
  primaryBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px 20px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', width: '100%', fontSize: '14px' },
  chipBtn: { display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', backgroundColor: '#0f172a', color: '#94a3b8', border: '1px solid #334155', cursor: 'pointer' },
  iconBtn: { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' },
  iconBtnGreen: { background: 'none', border: 'none', color: '#22c55e', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' },
  iconBtnGray: { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' },

  // Modals
  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: '20px' },
  modal: { backgroundColor: '#1e293b', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '520px', border: '1px solid #334155', maxHeight: '90vh', overflowY: 'auto' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', color: '#f1f5f9', fontSize: '16px', fontWeight: '700' },

  // Forms
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  fieldLabel: { display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: '600' },
  input: { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px', boxSizing: 'border-box' },
  select: { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px' },
  sectionLabel: { fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 12px', fontWeight: '700' },
};
