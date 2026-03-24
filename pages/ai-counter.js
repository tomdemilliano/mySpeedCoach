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
 *
 * CHANGES:
 *   • Step markers (yellow triangles) rendered on the live signal graph
 *   • Post-session scrollable review timeline with video scrubbing
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
  Users, Cpu, Volume2, VolumeX,
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

// ─── Backend loader ───────────────────────────────────────────────────────────
async function loadBackend(backendId) {
  const def = BACKENDS[backendId];
  if (!def) throw new Error('Unknown backend: ' + backendId);
  if (backendId === 'mediapipe') {
    await Promise.all([loadScript(MP_POSE), loadScript(MP_CAMERA), loadScript(MP_DRAWING)]);
    return null;
  }
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
  kalmanEnabled:     true,
  kalmanProcessNoise: 0.01,
  peakMinAmplitude:  0.015, // min actual ankle rise from peak-entry to peak-minimum
  exitFactor:        1.0,
};

// ─── Ankle Kalman Filter ──────────────────────────────────────────────────────
class AnkleKalmanFilter {
  constructor() { this.reset(); }
  reset() {
    this._x = null; this._v = 0;
    this._p00 = 1; this._p01 = 0; this._p10 = 0; this._p11 = 1;
    this._lastT = null;
  }
  update(rawY, confidence, t, Q = 0.01) {
    if (this._x === null) { this._x = rawY; this._v = 0; this._lastT = t; return rawY; }
    const dt = Math.min((t - this._lastT) / 33.0, 4.0);
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

// ─── Step Detector ────────────────────────────────────────────────────────────
class StepDetector {
  constructor(config = DEFAULT_CONFIG) { this.config = { ...DEFAULT_CONFIG, ...config }; this.reset(); }
  updateConfig(c) { this.config = { ...this.config, ...c }; }
  reset() {
    this.signal = []; this.steps = 0; this.misses = 0;
    this.lastStepTime = 0; this.lastMissTime = 0;
    this.inPeak = false; this.peakY = null; this.valleyY = null;
    this.peakEntryY = null; // avgY at the moment the peak phase began
    this.sessionStart = null;
  }
  push(y, t) {
    if (!this.sessionStart) this.sessionStart = t;
    this.signal.push({ y, t });
    if (this.signal.length > 90) this.signal.shift();
    const ev = this._detect(y, t);
    return ev;
  }
  // Returns a snapshot of internal state AFTER the last push — used for per-sample debug recording
  get debugState() {
    return {
      valleyY:  this.valleyY,
      peakY:    this.peakY,
      peakEntryY: this.peakEntryY,
      inPeak:   this.inPeak,
      lastStepTime: this.lastStepTime,
    };
  }
  _detect(y, t) {
    const { peakMinProminence: P, peakMinIntervalMs: I, missGapMs: M, peakMinAmplitude: A = 0.015, exitFactor: EF = 1.0 } = this.config;
    if (this.signal.length < 5) return null;
    const avgY = this.signal.slice(-5).reduce((s, p) => s + p.y, 0) / 5;
    if (this.valleyY === null) { this.valleyY = avgY; return null; }
    if (!this.inPeak && (this.valleyY - avgY) > P) {
      this.inPeak = true; this.peakY = avgY;
      this.peakEntryY = avgY; // record avgY at the moment we enter peak phase
    }
    if (this.inPeak) {
      if (avgY < this.peakY) this.peakY = avgY;
      if (avgY > this.peakY + P * EF) {
        this.inPeak = false; this.valleyY = avgY;
        // Gate 1: prominence (valley baseline vs peak minimum)
        // Gate 2: amplitude (actual rise from entry point to peak minimum)
        const amplitude = (this.peakEntryY ?? avgY) - this.peakY;
        if ((this.valleyY - this.peakY) >= P && amplitude >= A) {
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

// ─── Helper: draw signal + step markers onto a canvas context ─────────────────
// Used by both the live overlay and the review timeline so rendering is consistent.
function drawSignalToCanvas(ctx, w, h, signalHistory, stepTimestamps, config, playheadT = null) {
  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = 'rgba(15,23,42,0.82)';
  if (ctx.roundRect) { ctx.roundRect(0, 0, w, h, 6); } else { ctx.rect(0, 0, w, h); }
  ctx.fill();

  // Grid
  ctx.strokeStyle = 'rgba(51,65,85,0.5)'; ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath(); ctx.moveTo(0, (h / 4) * i); ctx.lineTo(w, (h / 4) * i); ctx.stroke();
  }

  if (!signalHistory || signalHistory.length < 2) {
    ctx.fillStyle = 'rgba(100,116,139,0.7)';
    ctx.font = '9px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('wacht op signaal…', w / 2, h / 2 + 3);
    return;
  }

  const vals = signalHistory.map(p => p.y);
  const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 0.01;
  const tMin = signalHistory[0].t;
  const tMax = signalHistory[signalHistory.length - 1].t;
  const tRange = tMax - tMin || 1;

  const toY = v => h - ((v - mn) / rng) * h * 0.82 - h * 0.09;
  const toX = t => ((t - tMin) / tRange) * w;

  // Threshold line
  const ty = h - ((config.peakMinProminence / (rng + config.peakMinProminence)) * h * 0.75 + h * 0.09);
  ctx.strokeStyle = 'rgba(245,158,11,0.45)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(w, ty); ctx.stroke(); ctx.setLineDash([]);

  // Raw signal (when Kalman on)
  const hasRaw = config.kalmanEnabled && signalHistory.some(p => p.raw !== undefined && Math.abs(p.raw - p.y) > 0.001);
  if (hasRaw) {
    ctx.strokeStyle = 'rgba(71,85,105,0.7)'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
    ctx.beginPath();
    signalHistory.forEach((p, i) => {
      const x = toX(p.t);
      i === 0 ? ctx.moveTo(x, toY(p.raw ?? p.y)) : ctx.lineTo(x, toY(p.raw ?? p.y));
    });
    ctx.stroke(); ctx.setLineDash([]);
  }

  // Filtered signal
  ctx.strokeStyle = config.kalmanEnabled ? '#00d4aa' : '#60a5fa'; ctx.lineWidth = 2;
  ctx.beginPath();
  signalHistory.forEach((p, i) => {
    const x = toX(p.t);
    i === 0 ? ctx.moveTo(x, toY(p.y)) : ctx.lineTo(x, toY(p.y));
  });
  ctx.stroke();

  // Step markers — yellow vertical lines with step number
  if (stepTimestamps && stepTimestamps.length > 0) {
    stepTimestamps.forEach(entry => {
      const st = entry?.t ?? entry; // support both {t,n} objects and plain numbers
      if (st < tMin - 50 || st > tMax + 50) return;
      const x = toX(st);

      // Vertical line
      ctx.strokeStyle = 'rgba(250,204,21,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();

      // Step number label at top
      if (entry?.n != null) {
        ctx.fillStyle = '#facc15';
        ctx.font = 'bold 8px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(entry.n, x, 9);
      }
    });
  }

  // Playhead line (for review mode)
  if (playheadT !== null) {
    const px = toX(playheadT);
    ctx.strokeStyle = '#f472b6';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
    ctx.setLineDash([]);

    // Small circle on playhead
    ctx.beginPath(); ctx.arc(px, h / 2, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#f472b6'; ctx.fill();
  }
}

// ─── Live Signal Graph Overlay ────────────────────────────────────────────────
// Shown as a floating panel below the video during active analysis.
function LiveSignalOverlay({ signalHistory, stepTimestamps, config, visible }) {
  const gRef = useRef(null);

  useEffect(() => {
    if (!visible) return;
    const canvas = gRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    drawSignalToCanvas(ctx, canvas.width, canvas.height, signalHistory, stepTimestamps, config, null);
  }, [signalHistory, stepTimestamps, visible, config.peakMinProminence, config.kalmanEnabled]);

  if (!visible) return null;

  return (
    <div style={{ backgroundColor: '#1e293b', borderRadius: '10px', border: '1px solid #334155', padding: '8px 10px' }}>
      <canvas ref={gRef} width={300} height={54}
        style={{ width: '100%', height: '54px', borderRadius: '6px', display: 'block', border: '1px solid rgba(51,65,85,0.5)' }} />
      <div style={{ display: 'flex', gap: '12px', marginTop: '3px', paddingLeft: '2px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '9px', color: '#00d4aa', display: 'flex', alignItems: 'center', gap: '3px' }}>
          <span style={{ width: '10px', height: '2px', backgroundColor: '#00d4aa', display: 'inline-block' }} />
          enkel
        </span>
        <span style={{ fontSize: '9px', color: 'rgba(245,158,11,0.8)', display: 'flex', alignItems: 'center', gap: '3px' }}>
          <span style={{ width: '10px', height: '0px', borderTop: '1px dashed rgba(245,158,11,0.7)', display: 'inline-block' }} />
          drempel
        </span>
        <span style={{ fontSize: '9px', color: '#facc15', display: 'flex', alignItems: 'center', gap: '3px' }}>
          <span style={{ width: '0', height: '0', borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '6px solid #facc15', display: 'inline-block' }} />
          stap
        </span>
      </div>
    </div>
  );
}

// ─── Post-Session Review Timeline ─────────────────────────────────────────────
// Full-width scrollable graph. Clicking/dragging seeks the video to that point.
// Works for both uploaded video and live camera (camera has no seekable video).
function ReviewTimeline({ signalHistory, stepTimestamps, config, sessionStartTime, uploadVideoRef, hasUploadVideo }) {
  const canvasRef   = useRef(null);
  const isDragging  = useRef(false);

  const [playheadT,  setPlayheadT]  = useState(null);
  // Metrics shown at hover/playhead position
  const [hoverInfo,  setHoverInfo]  = useState(null);

  const PX_PER_SAMPLE = 2.5;
  const canvasW = Math.max(600, (signalHistory?.length || 0) * PX_PER_SAMPLE);
  const canvasH = 100;

  // Redraw whenever data or playhead changes
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    drawSignalToCanvas(ctx, canvasW, canvasH, signalHistory, stepTimestamps, config, playheadT);
  }, [signalHistory, stepTimestamps, config, playheadT, canvasW]);

  const seekToX = useCallback((clientX) => {
    const canvas = canvasRef.current;
    if (!canvas || !signalHistory?.length) return;

    const rect = canvas.getBoundingClientRect();
    // canvas may be CSS-scaled (width prop != rendered width), so ratio by CSS width
    const canvasX = ((clientX - rect.left) / rect.width) * canvasW;
    const ratio = Math.max(0, Math.min(1, canvasX / canvasW));

    const tMin = signalHistory[0].t;
    const tMax = signalHistory[signalHistory.length - 1].t;
    const targetT = tMin + ratio * (tMax - tMin);
    setPlayheadT(targetT);

    // ── Find nearest signal sample for metrics ──
    const nearest = signalHistory.reduce((best, p) =>
      Math.abs(p.t - targetT) < Math.abs(best.t - targetT) ? p : best
    , signalHistory[0]);

    // Count steps up to this point
    const stepsUpTo = stepTimestamps ? stepTimestamps.filter(s => (s?.t ?? s) <= targetT).length : 0;
    // Time from session start
    const elapsedMs = targetT - tMin;

    // ── Compute rolling avgY at this sample (mirror detector: last 5 samples) ──
    const idx = signalHistory.indexOf(nearest);
    const window5 = signalHistory.slice(Math.max(0, idx - 4), idx + 1);
    const avgY = window5.reduce((sum, p) => sum + p.y, 0) / window5.length;

    // Detector internal state stored on sample
    const valleyY = nearest.valleyY ?? null;
    const peakY   = nearest.peakY   ?? null;
    const inPeak  = nearest.inPeak  ?? false;
    const P = config.peakMinProminence;
    const I = config.peakMinIntervalMs;

    // ── Find nearest counted step within 300ms ──
    const nearestStepEntry = stepTimestamps?.reduce((best, s) => {
      const st = s?.t ?? s;
      if (!best) return s;
      return Math.abs(st - targetT) < Math.abs((best?.t ?? best) - targetT) ? s : best;
    }, null);
    const nearestStepT = nearestStepEntry ? (nearestStepEntry?.t ?? nearestStepEntry) : null;
    const nearestStepDt = nearestStepT != null ? Math.abs(nearestStepT - targetT) : Infinity;
    const isAtStep = nearestStepDt < 300;

    // ── Build a human explanation of why / why not ──
    let explanationLines = [];

    if (valleyY === null) {
      explanationLines = [{ type: 'neutral', text: 'Te vroeg: detector initialiseert nog (wacht op 5 samples).' }];
    } else {
      // Phase description
      if (inPeak) {
        const prominence = valleyY - peakY;
        explanationLines.push({ type: 'info', text: `In piek-fase: enkel is omhoog gegaan (laagste punt peakY=${peakY?.toFixed(3)}).` });
        explanationLines.push({ type: 'info', text: `Piek-prominentie tot nu: ${prominence.toFixed(3)} (drempel: ${P.toFixed(3)}).` });
        explanationLines.push({ type: 'neutral', text: 'Wacht op terugkeer omlaag om piek te bevestigen…' });
      } else {
        const dip = valleyY - avgY;
        if (dip > P) {
          explanationLines.push({ type: 'info', text: `Dip gedetecteerd: bodem (${avgY.toFixed(3)}) ligt ${dip.toFixed(3)} onder dal (${valleyY.toFixed(3)}).` });
          explanationLines.push({ type: 'ok',   text: `Drempel ${P.toFixed(3)} overschreden → detector gaat piek-fase in.` });
        } else {
          explanationLines.push({ type: 'neutral', text: `Rust-fase: geen piek actief. Dal=${valleyY?.toFixed(3)}, huidig gem.=${avgY.toFixed(3)}.` });
          explanationLines.push({ type: 'warn', text: `Dip ${dip.toFixed(3)} < drempel ${P.toFixed(3)} → nog geen beweging herkend.` });
        }
      }
    }

    // Step / no-step at this position
    if (isAtStep) {
      const stepEntry = nearestStepEntry;
      const stepN = stepEntry?.n;
      explanationLines.push({ type: 'ok', text: `✓ Stap #${stepN ?? '?'} geteld ${nearestStepDt < 10 ? 'hier' : `${Math.round(nearestStepDt)} ms geleden`}.` });
      // Interval check (reconstruct from step list)
      const prevStep = stepTimestamps?.filter(s => (s?.t ?? s) < (nearestStepT ?? 0)).slice(-1)[0];
      if (prevStep) {
        const dt = nearestStepT - (prevStep?.t ?? prevStep);
        if (dt < I) {
          explanationLines.push({ type: 'warn', text: `Interval ${dt} ms < minimum ${I} ms → deze stap had geblokkeerd kunnen worden.` });
        } else {
          explanationLines.push({ type: 'ok', text: `Interval ${dt} ms ≥ minimum ${I} ms → doorgelaten.` });
        }
      }
    } else {
      // Why wasn't a step counted here?
      if (!inPeak && valleyY !== null) {
        const dip = valleyY - avgY;
        if (dip <= P) {
          explanationLines.push({ type: 'warn', text: `Geen stap: beweging ${dip.toFixed(3)} te klein (min ${P.toFixed(3)}).` });
        }
      }
      // Interval block?
      const lastStep = stepTimestamps?.filter(s => (s?.t ?? s) <= targetT).slice(-1)[0];
      if (lastStep) {
        const dtSince = targetT - (lastStep?.t ?? lastStep);
        if (dtSince < I) {
          explanationLines.push({ type: 'warn', text: `Interval-blokkade: slechts ${Math.round(dtSince)} ms na laatste stap (min ${I} ms).` });
        }
      }
    }

    setHoverInfo({
      elapsedMs,
      ankleY: nearest.y,
      rawY: nearest.raw ?? nearest.y,
      avgY,
      valleyY,
      peakY,
      inPeak,
      stepsUpTo,
      isAtStep,
      nearestStepDt: isAtStep ? nearestStepDt : null,
      explanationLines,
    });

    // ── Seek the upload video ──
    if (hasUploadVideo && uploadVideoRef?.current && sessionStartTime) {
      // Map wall-clock timestamp → video seconds
      // sessionStartTime is Date.now() captured at the start of processVideo,
      // which is before video.play() — so offset matches signal timestamps.
      const videoSec = (targetT - sessionStartTime) / 1000;
      const vid = uploadVideoRef.current;
      try {
        // Only seek if video is in a seekable state
        if (vid.readyState >= 1 && isFinite(videoSec) && videoSec >= 0) {
          vid.pause();
          vid.currentTime = Math.min(videoSec, vid.duration || videoSec);
        }
      } catch (e) {
        console.warn('[ReviewTimeline] seek failed:', e?.message);
      }
    }
  }, [signalHistory, stepTimestamps, canvasW, hasUploadVideo, uploadVideoRef, sessionStartTime]);

  const onPointerDown = useCallback((e) => {
    isDragging.current = true;
    canvasRef.current?.setPointerCapture?.(e.pointerId);
    seekToX(e.clientX);
  }, [seekToX]);

  const onPointerMove = useCallback((e) => {
    if (!isDragging.current) return;
    seekToX(e.clientX);
  }, [seekToX]);

  const onPointerUp = useCallback(() => { isDragging.current = false; }, []);

  if (!signalHistory || signalHistory.length < 5) return null;

  const stepCount = stepTimestamps?.length || 0;

  return (
    <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
        <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          📊 Signaalreview
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '10px', color: '#facc15', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '1.5px', height: '10px', backgroundColor: '#facc15', display: 'inline-block' }} />
            {stepCount} stappen gemarkeerd
          </span>
          {hasUploadVideo && (
            <span style={{ fontSize: '10px', color: '#f472b6', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '12px', height: '2px', backgroundColor: '#f472b6', display: 'inline-block' }} />
              klik om te scrubben
            </span>
          )}
        </div>
      </div>

      {/* Scrollable canvas */}
      <div style={{
        overflowX: 'auto', overflowY: 'hidden',
        borderRadius: '8px', border: '1px solid #0f172a',
        cursor: 'crosshair', WebkitOverflowScrolling: 'touch',
      }}>
        <canvas
          ref={canvasRef}
          width={canvasW}
          height={canvasH}
          style={{ display: 'block', height: `${canvasH}px`, width: `${canvasW}px`, userSelect: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
      </div>

      {/* ── Step explanation panel — shown when playhead is active ── */}
      {hoverInfo && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

          {/* Compact metrics row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '5px' }}>
            <div style={metricCard}>
              <span style={metricVal}>{fmtTime(hoverInfo.elapsedMs)}</span>
              <span style={metricLabel}>tijdstip</span>
            </div>
            <div style={metricCard}>
              <span style={{ ...metricVal, color: '#22c55e' }}>{hoverInfo.stepsUpTo}</span>
              <span style={metricLabel}>stappen tot hier</span>
            </div>
            <div style={metricCard}>
              <span style={{ ...metricVal, color: '#00d4aa', fontFamily: 'monospace', fontSize: '13px' }}>
                {hoverInfo.avgY.toFixed(3)}
              </span>
              <span style={metricLabel}>gem. Y (5 samples)</span>
            </div>
            {hoverInfo.valleyY != null && (
              <div style={metricCard}>
                <span style={{ ...metricVal, color: '#60a5fa', fontFamily: 'monospace', fontSize: '13px' }}>
                  {hoverInfo.valleyY.toFixed(3)}
                </span>
                <span style={metricLabel}>dalreferentie</span>
              </div>
            )}
            {hoverInfo.peakY != null && hoverInfo.inPeak && (
              <div style={{ ...metricCard, borderColor: '#a78bfa44' }}>
                <span style={{ ...metricVal, color: '#a78bfa', fontFamily: 'monospace', fontSize: '13px' }}>
                  {hoverInfo.peakY.toFixed(3)}
                </span>
                <span style={metricLabel}>piek-minimum</span>
              </div>
            )}
            <div style={{ ...metricCard, borderColor: hoverInfo.inPeak ? '#f59e0b55' : '#1e293b' }}>
              <span style={{ ...metricVal, color: hoverInfo.inPeak ? '#f59e0b' : '#334155', fontSize: '13px' }}>
                {hoverInfo.inPeak ? '▲ piek-fase' : '– rust-fase'}
              </span>
              <span style={metricLabel}>detector-toestand</span>
            </div>
          </div>

          {/* Explanation block */}
          <div style={{ backgroundColor: '#0f172a', borderRadius: '10px', border: `1px solid ${hoverInfo.isAtStep ? '#facc1533' : '#1e293b'}`, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <div style={{ fontSize: '9px', fontWeight: '700', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              🔍 Detectie-uitleg op dit punt
            </div>
            {hoverInfo.explanationLines.map((line, i) => {
              const colors = { ok: '#22c55e', warn: '#f59e0b', info: '#60a5fa', neutral: '#475569' };
              const icons  = { ok: '✓', warn: '⚠', info: 'ℹ', neutral: '·' };
              return (
                <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '11px', color: colors[line.type], flexShrink: 0, marginTop: '0px', lineHeight: 1.4 }}>{icons[line.type]}</span>
                  <span style={{ fontSize: '11px', color: line.type === 'neutral' ? '#475569' : '#94a3b8', lineHeight: 1.4 }}>{line.text}</span>
                </div>
              );
            })}
            {hoverInfo.explanationLines.length === 0 && (
              <span style={{ fontSize: '11px', color: '#334155' }}>Geen data op dit punt.</span>
            )}
          </div>

          {/* How the algorithm works — collapsed explainer */}
          <details style={{ backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b', padding: '8px 12px' }}>
            <summary style={{ fontSize: '10px', fontWeight: '700', color: '#334155', cursor: 'pointer', userSelect: 'none', letterSpacing: '0.3px' }}>
              📖 Hoe werkt de stap-detectie?
            </summary>
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', color: '#475569', lineHeight: 1.55 }}>
              <p style={{ margin: 0 }}>
                De detector volgt continu de <strong style={{ color: '#64748b' }}>enkelhoogte Y</strong> (0 = boven, 1 = onder in frame).
                Een stap wordt geteld als een volledige <em>piek-cyclus</em> is afgerond met voldoende grootte.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', gap: '7px' }}>
                  <span style={{ color: '#60a5fa', flexShrink: 0 }}>①</span>
                  <span><strong style={{ color: '#60a5fa' }}>Dal-referentie (dalreferentie)</strong> — het lopende hoogste Y-punt (= laagste positie van de enkel). Past zich langzaam aan als de enkel omhoog gaat.</span>
                </div>
                <div style={{ display: 'flex', gap: '7px' }}>
                  <span style={{ color: '#a78bfa', flexShrink: 0 }}>②</span>
                  <span><strong style={{ color: '#a78bfa' }}>Piek-fase</strong> — wordt geactiveerd zodra het gemiddelde Y meer dan <strong style={{ color: '#f59e0b' }}>drempel ({config.peakMinProminence.toFixed(3)})</strong> daalt t.o.v. het dal. Dit betekent dat de enkel omhoog beweegt (sprong).</span>
                </div>
                <div style={{ display: 'flex', gap: '7px' }}>
                  <span style={{ color: '#22c55e', flexShrink: 0 }}>③</span>
                  <span><strong style={{ color: '#22c55e' }}>Stap tellen</strong> — wanneer de enkel vanuit de piek weer <strong>genoeg terugzakt</strong> (≥ drempel), wordt een stap geteld — maar alleen als (a) de werkelijke sprong-hoogte ≥ <strong style={{ color: '#a78bfa' }}>min. sprong-hoogte ({config.peakMinAmplitude?.toFixed(3) ?? '0.015'})</strong> en (b) er minimaal <strong style={{ color: '#f59e0b' }}>{config.peakMinIntervalMs} ms</strong> verstreken is.</span>
                </div>
                <div style={{ display: 'flex', gap: '7px' }}>
                  <span style={{ color: '#ef4444', flexShrink: 0 }}>④</span>
                  <span><strong style={{ color: '#ef4444' }}>Mist</strong> — als er langer dan <strong style={{ color: '#f59e0b' }}>{config.missGapMs} ms × 2</strong> geen stap wordt gedetecteerd terwijl de skipper wel springt, telt de detector een mister.</span>
                </div>
              </div>
              <p style={{ margin: 0, color: '#334155', fontSize: '10px' }}>
                💡 Tip: als stappen worden gemist, verlaag de <em>Pieksensitiviteit</em>. Bij dubbeltelling, verhoog het <em>Min. interval</em>.
              </p>
            </div>
          </details>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '9px', color: '#00d4aa', display: 'flex', alignItems: 'center', gap: '3px' }}>
          <span style={{ width: '12px', height: '2px', backgroundColor: '#00d4aa', display: 'inline-block' }} />
          gefilterd enkel
        </span>
        <span style={{ fontSize: '9px', color: 'rgba(245,158,11,0.8)', display: 'flex', alignItems: 'center', gap: '3px' }}>
          <span style={{ width: '10px', height: '0px', borderTop: '1px dashed rgba(245,158,11,0.7)', display: 'inline-block' }} />
          drempel
        </span>
        <span style={{ fontSize: '9px', color: '#475569', display: 'flex', alignItems: 'center', gap: '3px' }}>
          <span style={{ width: '10px', height: '1px', borderTop: '1px dashed #475569', display: 'inline-block' }} />
          ruw
        </span>
        <span style={{ fontSize: '9px', color: '#facc15', display: 'flex', alignItems: 'center', gap: '3px' }}>
          <span style={{ width: '1.5px', height: '10px', backgroundColor: '#facc15', display: 'inline-block' }} />
          getelde stap
        </span>
        {hasUploadVideo && (
          <span style={{ fontSize: '9px', color: '#f472b6', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ width: '12px', height: '2px', backgroundColor: '#f472b6', display: 'inline-block' }} />
            afspeelpositie
          </span>
        )}
      </div>

      <div style={{ fontSize: '10px', color: '#334155', lineHeight: 1.5 }}>
        {hasUploadVideo
          ? 'Klik of sleep op de tijdlijn om de video te scrubben en stap voor stap te controleren.'
          : 'Scroll de tijdlijn om het volledige enkelsignaal te bekijken.'
        }
      </div>
    </div>
  );
}

// Small style helpers for the metrics cards
const metricCard  = { backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b', padding: '7px 10px', display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start' };
const metricVal   = { fontSize: '15px', fontWeight: '800', color: '#94a3b8', lineHeight: 1 };
const metricLabel = { fontSize: '9px', color: '#334155', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.4px' };

// ─── Beep Detector ────────────────────────────────────────────────────────────
// Connects to a video element's audio via Web Audio API and detects short tonal
// bursts (competition start/stop beeps) using a dominant-frequency + duration gate.
//
// The AudioContext reads audio data even when the video speaker is muted — so
// the user can keep the video muted and beep detection still works.
//
// Usage:
//   const bd = new BeepDetector(onBeep, options)
//   bd.attachVideo(videoElement)  → call once after video.play()
//   bd.startPolling()             → begin listening
//   bd.stopPolling()              → pause (keeps AudioContext alive)
//   bd.destroy()                  → full teardown (only when video element changes)

class BeepDetector {
  constructor(onBeep, opts = {}) {
    // NOTE: video element is NOT passed to the constructor — it is wired once
    // via attachVideo() because createMediaElementSource can only be called
    // once per HTMLMediaElement across the entire page lifetime.
    this.onBeep  = onBeep;
    this.opts = {
      fftSize:            2048,
      smoothing:          0.15,
      minFreq:            500,
      maxFreq:            5000,
      tonalityThreshold:  22,
      absThreshold:       -48,
      minDurationMs:      60,
      maxDurationMs:      600,
      cooldownMs:         1200,
      ...opts,
    };
    this._ctx        = null;
    this._analyser   = null;
    this._source     = null;   // created once, never recreated
    this._freqBuf    = null;
    this._rafId      = null;
    this._noiseFloor = -60;
    this._beepStart  = null;
    this._lastBeep   = 0;
    this._polling    = false;
    this._attached   = false;  // true once createMediaElementSource has been called
  }

  // Call once after video.play() — wires the Web Audio graph.
  // Subsequent calls with the SAME element are no-ops.
  // Passing a NEW element tears down the old graph first.
  attachVideo(videoEl) {
    if (this._attached && this._source) {
      // Already wired to this element — nothing to do
      return;
    }
    try {
      // Create AudioContext on first call (requires a user-gesture to already have happened)
      if (!this._ctx) {
        this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this._ctx.state === 'suspended') {
        this._ctx.resume().catch(() => {});
      }
      this._analyser = this._ctx.createAnalyser();
      this._analyser.fftSize              = this.opts.fftSize;
      this._analyser.smoothingTimeConstant = this.opts.smoothing;
      // THE line that can only run once per video element:
      this._source = this._ctx.createMediaElementSource(videoEl);
      this._source.connect(this._analyser);
      this._source.connect(this._ctx.destination); // audio still plays through speakers
      this._freqBuf  = new Float32Array(this._analyser.frequencyBinCount);
      this._attached = true;
    } catch (e) {
      console.warn('[BeepDetector] attachVideo failed:', e?.message);
    }
  }

  // Tear down completely — only call when the video element itself is being replaced
  destroy() {
    this.stopPolling();
    try { this._source?.disconnect(); }  catch (_) {}
    try { this._ctx?.close(); }          catch (_) {}
    this._ctx = this._analyser = this._source = this._freqBuf = null;
    this._attached = false;
  }

  // Start listening for beeps
  startPolling() {
    if (!this._attached || this._polling) return;
    this._polling    = true;
    this._beepStart  = null;
    this._lastBeep   = 0;
    this._noiseFloor = -60;
    this._poll();
    // Auto-calibrate noise floor after 300ms (video has had time to start)
    setTimeout(() => this.calibrate(), 300);
  }

  // Pause listening — does NOT destroy the AudioContext or source node
  stopPolling() {
    this._polling = false;
    cancelAnimationFrame(this._rafId);
  }

  calibrate() {
    if (!this._analyser || !this._freqBuf) return;
    this._analyser.getFloatFrequencyData(this._freqBuf);
    const { minBin, maxBin } = this._bands();
    let sum = 0, count = 0;
    for (let i = minBin; i <= maxBin; i++) {
      if (isFinite(this._freqBuf[i])) { sum += this._freqBuf[i]; count++; }
    }
    if (count > 0) this._noiseFloor = sum / count;
  }

  _bands() {
    const binHz = this._ctx.sampleRate / this.opts.fftSize;
    return {
      minBin: Math.floor(this.opts.minFreq / binHz),
      maxBin: Math.min(Math.ceil(this.opts.maxFreq / binHz), this._freqBuf.length - 1),
      binHz,
    };
  }

  _poll() {
    if (!this._polling) return;
    this._rafId = requestAnimationFrame(() => this._poll());
    if (!this._analyser || !this._freqBuf) return;

    this._analyser.getFloatFrequencyData(this._freqBuf);
    const { minBin, maxBin, binHz } = this._bands();

    let peakDb = -Infinity, peakBin = minBin;
    let sum = 0, count = 0;
    for (let i = minBin; i <= maxBin; i++) {
      const v = this._freqBuf[i];
      if (!isFinite(v)) continue;
      if (v > peakDb) { peakDb = v; peakBin = i; }
      sum += v; count++;
    }
    const meanDb   = count > 0 ? sum / count : -100;
    const tonality = peakDb - meanDb;

    const now     = performance.now();
    const isTonal = tonality > this.opts.tonalityThreshold
                 && peakDb   > this.opts.absThreshold
                 && peakDb   > this._noiseFloor + 12;

    if (isTonal) {
      if (this._beepStart === null) this._beepStart = now;
      const dur = now - this._beepStart;
      if (dur >= this.opts.minDurationMs
       && dur <= this.opts.maxDurationMs
       && now - this._lastBeep > this.opts.cooldownMs) {
        this._lastBeep = now;
        const freq = peakBin * binHz;
        this.onBeep({ freq: Math.round(freq), db: Math.round(peakDb) });
      }
    } else {
      if (this._beepStart !== null && now - this._beepStart > 80) {
        this._beepStart = null;
      }
    }
  }
}

// ─── Beep Status Badge ────────────────────────────────────────────────────────
// Shown overlay over the video while in beep-waiting state
function BeepStatusBadge({ beepMode, beepState, beepsDetected, onCancel }) {
  if (!beepMode) return null;

  const states = {
    waiting_start: { color: '#f59e0b', icon: '🔔', text: 'Wacht op startbeep…' },
    counting:      { color: '#22c55e', icon: '▶',  text: 'Tellen (wacht op stopbeep)' },
    waiting_stop:  { color: '#60a5fa', icon: '⏹',  text: 'Wacht op stopbeep…' },
    done:          { color: '#a78bfa', icon: '✓',  text: 'Beep-sessie voltooid' },
  };
  const st = states[beepState] || states.waiting_start;

  return (
    <div style={{
      position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)',
      zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
    }}>
      <div style={{
        backgroundColor: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)',
        border: `1.5px solid ${st.color}55`, borderRadius: '10px',
        padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '7px',
      }}>
        <span style={{ fontSize: '13px' }}>{st.icon}</span>
        <span style={{ fontSize: '12px', fontWeight: '700', color: st.color }}>{st.text}</span>
        {beepsDetected > 0 && (
          <span style={{ fontSize: '10px', color: '#64748b', marginLeft: '2px' }}>
            ({beepsDetected} beep{beepsDetected !== 1 ? 's' : ''})
          </span>
        )}
      </div>
      {beepState !== 'counting' && (
        <button onClick={onCancel} style={{
          fontSize: '10px', color: '#475569', background: 'rgba(0,0,0,0.5)',
          border: '1px solid #334155', borderRadius: '6px', padding: '3px 8px',
          cursor: 'pointer', fontFamily: 'inherit',
        }}>annuleer beep-modus</button>
      )}
    </div>
  );
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
function exportCsv(signalHistory, stepTimestamps, detCfg, backendId, disciplineId, sessionType, trackedFoot, sessionStartTime) {
  const tMin = sessionStartTime || (signalHistory[0]?.t ?? 0);

  // Build a set of step timestamps for fast lookup
  const stepTimes = new Set((stepTimestamps || []).map(s => s?.t ?? s));
  const stepByT   = {};
  (stepTimestamps || []).forEach(s => { stepByT[s?.t ?? s] = s?.n ?? '?'; });

  // Header
  const cols = [
    'elapsed_ms', 'timestamp_ms', 'ankle_y_filtered', 'ankle_y_raw',
    'valley_y', 'peak_y', 'in_peak',
    'step_counted', 'step_number',
  ];

  const rows = signalHistory.map(p => {
    const closest = [...stepTimes].reduce((best, st) =>
      Math.abs(st - p.t) < Math.abs(best - p.t) ? st : best
    , Infinity);
    const isStep = isFinite(closest) && Math.abs(closest - p.t) < 50; // within 50ms = this sample IS a step

    return [
      p.t - tMin,
      p.t,
      p.y.toFixed(5),
      (p.raw ?? p.y).toFixed(5),
      p.valleyY != null ? p.valleyY.toFixed(5) : '',
      p.peakY   != null ? p.peakY.toFixed(5)   : '',
      p.inPeak  != null ? (p.inPeak ? '1' : '0') : '',
      isStep ? '1' : '0',
      isStep ? (stepByT[closest] ?? '') : '',
    ].join(',');
  });

  // Meta header block
  const meta = [
    `# AI Stapteller export`,
    `# Datum: ${new Date().toISOString()}`,
    `# Backend: ${BACKENDS[backendId]?.label || backendId}`,
    `# Onderdeel: ${disciplineId}  Type: ${sessionType}  Voet: ${trackedFoot}`,
    `# Pieksensitiviteit: ${detCfg.peakMinProminence}  Min.interval: ${detCfg.peakMinIntervalMs}ms  Mist-drempel: ${detCfg.missGapMs}ms`,
    `# Kalman: ${detCfg.kalmanEnabled ? `aan (Q=${detCfg.kalmanProcessNoise})` : 'uit'}`,
    `# Stappen totaal: ${(stepTimestamps || []).length}`,
    `#`,
    cols.join(','),
  ].join('\n');

  const csv = meta + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `stapteller_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}


function BackendSelector({ value, onChange, disabled, loadingId }) {
  return (
    <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '12px 14px' }}>
      <div style={{ fontSize: '10px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Cpu size={11} /> AI-detectiemodel
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {Object.values(BACKENDS).map(b => {
          const sel = value === b.id; const ldr = loadingId === b.id;
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
function DetectionTuningPanel({ config, onChange }) {
  const [open, setOpen] = useState(false);

  const sliders = [
    { key: 'peakMinProminence', label: 'Pieksensitiviteit',  hint: 'Hoe groot de beweging t.o.v. de dalreferentie. Lager = gevoeliger.',      min: 0.003, max: 0.05,  step: 0.001, fmt: v => v.toFixed(3) },
    { key: 'peakMinAmplitude',  label: 'Min. sprong-hoogte', hint: 'Min. echte enkelhoogte t.o.v. het beginpunt van de piek. Blokkeert sluip-bewegingen en grondruis.', min: 0.005, max: 0.08,  step: 0.005, fmt: v => v.toFixed(3) },
    { key: 'peakMinIntervalMs', label: 'Min. interval (ms)', hint: 'Min. tijd tussen stappen. Verhoog bij dubbeltelling.',                       min: 60,    max: 400,   step: 10,    fmt: v => `${v} ms` },
    { key: 'missGapMs',         label: 'Mist-drempel (ms)',  hint: 'Hoe lang geen stap voor een mist.',                                         min: 300,   max: 1200,  step: 50,    fmt: v => `${v} ms` },
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
          {/* Kalman filter */}
          <div style={{ marginTop: '14px', marginBottom: '14px', backgroundColor: '#0f172a', borderRadius: '10px', border: `1px solid ${config.kalmanEnabled ? '#3b82f644' : '#1e293b'}`, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: config.kalmanEnabled ? '12px' : '0' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: config.kalmanEnabled ? '#60a5fa' : '#64748b' }}>Kalman-filter</div>
                <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>Smootht de enkelpositie en bridget occlusies (aanbevolen)</div>
              </div>
              <button onClick={() => onChange({ kalmanEnabled: !config.kalmanEnabled })}
                style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                  backgroundColor: config.kalmanEnabled ? '#3b82f6' : '#334155', position: 'relative', flexShrink: 0, transition: 'background-color 0.2s' }}>
                <div style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: 'white', position: 'absolute', top: '3px',
                  left: config.kalmanEnabled ? '23px' : '3px', transition: 'left 0.2s' }} />
              </button>
            </div>
            {config.kalmanEnabled && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8' }}>Procesruis (Q)</span>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: '#60a5fa', fontFamily: 'monospace' }}>{config.kalmanProcessNoise.toFixed(4)}</span>
                </div>
                <input type="range" min={0.001} max={0.1} step={0.001} value={config.kalmanProcessNoise}
                  onChange={e => onChange({ kalmanProcessNoise: Number(e.target.value) })} style={{ width: '100%', accentColor: '#3b82f6' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#334155', marginTop: '2px' }}>
                  <span>0.001 — meer smoothing, meer vertraging</span><span>0.1 — volgt model nauwer</span>
                </div>
              </div>
            )}
          </div>
          {/* Presets */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '10px', color: '#475569', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '7px' }}>Snelkeuze</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {presets.map(p => <button key={p.label} onClick={() => onChange(p.config)} style={{ padding: '5px 11px', borderRadius: '14px', border: '1px solid #334155', background: 'transparent', color: '#94a3b8', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>{p.label}</button>)}
              <button onClick={() => onChange(DEFAULT_CONFIG)} style={{ padding: '5px 11px', borderRadius: '14px', border: '1px solid #334155', background: 'transparent', color: '#64748b', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>Reset</button>
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
                onChange={e => onChange({ [sl.key]: Number(e.target.value) })} style={{ width: '100%', accentColor: '#3b82f6' }} />
              <div style={{ fontSize: '10px', color: '#475569', marginTop: '3px' }}>{sl.hint}</div>
            </div>
          ))}
          {/* Signal graph removed — full review timeline is available in results */}
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
  // ── NEW: step timestamps for graph markers ────────────────────────────────
  const [stepTimestamps, setStepTimestamps] = useState([]);
  // ── NEW: session start wall-clock time (for video seek mapping) ───────────
  const sessionStartTimeRef = useRef(null);
  // Write buffer for signal history — avoids React batching dropping early frames
  const signalBufRef        = useRef([]);
  // ── Audio toggle for uploaded videos ──────────────────────────────────────
  const [videoMuted,     setVideoMuted]     = useState(true);
  // ── Beep detection ────────────────────────────────────────────────────────
  const [beepMode,       setBeepMode]       = useState(false);   // toggle on/off
  const [beepState,      setBeepState]      = useState('waiting_start'); // waiting_start | counting | done
  const [beepsDetected,  setBeepsDetected]  = useState(0);
  const beepDetectorRef  = useRef(null);
  const beepModeRef      = useRef(false);   // sync with beepMode for callbacks
  const beepStateRef     = useRef('waiting_start');

  const videoRef       = useRef(null);
  const canvasRef      = useRef(null);
  const uploadVideoRef = useRef(null);
  const fileInputRef   = useRef(null);
  const detectorRef    = useRef(new StepDetector(DEFAULT_CONFIG));
  const kalmanRef      = useRef(new AnkleKalmanFilter());
  const lastAnkleYRef  = useRef(0.8);
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

  // Sync muted prop whenever it changes — skip if beep mode is active (it needs audio)
  useEffect(() => {
    if (uploadVideoRef.current && !beepModeRef.current) uploadVideoRef.current.muted = videoMuted;
  }, [videoMuted]);

  const { disciplines, getDisc } = useDisciplines();
  useEffect(() => {
    const uid = getCookie(); if (!uid) return;
    UserFactory.get(uid).then(s => { if (s.exists()) setCounterUser({ id: uid, ...s.data() }); });
  }, []);
  useEffect(() => { if (disciplines.length > 0 && !disciplineId) setDisciplineId(disciplines[0].id); }, [disciplines]);

  // ── Shared ankle processor ────────────────────────────────────────────────
  const processAnkle = useCallback((ankleY, ankleX, confidence, image) => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0) return;
    const ctx = canvas.getContext('2d');
    if (image) { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height); }

    const cfg = detectorRef.current.config;
    const filteredY = cfg.kalmanEnabled
      ? kalmanRef.current.update(ankleY, confidence, Date.now(), cfg.kalmanProcessNoise)
      : ankleY;

    const ax = ankleX * canvas.width;
    const ay = filteredY * canvas.height;
    ctx.beginPath(); ctx.arc(ax, ay, 18, 0, Math.PI * 2); ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(ax, ay, 8,  0, Math.PI * 2); ctx.fillStyle   = '#f59e0b'; ctx.fill();

    if (cfg.kalmanEnabled && Math.abs(ankleY - filteredY) > 0.002) {
      const rawAy = ankleY * canvas.height;
      ctx.beginPath(); ctx.arc(ax, rawAy, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(148,163,184,0.5)'; ctx.fill();
    }

    if (isRunRef.current) {
      const now = Date.now();
      const ev = detectorRef.current.push(filteredY, now);

      // Accumulate into ref first (avoids React batching dropping early frames).
      // Keep up to 120 seconds of signal regardless of frame rate.
      const MAX_SIGNAL_MS = 120_000;
      const dbg = detectorRef.current.debugState;
      signalBufRef.current.push({ y: filteredY, raw: ankleY, t: now,
        valleyY: dbg.valleyY, peakY: dbg.peakY, inPeak: dbg.inPeak,
        lastStepTime: dbg.lastStepTime,
      });
      // Trim old samples beyond the time window
      const cutoff = now - MAX_SIGNAL_MS;
      while (signalBufRef.current.length > 1 && signalBufRef.current[0].t < cutoff) {
        signalBufRef.current.shift();
      }
      // Flush ref → state at most once per animation frame (React sees one update)
      setSignalHist([...signalBufRef.current]);

      if (ev === 'step') {
        setSteps(detectorRef.current.steps);
        // Record exact timestamp + step number for explanation
        const stepNum = detectorRef.current.steps;
        setStepTimestamps(prev => [...prev, { t: now, n: stepNum }]);
      }
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

  // ── MediaPipe results callback ─────────────────────────────────────────────
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
    if (ank && ank.visibility > 0.25) {
      lastAnkleYRef.current = ank.y;
      processAnkle(ank.y, ank.x, ank.visibility, null);
    } else {
      processAnkle(lastAnkleYRef.current, 0.5, 0, null);
    }
  }, [processAnkle]);

  // ── TF.js frame processing ─────────────────────────────────────────────────
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

    const bdef = BACKENDS[bid]; const kps = poses[0].keypoints;

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

    const ai = trackedRef.current === 'left' ? bdef.ankleLeft : bdef.ankleRight;
    const ank = kps[ai];
    if (!ank || (ank.score ?? 1) < 0.15) {
      processAnkle(lastAnkleYRef.current, 0.5, 0, null); return;
    }
    lastAnkleYRef.current = ank.y / canvas.height;
    processAnkle(ank.y / canvas.height, ank.x / canvas.width, ank.score ?? 1, null);
  }, [processAnkle]);

  // ── Init backend ───────────────────────────────────────────────────────────
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
    return true;
  }, [onMpResults, facingMode]);

  // ── Camera start ───────────────────────────────────────────────────────────
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

  // ── Session controls ───────────────────────────────────────────────────────
  const startSession = useCallback(() => {
    detectorRef.current.reset(); detectorRef.current.updateConfig(detCfg);
    kalmanRef.current.reset(); lastAnkleYRef.current = 0.8;
    setSteps(0); setMisses(0); setElapsed(0); setSessionDone(false); setSavedOk(false);
    setSignalHist([]); setStepTimestamps([]); signalBufRef.current = [];  // ← reset all three
    sessionStartTimeRef.current = Date.now();
    isRunRef.current = true; setIsRunning(true);
    elapsedRef.current = setInterval(() => setElapsed(detectorRef.current.elapsedMs), 500);
  }, [detCfg]);

  const stopSession = useCallback(() => {
    isRunRef.current = false; setIsRunning(false);
    clearInterval(elapsedRef.current); cancelAnimationFrame(frameRef.current);
    setFinalSteps(detectorRef.current.steps); setFinalMisses(detectorRef.current.misses); setSessionDone(true);
  }, []);

  // ── Beep detection ─────────────────────────────────────────────────────────
  // Keep refs in sync so callbacks inside BeepDetector see current values.
  // Declared BEFORE handleFileSelect and processVideo which depend on these.
  useEffect(() => { beepModeRef.current  = beepMode;  }, [beepMode]);
  useEffect(() => { beepStateRef.current = beepState; }, [beepState]);

  // stopBeepDetector: pause polling only — NEVER destroy the AudioContext/source
  // (createMediaElementSource can only run once per element; destroying recreates it → crash)
  const stopBeepDetector = useCallback(() => {
    if (beepDetectorRef.current) beepDetectorRef.current.stopPolling();
  }, []);

  // attachBeepDetector: called once per video.play(). Creates the BeepDetector instance
  // on first call; subsequent calls (Opnieuw) reuse the same instance and just restart polling.
  const attachBeepDetector = useCallback((videoEl) => {
    if (!beepDetectorRef.current) {
      beepDetectorRef.current = new BeepDetector(({ freq, db }) => {
        if (!beepModeRef.current) return;
        const state = beepStateRef.current;
        console.log(`[Beep] freq=${freq}Hz  db=${db}dB  state=${state}`);
        setBeepsDetected(n => n + 1);
        if (state === 'waiting_start') {
          beepStateRef.current = 'counting';
          setBeepState('counting');
          // Reset detector and start counting immediately (no setTimeout delay).
          // Clear the video-progress interval first to avoid two competing setElapsed calls.
          clearInterval(elapsedRef.current);
          detectorRef.current.reset(); detectorRef.current.updateConfig(detCfg);
          kalmanRef.current.reset(); lastAnkleYRef.current = 0.8;
          setSteps(0); setMisses(0); setElapsed(0);
          setSignalHist([]); setStepTimestamps([]); signalBufRef.current = [];
          sessionStartTimeRef.current = Date.now();
          isRunRef.current = true; setIsRunning(true);
          elapsedRef.current = setInterval(() => setElapsed(detectorRef.current.elapsedMs), 500);
        } else if (state === 'counting') {
          beepStateRef.current = 'done';
          setBeepState('done');
          isRunRef.current = false; setIsRunning(false);
          clearInterval(elapsedRef.current);
          setFinalSteps(detectorRef.current.steps);
          setFinalMisses(detectorRef.current.misses);
          setSessionDone(true);
        }
      });
    }
    beepDetectorRef.current.attachVideo(videoEl);
    beepDetectorRef.current.startPolling();
  }, [detCfg]);

  // destroyBeepDetector: full teardown, only when a new video FILE is selected
  const destroyBeepDetector = useCallback(() => {
    if (beepDetectorRef.current) { beepDetectorRef.current.destroy(); beepDetectorRef.current = null; }
  }, []);

  const toggleBeepMode = useCallback(() => {
    setBeepMode(prev => {
      const next = !prev;
      beepModeRef.current = next;
      if (!next) {
        stopBeepDetector();
        if (uploadVideoRef.current) uploadVideoRef.current.muted = videoMuted;
      } else {
        setBeepState('waiting_start'); beepStateRef.current = 'waiting_start';
        setBeepsDetected(0);
      }
      return next;
    });
  }, [stopBeepDetector, videoMuted]);

  const cancelBeepMode = useCallback(() => {
    stopBeepDetector();
    setBeepMode(false); beepModeRef.current = false;
    setBeepState('waiting_start'); beepStateRef.current = 'waiting_start';
    setBeepsDetected(0);
    if (isRunRef.current) {
      isRunRef.current = false; setIsRunning(false);
      clearInterval(elapsedRef.current);
    }
  }, [stopBeepDetector]);

  // ── File select ────────────────────────────────────────────────────────────
  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0]; if (!file || !file.type.startsWith('video/')) return;
    setCodecError(false); setBackendError(''); setUploadProgress(0); setSessionDone(false); setSavedOk(false);
    if (uploadUrl) URL.revokeObjectURL(uploadUrl);
    // New file = new video element state. Fully tear down the AudioContext so
    // attachBeepDetector creates a fresh one for the new playback.
    destroyBeepDetector();
    setBeepState('waiting_start'); beepStateRef.current = 'waiting_start';
    setBeepsDetected(0);
    const url = URL.createObjectURL(file);
    setUploadFile(file); setUploadUrl(url); setMode('upload');
    setVideoMuted(true);
  }, [uploadUrl, destroyBeepDetector]);

  // ── Process video ──────────────────────────────────────────────────────────
  const processVideo = useCallback(async () => {
    const video = uploadVideoRef.current, canvas = canvasRef.current;
    if (!video || !canvas) return;
    setBackendError(''); setCodecError(false); setUploadProgress(0);
    // Apply mute: beep mode requires audio, otherwise respect user preference.
    // Set directly on the element — don't touch videoMuted state here.
    video.muted = beepModeRef.current ? false : videoMuted;
    video.load();
    try { await waitForVideoReady(video, 12000); } catch { setCodecError(true); return; }
    if (!video.videoWidth) { setCodecError(true); return; }
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;

    const ok = await initBackend(backendId, video, false); if (!ok) return;
    detectorRef.current.reset(); detectorRef.current.updateConfig(detCfg);
    kalmanRef.current.reset(); lastAnkleYRef.current = 0.8;
    setSteps(0); setMisses(0); setElapsed(0); setSessionDone(false);
    setSignalHist([]); setStepTimestamps([]); signalBufRef.current = [];  // ← reset all three

    // In beep-mode: wait for first beep before setting isRunning.
    // In normal mode: start immediately as before.
    // NOTE: attachBeepDetector is called AFTER video.play() below — not here —
    // because createMediaElementSource requires the element to be in playing state.
    const usingBeepMode = beepModeRef.current;
    if (usingBeepMode) {
      setBeepState('waiting_start'); beepStateRef.current = 'waiting_start';
      setBeepsDetected(0);
      sessionStartTimeRef.current = null; // will be set on first beep
      isRunRef.current = false; setIsRunning(false);
    } else {
      sessionStartTimeRef.current = Date.now();
      isRunRef.current = true; setIsRunning(true);
    }
    setMode('running');

    const dur = video.duration || 0; let aborted = false;
    // In beep mode: only track video progress (for the progress bar), not elapsed time.
    // The beep callback starts its own elapsed interval when counting begins.
    elapsedRef.current = setInterval(() => {
      if (!usingBeepMode) setElapsed(video.currentTime * 1000);
      if (dur > 0) setUploadProgress(Math.round((video.currentTime / dur) * 100));
    }, 300);

    const finish = () => {
      clearInterval(elapsedRef.current); setUploadProgress(100); aborted = true;
      stopBeepDetector(); // pause only — same video element, may retry
      if (beepModeRef.current && beepStateRef.current === 'counting') {
        beepStateRef.current = 'done'; setBeepState('done');
      }
      stopSession();
    };

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
      // Attach beep detector AFTER play() — createMediaElementSource requires a playing element
      if (usingBeepMode) attachBeepDetector(video);
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
      // Attach beep detector AFTER play() — createMediaElementSource requires a playing element
      if (usingBeepMode) attachBeepDetector(video);
      frameRef.current = requestAnimationFrame(loop);
    }
  }, [backendId, detCfg, initBackend, processTfjsFrame, onMpResults, stopSession, videoMuted, attachBeepDetector]);

  // ── Toggle audio on the fly ────────────────────────────────────────────────
  const toggleVideoAudio = useCallback(() => {
    setVideoMuted(prev => {
      const next = !prev;
      if (uploadVideoRef.current) uploadVideoRef.current.muted = next;
      return next;
    });
  }, []);

  // ── Save ───────────────────────────────────────────────────────────────────
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

  // ── Reset all ──────────────────────────────────────────────────────────────
  const resetAll = useCallback(() => {
    cancelAnimationFrame(frameRef.current); clearInterval(elapsedRef.current); clearTimeout(missTimerRef.current);
    isRunRef.current = false; stopCameraStream(); destroyBeepDetector();
    if (uploadUrl) { URL.revokeObjectURL(uploadUrl); setUploadUrl(''); }
    setUploadFile(null); setMode('idle'); setIsRunning(false);
    setSessionDone(false); setSteps(0); setMisses(0); setElapsed(0);
    setUploadProgress(0); setCodecError(false); setBackendError(''); setSavedOk(false);
    setSignalHist([]); setStepTimestamps([]); signalBufRef.current = [];
    setVideoMuted(true);
    setBeepMode(false); beepModeRef.current = false;
    setBeepState('waiting_start'); beepStateRef.current = 'waiting_start';
    setBeepsDetected(0);
    detectorRef.current.reset(); kalmanRef.current.reset(); lastAnkleYRef.current = 0.8;
    sessionStartTimeRef.current = null;
  }, [uploadUrl, stopCameraStream]);

  useEffect(() => () => {
    cancelAnimationFrame(frameRef.current); clearInterval(elapsedRef.current); clearTimeout(missTimerRef.current);
    stopCameraStream(); destroyBeepDetector(); if (uploadUrl) URL.revokeObjectURL(uploadUrl);
  }, []); // eslint-disable-line

  const currentDisc = getDisc(disciplineId);
  const durationSec = currentDisc?.durationSeconds || null;
  const progress    = durationSec ? Math.min(1, elapsed / (durationSec * 1000)) : 0;
  const isVideoMode = mode === 'upload' || mode === 'running';
  const activeBdef  = BACKENDS[backendId];

  // ── Derived visibility flags ───────────────────────────────────────────────
  // Settings panels only when idle/upload/camera (not during active session or after)
  const showSettingsPanels = !isRunning && !sessionDone;
  // Subtle settings summary shown when running or done (instead of full panels)
  const showSettingsSummary = isRunning || sessionDone;
  const showLiveGraph      = isRunning && (mode === 'camera' || mode === 'running');
  const showAudioToggle    = (mode === 'upload' || mode === 'running') && !sessionDone;

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

        {/* Config strip — always visible */}
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
          {uploadUrl && (
            <video
              ref={uploadVideoRef}
              src={uploadUrl}
              style={s.hiddenVideo}
              playsInline
              muted={videoMuted}
              preload="auto"
              onError={() => setCodecError(true)}
              onSeeked={() => {
                // When scrubbing in review mode, repaint the canvas with the seeked frame
                if (sessionDone && canvasRef.current && uploadVideoRef.current) {
                  const vid = uploadVideoRef.current;
                  const cvs = canvasRef.current;
                  if (vid.videoWidth > 0) {
                    cvs.width = vid.videoWidth; cvs.height = vid.videoHeight;
                    cvs.getContext('2d').drawImage(vid, 0, 0, cvs.width, cvs.height);
                  }
                }
              }}
            />
          )}
          <div style={s.canvasLetterbox}>
            <canvas ref={canvasRef} style={{ ...s.canvas, display: (mode === 'camera' || mode === 'running' || sessionDone) ? 'block' : 'none' }} />
          </div>
          <MissFlash visible={showMiss} />

          {/* Beep detection status overlay */}
          <BeepStatusBadge
            beepMode={beepMode && (mode === 'running')}
            beepState={beepState}
            beepsDetected={beepsDetected}
            onCancel={cancelBeepMode}
          />

          {/* Active backend badge */}
          {(mode === 'camera' || mode === 'running') && (
            <div style={{ position: 'absolute', bottom: '10px', right: '10px', zIndex: 15,
              backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
              border: `1px solid ${activeBdef.color}55`, borderRadius: '8px', padding: '4px 8px',
              fontSize: '10px', fontWeight: '700', color: activeBdef.color, display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Cpu size={10} /> {activeBdef.label}
            </div>
          )}

          {/* Audio toggle button */}
          {showAudioToggle && (
            <button
              onClick={beepMode ? undefined : toggleVideoAudio}
              title={beepMode ? 'Geluid vereist voor beep-detectie' : (videoMuted ? 'Geluid aan' : 'Geluid uit')}
              style={{
                position: 'absolute', top: '10px', right: '10px', zIndex: 18,
                width: '36px', height: '36px', borderRadius: '10px',
                backgroundColor: beepMode
                  ? 'rgba(245,158,11,0.7)'                          // amber = locked by beep mode
                  : videoMuted ? 'rgba(0,0,0,0.55)' : 'rgba(59,130,246,0.8)',
                border: `1px solid ${beepMode ? 'rgba(245,158,11,0.5)' : videoMuted ? 'rgba(255,255,255,0.15)' : 'rgba(96,165,250,0.5)'}`,
                color: 'white', cursor: beepMode ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backdropFilter: 'blur(4px)', transition: 'background-color 0.15s',
              }}
            >
              {beepMode ? <span style={{ fontSize: '14px' }}>🔔</span> : videoMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          )}

          {/* Idle */}
          {mode === 'idle' && (
            <div style={s.centeredOverlay}>
              <div style={s.idleIcon}><Camera size={48} color="#334155" /></div>
              <p style={s.idleTitle}>Kies een bron</p>
              <p style={s.idleSubtitle}>Gebruik je camera voor live tellen of upload een video.</p>
              {backendError && <div style={s.errorBanner}><AlertTriangle size={14} style={{ flexShrink: 0 }} />{backendError}</div>}
              <div style={s.idleBtns}>
                <button style={s.primaryBtn} disabled={!!backendLoading} onClick={startCamera}>
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
                  <p style={{ color: activeBdef.color, fontSize: '11px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Cpu size={11} /> {activeBdef.label}
                  </p>

                  {/* Beep-mode toggle */}
                  <button
                    onClick={toggleBeepMode}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '7px',
                      padding: '7px 14px', marginBottom: '12px',
                      borderRadius: '8px', fontFamily: 'inherit', cursor: 'pointer',
                      fontSize: '12px', fontWeight: '700',
                      backgroundColor: beepMode ? '#f59e0b22' : 'transparent',
                      border: `1.5px solid ${beepMode ? '#f59e0b' : '#334155'}`,
                      color: beepMode ? '#f59e0b' : '#64748b',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize: '14px' }}>🔔</span>
                    {beepMode ? 'Beep-detectie: AAN' : 'Beep-detectie: UIT'}
                    <span style={{
                      fontSize: '9px', fontWeight: '700', marginLeft: '2px',
                      backgroundColor: beepMode ? '#f59e0b33' : '#1e293b',
                      color: beepMode ? '#f59e0b' : '#475569',
                      borderRadius: '4px', padding: '1px 5px',
                    }}>
                      {beepMode ? 'start/stop via beep' : 'handmatig'}
                    </span>
                  </button>

                  {beepMode && (
                    <p style={{ fontSize: '11px', color: '#64748b', marginBottom: 12, maxWidth: '280px', textAlign: 'center', lineHeight: 1.5 }}>
                      Detecteert automatisch de start- en stopbeep in de video. Tellen begint bij de eerste beep en stopt bij de tweede.
                    </p>
                  )}

                  {backendError && <div style={{ ...s.errorBanner, marginBottom: 12 }}><AlertTriangle size={14} />{backendError}</div>}
                  <button style={s.primaryBtn} disabled={!!backendLoading} onClick={processVideo}>
                    {backendLoading
                      ? <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Model laden…</>
                      : <><Play size={16} fill="white" /> {beepMode ? 'Start video (wacht op beep)' : 'Analyseer video'}</>}
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

        {/* ── Live ankle signal graph — shown below video while running ── */}
        <LiveSignalOverlay
          signalHistory={signalHist}
          stepTimestamps={stepTimestamps}
          config={detCfg}
          visible={showLiveGraph}
        />

        {/* Controls */}
        <div style={s.controls}>
          {mode === 'camera' && !isRunning && !sessionDone && <button style={s.startBtn} onClick={startSession}><Play size={20} fill="white" /> START TELLEN</button>}
          {mode === 'camera' && isRunning && <button style={s.stopBtn} onClick={stopSession}><Square size={18} fill="white" /> STOP</button>}
          {mode === 'running' && isRunning && <button style={s.stopBtn} onClick={stopSession}><Square size={18} fill="white" /> STOP ANALYSE</button>}
          {(mode === 'camera' || isVideoMode) && !isRunning && !sessionDone && <button style={s.ghostBtn} onClick={resetAll}><ArrowLeft size={14} /> Terug</button>}
        </div>

        {/* ── Settings summary — subtle pill shown while running or when done ── */}
        {showSettingsSummary && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center',
            backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b',
            padding: '7px 12px',
          }}>
            <span style={{ fontSize: '9px', fontWeight: '700', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: '2px' }}>Config</span>
            <span style={{ fontSize: '10px', color: activeBdef.color, backgroundColor: `${activeBdef.color}18`, borderRadius: '5px', padding: '1px 7px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '3px' }}>
              <Cpu size={9} /> {activeBdef.label}
            </span>
            <span style={{ fontSize: '10px', color: '#475569', backgroundColor: '#1e293b', borderRadius: '5px', padding: '1px 7px' }}>
              sensitiviteit {detCfg.peakMinProminence.toFixed(3)}
            </span>
            <span style={{ fontSize: '10px', color: '#475569', backgroundColor: '#1e293b', borderRadius: '5px', padding: '1px 7px' }}>
              amplitude {detCfg.peakMinAmplitude?.toFixed(3) ?? '0.015'}
            </span>
            <span style={{ fontSize: '10px', color: '#475569', backgroundColor: '#1e293b', borderRadius: '5px', padding: '1px 7px' }}>
              interval {detCfg.peakMinIntervalMs} ms
            </span>
            <span style={{ fontSize: '10px', color: '#475569', backgroundColor: '#1e293b', borderRadius: '5px', padding: '1px 7px' }}>
              {trackedFoot === 'left' ? '👟 links' : '👟 rechts'}
            </span>
            {detCfg.kalmanEnabled && (
              <span style={{ fontSize: '10px', color: '#3b82f6', backgroundColor: '#3b82f618', borderRadius: '5px', padding: '1px 7px' }}>
                kalman ✓
              </span>
            )}
            {beepMode && (
              <span style={{ fontSize: '10px', color: '#f59e0b', backgroundColor: '#f59e0b18', borderRadius: '5px', padding: '1px 7px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                🔔 beep-modus
              </span>
            )}
          </div>
        )}

        {/* ── Settings panels — only before session starts ── */}
        {showSettingsPanels && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <BackendSelector value={backendId} disabled={isRunning} loadingId={backendLoading}
              onChange={async bid => {
                if (isRunning) return;
                stopCameraStream();
                if (mpPoseRef.current) { try { mpPoseRef.current.close(); } catch (_) {} mpPoseRef.current = null; }
                setBackendId(bid); setBackendError('');
                setBackendLoading(bid);
                try { await loadBackend(bid); } catch (e) { setBackendError(`Model laden mislukt: ${e.message}`); }
                setBackendLoading(null);
                if (mode === 'camera') setTimeout(() => startCamera(), 100);
              }}
            />
            <DetectionTuningPanel
              config={detCfg}
              onChange={p => setDetCfg(prev => ({ ...prev, ...p }))}
            />
          </div>
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

            {/* ── NEW: Review Timeline ── */}
            <ReviewTimeline
              signalHistory={signalHist}
              stepTimestamps={stepTimestamps}
              config={detCfg}
              sessionStartTime={sessionStartTimeRef.current}
              uploadVideoRef={uploadVideoRef}
              hasUploadVideo={!!uploadUrl && !!(uploadVideoRef.current)}
            />

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
                setSteps(0); setMisses(0); setElapsed(0); setSavedOk(false); setUploadProgress(0);
                setSignalHist([]); setStepTimestamps([]); signalBufRef.current = [];
                detectorRef.current.reset(); setMode('upload');
              }}>
                <RefreshCw size={14} /> Opnieuw
              </button>
            </div>

            {/* CSV export */}
            {signalHist.length > 0 && (
              <button
                style={{ ...s.ghostBtn, width: '100%', justifyContent: 'center', borderColor: '#1e3a5f', color: '#60a5fa', gap: '7px' }}
                onClick={() => exportCsv(signalHist, stepTimestamps, detCfg, backendId, disciplineId, sessionType, trackedFoot, sessionStartTimeRef.current)}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Exporteer meetdata als CSV
              </button>
            )}

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
