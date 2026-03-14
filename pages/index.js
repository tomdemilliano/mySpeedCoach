import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserFactory, ClubFactory, GroupFactory, LiveSessionFactory, ClubJoinRequestFactory, BadgeFactory } from '../constants/dbSchema';
import {
  Bluetooth, BluetoothOff, Heart, Settings, Trophy,
  Target, Plus, Edit2, Trash2, Check, X, ChevronRight,
  Building2, Users, Save, LogOut, Award, Zap, AlertCircle,
  Clock, TrendingUp, Star, UserPlus, Send, EyeOff, Eye, Bell,
  CheckCircle2, XCircle, ChevronDown, ChevronUp, MessageSquare,
  ArrowLeft, Medal, Activity, Hash, Calendar, ArrowRight
} from 'lucide-react';

// ─── Cookie helpers ──────────────────────────────────────────────────────────
const COOKIE_KEY = 'msc_uid';
const setCookie = (uid) => {
  const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${COOKIE_KEY}=${uid}; expires=${expires}; path=/; SameSite=Lax`;
};
const getCookie = () => {
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`));
  return match ? match[1] : null;
};
const clearCookie = () => {
  document.cookie = `${COOKIE_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
};

const parseHeartRate = (value) => {
  const flags = value.getUint8(0);
  return (flags & 0x1) ? value.getUint16(1, true) : value.getUint8(1);
};

const DEFAULT_ZONES = [
  { name: 'Warm-up',   min: 0,   max: 120, color: '#94a3b8' },
  { name: 'Fat Burn',  min: 120, max: 145, color: '#22c55e' },
  { name: 'Aerobic',   min: 145, max: 165, color: '#facc15' },
  { name: 'Anaerobic', min: 165, max: 185, color: '#f97316' },
  { name: 'Red Line',  min: 185, max: 250, color: '#ef4444' },
];
const getZoneColor = (bpm, zones) => {
  const z = (zones || DEFAULT_ZONES).find(z => bpm >= z.min && bpm < z.max);
  return z ? z.color : '#94a3b8';
};
const getZoneName = (bpm, zones) => {
  const z = (zones || DEFAULT_ZONES).find(z => bpm >= z.min && bpm < z.max);
  return z ? z.name : '—';
};

const DISC_LABELS = { '30sec': '30 sec', '2min': '2 min', '3min': '3 min' };
const DISCIPLINES = ['30sec', '2min', '3min'];
const SESSION_TYPES = ['Training', 'Wedstrijd'];

const STATUS_CONFIG = {
  pending:  { label: 'In behandeling', color: '#f59e0b', bg: '#f59e0b22', icon: Clock },
  approved: { label: 'Goedgekeurd',    color: '#22c55e', bg: '#22c55e22', icon: CheckCircle2 },
  rejected: { label: 'Afgewezen',      color: '#ef4444', bg: '#ef444422', icon: XCircle },
};

const SPARK_ANIMS = ['sparkFlyA','sparkFlyB','sparkFlyC','sparkFlyD','sparkFlyE','sparkFlyF'];

// ─── HRM Header Widget ────────────────────────────────────────────────────────
function HrmHeaderWidget({ connected, bpm, deviceName, zones, onConnect, onDisconnect }) {
  const [showMenu, setShowMenu] = useState(false);
  const bpmColor = connected ? getZoneColor(bpm, zones) : '#334155';
  const zoneName = connected ? getZoneName(bpm, zones) : null;

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setShowMenu(v => !v)}
        title={connected ? `${bpm} BPM · ${deviceName}` : 'HRM koppelen'}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '6px 10px', borderRadius: '20px',
          backgroundColor: connected ? `${bpmColor}18` : '#1e293b',
          border: `1px solid ${connected ? `${bpmColor}44` : '#334155'}`,
          cursor: 'pointer', transition: 'all 0.2s',
        }}
      >
        <Heart
          size={16}
          color={connected ? bpmColor : '#475569'}
          fill={connected ? bpmColor : 'none'}
          style={connected ? { animation: 'heartbeat 1s ease-in-out infinite' } : {}}
        />
        {connected && bpm > 0 && (
          <span style={{ fontSize: '13px', fontWeight: '700', color: bpmColor, fontFamily: 'monospace' }}>
            {bpm}
          </span>
        )}
        {!connected && (
          <span style={{ fontSize: '11px', color: '#475569' }}>HRM</span>
        )}
      </button>

      {showMenu && (
        <>
          <div onClick={() => setShowMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: '6px',
            backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px',
            padding: '12px', zIndex: 100, minWidth: '200px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
          }}>
            {connected ? (
              <>
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '24px', fontWeight: '900', color: bpmColor, lineHeight: 1 }}>{bpm || '--'}</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>BPM · {zoneName}</div>
                  <div style={{ fontSize: '10px', color: '#475569', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Bluetooth size={10} color="#3b82f6" /> {deviceName}
                  </div>
                </div>
                <div style={{ display: 'flex', borderRadius: '4px', overflow: 'hidden', height: '4px', marginBottom: '12px' }}>
                  {(zones || DEFAULT_ZONES).map(z => (
                    <div key={z.name} style={{ flex: 1, backgroundColor: bpm >= z.min && bpm < z.max ? z.color : `${z.color}33` }} />
                  ))}
                </div>
                <button
                  onClick={() => { onDisconnect(); setShowMenu(false); }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', backgroundColor: '#1e293b', border: '1px solid #ef444444', borderRadius: '8px', color: '#ef4444', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                >
                  <BluetoothOff size={13} /> Ontkoppel
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px', lineHeight: 1.5 }}>
                  Koppel een Bluetooth HRM om je hartslag live te volgen.
                </div>
                <button
                  onClick={() => { onConnect(); setShowMenu(false); }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', backgroundColor: '#3b82f622', border: '1px solid #3b82f644', borderRadius: '8px', color: '#60a5fa', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                >
                  <Bluetooth size={13} /> Koppel HRM
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Celebration Overlay ──────────────────────────────────────────────────────
// onAccept = save record / mark goal; onDecline = skip saving; badges auto-saved so onAccept = dismiss
function CelebrationOverlay({ type, data, onAccept, onDecline }) {
  const isBadge  = type === 'badge';
  const isRecord = type === 'record';
  const isGoal   = type === 'goal';
  const accentColor = isBadge ? '#f59e0b' : isRecord ? '#facc15' : '#22c55e';
  const Icon = isBadge ? Medal : isRecord ? Award : Target;

  return (
    <>
      {/* Sparks */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 3000, overflow: 'hidden' }}>
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: `${10 + (i * 3.5) % 80}%`, top: `${15 + (i * 7) % 70}%`,
            width: `${5 + (i % 4) * 3}px`, height: `${5 + (i % 4) * 3}px`,
            borderRadius: '50%',
            backgroundColor: ['#facc15','#f97316','#ef4444','#22c55e','#60a5fa','#a78bfa'][i % 6],
            animation: `${SPARK_ANIMS[i % 6]} ${0.9 + (i % 5) * 0.2}s ease-out ${(i % 8) * 0.12}s forwards`,
          }} />
        ))}
      </div>

      {/* Modal */}
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 500 }}>
        <div style={{ backgroundColor: '#1e293b', padding: '30px', borderRadius: '20px', width: '100%', maxWidth: '400px', border: `1px solid ${accentColor}`, animation: 'fadeInUp 0.4s ease-out' }}>

          {/* Icon / badge image */}
          {isBadge && data.badgeImageUrl ? (
            <img src={data.badgeImageUrl} alt={data.badgeName} style={{ width: '90px', height: '90px', borderRadius: '50%', objectFit: 'cover', margin: '0 auto 16px', display: 'block', border: `3px solid ${accentColor}` }} />
          ) : (
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: `${accentColor}22`, border: `2px solid ${accentColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', animation: 'pulse 1.5s ease-in-out infinite', fontSize: isBadge ? '40px' : undefined }}>
              {isBadge ? (data.badgeEmoji || '🏅') : <Icon size={40} color={accentColor} />}
            </div>
          )}

          <h2 style={{ color: accentColor, fontSize: '22px', margin: '0 0 8px', textAlign: 'center' }}>
            {isBadge ? '🎖️ BADGE VERDIEND!' : isRecord ? '🏆 NIEUW RECORD!' : '🎯 DOEL BEREIKT!'}
          </h2>

          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            {isBadge ? (
              <>
                <div style={{ fontSize: '22px', fontWeight: '900', color: 'white', lineHeight: 1 }}>{data.badgeName}</div>
                <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '8px', lineHeight: 1.5 }}>{data.badgeDescription || ''}</div>
                <div style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>Uitgereikt door: {data.awardedByName || 'Systeem'}</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '42px', fontWeight: '900', color: 'white', lineHeight: 1 }}>{data.score}</div>
                <div style={{ color: '#94a3b8', fontSize: '14px', marginTop: '4px' }}>
                  {DISC_LABELS[data.discipline] || data.discipline} · {data.sessionType}
                </div>
                {isRecord && data.previousBest > 0 && (
                  <div style={{ color: '#22c55e', fontSize: '13px', marginTop: '8px' }}>
                    +{data.score - data.previousBest} beter dan vorig record ({data.previousBest})
                  </div>
                )}
                {isGoal && (
                  <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '8px' }}>Doel was: {data.targetScore} stappen</div>
                )}
              </>
            )}
          </div>

          {/* Badges: single dismiss button. Records/goals: accept or skip */}
          {isBadge ? (
            <button onClick={onAccept} style={{ width: '100%', padding: '14px', backgroundColor: accentColor, border: 'none', borderRadius: '10px', color: 'white', fontWeight: '700', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Check size={20} /> GEWELDIG!
            </button>
          ) : (
            <>
              <p style={{ color: '#cbd5e1', textAlign: 'center', fontSize: '14px', marginBottom: '16px' }}>
                {isRecord ? 'Wil je dit als officieel record registreren?' : 'Wil je dit als doelbereiking vastleggen?'}
              </p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={onAccept} style={{ flex: 1, padding: '14px', backgroundColor: '#22c55e', border: 'none', borderRadius: '10px', color: 'white', fontWeight: '700', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <Check size={20} /> JA
                </button>
                <button onClick={onDecline} style={{ flex: 1, padding: '14px', backgroundColor: '#475569', border: 'none', borderRadius: '10px', color: 'white', fontWeight: '700', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <X size={20} /> NEE
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Quick stat card ──────────────────────────────────────────────────────────
function StatCard({ icon: Icon, color, label, value, sub, href }) {
  const inner = (
    <div style={{
      backgroundColor: '#1e293b', borderRadius: '12px', padding: '14px',
      border: `1px solid ${color}22`,
      display: 'flex', flexDirection: 'column', gap: '2px',
      textDecoration: 'none', color: 'inherit',
      transition: 'border-color 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
        <div style={{ width: '26px', height: '26px', borderRadius: '6px', backgroundColor: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={13} color={color} />
        </div>
        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>{label}</span>
      </div>
      <div style={{ fontSize: '26px', fontWeight: '900', color: value != null ? color : '#334155', lineHeight: 1 }}>
        {value ?? '—'}
      </div>
      {sub && <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>{sub}</div>}
    </div>
  );
  return href ? <a href={href} style={{ textDecoration: 'none' }}>{inner}</a> : inner;
}

// ─── Recent sessions mini list ────────────────────────────────────────────────
function RecentSessionsList({ uid }) {
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    if (!uid) return;
    const unsub = UserFactory.getSessionHistory(uid, (data) => setSessions(data.slice(0, 5)));
    return () => unsub();
  }, [uid]);

  if (sessions.length === 0) return (
    <div style={{ textAlign: 'center', padding: '20px 0', color: '#334155', fontSize: '13px' }}>
      Nog geen sessies
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {sessions.map((s, i) => {
        const typeColor = s.sessionType === 'Wedstrijd' ? '#f97316' : '#3b82f6';
        return (
          <div key={s.id || i} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '10px 12px', backgroundColor: '#0f172a',
            borderRadius: '8px', border: '1px solid #1e293b',
          }}>
            <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', backgroundColor: `${typeColor}22`, color: typeColor, border: `1px solid ${typeColor}40`, flexShrink: 0 }}>
              {s.sessionType || 'Training'}
            </span>
            <span style={{ fontSize: '12px', color: '#64748b', flexShrink: 0 }}>{DISC_LABELS[s.discipline] || s.discipline}</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: '16px', fontWeight: '900', color: '#60a5fa' }}>{s.score}</span>
            <span style={{ fontSize: '10px', color: '#475569' }}>stps</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Memberships panel (modal) ────────────────────────────────────────────────
function MembershipsPanel({ uid, allClubs, onClose }) {
  const [memberships, setMemberships] = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinForm, setJoinForm] = useState({ clubId: '', message: '' });
  const [joinSending, setJoinSending] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [showHiddenRequests, setShowHiddenRequests] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    if (!uid) return;
    UserFactory.get(uid).then(snap => { if (snap.exists()) setCurrentUser({ id: uid, ...snap.data() }); });
    const u1 = ClubJoinRequestFactory.getByUser(uid, setJoinRequests);
    return () => u1();
  }, [uid]);

  useEffect(() => {
    if (!currentUser || allClubs.length === 0) return;
    const allUnsubs = [];
    const collected = {};
    allClubs.forEach(club => {
      const u = GroupFactory.getGroupsByClub(club.id, (groups) => {
        groups.forEach(group => {
          const u2 = GroupFactory.getMembersByGroup(club.id, group.id, (members) => {
            const mine = members.find(m => m.id === uid);
            const key = `${club.id}-${group.id}`;
            if (mine) {
              collected[key] = { clubId: club.id, clubName: club.name, groupId: group.id, groupName: group.name, isSkipper: mine.isSkipper, isCoach: mine.isCoach };
            } else delete collected[key];
            setMemberships(Object.values(collected));
          });
          allUnsubs.push(u2);
        });
      });
      allUnsubs.push(u);
    });
    return () => allUnsubs.forEach(u => u && u());
  }, [currentUser, allClubs]);

  const handleSendJoin = async () => {
    setJoinError('');
    if (!joinForm.clubId) { setJoinError('Selecteer een club.'); return; }
    const already = joinRequests.find(r => r.clubId === joinForm.clubId && r.status === 'pending');
    if (already) { setJoinError('Je hebt al een openstaande aanvraag.'); return; }
    setJoinSending(true);
    try {
      const club = allClubs.find(c => c.id === joinForm.clubId);
      await ClubJoinRequestFactory.create(uid, { firstName: currentUser?.firstName || '', lastName: currentUser?.lastName || '', email: currentUser?.email || '' }, joinForm.clubId, club?.name || '', joinForm.message);
      setShowJoinModal(false);
      setJoinForm({ clubId: '', message: '' });
    } catch (e) { setJoinError('Aanvraag kon niet worden verzonden.'); }
    finally { setJoinSending(false); }
  };

  const visibleRequests = joinRequests.filter(r => !r.hidden);
  const hiddenRequests = joinRequests.filter(r => r.hidden);
  const newRejections = joinRequests.filter(r => r.status === 'rejected' && !r.hidden).length;

  return (
    <div style={s.modalOverlay}>
      <div style={{ ...s.modal, maxHeight: '85vh' }}>
        <div style={s.modalHeader}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
            <Building2 size={18} color="#a78bfa" /> Lidmaatschappen
          </h3>
          <button style={s.iconBtn} onClick={onClose}><X size={18} /></button>
        </div>

        {/* Memberships */}
        {memberships.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Clubs</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {memberships.map((m, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', backgroundColor: '#0f172a', borderRadius: '10px', border: '1px solid #334155' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#2d1d4e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Building2 size={15} color="#a78bfa" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '600', fontSize: '14px', color: '#f1f5f9' }}>{m.clubName}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{m.groupName}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {m.isSkipper && <span style={{ padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', backgroundColor: '#3b82f622', color: '#60a5fa', border: '1px solid #3b82f644' }}>Skipper</span>}
                    {m.isCoach && <span style={{ padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', backgroundColor: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b44' }}>Coach</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Join requests */}
        {visibleRequests.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Aanvragen</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {visibleRequests.map(req => {
                const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
                const StatusIcon = cfg.icon;
                return (
                  <div key={req.id} style={{ padding: '10px 12px', backgroundColor: cfg.bg, borderRadius: '10px', border: `1px solid ${cfg.color}33` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: '600', fontSize: '14px', color: '#f1f5f9' }}>{req.clubName}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '700', color: cfg.color }}>
                        <StatusIcon size={10} /> {cfg.label}
                      </span>
                    </div>
                    {req.status === 'rejected' && req.rejectionReason && (
                      <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>Reden: {req.rejectionReason}</div>
                    )}
                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                      {req.status !== 'pending' && (
                        <button onClick={() => ClubJoinRequestFactory.hide(req.id)} style={{ fontSize: '11px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <EyeOff size={11} /> Verbergen
                        </button>
                      )}
                      {req.status !== 'pending' && (
                        <button onClick={() => { if (window.confirm('Verwijderen?')) ClubJoinRequestFactory.delete(req.id); }} style={{ fontSize: '11px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Trash2 size={11} /> Verwijderen
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {memberships.length === 0 && visibleRequests.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#475569', fontSize: '13px' }}>
            <Users size={28} color="#334155" style={{ marginBottom: '8px', display: 'block', margin: '0 auto 8px' }} />
            Geen clublidmaatschappen
          </div>
        )}

        <button
          onClick={() => { setShowJoinModal(true); setJoinError(''); }}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '11px', backgroundColor: '#7c3aed22', border: '1px solid #7c3aed44', borderRadius: '10px', color: '#a78bfa', fontWeight: '600', fontSize: '14px', cursor: 'pointer', marginTop: '8px' }}
        >
          <Send size={15} /> Club aanvraag indienen
        </button>

        {/* Join modal nested */}
        {showJoinModal && (
          <div style={{ ...s.modalOverlay, zIndex: 600 }}>
            <div style={{ ...s.modal, maxWidth: '400px' }}>
              <div style={s.modalHeader}>
                <h3 style={{ margin: 0, fontSize: '15px' }}>Aanvraag voor club</h3>
                <button style={s.iconBtn} onClick={() => setShowJoinModal(false)}><X size={18} /></button>
              </div>
              <label style={s.fieldLabel}>Club <span style={{ color: '#ef4444' }}>*</span></label>
              <select style={{ ...s.select, marginBottom: '14px' }} value={joinForm.clubId} onChange={e => setJoinForm({ ...joinForm, clubId: e.target.value })}>
                <option value="">-- Selecteer een club --</option>
                {allClubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <label style={s.fieldLabel}>Motivatie (optioneel)</label>
              <textarea style={{ ...s.input, minHeight: '70px', resize: 'vertical', lineHeight: 1.5, marginBottom: '4px' }} placeholder="Vertel iets over jezelf…" value={joinForm.message} onChange={e => setJoinForm({ ...joinForm, message: e.target.value })} />
              {joinError && <div style={{ color: '#ef4444', fontSize: '12px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}><AlertCircle size={12} />{joinError}</div>}
              <button
                onClick={handleSendJoin} disabled={joinSending}
                style={{ width: '100%', padding: '12px', backgroundColor: '#7c3aed', border: 'none', borderRadius: '10px', color: 'white', fontWeight: '700', fontSize: '14px', cursor: 'pointer', marginTop: '12px', opacity: joinSending ? 0.6 : 1 }}
              >
                {joinSending ? 'Verzenden…' : 'Aanvraag verzenden'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function IndexPage() {
  const [phase, setPhase] = useState('loading');
  const [allUsers, setAllUsers] = useState([]);
  const [allClubs, setAllClubs] = useState([]);
  const [selectedClubFilter, setSelectedClubFilter] = useState('');
  const [clubMembers, setClubMembers] = useState([]);
  const [newUserForm, setNewUserForm] = useState({ firstName: '', lastName: '', email: '' });
  const [newUserError, setNewUserError] = useState('');
  const [newUserSaving, setNewUserSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  // HRM
  const [heartRate, setHeartRate] = useState(0);
  const [hrmConnected, setHrmConnected] = useState(false);
  const [hrmDeviceName, setHrmDeviceName] = useState('');
  const lastBpmRef = useRef(0);

  // Records
  const [records, setRecords] = useState([]);

  // Goals
  const [goals, setGoals] = useState([]);

  // Sessions
  const [recentSessions, setRecentSessions] = useState([]);

  // Achievements
  const [earnedBadges, setEarnedBadges] = useState([]);
  const [achievementQueue, setAchievementQueue] = useState([]);
  const [isProcessingAchievements, setIsProcessingAchievements] = useState(false);

  // Modals
  const [showSettings, setShowSettings] = useState(false);
  const [showMemberships, setShowMemberships] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ firstName: '', lastName: '', email: '' });
  const [zonesForm, setZonesForm] = useState(DEFAULT_ZONES);

  // Notification badge for rejected requests
  const [newRejections, setNewRejections] = useState(0);

  // View mode toggle — users who are both skipper and coach can switch
  const [viewMode, setViewMode] = useState('skipper'); // 'skipper' | 'coach'
  const [isCoachInGroup, setIsCoachInGroup] = useState(false);

  useEffect(() => {
    const u1 = UserFactory.getAll(setAllUsers);
    const u2 = ClubFactory.getAll(setAllClubs);
    return () => { u1(); u2(); };
  }, []);

  useEffect(() => {
    if (allUsers.length === 0 || phase !== 'loading') return;
    const uid = getCookie();
    if (uid) {
      const user = allUsers.find(u => u.id === uid);
      if (user) { loginUser(user); return; }
    }
    setPhase('identify');
  }, [allUsers]);

  useEffect(() => {
    if (!selectedClubFilter) { setClubMembers([]); return; }
    const unsub = GroupFactory.getGroupsByClub(selectedClubFilter, async (groups) => {
      const memberSets = await Promise.all(
        groups.map(g => new Promise(res => GroupFactory.getMembersByGroup(selectedClubFilter, g.id, res)))
      );
      const allMemberUids = [...new Set(memberSets.flat().map(m => m.id))];
      setClubMembers(allUsers.filter(u => allMemberUids.includes(u.id)));
    });
    return () => unsub();
  }, [selectedClubFilter, allUsers]);

  // ── Achievement check (defined early so loginUser's useEffect can reference it) ──
  const achievementCheckedRef = useRef(false);

  // Run once when the user first lands on the page (after login).
  // Uses one-shot reads so we don't leave dangling listeners.
  const checkNewAchievements = useCallback(async (user) => {
    try {
      const lastVisitedRaw = await UserFactory.getLastVisited(user.id);
      const lastVisitedMs = lastVisitedRaw?.seconds ? lastVisitedRaw.seconds * 1000 : 0;

      // Update last visited timestamp immediately so next visit has a fresh baseline
      await UserFactory.updateLastVisited(user.id);

      // First visit ever — nothing to show yet
      if (!lastVisitedMs) return;

      const queue = [];

      // ── 1. New badges since last visit ──
      const { getDocs, collection } = await import('firebase/firestore');
      const { db: firestoreDb } = await import('../firebaseConfig');
      const badgesSnap = await getDocs(collection(firestoreDb, `users/${user.id}/earnedBadges`));
      const earnedBadges = badgesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      earnedBadges
        .filter(b => {
          const ms = b.earnedAt?.seconds ? b.earnedAt.seconds * 1000 : 0;
          return ms > lastVisitedMs;
        })
        .sort((a, b) => (a.earnedAt?.seconds || 0) - (b.earnedAt?.seconds || 0))
        .forEach(b => queue.push({ type: 'badge', data: b }));

      // ── 2. New records since last visit ──
      const history = await UserFactory.getSessionHistoryOnce(user.id);
      const recentSessions = history.filter(s => {
        const ms = s.sessionEnd?.seconds ? s.sessionEnd.seconds * 1000 : 0;
        return ms > lastVisitedMs;
      });

      for (const session of recentSessions) {
        if (!session.score) continue;
        const best = await UserFactory.getBestRecord(user.id, session.discipline, session.sessionType);
        if (best) {
          const recMs = best.achievedAt?.seconds ? best.achievedAt.seconds * 1000 : 0;
          if (recMs > lastVisitedMs && best.score === session.score) {
            queue.push({
              type: 'record',
              data: {
                score: session.score,
                discipline: session.discipline,
                sessionType: session.sessionType,
                previousBest: 0,
                telemetry: session.telemetry || [],
              },
            });
          }
        }
      }

      // ── 3. Newly achieved goals since last visit ──
      const goalsSnap = await getDocs(collection(firestoreDb, `users/${user.id}/goals`));
      const allGoals = goalsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      allGoals
        .filter(g => {
          const achievedMs = g.achievedAt?.seconds ? g.achievedAt.seconds * 1000 : 0;
          return achievedMs > lastVisitedMs;
        })
        .forEach(g => {
          const matchingSession = recentSessions.find(s =>
            s.discipline === g.discipline && (s.score || 0) >= g.targetScore
          );
          queue.push({
            type: 'goal',
            data: {
              score: matchingSession?.score || g.targetScore,
              discipline: g.discipline,
              sessionType: matchingSession?.sessionType || 'Training',
              targetScore: g.targetScore,
            },
          });
        });

      if (queue.length > 0) {
        setAchievementQueue(queue);
        setIsProcessingAchievements(true);
      }
    } catch (err) {
      console.error('checkNewAchievements error:', err);
    }
  }, []);

  // Run achievement check exactly once per login session
  useEffect(() => {
    if (!currentUser || achievementCheckedRef.current) return;
    achievementCheckedRef.current = true;
    checkNewAchievements(currentUser);
  }, [currentUser, checkNewAchievements]);

  const loginUser = useCallback((user) => {
    setCurrentUser(user);
    setCookie(user.id);
    setSettingsForm({ firstName: user.firstName || '', lastName: user.lastName || '', email: user.email || '' });
    setZonesForm(user.heartrateZones || DEFAULT_ZONES);
    setPhase('app');
    // Achievement check fires via useEffect once currentUser is in state
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const unsubs = [];
    DISCIPLINES.forEach(d => SESSION_TYPES.forEach(st => {
      const u = UserFactory.subscribeToRecords(currentUser.id, d, st, (rec) => {
        if (rec) setRecords(prev => { const f = prev.filter(r => !(r.discipline === d && r.sessionType === st)); return [...f, { ...rec, discipline: d, sessionType: st }]; });
        else setRecords(prev => prev.filter(r => !(r.discipline === d && r.sessionType === st)));
      });
      unsubs.push(u);
    }));
    const u2 = UserFactory.getGoals(currentUser.id, setGoals);
    const u3 = UserFactory.getSessionHistory(currentUser.id, (data) => setRecentSessions(data.slice(0, 5)));
    const u4 = BadgeFactory.getEarned(currentUser.id, setEarnedBadges);
    return () => { unsubs.forEach(u => u && u()); u2(); u3(); u4(); };
  }, [currentUser]);

  // Detect if user is a coach in any group (for view toggle)
  useEffect(() => {
    if (!currentUser || allClubs.length === 0) return;
    const unsubs = [];
    let foundCoach = false;
    allClubs.forEach(club => {
      const u = GroupFactory.getGroupsByClub(club.id, (groups) => {
        groups.forEach(group => {
          const u2 = GroupFactory.getMembersByGroup(club.id, group.id, (members) => {
            const mine = members.find(m => m.id === currentUser.id);
            if (mine?.isCoach) {
              foundCoach = true;
              setIsCoachInGroup(true);
            }
          });
          unsubs.push(u2);
        });
      });
      unsubs.push(u);
    });
    return () => unsubs.forEach(u => u && u());
  }, [currentUser, allClubs]);

  // Track rejected requests for notification dot
  useEffect(() => {
    if (!currentUser) return;
    const unsub = ClubJoinRequestFactory.getByUser(currentUser.id, (requests) => {
      setNewRejections(requests.filter(r => r.status === 'rejected' && !r.hidden).length);
    });
    return () => unsub();
  }, [currentUser]);

  // HRM → Firebase
  useEffect(() => {
    if (!hrmConnected || !currentUser || heartRate <= 0) return;
    if (heartRate === lastBpmRef.current) return;
    lastBpmRef.current = heartRate;
    LiveSessionFactory.syncHeartbeat(currentUser.id, heartRate, 'online');
  }, [heartRate, hrmConnected, currentUser]);

  const connectBluetooth = async () => {
    try {
      const device = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('heart_rate');
      const characteristic = await service.getCharacteristic('heart_rate_measurement');
      characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', (e) => setHeartRate(parseHeartRate(e.target.value)));
      setHrmDeviceName(device.name || 'HRM Device');
      setHrmConnected(true);
      if (currentUser) {
        const knownId = currentUser.assignedDevice?.deviceId;
        if (device.id && knownId !== device.id) {
          await UserFactory.assignDevice(currentUser.id, device.id, device.name || 'HRM Device');
        }
      }
    } catch (err) { console.error('Bluetooth error:', err); }
  };

  const disconnectHrm = () => {
    setHrmConnected(false);
    setHeartRate(0);
    if (currentUser) LiveSessionFactory.syncHeartbeat(currentUser.id, 0, 'offline');
  };

  const saveSettings = async () => {
    if (!currentUser) return;
    await UserFactory.updateProfile(currentUser.id, { firstName: settingsForm.firstName, lastName: settingsForm.lastName, email: settingsForm.email });
    await UserFactory.updateZones(currentUser.id, zonesForm);
    setCurrentUser(prev => ({ ...prev, ...settingsForm, heartrateZones: zonesForm }));
    setShowSettings(false);
  };

  const handleCreateUser = async () => {
    setNewUserError('');
    if (!newUserForm.firstName.trim() || !newUserForm.lastName.trim()) { setNewUserError('Voornaam en achternaam zijn verplicht.'); return; }
    setNewUserSaving(true);
    try {
      const uid = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await UserFactory.create(uid, { firstName: newUserForm.firstName.trim(), lastName: newUserForm.lastName.trim(), email: newUserForm.email.trim(), role: 'user' });
      const snap = await UserFactory.get(uid);
      if (snap.exists()) loginUser({ id: uid, ...snap.data() });
    } catch (err) { setNewUserError('Er ging iets mis. Probeer opnieuw.'); }
    finally { setNewUserSaving(false); }
  };

  const advanceAchievementQueue = () => {
    setAchievementQueue(prev => {
      const next = prev.slice(1);
      if (next.length === 0) setIsProcessingAchievements(false);
      return next;
    });
  };

  const handleAchievementAccept = async () => {
    const current = achievementQueue[0];
    if (!current || !currentUser) { advanceAchievementQueue(); return; }
    if (current.type === 'record') {
      try {
        await UserFactory.addRecord(currentUser.id, current.data);
      } catch (e) { console.error('Failed to save record:', e); }
    }
    // Badge: already saved automatically, goal: already marked by BadgeFactory — just advance
    advanceAchievementQueue();
  };

  const handleAchievementDecline = () => advanceAchievementQueue();

  const logout = () => {
    clearCookie();
    setCurrentUser(null);
    setHeartRate(0);
    setHrmConnected(false);
    setRecords([]);
    setGoals([]);
    achievementCheckedRef.current = false; // allow re-check on next login
    setPhase('identify');
  };

  const zones = currentUser?.heartrateZones || DEFAULT_ZONES;

  // ── Derived stats ──
  const bestRecord = records.reduce((best, r) => r.score > (best?.score || 0) ? r : best, null);
  const lastSession = recentSessions[0] || null;
  const activeGoals = goals.filter(g => !g.achievedAt);
  const recentBadges = earnedBadges.slice(0, 4);

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (phase === 'loading') return (
    <div style={s.fullCenter}>
      <style>{globalCSS}</style>
      <div style={s.spinner} />
    </div>
  );

  // ─── Create user ───────────────────────────────────────────────────────────
  if (phase === 'createUser') return (
    <div style={s.page}>
      <style>{globalCSS}</style>
      <div style={s.identifyWrap}>
        <button style={{ ...s.backBtn, marginBottom: '24px' }} onClick={() => { setPhase('identify'); setNewUserForm({ firstName: '', lastName: '', email: '' }); setNewUserError(''); }}>
          <ArrowLeft size={16} /> Terug
        </button>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={s.appLogo}><UserPlus size={28} color="#22c55e" /></div>
          <h1 style={s.appTitle}>Nieuw account</h1>
        </div>
        <div style={{ backgroundColor: '#1e293b', borderRadius: '16px', padding: '24px', border: '1px solid #334155' }}>
          <div className="form-grid">
            <div>
              <label style={s.fieldLabel}>Voornaam *</label>
              <input style={s.input} placeholder="bijv. Emma" value={newUserForm.firstName} onChange={e => setNewUserForm({ ...newUserForm, firstName: e.target.value })} onKeyDown={e => e.key === 'Enter' && handleCreateUser()} autoFocus />
            </div>
            <div>
              <label style={s.fieldLabel}>Achternaam *</label>
              <input style={s.input} placeholder="bijv. De Smet" value={newUserForm.lastName} onChange={e => setNewUserForm({ ...newUserForm, lastName: e.target.value })} onKeyDown={e => e.key === 'Enter' && handleCreateUser()} />
            </div>
          </div>
          <div style={{ marginTop: '14px' }}>
            <label style={s.fieldLabel}>E-mailadres (optioneel)</label>
            <input style={s.input} type="email" placeholder="emma@example.com" value={newUserForm.email} onChange={e => setNewUserForm({ ...newUserForm, email: e.target.value })} />
          </div>
          {newUserError && <div style={s.errorBanner}><AlertCircle size={14} /> {newUserError}</div>}
          <button style={{ ...s.primaryBtn, marginTop: '24px', opacity: newUserSaving ? 0.6 : 1 }} onClick={handleCreateUser} disabled={newUserSaving}>
            {newUserSaving ? 'Aanmaken…' : <><UserPlus size={16} /> Account aanmaken</>}
          </button>
        </div>
      </div>
    </div>
  );

  // ─── Identify ──────────────────────────────────────────────────────────────
  if (phase === 'identify') {
    const displayUsers = selectedClubFilter && clubMembers.length > 0 ? clubMembers : allUsers;
    return (
      <div style={s.page}>
        <style>{globalCSS}</style>
        <div style={s.identifyWrap}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={s.appLogo}><Zap size={32} color="#3b82f6" /></div>
            <h1 style={s.appTitle}>MySpeedCoach</h1>
            <p style={{ color: '#64748b', fontSize: '15px', margin: 0 }}>Wie ben jij?</p>
          </div>
          {allClubs.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <label style={s.fieldLabel}><Building2 size={13} style={{ verticalAlign: 'middle', marginRight: '6px' }} />Filter op club</label>
              <select style={s.select} value={selectedClubFilter} onChange={e => setSelectedClubFilter(e.target.value)}>
                <option value="">Alle gebruikers</option>
                {allClubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div className="user-grid">
            {displayUsers.map(u => (
              <button key={u.id} style={s.userTile} onClick={() => loginUser(u)}>
                <div style={s.userAvatar}>{(u.firstName?.[0] || '?')}{(u.lastName?.[0] || '')}</div>
                <div style={s.userTileName}>{u.firstName} {u.lastName}</div>
                <div style={s.userTileRole}>{u.role}</div>
              </button>
            ))}
            <button style={{ ...s.userTile, borderStyle: 'dashed', borderColor: '#22c55e44', backgroundColor: '#0f172a' }} onClick={() => setPhase('createUser')}>
              <div style={{ ...s.userAvatar, backgroundColor: '#0d2818', border: '1px dashed #22c55e' }}><UserPlus size={20} color="#22c55e" /></div>
              <div style={{ ...s.userTileName, color: '#22c55e' }}>Nieuw account</div>
              <div style={s.userTileRole}>aanmaken</div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── App ───────────────────────────────────────────────────────────────────
  // User is eligible for coach view if they have an admin role OR are a coach in any group
  const hasCoachAccess = currentUser?.role === 'clubadmin' || currentUser?.role === 'superadmin' || isCoachInGroup;
  const isCoach = viewMode === 'coach' && hasCoachAccess;

  return (
    <div style={s.page}>
      <style>{globalCSS}</style>

      {isProcessingAchievements && achievementQueue.length > 0 && (
        <CelebrationOverlay
            type={achievementQueue[0].type}
            data={achievementQueue[0].data}
            onAccept={handleAchievementAccept}
            onDecline={handleAchievementDecline}
          />
      )}

      {/* ── HEADER ── */}
      <header style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
          <div style={{ ...s.userAvatar, width: '30px', height: '30px', fontSize: '11px', flexShrink: 0 }}>
            {currentUser.firstName?.[0]}{currentUser.lastName?.[0]}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: '700', fontSize: '15px', color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentUser.firstName} {currentUser.lastName}
            </div>
            {hasCoachAccess && (
              <button
                onClick={() => setViewMode(v => {
                  const next = v === 'coach' ? 'skipper' : 'coach';
                  sessionStorage.setItem('msc_viewmode', next);
                  // Notify _app.js via storage event (same-tab workaround)
                  window.dispatchEvent(new StorageEvent('storage', { key: 'msc_viewmode', newValue: next }));
                  return next;
                })}
                title={viewMode === 'coach' ? 'Overschakelen naar skipper-weergave' : 'Overschakelen naar coach-weergave'}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  marginTop: '2px', padding: '2px 8px', borderRadius: '10px',
                  fontSize: '10px', fontWeight: '700', cursor: 'pointer',
                  border: '1px solid',
                  backgroundColor: viewMode === 'coach' ? '#f59e0b22' : '#3b82f622',
                  borderColor: viewMode === 'coach' ? '#f59e0b55' : '#3b82f655',
                  color: viewMode === 'coach' ? '#f59e0b' : '#60a5fa',
                  textTransform: 'uppercase', letterSpacing: '0.4px',
                  transition: 'all 0.2s',
                }}
              >
                {viewMode === 'coach' ? '⚑ Coach' : '⚐ Skipper'}
                <span style={{ opacity: 0.6, fontSize: '9px' }}>↕</span>
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {/* Rejection notification */}
          {newRejections > 0 && (
            <button onClick={() => setShowMemberships(true)} style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
              <Bell size={18} color="#f59e0b" />
              <span style={{ position: 'absolute', top: '-2px', right: '-2px', backgroundColor: '#ef4444', color: 'white', fontSize: '9px', fontWeight: 'bold', width: '14px', height: '14px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {newRejections}
              </span>
            </button>
          )}

          {/* HRM widget */}
          <HrmHeaderWidget
            connected={hrmConnected}
            bpm={heartRate}
            deviceName={hrmDeviceName}
            zones={zones}
            onConnect={connectBluetooth}
            onDisconnect={disconnectHrm}
          />

          <button style={s.iconBtn} onClick={() => setShowSettings(true)}><Settings size={18} /></button>
          <button style={{ ...s.iconBtn, color: '#ef4444' }} onClick={logout}><LogOut size={18} /></button>
        </div>
      </header>

      {/* ── CONTENT ── */}
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '20px 16px 40px' }}>

        {/* Greeting */}
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#f1f5f9', margin: '0 0 2px' }}>
            Hallo, {currentUser.firstName} 👋
          </h2>
          <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
            {isCoach ? 'Klaar om skippers te begeleiden?' : 'Klaar voor de training?'}
          </p>
        </div>

        {/* Quick stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '24px' }}>
          <StatCard icon={Hash} color="#60a5fa" label="Laatste sessie" value={lastSession?.score} sub={lastSession ? `${DISC_LABELS[lastSession.discipline]} · ${lastSession.sessionType}` : 'Nog geen sessies'} />
          <StatCard icon={Trophy} color="#facc15" label="Beste record" value={bestRecord?.score} sub={bestRecord ? `${DISC_LABELS[bestRecord.discipline]} · ${bestRecord.sessionType}` : 'Nog geen record'} href="/achievements" />
          <StatCard icon={Target} color="#22c55e" label="Actieve doelen" value={activeGoals.length || null} sub={activeGoals.length > 0 ? `${activeGoals[0].discipline} → ${activeGoals[0].targetScore} stps` : 'Geen doelen'} href="/achievements" />
        </div>

        {/* Coach: quick launch dashboard */}
        {isCoach && (
          <a href="/dashboard" style={{ textDecoration: 'none', display: 'block', marginBottom: '20px' }}>
            <div style={{ backgroundColor: '#1e293b', borderRadius: '14px', padding: '16px 20px', border: '1px solid #f59e0b33', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: '#f59e0b22', border: '1px solid #f59e0b44', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Activity size={22} color="#f59e0b" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '700', fontSize: '15px', color: '#f1f5f9' }}>Live Monitoring</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Bekijk alle skippers live op het dashboard</div>
              </div>
              <ArrowRight size={16} color="#f59e0b" />
            </div>
          </a>
        )}

        {/* Recent sessions */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={14} /> Recente sessies
            </div>
            <a href="/history" style={{ fontSize: '12px', color: '#3b82f6', textDecoration: 'none', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
              Alle <ArrowRight size={12} />
            </a>
          </div>
          <RecentSessionsList uid={currentUser.id} />
        </div>

        {/* Recent badges */}
        {recentBadges.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Medal size={14} /> Recent verdiend
              </div>
              <a href="/achievements" style={{ fontSize: '12px', color: '#3b82f6', textDecoration: 'none', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                Alle <ArrowRight size={12} />
              </a>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {recentBadges.map(b => (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#1e293b', borderRadius: '10px', padding: '8px 12px', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '20px' }}>
                    {b.badgeImageUrl ? <img src={b.badgeImageUrl} alt={b.badgeName} style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }} /> : b.badgeEmoji || '🏅'}
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#f1f5f9' }}>{b.badgeName}</div>
                    <div style={{ fontSize: '10px', color: '#475569' }}>
                      {b.earnedAt?.seconds ? new Date(b.earnedAt.seconds * 1000).toLocaleDateString('nl-BE') : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Memberships shortcut */}
        <button
          onClick={() => setShowMemberships(true)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', color: 'white', cursor: 'pointer', textAlign: 'left', position: 'relative' }}
        >
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#2d1d4e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Building2 size={17} color="#a78bfa" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '600', fontSize: '14px', color: '#f1f5f9' }}>Lidmaatschappen</div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>Clubs & groepen beheren</div>
          </div>
          {newRejections > 0 && (
            <span style={{ padding: '2px 8px', borderRadius: '10px', backgroundColor: '#ef444422', color: '#ef4444', fontSize: '11px', fontWeight: '700', border: '1px solid #ef444444' }}>
              {newRejections} melding{newRejections > 1 ? 'en' : ''}
            </span>
          )}
          <ChevronRight size={16} color="#475569" />
        </button>
      </div>

      {/* ── MEMBERSHIPS MODAL ── */}
      {showMemberships && (
        <MembershipsPanel uid={currentUser.id} allClubs={allClubs} onClose={() => setShowMemberships(false)} />
      )}

      {/* ── SETTINGS MODAL ── */}
      {showSettings && (
        <div style={s.modalOverlay}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}><Settings size={18} /> Instellingen</h3>
              <button style={s.iconBtn} onClick={() => setShowSettings(false)}><X size={18} /></button>
            </div>
            <div style={{ marginBottom: '24px' }}>
              <h4 style={s.sectionLabel}>Profiel</h4>
              <div className="form-grid">
                <div>
                  <label style={s.fieldLabel}>Voornaam</label>
                  <input style={s.input} value={settingsForm.firstName} onChange={e => setSettingsForm({ ...settingsForm, firstName: e.target.value })} />
                </div>
                <div>
                  <label style={s.fieldLabel}>Achternaam</label>
                  <input style={s.input} value={settingsForm.lastName} onChange={e => setSettingsForm({ ...settingsForm, lastName: e.target.value })} />
                </div>
              </div>
              <div style={{ marginTop: '12px' }}>
                <label style={s.fieldLabel}>E-mailadres</label>
                <input style={s.input} value={settingsForm.email} onChange={e => setSettingsForm({ ...settingsForm, email: e.target.value })} />
              </div>
            </div>
            <div style={{ marginBottom: '24px' }}>
              <h4 style={s.sectionLabel}>Hartslagzones (BPM)</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {zonesForm.map((zone, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: zone.color, flexShrink: 0 }} />
                    <span style={{ width: '72px', fontSize: '13px', color: '#94a3b8' }}>{zone.name}</span>
                    <input style={{ ...s.input, width: '64px', textAlign: 'center', padding: '8px 4px' }} type="number" value={zone.min} onChange={e => { const z = [...zonesForm]; z[idx].min = parseInt(e.target.value) || 0; setZonesForm(z); }} />
                    <span style={{ color: '#475569', fontSize: '12px' }}>–</span>
                    <input style={{ ...s.input, width: '64px', textAlign: 'center', padding: '8px 4px' }} type="number" value={zone.max} onChange={e => { const z = [...zonesForm]; z[idx].max = parseInt(e.target.value) || 0; setZonesForm(z); }} />
                    <span style={{ color: '#475569', fontSize: '12px' }}>BPM</span>
                  </div>
                ))}
              </div>
            </div>
            <button style={s.primaryBtn} onClick={saveSettings}><Save size={16} /> Opslaan</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Global CSS ───────────────────────────────────────────────────────────────
const globalCSS = `
  * { box-sizing: border-box; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes heartbeat { 0%,100% { transform: scale(1); } 50% { transform: scale(1.2); } }
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes sparkFlyA { 0% { transform:translate(0,0) scale(1); opacity:1; } 100% { transform:translate(-120px,-200px) scale(0); opacity:0; } }
  @keyframes sparkFlyB { 0% { transform:translate(0,0) scale(1); opacity:1; } 100% { transform:translate(80px,-250px) scale(0); opacity:0; } }
  @keyframes sparkFlyC { 0% { transform:translate(0,0) scale(1); opacity:1; } 100% { transform:translate(150px,-180px) scale(0); opacity:0; } }
  @keyframes sparkFlyD { 0% { transform:translate(0,0) scale(1); opacity:1; } 100% { transform:translate(-80px,-220px) scale(0); opacity:0; } }
  @keyframes sparkFlyE { 0% { transform:translate(0,0) scale(1); opacity:1; } 100% { transform:translate(30px,-300px) scale(0); opacity:0; } }
  @keyframes sparkFlyF { 0% { transform:translate(0,0) scale(1); opacity:1; } 100% { transform:translate(-200px,-150px) scale(0); opacity:0; } }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .user-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; }
  @media (max-width: 480px) {
    .form-grid { grid-template-columns: 1fr; }
    .user-grid { grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; }
  }
`;

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  page: { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'system-ui, sans-serif' },
  fullCenter: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#0f172a' },
  spinner: { width: '36px', height: '36px', border: '3px solid #1e293b', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  identifyWrap: { maxWidth: '560px', margin: '0 auto', padding: '40px 16px' },
  backBtn: { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: 0 },
  appLogo: { width: '56px', height: '56px', borderRadius: '16px', backgroundColor: '#1e293b', border: '1px solid #334155', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' },
  appTitle: { fontSize: '28px', fontWeight: '800', margin: '0 0 8px', color: '#f1f5f9' },
  userTile: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '16px 10px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: 'white' },
  userAvatar: { width: '44px', height: '44px', borderRadius: '50%', backgroundColor: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '14px', flexShrink: 0 },
  userTileName: { fontWeight: '600', fontSize: '13px', textAlign: 'center', lineHeight: 1.3 },
  userTileRole: { fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', backgroundColor: '#1e293b', borderBottom: '1px solid #334155', position: 'sticky', top: 0, zIndex: 100 },
  iconBtn: { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' },
  primaryBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px 20px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', width: '100%', fontSize: '14px' },
  errorBanner: { display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#ef444422', color: '#ef4444', fontSize: '13px', padding: '10px 14px', borderRadius: '8px', marginTop: '12px', border: '1px solid #ef444433' },
  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 500 },
  modal: { backgroundColor: '#1e293b', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '560px', border: '1px solid #334155', maxHeight: '92vh', overflowY: 'auto' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', color: '#f1f5f9', fontSize: '16px', fontWeight: '700' },
  fieldLabel: { display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: '600' },
  input: { width: '100%', padding: '11px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '16px', boxSizing: 'border-box' },
  select: { width: '100%', padding: '11px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '16px' },
  sectionLabel: { fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 12px', fontWeight: '700' },
};
