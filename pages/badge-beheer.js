import React, { useState, useEffect, useRef } from 'react';
import {
  BadgeFactory, ClubFactory, GroupFactory, ClubMemberFactory, UserFactory,
  UserMemberLinkFactory,
} from '../constants/dbSchema';
import { useAuth } from '../contexts/AuthContext';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  Award, Medal, Plus, Edit2, Trash2, X, Check, Save,
  Upload, Search, Building2, Users, ChevronRight, AlertCircle,
  Shield, Star, Zap, Target, Calendar,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORY_COLORS = {
  speed: '#f97316', milestone: '#3b82f6', consistency: '#22c55e', skill: '#a78bfa',
};
const CATEGORIES = [
  { value: 'speed',       label: 'Snelheid',     emoji: '⚡' },
  { value: 'milestone',   label: 'Mijlpalen',    emoji: '🎯' },
  { value: 'consistency', label: 'Consistentie', emoji: '🗓️' },
  { value: 'skill',       label: 'Vaardigheid',  emoji: '🌟' },
];

// Discipline names match the default IJRU disciplines in DisciplineFactory.seedDefaults
const DISCIPLINE_NAMES = [
  'any',
  'Speed Sprint',
  'Endurance 2 min',
  'Endurance 3 min',
  'Triple Under',
  'Speed Relay 2',
  'Speed Relay 4',
  'Double Under',
  'DD Speed Sprint',
  'DD Speed Relay',
];
const ROPE_TYPES  = ['any', 'SR', 'DD'];
const SESSION_TYPES = ['any', 'Training', 'Wedstrijd'];
const TRIGGER_KINDS = [
  { value: 'score',            label: 'Minimum score (stappen)' },
  { value: 'firstSession',     label: 'Eerste sessie van een onderdeel' },
  { value: 'totalSessions',    label: 'Totaal aantal sessies' },
  { value: 'consecutiveWeeks', label: 'Opeenvolgende weken' },
  { value: 'none',             label: 'Geen (manuele badge)' },
];
const EMPTY_BADGE = {
  name: '', description: '', emoji: '🏅', imageUrl: '',
  type: 'manual', scope: 'club', clubId: null, category: 'skill',
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
  const base = {
    disciplineName: vals.disciplineName || 'any',
    ropeType:       vals.ropeType       || 'any',
    sessionType:    vals.sessionType    || 'any',
  };
  if (kind === 'score')            return { ...base, minScore: parseInt(vals.minScore) || 0 };
  if (kind === 'firstSession')     return { ...base, firstSession: true };
  if (kind === 'totalSessions')    return { totalSessions: parseInt(vals.totalSessions) || 0 };
  if (kind === 'consecutiveWeeks') return { consecutiveWeeks: parseInt(vals.consecutiveWeeks) || 0 };
  return null;
}

// ─── Emoji Icon Library ───────────────────────────────────────────────────────
const ICON_LIBRARY = {
  'Snelheid & Kracht': [
    '⚡','🚀','💥','🌪️','💫','🔥','💨','🛸','🌠','☄️','🌩️','🔋','⚡','🏎️',
  ],
  'Dieren': [
    '🐇','🦊','🦌','🐆','🦁','🐎','🦅','🐬','🦈','🐝','🦋','🦓','🦒',
    '🐘','🦏','🦍','🐺','🦬','🦙','🐃','🦅','🦆',
  ],
  'Trofeeën & Awards': [
    '🏆','🥇','🥈','🥉','🏅','🎖️','👑','🎗️','🌟','⭐','💎','🔮','🪙','🎯',
    '🎪','🎭','🎨','🥊','🎱','🎠',
  ],
  'Natuur & Groei': [
    '🌱','🌿','🌳','🍃','🌲','🌾','🌺','🌸','🌻','🌼','🍀','🌈','❄️','🌊',
    '🌙','☀️','🌤️','⛅','🌍','🌏','🌎','🔆',
  ],
  'Symbolen & Tekens': [
    '💯','✅','❤️','💜','💙','💚','🧡','❤️‍🔥','💝','⚔️','🛡️','🔰','♾️',
    '☯️','⚜️','🔱','💠','🔘','🔷','🔶','🟣','🟠','🟡',
  ],
  'Mensen & Sport': [
    '🏃','🏃‍♂️','🤸','🤸‍♂️','💪','🦾','🧠','👊','✊','🤜','🤝','👯','👯‍♂️',
    '🧗','🏋️','🏋️‍♂️','🤾','🤾‍♂️','⛹️','🤺','🏇',
  ],
  'Getallen & Mijlpalen': [
    '1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','🔟','💯','🔰','🆙','🆕','🆒','🔝',
  ],
  'Touw & Skipping': [
    '🪢','🌀','🔄','♻️','🌪️','💫','🎪','🎠','🎡','🎢',
  ],
  'Avontuur & Fantasy': [
    '🧙','🧙‍♂️','🦸','🦸‍♂️','🧝','🧝‍♂️','🐉','🦄','⚗️','🔮','🗡️','🛡️',
    '🏰','🗺️','🧭','🌋','🏔️','⛰️',
  ],
};

// ─── EmojiPicker component ────────────────────────────────────────────────────
function EmojiPicker({ value, onChange }) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const allEmojis = Object.values(ICON_LIBRARY).flat();
  // Very simple search: just filter by the emoji character
  const filtered  = search ? allEmojis.filter(e => e.includes(search)) : null;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* Trigger row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          style={{
            fontSize: '28px', width: '52px', height: '52px', borderRadius: '12px',
            backgroundColor: '#0f172a', border: `1px solid ${open ? '#3b82f6' : '#334155'}`,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {value || '🏅'}
        </button>
        <div>
          <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '5px' }}>
            Geselecteerd: <strong style={{ color: '#f1f5f9' }}>{value || '🏅'}</strong>
          </div>
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            style={{
              fontSize: '11px', padding: '5px 10px', borderRadius: '6px',
              backgroundColor: '#1e293b', border: `1px solid ${open ? '#3b82f6' : '#334155'}`,
              color: open ? '#60a5fa' : '#94a3b8', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {open ? '✕ Sluiten' : '📚 Bibliotheek openen'}
          </button>
        </div>
      </div>

      {/* Picker panel */}
      {open && (
        <div style={{
          position: 'absolute', top: '60px', left: 0, zIndex: 300,
          backgroundColor: '#1e293b', border: '1px solid #334155',
          borderRadius: '14px', padding: '14px', width: '320px',
          maxHeight: '380px', overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}>
          {/* Search */}
          <input
            autoFocus
            placeholder="Zoek emoji…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '8px 10px', borderRadius: '8px',
              backgroundColor: '#0f172a', border: '1px solid #334155',
              color: 'white', fontSize: '13px', marginBottom: '12px',
              boxSizing: 'border-box', fontFamily: 'inherit',
            }}
          />

          {search && filtered !== null ? (
            filtered.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#475569', textAlign: 'center', padding: '16px 0' }}>
                Geen emoji gevonden.
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {filtered.map((emoji, i) => (
                  <EmojiBtn key={i} emoji={emoji} selected={value === emoji}
                    onClick={() => { onChange(emoji); setOpen(false); setSearch(''); }} />
                ))}
              </div>
            )
          ) : (
            Object.entries(ICON_LIBRARY).map(([category, emojis]) => (
              <div key={category} style={{ marginBottom: '14px' }}>
                <div style={{
                  fontSize: '10px', color: '#475569', fontWeight: '700',
                  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px',
                }}>
                  {category}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                  {emojis.map((emoji, i) => (
                    <EmojiBtn key={i} emoji={emoji} selected={value === emoji}
                      onClick={() => { onChange(emoji); setOpen(false); }} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function EmojiBtn({ emoji, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={emoji}
      style={{
        fontSize: '20px', width: '34px', height: '34px', borderRadius: '7px',
        backgroundColor: selected ? '#3b82f622' : 'transparent',
        border: selected ? '1px solid #3b82f6' : '1px solid transparent',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background-color 0.1s',
      }}
    >
      {emoji}
    </button>
  );
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
    if (file.size > 2 * 1024 * 1024)    { alert('Afbeelding mag maximaal 2 MB zijn.'); return; }
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
          <Upload size={13} />{uploading ? 'Uploaden…' : preview ? 'Vervang afbeelding' : 'Upload afbeelding'}
        </button>
        {preview && (
          <button type="button" onClick={() => { setPreview(''); onUploaded(''); }} style={{ ...bs.ghost, marginLeft: '6px', color: '#ef4444' }}>
            <X size={12} /> Wis
          </button>
        )}
        <p style={{ fontSize: '10px', color: '#475569', margin: '4px 0 0' }}>PNG / JPG · max 2 MB · overschrijft emoji</p>
      </div>
    </div>
  );
}

// ─── Badge Form Modal ─────────────────────────────────────────────────────────
function BadgeFormModal({ badge, clubs, adminClubIds, isSuperAdmin, defaultScope, onSave, onClose }) {
  const isEdit = !!badge?.id;

  const resolvedScope   = isSuperAdmin ? (defaultScope || 'global') : 'club';
  const defaultClubId   = !isSuperAdmin && adminClubIds.length >= 1 ? adminClubIds[0] : null;

  const [form, setForm] = useState(() => {
    if (badge) return { ...EMPTY_BADGE, ...badge };
    return { ...EMPTY_BADGE, scope: resolvedScope, clubId: defaultClubId, type: 'manual' };
  });

  const [triggerKind, setTriggerKind] = useState(detectTriggerKind(badge?.trigger));
  const [tv, setTv] = useState({
    disciplineName: badge?.trigger?.disciplineName || badge?.trigger?.discipline || 'any',
    ropeType:       badge?.trigger?.ropeType       || 'any',
    sessionType:    badge?.trigger?.sessionType    || 'any',
    minScore:         badge?.trigger?.minScore         ?? '',
    totalSessions:    badge?.trigger?.totalSessions    ?? '',
    consecutiveWeeks: badge?.trigger?.consecutiveWeeks ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { alert('Geef de badge een naam.'); return; }
    if (form.scope === 'club' && !form.clubId) { alert('Selecteer een club.'); return; }
    setSaving(true);
    try {
      await onSave({ ...form, trigger: form.type === 'automatic' ? buildTrigger(triggerKind, tv) : null });
      onClose();
    } catch { alert('Opslaan mislukt.'); }
    finally { setSaving(false); }
  };

  const availableClubs = isSuperAdmin ? clubs : clubs.filter(c => adminClubIds.includes(c.id));

  return (
    <div style={s.modalOverlay}>
      <div style={{ ...s.modal, maxHeight: '92vh', overflowY: 'auto', borderRadius: '20px' }}>
        <div style={s.modalHeader}>
          <h3 style={{ margin: 0, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Medal size={18} color="#f59e0b" /> {isEdit ? 'Badge bewerken' : 'Nieuwe badge'}
          </h3>
          <button style={s.iconBtn} onClick={onClose}><X size={18} /></button>
        </div>

        {/* Custom image upload (takes priority over emoji when set) */}
        <label style={s.fieldLabel}>Afbeelding (optioneel — overschrijft emoji)</label>
        <ImageUploader currentUrl={form.imageUrl} onUploaded={url => set('imageUrl', url)} />

        {/* Emoji / Icon picker */}
        <div style={{ marginBottom: '14px' }}>
          <label style={s.fieldLabel}>Icoon (emoji)</label>
          <EmojiPicker value={form.emoji} onChange={(e) => set('emoji', e)} />
        </div>

        {/* Name */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px', marginBottom: '12px' }}>
          <div>
            <label style={s.fieldLabel}>Naam *</label>
            <input style={s.input} value={form.name} onChange={e => set('name', e.target.value)} placeholder="bijv. Club Kampioen" autoFocus />
          </div>
        </div>

        <label style={s.fieldLabel}>Omschrijving</label>
        <textarea style={{ ...s.input, resize: 'vertical', minHeight: '60px', marginBottom: '12px', fontFamily: 'inherit' }} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Wat moet de skipper doen om dit te verdienen?" />

        <label style={s.fieldLabel}>Categorie</label>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {CATEGORIES.map(c => (
            <button key={c.value} type="button" onClick={() => set('category', c.value)}
              style={{ padding: '5px 10px', borderRadius: '14px', border: `1px solid ${form.category === c.value ? CATEGORY_COLORS[c.value] : '#334155'}`, fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', backgroundColor: form.category === c.value ? CATEGORY_COLORS[c.value] + '22' : 'transparent', color: form.category === c.value ? CATEGORY_COLORS[c.value] : '#64748b' }}>
              {c.emoji} {c.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isSuperAdmin ? '1fr 1fr' : '1fr', gap: '10px', marginBottom: '12px' }}>
          <div>
            <label style={s.fieldLabel}>Type</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['automatic', 'manual'].map(t => (
                <button key={t} type="button" onClick={() => set('type', t)}
                  style={{ flex: 1, padding: '8px', borderRadius: '8px', border: `1px solid ${form.type === t ? '#3b82f6' : '#334155'}`, fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', backgroundColor: form.type === t ? '#3b82f622' : 'transparent', color: form.type === t ? '#60a5fa' : '#64748b' }}>
                  {t === 'automatic' ? '🤖 Automatisch' : '👋 Manueel'}
                </button>
              ))}
            </div>
          </div>
          {isSuperAdmin && (
            <div>
              <label style={s.fieldLabel}>Bereik</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                {['global', 'club'].map(sc => (
                  <button key={sc} type="button" onClick={() => set('scope', sc)}
                    style={{ flex: 1, padding: '8px', borderRadius: '8px', border: `1px solid ${form.scope === sc ? '#a78bfa' : '#334155'}`, fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', backgroundColor: form.scope === sc ? '#a78bfa22' : 'transparent', color: form.scope === sc ? '#a78bfa' : '#64748b' }}>
                    {sc === 'global' ? '🌐 Globaal' : '🏟 Club'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {(form.scope === 'club' || !isSuperAdmin) && availableClubs.length > 1 && (
          <>
            <label style={s.fieldLabel}>Club</label>
            <select style={{ ...s.input, marginBottom: '12px' }} value={form.clubId || ''} onChange={e => set('clubId', e.target.value || null)}>
              <option value="">-- Kies club --</option>
              {availableClubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </>
        )}

        {!isSuperAdmin && availableClubs.length === 1 && (
          <div style={{ marginBottom: '12px', padding: '8px 12px', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #334155', fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Building2 size={12} color="#475569" />
            Club: <span style={{ color: '#94a3b8', fontWeight: '600' }}>{availableClubs[0].name}</span>
          </div>
        )}

        {/* ── Automatic trigger ── */}
        {form.type === 'automatic' && (
          <div style={{ backgroundColor: '#0f172a', borderRadius: '10px', padding: '12px', marginBottom: '12px', border: '1px solid #1e293b' }}>
            <label style={{ ...s.fieldLabel, marginBottom: '8px' }}>🎯 Trigger</label>

            <label style={{ ...s.fieldLabel, fontSize: '10px' }}>Trigger type</label>
            <select style={{ ...s.input, marginBottom: '10px' }} value={triggerKind} onChange={e => setTriggerKind(e.target.value)}>
              {TRIGGER_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>

            {/* Discipline name + rope type — shown for score and firstSession */}
            {(triggerKind === 'score' || triggerKind === 'firstSession') && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                <div>
                  <label style={{ ...s.fieldLabel, fontSize: '10px' }}>Discipline</label>
                  <select style={s.input} value={tv.disciplineName} onChange={e => setTv(v => ({ ...v, disciplineName: e.target.value }))}>
                    {DISCIPLINE_NAMES.map(d => <option key={d} value={d}>{d === 'any' ? 'Alle disciplines' : d}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ ...s.fieldLabel, fontSize: '10px' }}>Touw type</label>
                  <select style={s.input} value={tv.ropeType} onChange={e => setTv(v => ({ ...v, ropeType: e.target.value }))}>
                    {ROPE_TYPES.map(r => <option key={r} value={r}>{r === 'any' ? 'SR + DD' : r === 'SR' ? '🪢 Single Rope' : '🌀 Double Dutch'}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* Session type — shown for score and firstSession */}
            {(triggerKind === 'score' || triggerKind === 'firstSession') && (
              <div style={{ marginBottom: '10px' }}>
                <label style={{ ...s.fieldLabel, fontSize: '10px' }}>Sessie type</label>
                <select style={s.input} value={tv.sessionType} onChange={e => setTv(v => ({ ...v, sessionType: e.target.value }))}>
                  {SESSION_TYPES.map(t => <option key={t} value={t}>{t === 'any' ? 'Training + Wedstrijd' : t}</option>)}
                </select>
              </div>
            )}

            {/* Trigger-specific value inputs */}
            {triggerKind === 'score' && (
              <div>
                <label style={{ ...s.fieldLabel, fontSize: '10px' }}>Minimum stappen</label>
                <input type="number" style={s.input} value={tv.minScore} onChange={e => setTv(v => ({ ...v, minScore: e.target.value }))} placeholder="bijv. 80" />
              </div>
            )}
            {triggerKind === 'totalSessions' && (
              <div>
                <label style={{ ...s.fieldLabel, fontSize: '10px' }}>Aantal sessies</label>
                <input type="number" style={s.input} value={tv.totalSessions} onChange={e => setTv(v => ({ ...v, totalSessions: e.target.value }))} placeholder="bijv. 10" />
              </div>
            )}
            {triggerKind === 'consecutiveWeeks' && (
              <div>
                <label style={{ ...s.fieldLabel, fontSize: '10px' }}>Weken op rij</label>
                <input type="number" style={s.input} value={tv.consecutiveWeeks} onChange={e => setTv(v => ({ ...v, consecutiveWeeks: e.target.value }))} placeholder="bijv. 5" />
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' }}>
          <input type="checkbox" id="isActiveBadge" checked={form.isActive} onChange={e => set('isActive', e.target.checked)} />
          <label htmlFor="isActiveBadge" style={{ fontSize: '13px', color: '#94a3b8', cursor: 'pointer' }}>Badge is actief</label>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleSave} disabled={saving} style={{ ...bs.primary, flex: 1, justifyContent: 'center' }}>
            <Check size={15} /> {saving ? 'Opslaan…' : 'Opslaan'}
          </button>
          <button onClick={onClose} style={bs.secondary}><X size={15} /> Annuleren</button>
        </div>
      </div>
    </div>
  );
}

// ─── Award Badge Modal ────────────────────────────────────────────────────────
function AwardBadgeModal({ member, clubId, adminName, onClose }) {
  const [badges,     setBadges]     = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [note,       setNote]       = useState('');
  const [coachName,  setCoachName]  = useState(adminName || 'Coach');
  const [saving,     setSaving]     = useState(false);
  const [done,       setDone]       = useState(false);

  useEffect(() => {
    const u = BadgeFactory.getAll(all =>
      setBadges(all.filter(b => b.type === 'manual' && b.isActive && (b.scope === 'global' || b.clubId === clubId)))
    );
    return () => u();
  }, [clubId]);

  const handleAward = async () => {
    if (!selectedId) { alert('Kies een badge.'); return; }
    setSaving(true);
    const badge = badges.find(b => b.id === selectedId);
    try {
      await BadgeFactory.award(clubId, member.id, badge, coachName, coachName, null, note);
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
          <h3 style={{ margin: 0, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Award size={18} color="#f59e0b" /> Badge uitreiken
          </h3>
          <button style={s.iconBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '14px' }}>
          Aan: <strong style={{ color: '#f1f5f9' }}>{member.firstName} {member.lastName}</strong>
        </p>

        {done ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '44px', marginBottom: '10px' }}>🎉</div>
            <p style={{ color: '#22c55e', fontWeight: '700', margin: 0 }}>Badge uitgereikt!</p>
          </div>
        ) : badges.length === 0 ? (
          <p style={{ color: '#475569', fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>
            Geen manuele badges beschikbaar. Maak eerst badges aan via het "Badges" tabblad.
          </p>
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
              <button onClick={handleAward} disabled={saving || !selectedId} style={{ ...bs.primary, flex: 1, justifyContent: 'center', backgroundColor: '#f59e0b' }}>
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

// ─── Badge Grid ───────────────────────────────────────────────────────────────
function BadgeGrid({ badges, allClubs, isSuperAdmin, canEdit, onEdit }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
      {badges.map(badge => {
        const catColor = CATEGORY_COLORS[badge.category] || '#64748b';
        const club = badge.clubId ? allClubs.find(c => c.id === badge.clubId) : null;

        // Summarise trigger for display
        const triggerSummary = (() => {
          const t = badge.trigger;
          if (!t) return null;
          const parts = [];
          const discLabel = t.disciplineName || t.discipline || '';
          if (discLabel && discLabel !== 'any') parts.push(discLabel);
          if (t.ropeType && t.ropeType !== 'any') parts.push(t.ropeType);
          if (t.minScore         != null) parts.push(`≥ ${t.minScore} stappen`);
          if (t.firstSession)             parts.push('eerste sessie');
          if (t.totalSessions    != null) parts.push(`${t.totalSessions} sessies`);
          if (t.consecutiveWeeks != null) parts.push(`${t.consecutiveWeeks} weken op rij`);
          return parts.join(' · ') || null;
        })();

        return (
          <div key={badge.id} style={{ backgroundColor: '#1e293b', borderRadius: '12px', border: `1px solid ${badge.isActive ? '#334155' : '#1e293b'}`, padding: '14px', opacity: badge.isActive ? 1 : 0.55, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0, backgroundColor: '#0f172a', border: `2px solid ${catColor}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', overflow: 'hidden' }}>
                {badge.imageUrl ? <img src={badge.imageUrl} alt={badge.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : badge.emoji || '🏅'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: '700', fontSize: '13px', color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{badge.name}</div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{badge.description || '—'}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
              <span style={{ padding: '2px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: '600', backgroundColor: catColor + '22', color: catColor, border: `1px solid ${catColor}44` }}>{badge.category}</span>
              <span style={{ padding: '2px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: '600', backgroundColor: '#3b82f622', color: '#60a5fa', border: '1px solid #3b82f644' }}>{badge.type === 'automatic' ? '🤖 Auto' : '👋 Manueel'}</span>
              <span style={{ padding: '2px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: '600', backgroundColor: badge.scope === 'global' ? '#a78bfa22' : '#1e293b', color: badge.scope === 'global' ? '#a78bfa' : '#94a3b8', border: `1px solid ${badge.scope === 'global' ? '#a78bfa33' : '#334155'}` }}>
                {badge.scope === 'global' ? '🌐 Globaal' : `🏟 ${club?.name || 'Club'}`}
              </span>
            </div>

            {triggerSummary && badge.type === 'automatic' && (
              <div style={{ fontSize: '11px', color: '#64748b', backgroundColor: '#0f172a', borderRadius: '6px', padding: '6px 8px' }}>
                {triggerSummary}
              </div>
            )}

            {canEdit && (
              <div style={{ display: 'flex', gap: '6px', marginTop: 'auto' }}>
                <button onClick={() => onEdit(badge)} style={{ ...bs.ghost, flex: 1, justifyContent: 'center' }}>
                  <Edit2 size={12} /> Bewerk
                </button>
                <button onClick={() => BadgeFactory.update(badge.id, { isActive: !badge.isActive })} style={{ ...bs.ghost, flex: 1, justifyContent: 'center', color: badge.isActive ? '#f97316' : '#22c55e' }}>
                  {badge.isActive ? '⛔ Deactiveer' : '✅ Activeer'}
                </button>
                <button onClick={() => { if (confirm(`Verwijder "${badge.name}"?`)) BadgeFactory.delete(badge.id); }} style={{ ...bs.ghost, color: '#ef4444' }}>
                  <Trash2 size={12} />
                </button>
              </div>
            )}

            {!canEdit && (
              <div style={{ marginTop: 'auto', fontSize: '10px', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Shield size={9} /> Alleen lezen
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function BadgeBeheerPage() {
  const { uid, loading: authLoading } = useAuth();
  const [currentUser,   setCurrentUser]   = useState(null);
  const [isSuperAdmin,  setIsSuperAdmin]  = useState(false);
  const [adminClubs,    setAdminClubs]    = useState([]);
  const [allClubs,      setAllClubs]      = useState([]);
  const [activeTab,     setActiveTab]     = useState('club-badges');
  const [bootstrapDone, setBootstrapDone] = useState(false);

  const [badges,            setBadges]            = useState([]);
  const [clubBadgeFilter,   setClubBadgeFilter]   = useState('all');
  const [globalBadgeFilter, setGlobalBadgeFilter] = useState('all');
  const [isBadgeFormOpen,   setIsBadgeFormOpen]   = useState(false);
  const [editingBadge,      setEditingBadge]      = useState(null);
  const [seeding,           setSeeding]           = useState(false);

  const [selectedClubId,  setSelectedClubId]  = useState('');
  const [groups,          setGroups]          = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupMembers,    setGroupMembers]    = useState([]);
  const [clubMembers,     setClubMembers]     = useState([]);
  const [awardTarget,     setAwardTarget]     = useState(null);
  const [memberSearch,    setMemberSearch]    = useState('');

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading || !uid) return;

    const findCoachClubs = async (allClubs) => {
      const found = [];
      const memberIdByClub = {};
      await new Promise(resolve => {
        const unsub = UserMemberLinkFactory.getForUser(uid, (profiles) => {
          unsub();
          profiles.forEach(p => {
            if (p.link.relationship === 'self') memberIdByClub[p.member.clubId] = p.member.id;
          });
          resolve();
        });
      });
      for (const club of allClubs) {
        const memberId = memberIdByClub[club.id];
        if (!memberId) continue;
        const groups = await GroupFactory.getGroupsByClubOnce(club.id);
        for (const group of groups) {
          const members = await GroupFactory.getMembersByGroupOnce(club.id, group.id);
          const me = members.find(m => (m.memberId || m.id) === memberId);
          if (me?.isCoach) { found.push(club); break; }
        }
      }
      return found;
    };

    UserFactory.get(uid).then(snap => {
      if (!snap.exists()) { setBootstrapDone(true); return; }
      const user = { id: uid, ...snap.data() };
      setCurrentUser(user);
      const role = user.role || 'user';

      if (role === 'superadmin') {
        setIsSuperAdmin(true);
        ClubFactory.getAll(clubs => {
          setAllClubs(clubs); setAdminClubs(clubs); setBootstrapDone(true);
        });
      } else if (role === 'clubadmin') {
        ClubFactory.getAll(allClubs => {
          setAllClubs(allClubs);
          findCoachClubs(allClubs).then(found => {
            setAdminClubs(found.length > 0 ? found : allClubs);
            setBootstrapDone(true);
          }).catch(() => { setAdminClubs(allClubs); setBootstrapDone(true); });
        });
      } else {
        ClubFactory.getAll(allClubs => {
          setAllClubs(allClubs);
          findCoachClubs(allClubs).then(found => {
            setAdminClubs(found); setBootstrapDone(true);
          }).catch(() => { setAdminClubs([]); setBootstrapDone(true); });
        });
      }
    });
  }, [uid, authLoading]);

  useEffect(() => {
    if (adminClubs.length === 1 && !selectedClubId) setSelectedClubId(adminClubs[0].id);
  }, [adminClubs]);

  useEffect(() => {
    if (!adminClubs.length) return;
    const adminClubIds = adminClubs.map(c => c.id);
    const u = BadgeFactory.getAll(all => {
      const visible = isSuperAdmin ? all : all.filter(b => b.scope === 'global' || adminClubIds.includes(b.clubId));
      setBadges(visible);
    });
    return () => u();
  }, [adminClubs, isSuperAdmin]);

  useEffect(() => {
    if (!selectedClubId) return;
    const u = GroupFactory.getGroupsByClub(selectedClubId, setGroups);
    return () => u();
  }, [selectedClubId]);

  useEffect(() => {
    if (!selectedClubId || !selectedGroupId) return;
    const u1 = GroupFactory.getMembersByGroup(selectedClubId, selectedGroupId, setGroupMembers);
    const u2 = ClubMemberFactory.getAll(selectedClubId, setClubMembers);
    return () => { u1(); u2(); };
  }, [selectedClubId, selectedGroupId]);

  const handleBadgeSave = async (data) => {
    if (data.id) { const { id, ...rest } = data; await BadgeFactory.update(id, rest); }
    else await BadgeFactory.create(data);
  };

  const handleSeedBadges = async () => {
    if (!confirm('Standaard badges toevoegen op basis van de IJRU disciplines? Bestaande badges met dezelfde naam worden overgeslagen.')) return;
    setSeeding(true);
    try { await BadgeFactory.seedDefaults(); }
    catch (e) { alert('Seeden mislukt: ' + e.message); }
    finally { setSeeding(false); }
  };

  const adminClubIds = adminClubs.map(c => c.id);
  const adminName    = currentUser ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() : 'Coach';

  const applyFilter = (list, filter) => list.filter(b => {
    if (filter === 'automatic') return b.type === 'automatic';
    if (filter === 'manual')    return b.type === 'manual';
    if (filter === 'inactive')  return !b.isActive;
    if (filter === 'active')    return b.isActive;
    return true;
  });

  const allClubBadges   = badges.filter(b => b.scope === 'club');
  const allGlobalBadges = badges.filter(b => b.scope === 'global');
  const clubBadges      = applyFilter(allClubBadges,   clubBadgeFilter);
  const globalBadges    = applyFilter(allGlobalBadges, globalBadgeFilter);

  const filteredMembers = clubMembers.filter(m =>
    `${m.firstName} ${m.lastName}`.toLowerCase().includes(memberSearch.toLowerCase())
  );

  if (authLoading || !bootstrapDone) return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{pageCSS}</style>
      <div style={s.spinner} />
    </div>
  );

  const hasAccess = isSuperAdmin || currentUser?.role === 'clubadmin' || adminClubs.length > 0;

  if (!hasAccess) return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', fontFamily: 'system-ui,sans-serif' }}>
      <Award size={40} color="#334155" />
      <p style={{ color: '#ef4444', fontSize: '16px', fontWeight: '700' }}>Geen toegang</p>
      <a href="/" style={{ padding: '10px 20px', backgroundColor: '#3b82f6', color: 'white', borderRadius: '8px', textDecoration: 'none', fontWeight: '600', fontSize: '14px' }}>Terug naar home</a>
    </div>
  );

  const tabs = [
    { key: 'club-badges',   label: 'Club badges',    icon: Medal  },
    { key: 'global-badges', label: 'Globale badges', icon: Shield },
    { key: 'uitreiken',     label: 'Uitreiken',      icon: Award  },
  ];

  return (
    <div style={s.page}>
      <style>{pageCSS}</style>

      <header style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '34px', height: '34px', borderRadius: '9px', backgroundColor: '#a78bfa22', border: '1px solid #a78bfa44', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Award size={17} color="#a78bfa" />
          </div>
          <div>
            <div style={{ fontWeight: '800', fontSize: '15px', color: '#f1f5f9' }}>Badge Beheer</div>
            <div style={{ fontSize: '10px', color: '#475569' }}>Aanmaken & uitreiken</div>
          </div>
        </div>
      </header>

      <div style={{ backgroundColor: '#1e293b', borderBottom: '1px solid #334155', display: 'flex' }}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '12px 8px', background: 'none', border: 'none', borderBottom: `2px solid ${isActive ? '#a78bfa' : 'transparent'}`, cursor: 'pointer' }}>
              <Icon size={20} color={isActive ? '#a78bfa' : '#475569'} />
              <span style={{ fontSize: '12px', fontWeight: isActive ? '700' : '500', color: isActive ? '#a78bfa' : '#64748b' }}>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div style={s.content}>

        {/* ══ CLUB BADGES ══ */}
        {activeTab === 'club-badges' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ fontWeight: '800', fontSize: '16px', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Medal size={18} color="#f59e0b" /> Club badges
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  {allClubBadges.filter(b => b.isActive).length} actief · {allClubBadges.length} totaal
                </div>
              </div>
              <button onClick={() => { setEditingBadge(null); setIsBadgeFormOpen(true); }} style={bs.primary}>
                <Plus size={15} /> Nieuwe badge
              </button>
            </div>

            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
              {[['all', 'Alle'], ['active', '✅ Actief'], ['automatic', '🤖 Auto'], ['manual', '👋 Manueel'], ['inactive', '⛔ Inactief']].map(([v, l]) => (
                <button key={v} onClick={() => setClubBadgeFilter(v)} style={{ padding: '5px 10px', borderRadius: '14px', border: `1px solid ${clubBadgeFilter === v ? '#f59e0b' : '#334155'}`, fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', backgroundColor: clubBadgeFilter === v ? '#f59e0b22' : 'transparent', color: clubBadgeFilter === v ? '#f59e0b' : '#64748b' }}>
                  {l}
                </button>
              ))}
            </div>

            {allClubBadges.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <Medal size={40} color="#334155" style={{ marginBottom: '12px' }} />
                <p style={{ color: '#475569', fontSize: '14px', marginBottom: '16px' }}>Nog geen club badges.</p>
                <button onClick={() => { setEditingBadge(null); setIsBadgeFormOpen(true); }} style={bs.primary}>
                  <Plus size={15} /> Eerste badge aanmaken
                </button>
              </div>
            ) : clubBadges.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <p style={{ color: '#475569', fontSize: '13px' }}>Geen badges voor dit filter.</p>
              </div>
            ) : (
              <BadgeGrid badges={clubBadges} allClubs={allClubs} isSuperAdmin={isSuperAdmin} canEdit={true}
                onEdit={badge => { setEditingBadge(badge); setIsBadgeFormOpen(true); }}
              />
            )}
          </div>
        )}

        {/* ══ GLOBALE BADGES ══ */}
        {activeTab === 'global-badges' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ fontWeight: '800', fontSize: '16px', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Shield size={18} color="#a78bfa" /> Globale badges
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  {allGlobalBadges.filter(b => b.isActive).length} actief · {allGlobalBadges.length} totaal
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {isSuperAdmin && (
                  <>
                    <button onClick={handleSeedBadges} disabled={seeding} style={bs.secondary}>
                      {seeding ? '🌱 Bezig…' : '🌱 Standaard badges laden'}
                    </button>
                    <button onClick={() => { setEditingBadge(null); setIsBadgeFormOpen(true); }} style={bs.primary}>
                      <Plus size={15} /> Nieuwe badge
                    </button>
                  </>
                )}
              </div>
            </div>

            {!isSuperAdmin && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#a78bfa11', border: '1px solid #a78bfa33', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', fontSize: '12px', color: '#a78bfa' }}>
                <Shield size={13} style={{ flexShrink: 0 }} />
                Globale badges worden beheerd door de systeembeheerder. Je kunt ze hier bekijken als referentie.
              </div>
            )}

            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
              {[['all', 'Alle'], ['active', '✅ Actief'], ['automatic', '🤖 Auto'], ['manual', '👋 Manueel'], ['inactive', '⛔ Inactief']].map(([v, l]) => (
                <button key={v} onClick={() => setGlobalBadgeFilter(v)} style={{ padding: '5px 10px', borderRadius: '14px', border: `1px solid ${globalBadgeFilter === v ? '#a78bfa' : '#334155'}`, fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', backgroundColor: globalBadgeFilter === v ? '#a78bfa22' : 'transparent', color: globalBadgeFilter === v ? '#a78bfa' : '#64748b' }}>
                  {l}
                </button>
              ))}
            </div>

            {allGlobalBadges.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <Shield size={40} color="#334155" style={{ marginBottom: '12px' }} />
                <p style={{ color: '#475569', fontSize: '14px', marginBottom: isSuperAdmin ? '16px' : '0' }}>Geen globale badges gevonden.</p>
                {isSuperAdmin && (
                  <button onClick={handleSeedBadges} disabled={seeding} style={bs.primary}>
                    🌱 {seeding ? 'Bezig…' : 'Standaard badges laden'}
                  </button>
                )}
              </div>
            ) : globalBadges.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <p style={{ color: '#475569', fontSize: '13px' }}>Geen badges voor dit filter.</p>
              </div>
            ) : (
              <BadgeGrid badges={globalBadges} allClubs={allClubs} isSuperAdmin={isSuperAdmin} canEdit={isSuperAdmin}
                onEdit={badge => { setEditingBadge(badge); setIsBadgeFormOpen(true); }}
              />
            )}
          </div>
        )}

        {/* ══ UITREIKEN ══ */}
        {activeTab === 'uitreiken' && (
          <div>
            <div style={{ fontWeight: '800', fontSize: '16px', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Award size={18} color="#f59e0b" /> Badges uitreiken
            </div>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
              Kies een club, groep en lid om een manuele badge uit te reiken.
            </p>

            {adminClubs.length > 1 && (
              <div style={{ marginBottom: '14px' }}>
                <label style={s.fieldLabel}><Building2 size={12} style={{ verticalAlign: 'middle', marginRight: '5px' }} />Club</label>
                <select style={s.select} value={selectedClubId} onChange={e => { setSelectedClubId(e.target.value); setSelectedGroupId(''); setGroupMembers([]); }}>
                  <option value="">-- Kies een club --</option>
                  {adminClubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}

            {selectedClubId && (
              <div style={{ marginBottom: '14px' }}>
                <label style={s.fieldLabel}><Users size={12} style={{ verticalAlign: 'middle', marginRight: '5px' }} />Groep (optioneel)</label>
                <select style={s.select} value={selectedGroupId} onChange={e => setSelectedGroupId(e.target.value)}>
                  <option value="">-- Alle leden --</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            )}

            {selectedClubId && (
              <>
                <div style={{ position: 'relative', marginBottom: '14px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                  <input placeholder="Zoek op naam…" value={memberSearch} onChange={e => setMemberSearch(e.target.value)} style={{ ...s.input, paddingLeft: '32px' }} />
                </div>

                {filteredMembers.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: '#475569' }}>
                    <Users size={32} color="#334155" style={{ marginBottom: '10px' }} />
                    <p style={{ fontSize: '13px', margin: 0 }}>Geen leden gevonden.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {filteredMembers.map(member => {
                      const initials = `${member.firstName?.[0] || '?'}${member.lastName?.[0] || ''}`.toUpperCase();
                      return (
                        <div key={member.id} onClick={() => setAwardTarget(member)}
                          style={{ backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                          <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#f59e0b22', border: '1px solid #f59e0b44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '13px', color: '#fbbf24', flexShrink: 0 }}>
                            {initials}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: '600', fontSize: '14px', color: '#f1f5f9' }}>{member.firstName} {member.lastName}</div>
                            {member.notes && <div style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>{member.notes}</div>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#f59e0b', fontSize: '12px', fontWeight: '600', flexShrink: 0 }}>
                            <Award size={14} /> Uitreiken
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {!selectedClubId && adminClubs.length > 1 && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#475569' }}>
                <Building2 size={40} color="#334155" style={{ marginBottom: '12px' }} />
                <p style={{ fontSize: '14px', margin: 0 }}>Selecteer een club om leden te zien.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {isBadgeFormOpen && (
        <BadgeFormModal
          badge={editingBadge}
          clubs={allClubs}
          adminClubIds={adminClubIds}
          isSuperAdmin={isSuperAdmin}
          defaultScope={activeTab === 'global-badges' ? 'global' : 'club'}
          onSave={handleBadgeSave}
          onClose={() => { setIsBadgeFormOpen(false); setEditingBadge(null); }}
        />
      )}

      {awardTarget && (
        <AwardBadgeModal
          member={awardTarget}
          clubId={selectedClubId}
          adminName={adminName}
          onClose={() => setAwardTarget(null)}
        />
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const pageCSS = `
  * { box-sizing: border-box; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

const bs = {
  primary:   { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', backgroundColor: '#a78bfa', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' },
  secondary: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '8px', color: '#94a3b8', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' },
  ghost:     { display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 8px', backgroundColor: 'transparent', border: 'none', borderRadius: '6px', color: '#64748b', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' },
};

const s = {
  page:         { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'system-ui, sans-serif' },
  spinner:      { width: '36px', height: '36px', border: '3px solid #1e293b', borderTop: '3px solid #a78bfa', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  header:       { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: '#1e293b', borderBottom: '1px solid #334155', position: 'sticky', top: 0, zIndex: 50 },
  content:      { maxWidth: '800px', margin: '0 auto', padding: '20px 16px 40px' },
  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 500 },
  modal:        { backgroundColor: '#1e293b', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '560px', border: '1px solid #334155', maxHeight: '90vh', overflowY: 'auto' },
  modalHeader:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', color: '#f1f5f9' },
  iconBtn:      { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' },
  fieldLabel:   { display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px', fontWeight: '600' },
  input:        { width: '100%', padding: '11px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px' },
  select:       { width: '100%', padding: '11px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px' },
};
