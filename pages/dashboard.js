import { useState, useEffect, useRef, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea, Legend
} from 'recharts';
import {
  Heart, Hash, Zap, Timer, Users, CheckCircle2, Trophy,
  Settings, Building2, ChevronRight, Ghost, ArrowLeft, Target,
  ChevronDown, ChevronUp, Wifi, WifiOff, SkipForward,
} from 'lucide-react';

import {
  UserFactory, LiveSessionFactory, ClubFactory, GroupFactory,
  ClubMemberFactory, UserMemberLinkFactory,
} from '../constants/dbSchema';

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_ZONES = [
  { name: 'Warm-up',   min: 0,   max: 120, color: '#94a3b8' },
  { name: 'Fat Burn',  min: 120, max: 145, color: '#22c55e' },
  { name: 'Aerobic',   min: 145, max: 165, color: '#facc15' },
  { name: 'Anaerobic', min: 165, max: 185, color: '#f97316' },
  { name: 'Red Line',  min: 185, max: 250, color: '#ef4444' },
];

const DISCIPLINE_DURATION = { '30sec': 30, '2min': 120, '3min': 180 };

const COOKIE_KEY = 'msc_uid';
const getCookie = () => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`));
  return match ? match[1] : null;
};

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
  if (points.length === 0) return {};
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

// ─── Relay Session View (shown inside SkipperCard when relay is active) ───────
//
// Replaces the normal step/BPM stats + chart when liveData.relaySession is present.
// Shows:
//   • Total team steps (prominent)
//   • Current skipper name + BPM
//   • Per-skipper progress list (current highlighted, others informational)
//
function RelaySessionView({ relaySession, currentBpm, zones, isMobile }) {
  const bpmColor = getZoneColor(currentBpm, zones);
  const {
    totalSteps          = 0,
    currentSkipperName  = '—',
    currentSkipperIndex = 0,
    skipperCount        = 1,
    results             = [],
    isFinished          = false,
  } = relaySession;

  return (
    <div>
      {/* Status pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
        <span style={{ padding: '3px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: '700', backgroundColor: isFinished ? '#22c55e22' : '#3b82f622', color: isFinished ? '#22c55e' : '#60a5fa', border: `1px solid ${isFinished ? '#22c55e44' : '#3b82f644'}` }}>
          {isFinished ? '✓ KLAAR' : '● RELAY ACTIEF'}
        </span>
        <span style={{ fontSize: '11px', color: '#475569' }}>
          Skipper {currentSkipperIndex + 1} / {skipperCount}
        </span>
      </div>

      {/* Total steps — main focus */}
      <div style={{ backgroundColor: '#0f172a', borderRadius: '10px', padding: '14px 16px', marginBottom: '12px', border: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '10px', color: '#475569', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>Teamtotaal</div>
          <div style={{ fontSize: isMobile ? '32px' : '38px', fontWeight: '900', color: '#22c55e', lineHeight: 1 }}>
            {totalSteps}
          </div>
          <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>stappen</div>
        </div>

        {/* Current skipper BPM */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '10px', color: '#475569', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>
            {currentSkipperName.split(' ')[0]}
          </div>
          <div style={{ fontSize: '26px', fontWeight: '900', color: bpmColor, lineHeight: 1, fontFamily: 'monospace' }}>
            {currentBpm > 0 ? currentBpm : '—'}
          </div>
          <div style={{ fontSize: '10px', color: bpmColor, marginTop: '2px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
            <Heart size={9} fill={currentBpm > 0 ? bpmColor : 'none'} color={bpmColor} /> BPM
          </div>
        </div>
      </div>

      {/* Per-skipper progress rows */}
      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {results.map((r, idx) => {
            const isCurrent = idx === currentSkipperIndex && !isFinished;
            const isDone    = isFinished ? true : idx < currentSkipperIndex;
            return (
              <div key={idx} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '7px 10px', borderRadius: '7px',
                backgroundColor: isCurrent ? '#1e3a5f' : '#0f172a',
                border: `1px solid ${isCurrent ? '#3b82f688' : isDone ? '#22c55e22' : '#1e293b'}`,
                opacity: !isCurrent && !isDone ? 0.45 : 1,
              }}>
                <div style={{
                  width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                  backgroundColor: isCurrent ? '#3b82f6' : isDone ? '#22c55e' : '#334155',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '9px', fontWeight: '700', color: 'white',
                }}>
                  {isDone ? '✓' : idx + 1}
                </div>
                <div style={{ flex: 1, fontSize: '12px', color: isCurrent ? '#f1f5f9' : '#64748b', fontWeight: isCurrent ? '600' : '400', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.name || `Skipper ${idx + 1}`}
                </div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: isCurrent ? '#60a5fa' : isDone ? '#22c55e' : '#334155' }}>
                  {r.steps ?? '—'}
                </div>
                {isCurrent && (
                  <div style={{ fontSize: '8px', fontWeight: '800', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.4px', flexShrink: 0 }}>
                    NU
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Skipper Card ─────────────────────────────────────────────────────────────
function SkipperCard({
  uid, member, liveData, history, personalBest,
  ghostCurve, showGhost, onToggleGhost, buildChartData,
  isMobile, isExpanded, onToggleExpand,
}) {
  const session     = liveData?.session || {};
  const currentBpm  = liveData?.bpm || 0;
  const relaySession = liveData?.relaySession || null;
  const isRelay      = !!(relaySession && (relaySession.isActive || relaySession.isFinished));

  const zones    = DEFAULT_ZONES;
  const bpmColor = getZoneColor(currentBpm, zones);
  const hist     = history || [];
  const latestPoint = hist[hist.length - 1] || {};
  const currentTempo = latestPoint.tempo || 0;
  const pb = personalBest;
  const ghostVisible = showGhost && ghostCurve && Object.keys(ghostCurve).length > 0;
  const chartData = buildChartData(uid);
  const ghostAtNow = ghostVisible ? (ghostCurve[latestPoint.elapsed] || null) : null;
  const stepDiff = ghostAtNow ? (session.steps || 0) - (ghostAtNow.ghostSteps || 0) : null;
  const disciplineDuration = DISCIPLINE_DURATION[session.discipline] || 30;
  const expectedScore = calcExpected(session);

  const displayName = member
    ? `${member.firstName || ''} ${member.lastName || ''}`.trim()
    : uid || '?';
  const initials = member
    ? `${member.firstName?.[0] || '?'}${member.lastName?.[0] || ''}`
    : '??';

  const [timerDisplay, setTimerDisplay] = useState('0:00');
  const timerRef = useRef(null);

  useEffect(() => {
    clearInterval(timerRef.current);
    if (isRelay) { setTimerDisplay('—'); return; } // relay has its own timing in counter
    if (session.isActive && session.startTime) {
      const tick = () => {
        const elapsed = Math.floor((Date.now() - session.startTime) / 1000);
        const remaining = disciplineDuration - elapsed;
        const abs = Math.abs(remaining);
        const m = Math.floor(abs / 60);
        const sc = abs % 60;
        setTimerDisplay(`${remaining < 0 ? '+' : ''}${m}:${sc.toString().padStart(2, '0')}`);
      };
      tick();
      timerRef.current = setInterval(tick, 200);
    } else if (session.isFinished && session.startTime && session.lastStepTime) {
      const elapsed = Math.floor((session.lastStepTime - session.startTime) / 1000);
      const remaining = disciplineDuration - elapsed;
      const abs = Math.abs(remaining);
      const m = Math.floor(abs / 60);
      const sc = abs % 60;
      setTimerDisplay(`${remaining < 0 ? '+' : ''}${m}:${sc.toString().padStart(2, '0')}`);
    } else {
      setTimerDisplay('0:00');
    }
    return () => clearInterval(timerRef.current);
  }, [session.isActive, session.isFinished, session.startTime, session.lastStepTime, session.discipline, isRelay]);

  const statusColor = isRelay
    ? (relaySession?.isFinished ? '#22c55e' : '#3b82f6')
    : session.isActive ? '#22c55e' : session.isFinished ? '#60a5fa' : '#475569';

  // ── Mobile collapsed view ──────────────────────────────────────────────────
  if (isMobile && !isExpanded) {
    const collapsedSteps = isRelay ? (relaySession?.totalSteps ?? 0) : (session.steps || 0);
    const collapsedLabel = isRelay ? 'totaal' : 'stps';
    return (
      <div style={css.mobileCardCollapsed} onClick={onToggleExpand}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
          <div style={{
            ...css.avatar,
            width: '38px', height: '38px', fontSize: '13px',
            backgroundColor: bpmColor + '33', border: `1.5px solid ${bpmColor}66`,
            flexShrink: 0,
          }}>
            {initials.toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: '700', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {displayName}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>
              {isRelay
                ? `🔄 Relay · ${relaySession?.currentSkipperName?.split(' ')[0] || '—'}`
                : `${session.discipline || '---'} · ${session.sessionType || 'Training'}`}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: '900', color: bpmColor, lineHeight: 1 }}>{currentBpm || '--'}</div>
            <div style={{ fontSize: '9px', color: '#475569' }}>BPM</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: '900', color: isRelay ? '#22c55e' : '#60a5fa', lineHeight: 1 }}>{collapsedSteps}</div>
            <div style={{ fontSize: '9px', color: '#475569' }}>{collapsedLabel}</div>
          </div>
          {!isRelay && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: statusColor, fontFamily: 'monospace' }}>{timerDisplay}</div>
              <div style={{ fontSize: '9px', color: statusColor, fontWeight: '600' }}>
                {session.isActive ? '● LIVE' : session.isFinished ? '✓ KLAAR' : '○ WACHT'}
              </div>
            </div>
          )}
        </div>
        <ChevronDown size={16} color="#475569" style={{ flexShrink: 0, marginLeft: '6px' }} />
      </div>
    );
  }

  // ── Full card ──────────────────────────────────────────────────────────────
  return (
    <div style={{ ...css.card, ...(isMobile ? css.mobileCard : {}) }}>
      {isMobile && (
        <button style={css.collapseBtn} onClick={onToggleExpand}>
          <ChevronUp size={14} /> Inklappen
        </button>
      )}

      {/* Card header — always shown */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
          <div style={{ ...css.avatar, width: '40px', height: '40px', fontSize: '13px', backgroundColor: bpmColor + '33', border: `1.5px solid ${bpmColor}66`, flexShrink: 0 }}>
            {initials.toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: '800', fontSize: isMobile ? '16px' : '18px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {displayName}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
              {isRelay ? (
                <span style={{ fontSize: '11px', color: '#3b82f6', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  🔄 Relay · {relaySession?.currentSkipperName || '—'}
                </span>
              ) : (
                <span style={{ fontSize: '11px', color: '#facc15', fontWeight: '600' }}>
                  {session.discipline || '---'} · {session.sessionType || 'Training'}
                </span>
              )}
              {pb && !isRelay && (
                <span style={{ fontSize: '11px', color: '#a78bfa', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <Trophy size={10} color="#a78bfa" /> PB {pb.score} stps
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Timer / status — only for individual sessions */}
        {!isRelay && (
          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#60a5fa', fontWeight: '700', fontSize: isMobile ? '15px' : '18px', fontFamily: 'monospace' }}>
              <Timer size={13} color="#60a5fa" /> {timerDisplay}
            </div>
            <div style={{ fontSize: '10px', marginTop: '2px', fontWeight: '700', color: statusColor }}>
              {session.isActive ? '● LIVE' : session.isFinished ? '✓ KLAAR' : '○ WACHT'}
            </div>
          </div>
        )}
      </div>

      {/* ── RELAY view — replaces normal stats + chart ── */}
      {isRelay && (
        <RelaySessionView
          relaySession={relaySession}
          currentBpm={currentBpm}
          zones={zones}
          isMobile={isMobile}
        />
      )}

      {/* ── INDIVIDUAL view — normal stats + chart ── */}
      {!isRelay && (
        <>
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
                <XAxis dataKey="elapsed" stroke="#334155" fontSize={8} type="number" domain={[0, disciplineDuration]} tickCount={disciplineDuration <= 30 ? 5 : 7} tickFormatter={v => `${v}s`} allowDataOverflow />
                <YAxis yAxisId="bpm" domain={[40, 210]} stroke="#475569" fontSize={8} tickCount={4} width={24} />
                <YAxis yAxisId="steps" orientation="right" domain={[0, pb ? Math.max(pb.score + 10, (session.steps || 0) + 10) : 'auto']} stroke="#334155" fontSize={8} tickCount={4} width={26} />
                <Tooltip content={<CustomTooltip />} />
                {zones.map(zone => (
                  <ReferenceArea key={zone.name} yAxisId="bpm" y1={zone.min} y2={Math.min(zone.max, 210)} fill={zone.color} fillOpacity={0.04} stroke="none" />
                ))}
                {ghostVisible && (
                  <Line yAxisId="steps" type="monotone" dataKey="ghostSteps" name="Ghost Stappen" stroke="#7c3aed" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls strokeDasharray="5 3" strokeOpacity={0.75} />
                )}
                <Line yAxisId="steps" type="monotone" dataKey="steps" name="Stappen" stroke="#60a5fa" strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls />
                {ghostVisible && (
                  <Line yAxisId="bpm" type="monotone" dataKey="ghostBpm" name="Ghost BPM" stroke="#a78bfa" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls strokeDasharray="6 3" strokeOpacity={0.65} />
                )}
                <Line yAxisId="bpm" type="monotone" dataKey="bpm" name="Hartslag" stroke={bpmColor} strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls />
                <Line yAxisId="steps" type="monotone" dataKey="tempo" name="Tempo/30s" stroke="#22c55e" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls strokeDasharray="3 3" strokeOpacity={0.7} />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: '8px', marginTop: '3px', flexWrap: 'wrap', paddingLeft: '2px' }}>
              {[
                { color: bpmColor,  label: 'BPM',    dash: false },
                { color: '#60a5fa', label: 'Stappen', dash: false },
                { color: '#22c55e', label: 'Tempo',   dash: true  },
                ...(ghostVisible ? [
                  { color: '#a78bfa', label: 'G.BPM',  dash: true },
                  { color: '#7c3aed', label: 'G.Stps', dash: true },
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
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ════════════════════════════════════════════════════════════════════════════
export default function Dashboard() {
  const [currentUser,   setCurrentUser]   = useState(null);
  const isSuperAdminRef = useRef(false);
  const isClubAdminRef  = useRef(false);

  const [bootstrapDone, setBootstrapDone] = useState(false);
  const [memberClubs,  setMemberClubs]  = useState([]);
  const [memberGroups, setMemberGroups] = useState([]);
  const [selectedClubId,  setSelectedClubId]  = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');

  const selectedClub  = memberClubs.find(c => c.id === selectedClubId)  || null;
  const selectedGroup = memberGroups.find(g => g.id === selectedGroupId) || null;

  const [groupMembers,        setGroupMembers]        = useState([]);
  const [clubMemberProfiles,  setClubMemberProfiles]  = useState([]);
  const [memberUidMap,        setMemberUidMap]        = useState({});

  const [selectedSkipperMemberIds, setSelectedSkipperMemberIds] = useState([]);
  const [selectedSkipperUids,      setSelectedSkipperUids]      = useState([]);

  const [liveSessions, setLiveSessions] = useState({});
  const liveRef = useRef({});
  const [history,       setHistory]       = useState({});
  const [personalBests, setPersonalBests] = useState({});
  const [ghostCurves,   setGhostCurves]   = useState({});
  const [showGhost,     setShowGhost]     = useState({});

  const [view,            setView]            = useState('selection');
  const [expandedSkipper, setExpandedSkipper] = useState(null);
  const [isMobile,        setIsMobile]        = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const uid = getCookie();
    if (!uid) { setBootstrapDone(true); return; }
    let unsubClubs = () => {};
    let cancelled  = false;

    const bootstrap = async () => {
      const snap = await UserFactory.get(uid);
      if (!snap.exists() || cancelled) { setBootstrapDone(true); return; }
      const user = { id: uid, ...snap.data() };
      setCurrentUser(user);

      if (user.role === 'superadmin') {
        isSuperAdminRef.current = true;
        unsubClubs = ClubFactory.getAll((clubs) => {
          if (cancelled || clubs.length === 0) return;
          setMemberClubs(clubs);
          setBootstrapDone(true);
        });
        return;
      }
      if (user.role === 'clubadmin') {
        isClubAdminRef.current = true;
        unsubClubs = UserMemberLinkFactory.getForUser(uid, async (profiles) => {
          if (cancelled) return;
          if (profiles.length === 0) { setBootstrapDone(true); return; }
          const clubIdSet = new Set(profiles.map(p => p.member.clubId));
          const allClubSnaps = await Promise.all([...clubIdSet].map(id => ClubFactory.getById(id)));
          if (cancelled) return;
          setMemberClubs(allClubSnaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() })));
          setBootstrapDone(true);
        });
        return;
      }
      unsubClubs = UserMemberLinkFactory.getForUser(uid, async (profiles) => {
        if (cancelled) return;
        if (profiles.length === 0) { setBootstrapDone(true); return; }
        const clubIdSet    = new Set(profiles.map(p => p.member.clubId));
        const allClubSnaps = await Promise.all([...clubIdSet].map(id => ClubFactory.getById(id)));
        if (cancelled) return;
        setMemberClubs(allClubSnaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() })));
        setBootstrapDone(true);
      });
    };
    bootstrap();
    return () => { cancelled = true; unsubClubs(); };
  }, []);

  useEffect(() => {
    if (!bootstrapDone || memberClubs.length === 0) return;
    if (memberClubs.length === 1) setSelectedClubId(memberClubs[0].id);
  }, [bootstrapDone, memberClubs]);

  // ── Load groups ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedClubId) return;
    setSelectedGroupId('');
    setMemberGroups([]);
    setGroupMembers([]);
    setClubMemberProfiles([]);
    setMemberUidMap({});
    const uid = getCookie();
    if (!uid) return;
    let cancelled = false;

    const load = async () => {
      try {
        const allGroups = await GroupFactory.getGroupsByClubOnce(selectedClubId);
        const groupMembersCache = {};
        await Promise.all(allGroups.map(async group => {
          const members = await GroupFactory.getMembersByGroupOnce(selectedClubId, group.id);
          groupMembersCache[group.id] = members;
        }));
        if (cancelled) return;

        if (isSuperAdminRef.current || isClubAdminRef.current) {
          const filteredGroups = allGroups.filter(g => groupMembersCache[g.id]?.some(m => m.isSkipper === true));
          setMemberGroups(filteredGroups);
          if (filteredGroups.length === 1) setSelectedGroupId(filteredGroups[0].id);
          return;
        }
        const links = await UserMemberLinkFactory.getForUserInClub(uid, selectedClubId);
        if (links.length === 0) return;
        const myMemberIds = new Set(links.map(l => l.memberId).filter(Boolean));
        const memberGroupIds = new Set();
        allGroups.forEach(group => {
          if (groupMembersCache[group.id]?.some(d => myMemberIds.has(d.memberId || d.id))) memberGroupIds.add(group.id);
        });
        const filteredGroups = allGroups
          .filter(g => memberGroupIds.has(g.id))
          .filter(g => groupMembersCache[g.id]?.some(m => m.isSkipper === true));
        setMemberGroups(filteredGroups);
        if (filteredGroups.length === 1) setSelectedGroupId(filteredGroups[0].id);
      } catch (e) { console.error('[Dashboard] Failed to load groups:', e); }
    };
    load();
    return () => { cancelled = true; };
  }, [selectedClubId]);

  useEffect(() => {
    if (!selectedClubId || !selectedGroupId) return;
    setSelectedSkipperMemberIds([]);
    setSelectedSkipperUids([]);
    const u1 = GroupFactory.getMembersByGroup(selectedClubId, selectedGroupId, setGroupMembers);
    const u2 = ClubMemberFactory.getAll(selectedClubId, setClubMemberProfiles);
    return () => { u1(); u2(); };
  }, [selectedClubId, selectedGroupId]);

  // ── Resolve memberId → uid ────────────────────────────────────────────────
  useEffect(() => {
    if (groupMembers.length === 0 || !selectedClubId) return;
    let cancelled = false;
    const resolve = async () => {
      const map = {};
      await Promise.all(groupMembers.map(async (m) => {
        const memberId = m.memberId || m.id;
        try {
          const uid = await UserMemberLinkFactory.getUidForMember(selectedClubId, memberId);
          map[memberId] = uid || null;
        } catch { map[memberId] = null; }
      }));
      if (!cancelled) setMemberUidMap(map);
    };
    resolve();
    return () => { cancelled = true; };
  }, [groupMembers, selectedClubId]);

  // ── RTDB live subscriptions ───────────────────────────────────────────────
  useEffect(() => {
    if (selectedSkipperUids.length === 0) return;
    const unsubs = selectedSkipperUids.map(uid =>
      LiveSessionFactory.subscribeToLive(uid, (data) => {
        if (!data) return;
        setLiveSessions(prev => ({ ...prev, [uid]: data }));
        liveRef.current = { ...liveRef.current, [uid]: data };
      })
    );
    return () => unsubs.forEach(u => u && u());
  }, [selectedSkipperUids]);

  // ── Personal best loader ──────────────────────────────────────────────────
  const loadPersonalBest = useCallback(async (uid, memberId, discipline, sessionType) => {
    if (!memberId || !discipline || !selectedClubId) return;
    const rec = await ClubMemberFactory.getBestRecord(selectedClubId, memberId, discipline, sessionType || 'Training');
    if (!rec) return;
    setPersonalBests(prev => ({ ...prev, [uid]: rec }));
    const ghost = buildGhostCurve(rec.telemetry);
    setGhostCurves(prev => ({ ...prev, [uid]: ghost }));
    if (rec.telemetry && Object.keys(ghost).length > 1) {
      setShowGhost(prev => ({ ...prev, [uid]: true }));
    }
  }, [selectedClubId]);

  const disciplineRef = useRef({});
  useEffect(() => {
    selectedSkipperUids.forEach(uid => {
      const disc  = liveSessions[uid]?.session?.discipline;
      const sType = liveSessions[uid]?.session?.sessionType;
      const key   = `${uid}-${disc}-${sType}`;
      if (disc && disciplineRef.current[uid] !== key) {
        disciplineRef.current[uid] = key;
        const memberId = Object.keys(memberUidMap).find(mid => memberUidMap[mid] === uid) || null;
        loadPersonalBest(uid, memberId, disc, sType);
      }
    });
  }, [liveSessions, selectedSkipperUids, memberUidMap, loadPersonalBest]);

  // ── Live history ticker ───────────────────────────────────────────────────
  const sessionStartRef = useRef({});
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setHistory(prev => {
        const next = { ...prev };
        selectedSkipperUids.forEach(uid => {
          const liveData = liveRef.current[uid] || {};
          const session  = liveData.session;
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
  }, [selectedSkipperUids]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const buildChartData = (uid) => {
    const hist  = history[uid] || [];
    const ghost = ghostCurves[uid] || {};
    const ghostVisible = showGhost[uid] && Object.keys(ghost).length > 0;
    return hist.map(point => {
      const g = ghostVisible ? (ghost[point.elapsed] || null) : null;
      return { ...point, ghostBpm: g?.ghostBpm ?? null, ghostSteps: g?.ghostSteps ?? null };
    });
  };

  const getMember = (memberId) => clubMemberProfiles.find(m => m.id === memberId) || null;

  const availableSkippers = groupMembers.filter(m => m.isSkipper === true);

  const toggleSkipper = (memberId) => {
    const uid = memberUidMap[memberId] ?? null;
    const alreadySelected = selectedSkipperMemberIds.includes(memberId);
    if (alreadySelected) {
      setSelectedSkipperMemberIds(prev => prev.filter(id => id !== memberId));
      setSelectedSkipperUids(prev => uid ? prev.filter(id => id !== uid) : prev);
    } else {
      if (selectedSkipperMemberIds.length >= 4) { alert('Maximaal 4 skippers tegelijk.'); return; }
      setSelectedSkipperMemberIds(prev => [...prev, memberId]);
      if (uid) setSelectedSkipperUids(prev => [...prev, uid]);
    }
  };

  const showClubPicker  = memberClubs.length > 1;
  const showGroupPicker = memberGroups.length > 1;
  const canStartMonitoring = selectedSkipperMemberIds.length > 0;

  // ── Guards ────────────────────────────────────────────────────────────────
  if (!bootstrapDone) return (
    <div style={{ ...css.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={css.spinner} />
    </div>
  );

  if (bootstrapDone && memberClubs.length === 0) return (
    <div style={{ ...css.page, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
      <Users size={40} color="#334155" />
      <p style={{ color: '#64748b', fontSize: '14px', textAlign: 'center', maxWidth: '280px' }}>
        Je bent nog geen lid van een club. Vraag toegang aan via je profiel.
      </p>
      <a href="/" style={{ padding: '10px 20px', backgroundColor: '#3b82f6', color: 'white', borderRadius: '8px', textDecoration: 'none', fontWeight: '600', fontSize: '14px' }}>Naar profiel</a>
    </div>
  );

  // ── Monitoring view ───────────────────────────────────────────────────────
  if (view === 'monitoring') {
    const monitoredSkippers = selectedSkipperMemberIds.map(memberId => ({
      memberId,
      uid:    memberUidMap[memberId] ?? null,
      member: getMember(memberId),
    }));

    return (
      <div style={css.page}>
        <style>{responsiveCSS}</style>
        <div style={css.header}>
          <button style={css.backBtn} onClick={() => setView('selection')}>
            <ArrowLeft size={15} /> {isMobile ? 'Terug' : 'Wijzig selectie'}
          </button>
          <h1 style={{ margin: 0, fontSize: isMobile ? '14px' : '18px', fontWeight: '800', color: '#f1f5f9', textAlign: 'center' }}>
            {isMobile ? 'MONITORING' : 'SPEED MONITORING LIVE'}
          </h1>
          <div style={{ fontSize: '11px', color: '#475569', textAlign: 'right', display: isMobile ? 'none' : 'block' }}>
            {selectedClub?.name} · {selectedGroup?.name}
          </div>
        </div>

        {isMobile ? (
          <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '24px' }}>
            {monitoredSkippers.map(({ memberId, uid, member }) => {
              const isExpanded = expandedSkipper === memberId;
              return (
                <SkipperCard
                  key={memberId}
                  uid={uid}
                  member={member}
                  liveData={uid ? (liveSessions[uid] || {}) : {}}
                  history={uid ? (history[uid] || []) : []}
                  personalBest={uid ? (personalBests[uid] || null) : null}
                  ghostCurve={uid ? (ghostCurves[uid] || {}) : {}}
                  showGhost={uid ? (showGhost[uid] || false) : false}
                  onToggleGhost={() => uid && setShowGhost(prev => ({ ...prev, [uid]: !prev[uid] }))}
                  buildChartData={buildChartData}
                  isMobile={true}
                  isExpanded={isExpanded}
                  onToggleExpand={() => setExpandedSkipper(isExpanded ? null : memberId)}
                />
              );
            })}
          </div>
        ) : (
          <div style={css.monitorGrid}>
            {monitoredSkippers.map(({ memberId, uid, member }) => (
              <SkipperCard
                key={memberId}
                uid={uid}
                member={member}
                liveData={uid ? (liveSessions[uid] || {}) : {}}
                history={uid ? (history[uid] || []) : []}
                personalBest={uid ? (personalBests[uid] || null) : null}
                ghostCurve={uid ? (ghostCurves[uid] || {}) : {}}
                showGhost={uid ? (showGhost[uid] || false) : false}
                onToggleGhost={() => uid && setShowGhost(prev => ({ ...prev, [uid]: !prev[uid] }))}
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

  // ── Selection view ────────────────────────────────────────────────────────
  return (
    <div style={css.page}>
      <style>{responsiveCSS}</style>
      <div style={css.header}>
        <h1 style={{ margin: 0, fontSize: isMobile ? '16px' : '20px', fontWeight: '800', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Users size={22} color="#3b82f6" /> Wie wil je monitoren?
        </h1>
        <button
          disabled={!canStartMonitoring}
          onClick={() => { setExpandedSkipper(null); setView('monitoring'); }}
          style={{ ...css.primaryBtn, opacity: canStartMonitoring ? 1 : 0.35, padding: '9px 18px', fontSize: '13px' }}
        >
          Start →
        </button>
      </div>

      <div style={css.selectionWrap}>
        {showClubPicker && (
          <div style={css.field}>
            <label style={css.label}><Building2 size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />Club</label>
            <div style={css.clubGrid}>
              {memberClubs.map(club => (
                <button key={club.id} style={{ ...css.clubCard, ...(selectedClubId === club.id ? css.clubCardActive : {}) }} onClick={() => setSelectedClubId(club.id)}>
                  {club.logoUrl ? <img src={club.logoUrl} style={{ width: '36px', height: '36px', borderRadius: '8px', objectFit: 'cover', marginBottom: '8px' }} alt={club.name} /> : <Building2 size={28} color={selectedClubId === club.id ? '#3b82f6' : '#475569'} style={{ marginBottom: '8px' }} />}
                  <div style={{ fontSize: '13px', fontWeight: '600', textAlign: 'center' }}>{club.name}</div>
                </button>
              ))}
            </div>
          </div>
        )}
        {showClubPicker && !selectedClubId && <p style={css.infoText}>Selecteer een club om verder te gaan.</p>}

        {selectedClubId && showGroupPicker && (
          <div style={css.field}>
            <label style={css.label}><Users size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />Groep</label>
            <div style={css.groupGrid}>
              {memberGroups.map(group => (
                <button key={group.id} style={{ ...css.groupCard, ...(selectedGroupId === group.id ? css.groupCardActive : {}) }} onClick={() => setSelectedGroupId(group.id)}>
                  <Users size={22} color={selectedGroupId === group.id ? '#22c55e' : '#475569'} style={{ marginBottom: '6px' }} />
                  <div style={{ fontSize: '13px', fontWeight: '600', textAlign: 'center' }}>{group.name}</div>
                </button>
              ))}
            </div>
          </div>
        )}
        {selectedClubId && showGroupPicker && !selectedGroupId && <p style={css.infoText}>Selecteer een groep om de skippers te zien.</p>}

        {selectedClubId && selectedGroupId && (
          <div style={css.field}>
            <label style={css.label}><Trophy size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />Skippers ({selectedSkipperMemberIds.length}/4)</label>
            {availableSkippers.length > 0 ? (
              <div style={css.skipperGrid}>
                {availableSkippers.map(s => {
                  const memberId   = s.memberId || s.id;
                  const member     = getMember(memberId);
                  const uid        = memberUidMap[memberId] ?? null;
                  const isSelected = selectedSkipperMemberIds.includes(memberId);
                  const liveData   = uid ? liveSessions[uid] : null;
                  const isOnline   = liveData?.connectionStatus === 'online';
                  const isRelay    = !!(liveData?.relaySession?.isActive);
                  const firstName  = member?.firstName || '?';
                  const lastName   = member?.lastName  || '';
                  const initials   = `${firstName[0] || '?'}${lastName[0] || ''}`.toUpperCase();

                  return (
                    <button key={memberId} style={{ ...css.skipperCard, borderColor: isSelected ? '#3b82f6' : '#1e293b', backgroundColor: isSelected ? '#1e3a5f' : '#1e293b' }} onClick={() => toggleSkipper(memberId)}>
                      {isSelected && <CheckCircle2 style={{ position: 'absolute', top: 8, right: 8, color: '#3b82f6' }} size={16} />}
                      <div style={{ ...css.avatar, backgroundColor: isSelected ? '#3b82f6' : '#334155', width: '44px', height: '44px' }}>{initials}</div>
                      <div style={{ fontWeight: '600', marginTop: '8px', fontSize: '13px', textAlign: 'center' }}>{firstName} {lastName}</div>
                      <div style={{ fontSize: '11px', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px', color: isRelay ? '#3b82f6' : isOnline ? '#22c55e' : '#475569' }}>
                        {uid ? (
                          isRelay ? <><SkipForward size={10} />Relay</> :
                          isOnline ? <><Wifi size={10} />{liveData?.bpm || '--'} BPM</> :
                          <><WifiOff size={10} />Offline</>
                        ) : <span style={{ color: '#334155' }}>Geen account</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p style={css.infoText}>Geen actieve skippers in deze groep.</p>
            )}

            {canStartMonitoring && (
              <button onClick={() => { setExpandedSkipper(null); setView('monitoring'); }} style={{ ...css.primaryBtn, marginTop: '20px', width: '100%', padding: '14px' }}>
                Start Monitoring ({selectedSkipperMemberIds.length} skipper{selectedSkipperMemberIds.length > 1 ? 's' : ''}) →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Responsive CSS ───────────────────────────────────────────────────────────
const responsiveCSS = `
  * { box-sizing: border-box; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
`;

// ─── Styles ───────────────────────────────────────────────────────────────────
const css = {
  page:        { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'system-ui, sans-serif' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: '#1e293b', borderBottom: '1px solid #334155', position: 'sticky', top: 0, zIndex: 50, gap: '8px' },
  backBtn:     { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', padding: '4px 0', flexShrink: 0 },
  selectionWrap: { maxWidth: '600px', margin: '0 auto', padding: '24px 16px' },
  spinner:     { width: '36px', height: '36px', border: '3px solid #1e293b', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  field:       { marginBottom: '28px' },
  label:       { display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '10px', fontWeight: '600' },
  clubGrid:       { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' },
  clubCard:       { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '16px 12px', color: 'white', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'border-color 0.15s' },
  clubCardActive: { borderColor: '#3b82f6', backgroundColor: '#1e3a5f' },
  groupGrid:       { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' },
  groupCard:       { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '16px 12px', color: 'white', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'border-color 0.15s' },
  groupCardActive: { borderColor: '#22c55e', backgroundColor: '#052e16' },
  skipperGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' },
  skipperCard: { borderRadius: '10px', padding: '14px 10px', border: '2px solid', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', color: 'white' },
  avatar:      { width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '15px', flexShrink: 0 },
  infoText:    { textAlign: 'center', color: '#475569', marginTop: '8px', fontSize: '14px' },
  primaryBtn:  { backgroundColor: '#22c55e', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 16px', fontWeight: '700', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' },
  monitorGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: '16px', padding: '16px' },
  card:        { backgroundColor: '#1e293b', borderRadius: '14px', padding: '16px', border: '1px solid #334155' },
  mobileCard:  { borderRadius: '12px', padding: '14px' },
  mobileCardCollapsed: { backgroundColor: '#1e293b', borderRadius: '12px', padding: '12px 14px', border: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', width: '100%' },
  collapseBtn: { background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', padding: '0 0 8px 0', marginBottom: '4px', borderBottom: '1px solid #1e293b', width: '100%' },
  statBox:     { backgroundColor: '#0f172a', borderRadius: '8px', padding: '8px 6px', textAlign: 'center', border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' },
  statLabel:   { display: 'flex', alignItems: 'center', gap: '3px', color: '#64748b', fontSize: '8px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.3px' },
  statValue:   { fontSize: '22px', fontWeight: '900', lineHeight: 1.1 },
  ghostToggle: { display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '7px', border: '1px solid', cursor: 'pointer', fontSize: '11px', fontWeight: '600', marginBottom: '4px', width: '100%', justifyContent: 'center' },
};
