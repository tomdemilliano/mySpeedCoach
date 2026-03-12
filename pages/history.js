import { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea, Legend
} from 'recharts';
import {
  Clock, Trophy, Heart, Hash, Zap, Calendar, ChevronDown,
  ChevronUp, Brain, Loader2, ArrowLeft, TrendingUp, Activity,
  Target, Award, ChevronRight, Sparkles, AlertCircle, X
} from 'lucide-react';
import { UserFactory } from '../constants/dbSchema';

// ─── Constants ────────────────────────────────────────────────────────────────
const COOKIE_KEY = 'msc_uid';
const getCookie = () => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`));
  return match ? match[1] : null;
};

const DEFAULT_ZONES = [
  { name: 'Warm-up',   min: 0,   max: 120, color: '#94a3b8' },
  { name: 'Fat Burn',  min: 120, max: 145, color: '#22c55e' },
  { name: 'Aerobic',   min: 145, max: 165, color: '#facc15' },
  { name: 'Anaerobic', min: 165, max: 185, color: '#f97316' },
  { name: 'Red Line',  min: 185, max: 250, color: '#ef4444' },
];

const DISC_LABELS = { '30sec': '30 sec', '2min': '2 min', '3min': '3 min' };
const DISCIPLINE_DURATION = { '30sec': 30, '2min': 120, '3min': 180 };

const getZoneColor = (bpm, zones) => {
  const z = (zones || DEFAULT_ZONES).find(z => bpm >= z.min && bpm < z.max);
  return z ? z.color : '#94a3b8';
};

const normaliseTelemetry = (raw) => {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : Object.values(raw);
  return arr.filter(Boolean).sort((a, b) => a.time - b.time);
};

const formatDate = (session) => {
  const ts = session.sessionEnd?.seconds
    ? session.sessionEnd.seconds * 1000
    : session.sessionStart?.seconds
    ? session.sessionStart.seconds * 1000
    : null;
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' });
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
function SessionChart({ session, zones }) {
  const telemetry = normaliseTelemetry(session.telemetry);
  if (telemetry.length === 0) {
    return (
      <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: '13px', backgroundColor: '#0f172a', borderRadius: '10px' }}>
        Geen telemetrie beschikbaar
      </div>
    );
  }

  const t0 = telemetry[0].time;
  const chartData = telemetry.map(p => ({
    elapsed: Math.round((p.time - t0) / 1000),
    bpm: p.heartRate || 0,
    steps: p.steps || 0,
  }));

  const duration = DISCIPLINE_DURATION[session.discipline] || 30;
  const bpmColor = getZoneColor(session.avgBpm || 0, zones);

  return (
    <div style={{ height: '240px', backgroundColor: '#0f172a', borderRadius: '10px', padding: '10px 6px 4px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 2, right: 4, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="#1e293b" vertical={true} strokeDasharray="3 3" />
          <XAxis
            dataKey="elapsed"
            stroke="#334155"
            fontSize={8}
            type="number"
            domain={[0, duration]}
            tickCount={duration <= 30 ? 5 : 7}
            tickFormatter={v => `${v}s`}
            allowDataOverflow
          />
          <YAxis yAxisId="bpm" domain={[40, 210]} stroke="#475569" fontSize={8} tickCount={4} width={24} />
          <YAxis
            yAxisId="steps"
            orientation="right"
            domain={[0, 'auto']}
            stroke="#334155"
            fontSize={8}
            tickCount={4}
            width={26}
          />
          <Tooltip content={<CustomTooltip />} />
          {(zones || DEFAULT_ZONES).map(zone => (
            <ReferenceArea key={zone.name} yAxisId="bpm" y1={zone.min} y2={Math.min(zone.max, 210)} fill={zone.color} fillOpacity={0.04} stroke="none" />
          ))}
          <Line yAxisId="steps" type="monotone" dataKey="steps" name="Stappen"
            stroke="#60a5fa" strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls />
          <Line yAxisId="bpm" type="monotone" dataKey="bpm" name="Hartslag"
            stroke={bpmColor} strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '12px', marginTop: '4px', paddingLeft: '2px' }}>
        {[
          { color: bpmColor, label: 'Hartslag', dash: false },
          { color: '#60a5fa', label: 'Stappen', dash: false },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#64748b' }}>
            <svg width="14" height="5">
              <line x1="0" y1="2.5" x2="14" y2="2.5" stroke={item.color} strokeWidth="2" />
            </svg>
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AI Analysis Panel ────────────────────────────────────────────────────────
function AiAnalysis({ session, user, onClose }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError('');

    const telemetry = normaliseTelemetry(session.telemetry);
    const bpmValues = telemetry.map(p => p.heartRate).filter(Boolean);
    const avgBpm = session.avgBpm || (bpmValues.length > 0 ? Math.round(bpmValues.reduce((a, b) => a + b, 0) / bpmValues.length) : 0);
    const maxBpm = session.maxBpm || (bpmValues.length > 0 ? Math.max(...bpmValues) : 0);
    const zones = user?.heartrateZones || DEFAULT_ZONES;

    const zoneTime = {};
    zones.forEach(z => { zoneTime[z.name] = 0; });
    bpmValues.forEach(bpm => {
      const z = zones.find(z => bpm >= z.min && bpm < z.max);
      if (z) zoneTime[z.name] = (zoneTime[z.name] || 0) + 1;
    });

    const zoneBreakdown = Object.entries(zoneTime)
      .filter(([, count]) => count > 0)
      .map(([name, count]) => `${name}: ${Math.round((count / bpmValues.length) * 100)}%`)
      .join(', ');

    const prompt = `Je bent een professionele sportcoach gespecialiseerd in speed onderdelen van ropeskipping. Analyseer de volgende trainingssessie van een sporter en geef concrete, gepersonaliseerde feedback.

**Sporter:** ${user?.firstName || 'Onbekend'} ${user?.lastName || ''}
**Sessie type:** ${session.discipline ? DISC_LABELS[session.discipline] : 'Onbekend'} - ${session.sessionType || 'Training'}
**Score (stappen):** ${session.score || 0}
**Gemiddelde hartslag:** ${avgBpm} BPM
**Max hartslag:** ${maxBpm} BPM
**Hartslagzone-verdeling:** ${zoneBreakdown || 'Niet beschikbaar'}
**Duur discipline:** ${DISCIPLINE_DURATION[session.discipline] || '?'} seconden

Geef een gestructureerde analyse met:
1. **Prestatiebeoordeling** – Hoe was deze sessie? Sterke punten.
2. **Verbeterpunten** – Specifieke aandachtspunten op basis van de data.
3. **Aanbevolen trainingen** – 2-3 concrete oefeningen of trainingsvormen die de sporter kan doen om te verbeteren. Wees specifiek.
4. **Volgende stap** – Eén prioriteit voor de volgende sessie.

Antwoord in het Nederlands. Wees concreet, motiverend en data-gedreven. Gebruik max 250 woorden.`;

    try {
      const response = await fetch('/api/ai-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      const data = await response.json();
      if (data.text) {
        setAnalysis(data.text);
      } else {
        setError(data.error || 'Kon geen analyse genereren. Probeer het opnieuw.');
      }
    } catch (err) {
      console.error('AI analysis error:', err);
      setError('Verbindingsfout. Controleer de verbinding en probeer opnieuw.');
    } finally {
      setLoading(false);
    }
  }, [session, user]);

  useEffect(() => {
    runAnalysis();
  }, [runAnalysis]);

  // Parse analysis text into sections
  const renderAnalysis = (text) => {
    const sections = text.split(/\n(?=\d\.|##|\*\*)/).filter(Boolean);
    return sections.map((section, i) => {
      const lines = section.split('\n').filter(Boolean);
      return (
        <div key={i} style={{ marginBottom: '16px' }}>
          {lines.map((line, j) => {
            const isBold = line.startsWith('**') || /^\d+\./.test(line);
            const cleaned = line.replace(/\*\*/g, '').replace(/^#+\s*/, '');
            return (
              <p key={j} style={{
                margin: '0 0 6px',
                fontSize: isBold && j === 0 ? '13px' : '13px',
                fontWeight: isBold && j === 0 ? '700' : '400',
                color: isBold && j === 0 ? '#f1f5f9' : '#94a3b8',
                lineHeight: 1.6,
              }}>
                {cleaned}
              </p>
            );
          })}
        </div>
      );
    });
  };

  return (
    <div style={css.aiPanel}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: '#7c3aed22', border: '1px solid #7c3aed44', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Brain size={14} color="#a78bfa" />
          </div>
          <span style={{ fontSize: '13px', fontWeight: '700', color: '#a78bfa' }}>AI Coach Analyse</span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: '4px', display: 'flex' }}>
          <X size={16} />
        </button>
      </div>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '20px 0', color: '#64748b', fontSize: '13px' }}>
          <Loader2 size={16} color="#a78bfa" style={{ animation: 'spin 1s linear infinite' }} />
          Analyse wordt gegenereerd…
        </div>
      )}

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', fontSize: '12px', backgroundColor: '#ef444411', padding: '10px 12px', borderRadius: '8px' }}>
          <AlertCircle size={14} />
          {error}
          <button onClick={runAnalysis} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #ef444433', color: '#ef4444', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px' }}>
            Opnieuw
          </button>
        </div>
      )}

      {analysis && !loading && (
        <div style={{ fontSize: '13px', lineHeight: 1.7, color: '#94a3b8' }}>
          {renderAnalysis(analysis)}
        </div>
      )}
    </div>
  );
}

// ─── Session Row ──────────────────────────────────────────────────────────────
function SessionRow({ session, user, index }) {
  const [expanded, setExpanded] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const zones = user?.heartrateZones || DEFAULT_ZONES;
  const bpmColor = getZoneColor(session.avgBpm || 0, zones);
  const discLabel = DISC_LABELS[session.discipline] || session.discipline || '?';
  const sessionTypeColor = session.sessionType === 'Wedstrijd' ? '#f97316' : '#3b82f6';

  return (
    <div style={{ ...css.sessionCard, animationDelay: `${index * 40}ms` }} className="session-fade-in">
      {/* Summary row */}
      <button style={css.sessionSummary} onClick={() => setExpanded(v => !v)}>
        {/* Date block */}
        <div style={css.dateBlock}>
          <div style={{ fontSize: '18px', fontWeight: '900', color: '#f1f5f9', lineHeight: 1 }}>
            {session.sessionEnd?.seconds
              ? new Date(session.sessionEnd.seconds * 1000).getDate()
              : '?'}
          </div>
          <div style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {session.sessionEnd?.seconds
              ? new Date(session.sessionEnd.seconds * 1000).toLocaleDateString('nl-BE', { month: 'short' })
              : ''}
          </div>
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', flexWrap: 'wrap' }}>
            <span style={{ ...css.badge, backgroundColor: `${sessionTypeColor}22`, color: sessionTypeColor, border: `1px solid ${sessionTypeColor}44` }}>
              {session.sessionType || 'Training'}
            </span>
            <span style={{ ...css.badge, backgroundColor: '#1e293b', color: '#94a3b8', border: '1px solid #334155' }}>
              {discLabel}
            </span>
            <span style={{ fontSize: '10px', color: '#475569' }}>{formatTime(session)}</span>
          </div>
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
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

        {/* Expand icon */}
        <div style={{ flexShrink: 0, color: '#475569' }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid #1e293b', marginTop: '0', paddingTop: '14px' }}>
          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
            <div style={css.statMini}>
              <div style={css.statMiniLabel}><Hash size={9} /> Score</div>
              <div style={{ fontSize: '20px', fontWeight: '900', color: '#60a5fa' }}>{session.score || 0}</div>
              <div style={{ fontSize: '9px', color: '#475569' }}>stappen</div>
            </div>
            <div style={css.statMini}>
              <div style={css.statMiniLabel}><Heart size={9} /> Gem. BPM</div>
              <div style={{ fontSize: '20px', fontWeight: '900', color: bpmColor }}>{session.avgBpm || '—'}</div>
              <div style={{ fontSize: '9px', color: '#475569' }}>hartslag</div>
            </div>
            <div style={css.statMini}>
              <div style={css.statMiniLabel}><Activity size={9} /> Max BPM</div>
              <div style={{ fontSize: '20px', fontWeight: '900', color: '#f97316' }}>{session.maxBpm || '—'}</div>
              <div style={{ fontSize: '9px', color: '#475569' }}>piekwaarde</div>
            </div>
          </div>

          {/* Chart */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
              Telemetrie
            </div>
            <SessionChart session={session} zones={zones} />
          </div>

          {/* AI Analysis */}
          {!showAi ? (
            <button
              style={css.aiBtn}
              onClick={() => setShowAi(true)}
            >
              <Sparkles size={14} color="#a78bfa" />
              AI Coach Analyse aanvragen
              <ChevronRight size={12} color="#7c3aed" style={{ marginLeft: 'auto' }} />
            </button>
          ) : (
            <AiAnalysis session={session} user={user} onClose={() => setShowAi(false)} />
          )}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN HISTORY PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function HistoryPage() {
  const [currentUser, setCurrentUser] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState([]);
  const [filterDiscipline, setFilterDiscipline] = useState('');
  const [filterType, setFilterType] = useState('');

  // Load all users for cookie-based identification
  useEffect(() => {
    const unsub = UserFactory.getAll(setAllUsers);
    return () => unsub();
  }, []);

  // Identify current user from cookie
  useEffect(() => {
    if (allUsers.length === 0) return;
    const uid = getCookie();
    if (uid) {
      const user = allUsers.find(u => u.id === uid);
      if (user) setCurrentUser(user);
    }
    setLoading(false);
  }, [allUsers]);

  // Subscribe to session history
  useEffect(() => {
    if (!currentUser) return;
    const unsub = UserFactory.getSessionHistory(currentUser.id, (data) => {
      setSessions(data);
    });
    return () => unsub();
  }, [currentUser]);

  // Derived / filtered
  const filteredSessions = sessions.filter(s => {
    if (filterDiscipline && s.discipline !== filterDiscipline) return false;
    if (filterType && s.sessionType !== filterType) return false;
    return true;
  });

  const totalSessions = sessions.length;
  const bestScore = sessions.reduce((max, s) => s.score > max ? s.score : max, 0);
  const avgScore = sessions.length > 0 ? Math.round(sessions.reduce((sum, s) => sum + (s.score || 0), 0) / sessions.length) : 0;

  if (loading) {
    return (
      <div style={{ ...css.page, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
        <style>{pageCSS}</style>
        <div style={css.spinner} />
        <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>Laden…</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div style={{ ...css.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{pageCSS}</style>
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '16px', backgroundColor: '#1e293b', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Clock size={24} color="#475569" />
          </div>
          <h2 style={{ color: '#f1f5f9', fontSize: '18px', margin: '0 0 8px' }}>Niet ingelogd</h2>
          <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 20px' }}>
            Log in via het profielpagina om je sessiegeschiedenis te bekijken.
          </p>
          <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 20px', backgroundColor: '#3b82f6', color: 'white', borderRadius: '8px', textDecoration: 'none', fontWeight: '600', fontSize: '14px' }}>
            <ArrowLeft size={15} /> Naar profiel
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={css.page}>
      <style>{pageCSS}</style>

      {/* ── Header ── */}
      <header style={css.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '34px', height: '34px', borderRadius: '9px', backgroundColor: '#1e3a5f', border: '1px solid #3b82f644', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={17} color="#60a5fa" />
          </div>
          <div>
            <div style={{ fontWeight: '800', fontSize: '15px', color: '#f1f5f9' }}>Sessiegeschiedenis</div>
            <div style={{ fontSize: '10px', color: '#475569' }}>
              {currentUser.firstName} {currentUser.lastName}
            </div>
          </div>
        </div>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#64748b', fontSize: '12px', textDecoration: 'none' }}>
          <ArrowLeft size={13} /> Profiel
        </a>
      </header>

      <div style={css.content}>
        {/* ── Summary cards ── */}
        <div style={css.statsRow}>
          <div style={css.summaryCard}>
            <div style={css.summaryIcon('#3b82f6')}><Calendar size={15} color="#60a5fa" /></div>
            <div style={{ fontWeight: '900', fontSize: '24px', color: '#f1f5f9', lineHeight: 1 }}>{totalSessions}</div>
            <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>Sessies</div>
          </div>
          <div style={css.summaryCard}>
            <div style={css.summaryIcon('#facc15')}><Trophy size={15} color="#facc15" /></div>
            <div style={{ fontWeight: '900', fontSize: '24px', color: '#facc15', lineHeight: 1 }}>{bestScore}</div>
            <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>Beste score</div>
          </div>
          <div style={css.summaryCard}>
            <div style={css.summaryIcon('#22c55e')}><Target size={15} color="#22c55e" /></div>
            <div style={{ fontWeight: '900', fontSize: '24px', color: '#22c55e', lineHeight: 1 }}>{avgScore}</div>
            <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>Gem. score</div>
          </div>
        </div>

        {/* ── Filters ── */}
        {sessions.length > 0 && (
          <div style={css.filterRow}>
            <select
              style={css.select}
              value={filterDiscipline}
              onChange={e => setFilterDiscipline(e.target.value)}
            >
              <option value="">Alle onderdelen</option>
              <option value="30sec">30 sec</option>
              <option value="2min">2 min</option>
              <option value="3min">3 min</option>
            </select>
            <select
              style={css.select}
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
            >
              <option value="">Alle types</option>
              <option value="Training">Training</option>
              <option value="Wedstrijd">Wedstrijd</option>
            </select>
          </div>
        )}

        {/* ── Session list ── */}
        {sessions.length === 0 ? (
          <div style={css.emptyState}>
            <div style={{ width: '64px', height: '64px', borderRadius: '18px', backgroundColor: '#1e293b', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
              <Activity size={28} color="#334155" />
            </div>
            <h3 style={{ margin: '0 0 8px', color: '#64748b', fontSize: '16px', fontWeight: '700' }}>Nog geen sessies</h3>
            <p style={{ margin: 0, color: '#475569', fontSize: '13px', textAlign: 'center', maxWidth: '260px', lineHeight: 1.6 }}>
              Sessies worden automatisch opgeslagen na een training of wedstrijd.
            </p>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div style={css.emptyState}>
            <p style={{ color: '#64748b', fontSize: '14px' }}>Geen sessies voor de huidige filter.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '11px', color: '#475569', fontWeight: '600', marginBottom: '4px' }}>
              {filteredSessions.length} sessie{filteredSessions.length !== 1 ? 's' : ''} gevonden
            </div>
            {filteredSessions.map((session, i) => (
              <SessionRow
                key={session.id}
                session={session}
                user={currentUser}
                index={i}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page CSS ─────────────────────────────────────────────────────────────────
const pageCSS = `
  * { box-sizing: border-box; }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes sessionFadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .session-fade-in {
    animation: sessionFadeIn 0.25s ease both;
  }
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
  },
  content: {
    maxWidth: '760px',
    margin: '0 auto',
    padding: '20px 16px 40px',
  },
  spinner: {
    width: '36px',
    height: '36px',
    border: '3px solid #1e293b',
    borderTop: '3px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },

  // Summary
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px',
    marginBottom: '18px',
  },
  summaryCard: {
    backgroundColor: '#1e293b',
    borderRadius: '12px',
    padding: '14px 12px',
    border: '1px solid #334155',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  summaryIcon: (color) => ({
    width: '30px',
    height: '30px',
    borderRadius: '8px',
    backgroundColor: `${color}22`,
    border: `1px solid ${color}33`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '4px',
  }),

  // Filters
  filterRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px',
    flexWrap: 'wrap',
  },
  select: {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #334155',
    backgroundColor: '#1e293b',
    color: '#94a3b8',
    fontSize: '13px',
    cursor: 'pointer',
    flex: 1,
    minWidth: '140px',
  },

  // Session card
  sessionCard: {
    backgroundColor: '#1e293b',
    borderRadius: '12px',
    border: '1px solid #334155',
    overflow: 'hidden',
  },
  sessionSummary: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 14px',
    width: '100%',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'white',
    textAlign: 'left',
  },

  // Date block
  dateBlock: {
    width: '36px',
    height: '42px',
    borderRadius: '8px',
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Badge
  badge: {
    display: 'inline-block',
    padding: '2px 7px',
    borderRadius: '5px',
    fontSize: '10px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
  },

  // Stats inside detail
  statMini: {
    backgroundColor: '#0f172a',
    borderRadius: '8px',
    padding: '10px 8px',
    textAlign: 'center',
    border: '1px solid #1e293b',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1px',
  },
  statMiniLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    color: '#64748b',
    fontSize: '8px',
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: '2px',
  },

  // AI
  aiBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '11px 14px',
    backgroundColor: '#2d1d4e',
    border: '1px solid #7c3aed44',
    borderRadius: '10px',
    color: '#c4b5fd',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  aiPanel: {
    backgroundColor: '#1a0f2e',
    border: '1px solid #7c3aed33',
    borderRadius: '10px',
    padding: '14px',
  },

  // Empty state
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
  },
};
