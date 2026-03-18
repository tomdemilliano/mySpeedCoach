import React, { useState, useEffect, useRef } from 'react';
import {
  UserFactory, ClubFactory, GroupFactory,
  ClubJoinRequestFactory, BadgeFactory, ClubMemberFactory,
} from '../constants/dbSchema';
import {
  ShieldAlert, UserPlus, Building2, Users, Trash2, Search,
  Edit2, X, Save, ArrowLeft, Plus, Heart, HeartOff, PlusCircle,
  Calendar, Bell, CheckCircle2, XCircle, Clock, MessageSquare,
  Check, AlertCircle, Award, ChevronRight, Upload, Medal,
} from 'lucide-react';

// ─── Cookie helper ─────────────────────────────────────────────────────────────
const COOKIE_KEY = 'msc_uid';
const getCookieUid = () => {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`));
  return m ? m[1] : null;
};

// ─── URL query helper ─────────────────────────────────────────────────────────
const getQueryParam = (key) => {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(key);
};

// ─── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:  { label: 'In behandeling', color: '#f59e0b', bg: '#f59e0b15' },
  approved: { label: 'Goedgekeurd',    color: '#22c55e', bg: '#22c55e15' },
  rejected: { label: 'Afgewezen',      color: '#ef4444', bg: '#ef444415' },
};

// ─── Badge constants (club-scoped only) ───────────────────────────────────────
const CATEGORY_COLORS = {
  speed: '#f97316', milestone: '#3b82f6', consistency: '#22c55e', skill: '#a78bfa',
};
const CATEGORIES = [
  { value: 'speed',       label: 'Snelheid',     emoji: '⚡' },
  { value: 'milestone',   label: 'Mijlpalen',    emoji: '🎯' },
  { value: 'consistency', label: 'Consistentie', emoji: '🗓️' },
  { value: 'skill',       label: 'Vaardigheid',  emoji: '🌟' },
];
const DISCIPLINES   = ['any', '30sec', '2min', '3min'];
const SESSION_TYPES = ['any', 'Training', 'Wedstrijd'];
const TRIGGER_KINDS = [
  { value: 'score',            label: 'Minimum score (steps)' },
  { value: 'firstSession',     label: 'Eerste sessie van een onderdeel' },
  { value: 'totalSessions',    label: 'Totaal aantal sessies' },
  { value: 'consecutiveWeeks', label: 'Opeenvolgende weken' },
  { value: 'none',             label: 'Geen (manuele badge)' },
];
const EMPTY_BADGE = {
  name: '', description: '', emoji: '🏅', imageUrl: '',
  type: 'automatic', scope: 'club', category: 'skill',
  trigger: null, isActive: true,
};

function detectTriggerKind(trigger) {
  if (!trigger) return 'none';
  if (trigger.firstSession)             return 'firstSession';
  if (trigger.totalSessions != null)    return 'totalSessions';
  if (trigger.consecutiveWeeks != null) return 'consecutiveWeeks';
  if (trigger.minScore != null)         return 'score';
  return 'none';
}
function buildTrigger(kind, vals) {
  const base = { discipline: vals.discipline || 'any', sessionType: vals.sessionType || 'any' };
  if (kind === 'score')            return { ...base, minScore: parseInt(vals.minScore) || 0 };
  if (kind === 'firstSession')     return { ...base, firstSession: true };
  if (kind === 'totalSessions')    return { totalSessions: parseInt(vals.totalSessions) || 0 };
  if (kind === 'consecutiveWeeks') return { consecutiveWeeks: parseInt(vals.consecutiveWeeks) || 0 };
  return null;
}

// ─── Club Badge Form Modal ────────────────────────────────────────────────────
function ClubBadgeFormModal({ badge, clubId, onSave, onClose }) {
  const isEdit = !!badge?.id;
  const [form, setForm] = useState(badge ? { ...EMPTY_BADGE, ...badge, scope: 'club', clubId } : { ...EMPTY_BADGE, scope: 'club', clubId });
  const [triggerKind, setTriggerKind] = useState(detectTriggerKind(badge?.trigger));
  const [tv, setTv] = useState({
    discipline: badge?.trigger?.discipline || 'any', sessionType: badge?.trigger?.sessionType || 'any',
    minScore: badge?.trigger?.minScore ?? '', totalSessions: badge?.trigger?.totalSessions ?? '',
    consecutiveWeeks: badge?.trigger?.consecutiveWeeks ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { alert('Geef de badge een naam.'); return; }
    setSaving(true);
    try {
      await onSave({ ...form, scope: 'club', clubId, trigger: form.type === 'automatic' ? buildTrigger(triggerKind, tv) : null });
      onClose();
    } catch { alert('Opslaan mislukt.'); }
    finally { setSaving(false); }
  };

  return (
    <div style={s.modalOverlay}>
      <div style={{ ...s.modal, maxHeight: '92vh', overflowY: 'auto', borderRadius: '20px' }}>
        <div style={s.modalHeader}>
          <h3 style={{ margin: 0, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Medal size={18} color="#f59e0b" /> {isEdit ? 'Badge bewerken' : 'Nieuwe clubbadge'}
          </h3>
          <button style={s.iconBtn} onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: '10px', marginBottom: '12px' }}>
          <div><label style={s.fieldLabel}>Naam *</label><input style={s.input} value={form.name} onChange={e => set('name', e.target.value)} placeholder="bijv. Club Kampioen" autoFocus /></div>
          <div><label style={s.fieldLabel}>Emoji</label><input style={{ ...s.input, textAlign: 'center', fontSize: '22px' }} value={form.emoji} onChange={e => set('emoji', e.target.value)} maxLength={2} /></div>
        </div>

        <label style={s.fieldLabel}>Omschrijving</label>
        <textarea style={{ ...s.input, resize: 'vertical', minHeight: '60px', marginBottom: '12px', fontFamily: 'inherit' }} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Wat moet de skipper doen om dit te verdienen?" />

        <label style={s.fieldLabel}>Categorie</label>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {CATEGORIES.map(c => (
            <button key={c.value} type="button" onClick={() => set('category', c.value)} style={{ padding: '5px 10px', borderRadius: '14px', border: `1px solid ${form.category === c.value ? CATEGORY_COLORS[c.value] : '#334155'}`, fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', backgroundColor: form.category === c.value ? CATEGORY_COLORS[c.value] + '22' : 'transparent', color: form.category === c.value ? CATEGORY_COLORS[c.value] : '#64748b' }}>
              {c.emoji} {c.label}
            </button>
          ))}
        </div>

        <label style={s.fieldLabel}>Type</label>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
          {['automatic', 'manual'].map(t => (
            <button key={t} type="button" onClick={() => set('type', t)} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: `1px solid ${form.type === t ? '#3b82f6' : '#334155'}`, fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', backgroundColor: form.type === t ? '#3b82f622' : 'transparent', color: form.type === t ? '#60a5fa' : '#64748b' }}>
              {t === 'automatic' ? '🤖 Automatisch' : '👋 Manueel'}
            </button>
          ))}
        </div>

        {form.type === 'automatic' && (
          <div style={{ backgroundColor: '#0f172a', borderRadius: '10px', padding: '12px', marginBottom: '12px', border: '1px solid #1e293b' }}>
            <label style={{ ...s.fieldLabel, marginBottom: '8px' }}>🎯 Trigger</label>
            <select style={{ ...s.input, marginBottom: '10px' }} value={triggerKind} onChange={e => setTriggerKind(e.target.value)}>
              {TRIGGER_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            {triggerKind === 'score' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <div><label style={s.fieldLabel}>Min. steps</label><input type="number" style={s.input} value={tv.minScore} onChange={e => setTv(v => ({ ...v, minScore: e.target.value }))} placeholder="60" /></div>
                <div><label style={s.fieldLabel}>Onderdeel</label><select style={s.input} value={tv.discipline} onChange={e => setTv(v => ({ ...v, discipline: e.target.value }))}>{DISCIPLINES.map(d => <option key={d}>{d}</option>)}</select></div>
                <div><label style={s.fieldLabel}>Sessie type</label><select style={s.input} value={tv.sessionType} onChange={e => setTv(v => ({ ...v, sessionType: e.target.value }))}>{SESSION_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
              </div>
            )}
            {triggerKind === 'firstSession'     && <div><label style={s.fieldLabel}>Onderdeel</label><select style={s.input} value={tv.discipline} onChange={e => setTv(v => ({ ...v, discipline: e.target.value }))}>{DISCIPLINES.filter(d => d !== 'any').map(d => <option key={d}>{d}</option>)}</select></div>}
            {triggerKind === 'totalSessions'    && <div><label style={s.fieldLabel}>Aantal sessies</label><input type="number" style={s.input} value={tv.totalSessions} onChange={e => setTv(v => ({ ...v, totalSessions: e.target.value }))} placeholder="10" /></div>}
            {triggerKind === 'consecutiveWeeks' && <div><label style={s.fieldLabel}>Weken op rij</label><input type="number" style={s.input} value={tv.consecutiveWeeks} onChange={e => setTv(v => ({ ...v, consecutiveWeeks: e.target.value }))} placeholder="5" /></div>}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' }}>
          <input type="checkbox" id="isActiveBadge" checked={form.isActive} onChange={e => set('isActive', e.target.checked)} />
          <label htmlFor="isActiveBadge" style={{ fontSize: '13px', color: '#94a3b8', cursor: 'pointer' }}>Badge is actief</label>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleSave} disabled={saving} style={{ ...bs.primary, flex: 1, justifyContent: 'center' }}><Check size={15} /> {saving ? 'Opslaan…' : 'Opslaan'}</button>
          <button onClick={onClose} style={bs.secondary}><X size={15} /> Annuleren</button>
        </div>
      </div>
    </div>
  );
}

// ─── Award Badge Modal ────────────────────────────────────────────────────────
function AwardBadgeModal({ skipper, awardedByName, clubId, onClose }) {
  const [badges,     setBadges]     = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [note,       setNote]       = useState('');
  const [coachName,  setCoachName]  = useState(awardedByName || 'Coach');
  const [saving,     setSaving]     = useState(false);
  const [done,       setDone]       = useState(false);

  useEffect(() => {
    const u = BadgeFactory.getAll(all => setBadges(
      all.filter(b => b.type === 'manual' && b.isActive && (b.scope === 'global' || b.clubId === clubId))
    ));
    return () => u();
  }, [clubId]);

  const handleAward = async () => {
    if (!selectedId) { alert('Kies een badge.'); return; }
    setSaving(true);
    const badge = badges.find(b => b.id === selectedId);
    try {
      await BadgeFactory.award(skipper.clubId, skipper.memberId, badge, coachName, coachName, null, note);
      setDone(true);
      setTimeout(onClose, 1500);
    } catch (e) { console.error(e); alert('Uitreiken mislukt.'); }
    finally { setSaving(false); }
  };

  const selectedBadge = badges.find(b => b.id === selectedId);

  return (
    <div style={s.modalOverlay}>
      <div style={s.modal}>
        <div style={s.modalHeader}>
          <h3 style={{ margin: 0, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}><Award size={18} color="#f59e0b" /> Badge uitreiken</h3>
          <button style={s.iconBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '14px' }}>Aan: <strong style={{ color: '#f1f5f9' }}>{skipper.firstName} {skipper.lastName}</strong></p>
        {done ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '44px', marginBottom: '10px' }}>🎉</div>
            <p style={{ color: '#22c55e', fontWeight: '700' }}>Badge uitgereikt!</p>
          </div>
        ) : badges.length === 0 ? (
          <p style={{ color: '#475569', fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>Geen manuele badges beschikbaar. Maak badges aan via het "Badges" tabblad.</p>
        ) : (
          <>
            <label style={s.fieldLabel}>Badge</label>
            <select style={{ ...s.input, marginBottom: '12px' }} value={selectedId} onChange={e => setSelectedId(e.target.value)}>
              <option value="">-- Kies badge --</option>
              {badges.map(b => <option key={b.id} value={b.id}>{b.emoji} {b.name}</option>)}
            </select>
            {selectedBadge && (
              <div style={{ backgroundColor: '#0f172a', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px', display: 'flex', gap: '10px', alignItems: 'center', border: '1px solid #1e293b' }}>
                <div style={{ fontSize: '24px', flexShrink: 0 }}>{selectedBadge.emoji}</div>
                <div>
                  <div style={{ fontWeight: '700', color: '#f1f5f9', fontSize: '13px' }}>{selectedBadge.name}</div>
                  <div style={{ color: '#64748b', fontSize: '11px' }}>{selectedBadge.description}</div>
                </div>
              </div>
            )}
            <label style={s.fieldLabel}>Jouw naam</label>
            <input style={{ ...s.input, marginBottom: '12px' }} value={coachName} onChange={e => setCoachName(e.target.value)} placeholder="Naam van de coach" />
            <label style={s.fieldLabel}>Notitie (optioneel)</label>
            <textarea style={{ ...s.input, resize: 'vertical', minHeight: '70px', marginBottom: '16px', fontFamily: 'inherit' }} value={note} onChange={e => setNote(e.target.value)} placeholder="Waarom verdient deze skipper dit?" />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleAward} disabled={saving || !selectedId} style={{ ...bs.primary, flex: 1, justifyContent: 'center' }}><Award size={15} /> {saving ? 'Uitreiken…' : 'Uitreiken'}</button>
              <button onClick={onClose} style={bs.secondary}><X size={15} /> Annuleren</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Membership Edit Modal ────────────────────────────────────────────────────
function MembershipEditModal({ member, groupMember, clubId, groupId, onClose }) {
  const [form, setForm] = useState({
    isSkipper: groupMember.isSkipper ?? true,
    isCoach:   groupMember.isCoach   ?? false,
    startMembership: groupMember.startMembership?.toDate ? groupMember.startMembership.toDate().toISOString().split('T')[0] : '',
    endMembership:   groupMember.endMembership?.toDate   ? groupMember.endMembership.toDate().toISOString().split('T')[0]   : '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await GroupFactory.updateMember(clubId, groupId, groupMember.memberId || groupMember.id, {
        isSkipper: form.isSkipper,
        isCoach:   form.isCoach,
        startMembership: form.startMembership ? new Date(form.startMembership) : null,
        endMembership:   form.endMembership   ? new Date(form.endMembership)   : null,
      });
      onClose();
    } catch { alert('Opslaan mislukt.'); }
    finally { setSaving(false); }
  };

  return (
    <div style={s.modalOverlay}>
      <div style={s.modal}>
        <div style={s.modalHeader}>
          <h3 style={{ margin: 0, fontSize: '15px' }}>Lidmaatschap bewerken</h3>
          <button style={s.iconBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
          <strong style={{ color: '#f1f5f9' }}>{member?.firstName} {member?.lastName}</strong>
        </p>

        <label style={s.fieldLabel}>Rollen</label>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          <button type="button" onClick={() => setForm(f => ({ ...f, isSkipper: !f.isSkipper }))}
            style={{ flex: 1, padding: '10px', borderRadius: '8px', border: `1px solid ${form.isSkipper ? '#3b82f6' : '#334155'}`, fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', backgroundColor: form.isSkipper ? '#3b82f622' : 'transparent', color: form.isSkipper ? '#60a5fa' : '#64748b' }}>
            Skipper {form.isSkipper ? '✓' : ''}
          </button>
          <button type="button" onClick={() => setForm(f => ({ ...f, isCoach: !f.isCoach }))}
            style={{ flex: 1, padding: '10px', borderRadius: '8px', border: `1px solid ${form.isCoach ? '#f59e0b' : '#334155'}`, fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', backgroundColor: form.isCoach ? '#f59e0b22' : 'transparent', color: form.isCoach ? '#fbbf24' : '#64748b' }}>
            Coach {form.isCoach ? '✓' : ''}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
          <div>
            <label style={s.fieldLabel}><Calendar size={11} style={{ display: 'inline', marginRight: '4px' }} />Start</label>
            <input type="date" style={s.input} value={form.startMembership} onChange={e => setForm(f => ({ ...f, startMembership: e.target.value }))} />
          </div>
          <div>
            <label style={s.fieldLabel}><Calendar size={11} style={{ display: 'inline', marginRight: '4px' }} />Einde</label>
            <input type="date" style={s.input} value={form.endMembership} onChange={e => setForm(f => ({ ...f, endMembership: e.target.value }))} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleSave} disabled={saving} style={{ ...bs.primary, flex: 1, justifyContent: 'center' }}><Save size={15} /> {saving ? 'Opslaan…' : 'Opslaan'}</button>
          <button onClick={onClose} style={bs.secondary}><X size={15} /> Annuleren</button>
        </div>
      </div>
    </div>
  );
}

// ─── ClubMember Form Modal ────────────────────────────────────────────────────
function ClubMemberFormModal({ member, clubId, createdByUid, onClose }) {
  const isEdit = !!member?.id;
  const [form, setForm] = useState({
    firstName: member?.firstName || '',
    lastName:  member?.lastName  || '',
    birthDate: member?.birthDate?.seconds ? new Date(member.birthDate.seconds * 1000).toISOString().split('T')[0] : '',
    notes:     member?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const handleSave = async () => {
    setError('');
    if (!form.firstName.trim() || !form.lastName.trim()) { setError('Voornaam en achternaam zijn verplicht.'); return; }
    setSaving(true);
    try {
      const data = { firstName: form.firstName.trim(), lastName: form.lastName.trim(), birthDate: form.birthDate ? new Date(form.birthDate) : null, notes: form.notes.trim() };
      isEdit ? await ClubMemberFactory.update(clubId, member.id, data) : await ClubMemberFactory.create(clubId, data, createdByUid);
      onClose();
    } catch { setError('Opslaan mislukt.'); }
    finally { setSaving(false); }
  };

  return (
    <div style={s.modalOverlay}>
      <div style={s.modal}>
        <div style={s.modalHeader}><h3 style={{ margin: 0, fontSize: '16px' }}>{isEdit ? 'Lid bewerken' : 'Nieuw lid aanmaken'}</h3><button style={s.iconBtn} onClick={onClose}><X size={18} /></button></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
          <div><label style={s.fieldLabel}>Voornaam *</label><input style={s.input} placeholder="Emma" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} autoFocus /></div>
          <div><label style={s.fieldLabel}>Achternaam *</label><input style={s.input} placeholder="De Smet" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
          <div><label style={s.fieldLabel}>Geboortedatum</label><input style={s.input} type="date" value={form.birthDate} onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))} /></div>
          <div><label style={s.fieldLabel}>Notities</label><input style={s.input} placeholder="optioneel" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
        </div>
        {error && <div style={s.errorBanner}><AlertCircle size={13} /> {error}</div>}
        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button onClick={handleSave} disabled={saving} style={{ ...bs.primary, flex: 1, justifyContent: 'center', opacity: saving ? 0.6 : 1 }}><Save size={15} /> {saving ? 'Opslaan…' : isEdit ? 'Wijzigingen opslaan' : 'Lid aanmaken'}</button>
          <button onClick={onClose} style={bs.secondary}><X size={15} /> Annuleren</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function ClubAdmin() {
  // ── Auth / role ────────────────────────────────────────────────────────────
  const [currentUser,  setCurrentUser]  = useState(null);
  const [authLoading,  setAuthLoading]  = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isClubAdmin,  setIsClubAdmin]  = useState(false);

  const [adminClubs, setAdminClubs] = useState([]);
  const [activeClub, setActiveClub] = useState(null);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const [activeTab,     setActiveTab]     = useState('groepen');
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [searchTerm,    setSearchTerm]    = useState('');

  // ── Data ───────────────────────────────────────────────────────────────────
  const [groups,             setGroups]             = useState([]);
  const [memberCounts,       setMemberCounts]       = useState({});
  const [groupMembers,       setGroupMembers]       = useState([]);
  const [clubMemberProfiles, setClubMemberProfiles] = useState([]);
  const [showOnlyActive,     setShowOnlyActive]     = useState(true);
  // Maps groupId -> array of member objects (for all groups, used in Leden tab)
  const [allGroupMemberships, setAllGroupMemberships] = useState({}); // { memberId: [groupName, ...] }

  // Leden tab
  const [ledenSearch,  setLedenSearch]  = useState('');
  const [ledenEditing, setLedenEditing] = useState(null);
  const [ledenForm,    setLedenForm]    = useState(false);
  const [awardTarget,  setAwardTarget]  = useState(null);

  // Membership edit modal
  const [editingMembership, setEditingMembership] = useState(null); // { groupMember, member }

  // Drag & drop
  const [dragMemberId, setDragMemberId] = useState(null);
  const [dragOver,     setDragOver]     = useState(false);

  // Group modals
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroupId,   setEditingGroupId]   = useState(null);
  const [groupForm,        setGroupForm]        = useState({ name: '', useHRM: true });

  // Join requests
  const [joinRequests,       setJoinRequests]       = useState([]);
  const [requestFilter,      setRequestFilter]      = useState('pending');
  const [rejectModalOpen,    setRejectModalOpen]    = useState(false);
  const [rejectingRequestId, setRejectingRequestId] = useState(null);
  const [rejectReason,       setRejectReason]       = useState('');
  const [rejectError,        setRejectError]        = useState('');
  const [rejectSaving,       setRejectSaving]       = useState(false);

  // Club badges
  const [clubBadges,      setClubBadges]      = useState([]);
  const [badgeFormOpen,   setBadgeFormOpen]   = useState(false);
  const [editingBadge,    setEditingBadge]    = useState(null);
  const [badgeFilter,     setBadgeFilter]     = useState('all');

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const uid = getCookieUid();
    if (!uid) { setAuthLoading(false); return; }

    UserFactory.get(uid).then(snap => {
      if (!snap.exists()) { setAuthLoading(false); return; }
      const user = { id: uid, ...snap.data() };
      setCurrentUser(user);
      const role = user.role || 'user';

      if (role === 'superadmin') {
        setIsSuperAdmin(true);
        ClubFactory.getAll(all => { setAdminClubs(all); setAuthLoading(false); });
      } else if (role === 'clubadmin') {
        setIsClubAdmin(true);
        ClubFactory.getAll(allClubs => {
          let found = [];
          let pending = allClubs.length;
          if (pending === 0) { setAdminClubs([]); setAuthLoading(false); return; }
          allClubs.forEach(club => {
            GroupFactory.getGroupsByClub(club.id, groups => {
              let gPending = groups.length;
              if (gPending === 0) { if (--pending === 0) { setAdminClubs(found); setAuthLoading(false); } return; }
              groups.forEach(group => {
                GroupFactory.getMembersByGroup(club.id, group.id, mems => {
                  const isCoach = mems.some(m => (m.memberId || m.id) === uid && m.isCoach);
                  if (isCoach && !found.find(c => c.id === club.id)) found = [...found, club];
                  if (--gPending === 0 && --pending === 0) { setAdminClubs(found); setAuthLoading(false); }
                });
              });
            });
          });
        });
      } else {
        setAuthLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    if (adminClubs.length === 0) return;
    const paramId = getQueryParam('club');
    if (paramId) {
      const match = adminClubs.find(c => c.id === paramId);
      if (match) { setActiveClub(match); return; }
    }
    if (isClubAdmin && adminClubs.length === 1) setActiveClub(adminClubs[0]);
  }, [adminClubs, isClubAdmin]);

  // ── Load groups ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeClub) return;
    setSelectedGroup(null); setGroups([]);
    const u = GroupFactory.getGroupsByClub(activeClub.id, gData => {
      setGroups(gData);
      gData.forEach(g => GroupFactory.getMemberCount(activeClub.id, g.id, count =>
        setMemberCounts(prev => ({ ...prev, [g.id]: count }))
      ));
    });
    return () => u();
  }, [activeClub]);

  // ── Load all group memberships (for "unassigned" view + Leden tab groups) ──
  useEffect(() => {
    if (!activeClub || groups.length === 0) return;
    const memberMap = {}; // memberId -> [{ groupId, groupName }]
    groups.forEach(g => {
      GroupFactory.getMembersByGroup(activeClub.id, g.id, mems => {
        mems.forEach(m => {
          const mid = m.memberId || m.id;
          if (!memberMap[mid]) memberMap[mid] = [];
          if (!memberMap[mid].find(x => x.groupId === g.id)) {
            memberMap[mid] = [...(memberMap[mid] || []), { groupId: g.id, groupName: g.name }];
          }
        });
        setAllGroupMemberships({ ...memberMap });
      });
    });
  }, [activeClub, groups]);

  // ── Load group members ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedGroup || !activeClub) return;
    const u1 = GroupFactory.getMembersByGroup(activeClub.id, selectedGroup.id, setGroupMembers);
    const u2 = ClubMemberFactory.getAll(activeClub.id, setClubMemberProfiles);
    return () => { u1(); u2(); };
  }, [selectedGroup, activeClub]);

  useEffect(() => {
    if (!activeClub || activeTab !== 'leden') return;
    const u = ClubMemberFactory.getAll(activeClub.id, setClubMemberProfiles);
    return () => u();
  }, [activeClub, activeTab]);

  // Load all club members for unassigned view in groepen tab
  useEffect(() => {
    if (!activeClub || activeTab !== 'groepen') return;
    const u = ClubMemberFactory.getAll(activeClub.id, setClubMemberProfiles);
    return () => u();
  }, [activeClub, activeTab]);

  // ── Club badges ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeClub || activeTab !== 'badges') return;
    const u = BadgeFactory.getAll(all => setClubBadges(all.filter(b => b.clubId === activeClub.id)));
    return () => u();
  }, [activeClub, activeTab]);

  // ── Join requests ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeClub) return;
    const u = ClubJoinRequestFactory.getAll(all => {
      const clubReqs = all.filter(r => r.clubId === activeClub.id);
      setJoinRequests([...clubReqs].sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;
        return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
      }));
    });
    return () => u();
  }, [activeClub]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const currentUserName  = currentUser ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() : 'Admin';
  const pendingCount     = joinRequests.filter(r => r.status === 'pending').length;
  const filteredRequests = requestFilter === 'all' ? joinRequests : joinRequests.filter(r => r.status === requestFilter);
  const memberIdsInGroup = new Set(groupMembers.map(m => m.memberId || m.id));

  // All member IDs assigned to ANY group
  const assignedMemberIds = new Set(Object.keys(allGroupMemberships).filter(mid => allGroupMemberships[mid]?.length > 0));
  const unassignedMembers = clubMemberProfiles.filter(p => !assignedMemberIds.has(p.id));

  const availableToAdd    = clubMemberProfiles.filter(p => !memberIdsInGroup.has(p.id));
  const filteredAvailable = availableToAdd.filter(p => `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredLeden     = clubMemberProfiles.filter(m => `${m.firstName} ${m.lastName}`.toLowerCase().includes(ledenSearch.toLowerCase()));
  const getMemberProfile  = (memberId) => clubMemberProfiles.find(p => p.id === memberId) || null;

  const filteredClubBadges = clubBadges.filter(b => {
    if (badgeFilter === 'automatic') return b.type === 'automatic';
    if (badgeFilter === 'manual')    return b.type === 'manual';
    if (badgeFilter === 'inactive')  return !b.isActive;
    return true;
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleGroupSubmit = async (e) => {
    e.preventDefault();
    editingGroupId ? await GroupFactory.update(activeClub.id, editingGroupId, groupForm) : await GroupFactory.create(activeClub.id, groupForm);
    setIsGroupModalOpen(false); setEditingGroupId(null);
  };

  const handleAddMember = async (profileId) => {
    await GroupFactory.addMember(activeClub.id, selectedGroup.id, profileId, { isSkipper: true, isCoach: false, startMembership: new Date(), endMembership: null });
  };

  // Drag drop: drop a member from unassigned panel onto a group card
  const handleDropOnGroup = async (e, group) => {
    e.preventDefault();
    const memberId = e.dataTransfer.getData('memberId');
    if (!memberId) return;
    await GroupFactory.addMember(activeClub.id, group.id, memberId, { isSkipper: true, isCoach: false, startMembership: new Date(), endMembership: null });
    setDragOver(false);
    setDragMemberId(null);
  };

  const handleDeleteLeden = async (member) => {
    if (!confirm(`Lid "${member.firstName} ${member.lastName}" verwijderen? Dit verwijdert ook groepslidmaatschappen en koppelingen.`)) return;
    await ClubMemberFactory.delete(activeClub.id, member.id);
  };

  const handleConfirmReject = async () => {
    if (!rejectReason.trim()) { setRejectError('Een reden is verplicht.'); return; }
    setRejectSaving(true);
    try { await ClubJoinRequestFactory.reject(rejectingRequestId, rejectReason.trim()); setRejectModalOpen(false); setRejectReason(''); setRejectingRequestId(null); }
    catch { setRejectError('Er ging iets mis.'); }
    finally { setRejectSaving(false); }
  };

  const handleBadgeSave = async (data) => {
    if (data.id) { const { id, ...rest } = data; await BadgeFactory.update(id, rest); }
    else await BadgeFactory.create(data);
  };

  const handleBack = () => {
    if (selectedGroup) { setSelectedGroup(null); setGroupMembers([]); setSearchTerm(''); }
    else if (activeClub && (isSuperAdmin || adminClubs.length > 1)) { setActiveClub(null); setGroups([]); }
  };

  const tabs = [
    { key: 'groepen',  label: 'Groepen' },
    { key: 'leden',    label: 'Leden' },
    { key: 'badges',   label: 'Badges' },
    { key: 'badging',  label: 'Badges uitreiken' },
    { key: 'requests', label: 'Aanvragen', badge: pendingCount },
  ];

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (authLoading) return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
      <style>{css}</style><div style={s.spinner} />
      <p style={{ color: '#64748b', fontSize: '14px', fontFamily: 'system-ui,sans-serif' }}>Laden…</p>
    </div>
  );

  if (!isSuperAdmin && !isClubAdmin) return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', fontFamily: 'system-ui,sans-serif' }}>
      <ShieldAlert size={40} color="#ef4444" />
      <p style={{ color: '#ef4444', fontSize: '16px', fontWeight: '700' }}>Geen toegang</p>
      <p style={{ color: '#64748b', fontSize: '13px', textAlign: 'center', maxWidth: '300px' }}>Je hebt geen beheerderrechten voor een club.</p>
      <a href="/" style={{ padding: '10px 20px', backgroundColor: '#3b82f6', color: 'white', borderRadius: '8px', textDecoration: 'none', fontWeight: '600', fontSize: '14px' }}>Terug naar home</a>
    </div>
  );

  if (!activeClub) return (
    <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{css}</style>
      <div style={{ maxWidth: '440px', width: '100%', padding: '24px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <Building2 size={22} color="#a78bfa" />
          <span style={{ fontWeight: '800', fontSize: '18px', color: '#f1f5f9' }}>Club beheren</span>
        </div>
        <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '20px' }}>Kies de club die je wil beheren.</p>
        {adminClubs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#475569' }}>
            <Building2 size={36} color="#334155" style={{ marginBottom: '10px' }} />
            <p style={{ fontSize: '13px' }}>Je bent nog niet gekoppeld aan een club als beheerder.</p>
            {isSuperAdmin && <p style={{ fontSize: '12px', color: '#475569', marginTop: '8px' }}>Maak eerst een club aan via <a href="/superadmin" style={{ color: '#a78bfa' }}>/superadmin</a>.</p>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {adminClubs.map(club => (
              <button key={club.id} onClick={() => setActiveClub(club)} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '14px', color: 'white', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s' }}>
                {club.logoUrl ? <img src={club.logoUrl} style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} alt={club.name} /> : <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Building2 size={20} color="#a78bfa" /></div>}
                <span style={{ fontWeight: '600', fontSize: '15px', flex: 1 }}>{club.name}</span>
                <ChevronRight size={16} color="#475569" />
              </button>
            ))}
          </div>
        )}
        {isSuperAdmin && <a href="/superadmin" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#3b82f6', marginTop: '20px', textDecoration: 'none', fontWeight: '600' }}>← Terug naar SuperAdmin</a>}
      </div>
    </div>
  );

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <style>{css}</style>

      <header style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {(isSuperAdmin || adminClubs.length > 1) && !selectedGroup && (
              <button style={{ ...s.iconBtn, color: '#a78bfa' }} onClick={handleBack} title="Wissel van club"><ArrowLeft size={18} /></button>
            )}
            {activeClub.logoUrl
              ? <img src={activeClub.logoUrl} style={{ width: '28px', height: '28px', borderRadius: '6px', objectFit: 'cover' }} alt={activeClub.name} />
              : <Building2 size={20} color="#a78bfa" />
            }
            <div>
              <span style={s.headerTitle}>{activeClub.name}</span>
              <span style={{ marginLeft: '8px', fontSize: '11px', color: '#475569', fontWeight: '400' }}>Clubbeheer</span>
            </div>
          </div>
          {isSuperAdmin && (
            <a href="/superadmin" style={{ fontSize: '11px', color: '#3b82f6', textDecoration: 'none', fontWeight: '600', padding: '5px 10px', backgroundColor: '#3b82f611', borderRadius: '6px', border: '1px solid #3b82f633' }}>SuperAdmin →</a>
          )}
        </div>
        <div style={s.tabBar}>
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => { setActiveTab(tab.key); setSelectedGroup(null); setSearchTerm(''); }} style={{ ...s.tab, ...(activeTab === tab.key ? s.tabActive : {}) }}>
              {tab.label}
              {tab.badge > 0 && <span style={s.tabBadge}>{tab.badge > 9 ? '9+' : tab.badge}</span>}
            </button>
          ))}
        </div>
      </header>

      <main style={s.content}>

        {/* ═══ GROEPEN ═══ */}
        {activeTab === 'groepen' && (
          <div>
            {selectedGroup && (
              <button style={s.backBtn} onClick={() => { setSelectedGroup(null); setGroupMembers([]); setSearchTerm(''); }}>
                <ArrowLeft size={16} /> Terug naar groepen
              </button>
            )}

            {/* Group list + unassigned panel */}
            {!selectedGroup && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px', alignItems: 'start' }}>
                {/* Left: groups */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <div style={{ fontWeight: '800', fontSize: '16px', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}><Users size={18} color="#3b82f6" /> Groepen</div>
                    <button style={bs.primary} onClick={() => { setEditingGroupId(null); setGroupForm({ name: '', useHRM: true }); setIsGroupModalOpen(true); }}><Plus size={15} /> Nieuwe groep</button>
                  </div>
                  <div className="card-grid">
                    {groups.map(group => (
                      <div
                        key={group.id}
                        style={{ ...s.groupCard, ...(dragOver === group.id ? { borderColor: '#3b82f6', backgroundColor: '#1e3a5f' } : {}) }}
                        onDragOver={e => { e.preventDefault(); setDragOver(group.id); }}
                        onDragLeave={() => setDragOver(null)}
                        onDrop={e => handleDropOnGroup(e, group)}
                      >
                        <div style={{ cursor: 'pointer', flex: 1 }} onClick={() => setSelectedGroup(group)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}><Users size={24} color="#3b82f6" /><span style={{ fontWeight: '700', fontSize: '14px', color: '#f1f5f9' }}>{group.name}</span></div>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={s.countBadge}>{memberCounts[group.id] || 0} leden</span>
                            <span style={{ ...s.hrmBadge, backgroundColor: group.useHRM ? '#065f46' : '#334155' }}>{group.useHRM ? <Heart size={10} fill="white" /> : <HeartOff size={10} />} HRM {group.useHRM ? 'AAN' : 'UIT'}</span>
                          </div>
                          {dragOver === group.id && (
                            <div style={{ marginTop: '8px', fontSize: '11px', color: '#3b82f6', fontWeight: '600' }}>↓ Loslaten om toe te voegen</div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '4px', marginTop: '10px' }}>
                          <button style={s.iconBtn} onClick={() => { setEditingGroupId(group.id); setGroupForm(group); setIsGroupModalOpen(true); }}><Edit2 size={14} /></button>
                          <button style={{ ...s.iconBtn, color: '#ef4444' }} onClick={() => { if (confirm('Groep verwijderen?')) GroupFactory.delete(activeClub.id, group.id); }}><Trash2 size={14} /></button>
                        </div>
                      </div>
                    ))}
                    {groups.length === 0 && <p style={s.emptyText}>Nog geen groepen. Klik op "Nieuwe groep" om te beginnen.</p>}
                  </div>
                </div>

                {/* Right: unassigned members */}
                <div style={{ backgroundColor: '#1e293b', borderRadius: '14px', border: '1px solid #334155', padding: '14px', position: 'sticky', top: '80px' }}>
                  <div style={{ fontWeight: '700', fontSize: '13px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertCircle size={13} color="#f59e0b" /> Niet ingedeeld
                    {unassignedMembers.length > 0 && <span style={{ marginLeft: 'auto', backgroundColor: '#f59e0b22', color: '#f59e0b', fontSize: '10px', fontWeight: '800', padding: '2px 7px', borderRadius: '10px', border: '1px solid #f59e0b44' }}>{unassignedMembers.length}</span>}
                  </div>
                  {unassignedMembers.length === 0 ? (
                    <p style={{ color: '#475569', fontSize: '12px', textAlign: 'center', padding: '16px 0' }}>Alle leden zijn ingedeeld 🎉</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '400px', overflowY: 'auto' }}>
                      <p style={{ fontSize: '11px', color: '#475569', marginBottom: '6px' }}>Sleep een lid naar een groep, of klik op de groep om het manueel toe te voegen.</p>
                      {unassignedMembers.map(p => {
                        const initials = `${p.firstName?.[0] || '?'}${p.lastName?.[0] || ''}`.toUpperCase();
                        return (
                          <div
                            key={p.id}
                            draggable
                            onDragStart={e => { e.dataTransfer.setData('memberId', p.id); setDragMemberId(p.id); }}
                            onDragEnd={() => setDragMemberId(null)}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', backgroundColor: dragMemberId === p.id ? '#0f172a' : '#0f172a', border: `1px solid ${dragMemberId === p.id ? '#3b82f6' : '#1e293b'}`, borderRadius: '8px', cursor: 'grab', userSelect: 'none', opacity: dragMemberId === p.id ? 0.5 : 1, transition: 'all 0.15s' }}
                          >
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#f59e0b22', border: '1px solid #f59e0b44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '10px', color: '#fbbf24', flexShrink: 0 }}>{initials}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '12px', fontWeight: '600', color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.firstName} {p.lastName}</div>
                              {p.birthDate?.seconds && <div style={{ fontSize: '10px', color: '#64748b' }}>{new Date(p.birthDate.seconds * 1000).getFullYear()}</div>}
                            </div>
                            <span style={{ fontSize: '14px', color: '#475569' }}>⠿</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Group detail — compact grid of members */}
            {selectedGroup && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', fontSize: '15px', fontWeight: '700', color: '#f1f5f9' }}>
                  <Users size={18} color="#3b82f6" />
                  <span>{selectedGroup.name}</span>
                  <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '400' }}>— {groupMembers.length} leden</span>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', fontSize: '13px', color: '#94a3b8', cursor: 'pointer', marginBottom: '14px' }}>
                  <input type="checkbox" checked={showOnlyActive} onChange={e => setShowOnlyActive(e.target.checked)} style={{ marginRight: '6px' }} />
                  Alleen actieve leden
                </label>

                {/* Compact member grid */}
                <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden', marginBottom: '24px' }}>
                  {/* Header row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 110px 110px 80px', gap: '0', padding: '8px 14px', backgroundColor: '#0f172a', fontSize: '10px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #334155' }}>
                    <span>Naam</span>
                    <span style={{ textAlign: 'center' }}>Skipper</span>
                    <span style={{ textAlign: 'center' }}>Coach</span>
                    <span>Start</span>
                    <span>Einde</span>
                    <span style={{ textAlign: 'right' }}>Acties</span>
                  </div>
                  {groupMembers
                    .filter(m => {
                      if (!showOnlyActive) return true;
                      const nu    = new Date();
                      const start = m.startMembership?.toDate ? m.startMembership.toDate() : new Date(m.startMembership);
                      const eind  = m.endMembership?.toDate   ? m.endMembership.toDate()   : (m.endMembership ? new Date(m.endMembership) : null);
                      return start <= nu && (!eind || eind > nu);
                    })
                    .map((m, idx) => {
                      const memberId = m.memberId || m.id;
                      const profile  = getMemberProfile(memberId);
                      const initials = profile ? `${profile.firstName?.[0] || '?'}${profile.lastName?.[0] || ''}`.toUpperCase() : '?';
                      const startDate = m.startMembership?.toDate ? m.startMembership.toDate() : null;
                      const endDate   = m.endMembership?.toDate   ? m.endMembership.toDate()   : null;

                      return (
                        <div key={memberId} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 110px 110px 80px', gap: '0', padding: '10px 14px', alignItems: 'center', borderBottom: '1px solid #334155', backgroundColor: idx % 2 === 0 ? 'transparent' : '#0f172a44' }}>
                          {/* Name */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#3b82f622', border: '1px solid #3b82f644', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '10px', color: '#60a5fa', flexShrink: 0 }}>{initials}</div>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: '600', color: '#f1f5f9' }}>
                                {profile ? `${profile.firstName} ${profile.lastName}` : <span style={{ color: '#475569', fontStyle: 'italic' }}>Onbekend</span>}
                              </div>
                              {profile?.birthDate?.seconds && <div style={{ fontSize: '10px', color: '#64748b' }}>{new Date(profile.birthDate.seconds * 1000).toLocaleDateString('nl-BE')}</div>}
                            </div>
                          </div>
                          {/* Skipper */}
                          <div style={{ textAlign: 'center' }}>
                            <button onClick={() => GroupFactory.updateMember(activeClub.id, selectedGroup.id, memberId, { isSkipper: !m.isSkipper })}
                              style={{ width: '26px', height: '26px', borderRadius: '6px', border: `1px solid ${m.isSkipper ? '#3b82f6' : '#334155'}`, backgroundColor: m.isSkipper ? '#3b82f622' : 'transparent', color: m.isSkipper ? '#60a5fa' : '#475569', fontSize: '12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                              {m.isSkipper ? '✓' : '–'}
                            </button>
                          </div>
                          {/* Coach */}
                          <div style={{ textAlign: 'center' }}>
                            <button onClick={() => GroupFactory.updateMember(activeClub.id, selectedGroup.id, memberId, { isCoach: !m.isCoach })}
                              style={{ width: '26px', height: '26px', borderRadius: '6px', border: `1px solid ${m.isCoach ? '#f59e0b' : '#334155'}`, backgroundColor: m.isCoach ? '#f59e0b22' : 'transparent', color: m.isCoach ? '#fbbf24' : '#475569', fontSize: '12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                              {m.isCoach ? '✓' : '–'}
                            </button>
                          </div>
                          {/* Start */}
                          <div style={{ fontSize: '12px', color: '#94a3b8' }}>{startDate ? startDate.toLocaleDateString('nl-BE') : '–'}</div>
                          {/* End */}
                          <div style={{ fontSize: '12px', color: '#94a3b8' }}>{endDate ? endDate.toLocaleDateString('nl-BE') : <span style={{ color: '#475569' }}>Geen</span>}</div>
                          {/* Actions */}
                          <div style={{ display: 'flex', gap: '2px', justifyContent: 'flex-end' }}>
                            <button style={{ ...s.iconBtn, color: '#f59e0b' }} title="Badge uitreiken"
                              onClick={() => setAwardTarget({ clubId: activeClub.id, memberId, firstName: profile?.firstName || '?', lastName: profile?.lastName || '' })}>
                              <Award size={14} />
                            </button>
                            <button style={s.iconBtn} title="Lidmaatschap bewerken"
                              onClick={() => setEditingMembership({ groupMember: m, member: profile, groupId: selectedGroup.id })}>
                              <Edit2 size={14} />
                            </button>
                            <button style={{ ...s.iconBtn, color: '#ef4444' }}
                              onClick={() => { if (confirm('Uit groep verwijderen?')) GroupFactory.removeMember(activeClub.id, selectedGroup.id, memberId); }}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  {groupMembers.length === 0 && (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#475569', fontSize: '13px' }}>Geen leden in deze groep.</div>
                  )}
                </div>

                {/* Member picker */}
                <div style={{ backgroundColor: '#1e293b', borderRadius: '14px', border: '1px solid #334155', padding: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Lid toevoegen aan groep</div>
                  <div style={{ position: 'relative', marginBottom: '10px' }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                    <input placeholder="Zoek bestaand lid…" onChange={e => setSearchTerm(e.target.value)} style={{ ...s.searchInput, paddingLeft: '32px', width: '100%' }} />
                  </div>
                  <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                    {filteredAvailable.length === 0 ? (
                      <p style={{ color: '#475569', fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>Alle leden zitten al in de groep.</p>
                    ) : filteredAvailable.map(p => (
                      <div key={p.id} onClick={() => handleAddMember(p.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #334155', cursor: 'pointer', fontSize: '14px', color: '#f1f5f9' }}>
                        <div>
                          <span>{p.firstName} {p.lastName}</span>
                          {p.birthDate?.seconds && <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '8px' }}>{new Date(p.birthDate.seconds * 1000).toLocaleDateString('nl-BE')}</span>}
                        </div>
                        <PlusCircle size={18} color="#22c55e" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ LEDEN ═══ */}
        {activeTab === 'leden' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ fontWeight: '800', fontSize: '16px', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}><Users size={18} color="#3b82f6" /> Leden</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{clubMemberProfiles.length} leden in {activeClub.name}</div>
              </div>
              <button onClick={() => { setLedenEditing(null); setLedenForm(true); }} style={bs.primary}><UserPlus size={15} /> Nieuw lid</button>
            </div>

            <div style={{ position: 'relative', marginBottom: '14px' }}>
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              <input placeholder="Zoek op naam…" value={ledenSearch} onChange={e => setLedenSearch(e.target.value)} style={{ ...s.searchInput, paddingLeft: '36px', width: '100%' }} />
            </div>

            {filteredLeden.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 0', color: '#475569' }}>
                <Users size={36} color="#334155" style={{ marginBottom: '10px' }} />
                <p style={{ fontSize: '13px' }}>{ledenSearch ? 'Geen leden gevonden.' : 'Nog geen leden. Klik op "Nieuw lid" om te beginnen.'}</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filteredLeden.map(member => {
                  const birthYear  = member.birthDate?.seconds ? new Date(member.birthDate.seconds * 1000).getFullYear() : null;
                  const initials   = `${member.firstName?.[0] || '?'}${member.lastName?.[0] || ''}`.toUpperCase();
                  const memberGroups = allGroupMemberships[member.id] || [];
                  return (
                    <div key={member.id} style={s.memberCard}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#3b82f622', border: '1px solid #3b82f644', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '13px', color: '#60a5fa', flexShrink: 0 }}>{initials}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: '600', fontSize: '14px', color: '#f1f5f9' }}>{member.firstName} {member.lastName}</div>
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                            {birthYear && <span>🎂 {birthYear}</span>}
                            {member.notes && <span style={{ fontStyle: 'italic' }}>{member.notes}</span>}
                          </div>
                          {/* Group memberships */}
                          {memberGroups.length > 0 && (
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '5px' }}>
                              {memberGroups.map(g => (
                                <span key={g.groupId} style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '10px', backgroundColor: '#3b82f611', border: '1px solid #3b82f633', color: '#60a5fa', fontWeight: '600' }}>
                                  {g.groupName}
                                </span>
                              ))}
                            </div>
                          )}
                          {memberGroups.length === 0 && (
                            <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '10px', backgroundColor: '#f59e0b11', border: '1px solid #f59e0b33', color: '#f59e0b', fontWeight: '600', marginTop: '5px', display: 'inline-block' }}>
                              Niet ingedeeld
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                          <button style={{ ...s.iconBtn, color: '#f59e0b' }} title="Badge uitreiken" onClick={() => setAwardTarget({ clubId: activeClub.id, memberId: member.id, firstName: member.firstName, lastName: member.lastName })}><Award size={16} /></button>
                          <button style={s.iconBtn} title="Bewerken" onClick={() => { setLedenEditing(member); setLedenForm(true); }}><Edit2 size={16} /></button>
                          <button style={{ ...s.iconBtn, color: '#ef4444' }} title="Verwijderen" onClick={() => handleDeleteLeden(member)}><Trash2 size={16} /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ BADGES (club) ═══ */}
        {activeTab === 'badges' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ fontWeight: '800', fontSize: '16px', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}><Medal size={18} color="#f59e0b" /> Clubbadges</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{clubBadges.filter(b => b.isActive).length} actief · {clubBadges.length} totaal</div>
              </div>
              <button onClick={() => { setEditingBadge(null); setBadgeFormOpen(true); }} style={bs.primary}><Plus size={15} /> Nieuwe badge</button>
            </div>

            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
              {[['all','Alle'], ['automatic','🤖 Auto'], ['manual','👋 Manueel'], ['inactive','⛔ Inactief']].map(([v, l]) => (
                <button key={v} onClick={() => setBadgeFilter(v)} style={{ padding: '5px 10px', borderRadius: '14px', border: `1px solid ${badgeFilter === v ? '#3b82f6' : '#334155'}`, fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', backgroundColor: badgeFilter === v ? '#3b82f622' : 'transparent', color: badgeFilter === v ? '#60a5fa' : '#64748b' }}>{l}</button>
              ))}
            </div>

            {filteredClubBadges.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 0', color: '#475569' }}>
                <Medal size={36} color="#334155" style={{ marginBottom: '10px' }} />
                <p style={{ fontSize: '13px' }}>Geen badges gevonden. Maak je eerste clubbadge aan!</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
                {filteredClubBadges.map(badge => {
                  const catColor = CATEGORY_COLORS[badge.category] || '#64748b';
                  return (
                    <div key={badge.id} style={{ backgroundColor: '#1e293b', borderRadius: '12px', border: `1px solid ${badge.isActive ? '#334155' : '#1e293b'}`, padding: '14px', opacity: badge.isActive ? 1 : 0.5, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0, backgroundColor: '#0f172a', border: `2px solid ${catColor}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
                          {badge.emoji || '🏅'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: '700', fontSize: '13px', color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{badge.name}</div>
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{badge.description || '—'}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                        <span style={{ padding: '2px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: '600', backgroundColor: catColor + '22', color: catColor, border: `1px solid ${catColor}44` }}>{badge.category}</span>
                        <span style={{ padding: '2px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: '600', backgroundColor: '#3b82f622', color: '#60a5fa', border: '1px solid #3b82f644' }}>{badge.type === 'automatic' ? '🤖 Auto' : '👋 Manueel'}</span>
                      </div>
                      {badge.trigger && badge.type === 'automatic' && (
                        <div style={{ fontSize: '11px', color: '#64748b', backgroundColor: '#0f172a', borderRadius: '6px', padding: '6px 8px' }}>
                          {badge.trigger.minScore != null         && `≥ ${badge.trigger.minScore} steps`}
                          {badge.trigger.firstSession             && `Eerste ${badge.trigger.discipline} sessie`}
                          {badge.trigger.totalSessions != null    && `${badge.trigger.totalSessions} sessies totaal`}
                          {badge.trigger.consecutiveWeeks != null && `${badge.trigger.consecutiveWeeks} weken op rij`}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '6px', marginTop: 'auto' }}>
                        <button onClick={() => { setEditingBadge(badge); setBadgeFormOpen(true); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 8px', backgroundColor: 'transparent', border: 'none', borderRadius: '6px', color: '#64748b', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', flex: 1, justifyContent: 'center' }}><Edit2 size={12} /> Bewerk</button>
                        <button onClick={() => BadgeFactory.update(badge.id, { isActive: !badge.isActive })} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 8px', backgroundColor: 'transparent', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', flex: 1, justifyContent: 'center', color: badge.isActive ? '#f97316' : '#22c55e' }}>{badge.isActive ? '⛔ Deactiveer' : '✅ Activeer'}</button>
                        <button onClick={() => { if (confirm(`Verwijder "${badge.name}"?`)) BadgeFactory.delete(badge.id); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 8px', backgroundColor: 'transparent', border: 'none', borderRadius: '6px', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}><Trash2 size={12} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ BADGES UITREIKEN ═══ */}
        {activeTab === 'badging' && (
          <div>
            <div style={{ fontWeight: '800', fontSize: '16px', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Award size={18} color="#f59e0b" /> Badges uitreiken
            </div>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>Kies een lid om een manuele badge uit te reiken.</p>

            {clubMemberProfiles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 0', color: '#475569' }}>
                <Users size={36} color="#334155" style={{ marginBottom: '10px' }} />
                <p style={{ fontSize: '13px' }}>Voeg eerst leden toe via de "Leden" tab.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {clubMemberProfiles.map(member => {
                  const initials = `${member.firstName?.[0] || '?'}${member.lastName?.[0] || ''}`.toUpperCase();
                  return (
                    <div key={member.id} style={{ ...s.memberCard, display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                      onClick={() => setAwardTarget({ clubId: activeClub.id, memberId: member.id, firstName: member.firstName, lastName: member.lastName })}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#f59e0b22', border: '1px solid #f59e0b44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '13px', color: '#fbbf24', flexShrink: 0 }}>{initials}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600', fontSize: '14px', color: '#f1f5f9' }}>{member.firstName} {member.lastName}</div>
                        {member.notes && <div style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>{member.notes}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f59e0b', fontSize: '12px', fontWeight: '600' }}>
                        <Award size={15} /> Uitreiken
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ AANVRAGEN ═══ */}
        {activeTab === 'requests' && (
          <div>
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '17px', fontWeight: '800', color: '#f1f5f9' }}>Aanvragen — {activeClub.name}</div>
              {pendingCount > 0 && <div style={{ fontSize: '12px', color: '#f59e0b', marginTop: '2px' }}>{pendingCount} openstaande aanvragen</div>}
            </div>
            <div style={s.filterPills}>
              {[
                { key: 'pending',  label: 'In behandeling', count: joinRequests.filter(r => r.status === 'pending').length },
                { key: 'approved', label: 'Goedgekeurd',    count: joinRequests.filter(r => r.status === 'approved').length },
                { key: 'rejected', label: 'Afgewezen',      count: joinRequests.filter(r => r.status === 'rejected').length },
                { key: 'all',      label: 'Alle',           count: joinRequests.length },
              ].map(f => (
                <button key={f.key} onClick={() => setRequestFilter(f.key)} style={{ ...s.filterPill, ...(requestFilter === f.key ? s.filterPillActive : {}) }}>
                  {f.label}{f.count > 0 && <span style={{ ...s.pillCount, backgroundColor: requestFilter === f.key ? '#1e293b' : (f.key === 'pending' ? '#f59e0b' : '#334155'), color: f.key === 'pending' && requestFilter !== f.key ? '#000' : '#94a3b8' }}>{f.count}</span>}
                </button>
              ))}
            </div>
            {filteredRequests.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0' }}><Bell size={36} color="#334155" /><p style={{ color: '#64748b', margin: '12px 0 0', fontSize: '14px' }}>Geen aanvragen gevonden.</p></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filteredRequests.map(req => {
                  const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
                  return (
                    <div key={req.id} style={{ ...s.requestCard, borderColor: req.status === 'pending' ? '#f59e0b44' : '#334155' }}>
                      {req.status === 'pending' && <div style={{ height: '3px', backgroundColor: '#f59e0b', margin: '-16px -16px 14px' }} />}
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <div style={s.requestAvatar}>{(req.firstName?.[0]||'?').toUpperCase()}{(req.lastName?.[0]||'').toUpperCase()}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                            <span style={{ fontWeight: '700', fontSize: '15px', color: '#f1f5f9' }}>{req.firstName} {req.lastName}</span>
                            <span style={{ ...s.statusBadge, backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33` }}>
                              {req.status === 'pending' && <Clock size={10} />}{req.status === 'approved' && <CheckCircle2 size={10} />}{req.status === 'rejected' && <XCircle size={10} />}
                              {cfg.label}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {req.email && <span>{req.email}</span>}
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={11} />{req.createdAt?.seconds ? new Date(req.createdAt.seconds * 1000).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
                          </div>
                        </div>
                        <button style={{ ...s.iconBtn, color: '#64748b', flexShrink: 0 }} onClick={() => { if (confirm('Verwijderen?')) ClubJoinRequestFactory.delete(req.id); }}><Trash2 size={15} /></button>
                      </div>
                      {req.message && <div style={s.requestMessage}><MessageSquare size={11} color="#475569" />"{req.message}"</div>}
                      {req.status === 'rejected' && req.rejectionReason && <div style={s.rejectionReason}><XCircle size={13} style={{ flexShrink: 0 }} /><div><strong>Reden:</strong> {req.rejectionReason}</div></div>}
                      {req.resolvedAt?.seconds && req.status !== 'pending' && <div style={{ fontSize: '11px', color: '#475569', marginTop: '8px' }}>Behandeld op {new Date(req.resolvedAt.seconds * 1000).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' })}</div>}
                      {req.status === 'pending' && (
                        <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
                          <button style={s.approveBtn} onClick={() => ClubJoinRequestFactory.approve(req.id)}><Check size={15} /> Goedkeuren</button>
                          <button style={s.rejectBtn} onClick={() => { setRejectingRequestId(req.id); setRejectReason(''); setRejectError(''); setRejectModalOpen(true); }}><X size={15} /> Afwijzen</button>
                        </div>
                      )}
                      {req.status === 'approved' && (
                        <div style={{ marginTop: '12px', backgroundColor: '#22c55e11', border: '1px solid #22c55e33', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <CheckCircle2 size={13} />Voeg {req.firstName} toe aan een groep via het <strong style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setActiveTab('groepen')}>Groepen</strong> tabblad.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ══ AWARD BADGE MODAL ══ */}
      {awardTarget && <AwardBadgeModal skipper={awardTarget} awardedByName={currentUserName} clubId={activeClub.id} onClose={() => setAwardTarget(null)} />}

      {/* ══ LEDEN FORM MODAL ══ */}
      {ledenForm && (
        <ClubMemberFormModal
          member={ledenEditing}
          clubId={activeClub.id}
          createdByUid={getCookieUid()}
          onClose={() => { setLedenForm(false); setLedenEditing(null); }}
        />
      )}

      {/* ══ MEMBERSHIP EDIT MODAL ══ */}
      {editingMembership && (
        <MembershipEditModal
          member={editingMembership.member}
          groupMember={editingMembership.groupMember}
          clubId={activeClub.id}
          groupId={editingMembership.groupId}
          onClose={() => setEditingMembership(null)}
        />
      )}

      {/* ══ CLUB BADGE FORM MODAL ══ */}
      {badgeFormOpen && (
        <ClubBadgeFormModal
          badge={editingBadge}
          clubId={activeClub.id}
          onSave={handleBadgeSave}
          onClose={() => { setBadgeFormOpen(false); setEditingBadge(null); }}
        />
      )}

      {/* ══ REJECT MODAL ══ */}
      {rejectModalOpen && (
        <div style={s.modalOverlay}><div style={s.modal}>
          <div style={s.modalHeader}><h3 style={{ margin: 0, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}><XCircle size={20} /> Aanvraag afwijzen</h3><button style={s.iconBtn} onClick={() => setRejectModalOpen(false)}><X size={18} /></button></div>
          <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>Geef een duidelijke reden op. De gebruiker zal dit zien.</p>
          <label style={s.fieldLabel}>Reden *</label>
          <textarea autoFocus style={s.textarea} placeholder="bijv. De club accepteert momenteel geen nieuwe leden…" value={rejectReason} onChange={e => { setRejectReason(e.target.value); setRejectError(''); }} />
          {rejectError && <div style={s.errorBanner}><AlertCircle size={13} /> {rejectError}</div>}
          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <button style={{ ...s.rejectBtn, flex: 1, justifyContent: 'center', padding: '12px', opacity: rejectSaving ? 0.6 : 1 }} onClick={handleConfirmReject} disabled={rejectSaving}>{rejectSaving ? 'Opslaan…' : <><XCircle size={15} /> Bevestigen</>}</button>
            <button style={{ ...s.cancelBtn, flex: 1 }} onClick={() => setRejectModalOpen(false)}>Annuleren</button>
          </div>
        </div></div>
      )}

      {/* ══ GROUP MODAL ══ */}
      {isGroupModalOpen && (
        <div style={s.modalOverlay}><div style={s.modal}>
          <div style={s.modalHeader}><h3 style={{ margin: 0, fontSize: '16px' }}>Groep {editingGroupId ? 'bewerken' : 'toevoegen'}</h3><button style={s.iconBtn} onClick={() => setIsGroupModalOpen(false)}><X size={18} /></button></div>
          <form onSubmit={handleGroupSubmit} style={s.form}>
            <label style={s.fieldLabel}>Naam</label>
            <input placeholder="Groep naam" required style={s.input} value={groupForm.name} onChange={e => setGroupForm({ ...groupForm, name: e.target.value })} />
            <label style={s.fieldLabel}>Hartslagmeters (HRM)</label>
            <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid #334155', cursor: 'pointer' }} onClick={() => setGroupForm({ ...groupForm, useHRM: !groupForm.useHRM })}>
              <div style={{ flex: 1, padding: '10px', textAlign: 'center', fontSize: '12px', fontWeight: '700', color: 'white', backgroundColor: groupForm.useHRM ? '#059669' : '#334155' }}>AAN</div>
              <div style={{ flex: 1, padding: '10px', textAlign: 'center', fontSize: '12px', fontWeight: '700', color: 'white', backgroundColor: !groupForm.useHRM ? '#ef4444' : '#334155' }}>UIT</div>
            </div>
            <button type="submit" style={s.saveBtn}><Save size={16} /> Opslaan</button>
          </form>
        </div></div>
      )}
    </div>
  );
}

const bs = {
  primary:   { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' },
  secondary: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '8px', color: '#94a3b8', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' },
  ghost:     { display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 8px', backgroundColor: 'transparent', border: 'none', borderRadius: '6px', color: '#64748b', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' },
};

const css = `
  * { box-sizing: border-box; }
  .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @media (max-width: 700px) {
    .card-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
    .groups-layout { grid-template-columns: 1fr !important; }
  }
  @media (max-width: 400px) { .card-grid { grid-template-columns: 1fr; } }
`;

const s = {
  page: { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'system-ui, sans-serif' },
  spinner: { width: '36px', height: '36px', border: '3px solid #1e293b', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  header: { backgroundColor: '#1e293b', borderBottom: '1px solid #334155', padding: '12px 16px', position: 'sticky', top: 0, zIndex: 100, display: 'flex', flexDirection: 'column', gap: '10px' },
  headerTitle: { fontWeight: '800', fontSize: '16px', color: '#f1f5f9' },
  tabBar: { display: 'flex', gap: '6px', overflowX: 'auto' },
  tab: { padding: '7px 14px', borderRadius: '8px', border: 'none', backgroundColor: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap', position: 'relative' },
  tabActive: { backgroundColor: '#a78bfa', color: 'white' },
  tabBadge: { position: 'absolute', top: '-4px', right: '-4px', backgroundColor: '#ef4444', color: 'white', fontSize: '9px', fontWeight: 'bold', width: '16px', height: '16px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  content: { padding: '16px', maxWidth: '960px', margin: '0 auto' },
  backBtn: { background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: '600', padding: '0 0 14px 0' },
  iconBtn: { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' },
  groupCard: { backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '14px', display: 'flex', flexDirection: 'column', transition: 'border-color 0.15s, background-color 0.15s' },
  countBadge: { fontSize: '10px', padding: '3px 8px', backgroundColor: '#0f172a', borderRadius: '4px', color: '#94a3b8' },
  hrmBadge: { fontSize: '10px', padding: '3px 8px', borderRadius: '4px', color: 'white', display: 'flex', alignItems: 'center', gap: '4px' },
  memberCard: { backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '14px' },
  searchInput: { padding: '10px 10px 10px 34px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#1e293b', color: 'white', fontSize: '14px' },
  emptyText: { color: '#475569', fontSize: '14px', textAlign: 'center', padding: '20px 0' },
  filterPills: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' },
  filterPill: { padding: '6px 12px', borderRadius: '20px', border: '1px solid #334155', backgroundColor: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' },
  filterPillActive: { backgroundColor: '#334155', color: '#f1f5f9', borderColor: '#475569' },
  pillCount: { padding: '1px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold' },
  requestCard: { backgroundColor: '#1e293b', borderRadius: '14px', border: '1px solid', padding: '16px' },
  requestAvatar: { width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#a78bfa22', border: '1px solid #a78bfa44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '14px', color: '#a78bfa', flexShrink: 0 },
  statusBadge: { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700' },
  requestMessage: { marginTop: '10px', backgroundColor: '#0f172a', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: '#94a3b8', fontStyle: 'italic', borderLeft: '3px solid #334155', display: 'flex', alignItems: 'flex-start', gap: '6px' },
  rejectionReason: { marginTop: '10px', backgroundColor: '#ef444411', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#ef4444', borderLeft: '3px solid #ef4444', display: 'flex', alignItems: 'flex-start', gap: '8px' },
  approveBtn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', backgroundColor: '#22c55e', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '700', fontSize: '13px', cursor: 'pointer' },
  rejectBtn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', backgroundColor: '#ef4444', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '700', fontSize: '13px', cursor: 'pointer' },
  saveBtn: { width: '100%', backgroundColor: '#22c55e', border: 'none', color: 'white', padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' },
  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 500 },
  modal: { backgroundColor: '#1e293b', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '560px', border: '1px solid #334155', maxHeight: '90vh', overflowY: 'auto' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', color: '#f1f5f9' },
  form: { display: 'flex', flexDirection: 'column', gap: '10px' },
  fieldLabel: { display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px', fontWeight: '600' },
  input: { width: '100%', padding: '11px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px' },
  textarea: { width: '100%', minHeight: '100px', padding: '12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px', resize: 'vertical', lineHeight: 1.5, boxSizing: 'border-box' },
  cancelBtn: { padding: '12px', backgroundColor: '#475569', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '600', cursor: 'pointer', fontSize: '13px' },
  errorBanner: { display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#ef444422', color: '#ef4444', fontSize: '13px', padding: '10px 12px', borderRadius: '8px', marginTop: '10px', border: '1px solid #ef444433' },
};
