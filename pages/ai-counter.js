/**
 * pages/ai-counter.js
 *
 * AI-powered rope-skipping step counter (Beta)
 *
 * Uses MediaPipe Pose (loaded via CDN) to track the left ankle keypoint.
 * Counts steps via peak detection on the Y-axis signal.
 * Detects misses (rope catches) via gap analysis.
 *
 * Works fully on-device — no cloud inference cost.
 *
 * Integrates with existing app:
 *  - Reads discipline/session config (same selectors as /counter)
 *  - Saves session via ClubMemberFactory.saveSessionHistory()
 *  - Saves records via ClubMemberFactory.addRecord()
 *  - Badge checks via BadgeFactory.checkAndAward()
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
  ChevronRight, Trophy, Medal, Info, Wifi, WifiOff, Video,
} from 'lucide-react';

// ─── Peak Detection ───────────────────────────────────────────────────────────
// We track ankle Y in normalised coords (0-1, 0=top of frame).
// During a jump the ankle rises (Y decreases), then falls back.
// A "step" = one complete cycle detected via local minima (peak of jump arc).

const PEAK_MIN_PROMINENCE = 0.012; // minimum Y-drop to count as a real step
const PEAK_MIN_INTERVAL_MS = 120;  // minimum ms between two steps (~500 steps/min max)
const MISS_GAP_MS = 600;           // gap with no step = likely a miss

class StepDetector {
  constructor() {
    this.reset();
  }

  reset() {
    this.signal = [];          // { y, t }
    this.steps = 0;
    this.misses = 0;
    this.lastStepTime = 0;
    this.lastMissTime = 0;
    this.prevMinY = null;
    this.prevMaxY = null;
    this.inPeak = false;
    this.peakY = null;
    this.valleyY = null;
    this.sessionStart = null;
  }

  push(y, t) {
    if (!this.sessionStart) this.sessionStart = t;
    this.signal.push({ y, t });
    if (this.signal.length > 90) this.signal.shift(); // keep 3s at 30fps

    const step = this._detect(y, t);
    return step; // null | 'step' | 'miss'
  }

  _detect(y, t) {
    // Simple state-machine peak detector
    // Phase 0: look for a valley (foot down, y close to max)
    // Phase 1: look for peak (foot up, y decreasing below threshold)
    // Phase 2: confirm return to valley

    const n = this.signal.length;
    if (n < 5) return null;

    const recent = this.signal.slice(-5);
    const avgY = recent.reduce((s, p) => s + p.y, 0) / recent.length;

    if (this.valleyY === null) {
      this.valleyY = avgY;
      return null;
    }

    // Foot is in the air (Y significantly smaller than valley)
    const isUp = (this.valleyY - avgY) > PEAK_MIN_PROMINENCE;

    if (!this.inPeak && isUp) {
      this.inPeak = true;
      this.peakY = avgY;
    }

    if (this.inPeak) {
      if (avgY < this.peakY) this.peakY = avgY;

      // Foot landed back
      if (avgY > this.peakY + PEAK_MIN_PROMINENCE * 0.8) {
        this.inPeak = false;
        this.valleyY = avgY;
        const prominence = this.valleyY - this.peakY;

        if (prominence >= PEAK_MIN_PROMINENCE) {
          const timeSinceLast = t - this.lastStepTime;
          if (timeSinceLast >= PEAK_MIN_INTERVAL_MS) {
            // Check for miss (gap between previous step and this one)
            if (this.lastStepTime > 0 && timeSinceLast > MISS_GAP_MS * 1.5 && timeSinceLast < 8000) {
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
      // Update valley when foot is down
      if (avgY > this.valleyY) this.valleyY = avgY * 0.9 + this.valleyY * 0.1;
    }

    // Check idle miss
    if (this.lastStepTime > 0 && (t - this.lastStepTime) > MISS_GAP_MS * 2 && !this.inPeak) {
      // only fire once per gap
      if (this.lastMissTime < this.lastStepTime) {
        // don't fire at start of session
        if (this.steps > 3) {
          this.misses++;
          this.lastMissTime = t;
          return 'miss';
        }
      }
    }

    return null;
  }

  get elapsedMs() {
    if (!this.sessionStart) return 0;
    return Date.now() - this.sessionStart;
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
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
};

const MEDIAPIPE_SCRIPT = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose.js';
const MEDIAPIPE_CAMERA = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3.1675466862/camera_utils.js';
const MEDIAPIPE_DRAWING = 'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils@0.3.1675466124/drawing_utils.js';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.crossOrigin = 'anonymous';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ─── Landmark indices ─────────────────────────────────────────────────────────
const LEFT_ANKLE  = 27;
const RIGHT_ANKLE = 28;

// ─── Celebration component ────────────────────────────────────────────────────
function MissFlash({ visible }) {
  if (!visible) return null;
  return (
    <div style={{
      position: 'absolute', inset: 0, borderRadius: '16px',
      border: '3px solid #ef4444',
      background: 'rgba(239,68,68,0.08)',
      pointerEvents: 'none',
      animation: 'missFlash 0.5s ease-out forwards',
      zIndex: 20,
    }} />
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function AiCounterPage() {
  // ── Mediapipe state ────────────────────────────────────────────────────────
  const [mpLoaded,  setMpLoaded]  = useState(false);
  const [mpError,   setMpError]   = useState('');
  const [mpLoading, setMpLoading] = useState(false);

  // ── Camera / mode ──────────────────────────────────────────────────────────
  const [mode,         setMode]         = useState('idle'); // idle | camera | upload | running | done
  const [facingMode,   setFacingMode]   = useState('environment'); // environment | user
  const [showOverlay,  setShowOverlay]  = useState(true);
  const [uploadFile,   setUploadFile]   = useState(null);
  const [uploadUrl,    setUploadUrl]    = useState('');

  // ── Session state ──────────────────────────────────────────────────────────
  const [isRunning,    setIsRunning]    = useState(false);
  const [steps,        setSteps]        = useState(0);
  const [misses,       setMisses]       = useState(0);
  const [elapsed,      setElapsed]      = useState(0);
  const [showMiss,     setShowMiss]     = useState(false);
  const [sessionDone,  setSessionDone]  = useState(false);
  const [finalSteps,   setFinalSteps]   = useState(0);
  const [finalMisses,  setFinalMisses]  = useState(0);

  // ── Config ─────────────────────────────────────────────────────────────────
  const [disciplineId,  setDisciplineId]  = useState('');
  const [sessionType,   setSessionType]   = useState('Training');
  const [trackedFoot,   setTrackedFoot]   = useState('left'); // left | right
  const [memberContext, setMemberContext] = useState(null);
  const [counterUser,   setCounterUser]   = useState(null);
  const [saving,        setSaving]        = useState(false);
  const [savedOk,       setSavedOk]       = useState(false);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const videoRef        = useRef(null);
  const canvasRef       = useRef(null);
  const poseRef         = useRef(null);
  const cameraRef       = useRef(null);
  const detectorRef     = useRef(new StepDetector());
  const missTimerRef    = useRef(null);
  const elapsedTimerRef = useRef(null);
  const isRunningRef    = useRef(false);
  const uploadVideoRef  = useRef(null);
  const fileInputRef    = useRef(null);

  const { disciplines, getDisc } = useDisciplines();

  // ── Boot: load user + member context ─────────────────────────────────────
  useEffect(() => {
    const uid = getCookie();
    if (!uid) return;
    UserFactory.get(uid).then(s => { if (s.exists()) setCounterUser({ id: uid, ...s.data() }); });
    const unsub = UserMemberLinkFactory.getForUser(uid, (profiles) => {
      const self = profiles.find(p => p.link.relationship === 'self');
      if (self) setMemberContext({ clubId: self.member.clubId, memberId: self.member.id });
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (disciplines.length > 0 && !disciplineId) setDisciplineId(disciplines[0].id);
  }, [disciplines]);

  // ── Load MediaPipe scripts lazily ─────────────────────────────────────────
  const loadMediaPipe = useCallback(async () => {
    setMpLoading(true);
    setMpError('');
    try {
      await Promise.all([
        loadScript(MEDIAPIPE_SCRIPT),
        loadScript(MEDIAPIPE_CAMERA),
        loadScript(MEDIAPIPE_DRAWING),
      ]);
      setMpLoaded(true);
    } catch (e) {
      setMpError('MediaPipe kon niet worden geladen. Controleer je internetverbinding.');
    } finally {
      setMpLoading(false);
    }
  }, []);

  // ── Pose result handler ───────────────────────────────────────────────────
  const onResults = useCallback((results) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Draw video frame
    if (results.image) {
      ctx.drawImage(results.image, 0, 0, w, h);
    }

    if (!results.poseLandmarks) return;
    const lms = results.poseLandmarks;

    // Draw skeleton overlay
    if (showOverlay && window.drawConnectors && window.POSE_CONNECTIONS) {
      ctx.globalAlpha = 0.6;
      window.drawConnectors(ctx, lms, window.POSE_CONNECTIONS, { color: '#00d4aa', lineWidth: 2 });
      window.drawLandmarks(ctx, lms, { color: '#ffffff', fillColor: '#00d4aa', lineWidth: 1, radius: 3 });
      ctx.globalAlpha = 1;
    }

    // Highlight tracked ankle
    const ankleIdx = trackedFoot === 'left' ? LEFT_ANKLE : RIGHT_ANKLE;
    const ankle = lms[ankleIdx];
    if (ankle && ankle.visibility > 0.5) {
      const ax = ankle.x * w;
      const ay = ankle.y * h;

      // Pulse ring
      ctx.beginPath();
      ctx.arc(ax, ay, 18, 0, Math.PI * 2);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ax, ay, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();

      // Feed to detector
      if (isRunningRef.current) {
        const event = detectorRef.current.push(ankle.y, Date.now());
        if (event === 'step') {
          const s = detectorRef.current.steps;
          setSteps(s);
        } else if (event === 'miss') {
          setMisses(detectorRef.current.misses);
          setShowMiss(true);
          clearTimeout(missTimerRef.current);
          missTimerRef.current = setTimeout(() => setShowMiss(false), 600);
        }
      }
    }

    // Draw step count HUD on canvas
    if (isRunningRef.current) {
      const steps = detectorRef.current.steps;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.roundRect(12, 12, 120, 52, 10);
      ctx.fill();
      ctx.fillStyle = '#60a5fa';
      ctx.font = 'bold 32px monospace';
      ctx.fillText(steps, 20, 50);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px system-ui';
      ctx.fillText('STAPPEN', 20, 63);
    }
  }, [showOverlay, trackedFoot]);

  // ── Start live camera ─────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    if (!mpLoaded) { await loadMediaPipe(); return; }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Stop any existing camera
    if (cameraRef.current) { try { cameraRef.current.stop(); } catch (_) {} }
    if (poseRef.current) { try { poseRef.current.close(); } catch (_) {} }

    const Pose = window.Pose;
    const Camera = window.Camera;
    if (!Pose || !Camera) { setMpError('MediaPipe niet beschikbaar.'); return; }

    const pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`,
    });
    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    pose.onResults(onResults);
    poseRef.current = pose;

    const camera = new Camera(video, {
      onFrame: async () => {
        canvas.width  = video.videoWidth  || 640;
        canvas.height = video.videoHeight || 480;
        await pose.send({ image: video });
      },
      width: 640,
      height: 480,
      facingMode,
    });

    try {
      await camera.start();
      cameraRef.current = camera;
      setMode('camera');
    } catch (e) {
      setMpError('Camera kon niet worden gestart: ' + (e.message || e));
    }
  }, [mpLoaded, loadMediaPipe, onResults, facingMode]);

  // ── Start session ─────────────────────────────────────────────────────────
  const startSession = useCallback(() => {
    detectorRef.current.reset();
    setSteps(0);
    setMisses(0);
    setElapsed(0);
    setSessionDone(false);
    setSavedOk(false);
    isRunningRef.current = true;
    setIsRunning(true);

    elapsedTimerRef.current = setInterval(() => {
      setElapsed(detectorRef.current.elapsedMs);
    }, 500);
  }, []);

  // ── Stop session ──────────────────────────────────────────────────────────
  const stopSession = useCallback(() => {
    isRunningRef.current = false;
    setIsRunning(false);
    clearInterval(elapsedTimerRef.current);
    setFinalSteps(detectorRef.current.steps);
    setFinalMisses(detectorRef.current.misses);
    setSessionDone(true);
  }, []);

  // ── Flip camera ───────────────────────────────────────────────────────────
  const flipCamera = useCallback(async () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    // Will re-trigger via useEffect on facingMode
  }, [facingMode]);

  useEffect(() => {
    if (mode === 'camera') startCamera();
  }, [facingMode]); // eslint-disable-line

  // ── Upload flow ────────────────────────────────────────────────────────────
  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) { alert('Selecteer een videobestand.'); return; }
    setUploadFile(file);
    const url = URL.createObjectURL(file);
    setUploadUrl(url);
    setMode('upload');
  }, []);

  const processUploadedVideo = useCallback(async () => {
    if (!mpLoaded) { await loadMediaPipe(); return; }
    const video = uploadVideoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const Pose = window.Pose;
    if (!Pose) { setMpError('MediaPipe niet beschikbaar.'); return; }

    detectorRef.current.reset();
    setSteps(0);
    setMisses(0);
    setElapsed(0);
    setSessionDone(false);
    isRunningRef.current = true;
    setIsRunning(true);
    setMode('running');

    const pose = new Pose({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${f}`,
    });
    pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, enableSegmentation: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    pose.onResults(onResults);
    poseRef.current = pose;

    // Process frame by frame
    const processFrame = async () => {
      if (video.paused || video.ended) {
        stopSession();
        return;
      }
      canvas.width  = video.videoWidth  || 640;
      canvas.height = video.videoHeight || 480;
      await pose.send({ image: video });
      requestAnimationFrame(processFrame);
    };

    video.currentTime = 0;
    video.play();
    requestAnimationFrame(processFrame);

    elapsedTimerRef.current = setInterval(() => {
      setElapsed(video.currentTime * 1000);
    }, 500);
  }, [mpLoaded, loadMediaPipe, onResults, stopSession]);

  // ── Save session ──────────────────────────────────────────────────────────
  const saveSession = useCallback(async () => {
    if (!memberContext || !disciplineId) return;
    setSaving(true);
    const { clubId, memberId } = memberContext;
    const disc = getDisc(disciplineId);

    try {
      await ClubMemberFactory.saveSessionHistory(clubId, memberId, {
        discipline:     disciplineId,
        disciplineName: disc?.name     || disciplineId,
        ropeType:       disc?.ropeType || 'SR',
        sessionType,
        score:          finalSteps,
        avgBpm:  0,
        maxBpm:  0,
        sessionStart: null,
        telemetry:    [],
        countedBy:     counterUser?.id   || null,
        countedByName: counterUser ? `${counterUser.firstName} ${counterUser.lastName} (AI)` : 'AI',
      });

      const freshHistory = await ClubMemberFactory.getSessionHistoryOnce(clubId, memberId);
      await BadgeFactory.checkAndAward(clubId, memberId, {
        score:          finalSteps,
        discipline:     disciplineId,
        disciplineName: disc?.name     || disciplineId,
        ropeType:       disc?.ropeType || 'SR',
        sessionType,
      }, freshHistory);

      setSavedOk(true);
    } catch (e) {
      console.error('Save failed:', e);
      alert('Opslaan mislukt. Probeer opnieuw.');
    } finally {
      setSaving(false);
    }
  }, [memberContext, disciplineId, sessionType, finalSteps, counterUser, getDisc]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (cameraRef.current) try { cameraRef.current.stop(); } catch (_) {}
      if (poseRef.current)   try { poseRef.current.close();  } catch (_) {}
      clearInterval(elapsedTimerRef.current);
      clearTimeout(missTimerRef.current);
      if (uploadUrl) URL.revokeObjectURL(uploadUrl);
    };
  }, []); // eslint-disable-line

  const currentDisc = getDisc(disciplineId);
  const durationSec = currentDisc?.durationSeconds || null;
  const progress    = durationSec ? Math.min(1, elapsed / (durationSec * 1000)) : 0;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <style>{pageCSS}</style>

      {/* ── Header ── */}
      <header style={s.header}>
        <a href="/counter" style={s.backBtn}>
          <ArrowLeft size={16} />
          <span>Teller</span>
        </a>
        <div style={s.headerCenter}>
          <div style={s.betaChip}>
            <Zap size={10} color="#f59e0b" />
            <span>AI BETA</span>
          </div>
          <span style={s.headerTitle}>AI Stapteller</span>
        </div>
        <button
          onClick={() => setShowOverlay(v => !v)}
          style={s.overlayToggle}
          title={showOverlay ? 'Overlay verbergen' : 'Overlay tonen'}
        >
          {showOverlay ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
      </header>

      <div style={s.body}>

        {/* ── Config strip ── */}
        <div style={s.configStrip}>
          <div style={s.configGroup}>
            <span style={s.configLabel}>Onderdeel</span>
            <select
              style={s.configSelect}
              value={disciplineId}
              onChange={e => setDisciplineId(e.target.value)}
              disabled={isRunning}
            >
              {disciplines.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div style={s.configGroup}>
            <span style={s.configLabel}>Type</span>
            <div style={s.configToggle}>
              {['Training', 'Wedstrijd'].map(t => (
                <button
                  key={t}
                  onClick={() => !isRunning && setSessionType(t)}
                  disabled={isRunning}
                  style={{
                    ...s.configToggleBtn,
                    backgroundColor: sessionType === t ? (t === 'Wedstrijd' ? '#ef4444' : '#3b82f6') : 'transparent',
                    color: sessionType === t ? 'white' : '#64748b',
                  }}
                >
                  {t === 'Training' ? '🏋️' : '🏆'} {t}
                </button>
              ))}
            </div>
          </div>
          <div style={s.configGroup}>
            <span style={s.configLabel}>Voet</span>
            <div style={s.configToggle}>
              {[['left', 'Links'], ['right', 'Rechts']].map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => !isRunning && setTrackedFoot(v)}
                  disabled={isRunning}
                  style={{
                    ...s.configToggleBtn,
                    backgroundColor: trackedFoot === v ? '#22c55e' : 'transparent',
                    color: trackedFoot === v ? 'white' : '#64748b',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Video / Canvas area ── */}
        <div style={s.videoWrap}>
          {/* Hidden video feeds */}
          <video
            ref={videoRef}
            style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }}
            playsInline
            muted
          />
          {uploadUrl && (
            <video
              ref={uploadVideoRef}
              src={uploadUrl}
              style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }}
              playsInline
              muted
            />
          )}

          {/* Canvas */}
          <canvas
            ref={canvasRef}
            style={{
              ...s.canvas,
              display: (mode === 'camera' || mode === 'upload' || mode === 'running') ? 'block' : 'none',
            }}
          />

          {/* Miss flash border */}
          <MissFlash visible={showMiss} />

          {/* Idle screen */}
          {mode === 'idle' && (
            <div style={s.idleScreen}>
              <div style={s.idleIcon}>
                <Camera size={48} color="#334155" />
              </div>
              <p style={s.idleTitle}>Kies een bron</p>
              <p style={s.idleSubtitle}>
                Gebruik je camera voor live tellen of upload een eerder opgenomen video.
              </p>

              {mpError && (
                <div style={s.errorBanner}>
                  <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                  {mpError}
                </div>
              )}

              <div style={s.idleBtns}>
                <button
                  style={s.primaryBtn}
                  onClick={async () => {
                    if (!mpLoaded && !mpLoading) await loadMediaPipe();
                    await startCamera();
                  }}
                  disabled={mpLoading}
                >
                  {mpLoading
                    ? <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Laden…</>
                    : <><Camera size={16} /> Live camera</>
                  }
                </button>
                <button
                  style={s.secondaryBtn}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={16} /> Video uploaden
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />
              </div>

              <div style={s.infoBox}>
                <Info size={12} color="#64748b" style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  MediaPipe Pose draait volledig op je apparaat.
                  Geen data wordt naar een server gestuurd.
                  Eerste keer laden duurt ~3 seconden.
                </span>
              </div>
            </div>
          )}

          {/* Upload ready screen */}
          {mode === 'upload' && !isRunning && !sessionDone && (
            <div style={s.uploadReadyOverlay}>
              <Video size={32} color="#60a5fa" style={{ marginBottom: 10 }} />
              <p style={{ color: '#f1f5f9', fontWeight: '700', marginBottom: 4 }}>
                {uploadFile?.name}
              </p>
              <p style={{ color: '#64748b', fontSize: '12px', marginBottom: 16 }}>
                Klaar om te analyseren
              </p>
              <button style={s.primaryBtn} onClick={processUploadedVideo}>
                <Play size={16} fill="white" /> Analyseer video
              </button>
            </div>
          )}

          {/* Live HUD overlay (for camera mode) */}
          {mode === 'camera' && (
            <div style={s.cameraHud}>
              {/* Flip button */}
              <button style={s.hudBtn} onClick={flipCamera} title="Camera omdraaien">
                <FlipHorizontal size={16} />
              </button>
            </div>
          )}

          {/* Step/miss counters overlay (running) */}
          {(mode === 'camera' || mode === 'running') && (isRunning || sessionDone) && (
            <div style={s.statsOverlay}>
              <div style={s.statPill}>
                <span style={{ fontSize: '26px', fontWeight: '900', color: '#60a5fa', lineHeight: 1, fontFamily: 'monospace' }}>
                  {isRunning ? steps : finalSteps}
                </span>
                <span style={{ fontSize: '9px', color: '#64748b', fontWeight: '700', letterSpacing: '0.5px' }}>STAPPEN</span>
              </div>
              {(misses > 0 || (!isRunning && finalMisses > 0)) && (
                <div style={{ ...s.statPill, backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
                  <span style={{ fontSize: '20px', fontWeight: '900', color: '#ef4444', lineHeight: 1, fontFamily: 'monospace' }}>
                    {isRunning ? misses : finalMisses}
                  </span>
                  <span style={{ fontSize: '9px', color: '#ef4444', fontWeight: '700', letterSpacing: '0.5px' }}>MISSERS</span>
                </div>
              )}
              {isRunning && (
                <div style={{ ...s.statPill, minWidth: 'auto', padding: '6px 10px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: '#94a3b8', fontFamily: 'monospace' }}>
                    {fmtTime(elapsed)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Progress bar for timed disciplines */}
          {isRunning && durationSec && (
            <div style={s.progressBar}>
              <div style={{ ...s.progressFill, width: `${progress * 100}%`, backgroundColor: progress > 0.8 ? '#ef4444' : '#3b82f6' }} />
            </div>
          )}
        </div>

        {/* ── Controls ── */}
        <div style={s.controls}>
          {mode === 'camera' && !isRunning && !sessionDone && (
            <button style={s.startBtn} onClick={startSession}>
              <Play size={20} fill="white" />
              START TELLEN
            </button>
          )}

          {mode === 'camera' && isRunning && (
            <button style={s.stopBtn} onClick={stopSession}>
              <Square size={18} fill="white" />
              STOP
            </button>
          )}

          {mode === 'running' && isRunning && (
            <button style={s.stopBtn} onClick={stopSession}>
              <Square size={18} fill="white" />
              STOP ANALYSE
            </button>
          )}

          {(mode === 'camera' || mode === 'upload' || mode === 'running') && !isRunning && !sessionDone && (
            <button
              style={s.ghostBtn}
              onClick={() => {
                if (cameraRef.current) { try { cameraRef.current.stop(); } catch (_) {} cameraRef.current = null; }
                if (poseRef.current)   { try { poseRef.current.close();  } catch (_) {} poseRef.current = null;   }
                if (uploadUrl) URL.revokeObjectURL(uploadUrl);
                setUploadUrl('');
                setUploadFile(null);
                setMode('idle');
              }}
            >
              <ArrowLeft size={14} /> Terug
            </button>
          )}
        </div>

        {/* ── Results panel ── */}
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
                <span style={{ fontSize: '40px', fontWeight: '900', color: finalMisses > 0 ? '#ef4444' : '#334155', lineHeight: 1 }}>
                  {finalMisses}
                </span>
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Missers</span>
              </div>
              <div style={s.resultCard}>
                <span style={{ fontSize: '24px', fontWeight: '700', color: '#94a3b8', lineHeight: 1, fontFamily: 'monospace' }}>
                  {fmtTime(elapsed)}
                </span>
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Duur</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              {!savedOk ? (
                <button
                  style={{ ...s.primaryBtn, flex: 1, justifyContent: 'center', opacity: saving || !memberContext ? 0.6 : 1 }}
                  onClick={saveSession}
                  disabled={saving || !memberContext}
                  title={!memberContext ? 'Geen clubprofiel gevonden' : undefined}
                >
                  {saving
                    ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Opslaan…</>
                    : <><Trophy size={14} /> Sla op als sessie</>
                  }
                </button>
              ) : (
                <div style={{ ...s.primaryBtn, flex: 1, justifyContent: 'center', backgroundColor: '#22c55e', cursor: 'default' }}>
                  <CheckCircle2 size={14} /> Opgeslagen!
                </div>
              )}
              <button
                style={{ ...s.ghostBtn, flexShrink: 0 }}
                onClick={() => {
                  setSessionDone(false);
                  setSteps(0);
                  setMisses(0);
                  setElapsed(0);
                  setSavedOk(false);
                  detectorRef.current.reset();
                  isRunningRef.current = false;
                }}
              >
                <RefreshCw size={14} /> Opnieuw
              </button>
            </div>

            {!memberContext && (
              <p style={{ fontSize: '11px', color: '#ef4444', textAlign: 'center', margin: '8px 0 0' }}>
                Geen clubprofiel gevonden. Sessie kan niet worden opgeslagen.
              </p>
            )}
          </div>
        )}

        {/* ── Tips ── */}
        {mode === 'idle' && (
          <div style={s.tipsSection}>
            <p style={s.tipsTitle}>Tips voor beste resultaten</p>
            <ul style={s.tipsList}>
              <li>📐 Filmhoek: zijkant of licht diagonaal, volledig lichaam zichtbaar</li>
              <li>💡 Zorg voor goede belichting (geen tegenlicht)</li>
              <li>👟 Selecteer de voet die het duidelijkst zichtbaar is</li>
              <li>📏 Houd camera stabiel op ~2m afstand</li>
              <li>⚡ Eerste detectie kan 1-2 stappen vertraging hebben</li>
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
  @keyframes spin   { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes missFlash {
    0%   { opacity: 1; }
    100% { opacity: 0; }
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;

const s = {
  page: {
    backgroundColor: '#0f172a',
    minHeight: '100vh',
    color: 'white',
    fontFamily: 'system-ui, sans-serif',
    display: 'flex',
    flexDirection: 'column',
  },

  // Header
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    backgroundColor: '#1e293b',
    borderBottom: '1px solid #334155',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    gap: '8px',
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    color: '#64748b',
    textDecoration: 'none',
    fontSize: '13px',
    fontWeight: '600',
    padding: '4px 0',
    minWidth: 60,
  },
  headerCenter: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '3px',
    flex: 1,
  },
  betaChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: '#f59e0b22',
    border: '1px solid #f59e0b44',
    borderRadius: '10px',
    padding: '2px 8px',
    fontSize: '9px',
    fontWeight: '800',
    color: '#f59e0b',
    letterSpacing: '0.6px',
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: '15px',
    fontWeight: '800',
    color: '#f1f5f9',
  },
  overlayToggle: {
    background: 'none',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    padding: '6px',
    display: 'flex',
    alignItems: 'center',
    minWidth: 28,
  },

  // Body
  body: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    maxWidth: '640px',
    width: '100%',
    margin: '0 auto',
    padding: '12px 12px 32px',
    gap: '12px',
  },

  // Config strip
  configStrip: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    backgroundColor: '#1e293b',
    borderRadius: '12px',
    border: '1px solid #334155',
    padding: '10px 12px',
  },
  configGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1,
    minWidth: '120px',
  },
  configLabel: {
    fontSize: '9px',
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  configSelect: {
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '7px',
    color: 'white',
    fontSize: '12px',
    padding: '6px 8px',
    fontFamily: 'inherit',
    width: '100%',
  },
  configToggle: {
    display: 'flex',
    gap: '4px',
  },
  configToggleBtn: {
    flex: 1,
    padding: '5px 6px',
    borderRadius: '6px',
    border: '1px solid #334155',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  },

  // Video area
  videoWrap: {
    position: 'relative',
    width: '100%',
    aspectRatio: '4/3',
    backgroundColor: '#0a0f1a',
    borderRadius: '16px',
    border: '1px solid #1e293b',
    overflow: 'hidden',
  },
  canvas: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
    borderRadius: '16px',
  },

  // Idle screen
  idleScreen: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    textAlign: 'center',
    gap: '10px',
  },
  idleIcon: {
    width: '80px',
    height: '80px',
    borderRadius: '20px',
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '4px',
  },
  idleTitle: {
    fontSize: '18px',
    fontWeight: '800',
    color: '#f1f5f9',
    margin: 0,
  },
  idleSubtitle: {
    fontSize: '13px',
    color: '#64748b',
    margin: 0,
    lineHeight: 1.5,
    maxWidth: '280px',
  },
  idleBtns: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: '4px',
  },
  infoBox: {
    display: 'flex',
    gap: '6px',
    alignItems: 'flex-start',
    backgroundColor: '#1e293b',
    borderRadius: '8px',
    padding: '8px 10px',
    fontSize: '11px',
    color: '#64748b',
    lineHeight: 1.5,
    maxWidth: '320px',
    textAlign: 'left',
    marginTop: '4px',
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#ef444422',
    border: '1px solid #ef444444',
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '12px',
    color: '#ef4444',
    maxWidth: '320px',
    textAlign: 'left',
  },

  // Upload ready overlay
  uploadReadyOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.9)',
    textAlign: 'center',
    padding: '24px',
  },

  // Camera HUD
  cameraHud: {
    position: 'absolute',
    top: '10px',
    right: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    zIndex: 10,
  },
  hudBtn: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    backgroundColor: 'rgba(0,0,0,0.5)',
    border: '1px solid rgba(255,255,255,0.15)',
    color: 'white',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(4px)',
  },

  // Stats overlay
  statsOverlay: {
    position: 'absolute',
    top: '10px',
    left: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    zIndex: 15,
  },
  statPill: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(6px)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px',
    padding: '6px 12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minWidth: '60px',
  },

  // Progress bar
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '4px',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  progressFill: {
    height: '100%',
    transition: 'width 0.5s linear, background-color 0.3s',
    borderRadius: '0 2px 2px 0',
  },

  // Controls row
  controls: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Results
  resultsPanel: {
    backgroundColor: '#1e293b',
    borderRadius: '14px',
    border: '1px solid #22c55e33',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    animation: 'fadeUp 0.35s ease-out',
  },
  resultsHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  resultGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
  },
  resultCard: {
    backgroundColor: '#0f172a',
    borderRadius: '10px',
    border: '1px solid #1e293b',
    padding: '12px 8px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
  },

  // Tips
  tipsSection: {
    backgroundColor: '#1e293b',
    borderRadius: '12px',
    border: '1px solid #334155',
    padding: '14px 16px',
  },
  tipsTitle: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    margin: '0 0 8px',
  },
  tipsList: {
    margin: 0,
    padding: '0 0 0 4px',
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },

  // Buttons
  primaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    padding: '11px 18px',
    backgroundColor: '#3b82f6',
    border: 'none',
    borderRadius: '10px',
    color: 'white',
    fontWeight: '700',
    fontSize: '14px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'opacity 0.15s',
    whiteSpace: 'nowrap',
  },
  secondaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    padding: '11px 18px',
    backgroundColor: 'transparent',
    border: '1px solid #334155',
    borderRadius: '10px',
    color: '#94a3b8',
    fontWeight: '600',
    fontSize: '14px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  ghostBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '10px 14px',
    backgroundColor: 'transparent',
    border: '1px solid #334155',
    borderRadius: '10px',
    color: '#64748b',
    fontWeight: '600',
    fontSize: '13px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  startBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '14px 28px',
    backgroundColor: '#22c55e',
    border: 'none',
    borderRadius: '12px',
    color: 'white',
    fontWeight: '800',
    fontSize: '15px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: '0.5px',
  },
  stopBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '14px 28px',
    backgroundColor: '#ef4444',
    border: 'none',
    borderRadius: '12px',
    color: 'white',
    fontWeight: '800',
    fontSize: '15px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: '0.5px',
  },
};
