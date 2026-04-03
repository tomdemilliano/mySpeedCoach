/**
 * pages/history.js  —  Sessiegeschiedenis
 *
 * Lid-view:  eigen sessies, gefilterd per discipline en sessietype.
 * Coach-view: groepsoverzicht van alle leden waarvan je coach bent;
 *             klik op een lid → dezelfde detailview als het lid zelf.
 *
 * Rules:
 *   - All DB access via factories (CLAUDE.md §1)
 *   - No <form> elements (CLAUDE.md §4)
 *   - Inline CSS only (CLAUDE.md §9)
 *   - Dutch UI strings (CLAUDE.md §9)
 *   - Pages Router (CLAUDE.md §10)
 *   - Disciplines dynamic via useDisciplines() hook (CLAUDE.md §5)
 */

import { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea,
} from 'recharts';
import {
  Clock, Trophy, Heart, Hash, TrendingUp, Calendar,
  ChevronDown, ChevronUp, Brain, Loader2, ArrowLeft,
  Activity, Target, ChevronRight, Sparkles, AlertCircle,
  X, Users, User,
} from 'lucide-react';
import {
  UserFactory, ClubMemberFactory, UserMemberLinkFactory, GroupFactory,
} from '../constants/dbSchema';
import { useAuth }       from '../contexts/AuthContext';
import { useDisciplines } from '../hooks/useDisciplines';

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_ZONES = [
  { name: 'Warm-up',   min: 0,   max: 120, color: '#94a3b8' },
  { name: 'Fat Burn',  min: 120, max: 145, color: '#22c55e' },
  { name: 'Aerobic',   min: 145, max: 165, color: '#facc15' },
  { name: 'Anaerobic', min: 165, max: 185, color: '#f97316' },
  { name: 'Red Line',  min: 185, max: 250, color: '#ef4444' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getZoneColor = (bpm, zones) => {
  const z = (zones || DEFAULT_ZONES).find(z => bpm >= z.min && bpm < z.max);
  return z ? z.color : '#94a3b8';
};

const normaliseTelemetry = (raw) => {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : Object.values(raw);
  return arr.filter(Boolean).sort((a, b) => a.time - b.time);
};

const formatTime = (session) => {
  const ts = session.sessionEnd?.seconds
    ? session.sessionEnd.seconds * 1000
    : session.sessionStart?.seconds
    ? session.sessionStart.seconds * 1000
    : null;
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (session) => {
  const ts = session.sessionEnd?.seconds ? session.sessionEnd.seconds * 1000 : null;
  if (!ts) return { day: '?', month: '' };
  const d = new Date(ts);
  return {
    day:   d.getDate(),
    month: d.toLocaleDateString('nl-BE', { month: 'short' }),
    year:  d.getFullYear(),
  };
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

// ─── Session telemetry chart ──────────────────────────────────────────────────
function SessionChart({ session, zones, durationSeconds }) {
  const telemetry = normaliseTelemetry(session.telemetry);
  if (telemetry.length === 0) {
    return (
      <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: '13px', backgroundColor: '#0f172a', borderRadius: '10px' }}>
        Geen telemetrie beschikbaar
      </div>
    );
  }
  const t0       = telemetry[0].time;
  const duration = durationSeconds || 30;
  const chartData = telemetry.map(p => ({
    elapsed: Math.round((p.time - t0) / 1000),
    bpm:     p.heartRate || 0,
    steps:   p.steps     || 0,
  }));
  const bpmColor = getZoneColor(session.avgBpm || 0, zones);

  return (
    <div style={{ height: '220px', backgroundColor: '#0f172a', borderRadius: '10px', padding: '10px 6px 4px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 2, right: 4, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="#1e293b" vertical strokeDasharray="3 3" />
          <XAxis dataKey="elapsed" stroke="#334155" fontSize={8} type="number" domain={[0, duration]} tickCount={duration <= 30 ? 5 : 7} tickFormatter={v => `${v}s`} allowDataOverflow />
          <YAxis yAxisId="bpm"   domain={[40, 210]}   stroke="#475569" fontSize={8} tickCount={4} width={24} />
          <YAxis yAxisId="steps" orientation="right" domain={[0, 'auto']} stroke="#334155" fontSize={8} tickCount={4} width={26} />
          <Tooltip content={<CustomTooltip />} />
          {(zones || DEFAULT_ZONES).map(zone => (
            <ReferenceArea key={zone.name} yAxisId="bpm" y1={zone.min} y2={Math.min(zone.max, 210)} fill={zone.color} fillOpacity={0.04} stroke="none" />
          ))}
          <Line yAxisId="steps" type="monotone" dataKey="steps" name="Stappen" stroke="#60a5fa" strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls />
          <Line yAxisId="bpm"   type="monotone" dataKey="bpm"   name="Hartslag" stroke={bpmColor} strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', gap: '12px', marginTop: '4px', paddingLeft: '2px' }}>
        {[{ color: bpmColor, label: 'Hartslag' }, { color: '#60a5fa', label: 'Stappen' }].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#64748b' }}>
            <svg width="14" height="5"><line x1="0" y1="2.5" x2="14" y2="2.5" stroke={item.color} strokeWidth="2" /></svg>
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AI Analysis Panel ────────────────────────────────────────────────────────
function AiAnalysis({ session, user, member, discipline, onClose }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  // Bereken leeftijd uit birthDate (ClubMember veld)
  const leeftijd = (() => {
    const bd = member?.birthDate;
    if (!bd) return null;
    const ms = bd?.seconds ? bd.seconds * 1000 : new Date(bd).getTime();
    if (isNaN(ms)) return null;
    const today = new Date();
    const birth = new Date(ms);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  })();

  const leeftijdscategorie = (() => {
    if (leeftijd === null) return null;
    if (leeftijd < 12)  return `Mini (${leeftijd} jaar, onder 12)`;
    if (leeftijd <= 14) return `Belofte (${leeftijd} jaar, 12–14)`;
    if (leeftijd <= 17) return `Junior (${leeftijd} jaar, 15–17)`;
    return `Senior (${leeftijd} jaar, 18+)`;
  })();  
  
  const runAnalysis = useCallback(async () => {
    setLoading(true); setError('');
    const telemetry = normaliseTelemetry(session.telemetry);
    const bpmValues = telemetry.map(p => p.heartRate).filter(Boolean);
    const avgBpm = session.avgBpm || (bpmValues.length ? Math.round(bpmValues.reduce((a, b) => a + b, 0) / bpmValues.length) : 0);
    const maxBpm = session.maxBpm || (bpmValues.length ? Math.max(...bpmValues) : 0);
    const zones    = user?.heartrateZones || DEFAULT_ZONES;
    const duration = discipline?.durationSeconds || 30;
    const discName = session.disciplineName || discipline?.name || session.discipline || '?';

    const zoneTime = {};
    zones.forEach(z => { zoneTime[z.name] = 0; });
    bpmValues.forEach(bpm => {
      const z = zones.find(z => bpm >= z.min && bpm < z.max);
      if (z) zoneTime[z.name] = (zoneTime[z.name] || 0) + 1;
    });
    const zoneBreakdown = Object.entries(zoneTime).filter(([, c]) => c > 0)
      .map(([n, c]) => `${n}: ${Math.round((c / bpmValues.length) * 100)}%`).join(', ');

    const third = Math.floor(telemetry.length / 3);
    const phases = [telemetry.slice(0, third), telemetry.slice(third, third * 2), telemetry.slice(third * 2)];
    const avgStepsPhase = (pts) => {
      if (pts.length < 2) return 0;
      const dt = ((pts[pts.length - 1].time - pts[0].time) / 1000) || 1;
      return Math.round(((pts[pts.length - 1].steps - pts[0].steps) / dt) * 30);
    };
    const avgBpmPhase = (pts) => {
      const v = pts.map(p => p.heartRate).filter(Boolean);
      return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0;
    };
    const [p1s, p2s, p3s] = phases.map(avgStepsPhase);
    const [p1b, p2b, p3b] = phases.map(avgBpmPhase);
    const bpmTrend = p3b > p1b + 15 ? 'sterk stijgend (vermoeidheid)' : p3b > p1b + 5 ? 'licht stijgend' : 'stabiel';

    const prompt = `Je bent een professionele sportcoach gespecialiseerd in rope skipping.

DISCIPLINE CONTEXT:
- Onderdeel: ${discName} (duur: ${duration}s, type: ${discipline?.ropeType || 'SR'})
- Stappen worden geteld op 1 voet (×2 = totaal sprongen). Bij Double Under en Triple Under gaat het om sprongen (niet stappen).
- Benchmarks: zie domeinkennis hieronder.

SPORTER: ${user?.firstName || ''} ${user?.lastName || ''}${leeftijdscategorie ? ` — ${leeftijdscategorie}` : ''}
SESSIE: ${discName} — ${session.sessionType || 'Training'}
SCORE: ${session.score || 0} stappen/sprongen in ${duration}s
HARTSLAG: gem ${avgBpm} BPM, max ${maxBpm} BPM, trend: ${bpmTrend}
ZONES: ${zoneBreakdown || 'n/a'}
FASE-TEMPO (stps/30s): begin ${p1s}@${p1b}bpm · midden ${p2s}@${p2b}bpm · einde ${p3s}@${p3b}bpm

Geef in het Nederlands (max 300 woorden):
1) Prestatiebeoordeling (vergelijk met benchmarks)
2) Fase-analyse (tempo-verloop en hartslag)
3) Verbeterpunten (concreet, 2-3 punten)
4) 2 concrete oefeningen
5) Prioriteit volgende sessie`;

    try {
      const res  = await fetch('/api/ai-analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
      const data = await res.json();
      if (data.text) setAnalysis(data.text);
      else setError(data.error || 'Kon geen analyse genereren.');
    } catch {
      setError('Verbindingsfout. Probeer opnieuw.');
    } finally {
      setLoading(false);
    }
  }, [session, user, discipline]);

  useEffect(() => { runAnalysis(); }, [runAnalysis]);

  const renderAnalysis = (text) =>
    text.split(/\n(?=\d\.|##|\*\*)/).filter(Boolean).map((section, i) => (
      <div key={i} style={{ marginBottom: '14px' }}>
        {section.split('\n').filter(Boolean).map((line, j) => {
          const isBold = line.startsWith('**') || /^\d+\./.test(line);
          return (
            <p key={j} style={{ margin: '0 0 5px', fontSize: '13px', fontWeight: isBold && j === 0 ? '700' : '400', color: isBold && j === 0 ? '#f1f5f9' : '#94a3b8', lineHeight: 1.65 }}>
              {line.replace(/\*\*/g, '').replace(/^#+\s*/, '')}
            </p>
          );
        })}
      </div>
    ));

  return (
    <div style={{ backgroundColor: '#1a0f2e', border: '1px solid #7c3aed33', borderRadius: '10px', padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: '#7c3aed22', border: '1px solid #7c3aed44', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Brain size={14} color="#a78bfa" />
          </div>
          <span style={{ fontSize: '13px', fontWeight: '700', color: '#a78bfa' }}>AI Coach Analyse</span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: '4px', display: 'flex' }}><X size={16} /></button>
      </div>
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '20px 0', color: '#64748b', fontSize: '13px' }}>
          <Loader2 size={16} color="#a78bfa" style={{ animation: 'spin 1s linear infinite' }} />
          Analyse wordt gegenereerd…
        </div>
      )}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', fontSize: '12px', backgroundColor: '#ef444411', padding: '10px 12px', borderRadius: '8px' }}>
          <AlertCircle size={14} />{error}
          <button onClick={runAnalysis} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #ef444433', color: '#ef4444', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px' }}>
            Opnieuw
          </button>
        </div>
      )}
      {analysis && !loading && (
        <div style={{ fontSize: '13px', lineHeight: 1.7, color: '#94a3b8' }}>{renderAnalysis(analysis)}</div>
      )}
    </div>
  );
}

// ─── Session Row ──────────────────────────────────────────────────────────────
function SessionRow({ session, user, member, disciplines, index }) {
  const [expanded, setExpanded] = useState(false);
  const [showAi,   setShowAi]   = useState(false);

  const zones      = user?.heartrateZones || DEFAULT_ZONES;
  const bpmColor   = getZoneColor(session.avgBpm || 0, zones);
  const dateInfo   = formatDate(session);

  // Resolve discipline object (by ID or by name for legacy sessions)
  const discipline = disciplines.find(d => d.id === session.discipline)
    || disciplines.find(d => d.name === session.disciplineName)
    || null;

  const discLabel      = session.disciplineName || discipline?.name || session.discipline || '?';
  const sessionTypeColor = session.sessionType === 'Wedstrijd' ? '#f97316' : '#3b82f6';
  const countingMethod   = session.countingMethod === 'AI' ? 'AI' : null;

  return (
    <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden', animation: `sessionFadeIn 0.25s ease ${index * 30}ms both` }}>
      <button style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: 'white', textAlign: 'left' }} onClick={() => setExpanded(v => !v)}>
        {/* Date block */}
        <div style={{ width: '36px', height: '44px', borderRadius: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: '17px', fontWeight: '900', color: '#f1f5f9', lineHeight: 1 }}>{dateInfo.day}</div>
          <div style={{ fontSize: '8px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{dateInfo.month}</div>
        </div>

        {/* Meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: '5px', fontSize: '10px', fontWeight: '700', backgroundColor: `${sessionTypeColor}22`, color: sessionTypeColor, border: `1px solid ${sessionTypeColor}44` }}>
              {session.sessionType || 'Training'}
            </span>
            <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: '5px', fontSize: '10px', fontWeight: '600', backgroundColor: '#1e293b', color: '#94a3b8', border: '1px solid #334155' }}>
              {discLabel}
            </span>
            {countingMethod && (
              <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: '5px', fontSize: '9px', fontWeight: '700', backgroundColor: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b44' }}>
                AI
              </span>
            )}
            <span style={{ fontSize: '10px', color: '#475569' }}>{formatTime(session)}</span>
          </div>
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Hash size={11} color="#60a5fa" />
              <span style={{ fontWeight: '800', fontSize: '16px', color: '#60a5fa' }}>{session.score || 0}</span>
              <span style={{ fontSize: '10px', color: '#475569' }}>stps</span>
            </div>
            {session.avgBpm > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Heart size={11} color={bpmColor} fill={bpmColor} />
                <span style={{ fontWeight: '700', fontSize: '14px', color: bpmColor }}>{session.avgBpm}</span>
                <span style={{ fontSize: '10px', color: '#475569' }}>gem BPM</span>
              </div>
            )}
            {session.maxBpm > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <TrendingUp size={11} color="#f97316" />
                <span style={{ fontSize: '12px', color: '#f97316', fontWeight: '600' }}>{session.maxBpm}</span>
                <span style={{ fontSize: '10px', color: '#475569' }}>max</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ flexShrink: 0, color: '#475569' }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {expanded && (
        <div style={{ padding: '0 14px 16px', borderTop: '1px solid #1e293b', paddingTop: '14px' }}>
          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
            {[
              { icon: <Hash size={9} />, label: 'Score', value: session.score || 0, sub: 'stappen', color: '#60a5fa' },
              { icon: <Heart size={9} />, label: 'Gem. BPM', value: session.avgBpm || '—', sub: 'hartslag', color: bpmColor },
              { icon: <Activity size={9} />, label: 'Max BPM', value: session.maxBpm || '—', sub: 'piekwaarde', color: '#f97316' },
            ].map(stat => (
              <div key={stat.label} style={{ backgroundColor: '#0f172a', borderRadius: '8px', padding: '10px 8px', textAlign: 'center', border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#64748b', fontSize: '8px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '2px' }}>
                  {stat.icon} {stat.label}
                </div>
                <div style={{ fontSize: '20px', fontWeight: '900', color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: '9px', color: '#475569' }}>{stat.sub}</div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Telemetrie</div>
            <SessionChart session={session} zones={zones} durationSeconds={discipline?.durationSeconds || 30} />
          </div>

          {/* AI Analysis — more breathing room above */}
          <div style={{ marginTop: '20px' }}>
            {!showAi ? (
              <button
                style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '12px 14px', backgroundColor: '#2d1d4e', border: '1px solid #7c3aed44', borderRadius: '10px', color: '#c4b5fd', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                onClick={() => setShowAi(true)}
              >
                <Sparkles size={14} color="#a78bfa" />
                AI Coach Analyse aanvragen
                <ChevronRight size={12} color="#7c3aed" style={{ marginLeft: 'auto' }} />
              </button>
            ) : (
              <AiAnalysis session={session} user={user} member={member} discipline={discipline} onClose={() => setShowAi(false)} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sessions list (shared between member and coach-detail view) ──────────────
function SessionsList({ sessions, user, member, disciplines, filterDisc, filterType, onFilterDiscChange, onFilterTypeChange }) {
  const totalSessions = sessions.length;
  const bestScore     = sessions.reduce((m, s) => s.score > m ? s.score : m, 0);
  const avgScore      = sessions.length
    ? Math.round(sessions.reduce((sum, s) => sum + (s.score || 0), 0) / sessions.length)
    : 0;

  // Build dynamic discipline filter options from actual session data
  const discOptions = disciplines.filter(d =>
    sessions.some(s => s.discipline === d.id || s.disciplineName === d.name)
  );

  const filtered = sessions.filter(s => {
    if (filterDisc && s.discipline !== filterDisc && s.disciplineName !== filterDisc) return false;
    if (filterType && s.sessionType !== filterType) return false;
    return true;
  });

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }}>
        {[
          { icon: <Calendar size={15} color="#60a5fa" />, color: '#3b82f6', value: totalSessions, label: 'Sessies' },
          { icon: <Trophy size={15} color="#facc15" />,   color: '#facc15', value: bestScore,     label: 'Beste score' },
          { icon: <Target size={15} color="#22c55e" />,   color: '#22c55e', value: avgScore,      label: 'Gem. score' },
        ].map(card => (
          <div key={card.label} style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '14px 12px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '30px', height: '30px', borderRadius: '8px', backgroundColor: `${card.color}22`, border: `1px solid ${card.color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2px' }}>
              {card.icon}
            </div>
            <div style={{ fontWeight: '900', fontSize: '22px', color: card.label === 'Beste score' ? '#facc15' : card.label === 'Gem. score' ? '#22c55e' : '#f1f5f9', lineHeight: 1 }}>{card.value}</div>
            <div style={{ fontSize: '10px', color: '#475569' }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      {sessions.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <select
            style={css.select}
            value={filterDisc}
            onChange={e => onFilterDiscChange(e.target.value)}
          >
            <option value="">Alle onderdelen</option>
            {discOptions.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <select
            style={css.select}
            value={filterType}
            onChange={e => onFilterTypeChange(e.target.value)}
          >
            <option value="">Alle types</option>
            <option value="Training">Training</option>
            <option value="Wedstrijd">Wedstrijd</option>
          </select>
        </div>
      )}

      {/* Session list */}
      {sessions.length === 0 ? (
        <div style={css.emptyState}>
          <div style={{ width: '56px', height: '56px', borderRadius: '16px', backgroundColor: '#1e293b', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
            <Activity size={24} color="#334155" />
          </div>
          <p style={{ color: '#64748b', fontSize: '14px', fontWeight: '600', margin: '0 0 4px' }}>Nog geen sessies</p>
          <p style={{ color: '#475569', fontSize: '12px', margin: 0, textAlign: 'center', maxWidth: '240px', lineHeight: 1.6 }}>
            Sessies worden automatisch opgeslagen na een training of wedstrijd.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={css.emptyState}>
          <p style={{ color: '#64748b', fontSize: '14px' }}>Geen sessies voor de huidige filter.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '11px', color: '#475569', fontWeight: '600', marginBottom: '4px' }}>
            {filtered.length} sessie{filtered.length !== 1 ? 's' : ''}
          </div>
          {filtered.map((session, i) => (
            <SessionRow
              key={session.id}
              session={session}
              user={user}
              member={member}
              disciplines={disciplines}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Coach view — group member list ──────────────────────────────────────────
function CoachView({ uid, user, disciplines }) {
  const [coachGroups,    setCoachGroups]    = useState([]); // [{ clubId, groupId, groupName, clubName }]
  const [groupMembers,   setGroupMembers]   = useState([]); // [{ memberId, clubId, firstName, lastName }]
  const [selectedMember, setSelectedMember] = useState(null); // { memberId, clubId, firstName, lastName }
  const [memberSessions, setMemberSessions] = useState([]);
  const [memberUser,     setMemberUser]     = useState(null);
  const [loadingGroups,  setLoadingGroups]  = useState(true);
  const [loadingSessions,setLoadingSessions]= useState(false);
  const [filterDisc,     setFilterDisc]     = useState('');
  const [filterType,     setFilterType]     = useState('');

  // Resolve which groups this user is coach of
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    const allUnsubs = [];

    const unsub = UserMemberLinkFactory.getForUser(uid, async (profiles) => {
      if (cancelled) return;
      const found = [];
      const innerUnsubs = [];

      for (const { member } of profiles) {
        const { clubId } = member;
        const u = GroupFactory.getGroupsByClub(clubId, (groups) => {
          groups.forEach(group => {
            const u2 = GroupFactory.getMembersByGroup(clubId, group.id, (gMembers) => {
              const me = gMembers.find(m => (m.memberId || m.id) === member.id);
              if (me?.isCoach) {
                const key = `${clubId}-${group.id}`;
                const already = found.find(g => g.key === key);
                if (!already) found.push({ key, clubId, groupId: group.id, groupName: group.name });
                if (!cancelled) setCoachGroups([...found]);
              }
            });
            innerUnsubs.push(u2);
          });
          setLoadingGroups(false);
        });
        innerUnsubs.push(u);
      }
      allUnsubs.push(...innerUnsubs);
    });

    allUnsubs.push(unsub);
    return () => { cancelled = true; allUnsubs.forEach(u => u && u()); };
  }, [uid]);

  // Load all skippers in coach's groups
  useEffect(() => {
    if (coachGroups.length === 0) return;
    let cancelled = false;
    const seen = new Set();
    const all  = [];
    const unsubs = [];

    coachGroups.forEach(({ clubId, groupId }) => {
      const u = GroupFactory.getMembersByGroup(clubId, groupId, async (gMembers) => {
        const skippers = gMembers.filter(m => m.isSkipper);
        for (const gm of skippers) {
          const mid = gm.memberId || gm.id;
          const key = `${clubId}-${mid}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const snap = await ClubMemberFactory.getById(clubId, mid);
          if (!snap.exists() || cancelled) continue;
          const data = snap.data();
          all.push({ memberId: mid, clubId, firstName: data.firstName, lastName: data.lastName });
          if (!cancelled) setGroupMembers([...all].sort((a, b) => a.firstName.localeCompare(b.firstName)));
        }
      });
      unsubs.push(u);
    });

    return () => { cancelled = true; unsubs.forEach(u => u && u()); };
  }, [coachGroups]);

  // Load sessions for selected member
  useEffect(() => {
    if (!selectedMember) return;
    setLoadingSessions(true);
    // Laad het volledige profiel (inclusief birthDate)
    ClubMemberFactory.getById(clubId, memberId).then(snap => {
      if (snap.exists()) setSelectedMemberProfile({ id: snap.id, ...snap.data() });
    });

    setMemberSessions([]);   
    const { clubId, memberId } = selectedMember;
    const unsub = ClubMemberFactory.getSessionHistory(clubId, memberId, (sessions) => {
      setMemberSessions(sessions);
      setLoadingSessions(false);
    });
    // Try to load the user doc for the member (for heart rate zones)
    UserMemberLinkFactory.getUidForMember(clubId, memberId).then(memberUid => {
      if (memberUid) UserFactory.get(memberUid).then(s => { if (s.exists()) setMemberUser({ id: memberUid, ...s.data() }); });
    });
    return () => unsub();
  }, [selectedMember]);

  if (loadingGroups) return (
    <div style={css.emptyState}>
      <div style={css.spinner} />
      <p style={{ color: '#64748b', fontSize: '13px', marginTop: '12px' }}>Groepen laden…</p>
    </div>
  );

  if (coachGroups.length === 0) return (
    <div style={css.emptyState}>
      <Users size={32} color="#334155" style={{ marginBottom: '12px' }} />
      <p style={{ color: '#64748b', fontSize: '14px', fontWeight: '600', margin: '0 0 4px' }}>Geen groepen als coach</p>
      <p style={{ color: '#475569', fontSize: '12px', margin: 0 }}>Je bent nog niet als coach ingesteld in een groep.</p>
    </div>
  );

  // Detail view for selected member
  if (selectedMember) {
    return (
      <div>
        <button
          onClick={() => { setSelectedMember(null); setMemberSessions([]); setMemberUser(null); setFilterDisc(''); setFilterType(''); }}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: '13px', fontWeight: '600', padding: '0 0 16px 0' }}
        >
          <ArrowLeft size={15} /> Terug naar groepsoverzicht
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '12px 14px', marginBottom: '20px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '50%', backgroundColor: '#3b82f622', border: '1px solid #3b82f644', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '14px', color: '#60a5fa', flexShrink: 0 }}>
            {selectedMember.firstName?.[0]}{selectedMember.lastName?.[0]}
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#f1f5f9' }}>{selectedMember.firstName} {selectedMember.lastName}</div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>Sessiegeschiedenis — coachweergave</div>
          </div>
        </div>

        {loadingSessions ? (
          <div style={css.emptyState}><div style={css.spinner} /></div>
        ) : (
          <SessionsList
            sessions={memberSessions}
            user={memberUser || user}
            member={memberProfile}
            disciplines={disciplines}
            filterDisc={filterDisc}
            filterType={filterType}
            onFilterDiscChange={setFilterDisc}
            onFilterTypeChange={setFilterType}
          />
        )}
      </div>
    );
  }

  // Group member list
  return (
    <div>
      <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
        {groupMembers.length} sporter{groupMembers.length !== 1 ? 's' : ''} in jouw groep{coachGroups.length > 1 ? 'en' : ''}
      </div>
      {groupMembers.length === 0 ? (
        <div style={css.emptyState}>
          <p style={{ color: '#64748b', fontSize: '13px' }}>Geen skippers gevonden in jouw groepen.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {groupMembers.map(member => (
            <button
              key={`${member.clubId}-${member.memberId}`}
              onClick={() => { setSelectedMember(member); setFilterDisc(''); setFilterType(''); }}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '12px 14px', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'border-color 0.15s' }}
            >
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#3b82f622', border: '1px solid #3b82f644', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '13px', color: '#60a5fa', flexShrink: 0 }}>
                {member.firstName?.[0]}{member.lastName?.[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#f1f5f9' }}>{member.firstName} {member.lastName}</div>
              </div>
              <ChevronRight size={15} color="#475569" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function HistoryPage() {
  const { uid }               = useAuth();
  const { disciplines }       = useDisciplines();
  const [currentUser,    setCurrentUser]    = useState(null);
  const [memberContext,  setMemberContext]  = useState(null); // { clubId, memberId }
  const [sessions,       setSessions]       = useState([]);
  const [coachView,      setCoachView]      = useState(false);
  const [loading,        setLoading]        = useState(true);
  const [filterDisc,     setFilterDisc]     = useState('');
  const [filterType,     setFilterType]     = useState('');
  const [memberProfile, setMemberProfile]   = useState(null);

  // Resolve user + member context
  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    UserFactory.get(uid).then(snap => {
      if (snap.exists()) setCurrentUser({ id: uid, ...snap.data() });
    });
    const unsub = UserMemberLinkFactory.getForUser(uid, (profiles) => {
      const self = profiles.find(p => p.link.relationship === 'self');
      setMemberContext(self ? { clubId: self.member.clubId, memberId: self.member.id } : null);
      setLoading(false);
    });
    return () => unsub();
  }, [uid]);

  // Subscribe to own sessions
  useEffect(() => {
    if (!memberContext) return;
    const { clubId, memberId } = memberContext;
    const unsub = ClubMemberFactory.getSessionHistory(clubId, memberId, setSessions);
    return () => unsub();
  }, [memberContext]);

  // Laad het ClubMember profiel wanneer memberContext bekend is
  useEffect(() => {
    if (!memberContext) return;
    ClubMemberFactory.getById(memberContext.clubId, memberContext.memberId)
      .then(snap => { if (snap.exists()) setMemberProfile({ id: snap.id, ...snap.data() }); });
  }, [memberContext]);
          
  // Detect coach status from sessionStorage (set by _app.js)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = sessionStorage.getItem('msc_viewmode');
    setCoachView(stored === 'coach');
  }, []);

  if (loading) return (
    <div style={{ ...css.page, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
      <style>{pageCSS}</style>
      <div style={css.spinner} />
      <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>Laden…</p>
    </div>
  );

  if (!uid || !currentUser) return (
    <div style={{ ...css.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{pageCSS}</style>
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <Clock size={24} color="#475569" />
        <h2 style={{ color: '#f1f5f9', fontSize: '18px', margin: '16px 0 8px' }}>Niet ingelogd</h2>
        <a href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 20px', backgroundColor: '#3b82f6', color: 'white', borderRadius: '8px', textDecoration: 'none', fontWeight: '600', fontSize: '14px' }}>
          Inloggen
        </a>
      </div>
    </div>
  );

  return (
    <div style={css.page}>
      <style>{pageCSS}</style>

      <header style={css.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '34px', height: '34px', borderRadius: '9px', backgroundColor: '#1e3a5f', border: '1px solid #3b82f644', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={17} color="#60a5fa" />
          </div>
          <div>
            <div style={{ fontWeight: '800', fontSize: '15px', color: '#f1f5f9' }}>Sessiegeschiedenis</div>
            <div style={{ fontSize: '10px', color: '#475569' }}>{currentUser.firstName} {currentUser.lastName}</div>
          </div>
        </div>
      </header>

      <div style={css.content}>
        {/* View toggle — only shown if user is also a coach */}
        {coachView && (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', backgroundColor: '#1e293b', borderRadius: '10px', padding: '4px', border: '1px solid #334155' }}>
            {[
              { key: false, icon: <User size={13} />, label: 'Mijn sessies' },
              { key: true,  icon: <Users size={13} />, label: 'Mijn groep' },
            ].map(tab => (
              <button
                key={String(tab.key)}
                onClick={() => setCoachView(tab.key)}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px 12px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '700', fontFamily: 'inherit', backgroundColor: coachView === tab.key ? '#3b82f6' : 'transparent', color: coachView === tab.key ? 'white' : '#64748b', transition: 'all 0.15s' }}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        )}

        {coachView ? (
          <CoachView uid={uid} user={currentUser} disciplines={disciplines} />
        ) : (
          <SessionsList
            sessions={sessions}
            user={currentUser}
            member={memberProfile}
            disciplines={disciplines}
            filterDisc={filterDisc}
            filterType={filterType}
            onFilterDiscChange={setFilterDisc}
            onFilterTypeChange={setFilterType}
          />
        )}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const pageCSS = `
  * { box-sizing: border-box; }
  @keyframes spin          { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes sessionFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  select option { background-color: #1e293b; }
`;

const css = {
  page:    { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'system-ui, sans-serif' },
  header:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: '#1e293b', borderBottom: '1px solid #334155', position: 'sticky', top: 0, zIndex: 50 },
  content: { maxWidth: '760px', margin: '0 auto', padding: '20px 16px 48px' },
  spinner: { width: '32px', height: '32px', border: '3px solid #1e293b', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  select:  { padding: '8px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#1e293b', color: '#94a3b8', fontSize: '13px', cursor: 'pointer', flex: 1, minWidth: '140px' },
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 20px' },
};
