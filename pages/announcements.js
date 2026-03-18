import { useState, useEffect, useRef } from 'react';
import {
  ClubFactory, GroupFactory, ClubMemberFactory,
  UserMemberLinkFactory, UserFactory,
} from '../constants/dbSchema';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebaseConfig';
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, serverTimestamp, query, where, orderBy,
  getDocs,
} from 'firebase/firestore';
import {
  Megaphone, Plus, Trash2, Pin, X, ChevronDown, ChevronUp,
  Building2, Users, AlertTriangle, Bell, Calendar, Edit2,
  Check, Clock, Send, Eye, EyeOff,
} from 'lucide-react';

// ─── Cookie helper ────────────────────────────────────────────────────────────
const COOKIE_KEY = 'msc_uid';
const getCookie = () => {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`));
  return m ? m[1] : null;
};

// ─── Announcement type config ─────────────────────────────────────────────────
export const ANNOUNCEMENT_TYPES = {
  info:     { label: 'Informatie', color: '#3b82f6', bg: '#3b82f618', emoji: 'ℹ️' },
  cancel:   { label: 'Geannuleerd', color: '#ef4444', bg: '#ef444418', emoji: '❌' },
  reminder: { label: 'Herinnering', color: '#f59e0b', bg: '#f59e0b18', emoji: '🔔' },
  result:   { label: 'Resultaat',   color: '#22c55e', bg: '#22c55e18', emoji: '🏆' },
};

// ─── AnnouncementFactory helpers (inline, no schema changes needed at runtime) ─
// Firestore path: clubs/{clubId}/groups/{groupId}/announcements/{announcementId}
// This follows the existing club/group hierarchy in the codebase.

export const AnnouncementFactory = {
  create: (clubId, groupId, data, authorUid, authorName) =>
    addDoc(
      collection(db, `clubs/${clubId}/groups/${groupId}/announcements`),
      {
        title:      data.title.trim(),
        body:       data.body.trim(),
        type:       data.type || 'info',
        isPinned:   data.isPinned || false,
        authorUid,
        authorName,
        clubId,
        groupId,
        createdAt:  serverTimestamp(),
        updatedAt:  serverTimestamp(),
      }
    ),

  update: (clubId, groupId, announcementId, data) =>
    updateDoc(
      doc(db, `clubs/${clubId}/groups/${groupId}/announcements`, announcementId),
      { ...data, updatedAt: serverTimestamp() }
    ),

  delete: (clubId, groupId, announcementId) =>
    deleteDoc(doc(db, `clubs/${clubId}/groups/${groupId}/announcements`, announcementId)),

  subscribe: (clubId, groupId, callback) =>
    onSnapshot(
      query(
        collection(db, `clubs/${clubId}/groups/${groupId}/announcements`),
        orderBy('createdAt', 'desc')
      ),
      (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => { console.error('Announcement subscription error:', err); callback([]); }
    ),

  // Subscribe to all groups' announcements for a skipper
  // Returns combined unsubscribe function
  subscribeForMember: (clubId, groupIds, callback) => {
    if (!groupIds || groupIds.length === 0) { callback([]); return () => {}; }
    const allItems = {};
    const unsubs = groupIds.map(groupId =>
      onSnapshot(
        query(
          collection(db, `clubs/${clubId}/groups/${groupId}/announcements`),
          orderBy('createdAt', 'desc')
        ),
        (snap) => {
          allItems[groupId] = snap.docs.map(d => ({ id: d.id, groupId, ...d.data() }));
          // Merge all, sort pinned first then by date
          const merged = Object.values(allItems).flat().sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
          });
          callback(merged);
        },
        (err) => { console.error('Announcement subscription error:', err); }
      )
    );
    return () => unsubs.forEach(u => u());
  },
};

// ─── Announcement Card ────────────────────────────────────────────────────────
function AnnouncementCard({ ann, canEdit, onEdit, onDelete, onTogglePin }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = ANNOUNCEMENT_TYPES[ann.type] || ANNOUNCEMENT_TYPES.info;
  const dateStr = ann.createdAt?.seconds
    ? new Date(ann.createdAt.seconds * 1000).toLocaleDateString('nl-BE', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
    : '';
  const timeStr = ann.createdAt?.seconds
    ? new Date(ann.createdAt.seconds * 1000).toLocaleTimeString('nl-BE', {
        hour: '2-digit', minute: '2-digit',
      })
    : '';

  const bodyLines = (ann.body || '').split('\n').filter(Boolean);
  const preview = bodyLines[0] || '';
  const hasMore = bodyLines.length > 1 || (ann.body || '').length > 120;

  return (
    <div style={{
      backgroundColor: '#1e293b',
      borderRadius: '14px',
      border: `1px solid ${ann.isPinned ? cfg.color + '55' : '#334155'}`,
      overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      {/* Type stripe */}
      <div style={{ height: '3px', backgroundColor: cfg.color }} />

      <div style={{ padding: '14px 16px' }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px',
            backgroundColor: cfg.bg,
            border: `1px solid ${cfg.color}44`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '18px', flexShrink: 0,
          }}>
            {cfg.emoji}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '2px' }}>
              {ann.isPinned && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '9px', fontWeight: '800', color: cfg.color, backgroundColor: cfg.bg, border: `1px solid ${cfg.color}44`, padding: '1px 6px', borderRadius: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <Pin size={8} /> Vastgepind
                </span>
              )}
              <span style={{ fontSize: '10px', fontWeight: '700', color: cfg.color, backgroundColor: cfg.bg, border: `1px solid ${cfg.color}33`, padding: '1px 6px', borderRadius: '8px' }}>
                {cfg.label}
              </span>
            </div>
            <div style={{ fontWeight: '700', fontSize: '14px', color: '#f1f5f9', lineHeight: 1.3 }}>
              {ann.title}
            </div>
          </div>
          {canEdit && (
            <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
              <button
                onClick={() => onTogglePin(ann)}
                title={ann.isPinned ? 'Losmaken' : 'Vastpinnen'}
                style={{ ...btn.ghost, color: ann.isPinned ? cfg.color : '#475569', padding: '5px' }}
              >
                <Pin size={13} />
              </button>
              <button onClick={() => onEdit(ann)} style={{ ...btn.ghost, padding: '5px' }}>
                <Edit2 size={13} />
              </button>
              <button onClick={() => onDelete(ann)} style={{ ...btn.ghost, color: '#ef4444', padding: '5px' }}>
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ paddingLeft: '46px' }}>
          <div style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
            {expanded ? ann.body : (hasMore ? preview.slice(0, 120) + (preview.length > 120 ? '…' : '') : ann.body)}
          </div>
          {hasMore && (
            <button
              onClick={() => setExpanded(v => !v)}
              style={{ ...btn.ghost, fontSize: '11px', color: '#475569', padding: '4px 0', marginTop: '4px', gap: '3px' }}
            >
              {expanded ? <><ChevronUp size={11} /> Minder</> : <><ChevronDown size={11} /> Meer tonen</>}
            </button>
          )}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
            <span style={{ fontSize: '10px', color: '#475569' }}>
              {ann.authorName || 'Coach'} · {dateStr} {timeStr}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Compose / Edit Modal ─────────────────────────────────────────────────────
function ComposeModal({ editing, clubs, adminClubs, isSuperAdmin, authorName, onSave, onClose }) {
  const [form, setForm] = useState({
    clubId:   editing?.clubId   || (adminClubs[0]?.id || ''),
    groupId:  editing?.groupId  || '',
    title:    editing?.title    || '',
    body:     editing?.body     || '',
    type:     editing?.type     || 'info',
    isPinned: editing?.isPinned || false,
  });
  const [groups,  setGroups]  = useState([]);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const bodyRef = useRef(null);

  useEffect(() => {
    if (!form.clubId) return;
    const u = GroupFactory.getGroupsByClub(form.clubId, setGroups);
    return () => u();
  }, [form.clubId]);

  // Auto-select first group if only one
  useEffect(() => {
    if (groups.length === 1 && !form.groupId) {
      setForm(f => ({ ...f, groupId: groups[0].id }));
    }
  }, [groups]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setError('');
    if (!form.title.trim()) { setError('Geef de aankondiging een titel.'); return; }
    if (!form.body.trim())  { setError('Inhoud mag niet leeg zijn.'); return; }
    if (!form.clubId)       { setError('Kies een club.'); return; }
    if (!form.groupId)      { setError('Kies een groep.'); return; }
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (e) {
      console.error(e);
      setError('Opslaan mislukt. Probeer opnieuw.');
    } finally {
      setSaving(false);
    }
  };

  const availableClubs = isSuperAdmin ? clubs : adminClubs;

  return (
    <div style={modal.overlay}>
      <div style={{ ...modal.sheet, maxHeight: '94vh', overflowY: 'auto' }}>
        <div style={modal.header}>
          <h3 style={{ margin: 0, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: '#f1f5f9' }}>
            <Megaphone size={18} color="#a78bfa" />
            {editing ? 'Aankondiging bewerken' : 'Nieuwe aankondiging'}
          </h3>
          <button style={btn.icon} onClick={onClose}><X size={18} /></button>
        </div>

        {/* Club */}
        {availableClubs.length > 1 && (
          <div style={modal.field}>
            <label style={modal.label}><Building2 size={11} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Club *</label>
            <select style={modal.select} value={form.clubId} onChange={e => { set('clubId', e.target.value); set('groupId', ''); }}>
              <option value="">-- Kies club --</option>
              {availableClubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {/* Group */}
        {form.clubId && (
          <div style={modal.field}>
            <label style={modal.label}><Users size={11} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Groep *</label>
            <select style={modal.select} value={form.groupId} onChange={e => set('groupId', e.target.value)}>
              <option value="">-- Kies groep --</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}

        {/* Type */}
        <div style={modal.field}>
          <label style={modal.label}>Type *</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {Object.entries(ANNOUNCEMENT_TYPES).map(([key, cfg]) => (
              <button
                key={key}
                type="button"
                onClick={() => set('type', key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '6px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: '600',
                  cursor: 'pointer', border: `1px solid ${form.type === key ? cfg.color : '#334155'}`,
                  backgroundColor: form.type === key ? cfg.bg : 'transparent',
                  color: form.type === key ? cfg.color : '#64748b',
                  fontFamily: 'inherit',
                }}
              >
                {cfg.emoji} {cfg.label}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div style={modal.field}>
          <label style={modal.label}>Titel *</label>
          <input
            style={modal.input}
            placeholder="bijv. Training geannuleerd zaterdag 22 maart"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            autoFocus
          />
        </div>

        {/* Body */}
        <div style={modal.field}>
          <label style={modal.label}>Bericht *</label>
          <textarea
            ref={bodyRef}
            style={{ ...modal.input, minHeight: '100px', resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit' }}
            placeholder="Schrijf hier het volledige bericht voor de skippers…"
            value={form.body}
            onChange={e => set('body', e.target.value)}
          />
        </div>

        {/* Pin toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' }}>
          <input
            type="checkbox"
            id="isPinned"
            checked={form.isPinned}
            onChange={e => set('isPinned', e.target.checked)}
          />
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
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ ...btn.primary, flex: 1, justifyContent: 'center' }}
          >
            <Send size={14} /> {saving ? 'Opslaan…' : editing ? 'Wijzigingen opslaan' : 'Publiceren'}
          </button>
          <button onClick={onClose} style={btn.secondary}><X size={14} /> Annuleren</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function AnnouncementsPage() {
  const { uid, loading: authLoading } = useAuth();
  const [currentUser, setCurrentUser] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isCoach,      setIsCoach]      = useState(false);

  const [allClubs,   setAllClubs]   = useState([]);
  const [adminClubs, setAdminClubs] = useState([]); // clubs this user can post to

  // Selected club/group for coach view
  const [selectedClubId,  setSelectedClubId]  = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groups,          setGroups]          = useState([]);

  // Announcements for coach view (selected group)
  const [coachAnnouncements, setCoachAnnouncements] = useState([]);

  // Skipper view: member's groups
  const [memberContext,    setMemberContext]    = useState(null);
  const [memberGroupIds,   setMemberGroupIds]   = useState([]);
  const [skipperAnnouncements, setSkipperAnnouncements] = useState([]);

  // Modal
  const [composeOpen, setComposeOpen] = useState(false);
  const [editingAnn,  setEditingAnn]  = useState(null);

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading || !uid) return;

    UserFactory.get(uid).then(snap => {
      if (!snap.exists()) return;
      const user = { id: uid, ...snap.data() };
      setCurrentUser(user);
      const role = user.role || 'user';
      if (role === 'superadmin') setIsSuperAdmin(true);
      if (role === 'clubadmin' || role === 'superadmin') setIsCoach(true);
    });

    const u = ClubFactory.getAll(setAllClubs);
    return () => u();
  }, [uid, authLoading]);

  // Determine adminClubs
  useEffect(() => {
    if (!currentUser || allClubs.length === 0) return;
    if (isSuperAdmin) { setAdminClubs(allClubs); return; }

    const role = currentUser.role;
    if (role !== 'clubadmin') {
      // Check if user is a coach in any group
      let found = new Set();
      allClubs.forEach(club => {
        GroupFactory.getGroupsByClub(club.id, groups => {
          groups.forEach(group => {
            GroupFactory.getMembersByGroup(club.id, group.id, members => {
              const me = members.find(m => (m.memberId || m.id) === uid && m.isCoach);
              if (me) {
                found.add(club.id);
                setIsCoach(true);
                setAdminClubs(allClubs.filter(c => found.has(c.id)));
              }
            });
          });
        });
      });
      return;
    }

    setAdminClubs(allClubs);
  }, [currentUser, allClubs, isSuperAdmin, uid]);

  // Auto-select single admin club
  useEffect(() => {
    if (adminClubs.length === 1 && !selectedClubId) setSelectedClubId(adminClubs[0].id);
  }, [adminClubs]);

  // Load groups for selected club
  useEffect(() => {
    if (!selectedClubId) return;
    const u = GroupFactory.getGroupsByClub(selectedClubId, setGroups);
    return () => u();
  }, [selectedClubId]);

  // Auto-select single group
  useEffect(() => {
    if (groups.length === 1 && !selectedGroupId) setSelectedGroupId(groups[0].id);
  }, [groups]);

  // Subscribe to coach announcements
  useEffect(() => {
    if (!selectedClubId || !selectedGroupId) { setCoachAnnouncements([]); return; }
    const u = AnnouncementFactory.subscribe(selectedClubId, selectedGroupId, setCoachAnnouncements);
    return () => u();
  }, [selectedClubId, selectedGroupId]);

  // Skipper: resolve member context + group ids
  useEffect(() => {
    if (!uid) return;
    const unsub = UserMemberLinkFactory.getForUser(uid, async (profiles) => {
      const selfProfile = profiles.find(p => p.link.relationship === 'self');
      if (!selfProfile) return;
      const ctx = { clubId: selfProfile.member.clubId, memberId: selfProfile.member.id };
      setMemberContext(ctx);

      // Find all groups this member belongs to
      const groupsSnap = await getDocs(collection(db, `clubs/${ctx.clubId}/groups`));
      const gids = [];
      await Promise.all(groupsSnap.docs.map(async gDoc => {
        try {
          const memSnap = await getDocs(collection(db, `clubs/${ctx.clubId}/groups/${gDoc.id}/members`));
          const isMember = memSnap.docs.some(m => (m.data().memberId || m.id) === ctx.memberId);
          if (isMember) gids.push(gDoc.id);
        } catch (_) {}
      }));
      setMemberGroupIds(gids);
    });
    return () => unsub();
  }, [uid]);

  // Subscribe to skipper announcements
  useEffect(() => {
    if (!memberContext || memberGroupIds.length === 0) return;
    const unsub = AnnouncementFactory.subscribeForMember(
      memberContext.clubId, memberGroupIds, setSkipperAnnouncements
    );
    return () => unsub();
  }, [memberContext, memberGroupIds]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSave = async (form) => {
    const authorName = currentUser
      ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim()
      : 'Coach';

    if (editingAnn) {
      await AnnouncementFactory.update(
        editingAnn.clubId, editingAnn.groupId, editingAnn.id,
        { title: form.title, body: form.body, type: form.type, isPinned: form.isPinned }
      );
    } else {
      await AnnouncementFactory.create(form.clubId, form.groupId, form, uid, authorName);
    }
    setEditingAnn(null);
  };

  const handleDelete = async (ann) => {
    if (!confirm(`"${ann.title}" verwijderen?`)) return;
    await AnnouncementFactory.delete(ann.clubId, ann.groupId, ann.id);
  };

  const handleTogglePin = async (ann) => {
    await AnnouncementFactory.update(ann.clubId, ann.groupId, ann.id, { isPinned: !ann.isPinned });
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const showCoachPanel = isCoach;
  const selectedClub   = allClubs.find(c => c.id === selectedClubId);
  const selectedGroup  = groups.find(g => g.id === selectedGroupId);

  const sortedCoachAnns = [...coachAnnouncements].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
  });

  const unreadCount = skipperAnnouncements.filter(a => {
    const ts = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0;
    return Date.now() - ts < 7 * 24 * 60 * 60 * 1000; // last 7 days = "recent"
  }).length;

  if (authLoading) return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{pageCSS}</style>
      <div style={sp.spinner} />
    </div>
  );

  return (
    <div style={sp.page}>
      <style>{pageCSS}</style>

      {/* ── Header ── */}
      <header style={sp.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '34px', height: '34px', borderRadius: '9px', backgroundColor: '#a78bfa22', border: '1px solid #a78bfa44', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Megaphone size={17} color="#a78bfa" />
          </div>
          <div>
            <div style={{ fontWeight: '800', fontSize: '15px', color: '#f1f5f9' }}>Aankondigingen</div>
            <div style={{ fontSize: '10px', color: '#475569' }}>
              {showCoachPanel ? 'Beheer & publiceer berichten' : `${skipperAnnouncements.length} bericht${skipperAnnouncements.length !== 1 ? 'en' : ''}`}
            </div>
          </div>
        </div>

        {showCoachPanel && (
          <button
            onClick={() => { setEditingAnn(null); setComposeOpen(true); }}
            style={{ ...btn.primary, gap: '6px' }}
          >
            <Plus size={14} /> Nieuw bericht
          </button>
        )}
      </header>

      <div style={sp.content}>

        {/* ════ COACH VIEW ════ */}
        {showCoachPanel && (
          <div>
            {/* Club / Group selector */}
            {adminClubs.length > 1 && (
              <div style={{ marginBottom: '14px' }}>
                <label style={sp.label}><Building2 size={11} style={{ verticalAlign: 'middle', marginRight: '5px' }} />Club</label>
                <select style={sp.select} value={selectedClubId} onChange={e => { setSelectedClubId(e.target.value); setSelectedGroupId(''); }}>
                  <option value="">-- Kies club --</option>
                  {adminClubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}

            {selectedClubId && groups.length > 1 && (
              <div style={{ marginBottom: '16px' }}>
                <label style={sp.label}><Users size={11} style={{ verticalAlign: 'middle', marginRight: '5px' }} />Groep</label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {groups.map(g => (
                    <button
                      key={g.id}
                      onClick={() => setSelectedGroupId(g.id)}
                      style={{
                        padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600',
                        cursor: 'pointer', fontFamily: 'inherit',
                        border: `1px solid ${selectedGroupId === g.id ? '#a78bfa' : '#334155'}`,
                        backgroundColor: selectedGroupId === g.id ? '#a78bfa22' : 'transparent',
                        color: selectedGroupId === g.id ? '#a78bfa' : '#64748b',
                      }}
                    >
                      {g.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedClubId && selectedGroupId ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>
                    {selectedClub?.name} · {selectedGroup?.name} · {sortedCoachAnns.length} aankondiging{sortedCoachAnns.length !== 1 ? 'en' : ''}
                  </div>
                </div>

                {sortedCoachAnns.length === 0 ? (
                  <div style={sp.empty}>
                    <Megaphone size={40} color="#334155" style={{ marginBottom: '12px' }} />
                    <p style={{ color: '#475569', fontSize: '14px', margin: '0 0 16px' }}>Nog geen aankondigingen voor deze groep.</p>
                    <button onClick={() => { setEditingAnn(null); setComposeOpen(true); }} style={btn.primary}>
                      <Plus size={14} /> Eerste aankondiging maken
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {sortedCoachAnns.map(ann => (
                      <AnnouncementCard
                        key={ann.id}
                        ann={ann}
                        canEdit={true}
                        onEdit={a => { setEditingAnn(a); setComposeOpen(true); }}
                        onDelete={handleDelete}
                        onTogglePin={handleTogglePin}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={sp.empty}>
                <Users size={40} color="#334155" style={{ marginBottom: '12px' }} />
                <p style={{ color: '#475569', fontSize: '14px' }}>
                  {!selectedClubId ? 'Selecteer een club om aankondigingen te beheren.' : 'Selecteer een groep.'}
                </p>
              </div>
            )}

            {/* Divider: also show own skipper view below if member */}
            {memberGroupIds.length > 0 && skipperAnnouncements.length > 0 && (
              <div style={{ marginTop: '32px', borderTop: '1px solid #1e293b', paddingTop: '24px' }}>
                <div style={{ fontWeight: '700', fontSize: '13px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Bell size={13} /> Jouw aankondigingen als skipper
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {skipperAnnouncements.map(ann => (
                    <AnnouncementCard key={ann.id} ann={ann} canEdit={false} onEdit={() => {}} onDelete={() => {}} onTogglePin={() => {}} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════ SKIPPER VIEW ════ */}
        {!showCoachPanel && (
          <div>
            {skipperAnnouncements.length === 0 ? (
              <div style={sp.empty}>
                <Bell size={40} color="#334155" style={{ marginBottom: '12px' }} />
                <p style={{ color: '#475569', fontSize: '14px' }}>Geen aankondigingen van je coach.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {skipperAnnouncements.map(ann => (
                  <AnnouncementCard
                    key={ann.id}
                    ann={ann}
                    canEdit={false}
                    onEdit={() => {}}
                    onDelete={() => {}}
                    onTogglePin={() => {}}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Compose / Edit Modal ── */}
      {composeOpen && (
        <ComposeModal
          editing={editingAnn}
          clubs={allClubs}
          adminClubs={adminClubs}
          isSuperAdmin={isSuperAdmin}
          authorName={currentUser ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() : 'Coach'}
          onSave={handleSave}
          onClose={() => { setComposeOpen(false); setEditingAnn(null); }}
        />
      )}
    </div>
  );
}

// ─── Shared button styles ─────────────────────────────────────────────────────
const btn = {
  primary:   { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', backgroundColor: '#a78bfa', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' },
  secondary: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '8px', color: '#94a3b8', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' },
  ghost:     { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 6px', backgroundColor: 'transparent', border: 'none', borderRadius: '6px', color: '#64748b', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' },
  icon:      { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' },
};

const modal = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 500 },
  sheet:   { backgroundColor: '#1e293b', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '560px', border: '1px solid #334155' },
  header:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' },
  field:   { marginBottom: '14px' },
  label:   { display: 'block', fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' },
  input:   { width: '100%', padding: '11px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px', boxSizing: 'border-box' },
  select:  { width: '100%', padding: '11px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px' },
};

const sp = {
  page:    { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'system-ui, sans-serif' },
  spinner: { width: '36px', height: '36px', border: '3px solid #1e293b', borderTop: '3px solid #a78bfa', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  header:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: '#1e293b', borderBottom: '1px solid #334155', position: 'sticky', top: 0, zIndex: 50 },
  content: { maxWidth: '760px', margin: '0 auto', padding: '20px 16px 40px' },
  label:   { display: 'block', fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' },
  select:  { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#1e293b', color: 'white', fontSize: '14px' },
  empty:   { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center' },
};

const pageCSS = `
  * { box-sizing: border-box; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;
