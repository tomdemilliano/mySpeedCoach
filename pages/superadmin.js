import React, { useState, useEffect, useRef } from 'react';
import {
  UserFactory, ClubFactory, ClubJoinRequestFactory, BadgeFactory, UserMemberLinkFactory, ClubMemberFactory,
} from '../constants/dbSchema';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebaseConfig';
import { collection, onSnapshot } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  ShieldAlert, UserPlus, Building2, Trash2, Search, Edit2, X, Save,
  Plus, Bell, CheckCircle2, XCircle, Clock, MessageSquare, Check,
  AlertCircle, Medal, Upload, Calendar, Users, UserX,
} from 'lucide-react';



// ─── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:  { label: 'In behandeling', color: '#f59e0b', bg: '#f59e0b15' },
  approved: { label: 'Goedgekeurd',    color: '#22c55e', bg: '#22c55e15' },
  rejected: { label: 'Afgewezen',      color: '#ef4444', bg: '#ef444415' },
};

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
  type: 'automatic', scope: 'global', clubId: null, category: 'skill',
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

// ─── Image Uploader ───────────────────────────────────────────────────────────
function ImageUploader({ currentUrl, onUploaded }) {
  const fileRef = useRef();
  const [uploading, setUploading] = useState(false);
  const [preview,   setPreview]   = useState(currentUrl || '');
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Alleen afbeeldingen zijn toegestaan.'); return; }
    if (file.size > 2 * 1024 * 1024)    { alert('Afbeelding mag maximaal 2 MB zijn.');   return; }
    setUploading(true);
    try {
      const storage = getStorage();
      const sRef    = storageRef(storage, `badge-images/${Date.now()}_${file.name.replace(/\s+/g, '_')}`);
      await uploadBytes(sRef, file);
      const url = await getDownloadURL(sRef);
      setPreview(url); onUploaded(url);
    } catch { alert('Upload mislukt.'); }
    finally { setUploading(false); }
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
      <div style={{ width: '52px', height: '52px', borderRadius: '50%', backgroundColor: '#0f172a', border: '2px dashed #334155', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
        {preview ? <img src={preview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Medal size={20} color="#475569" />}
      </div>
      <div style={{ flex: 1 }}>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} style={bs.secondary}>
          <Upload size={13} />{uploading ? 'Uploading…' : preview ? 'Vervang' : 'Upload afbeelding'}
        </button>
        {preview && <button type="button" onClick={() => { setPreview(''); onUploaded(''); }} style={{ ...bs.ghost, marginLeft: '6px', color: '#ef4444' }}><X size={12} /> Wis</button>}
        <p style={{ fontSize: '10px', color: '#475569', margin: '4px 0 0' }}>PNG / JPG · max 2 MB</p>
      </div>
    </div>
  );
}

// ─── Badge Form Modal ─────────────────────────────────────────────────────────
function BadgeFormModal({ badge, clubs, onSave, onClose }) {
  const isEdit = !!badge?.id;
  const [form, setForm] = useState(badge ? { ...EMPTY_BADGE, ...badge } : { ...EMPTY_BADGE });
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
    try { await onSave({ ...form, trigger: form.type === 'automatic' ? buildTrigger(triggerKind, tv) : null }); onClose(); }
    catch { alert('Opslaan mislukt.'); }
    finally { setSaving(false); }
  };

  return (
    <div style={s.modalOverlay}>
      <div style={{ ...s.modal, maxHeight: '92vh', overflowY: 'auto', borderRadius: '20px' }}>
        <div style={s.modalHeader}>
          <h3 style={{ margin: 0, fontSize: '16px' }}>{isEdit ? 'Badge bewerken' : 'Nieuwe badge'}</h3>
          <button style={s.iconBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <label style={s.fieldLabel}>Afbeelding (optioneel)</label>
        <ImageUploader currentUrl={form.imageUrl} onUploaded={url => set('imageUrl', url)} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: '10px', marginBottom: '12px' }}>
          <div><label style={s.fieldLabel}>Naam *</label><input style={s.input} value={form.name} onChange={e => set('name', e.target.value)} placeholder="bijv. Haas" /></div>
          <div><label style={s.fieldLabel}>Emoji</label><input style={{ ...s.input, textAlign: 'center', fontSize: '22px' }} value={form.emoji} onChange={e => set('emoji', e.target.value)} maxLength={2} /></div>
        </div>
        <label style={s.fieldLabel}>Omschrijving</label>
        <textarea style={{ ...s.input, resize: 'vertical', minHeight: '60px', marginBottom: '12px', fontFamily: 'inherit' }} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Wat moet de skipper doen om dit te verdienen?" />
        <label style={s.fieldLabel}>Categorie</label>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {CATEGORIES.map(c => (
            <button key={c.value} type="button" onClick={() => set('category', c.value)} style={{ ...bs.toggle, backgroundColor: form.category === c.value ? CATEGORY_COLORS[c.value] + '22' : 'transparent', borderColor: form.category === c.value ? CATEGORY_COLORS[c.value] : '#334155', color: form.category === c.value ? CATEGORY_COLORS[c.value] : '#64748b' }}>{c.emoji} {c.label}</button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
          <div>
            <label style={s.fieldLabel}>Type</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['automatic','manual'].map(t => <button key={t} type="button" onClick={() => set('type', t)} style={{ ...bs.toggle, flex: 1, backgroundColor: form.type === t ? '#3b82f622' : 'transparent', borderColor: form.type === t ? '#3b82f6' : '#334155', color: form.type === t ? '#60a5fa' : '#64748b' }}>{t === 'automatic' ? '🤖 Auto' : '👋 Manueel'}</button>)}
            </div>
          </div>
          <div>
            <label style={s.fieldLabel}>Bereik</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['global','club'].map(sc => <button key={sc} type="button" onClick={() => set('scope', sc)} style={{ ...bs.toggle, flex: 1, backgroundColor: form.scope === sc ? '#3b82f622' : 'transparent', borderColor: form.scope === sc ? '#3b82f6' : '#334155', color: form.scope === sc ? '#60a5fa' : '#64748b' }}>{sc === 'global' ? '🌐 Globaal' : '🏟 Club'}</button>)}
            </div>
          </div>
        </div>
        {form.scope === 'club' && (
          <><label style={s.fieldLabel}>Club</label>
          <select style={{ ...s.input, marginBottom: '12px' }} value={form.clubId || ''} onChange={e => set('clubId', e.target.value || null)}>
            <option value="">-- Kies club --</option>
            {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></>
        )}
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
          <button onClick={handleSave} disabled={saving} style={bs.primary}><Check size={15} /> {saving ? 'Opslaan…' : 'Opslaan'}</button>
          <button onClick={onClose} style={bs.secondary}><X size={15} /> Annuleren</button>
        </div>
      </div>
    </div>
  );
}

// ─── Approve Member Modal ─────────────────────────────────────────────────────
function ApproveMemberModal({ request, clubId, approvedByUid, onClose }) {
  const [mode, setMode]               = useState('new');
  const [existingMembers, setExistingMembers] = useState([]);
  const [memberSearch,    setMemberSearch]    = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState('');

  const [form, setForm] = useState({
    firstName: request.firstName || '',
    lastName:  request.lastName  || '',
    birthDate: '',
    notes: '',
  });

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  useEffect(() => {
    const u = ClubMemberFactory.getAll(clubId, setExistingMembers);
    return () => u();
  }, [clubId]);

  const filteredMembers = existingMembers.filter(m =>
    `${m.firstName} ${m.lastName}`.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const handleConfirm = async () => {
    setError('');
    setSaving(true);
    try {
      let memberId;

      if (mode === 'new') {
        if (!form.firstName.trim() || !form.lastName.trim()) {
          setError('Voornaam en achternaam zijn verplicht.'); setSaving(false); return;
        }
        const docRef = await ClubMemberFactory.create(clubId, {
          firstName: form.firstName.trim(),
          lastName:  form.lastName.trim(),
          birthDate: form.birthDate ? new Date(form.birthDate) : null,
          notes:     form.notes.trim(),
        }, approvedByUid);
        memberId = docRef.id;
      } else {
        if (!selectedMemberId) { setError('Selecteer een bestaand lid.'); setSaving(false); return; }
        memberId = selectedMemberId;
      }

      // Create UserMemberLink with the real memberId
      const { addDoc, collection, serverTimestamp, updateDoc, doc } = await import('firebase/firestore');
      const { db } = await import('../firebaseConfig');
      await addDoc(collection(db, 'userMemberLinks'), {
        uid:           request.uid,
        clubId,
        memberId,
        relationship:  'self',
        canEdit:       false,
        canViewHealth: false,
        createdAt:     serverTimestamp(),
        approvedBy:    approvedByUid || 'admin',
      });

      // Mark request approved
      await updateDoc(doc(db, 'clubJoinRequests', request.id), {
        status: 'approved', rejectionReason: '', resolvedAt: serverTimestamp(),
      });

      onClose();
    } catch (e) {
      console.error(e);
      setError('Opslaan mislukt. Probeer opnieuw.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={s.modalOverlay}>
      <div style={{ ...s.modal, maxHeight: '92vh', overflowY: 'auto', borderRadius: '20px' }}>
        <div style={s.modalHeader}>
          <h3 style={{ margin: 0, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={18} color="#22c55e" /> Aanvraag goedkeuren
          </h3>
          <button style={s.iconBtn} onClick={onClose}><X size={18} /></button>
        </div>

        {/* Requester info */}
        <div style={{ backgroundColor: '#0f172a', borderRadius: '10px', padding: '12px 14px', marginBottom: '18px', display: 'flex', gap: '12px', alignItems: 'center', border: '1px solid #1e293b' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: '#3b82f622', border: '1px solid #3b82f644', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '13px', color: '#60a5fa', flexShrink: 0 }}>
            {(request.firstName?.[0] || '?').toUpperCase()}{(request.lastName?.[0] || '').toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: '700', fontSize: '14px', color: '#f1f5f9' }}>{request.firstName} {request.lastName}</div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>{request.email}</div>
          </div>
        </div>

        {/* Mode picker */}
        <label style={s.fieldLabel}>Koppel aan een lid</label>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
          <button type="button" onClick={() => setMode('new')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: `1px solid ${mode === 'new' ? '#22c55e' : '#334155'}`, fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', backgroundColor: mode === 'new' ? '#22c55e22' : 'transparent', color: mode === 'new' ? '#22c55e' : '#64748b' }}>
            + Nieuw lid aanmaken
          </button>
          <button type="button" onClick={() => setMode('existing')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: `1px solid ${mode === 'existing' ? '#3b82f6' : '#334155'}`, fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', backgroundColor: mode === 'existing' ? '#3b82f622' : 'transparent', color: mode === 'existing' ? '#60a5fa' : '#64748b' }}>
            Bestaand lid koppelen
          </button>
        </div>

        {/* New member form */}
        {mode === 'new' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={s.fieldLabel}>Voornaam *</label>
                <input style={s.input} value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} placeholder="Emma" autoFocus />
              </div>
              <div>
                <label style={s.fieldLabel}>Achternaam *</label>
                <input style={s.input} value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} placeholder="De Smet" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={s.fieldLabel}>Geboortedatum</label>
                <input type="date" style={s.input} value={form.birthDate} onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))} />
              </div>
              <div>
                <label style={s.fieldLabel}>Notities</label>
                <input style={s.input} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="optioneel" />
              </div>
            </div>
          </div>
        )}

        {/* Existing member picker */}
        {mode === 'existing' && (
          <div>
            <div style={{ position: 'relative', marginBottom: '10px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              <input placeholder="Zoek op naam…" value={memberSearch} onChange={e => setMemberSearch(e.target.value)} style={{ ...s.input, paddingLeft: '32px' }} autoFocus />
            </div>
            <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {filteredMembers.length === 0 ? (
                <p style={{ color: '#475569', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>Geen leden gevonden.</p>
              ) : filteredMembers.map(m => (
                <div
                  key={m.id}
                  onClick={() => setSelectedMemberId(m.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${selectedMemberId === m.id ? '#3b82f6' : '#334155'}`, backgroundColor: selectedMemberId === m.id ? '#1e3a5f' : '#0f172a', cursor: 'pointer' }}
                >
                  <div style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: selectedMemberId === m.id ? '#3b82f6' : '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: 'white', flexShrink: 0 }}>
                    {(m.firstName?.[0] || '?').toUpperCase()}{(m.lastName?.[0] || '').toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#f1f5f9' }}>{m.firstName} {m.lastName}</div>
                    {m.birthDate?.seconds && <div style={{ fontSize: '10px', color: '#64748b' }}>{new Date(m.birthDate.seconds * 1000).getFullYear()}</div>}
                  </div>
                  {selectedMemberId === m.id && <Check size={14} color="#3b82f6" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <div style={{ ...s.errorBanner, marginTop: '14px' }}><AlertCircle size={13} /> {error}</div>}

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button onClick={handleConfirm} disabled={saving} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '12px', backgroundColor: '#22c55e', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '700', fontSize: '13px', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            <Check size={15} /> {saving ? 'Opslaan…' : 'Goedkeuren & koppelen'}
          </button>
          <button onClick={onClose} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '12px 16px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '8px', color: '#94a3b8', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>
            <X size={15} /> Annuleren
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function SuperAdmin() {
  const { uid, loading: authLoading } = useAuth();
  const [hasAccess, setHasAccess] = useState(false);
  const [activeTab,   setActiveTab]   = useState('clubs');
  const [searchTerm,  setSearchTerm]  = useState('');

  // Data
  const [users,        setUsers]        = useState([]);
  const [clubs,        setClubs]        = useState([]);
  const [badges,       setBadges]       = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);

  // ── User-club membership map ───────────────────────────────────────────────
  // { uid: [clubId, ...] } — built by scanning all groups via GroupFactory
  const [userClubMap,     setUserClubMap]     = useState({}); // { uid: Set<clubId> }
  const [clubMembersLoading, setClubMembersLoading] = useState(false);

  // User tab filters
  const [userClubFilter, setUserClubFilter] = useState(''); // '' = all, '__none__' = no club, or clubId

  // Modals / editing
  const [editingId,          setEditingId]          = useState(null);
  const [isUserModalOpen,    setIsUserModalOpen]    = useState(false);
  const [isClubModalOpen,    setIsClubModalOpen]    = useState(false);
  const [isBadgeFormOpen,    setIsBadgeFormOpen]    = useState(false);
  const [editingBadge,       setEditingBadge]       = useState(null);
  const [userForm,           setUserForm]           = useState({ firstName: '', lastName: '', email: '', role: 'user' });
  const [clubForm,           setClubForm]           = useState({ name: '', logoUrl: '' });
  const [badgeFilter,        setBadgeFilter]        = useState('all');
  const [seeding,            setSeeding]            = useState(false);
  const [requestFilter,      setRequestFilter]      = useState('pending');
  const [rejectModalOpen,    setRejectModalOpen]    = useState(false);
  const [rejectingRequestId, setRejectingRequestId] = useState(null);
  const [rejectReason,       setRejectReason]       = useState('');
  const [rejectError,        setRejectError]        = useState('');
  const [rejectSaving,       setRejectSaving]       = useState(false);

  // Approve modal
  const [approveModalRequest, setApproveModalRequest] = useState(null); // full request object

  // ── Auth ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading || !uid) { setHasAccess(false); return; }
    UserFactory.get(uid).then(snap => {
      setHasAccess(snap.exists() && snap.data().role === 'superadmin');
    });
  }, [uid, authLoading]);

  // ── Data subscriptions ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasAccess) return;
    const u1 = UserFactory.getAll(setUsers);
    const u2 = ClubFactory.getAll(setClubs);
    const u3 = BadgeFactory.getAll(setBadges);
    const u4 = ClubJoinRequestFactory.getAll(data =>
      setJoinRequests([...data].sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;
        return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
      }))
    );
    return () => { u1(); u2(); u3(); u4(); };
  }, [hasAccess]);

  // ── Build uid → Set<clubId> map via userMemberLinks collection ────────────
  // userMemberLinks documents have { uid, clubId, memberId, relationship }.
  // This is the authoritative source tying an app user (uid) to a club.
  useEffect(() => {
    if (!hasAccess) return;
    setClubMembersLoading(true);
    const unsub = onSnapshot(collection(db, 'userMemberLinks'), (snap) => {
      const map = {}; // uid → Set<clubId>
      snap.docs.forEach(d => {
        const { uid, clubId } = d.data();
        if (!uid || !clubId) return;
        if (!map[uid]) map[uid] = new Set();
        map[uid].add(clubId);
      });
      setUserClubMap(map);
      setClubMembersLoading(false);
    });
    return () => unsub();
  }, [hasAccess]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const pendingCount    = joinRequests.filter(r => r.status === 'pending').length;
  const filteredRequests = requestFilter === 'all' ? joinRequests : joinRequests.filter(r => r.status === requestFilter);
  const filteredBadges  = badges.filter(b => {
    if (badgeFilter === 'global')    return b.scope === 'global';
    if (badgeFilter === 'club')      return b.scope === 'club';
    if (badgeFilter === 'automatic') return b.type === 'automatic';
    if (badgeFilter === 'manual')    return b.type === 'manual';
    if (badgeFilter === 'inactive')  return !b.isActive;
    return true;
  });

  // Users: apply search + club filter
  const filteredUsers = users.filter(u => {
    const matchesSearch = `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    if (!userClubFilter) return true;
    if (userClubFilter === '__none__') {
      const clubsOfUser = userClubMap[u.id];
      return !clubsOfUser || clubsOfUser.size === 0;
    }
    const clubsOfUser = userClubMap[u.id];
    return clubsOfUser && clubsOfUser.has(userClubFilter);
  });

  // Per-user club name tags (for display in the user card)
  const getUserClubNames = (uid) => {
    const clubIds = userClubMap[uid];
    if (!clubIds || clubIds.size === 0) return [];
    return [...clubIds].map(cid => clubs.find(c => c.id === cid)?.name).filter(Boolean);
  };

  // Stats for the filter pills
  const countForClub = (clubId) => {
    if (clubId === '__none__') {
      return users.filter(u => {
        const c = userClubMap[u.id];
        return !c || c.size === 0;
      }).length;
    }
    return users.filter(u => {
      const c = userClubMap[u.id];
      return c && c.has(clubId);
    }).length;
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleUserSubmit  = async (e) => { e.preventDefault(); editingId ? await UserFactory.updateProfile(editingId, userForm) : await UserFactory.create(Date.now().toString(), userForm); setIsUserModalOpen(false); };
  const handleClubSubmit  = async (e) => { e.preventDefault(); editingId ? await ClubFactory.update(editingId, clubForm) : await ClubFactory.create(clubForm); setIsClubModalOpen(false); };
  const handleBadgeSave   = async (data) => { if (data.id) { const { id, ...rest } = data; await BadgeFactory.update(id, rest); } else await BadgeFactory.create(data); };
  const handleBadgeSeed   = async () => { if (!confirm('Standaard badges toevoegen?')) return; setSeeding(true); try { await BadgeFactory.seedDefaults(); } finally { setSeeding(false); } };
  const handleConfirmReject = async () => {
    if (!rejectReason.trim()) { setRejectError('Een reden is verplicht.'); return; }
    setRejectSaving(true);
    try { await ClubJoinRequestFactory.reject(rejectingRequestId, rejectReason.trim()); setRejectModalOpen(false); setRejectReason(''); setRejectingRequestId(null); }
    catch { setRejectError('Er ging iets mis.'); }
    finally { setRejectSaving(false); }
  };

  const tabs = [
    { key: 'clubs',    label: 'Clubs' },
    { key: 'users',    label: 'Gebruikers' },
    { key: 'badges',   label: 'Badges' },
    { key: 'requests', label: 'Aanvragen', badge: pendingCount },
  ];

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (authLoading) return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
      <style>{css}</style><div style={s.spinner} />
      <p style={{ color: '#64748b', fontSize: '14px', fontFamily: 'system-ui,sans-serif' }}>Laden…</p>
    </div>
  );
  if (!hasAccess) return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', fontFamily: 'system-ui,sans-serif' }}>
      <ShieldAlert size={40} color="#ef4444" />
      <p style={{ color: '#ef4444', fontSize: '16px', fontWeight: '700' }}>Geen toegang</p>
      <p style={{ color: '#64748b', fontSize: '13px', textAlign: 'center', maxWidth: '300px' }}>Deze pagina is alleen toegankelijk voor SuperAdmins.</p>
      <a href="/" style={{ padding: '10px 20px', backgroundColor: '#3b82f6', color: 'white', borderRadius: '8px', textDecoration: 'none', fontWeight: '600', fontSize: '14px' }}>Terug naar home</a>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <style>{css}</style>
      <header style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ShieldAlert size={20} color="#3b82f6" />
          <span style={s.headerTitle}>SuperAdmin</span>
          <span style={{ fontSize: '11px', color: '#475569', fontWeight: '500' }}>Applicatiebeheer</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <div style={s.tabBar}>
            {tabs.map(tab => (
              <button key={tab.key} onClick={() => { setActiveTab(tab.key); setSearchTerm(''); }} style={{ ...s.tab, ...(activeTab === tab.key ? s.tabActive : {}) }}>
                {tab.label}
                {tab.badge > 0 && <span style={s.tabBadge}>{tab.badge > 9 ? '9+' : tab.badge}</span>}
              </button>
            ))}
          </div>
          <a href="/clubadmin" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#a78bfa', textDecoration: 'none', fontWeight: '600', padding: '6px 10px', backgroundColor: '#a78bfa15', borderRadius: '8px', border: '1px solid #a78bfa33', whiteSpace: 'nowrap' }}>
            🏟 Club beheren →
          </a>
        </div>
      </header>

      <main style={s.content}>

        {/* ═══ CLUBS ═══ */}
        {activeTab === 'clubs' && (
          <div>
            <div style={s.actionBar}>
              <div style={s.searchWrap}><Search size={16} style={s.searchIcon} /><input placeholder="Zoek club…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={s.searchInput} /></div>
              <button style={s.addBtn} onClick={() => { setEditingId(null); setClubForm({ name: '', logoUrl: '' }); setIsClubModalOpen(true); }}><Building2 size={16} /><span className="btn-label"> Nieuwe club</span></button>
            </div>
            <div className="card-grid">
              {clubs.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase())).map(club => (
                <div key={club.id} style={s.clubCard}>
                  <div style={s.clubCardBody}>
                    {club.logoUrl ? <img src={club.logoUrl} style={s.clubLogo} alt={club.name} /> : <div style={s.clubLogoPlaceholder}><Building2 size={32} color="#64748b" /></div>}
                    <div style={s.clubCardName}>{club.name}</div>
                    <a href={`/clubadmin?club=${club.id}`} style={{ fontSize: '11px', color: '#a78bfa', marginTop: '4px', display: 'inline-block' }}>Beheer groepen & leden →</a>
                  </div>
                  <div style={s.clubCardActions}>
                    <button style={s.iconBtn} onClick={() => { setEditingId(club.id); setClubForm(club); setIsClubModalOpen(true); }}><Edit2 size={14} /></button>
                    <button style={{ ...s.iconBtn, color: '#ef4444' }} onClick={() => { if (confirm('Club verwijderen?')) ClubFactory.delete(club.id); }}><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
              {clubs.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && <p style={s.emptyText}>Geen clubs gevonden.</p>}
            </div>
          </div>
        )}

        {/* ═══ USERS ═══ */}
        {activeTab === 'users' && (
          <div>
            {/* Search + Add button */}
            <div style={s.actionBar}>
              <div style={s.searchWrap}>
                <Search size={16} style={s.searchIcon} />
                <input placeholder="Zoek gebruiker…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={s.searchInput} />
              </div>
              <button style={s.addBtn} onClick={() => { setEditingId(null); setUserForm({ firstName: '', lastName: '', email: '', role: 'user' }); setIsUserModalOpen(true); }}>
                <UserPlus size={16} /><span className="btn-label"> Nieuwe gebruiker</span>
              </button>
            </div>

            {/* Club filter pills */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', color: '#475569', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Building2 size={11} /> Filter op club
                {clubMembersLoading && <span style={{ fontSize: '10px', color: '#475569', fontWeight: '400' }}>— laden…</span>}
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {/* All */}
                <button
                  onClick={() => setUserClubFilter('')}
                  style={{
                    ...s.filterPill,
                    ...(userClubFilter === '' ? s.filterPillActive : {}),
                  }}
                >
                  <Users size={11} /> Alle
                  <span style={{ ...s.pillCount, backgroundColor: userClubFilter === '' ? '#1e293b' : '#334155', color: '#94a3b8' }}>{users.length}</span>
                </button>

                {/* Per club */}
                {clubs.map(club => {
                  const count = countForClub(club.id);
                  const isActive = userClubFilter === club.id;
                  return (
                    <button
                      key={club.id}
                      onClick={() => setUserClubFilter(club.id)}
                      style={{
                        ...s.filterPill,
                        ...(isActive ? s.filterPillActive : {}),
                      }}
                    >
                      {club.logoUrl
                        ? <img src={club.logoUrl} alt="" style={{ width: '12px', height: '12px', borderRadius: '2px', objectFit: 'cover' }} />
                        : <Building2 size={11} />
                      }
                      {club.name}
                      <span style={{ ...s.pillCount, backgroundColor: isActive ? '#1e293b' : '#334155', color: '#94a3b8' }}>{count}</span>
                    </button>
                  );
                })}

                {/* No club */}
                <button
                  onClick={() => setUserClubFilter('__none__')}
                  style={{
                    ...s.filterPill,
                    ...(userClubFilter === '__none__' ? { ...s.filterPillActive, borderColor: '#f59e0b', color: '#f59e0b' } : {}),
                  }}
                >
                  <UserX size={11} /> Geen club
                  <span style={{ ...s.pillCount, backgroundColor: userClubFilter === '__none__' ? '#1e293b' : '#f59e0b22', color: userClubFilter === '__none__' ? '#94a3b8' : '#f59e0b' }}>
                    {countForClub('__none__')}
                  </span>
                </button>
              </div>
            </div>

            {/* Result count */}
            <div style={{ fontSize: '12px', color: '#475569', marginBottom: '12px' }}>
              {filteredUsers.length} gebruiker{filteredUsers.length !== 1 ? 's' : ''} gevonden
              {userClubFilter && userClubFilter !== '__none__' && (
                <span style={{ color: '#a78bfa', marginLeft: '6px' }}>
                  in {clubs.find(c => c.id === userClubFilter)?.name}
                </span>
              )}
              {userClubFilter === '__none__' && (
                <span style={{ color: '#f59e0b', marginLeft: '6px' }}>zonder clublidmaatschap</span>
              )}
            </div>

            {/* User list */}
            <div className="user-list">
              {filteredUsers.map(user => {
                const clubNames = getUserClubNames(user.id);
                return (
                  <div key={user.id} style={s.userCard}>
                    <div style={{ ...s.userCardAvatar, backgroundColor: getRoleColor(user.role) }}>
                      {(user.firstName?.[0] || '?').toUpperCase()}{(user.lastName?.[0] || '').toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={s.userCardName}>{user.firstName} {user.lastName}</div>
                      <div style={s.userCardEmail}>{user.email}</div>
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '5px', alignItems: 'center' }}>
                        <span style={{ ...s.roleBadge, backgroundColor: getRoleColor(user.role) }}>{user.role}</span>
                        {clubNames.length > 0 ? (
                          clubNames.map(name => (
                            <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: '600', backgroundColor: '#3b82f611', color: '#60a5fa', border: '1px solid #3b82f633' }}>
                              <Building2 size={9} /> {name}
                            </span>
                          ))
                        ) : (
                          !clubMembersLoading && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: '600', backgroundColor: '#f59e0b11', color: '#f59e0b', border: '1px solid #f59e0b33' }}>
                              <UserX size={9} /> Geen club
                            </span>
                          )
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                      <button style={s.iconBtn} onClick={() => { setEditingId(user.id); setUserForm(user); setIsUserModalOpen(true); }}><Edit2 size={16} /></button>
                      <button style={{ ...s.iconBtn, color: '#ef4444' }} onClick={() => { if (confirm('Gebruiker wissen?')) UserFactory.delete(user.id); }}><Trash2 size={16} /></button>
                    </div>
                  </div>
                );
              })}
              {filteredUsers.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#475569' }}>
                  <Users size={32} color="#334155" style={{ marginBottom: '10px' }} />
                  <p style={{ fontSize: '13px', margin: 0 }}>Geen gebruikers gevonden voor deze filter.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ BADGES ═══ */}
        {activeTab === 'badges' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '800', fontSize: '16px', color: '#f1f5f9' }}><Medal size={18} color="#f59e0b" /> Badges beheren</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{badges.filter(b => b.isActive).length} actief · {badges.length} totaal</div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {badges.length === 0 && <button onClick={handleBadgeSeed} disabled={seeding} style={bs.secondary}>{seeding ? '⏳ Laden…' : '🌱 Standaard badges'}</button>}
                <button onClick={() => { setEditingBadge(null); setIsBadgeFormOpen(true); }} style={bs.primary}><Plus size={15} /> Nieuwe badge</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
              {[['all','Alle'],['global','🌐 Globaal'],['club','🏟 Club'],['automatic','🤖 Auto'],['manual','👋 Manueel'],['inactive','⛔ Inactief']].map(([v,l]) => (
                <button key={v} onClick={() => setBadgeFilter(v)} style={{ ...bs.toggle, backgroundColor: badgeFilter === v ? '#3b82f622' : 'transparent', borderColor: badgeFilter === v ? '#3b82f6' : '#334155', color: badgeFilter === v ? '#60a5fa' : '#64748b' }}>{l}</button>
              ))}
            </div>
            {filteredBadges.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 0', color: '#475569' }}>
                <Medal size={36} color="#334155" style={{ marginBottom: '10px' }} />
                <p style={{ fontSize: '13px' }}>Geen badges gevonden.</p>
                {badges.length === 0 && <button onClick={handleBadgeSeed} style={{ ...bs.secondary, margin: '12px auto' }}>🌱 Laad standaard badges</button>}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
                {filteredBadges.map(badge => {
                  const catColor = CATEGORY_COLORS[badge.category] || '#64748b';
                  const club = badge.clubId ? clubs.find(c => c.id === badge.clubId) : null;
                  return (
                    <div key={badge.id} style={{ backgroundColor: '#1e293b', borderRadius: '12px', border: `1px solid ${badge.isActive ? '#334155' : '#1e293b'}`, padding: '14px', opacity: badge.isActive ? 1 : 0.5, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0, backgroundColor: '#0f172a', border: `2px solid ${catColor}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', overflow: 'hidden' }}>
                          {badge.imageUrl ? <img src={badge.imageUrl} alt={badge.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : badge.emoji || '🏅'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: '700', fontSize: '13px', color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{badge.name}</div>
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{badge.description || '—'}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                        <span style={{ padding: '2px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: '600', backgroundColor: catColor + '22', color: catColor, border: `1px solid ${catColor}44` }}>{badge.category}</span>
                        <span style={{ padding: '2px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: '600', backgroundColor: '#3b82f622', color: '#60a5fa', border: '1px solid #3b82f644' }}>{badge.type === 'automatic' ? '🤖 Auto' : '👋 Manueel'}</span>
                        <span style={{ padding: '2px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: '600', backgroundColor: '#1e293b', color: '#94a3b8', border: '1px solid #334155' }}>{badge.scope === 'global' ? '🌐 Globaal' : `🏟 ${club?.name || 'Club'}`}</span>
                      </div>
                      {badge.trigger && badge.type === 'automatic' && (
                        <div style={{ fontSize: '11px', color: '#64748b', backgroundColor: '#0f172a', borderRadius: '6px', padding: '6px 8px' }}>
                          {badge.trigger.minScore != null         && `≥ ${badge.trigger.minScore} steps`}
                          {badge.trigger.firstSession             && `Eerste ${badge.trigger.discipline} sessie`}
                          {badge.trigger.totalSessions != null    && `${badge.trigger.totalSessions} sessies totaal`}
                          {badge.trigger.consecutiveWeeks != null && `${badge.trigger.consecutiveWeeks} weken op rij`}
                          {badge.trigger.discipline && badge.trigger.discipline !== 'any' && badge.trigger.minScore != null && ` · ${badge.trigger.discipline}`}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '6px', marginTop: 'auto' }}>
                        <button onClick={() => { setEditingBadge(badge); setIsBadgeFormOpen(true); }} style={{ ...bs.ghost, flex: 1, justifyContent: 'center' }}><Edit2 size={12} /> Bewerk</button>
                        <button onClick={() => BadgeFactory.update(badge.id, { isActive: !badge.isActive })} style={{ ...bs.ghost, flex: 1, justifyContent: 'center', color: badge.isActive ? '#f97316' : '#22c55e' }}>{badge.isActive ? '⛔ Deactiveer' : '✅ Activeer'}</button>
                        <button onClick={() => { if (confirm(`Verwijder "${badge.name}"?`)) BadgeFactory.delete(badge.id); }} style={{ ...bs.ghost, color: '#ef4444' }}><Trash2 size={12} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ JOIN REQUESTS ═══ */}
        {activeTab === 'requests' && (
          <div>
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '17px', fontWeight: '800', color: '#f1f5f9' }}>Alle aanvragen</div>
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
                        <div style={s.requestAvatar}>{(req.firstName?.[0] || '?').toUpperCase()}{(req.lastName?.[0] || '').toUpperCase()}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                            <span style={{ fontWeight: '700', fontSize: '15px', color: '#f1f5f9' }}>{req.firstName} {req.lastName}</span>
                            <span style={{ ...s.statusBadge, backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33` }}>
                              {req.status === 'pending' && <Clock size={10} />}{req.status === 'approved' && <CheckCircle2 size={10} />}{req.status === 'rejected' && <XCircle size={10} />}
                              {cfg.label}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Building2 size={11} /> {req.clubName}</span>
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
                          <button style={s.approveBtn} onClick={() => setApproveModalRequest(req)}><Check size={15} /> Goedkeuren</button>
                          <button style={s.rejectBtn} onClick={() => { setRejectingRequestId(req.id); setRejectReason(''); setRejectError(''); setRejectModalOpen(true); }}><X size={15} /> Afwijzen</button>
                        </div>
                      )}
                      {req.status === 'approved' && (
                        <div style={{ marginTop: '12px', backgroundColor: '#22c55e11', border: '1px solid #22c55e33', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <CheckCircle2 size={13} />Voeg {req.firstName} toe via <a href={`/clubadmin?club=${req.clubId}`} style={{ color: '#22c55e', fontWeight: '700' }}>Club beheren</a>.
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

      {/* ══ APPROVE MEMBER MODAL ══ */}
      {approveModalRequest && (
        <ApproveMemberModal
          request={approveModalRequest}
          clubId={approveModalRequest.clubId}
          approvedByUid={uid}
          onClose={() => setApproveModalRequest(null)}
        />
      )}

      {/* ══ BADGE FORM MODAL ══ */}
      {isBadgeFormOpen && <BadgeFormModal badge={editingBadge} clubs={clubs} onSave={handleBadgeSave} onClose={() => { setIsBadgeFormOpen(false); setEditingBadge(null); }} />}

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

      {/* ══ USER MODAL ══ */}
      {isUserModalOpen && (
        <div style={s.modalOverlay}><div style={s.modal}>
          <div style={s.modalHeader}><h3 style={{ margin: 0, fontSize: '16px' }}>Gebruiker {editingId ? 'bewerken' : 'toevoegen'}</h3><button style={s.iconBtn} onClick={() => setIsUserModalOpen(false)}><X size={18} /></button></div>
          <form onSubmit={handleUserSubmit} style={s.form}>
            <label style={s.fieldLabel}>Voornaam</label><input placeholder="Voornaam" required style={s.input} value={userForm.firstName} onChange={e => setUserForm({ ...userForm, firstName: e.target.value })} />
            <label style={s.fieldLabel}>Achternaam</label><input placeholder="Achternaam" required style={s.input} value={userForm.lastName} onChange={e => setUserForm({ ...userForm, lastName: e.target.value })} />
            <label style={s.fieldLabel}>Email</label><input placeholder="Email" style={s.input} value={userForm.email} onChange={e => setUserForm({ ...userForm, email: e.target.value })} />
            <label style={s.fieldLabel}>Rol</label>
            <select style={s.input} value={userForm.role} onChange={e => setUserForm({ ...userForm, role: e.target.value })}>
              <option value="user">User</option><option value="clubadmin">ClubAdmin</option><option value="superadmin">SuperAdmin</option>
            </select>
            <button type="submit" style={s.saveBtn}><Save size={16} /> Opslaan</button>
          </form>
        </div></div>
      )}

      {/* ══ CLUB MODAL ══ */}
      {isClubModalOpen && (
        <div style={s.modalOverlay}><div style={s.modal}>
          <div style={s.modalHeader}><h3 style={{ margin: 0, fontSize: '16px' }}>Club {editingId ? 'bewerken' : 'toevoegen'}</h3><button style={s.iconBtn} onClick={() => setIsClubModalOpen(false)}><X size={18} /></button></div>
          <form onSubmit={handleClubSubmit} style={s.form}>
            <label style={s.fieldLabel}>Naam</label><input placeholder="Club naam" required style={s.input} value={clubForm.name} onChange={e => setClubForm({ ...clubForm, name: e.target.value })} />
            <label style={s.fieldLabel}>Logo URL</label><input placeholder="https://…" style={s.input} value={clubForm.logoUrl} onChange={e => setClubForm({ ...clubForm, logoUrl: e.target.value })} />
            <button type="submit" style={s.saveBtn}><Save size={16} /> Opslaan</button>
          </form>
        </div></div>
      )}
    </div>
  );
}

const getRoleColor = r => r === 'superadmin' ? '#ef4444' : r === 'clubadmin' ? '#f59e0b' : '#3b82f6';

const bs = {
  primary:   { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' },
  secondary: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '8px', color: '#94a3b8', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' },
  ghost:     { display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 8px', backgroundColor: 'transparent', border: 'none', borderRadius: '6px', color: '#64748b', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' },
  toggle:    { padding: '5px 10px', borderRadius: '14px', border: '1px solid', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' },
};

const css = `
  * { box-sizing: border-box; }
  .btn-label { display: inline; }
  .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; }
  .user-list { display: flex; flex-direction: column; gap: 10px; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @media (max-width: 600px) { .btn-label { display: none; } .card-grid { grid-template-columns: 1fr 1fr; gap: 10px; } }
  @media (max-width: 400px) { .card-grid { grid-template-columns: 1fr; } }
`;

const s = {
  page: { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'system-ui, sans-serif' },
  spinner: { width: '36px', height: '36px', border: '3px solid #1e293b', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  header: { backgroundColor: '#1e293b', borderBottom: '1px solid #334155', padding: '12px 16px', position: 'sticky', top: 0, zIndex: 100, display: 'flex', flexDirection: 'column', gap: '10px' },
  headerTitle: { fontWeight: '800', fontSize: '16px', color: '#f1f5f9' },
  tabBar: { display: 'flex', gap: '6px', overflowX: 'auto' },
  tab: { padding: '7px 14px', borderRadius: '8px', border: 'none', backgroundColor: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap', position: 'relative' },
  tabActive: { backgroundColor: '#3b82f6', color: 'white' },
  tabBadge: { position: 'absolute', top: '-4px', right: '-4px', backgroundColor: '#ef4444', color: 'white', fontSize: '9px', fontWeight: 'bold', width: '16px', height: '16px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  content: { padding: '16px', maxWidth: '900px', margin: '0 auto' },
  actionBar: { display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center' },
  searchWrap: { position: 'relative', flex: 1 },
  searchIcon: { position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' },
  searchInput: { width: '100%', padding: '10px 10px 10px 34px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#1e293b', color: 'white', fontSize: '14px' },
  addBtn: { display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 14px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', fontWeight: '600', fontSize: '13px', whiteSpace: 'nowrap', flexShrink: 0 },
  iconBtn: { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' },
  userCard: { backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px' },
  userCardAvatar: { width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '14px', flexShrink: 0, color: 'white' },
  userCardName: { fontWeight: '600', fontSize: '14px', color: '#f1f5f9', marginBottom: '2px' },
  userCardEmail: { fontSize: '12px', color: '#64748b', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  roleBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', color: 'white' },
  clubCard: { backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' },
  clubCardBody: { padding: '16px', textAlign: 'center' },
  clubLogo: { width: '60px', height: '60px', borderRadius: '10px', objectFit: 'cover', marginBottom: '10px' },
  clubLogoPlaceholder: { width: '60px', height: '60px', borderRadius: '10px', backgroundColor: '#0f172a', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  clubCardName: { fontWeight: '700', fontSize: '14px', color: '#f1f5f9' },
  clubCardActions: { display: 'flex', justifyContent: 'center', gap: '4px', padding: '8px', borderTop: '1px solid #334155' },
  emptyText: { color: '#475569', fontSize: '14px', textAlign: 'center', padding: '20px 0' },
  filterPills: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' },
  filterPill: { padding: '6px 12px', borderRadius: '20px', border: '1px solid #334155', backgroundColor: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' },
  filterPillActive: { backgroundColor: '#334155', color: '#f1f5f9', borderColor: '#475569' },
  pillCount: { padding: '1px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold' },
  requestCard: { backgroundColor: '#1e293b', borderRadius: '14px', border: '1px solid', padding: '16px' },
  requestAvatar: { width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#3b82f622', border: '1px solid #3b82f644', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '14px', color: '#3b82f6', flexShrink: 0 },
  statusBadge: { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700' },
  requestMessage: { marginTop: '10px', backgroundColor: '#0f172a', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: '#94a3b8', fontStyle: 'italic', borderLeft: '3px solid #334155', display: 'flex', alignItems: 'flex-start', gap: '6px' },
  rejectionReason: { marginTop: '10px', backgroundColor: '#ef444411', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#ef4444', borderLeft: '3px solid #ef4444', display: 'flex', alignItems: 'flex-start', gap: '8px' },
  approveBtn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', backgroundColor: '#22c55e', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '700', fontSize: '13px', cursor: 'pointer' },
  rejectBtn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', backgroundColor: '#ef4444', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '700', fontSize: '13px', cursor: 'pointer' },
  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 500 },
  modal: { backgroundColor: '#1e293b', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '560px', border: '1px solid #334155', maxHeight: '90vh', overflowY: 'auto' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', color: '#f1f5f9' },
  form: { display: 'flex', flexDirection: 'column', gap: '10px' },
  fieldLabel: { display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px', fontWeight: '600' },
  input: { width: '100%', padding: '11px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px' },
  textarea: { width: '100%', minHeight: '100px', padding: '12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px', resize: 'vertical', lineHeight: 1.5, boxSizing: 'border-box' },
  saveBtn: { width: '100%', backgroundColor: '#22c55e', border: 'none', color: 'white', padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' },
  cancelBtn: { padding: '12px', backgroundColor: '#475569', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '600', cursor: 'pointer', fontSize: '13px' },
  errorBanner: { display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#ef444422', color: '#ef4444', fontSize: '13px', padding: '10px 12px', borderRadius: '8px', marginTop: '10px', border: '1px solid #ef444433' },
};
