import React, { useState, useEffect, useRef } from 'react';
import {
  UserFactory, ClubFactory, GroupFactory,
  ClubJoinRequestFactory, BadgeFactory, ClubMemberFactory,
} from '../constants/dbSchema';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

import {
  ShieldAlert, UserPlus, Building2, Users,
  Trash2, Search, Edit2, X, Save, ArrowLeft, Plus,
  Heart, HeartOff, PlusCircle, Calendar,
  Bell, CheckCircle2, XCircle, Clock, MessageSquare,
  Check, AlertCircle, Medal, Upload, Award,
} from 'lucide-react';

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:  { label: 'In behandeling', color: '#f59e0b', bg: '#f59e0b15' },
  approved: { label: 'Goedgekeurd',    color: '#22c55e', bg: '#22c55e15' },
  rejected: { label: 'Afgewezen',      color: '#ef4444', bg: '#ef444415' },
};

const CATEGORY_COLORS = {
  speed: '#f97316', milestone: '#3b82f6', consistency: '#22c55e', skill: '#a78bfa',
};
const CATEGORIES = [
  { value: 'speed',       label: 'Snelheid',    emoji: '⚡' },
  { value: 'milestone',   label: 'Mijlpalen',   emoji: '🎯' },
  { value: 'consistency', label: 'Consistentie',emoji: '🗓️' },
  { value: 'skill',       label: 'Vaardigheid', emoji: '🌟' },
];
const DISCIPLINES = ['any', '30sec', '2min', '3min'];
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
  if (trigger.firstSession) return 'firstSession';
  if (trigger.totalSessions != null) return 'totalSessions';
  if (trigger.consecutiveWeeks != null) return 'consecutiveWeeks';
  if (trigger.minScore != null) return 'score';
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
  const [preview, setPreview] = useState(currentUrl || '');

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Alleen afbeeldingen zijn toegestaan.'); return; }
    if (file.size > 2 * 1024 * 1024) { alert('Afbeelding mag maximaal 2 MB zijn.'); return; }
    setUploading(true);
    try {
      const storage = getStorage();
      const path = `badge-images/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
      const sRef = storageRef(storage, path);
      await uploadBytes(sRef, file);
      const url = await getDownloadURL(sRef);
      setPreview(url);
      onUploaded(url);
    } catch (err) {
      console.error('Upload failed:', err);
      alert('Upload mislukt. Controleer Firebase Storage regels.');
    } finally {
      setUploading(false);
    }
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
    discipline:      badge?.trigger?.discipline      || 'any',
    sessionType:     badge?.trigger?.sessionType     || 'any',
    minScore:        badge?.trigger?.minScore        ?? '',
    totalSessions:   badge?.trigger?.totalSessions   ?? '',
    consecutiveWeeks:badge?.trigger?.consecutiveWeeks ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { alert('Geef de badge een naam.'); return; }
    setSaving(true);
    const trigger = form.type === 'automatic' ? buildTrigger(triggerKind, tv) : null;
    try { await onSave({ ...form, trigger }); onClose(); }
    catch (e) { console.error(e); alert('Opslaan mislukt.'); }
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
          <div>
            <label style={s.fieldLabel}>Naam *</label>
            <input style={s.input} value={form.name} onChange={e => set('name', e.target.value)} placeholder="bijv. Haas" />
          </div>
          <div>
            <label style={s.fieldLabel}>Emoji</label>
            <input style={{ ...s.input, textAlign: 'center', fontSize: '22px' }} value={form.emoji} onChange={e => set('emoji', e.target.value)} maxLength={2} />
          </div>
        </div>

        <label style={s.fieldLabel}>Omschrijving</label>
        <textarea style={{ ...s.input, resize: 'vertical', minHeight: '60px', marginBottom: '12px', fontFamily: 'inherit' }}
          value={form.description} onChange={e => set('description', e.target.value)} placeholder="Wat moet de skipper doen om dit te verdienen?" />

        <label style={s.fieldLabel}>Categorie</label>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {CATEGORIES.map(c => (
            <button key={c.value} type="button" onClick={() => set('category', c.value)} style={{
              ...bs.toggle,
              backgroundColor: form.category === c.value ? (CATEGORY_COLORS[c.value] + '22') : 'transparent',
              borderColor: form.category === c.value ? CATEGORY_COLORS[c.value] : '#334155',
              color: form.category === c.value ? CATEGORY_COLORS[c.value] : '#64748b',
            }}>{c.emoji} {c.label}</button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
          <div>
            <label style={s.fieldLabel}>Type</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['automatic', 'manual'].map(t => (
                <button key={t} type="button" onClick={() => set('type', t)} style={{ ...bs.toggle, flex: 1, backgroundColor: form.type === t ? '#3b82f622' : 'transparent', borderColor: form.type === t ? '#3b82f6' : '#334155', color: form.type === t ? '#60a5fa' : '#64748b' }}>
                  {t === 'automatic' ? '🤖 Auto' : '👋 Manueel'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={s.fieldLabel}>Bereik</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['global', 'club'].map(sc => (
                <button key={sc} type="button" onClick={() => set('scope', sc)} style={{ ...bs.toggle, flex: 1, backgroundColor: form.scope === sc ? '#3b82f622' : 'transparent', borderColor: form.scope === sc ? '#3b82f6' : '#334155', color: form.scope === sc ? '#60a5fa' : '#64748b' }}>
                  {sc === 'global' ? '🌐 Globaal' : '🏟 Club'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {form.scope === 'club' && (
          <>
            <label style={s.fieldLabel}>Club</label>
            <select style={{ ...s.input, marginBottom: '12px' }} value={form.clubId || ''} onChange={e => set('clubId', e.target.value || null)}>
              <option value="">-- Kies club --</option>
              {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </>
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
            {triggerKind === 'firstSession' && (
              <div><label style={s.fieldLabel}>Onderdeel</label><select style={s.input} value={tv.discipline} onChange={e => setTv(v => ({ ...v, discipline: e.target.value }))}>{DISCIPLINES.filter(d => d !== 'any').map(d => <option key={d}>{d}</option>)}</select></div>
            )}
            {triggerKind === 'totalSessions' && (
              <div><label style={s.fieldLabel}>Aantal sessies</label><input type="number" style={s.input} value={tv.totalSessions} onChange={e => setTv(v => ({ ...v, totalSessions: e.target.value }))} placeholder="10" /></div>
            )}
            {triggerKind === 'consecutiveWeeks' && (
              <div><label style={s.fieldLabel}>Weken op rij</label><input type="number" style={s.input} value={tv.consecutiveWeeks} onChange={e => setTv(v => ({ ...v, consecutiveWeeks: e.target.value }))} placeholder="5" /></div>
            )}
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

// ─── Award Badge Modal ─────────────────────────────────────────────────────────
// Feature 8.12: skipper now carries { clubId, memberId, firstName, lastName }
// BadgeFactory.award writes to clubs/{clubId}/members/{memberId}/earnedBadges
function AwardBadgeModal({ skipper, onClose }) {
  const [badges, setBadges] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [note, setNote] = useState('');
  const [coachName, setCoachName] = useState('Coach');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const unsub = BadgeFactory.getAll(all => setBadges(all.filter(b => b.type === 'manual' && b.isActive)));
    return () => unsub();
  }, []);

  const handleAward = async () => {
    if (!selectedId) { alert('Kies een badge.'); return; }
    setSaving(true);
    const badge = badges.find(b => b.id === selectedId);
    try {
      // Feature 8.12: award to ClubMember path
      await BadgeFactory.award(
        skipper.clubId,
        skipper.memberId,
        badge,
        coachName,
        coachName,
        null,
        note,
      );
      setDone(true);
      setTimeout(onClose, 1500);
    } catch (e) {
      console.error(e);
      alert('Uitreiken mislukt.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={s.modalOverlay}>
      <div style={s.modal}>
        <div style={s.modalHeader}>
          <h3 style={{ margin: 0, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}><Award size={18} color="#f59e0b" /> Badge uitreiken</h3>
          <button style={s.iconBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '14px' }}>
          Aan: <strong style={{ color: '#f1f5f9' }}>{skipper.firstName} {skipper.lastName}</strong>
        </p>

        {done ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '44px', marginBottom: '10px' }}>🎉</div>
            <p style={{ color: '#22c55e', fontWeight: '700' }}>Badge uitgereikt!</p>
          </div>
        ) : badges.length === 0 ? (
          <p style={{ color: '#475569', fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>
            Geen manuele badges beschikbaar. Maak eerst een badge aan met type "Manueel".
          </p>
        ) : (
          <>
            <label style={s.fieldLabel}>Badge</label>
            <select style={{ ...s.input, marginBottom: '12px' }} value={selectedId} onChange={e => setSelectedId(e.target.value)}>
              <option value="">-- Kies badge --</option>
              {badges.map(b => <option key={b.id} value={b.id}>{b.emoji} {b.name}</option>)}
            </select>

            {selectedId && (() => {
              const b = badges.find(x => x.id === selectedId);
              return b ? (
                <div style={{ backgroundColor: '#0f172a', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px', display: 'flex', gap: '10px', alignItems: 'center', border: '1px solid #1e293b' }}>
                  <div style={{ fontSize: '24px', flexShrink: 0 }}>
                    {b.imageUrl ? <img src={b.imageUrl} alt={b.name} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} /> : b.emoji}
                  </div>
                  <div>
                    <div style={{ fontWeight: '700', color: '#f1f5f9', fontSize: '13px' }}>{b.name}</div>
                    <div style={{ color: '#64748b', fontSize: '11px' }}>{b.description}</div>
                  </div>
                </div>
              ) : null;
            })()}

            <label style={s.fieldLabel}>Jouw naam</label>
            <input style={{ ...s.input, marginBottom: '12px' }} value={coachName} onChange={e => setCoachName(e.target.value)} placeholder="Naam van de coach" />

            <label style={s.fieldLabel}>Notitie (optioneel)</label>
            <textarea style={{ ...s.input, resize: 'vertical', minHeight: '70px', marginBottom: '16px', fontFamily: 'inherit' }}
              value={note} onChange={e => setNote(e.target.value)} placeholder="Waarom verdient deze skipper dit?" />

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleAward} disabled={saving || !selectedId} style={{ ...bs.primary, flex: 1, justifyContent: 'center' }}>
                <Award size={15} /> {saving ? 'Uitreiken…' : 'Uitreiken'}
              </button>
              <button onClick={onClose} style={bs.secondary}><X size={15} /> Annuleren</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Badges Tab ───────────────────────────────────────────────────────────────
function BadgesTab({ clubs }) {
  const [badges, setBadges] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('all');
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    const u = BadgeFactory.getAll(setBadges);
    return () => u();
  }, []);

  const handleSave = async (data) => {
    if (data.id) { const { id, ...rest } = data; await BadgeFactory.update(id, rest); }
    else await BadgeFactory.create(data);
  };

  const handleSeed = async () => {
    if (!confirm('Standaard badges toevoegen? Dit voegt ~12 nieuwe badges toe.')) return;
    setSeeding(true);
    try { await BadgeFactory.seedDefaults(); }
    catch (e) { console.error(e); alert('Seeding mislukt.'); }
    finally { setSeeding(false); }
  };

  const FILTERS = [
    { v: 'all', l: 'Alle' }, { v: 'global', l: '🌐 Globaal' },
    { v: 'club', l: '🏟 Club' }, { v: 'automatic', l: '🤖 Auto' },
    { v: 'manual', l: '👋 Manueel' }, { v: 'inactive', l: '⛔ Inactief' },
  ];

  const filtered = badges.filter(b => {
    if (filter === 'global')    return b.scope === 'global';
    if (filter === 'club')      return b.scope === 'club';
    if (filter === 'automatic') return b.type === 'automatic';
    if (filter === 'manual')    return b.type === 'manual';
    if (filter === 'inactive')  return !b.isActive;
    return true;
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '800', fontSize: '16px', color: '#f1f5f9' }}>
            <Medal size={18} color="#f59e0b" /> Badges beheren
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
            {badges.filter(b => b.isActive).length} actief · {badges.length} totaal
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {badges.length === 0 && (
            <button onClick={handleSeed} disabled={seeding} style={bs.secondary}>
              {seeding ? '⏳ Laden…' : '🌱 Standaard badges'}
            </button>
          )}
          <button onClick={() => { setEditing(null); setShowForm(true); }} style={bs.primary}>
            <Plus size={15} /> Nieuwe badge
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
        {FILTERS.map(f => (
          <button key={f.v} onClick={() => setFilter(f.v)} style={{
            ...bs.toggle,
            backgroundColor: filter === f.v ? '#3b82f622' : 'transparent',
            borderColor: filter === f.v ? '#3b82f6' : '#334155',
            color: filter === f.v ? '#60a5fa' : '#64748b',
          }}>{f.l}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px 0', color: '#475569' }}>
          <Medal size={36} color="#334155" style={{ marginBottom: '10px' }} />
          <p style={{ fontSize: '13px' }}>Geen badges gevonden.</p>
          {badges.length === 0 && <button onClick={handleSeed} style={{ ...bs.secondary, margin: '12px auto' }}>🌱 Laad standaard badges</button>}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
          {filtered.map(badge => {
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
                    {badge.trigger.minScore != null && `≥ ${badge.trigger.minScore} steps`}
                    {badge.trigger.firstSession && `Eerste ${badge.trigger.discipline} sessie`}
                    {badge.trigger.totalSessions != null && `${badge.trigger.totalSessions} sessies totaal`}
                    {badge.trigger.consecutiveWeeks != null && `${badge.trigger.consecutiveWeeks} weken op rij`}
                    {badge.trigger.discipline && badge.trigger.discipline !== 'any' && badge.trigger.minScore != null && ` · ${badge.trigger.discipline}`}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '6px', marginTop: 'auto' }}>
                  <button onClick={() => { setEditing(badge); setShowForm(true); }} style={{ ...bs.ghost, flex: 1, justifyContent: 'center' }}><Edit2 size={12} /> Bewerk</button>
                  <button onClick={() => BadgeFactory.update(badge.id, { isActive: !badge.isActive })} style={{ ...bs.ghost, flex: 1, justifyContent: 'center', color: badge.isActive ? '#f97316' : '#22c55e' }}>{badge.isActive ? '⛔ Deactiveer' : '✅ Activeer'}</button>
                  <button onClick={() => { if (confirm(`Verwijder "${badge.name}"?`)) BadgeFactory.delete(badge.id); }} style={{ ...bs.ghost, color: '#ef4444' }}><Trash2 size={12} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <BadgeFormModal
          badge={editing}
          clubs={clubs}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

// ─── Main SuperAdmin Component ────────────────────────────────────────────────
export default function SuperAdmin() {
  const [activeTab, setActiveTab] = useState('users');
  const [searchTerm, setSearchTerm] = useState('');

  const [users, setUsers] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [groups, setGroups] = useState([]);

  // Feature 8.12: group members are now memberId-keyed ClubMember refs
  const [members, setMembers] = useState([]);
  // Feature 8.12: ClubMember profiles for name resolution
  const [clubMemberProfiles, setClubMemberProfiles] = useState([]);

  const [memberCounts, setMemberCounts] = useState({});
  const [selectedClub, setSelectedClub] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);

  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isClubModalOpen, setIsClubModalOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

  // Feature 8.12: awardTarget now carries { clubId, memberId, firstName, lastName }
  const [awardTarget, setAwardTarget] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editingMemberUid, setEditingMemberUid] = useState(null);
  const [userForm, setUserForm] = useState({ firstName: '', lastName: '', email: '', role: 'user' });
  const [clubForm, setClubForm] = useState({ name: '', logoUrl: '' });
  const [groupForm, setGroupForm] = useState({ name: '', useHRM: true });
  const [memberEditForm, setMemberEditForm] = useState({});
  const [showOnlyActive, setShowOnlyActive] = useState(true);

  // Feature 8.12: "Nieuw lid aanmaken" inline form state
  const [showNewMemberForm, setShowNewMemberForm] = useState(false);
  const [newMemberForm, setNewMemberForm] = useState({ firstName: '', lastName: '', birthDate: '', notes: '' });
  const [newMemberSaving, setNewMemberSaving] = useState(false);
  const [newMemberError, setNewMemberError] = useState('');

  const [joinRequests, setJoinRequests] = useState([]);
  const [requestFilter, setRequestFilter] = useState('pending');
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectingRequestId, setRejectingRequestId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [rejectSaving, setRejectSaving] = useState(false);

  useEffect(() => {
    const u1 = UserFactory.getAll(setUsers);
    const u2 = ClubFactory.getAll(setClubs);
    const u3 = ClubJoinRequestFactory.getAll((data) => {
      setJoinRequests([...data].sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;
        return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
      }));
    });
    return () => { u1(); u2(); u3(); };
  }, []);

  useEffect(() => {
    if (!selectedClub) return;
    const unsub = GroupFactory.getGroupsByClub(selectedClub.id, (groupsData) => {
      setGroups(groupsData);
      groupsData.forEach(g => {
        GroupFactory.getMemberCount(selectedClub.id, g.id, (count) => {
          setMemberCounts(prev => ({ ...prev, [g.id]: count }));
        });
      });
    });
    return () => unsub();
  }, [selectedClub]);

  useEffect(() => {
    if (!selectedGroup || !selectedClub) return;
    // Feature 8.12: load both group membership docs AND ClubMember profiles
    const u1 = GroupFactory.getMembersByGroup(selectedClub.id, selectedGroup.id, setMembers);
    const u2 = ClubMemberFactory.getAll(selectedClub.id, setClubMemberProfiles);
    return () => { u1(); u2(); };
  }, [selectedGroup, selectedClub]);

  // Feature 8.12: resolve ClubMember name — m.id is now memberId
  const getMemberProfile = (memberId) =>
    clubMemberProfiles.find(p => p.id === memberId) || null;

  const filteredUsers   = users.filter(u => `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredClubs   = clubs.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const pendingCount    = joinRequests.filter(r => r.status === 'pending').length;
  const filteredRequests = requestFilter === 'all' ? joinRequests : joinRequests.filter(r => r.status === requestFilter);

  // Feature 8.12: ClubMembers not yet in this group (for the picker)
  const memberIdsInGroup = new Set(members.map(m => m.memberId || m.id));
  const availableToAdd = clubMemberProfiles.filter(p => !memberIdsInGroup.has(p.id));
  const filteredAvailable = availableToAdd.filter(p =>
    `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleUserSubmit = async (e) => {
    e.preventDefault();
    editingId ? await UserFactory.updateProfile(editingId, userForm) : await UserFactory.create(Date.now().toString(), userForm);
    setIsUserModalOpen(false);
  };
  const handleClubSubmit = async (e) => {
    e.preventDefault();
    editingId ? await ClubFactory.update(editingId, clubForm) : await ClubFactory.create(clubForm);
    setIsClubModalOpen(false);
  };
  const handleGroupSubmit = async (e) => {
    e.preventDefault();
    editingId ? await GroupFactory.update(selectedClub.id, editingId, groupForm) : await GroupFactory.create(selectedClub.id, groupForm);
    setIsGroupModalOpen(false);
  };

  // Feature 8.12: addMember uses memberId from ClubMember profile
  const handleAddMember = async (memberProfile) => {
    await GroupFactory.addMember(
      selectedClub.id,
      selectedGroup.id,
      memberProfile.id, // memberId
      { isSkipper: true, isCoach: false, startMembership: new Date(), endMembership: null }
    );
  };

  // Feature 8.12: create a brand-new ClubMember and immediately add to group
  const handleCreateAndAddMember = async () => {
    setNewMemberError('');
    if (!newMemberForm.firstName.trim() || !newMemberForm.lastName.trim()) {
      setNewMemberError('Voornaam en achternaam zijn verplicht.');
      return;
    }
    setNewMemberSaving(true);
    try {
      // Get current user uid for createdBy (best-effort from cookie)
      const uid = typeof document !== 'undefined'
        ? (document.cookie.match(/msc_uid=([^;]*)/) || [])[1] || null
        : null;

      const docRef = await ClubMemberFactory.create(
        selectedClub.id,
        {
          firstName: newMemberForm.firstName.trim(),
          lastName:  newMemberForm.lastName.trim(),
          birthDate: newMemberForm.birthDate ? new Date(newMemberForm.birthDate) : null,
          notes:     newMemberForm.notes.trim(),
        },
        uid,
      );
      await GroupFactory.addMember(
        selectedClub.id,
        selectedGroup.id,
        docRef.id,
        { isSkipper: true, isCoach: false, startMembership: new Date(), endMembership: null }
      );
      setNewMemberForm({ firstName: '', lastName: '', birthDate: '', notes: '' });
      setShowNewMemberForm(false);
    } catch (e) {
      console.error(e);
      setNewMemberError('Aanmaken mislukt. Probeer opnieuw.');
    } finally {
      setNewMemberSaving(false);
    }
  };

  const handleUpdateMember = async (memberId, data) => {
    await GroupFactory.updateMember(selectedClub.id, selectedGroup.id, memberId, data);
    setEditingMemberUid(null);
  };

  const handleConfirmReject = async () => {
    if (!rejectReason.trim()) { setRejectError('Een reden is verplicht bij afwijzing.'); return; }
    setRejectSaving(true);
    try {
      await ClubJoinRequestFactory.reject(rejectingRequestId, rejectReason.trim());
      setRejectModalOpen(false); setRejectingRequestId(null); setRejectReason('');
    } catch { setRejectError('Er ging iets mis. Probeer opnieuw.'); }
    finally { setRejectSaving(false); }
  };

  const handleBack = () => {
    if (selectedGroup) { setSelectedGroup(null); setMembers([]); setClubMemberProfiles([]); setSearchTerm(''); }
    else if (selectedClub) { setSelectedClub(null); setGroups([]); setSearchTerm(''); }
  };

  return (
    <div style={s.page}>
      <style>{css}</style>

      {/* HEADER */}
      <header style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ShieldAlert size={20} color="#3b82f6" />
          <span style={s.headerTitle}>SuperAdmin</span>
        </div>
        <div style={s.tabBar}>
          {[
            { key: 'users',    label: 'Gebruikers' },
            { key: 'clubs',    label: 'Clubs' },
            { key: 'badges',   label: 'Badges' },
            { key: 'requests', label: 'Aanvragen', badge: pendingCount },
          ].map(tab => (
            <button key={tab.key} onClick={() => { setActiveTab(tab.key); setSelectedClub(null); setSelectedGroup(null); setSearchTerm(''); }} style={{ ...s.tab, ...(activeTab === tab.key ? s.tabActive : {}) }}>
              {tab.label}
              {tab.badge > 0 && <span style={s.tabBadge}>{tab.badge > 9 ? '9+' : tab.badge}</span>}
            </button>
          ))}
        </div>
      </header>

      <main style={s.content}>

        {/* ═══ USERS ═══ */}
        {activeTab === 'users' && (
          <div>
            <div style={s.actionBar}>
              <div style={s.searchWrap}>
                <Search size={16} style={s.searchIcon} />
                <input placeholder="Zoek gebruiker…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={s.searchInput} />
              </div>
              <button style={s.addBtn} onClick={() => { setEditingId(null); setUserForm({ firstName: '', lastName: '', email: '', role: 'user' }); setIsUserModalOpen(true); }}>
                <UserPlus size={16} /><span className="btn-label">Nieuwe gebruiker</span>
              </button>
            </div>
            <div className="user-list">
              {filteredUsers.map(user => (
                <div key={user.id} style={s.userCard}>
                  <div style={s.userCardAvatar}>{(user.firstName?.[0] || '?')}{user.lastName?.[0] || ''}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.userCardName}>{user.firstName} {user.lastName}</div>
                    <div style={s.userCardEmail}>{user.email}</div>
                    <span style={{ ...s.roleBadge, backgroundColor: getRoleColor(user.role) }}>{user.role}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <button style={s.iconBtn} onClick={() => { setEditingId(user.id); setUserForm(user); setIsUserModalOpen(true); }}><Edit2 size={16} /></button>
                    <button style={{ ...s.iconBtn, color: '#ef4444' }} onClick={() => { if (confirm('Gebruiker wissen?')) UserFactory.delete(user.id); }}><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
              {filteredUsers.length === 0 && <p style={s.emptyText}>Geen gebruikers gevonden.</p>}
            </div>
          </div>
        )}

        {/* ═══ CLUBS & GROUPS ═══ */}
        {activeTab === 'clubs' && (
          <div>
            {selectedClub && (
              <button style={s.backBtn} onClick={handleBack}>
                <ArrowLeft size={16} />{selectedGroup ? `Terug naar ${selectedClub.name}` : 'Terug naar clubs'}
              </button>
            )}

            {!selectedClub && (
              <>
                <div style={s.actionBar}>
                  <div style={s.searchWrap}><Search size={16} style={s.searchIcon} /><input placeholder="Zoek club…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={s.searchInput} /></div>
                  <button style={s.addBtn} onClick={() => { setEditingId(null); setClubForm({ name: '', logoUrl: '' }); setIsClubModalOpen(true); }}><Building2 size={16} /><span className="btn-label">Nieuwe club</span></button>
                </div>
                <div className="card-grid">
                  {filteredClubs.map(club => (
                    <div key={club.id} style={s.clubCard}>
                      <div style={s.clubCardBody} onClick={() => setSelectedClub(club)}>
                        {club.logoUrl ? <img src={club.logoUrl} style={s.clubLogo} alt={club.name} /> : <div style={s.clubLogoPlaceholder}><Building2 size={32} color="#64748b" /></div>}
                        <div style={s.clubCardName}>{club.name}</div>
                      </div>
                      <div style={s.clubCardActions}>
                        <button style={s.iconBtn} onClick={() => { setEditingId(club.id); setClubForm(club); setIsClubModalOpen(true); }}><Edit2 size={14} /></button>
                        <button style={{ ...s.iconBtn, color: '#ef4444' }} onClick={() => { if (confirm('Club verwijderen? Dit wist ook alle groepen!')) ClubFactory.delete(club.id); }}><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                  {filteredClubs.length === 0 && <p style={s.emptyText}>Geen clubs gevonden.</p>}
                </div>
              </>
            )}

            {selectedClub && !selectedGroup && (
              <>
                <div style={s.sectionTitle}>
                  <Building2 size={18} color="#a78bfa" />
                  <span>{selectedClub.name} — Groepen</span>
                  <button style={{ ...s.addBtn, marginLeft: 'auto' }} onClick={() => { setEditingId(null); setGroupForm({ name: '', useHRM: true }); setIsGroupModalOpen(true); }}><Plus size={16} /><span className="btn-label">Groep</span></button>
                </div>
                <div className="card-grid">
                  {groups.map(group => (
                    <div key={group.id} style={s.groupCard}>
                      <div style={{ cursor: 'pointer', flex: 1 }} onClick={() => setSelectedGroup(group)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}><Users size={24} color="#3b82f6" /><span style={s.groupCardName}>{group.name}</span></div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={s.countBadge}>{memberCounts[group.id] || 0} leden</span>
                          <span style={{ ...s.hrmBadge, backgroundColor: group.useHRM ? '#065f46' : '#334155' }}>{group.useHRM ? <Heart size={10} fill="white" /> : <HeartOff size={10} />} HRM {group.useHRM ? 'AAN' : 'UIT'}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', marginTop: '10px' }}>
                        <button style={s.iconBtn} onClick={() => { setEditingId(group.id); setGroupForm(group); setIsGroupModalOpen(true); }}><Edit2 size={14} /></button>
                        <button style={{ ...s.iconBtn, color: '#ef4444' }} onClick={() => GroupFactory.delete(selectedClub.id, group.id)}><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                  {groups.length === 0 && <p style={s.emptyText}>Geen groepen gevonden.</p>}
                </div>
              </>
            )}

            {selectedClub && selectedGroup && (
              <div>
                <div style={s.sectionTitle}>
                  <Users size={18} color="#3b82f6" />
                  <span>{selectedGroup.name} — Leden ({members.length})</span>
                </div>

                <div style={s.filterRow}>
                  <label style={s.filterLabel}>
                    <input type="checkbox" checked={showOnlyActive} onChange={e => setShowOnlyActive(e.target.checked)} style={{ marginRight: '6px' }} />
                    Alleen actieve leden
                  </label>
                </div>

                {/* ── Member list ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                  {members
                    .filter(m => {
                      if (!showOnlyActive) return true;
                      const nu    = new Date();
                      const start = m.startMembership?.toDate ? m.startMembership.toDate() : new Date(m.startMembership);
                      const eind  = m.endMembership?.toDate  ? m.endMembership.toDate()   : (m.endMembership ? new Date(m.endMembership) : null);
                      return start <= nu && (!eind || eind > nu);
                    })
                    .map(m => {
                      // Feature 8.12: m.id is memberId — resolve name from ClubMember profiles
                      const memberId = m.memberId || m.id;
                      const profile  = getMemberProfile(memberId);
                      const isEditing = editingMemberUid === memberId;

                      return (
                        <div key={memberId} style={s.memberCard}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <div style={s.memberName}>
                                {profile
                                  ? `${profile.firstName} ${profile.lastName}`
                                  : <span style={{ color: '#475569', fontStyle: 'italic' }}>Onbekend lid ({memberId.slice(0, 8)}…)</span>
                                }
                              </div>
                              {profile?.birthDate && (
                                <div style={s.memberEmail}>
                                  {profile.birthDate?.seconds
                                    ? new Date(profile.birthDate.seconds * 1000).toLocaleDateString('nl-BE')
                                    : ''}
                                </div>
                              )}
                              {profile?.notes && (
                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', fontStyle: 'italic' }}>{profile.notes}</div>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button
                                style={{ ...s.iconBtn, color: '#f59e0b' }}
                                title="Badge uitreiken"
                                onClick={() => setAwardTarget({
                                  clubId:    selectedClub.id,
                                  memberId,
                                  firstName: profile?.firstName || '?',
                                  lastName:  profile?.lastName  || '',
                                })}
                              >
                                <Award size={16} />
                              </button>
                              <button
                                style={{ ...s.iconBtn, color: '#ef4444' }}
                                onClick={() => { if (confirm('Lidmaatschap definitief verwijderen?')) GroupFactory.removeMember(selectedClub.id, selectedGroup.id, memberId); }}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                            <button style={{ ...s.roleToggle, backgroundColor: m.isSkipper ? '#3b82f6' : '#334155' }} onClick={() => handleUpdateMember(memberId, { isSkipper: !m.isSkipper })}>Skipper: {m.isSkipper ? 'JA' : 'NEE'}</button>
                            <button style={{ ...s.roleToggle, backgroundColor: m.isCoach   ? '#f59e0b' : '#334155' }} onClick={() => handleUpdateMember(memberId, { isCoach:   !m.isCoach   })}>Coach: {m.isCoach ? 'JA' : 'NEE'}</button>
                          </div>

                          <div style={s.memberDates}>
                            <div style={s.dateRow}>
                              <span style={{ color: '#64748b', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={12} /> Start</span>
                              {isEditing
                                ? <input type="date" style={s.dateInput} defaultValue={m.startMembership?.toDate ? m.startMembership.toDate().toISOString().split('T')[0] : ''} onChange={e => setMemberEditForm({ ...memberEditForm, startMembership: new Date(e.target.value) })} />
                                : <span style={{ fontSize: '12px', color: '#f1f5f9' }}>{m.startMembership?.toDate ? m.startMembership.toDate().toLocaleDateString() : '-'}</span>}
                            </div>
                            <div style={s.dateRow}>
                              <span style={{ color: '#64748b', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={12} /> Einde</span>
                              {isEditing
                                ? <input type="date" style={s.dateInput} defaultValue={m.endMembership?.toDate ? m.endMembership.toDate().toISOString().split('T')[0] : ''} onChange={e => setMemberEditForm({ ...memberEditForm, endMembership: e.target.value ? new Date(e.target.value) : null })} />
                                : <span style={{ fontSize: '12px', color: '#f1f5f9' }}>{m.endMembership?.toDate ? m.endMembership.toDate().toLocaleDateString() : 'Geen'}</span>}
                            </div>
                          </div>

                          <div style={{ marginTop: '10px' }}>
                            {isEditing
                              ? <button style={s.saveBtn} onClick={() => handleUpdateMember(memberId, memberEditForm)}><Save size={14} /> Opslaan</button>
                              : <button style={s.editBtn} onClick={() => { setEditingMemberUid(memberId); setMemberEditForm(m); }}><Edit2 size={14} /> Wijzig lidmaatschap</button>}
                          </div>
                        </div>
                      );
                    })}
                  {members.length === 0 && <p style={s.emptyText}>Geen leden in deze groep.</p>}
                </div>

                {/* ── Feature 8.12: Picker — shows ClubMembers not yet in group ── */}
                <div style={s.pickerPanel}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={s.pickerTitle}>Lid toevoegen</div>
                    <button
                      onClick={() => { setShowNewMemberForm(v => !v); setNewMemberError(''); }}
                      style={{ ...bs.secondary, fontSize: '12px', padding: '6px 10px' }}
                    >
                      <Plus size={13} /> Nieuw lid aanmaken
                    </button>
                  </div>

                  {/* Inline new-member form */}
                  {showNewMemberForm && (
                    <div style={{ backgroundColor: '#0f172a', borderRadius: '10px', padding: '14px', marginBottom: '12px', border: '1px solid #334155' }}>
                      <div style={{ fontSize: '12px', color: '#a78bfa', fontWeight: '700', marginBottom: '10px' }}>Nieuw ClubMember aanmaken</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                        <div>
                          <label style={s.fieldLabel}>Voornaam *</label>
                          <input style={s.input} placeholder="Emma" value={newMemberForm.firstName} onChange={e => setNewMemberForm(f => ({ ...f, firstName: e.target.value }))} />
                        </div>
                        <div>
                          <label style={s.fieldLabel}>Achternaam *</label>
                          <input style={s.input} placeholder="De Smet" value={newMemberForm.lastName} onChange={e => setNewMemberForm(f => ({ ...f, lastName: e.target.value }))} />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                        <div>
                          <label style={s.fieldLabel}>Geboortedatum</label>
                          <input style={s.input} type="date" value={newMemberForm.birthDate} onChange={e => setNewMemberForm(f => ({ ...f, birthDate: e.target.value }))} />
                        </div>
                        <div>
                          <label style={s.fieldLabel}>Notities</label>
                          <input style={s.input} placeholder="optioneel" value={newMemberForm.notes} onChange={e => setNewMemberForm(f => ({ ...f, notes: e.target.value }))} />
                        </div>
                      </div>
                      {newMemberError && (
                        <div style={{ color: '#ef4444', fontSize: '12px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <AlertCircle size={12} />{newMemberError}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={handleCreateAndAddMember}
                          disabled={newMemberSaving}
                          style={{ ...bs.primary, opacity: newMemberSaving ? 0.6 : 1 }}
                        >
                          <UserPlus size={14} />{newMemberSaving ? 'Aanmaken…' : 'Aanmaken & toevoegen'}
                        </button>
                        <button onClick={() => setShowNewMemberForm(false)} style={bs.secondary}><X size={14} /> Annuleren</button>
                      </div>
                    </div>
                  )}

                  {/* Existing ClubMembers search */}
                  <div style={s.searchWrap}>
                    <Search size={14} style={s.searchIcon} />
                    <input placeholder="Zoek bestaand lid…" onChange={e => setSearchTerm(e.target.value)} style={s.searchInput} />
                  </div>
                  <div style={s.pickerList}>
                    {filteredAvailable.length === 0 ? (
                      <p style={{ color: '#475569', fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>
                        Alle leden van deze club zitten al in de groep.
                      </p>
                    ) : (
                      filteredAvailable.map(p => (
                        <div key={p.id} style={s.pickerRow} onClick={() => handleAddMember(p)}>
                          <div>
                            <span style={{ fontSize: '14px' }}>{p.firstName} {p.lastName}</span>
                            {p.birthDate?.seconds && (
                              <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '8px' }}>
                                {new Date(p.birthDate.seconds * 1000).toLocaleDateString('nl-BE')}
                              </span>
                            )}
                          </div>
                          <PlusCircle size={18} color="#22c55e" />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ BADGES ═══ */}
        {activeTab === 'badges' && <BadgesTab clubs={clubs} />}

        {/* ═══ JOIN REQUESTS ═══ */}
        {activeTab === 'requests' && (
          <div>
            <div style={s.requestsHeader}>
              <div style={s.sectionTitleText}>Club Aanvragen</div>
              {pendingCount > 0 && <div style={{ fontSize: '12px', color: '#f59e0b', marginTop: '2px' }}>{pendingCount} openstaande aanvraag/aanvragen</div>}
            </div>

            <div style={s.filterPills}>
              {[
                { key: 'pending',  label: 'In behandeling', count: joinRequests.filter(r => r.status === 'pending').length },
                { key: 'approved', label: 'Goedgekeurd',    count: joinRequests.filter(r => r.status === 'approved').length },
                { key: 'rejected', label: 'Afgewezen',      count: joinRequests.filter(r => r.status === 'rejected').length },
                { key: 'all',      label: 'Alle',           count: joinRequests.length },
              ].map(f => (
                <button key={f.key} onClick={() => setRequestFilter(f.key)} style={{ ...s.filterPill, ...(requestFilter === f.key ? s.filterPillActive : {}) }}>
                  {f.label}
                  {f.count > 0 && (
                    <span style={{ ...s.pillCount, backgroundColor: requestFilter === f.key ? '#1e293b' : (f.key === 'pending' ? '#f59e0b' : '#334155'), color: f.key === 'pending' && requestFilter !== f.key ? '#000' : '#94a3b8' }}>
                      {f.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {filteredRequests.length === 0 ? (
              <div style={s.emptyState}>
                <Bell size={36} color="#334155" />
                <p style={{ color: '#64748b', margin: '12px 0 0', fontSize: '14px' }}>{requestFilter === 'pending' ? 'Geen openstaande aanvragen.' : 'Geen aanvragen gevonden.'}</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filteredRequests.map(req => {
                  const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
                  const initials = `${req.firstName?.[0] || '?'}${req.lastName?.[0] || ''}`.toUpperCase();
                  return (
                    <div key={req.id} style={{ ...s.requestCard, borderColor: req.status === 'pending' ? '#f59e0b44' : '#334155' }}>
                      {req.status === 'pending' && <div style={{ height: '3px', backgroundColor: '#f59e0b', margin: '-16px -16px 14px' }} />}
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <div style={s.requestAvatar}>{initials}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                            <span style={{ fontWeight: '700', fontSize: '15px', color: '#f1f5f9' }}>{req.firstName} {req.lastName}</span>
                            <span style={{ ...s.statusBadge, backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33` }}>
                              {req.status === 'pending'  && <Clock       size={10} />}
                              {req.status === 'approved' && <CheckCircle2 size={10} />}
                              {req.status === 'rejected' && <XCircle      size={10} />}
                              {cfg.label}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Building2 size={11} /> {req.clubName}</span>
                            {req.email && <span>{req.email}</span>}
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Calendar size={11} />{req.createdAt?.seconds ? new Date(req.createdAt.seconds * 1000).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                            </span>
                          </div>
                        </div>
                        <button style={{ ...s.iconBtn, color: '#64748b', flexShrink: 0 }} onClick={() => { if (confirm('Aanvraag permanent verwijderen?')) ClubJoinRequestFactory.delete(req.id); }}><Trash2 size={15} /></button>
                      </div>

                      {req.message && <div style={s.requestMessage}><MessageSquare size={11} color="#475569" />"{req.message}"</div>}
                      {req.status === 'rejected' && req.rejectionReason && (
                        <div style={s.rejectionReason}><XCircle size={13} style={{ flexShrink: 0 }} /><div><strong>Reden:</strong> {req.rejectionReason}</div></div>
                      )}
                      {req.resolvedAt?.seconds && req.status !== 'pending' && (
                        <div style={{ fontSize: '11px', color: '#475569', marginTop: '8px' }}>
                          Behandeld op {new Date(req.resolvedAt.seconds * 1000).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                      )}
                      {req.status === 'pending' && (
                        <div style={s.requestActions}>
                          <button style={s.approveBtn} onClick={() => ClubJoinRequestFactory.approve(req.id)}><Check size={15} /> Goedkeuren</button>
                          <button style={s.rejectBtn} onClick={() => { setRejectingRequestId(req.id); setRejectReason(''); setRejectError(''); setRejectModalOpen(true); }}><X size={15} /> Afwijzen</button>
                        </div>
                      )}
                      {req.status === 'approved' && (
                        <div style={s.approvedHint}>
                          <CheckCircle2 size={13} />
                          Voeg {req.firstName} toe aan een groep via het tabblad{' '}
                          <strong style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setActiveTab('clubs')}>Clubs</strong>.
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
      {awardTarget && <AwardBadgeModal skipper={awardTarget} onClose={() => setAwardTarget(null)} />}

      {/* ══ REJECT MODAL ══ */}
      {rejectModalOpen && (
        <div style={s.modalOverlay}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <h3 style={{ margin: 0, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}><XCircle size={20} /> Aanvraag afwijzen</h3>
              <button style={s.iconBtn} onClick={() => setRejectModalOpen(false)}><X size={18} /></button>
            </div>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px', lineHeight: 1.6 }}>Geef een duidelijke reden op. De gebruiker zal dit zien in zijn/haar dashboard.</p>
            <label style={s.fieldLabel}>Reden <span style={{ color: '#ef4444' }}>*</span></label>
            <textarea autoFocus style={s.textarea} placeholder="bijv. De club accepteert momenteel geen nieuwe leden…" value={rejectReason} onChange={e => { setRejectReason(e.target.value); setRejectError(''); }} />
            {rejectError && <div style={s.errorBanner}><AlertCircle size={13} /> {rejectError}</div>}
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button style={{ ...s.rejectBtn, flex: 1, justifyContent: 'center', padding: '12px', opacity: rejectSaving ? 0.6 : 1 }} onClick={handleConfirmReject} disabled={rejectSaving}>
                {rejectSaving ? 'Opslaan…' : <><XCircle size={15} /> Bevestigen</>}
              </button>
              <button style={{ ...s.cancelBtn, flex: 1 }} onClick={() => setRejectModalOpen(false)}>Annuleren</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ USER MODAL ══ */}
      {isUserModalOpen && (
        <div style={s.modalOverlay}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Gebruiker {editingId ? 'bewerken' : 'toevoegen'}</h3>
              <button style={s.iconBtn} onClick={() => setIsUserModalOpen(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleUserSubmit} style={s.form}>
              <label style={s.fieldLabel}>Voornaam</label>
              <input placeholder="Voornaam" required style={s.input} value={userForm.firstName} onChange={e => setUserForm({ ...userForm, firstName: e.target.value })} />
              <label style={s.fieldLabel}>Achternaam</label>
              <input placeholder="Achternaam" required style={s.input} value={userForm.lastName} onChange={e => setUserForm({ ...userForm, lastName: e.target.value })} />
              <label style={s.fieldLabel}>Email</label>
              <input placeholder="Email" style={s.input} value={userForm.email} onChange={e => setUserForm({ ...userForm, email: e.target.value })} />
              <label style={s.fieldLabel}>Rol</label>
              <select style={s.input} value={userForm.role} onChange={e => setUserForm({ ...userForm, role: e.target.value })}>
                <option value="user">User</option>
                <option value="clubadmin">ClubAdmin</option>
                <option value="superadmin">SuperAdmin</option>
              </select>
              <button type="submit" style={s.saveBtn}><Save size={16} /> Opslaan</button>
            </form>
          </div>
        </div>
      )}

      {/* ══ CLUB MODAL ══ */}
      {isClubModalOpen && (
        <div style={s.modalOverlay}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Club {editingId ? 'bewerken' : 'toevoegen'}</h3>
              <button style={s.iconBtn} onClick={() => setIsClubModalOpen(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleClubSubmit} style={s.form}>
              <label style={s.fieldLabel}>Naam</label>
              <input placeholder="Club naam" required style={s.input} value={clubForm.name} onChange={e => setClubForm({ ...clubForm, name: e.target.value })} />
              <label style={s.fieldLabel}>Logo URL</label>
              <input placeholder="https://…" style={s.input} value={clubForm.logoUrl} onChange={e => setClubForm({ ...clubForm, logoUrl: e.target.value })} />
              <button type="submit" style={s.saveBtn}><Save size={16} /> Opslaan</button>
            </form>
          </div>
        </div>
      )}

      {/* ══ GROUP MODAL ══ */}
      {isGroupModalOpen && (
        <div style={s.modalOverlay}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Groep {editingId ? 'bewerken' : 'toevoegen'}</h3>
              <button style={s.iconBtn} onClick={() => setIsGroupModalOpen(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleGroupSubmit} style={s.form}>
              <label style={s.fieldLabel}>Naam</label>
              <input placeholder="Groep naam" required style={s.input} value={groupForm.name} onChange={e => setGroupForm({ ...groupForm, name: e.target.value })} />
              <label style={s.fieldLabel}>Hartslagmeters (HRM)</label>
              <div style={s.switchRow} onClick={() => setGroupForm({ ...groupForm, useHRM: !groupForm.useHRM })}>
                <div style={{ ...s.switchHalf, backgroundColor: groupForm.useHRM  ? '#059669' : '#334155' }}>AAN</div>
                <div style={{ ...s.switchHalf, backgroundColor: !groupForm.useHRM ? '#ef4444' : '#334155' }}>UIT</div>
              </div>
              <button type="submit" style={s.saveBtn}><Save size={16} /> Opslaan</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getRoleColor = (role) => {
  if (role === 'superadmin') return '#ef4444';
  if (role === 'clubadmin')  return '#f59e0b';
  return '#3b82f6';
};

// ─── Button helpers ───────────────────────────────────────────────────────────
const bs = {
  primary:   { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' },
  secondary: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '8px', color: '#94a3b8', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' },
  ghost:     { display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 8px', backgroundColor: 'transparent', border: 'none', borderRadius: '6px', color: '#64748b', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' },
  toggle:    { padding: '5px 10px', borderRadius: '14px', border: '1px solid', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' },
};

// ─── Responsive CSS ───────────────────────────────────────────────────────────
const css = `
  * { box-sizing: border-box; }
  .btn-label { display: inline; }
  .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; }
  .user-list { display: flex; flex-direction: column; gap: 10px; }
  @media (max-width: 600px) { .btn-label { display: none; } .card-grid { grid-template-columns: 1fr 1fr; gap: 10px; } }
  @media (max-width: 400px) { .card-grid { grid-template-columns: 1fr; } }
`;

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  page: { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'system-ui, sans-serif' },
  header: { backgroundColor: '#1e293b', borderBottom: '1px solid #334155', padding: '12px 16px', position: 'sticky', top: 0, zIndex: 100, display: 'flex', flexDirection: 'column', gap: '12px' },
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
  backBtn: { background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: '600', padding: '0 0 14px 0' },
  iconBtn: { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' },
  sectionTitle: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', fontSize: '15px', fontWeight: '700', color: '#f1f5f9' },
  sectionTitleText: { fontSize: '17px', fontWeight: '800', color: '#f1f5f9' },
  userCard: { backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px' },
  userCardAvatar: { width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '14px', flexShrink: 0 },
  userCardName: { fontWeight: '600', fontSize: '14px', color: '#f1f5f9', marginBottom: '2px' },
  userCardEmail: { fontSize: '12px', color: '#64748b', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  roleBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', color: 'white' },
  clubCard: { backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden', position: 'relative' },
  clubCardBody: { padding: '16px', textAlign: 'center', cursor: 'pointer' },
  clubLogo: { width: '60px', height: '60px', borderRadius: '10px', objectFit: 'cover', marginBottom: '10px' },
  clubLogoPlaceholder: { width: '60px', height: '60px', borderRadius: '10px', backgroundColor: '#0f172a', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  clubCardName: { fontWeight: '700', fontSize: '14px', color: '#f1f5f9' },
  clubCardActions: { display: 'flex', justifyContent: 'center', gap: '4px', padding: '8px', borderTop: '1px solid #334155' },
  groupCard: { backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '14px', display: 'flex', flexDirection: 'column' },
  groupCardName: { fontWeight: '700', fontSize: '14px', color: '#f1f5f9' },
  countBadge: { fontSize: '10px', padding: '3px 8px', backgroundColor: '#0f172a', borderRadius: '4px', color: '#94a3b8' },
  hrmBadge: { fontSize: '10px', padding: '3px 8px', borderRadius: '4px', color: 'white', display: 'flex', alignItems: 'center', gap: '4px' },
  filterRow: { marginBottom: '14px' },
  filterLabel: { display: 'flex', alignItems: 'center', fontSize: '13px', color: '#94a3b8', cursor: 'pointer' },
  memberCard: { backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '14px' },
  memberName: { fontWeight: '600', fontSize: '14px', color: '#f1f5f9' },
  memberEmail: { fontSize: '12px', color: '#64748b', marginTop: '2px' },
  roleToggle: { flex: 1, padding: '8px', borderRadius: '8px', border: 'none', color: 'white', fontSize: '12px', fontWeight: '700', cursor: 'pointer' },
  memberDates: { backgroundColor: '#0f172a', borderRadius: '8px', padding: '10px', marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' },
  dateRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  dateInput: { backgroundColor: '#1e293b', border: '1px solid #334155', color: 'white', borderRadius: '6px', padding: '4px 8px', fontSize: '12px' },
  editBtn: { width: '100%', background: 'none', border: '1px solid #334155', color: '#94a3b8', padding: '8px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' },
  saveBtn: { width: '100%', backgroundColor: '#22c55e', border: 'none', color: 'white', padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' },
  pickerPanel: { backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '14px' },
  pickerTitle: { fontSize: '13px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' },
  pickerList: { maxHeight: '240px', overflowY: 'auto', marginTop: '10px' },
  pickerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #334155', cursor: 'pointer', fontSize: '14px', color: '#f1f5f9' },
  requestsHeader: { marginBottom: '14px' },
  filterPills: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' },
  filterPill: { padding: '6px 12px', borderRadius: '20px', border: '1px solid #334155', backgroundColor: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' },
  filterPillActive: { backgroundColor: '#334155', color: '#f1f5f9', borderColor: '#475569' },
  pillCount: { padding: '1px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold' },
  requestCard: { backgroundColor: '#1e293b', borderRadius: '14px', border: '1px solid', padding: '16px' },
  requestAvatar: { width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#3b82f622', border: '1px solid #3b82f644', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '14px', color: '#3b82f6', flexShrink: 0 },
  statusBadge: { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700' },
  requestMessage: { marginTop: '10px', backgroundColor: '#0f172a', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: '#94a3b8', fontStyle: 'italic', borderLeft: '3px solid #334155', display: 'flex', alignItems: 'flex-start', gap: '6px' },
  rejectionReason: { marginTop: '10px', backgroundColor: '#ef444411', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#ef4444', borderLeft: '3px solid #ef4444', display: 'flex', alignItems: 'flex-start', gap: '8px' },
  requestActions: { display: 'flex', gap: '10px', marginTop: '14px' },
  approveBtn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', backgroundColor: '#22c55e', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '700', fontSize: '13px', cursor: 'pointer' },
  rejectBtn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', backgroundColor: '#ef4444', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '700', fontSize: '13px', cursor: 'pointer' },
  approvedHint: { marginTop: '12px', backgroundColor: '#22c55e11', border: '1px solid #22c55e33', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '8px' },
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0' },
  emptyText: { color: '#475569', fontSize: '14px', textAlign: 'center', padding: '20px 0' },
  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 500 },
  modal: { backgroundColor: '#1e293b', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '560px', border: '1px solid #334155', maxHeight: '90vh', overflowY: 'auto' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', color: '#f1f5f9' },
  form: { display: 'flex', flexDirection: 'column', gap: '10px' },
  fieldLabel: { display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px', fontWeight: '600' },
  input: { width: '100%', padding: '11px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px' },
  textarea: { width: '100%', minHeight: '100px', padding: '12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px', resize: 'vertical', lineHeight: 1.5, boxSizing: 'border-box' },
  switchRow: { display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid #334155', cursor: 'pointer' },
  switchHalf: { flex: 1, padding: '10px', textAlign: 'center', fontSize: '12px', fontWeight: '700', color: 'white' },
  cancelBtn: { padding: '12px', backgroundColor: '#475569', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '600', cursor: 'pointer', fontSize: '13px' },
  errorBanner: { display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#ef444422', color: '#ef4444', fontSize: '13px', padding: '10px 12px', borderRadius: '8px', marginTop: '10px', border: '1px solid #ef444433' },
};
