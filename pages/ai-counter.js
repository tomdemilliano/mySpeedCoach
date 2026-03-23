/**
 * pages/ai-counter.js  —  AI Stapteller (Beta)
 *
 * Pluggable pose-detection backend architecture.
 * Each backend delivers a normalised ankle position per frame;
 * the StepDetector is completely backend-agnostic.
 *
 * Available backends (all run fully client-side, no server):
 *   • mediapipe   – MediaPipe BlazePose 0.5  (33 kp, best single-person tracking)
 *   • movenet-l   – TF.js MoveNet Lightning  (17 kp, fastest ~50+ FPS)
 *   • movenet-t   – TF.js MoveNet Thunder    (17 kp, more accurate ~30 FPS)
 *   • posenet     – TF.js PoseNet            (17 kp, widest hardware support)
 *
 * Not included (not browser-native without a server):
 *   • YOLO variants  – PyTorch/ONNX, no stable CDN-loadable browser package
 *   • OpenPose       – GPU C++, no browser port
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ClubMemberFactory, UserMemberLinkFactory, UserFactory,
  ClubFactory, GroupFactory,
} from '../constants/dbSchema';
import { useDisciplines } from '../hooks/useDisciplines';
import {
  ArrowLeft, Camera, Upload, FlipHorizontal, Play, Square,
  Zap, AlertTriangle, CheckCircle2, RefreshCw, Eye, EyeOff,
  Trophy, Info, Video, SlidersHorizontal, ChevronDown, ChevronUp,
  Users, Cpu,
} from 'lucide-react';

// ─── CDN URLs ─────────────────────────────────────────────────────────────────
const TFJS_CORE  = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core@4.17.0/dist/tf-core.min.js';
const TFJS_CONV  = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-converter@4.17.0/dist/tf-converter.min.js';
const TFJS_WEBGL = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl@4.17.0/dist/tf-backend-webgl.min.js';
const TFJS_POSE  = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js';
const MP_POSE    = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose.js';
const MP_CAMERA  = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3.1675466862/camera_utils.js';
const MP_DRAWING = 'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils@0.3.1675466124/drawing_utils.js';

// ─── Backend definitions ──────────────────────────────────────────────────────
// Ankle keypoint indices:
//   MediaPipe  left=27  right=28  (coords normalised 0-1)
//   TF.js      left=15  right=16  (coords in pixels; we normalise after)
export const BACKENDS = {
  'mediapipe': {
    id: 'mediapipe', label: 'MediaPipe BlazePose',
    sublabel: '33 kp · beste tracking · ~25 FPS', color: '#3b82f6',
    ankleLeft: 27, ankleRight: 28, coordMode: 'normalised',
  },
  'movenet-l': {
    id: 'movenet-l', label: 'MoveNet Lightning',
    sublabel: '17 kp · snelst · 50+ FPS', color: '#22c55e',
    ankleLeft: 15, ankleRight: 16, coordMode: 'pixel',
    tfjsModel: 'MoveNet',
    tfjsConfig: () => ({ modelType: window.poseDetection?.movenet?.modelType?.SINGLEPOSE_LIGHTNING }),
  },
  'movenet-t': {
    id: 'movenet-t', label: 'MoveNet Thunder',
    sublabel: '17 kp · nauwkeuriger · ~30 FPS', color: '#f59e0b',
    ankleLeft: 15, ankleRight: 16, coordMode: 'pixel',
    tfjsModel: 'MoveNet',
    tfjsConfig: () => ({ modelType: window.poseDetection?.movenet?.modelType?.SINGLEPOSE_THUNDER }),
  },
  'posenet': {
    id: 'posenet', label: 'PoseNet',
    sublabel: '17 kp · brede HW-ondersteuning', color: '#a78bfa',
    ankleLeft: 15, ankleRight: 16, coordMode: 'pixel',
    tfjsModel: 'PoseNet',
    tfjsConfig: () => ({}),
  },
};

// Cache TF.js detector instances so switching back doesn't reload the model
const _tfjsCache = {};

// ─── Script loader ────────────────────────────────────────────────────────────
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.crossOrigin = 'anonymous';
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

// ─── Backend loader (lazy, cached) ───────────────────────────────────────────
async function loadBackend(backendId) {
  const def = BACKENDS[backendId];
  if (!def) throw new Error('Unknown backend: ' + backendId);

  if (backendId === 'mediapipe') {
    await Promise.all([loadScript(MP_POSE), loadScript(MP_CAMERA), loadScript(MP_DRAWING)]);
    return null; // MediaPipe detector created per-session
  }

  // TF.js path (serial loads to avoid race conditions)
  await loadScript(TFJS_CORE);
  await loadScript(TFJS_CONV);
  await loadScript(TFJS_WEBGL);
  await loadScript(TFJS_POSE);
  if (!window.poseDetection) throw new Error('TF.js pose-detection not available');

  if (_tfjsCache[backendId]) return _tfjsCache[backendId];
  const model    = window.poseDetection.SupportedModels[def.tfjsModel];
  const detector = await window.poseDetection.createDetector(model, def.tfjsConfig());
  _tfjsCache[backendId] = detector;
  return detector;
}

// ─── Default detection config ─────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  peakMinProminence:  0.012,
  peakMinIntervalMs: 120,
  missGapMs:         600,
};

// ─── Step Detector ────────────────────────────────────────────────────────────
class StepDetector {
  constructor(config = DEFAULT_CONFIG) { this.config = { ...DEFAULT_CONFIG, ...config }; this.reset(); }
  updateConfig(c) { this.config = { ...this.config, ...c }; }
  reset() {
    this.signal = []; this.steps = 0; this.misses = 0;
    this.lastStepTime = 0; this.lastMissTime = 0;
    this.inPeak = false; this.peakY = null; this.valleyY = null; this.sessionStart = null;
  }
  push(y, t) {
    if (!this.sessionStart) this.sessionStart = t;
    this.signal.push({ y, t });
    if (this.signal.length > 90) this.signal.shift();
    return this._detect(y, t);
  }
  _detect(y, t) {
    const { peakMinProminence: P, peakMinIntervalMs: I, missGapMs: M } = this.config;
    if (this.signal.length < 5) return null;
    const avgY = this.signal.slice(-5).reduce((s, p) => s + p.y, 0) / 5;
    if (this.valleyY === null) { this.valleyY = avgY; return null; }
    if (!this.inPeak && (this.valleyY - avgY) > P) { this.inPeak = true; this.peakY = avgY; }
    if (this.inPeak) {
      if (avgY < this.peakY) this.peakY = avgY;
      if (avgY > this.peakY + P * 0.8) {
        this.inPeak = false; this.valleyY = avgY;
        if ((this.valleyY - this.peakY) >= P) {
          const dt = t - this.lastStepTime;
          if (dt >= I) {
            if (this.lastStepTime > 0 && dt > M * 1.5 && dt < 8000) { this.misses++; this.lastMissTime = t; }
            this.steps++; this.lastStepTime = t; return 'step';
          }
        }
        return null;
      }
    } else if (avgY > this.valleyY) { this.valleyY = avgY * 0.9 + this.valleyY * 0.1; }
    if (this.lastStepTime > 0 && (t - this.lastStepTime) > M * 2 && !this.inPeak &&
        this.lastMissTime < this.lastStepTime && this.steps > 3) {
      this.misses++; this.lastMissTime = t; return 'miss';
    }
    return null;
  }
  get elapsedMs() { return this.sessionStart ? Date.now() - this.sessionStart : 0; }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const COOKIE_KEY = 'msc_uid';
const getCookie = () => {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`));
  return m ? m[1] : null;
};
const fmtTime = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function waitForVideoReady(video, ms = 12000) {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 3 && video.videoWidth > 0) { resolve(); return; }
    const t = setTimeout(() => { video.removeEventListener('canplay', ch); video.removeEventListener('loadeddata', ch); reject(new Error('timeout')); }, ms);
    const ch = () => { if (video.readyState >= 3 && video.videoWidth > 0) { clearTimeout(t); video.removeEventListener('canplay', ch); video.removeEventListener('loadeddata', ch); resolve(); } };
    video.addEventListener('canplay', ch); video.addEventListener('loadeddata', ch);
  });
}

// ─── Backend Selector ─────────────────────────────────────────────────────────
function BackendSelector({ value, onChange, disabled, loadingId }) {
  return (
    <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '12px 14px' }}>
      <div style={{ fontSize: '10px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Cpu size={11} /> AI-detectiemodel
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {Object.values(BACKENDS).map(b => {
          const sel = value === b.id;
          const ldr = loadingId === b.id;
          return (
            <button key={b.id} onClick={() => !disabled && !ldr && onChange(b.id)} disabled={disabled}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '9px',
                cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit', textAlign: 'left',
                border: `1.5px solid ${sel ? b.color : '#334155'}`,
                backgroundColor: sel ? `${b.color}18` : 'transparent',
                opacity: disabled && !sel ? 0.45 : 1, transition: 'all 0.12s' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0,
                backgroundColor: ldr ? 'transparent' : b.color,
                border: ldr ? `2px solid ${b.color}` : 'none',
                animation: ldr ? 'spin 0.8s linear infinite' : 'none' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: sel ? '700' : '500', color: sel ? '#f1f5f9' : '#94a3b8' }}>
                  {b.label}
                  {sel && !ldr && <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: '700', color: b.color, backgroundColor: `${b.color}22`, borderRadius: '6px', padding: '1px 6px' }}>ACTIEF</span>}
                  {ldr && <span style={{ marginLeft: '6px', fontSize: '10px', color: '#64748b' }}>laden…</span>}
                </div>
                <div style={{ fontSize: '10px', color: '#475569', marginTop: '1px' }}>{b.sublabel}</div>
              </div>
              {sel && !ldr && <CheckCircle2 size={14} color={b.color} style={{ flexShrink: 0 }} />}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: '10px', fontSize: '10px', color: '#334155', lineHeight: 1.5 }}>
        Model wordt de eerste keer geladen van CDN (~1–5 MB). Daarna gecached in de browser.
        YOLO &amp; OpenPose zijn niet browser-compatibel zonder server.
      </div>
    </div>
  );
}

// ─── Miss Flash ───────────────────────────────────────────────────────────────
function MissFlash({ visible }) {
  if (!visible) return null;
  return <div style={{ position: 'absolute', inset: 0, borderRadius: '16px', border: '3px solid #ef4444', background: 'rgba(239,68,68,0.08)', pointerEvents: 'none', animation: 'missFlash 0.5s ease-out forwards', zIndex: 20 }} />;
}

// ─── Detection Tuning Panel ───────────────────────────────────────────────────
function DetectionTuningPanel({ config, onChange, signalHistory }) {
  const [open, setOpen] = useState(false);
  const gRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const canvas = gRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(0, (h / 4) * i); ctx.lineTo(w, (h / 4) * i); ctx.stroke(); }
    if (!signalHistory || signalHistory.length < 2) return;
    const vals = signalHistory.map(p => p.y);
    const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 0.01;
    const ty = h - ((config.peakMinProminence / (rng + config.peakMinProminence)) * h * 0.8 + h * 0.1);
    ctx.strokeStyle = '#f59e0b44'; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(w, ty); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = '#00d4aa'; ctx.lineWidth = 2; ctx.beginPath();
    signalHistory.forEach((p, i) => {
      const x = (i / (signalHistory.length - 1)) * w;
      const y = h - ((p.y - mn) / rng) * h * 0.85 - h * 0.075;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }); ctx.stroke();
  }, [signalHistory, open, config.peakMinProminence]);

  const sliders = [
    { key: 'peakMinProminence', label: 'Pieksensitiviteit',  hint: 'Hoe groot de beweging. Lager = gevoeliger.',         min: 0.003, max: 0.05,  step: 0.001, fmt: v => v.toFixed(3) },
    { key: 'peakMinIntervalMs', label: 'Min. interval (ms)', hint: 'Min. tijd tussen stappen. Verhoog bij dubbeltelling.', min: 60,    max: 400,   step: 10,    fmt: v => `${v} ms` },
    { key: 'missGapMs',         label: 'Mist-drempel (ms)',  hint: 'Hoe lang geen stap voor een mist.',                  min: 300,   max: 1200,  step: 50,    fmt: v => `${v} ms` },
  ];
  const presets = [
    { label: 'Snel (sprint)', config: { peakMinProminence: 0.008, peakMinIntervalMs: 80,  missGapMs: 450 } },
    { label: 'Normaal',       config: { peakMinProminence: 0.012, peakMinIntervalMs: 120, missGapMs: 600 } },
    { label: 'Langzaam / DD', config: { peakMinProminence: 0.018, peakMinIntervalMs: 180, missGapMs: 900 } },
  ];

  return (
    <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ width: '100%', padding: '12px 14px', background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'inherit' }}>
        <SlidersHorizontal size={15} color="#60a5fa" />
        <span style={{ flex: 1, textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#f1f5f9' }}>Detectie-instellingen</span>
        <span style={{ fontSize: '10px', color: '#475569', marginRight: '6px' }}>Aanpassen voor betere nauwkeurigheid</span>
        {open ? <ChevronUp size={14} color="#64748b" /> : <ChevronDown size={14} color="#64748b" />}
      </button>
      {open && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid #1e293b' }}>
          <div style={{ marginBottom: '14px', paddingTop: '12px' }}>
            <div style={{ fontSize: '10px', color: '#475569', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '7px' }}>Snelkeuze</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {presets.map(p => <button key={p.label} onClick={() => onChange(p.config)} style={{ padding: '5px 11px', borderRadius: '14px', border: '1px solid #334155', background: 'transparent', color: '#94a3b8', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>{p.label}</button>)}
              <button onClick={() => onChange(DEFAULT_CONFIG)} style={{ padding: '5px 11px', borderRadius: '14px', border: '1px solid #334155', background: 'transparent', color: '#64748b', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>Reset</button>
            </div>
          </div>
          {sliders.map(sl => (
            <div key={sl.key} style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#94a3b8' }}>{sl.label}</span>
                <span style={{ fontSize: '12px', fontWeight: '700', color: '#60a5fa', fontFamily: 'monospace' }}>{sl.fmt(config[sl.key])}</span>
              </div>
              <input type="range" min={sl.min} max={sl.max} step={sl.step} value={config[sl.key]}
                onChange={e => onChange({ [sl.key]: Number(e.target.value) })} style={{ width: '100%', accentColor: '#3b82f6' }} />
              <div style={{ fontSize: '10px', color: '#475569', marginTop: '3px' }}>{sl.hint}</div>
            </div>
          ))}
          <div style={{ marginTop: '6px' }}>
            <div style={{ fontSize: '10px', color: '#475569', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
              Live enkelsignaal <span style={{ color: '#f59e0b' }}>— gele lijn = drempel</span>
            </div>
            <canvas ref={gRef} width={320} height={80}
              style={{ width: '100%', height: '80px', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b', display: 'block' }} />
            {(!signalHistory || signalHistory.length < 5) && <div style={{ fontSize: '10px', color: '#334155', textAlign: 'center', marginTop: '4px' }}>Start een sessie om het signaal te zien</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Skipper Picker ────────────────────────────────────────────────────────────
const lSt  = { fontSize: '10px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' };
const cSt  = { padding: '5px 12px', borderRadius: '14px', border: '1px solid #334155', background: 'transparent', color: '#64748b', fontSize: '12px', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit' };
const cAct = { borderColor: '#3b82f6', backgroundColor: '#3b82f622', color: '#60a5fa', fontWeight: '700' };
const scSt = { display: 'flex', alignItems: 'center', gap: '7px', padding: '6px 11px', borderRadius: '18px', border: '1px solid #334155', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' };
const scA  = { borderColor: '#3b82f6', backgroundColor: '#1e3a5f' };
const avSt = { width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', color: 'white', flexShrink: 0 };

function SkipperPicker({ counterUser, onSelect, selectedSkipper }) {
  const [clubs, setClubs] = useState([]);
  const [groups, setGroups] = useState([]);
  const [skippers, setSkippers] = useState([]);
  const [members, setMembers] = useState([]);
  const [clubId, setClubId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!counterUser) { setLoading(false); return; }
    let cancel = false;
    const go = async () => {
      try {
        if (counterUser.role === 'superadmin') {
          ClubFactory.getAll(cs => { if (!cancel) { setClubs(cs); if (cs.length === 1) setClubId(cs[0].id); setLoading(false); } });
          return;
        }
        const unsub = UserMemberLinkFactory.getForUser(counterUser.id, async profiles => {
          if (cancel) return;
          const ids = new Set(profiles.map(p => p.member.clubId));
          const snaps = await Promise.all([...ids].map(id => ClubFactory.getById(id)));
          const cs = snaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() }));
          setClubs(cs); if (cs.length === 1) setClubId(cs[0].id); setLoading(false);
        });
        return () => unsub();
      } catch { setLoading(false); }
    };
    go();
    return () => { cancel = true; };
  }, [counterUser]);

  useEffect(() => {
    if (!clubId) return;
    setGroupId(''); setSkippers([]);
    let cancel = false;
    const go = async () => {
      const all = await GroupFactory.getGroupsByClubOnce(clubId);
      const cache = {};
      await Promise.all(all.map(async g => { cache[g.id] = await GroupFactory.getMembersByGroupOnce(clubId, g.id); }));
      if (cancel) return;
      const f = all.filter(g => cache[g.id]?.some(m => m.isSkipper));
      setGroups(f); if (f.length === 1) setGroupId(f[0].id);
    };
    go().catch(console.error);
    return () => { cancel = true; };
  }, [clubId]);

  useEffect(() => {
    if (!clubId || !groupId) return;
    const u1 = GroupFactory.getSkippersByGroup(clubId, groupId, setSkippers);
    const u2 = ClubMemberFactory.getAll(clubId, setMembers);
    return () => { u1(); u2(); };
  }, [clubId, groupId]);

  const resolve = async s => {
    const id = s.memberId || s.id;
    const p = members.find(m => m.id === id);
    return { memberId: id, clubId, firstName: p?.firstName || '?', lastName: p?.lastName || '' };
  };

  if (!counterUser) return <p style={{ fontSize: '11px', color: '#475569', margin: 0 }}>Log in om op te slaan.</p>;
  if (loading) return <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}><RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> Laden…</div>;
  if (clubs.length === 0) return <p style={{ fontSize: '11px', color: '#475569', margin: 0 }}>Geen clubs gevonden.</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {clubs.length > 1 && (
        <div><div style={lSt}>Club</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {clubs.map(c => <button key={c.id} onClick={() => setClubId(c.id)} style={{ ...cSt, ...(clubId === c.id ? cAct : {}) }}>{c.name}</button>)}
          </div>
        </div>
      )}
      {clubId && groups.length > 1 && (
        <div><div style={lSt}>Groep</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {groups.map(g => <button key={g.id} onClick={() => setGroupId(g.id)} style={{ ...cSt, ...(groupId === g.id ? cAct : {}) }}>{g.name}</button>)}
          </div>
        </div>
      )}
      {clubId && groupId && (
        <div><div style={lSt}>Skipper (optioneel)</div>
          {skippers.length === 0 ? <p style={{ fontSize: '12px', color: '#475569', margin: 0 }}>Geen skippers.</p> : (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button onClick={() => onSelect(null)} style={{ ...scSt, ...(selectedSkipper === null ? scA : {}) }}>
                <div style={{ ...avSt, backgroundColor: '#334155' }}>–</div>
                <span style={{ fontSize: '11px', color: '#64748b' }}>Geen</span>
              </button>
              {skippers.map(sk => {
                const mid = sk.memberId || sk.id;
                const p = members.find(m => m.id === mid);
                const fn = p?.firstName || '?', ln = p?.lastName || '';
                const init = `${fn[0] || '?'}${ln[0] || ''}`.toUpperCase();
                const ch = selectedSkipper?.memberId === mid;
                return (
                  <button key={mid} onClick={async () => onSelect(await resolve(sk))} style={{ ...scSt, ...(ch ? scA : {}) }}>
                    <div style={{ ...avSt, backgroundColor: ch ? '#3b82f6' : '#334155' }}>{init}</div>
                    <span style={{ fontSize: '11px', fontWeight: ch ? '700' : '400', color: ch ? '#f1f5f9' : '#94a3b8' }}>{fn} {ln}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {selectedSkipper && (
        <div style={{ fontSize: '11px', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <CheckCircle2 size={11} /> Sessie wordt opgeslagen bij {selectedSkipper.firstName} {selectedSkipper.lastName}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function AiCounterPage() {
  const [backendId,      setBackendId]      = useState('mediapipe');
  const [backendLoading, setBackendLoading] = useState(null);
  const [backendError,   setBackendError]   = useState('');

  const [mode,           setMode]           = useState('idle');
  const [facingMode,     setFacingMode]     = useState('environment');
  const [showOverlay,    setShowOverlay]    = useState(true);
  const [uploadFile,     setUploadFile]     = useState(null);
  const [uploadUrl,      setUploadUrl]      = useState('');
  const [codecError,     setCodecError]     = useState(false);
  const [isRunning,      setIsRunning]      = useState(false);
  const [steps,          setSteps]          = useState(0);
  const [misses,         setMisses]         = useState(0);
  const [elapsed,        setElapsed]        = useState(0);
  const [showMiss,       setShowMiss]       = useState(false);
  const [sessionDone,    setSessionDone]    = useState(false);
  const [finalSteps,     setFinalSteps]     = useState(0);
  const [finalMisses,    setFinalMisses]    = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [disciplineId,   setDisciplineId]   = useState('');
  const [sessionType,    setSessionType]    = useState('Training');
  const [trackedFoot,    setTrackedFoot]    = useState('left');
  const [counterUser,    setCounterUser]    = useState(null);
  const [selSkipper,     setSelSkipper]     = useState(null);
  const [saving,         setSaving]         = useState(false);
  const [savedOk,        setSavedOk]        = useState(false);
  const [detCfg,         setDetCfg]         = useState({ ...DEFAULT_CONFIG });
  const [signalHist,     setSignalHist]     = useState([]);

  const videoRef       = useRef(null);
  const canvasRef      = useRef(null);
  const uploadVideoRef = useRef(null);
  const fileInputRef   = useRef(null);
  const detectorRef    = useRef(new StepDetector(DEFAULT_CONFIG));
  const missTimerRef   = useRef(null);
  const elapsedRef     = useRef(null);
  const frameRef       = useRef(null);
  const isRunRef       = useRef(false);
  const trackedRef     = useRef(trackedFoot);
  const overlayRef     = useRef(showOverlay);
  const backendRef     = useRef(backendId);
  const mpPoseRef      = useRef(null);
  const mpCamRef       = useRef(null);

  useEffect(() => { trackedRef.current  = trackedFoot; }, [trackedFoot]);
  useEffect(() => { overlayRef.current  = showOverlay; }, [showOverlay]);
  useEffect(() => { backendRef.current  = backendId;   }, [backendId]);
  useEffect(() => { detectorRef.current.updateConfig(detCfg); }, [detCfg]);

  const { disciplines, getDisc } = useDisciplines();
  useEffect(() => {
    const uid = getCookie(); if (!uid) return;
    UserFactory.get(uid).then(s => { if (s.exists()) setCounterUser({ id: uid, ...s.data() }); });
  }, []);
  useEffect(() => { if (disciplines.length > 0 && !disciplineId) setDisciplineId(disciplines[0].id); }, [disciplines]);

  // ── Shared ankle processor — backend-agnostic ──────────────────────────
  // ankleX, ankleY are normalised 0-1. image is drawn to canvas if provided.
  const processAnkle = useCallback((ankleY, ankleX, image) => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0) return;
    const ctx = canvas.getContext('2d');
    if (image) { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height); }

    const ax = ankleX * canvas.width, ay = ankleY * canvas.height;
    ctx.beginPath(); ctx.arc(ax, ay, 18, 0, Math.PI * 2); ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(ax, ay, 8,  0, Math.PI * 2); ctx.fillStyle   = '#f59e0b'; ctx.fill();

    if (isRunRef.current) {
      const ev = detectorRef.current.push(ankleY, Date.now());
      setSignalHist(prev => { const n = [...prev, { y: ankleY, t: Date.now() }]; return n.length > 90 ? n.slice(-90) : n; });
      if (ev === 'step') setSteps(detectorRef.current.steps);
      if (ev === 'miss') {
        setMisses(detectorRef.current.misses); setShowMiss(true);
        clearTimeout(missTimerRef.current); missTimerRef.current = setTimeout(() => setShowMiss(false), 600);
      }
    }
    if (isRunRef.current) {
      const cnt = detectorRef.current.steps;
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.roundRect(12, 12, 110, 50, 10); ctx.fill();
      ctx.fillStyle = '#60a5fa'; ctx.font = 'bold 30px monospace'; ctx.fillText(cnt, 20, 48);
      ctx.fillStyle = '#94a3b8'; ctx.font = '10px system-ui'; ctx.fillText('STAPPEN', 20, 60);
    }
  }, []);

  // ── MediaPipe results callback ─────────────────────────────────────────
  const onMpResults = useCallback((results) => {
    const canvas = canvasRef.current; if (!canvas || canvas.width === 0) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (results.image) ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    if (!results.poseLandmarks) return;
    const lms = results.poseLandmarks;
    if (overlayRef.current && window.drawConnectors && window.POSE_CONNECTIONS) {
      ctx.globalAlpha = 0.6;
      window.drawConnectors(ctx, lms, window.POSE_CONNECTIONS, { color: '#00d4aa', lineWidth: 2 });
      window.drawLandmarks(ctx, lms, { color: '#fff', fillColor: '#00d4aa', lineWidth: 1, radius: 3 });
      ctx.globalAlpha = 1;
    }
    const idx = trackedRef.current === 'left' ? 27 : 28;
    const ank = lms[idx];
    if (ank && ank.visibility > 0.5) processAnkle(ank.y, ank.x, null);
  }, [processAnkle]);

  // ── TF.js frame processing ─────────────────────────────────────────────
  const processTfjsFrame = useCallback(async (videoEl) => {
    const canvas = canvasRef.current; if (!canvas || !videoEl || videoEl.videoWidth === 0) return;
    if (canvas.width !== videoEl.videoWidth)  canvas.width  = videoEl.videoWidth;
    if (canvas.height !== videoEl.videoHeight) canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

    const bid = backendRef.current;
    const det = _tfjsCache[bid]; if (!det) return;
    let poses;
    try { poses = await det.estimatePoses(videoEl, { flipHorizontal: false }); }
    catch (e) { console.warn('[AI Counter] estimatePoses error:', e?.message); return; }
    if (!poses || poses.length === 0) return;

    const bdef = BACKENDS[bid];
    const kps  = poses[0].keypoints;

    if (overlayRef.current) {
      ctx.globalAlpha = 0.55; ctx.strokeStyle = '#00d4aa'; ctx.lineWidth = 2;
      [[5,7],[7,9],[6,8],[8,10],[5,6],[5,11],[6,12],[11,12],[11,13],[13,15],[12,14],[14,16]].forEach(([a, b]) => {
        const ka = kps[a], kb = kps[b];
        if (!ka || !kb || (ka.score ?? 1) < 0.3 || (kb.score ?? 1) < 0.3) return;
        ctx.beginPath(); ctx.moveTo(ka.x, ka.y); ctx.lineTo(kb.x, kb.y); ctx.stroke();
      });
      kps.forEach(kp => {
        if (!kp || (kp.score ?? 1) < 0.3) return;
        ctx.beginPath(); ctx.arc(kp.x, kp.y, 4, 0, Math.PI * 2); ctx.fillStyle = '#00d4aa'; ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    const ai  = trackedRef.current === 'left' ? bdef.ankleLeft : bdef.ankleRight;
    const ank = kps[ai];
    if (!ank || (ank.score ?? 1) < 0.3) return;
    processAnkle(ank.y / canvas.height, ank.x / canvas.width, null);
  }, [processAnkle]);

  // ── Init backend ───────────────────────────────────────────────────────
  const initBackend = useCallback(async (bid, videoEl, isLive) => {
    setBackendError(''); setBackendLoading(bid);
    try { await loadBackend(bid); }
    catch (e) { setBackendError(`Model laden mislukt: ${e.message}`); setBackendLoading(null); return false; }
    setBackendLoading(null);

    if (bid === 'mediapipe') {
      if (mpPoseRef.current) { try { mpPoseRef.current.close(); } catch (_) {} mpPoseRef.current = null; }
      if (!window.Pose) { setBackendError('MediaPipe niet beschikbaar.'); return false; }
      const pose = new window.Pose({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${f}` });
      pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, enableSegmentation: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
      pose.onResults(onMpResults);
      mpPoseRef.current = pose;
      if (isLive && window.Camera) {
        if (mpCamRef.current) { try { mpCamRef.current.stop(); } catch (_) {} }
        const canvas = canvasRef.current;
        const cam = new window.Camera(videoEl, {
          onFrame: async () => {
            if (!videoEl.videoWidth) return;
            canvas.width = videoEl.videoWidth; canvas.height = videoEl.videoHeight;
            await pose.send({ image: videoEl });
          },
          width: 640, height: 480, facingMode,
        });
        await cam.start(); mpCamRef.current = cam;
      }
    }
    // TF.js detector already cached inside loadBackend
    return true;
  }, [onMpResults, facingMode]);

  // ── Camera start ───────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    const video = videoRef.current; if (!video) return;
    const ok = await initBackend(backendId, video, true); if (!ok) return;
    if (backendId !== 'mediapipe') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } } });
        video.srcObject = stream; await video.play();
      } catch (e) { setBackendError('Camera kon niet worden gestart: ' + (e.message || e)); return; }
      const loop = async () => {
        if (video.readyState >= 2) await processTfjsFrame(video);
        frameRef.current = requestAnimationFrame(loop);
      };
      frameRef.current = requestAnimationFrame(loop);
    }
    setMode('camera');
  }, [backendId, initBackend, processTfjsFrame, facingMode]);

  const stopCameraStream = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    if (mpCamRef.current)  { try { mpCamRef.current.stop();  } catch (_) {} mpCamRef.current  = null; }
    if (mpPoseRef.current) { try { mpPoseRef.current.close(); } catch (_) {} mpPoseRef.current = null; }
    const v = videoRef.current;
    if (v?.srcObject) { v.srcObject.getTracks().forEach(t => t.stop()); v.srcObject = null; }
  }, []);

  const flipCamera = useCallback(() => setFacingMode(p => p === 'environment' ? 'user' : 'environment'), []);
  useEffect(() => { if (mode === 'camera') startCamera(); }, [facingMode]); // eslint-disable-line

  // ── Session controls ───────────────────────────────────────────────────
  const startSession = useCallback(() => {
    detectorRef.current.reset(); detectorRef.current.updateConfig(detCfg);
    setSteps(0); setMisses(0); setElapsed(0); setSessionDone(false); setSavedOk(false); setSignalHist([]);
    isRunRef.current = true; setIsRunning(true);
    elapsedRef.current = setInterval(() => setElapsed(detectorRef.current.elapsedMs), 500);
  }, [detCfg]);

  const stopSession = useCallback(() => {
    isRunRef.current = false; setIsRunning(false);
    clearInterval(elapsedRef.current); cancelAnimationFrame(frameRef.current);
    setFinalSteps(detectorRef.current.steps); setFinalMisses(detectorRef.current.misses); setSessionDone(true);
  }, []);

  // ── File select ────────────────────────────────────────────────────────
  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0]; if (!file || !file.type.startsWith('video/')) return;
    setCodecError(false); setBackendError(''); setUploadProgress(0); setSessionDone(false); setSavedOk(false);
    if (uploadUrl) URL.revokeObjectURL(uploadUrl);
    const url = URL.createObjectURL(file);
    setUploadFile(file); setUploadUrl(url); setMode('upload');
  }, [uploadUrl]);

  // ── Process video ──────────────────────────────────────────────────────
  const processVideo = useCallback(async () => {
    const video = uploadVideoRef.current, canvas = canvasRef.current;
    if (!video || !canvas) return;
    setBackendError(''); setCodecError(false); setUploadProgress(0);
    video.load();
    try { await waitForVideoReady(video, 12000); } catch { setCodecError(true); return; }
    if (!video.videoWidth) { setCodecError(true); return; }
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;

    const ok = await initBackend(backendId, video, false); if (!ok) return;
    detectorRef.current.reset(); detectorRef.current.updateConfig(detCfg);
    setSteps(0); setMisses(0); setElapsed(0); setSessionDone(false); setSignalHist([]);
    isRunRef.current = true; setIsRunning(true); setMode('running');

    const dur = video.duration || 0; let aborted = false;
    elapsedRef.current = setInterval(() => {
      setElapsed(video.currentTime * 1000);
      if (dur > 0) setUploadProgress(Math.round((video.currentTime / dur) * 100));
    }, 300);

    const finish = () => { clearInterval(elapsedRef.current); setUploadProgress(100); aborted = true; stopSession(); };

    if (backendId === 'mediapipe') {
      const pose = mpPoseRef.current;
      const loop = async () => {
        if (aborted) return;
        if (video.readyState >= 2 && video.videoWidth > 0 && !video.paused && !video.ended) {
          if (canvas.width !== video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
          try { await pose.send({ image: video }); }
          catch (e) {
            console.warn('[AI Counter] MP error, recovering:', e?.message);
            try {
              mpPoseRef.current.close();
              const np = new window.Pose({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${f}` });
              np.setOptions({ modelComplexity: 1, smoothLandmarks: true, enableSegmentation: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
              np.onResults(onMpResults); mpPoseRef.current = np;
            } catch { finish(); return; }
          }
        }
        if (video.ended) { finish(); return; }
        frameRef.current = requestAnimationFrame(loop);
      };
      video.currentTime = 0; await new Promise(r => { video.onseeked = r; });
      try { await video.play(); } catch (e) { setBackendError('Video afspelen mislukt: ' + e.message); clearInterval(elapsedRef.current); isRunRef.current = false; setIsRunning(false); return; }
      frameRef.current = requestAnimationFrame(loop);
    } else {
      const loop = async () => {
        if (aborted) return;
        if (video.readyState >= 2 && !video.paused && !video.ended) await processTfjsFrame(video);
        if (video.ended) { finish(); return; }
        frameRef.current = requestAnimationFrame(loop);
      };
      video.currentTime = 0; await new Promise(r => { video.onseeked = r; });
      try { await video.play(); } catch (e) { setBackendError('Video afspelen mislukt: ' + e.message); clearInterval(elapsedRef.current); isRunRef.current = false; setIsRunning(false); return; }
      frameRef.current = requestAnimationFrame(loop);
    }
  }, [backendId, detCfg, initBackend, processTfjsFrame, onMpResults, stopSession]);

  // ── Save ───────────────────────────────────────────────────────────────
  const saveSession = useCallback(async () => {
    if (!selSkipper || !disciplineId) return;
    setSaving(true);
    const disc = getDisc(disciplineId);
    try {
      await ClubMemberFactory.saveSessionHistory(selSkipper.clubId, selSkipper.memberId, {
        discipline: disciplineId, disciplineName: disc?.name || disciplineId, ropeType: disc?.ropeType || 'SR',
        sessionType, score: finalSteps, avgBpm: 0, maxBpm: 0, sessionStart: null, telemetry: [],
        countedBy:     counterUser?.id   || null,
        countedByName: counterUser ? `${counterUser.firstName} ${counterUser.lastName} (AI)` : 'AI',
        countingMethod: 'AI',
        aiConfig: { backend: backendId, backendLabel: BACKENDS[backendId]?.label || backendId, ...detCfg, trackedFoot },
      });
      setSavedOk(true);
    } catch (e) { console.error(e); alert('Opslaan mislukt.'); }
    finally { setSaving(false); }
  }, [selSkipper, disciplineId, sessionType, finalSteps, counterUser, getDisc, backendId, detCfg, trackedFoot]);

  // ── Reset all ──────────────────────────────────────────────────────────
  const resetAll = useCallback(() => {
    cancelAnimationFrame(frameRef.current); clearInterval(elapsedRef.current); clearTimeout(missTimerRef.current);
    isRunRef.current = false; stopCameraStream();
    if (uploadUrl) { URL.revokeObjectURL(uploadUrl); setUploadUrl(''); }
    setUploadFile(null); setMode('idle'); setIsRunning(false);
    setSessionDone(false); setSteps(0); setMisses(0); setElapsed(0);
    setUploadProgress(0); setCodecError(false); setBackendError(''); setSavedOk(false); setSignalHist([]);
    detectorRef.current.reset();
  }, [uploadUrl, stopCameraStream]);

  useEffect(() => () => {
    cancelAnimationFrame(frameRef.current); clearInterval(elapsedRef.current); clearTimeout(missTimerRef.current);
    stopCameraStream(); if (uploadUrl) URL.revokeObjectURL(uploadUrl);
  }, []); // eslint-disable-line

  const currentDisc = getDisc(disciplineId);
  const durationSec = currentDisc?.durationSeconds || null;
  const progress    = durationSec ? Math.min(1, elapsed / (durationSec * 1000)) : 0;
  const isVideoMode = mode === 'upload' || mode === 'running';
  const activeBdef  = BACKENDS[backendId];

  return (
    <div style={s.page}>
      <style>{pageCSS}</style>

      <header style={s.header}>
        <a href="/counter" style={s.backBtn}><ArrowLeft size={16} /><span>Teller</span></a>
        <div style={s.headerCenter}>
          <div style={s.betaChip}><Zap size={10} color="#f59e0b" /><span>AI BETA</span></div>
          <span style={s.headerTitle}>AI Stapteller</span>
        </div>
        <button onClick={() => setShowOverlay(v => !v)} style={s.overlayToggle}>
          {showOverlay ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
      </header>

      <div style={s.body}>

        {/* Config strip */}
        <div style={s.configStrip}>
          <div style={s.configGroup}>
            <span style={s.configLabel}>Onderdeel</span>
            <select style={s.configSelect} value={disciplineId} onChange={e => setDisciplineId(e.target.value)} disabled={isRunning}>
              {disciplines.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div style={s.configGroup}>
            <span style={s.configLabel}>Type</span>
            <div style={s.configToggle}>
              {['Training', 'Wedstrijd'].map(t => (
                <button key={t} onClick={() => !isRunning && setSessionType(t)} disabled={isRunning}
                  style={{ ...s.configToggleBtn, backgroundColor: sessionType === t ? (t === 'Wedstrijd' ? '#ef4444' : '#3b82f6') : 'transparent', color: sessionType === t ? 'white' : '#64748b' }}>
                  {t === 'Training' ? '🏋️' : '🏆'} {t}
                </button>
              ))}
            </div>
          </div>
          <div style={s.configGroup}>
            <span style={s.configLabel}>Voet</span>
            <div style={s.configToggle}>
              {[['left', 'Links'], ['right', 'Rechts']].map(([v, l]) => (
                <button key={v} onClick={() => !isRunning && setTrackedFoot(v)} disabled={isRunning}
                  style={{ ...s.configToggleBtn, backgroundColor: trackedFoot === v ? '#22c55e' : 'transparent', color: trackedFoot === v ? 'white' : '#64748b' }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Video area */}
        <div style={s.videoWrap}>
          <video ref={videoRef} style={s.hiddenVideo} playsInline muted />
          {uploadUrl && <video ref={uploadVideoRef} src={uploadUrl} style={s.hiddenVideo} playsInline muted preload="auto" onError={() => setCodecError(true)} />}
          <div style={s.canvasLetterbox}>
            <canvas ref={canvasRef} style={{ ...s.canvas, display: (mode === 'camera' || mode === 'running') ? 'block' : 'none' }} />
          </div>
          <MissFlash visible={showMiss} />

          {/* Active backend badge */}
          {(mode === 'camera' || mode === 'running') && (
            <div style={{ position: 'absolute', bottom: '10px', right: '10px', zIndex: 15,
              backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
              border: `1px solid ${activeBdef.color}55`, borderRadius: '8px', padding: '4px 8px',
              fontSize: '10px', fontWeight: '700', color: activeBdef.color, display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Cpu size={10} /> {activeBdef.label}
            </div>
          )}

          {/* Idle */}
          {mode === 'idle' && (
            <div style={s.centeredOverlay}>
              <div style={s.idleIcon}><Camera size={48} color="#334155" /></div>
              <p style={s.idleTitle}>Kies een bron</p>
              <p style={s.idleSubtitle}>Gebruik je camera voor live tellen of upload een video.</p>
              {backendError && <div style={s.errorBanner}><AlertTriangle size={14} style={{ flexShrink: 0 }} />{backendError}</div>}
              <div style={s.idleBtns}>
                <button style={s.primaryBtn} disabled={!!backendLoading}
                  onClick={startCamera}>
                  {backendLoading
                    ? <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Laden…</>
                    : <><Camera size={16} /> Live camera</>}
                </button>
                <button style={s.secondaryBtn} onClick={() => fileInputRef.current?.click()}>
                  <Upload size={16} /> Video uploaden
                </button>
                <input ref={fileInputRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={handleFileSelect} />
              </div>
              <div style={s.infoBox}>
                <Info size={12} color="#64748b" style={{ flexShrink: 0, marginTop: 1 }} />
                <span>Alles draait op je apparaat — geen data verstuurd. Model wordt eenmalig geladen (~1–5 MB).</span>
              </div>
            </div>
          )}

          {/* Upload ready */}
          {mode === 'upload' && !isRunning && !sessionDone && (
            <div style={s.centeredOverlay}>
              {codecError ? (
                <>
                  <AlertTriangle size={36} color="#f59e0b" style={{ marginBottom: 12 }} />
                  <p style={{ color: '#f1f5f9', fontWeight: '700', marginBottom: 4, textAlign: 'center' }}>Video kan niet worden gelezen</p>
                  <p style={{ color: '#64748b', fontSize: '12px', marginBottom: 16, textAlign: 'center', lineHeight: 1.5, maxWidth: '280px' }}>
                    <strong>.MOV-bestanden</strong> werken alleen in Safari. Converteer naar <strong>MP4 (H.264)</strong>.
                  </p>
                  <button style={s.secondaryBtn} onClick={() => fileInputRef.current?.click()}><Upload size={14} /> Andere video</button>
                  <input ref={fileInputRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={handleFileSelect} />
                </>
              ) : (
                <>
                  <Video size={32} color="#60a5fa" style={{ marginBottom: 10 }} />
                  <p style={{ color: '#f1f5f9', fontWeight: '700', marginBottom: 4 }}>{uploadFile?.name}</p>
                  <p style={{ color: '#64748b', fontSize: '12px', marginBottom: 4 }}>Klaar om te analyseren</p>
                  <p style={{ color: activeBdef.color, fontSize: '11px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Cpu size={11} /> {activeBdef.label}
                  </p>
                  {backendError && <div style={{ ...s.errorBanner, marginBottom: 12 }}><AlertTriangle size={14} />{backendError}</div>}
                  <button style={s.primaryBtn} disabled={!!backendLoading} onClick={processVideo}>
                    {backendLoading
                      ? <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Model laden…</>
                      : <><Play size={16} fill="white" /> Analyseer video</>}
                  </button>
                </>
              )}
            </div>
          )}

          {mode === 'camera' && (
            <div style={s.cameraHud}>
              <button style={s.hudBtn} onClick={flipCamera}><FlipHorizontal size={16} /></button>
            </div>
          )}

          {(mode === 'camera' || mode === 'running') && (isRunning || sessionDone) && (
            <div style={s.statsOverlay}>
              <div style={s.statPill}>
                <span style={{ fontSize: '26px', fontWeight: '900', color: '#60a5fa', lineHeight: 1, fontFamily: 'monospace' }}>{isRunning ? steps : finalSteps}</span>
                <span style={{ fontSize: '9px', color: '#64748b', fontWeight: '700' }}>STAPPEN</span>
              </div>
              {(misses > 0 || (!isRunning && finalMisses > 0)) && (
                <div style={{ ...s.statPill, backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
                  <span style={{ fontSize: '20px', fontWeight: '900', color: '#ef4444', lineHeight: 1, fontFamily: 'monospace' }}>{isRunning ? misses : finalMisses}</span>
                  <span style={{ fontSize: '9px', color: '#ef4444', fontWeight: '700' }}>MISSERS</span>
                </div>
              )}
              {isRunning && (
                <div style={{ ...s.statPill, minWidth: 'auto', padding: '6px 10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#94a3b8', fontFamily: 'monospace' }}>{fmtTime(elapsed)}</span>
                </div>
              )}
            </div>
          )}

          {mode === 'running' && isRunning && <div style={s.progressBar}><div style={{ ...s.progressFill, width: `${uploadProgress}%`, backgroundColor: '#3b82f6' }} /></div>}
          {mode === 'camera' && isRunning && durationSec && <div style={s.progressBar}><div style={{ ...s.progressFill, width: `${progress * 100}%`, backgroundColor: progress > 0.8 ? '#ef4444' : '#3b82f6' }} /></div>}
        </div>

        {/* Controls */}
        <div style={s.controls}>
          {mode === 'camera' && !isRunning && !sessionDone && <button style={s.startBtn} onClick={startSession}><Play size={20} fill="white" /> START TELLEN</button>}
          {mode === 'camera' && isRunning && <button style={s.stopBtn} onClick={stopSession}><Square size={18} fill="white" /> STOP</button>}
          {mode === 'running' && isRunning && <button style={s.stopBtn} onClick={stopSession}><Square size={18} fill="white" /> STOP ANALYSE</button>}
          {(mode === 'camera' || isVideoMode) && !isRunning && !sessionDone && <button style={s.ghostBtn} onClick={resetAll}><ArrowLeft size={14} /> Terug</button>}
        </div>

        {/* Settings panels */}
        {!isRunning && mode !== 'running' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <BackendSelector value={backendId} disabled={isRunning} loadingId={backendLoading}
              onChange={async bid => {
                if (isRunning) return;
                stopCameraStream();
                if (mpPoseRef.current) { try { mpPoseRef.current.close(); } catch (_) {} mpPoseRef.current = null; }
                setBackendId(bid); setBackendError('');
                // Pre-load new backend
                setBackendLoading(bid);
                try { await loadBackend(bid); } catch (e) { setBackendError(`Model laden mislukt: ${e.message}`); }
                setBackendLoading(null);
                if (mode === 'camera') setTimeout(() => startCamera(), 100);
              }}
            />
            <DetectionTuningPanel config={detCfg} onChange={p => setDetCfg(prev => ({ ...prev, ...p }))} signalHistory={signalHist} />
          </div>
        )}
        {mode === 'camera' && isRunning && (
          <DetectionTuningPanel config={detCfg} onChange={p => setDetCfg(prev => ({ ...prev, ...p }))} signalHistory={signalHist} />
        )}

        {/* Results */}
        {sessionDone && (
          <div style={s.resultsPanel}>
            <div style={s.resultsHeader}>
              <CheckCircle2 size={22} color="#22c55e" />
              <span style={{ fontWeight: '800', fontSize: '16px', color: '#f1f5f9' }}>Sessie voltooid</span>
              <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: '700', color: activeBdef.color,
                backgroundColor: `${activeBdef.color}18`, borderRadius: '6px', padding: '2px 8px',
                display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Cpu size={10} /> {activeBdef.label}
              </span>
            </div>
            <div style={s.resultGrid}>
              <div style={s.resultCard}>
                <span style={{ fontSize: '40px', fontWeight: '900', color: '#60a5fa', lineHeight: 1 }}>{finalSteps}</span>
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Stappen</span>
              </div>
              <div style={{ ...s.resultCard, borderColor: '#ef444433' }}>
                <span style={{ fontSize: '40px', fontWeight: '900', color: finalMisses > 0 ? '#ef4444' : '#334155', lineHeight: 1 }}>{finalMisses}</span>
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Missers</span>
              </div>
              <div style={s.resultCard}>
                <span style={{ fontSize: '22px', fontWeight: '700', color: '#94a3b8', lineHeight: 1, fontFamily: 'monospace' }}>{fmtTime(elapsed)}</span>
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Duur</span>
              </div>
            </div>

            <div style={{ backgroundColor: '#0f172a', borderRadius: '10px', border: '1px solid #1e293b', padding: '12px 14px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Users size={11} /> Sla op bij skipper
              </div>
              <SkipperPicker counterUser={counterUser} onSelect={setSelSkipper} selectedSkipper={selSkipper} />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              {!savedOk ? (
                <button style={{ ...s.primaryBtn, flex: 1, justifyContent: 'center', opacity: saving || !selSkipper ? 0.5 : 1 }}
                  onClick={saveSession} disabled={saving || !selSkipper} title={!selSkipper ? 'Kies eerst een skipper' : ''}>
                  {saving ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Opslaan…</> : <><Trophy size={14} /> Sla op als sessie</>}
                </button>
              ) : (
                <div style={{ ...s.primaryBtn, flex: 1, justifyContent: 'center', backgroundColor: '#22c55e', cursor: 'default' }}>
                  <CheckCircle2 size={14} /> Opgeslagen!
                </div>
              )}
              <button style={{ ...s.ghostBtn, flexShrink: 0 }} onClick={() => {
                cancelAnimationFrame(frameRef.current); clearInterval(elapsedRef.current);
                if (mpPoseRef.current) { try { mpPoseRef.current.close(); } catch (_) {} mpPoseRef.current = null; }
                if (uploadVideoRef.current) { try { uploadVideoRef.current.pause(); uploadVideoRef.current.currentTime = 0; } catch (_) {} }
                isRunRef.current = false; setIsRunning(false); setSessionDone(false);
                setSteps(0); setMisses(0); setElapsed(0); setSavedOk(false); setUploadProgress(0); setSignalHist([]);
                detectorRef.current.reset(); setMode('upload');
              }}>
                <RefreshCw size={14} /> Opnieuw
              </button>
            </div>

            <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', backgroundColor: '#f59e0b11', border: '1px solid #f59e0b33', borderRadius: '8px', padding: '8px 10px', fontSize: '11px', color: '#94a3b8', lineHeight: 1.5 }}>
              <Info size={11} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Badges en records worden nog <em>niet</em> automatisch toegekend via AI-tellen.</span>
            </div>
            <button style={{ ...s.ghostBtn, width: '100%', justifyContent: 'center' }} onClick={resetAll}>
              <ArrowLeft size={14} /> Terug naar start
            </button>
          </div>
        )}

        {mode === 'idle' && (
          <div style={s.tipsSection}>
            <p style={s.tipsTitle}>Tips voor beste resultaten</p>
            <ul style={s.tipsList}>
              <li>📐 Zijkant of licht diagonaal, volledig lichaam zichtbaar</li>
              <li>💡 Goede belichting — geen tegenlicht</li>
              <li>👟 Kies de meest zichtbare voet</li>
              <li>📏 Camera stabiel op ~2m afstand</li>
              <li>🎬 Upload als <strong>MP4</strong> — .MOV werkt alleen in Safari</li>
              <li>⚡ <strong>MoveNet Lightning</strong> is het snelst; <strong>MediaPipe</strong> geeft de meest stabiele tracking</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

const pageCSS = `
  * { box-sizing: border-box; }
  @keyframes spin      { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes missFlash { 0% { opacity: 1; } 100% { opacity: 0; } }
  @keyframes fadeUp    { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
`;

const s = {
  page:         { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column' },
  header:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', backgroundColor: '#1e293b', borderBottom: '1px solid #334155', position: 'sticky', top: 0, zIndex: 100, gap: '8px' },
  backBtn:      { display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', textDecoration: 'none', fontSize: '13px', fontWeight: '600', minWidth: 60 },
  headerCenter: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', flex: 1 },
  betaChip:     { display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#f59e0b22', border: '1px solid #f59e0b44', borderRadius: '10px', padding: '2px 8px', fontSize: '9px', fontWeight: '800', color: '#f59e0b', letterSpacing: '0.6px' },
  headerTitle:  { fontSize: '15px', fontWeight: '800', color: '#f1f5f9' },
  overlayToggle:{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center', minWidth: 28 },
  body:         { flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '640px', width: '100%', margin: '0 auto', padding: '12px 12px 32px', gap: '12px' },
  configStrip:  { display: 'flex', gap: '8px', flexWrap: 'wrap', backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '10px 12px' },
  configGroup:  { display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '120px' },
  configLabel:  { fontSize: '9px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' },
  configSelect: { backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '7px', color: 'white', fontSize: '12px', padding: '6px 8px', fontFamily: 'inherit', width: '100%' },
  configToggle: { display: 'flex', gap: '4px' },
  configToggleBtn: { flex: 1, padding: '5px 6px', borderRadius: '6px', border: '1px solid #334155', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', whiteSpace: 'nowrap' },
  videoWrap:    { position: 'relative', width: '100%', aspectRatio: '4/3', backgroundColor: '#0a0f1a', borderRadius: '16px', border: '1px solid #1e293b', overflow: 'hidden' },
  canvasLetterbox: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  canvas:       { maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain', display: 'block' },
  hiddenVideo:  { position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 },
  centeredOverlay: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center', gap: '10px' },
  idleIcon:     { width: '80px', height: '80px', borderRadius: '20px', backgroundColor: '#1e293b', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '4px' },
  idleTitle:    { fontSize: '18px', fontWeight: '800', color: '#f1f5f9', margin: 0 },
  idleSubtitle: { fontSize: '13px', color: '#64748b', margin: 0, lineHeight: 1.5, maxWidth: '280px' },
  idleBtns:     { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '4px' },
  infoBox:      { display: 'flex', gap: '6px', alignItems: 'flex-start', backgroundColor: '#1e293b', borderRadius: '8px', padding: '8px 10px', fontSize: '11px', color: '#64748b', lineHeight: 1.5, maxWidth: '320px', textAlign: 'left', marginTop: '4px' },
  errorBanner:  { display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#ef444422', border: '1px solid #ef444444', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#ef4444', maxWidth: '320px', textAlign: 'left' },
  cameraHud:    { position: 'absolute', top: '10px', right: '10px', display: 'flex', flexDirection: 'column', gap: '6px', zIndex: 10 },
  hudBtn:       { width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  statsOverlay: { position: 'absolute', top: '10px', left: '10px', display: 'flex', flexDirection: 'column', gap: '6px', zIndex: 15 },
  statPill:     { backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '6px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '60px' },
  progressBar:  { position: 'absolute', bottom: 0, left: 0, right: 0, height: '4px', backgroundColor: 'rgba(0,0,0,0.4)' },
  progressFill: { height: '100%', transition: 'width 0.3s linear', borderRadius: '0 2px 2px 0' },
  controls:     { display: 'flex', gap: '10px', justifyContent: 'center', alignItems: 'center' },
  resultsPanel: { backgroundColor: '#1e293b', borderRadius: '14px', border: '1px solid #22c55e33', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', animation: 'fadeUp 0.35s ease-out' },
  resultsHeader:{ display: 'flex', alignItems: 'center', gap: '8px' },
  resultGrid:   { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' },
  resultCard:   { backgroundColor: '#0f172a', borderRadius: '10px', border: '1px solid #1e293b', padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' },
  tipsSection:  { backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '14px 16px' },
  tipsTitle:    { fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' },
  tipsList:     { margin: 0, padding: '0 0 0 4px', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 },
  primaryBtn:   { display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '11px 18px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '10px', color: 'white', fontWeight: '700', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  secondaryBtn: { display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '11px 18px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '10px', color: '#94a3b8', fontWeight: '600', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  ghostBtn:     { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 14px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '10px', color: '#64748b', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' },
  startBtn:     { display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '14px 28px', backgroundColor: '#22c55e', border: 'none', borderRadius: '12px', color: 'white', fontWeight: '800', fontSize: '15px', cursor: 'pointer', fontFamily: 'inherit' },
  stopBtn:      { display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '14px 28px', backgroundColor: '#ef4444', border: 'none', borderRadius: '12px', color: 'white', fontWeight: '800', fontSize: '15px', cursor: 'pointer', fontFamily: 'inherit' },
};
