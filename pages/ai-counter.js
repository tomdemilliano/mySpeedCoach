/**
 * pages/ai-counter.js
 *
 * AI-powered rope-skipping step counter (Beta)
 *
 * Improvements vs previous version:
 *  - Video fits the frame properly (object-fit: contain) — vertical videos no longer cropped
 *  - Group & skipper picker added — results can be saved to skipper session history
 *  - Session saves include countingMethod: 'AI' or 'manual' (badge/record flow disabled for AI)
 *  - Detection tuning panel: sliders for prominence, min interval, miss gap with live signal preview
 *  - MediaPipe is re-initialised after every abort (WASM fatal errors are not recoverable)
 *  - Frame loop uses a flag-based guard to skip frames with zero dimensions
 *  - .MOV / HEVC files: shows a clear warning when the browser can't decode the codec
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ClubMemberFactory, UserMemberLinkFactory, UserFactory,
  BadgeFactory, ClubFactory, GroupFactory,
} from '../constants/dbSchema';
import { useDisciplines } from '../hooks/useDisciplines';
import {
  ArrowLeft, Camera, Upload, FlipHorizontal, Play, Square,
  Zap, AlertTriangle, CheckCircle2, X, RefreshCw, Eye, EyeOff,
  ChevronRight, Trophy, Info, Video, SlidersHorizontal, ChevronDown, ChevronUp,
  Users, Building2,
} from 'lucide-react';

// ─── Default detection config ─────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  peakMinProminence:  0.012,  // min Y-delta to count as a peak
  peakMinIntervalMs: 120,     // min ms between steps
  missGapMs:         600,     // ms of no step before a miss is counted
};

// ─── Step Detector ────────────────────────────────────────────────────────────
class StepDetector {
  constructor(config = DEFAULT_CONFIG) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.reset();
  }

  updateConfig(config) {
    this.config = { ...this.config, ...config };
  }

  reset() {
    this.signal      = [];
    this.steps       = 0;
    this.misses      = 0;
    this.lastStepTime  = 0;
    this.lastMissTime  = 0;
    this.inPeak      = false;
    this.peakY       = null;
    this.valleyY     = null;
    this.sessionStart = null;
  }

  push(y, t) {
    if (!this.sessionStart) this.sessionStart = t;
    this.signal.push({ y, t });
    if (this.signal.length > 90) this.signal.shift();
    return this._detect(y, t);
  }

  _detect(y, t) {
    const { peakMinProminence, peakMinIntervalMs, missGapMs } = this.config;
    const n = this.signal.length;
    if (n < 5) return null;
    const recent = this.signal.slice(-5);
    const avgY   = recent.reduce((s, p) => s + p.y, 0) / recent.length;

    if (this.valleyY === null) { this.valleyY = avgY; return null; }

    const isUp = (this.valleyY - avgY) > peakMinProminence;
    if (!this.inPeak && isUp) { this.inPeak = true; this.peakY = avgY; }

    if (this.inPeak) {
      if (avgY < this.peakY) this.peakY = avgY;
      if (avgY > this.peakY + peakMinProminence * 0.8) {
        this.inPeak  = false;
        this.valleyY = avgY;
        const prominence = this.valleyY - this.peakY;
        if (prominence >= peakMinProminence) {
          const timeSinceLast = t - this.lastStepTime;
          if (timeSinceLast >= peakMinIntervalMs) {
            if (this.lastStepTime > 0 && timeSinceLast > missGapMs * 1.5 && timeSinceLast < 8000) {
              this.misses++;
              this.lastMissTime = t;
            }
            this.steps++;
            this.lastStepTime = t;
            return 'step';
          }
        }
        return null;
      }
    } else {
      if (avgY > this.valleyY) this.valleyY = avgY * 0.9 + this.valleyY * 0.1;
    }

    if (this.lastStepTime > 0 && (t - this.lastStepTime) > missGapMs * 2 && !this.inPeak) {
      if (this.lastMissTime < this.lastStepTime && this.steps > 3) {
        this.misses++;
        this.lastMissTime = t;
        return 'miss';
      }
    }
    return null;
  }

  get elapsedMs() {
    return this.sessionStart ? Date.now() - this.sessionStart : 0;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const COOKIE_KEY = 'msc_uid';
const getCookie = () => {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`));
  return m ? m[1] : null;
};
const fmtTime = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const MEDIAPIPE_SCRIPT  = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose.js';
const MEDIAPIPE_CAMERA  = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3.1675466862/camera_utils.js';
const MEDIAPIPE_DRAWING = 'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils@0.3.1675466124/drawing_utils.js';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.crossOrigin = 'anonymous';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

const LEFT_ANKLE  = 27;
const RIGHT_ANKLE = 28;

function waitForVideoReady(video, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 3 && video.videoWidth > 0 && video.videoHeight > 0) {
      resolve(); return;
    }
    const deadline = setTimeout(() => {
      video.removeEventListener('canplay',    tryResolve);
      video.removeEventListener('loadeddata', tryResolve);
      reject(new Error('Video decode timeout'));
    }, timeoutMs);

    const tryResolve = () => {
      if (video.readyState >= 3 && video.videoWidth > 0 && video.videoHeight > 0) {
        clearTimeout(deadline);
        video.removeEventListener('canplay',    tryResolve);
        video.removeEventListener('loadeddata', tryResolve);
        resolve();
      }
    };
    video.addEventListener('canplay',    tryResolve);
    video.addEventListener('loadeddata', tryResolve);
  });
}

// ─── Miss Flash ───────────────────────────────────────────────────────────────
function MissFlash({ visible }) {
  if (!visible) return null;
  return (
    <div style={{
      position: 'absolute', inset: 0, borderRadius: '16px',
      border: '3px solid #ef4444', background: 'rgba(239,68,68,0.08)',
      pointerEvents: 'none', animation: 'missFlash 0.5s ease-out forwards', zIndex: 20,
    }} />
  );
}

// ─── Detection Tuning Panel ───────────────────────────────────────────────────
// Shows sliders + a live signal graph of recent ankle Y positions.
function DetectionTuningPanel({ config, onChange, signalHistory }) {
  const [open, setOpen] = useState(false);
  const canvasRef = useRef(null);

  // Draw signal graph whenever signalHistory changes
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    if (!signalHistory || signalHistory.length < 2) return;

    // Normalise Y values (0 = top of frame, 1 = bottom; we invert for display)
    const vals = signalHistory.map(p => p.y);
    const minY = Math.min(...vals), maxY = Math.max(...vals);
    const range = maxY - minY || 0.01;

    // Threshold line
    const threshY = h - ((config.peakMinProminence / (range + config.peakMinProminence)) * h * 0.8 + h * 0.1);
    ctx.strokeStyle = '#f59e0b44';
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(0, threshY); ctx.lineTo(w, threshY); ctx.stroke();
    ctx.setLineDash([]);

    // Signal line
    ctx.strokeStyle = '#00d4aa';
    ctx.lineWidth = 2;
    ctx.beginPath();
    signalHistory.forEach((p, i) => {
      const x = (i / (signalHistory.length - 1)) * w;
      const y = h - ((p.y - minY) / range) * h * 0.85 - h * 0.075;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [signalHistory, open, config.peakMinProminence]);

  const sliders = [
    {
      key: 'peakMinProminence',
      label: 'Pieksensitiviteit',
      hint: 'Hoe groot de beweging moet zijn om als stap te tellen. Lager = gevoeliger.',
      min: 0.003, max: 0.05, step: 0.001,
      fmt: v => v.toFixed(3),
    },
    {
      key: 'peakMinIntervalMs',
      label: 'Min. interval (ms)',
      hint: 'Minimum tijd tussen twee stappen. Verhoog bij dubbeltelling.',
      min: 60, max: 400, step: 10,
      fmt: v => `${v} ms`,
    },
    {
      key: 'missGapMs',
      label: 'Mist-drempel (ms)',
      hint: 'Hoe lang geen stap voordat een mist wordt geregistreerd.',
      min: 300, max: 1200, step: 50,
      fmt: v => `${v} ms`,
    },
  ];

  // Preset configs
  const presets = [
    { label: 'Snel (sprint)',  config: { peakMinProminence: 0.008, peakMinIntervalMs: 80,  missGapMs: 450 } },
    { label: 'Normaal',        config: { peakMinProminence: 0.012, peakMinIntervalMs: 120, missGapMs: 600 } },
    { label: 'Langzaam / DD',  config: { peakMinProminence: 0.018, peakMinIntervalMs: 180, missGapMs: 900 } },
  ];

  return (
    <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden', marginBottom: '4px' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%', padding: '12px 14px', background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'inherit' }}
      >
        <SlidersHorizontal size={15} color="#60a5fa" />
        <span style={{ flex: 1, textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#f1f5f9' }}>Detectie-instellingen</span>
        <span style={{ fontSize: '10px', color: '#475569', marginRight: '6px' }}>Aanpassen voor betere nauwkeurigheid</span>
        {open ? <ChevronUp size={14} color="#64748b" /> : <ChevronDown size={14} color="#64748b" />}
      </button>

      {open && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid #1e293b' }}>

          {/* Presets */}
          <div style={{ marginBottom: '14px', paddingTop: '12px' }}>
            <div style={{ fontSize: '10px', color: '#475569', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '7px' }}>Snelkeuze</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {presets.map(p => (
                <button key={p.label} onClick={() => onChange(p.config)}
                  style={{ padding: '5px 11px', borderRadius: '14px', border: '1px solid #334155', background: 'transparent', color: '#94a3b8', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {p.label}
                </button>
              ))}
              <button onClick={() => onChange(DEFAULT_CONFIG)}
                style={{ padding: '5px 11px', borderRadius: '14px', border: '1px solid #334155', background: 'transparent', color: '#64748b', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>
                Reset
              </button>
            </div>
          </div>

          {/* Sliders */}
          {sliders.map(sl => (
            <div key={sl.key} style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#94a3b8' }}>{sl.label}</span>
                <span style={{ fontSize: '12px', fontWeight: '700', color: '#60a5fa', fontFamily: 'monospace' }}>{sl.fmt(config[sl.key])}</span>
              </div>
              <input type="range" min={sl.min} max={sl.max} step={sl.step} value={config[sl.key]}
                onChange={e => onChange({ [sl.key]: Number(e.target.value) })}
                style={{ width: '100%', accentColor: '#3b82f6' }}
              />
              <div style={{ fontSize: '10px', color: '#475569', marginTop: '3px' }}>{sl.hint}</div>
            </div>
          ))}

          {/* Live signal graph */}
          <div style={{ marginTop: '6px' }}>
            <div style={{ fontSize: '10px', color: '#475569', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
              Live enkelsignaal <span style={{ color: '#f59e0b' }}>— gele lijn = prominentiedrempel</span>
            </div>
            <canvas ref={canvasRef} width={320} height={80}
              style={{ width: '100%', height: '80px', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b', display: 'block' }}
            />
            {(!signalHistory || signalHistory.length < 5) && (
              <div style={{ fontSize: '10px', color: '#334155', textAlign: 'center', marginTop: '4px' }}>Start een sessie om het signaal te zien</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Skipper Picker ────────────────────────────────────────────────────────────
// Reuses the same bootstrap pattern as counter.js to load clubs → groups → skippers.
function SkipperPicker({ counterUser, onSelect, selectedSkipper }) {
  const [memberClubs,    setMemberClubs]    = useState([]);
  const [memberGroups,   setMemberGroups]   = useState([]);
  const [skippers,       setSkippers]       = useState([]);
  const [clubMembers,    setClubMembers]    = useState([]);
  const [selectedClubId, setSelectedClubId] = useState('');
  const [selectedGroupId,setSelectedGroupId]= useState('');
  const [loading,        setLoading]        = useState(true);

  // Bootstrap clubs
  useEffect(() => {
    if (!counterUser) { setLoading(false); return; }
    const uid = counterUser.id;
    let cancelled = false;

    const load = async () => {
      try {
        if (counterUser.role === 'superadmin') {
          ClubFactory.getAll(clubs => {
            if (cancelled) return;
            setMemberClubs(clubs);
            if (clubs.length === 1) setSelectedClubId(clubs[0].id);
            setLoading(false);
          });
          return;
        }
        const unsub = UserMemberLinkFactory.getForUser(uid, async (profiles) => {
          if (cancelled) return;
          const clubIdSet = new Set(profiles.map(p => p.member.clubId));
          const snaps = await Promise.all([...clubIdSet].map(id => ClubFactory.getById(id)));
          const clubs = snaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() }));
          setMemberClubs(clubs);
          if (clubs.length === 1) setSelectedClubId(clubs[0].id);
          setLoading(false);
        });
        return () => unsub();
      } catch { setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [counterUser]);

  // Load groups when club selected
  useEffect(() => {
    if (!selectedClubId) return;
    setSelectedGroupId('');
    setSkippers([]);
    let cancelled = false;

    const load = async () => {
      try {
        const allGroups = await GroupFactory.getGroupsByClubOnce(selectedClubId);
        const memberCache = {};
        await Promise.all(allGroups.map(async g => {
          memberCache[g.id] = await GroupFactory.getMembersByGroupOnce(selectedClubId, g.id);
        }));
        if (cancelled) return;
        const filtered = allGroups.filter(g => memberCache[g.id]?.some(m => m.isSkipper));
        setMemberGroups(filtered);
        if (filtered.length === 1) setSelectedGroupId(filtered[0].id);
      } catch (e) { console.error(e); }
    };
    load();
    return () => { cancelled = true; };
  }, [selectedClubId]);

  // Load skippers when group selected
  useEffect(() => {
    if (!selectedClubId || !selectedGroupId) return;
    const u1 = GroupFactory.getSkippersByGroup(selectedClubId, selectedGroupId, setSkippers);
    const u2 = ClubMemberFactory.getAll(selectedClubId, setClubMembers);
    return () => { u1(); u2(); };
  }, [selectedClubId, selectedGroupId]);

  const resolveSkipper = async (groupMember) => {
    const memberId  = groupMember.memberId || groupMember.id;
    const profile   = clubMembers.find(m => m.id === memberId);
    return {
      memberId,
      clubId: selectedClubId,
      firstName: profile?.firstName || '?',
      lastName:  profile?.lastName  || '',
    };
  };

  if (!counterUser) return (
    <p style={{ fontSize: '11px', color: '#475569', margin: '4px 0 0' }}>Log in om resultaten op te slaan.</p>
  );

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748b' }}>
      <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> Laden…
    </div>
  );

  if (memberClubs.length === 0) return (
    <p style={{ fontSize: '11px', color: '#475569', margin: '4px 0 0' }}>Geen clubs gevonden voor jouw account.</p>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Club selector (only when multiple) */}
      {memberClubs.length > 1 && (
        <div>
          <div style={labelStyle}>Club</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {memberClubs.map(c => (
              <button key={c.id} onClick={() => setSelectedClubId(c.id)}
                style={{ ...chipStyle, ...(selectedClubId === c.id ? chipActiveStyle : {}) }}>
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Group selector */}
      {selectedClubId && memberGroups.length > 1 && (
        <div>
          <div style={labelStyle}>Groep</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {memberGroups.map(g => (
              <button key={g.id} onClick={() => setSelectedGroupId(g.id)}
                style={{ ...chipStyle, ...(selectedGroupId === g.id ? chipActiveStyle : {}) }}>
                {g.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Skippers grid */}
      {selectedClubId && selectedGroupId && (
        <div>
          <div style={labelStyle}>Skipper (optioneel)</div>
          {skippers.length === 0
            ? <p style={{ fontSize: '12px', color: '#475569' }}>Geen skippers in deze groep.</p>
            : (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {/* None option */}
                <button
                  onClick={() => onSelect(null)}
                  style={{ ...skipperChipStyle, ...(selectedSkipper === null ? skipperChipActiveStyle : {}) }}
                >
                  <div style={{ ...avatarStyle, backgroundColor: selectedSkipper === null ? '#334155' : '#1e293b' }}>–</div>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Geen</span>
                </button>

                {skippers.map(s => {
                  const memberId = s.memberId || s.id;
                  const profile  = clubMembers.find(m => m.id === memberId);
                  const fn       = profile?.firstName || '?';
                  const ln       = profile?.lastName  || '';
                  const initials = `${fn[0] || '?'}${ln[0] || ''}`.toUpperCase();
                  const chosen   = selectedSkipper?.memberId === memberId;
                  return (
                    <button key={memberId}
                      onClick={async () => { const r = await resolveSkipper(s); onSelect(r); }}
                      style={{ ...skipperChipStyle, ...(chosen ? skipperChipActiveStyle : {}) }}
                    >
                      <div style={{ ...avatarStyle, backgroundColor: chosen ? '#3b82f6' : '#334155' }}>{initials}</div>
                      <span style={{ fontSize: '11px', fontWeight: chosen ? '700' : '400', color: chosen ? '#f1f5f9' : '#94a3b8' }}>
                        {fn} {ln}
                      </span>
                    </button>
                  );
                })}
              </div>
            )
          }
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

const labelStyle = { fontSize: '10px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' };
const chipStyle  = { padding: '5px 12px', borderRadius: '14px', border: '1px solid #334155', background: 'transparent', color: '#64748b', fontSize: '12px', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit' };
const chipActiveStyle = { borderColor: '#3b82f6', backgroundColor: '#3b82f622', color: '#60a5fa', fontWeight: '700' };
const skipperChipStyle = { display: 'flex', alignItems: 'center', gap: '7px', padding: '6px 11px', borderRadius: '18px', border: '1px solid #334155', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' };
const skipperChipActiveStyle = { borderColor: '#3b82f6', backgroundColor: '#1e3a5f' };
const avatarStyle = { width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', color: 'white', flexShrink: 0 };

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function AiCounterPage() {
  const [mpLoaded,  setMpLoaded]  = useState(false);
  const [mpError,   setMpError]   = useState('');
  const [mpLoading, setMpLoading] = useState(false);

  const [mode,        setMode]        = useState('idle');
  const [facingMode,  setFacingMode]  = useState('environment');
  const [showOverlay, setShowOverlay] = useState(true);
  const [uploadFile,  setUploadFile]  = useState(null);
  const [uploadUrl,   setUploadUrl]   = useState('');
  const [codecError,  setCodecError]  = useState(false);

  const [isRunning,   setIsRunning]   = useState(false);
  const [steps,       setSteps]       = useState(0);
  const [misses,      setMisses]      = useState(0);
  const [elapsed,     setElapsed]     = useState(0);
  const [showMiss,    setShowMiss]    = useState(false);
  const [sessionDone, setSessionDone] = useState(false);
  const [finalSteps,  setFinalSteps]  = useState(0);
  const [finalMisses, setFinalMisses] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [disciplineId,  setDisciplineId]  = useState('');
  const [sessionType,   setSessionType]   = useState('Training');
  const [trackedFoot,   setTrackedFoot]   = useState('left');
  const [counterUser,   setCounterUser]   = useState(null);
  const [selectedSkipper, setSelectedSkipper] = useState(null); // {memberId, clubId, firstName, lastName}
  const [saving,        setSaving]        = useState(false);
  const [savedOk,       setSavedOk]       = useState(false);

  // Detection tuning
  const [detectionConfig, setDetectionConfig] = useState({ ...DEFAULT_CONFIG });
  const [signalHistory,   setSignalHistory]   = useState([]); // for the graph

  const videoRef        = useRef(null);
  const canvasRef       = useRef(null);
  const poseRef         = useRef(null);
  const cameraRef       = useRef(null);
  const detectorRef     = useRef(new StepDetector(DEFAULT_CONFIG));
  const missTimerRef    = useRef(null);
  const elapsedTimerRef = useRef(null);
  const isRunningRef    = useRef(false);
  const uploadVideoRef  = useRef(null);
  const fileInputRef    = useRef(null);
  const frameLoopRef    = useRef(null);
  const trackedFootRef  = useRef(trackedFoot);
  const showOverlayRef  = useRef(showOverlay);

  useEffect(() => { trackedFootRef.current = trackedFoot; },  [trackedFoot]);
  useEffect(() => { showOverlayRef.current = showOverlay; }, [showOverlay]);

  // Propagate config changes to the detector
  useEffect(() => {
    detectorRef.current.updateConfig(detectionConfig);
  }, [detectionConfig]);

  const handleConfigChange = useCallback((partial) => {
    setDetectionConfig(prev => ({ ...prev, ...partial }));
  }, []);

  const { disciplines, getDisc } = useDisciplines();

  useEffect(() => {
    const uid = getCookie();
    if (!uid) return;
    UserFactory.get(uid).then(s => { if (s.exists()) setCounterUser({ id: uid, ...s.data() }); });
  }, []);

  useEffect(() => {
    if (disciplines.length > 0 && !disciplineId) setDisciplineId(disciplines[0].id);
  }, [disciplines]);

  // ── Load MediaPipe ──────────────────────────────────────────────────────
  const loadMediaPipe = useCallback(async () => {
    setMpLoading(true); setMpError('');
    try {
      await Promise.all([
        loadScript(MEDIAPIPE_SCRIPT),
        loadScript(MEDIAPIPE_CAMERA),
        loadScript(MEDIAPIPE_DRAWING),
      ]);
      setMpLoaded(true);
    } catch {
      setMpError('MediaPipe kon niet worden geladen. Controleer je internetverbinding.');
    } finally {
      setMpLoading(false);
    }
  }, []);

  const createPose = useCallback((onResultsCb) => {
    if (!window.Pose) return null;
    const pose = new window.Pose({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${f}`,
    });
    pose.setOptions({
      modelComplexity: 1, smoothLandmarks: true, enableSegmentation: false,
      minDetectionConfidence: 0.5, minTrackingConfidence: 0.5,
    });
    pose.onResults(onResultsCb);
    return pose;
  }, []);

  // ── Shared onResults ────────────────────────────────────────────────────
  const onResults = useCallback((results) => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (results.image) ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    if (!results.poseLandmarks) return;

    const lms = results.poseLandmarks;
    if (showOverlayRef.current && window.drawConnectors && window.POSE_CONNECTIONS) {
      ctx.globalAlpha = 0.6;
      window.drawConnectors(ctx, lms, window.POSE_CONNECTIONS, { color: '#00d4aa', lineWidth: 2 });
      window.drawLandmarks(ctx, lms, { color: '#fff', fillColor: '#00d4aa', lineWidth: 1, radius: 3 });
      ctx.globalAlpha = 1;
    }

    const ankleIdx = trackedFootRef.current === 'left' ? LEFT_ANKLE : RIGHT_ANKLE;
    const ankle = lms[ankleIdx];
    if (ankle && ankle.visibility > 0.5) {
      const ax = ankle.x * canvas.width;
      const ay = ankle.y * canvas.height;
      ctx.beginPath(); ctx.arc(ax, ay, 18, 0, Math.PI * 2);
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.arc(ax, ay, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b'; ctx.fill();

      if (isRunningRef.current) {
        const event = detectorRef.current.push(ankle.y, Date.now());
        // Update signal history for the tuning graph (keep last 90 points)
        setSignalHistory(prev => {
          const next = [...prev, { y: ankle.y, t: Date.now() }];
          return next.length > 90 ? next.slice(-90) : next;
        });
        if (event === 'step')  { setSteps(detectorRef.current.steps); }
        if (event === 'miss')  {
          setMisses(detectorRef.current.misses);
          setShowMiss(true);
          clearTimeout(missTimerRef.current);
          missTimerRef.current = setTimeout(() => setShowMiss(false), 600);
        }
      }
    }

    // HUD
    if (isRunningRef.current) {
      const count = detectorRef.current.steps;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.roundRect(12, 12, 110, 50, 10); ctx.fill();
      ctx.fillStyle = '#60a5fa'; ctx.font = 'bold 30px monospace';
      ctx.fillText(count, 20, 48);
      ctx.fillStyle = '#94a3b8'; ctx.font = '10px system-ui';
      ctx.fillText('STAPPEN', 20, 60);
    }
  }, []);

  // ── Live camera ─────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    if (!mpLoaded) { await loadMediaPipe(); return; }
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    if (cameraRef.current) { try { cameraRef.current.stop(); } catch (_) {} }
    if (poseRef.current)   { try { poseRef.current.close();  } catch (_) {} }

    if (!window.Camera || !window.Pose) { setMpError('MediaPipe niet beschikbaar.'); return; }

    const pose = createPose(onResults);
    poseRef.current = pose;

    const camera = new window.Camera(video, {
      onFrame: async () => {
        if (!video.videoWidth || !video.videoHeight) return;
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        await pose.send({ image: video });
      },
      width: 640, height: 480, facingMode,
    });

    try {
      await camera.start();
      cameraRef.current = camera;
      setMode('camera');
    } catch (e) {
      setMpError('Camera kon niet worden gestart: ' + (e.message || e));
    }
  }, [mpLoaded, loadMediaPipe, onResults, facingMode, createPose]);

  const flipCamera = useCallback(() => {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  }, []);

  useEffect(() => {
    if (mode === 'camera') startCamera();
  }, [facingMode]); // eslint-disable-line

  // ── Session controls ────────────────────────────────────────────────────
  const startSession = useCallback(() => {
    detectorRef.current.reset();
    detectorRef.current.updateConfig(detectionConfig);
    setSteps(0); setMisses(0); setElapsed(0);
    setSessionDone(false); setSavedOk(false);
    setSignalHistory([]);
    isRunningRef.current = true;
    setIsRunning(true);
    elapsedTimerRef.current = setInterval(() => {
      setElapsed(detectorRef.current.elapsedMs);
    }, 500);
  }, [detectionConfig]);

  const stopSession = useCallback(() => {
    isRunningRef.current = false;
    setIsRunning(false);
    clearInterval(elapsedTimerRef.current);
    cancelAnimationFrame(frameLoopRef.current);
    setFinalSteps(detectorRef.current.steps);
    setFinalMisses(detectorRef.current.misses);
    setSessionDone(true);
  }, []);

  // ── File select ─────────────────────────────────────────────────────────
  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) { alert('Selecteer een videobestand.'); return; }
    setCodecError(false); setMpError(''); setUploadProgress(0);
    setSessionDone(false); setSavedOk(false);
    if (uploadUrl) URL.revokeObjectURL(uploadUrl);
    const url = URL.createObjectURL(file);
    setUploadFile(file); setUploadUrl(url);
    setMode('upload');
  }, [uploadUrl]);

  // ── Process uploaded video ──────────────────────────────────────────────
  const processUploadedVideo = useCallback(async () => {
    if (!window.Pose) {
      if (!mpLoaded) await loadMediaPipe();
      if (!window.Pose) { setMpError('MediaPipe kon niet worden geladen.'); return; }
    }

    const video  = uploadVideoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    setMpError(''); setCodecError(false); setUploadProgress(0);

    video.load();
    try {
      await waitForVideoReady(video, 12000);
    } catch {
      setCodecError(true); return;
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) { setCodecError(true); return; }

    canvas.width  = vw;
    canvas.height = vh;

    detectorRef.current.reset();
    detectorRef.current.updateConfig(detectionConfig);
    setSteps(0); setMisses(0); setElapsed(0); setSessionDone(false);
    setSignalHistory([]);
    isRunningRef.current = true;
    setIsRunning(true);
    setMode('running');

    if (poseRef.current) { try { poseRef.current.close(); } catch (_) {} }
    const pose = createPose(onResults);
    poseRef.current = pose;

    const duration = video.duration || 0;
    let aborted = false;

    elapsedTimerRef.current = setInterval(() => {
      setElapsed(video.currentTime * 1000);
      if (duration > 0) setUploadProgress(Math.round((video.currentTime / duration) * 100));
    }, 300);

    const processFrame = async () => {
      if (aborted) return;

      if (
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        video.videoHeight > 0 &&
        !video.paused &&
        !video.ended
      ) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width  = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        try {
          await pose.send({ image: video });
        } catch (e) {
          console.warn('[AI Counter] Pose.send threw, recovering:', e?.message);
          try {
            poseRef.current = createPose(onResults);
          } catch (_) {
            aborted = true;
            clearInterval(elapsedTimerRef.current);
            stopSession(); return;
          }
        }
      }

      if (video.ended) {
        clearInterval(elapsedTimerRef.current);
        setUploadProgress(100);
        aborted = true;
        stopSession(); return;
      }

      frameLoopRef.current = requestAnimationFrame(processFrame);
    };

    video.currentTime = 0;
    await new Promise(r => { video.onseeked = r; });

    try {
      await video.play();
    } catch (e) {
      setMpError('Video kan niet worden afgespeeld: ' + e.message);
      clearInterval(elapsedTimerRef.current);
      isRunningRef.current = false;
      setIsRunning(false);
      return;
    }

    frameLoopRef.current = requestAnimationFrame(processFrame);
  }, [mpLoaded, loadMediaPipe, onResults, createPose, stopSession, detectionConfig]);

  // ── Save session ────────────────────────────────────────────────────────
  // NOTE: badge & record flow intentionally skipped while AI counting is in beta.
  const saveSession = useCallback(async () => {
    if (!selectedSkipper || !disciplineId) return;
    setSaving(true);
    const { clubId, memberId } = selectedSkipper;
    const disc = getDisc(disciplineId);
    try {
      await ClubMemberFactory.saveSessionHistory(clubId, memberId, {
        discipline:      disciplineId,
        disciplineName:  disc?.name     || disciplineId,
        ropeType:        disc?.ropeType || 'SR',
        sessionType,
        score:           finalSteps,
        avgBpm: 0, maxBpm: 0,
        sessionStart:    null,
        telemetry:       [],
        countedBy:       counterUser?.id   || null,
        countedByName:   counterUser
          ? `${counterUser.firstName} ${counterUser.lastName} (AI)`
          : 'AI',
        // ── New field: how this session was counted ──────────────────────
        countingMethod:  'AI',
        aiConfig: {
          peakMinProminence:  detectionConfig.peakMinProminence,
          peakMinIntervalMs: detectionConfig.peakMinIntervalMs,
          missGapMs:         detectionConfig.missGapMs,
          trackedFoot,
        },
      });
      setSavedOk(true);
    } catch (e) {
      console.error('Save failed:', e);
      alert('Opslaan mislukt. Probeer opnieuw.');
    } finally {
      setSaving(false);
    }
  }, [selectedSkipper, disciplineId, sessionType, finalSteps, counterUser, getDisc, detectionConfig, trackedFoot]);

  // ── Reset ───────────────────────────────────────────────────────────────
  const resetAll = useCallback(() => {
    cancelAnimationFrame(frameLoopRef.current);
    clearInterval(elapsedTimerRef.current);
    clearTimeout(missTimerRef.current);
    isRunningRef.current = false;
    if (cameraRef.current) { try { cameraRef.current.stop(); } catch (_) {} cameraRef.current = null; }
    if (poseRef.current)   { try { poseRef.current.close();  } catch (_) {} poseRef.current   = null; }
    if (uploadUrl) { URL.revokeObjectURL(uploadUrl); setUploadUrl(''); }
    setUploadFile(null); setMode('idle'); setIsRunning(false);
    setSessionDone(false); setSteps(0); setMisses(0); setElapsed(0);
    setUploadProgress(0); setCodecError(false); setMpError(''); setSavedOk(false);
    setSignalHistory([]);
    detectorRef.current.reset();
  }, [uploadUrl]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(frameLoopRef.current);
      clearInterval(elapsedTimerRef.current);
      clearTimeout(missTimerRef.current);
      if (cameraRef.current) try { cameraRef.current.stop(); } catch (_) {}
      if (poseRef.current)   try { poseRef.current.close();  } catch (_) {}
      if (uploadUrl) URL.revokeObjectURL(uploadUrl);
    };
  }, []); // eslint-disable-line

  const currentDisc = getDisc(disciplineId);
  const durationSec = currentDisc?.durationSeconds || null;
  const progress    = durationSec ? Math.min(1, elapsed / (durationSec * 1000)) : 0;
  const isVideoMode = mode === 'upload' || mode === 'running';

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <style>{pageCSS}</style>

      {/* Header */}
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
            <select style={s.configSelect} value={disciplineId}
              onChange={e => setDisciplineId(e.target.value)} disabled={isRunning}>
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
          {/* Hidden processing videos */}
          <video ref={videoRef} style={s.hiddenVideo} playsInline muted />
          {uploadUrl && (
            <video ref={uploadVideoRef} src={uploadUrl} style={s.hiddenVideo}
              playsInline muted preload="auto"
              onError={() => setCodecError(true)}
            />
          )}

          {/*
            Canvas: rendered inside a letterbox container so vertical/portrait
            videos are fully visible with black bars on the sides rather than
            being cropped. The canvas itself retains its native aspect ratio
            via object-fit: contain.
          */}
          <div style={s.canvasLetterbox}>
            <canvas ref={canvasRef}
              style={{
                ...s.canvas,
                display: (mode === 'camera' || mode === 'running') ? 'block' : 'none',
              }}
            />
          </div>

          <MissFlash visible={showMiss} />

          {/* Idle */}
          {mode === 'idle' && (
            <div style={s.centeredOverlay}>
              <div style={s.idleIcon}><Camera size={48} color="#334155" /></div>
              <p style={s.idleTitle}>Kies een bron</p>
              <p style={s.idleSubtitle}>Gebruik je camera voor live tellen of upload een video.</p>
              {mpError && <div style={s.errorBanner}><AlertTriangle size={14} style={{ flexShrink: 0 }} />{mpError}</div>}
              <div style={s.idleBtns}>
                <button style={s.primaryBtn} disabled={mpLoading}
                  onClick={async () => { if (!mpLoaded && !mpLoading) await loadMediaPipe(); await startCamera(); }}>
                  {mpLoading
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
                <span>Alles draait op je apparaat — geen data wordt verstuurd. Eerste keer laden ~3s.</span>
              </div>
            </div>
          )}

          {/* Upload ready / codec error */}
          {mode === 'upload' && !isRunning && !sessionDone && (
            <div style={s.centeredOverlay}>
              {codecError ? (
                <>
                  <AlertTriangle size={36} color="#f59e0b" style={{ marginBottom: 12 }} />
                  <p style={{ color: '#f1f5f9', fontWeight: '700', marginBottom: 4, textAlign: 'center' }}>
                    Video kan niet worden gelezen
                  </p>
                  <p style={{ color: '#64748b', fontSize: '12px', marginBottom: 16, textAlign: 'center', lineHeight: 1.5, maxWidth: '280px' }}>
                    <strong>.MOV-bestanden</strong> werken alleen in Safari op Apple-apparaten.
                    Converteer je video naar <strong>MP4 (H.264)</strong> en probeer opnieuw.<br /><br />
                    Op iPhone: deel de video via AirDrop naar een Mac en exporteer als MP4 via QuickTime.
                  </p>
                  <button style={s.secondaryBtn} onClick={() => fileInputRef.current?.click()}>
                    <Upload size={14} /> Andere video kiezen
                  </button>
                  <input ref={fileInputRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={handleFileSelect} />
                </>
              ) : (
                <>
                  <Video size={32} color="#60a5fa" style={{ marginBottom: 10 }} />
                  <p style={{ color: '#f1f5f9', fontWeight: '700', marginBottom: 4 }}>{uploadFile?.name}</p>
                  <p style={{ color: '#64748b', fontSize: '12px', marginBottom: 16 }}>Klaar om te analyseren</p>
                  {mpError && <div style={{ ...s.errorBanner, marginBottom: 12 }}><AlertTriangle size={14} />{mpError}</div>}
                  <button style={s.primaryBtn}
                    onClick={async () => { if (!mpLoaded) await loadMediaPipe(); await processUploadedVideo(); }}>
                    <Play size={16} fill="white" /> Analyseer video
                  </button>
                </>
              )}
            </div>
          )}

          {/* Camera controls */}
          {mode === 'camera' && (
            <div style={s.cameraHud}>
              <button style={s.hudBtn} onClick={flipCamera}><FlipHorizontal size={16} /></button>
            </div>
          )}

          {/* Stats overlay */}
          {(mode === 'camera' || mode === 'running') && (isRunning || sessionDone) && (
            <div style={s.statsOverlay}>
              <div style={s.statPill}>
                <span style={{ fontSize: '26px', fontWeight: '900', color: '#60a5fa', lineHeight: 1, fontFamily: 'monospace' }}>
                  {isRunning ? steps : finalSteps}
                </span>
                <span style={{ fontSize: '9px', color: '#64748b', fontWeight: '700' }}>STAPPEN</span>
              </div>
              {(misses > 0 || (!isRunning && finalMisses > 0)) && (
                <div style={{ ...s.statPill, backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
                  <span style={{ fontSize: '20px', fontWeight: '900', color: '#ef4444', lineHeight: 1, fontFamily: 'monospace' }}>
                    {isRunning ? misses : finalMisses}
                  </span>
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

          {/* Progress bars */}
          {mode === 'running' && isRunning && (
            <div style={s.progressBar}>
              <div style={{ ...s.progressFill, width: `${uploadProgress}%`, backgroundColor: '#3b82f6' }} />
            </div>
          )}
          {mode === 'camera' && isRunning && durationSec && (
            <div style={s.progressBar}>
              <div style={{ ...s.progressFill, width: `${progress * 100}%`, backgroundColor: progress > 0.8 ? '#ef4444' : '#3b82f6' }} />
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={s.controls}>
          {mode === 'camera' && !isRunning && !sessionDone && (
            <button style={s.startBtn} onClick={startSession}><Play size={20} fill="white" /> START TELLEN</button>
          )}
          {mode === 'camera' && isRunning && (
            <button style={s.stopBtn} onClick={stopSession}><Square size={18} fill="white" /> STOP</button>
          )}
          {mode === 'running' && isRunning && (
            <button style={s.stopBtn} onClick={stopSession}><Square size={18} fill="white" /> STOP ANALYSE</button>
          )}
          {(mode === 'camera' || isVideoMode) && !isRunning && !sessionDone && (
            <button style={s.ghostBtn} onClick={resetAll}><ArrowLeft size={14} /> Terug</button>
          )}
        </div>

        {/* Detection tuning panel — shown when not running */}
        {(mode === 'idle' || mode === 'camera' || mode === 'upload') && !isRunning && (
          <DetectionTuningPanel
            config={detectionConfig}
            onChange={handleConfigChange}
            signalHistory={signalHistory}
          />
        )}
        {/* Also show during live camera so you can tune while watching the signal */}
        {mode === 'camera' && isRunning && (
          <DetectionTuningPanel
            config={detectionConfig}
            onChange={handleConfigChange}
            signalHistory={signalHistory}
          />
        )}

        {/* Results */}
        {sessionDone && (
          <div style={s.resultsPanel}>
            <div style={s.resultsHeader}>
              <CheckCircle2 size={22} color="#22c55e" />
              <span style={{ fontWeight: '800', fontSize: '16px', color: '#f1f5f9' }}>Sessie voltooid</span>
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

            {/* ── Skipper picker ── */}
            <div style={{ backgroundColor: '#0f172a', borderRadius: '10px', border: '1px solid #1e293b', padding: '12px 14px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Users size={11} /> Sla op bij skipper
              </div>
              <SkipperPicker
                counterUser={counterUser}
                onSelect={setSelectedSkipper}
                selectedSkipper={selectedSkipper}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              {!savedOk ? (
                <button
                  style={{ ...s.primaryBtn, flex: 1, justifyContent: 'center', opacity: saving || !selectedSkipper ? 0.5 : 1 }}
                  onClick={saveSession}
                  disabled={saving || !selectedSkipper}
                  title={!selectedSkipper ? 'Kies eerst een skipper hierboven' : ''}
                >
                  {saving
                    ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Opslaan…</>
                    : <><Trophy size={14} /> Sla op als sessie</>}
                </button>
              ) : (
                <div style={{ ...s.primaryBtn, flex: 1, justifyContent: 'center', backgroundColor: '#22c55e', cursor: 'default' }}>
                  <CheckCircle2 size={14} /> Opgeslagen!
                </div>
              )}
              <button style={{ ...s.ghostBtn, flexShrink: 0 }} onClick={() => {
                setSessionDone(false); setSteps(0); setMisses(0);
                setElapsed(0); setSavedOk(false); setUploadProgress(0);
                detectorRef.current.reset(); isRunningRef.current = false;
              }}>
                <RefreshCw size={14} /> Opnieuw
              </button>
            </div>

            {/* Badge note */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', backgroundColor: '#f59e0b11', border: '1px solid #f59e0b33', borderRadius: '8px', padding: '8px 10px', fontSize: '11px', color: '#94a3b8', lineHeight: 1.5 }}>
              <Info size={11} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Badges en records worden nog <em>niet</em> automatisch toegekend via AI-tellen — dit gebeurt zodra de nauwkeurigheid voldoende is.</span>
            </div>

            <button style={{ ...s.ghostBtn, width: '100%', justifyContent: 'center', marginTop: '4px' }} onClick={resetAll}>
              <ArrowLeft size={14} /> Terug naar start
            </button>
          </div>
        )}

        {/* Tips */}
        {mode === 'idle' && (
          <div style={s.tipsSection}>
            <p style={s.tipsTitle}>Tips voor beste resultaten</p>
            <ul style={s.tipsList}>
              <li>📐 Zijkant of licht diagonaal, volledig lichaam zichtbaar</li>
              <li>💡 Goede belichting — geen tegenlicht</li>
              <li>👟 Kies de meest zichtbare voet</li>
              <li>📏 Camera stabiel op ~2m afstand</li>
              <li>🎬 Upload als <strong>MP4</strong> — .MOV werkt alleen in Safari</li>
              <li>📱 Staande video? Past nu volledig in beeld (geen uitsnede)</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
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

  // ── Video area ──
  // The outer wrapper keeps the 4:3 aspect ratio reservation for the page layout.
  // The inner letterbox uses flexbox centering so the canvas never overflows,
  // and the canvas itself uses object-fit: contain to show the full frame.
  videoWrap:    { position: 'relative', width: '100%', aspectRatio: '4/3', backgroundColor: '#0a0f1a', borderRadius: '16px', border: '1px solid #1e293b', overflow: 'hidden' },
  canvasLetterbox: {
    position: 'absolute', inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#000',
  },
  canvas: {
    // Let the canvas fill the container while keeping its own aspect ratio.
    // `contain` adds black bars when the video is portrait or wider than 4:3.
    maxWidth: '100%',
    maxHeight: '100%',
    width: 'auto',
    height: 'auto',
    objectFit: 'contain',
    display: 'block',
  },

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
