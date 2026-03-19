import { useState, useEffect } from 'react';
import {
  AnnouncementFactory, ClubFactory, GroupFactory,
  UserFactory, UserMemberLinkFactory,
} from '../constants/dbSchema';
import { useAuth } from '../contexts/AuthContext';
import {
  Megaphone, Plus, Trash2, Pin, X, ChevronDown, ChevronUp,
  Building2, Users, AlertTriangle, Bell, Edit2, Send,
  Calendar, Clock, Globe, Shield,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────
export const ANNOUNCEMENT_TYPES = {
  info:     { label: 'Informatie',  color: '#3b82f6', bg: '#3b82f618', emoji: 'ℹ️' },
  cancel:   { label: 'Geannuleerd', color: '#ef4444', bg: '#ef444418', emoji: '❌' },
  reminder: { label: 'Herinnering', color: '#f59e0b', bg: '#f59e0b18', emoji: '🔔' },
  result:   { label: 'Resultaat',   color: '#22c55e', bg: '#22c55e18', emoji: '🏆' },
};

// Special groupId tokens used for superAdmin broadcasts
const BROADCAST_ALL       = '__ALL_USERS__';
const BROADCAST_CLUBADMIN = '__ALL_CLUBADMINS__';

// ─── Date helpers ─────────────────────────────────────────────────────────────
const toDateStr  = (d) => d.toISOString().slice(0, 10);          // → YYYY-MM-DD
const todayStr   = ()  => toDateStr(new Date());
const plusDays   = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return toDateStr(d); };

const fmtDate = (val) => {
  if (!val) return '—';
  const ms = val?.seconds ? val.seconds * 1000 : new Date(val).getTime();
  if (isNaN(ms)) return '—';
  return new Date(ms).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Is the announcement currently visible (after start, before expiry)?
const isLive = (ann) => {
  const now = Date.now();
  if (ann.startsAt) {
    const ms = ann.startsAt?.seconds ? ann.startsAt.seconds * 1000 : new Date(ann.startsAt).getTime();
    if (!isNaN(ms) && ms > now) return false;
  }
  if (ann.expiresAt) {
    const ms = ann.expiresAt?.seconds ? ann.expiresAt.seconds * 1000 : new Date(ann.expiresAt).getTime();
    if (!isNaN(ms) && ms < now) return false;
  }
  return true;
};

// ─── Helper: group IDs the given member belongs to (one-shot) ─────────────────
async function resolveGroupIdsForMember(clubId, memberId) {
  return new Promise((resolve) => {
    const gids = [];
    const unsub = GroupFactory.getGroupsByClub(clubId, async (groups) => {
      unsub();
      await Promise.all(groups.map(group =>
        new Promise(res => {
          const u = GroupFactory.getMembersByGroup(clubId, group.id, (members) => {
            u();
            if (members.some(m => (m.memberId || m.id) === memberId)) gids.push(group.id);
            res();
          });
        })
      ));
      resolve(gids);
    });
  });
}

// ─── AnnouncementCard ─────────────────────────────────────────────────────────
function AnnouncementCard({ ann, canEdit, onEdit, onDelete, onTogglePin, showStatus }) {
  const [expanded, setExpanded] = useState(false);
  const cfg     = ANNOUNCEMENT_TYPES[ann.type] || ANNOUNCEMENT_TYPES.info;
  const live    = isLive(ann);
  const preview = (ann.body || '').split('\n')[0] || '';
  const hasMore = (ann.body || '').length > 120 || (ann.body || '').includes('\n');
  const isBroadcast = ann.groupIds?.includes(BROADCAST_ALL) || ann.groupIds?.includes(BROADCAST_CLUBADMIN);

  return (
    <div style={{
      backgroundColor: '#1e293b', borderRadius: '14px',
      border: `1px solid ${ann.pinned ? cfg.color + '55' : '#334155'}`,
      overflow: 'hidden', opacity: showStatus && !live ? 0.55 : 1,
    }}>
      <div style={{ height: '3px', backgroundColor: cfg.color }} />
      <div style={{ padding: '14px 16px' }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px',
            backgroundColor: cfg.bg, border: `1px solid ${cfg.color}44`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '18px', flexShrink: 0,
          }}>
            {cfg.emoji}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap', marginBottom: '3px' }}>
              {ann.pinned && (
                <span style={{ ...st.chip, backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}44` }}>
                  <Pin size={8} /> Vastgepind
                </span>
              )}
              <span style={{ ...st.chip, backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33` }}>
                {cfg.label}
              </span>
              {isBroadcast && (
                <span style={{ ...st.chip, backgroundColor: '#7c3aed22', color: '#a78bfa', border: '1px solid #a78bfa33' }}>
                  <Globe size={8} /> Broadcast
                </span>
              )}
              {showStatus && (
                <span style={{
                  ...st.chip,
                  backgroundColor: live ? '#22c55e22' : '#ef444422',
                  color: live ? '#22c55e' : '#ef4444',
                  border: `1px solid ${live ? '#22c55e33' : '#ef444433'}`,
                }}>
                  {live ? '● Actief' : '○ Inactief'}
                </span>
              )}
            </div>
            <div style={{ fontWeight: '700', fontSize: '14px', color: '#f1f5f9', lineHeight: 1.3 }}>
              {ann.title}
            </div>
          </div>
          {canEdit && (
            <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
              <button onClick={() => onTogglePin(ann)} title={ann.pinned ? 'Losmaken' : 'Vastpinnen'}
                style={{ ...bs.ghost, color: ann.pinned ? cfg.color : '#475569', padding: '5px' }}>
                <Pin size={13} />
              </button>
              <button onClick={() => onEdit(ann)}   style={{ ...bs.ghost, padding: '5px' }}><Edit2  size={13} /></button>
              <button onClick={() => onDelete(ann)} style={{ ...bs.ghost, color: '#ef4444', padding: '5px' }}><Trash2 size={13} /></button>
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ paddingLeft: '46px' }}>
          <div style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
            {expanded ? ann.body : (hasMore ? preview.slice(0, 120) + '…' : ann.body)}
          </div>
          {hasMore && (
            <button onClick={() => setExpanded(v => !v)}
              style={{ ...bs.ghost, fontSize: '11px', color: '#475569', padding: '4px 0', marginTop: '4px', gap: '3px' }}>
              {expanded ? <><ChevronUp size={11} /> Minder</> : <><ChevronDown size={11} /> Meer tonen</>}
            </button>
          )}
          {/* Meta */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '8px', fontSize: '10px', color: '#475569' }}>
            <span>{ann.authorName || 'Coach'} · {fmtDate(ann.createdAt)}</span>
            {ann.startsAt  && <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Calendar size={9} /> Vanaf {fmtDate(ann.startsAt)}</span>}
            {ann.expiresAt && <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Clock    size={9} /> Verloopt {fmtDate(ann.expiresAt)}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Compose / Edit Modal ─────────────────────────────────────────────────────
// managedClubs      : [{ id, name }]
// coachGroupsByClub : { [clubId]: [{ id, name }] | null }  (null = all groups)
// isSuperAdmin      : boolean
function ComposeModal({ editing, managedClubs, coachGroupsByClub, isSuperAdmin, onSave, onClose }) {
  const firstClub = managedClubs[0] || null;

  const initExpiresAt = () => {
    if (editing?.expiresAt) {
      return editing.expiresAt?.seconds
        ? toDateStr(new Date(editing.expiresAt.seconds * 1000))
        : editing.expiresAt;
    }
    return plusDays(30);
  };
  const initStartsAt = () => {
    if (editing?.startsAt) {
      return editing.startsAt?.seconds
        ? toDateStr(new Date(editing.startsAt.seconds * 1000))
        : editing.startsAt;
    }
    return todayStr();
  };

  const [form, setForm] = useState({
    clubId:    editing?.clubId   || firstClub?.id || '',
    groupIds:  editing?.groupIds || [],
    title:     editing?.title    || '',
    body:      editing?.body     || '',
    type:      editing?.type     || 'info',
    pinned:    editing?.pinned   || false,
    startsAt:  initStartsAt(),
    expiresAt: initExpiresAt(),
  });
  const [groups, setGroups] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const isBroadcastAll    = form.groupIds.includes(BROADCAST_ALL);
  const isBroadcastAdmin  = form.groupIds.includes(BROADCAST_CLUBADMIN);

  // Load groups for selected club
  useEffect(() => {
    if (!form.clubId) { setGroups([]); return; }
    const available = coachGroupsByClub[form.clubId]; // null | array
    if (available !== null && available !== undefined) {
      setGroups(available);
      return;
    }
    // admin / superadmin → all groups
    const unsub = GroupFactory.getGroupsByClub(form.clubId, setGroups);
    return () => unsub();
  }, [form.clubId, coachGroupsByClub]);

  // Auto-select when only one group
  useEffect(() => {
    if (groups.length === 1 && form.groupIds.length === 0) setF('groupIds', [groups[0].id]);
  }, [groups]);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleGroup = (gid) => {
    if (gid === BROADCAST_ALL || gid === BROADCAST_CLUBADMIN) {
      // Broadcast targets are mutually exclusive with regular groups
      setF('groupIds', form.groupIds.includes(gid) ? [] : [gid]);
      return;
    }
    // Regular group — strip any broadcast tokens
    const clean = form.groupIds.filter(id => id !== BROADCAST_ALL && id !== BROADCAST_CLUBADMIN);
    setF('groupIds', clean.includes(gid) ? clean.filter(id => id !== gid) : [...clean, gid]);
  };

  const handleSave = async () => {
    setError('');
    if (!form.title.trim())         { setError('Geef de aankondiging een titel.');     return; }
    if (!form.body.trim())          { setError('Inhoud mag niet leeg zijn.');          return; }
    if (!form.clubId)               { setError('Kies een club.');                      return; }
    if (form.groupIds.length === 0) { setError('Kies minstens één doelgroep.');       return; }
    if (form.expiresAt && form.startsAt && form.expiresAt < form.startsAt) {
      setError('Vervaldatum mag niet vóór de startdatum liggen.');
      return;
    }
    setSaving(true);
    try { await onSave(form); onClose(); }
    catch (e) { console.error(e); setError('Opslaan mislukt. Probeer opnieuw.'); }
    finally   { setSaving(false); }
  };

  return (
    <div style={m.overlay}>
      <div style={{ ...m.sheet, maxHeight: '94vh', overflowY: 'auto' }}>
        <div style={m.header}>
          <h3 style={{ margin: 0, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: '#f1f5f9' }}>
            <Megaphone size={18} color="#a78bfa" />
            {editing ? 'Bericht bewerken' : 'Nieuw bericht'}
          </h3>
          <button style={bs.icon} onClick={onClose}><X size={18} /></button>
        </div>

        {/* Club */}
        {managedClubs.length > 1 && (
          <div style={m.field}>
            <label style={m.label}><Building2 size={10} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Club *</label>
            <select style={m.select} value={form.clubId}
              onChange={e => { setF('clubId', e.target.value); setF('groupIds', []); }}>
              <option value="">-- Kies club --</option>
              {managedClubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {/* Target groups */}
        {form.clubId && (
          <div style={m.field}>
            <label style={m.label}><Users size={10} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Doelgroep(en) *</label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {groups.map(g => {
                const sel = form.groupIds.includes(g.id);
                return (
                  <button key={g.id} type="button" onClick={() => toggleGroup(g.id)} style={{
                    ...st.groupChip,
                    borderColor:     sel ? '#a78bfa' : '#334155',
                    backgroundColor: sel ? '#a78bfa22' : 'transparent',
                    color:           sel ? '#a78bfa'  : '#64748b',
                  }}>
                    {g.name}
                  </button>
                );
              })}
              {/* SuperAdmin broadcast */}
              {isSuperAdmin && (
                <>
                  <button type="button" onClick={() => toggleGroup(BROADCAST_ALL)} style={{
                    ...st.groupChip,
                    borderColor:     isBroadcastAll ? '#f59e0b' : '#334155',
                    backgroundColor: isBroadcastAll ? '#f59e0b22' : 'transparent',
                    color:           isBroadcastAll ? '#f59e0b'  : '#64748b',
                  }}>
                    <Globe size={10} /> Alle gebruikers
                  </button>
                  <button type="button" onClick={() => toggleGroup(BROADCAST_CLUBADMIN)} style={{
                    ...st.groupChip,
                    borderColor:     isBroadcastAdmin ? '#a78bfa' : '#334155',
                    backgroundColor: isBroadcastAdmin ? '#a78bfa22' : 'transparent',
                    color:           isBroadcastAdmin ? '#a78bfa'  : '#64748b',
                  }}>
                    <Shield size={10} /> Alle clubbeheerders
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Type */}
        <div style={m.field}>
          <label style={m.label}>Type *</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {Object.entries(ANNOUNCEMENT_TYPES).map(([key, cfg]) => (
              <button key={key} type="button" onClick={() => setF('type', key)} style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '6px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: '600',
                cursor: 'pointer', fontFamily: 'inherit',
                border:          `1px solid ${form.type === key ? cfg.color : '#334155'}`,
                backgroundColor: form.type === key ? cfg.bg : 'transparent',
                color:           form.type === key ? cfg.color : '#64748b',
              }}>
                {cfg.emoji} {cfg.label}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div style={m.field}>
          <label style={m.label}>Titel *</label>
          <input style={m.input} placeholder="bijv. Training geannuleerd zaterdag 22 maart"
            value={form.title} onChange={e => setF('title', e.target.value)} autoFocus />
        </div>

        {/* Body */}
        <div style={m.field}>
          <label style={m.label}>Bericht *</label>
          <textarea style={{ ...m.input, minHeight: '90px', resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit' }}
            placeholder="Schrijf hier het volledige bericht…"
            value={form.body} onChange={e => setF('body', e.target.value)} />
        </div>

        {/* Dates */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
          <div>
            <label style={m.label}>
              <Calendar size={10} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
              Zichtbaar vanaf *
            </label>
            <input type="date" style={m.input} value={form.startsAt}
              onChange={e => {
                const v = e.target.value;
                setF('startsAt', v);
                if (form.expiresAt && form.expiresAt < v) setF('expiresAt', v);
              }}
            />
          </div>
          <div>
            <label style={m.label}>
              <Clock size={10} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
              Vervaldatum *
            </label>
            <input type="date" style={m.input} value={form.expiresAt}
              min={form.startsAt || todayStr()}
              onChange={e => setF('expiresAt', e.target.value)}
            />
          </div>
        </div>

        {/* Pinned */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' }}>
          <input type="checkbox" id="isPinned" checked={form.pinned} onChange={e => setF('pinned', e.target.checked)} />
          <label htmlFor="isPinned" style={{ fontSize: '13px', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Pin size={12} color="#a78bfa" /> Boven aan vastpinnen
          </label>
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#ef444422', color: '#ef4444', fontSize: '13px', padding: '10px 12px', borderRadius: '8px', marginBottom: '14px', border: '1px solid #ef444433' }}>
            <AlertTriangle size={13} /> {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleSave} disabled={saving} style={{ ...bs.primary, flex: 1, justifyContent: 'center' }}>
            <Send size={14} /> {saving ? 'Opslaan…' : editing ? 'Wijzigingen opslaan' : 'Publiceren'}
          </button>
          <button onClick={onClose} style={bs.secondary}><X size={14} /> Annuleren</button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Mijn Berichten ──────────────────────────────────────────────────────
function MyMessagesTab({ memberGroupIds, announcements, loading }) {
  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
      <div style={sp.spinner} />
    </div>
  );

  if (memberGroupIds.length === 0) return (
    <div style={sp.empty}>
      <Bell size={40} color="#334155" style={{ marginBottom: '12px' }} />
      <p style={{ color: '#475569', fontSize: '14px' }}>Je bent nog niet gekoppeld aan een groep.</p>
    </div>
  );

  const visible = announcements.filter(isLive);

  if (visible.length === 0) return (
    <div style={sp.empty}>
      <Bell size={40} color="#334155" style={{ marginBottom: '12px' }} />
      <p style={{ color: '#475569', fontSize: '14px' }}>Geen actieve berichten voor jou.</p>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {visible.map(ann => (
        <AnnouncementCard key={ann.id} ann={ann} canEdit={false}
          onEdit={() => {}} onDelete={() => {}} onTogglePin={() => {}} showStatus={false} />
      ))}
    </div>
  );
}

// ─── Tab: Beheer Berichten ────────────────────────────────────────────────────
function ManageMessagesTab({ managedClubs, coachGroupsByClub, isSuperAdmin, uid, authorName }) {
  const [selectedClubId,  setSelectedClubId]  = useState(managedClubs.length === 1 ? managedClubs[0].id : '');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groups,          setGroups]          = useState([]);
  const [announcements,   setAnnouncements]   = useState([]);
  const [composeOpen,     setComposeOpen]     = useState(false);
  const [editingAnn,      setEditingAnn]      = useState(null);
  const [filter,          setFilter]          = useState('all'); // 'all'|'active'|'inactive'

  // Groups for selected club
  useEffect(() => {
    if (!selectedClubId) { setGroups([]); setSelectedGroupId(''); return; }
    const available = coachGroupsByClub[selectedClubId]; // null | array
    if (available !== null && available !== undefined) {
      setGroups(available);
      if (available.length === 1) setSelectedGroupId(available[0].id);
      return;
    }
    const unsub = GroupFactory.getGroupsByClub(selectedClubId, (gs) => {
      setGroups(gs);
      if (gs.length === 1) setSelectedGroupId(gs[0].id);
    });
    return () => unsub();
  }, [selectedClubId, coachGroupsByClub]);

  // Announcements for selected group
  useEffect(() => {
    if (!selectedClubId || !selectedGroupId) { setAnnouncements([]); return; }
    const unsub = AnnouncementFactory.subscribeForGroup(selectedClubId, selectedGroupId, setAnnouncements);
    return () => unsub();
  }, [selectedClubId, selectedGroupId]);

const handleSave = async (form) => {
  const payload = {
    title:    form.title,
    body:     form.body,
    type:     form.type,
    clubId:   form.clubId,
    groupIds: form.groupIds,
    pinned:   form.pinned,
    startsAt:  form.startsAt  || null,
    expiresAt: form.expiresAt || null,
  };
 
  if (editingAnn) {
    // Silent update — no push notification
    await AnnouncementFactory.update(editingAnn.id, payload);
  } else {
    // New announcement — save then push
    await AnnouncementFactory.create(payload, uid, authorName);
 
    // Fire-and-forget push — don't let a push failure block the UI
    fetch('/api/push/send', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title:    form.title,
        body:     (form.body || '').split('\n')[0].slice(0, 120), // first line, max 120 chars
        groupIds: form.groupIds,
        clubId:   form.clubId,
        url:      '/announcements',
      }),
    }).catch(err => console.warn('[push] Failed to trigger push notification:', err));
  }
 
  setEditingAnn(null);
};

  const handleDelete     = async (ann) => { if (!confirm(`"${ann.title}" verwijderen?`)) return; await AnnouncementFactory.delete(ann.id); };
  const handleTogglePin  = async (ann) => { await AnnouncementFactory.pin(ann.id, !ann.pinned); };

  const selectedClub  = managedClubs.find(c => c.id === selectedClubId);
  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  const filtered = announcements.filter(ann =>
    filter === 'active'   ? isLive(ann)  :
    filter === 'inactive' ? !isLive(ann) : true
  );

  return (
    <div>
      {/* Club selector */}
      {managedClubs.length > 1 && (
        <div style={{ marginBottom: '16px' }}>
          <label style={sp.label}><Building2 size={11} style={{ verticalAlign: 'middle', marginRight: '5px' }} />Club</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {managedClubs.map(c => (
              <button key={c.id} onClick={() => { setSelectedClubId(c.id); setSelectedGroupId(''); }}
                style={{
                  ...st.groupChip,
                  borderColor:     selectedClubId === c.id ? '#3b82f6' : '#334155',
                  backgroundColor: selectedClubId === c.id ? '#3b82f622' : 'transparent',
                  color:           selectedClubId === c.id ? '#60a5fa'  : '#64748b',
                }}>
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Group selector */}
      {selectedClubId && groups.length > 1 && (
        <div style={{ marginBottom: '16px' }}>
          <label style={sp.label}><Users size={11} style={{ verticalAlign: 'middle', marginRight: '5px' }} />Groep</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {groups.map(g => (
              <button key={g.id} onClick={() => setSelectedGroupId(g.id)} style={{
                ...st.groupChip,
                borderColor:     selectedGroupId === g.id ? '#a78bfa' : '#334155',
                backgroundColor: selectedGroupId === g.id ? '#a78bfa22' : 'transparent',
                color:           selectedGroupId === g.id ? '#a78bfa'  : '#64748b',
              }}>
                {g.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Prompt */}
      {(!selectedClubId || !selectedGroupId) && (
        <div style={sp.empty}>
          <Users size={36} color="#334155" style={{ marginBottom: '12px' }} />
          <p style={{ color: '#475569', fontSize: '14px' }}>
            {!selectedClubId ? 'Selecteer een club.' : 'Selecteer een groep.'}
          </p>
        </div>
      )}

      {/* Messages list */}
      {selectedClubId && selectedGroupId && (
        <>
          {/* Toolbar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>
              {selectedClub?.name} · {selectedGroup?.name} · {announcements.length} bericht{announcements.length !== 1 ? 'en' : ''}
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[['all', 'Alle'], ['active', 'Actief'], ['inactive', 'Inactief']].map(([k, l]) => (
                <button key={k} onClick={() => setFilter(k)} style={{
                  padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600',
                  cursor: 'pointer', fontFamily: 'inherit',
                  border:          `1px solid ${filter === k ? '#a78bfa' : '#334155'}`,
                  backgroundColor: filter === k ? '#a78bfa22' : 'transparent',
                  color:           filter === k ? '#a78bfa'  : '#64748b',
                }}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div style={sp.empty}>
              <Megaphone size={36} color="#334155" style={{ marginBottom: '12px' }} />
              <p style={{ color: '#475569', fontSize: '14px', margin: '0 0 16px' }}>
                {filter === 'all'
                  ? 'Nog geen berichten voor deze groep.'
                  : `Geen ${filter === 'active' ? 'actieve' : 'inactieve'} berichten.`}
              </p>
              {filter === 'all' && (
                <button onClick={() => { setEditingAnn(null); setComposeOpen(true); }} style={bs.primary}>
                  <Plus size={14} /> Eerste bericht maken
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filtered.map(ann => (
                <AnnouncementCard key={ann.id} ann={ann} canEdit showStatus
                  onEdit={a => { setEditingAnn(a); setComposeOpen(true); }}
                  onDelete={handleDelete}
                  onTogglePin={handleTogglePin}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Floating action button */}
      {selectedClubId && selectedGroupId && (
        <button onClick={() => { setEditingAnn(null); setComposeOpen(true); }} style={st.fab} title="Nieuw bericht">
          <Plus size={22} color="white" />
        </button>
      )}

      {/* Compose / edit modal */}
      {composeOpen && (
        <ComposeModal
          editing={editingAnn}
          managedClubs={managedClubs}
          coachGroupsByClub={coachGroupsByClub}
          isSuperAdmin={isSuperAdmin}
          onSave={handleSave}
          onClose={() => { setComposeOpen(false); setEditingAnn(null); }}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function AnnouncementsPage() {
  const { uid, loading: authLoading } = useAuth();

  // ── Current user ──────────────────────────────────────────────────────────
  const [currentUser,  setCurrentUser]  = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // ── Management scope ──────────────────────────────────────────────────────
  // managedClubs      : clubs the user may post to
  // coachGroupsByClub : { [clubId]: [{ id, name }] | null }
  //   null  → unrestricted (clubadmin / superadmin: access to all groups in the club)
  //   array → restricted to specific groups (coach)
  const [managedClubs,      setManagedClubs]      = useState([]);
  const [coachGroupsByClub, setCoachGroupsByClub] = useState({});
  const [canManage,         setCanManage]         = useState(false);
  const [bootstrapDone,     setBootstrapDone]     = useState(false);

  // ── "Mijn berichten" data ─────────────────────────────────────────────────
  const [memberGroupIds,  setMemberGroupIds]  = useState([]);
  const [myAnnouncements, setMyAnnouncements] = useState([]);
  const [loadingMine,     setLoadingMine]     = useState(true);

  // ── UI ────────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('mine');

  // ── Bootstrap: resolve role + management scope ────────────────────────────
  useEffect(() => {
    if (authLoading || !uid) return;
    let cancelled = false;

    const run = async () => {
      const snap = await UserFactory.get(uid);
      if (!snap.exists() || cancelled) { setBootstrapDone(true); return; }

      const user = { id: uid, ...snap.data() };
      setCurrentUser(user);
      const role = user.role || 'user';

      // ── SuperAdmin ────────────────────────────────────────────────────────
      if (role === 'superadmin') {
        setIsSuperAdmin(true);
        const unsubClubs = ClubFactory.getAll((clubs) => {
          if (cancelled) return;
          setManagedClubs(clubs);
          const map = {};
          clubs.forEach(c => { map[c.id] = null; }); // null = all groups
          setCoachGroupsByClub(map);
          setCanManage(true);
          setBootstrapDone(true);
        });
        return () => unsubClubs();
      }

      // ── ClubAdmin ─────────────────────────────────────────────────────────
      if (role === 'clubadmin') {
        // Resolve the clubs this clubadmin is linked to
        const profiles = await new Promise(resolve => {
          const unsub = UserMemberLinkFactory.getForUser(uid, (p) => { unsub(); resolve(p); });
        });
        if (cancelled) return;

        const clubIdSet = new Set(profiles.map(p => p.member.clubId));
        const snaps     = await Promise.all([...clubIdSet].map(id => ClubFactory.getById(id)));
        const clubs     = snaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() }));

        if (!cancelled) {
          setManagedClubs(clubs);
          const map = {};
          clubs.forEach(c => { map[c.id] = null; }); // null = all groups
          setCoachGroupsByClub(map);
          setCanManage(true);
        }
        setBootstrapDone(true);
        return;
      }

      // ── Normal user: find groups where isCoach === true ───────────────────
      const profiles = await new Promise(resolve => {
        const unsub = UserMemberLinkFactory.getForUser(uid, (p) => { unsub(); resolve(p); });
      });
      if (cancelled || profiles.length === 0) { setBootstrapDone(true); return; }

      const clubIdSet = new Set(profiles.map(p => p.member.clubId));
      const snaps     = await Promise.all([...clubIdSet].map(id => ClubFactory.getById(id)));
      const memberClubs = snaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() }));

      // memberId per club
      const memberIdByClub = {};
      profiles.forEach(p => { memberIdByClub[p.member.clubId] = p.member.id; });

      const coachMap   = {};
      const coachClubs = [];

      await Promise.all(memberClubs.map(async club => {
        const memberId = memberIdByClub[club.id];
        if (!memberId) return;

        const allGroups  = await GroupFactory.getGroupsByClubOnce(club.id);
        const coachGroups = [];

        await Promise.all(allGroups.map(async group => {
          const members = await GroupFactory.getMembersByGroupOnce(club.id, group.id);
          const me = members.find(m => (m.memberId || m.id) === memberId);
          if (me?.isCoach) coachGroups.push(group);
        }));

        if (coachGroups.length > 0) {
          coachMap[club.id] = coachGroups; // restricted to coach groups
          coachClubs.push(club);
        }
      }));

      if (!cancelled && coachClubs.length > 0) {
        setManagedClubs(coachClubs);
        setCoachGroupsByClub(coachMap);
        setCanManage(true);
      }
      setBootstrapDone(true);
    };

    run();
  }, [uid, authLoading]);

  // ── "Mijn berichten": resolve member's groups then subscribe ──────────────
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    setLoadingMine(true);

    const unsub = UserMemberLinkFactory.getForUser(uid, async (profiles) => {
      if (cancelled) return;
      const self = profiles.find(p => p.link?.relationship === 'self');
      if (!self) { setLoadingMine(false); return; }

      const gids = await resolveGroupIdsForMember(self.member.clubId, self.member.id);
      if (!cancelled) setMemberGroupIds(gids);
    });

    return () => { cancelled = true; unsub(); };
  }, [uid]);

  useEffect(() => {
    if (memberGroupIds.length === 0) { setLoadingMine(false); return; }
    const unsub = AnnouncementFactory.subscribeForUser(memberGroupIds, (items) => {
      setMyAnnouncements(items);
      setLoadingMine(false);
    });
    return () => unsub();
  }, [memberGroupIds]);

  // ── Author name ───────────────────────────────────────────────────────────
  const authorName = currentUser
    ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim()
    : '';

  // ── Guards ────────────────────────────────────────────────────────────────
  if (authLoading || !bootstrapDone) return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{pageCSS}</style>
      <div style={sp.spinner} />
    </div>
  );

  const activeMineCount = myAnnouncements.filter(isLive).length;

  return (
    <div style={sp.page}>
      <style>{pageCSS}</style>

      {/* ── Sticky header ── */}
      <header style={sp.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '34px', height: '34px', borderRadius: '9px', backgroundColor: '#a78bfa22', border: '1px solid #a78bfa44', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Megaphone size={17} color="#a78bfa" />
          </div>
          <div>
            <div style={{ fontWeight: '800', fontSize: '15px', color: '#f1f5f9' }}>Aankondigingen</div>
            <div style={{ fontSize: '10px', color: '#475569' }}>
              {activeMineCount > 0 ? `${activeMineCount} actief bericht${activeMineCount !== 1 ? 'en' : ''}` : 'Berichten van je coach'}
            </div>
          </div>
        </div>
        {/* Header action button for manage tab */}
        {canManage && activeTab === 'manage' && (
          <div style={{ fontSize: '11px', color: '#64748b' }}>Selecteer groep → druk op +</div>
        )}
      </header>

      {/* ── Tabs ── */}
      <div style={sp.tabBar}>
        <button onClick={() => setActiveTab('mine')} style={{ ...sp.tab, ...(activeTab === 'mine' ? sp.tabActive : {}) }}>
          <Bell size={14} />
          Mijn berichten
          {activeMineCount > 0 && (
            <span style={{ ...st.chip, backgroundColor: '#a78bfa22', color: '#a78bfa', border: '1px solid #a78bfa44', marginLeft: '4px' }}>
              {activeMineCount}
            </span>
          )}
        </button>
        {canManage && (
          <button onClick={() => setActiveTab('manage')} style={{ ...sp.tab, ...(activeTab === 'manage' ? sp.tabActive : {}) }}>
            <Edit2 size={14} />
            Beheer berichten
          </button>
        )}
      </div>

      {/* ── Tab content ── */}
      <div style={sp.content}>
        {activeTab === 'mine' && (
          <MyMessagesTab
            memberGroupIds={memberGroupIds}
            announcements={myAnnouncements}
            loading={loadingMine}
          />
        )}
        {activeTab === 'manage' && canManage && (
          <ManageMessagesTab
            managedClubs={managedClubs}
            coachGroupsByClub={coachGroupsByClub}
            isSuperAdmin={isSuperAdmin}
            uid={uid}
            authorName={authorName}
          />
        )}
      </div>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const st = {
  chip: {
    display: 'inline-flex', alignItems: 'center', gap: '3px',
    fontSize: '9px', fontWeight: '800',
    padding: '1px 6px', borderRadius: '8px',
    textTransform: 'uppercase', letterSpacing: '0.4px',
  },
  groupChip: {
    padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600',
    cursor: 'pointer', fontFamily: 'inherit', border: '1px solid',
    display: 'inline-flex', alignItems: 'center', gap: '5px',
    backgroundColor: 'transparent',
  },
  fab: {
    position: 'fixed', bottom: '90px', right: '20px',
    width: '52px', height: '52px', borderRadius: '50%',
    backgroundColor: '#a78bfa', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 20px rgba(167,139,250,0.4)', zIndex: 50,
  },
};

const bs = {
  primary:   { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', backgroundColor: '#a78bfa', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' },
  secondary: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '8px', color: '#94a3b8', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' },
  ghost:     { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 6px', backgroundColor: 'transparent', border: 'none', borderRadius: '6px', color: '#64748b', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' },
  icon:      { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' },
};

const m = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 500 },
  sheet:   { backgroundColor: '#1e293b', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '560px', border: '1px solid #334155' },
  header:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' },
  field:   { marginBottom: '14px' },
  label:   { display: 'block', fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' },
  input:   { width: '100%', padding: '11px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px', boxSizing: 'border-box', fontFamily: 'inherit' },
  select:  { width: '100%', padding: '11px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px', fontFamily: 'inherit' },
};

const sp = {
  page:      { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'system-ui, sans-serif' },
  spinner:   { width: '36px', height: '36px', border: '3px solid #1e293b', borderTop: '3px solid #a78bfa', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  header:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: '#1e293b', borderBottom: '1px solid #334155', position: 'sticky', top: 0, zIndex: 50 },
  tabBar:    { display: 'flex', borderBottom: '1px solid #1e293b', backgroundColor: '#0f172a', position: 'sticky', top: '57px', zIndex: 49, padding: '0 16px' },
  tab:       { display: 'flex', alignItems: 'center', gap: '6px', padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#64748b', background: 'none', border: 'none', borderBottom: '2px solid transparent', cursor: 'pointer', fontFamily: 'inherit', transition: 'color 0.15s', whiteSpace: 'nowrap' },
  tabActive: { color: '#a78bfa', borderBottomColor: '#a78bfa' },
  content:   { maxWidth: '760px', margin: '0 auto', padding: '20px 16px 100px' },
  label:     { display: 'block', fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' },
  empty:     { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center' },
};

const pageCSS = `
  * { box-sizing: border-box; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.6); cursor: pointer; }
`;
