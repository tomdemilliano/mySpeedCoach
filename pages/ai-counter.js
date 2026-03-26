/**
 * pages/ai-counter.js  —  AI Stapteller (Beta)
 *
 * Hardcoded to MediaPipe BlazePose 0.5 (best single-person tracking).
 * Video preview shown immediately after upload so user can pick the correct foot.
 * Action controls shown below the video.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ClubMemberFactory, UserMemberLinkFactory, UserFactory,
  ClubFactory, GroupFactory, LiveSessionFactory,
} from '../constants/dbSchema';
import { useDisciplines } from '../hooks/useDisciplines';
import {
  ArrowLeft, Camera, Upload, FlipHorizontal, Play, Square,
  Zap, AlertTriangle, CheckCircle2, RefreshCw, Eye, EyeOff,
  Trophy, Info, Video, SlidersHorizontal, ChevronDown, ChevronUp,
  Users, Volume2, VolumeX, Heart,
} from 'lucide-react';

// ─── CDN URLs ─────────────────────────────────────────────────────────────────
const MP_POSE    = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose.js';
const MP_CAMERA  = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3.1675466862/camera_utils.js';
const MP_DRAWING = 'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils@0.3.1675466124/drawing_utils.js';

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

// ─── Default detection config ─────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  peakMinProminence:  0.012,
  peakMinIntervalMs: 120,
  missGapMs:         600,
  kalmanEnabled:     true,
  kalmanProcessNoise: 0.01,
  peakMinAmplitude:  0.015,
  exitFactor:        1.0,
};

// ─── AI Model registry ────────────────────────────────────────────────────────
const AI_MODELS = {
  blazepose: {
    id:          'blazepose',
    label:       'MediaPipe BlazePose',
    sublabel:    'Best accuracy · slower on mobile',
    recommended: 'desktop',
    scripts: [MP_POSE, MP_CAMERA, MP_DRAWING],
  },
  movenet_lightning: {
    id:          'movenet_lightning',
    label:       'MoveNet Lightning',
    sublabel:    'Fast · great for mobile',
    recommended: 'mobile',
    scripts: [
		'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core@4.17.0/dist/tf-core.min.js',
		'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl@4.17.0/dist/tf-backend-webgl.min.js',
		'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-converter@4.17.0/dist/tf-converter.min.js',
		'https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js',
    ],
  },
  movenet_thunder: {
    id:          'movenet_thunder',
    label:       'MoveNet Thunder',
    sublabel:    'More accurate · moderate speed',
    recommended: 'mobile',
    scripts: [
		'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core@4.17.0/dist/tf-core.min.js',
		'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl@4.17.0/dist/tf-backend-webgl.min.js',
		'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-converter@4.17.0/dist/tf-converter.min.js',
		'https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js',
    ],
  },
};

// MoveNet keypoint indices (17-point model)
const MN_ANKLE = { left: 15, right: 16 };

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
    // Use actual measured frame interval instead of assuming 30fps (33ms).
    // On mobile the gap between processed frames may be 80-150ms — hardcoding 33 made dt balloon to 4x clamp constantly.
    const rawDt = Math.min(t - this._lastT, 200); // ignore gaps > 200ms (app was backgrounded)
    const dt = rawDt / 33.0;                       // normalise to 30fps baseline, no upper clamp needed
    
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
    this.peakEntryY = null;
    this.sessionStart = null;
  }
  push(y, t) {
    if (!this.sessionStart) this.sessionStart = t;
    this.signal.push({ y, t });
    if (this.signal.length > 90) this.signal.shift();
    const ev = this._detect(y, t);
    return ev;
  }
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
      this.peakEntryY = avgY;
    }
    if (this.inPeak) {
      if (avgY < this.peakY) this.peakY = avgY;
      if (avgY > this.peakY + P * EF) {
        this.inPeak = false; this.valleyY = avgY;
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
function drawSignalToCanvas(ctx, w, h, signalHistory, stepTimestamps, config, playheadT = null) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(15,23,42,0.82)';
  if (ctx.roundRect) { ctx.roundRect(0, 0, w, h, 6); } else { ctx.rect(0, 0, w, h); }
  ctx.fill();
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
  const ty = h - ((config.peakMinProminence / (rng + config.peakMinProminence)) * h * 0.75 + h * 0.09);
  ctx.strokeStyle = 'rgba(245,158,11,0.45)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(w, ty); ctx.stroke(); ctx.setLineDash([]);
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
  ctx.strokeStyle = config.kalmanEnabled ? '#00d4aa' : '#60a5fa'; ctx.lineWidth = 2;
  ctx.beginPath();
  signalHistory.forEach((p, i) => {
    const x = toX(p.t);
    i === 0 ? ctx.moveTo(x, toY(p.y)) : ctx.lineTo(x, toY(p.y));
  });
  ctx.stroke();
  if (stepTimestamps && stepTimestamps.length > 0) {
    stepTimestamps.forEach(entry => {
      const st = entry?.t ?? entry;
      if (st < tMin - 50 || st > tMax + 50) return;
      const x = toX(st);
      ctx.strokeStyle = 'rgba(250,204,21,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      if (entry?.n != null) {
        ctx.fillStyle = '#facc15';
        ctx.font = 'bold 8px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(entry.n, x, 9);
      }
    });
  }
  if (playheadT !== null) {
    const px = toX(playheadT);
    ctx.strokeStyle = '#f472b6';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(px, h / 2, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#f472b6'; ctx.fill();
  }
}

// ─── Live Signal Graph Overlay ────────────────────────────────────────────────
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
          <span style={{ width: '10px', height: '2px', backgroundColor: '#00d4aa', display: 'inline-block' }} />enkel
        </span>
        <span style={{ fontSize: '9px', color: 'rgba(245,158,11,0.8)', display: 'flex', alignItems: 'center', gap: '3px' }}>
          <span style={{ width: '10px', height: '0px', borderTop: '1px dashed rgba(245,158,11,0.7)', display: 'inline-block' }} />drempel
        </span>
        <span style={{ fontSize: '9px', color: '#facc15', display: 'flex', alignItems: 'center', gap: '3px' }}>
          <span style={{ width: '0', height: '0', borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '6px solid #facc15', display: 'inline-block' }} />stap
        </span>
      </div>
    </div>
  );
}

// ─── Post-Session Review Timeline ─────────────────────────────────────────────
function ReviewTimeline({ signalHistory, stepTimestamps, config, sessionStartTime, uploadVideoRef, hasUploadVideo }) {
  const canvasRef   = useRef(null);
  const isDragging  = useRef(false);
  const [playheadT,  setPlayheadT]  = useState(null);
  const [hoverInfo,  setHoverInfo]  = useState(null);

  const PX_PER_SAMPLE = 2.5;
  const canvasW = Math.max(600, (signalHistory?.length || 0) * PX_PER_SAMPLE);
  const canvasH = 100;

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    drawSignalToCanvas(ctx, canvasW, canvasH, signalHistory, stepTimestamps, config, playheadT);
  }, [signalHistory, stepTimestamps, config, playheadT, canvasW]);

  const seekToX = useCallback((clientX) => {
    const canvas = canvasRef.current;
    if (!canvas || !signalHistory?.length) return;
    const rect = canvas.getBoundingClientRect();
    const canvasX = ((clientX - rect.left) / rect.width) * canvasW;
    const ratio = Math.max(0, Math.min(1, canvasX / canvasW));
    const tMin = signalHistory[0].t;
    const tMax = signalHistory[signalHistory.length - 1].t;
    const targetT = tMin + ratio * (tMax - tMin);
    setPlayheadT(targetT);
    const nearest = signalHistory.reduce((best, p) =>
      Math.abs(p.t - targetT) < Math.abs(best.t - targetT) ? p : best
    , signalHistory[0]);
    const stepsUpTo = stepTimestamps ? stepTimestamps.filter(s => (s?.t ?? s) <= targetT).length : 0;
    const elapsedMs = targetT - tMin;
    const idx = signalHistory.indexOf(nearest);
    const window5 = signalHistory.slice(Math.max(0, idx - 4), idx + 1);
    const avgY = window5.reduce((sum, p) => sum + p.y, 0) / window5.length;
    const valleyY = nearest.valleyY ?? null;
    const peakY   = nearest.peakY   ?? null;
    const inPeak  = nearest.inPeak  ?? false;
    const P = config.peakMinProminence;
    const I = config.peakMinIntervalMs;
    const nearestStepEntry = stepTimestamps?.reduce((best, s) => {
      const st = s?.t ?? s;
      if (!best) return s;
      return Math.abs(st - targetT) < Math.abs((best?.t ?? best) - targetT) ? s : best;
    }, null);
    const nearestStepT = nearestStepEntry ? (nearestStepEntry?.t ?? nearestStepEntry) : null;
    const nearestStepDt = nearestStepT != null ? Math.abs(nearestStepT - targetT) : Infinity;
    const isAtStep = nearestStepDt < 300;
    let explanationLines = [];
    if (valleyY === null) {
      explanationLines = [{ type: 'neutral', text: 'Te vroeg: detector initialiseert nog (wacht op 5 samples).' }];
    } else {
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
    if (isAtStep) {
      const stepEntry = nearestStepEntry;
      const stepN = stepEntry?.n;
      explanationLines.push({ type: 'ok', text: `✓ Stap #${stepN ?? '?'} geteld ${nearestStepDt < 10 ? 'hier' : `${Math.round(nearestStepDt)} ms geleden`}.` });
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
      if (!inPeak && valleyY !== null) {
        const dip = valleyY - avgY;
        if (dip <= P) {
          explanationLines.push({ type: 'warn', text: `Geen stap: beweging ${dip.toFixed(3)} te klein (min ${P.toFixed(3)}).` });
        }
      }
      const lastStep = stepTimestamps?.filter(s => (s?.t ?? s) <= targetT).slice(-1)[0];
      if (lastStep) {
        const dtSince = targetT - (lastStep?.t ?? lastStep);
        if (dtSince < I) {
          explanationLines.push({ type: 'warn', text: `Interval-blokkade: slechts ${Math.round(dtSince)} ms na laatste stap (min ${I} ms).` });
        }
      }
    }
    setHoverInfo({ elapsedMs, ankleY: nearest.y, rawY: nearest.raw ?? nearest.y, avgY, valleyY, peakY, inPeak, stepsUpTo, isAtStep, nearestStepDt: isAtStep ? nearestStepDt : null, explanationLines });
    if (hasUploadVideo && uploadVideoRef?.current && sessionStartTime) {
      const videoSec = (targetT - sessionStartTime) / 1000;
      const vid = uploadVideoRef.current;
      try {
        if (vid.readyState >= 1 && isFinite(videoSec) && videoSec >= 0) {
          vid.pause();
          vid.currentTime = Math.min(videoSec, vid.duration || videoSec);
        }
      } catch (e) { console.warn('[ReviewTimeline] seek failed:', e?.message); }
    }
  }, [signalHistory, stepTimestamps, canvasW, hasUploadVideo, uploadVideoRef, sessionStartTime]);

  const onPointerDown = useCallback((e) => {
    isDragging.current = true;
    canvasRef.current?.setPointerCapture?.(e.pointerId);
    seekToX(e.clientX);
  }, [seekToX]);
  const onPointerMove = useCallback((e) => { if (!isDragging.current) return; seekToX(e.clientX); }, [seekToX]);
  const onPointerUp = useCallback(() => { isDragging.current = false; }, []);

  if (!signalHistory || signalHistory.length < 5) return null;
  const stepCount = stepTimestamps?.length || 0;

  return (
    <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
      <div style={{ overflowX: 'auto', overflowY: 'hidden', borderRadius: '8px', border: '1px solid #0f172a', cursor: 'crosshair', WebkitOverflowScrolling: 'touch' }}>
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
      {hoverInfo && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '5px' }}>
            <div style={metricCard}><span style={metricVal}>{fmtTime(hoverInfo.elapsedMs)}</span><span style={metricLabel}>tijdstip</span></div>
            <div style={metricCard}><span style={{ ...metricVal, color: '#22c55e' }}>{hoverInfo.stepsUpTo}</span><span style={metricLabel}>stappen tot hier</span></div>
            <div style={metricCard}><span style={{ ...metricVal, color: '#00d4aa', fontFamily: 'monospace', fontSize: '13px' }}>{hoverInfo.avgY.toFixed(3)}</span><span style={metricLabel}>gem. Y (5 samples)</span></div>
            {hoverInfo.valleyY != null && <div style={metricCard}><span style={{ ...metricVal, color: '#60a5fa', fontFamily: 'monospace', fontSize: '13px' }}>{hoverInfo.valleyY.toFixed(3)}</span><span style={metricLabel}>dalreferentie</span></div>}
            {hoverInfo.peakY != null && hoverInfo.inPeak && <div style={{ ...metricCard, borderColor: '#a78bfa44' }}><span style={{ ...metricVal, color: '#a78bfa', fontFamily: 'monospace', fontSize: '13px' }}>{hoverInfo.peakY.toFixed(3)}</span><span style={metricLabel}>piek-minimum</span></div>}
            <div style={{ ...metricCard, borderColor: hoverInfo.inPeak ? '#f59e0b55' : '#1e293b' }}><span style={{ ...metricVal, color: hoverInfo.inPeak ? '#f59e0b' : '#334155', fontSize: '13px' }}>{hoverInfo.inPeak ? '▲ piek-fase' : '– rust-fase'}</span><span style={metricLabel}>detector-toestand</span></div>
          </div>
          <div style={{ backgroundColor: '#0f172a', borderRadius: '10px', border: `1px solid ${hoverInfo.isAtStep ? '#facc1533' : '#1e293b'}`, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <div style={{ fontSize: '9px', fontWeight: '700', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>🔍 Detectie-uitleg op dit punt</div>
            {hoverInfo.explanationLines.map((line, i) => {
              const colors = { ok: '#22c55e', warn: '#f59e0b', info: '#60a5fa', neutral: '#475569' };
              const icons  = { ok: '✓', warn: '⚠', info: 'ℹ', neutral: '·' };
              return (
                <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '11px', color: colors[line.type], flexShrink: 0, lineHeight: 1.4 }}>{icons[line.type]}</span>
                  <span style={{ fontSize: '11px', color: line.type === 'neutral' ? '#475569' : '#94a3b8', lineHeight: 1.4 }}>{line.text}</span>
                </div>
              );
            })}
          </div>
          <details style={{ backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b', padding: '8px 12px' }}>
            <summary style={{ fontSize: '10px', fontWeight: '700', color: '#334155', cursor: 'pointer', userSelect: 'none', letterSpacing: '0.3px' }}>📖 Hoe werkt de stap-detectie?</summary>
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', color: '#475569', lineHeight: 1.55 }}>
              <p style={{ margin: 0 }}>De detector volgt continu de <strong style={{ color: '#64748b' }}>enkelhoogte Y</strong>. Een stap wordt geteld als een volledige <em>piek-cyclus</em> is afgerond met voldoende grootte.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {[['#60a5fa','①','Dal-referentie','het lopende hoogste Y-punt. Past zich langzaam aan als de enkel omhoog gaat.'],['#a78bfa','②','Piek-fase',`wordt geactiveerd zodra het gemiddelde Y meer dan drempel (${config.peakMinProminence.toFixed(3)}) daalt t.o.v. het dal.`],['#22c55e','③','Stap tellen',`wanneer de enkel vanuit de piek weer genoeg terugzakt. Min. sprong-hoogte: ${config.peakMinAmplitude?.toFixed(3) ?? '0.015'}, min. interval: ${config.peakMinIntervalMs} ms.`],['#ef4444','④','Mist',`als er langer dan ${config.missGapMs} ms × 2 geen stap wordt gedetecteerd.`]].map(([color, num, title, desc]) => (
                  <div key={num} style={{ display: 'flex', gap: '7px' }}>
                    <span style={{ color, flexShrink: 0 }}>{num}</span>
                    <span><strong style={{ color }}>{title}</strong> — {desc}</span>
                  </div>
                ))}
              </div>
              <p style={{ margin: 0, color: '#334155', fontSize: '10px' }}>💡 Als stappen worden gemist, verlaag de <em>Pieksensitiviteit</em>. Bij dubbeltelling, verhoog het <em>Min. interval</em>.</p>
            </div>
          </details>
        </div>
      )}
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
        {[['#00d4aa','gefilterd enkel',false],['rgba(245,158,11,0.8)','drempel',true],['#475569','ruw',true],['#facc15','getelde stap',false]].map(([color, label, dashed]) => (
          <span key={label} style={{ fontSize: '9px', color, display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ width: '10px', height: dashed ? '0px' : '2px', backgroundColor: dashed ? 'transparent' : color, borderTop: dashed ? `1px dashed ${color}` : 'none', display: 'inline-block' }} />{label}
          </span>
        ))}
        {hasUploadVideo && <span style={{ fontSize: '9px', color: '#f472b6', display: 'flex', alignItems: 'center', gap: '3px' }}><span style={{ width: '12px', height: '2px', backgroundColor: '#f472b6', display: 'inline-block' }} />afspeelpositie</span>}
      </div>
      <div style={{ fontSize: '10px', color: '#334155', lineHeight: 1.5 }}>
        {hasUploadVideo ? 'Klik of sleep op de tijdlijn om de video te scrubben.' : 'Scroll de tijdlijn om het volledige enkelsignaal te bekijken.'}
      </div>
    </div>
  );
}

const metricCard  = { backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b', padding: '7px 10px', display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start' };
const metricVal   = { fontSize: '15px', fontWeight: '800', color: '#94a3b8', lineHeight: 1 };
const metricLabel = { fontSize: '9px', color: '#334155', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.4px' };

// ─── Beep Detector ────────────────────────────────────────────────────────────
class BeepDetector {
  constructor(onBeep, opts = {}) {
    this.onBeep  = onBeep;
    this.opts = { fftSize: 2048, smoothing: 0.15, minFreq: 500, maxFreq: 5000, tonalityThreshold: 22, absThreshold: -48, minDurationMs: 60, maxDurationMs: 600, cooldownMs: 1200, ...opts };
    this._ctx = null; this._analyser = null; this._source = null;
    this._freqBuf = null; this._rafId = null; this._noiseFloor = -60;
    this._beepStart = null; this._lastBeep = 0; this._polling = false; this._attached = false;
  }
  attachVideo(videoEl) {
    if (this._attached && this._source) return;
    try {
      if (!this._ctx) this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this._ctx.state === 'suspended') this._ctx.resume().catch(() => {});
      this._analyser = this._ctx.createAnalyser();
      this._analyser.fftSize = this.opts.fftSize;
      this._analyser.smoothingTimeConstant = this.opts.smoothing;
      this._source = this._ctx.createMediaElementSource(videoEl);
      this._source.connect(this._analyser);
      this._source.connect(this._ctx.destination);
      this._freqBuf = new Float32Array(this._analyser.frequencyBinCount);
      this._attached = true;
    } catch (e) { console.warn('[BeepDetector] attachVideo failed:', e?.message); }
  }
  destroy() {
    this.stopPolling();
    try { this._source?.disconnect(); } catch (_) {}
    try { this._ctx?.close(); } catch (_) {}
    this._ctx = this._analyser = this._source = this._freqBuf = null;
    this._attached = false;
  }
  startPolling() {
    if (!this._attached || this._polling) return;
    this._polling = true; this._beepStart = null; this._lastBeep = 0; this._noiseFloor = -60;
    this._poll();
    setTimeout(() => this.calibrate(), 300);
  }
  stopPolling() { this._polling = false; cancelAnimationFrame(this._rafId); }
  calibrate() {
    if (!this._analyser || !this._freqBuf) return;
    this._analyser.getFloatFrequencyData(this._freqBuf);
    const { minBin, maxBin } = this._bands();
    let sum = 0, count = 0;
    for (let i = minBin; i <= maxBin; i++) { if (isFinite(this._freqBuf[i])) { sum += this._freqBuf[i]; count++; } }
    if (count > 0) this._noiseFloor = sum / count;
  }
  _bands() {
    const binHz = this._ctx.sampleRate / this.opts.fftSize;
    return { minBin: Math.floor(this.opts.minFreq / binHz), maxBin: Math.min(Math.ceil(this.opts.maxFreq / binHz), this._freqBuf.length - 1), binHz };
  }
  _poll() {
    if (!this._polling) return;
    this._rafId = requestAnimationFrame(() => this._poll());
    if (!this._analyser || !this._freqBuf) return;
    this._analyser.getFloatFrequencyData(this._freqBuf);
    const { minBin, maxBin, binHz } = this._bands();
    let peakDb = -Infinity, peakBin = minBin, sum = 0, count = 0;
    for (let i = minBin; i <= maxBin; i++) {
      const v = this._freqBuf[i]; if (!isFinite(v)) continue;
      if (v > peakDb) { peakDb = v; peakBin = i; }
      sum += v; count++;
    }
    const meanDb = count > 0 ? sum / count : -100;
    const tonality = peakDb - meanDb;
    const now = performance.now();
    const isTonal = tonality > this.opts.tonalityThreshold && peakDb > this.opts.absThreshold && peakDb > this._noiseFloor + 12;
    if (isTonal) {
      if (this._beepStart === null) this._beepStart = now;
      const dur = now - this._beepStart;
      if (dur >= this.opts.minDurationMs && dur <= this.opts.maxDurationMs && now - this._lastBeep > this.opts.cooldownMs) {
        this._lastBeep = now;
        this.onBeep({ freq: Math.round(peakBin * binHz), db: Math.round(peakDb) });
      }
    } else {
      if (this._beepStart !== null && now - this._beepStart > 80) this._beepStart = null;
    }
  }
}

// ─── Beep Status Badge ────────────────────────────────────────────────────────
function BeepStatusBadge({ beepMode, beepState, beepsDetected, onCancel }) {
  if (!beepMode) return null;
  const states = {
    waiting_start: { color: '#f59e0b', icon: '🔔', text: 'Wacht op startbeep…' },
    counting:      { color: '#22c55e', icon: '▶',  text: 'Tellen (wacht op stopbeep)' },
    done:          { color: '#a78bfa', icon: '✓',  text: 'Beep-sessie voltooid' },
  };
  const st = states[beepState] || states.waiting_start;
  return (
    <div style={{ position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
      <div style={{ backgroundColor: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)', border: `1.5px solid ${st.color}55`, borderRadius: '10px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '7px' }}>
        <span style={{ fontSize: '13px' }}>{st.icon}</span>
        <span style={{ fontSize: '12px', fontWeight: '700', color: st.color }}>{st.text}</span>
        {beepsDetected > 0 && <span style={{ fontSize: '10px', color: '#64748b', marginLeft: '2px' }}>({beepsDetected} beep{beepsDetected !== 1 ? 's' : ''})</span>}
      </div>
      {beepState !== 'counting' && (
        <button onClick={onCancel} style={{ fontSize: '10px', color: '#475569', background: 'rgba(0,0,0,0.5)', border: '1px solid #334155', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>annuleer beep-modus</button>
      )}
    </div>
  );
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
function exportCsv(signalHistory, stepTimestamps, detCfg, disciplineId, sessionType, trackedFoot, sessionStartTime) {
  const tMin = sessionStartTime || (signalHistory[0]?.t ?? 0);
  const stepTimes = new Set((stepTimestamps || []).map(s => s?.t ?? s));
  const stepByT   = {};
  (stepTimestamps || []).forEach(s => { stepByT[s?.t ?? s] = s?.n ?? '?'; });
  const cols = ['elapsed_ms','timestamp_ms','ankle_y_filtered','ankle_y_raw','valley_y','peak_y','in_peak','step_counted','step_number'];
  const rows = signalHistory.map(p => {
    const closest = [...stepTimes].reduce((best, st) => Math.abs(st - p.t) < Math.abs(best - p.t) ? st : best, Infinity);
    const isStep = isFinite(closest) && Math.abs(closest - p.t) < 50;
    return [p.t - tMin, p.t, p.y.toFixed(5), (p.raw ?? p.y).toFixed(5), p.valleyY != null ? p.valleyY.toFixed(5) : '', p.peakY != null ? p.peakY.toFixed(5) : '', p.inPeak != null ? (p.inPeak ? '1' : '0') : '', isStep ? '1' : '0', isStep ? (stepByT[closest] ?? '') : ''].join(',');
  });
  const meta = [
    `# AI Stapteller export`, `# Datum: ${new Date().toISOString()}`, `# Backend: MediaPipe BlazePose`,
    `# Onderdeel: ${disciplineId}  Type: ${sessionType}  Voet: ${trackedFoot}`,
    `# Pieksensitiviteit: ${detCfg.peakMinProminence}  Min.interval: ${detCfg.peakMinIntervalMs}ms  Mist-drempel: ${detCfg.missGapMs}ms`,
    `# Kalman: ${detCfg.kalmanEnabled ? `aan (Q=${detCfg.kalmanProcessNoise})` : 'uit'}`,
    `# Stappen totaal: ${(stepTimestamps || []).length}`, `#`, cols.join(','),
  ].join('\n');
  const csv = meta + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `stapteller_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
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
    { key: 'peakMinProminence', label: 'Pieksensitiviteit',  hint: 'Hoe groot de beweging t.o.v. de dalreferentie. Lager = gevoeliger.', min: 0.003, max: 0.05, step: 0.001, fmt: v => v.toFixed(3) },
    { key: 'peakMinAmplitude',  label: 'Min. sprong-hoogte', hint: 'Min. echte enkelhoogte t.o.v. het beginpunt van de piek.', min: 0.005, max: 0.08, step: 0.005, fmt: v => v.toFixed(3) },
    { key: 'peakMinIntervalMs', label: 'Min. interval (ms)', hint: 'Min. tijd tussen stappen. Verhoog bij dubbeltelling.', min: 60, max: 400, step: 10, fmt: v => `${v} ms` },
    { key: 'missGapMs',         label: 'Mist-drempel (ms)',  hint: 'Hoe lang geen stap voor een mist.', min: 300, max: 1200, step: 50, fmt: v => `${v} ms` },
  ];
  const presets = [
    { label: 'Snel (sprint)', config: { peakMinProminence: 0.008, peakMinIntervalMs: 80,  missGapMs: 450 } },
    { label: 'Normaal',       config: { peakMinProminence: 0.012, peakMinIntervalMs: 120, missGapMs: 600 } },
    { label: 'Langzaam / DD', config: { peakMinProminence: 0.018, peakMinIntervalMs: 180, missGapMs: 900 } },
  ];
  return (
    <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' }}>
      <button onClick={() => setOpen(v => !v)} style={{ width: '100%', padding: '12px 14px', background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'inherit' }}>
        <SlidersHorizontal size={15} color="#60a5fa" />
        <span style={{ flex: 1, textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#f1f5f9' }}>Detectie-instellingen</span>
        <span style={{ fontSize: '10px', color: '#475569', marginRight: '6px' }}>Aanpassen voor betere nauwkeurigheid</span>
        {open ? <ChevronUp size={14} color="#64748b" /> : <ChevronDown size={14} color="#64748b" />}
      </button>
      {open && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid #1e293b' }}>
          <div style={{ marginTop: '14px', marginBottom: '14px', backgroundColor: '#0f172a', borderRadius: '10px', border: `1px solid ${config.kalmanEnabled ? '#3b82f644' : '#1e293b'}`, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: config.kalmanEnabled ? '12px' : '0' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: config.kalmanEnabled ? '#60a5fa' : '#64748b' }}>Kalman-filter</div>
                <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>Smootht de enkelpositie (aanbevolen)</div>
              </div>
              <button onClick={() => onChange({ kalmanEnabled: !config.kalmanEnabled })} style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer', backgroundColor: config.kalmanEnabled ? '#3b82f6' : '#334155', position: 'relative', flexShrink: 0, transition: 'background-color 0.2s' }}>
                <div style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: 'white', position: 'absolute', top: '3px', left: config.kalmanEnabled ? '23px' : '3px', transition: 'left 0.2s' }} />
              </button>
            </div>
            {config.kalmanEnabled && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8' }}>Procesruis (Q)</span>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: '#60a5fa', fontFamily: 'monospace' }}>{config.kalmanProcessNoise.toFixed(4)}</span>
                </div>
                <input type="range" min={0.001} max={0.1} step={0.001} value={config.kalmanProcessNoise} onChange={e => onChange({ kalmanProcessNoise: Number(e.target.value) })} style={{ width: '100%', accentColor: '#3b82f6' }} />
              </div>
            )}
          </div>
          <div style={{ marginBottom: '14px' }}>
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
              <input type="range" min={sl.min} max={sl.max} step={sl.step} value={config[sl.key]} onChange={e => onChange({ [sl.key]: Number(e.target.value) })} style={{ width: '100%', accentColor: '#3b82f6' }} />
              <div style={{ fontSize: '10px', color: '#475569', marginTop: '3px' }}>{sl.hint}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

//AI Model picker
function ModelPicker({ selectedModel, onChange }) {
  return (
    <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ fontSize: '10px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        AI-model
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {Object.values(AI_MODELS).map(m => {
          const active = selectedModel === m.id;
          return (
            <button
              key={m.id}
              onClick={() => onChange(m.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '9px 12px', borderRadius: '10px', fontFamily: 'inherit', cursor: 'pointer',
                border: `1.5px solid ${active ? '#3b82f6' : '#334155'}`,
                backgroundColor: active ? '#3b82f622' : 'transparent',
                textAlign: 'left', transition: 'all 0.12s',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: active ? '#60a5fa' : '#94a3b8' }}>{m.label}</div>
                <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>{m.sublabel}</div>
              </div>
              <div style={{
                fontSize: '9px', fontWeight: '700', padding: '2px 7px', borderRadius: '6px',
                backgroundColor: m.recommended === 'mobile' ? '#22c55e22' : '#3b82f622',
                color:           m.recommended === 'mobile' ? '#22c55e'   : '#60a5fa',
                border: `1px solid ${m.recommended === 'mobile' ? '#22c55e44' : '#3b82f644'}`,
                whiteSpace: 'nowrap',
              }}>
                {m.recommended === 'mobile' ? '📱 mobiel' : '🖥 desktop'}
              </div>
              {active && <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#3b82f6', flexShrink: 0 }} />}
            </button>
          );
        })}
      </div>
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
  // ── Read selection passed from counter.js via URL params ─────────────────
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const paramDisciplineId = urlParams.get('disciplineId') || '';
  const paramSessionType  = urlParams.get('sessionType')  || 'Training';
  const paramMemberId     = urlParams.get('memberId')     || '';
  const paramFirstName    = urlParams.get('firstName')    || '';
  const paramLastName     = urlParams.get('lastName')     || '';
  const paramRtdbUid      = urlParams.get('rtdbUid')      || '';
  const paramClubId       = urlParams.get('clubId')       || '';
  

  // Skipper passed from counter page — pre-filled, not editable on this page
  const passedSkipper = paramMemberId
    ? { memberId: paramMemberId, clubId: paramClubId, firstName: paramFirstName, lastName: paramLastName, rtdbUid: paramRtdbUid }
    : null;

  const [backendLoading, setBackendLoading] = useState(false);
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

  // disciplineId and sessionType come from URL params — not editable here
  const disciplineId = paramDisciplineId;
  const sessionType  = paramSessionType;

  const [trackedFoot,    setTrackedFoot]    = useState('left');
  const [counterUser,    setCounterUser]    = useState(null);
  // selSkipper is pre-filled from URL params; can still be overridden via the SkipperPicker
  const [selSkipper,     setSelSkipper]     = useState(passedSkipper);
  const [saving,         setSaving]         = useState(false);
  const [savedOk,        setSavedOk]        = useState(false);
  const [detCfg,         setDetCfg]         = useState({ ...DEFAULT_CONFIG });
  const [signalHist,     setSignalHist]     = useState([]);
  const [stepTimestamps, setStepTimestamps] = useState([]);
  const sessionStartTimeRef = useRef(null);
  const signalBufRef        = useRef([]);
  const [videoMuted,     setVideoMuted]     = useState(true);
  const [beepMode,       setBeepMode]       = useState(false);
  const [beepState,      setBeepState]      = useState('waiting_start');
  const [beepsDetected,  setBeepsDetected]  = useState(0);
  const beepDetectorRef  = useRef(null);
  const beepModeRef      = useRef(false);
  const beepStateRef     = useRef('waiting_start');

  // ── Live BPM from skipper's RTDB node ────────────────────────────────────
  const [liveBpm, setLiveBpm] = useState(0);

  // ── Preview state ─────────────────────────────────────────────────────────
  const [videoPreviewReady, setVideoPreviewReady] = useState(false);

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
  const mpPoseRef      = useRef(null);
  const mpCamRef            = useRef(null);
  const offscreenRef        = useRef(null);  // downscale canvas for pose inference
  const lastFrameTimeRef    = useRef(0);     // throttle: skip frames on slow devices
  // Refs to keep processAnkle (empty-deps callback) up-to-date without re-creating it
  const stepsRef            = useRef(0);
  const liveBpmRef          = useRef(0);
  const syncStepsToRtdbRef  = useRef(null);

  // AI Model picker
  const [selectedModel,  setSelectedModel]  = useState('blazepose');
  const selectedModelRef = useRef('blazepose');
  const mnDetectorRef    = useRef(null);  // MoveNet detector instance

  // Keep selectedModelRef in sync:
  useEffect(() => { selectedModelRef.current = selectedModel; }, [selectedModel]);

  useEffect(() => { trackedRef.current  = trackedFoot; }, [trackedFoot]);
  useEffect(() => { overlayRef.current  = showOverlay; }, [showOverlay]);
  useEffect(() => { detectorRef.current.updateConfig(detCfg); }, [detCfg]);

  useEffect(() => {
    if (uploadVideoRef.current && !beepModeRef.current) uploadVideoRef.current.muted = videoMuted;
  }, [videoMuted]);

  const { disciplines, getDisc } = useDisciplines();
  useEffect(() => {
    const uid = getCookie(); if (!uid) return;
    UserFactory.get(uid).then(s => { if (s.exists()) setCounterUser({ id: uid, ...s.data() }); });
  }, []);

  // ── Subscribe to skipper's live BPM from RTDB ────────────────────────────
  useEffect(() => {
    const rtdbUid = selSkipper?.rtdbUid || paramRtdbUid;
    if (!rtdbUid) return;
    const unsub = LiveSessionFactory.subscribeToLive(rtdbUid, data => {
      if (data?.bpm) { setLiveBpm(data.bpm); liveBpmRef.current = data.bpm; }
    });
    return () => unsub();
  }, [selSkipper?.rtdbUid, paramRtdbUid]);

  // ── Sync AI step count to RTDB (mirrors manual counter) ──────────────────
  const syncStepsToRtdb = useCallback((stepCount, bpm) => {
    const rtdbUid = selSkipper?.rtdbUid || paramRtdbUid;
    if (!rtdbUid || !disciplineId) return;
    LiveSessionFactory.syncHeartbeat(rtdbUid, bpm || 0, 'online').catch(() => {});
    const firstTap = stepCount === 1 ? Date.now() : null;
    LiveSessionFactory.incrementSteps(rtdbUid, bpm || 0, firstTap).catch(() => {});
  }, [selSkipper?.rtdbUid, paramRtdbUid, disciplineId]);

  // Keep the ref current so processAnkle (empty deps) can always call latest version
  useEffect(() => { syncStepsToRtdbRef.current = syncStepsToRtdb; }, [syncStepsToRtdb]);

  // ── Init RTDB session slot when AI counting starts ────────────────────────
  const initRtdbSession = useCallback(() => {
    const rtdbUid = selSkipper?.rtdbUid || paramRtdbUid;
    if (!rtdbUid || !disciplineId) return;
    LiveSessionFactory.startCounter(rtdbUid, disciplineId, sessionType).catch(() => {});
  }, [selSkipper?.rtdbUid, paramRtdbUid, disciplineId, sessionType]);

  // ── Stop RTDB session when AI counting ends ───────────────────────────────
  const stopRtdbSession = useCallback(() => {
    const rtdbUid = selSkipper?.rtdbUid || paramRtdbUid;
    if (!rtdbUid) return;
    LiveSessionFactory.stopCounter(rtdbUid).catch(() => {});
  }, [selSkipper?.rtdbUid, paramRtdbUid]);

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

      const MAX_SIGNAL_MS = 120_000;
      const dbg = detectorRef.current.debugState;
      signalBufRef.current.push({ y: filteredY, raw: ankleY, t: now,
        valleyY: dbg.valleyY, peakY: dbg.peakY, inPeak: dbg.inPeak, lastStepTime: dbg.lastStepTime,
      });
      const cutoff = now - MAX_SIGNAL_MS;
      while (signalBufRef.current.length > 1 && signalBufRef.current[0].t < cutoff) {
        signalBufRef.current.shift();
      }
      setSignalHist([...signalBufRef.current]);

      if (ev === 'step') {
        const stepNum = detectorRef.current.steps;
        stepsRef.current = stepNum;
        setSteps(stepNum);
        setStepTimestamps(prev => [...prev, { t: now, n: stepNum }]);
        // Sync to RTDB via ref so this stable callback always calls the latest version
        syncStepsToRtdbRef.current?.(stepNum, liveBpmRef.current);
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

	// ── MoveNet frame processor ───────────────────────────────────────────────────
	const runMoveNetFrame = useCallback(async (imageSource, canvas) => {
	const detector = mnDetectorRef.current;
	if (!detector) return;
	
	// Downscale for inference
	if (!offscreenRef.current) offscreenRef.current = document.createElement('canvas');
	const scale = Math.min(1, 480 / (imageSource.videoWidth || imageSource.width));
	offscreenRef.current.width  = Math.round((imageSource.videoWidth  || imageSource.width)  * scale);
	offscreenRef.current.height = Math.round((imageSource.videoHeight || imageSource.height) * scale);
	offscreenRef.current.getContext('2d').drawImage(imageSource, 0, 0, offscreenRef.current.width, offscreenRef.current.height);
	
	let poses;
	try { poses = await detector.estimatePoses(offscreenRef.current); }
	catch (e) { console.warn('[MoveNet] estimatePoses failed:', e?.message); return; }
	
	if (!poses?.length) return;
	const keypoints = poses[0].keypoints;
	
	// Draw full skeleton overlay if enabled
	if (overlayRef.current) {
		const ctx = canvas.getContext('2d');
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		// show video always
		ctx.drawImage(imageSource, 0, 0, canvas.width, canvas.height);
		// Draw keypoints
		keypoints.forEach(kp => {
		if ((kp.score ?? 0) < 0.3) return;
		const x = kp.x * (canvas.width  / offscreenRef.current.width);
		const y = kp.y * (canvas.height / offscreenRef.current.height);
		ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
		ctx.fillStyle = '#00d4aa'; ctx.fill();
		});
		// Draw skeleton connections (MoveNet 17-point pairs)
		const pairs = [[0,1],[0,2],[1,3],[2,4],[5,6],[5,7],[7,9],[6,8],[8,10],[5,11],[6,12],[11,12],[11,13],[13,15],[12,14],[14,16]];
		const ctx2 = canvas.getContext('2d');
		ctx2.strokeStyle = '#00d4aa'; ctx2.lineWidth = 2; ctx2.globalAlpha = 0.6;
		pairs.forEach(([a, b]) => {
		const kpA = keypoints[a], kpB = keypoints[b];
		if ((kpA?.score ?? 0) < 0.3 || (kpB?.score ?? 0) < 0.3) return;
		ctx2.beginPath();
		ctx2.moveTo(kpA.x * (canvas.width / offscreenRef.current.width), kpA.y * (canvas.height / offscreenRef.current.height));
		ctx2.lineTo(kpB.x * (canvas.width / offscreenRef.current.width), kpB.y * (canvas.height / offscreenRef.current.height));
		ctx2.stroke();
		});
		ctx2.globalAlpha = 1;
	}
	
	// Extract ankle — MoveNet keypoints are in pixel coords of the inference canvas
	// normalise back to 0-1 range for processAnkle
	const ankleIdx = trackedRef.current === 'left' ? MN_ANKLE.left : MN_ANKLE.right;
	const ank = keypoints[ankleIdx];
	if (!ank) return;
	
	const normX = ank.x / offscreenRef.current.width;
	const normY = ank.y / offscreenRef.current.height;
	const conf  = ank.score ?? 0;
	
	if (conf > 0.25) {
		lastAnkleYRef.current = normY;
		processAnkle(normY, normX, conf, null);
	} else {
		processAnkle(lastAnkleYRef.current, 0.5, 0, null);
	}
	}, [processAnkle]);
  
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

  // ── Init AI-model backend ─────────────────────────────────────────────────
	const initBackend = useCallback(async (videoEl, isLive) => {
	setBackendError(''); setBackendLoading(true);
	const model = selectedModelRef.current;
	const cfg   = AI_MODELS[model];
	
	// Load scripts
	try {
		if (model === 'blazepose') {
			await Promise.all(cfg.scripts.map(loadScript));
		} else {
			for (const src of cfg.scripts) { await loadScript(src); }
		}
	}
	catch (e) { setBackendError(`Model laden mislukt: ${e.message}`); setBackendLoading(false); return false; }
	setBackendLoading(false);
	
	// ── BlazePose (existing path, unchanged) ──────────────────────────────────
	if (model === 'blazepose') {
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
			const now = performance.now();
			if (now - lastFrameTimeRef.current < (selectedModelRef.current === 'blazepose' ? 0 : 80)) return;
			lastFrameTimeRef.current = now;
			if (!offscreenRef.current) offscreenRef.current = document.createElement('canvas');
			const scale = Math.min(1, 480 / videoEl.videoWidth);
			offscreenRef.current.width  = Math.round(videoEl.videoWidth  * scale);
			offscreenRef.current.height = Math.round(videoEl.videoHeight * scale);
			offscreenRef.current.getContext('2d').drawImage(videoEl, 0, 0, offscreenRef.current.width, offscreenRef.current.height);
			await pose.send({ image: offscreenRef.current });
			},
			width: 640, height: 480, facingMode,
		});
		await cam.start(); mpCamRef.current = cam;
		}
		return true;
	}
	
	// ── MoveNet (Lightning or Thunder) ────────────────────────────────────────
	if (model === 'movenet_lightning' || model === 'movenet_thunder') {
		if (!window.poseDetection || !window.tf) { setBackendError('TensorFlow.js niet beschikbaar.'); return false; }
	
		// Destroy previous MoveNet detector if any
		if (mnDetectorRef.current) { try { mnDetectorRef.current.dispose(); } catch (_) {} mnDetectorRef.current = null; }
	
		const modelType = model === 'movenet_lightning'
		? window.poseDetection.SupportedModels.MoveNet
		: window.poseDetection.SupportedModels.MoveNet;
		const detectorConfig = {
		modelType: model === 'movenet_lightning'
			? window.poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING
			: window.poseDetection.movenet.modelType.SINGLEPOSE_THUNDER,
		};
	
		try {
		mnDetectorRef.current = await window.poseDetection.createDetector(modelType, detectorConfig);
		} catch (e) {
		setBackendError(`MoveNet laden mislukt: ${e.message}`); return false;
		}
	
		if (isLive) {
		// For live camera with MoveNet we manage getUserMedia ourselves
		// (no MediaPipe Camera helper needed)
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
			video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
			});
			videoEl.srcObject = stream;
			await videoEl.play();
		} catch (e) {
			setBackendError(`Camera toegang mislukt: ${e.message}`); return false;
		}
	
		const canvas = canvasRef.current;
		const runLoop = async () => {
			if (!isRunRef.current && !videoEl.srcObject) return; // stopped
			if (videoEl.readyState >= 2 && videoEl.videoWidth > 0) {
			canvas.width = videoEl.videoWidth; canvas.height = videoEl.videoHeight;
			const now = performance.now();
			if (now - lastFrameTimeRef.current >= 80) {
				lastFrameTimeRef.current = now;
				await runMoveNetFrame(videoEl, canvas);
			}
			}
			frameRef.current = requestAnimationFrame(runLoop);
		};
		frameRef.current = requestAnimationFrame(runLoop);
		}
		return true;
	}
	
	setBackendError('Onbekend model.'); return false;
	}, [onMpResults, facingMode]);
  // ── Camera start ───────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    const video = videoRef.current; if (!video) return;
    const ok = await initBackend(video, true); if (!ok) return;
    setMode('camera');
  }, [initBackend]);

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
    stepsRef.current = 0;
    setSteps(0); setMisses(0); setElapsed(0); setSessionDone(false); setSavedOk(false);
    setSignalHist([]); setStepTimestamps([]); signalBufRef.current = [];
    sessionStartTimeRef.current = Date.now();
    isRunRef.current = true; setIsRunning(true);
    initRtdbSession();
    elapsedRef.current = setInterval(() => setElapsed(detectorRef.current.elapsedMs), 500);
  }, [detCfg, initRtdbSession]);

  const stopSession = useCallback(() => {
    isRunRef.current = false; setIsRunning(false);
    clearInterval(elapsedRef.current); cancelAnimationFrame(frameRef.current);
    setFinalSteps(detectorRef.current.steps); setFinalMisses(detectorRef.current.misses); setSessionDone(true);
    stopRtdbSession();
  }, [stopRtdbSession]);

  // ── Beep detection ─────────────────────────────────────────────────────────
  useEffect(() => { beepModeRef.current  = beepMode;  }, [beepMode]);
  useEffect(() => { beepStateRef.current = beepState; }, [beepState]);

  const stopBeepDetector = useCallback(() => {
    if (beepDetectorRef.current) beepDetectorRef.current.stopPolling();
  }, []);

  const attachBeepDetector = useCallback((videoEl) => {
    if (!beepDetectorRef.current) {
      beepDetectorRef.current = new BeepDetector(({ freq, db }) => {
        if (!beepModeRef.current) return;
        const state = beepStateRef.current;
        setBeepsDetected(n => n + 1);
        if (state === 'waiting_start') {
          beepStateRef.current = 'counting';
          setBeepState('counting');
          clearInterval(elapsedRef.current);
          detectorRef.current.reset(); detectorRef.current.updateConfig(detCfg);
          kalmanRef.current.reset(); lastAnkleYRef.current = 0.8;
          stepsRef.current = 0;
          setSteps(0); setMisses(0); setElapsed(0);
          setSignalHist([]); setStepTimestamps([]); signalBufRef.current = [];
          sessionStartTimeRef.current = Date.now();
          isRunRef.current = true; setIsRunning(true);
          initRtdbSession();
          elapsedRef.current = setInterval(() => setElapsed(detectorRef.current.elapsedMs), 500);
        } else if (state === 'counting') {
          beepStateRef.current = 'done';
          setBeepState('done');
          isRunRef.current = false; setIsRunning(false);
          clearInterval(elapsedRef.current);
          setFinalSteps(detectorRef.current.steps);
          setFinalMisses(detectorRef.current.misses);
          setSessionDone(true);
          stopRtdbSession();
        }
      });
    }
    beepDetectorRef.current.attachVideo(videoEl);
    beepDetectorRef.current.startPolling();
  }, [detCfg, initRtdbSession, stopRtdbSession]);

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

  // ── File select — immediately show preview frame ───────────────────────────
  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0]; if (!file || !file.type.startsWith('video/')) return;
    setCodecError(false); setBackendError(''); setUploadProgress(0); setSessionDone(false); setSavedOk(false);
    setVideoPreviewReady(false);
    if (uploadUrl) URL.revokeObjectURL(uploadUrl);
    destroyBeepDetector();
    setBeepState('waiting_start'); beepStateRef.current = 'waiting_start';
    setBeepsDetected(0);
    const url = URL.createObjectURL(file);
    setUploadFile(file); setUploadUrl(url); setMode('upload');
    setVideoMuted(true);
  }, [uploadUrl, destroyBeepDetector]);

  // ── Draw first frame of upload into canvas as preview ─────────────────────
  useEffect(() => {
    if (mode !== 'upload' || !uploadUrl || isRunning || sessionDone) return;
    const video = uploadVideoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    setVideoPreviewReady(false);
    video.muted = true;
    video.src = uploadUrl;
    video.load();

    const onReady = () => {
      video.currentTime = 0.05; // seek slightly in to avoid blank frame
    };
    const onSeeked = () => {
      if (video.videoWidth > 0) {
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        // Draw "pick your foot" hint overlay
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, canvas.height - 44, canvas.width, 44);
        ctx.fillStyle = '#facc15';
        ctx.font = `bold ${Math.max(11, Math.floor(canvas.width / 36))}px system-ui`;
        ctx.textAlign = 'center';
        ctx.fillText('👟 Selecteer hieronder de voet om te tellen', canvas.width / 2, canvas.height - 16);
        setVideoPreviewReady(true);
      }
    };

    video.addEventListener('loadeddata', onReady);
    video.addEventListener('seeked', onSeeked);
    return () => {
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('seeked', onSeeked);
    };
  }, [mode, uploadUrl, isRunning, sessionDone]);

  // ── Process video ──────────────────────────────────────────────────────────
  const processVideo = useCallback(async () => {
    const video = uploadVideoRef.current, canvas = canvasRef.current;
    if (!video || !canvas) return;
    setBackendError(''); setCodecError(false); setUploadProgress(0);
    video.muted = beepModeRef.current ? false : videoMuted;
    video.load();
    try { await waitForVideoReady(video, 12000); } catch { setCodecError(true); return; }
    if (!video.videoWidth) { setCodecError(true); return; }
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;

    const ok = await initBackend(video, false); if (!ok) return;
    detectorRef.current.reset(); detectorRef.current.updateConfig(detCfg);
    kalmanRef.current.reset(); lastAnkleYRef.current = 0.8;
    setSteps(0); setMisses(0); setElapsed(0); setSessionDone(false);
    setSignalHist([]); setStepTimestamps([]); signalBufRef.current = [];

    const usingBeepMode = beepModeRef.current;
    if (usingBeepMode) {
      setBeepState('waiting_start'); beepStateRef.current = 'waiting_start';
      setBeepsDetected(0);
      sessionStartTimeRef.current = null;
      isRunRef.current = false; setIsRunning(false);
    } else {
      sessionStartTimeRef.current = Date.now();
      isRunRef.current = true; setIsRunning(true);
    }
    setMode('running');

    const dur = video.duration || 0; let aborted = false;
    elapsedRef.current = setInterval(() => {
      if (!usingBeepMode) setElapsed(video.currentTime * 1000);
      if (dur > 0) setUploadProgress(Math.round((video.currentTime / dur) * 100));
    }, 300);

    const finish = () => {
      clearInterval(elapsedRef.current); setUploadProgress(100); aborted = true;
      stopBeepDetector();
      if (beepModeRef.current && beepStateRef.current === 'counting') {
        beepStateRef.current = 'done'; setBeepState('done');
      }
      stopSession();
    };

    const pose = mpPoseRef.current;
    const INFER_INTERVAL_MS = selectedModelRef.current === 'blazepose' ? 0 : 80;
    const loop = async () => {
      if (aborted) return;
      if (video.readyState >= 2 && video.videoWidth > 0 && !video.paused && !video.ended) {
        if (canvas.width !== video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
        
        const now = performance.now();
        const elapsed = now - lastFrameTimeRef.current;
        if (elapsed < INFER_INTERVAL_MS) {
          frameRef.current = requestAnimationFrame(loop);
          return;
        }
        lastFrameTimeRef.current = now;
        
        // Downscale to max 480px wide before sending to pose — landmark coords stay 0-1 normalised
        if (!offscreenRef.current) offscreenRef.current = document.createElement('canvas');
        const scale = Math.min(1, 480 / video.videoWidth);
        offscreenRef.current.width  = Math.round(video.videoWidth  * scale);
        offscreenRef.current.height = Math.round(video.videoHeight * scale);
        offscreenRef.current.getContext('2d').drawImage(video, 0, 0, offscreenRef.current.width, offscreenRef.current.height);
        
        // Update the video upload loop
        if (selectedModelRef.current === 'blazepose') {
          try { await pose.send({ image: offscreenRef.current }); }
          catch (e) {
            console.warn('[AI Counter] MP error, recovering:', e?.message);
            try {
              mpPoseRef.current.close();
              const np = new window.Pose({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${f}` });
              np.setOptions({ modelComplexity: 1, smoothLandmarks: true, enableSegmentation: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
              np.onResults(onMpResults); mpPoseRef.current = np;
            } catch { finish(); return; }
          }
        } else {
          await runMoveNetFrame(video, canvas);
        }
      }
      if (video.ended) { finish(); return; }
      frameRef.current = requestAnimationFrame(loop);
    };
    video.currentTime = 0; await new Promise(r => { video.onseeked = r; });
    try { await video.play(); } catch (e) { setBackendError('Video afspelen mislukt: ' + e.message); clearInterval(elapsedRef.current); isRunRef.current = false; setIsRunning(false); return; }
    if (usingBeepMode) attachBeepDetector(video);
    frameRef.current = requestAnimationFrame(loop);
  }, [detCfg, initBackend, onMpResults, stopSession, videoMuted, attachBeepDetector]);

  // ── Toggle audio ───────────────────────────────────────────────────────────
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
        aiConfig: { backend: selectedModelRef.current, backendLabel: AI_MODELS[selectedModelRef.current]?.label ?? selectedModelRef.current, ...detCfg, trackedFoot },
      });
      setSavedOk(true);
    } catch (e) { console.error(e); alert('Opslaan mislukt.'); }
    finally { setSaving(false); }
  }, [selSkipper, disciplineId, sessionType, finalSteps, counterUser, getDisc, detCfg, trackedFoot]);

  // ── Reset all ──────────────────────────────────────────────────────────────
  const resetAll = useCallback(() => {
    cancelAnimationFrame(frameRef.current); clearInterval(elapsedRef.current); clearTimeout(missTimerRef.current);
    isRunRef.current = false; stepsRef.current = 0; stopCameraStream(); destroyBeepDetector();
    if (mnDetectorRef.current) { try { mnDetectorRef.current.dispose(); } catch (_) {} mnDetectorRef.current = null; }
    stopRtdbSession();
    if (uploadUrl) { URL.revokeObjectURL(uploadUrl); setUploadUrl(''); }
    setUploadFile(null); setMode('idle'); setIsRunning(false);
    setSessionDone(false); setSteps(0); setMisses(0); setElapsed(0);
    setUploadProgress(0); setCodecError(false); setBackendError(''); setSavedOk(false);
    setSignalHist([]); setStepTimestamps([]); signalBufRef.current = [];
    setVideoMuted(true); setVideoPreviewReady(false);
    setBeepMode(false); beepModeRef.current = false;
    setBeepState('waiting_start'); beepStateRef.current = 'waiting_start';
    setBeepsDetected(0);
    detectorRef.current.reset(); kalmanRef.current.reset(); lastAnkleYRef.current = 0.8;
    sessionStartTimeRef.current = null;
  }, [uploadUrl, stopCameraStream, stopRtdbSession]);

  useEffect(() => () => {
    cancelAnimationFrame(frameRef.current); clearInterval(elapsedRef.current); clearTimeout(missTimerRef.current);
    stopCameraStream(); destroyBeepDetector(); if (uploadUrl) URL.revokeObjectURL(uploadUrl);
    if (mnDetectorRef.current) { try { mnDetectorRef.current.dispose(); } catch (_) {} }
  }, []); // eslint-disable-line

  const currentDisc = getDisc(disciplineId);
  const durationSec = currentDisc?.durationSeconds || null;
  const progress    = durationSec ? Math.min(1, elapsed / (durationSec * 1000)) : 0;
  const isVideoMode = mode === 'upload' || mode === 'running';
  const showSettingsPanels  = !isRunning && !sessionDone;
  const showSettingsSummary = isRunning || sessionDone;
  const showLiveGraph       = isRunning && (mode === 'camera' || mode === 'running');
  const showAudioToggle     = (mode === 'upload' || mode === 'running') && !sessionDone;

  // Canvas should be visible during preview, running, or done
  const showCanvas = mode === 'camera' || mode === 'running' || sessionDone || (mode === 'upload' && videoPreviewReady);

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

        {/* ── Skipper info bar — shown when skipper was passed from counter ── */}
        {(selSkipper || passedSkipper) && (() => {
          const sk = selSkipper || passedSkipper;
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '10px 14px', flexWrap: 'wrap' }}>
              {/* Avatar */}
              <div style={{ width: '34px', height: '34px', borderRadius: '50%', backgroundColor: '#3b82f622', border: '1px solid #3b82f644', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700', color: '#60a5fa', flexShrink: 0 }}>
                {(sk.firstName?.[0] || '?')}{(sk.lastName?.[0] || '')}
              </div>
              {/* Name + context */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#f1f5f9' }}>{sk.firstName} {sk.lastName}</div>
                <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '1px' }}>
                  {disciplineId && getDisc && <span style={{ color: '#94a3b8' }}>{getDisc(disciplineId)?.name || disciplineId}</span>}
                  {disciplineId && <span style={{ color: '#334155' }}>·</span>}
                  <span style={{ padding: '1px 7px', borderRadius: '8px', fontSize: '10px', fontWeight: '700', backgroundColor: sessionType === 'Wedstrijd' ? '#ef444422' : '#3b82f622', color: sessionType === 'Wedstrijd' ? '#ef4444' : '#60a5fa', border: `1px solid ${sessionType === 'Wedstrijd' ? '#ef444440' : '#3b82f640'}` }}>{sessionType}</span>
                </div>
              </div>
              {/* Live BPM */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '22px', fontWeight: '900', color: liveBpm > 0 ? '#ef4444' : '#334155', lineHeight: 1, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Heart size={14} color={liveBpm > 0 ? '#ef4444' : '#334155'} style={{ flexShrink: 0 }} />
                  {liveBpm > 0 ? liveBpm : '--'}
                </div>
                <div style={{ fontSize: '9px', color: '#475569', fontWeight: '700', textTransform: 'uppercase' }}>BPM</div>
              </div>
            </div>
          );
        })()}

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
            <canvas ref={canvasRef} style={{ ...s.canvas, display: showCanvas ? 'block' : 'none' }} />
          </div>
          <MissFlash visible={showMiss} />

          <BeepStatusBadge
            beepMode={beepMode && (mode === 'running')}
            beepState={beepState}
            beepsDetected={beepsDetected}
            onCancel={cancelBeepMode}
          />

          {/* Audio toggle */}
          {showAudioToggle && (
            <button
              onClick={beepMode ? undefined : toggleVideoAudio}
              title={beepMode ? 'Geluid vereist voor beep-detectie' : (videoMuted ? 'Geluid aan' : 'Geluid uit')}
              style={{
                position: 'absolute', top: '10px', right: '10px', zIndex: 18,
                width: '36px', height: '36px', borderRadius: '10px',
                backgroundColor: beepMode ? 'rgba(245,158,11,0.7)' : videoMuted ? 'rgba(0,0,0,0.55)' : 'rgba(59,130,246,0.8)',
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
                <button style={s.primaryBtn} disabled={backendLoading} onClick={startCamera}>
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
                <span>Alles draait op je apparaat — geen data verstuurd. Model wordt eenmalig geladen (~5 MB).</span>
              </div>
            </div>
          )}

          {/* Upload ready: show nothing over the preview canvas — controls are below */}
          {mode === 'upload' && !isRunning && !sessionDone && codecError && (
            <div style={s.centeredOverlay}>
              <AlertTriangle size={36} color="#f59e0b" style={{ marginBottom: 12 }} />
              <p style={{ color: '#f1f5f9', fontWeight: '700', marginBottom: 4, textAlign: 'center' }}>Video kan niet worden gelezen</p>
              <p style={{ color: '#64748b', fontSize: '12px', marginBottom: 16, textAlign: 'center', lineHeight: 1.5, maxWidth: '280px' }}>
                <strong>.MOV-bestanden</strong> werken alleen in Safari. Converteer naar <strong>MP4 (H.264)</strong>.
              </p>
              <button style={s.secondaryBtn} onClick={() => fileInputRef.current?.click()}><Upload size={14} /> Andere video</button>
              <input ref={fileInputRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={handleFileSelect} />
            </div>
          )}

          {/* Loading spinner while preview frame is rendering */}
          {mode === 'upload' && !isRunning && !sessionDone && !codecError && !videoPreviewReady && (
            <div style={s.centeredOverlay}>
              <RefreshCw size={28} color="#64748b" style={{ animation: 'spin 1s linear infinite', marginBottom: 10 }} />
              <span style={{ fontSize: '13px', color: '#64748b' }}>Video laden…</span>
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

        {/* ── Foot selector — always shown below video when not running/done ── */}
        {!isRunning && !sessionDone && (mode === 'camera' || mode === 'upload' || mode === 'idle') && (
          <div style={{ backgroundColor: '#1e293b', borderRadius: '10px', border: '1px solid #334155', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '10px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0 }}>Voet volgen</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[['left', '👟 Links'], ['right', '👟 Rechts']].map(([v, l]) => (
                <button key={v} onClick={() => setTrackedFoot(v)}
                  style={{ padding: '6px 14px', borderRadius: '8px', border: `1.5px solid ${trackedFoot === v ? '#22c55e' : '#334155'}`, backgroundColor: trackedFoot === v ? '#22c55e22' : 'transparent', color: trackedFoot === v ? '#22c55e' : '#64748b', fontWeight: trackedFoot === v ? '700' : '500', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}>
                  {l}
                </button>
              ))}
            </div>
            <span style={{ fontSize: '10px', color: '#334155', marginLeft: 'auto' }}>
              Kies de meest zichtbare enkel
            </span>
          </div>
        )}
        {mode === 'upload' && !isRunning && !sessionDone && !codecError && videoPreviewReady && (
          <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

            {/* File name + model credit */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <Video size={15} color="#60a5fa" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#f1f5f9', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{uploadFile?.name}</span>
              <span style={{ fontSize: '10px', color: '#3b82f6', backgroundColor: '#3b82f618', border: '1px solid #3b82f633', borderRadius: '6px', padding: '2px 8px', fontWeight: '700', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {AI_MODELS[selectedModel]?.label ?? selectedModel}
              </span>
            </div>

            {/* Beep-mode toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={toggleBeepMode}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '7px',
                  padding: '7px 14px', borderRadius: '8px', fontFamily: 'inherit', cursor: 'pointer',
                  fontSize: '12px', fontWeight: '700',
                  backgroundColor: beepMode ? '#f59e0b22' : 'transparent',
                  border: `1.5px solid ${beepMode ? '#f59e0b' : '#334155'}`,
                  color: beepMode ? '#f59e0b' : '#64748b', transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: '14px' }}>🔔</span>
                Beep-detectie
                <span style={{ fontSize: '9px', fontWeight: '700', backgroundColor: beepMode ? '#f59e0b33' : '#0f172a', color: beepMode ? '#f59e0b' : '#475569', borderRadius: '4px', padding: '1px 5px' }}>
                  {beepMode ? 'AAN' : 'UIT'}
                </span>
              </button>
              {beepMode && (
                <span style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.5, flex: 1 }}>
                  Detecteert start/stopbeep automatisch.
                </span>
              )}
            </div>

            {backendError && <div style={s.errorBanner}><AlertTriangle size={14} />{backendError}</div>}

            {/* Analyse button */}
            <button style={{ ...s.primaryBtn, justifyContent: 'center', width: '100%' }} disabled={backendLoading} onClick={processVideo}>
              {backendLoading
                ? <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Model laden…</>
                : <><Play size={16} fill="white" /> {beepMode ? 'Start video (wacht op beep)' : 'Analyseer video'}</>}
            </button>

            {/* Change file */}
            <button style={{ ...s.ghostBtn, justifyContent: 'center', fontSize: '12px' }} onClick={() => fileInputRef.current?.click()}>
              <Upload size={13} /> Andere video kiezen
            </button>
            <input ref={fileInputRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={handleFileSelect} />
          </div>
        )}

        {/* Live signal graph */}
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
          {(mode === 'camera' || isVideoMode) && !isRunning && !sessionDone && mode !== 'upload' && <button style={s.ghostBtn} onClick={resetAll}><ArrowLeft size={14} /> Terug</button>}
        </div>

        {/* Settings summary pill */}
        {showSettingsSummary && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b', padding: '7px 12px' }}>
            <span style={{ fontSize: '9px', fontWeight: '700', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: '2px' }}>Config</span>
            <span style={{ fontSize: '10px', color: '#3b82f6', backgroundColor: '#3b82f618', borderRadius: '5px', padding: '1px 7px', fontWeight: '700' }}>{AI_MODELS[selectedModel]?.label ?? selectedModel}</span>
            <span style={{ fontSize: '10px', color: '#475569', backgroundColor: '#1e293b', borderRadius: '5px', padding: '1px 7px' }}>sens {detCfg.peakMinProminence.toFixed(3)}</span>
            <span style={{ fontSize: '10px', color: '#475569', backgroundColor: '#1e293b', borderRadius: '5px', padding: '1px 7px' }}>ampl {detCfg.peakMinAmplitude?.toFixed(3) ?? '0.015'}</span>
            <span style={{ fontSize: '10px', color: '#475569', backgroundColor: '#1e293b', borderRadius: '5px', padding: '1px 7px' }}>int {detCfg.peakMinIntervalMs} ms</span>
            <span style={{ fontSize: '10px', color: '#22c55e', backgroundColor: '#22c55e18', borderRadius: '5px', padding: '1px 7px' }}>
              {trackedFoot === 'left' ? '👟 links' : '👟 rechts'}
            </span>
            {detCfg.kalmanEnabled && <span style={{ fontSize: '10px', color: '#3b82f6', backgroundColor: '#3b82f618', borderRadius: '5px', padding: '1px 7px' }}>kalman ✓</span>}
            {beepMode && <span style={{ fontSize: '10px', color: '#f59e0b', backgroundColor: '#f59e0b18', borderRadius: '5px', padding: '1px 7px', display: 'flex', alignItems: 'center', gap: '3px' }}>🔔 beep</span>}
          </div>
        )}

         {/* Model detection selector */}
        {showSettingsPanels && (
          <>
            <ModelPicker
              selectedModel={selectedModel}
              onChange={v => { setSelectedModel(v); selectedModelRef.current = v; }}
            />
            <DetectionTuningPanel
              config={detCfg}
              onChange={p => setDetCfg(prev => ({ ...prev, ...p }))}
            />
          </>
        )}

        {/* Results */}
        {sessionDone && (
          <div style={s.resultsPanel}>
            <div style={s.resultsHeader}>
              <CheckCircle2 size={22} color="#22c55e" />
              <span style={{ fontWeight: '800', fontSize: '16px', color: '#f1f5f9' }}>Sessie voltooid</span>
              <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: '700', color: '#3b82f6', backgroundColor: '#3b82f618', borderRadius: '6px', padding: '2px 8px' }}>
                {AI_MODELS[selectedModel]?.label ?? selectedModel}
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

            <ReviewTimeline
              signalHistory={signalHist}
              stepTimestamps={stepTimestamps}
              config={detCfg}
              sessionStartTime={sessionStartTimeRef.current}
              uploadVideoRef={uploadVideoRef}
              hasUploadVideo={!!uploadUrl && !!(uploadVideoRef.current)}
            />

            {/* ── Save section ── */}
            {passedSkipper ? (
              /* Skipper was pre-filled from counter.js — show compact confirmation */
              <div style={{ backgroundColor: '#0f172a', borderRadius: '10px', border: '1px solid #22c55e33', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#22c55e22', border: '1px solid #22c55e44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', color: '#22c55e', flexShrink: 0 }}>
                  {passedSkipper.firstName?.[0]}{passedSkipper.lastName?.[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#f1f5f9' }}>{passedSkipper.firstName} {passedSkipper.lastName}</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Sessie wordt hier opgeslagen</div>
                </div>
                <CheckCircle2 size={14} color="#22c55e" />
              </div>
            ) : (
              /* No skipper in URL — show the full picker */
              <div style={{ backgroundColor: '#0f172a', borderRadius: '10px', border: '1px solid #1e293b', padding: '12px 14px' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Users size={11} /> Sla op bij skipper
                </div>
                <SkipperPicker counterUser={counterUser} onSelect={setSelSkipper} selectedSkipper={selSkipper} />
              </div>
            )}

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
                isRunRef.current = false; stepsRef.current = 0; setIsRunning(false); setSessionDone(false);
                setSteps(0); setMisses(0); setElapsed(0); setSavedOk(false); setUploadProgress(0);
                setSignalHist([]); setStepTimestamps([]); signalBufRef.current = [];
                detectorRef.current.reset(); setMode('upload'); setVideoPreviewReady(false);
                stopRtdbSession();
              }}>
                <RefreshCw size={14} /> Opnieuw
              </button>
            </div>

            {signalHist.length > 0 && (
              <button
                style={{ ...s.ghostBtn, width: '100%', justifyContent: 'center', borderColor: '#1e3a5f', color: '#60a5fa', gap: '7px' }}
                onClick={() => exportCsv(signalHist, stepTimestamps, detCfg, disciplineId, sessionType, trackedFoot, sessionStartTimeRef.current)}
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
              <li>🤸 MediaPipe BlazePose geeft de meest stabiele tracking voor springtouw</li>
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
