import { useState, useEffect, useRef, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea, Legend
} from 'recharts';
import {
  Heart, Hash, Zap, Timer, Users, CheckCircle2, Trophy,
  Settings, Building2, ChevronRight, Ghost, ArrowLeft, Target,
  ChevronDown, ChevronUp, Wifi, WifiOff
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

const computeRollingTempo = (telemetry, windowMs = 5000) => {
  if (!telemetry || telemetry.length < 2) return 0;
  const arr = Array.isArray(telemetry) ? telemetry : Object.values(telemetry);
  const sorted = [...arr].sort((a, b) => a.time - b.time);
  const now = sorted[sorted.length - 1].time;
  const cutoff = now - windowMs;
  const win = sorted.filter(p => p.time >= cutoff);
  const sample = win.length >= 2 ? win : sorted.slice(-10);
  if (sample.length < 2) return 0;
  const dt = (sample[sample.length - 1].time - sample[0].time) / 1000;
  return dt > 0 ? Math.round(((sample.length - 1) / dt) * 30) : 0;
};

const normaliseTelemetry = (raw) => {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : Object.values(raw);
  return arr.filter(Boolean).sort((a, b) => a.time - b.time);
};

const buildGhostCurve = (recordTelemetry) => {
  const points = normaliseTelemetry(recordTelemetry);
  if (points.length === 0) return [];
  const t0 = points[0].time;
  const map = {};
  points.forEach(p => {
    const sec = Math.floor((p.time - t0) / 1000);
    map[sec] = { ghostBpm: p.heartRate || 0, ghostSteps: p.steps || 0 };
  });
  return map;
};

const calcExpected = (session) => {
  const steps = session?.steps || 0;
  if (!session?.isActive || session?.isFinished) return steps;
  if (!session.startTime) return steps;
  const duration = DISCIPLINE_DURATION[session.discipline] || 30;
  const elapsedSec = (Date.now() - session.startTime) / 1000;
  const remaining = Math.max(0, duration - elapsedSec);
  const telemetry = normaliseTelemetry(session.telemetry);
  const tempo = computeRollingTempo(telemetry);
  if (tempo === 0) return steps;
  const stepsPerSec = tempo / 30;
  return Math.round(steps + remaining * stepsPerSec);
};

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '8px 12px', fontSize: '11px' }}>
      <div style={{ color: '#64748b', marginBottom: '4px' }}>{label}s</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '2px' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: p.color, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ color: '#94a3b8' }}>{p.name}:</span>
          <strong style={{ color: 'white' }}>{typeof p.value === 'number' ? Math.round(p.value) : p.value}</strong>
        </div>
      ))}
    </div>
  );
};

// ─── Skipper Card ─────────────────────────────────────────────────────────────
function SkipperCard({ uid, user, liveData, history, personalBest, ghostCurve, showGhost, onToggleGhost, buildChartData, isMobile, isExpanded, onToggleExpand }) {
  const session = liveData?.session || {};
  const currentBpm = liveData?.bpm || 0;
  const zones = user?.heartrateZones || DEFAULT_ZONES;
  const bpmColor = getZoneColor(currentBpm, zones);
  const hist = history || [];
  const latestPoint = hist[hist.length - 1] || {};
  const currentTempo = latestPoint.tempo || 0;
  const pb = personalBest;
  const ghostVisible = showGhost && ghostCurve && Object.keys(ghostCurve).length > 0;
  const chartData = buildChartData(uid);
  const ghostAtNow = ghostVisible ? (ghostCurve[latestPoint.elapsed] || null) : null;
  const stepDiff = ghostAtNow ? (session.steps || 0) - (ghostAtNow.ghostSteps || 0) : null;
  const disciplineDuration = DISCIPLINE_DURATION[session.discipline] || 30;
  const expectedScore = calcExpected(session);

  const [timerDisplay, setTimerDisplay] = useState('0:00');
  const timerRef = useRef(null);

  useEffect(() => {
    clearInterval(timerRef.current);
    if (session.isActive && session.startTime) {
      const tick = () => {
        const elapsed = Math.floor((Date.now() - session.startTime) / 1000);
        const remaining = disciplineDuration - elapsed;
        const abs = Math.abs(remaining);
        const m = Math.floor(abs / 60);
        const s = abs % 60;
        setTimerDisplay(`${remaining < 0 ? '+' : ''}${m}:${s.toString().padStart(2, '0')}`);
      };
      tick();
      timerRef.current = setInterval(tick, 200);
    } else if (session.isFinished && session.startTime && session.lastStepTime) {
      const elapsed = Math.floor((session.lastStepTime - session.startTime) / 1000);
      const remaining = disciplineDuration - elapsed;
      const abs = Math.abs(remaining);
      const m = Math.floor(abs / 60);
      const s = abs % 60;
      setTimerDisplay(`${remaining < 0 ? '+' : ''}${m}:${s.toString().padStart(2, '0')}`);
    } else {
      setTimerDisplay('0:00');
    }
    return () => clearInterval(timerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.isActive, session.isFinished, session.startTime, session.lastStepTime, session.discipline]);

  const statusColor = session.isActive ? '#22c55e' : session.isFinished ? '#60a5fa' : '#475569';
  const statusLabel = session.isActive ? 'LIVE' : session.isFinished ? 'KLAAR' : 'WACHT';

  // Mobile collapsed view — compact row
  if (isMobile && !isExpanded) {
    return (
      <div style={css.mobileCardCollapsed} onClick={onToggleExpand}>
        {/* Left: avatar + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
          <div style={{
            ...css.avatar,
            width: '38px', height: '38px', fontSize: '13px',
            backgroundColor: bpmColor + '33', border: `1.5px solid ${bpmColor}66`,
            flexShrink: 0
          }}>
            {(user?.firstName?.[0] || '?')}{user?.lastName?.[0] || ''}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: '700', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.firstName} {user?.lastName}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>
              {session.discipline || '---'} · {session.sessionType || 'Training'}
            </div>
          </div>
        </div>

        {/* Middle stats */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: '900', color: bpmColor, lineHeight: 1 }}>
              {currentBpm || '--'}
            </div>
            <div style={{ fontSize: '9px', color: '#475569' }}>BPM</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: '900', color: '#60a5fa', lineHeight: 1 }}>
              {session.steps || 0}
            </div>
            <div style={{ fontSize: '9px', color: '#475569' }}>stps</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: statusColor, fontFamily: 'monospace' }}>
              {timerDisplay}
            </div>
            <div style={{ fontSize: '9px', color: statusColor, fontWeight: '600' }}>
              {session.isActive ? '● ' : '○ '}{statusLabel}
            </div>
          </div>
        </div>

        {/* Expand arrow */}
        <ChevronDown size={16} color="#475569" style={{ flexShrink: 0, marginLeft: '6px' }} />
      </div>
    );
  }

  // Full card (desktop or mobile expanded)
  return (
    <div style={{ ...css.card, ...(isMobile ? css.mobileCard : {}) }}>
      {/* Mobile: collapse button */}
      {isMobile && (
        <button style={css.collapseBtn} onClick={onToggleExpand}>
          <ChevronUp size={14} /> Inklappen
        </button>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
          <div style={{ ...css.avatar, width: '40px', height: '40px', fontSize: '13px', backgroundColor: bpmColor + '33', border: `1.5px solid ${bpmColor}66`, flexShrink: 0 }}>
            {(user?.firstName?.[0] || '?')}{user?.lastName?.[0] || ''}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: '800', fontSize: isMobile ? '16px' : '18px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.firstName} {user?.lastName}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', color: '#facc15', fontWeight: '600' }}>
                {session.discipline || '---'} · {session.sessionType || 'Training'}
              </span>
              {pb && (
                <span style={{ fontSize: '11px', color: '#a78bfa', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <Trophy size={10} color="#a78bfa" /> PB {pb.score} stps
                </span>
              )}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#60a5fa', fontWeight: '700', fontSize: isMobile ? '15px' : '18px', fontFamily: 'monospace' }}>
            <Timer size={13} color="#60a5fa" /> {timerDisplay}
          </div>
          <div style={{ fontSize: '10px', marginTop: '2px', fontWeight: '700', color: statusColor }}>
            {session.isActive ? '● LIVE' : session.isFinished ? '✓ KLAAR' : '○ WACHT'}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.6fr', gap: '6px', marginBottom: '10px' }}>
        <div style={css.statBox}>
          <div style={css.statLabel}><Heart size={10} fill={bpmColor} color={bpmColor} /> Hartslag</div>
          <div style={{ ...css.statValue, color: bpmColor, fontSize: isMobile ? '20px' : '22px' }}>{currentBpm || '--'}</div>
          <div style={{ fontSize: '9px', color: '#475569' }}>BPM</div>
        </div>

        <div style={css.statBox}>
          <div style={css.statLabel}><Hash size={10} /> Stappen</div>
          <div style={{ ...css.statValue, color: '#60a5fa', fontSize: isMobile ? '20px' : '22px' }}>{session.steps || 0}</div>
          <div style={{ fontSize: '9px', fontWeight: stepDiff !== null ? '700' : '400', color: stepDiff !== null ? (stepDiff >= 0 ? '#22c55e' : '#ef4444') : '#475569' }}>
            {stepDiff !== null ? `${stepDiff >= 0 ? '+' : ''}${stepDiff} ghost` : 'totaal'}
          </div>
        </div>

        <div style={{ ...css.statBox, flexDirection: 'row', padding: '7px', alignItems: 'stretch' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid #1e293b', paddingRight: '5px' }}>
            <div style={css.statLabel}><Zap size={10} color="#22c55e" /> Tempo</div>
            <div style={{ ...css.statValue, color: '#22c55e', fontSize: '18px' }}>{currentTempo || '--'}</div>
            <div style={{ fontSize: '9px', color: '#475569' }}>stps/30s</div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingLeft: '5px' }}>
            <div style={css.statLabel}><Target size={10} color="#34d399" /> Verwacht</div>
            <div style={{ ...css.statValue, color: '#34d399', fontSize: '18px' }}>{session.isActive ? expectedScore : '--'}</div>
            <div style={{ fontSize: '9px', fontWeight: '600', color: pb && session.isActive ? (expectedScore > pb.score ? '#22c55e' : expectedScore < pb.score ? '#ef4444' : '#475569') : '#475569' }}>
              {pb && session.isActive ? (expectedScore > pb.score ? `+${expectedScore - pb.score} 🔥` : expectedScore < pb.score ? `${expectedScore - pb.score}` : '= PB') : 'stappen'}
            </div>
          </div>
        </div>
      </div>

      {/* Ghost toggle */}
      {pb?.telemetry && Object.keys(ghostCurve || {}).length > 1 && (
        <button
          style={{
            ...css.ghostToggle,
            backgroundColor: ghostVisible ? '#7c3aed22' : '#0f172a',
            borderColor: ghostVisible ? '#7c3aed' : '#334155',
            color: ghostVisible ? '#a78bfa' : '#475569',
          }}
          onClick={onToggleGhost}
        >
          <Ghost size={12} />
          {ghostVisible ? 'Ghost actief' : 'Ghost tonen'}
          {ghostVisible && pb && <span style={{ fontSize: '10px', color: '#64748b', marginLeft: '4px' }}>({pb.score} stps)</span>}
        </button>
      )}

      {/* Chart */}
      <div style={{ height: isMobile ? '200px' : '260px', marginTop: '8px', backgroundColor: '#0f172a', borderRadius: '10px', padding: '8px 6px 4px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 2, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="#1e293b" vertical={true} strokeDasharray="3 3" />
            <XAxis
              dataKey="elapsed"
              stroke="#334155"
              fontSize={8}
              type="number"
              domain={[0, disciplineDuration]}
              tickCount={disciplineDuration <= 30 ? 5 : 7}
              tickFormatter={v => `${v}s`}
              allowDataOverflow
            />
            <YAxis yAxisId="bpm" domain={[40, 210]} stroke="#475569" fontSize={8} tickCount={4} width={24} />
            <YAxis
              yAxisId="steps"
              orientation="right"
              domain={[0, pb ? Math.max(pb.score + 10, (session.steps || 0) + 10) : 'auto']}
              stroke="#334155"
              fontSize={8}
              tickCount={4}
              width={26}
            />
            <Tooltip content={<CustomTooltip />} />
            {zones.map(zone => (
              <ReferenceArea key={zone.name} yAxisId="bpm" y1={zone.min} y2={Math.min(zone.max, 210)} fill={zone.color} fillOpacity={0.04} stroke="none" />
            ))}
            {ghostVisible && (
              <Line yAxisId="steps" type="monotone" dataKey="ghostSteps" name="Ghost Stappen"
                stroke="#7c3aed" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls strokeDasharray="5 3" strokeOpacity={0.75} />
            )}
            <Line yAxisId="steps" type="monotone" dataKey="steps" name="Stappen"
              stroke="#60a5fa" strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls />
            {ghostVisible && (
              <Line yAxisId="bpm" type="monotone" dataKey="ghostBpm" name="Ghost BPM"
                stroke="#a78bfa" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls strokeDasharray="6 3" strokeOpacity={0.65} />
            )}
            <Line yAxisId="bpm" type="monotone" dataKey="bpm" name="Hartslag"
              stroke={bpmColor} strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls />
            <Line yAxisId="steps" type="monotone" dataKey="tempo" name="Tempo/30s"
              stroke="#22c55e" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls strokeDasharray="3 3" strokeOpacity={0.7} />
          </LineChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '3px', flexWrap: 'wrap', paddingLeft: '2px' }}>
          {[
            { color: bpmColor,  label: 'BPM',      dash: false },
            { color: '#60a5fa', label: 'Stappen',   dash: false },
            { color: '#22c55e', label: 'Tempo',     dash: true  },
            ...(ghostVisible ? [
              { color: '#a78bfa', label: 'G.BPM',   dash: true },
              { color: '#7c3aed', label: 'G.Stps',  dash: true },
            ] : []),
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '9px', color: '#64748b' }}>
              <svg width="14" height="5">
                <line x1="0" y1="2.5" x2="14" y2="2.5" stroke={item.color} strokeWidth="2" strokeDasharray={item.dash ? '4 2' : 'none'} />
              </svg>
              {item.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ════════════════════════════════════════════════════════════════════════════
export default function Dashboard() {
  const [view, setView] = useState('select-club');
  const [clubs, setClubs] = useState([]);
  const [groups, setGroups] = useState([]);
  const [groupMembers, setGroupMembers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedClub, setSelectedClub] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedSkipperIds, setSelectedSkipperIds] = useState([]);

  const [liveSessions, setLiveSessions] = useState({});
  const liveRef = useRef({});

  const [history, setHistory] = useState({});
  const [personalBests, setPersonalBests] = useState({});
  const [ghostCurves, setGhostCurves] = useState({});
  const [showGhost, setShowGhost] = useState({});

  // Mobile: which skipper card is expanded
  const [expandedSkipper, setExpandedSkipper] = useState(null);

  // Detect mobile
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const u1 = ClubFactory.getAll(setClubs);
    const u2 = UserFactory.getAll(setAllUsers);
    return () => { u1(); u2(); };
  }, []);

  useEffect(() => {
    if (!selectedClub) return;
    const u = GroupFactory.getGroupsByClub(selectedClub.id, setGroups);
    return () => u();
  }, [selectedClub]);

  useEffect(() => {
    if (!selectedClub || !selectedGroup) return;
    const u = GroupFactory.getMembersByGroup(selectedClub.id, selectedGroup.id, setGroupMembers);
    return () => u();
  }, [selectedClub, selectedGroup]);

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

  const loadPersonalBest = useCallback(async (uid, discipline, sessionType) => {
    if (!uid || !discipline) return;
    const rec = await UserFactory.getBestRecord(uid, discipline, sessionType || 'Training');
    if (!rec) return;
    setPersonalBests(prev => ({ ...prev, [uid]: rec }));
    const ghost = buildGhostCurve(rec.telemetry);
    setGhostCurves(prev => ({ ...prev, [uid]: ghost }));
    if (rec.telemetry && Object.keys(ghost).length > 1) {
      setShowGhost(prev => ({ ...prev, [uid]: true }));
    }
  }, []);

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

  const sessionStartRef = useRef({});
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setHistory(prev => {
        const next = { ...prev };
        selectedSkipperIds.forEach(uid => {
          const liveData = liveRef.current[uid] || {};
          const session = liveData.session;
          if (!session?.isActive && !session?.isFinished) return;
          const lastStartTime = sessionStartRef.current[uid];
          if (session.startTime && session.startTime !== lastStartTime) {
            sessionStartRef.current[uid] = session.startTime;
            next[uid] = [];
          }
          const elapsed = session.startTime ? Math.floor((now - session.startTime) / 1000) : 0;
          const rtdbTelemetry = normaliseTelemetry(session.telemetry);
          const tempo = computeRollingTempo(rtdbTelemetry);
          const point = { elapsed, bpm: liveData.bpm || 0, steps: session.steps || 0, tempo };
          if (!next[uid]) next[uid] = [];
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

  const buildChartData = (uid) => {
    const hist = history[uid] || [];
    const ghost = ghostCurves[uid] || {};
    const ghostVisible = showGhost[uid] && Object.keys(ghost).length > 0;
    return hist.map(point => {
      const g = ghostVisible ? (ghost[point.elapsed] || null) : null;
      return { ...point, ghostBpm: g?.ghostBpm ?? null, ghostSteps: g?.ghostSteps ?? null };
    });
  };

  const getUser = (uid) => allUsers.find(u => u.id === uid) || {};

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

  // ── Selection screens (club / group / skippers) ──────────────────────────────
  if (view === 'select-club') {
    return (
      <div style={css.page}>
        <style>{responsiveCSS}</style>
        <div style={css.selectionWrap}>
          <div style={css.selectionHeader}>
            <Building2 size={20} color="#3b82f6" />
            <h2 style={{ margin: 0, fontSize: isMobile ? '18px' : '22px' }}>Selecteer Club</h2>
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
                <Building2 size={28} color="#3b82f6" style={{ marginBottom: '8px' }} />
                <div style={css.selectCardName}>{club.name}</div>
                <ChevronRight size={14} color="#475569" />
              </button>
            ))}
          </div>
          {clubs.length === 0 && <p style={css.infoText}>Geen clubs gevonden.</p>}
        </div>
      </div>
    );
  }

  if (view === 'select-group') {
    return (
      <div style={css.page}>
        <style>{responsiveCSS}</style>
        <div style={css.selectionWrap}>
          <button style={css.backBtn} onClick={() => setView('select-club')}>
            <ArrowLeft size={15} /> Terug naar clubs
          </button>
          <div style={css.selectionHeader}>
            <Users size={20} color="#3b82f6" />
            <h2 style={{ margin: 0, fontSize: isMobile ? '16px' : '20px' }}>{selectedClub?.name} — Groep</h2>
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
                <Users size={28} color="#22c55e" style={{ marginBottom: '8px' }} />
                <div style={css.selectCardName}>{group.name}</div>
                <ChevronRight size={14} color="#475569" />
              </button>
            ))}
          </div>
          {groups.length === 0 && <p style={css.infoText}>Geen groepen gevonden.</p>}
        </div>
      </div>
    );
  }

  if (view === 'select-skippers') {
    return (
      <div style={css.page}>
        <style>{responsiveCSS}</style>
        <div style={css.selectionWrap}>
          <button style={css.backBtn} onClick={() => setView('select-group')}>
            <ArrowLeft size={15} /> Terug naar groepen
          </button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={css.selectionHeader}>
              <Trophy size={20} color="#facc15" />
              <h2 style={{ margin: 0, fontSize: isMobile ? '15px' : '18px' }}>
                {selectedGroup?.name} ({selectedSkipperIds.length}/4)
              </h2>
            </div>
            <button
              disabled={selectedSkipperIds.length === 0}
              onClick={() => { setExpandedSkipper(null); setView('monitoring'); }}
              style={{ ...css.primaryBtn, opacity: selectedSkipperIds.length === 0 ? 0.4 : 1, width: 'auto', padding: '10px 20px' }}
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
                  {isSelected && <CheckCircle2 style={{ position: 'absolute', top: 8, right: 8, color: '#3b82f6' }} size={16} />}
                  <div style={{ ...css.avatar, backgroundColor: isSelected ? '#3b82f6' : '#334155', width: '44px', height: '44px' }}>
                    {(skipper.firstName?.[0] || '?')}{skipper.lastName?.[0] || ''}
                  </div>
                  <div style={{ fontWeight: '600', marginTop: '8px', fontSize: '13px' }}>{skipper.firstName} {skipper.lastName}</div>
                  <div style={{ fontSize: '11px', color: isOnline ? '#22c55e' : '#475569', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {isOnline ? <Wifi size={10} /> : <WifiOff size={10} />}
                    {isOnline ? `${liveData?.bpm || '--'} BPM` : 'Offline'}
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

  // ── Monitoring view ───────────────────────────────────────────────────────────
  return (
    <div style={css.page}>
      <style>{responsiveCSS}</style>

      {/* Header */}
      <div style={css.header}>
        <button style={css.backBtn} onClick={() => setView('select-skippers')}>
          <ArrowLeft size={15} /> {isMobile ? 'Terug' : 'Wijzig selectie'}
        </button>
        <h1 style={{ margin: 0, fontSize: isMobile ? '14px' : '18px', fontWeight: '800', color: '#f1f5f9', textAlign: 'center' }}>
          {isMobile ? 'MONITORING' : 'SPEED MONITORING LIVE'}
        </h1>
        <div style={{ fontSize: '11px', color: '#475569', textAlign: 'right', display: isMobile ? 'none' : 'block' }}>
          {selectedClub?.name} · {selectedGroup?.name}
        </div>
      </div>

      {/* Skipper cards */}
      {isMobile ? (
        // Mobile: stacked list with collapse/expand
        <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '24px' }}>
          {selectedSkipperIds.map(uid => {
            const isExpanded = expandedSkipper === uid;
            return (
              <SkipperCard
                key={uid}
                uid={uid}
                user={getUser(uid)}
                liveData={liveSessions[uid] || {}}
                history={history[uid] || []}
                personalBest={personalBests[uid] || null}
                ghostCurve={ghostCurves[uid] || {}}
                showGhost={showGhost[uid] || false}
                onToggleGhost={() => setShowGhost(prev => ({ ...prev, [uid]: !prev[uid] }))}
                buildChartData={buildChartData}
                isMobile={true}
                isExpanded={isExpanded}
                onToggleExpand={() => setExpandedSkipper(isExpanded ? null : uid)}
              />
            );
          })}
        </div>
      ) : (
        // Desktop: grid
        <div style={css.monitorGrid}>
          {selectedSkipperIds.map(uid => (
            <SkipperCard
              key={uid}
              uid={uid}
              user={getUser(uid)}
              liveData={liveSessions[uid] || {}}
              history={history[uid] || []}
              personalBest={personalBests[uid] || null}
              ghostCurve={ghostCurves[uid] || {}}
              showGhost={showGhost[uid] || false}
              onToggleGhost={() => setShowGhost(prev => ({ ...prev, [uid]: !prev[uid] }))}
              buildChartData={buildChartData}
              isMobile={false}
              isExpanded={true}
              onToggleExpand={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Responsive CSS ────────────────────────────────────────────────────────────
const responsiveCSS = `
  * { box-sizing: border-box; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
`;

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
    padding: '12px 16px',
    backgroundColor: '#1e293b',
    borderBottom: '1px solid #334155',
    position: 'sticky',
    top: 0,
    zIndex: 50,
    gap: '8px',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '13px',
    padding: '4px 0',
    flexShrink: 0,
  },
  selectionWrap: {
    maxWidth: '700px',
    margin: '0 auto',
    padding: '24px 16px',
  },
  selectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '20px',
    color: '#f1f5f9',
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: '12px',
  },
  selectCard: {
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '12px',
    padding: '20px 12px',
    color: 'white',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  selectCardName: {
    fontWeight: '700',
    fontSize: '14px',
    marginBottom: '6px',
    textAlign: 'center',
  },
  skipperGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
    gap: '10px',
  },
  skipperCard: {
    borderRadius: '10px',
    padding: '14px 10px',
    border: '2px solid',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    position: 'relative',
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
    fontSize: '15px',
    flexShrink: 0,
  },
  infoText: {
    textAlign: 'center',
    color: '#475569',
    marginTop: '24px',
  },
  primaryBtn: {
    backgroundColor: '#22c55e',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 16px',
    fontWeight: '700',
    cursor: 'pointer',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    justifyContent: 'center',
  },

  // Monitoring
  monitorGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))',
    gap: '16px',
    padding: '16px',
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: '14px',
    padding: '16px',
    border: '1px solid #334155',
  },
  mobileCard: {
    borderRadius: '12px',
    padding: '14px',
  },
  mobileCardCollapsed: {
    backgroundColor: '#1e293b',
    borderRadius: '12px',
    padding: '12px 14px',
    border: '1px solid #334155',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
    width: '100%',
  },
  collapseBtn: {
    background: 'none',
    border: 'none',
    color: '#475569',
    cursor: 'pointer',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '0 0 8px 0',
    marginBottom: '4px',
    borderBottom: '1px solid #1e293b',
    width: '100%',
  },
  statBox: {
    backgroundColor: '#0f172a',
    borderRadius: '8px',
    padding: '8px 6px',
    textAlign: 'center',
    border: '1px solid #1e293b',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1px',
  },
  statLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    color: '#64748b',
    fontSize: '8px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
  },
  statValue: {
    fontSize: '22px',
    fontWeight: '900',
    lineHeight: 1.1,
  },
  ghostToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '5px 10px',
    borderRadius: '7px',
    border: '1px solid',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: '600',
    marginBottom: '4px',
    width: '100%',
    justifyContent: 'center',
  },
};
