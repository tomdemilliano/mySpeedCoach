import { useState, useEffect } from 'react';
import {
  AnnouncementFactory, ClubFactory, GroupFactory,
  UserFactory, UserMemberLinkFactory,
} from '../constants/dbSchema';
import { useAuth } from '../contexts/AuthContext';
import {
  Megaphone, Plus, Trash2, Pin, X, ChevronDown, ChevronUp,
  Building2, Users, AlertTriangle, Bell, Edit2, Send,
} from 'lucide-react';

// ─── Announcement type config — no DB access ──────────────────────────────────
export const ANNOUNCEMENT_TYPES = {
  info:     { label: 'Informatie',  color: '#3b82f6', bg: '#3b82f618', emoji: 'ℹ️' },
  cancel:   { label: 'Geannuleerd', color: '#ef4444', bg: '#ef444418', emoji: '❌' },
  reminder: { label: 'Herinnering', color: '#f59e0b', bg: '#f59e0b18', emoji: '🔔' },
  result:   { label: 'Resultaat',   color: '#22c55e', bg: '#22c55e18', emoji: '🏆' },
};

// ─── Helper: resolve all group IDs a member belongs to ───────────────────────
// Uses only GroupFactory — no direct Firestore calls anywhere in this file.
async function resolveGroupIdsForMember(clubId, memberId) {
  return new Promise((resolve) => {
    const gids = [];
    // One-shot: get all groups then check membership for each
    const unsub = GroupFactory.getGroupsByClub(clubId, async (groups) => {
      unsub();
      await Promise.all(groups.map(group =>
        new Promise(res => {
          const u = GroupFactory.getMembersByGroup(clubId, group.id, (members) => {
            u();
            const belongs = members.some(m => (m.memberId || m.id) === memberId);
            if (belongs) gids.push(group.id);
            res();
          });
        })
      ));
      resolve(gids);
    });
  });
}

// ─── AnnouncementCard ─────────────────────────────────────────────────────────
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

  const preview = (ann.body || '').split('\n')[0] || '';
  const hasMore = (ann.body || '').length > 120 || (ann.body || '').includes('\n');

  return (
    <div style={{
      backgroundColor: '#1e293b',
      borderRadius: '14px',
      border: `1px solid ${ann.pinned ? cfg.color + '55' : '#334155'}`,
      overflow: 'hidden',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '2px' }}>
              {ann.pinned && (
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
                title={ann.pinned ? 'Losmaken' : 'Vastpinnen'}
                style={{ ...bs.ghost, color: ann.pinned ? cfg.color : '#475569', padding: '5px' }}
              >
                <Pin size={13} />
              </button>
              <button onClick={() => onEdit(ann)} style={{ ...bs.ghost, padding: '5px' }}><Edit2 size={13} /></button>
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
            <button
              onClick={() => setExpanded(v => !v)}
              style={{ ...bs.ghost, fontSize: '11px', color: '#475569', padding: '4px 0', marginTop: '4px', gap: '3px' }}
            >
              {expanded ? <><ChevronUp size={11} /> Minder</> : <><ChevronDown size={11} /> Meer tonen</>}
            </button>
          )}
          <div style={{ fontSize: '10px', color: '#475569', marginTop: '8px' }}>
            {ann.authorName || 'Coach'} · {dateStr} {timeStr}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Compose / Edit Modal ─────────────────────────────────────────────────────
function ComposeModal({ editing, allClubs, adminClubs, isSuperAdmin, onSave, onClose }) {
  const availableClubs = isSuperAdmin ? allClubs : adminClubs;

  const [form, setForm] = useState({
    clubId:   editing?.clubId   || availableClubs[0]?.id || '',
    groupIds: editing?.groupIds || [],
    title:    editing?.title    || '',
    body:     editing?.body     || '',
    type:     editing?.type     || 'info',
    pinned:   editing?.pinned   || false,
    expiresAt: null,
  });
  const [groups,  setGroups]  = useState([]);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  // Load groups via GroupFactory
  useEffect(() => {
    if (!form.clubId) return;
    const unsub = GroupFactory.getGroupsByClub(form.clubId, setGroups);
    return () => unsub();
  }, [form.clubId]);

  // Auto-select the only group
  useEffect(() => {
    if (groups.length === 1 && form.groupIds.length === 0) {
      setForm(f => ({ ...f, groupIds: [groups[0].id] }));
    }
  }, [groups]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleGroup = (gid) => {
    setForm(f => ({
      ...f,
      groupIds: f.groupIds.includes(gid)
        ? f.groupIds.filter(id => id !== gid)
        : [...f.groupIds, gid],
    }));
  };

  const handleSave = async () => {
    setError('');
    if (!form.title.trim())         { setError('Geef de aankondiging een titel.'); return; }
    if (!form.body.trim())          { setError('Inhoud mag niet leeg zijn.'); return; }
    if (!form.clubId)               { setError('Kies een club.'); return; }
    if (form.groupIds.length === 0) { setError('Kies minstens één groep.'); return; }
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

  return (
    <div style={m.overlay}>
      <div style={{ ...m.sheet, maxHeight: '94vh', overflowY: 'auto' }}>
        <div style={m.header}>
          <h3 style={{ margin: 0, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: '#f1f5f9' }}>
            <Megaphone size={18} color="#a78bfa" />
            {editing ? 'Aankondiging bewerken' : 'Nieuwe aankondiging'}
          </h3>
          <button style={bs.icon} onClick={onClose}><X size={18} /></button>
        </div>

        {availableClubs.length > 1 && (
          <div style={m.field}>
            <label style={m.label}><Building2 size={11} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Club *</label>
            <select style={m.select} value={form.clubId} onChange={e => { set('clubId', e.target.value); set('groupIds', []); }}>
              <option value="">-- Kies club --</option>
              {availableClubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {form.clubId && groups.length > 0 && (
          <div style={m.field}>
            <label style={m.label}><Users size={11} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Groep(en) *</label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {groups.map(g => {
                const sel = form.groupIds.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => toggleGroup(g.id)}
                    style={{
                      padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600',
                      cursor: 'pointer', fontFamily: 'inherit',
                      border: `1px solid ${sel ? '#a78bfa' : '#334155'}`,
                      backgroundColor: sel ? '#a78bfa22' : 'transparent',
                      color: sel ? '#a78bfa' : '#64748b',
                    }}
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={m.field}>
          <label style={m.label}>Type *</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {Object.entries(ANNOUNCEMENT_TYPES).map(([key, cfg]) => (
              <button
                key={key}
                type="button"
                onClick={() => set('type', key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '6px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: '600',
                  cursor: 'pointer', fontFamily: 'inherit',
                  border: `1px solid ${form.type === key ? cfg.color : '#334155'}`,
                  backgroundColor: form.type === key ? cfg.bg : 'transparent',
                  color: form.type === key ? cfg.color : '#64748b',
                }}
              >
                {cfg.emoji} {cfg.label}
              </button>
            ))}
          </div>
        </div>

        <div style={m.field}>
          <label style={m.label}>Titel *</label>
          <input
            style={m.input}
            placeholder="bijv. Training geannuleerd zaterdag 22 maart"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            autoFocus
          />
        </div>

        <div style={m.field}>
          <label style={m.label}>Bericht *</label>
          <textarea
            style={{ ...m.input, minHeight: '100px', resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit' }}
            placeholder="Schrijf hier het volledige bericht voor de skippers…"
            value={form.body}
            onChange={e => set('body', e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' }}>
          <input type="checkbox" id="isPinned" checked={form.pinned} onChange={e => set('pinned', e.target.checked)} />
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

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function AnnouncementsPage() {
  const { uid, loading: authLoading } = useAuth();
  const [currentUser,  setCurrentUser]  = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isCoach,      setIsCoach]      = useState(false);
  const [allClubs,     setAllClubs]     = useState([]);
  const [adminClubs,   setAdminClubs]   = useState([]);

  // Coach manage panel state
  const [selectedClubId,     setSelectedClubId]     = useState('');
  const [selectedGroupId,    setSelectedGroupId]    = useState('');
  const [groups,             setGroups]             = useState([]);
  const [coachAnnouncements, setCoachAnnouncements] = useState([]);

  // Skipper view state
  const [memberContext,        setMemberContext]        = useState(null);
  const [memberGroupIds,       setMemberGroupIds]       = useState([]);
  const [skipperAnnouncements, setSkipperAnnouncements] = useState([]);

  // Compose modal
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
      if (role === 'superadmin') { setIsSuperAdmin(true); setIsCoach(true); }
      if (role === 'clubadmin')  { setIsCoach(true); }
    });
    const unsub = ClubFactory.getAll(setAllClubs);
    return () => unsub();
  }, [uid, authLoading]);

  // ── Resolve admin clubs & coach status from group memberships ─────────────
  useEffect(() => {
    if (!currentUser || allClubs.length === 0) return;
    if (isSuperAdmin) { setAdminClubs(allClubs); return; }
    if (currentUser.role === 'clubadmin') { setAdminClubs(allClubs); return; }

    // Regular users: check isCoach flag in any group
    const found = new Set();
    const unsubs = [];
    allClubs.forEach(club => {
      const u = GroupFactory.getGroupsByClub(club.id, groups => {
        groups.forEach(group => {
          const u2 = GroupFactory.getMembersByGroup(club.id, group.id, members => {
            const me = members.find(m => (m.memberId || m.id) === uid && m.isCoach);
            if (me) {
              found.add(club.id);
              setIsCoach(true);
              setAdminClubs(allClubs.filter(c => found.has(c.id)));
            }
          });
          unsubs.push(u2);
        });
      });
      unsubs.push(u);
    });
    return () => unsubs.forEach(u => u && u());
  }, [currentUser, allClubs, isSuperAdmin, uid]);

  useEffect(() => {
    if (adminClubs.length === 1 && !selectedClubId) setSelectedClubId(adminClubs[0].id);
  }, [adminClubs]);

  // Load groups for selected club
  useEffect(() => {
    if (!selectedClubId) return;
    const unsub = GroupFactory.getGroupsByClub(selectedClubId, setGroups);
    return () => unsub();
  }, [selectedClubId]);

  useEffect(() => {
    if (groups.length === 1 && !selectedGroupId) setSelectedGroupId(groups[0].id);
  }, [groups]);

  // Coach: subscribe via AnnouncementFactory.subscribeForGroup
  useEffect(() => {
    if (!selectedClubId || !selectedGroupId) { setCoachAnnouncements([]); return; }
    const unsub = AnnouncementFactory.subscribeForGroup(selectedClubId, selectedGroupId, setCoachAnnouncements);
    return () => unsub();
  }, [selectedClubId, selectedGroupId]);

  // Skipper: resolve member context via UserMemberLinkFactory
  useEffect(() => {
    if (!uid) return;
    const unsub = UserMemberLinkFactory.getForUser(uid, async (profiles) => {
      const self = profiles.find(p => p.link.relationship === 'self');
      if (!self) return;
      const ctx = { clubId: self.member.clubId, memberId: self.member.id };
      setMemberContext(ctx);
      const gids = await resolveGroupIdsForMember(ctx.clubId, ctx.memberId);
      setMemberGroupIds(gids);
    });
    return () => unsub();
  }, [uid]);

  // Skipper: subscribe via AnnouncementFactory.subscribeForUser
  useEffect(() => {
    if (!memberGroupIds || memberGroupIds.length === 0) return;
    const unsub = AnnouncementFactory.subscribeForUser(memberGroupIds, setSkipperAnnouncements);
    return () => unsub();
  }, [memberGroupIds]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const authorName = currentUser
    ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim()
    : 'Coach';

  const handleSave = async (form) => {
    if (editingAnn) {
      await AnnouncementFactory.update(editingAnn.id, {
        title:    form.title,
        body:     form.body,
        type:     form.type,
        groupIds: form.groupIds,
        pinned:   form.pinned,
      });
    } else {
      await AnnouncementFactory.create(form, uid, authorName);
    }
    setEditingAnn(null);
  };

  const handleDelete = async (ann) => {
    if (!confirm(`"${ann.title}" verwijderen?`)) return;
    await AnnouncementFactory.delete(ann.id);
  };

  const handleTogglePin = async (ann) => {
    await AnnouncementFactory.pin(ann.id, !ann.pinned);
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const selectedClub  = allClubs.find(c => c.id === selectedClubId);
  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  if (authLoading) return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{pageCSS}</style>
      <div style={sp.spinner} />
    </div>
  );

  return (
    <div style={sp.page}>
      <style>{pageCSS}</style>

      <header style={sp.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '34px', height: '34px', borderRadius: '9px', backgroundColor: '#a78bfa22', border: '1px solid #a78bfa44', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Megaphone size={17} color="#a78bfa" />
          </div>
          <div>
            <div style={{ fontWeight: '800', fontSize: '15px', color: '#f1f5f9' }}>Aankondigingen</div>
            <div style={{ fontSize: '10px', color: '#475569' }}>
              {isCoach ? 'Beheer & publiceer berichten' : `${skipperAnnouncements.length} bericht${skipperAnnouncements.length !== 1 ? 'en' : ''}`}
            </div>
          </div>
        </div>
        {isCoach && (
          <button onClick={() => { setEditingAnn(null); setComposeOpen(true); }} style={{ ...bs.primary, gap: '6px' }}>
            <Plus size={14} /> Nieuw bericht
          </button>
        )}
      </header>

      <div style={sp.content}>

        {/* ════ COACH PANEL ════ */}
        {isCoach && (
          <div>
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
                <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginBottom: '14px' }}>
                  {selectedClub?.name} · {selectedGroup?.name} · {coachAnnouncements.length} aankondiging{coachAnnouncements.length !== 1 ? 'en' : ''}
                </div>
                {coachAnnouncements.length === 0 ? (
                  <div style={sp.empty}>
                    <Megaphone size={40} color="#334155" style={{ marginBottom: '12px' }} />
                    <p style={{ color: '#475569', fontSize: '14px', margin: '0 0 16px' }}>Nog geen aankondigingen voor deze groep.</p>
                    <button onClick={() => { setEditingAnn(null); setComposeOpen(true); }} style={bs.primary}>
                      <Plus size={14} /> Eerste aankondiging maken
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {coachAnnouncements.map(ann => (
                      <AnnouncementCard
                        key={ann.id} ann={ann} canEdit
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

            {/* Coach's own skipper announcements */}
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
        {!isCoach && (
          <div>
            {skipperAnnouncements.length === 0 ? (
              <div style={sp.empty}>
                <Bell size={40} color="#334155" style={{ marginBottom: '12px' }} />
                <p style={{ color: '#475569', fontSize: '14px' }}>Geen aankondigingen van je coach.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {skipperAnnouncements.map(ann => (
                  <AnnouncementCard key={ann.id} ann={ann} canEdit={false} onEdit={() => {}} onDelete={() => {}} onTogglePin={() => {}} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {composeOpen && (
        <ComposeModal
          editing={editingAnn}
          allClubs={allClubs}
          adminClubs={adminClubs}
          isSuperAdmin={isSuperAdmin}
          onSave={handleSave}
          onClose={() => { setComposeOpen(false); setEditingAnn(null); }}
        />
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
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
