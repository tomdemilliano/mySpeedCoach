/**
 * pages/heart-rate.js  —  Hartslag volledig scherm
 *
 * Connects a Bluetooth HRM and shows the current BPM full-screen
 * with zone name and color so a skipper can clearly read it at a distance.
 *
 * Rules followed:
 *   - All DB access via factories (CLAUDE.md §1)
 *   - No <form> elements (CLAUDE.md §4)
 *   - Inline CSS only (CLAUDE.md §9)
 *   - Dutch UI strings (CLAUDE.md §9)
 */

import { useState, useEffect, useRef } from 'react';
import { UserFactory, LiveSessionFactory } from '../constants/dbSchema';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Bluetooth, BluetoothOff, Heart, Zap } from 'lucide-react';

// ─── Default zones (same as index.js / dashboard.js) ─────────────────────────
const DEFAULT_ZONES = [
  { name: 'Warm-up',   min: 0,   max: 120, color: '#94a3b8', bg: '#94a3b822' },
  { name: 'Fat Burn',  min: 120, max: 145, color: '#22c55e', bg: '#22c55e22' },
  { name: 'Aerobic',   min: 145, max: 165, color: '#facc15', bg: '#facc1522' },
  { name: 'Anaerobic', min: 165, max: 185, color: '#f97316', bg: '#f9731622' },
  { name: 'Red Line',  min: 185, max: 250, color: '#ef4444', bg: '#ef444422' },
];

const getZone = (bpm, zones) =>
  (zones || DEFAULT_ZONES).find(z => bpm >= z.min && bpm < z.max) || DEFAULT_ZONES[0];

// ─── Parse Bluetooth heart rate characteristic ────────────────────────────────
const parseHeartRate = (value) => {
  const flags = value.getUint8(0);
  return (flags & 0x1) ? value.getUint16(1, true) : value.getUint8(1);
};

// ─── Zone bar ─────────────────────────────────────────────────────────────────
function ZoneBar({ bpm, zones }) {
  return (
    <div style={{ display: 'flex', gap: '4px', width: '100%', maxWidth: '320px', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
      {(zones || DEFAULT_ZONES).map(z => (
        <div key={z.name} style={{
          flex: 1, height: '100%',
          backgroundColor: bpm >= z.min && bpm < z.max ? z.color : z.color + '33',
          transition: 'background-color 0.3s',
        }} />
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function HeartRatePage() {
  const { uid } = useAuth();

  const [zones,        setZones]        = useState(DEFAULT_ZONES);
  const [bpm,          setBpm]          = useState(0);
  const [connected,    setConnected]    = useState(false);
  const [deviceName,   setDeviceName]   = useState('');
  const [connecting,   setConnecting]   = useState(false);
  const [error,        setError]        = useState('');
  const [pulse,        setPulse]        = useState(false);    // triggers CSS heartbeat
  const [maxBpm,       setMaxBpm]       = useState(0);
  const [sessionStart, setSessionStart] = useState(null);
  const [elapsed,      setElapsed]      = useState(0);        // seconds

  const lastBpmRef    = useRef(0);
  const deviceRef     = useRef(null);
  const timerRef      = useRef(null);

  // Load user's custom zones
  useEffect(() => {
    if (!uid) return;
    UserFactory.get(uid).then(snap => {
      if (snap.exists() && snap.data().heartrateZones) setZones(snap.data().heartrateZones);
    });
  }, [uid]);

  // Elapsed timer
  useEffect(() => {
    if (!connected) return;
    if (!sessionStart) setSessionStart(Date.now());
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - (sessionStart || Date.now())) / 1000));
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [connected]);

  // Cleanup on unmount
  useEffect(() => () => {
    clearInterval(timerRef.current);
    if (deviceRef.current?.gatt?.connected) {
      deviceRef.current.gatt.disconnect();
    }
  }, []);

  // Sync to RTDB when BPM changes
  useEffect(() => {
    if (!uid || !connected || bpm <= 0 || bpm === lastBpmRef.current) return;
    lastBpmRef.current = bpm;
    LiveSessionFactory.syncHeartbeat(uid, bpm, 'online');
  }, [bpm, connected, uid]);

  const connectBluetooth = async () => {
    setError('');
    setConnecting(true);
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['heart_rate'] }],
      });
      deviceRef.current = device;

      device.addEventListener('gattserverdisconnected', () => {
        setConnected(false);
        setBpm(0);
        clearInterval(timerRef.current);
        if (uid) LiveSessionFactory.syncHeartbeat(uid, 0, 'offline');
      });

      const server         = await device.gatt.connect();
      const service        = await server.getPrimaryService('heart_rate');
      const characteristic = await service.getCharacteristic('heart_rate_measurement');

      characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', (e) => {
        const hr = parseHeartRate(e.target.value);
        setBpm(hr);
        setMaxBpm(prev => Math.max(prev, hr));
        setPulse(true);
        setTimeout(() => setPulse(false), 200);
      });

      setDeviceName(device.name || 'HRM apparaat');
      setConnected(true);
      setSessionStart(Date.now());
      setElapsed(0);
      setMaxBpm(0);

      // Store device in Firestore if user is logged in
      if (uid) {
        UserFactory.get(uid).then(snap => {
          const known = snap.data()?.assignedDevice?.deviceId;
          if (device.id && known !== device.id) {
            UserFactory.assignDevice(uid, device.id, device.name || 'HRM apparaat');
          }
        });
      }
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        setError('Verbinding mislukt. Zorg dat de HRM aan staat en probeer opnieuw.');
      }
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () => {
    if (deviceRef.current?.gatt?.connected) deviceRef.current.gatt.disconnect();
    setConnected(false);
    setBpm(0);
    clearInterval(timerRef.current);
    if (uid) LiveSessionFactory.syncHeartbeat(uid, 0, 'offline');
  };

  const zone    = getZone(bpm, zones);
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div style={{
      ...s.page,
      backgroundColor: connected && bpm > 0 ? zone.bg.replace('22', '18') : '#0f172a',
      transition: 'background-color 0.5s',
    }}>
      <style>{pageCSS}</style>

      {/* Back button */}
      <a href="/live" style={s.backBtn}>
        <ArrowLeft size={16} /> Live
      </a>

      {/* Main content */}
      <div style={s.main}>
        {!connected ? (
          /* ── Disconnected state ── */
          <div style={s.connectWrap}>
            <div style={s.connectIcon}>
              <Heart size={48} color="#475569" />
            </div>
            <h1 style={s.connectTitle}>Hartslag</h1>
            <p style={s.connectSub}>
              Koppel een Bluetooth hartslagmeter om je hartslag live te zien.
            </p>
            {error && (
              <div style={s.errorBox}>{error}</div>
            )}
            <button
              onClick={connectBluetooth}
              disabled={connecting || !navigator.bluetooth}
              style={{ ...s.connectBtn, opacity: connecting ? 0.65 : 1 }}
            >
              {connecting
                ? <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>↻</span> Verbinden…</>
                : <><Bluetooth size={20} /> HRM koppelen</>}
            </button>
            {!navigator.bluetooth && (
              <p style={{ fontSize: '12px', color: '#475569', marginTop: '12px', textAlign: 'center', maxWidth: '280px' }}>
                Web Bluetooth wordt niet ondersteund in deze browser. Gebruik Chrome of Edge op desktop of Android.
              </p>
            )}
          </div>
        ) : (
          /* ── Connected / live state ── */
          <div style={s.liveWrap}>
            {/* Device name + disconnect */}
            <div style={s.deviceRow}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: zone.color, fontWeight: '600' }}>
                <Bluetooth size={14} color={zone.color} /> {deviceName}
              </div>
              <button onClick={disconnect} style={{ ...s.disconnectBtn, borderColor: zone.color + '44', color: zone.color }}>
                <BluetoothOff size={12} /> Ontkoppel
              </button>
            </div>

            {/* BPM number */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{
                ...s.bpmNumber,
                color: zone.color,
                textShadow: `0 0 80px ${zone.color}55`,
                animation: pulse ? 'bpmPop 0.2s ease-out' : 'none',
              }}>
                {bpm > 0 ? bpm : '--'}
              </div>
            </div>

            <div style={{ ...s.bpmLabel, color: zone.color + 'aa' }}>BPM</div>

            {/* Zone name */}
            <div style={{
              ...s.zoneName,
              color: zone.color,
              backgroundColor: zone.color + '18',
              border: `1px solid ${zone.color}44`,
            }}>
              {zone.name}
            </div>

            {/* Zone bar */}
            <ZoneBar bpm={bpm} zones={zones} />

            {/* Zone legend */}
            <div style={s.zoneLegend}>
              {zones.map(z => (
                <div key={z.name} style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: bpm >= z.min && bpm < z.max ? 1 : 0.35, transition: 'opacity 0.3s' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: z.color, flexShrink: 0 }} />
                  <span style={{ fontSize: '10px', color: z.color, fontWeight: bpm >= z.min && bpm < z.max ? '700' : '400' }}>
                    {z.name}
                  </span>
                </div>
              ))}
            </div>

            {/* Session stats row */}
            <div style={s.statsRow}>
              <div style={s.statBox}>
                <div style={{ ...s.statVal, color: '#ef4444' }}>{maxBpm > 0 ? maxBpm : '--'}</div>
                <div style={s.statLabel}>Max BPM</div>
              </div>
              <div style={s.statBox}>
                <div style={{ ...s.statVal, color: '#60a5fa' }}>{fmtTime(elapsed)}</div>
                <div style={s.statLabel}>Tijd</div>
              </div>
              <div style={s.statBox}>
                <div style={{ ...s.statVal, color: zone.color }}>{zone.min}–{zone.max}</div>
                <div style={s.statLabel}>Zone BPM</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const pageCSS = `
  * { box-sizing: border-box; }
  @keyframes spin    { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes bpmPop  { 0% { transform: scale(1.08); } 100% { transform: scale(1); } }
`;

const s = {
  page: {
    minHeight: '100vh', fontFamily: 'system-ui, sans-serif', color: 'white',
    display: 'flex', flexDirection: 'column',
  },
  backBtn: {
    position: 'fixed', top: '16px', left: '16px', zIndex: 100,
    display: 'flex', alignItems: 'center', gap: '6px',
    color: '#64748b', textDecoration: 'none', fontSize: '13px', fontWeight: '600',
    padding: '6px 12px', borderRadius: '20px',
    backgroundColor: 'rgba(30,41,59,0.8)', backdropFilter: 'blur(8px)',
    border: '1px solid #334155',
  },
  main: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '80px 24px 40px',
  },

  /* Disconnected */
  connectWrap:  { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', maxWidth: '360px', width: '100%' },
  connectIcon:  { width: '96px', height: '96px', borderRadius: '24px', backgroundColor: '#1e293b', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  connectTitle: { fontSize: '28px', fontWeight: '800', color: '#f1f5f9', margin: 0, textAlign: 'center' },
  connectSub:   { fontSize: '14px', color: '#64748b', margin: 0, textAlign: 'center', lineHeight: 1.6 },
  connectBtn:   {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '16px 32px', borderRadius: '14px', border: 'none',
    backgroundColor: '#3b82f6', color: 'white', fontWeight: '700', fontSize: '16px',
    cursor: 'pointer', fontFamily: 'inherit',
  },
  errorBox: {
    backgroundColor: '#ef444422', border: '1px solid #ef444444', borderRadius: '10px',
    padding: '12px 16px', fontSize: '13px', color: '#ef4444', textAlign: 'center',
    maxWidth: '320px',
  },

  /* Connected */
  liveWrap:     { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', width: '100%', maxWidth: '480px' },
  deviceRow:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: '320px' },
  disconnectBtn:{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: '1px solid', borderRadius: '14px', padding: '5px 10px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' },
  bpmNumber:    {
    fontSize: 'clamp(120px, 30vw, 200px)', fontWeight: '900', lineHeight: 1,
    fontFamily: 'system-ui, monospace', letterSpacing: '-4px',
    transition: 'color 0.5s',
  },
  bpmLabel:     { fontSize: '22px', fontWeight: '700', letterSpacing: '6px', textTransform: 'uppercase', marginTop: '-12px', transition: 'color 0.5s' },
  zoneName:     { padding: '8px 24px', borderRadius: '20px', fontSize: '16px', fontWeight: '800', letterSpacing: '1px', textTransform: 'uppercase', transition: 'all 0.5s' },
  zoneLegend:   { display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '360px' },
  statsRow:     { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', width: '100%', maxWidth: '360px', marginTop: '8px' },
  statBox:      { backgroundColor: 'rgba(30,41,59,0.6)', backdropFilter: 'blur(8px)', borderRadius: '12px', border: '1px solid #334155', padding: '12px', textAlign: 'center' },
  statVal:      { fontSize: '20px', fontWeight: '900', lineHeight: 1, marginBottom: '4px' },
  statLabel:    { fontSize: '10px', color: '#475569', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px' },
};
