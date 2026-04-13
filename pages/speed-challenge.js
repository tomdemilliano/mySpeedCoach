/**
 * pages/speed-challenge.js — Speed Challenge
 *
 * AI-powered timed challenge: tel hoelang het duurt om X stappen te bereiken.
 * Gebruikt dezelfde MediaPipe BlazePose backend als ai-counter.js.
 *
 * Flow:
 *   1. Setup — kies challenge (20/30/50/100/custom), kies skipper of bezoeker
 *   2. Klaar — camera-preview + grote START-knop
 *   3. Aftellen — 3-2-1 met geluid
 *   4. Bezig — timer loopt, stappen tellen, stop bij doel
 *   5. Resultaat — tijd getoond, opslaan, opnieuw of leaderboard
 *   6. Leaderboard — filter op groep / seizoen / dag / challenge
 *
 * Rules:
 *   - All DB via factories (CLAUDE.md §1)
 *   - No <form> elements (CLAUDE.md §4)
 *   - Inline CSS only (CLAUDE.md §9)
 *   - Dutch UI (CLAUDE.md §9)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  UserFactory, ClubFactory, GroupFactory,
  ClubMemberFactory, UserMemberLinkFactory,
  SpeedChallengeFactory, SeasonFactory,
} from '../constants/dbSchema';
import {
  ArrowLeft, Play, Trophy, Timer, Users, ChevronRight,
  Star, Zap, Medal, RefreshCw, CheckCircle2, Camera,
  FlipHorizontal, User, Filter, Square, SlidersHorizontal,
  ChevronDown, ChevronUp,
} from 'lucide-react';

// ─── MediaPipe config ─────────────────────────────────────────────────────────
const MP_TASKS_VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const DEFAULT_DET_CFG = {
  peakMinProminence:  0.012,
  peakMinIntervalMs: 120,
  missGapMs:         600,
  kalmanEnabled:     true,
  kalmanProcessNoise: 0.01,
  peakMinAmplitude:  0.015,
  exitFactor:        1.0,
};

// ─── Preset challenges ────────────────────────────────────────────────────────
const CHALLENGES = [
  { steps: 20,  label: '20',  color: '#22c55e' },
  { steps: 30,  label: '30',  color: '#3b82f6' },
  { steps: 50,  label: '50',  color: '#a78bfa' },
  { steps: 100, label: '100', color: '#f97316' },
];

const AGE_OPTIONS = [
  { value: 'u12',    label: 'U12 (< 12 jaar)' },
  { value: 'u16',    label: 'U16 (12–16 jaar)' },
  { value: 'senior', label: 'Senior (16+)' },
];

const AGE_LABELS = { u12: 'U12', u16: 'U16', senior: 'Senior' };

// ─── Cookie helper ────────────────────────────────────────────────────────────
const getCookieUid = () => {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(/(?:^|; )msc_uid=([^;]*)/);
  return m ? m[1] : null;
};

function pad2(n) { return String(n).padStart(2, '0'); }
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

function fmtTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min      = Math.floor(totalSec / 60);
  const sec      = totalSec % 60;
  const hund     = Math.floor((ms % 1000) / 10);
  if (min > 0) return `${min}:${pad2(sec)}.${pad2(hund)}`;
  return `${sec}.${pad2(hund)}`;
}

// ─── Kalman filter (same as ai-counter.js) ────────────────────────────────────
class AnkleKalmanFilter {
  constructor() { this.reset(); }
  reset() {
    this._x = null; this._v = 0;
    this._p00 = 1; this._p01 = 0; this._p10 = 0; this._p11 = 1;
    this._lastT = null;
  }
  update(rawY, confidence, t, Q = 0.01) {
    if (this._x === null) { this._x = rawY; this._v = 0; this._lastT = t; return rawY; }
    const rawDt = Math.min(t - this._lastT, 200);
    const dt = rawDt / 33.0;
    this._lastT = t;
    const xPred = this._x + this._v * dt;
    const vPred = this._v;
    const p00 = this._p00 + dt * (this._p10 + this._p01) + dt * dt * this._p11 + Q;
    const p01 = this._p01 + dt * this._p11;
    const p10 = this._p10 + dt * this._p11;
    const p11 = this._p11 + Q * 0.1;
    const CONF_THRESHOLD = 0.25;
    if (confidence >= CONF_THRESHOLD) {
      const R = 0.0025 / Math.max(confidence * confidence, 0.04);
      const S  = p00 + R; const K0 = p00 / S; const K1 = p10 / S;
      const innov = rawY - xPred;
      this._x = xPred + K0 * innov; this._v = vPred + K1 * innov;
      this._p00 = (1 - K0) * p00; this._p01 = (1 - K0) * p01;
      this._p10 = p10 - K1 * p00; this._p11 = p11 - K1 * p01;
    } else {
      this._x = xPred; this._v = vPred;
      this._p00 = p00 * 1.5; this._p01 = p01; this._p10 = p10; this._p11 = p11 * 1.5;
    }
    this._x = Math.max(0, Math.min(1, this._x));
    return this._x;
  }
}

// ─── Step Detector (same as ai-counter.js) ────────────────────────────────────
class StepDetector {
  constructor(config = DEFAULT_DET_CFG) { this.config = { ...DEFAULT_DET_CFG, ...config }; this.reset(); }
  reset() {
    this.signal = []; this.steps = 0;
    this.lastStepTime = 0; this.inPeak = false;
    this.peakY = null; this.valleyY = null; this.peakEntryY = null;
  }
  push(y, t) {
    this.signal.push({ y, t });
    if (this.signal.length > 90) this.signal.shift();
    return this._detect(y, t);
  }
  _detect(y, t) {
    const { peakMinProminence: P, peakMinIntervalMs: I, peakMinAmplitude: A = 0.015, exitFactor: EF = 1.0 } = this.config;
    if (this.signal.length < 5) return null;
    const avgY = this.signal.slice(-5).reduce((s, p) => s + p.y, 0) / 5;
    if (this.valleyY === null) { this.valleyY = avgY; return null; }
    if (!this.inPeak && (this.valleyY - avgY) > P) {
      this.inPeak = true; this.peakY = avgY; this.peakEntryY = avgY;
    }
    if (this.inPeak) {
      if (avgY < this.peakY) this.peakY = avgY;
      if (avgY > this.peakY + P * EF) {
        this.inPeak = false; this.valleyY = avgY;
        const amplitude = (this.peakEntryY ?? avgY) - this.peakY;
        if ((this.valleyY - this.peakY) >= P && amplitude >= A) {
          const dt = t - this.lastStepTime;
          if (dt >= I) { this.steps++; this.lastStepTime = t; return 'step'; }
        }
        return null;
      }
    } else if (avgY > this.valleyY) { this.valleyY = avgY * 0.9 + this.valleyY * 0.1; }
    return null;
  }
}

// ─── Audio helper ─────────────────────────────────────────────────────────────
function playBeep(freq = 880, durationMs = 150, volume = 0.8, type = 'sine') {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + durationMs / 1000 + 0.05);
    osc.onended = () => ctx.close();
  } catch (e) { /* AudioContext not available */ }
}

function playCountdownBeep() {
  // Duidelijke lage tik
  playBeep(440, 120, 0.9, 'square');
}

function playStartSignal() {
  // Drie snelle oplopende tonen — onmiskenbaar "GO!"
  playBeep(523, 80, 0.9, 'square');
  setTimeout(() => playBeep(659, 80, 0.9, 'square'), 90);
  setTimeout(() => playBeep(1047, 300, 1.0, 'square'), 180);
}

function playFinishSignal() {
  // Fanfare-achtig — duidelijk einde
  playBeep(784, 120, 1.0, 'square');
  setTimeout(() => playBeep(1047, 120, 1.0, 'square'), 130);
  setTimeout(() => playBeep(1319, 400, 1.0, 'square'), 260);
}

// ─── Skipper picker ───────────────────────────────────────────────────────────
function SkipperPicker({ currentUser, clubId, groupId, onSelect, selected }) {
  const [skippers, setSkippers] = useState([]);
  const [members,  setMembers]  = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!clubId || !groupId) { setLoading(false); return; }
    let cancelled = false;
    const u1 = GroupFactory.getSkippersByGroup(clubId, groupId, (s) => {
      if (!cancelled) setSkippers(s);
    });
    const u2 = ClubMemberFactory.getAll(clubId, (m) => {
      if (!cancelled) { setMembers(m); setLoading(false); }
    });
    return () => { cancelled = true; u1(); u2(); };
  }, [clubId, groupId]);

  if (loading) return (
    <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
      <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> Laden…
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      {skippers.map(sk => {
        const mid = sk.memberId || sk.id;
        const m   = members.find(x => x.id === mid);
        const fn  = m?.firstName || '?';
        const ln  = m?.lastName  || '';
        const init = `${fn[0] || '?'}${ln[0] || ''}`.toUpperCase();
        const active = selected?.type === 'member' && selected.memberId === mid;
        return (
          <button key={mid} onClick={() => onSelect({ type: 'member', memberId: mid, firstName: fn, lastName: ln })}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 12px', borderRadius: '10px', fontFamily: 'inherit', cursor: 'pointer',
              border: `1.5px solid ${active ? '#3b82f6' : '#334155'}`,
              backgroundColor: active ? '#3b82f622' : '#0f172a',
            }}
          >
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: active ? '#3b82f6' : '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', color: 'white', flexShrink: 0 }}>
              {init}
            </div>
            <span style={{ fontSize: '13px', fontWeight: active ? '700' : '500', color: active ? '#f1f5f9' : '#94a3b8' }}>
              {fn} {ln}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Visitor form ─────────────────────────────────────────────────────────────
function VisitorForm({ value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <input
        value={value.firstName}
        onChange={e => onChange({ ...value, firstName: e.target.value })}
        placeholder="Voornaam *"
        style={inputStyle}
      />
      <input
        value={value.lastName}
        onChange={e => onChange({ ...value, lastName: e.target.value })}
        placeholder="Achternaam"
        style={inputStyle}
      />
      <div>
        <div style={labelStyle}>Leeftijdscategorie</div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {AGE_OPTIONS.map(opt => {
            const active = value.ageCategory === opt.value;
            return (
              <button key={opt.value} onClick={() => onChange({ ...value, ageCategory: opt.value })}
                style={{
                  padding: '6px 14px', borderRadius: '8px', fontFamily: 'inherit', cursor: 'pointer',
                  border: `1px solid ${active ? '#a78bfa' : '#334155'}`,
                  backgroundColor: active ? '#a78bfa22' : 'transparent',
                  color: active ? '#a78bfa' : '#64748b',
                  fontSize: '12px', fontWeight: active ? '700' : '500',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Countdown overlay ────────────────────────────────────────────────────────
function CountdownOverlay({ count }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 30,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        fontSize: count === 0 ? '64px' : '120px',
        fontWeight: '900',
        color: count === 0 ? '#22c55e' : '#f1f5f9',
        lineHeight: 1,
        animation: 'countPop 0.35s cubic-bezier(0.175,0.885,0.32,1.275)',
        textShadow: count === 0 ? '0 0 40px #22c55e88' : '0 4px 20px rgba(0,0,0,0.5)',
        fontFamily: 'system-ui, sans-serif',
      }}>
        {count === 0 ? 'GO!' : count}
      </div>
      {count > 0 && (
        <div style={{ fontSize: '16px', color: '#64748b', marginTop: '12px', fontWeight: '600' }}>
          Klaar zetten…
        </div>
      )}
    </div>
  );
}

// ─── Detection Tuning Panel (same presets as ai-counter.js) ──────────────────
function DetectionTuningPanel({ config, onChange }) {
  const [open, setOpen] = useState(false);

  const sliders = [
    { key: 'peakMinProminence', label: 'Pieksensitiviteit',  hint: 'Lager = gevoeliger. Verhoog bij dubbeltelling.', min: 0.003, max: 0.05,  step: 0.001, fmt: v => v.toFixed(3) },
    { key: 'peakMinAmplitude',  label: 'Min. sprong-hoogte', hint: 'Min. enkelhoogte t.o.v. beginpunt van de piek.',  min: 0.005, max: 0.08,  step: 0.005, fmt: v => v.toFixed(3) },
    { key: 'peakMinIntervalMs', label: 'Min. interval (ms)', hint: 'Min. tijd tussen stappen.',                       min: 60,    max: 400,   step: 10,    fmt: v => `${v} ms` },
  ];

  const presets = [
    { label: 'Snel (sprint)', config: { peakMinProminence: 0.008, peakMinIntervalMs: 80,  peakMinAmplitude: 0.012 } },
    { label: 'Normaal',       config: { peakMinProminence: 0.012, peakMinIntervalMs: 120, peakMinAmplitude: 0.015 } },
    { label: 'Langzaam',      config: { peakMinProminence: 0.018, peakMinIntervalMs: 180, peakMinAmplitude: 0.020 } },
  ];

  return (
    <div style={{ backgroundColor: '#1e293b', borderRadius: '14px', border: '1px solid #334155', overflow: 'hidden' }}>
      <button onClick={() => setOpen(v => !v)} style={{ width: '100%', padding: '12px 16px', background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'inherit' }}>
        <SlidersHorizontal size={15} color="#60a5fa" />
        <span style={{ flex: 1, textAlign: 'left', fontSize: '13px', fontWeight: '700', color: '#f1f5f9' }}>Detectie-instellingen</span>
        <span style={{ fontSize: '11px', color: '#475569', marginRight: '6px' }}>beta fine-tuning</span>
        {open ? <ChevronUp size={14} color="#64748b" /> : <ChevronDown size={14} color="#64748b" />}
      </button>

      {open && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Kalman toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: '700', color: config.kalmanEnabled ? '#60a5fa' : '#64748b' }}>Kalman-filter</div>
              <div style={{ fontSize: '10px', color: '#475569' }}>Smootht de enkelpositie (aanbevolen)</div>
            </div>
            <button onClick={() => onChange({ kalmanEnabled: !config.kalmanEnabled })} style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer', backgroundColor: config.kalmanEnabled ? '#3b82f6' : '#334155', position: 'relative', transition: 'background-color 0.2s', flexShrink: 0 }}>
              <div style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: 'white', position: 'absolute', top: '3px', left: config.kalmanEnabled ? '23px' : '3px', transition: 'left 0.2s' }} />
            </button>
          </div>

          {/* Presets */}
          <div>
            <div style={{ fontSize: '10px', color: '#475569', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '7px' }}>Snelkeuze</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {presets.map(p => (
                <button key={p.label} onClick={() => onChange(p.config)} style={{ padding: '5px 11px', borderRadius: '14px', border: '1px solid #334155', background: 'transparent', color: '#94a3b8', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>{p.label}</button>
              ))}
              <button onClick={() => onChange({ ...DEFAULT_DET_CFG })} style={{ padding: '5px 11px', borderRadius: '14px', border: '1px solid #334155', background: 'transparent', color: '#64748b', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>Reset</button>
            </div>
          </div>

          {/* Sliders */}
          {sliders.map(sl => (
            <div key={sl.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#94a3b8' }}>{sl.label}</span>
                <span style={{ fontSize: '12px', fontWeight: '700', color: '#60a5fa', fontFamily: 'monospace' }}>{sl.fmt(config[sl.key])}</span>
              </div>
              <input type="range" min={sl.min} max={sl.max} step={sl.step} value={config[sl.key]} onChange={e => onChange({ [sl.key]: Number(e.target.value) })} style={{ width: '100%', accentColor: '#3b82f6' }} />
              <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>{sl.hint}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────
function Leaderboard({ clubId, groups, seasons }) {
  const [challenge,  setChallenge]  = useState(30);
  const [groupId,    setGroupId]    = useState('');
  const [seasonId,   setSeasonId]   = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [results,    setResults]    = useState([]);
  const [loading,    setLoading]    = useState(false);

  const load = useCallback(() => {
    if (!clubId) return;
    setLoading(true);
    const filters = {
      challengeSteps: challenge,
      groupId:        groupId  || null,
      seasonId:       seasonId || null,
      date:           dateFilter || null,
    };
    const unsub = SpeedChallengeFactory.getLeaderboard(clubId, filters, (data) => {
      setResults(data);
      setLoading(false);
    });
    return unsub;
  }, [clubId, challenge, groupId, seasonId, dateFilter]);

  useEffect(() => {
    const unsub = load();
    return () => unsub?.();
  }, [load]);

  const getMedalColor = (rank) => {
    if (rank === 0) return '#f59e0b'; // goud
    if (rank === 1) return '#94a3b8'; // zilver
    if (rank === 2) return '#cd7c3f'; // brons
    return '#334155';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Challenge filter */}
        <div>
          <div style={labelStyle}>Challenge</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {CHALLENGES.map(c => (
              <button key={c.steps} onClick={() => setChallenge(c.steps)} style={{
                padding: '6px 14px', borderRadius: '20px', fontFamily: 'inherit', cursor: 'pointer',
                border: `1px solid ${challenge === c.steps ? c.color : '#334155'}`,
                backgroundColor: challenge === c.steps ? c.color + '22' : 'transparent',
                color: challenge === c.steps ? c.color : '#64748b',
                fontSize: '13px', fontWeight: challenge === c.steps ? '700' : '500',
              }}>
                {c.label} stappen
              </button>
            ))}
          </div>
        </div>

        {/* Group + season + date */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div>
            <div style={labelStyle}>Groep</div>
            <select value={groupId} onChange={e => setGroupId(e.target.value)} style={selectStyle}>
              <option value="">Alle groepen</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <div style={labelStyle}>Seizoen</div>
            <select value={seasonId} onChange={e => setSeasonId(e.target.value)} style={selectStyle}>
              <option value="">Alle seizoenen</option>
              {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <div style={labelStyle}>Datum</div>
          <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{ ...inputStyle, color: dateFilter ? 'white' : '#64748b' }} />
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
          <div style={{ width: '24px', height: '24px', border: '3px solid #1e293b', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : results.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: '#475569', fontSize: '13px' }}>
          Nog geen resultaten voor deze filters.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {results.map((r, i) => {
            const medalColor = getMedalColor(i);
            const name = r.type === 'visitor'
              ? `${r.visitorName} ${r.visitorLastName || ''}`.trim()
              : `${r.firstName || ''} ${r.lastName || ''}`.trim() || r.memberId;
            const sub = r.type === 'visitor'
              ? `Bezoeker · ${AGE_LABELS[r.visitorAge] || r.visitorAge}`
              : r.groupName || '';
            return (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                backgroundColor: i < 3 ? medalColor + '0a' : '#1e293b',
                border: `1px solid ${i < 3 ? medalColor + '33' : '#334155'}`,
                borderRadius: '10px', padding: '10px 14px',
              }}>
                {/* Rank */}
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: medalColor + '22', border: `1px solid ${medalColor}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {i < 3
                    ? <Medal size={14} color={medalColor} />
                    : <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>{i + 1}</span>
                  }
                </div>

                {/* Name */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {name}
                  </div>
                  {sub && <div style={{ fontSize: '11px', color: '#64748b' }}>{sub}</div>}
                  <div style={{ fontSize: '10px', color: '#334155' }}>{r.date}</div>
                </div>

                {/* Time */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '22px', fontWeight: '900', color: i < 3 ? medalColor : '#94a3b8', lineHeight: 1, fontFamily: 'monospace' }}>
                    {fmtTime(r.timeMs)}
                  </div>
                  <div style={{ fontSize: '9px', color: '#475569', fontWeight: '700', textTransform: 'uppercase' }}>
                    {r.challengeSteps} stappen
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SpeedChallengePage() {
  // ── Auth / club bootstrap ────────────────────────────────────────────────
  const [currentUser,   setCurrentUser]   = useState(null);
  const [memberContext, setMemberContext]  = useState(null);
  const [groups,        setGroups]        = useState([]);
  const [seasons,       setSeasons]       = useState([]);
  const [bootstrapDone, setBootstrapDone] = useState(false);

  useEffect(() => {
    const uid = getCookieUid();
    if (!uid) { setBootstrapDone(true); return; }
    let cancelled = false;

    const run = async () => {
      const snap = await UserFactory.get(uid);
      if (!snap.exists() || cancelled) { setBootstrapDone(true); return; }
      setCurrentUser({ id: uid, ...snap.data() });

      const unsub = UserMemberLinkFactory.getForUser(uid, async (profiles) => {
        unsub();
        if (cancelled || !profiles.length) { setBootstrapDone(true); return; }
        const profile  = profiles[0];
        const clubId   = profile.member.clubId;
        const memberId = profile.member.id;
        setMemberContext({ clubId, memberId, uid });

        const [gs, ss] = await Promise.all([
          GroupFactory.getGroupsByClubOnce(clubId),
          new Promise(resolve => {
            const u = SeasonFactory.getAll(clubId, (data) => { u(); resolve(data); });
          }),
        ]);
        if (!cancelled) {
          setGroups(gs.sort((a, b) => a.name.localeCompare(b.name)));
          setSeasons(ss.filter(s => !s.isAbandoned));
          setBootstrapDone(true);
        }
      });
    };
    run();
    return () => { cancelled = true; };
  }, []);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [tab,         setTab]         = useState('challenge'); // 'challenge' | 'leaderboard'
  const [phase,       setPhase]       = useState('setup');    // 'setup' | 'camera' | 'countdown' | 'running' | 'done'
  const [selectedGroup, setSelectedGroup] = useState('');
  const [participantType, setParticipantType] = useState('member'); // 'member' | 'visitor'
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [visitor,     setVisitor]     = useState({ firstName: '', lastName: '', ageCategory: 'u16' });
  const [challengeSteps, setChallengeSteps] = useState(30);
  const [customSteps, setCustomSteps] = useState('');
  const [useCustom,   setUseCustom]   = useState(false);
  const [countdownSecs, setCountdownSecs] = useState(3); // instelbaar aftellen

  // ── Camera / AI state ────────────────────────────────────────────────────
  const [cameraReady,    setCameraReady]    = useState(false);
  const [backendLoading, setBackendLoading] = useState(false);
  const [backendError,   setBackendError]   = useState('');
  const [facingMode,     setFacingMode]     = useState('environment');
  const [countdownNum,   setCountdownNum]   = useState(3);
  const [steps,          setSteps]          = useState(0);
  const [elapsedMs,      setElapsedMs]      = useState(0);
  const [finalTimeMs,    setFinalTimeMs]    = useState(0);
  const [saving,         setSaving]         = useState(false);
  const [savedOk,        setSavedOk]        = useState(false);
  const [detCfg,         setDetCfg]         = useState({ ...DEFAULT_DET_CFG });

  // ── Refs ──────────────────────────────────────────────────────────────────
  const videoRef     = useRef(null);
  const canvasRef    = useRef(null);
  const offscreenRef = useRef(null);
  const frameRef     = useRef(null);
  const mpPoseRef    = useRef(null);
  const detectorRef  = useRef(new StepDetector(DEFAULT_DET_CFG));
  const kalmanRef    = useRef(new AnkleKalmanFilter());
  const isRunRef     = useRef(false);
  const startTimeRef = useRef(null);
  const timerRef     = useRef(null);
  const stepsRef     = useRef(0);
  const goalRef      = useRef(challengeSteps);
  const wakeLockRef  = useRef(null);
  const detCfgRef    = useRef(detCfg);

  useEffect(() => { goalRef.current  = effectiveGoal; });
  useEffect(() => { detCfgRef.current = detCfg; detectorRef.current.config = { ...detCfg }; }, [detCfg]);

  const effectiveGoal = useCustom
    ? (parseInt(customSteps) || 0)
    : challengeSteps;

  const challengeColor = useCustom
    ? '#f59e0b'
    : (CHALLENGES.find(c => c.steps === challengeSteps)?.color || '#3b82f6');

  // ── Wake lock ────────────────────────────────────────────────────────────
  const requestWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return;
    try { wakeLockRef.current = await navigator.wakeLock.request('screen'); } catch (_) {}
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    if (mpPoseRef.current) { try { mpPoseRef.current.close(); } catch (_) {} mpPoseRef.current = null; }
    clearInterval(timerRef.current);
    releaseWakeLock();
  }, [releaseWakeLock]);

  useEffect(() => () => stopCamera(), []); // eslint-disable-line

  // ── Init camera + MediaPipe ───────────────────────────────────────────────
  const initCamera = useCallback(async () => {
    setBackendError(''); setBackendLoading(true);
    try {
      // Load MediaPipe
      const mpUrl = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm';
      const vision = await Function('u', 'return import(u)')(mpUrl);
      const PoseLandmarker  = vision.PoseLandmarker  ?? vision.default?.PoseLandmarker;
      const FilesetResolver = vision.FilesetResolver ?? vision.default?.FilesetResolver;
      const filesetResolver = await FilesetResolver.forVisionTasks(MP_TASKS_VISION_URL);
      const poseLandmarker  = await PoseLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          delegate: /iPhone|iPad|Android/i.test(navigator.userAgent) ? 'CPU' : 'GPU',
        },
        runningMode: 'VIDEO', numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      mpPoseRef.current = poseLandmarker;

      // Start camera
      const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: isMobile ? 480 : 640 }, height: { ideal: isMobile ? 640 : 480 } },
      });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      const canvas = canvasRef.current;
      const INFER_INTERVAL_MS = 80;
      let lastInferTime = 0;
      let lastPoseResults = null;

      const runLoop = () => {
        if (!videoRef.current?.srcObject) return;
        const vid = videoRef.current;
        if (vid.readyState >= 2 && vid.videoWidth > 0) {
          canvas.width = vid.videoWidth; canvas.height = vid.videoHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);

          const now = performance.now();
          if (now - lastInferTime >= INFER_INTERVAL_MS) {
            lastInferTime = now;
            if (!offscreenRef.current) offscreenRef.current = document.createElement('canvas');
            const scale = Math.min(1, 480 / vid.videoWidth);
            offscreenRef.current.width  = Math.round(vid.videoWidth  * scale);
            offscreenRef.current.height = Math.round(vid.videoHeight * scale);
            offscreenRef.current.getContext('2d').drawImage(vid, 0, 0, offscreenRef.current.width, offscreenRef.current.height);
            const results = poseLandmarker.detectForVideo(offscreenRef.current, now);
            lastPoseResults = results;
            onMpResults(results);
          } else if (lastPoseResults) {
            onMpResults(lastPoseResults);
          }
        }
        frameRef.current = requestAnimationFrame(runLoop);
      };
      frameRef.current = requestAnimationFrame(runLoop);
      setCameraReady(true);
      setBackendLoading(false);
    } catch (e) {
      setBackendError(`Camera of model laden mislukt: ${e.message}`);
      setBackendLoading(false);
    }
  }, [facingMode]); // eslint-disable-line

  // ── Process landmarks ─────────────────────────────────────────────────────
  const onMpResults = useCallback((results) => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0) return;
    if (!results.landmarks?.[0]) return;
    const lms = results.landmarks[0];

    // Rechts = index 28
    const ank = lms[28];
    if (!ank || (ank.visibility ?? 0) < 0.25) return;

    const cfg        = DEFAULT_DET_CFG;
    const filteredY  = cfg.kalmanEnabled
      ? kalmanRef.current.update(ank.y, ank.visibility ?? 1, Date.now(), cfg.kalmanProcessNoise)
      : ank.y;

    // Draw ankle dot
    const ctx = canvas.getContext('2d');
    const ax = ank.x * canvas.width, ay = filteredY * canvas.height;
    ctx.beginPath(); ctx.arc(ax, ay, 16, 0, Math.PI * 2);
    ctx.strokeStyle = challengeColor; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(ax, ay, 7, 0, Math.PI * 2);
    ctx.fillStyle = challengeColor; ctx.fill();

    if (!isRunRef.current) return;

    const ev = detectorRef.current.push(filteredY, Date.now());
    if (ev === 'step') {
      const newSteps = detectorRef.current.steps;
      stepsRef.current = newSteps;
      setSteps(newSteps);

      // Draw step count overlay
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      if (ctx.roundRect) ctx.roundRect(10, 10, 120, 52, 8); else ctx.rect(10, 10, 120, 52);
      ctx.fill();
      ctx.fillStyle = challengeColor; ctx.font = 'bold 34px monospace'; ctx.fillText(newSteps, 18, 50);
      ctx.fillStyle = '#94a3b8'; ctx.font = '10px system-ui'; ctx.fillText(`/ ${goalRef.current} stappen`, 18, 62);

      // Finished?
      if (newSteps >= goalRef.current) {
        const finishTime = Date.now() - startTimeRef.current;
        isRunRef.current = false;
        clearInterval(timerRef.current);
        releaseWakeLock();
        setFinalTimeMs(finishTime);
        setElapsedMs(finishTime);
        setPhase('done');
        playFinishSignal();
      }
    }
  }, [challengeColor, releaseWakeLock]);

  // ── Flip camera ───────────────────────────────────────────────────────────
  const flipCamera = useCallback(() => {
    stopCamera();
    setCameraReady(false);
    setFacingMode(p => p === 'environment' ? 'user' : 'environment');
  }, [stopCamera]);

  useEffect(() => {
    if (phase === 'camera') { setCameraReady(false); initCamera(); }
  }, [facingMode]); // eslint-disable-line

  // ── Go to camera screen ───────────────────────────────────────────────────
  const goToCamera = useCallback(() => {
    detectorRef.current.reset(); kalmanRef.current.reset();
    stepsRef.current = 0; setSteps(0); setElapsedMs(0); setSavedOk(false);
    setPhase('camera');
    initCamera();
  }, [initCamera]);

  // ── Stop running challenge ────────────────────────────────────────────────
  const stopChallenge = useCallback(() => {
    isRunRef.current = false;
    clearInterval(timerRef.current);
    releaseWakeLock();
    setPhase('camera');
    stepsRef.current = 0;
    setSteps(0); setElapsedMs(0);
    detectorRef.current.reset(); kalmanRef.current.reset();
  }, [releaseWakeLock]);

  // ── Start countdown ───────────────────────────────────────────────────────
  const startCountdown = useCallback(() => {
    setPhase('countdown');
    let count = countdownSecs;
    setCountdownNum(count);
    playCountdownBeep();

    const tick = setInterval(() => {
      count--;
      if (count > 0) {
        setCountdownNum(count);
        playCountdownBeep();
      } else {
        clearInterval(tick);
        setCountdownNum(0);
        setTimeout(() => {
          playStartSignal();
          detectorRef.current.reset(); detectorRef.current.config = { ...detCfgRef.current };
          kalmanRef.current.reset();
          stepsRef.current = 0; setSteps(0);
          startTimeRef.current = Date.now();
          isRunRef.current = true;
          goalRef.current  = effectiveGoal;
          setPhase('running');
          requestWakeLock();
          timerRef.current = setInterval(() => {
            setElapsedMs(Date.now() - startTimeRef.current);
          }, 50);
        }, 400);
      }
    }, 1000);
  }, [countdownSecs, effectiveGoal, requestWakeLock]);

  // ── Save result ───────────────────────────────────────────────────────────
  const saveResult = useCallback(async () => {
    if (!memberContext) return;
    setSaving(true);
    try {
      // Resolve current seasonId
      const sn = seasons.find(s => {
        const now = today();
        return s.startDate <= now && (!s.endDate || s.endDate >= now);
      });

      const participant = participantType === 'visitor'
        ? { type: 'visitor', visitorName: visitor.firstName.trim(), visitorLastName: visitor.lastName.trim(), visitorAge: visitor.ageCategory }
        : { type: 'member', memberId: selectedParticipant?.memberId || null, firstName: selectedParticipant?.firstName, lastName: selectedParticipant?.lastName };

      const groupName = groups.find(g => g.id === selectedGroup)?.name || '';

      await SpeedChallengeFactory.create(memberContext.clubId, {
        ...participant,
        groupId:        selectedGroup  || null,
        groupName,
        challengeSteps: effectiveGoal,
        timeMs:         finalTimeMs,
        seasonId:       sn?.id || null,
        date:           today(),
        countedByMemberId: memberContext.memberId,
      });
      setSavedOk(true);
    } catch (e) {
      console.error('[SpeedChallenge] save:', e);
    } finally {
      setSaving(false);
    }
  }, [memberContext, participantType, visitor, selectedParticipant, selectedGroup, groups, seasons, effectiveGoal, finalTimeMs]);

  // ── Reset to setup ────────────────────────────────────────────────────────
  const resetToSetup = useCallback(() => {
    stopCamera();
    isRunRef.current = false;
    stepsRef.current = 0;
    setPhase('setup');
    setCameraReady(false);
    setSteps(0); setElapsedMs(0); setFinalTimeMs(0);
    setSavedOk(false);
    setCountdownNum(countdownSecs);
  }, [stopCamera, countdownSecs]);

  // ── Validation ────────────────────────────────────────────────────────────
  const canStart = (() => {
    if (effectiveGoal < 1) return false;
    if (participantType === 'visitor' && !visitor.firstName.trim()) return false;
    if (participantType === 'member' && !selectedParticipant) return false;
    return true;
  })();

  const participantLabel = participantType === 'visitor'
    ? `${visitor.firstName} ${visitor.lastName}`.trim() || 'Bezoeker'
    : selectedParticipant
      ? `${selectedParticipant.firstName} ${selectedParticipant.lastName}`
      : 'Niemand geselecteerd';

  if (!bootstrapDone) {
    return (
      <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{pageCSS}</style>
        <div style={{ width: '32px', height: '32px', border: '3px solid #1e293b', borderTop: '3px solid #f97316', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'system-ui, sans-serif', paddingBottom: '80px' }}>
      <style>{pageCSS}</style>

      {/* ── Header ── */}
      <header style={{ backgroundColor: '#1e293b', borderBottom: '1px solid #334155', padding: '10px 16px', position: 'sticky', top: 0, zIndex: 100, display: 'flex', alignItems: 'center', gap: '12px' }}>
        {phase !== 'setup' && phase !== 'camera' && tab === 'challenge' ? (
          <button onClick={resetToSetup} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px', display: 'flex' }}>
            <ArrowLeft size={20} />
          </button>
        ) : (
          <a href="/live" style={{ display: 'flex', alignItems: 'center', color: '#64748b', textDecoration: 'none' }}>
            <ArrowLeft size={20} />
          </a>
        )}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '34px', height: '34px', borderRadius: '9px', backgroundColor: '#f9731622', border: '1px solid #f9731644', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Timer size={17} color="#f97316" />
          </div>
          <div>
            <div style={{ fontWeight: '800', fontSize: '15px', color: '#f1f5f9' }}>Speed Challenge</div>
            <div style={{ fontSize: '11px', color: '#475569' }}>Hoe snel haal jij jouw doel?</div>
          </div>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', backgroundColor: '#0f172a', borderRadius: '8px', padding: '2px', border: '1px solid #334155' }}>
          {[
            { key: 'challenge', icon: Timer   },
            { key: 'leaderboard', icon: Trophy },
          ].map(t => {
            const Icon   = t.icon;
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                width: '36px', height: '30px', borderRadius: '6px', border: 'none',
                backgroundColor: active ? '#1e293b' : 'transparent',
                color: active ? '#f97316' : '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={14} />
              </button>
            );
          })}
        </div>
      </header>

      {/* ─────────────────── LEADERBOARD TAB ─────────────────── */}
      {tab === 'leaderboard' && (
        <div style={{ maxWidth: '640px', margin: '0 auto', padding: '16px' }}>
          <Leaderboard clubId={memberContext?.clubId} groups={groups} seasons={seasons} />
        </div>
      )}

      {/* ─────────────────── CHALLENGE TAB ─────────────────── */}
      {tab === 'challenge' && (
        <div style={{ maxWidth: '640px', margin: '0 auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* ── SETUP PHASE ── */}
          {phase === 'setup' && (
            <>
              {/* Challenge selector */}
              <section style={sectionStyle}>
                <div style={sectionTitle}>🎯 Kies je challenge</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '10px' }}>
                  {CHALLENGES.map(c => {
                    const active = !useCustom && challengeSteps === c.steps;
                    return (
                      <button key={c.steps} onClick={() => { setUseCustom(false); setChallengeSteps(c.steps); }}
                        style={{
                          padding: '14px 8px', borderRadius: '12px', fontFamily: 'inherit', cursor: 'pointer',
                          border: `2px solid ${active ? c.color : '#334155'}`,
                          backgroundColor: active ? c.color + '22' : '#0f172a',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                          transition: 'all 0.12s',
                        }}
                      >
                        <span style={{ fontSize: '26px', fontWeight: '900', color: active ? c.color : '#64748b', lineHeight: 1 }}>{c.steps}</span>
                        <span style={{ fontSize: '10px', color: active ? c.color : '#475569', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.3px' }}>stappen</span>
                      </button>
                    );
                  })}
                </div>

                {/* Custom */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button onClick={() => setUseCustom(p => !p)} style={{
                    padding: '8px 14px', borderRadius: '8px', fontFamily: 'inherit', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
                    border: `1px solid ${useCustom ? '#f59e0b' : '#334155'}`,
                    backgroundColor: useCustom ? '#f59e0b22' : 'transparent',
                    color: useCustom ? '#f59e0b' : '#64748b',
                  }}>
                    ✏️ Eigen aantal
                  </button>
                  {useCustom && (
                    <input
                      type="number" min="1" max="9999" value={customSteps}
                      onChange={e => setCustomSteps(e.target.value)}
                      placeholder="bv. 75"
                      style={{ ...inputStyle, width: '100px', textAlign: 'center', fontSize: '16px', fontWeight: '700' }}
                      autoFocus
                    />
                  )}
                  {useCustom && customSteps && (
                    <span style={{ fontSize: '13px', color: '#f59e0b', fontWeight: '700' }}>= {customSteps} stappen</span>
                  )}
                </div>
              </section>

              {/* Participant */}
              <section style={sectionStyle}>
                <div style={sectionTitle}>👤 Voor wie?</div>

                {/* Type toggle */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
                  {[
                    { key: 'member',  label: 'Lid',      icon: Users },
                    { key: 'visitor', label: 'Bezoeker', icon: User  },
                  ].map(opt => {
                    const Icon   = opt.icon;
                    const active = participantType === opt.key;
                    return (
                      <button key={opt.key} onClick={() => { setParticipantType(opt.key); setSelectedParticipant(null); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 16px', borderRadius: '8px', fontFamily: 'inherit', cursor: 'pointer',
                          border: `1.5px solid ${active ? '#3b82f6' : '#334155'}`,
                          backgroundColor: active ? '#3b82f622' : 'transparent',
                          color: active ? '#60a5fa' : '#64748b',
                          fontSize: '13px', fontWeight: active ? '700' : '500',
                        }}
                      >
                        <Icon size={14} /> {opt.label}
                      </button>
                    );
                  })}
                </div>

                {/* Group selector (only for member) */}
                {participantType === 'member' && groups.length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={labelStyle}>Groep</div>
                    <select value={selectedGroup} onChange={e => { setSelectedGroup(e.target.value); setSelectedParticipant(null); }} style={selectStyle}>
                      <option value="">— Kies een groep —</option>
                      {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>
                )}

                {/* Skipper picker */}
                {participantType === 'member' && selectedGroup && (
                  <SkipperPicker
                    currentUser={currentUser}
                    clubId={memberContext?.clubId}
                    groupId={selectedGroup}
                    onSelect={setSelectedParticipant}
                    selected={selectedParticipant}
                  />
                )}

                {/* Visitor form */}
                {participantType === 'visitor' && (
                  <VisitorForm value={visitor} onChange={setVisitor} />
                )}
              </section>

              {/* Instellingen: aftellen + detectie */}
              <section style={sectionStyle}>
                <div style={sectionTitle}>⚙️ Instellingen</div>

                {/* Countdown duur */}
                <div>
                  <div style={labelStyle}>Aftellen (seconden)</div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[3, 5, 10].map(s => {
                      const active = countdownSecs === s;
                      return (
                        <button key={s} onClick={() => setCountdownSecs(s)} style={{
                          padding: '7px 16px', borderRadius: '8px', fontFamily: 'inherit', cursor: 'pointer',
                          border: `1.5px solid ${active ? '#60a5fa' : '#334155'}`,
                          backgroundColor: active ? '#3b82f622' : 'transparent',
                          color: active ? '#60a5fa' : '#64748b',
                          fontSize: '14px', fontWeight: active ? '800' : '500',
                        }}>
                          {s}s
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Detectie tuning (collapsed) */}
                <DetectionTuningPanel
                  config={detCfg}
                  onChange={p => setDetCfg(prev => ({ ...prev, ...p }))}
                />
              </section>

              {/* Start button */}
              <button
                onClick={goToCamera}
                disabled={!canStart}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                  padding: '16px', borderRadius: '14px', border: 'none', fontFamily: 'inherit',
                  backgroundColor: canStart ? challengeColor : '#1e293b',
                  color: canStart ? 'white' : '#334155',
                  fontSize: '16px', fontWeight: '800', cursor: canStart ? 'pointer' : 'not-allowed',
                  transition: 'all 0.15s',
                  boxShadow: canStart ? `0 0 24px ${challengeColor}44` : 'none',
                }}
              >
                <Camera size={20} />
                Camera starten
                <ChevronRight size={18} />
              </button>

              {!canStart && participantType === 'member' && !selectedParticipant && (
                <div style={{ fontSize: '12px', color: '#475569', textAlign: 'center' }}>
                  {!selectedGroup ? 'Kies eerst een groep en skipper.' : 'Kies een skipper om door te gaan.'}
                </div>
              )}
            </>
          )}

          {/* ── CAMERA PHASE ── */}
          {(phase === 'camera' || phase === 'countdown' || phase === 'running') && (
            <>
              {/* Participant + challenge bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#1e293b', borderRadius: '10px', border: `1px solid ${challengeColor}33`, padding: '10px 14px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: challengeColor + '22', border: `1px solid ${challengeColor}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: challengeColor, flexShrink: 0 }}>
                  {participantLabel.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{participantLabel}</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                    {participantType === 'visitor' && visitor.ageCategory ? `${AGE_LABELS[visitor.ageCategory]} · ` : ''}
                    Challenge: <span style={{ color: challengeColor, fontWeight: '700' }}>{effectiveGoal} stappen</span>
                  </div>
                </div>
                {phase === 'running' && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '24px', fontWeight: '900', color: '#f1f5f9', fontFamily: 'monospace', lineHeight: 1 }}>{fmtTime(elapsedMs)}</div>
                    <div style={{ fontSize: '9px', color: '#64748b', fontWeight: '700' }}>TIJD</div>
                  </div>
                )}
              </div>

              {/* Camera view */}
              <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', backgroundColor: '#000', borderRadius: '16px', border: `1px solid ${challengeColor}44`, overflow: 'hidden' }}>
                <video ref={videoRef} style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} playsInline muted />
                <canvas ref={canvasRef} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />

                {/* Loading overlay */}
                {backendLoading && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.7)', gap: '12px' }}>
                    <div style={{ width: '36px', height: '36px', border: `3px solid #1e293b`, borderTop: `3px solid ${challengeColor}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    <span style={{ fontSize: '13px', color: '#64748b' }}>Camera laden…</span>
                  </div>
                )}

                {/* Error */}
                {backendError && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.8)', padding: '24px', textAlign: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '13px', color: '#ef4444' }}>{backendError}</span>
                    <button onClick={() => { setCameraReady(false); initCamera(); }} style={{ ...btnPrimary, backgroundColor: '#ef4444' }}>Opnieuw proberen</button>
                  </div>
                )}

                {/* Countdown */}
                {phase === 'countdown' && <CountdownOverlay count={countdownNum} />}

                {/* Steps overlay during run */}
                {phase === 'running' && (
                  <div style={{ position: 'absolute', top: '10px', right: '10px', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: '10px', padding: '8px 14px', textAlign: 'center', backdropFilter: 'blur(4px)' }}>
                    <div style={{ fontSize: '40px', fontWeight: '900', color: challengeColor, lineHeight: 1, fontFamily: 'monospace' }}>{steps}</div>
                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '700' }}>/ {effectiveGoal}</div>
                    {/* Progress bar */}
                    <div style={{ width: '60px', height: '4px', backgroundColor: '#334155', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', backgroundColor: challengeColor, width: `${Math.min(100, (steps / effectiveGoal) * 100)}%`, transition: 'width 0.15s', borderRadius: '2px' }} />
                    </div>
                  </div>
                )}

                {/* Flip camera button */}
                {!backendLoading && !backendError && phase === 'camera' && (
                  <button onClick={flipCamera} style={{ position: 'absolute', top: '10px', left: '10px', width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FlipHorizontal size={16} />
                  </button>
                )}
              </div>

              {/* Camera ready — big START button */}
              {phase === 'camera' && cameraReady && !backendLoading && !backendError && (
                <button onClick={startCountdown} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
                  padding: '18px', borderRadius: '16px', border: 'none', fontFamily: 'inherit',
                  backgroundColor: challengeColor, color: 'white',
                  fontSize: '20px', fontWeight: '900', cursor: 'pointer',
                  boxShadow: `0 0 32px ${challengeColor}66`,
                  animation: 'pulseGlow 2s ease-in-out infinite',
                }}>
                  <Play size={24} fill="white" />
                  START
                </button>
              )}

              {/* Cancel */}
              {phase !== 'running' && (
                <button onClick={resetToSetup} style={{ ...btnGhost, alignSelf: 'center' }}>
                  <ArrowLeft size={14} /> Terug naar setup
                </button>
              )}

              {/* Stop button during run */}
              {phase === 'running' && (
                <button onClick={stopChallenge} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                  padding: '16px', borderRadius: '14px', border: 'none', fontFamily: 'inherit',
                  backgroundColor: '#ef4444', color: 'white',
                  fontSize: '16px', fontWeight: '800', cursor: 'pointer',
                  boxShadow: '0 0 20px #ef444466',
                }}>
                  <Square size={20} fill="white" />
                  STOP
                </button>
              )}
            </>
          )}

          {/* ── DONE PHASE ── */}
          {phase === 'done' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Result card */}
              <div style={{
                backgroundColor: '#1e293b', borderRadius: '20px',
                border: `2px solid ${challengeColor}44`,
                padding: '28px 24px', textAlign: 'center',
                animation: 'fadeUp 0.4s ease-out',
                boxShadow: `0 0 48px ${challengeColor}22`,
              }}>
                <div style={{ fontSize: '48px', marginBottom: '8px' }}>🏆</div>
                <div style={{ fontSize: '14px', color: '#64748b', fontWeight: '600', marginBottom: '4px' }}>
                  {effectiveGoal} stappen in
                </div>
                <div style={{ fontSize: '64px', fontWeight: '900', color: challengeColor, lineHeight: 1, fontFamily: 'monospace', letterSpacing: '-2px' }}>
                  {fmtTime(finalTimeMs)}
                </div>
                <div style={{ marginTop: '16px', fontSize: '16px', fontWeight: '700', color: '#f1f5f9' }}>
                  {participantLabel}
                </div>
                {participantType === 'visitor' && visitor.ageCategory && (
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>{AGE_LABELS[visitor.ageCategory]}</div>
                )}
              </div>

              {/* Save */}
              {memberContext && (
                !savedOk ? (
                  <button onClick={saveResult} disabled={saving} style={{ ...btnPrimary, justifyContent: 'center', opacity: saving ? 0.65 : 1, backgroundColor: challengeColor, boxShadow: `0 0 20px ${challengeColor}44` }}>
                    {saving
                      ? <><RefreshCw size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> Opslaan…</>
                      : <><Star size={16} /> Opslaan in leaderboard</>
                    }
                  </button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '14px', backgroundColor: '#22c55e22', border: '1px solid #22c55e44', borderRadius: '12px', color: '#22c55e', fontWeight: '700' }}>
                    <CheckCircle2 size={18} /> Opgeslagen!
                  </div>
                )
              )}

              <div style={{ display: 'flex', gap: '10px' }}>
                {/* Opnieuw met zelfde setup */}
                <button onClick={() => {
                  isRunRef.current = false;
                  stepsRef.current = 0;
                  setSteps(0); setElapsedMs(0); setFinalTimeMs(0); setSavedOk(false);
                  setCountdownNum(3); setPhase('camera');
                  detectorRef.current.reset(); kalmanRef.current.reset();
                  startCountdown();
                }} style={{ ...btnPrimary, flex: 1, justifyContent: 'center', backgroundColor: '#334155', boxShadow: 'none' }}>
                  <RefreshCw size={16} /> Opnieuw
                </button>
                <button onClick={() => { setTab('leaderboard'); resetToSetup(); }} style={{ ...btnGhost, flex: 1, justifyContent: 'center' }}>
                  <Trophy size={16} /> Leaderboard
                </button>
              </div>

              <button onClick={resetToSetup} style={{ ...btnGhost, justifyContent: 'center' }}>
                <ArrowLeft size={14} /> Nieuwe challenge
              </button>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: '8px',
  border: '1px solid #334155', backgroundColor: '#0f172a',
  color: 'white', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box',
  outline: 'none',
};
const selectStyle = {
  ...inputStyle, cursor: 'pointer',
};
const labelStyle = {
  fontSize: '11px', fontWeight: '700', color: '#64748b',
  textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px',
};
const sectionStyle = {
  backgroundColor: '#1e293b', borderRadius: '14px', border: '1px solid #334155', padding: '16px',
  display: 'flex', flexDirection: 'column', gap: '12px',
};
const sectionTitle = {
  fontSize: '14px', fontWeight: '800', color: '#f1f5f9',
};
const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: '8px',
  padding: '12px 18px', backgroundColor: '#3b82f6', border: 'none',
  borderRadius: '10px', color: 'white', fontWeight: '700', fontSize: '14px',
  cursor: 'pointer', fontFamily: 'inherit',
};
const btnGhost = {
  display: 'inline-flex', alignItems: 'center', gap: '6px',
  padding: '10px 14px', backgroundColor: 'transparent',
  border: '1px solid #334155', borderRadius: '10px',
  color: '#64748b', fontWeight: '600', fontSize: '13px',
  cursor: 'pointer', fontFamily: 'inherit',
};

const pageCSS = `
  * { box-sizing: border-box; }
  @keyframes spin    { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes fadeUp  { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes countPop { from { transform: scale(0.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  @keyframes pulseGlow { 0%,100% { box-shadow: 0 0 24px var(--gc,#f97316)88; } 50% { box-shadow: 0 0 48px var(--gc,#f97316)cc; } }
  select option { background-color: #1e293b; }
`;
