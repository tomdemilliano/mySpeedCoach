import { useState, useEffect, useRef, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea, Legend
} from 'recharts';
import {
  Heart, Hash, Zap, Timer, Users, CheckCircle2, Trophy,
  Settings, Building2, ChevronRight, Ghost, ArrowLeft
} from 'lucide-react';

import { UserFactory, LiveSessionFactory, ClubFactory, GroupFactory } from '../constants/dbSchema';

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_ZONES = [
  { name: 'Warm-up',   min: 0,   max: 120, color: '#94a3b8' },
  { name: 'Fat Burn',  min: 120, max: 145, color: '#22c55e' },
  { name: 'Aerobic',   min: 145, max: 165, color: '#facc15' },
  { name: 'Anaerobic', min: 165, max: 185, color: '#f97316' },
  { name: 'Red Line',  min: 185, max: 250, color: '#ef4444' },
];

const DISCIPLINE_DURATION = { '30sec': 30, '2min': 120, '3min': 180 };

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getZoneColor = (bpm, zones) => {
  const z = (zones || DEFAULT_ZONES).find(z => bpm >= z.min && bpm < z.max);
  return z ? z.color : '#94a3b8';
};

/**
 * Compute a rolling tempo (steps/min) from the RTDB telemetry array.
 * We look at the last N steps and compute steps-per-second over that window.
 * Falls back to the last known value if no recent activity.
 */
const computeRollingTempo = (telemetry, windowMs = 5000) => {
  if (!telemetry || telemetry.length < 2) return 0;
  const arr = Array.isArray(telemetry) ? telemetry : Object.values(telemetry);
  const sorted = [...arr].sort((a, b) => a.time - b.time);
  const now = sorted[sorted.length - 1].time;
  const cutoff = now - windowMs;
  const window = sorted.filter(p => p.time >= cutoff);
  if (window.length < 2) {
    // Use full array but cap at last 10 points
    const tail = sorted.slice(-10);
    if (tail.length < 2) return 0;
    const dt = (tail[tail.length - 1].time - tail[0].time) / 1000;
    return dt > 0 ? Math.round(((tail.length - 1) / dt) * 60) : 0;
  }
  const dt = (window[window.length - 1].time - window[0].time) / 1000;
  return dt > 0 ? Math.round(((window.length - 1) / dt) * 60) : 0;
};

/**
 * Normalise RTDB telemetry (may be array or Firebase object-with-keys).
 * Returns sorted array of { time, heartRate, steps }.
 * `time` values are relative ms from session start (or absolute ms — we normalise below).
 */
const normaliseTelemetry = (raw) => {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : Object.values(raw);
  return arr.filter(Boolean).sort((a, b) => a.time - b.time);
};

/**
 * Build ghost data aligned in seconds from session start.
 * Returns array indexed by elapsed second → { ghostBpm, ghostSteps }.
 */
const buildGhostCurve = (recordTelemetry) => {
  const points = normaliseTelemetry(recordTelemetry);
  if (points.length === 0) return [];
  const t0 = points[0].time;
  const map = {};
  points.forEach(p => {
    const sec = Math.floor((p.time - t0) / 1000);
    map[sec] = { ghostBpm: p.heartRate || 0, ghostSteps: p.steps || 0 };
  });
  return map; // keyed by elapsed second
};

/**
 * Calculate expected final score based on current pace over remaining time.
 */
const calcExpected = (session, history) => {
  if (!session?.isActive) return session?.steps || 0;
  if (session.isFinished) return session.steps || 0;
  const duration = DISCIPLINE_DURATION[session.discipline] || 30;
  const elapsed = (Date.now() - session.startTime) / 1000;
  const remaining = Math.max(0, duration - elapsed);
  const tempo = history.length > 1
    ? computeRollingTempo(history.map((h, i) => ({ time: i * 1000, heartRate: h.bpm, steps: h.steps })))
    : 0;
  const stepsPerSec = tempo / 60;
  return Math.round((session.steps || 0) + remaining * stepsPerSec);
};

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '10px 14px', fontSize: '12px' }}>
      <div style={{ color: '#64748b', marginBottom: '6px' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: p.color, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ color: '#94a3b8' }}>{p.name}:</span>
          <strong style={{ color: 'white' }}>{typeof p.value === 'number' ? Math.round(p.value) : p.value}</strong>
        </div>
      ))}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ════════════════════════════════════════════════════════════════════════════
export default function Dashboard() {
  // ── Selection flow
  const [view, setView] = useState('select-club'); // 'select-club' | 'select-group' | 'select-skippers' | 'monitoring'
  const [clubs, setClubs] = useState([]);
  const [groups, setGroups] = useState([]);
  const [groupMembers, setGroupMembers] = useState([]); // raw member docs
  const [allUsers, setAllUsers] = useState([]);
  const [selectedClub, setSelectedClub] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedSkipperIds, setSelectedSkipperIds] = useState([]);

  // ── Live data per uid
  const [liveSessions, setLiveSessions] = useState({});   // uid → { bpm, session, ... }
  const liveRef = useRef({});

  // ── Per-skipper history (for chart + tempo)
  // history[uid] = array of { elapsed, bpm, steps, tempo }
  const [history, setHistory] = useState({});

  // ── Personal bests per uid
  const [personalBests, setPersonalBests] = useState({}); // uid → { score, telemetry }

  // ── Ghost data per uid (derived from PB telemetry)
  const [ghostCurves, setGhostCurves] = useState({}); // uid → map keyed by elapsed second

  // ── Ghost visibility toggle per uid
  const [showGhost, setShowGhost] = useState({}); // uid → boolean

  // ── Load clubs & all users once
  useEffect(() => {
    const u1 = ClubFactory.getAll(setClubs);
    const u2 = UserFactory.getAll(setAllUsers);
    return () => { u1(); u2(); };
  }, []);

  // ── Load groups when club selected
  useEffect(() => {
    if (!selectedClub) return;
    const u = GroupFactory.getGroupsByClub(selectedClub.id, setGroups);
    return () => u();
  }, [selectedClub]);

  // ── Load group members when group selected
  useEffect(() => {
    if (!selectedClub || !selectedGroup) return;
    const u = GroupFactory.getMembersByGroup(selectedClub.id, selectedGroup.id, setGroupMembers);
    return () => u();
  }, [selectedClub, selectedGroup]);

  // ── Subscribe to RTDB live data for selected skippers
  useEffect(() => {
    if (selectedSkipperIds.length === 0) return;
    const unsubs = selectedSkipperIds.map(uid =>
      LiveSessionFactory.subscribeToLive(uid, (data) => {
        if (!data) return;
        setLiveSessions(prev => ({ ...prev, [uid]: data }));
        liveRef.current = { ...liveRef.current, [uid]: data };
      })
    );
    return () => unsubs.forEach(u => u && u());
  }, [selectedSkipperIds]);

  // ── Load personal best + build ghost curve when skipper + discipline changes
  const loadPersonalBest = useCallback(async (uid, discipline, sessionType) => {
    if (!uid || !discipline) return;
    const rec = await UserFactory.getBestRecord(uid, discipline, sessionType || 'Training');
    if (!rec) return;
    setPersonalBests(prev => ({ ...prev, [uid]: rec }));
    const ghost = buildGhostCurve(rec.telemetry);
    setGhostCurves(prev => ({ ...prev, [uid]: ghost }));
    // Default: show ghost if record has telemetry
    if (rec.telemetry && Object.keys(ghost).length > 1) {
      setShowGhost(prev => ({ ...prev, [uid]: true }));
    }
  }, []);

  // Watch discipline changes per skipper
  const disciplineRef = useRef({});
  useEffect(() => {
    selectedSkipperIds.forEach(uid => {
      const disc = liveSessions[uid]?.session?.discipline;
      const sType = liveSessions[uid]?.session?.sessionType;
      const key = `${uid}-${disc}-${sType}`;
      if (disc && disciplineRef.current[uid] !== key) {
        disciplineRef.current[uid] = key;
        loadPersonalBest(uid, disc, sType);
      }
    });
  }, [liveSessions, selectedSkipperIds, loadPersonalBest]);

  // ── Build history tick every second
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setHistory(prev => {
        const next = { ...prev };
        selectedSkipperIds.forEach(uid => {
          const liveData = liveRef.current[uid] || {};
          const session = liveData.session;
          if (!session?.isActive && !session?.isFinished) return;

          // Elapsed seconds from session start
          const elapsed = session.startTime
            ? Math.floor((now - session.startTime) / 1000)
            : 0;

          // Rolling tempo from RTDB telemetry (most accurate source)
          const rtdbTelemetry = normaliseTelemetry(session.telemetry);
          const tempo = computeRollingTempo(rtdbTelemetry);

          const point = {
            elapsed,                         // x-axis: seconds from start
            bpm: liveData.bpm || 0,
            steps: session.steps || 0,
            tempo,
            label: elapsed + 's',
          };

          if (!next[uid]) next[uid] = [];
          // Avoid duplicate elapsed entries
          const last = next[uid][next[uid].length - 1];
          if (last && last.elapsed === elapsed) {
            next[uid][next[uid].length - 1] = point;
          } else {
            next[uid] = [...next[uid], point].slice(-300);
          }
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [selectedSkipperIds]);

  // ── Merge live history with ghost for chart
  const buildChartData = (uid) => {
    const hist = history[uid] || [];
    const ghost = ghostCurves[uid] || {};
    const ghostVisible = showGhost[uid] && Object.keys(ghost).length > 0;

    return hist.map(point => {
      const g = ghostVisible ? (ghost[point.elapsed] || null) : null;
      return {
        ...point,
        ghostBpm: g?.ghostBpm ?? null,
        ghostSteps: g?.ghostSteps ?? null,
      };
    });
  };

  // ── Skipper helpers
  const getUser = (uid) => allUsers.find(u => u.id === uid) || {};
  const getZones = (uid) => getUser(uid)?.heartrateZones || DEFAULT_ZONES;

  // ── Skippers available in the selected group (only skippers)
  const availableSkippers = groupMembers
    .filter(m => m.isSkipper)
    .map(m => ({ ...m, ...getUser(m.id) }));

  const toggleSkipper = (uid) => {
    setSelectedSkipperIds(prev =>
      prev.includes(uid)
        ? prev.filter(id => id !== uid)
        : prev.length < 4 ? [...prev, uid] : (alert('Maximaal 4 skippers tegelijk.'), prev)
    );
  };

  // ════════════════════════════════════════════════════════════════════════
  // RENDER: Club selection
  // ════════════════════════════════════════════════════════════════════════
  if (view === 'select-club') {
    return (
      <div style={css.page}>
        <div style={css.selectionWrap}>
          <div style={css.selectionHeader}>
            <Building2 size={22} color="#3b82f6" />
            <h2 style={{ margin: 0 }}>Selecteer Club</h2>
          </div>
          <div style={css.cardGrid}>
            {clubs.map(club => (
              <button key={club.id} style={css.selectCard} onClick={() => {
                setSelectedClub(club);
                setGroups([]);
                setSelectedGroup(null);
                setGroupMembers([]);
                setView('select-group');
              }}>
                <Building2 size={32} color="#3b82f6" style={{ marginBottom: '10px' }} />
                <div style={css.selectCardName}>{club.name}</div>
                <ChevronRight size={16} color="#475569" />
              </button>
            ))}
          </div>
          {clubs.length === 0 && <p style={css.infoText}>Geen clubs gevonden.</p>}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // RENDER: Group selection
  // ════════════════════════════════════════════════════════════════════════
  if (view === 'select-group') {
    return (
      <div style={css.page}>
        <div style={css.selectionWrap}>
          <button style={css.backBtn} onClick={() => setView('select-club')}>
            <ArrowLeft size={16} /> Terug naar clubs
          </button>
          <div style={css.selectionHeader}>
            <Users size={22} color="#3b82f6" />
            <h2 style={{ margin: 0 }}>{selectedClub?.name} — Selecteer Groep</h2>
          </div>
          <div style={css.cardGrid}>
            {groups.map(group => (
              <button key={group.id} style={css.selectCard} onClick={() => {
                setSelectedGroup(group);
                setGroupMembers([]);
                setSelectedSkipperIds([]);
                setHistory({});
                setView('select-skippers');
              }}>
                <Users size={32} color="#22c55e" style={{ marginBottom: '10px' }} />
                <div style={css.selectCardName}>{group.name}</div>
                <ChevronRight size={16} color="#475569" />
              </button>
            ))}
          </div>
          {groups.length === 0 && <p style={css.infoText}>Geen groepen gevonden.</p>}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // RENDER: Skipper selection
  // ════════════════════════════════════════════════════════════════════════
  if (view === 'select-skippers') {
    return (
      <div style={css.page}>
        <div style={css.selectionWrap}>
          <button style={css.backBtn} onClick={() => setView('select-group')}>
            <ArrowLeft size={16} /> Terug naar groepen
          </button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div style={css.selectionHeader}>
              <Trophy size={22} color="#facc15" />
              <h2 style={{ margin: 0 }}>{selectedGroup?.name} — Kies Skippers ({selectedSkipperIds.length}/4)</h2>
            </div>
            <button
              disabled={selectedSkipperIds.length === 0}
              onClick={() => setView('monitoring')}
              style={{ ...css.primaryBtn, opacity: selectedSkipperIds.length === 0 ? 0.4 : 1, width: 'auto', padding: '10px 24px' }}
            >
              Start Monitoring →
            </button>
          </div>
          <div style={css.skipperGrid}>
            {availableSkippers.map(skipper => {
              const isSelected = selectedSkipperIds.includes(skipper.id);
              const liveData = liveSessions[skipper.id];
              const isOnline = liveData?.connectionStatus === 'online';
              return (
                <button
                  key={skipper.id}
                  style={{ ...css.skipperCard, borderColor: isSelected ? '#3b82f6' : '#1e293b', backgroundColor: isSelected ? '#1e3a5f' : '#1e293b' }}
                  onClick={() => toggleSkipper(skipper.id)}
                >
                  {isSelected && <CheckCircle2 style={{ position: 'absolute', top: 10, right: 10, color: '#3b82f6' }} size={18} />}
                  <div style={{ ...css.avatar, backgroundColor: isSelected ? '#3b82f6' : '#334155' }}>
                    {(skipper.firstName?.[0] || '?')}{skipper.lastName?.[0] || ''}
                  </div>
                  <div style={{ fontWeight: '600', marginTop: '10px' }}>{skipper.firstName} {skipper.lastName}</div>
                  <div style={{ fontSize: '11px', color: isOnline ? '#22c55e' : '#475569', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Heart size={11} fill={isOnline ? '#22c55e' : 'none'} />
                    {isOnline ? `Online · ${liveData?.bpm || '--'} BPM` : 'Offline'}
                  </div>
                </button>
              );
            })}
          </div>
          {availableSkippers.length === 0 && <p style={css.infoText}>Geen skippers in deze groep.</p>}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // RENDER: Monitoring
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div style={css.page}>
      {/* Header */}
      <div style={css.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button style={css.backBtn} onClick={() => setView('select-skippers')}>
            <ArrowLeft size={16} /> Wijzig selectie
          </button>
          <span style={{ color: '#475569', fontSize: '13px' }}>
            {selectedClub?.name} · {selectedGroup?.name}
          </span>
        </div>
        <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#f1f5f9' }}>
          SPEED MONITORING LIVE
        </h1>
        <div style={{ width: '140px' }} />
      </div>

      {/* Skipper cards */}
      <div style={css.monitorGrid}>
        {selectedSkipperIds.map(uid => {
          const user = getUser(uid);
          const liveData = liveSessions[uid] || {};
          const session = liveData.session || {};
          const currentBpm = liveData.bpm || 0;
          const zones = getZones(uid);
          const bpmColor = getZoneColor(currentBpm, zones);
          const hist = history[uid] || [];
          const latestPoint = hist[hist.length - 1] || {};
          const currentTempo = latestPoint.tempo || 0;
          const pb = personalBests[uid];
          const ghostVisible = showGhost[uid] && ghostCurves[uid] && Object.keys(ghostCurves[uid]).length > 0;
          const chartData = buildChartData(uid);
          const expectedScore = calcExpected(session, hist);

          // Ghost steps at current elapsed (for "behind/ahead" indicator)
          const ghostAtNow = ghostVisible && ghostCurves[uid][latestPoint.elapsed];
          const stepDiff = ghostAtNow ? (session.steps || 0) - (ghostAtNow.ghostSteps || 0) : null;

          // Timer display
          const getTimer = () => {
            if (!session.startTime) return '0:00';
            const duration = DISCIPLINE_DURATION[session.discipline] || 30;
            const elapsed = Math.floor((Date.now() - session.startTime) / 1000);
            const remaining = duration - elapsed;
            const abs = Math.abs(remaining);
            const m = Math.floor(abs / 60);
            const s = abs % 60;
            return `${remaining < 0 ? '+' : ''}${m}:${s.toString().padStart(2, '0')}`;
          };

          return (
            <div key={uid} style={css.card}>
              {/* Card header: name + status + timer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ ...css.avatar, width: '40px', height: '40px', fontSize: '14px', backgroundColor: bpmColor + '33', border: `1px solid ${bpmColor}66` }}>
                      {(user.firstName?.[0] || '?')}{user.lastName?.[0] || ''}
                    </div>
                    <div>
                      <div style={{ fontWeight: '800', fontSize: '18px' }}>{user.firstName} {user.lastName}</div>
                      <div style={{ fontSize: '11px', color: '#facc15', fontWeight: '600' }}>
                        {session.discipline || '---'} · {session.sessionType || 'Training'}
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#60a5fa', fontWeight: '700', fontSize: '16px' }}>
                    <Timer size={15} /> {getTimer()}
                  </div>
                  <div style={{ fontSize: '10px', marginTop: '2px', color: session.isActive ? '#22c55e' : session.isFinished ? '#60a5fa' : '#475569', fontWeight: '700' }}>
                    {session.isActive ? '● LIVE' : session.isFinished ? '✓ KLAAR' : '○ WACHT'}
                  </div>
                </div>
              </div>

              {/* Stats row */}
              <div style={css.statsGrid}>
                {/* BPM */}
                <div style={css.statBox}>
                  <div style={css.statLabel}><Heart size={11} fill={bpmColor} color={bpmColor} /> Hartslag</div>
                  <div style={{ ...css.statValue, color: bpmColor }}>{currentBpm || '--'}</div>
                  <div style={{ fontSize: '9px', color: '#475569' }}>BPM</div>
                </div>

                {/* Steps */}
                <div style={css.statBox}>
                  <div style={css.statLabel}><Hash size={11} /> Stappen</div>
                  <div style={{ ...css.statValue, color: '#60a5fa' }}>{session.steps || 0}</div>
                  <div style={{ fontSize: '9px', color: '#475569' }}>
                    {stepDiff !== null ? (
                      <span style={{ color: stepDiff >= 0 ? '#22c55e' : '#ef4444', fontWeight: '700' }}>
                        {stepDiff >= 0 ? '+' : ''}{stepDiff} vs ghost
                      </span>
                    ) : 'totaal'}
                  </div>
                </div>

                {/* Tempo */}
                <div style={css.statBox}>
                  <div style={css.statLabel}><Zap size={11} /> Tempo</div>
                  <div style={{ ...css.statValue, color: '#22c55e' }}>{currentTempo || '--'}</div>
                  <div style={{ fontSize: '9px', color: '#475569' }}>spr/min</div>
                </div>

                {/* Personal Best */}
                <div style={{ ...css.statBox, borderColor: pb ? '#facc1544' : '#334155' }}>
                  <div style={css.statLabel}><Trophy size={11} color="#facc15" /> Record</div>
                  <div style={{ ...css.statValue, color: '#facc15' }}>{pb?.score ?? '--'}</div>
                  <div style={{ fontSize: '9px', color: '#475569' }}>stappen</div>
                </div>
              </div>

              {/* Expected final score */}
              <div style={css.expectedBox}>
                <div style={{ fontSize: '10px', color: '#22c55e', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Verwachte Eindscore
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                  <span style={{ fontSize: '36px', fontWeight: '900', color: '#22c55e', lineHeight: 1 }}>{expectedScore}</span>
                  {pb && (
                    <span style={{ fontSize: '12px', color: expectedScore > pb.score ? '#22c55e' : expectedScore < pb.score ? '#ef4444' : '#475569', fontWeight: '700' }}>
                      {expectedScore > pb.score ? `+${expectedScore - pb.score} vs PB 🔥` :
                       expectedScore < pb.score ? `${expectedScore - pb.score} vs PB` :
                       '= PB'}
                    </span>
                  )}
                </div>
              </div>

              {/* Ghost toggle */}
              {pb?.telemetry && Object.keys(ghostCurves[uid] || {}).length > 1 && (
                <button
                  style={{
                    ...css.ghostToggle,
                    backgroundColor: ghostVisible ? '#7c3aed22' : '#0f172a',
                    borderColor: ghostVisible ? '#7c3aed' : '#334155',
                    color: ghostVisible ? '#a78bfa' : '#475569',
                  }}
                  onClick={() => setShowGhost(prev => ({ ...prev, [uid]: !prev[uid] }))}
                >
                  <Ghost size={13} />
                  {ghostVisible ? 'Ghost-sessie aan' : 'Ghost-sessie tonen'}
                  {ghostVisible && <span style={{ fontSize: '10px', color: '#64748b', marginLeft: '4px' }}>({pb.score} stps record)</span>}
                </button>
              )}

              {/* Chart */}
              <div style={{ height: '240px', marginTop: '12px', backgroundColor: '#0f172a', borderRadius: '12px', padding: '10px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData.slice(-120)} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                    <CartesianGrid stroke="#1e293b" vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="elapsed"
                      stroke="#334155"
                      fontSize={9}
                      tickFormatter={v => `${v}s`}
                      interval="preserveStartEnd"
                    />
                    <YAxis yAxisId="bpm" domain={[40, 210]} stroke="#475569" fontSize={9} tickCount={5} />
                    <YAxis yAxisId="tempo" orientation="right" domain={[0, 300]} stroke="#334155" fontSize={9} tickCount={4} />
                    <Tooltip content={<CustomTooltip />} />

                    {/* HR zones as reference areas */}
                    {zones.map(zone => (
                      <ReferenceArea
                        key={zone.name}
                        yAxisId="bpm"
                        y1={zone.min}
                        y2={Math.min(zone.max, 210)}
                        fill={zone.color}
                        fillOpacity={0.04}
                        stroke="none"
                      />
                    ))}

                    {/* Live BPM */}
                    <Line
                      yAxisId="bpm"
                      type="monotone"
                      dataKey="bpm"
                      name="Hartslag"
                      stroke={bpmColor}
                      strokeWidth={2.5}
                      dot={false}
                      isAnimationActive={false}
                      connectNulls
                    />

                    {/* Live Tempo */}
                    <Line
                      yAxisId="tempo"
                      type="monotone"
                      dataKey="tempo"
                      name="Tempo"
                      stroke="#60a5fa"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                      connectNulls
                      strokeDasharray="4 2"
                    />

                    {/* Ghost BPM */}
                    {ghostVisible && (
                      <Line
                        yAxisId="bpm"
                        type="monotone"
                        dataKey="ghostBpm"
                        name="Ghost BPM"
                        stroke="#a78bfa"
                        strokeWidth={1.5}
                        dot={false}
                        isAnimationActive={false}
                        connectNulls
                        strokeDasharray="6 3"
                        strokeOpacity={0.7}
                      />
                    )}

                    {/* Ghost Steps (mapped to tempo axis so scale is comparable) */}
                    {ghostVisible && (
                      <Line
                        yAxisId="tempo"
                        type="monotone"
                        dataKey="ghostSteps"
                        name="Ghost Stappen"
                        stroke="#c084fc"
                        strokeWidth={1.5}
                        dot={false}
                        isAnimationActive={false}
                        connectNulls
                        strokeDasharray="2 4"
                        strokeOpacity={0.6}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>

                {/* Legend */}
                <div style={{ display: 'flex', gap: '12px', marginTop: '6px', flexWrap: 'wrap', paddingLeft: '4px' }}>
                  {[
                    { color: bpmColor, label: 'Hartslag', dash: false },
                    { color: '#60a5fa', label: 'Tempo (spr/min)', dash: true },
                    ...(ghostVisible ? [
                      { color: '#a78bfa', label: 'Ghost BPM', dash: true },
                      { color: '#c084fc', label: 'Ghost Stappen', dash: true },
                    ] : []),
                  ].map(item => (
                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: '#64748b' }}>
                      <svg width="20" height="6">
                        <line
                          x1="0" y1="3" x2="20" y2="3"
                          stroke={item.color}
                          strokeWidth="2"
                          strokeDasharray={item.dash ? '4 2' : 'none'}
                        />
                      </svg>
                      {item.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const css = {
  page: {
    backgroundColor: '#0f172a',
    minHeight: '100vh',
    color: 'white',
    fontFamily: 'system-ui, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 24px',
    backgroundColor: '#1e293b',
    borderBottom: '1px solid #334155',
    position: 'sticky',
    top: 0,
    zIndex: 50,
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    padding: '4px 0',
  },
  selectionWrap: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '40px 24px',
  },
  selectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '24px',
    color: '#f1f5f9',
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '14px',
  },
  selectCard: {
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '14px',
    padding: '24px 16px',
    color: 'white',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    transition: 'border-color 0.15s, background-color 0.15s',
  },
  selectCardName: {
    fontWeight: '700',
    fontSize: '15px',
    marginBottom: '8px',
    textAlign: 'center',
  },
  skipperGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: '12px',
  },
  skipperCard: {
    borderRadius: '12px',
    padding: '18px 12px',
    border: '2px solid',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    position: 'relative',
    transition: 'all 0.15s',
    color: 'white',
  },
  avatar: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: '#3b82f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '16px',
    flexShrink: 0,
  },
  infoText: {
    textAlign: 'center',
    color: '#475569',
    marginTop: '30px',
  },
  primaryBtn: {
    backgroundColor: '#22c55e',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    padding: '12px 20px',
    fontWeight: '700',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    justifyContent: 'center',
  },

  // Monitoring
  monitorGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
    gap: '20px',
    padding: '20px 24px',
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: '16px',
    padding: '20px',
    border: '1px solid #334155',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px',
    marginBottom: '14px',
  },
  statBox: {
    backgroundColor: '#0f172a',
    borderRadius: '10px',
    padding: '10px 8px',
    textAlign: 'center',
    border: '1px solid #1e293b',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
  },
  statLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    color: '#64748b',
    fontSize: '9px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
  },
  statValue: {
    fontSize: '22px',
    fontWeight: '900',
    lineHeight: 1.1,
  },
  expectedBox: {
    backgroundColor: 'rgba(34, 197, 94, 0.05)',
    border: '1px solid #22c55e33',
    borderRadius: '10px',
    padding: '12px 16px',
    marginBottom: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  ghostToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '8px',
    border: '1px solid',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '600',
    marginBottom: '4px',
    width: '100%',
    justifyContent: 'center',
    transition: 'all 0.15s',
  },
};
