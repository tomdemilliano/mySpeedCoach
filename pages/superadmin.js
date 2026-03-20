import React, { useState, useEffect } from 'react';
import {
  UserFactory, ClubFactory, UserMemberLinkFactory, DisciplineFactory,
} from '../constants/dbSchema';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebaseConfig';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  ShieldAlert, UserPlus, Building2, Trash2, Search, Edit2, X, Save,
  Users, UserX, Award, Zap, Plus, Check, ChevronUp, ChevronDown,
  Timer, Hash,
} from 'lucide-react';

// ─── Discipline Form Modal ────────────────────────────────────────────────────
function DisciplineFormModal({ discipline, onSave, onClose }) {
  const isEdit = !!discipline?.id;

  const [form, setForm] = useState({
    name:            discipline?.name            || '',
    ropeType:        discipline?.ropeType        || 'SR',
    durationSeconds: discipline?.durationSeconds ?? '',  // empty string = untimed
    teamSize:        discipline?.teamSize        ?? 1,
    isIndividual:    discipline?.isIndividual    ?? true,
    specialRule:     discipline?.specialRule     || 'none',
    skippersCount:   discipline?.skippersCount   ?? 1,
    isActive:        discipline?.isActive        ?? true,
    sortOrder:       discipline?.sortOrder       ?? 999,
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setError('');
    if (!form.name.trim()) { setError('Geef de discipline een naam.'); return; }
    setSaving(true);
    try {
      const payload = {
        name:            form.name.trim(),
        ropeType:        form.ropeType,
        durationSeconds: form.durationSeconds === '' || form.durationSeconds === null
                           ? null
                           : parseInt(form.durationSeconds),
        teamSize:        parseInt(form.teamSize) || 1,
        isIndividual:    form.isIndividual,
        specialRule:     form.specialRule === 'none' ? null : form.specialRule,
        skippersCount:   parseInt(form.skippersCount) || 1,
        isActive:        form.isActive,
        sortOrder:       parseInt(form.sortOrder) || 999,
      };
      await onSave(payload);
      onClose();
    } catch (e) {
      console.error(e);
      setError('Opslaan mislukt. Probeer opnieuw.');
    } finally {
      setSaving(false);
    }
  };

  const durationOptions = [
    { value: '30',  label: '30 seconden' },
    { value: '60',  label: '1 minuut' },
    { value: '120', label: '2 minuten' },
    { value: '180', label: '3 minuten' },
    { value: '',    label: 'Geen tijdslimiet (onbeperkt)' },
  ];

  return (
    <div style={s.modalOverlay}>
      <div style={{ ...s.modal, maxHeight: '92vh', overflowY: 'auto', borderRadius: '20px' }}>
        <div style={s.modalHeader}>
          <h3 style={{ margin: 0, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: '#f1f5f9' }}>
            <Zap size={18} color="#3b82f6" />
            {isEdit ? 'Discipline bewerken' : 'Nieuwe discipline'}
          </h3>
          <button style={s.iconBtn} onClick={onClose}><X size={18} /></button>
        </div>

        {/* Name */}
        <div style={s.fieldGroup}>
          <label style={s.fieldLabel}>Naam *</label>
          <input
            style={s.input}
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="bijv. Speed Sprint"
            autoFocus
          />
        </div>

        {/* Rope type */}
        <div style={s.fieldGroup}>
          <label style={s.fieldLabel}>Touw type *</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['SR', 'DD'].map(rt => (
              <button key={rt} type="button" onClick={() => set('ropeType', rt)} style={{
                flex: 1, padding: '10px', borderRadius: '8px', border: `1px solid ${form.ropeType === rt ? '#3b82f6' : '#334155'}`,
                fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit',
                backgroundColor: form.ropeType === rt ? '#3b82f622' : 'transparent',
                color: form.ropeType === rt ? '#60a5fa' : '#64748b',
              }}>
                {rt === 'SR' ? '🪢 Single Rope' : '🌀 Double Dutch'}
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div style={s.fieldGroup}>
          <label style={s.fieldLabel}>Duur</label>
          <select style={s.select} value={form.durationSeconds ?? ''} onChange={e => set('durationSeconds', e.target.value)}>
            {durationOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {form.durationSeconds === '' && (
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              ℹ️ Gebruik dit voor disciplines als Triple Under waarbij er geen vaste tijdslimiet is.
            </div>
          )}
        </div>

        {/* Individual vs Team */}
        <div style={s.fieldGroup}>
          <label style={s.fieldLabel}>Type</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={() => { set('isIndividual', true); set('teamSize', 1); set('skippersCount', 1); }} style={{
              flex: 1, padding: '10px', borderRadius: '8px', border: `1px solid ${form.isIndividual ? '#22c55e' : '#334155'}`,
              fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit',
              backgroundColor: form.isIndividual ? '#22c55e22' : 'transparent',
              color: form.isIndividual ? '#22c55e' : '#64748b',
            }}>
              👤 Individueel
            </button>
            <button type="button" onClick={() => set('isIndividual', false)} style={{
              flex: 1, padding: '10px', borderRadius: '8px', border: `1px solid ${!form.isIndividual ? '#f59e0b' : '#334155'}`,
              fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit',
              backgroundColor: !form.isIndividual ? '#f59e0b22' : 'transparent',
              color: !form.isIndividual ? '#f59e0b' : '#64748b',
            }}>
              👥 Team
            </button>
          </div>
        </div>

        {/* Team size + skippers count (only for team) */}
        {!form.isIndividual && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
            <div>
              <label style={s.fieldLabel}>Teamgrootte (totaal)</label>
              <input
                type="number" min="2" max="10"
                style={s.input}
                value={form.teamSize}
                onChange={e => set('teamSize', e.target.value)}
                placeholder="2"
              />
            </div>
            <div>
              <label style={s.fieldLabel}>Aantal springers</label>
              <input
                type="number" min="1" max="10"
                style={s.input}
                value={form.skippersCount}
                onChange={e => set('skippersCount', e.target.value)}
                placeholder="1"
              />
              <div style={{ fontSize: '10px', color: '#475569', marginTop: '3px' }}>
                Bij DD: de 2 touwdraaiers tellen ook mee in teamgrootte
              </div>
            </div>
          </div>
        )}

        {/* Special rule */}
        <div style={s.fieldGroup}>
          <label style={s.fieldLabel}>Speciale regel</label>
          <select style={s.select} value={form.specialRule || 'none'} onChange={e => set('specialRule', e.target.value)}>
            <option value="none">Geen</option>
            <option value="triple_under">Triple Under (15s restart-window)</option>
            <option value="relay">Relay (beurtelings per springer)</option>
          </select>
        </div>

        {/* Sort order */}
        <div style={s.fieldGroup}>
          <label style={s.fieldLabel}>Volgorde</label>
          <input
            type="number" min="1"
            style={s.input}
            value={form.sortOrder}
            onChange={e => set('sortOrder', e.target.value)}
            placeholder="1"
          />
        </div>

        {/* Active */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' }}>
          <input type="checkbox" id="discActive" checked={form.isActive} onChange={e => set('isActive', e.target.checked)} />
          <label htmlFor="discActive" style={{ fontSize: '13px', color: '#94a3b8', cursor: 'pointer' }}>
            Discipline is actief (zichtbaar in teller & selectie)
          </label>
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#ef444422', color: '#ef4444', fontSize: '13px', padding: '10px 12px', borderRadius: '8px', marginBottom: '14px', border: '1px solid #ef444433' }}>
            {error}
          </div>
        )}

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

// ─── Disciplines Tab ──────────────────────────────────────────────────────────
function DisciplinesTab() {
  const [disciplines, setDisciplines] = useState([]);
  const [formOpen,    setFormOpen]    = useState(false);
  const [editing,     setEditing]     = useState(null);
  const [seeding,     setSeeding]     = useState(false);

  useEffect(() => {
    const unsub = DisciplineFactory.getAll(setDisciplines);
    return () => unsub();
  }, []);

  const handleSave = async (data) => {
    if (editing?.id) {
      const { ...rest } = data;
      await DisciplineFactory.update(editing.id, rest);
    } else {
      await DisciplineFactory.create(data);
    }
    setEditing(null);
    setFormOpen(false);
  };

  const handleSeed = async () => {
    if (!confirm('Standaard disciplines toevoegen? Bestaande disciplines met dezelfde naam worden overgeslagen.')) return;
    setSeeding(true);
    try { await DisciplineFactory.seedDefaults(); }
    catch (e) { alert('Seeden mislukt: ' + e.message); }
    finally { setSeeding(false); }
  };

  const handleToggleActive = (disc) =>
    DisciplineFactory.update(disc.id, { isActive: !disc.isActive });

  const handleDelete = (disc) => {
    if (!confirm(`Discipline "${disc.name}" verwijderen?`)) return;
    DisciplineFactory.delete(disc.id);
  };

  const handleMoveUp = (disc) => {
    const idx = disciplines.findIndex(d => d.id === disc.id);
    if (idx === 0) return;
    const prev = disciplines[idx - 1];
    DisciplineFactory.update(disc.id,    { sortOrder: prev.sortOrder });
    DisciplineFactory.update(prev.id, { sortOrder: disc.sortOrder });
  };

  const handleMoveDown = (disc) => {
    const idx = disciplines.findIndex(d => d.id === disc.id);
    if (idx === disciplines.length - 1) return;
    const next = disciplines[idx + 1];
    DisciplineFactory.update(disc.id,    { sortOrder: next.sortOrder });
    DisciplineFactory.update(next.id, { sortOrder: disc.sortOrder });
  };

  const formatDuration = (d) => {
    if (!d.durationSeconds) return '∞ Onbeperkt';
    if (d.durationSeconds < 60) return `${d.durationSeconds}s`;
    return `${d.durationSeconds / 60} min`;
  };

  const formatTeam = (d) => {
    if (d.isIndividual) return '👤 Individueel';
    return `👥 Team ${d.teamSize} (${d.skippersCount} springer${d.skippersCount > 1 ? 's' : ''})`;
  };

  const RULE_LABELS = {
    triple_under: '⚡ Triple Under regel',
    relay:        '🔄 Relay',
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ fontWeight: '800', fontSize: '16px', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={18} color="#3b82f6" /> Disciplines
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
            {disciplines.filter(d => d.isActive).length} actief · {disciplines.length} totaal
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {disciplines.length === 0 && (
            <button onClick={handleSeed} disabled={seeding} style={bs.secondary}>
              {seeding ? 'Seeden…' : '🌱 Standaard disciplines laden'}
            </button>
          )}
          <button onClick={() => { setEditing(null); setFormOpen(true); }} style={bs.primary}>
            <Plus size={15} /> Nieuwe discipline
          </button>
        </div>
      </div>

      {disciplines.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <Zap size={40} color="#334155" style={{ marginBottom: '12px' }} />
          <p style={{ color: '#475569', fontSize: '14px', marginBottom: '16px' }}>Nog geen disciplines aangemaakt.</p>
          <button onClick={handleSeed} disabled={seeding} style={bs.primary}>
            🌱 {seeding ? 'Standaard disciplines laden…' : 'Standaard disciplines laden'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {disciplines.map((disc, idx) => (
            <div key={disc.id} style={{
              backgroundColor: '#1e293b', borderRadius: '12px',
              border: `1px solid ${disc.isActive ? '#334155' : '#1e293b'}`,
              padding: '12px 14px',
              opacity: disc.isActive ? 1 : 0.55,
              display: 'flex', alignItems: 'center', gap: '12px',
            }}>
              {/* Reorder buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
                <button
                  onClick={() => handleMoveUp(disc)}
                  disabled={idx === 0}
                  style={{ ...s.iconBtn, padding: '2px', opacity: idx === 0 ? 0.2 : 1 }}
                >
                  <ChevronUp size={12} />
                </button>
                <button
                  onClick={() => handleMoveDown(disc)}
                  disabled={idx === disciplines.length - 1}
                  style={{ ...s.iconBtn, padding: '2px', opacity: idx === disciplines.length - 1 ? 0.2 : 1 }}
                >
                  <ChevronDown size={12} />
                </button>
              </div>

              {/* Sort order badge */}
              <div style={{ width: '26px', height: '26px', borderRadius: '6px', backgroundColor: '#0f172a', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: '#64748b', flexShrink: 0 }}>
                {disc.sortOrder}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '3px' }}>
                  <span style={{ fontWeight: '700', fontSize: '14px', color: '#f1f5f9' }}>{disc.name}</span>
                  <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', backgroundColor: disc.ropeType === 'SR' ? '#3b82f622' : '#a78bfa22', color: disc.ropeType === 'SR' ? '#60a5fa' : '#a78bfa', border: `1px solid ${disc.ropeType === 'SR' ? '#3b82f644' : '#a78bfa44'}` }}>
                    {disc.ropeType}
                  </span>
                  {!disc.isActive && (
                    <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', backgroundColor: '#ef444422', color: '#ef4444', border: '1px solid #ef444433' }}>
                      Inactief
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: '#64748b', flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <Timer size={10} /> {formatDuration(disc)}
                  </span>
                  <span>{formatTeam(disc)}</span>
                  {disc.specialRule && (
                    <span style={{ color: '#f59e0b' }}>{RULE_LABELS[disc.specialRule] || disc.specialRule}</span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                <button
                  onClick={() => handleToggleActive(disc)}
                  title={disc.isActive ? 'Deactiveren' : 'Activeren'}
                  style={{ ...s.iconBtn, color: disc.isActive ? '#f59e0b' : '#22c55e' }}
                >
                  {disc.isActive ? '⛔' : '✅'}
                </button>
                <button
                  onClick={() => { setEditing(disc); setFormOpen(true); }}
                  style={s.iconBtn}
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => handleDelete(disc)}
                  style={{ ...s.iconBtn, color: '#ef4444' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <DisciplineFormModal
          discipline={editing}
          onSave={handleSave}
          onClose={() => { setFormOpen(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function SuperAdmin() {
  const { uid, loading: authLoading } = useAuth();
  const [hasAccess,   setHasAccess]   = useState(false);
  const [activeTab,   setActiveTab]   = useState('clubs');
  const [searchTerm,  setSearchTerm]  = useState('');

  // Data
  const [users,  setUsers]  = useState([]);
  const [clubs,  setClubs]  = useState([]);

  // uid → Set<clubId> via userMemberLinks
  const [userClubMap,          setUserClubMap]          = useState({});
  const [clubMembersLoading,   setClubMembersLoading]   = useState(false);

  // User tab filters
  const [userClubFilter, setUserClubFilter] = useState('');

  // Modals / editing
  const [editingId,       setEditingId]       = useState(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isClubModalOpen, setIsClubModalOpen] = useState(false);
  const [userForm,        setUserForm]        = useState({ firstName: '', lastName: '', email: '', role: 'user' });
  const [clubForm,        setClubForm]        = useState({ name: '', logoUrl: '' });

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
    return () => { u1(); u2(); };
  }, [hasAccess]);

  // ── uid → Set<clubId> via userMemberLinks ──────────────────────────────────
  useEffect(() => {
    if (!hasAccess) return;
    setClubMembersLoading(true);
    const unsub = onSnapshot(collection(db, 'userMemberLinks'), (snap) => {
      const map = {};
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
  const filteredUsers = users.filter(u => {
    const matchesSearch = `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    if (!userClubFilter) return true;
    if (userClubFilter === '__none__') {
      const c = userClubMap[u.id];
      return !c || c.size === 0;
    }
    const c = userClubMap[u.id];
    return c && c.has(userClubFilter);
  });

  const getUserClubNames = (userId) => {
    const clubIds = userClubMap[userId];
    if (!clubIds || clubIds.size === 0) return [];
    return [...clubIds].map(cid => clubs.find(c => c.id === cid)?.name).filter(Boolean);
  };

  const countForClub = (clubId) => {
    if (clubId === '__none__') {
      return users.filter(u => { const c = userClubMap[u.id]; return !c || c.size === 0; }).length;
    }
    return users.filter(u => { const c = userClubMap[u.id]; return c && c.has(clubId); }).length;
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleUserSubmit = async (e) => {
    e.preventDefault();
    editingId
      ? await UserFactory.updateProfile(editingId, userForm)
      : await UserFactory.create(Date.now().toString(), userForm);
    setIsUserModalOpen(false);
  };

  const handleClubSubmit = async (e) => {
    e.preventDefault();
    editingId
      ? await ClubFactory.update(editingId, clubForm)
      : await ClubFactory.create(clubForm);
    setIsClubModalOpen(false);
  };

  const tabs = [
    { key: 'clubs',       label: 'Clubs' },
    { key: 'users',       label: 'Gebruikers' },
    { key: 'disciplines', label: 'Disciplines' },
  ];

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (authLoading) return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
      <style>{css}</style>
      <div style={s.spinner} />
      <p style={{ color: '#64748b', fontSize: '14px', fontFamily: 'system-ui,sans-serif' }}>Laden…</p>
    </div>
  );

  if (!hasAccess) return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', fontFamily: 'system-ui,sans-serif' }}>
      <ShieldAlert size={40} color="#ef4444" />
      <p style={{ color: '#ef4444', fontSize: '16px', fontWeight: '700' }}>Geen toegang</p>
      <p style={{ color: '#64748b', fontSize: '13px', textAlign: 'center', maxWidth: '300px' }}>
        Deze pagina is alleen toegankelijk voor SuperAdmins.
      </p>
      <a href="/" style={{ padding: '10px 20px', backgroundColor: '#3b82f6', color: 'white', borderRadius: '8px', textDecoration: 'none', fontWeight: '600', fontSize: '14px' }}>
        Terug naar home
      </a>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <style>{css}</style>

      <header style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldAlert size={20} color="#ef4444" />
            <span style={s.headerTitle}>SuperAdmin</span>
            <span style={{ fontSize: '11px', color: '#475569', fontWeight: '500' }}>Applicatiebeheer</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <a href="/badge-beheer" style={{ fontSize: '11px', color: '#a78bfa', textDecoration: 'none', fontWeight: '600', padding: '5px 10px', backgroundColor: '#a78bfa15', borderRadius: '6px', border: '1px solid #a78bfa33' }}>
              Badge Beheer →
            </a>
            <a href="/clubadmin" style={{ fontSize: '11px', color: '#22c55e', textDecoration: 'none', fontWeight: '600', padding: '5px 10px', backgroundColor: '#22c55e15', borderRadius: '6px', border: '1px solid #22c55e33' }}>
              Clubbeheer →
            </a>
          </div>
        </div>

        <div style={s.tabBar}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setSearchTerm(''); }}
              style={{ ...s.tab, ...(activeTab === tab.key ? s.tabActive : {}) }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <main style={s.content}>

        {/* ═══ CLUBS ═══ */}
        {activeTab === 'clubs' && (
          <div>
            <div style={s.actionBar}>
              <div style={s.searchWrap}>
                <Search size={16} style={s.searchIcon} />
                <input
                  placeholder="Zoek club…"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={s.searchInput}
                />
              </div>
              <button
                style={s.addBtn}
                onClick={() => { setEditingId(null); setClubForm({ name: '', logoUrl: '' }); setIsClubModalOpen(true); }}
              >
                <Building2 size={16} /><span className="btn-label"> Nieuwe club</span>
              </button>
            </div>

            <div className="card-grid">
              {clubs
                .filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
                .map(club => (
                  <div key={club.id} style={s.clubCard}>
                    <div style={s.clubCardBody}>
                      {club.logoUrl
                        ? <img src={club.logoUrl} style={s.clubLogo} alt={club.name} />
                        : <div style={s.clubLogoPlaceholder}><Building2 size={32} color="#64748b" /></div>
                      }
                      <div style={s.clubCardName}>{club.name}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                        <a
                          href={`/clubadmin?club=${club.id}`}
                          style={{ fontSize: '11px', color: '#22c55e', display: 'inline-block', fontWeight: '600' }}
                        >
                          Groepen & leden →
                        </a>
                      </div>
                    </div>
                    <div style={s.clubCardActions}>
                      <button
                        style={s.iconBtn}
                        onClick={() => { setEditingId(club.id); setClubForm(club); setIsClubModalOpen(true); }}
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        style={{ ...s.iconBtn, color: '#ef4444' }}
                        onClick={() => { if (confirm('Club verwijderen? Dit verwijdert ook alle groepen.')) ClubFactory.delete(club.id); }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              }
              {clubs.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
                <p style={s.emptyText}>Geen clubs gevonden.</p>
              )}
            </div>
          </div>
        )}

        {/* ═══ USERS ═══ */}
        {activeTab === 'users' && (
          <div>
            <div style={s.actionBar}>
              <div style={s.searchWrap}>
                <Search size={16} style={s.searchIcon} />
                <input
                  placeholder="Zoek gebruiker…"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={s.searchInput}
                />
              </div>
              <button
                style={s.addBtn}
                onClick={() => { setEditingId(null); setUserForm({ firstName: '', lastName: '', email: '', role: 'user' }); setIsUserModalOpen(true); }}
              >
                <UserPlus size={16} /><span className="btn-label"> Nieuwe gebruiker</span>
              </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', color: '#475569', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Building2 size={11} /> Filter op club
                {clubMembersLoading && <span style={{ fontSize: '10px', color: '#475569', fontWeight: '400' }}>— laden…</span>}
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button onClick={() => setUserClubFilter('')} style={{ ...s.filterPill, ...(userClubFilter === '' ? s.filterPillActive : {}) }}>
                  <Users size={11} /> Alle
                  <span style={{ ...s.pillCount, backgroundColor: userClubFilter === '' ? '#1e293b' : '#334155', color: '#94a3b8' }}>
                    {users.length}
                  </span>
                </button>
                {clubs.map(club => {
                  const count    = countForClub(club.id);
                  const isActive = userClubFilter === club.id;
                  return (
                    <button key={club.id} onClick={() => setUserClubFilter(club.id)} style={{ ...s.filterPill, ...(isActive ? s.filterPillActive : {}) }}>
                      {club.logoUrl
                        ? <img src={club.logoUrl} alt="" style={{ width: '12px', height: '12px', borderRadius: '2px', objectFit: 'cover' }} />
                        : <Building2 size={11} />
                      }
                      {club.name}
                      <span style={{ ...s.pillCount, backgroundColor: isActive ? '#1e293b' : '#334155', color: '#94a3b8' }}>{count}</span>
                    </button>
                  );
                })}
                <button onClick={() => setUserClubFilter('__none__')} style={{ ...s.filterPill, ...(userClubFilter === '__none__' ? { ...s.filterPillActive, borderColor: '#f59e0b', color: '#f59e0b' } : {}) }}>
                  <UserX size={11} /> Geen club
                  <span style={{ ...s.pillCount, backgroundColor: userClubFilter === '__none__' ? '#1e293b' : '#f59e0b22', color: userClubFilter === '__none__' ? '#94a3b8' : '#f59e0b' }}>
                    {countForClub('__none__')}
                  </span>
                </button>
              </div>
            </div>

            <div style={{ fontSize: '12px', color: '#475569', marginBottom: '12px' }}>
              {filteredUsers.length} gebruiker{filteredUsers.length !== 1 ? 's' : ''} gevonden
              {userClubFilter && userClubFilter !== '__none__' && (
                <span style={{ color: '#ef4444', marginLeft: '6px' }}>
                  in {clubs.find(c => c.id === userClubFilter)?.name}
                </span>
              )}
              {userClubFilter === '__none__' && (
                <span style={{ color: '#f59e0b', marginLeft: '6px' }}>zonder clublidmaatschap</span>
              )}
            </div>

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
                      <button style={s.iconBtn} onClick={() => { setEditingId(user.id); setUserForm(user); setIsUserModalOpen(true); }}>
                        <Edit2 size={16} />
                      </button>
                      <button style={{ ...s.iconBtn, color: '#ef4444' }} onClick={() => { if (confirm('Gebruiker wissen?')) UserFactory.delete(user.id); }}>
                        <Trash2 size={16} />
                      </button>
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

        {/* ═══ DISCIPLINES ═══ */}
        {activeTab === 'disciplines' && <DisciplinesTab />}

      </main>

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
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getRoleColor = r =>
  r === 'superadmin' ? '#ef4444' : r === 'clubadmin' ? '#f59e0b' : '#3b82f6';

// ─── Button styles ────────────────────────────────────────────────────────────
const bs = {
  primary:   { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' },
  secondary: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '8px', color: '#94a3b8', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' },
};

// ─── CSS ──────────────────────────────────────────────────────────────────────
const css = `
  * { box-sizing: border-box; }
  .btn-label { display: inline; }
  .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; }
  .user-list  { display: flex; flex-direction: column; gap: 10px; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @media (max-width: 600px) {
    .btn-label { display: none; }
    .card-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
  }
  @media (max-width: 400px) { .card-grid { grid-template-columns: 1fr; } }
`;

const s = {
  page:        { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'system-ui, sans-serif' },
  spinner:     { width: '36px', height: '36px', border: '3px solid #1e293b', borderTop: '3px solid #ef4444', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  header:      { backgroundColor: '#1e293b', borderBottom: '1px solid #334155', padding: '12px 16px', position: 'sticky', top: 0, zIndex: 100, display: 'flex', flexDirection: 'column', gap: '10px' },
  headerTitle: { fontWeight: '800', fontSize: '16px', color: '#f1f5f9' },
  tabBar:      { display: 'flex', gap: '6px', overflowX: 'auto' },
  tab:         { padding: '7px 14px', borderRadius: '8px', border: 'none', backgroundColor: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap' },
  tabActive:   { backgroundColor: '#ef4444', color: 'white' },
  content:     { padding: '16px', maxWidth: '900px', margin: '0 auto' },
  actionBar:   { display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center' },
  searchWrap:  { position: 'relative', flex: 1 },
  searchIcon:  { position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' },
  searchInput: { width: '100%', padding: '10px 10px 10px 34px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#1e293b', color: 'white', fontSize: '14px' },
  addBtn:      { display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 14px', backgroundColor: '#ef4444', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', fontWeight: '600', fontSize: '13px', whiteSpace: 'nowrap', flexShrink: 0 },
  iconBtn:     { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' },
  filterPill:  { padding: '6px 12px', borderRadius: '20px', border: '1px solid #334155', backgroundColor: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' },
  filterPillActive: { backgroundColor: '#334155', color: '#f1f5f9', borderColor: '#475569' },
  pillCount:   { padding: '1px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold' },
  userCard:    { backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px' },
  userCardAvatar: { width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '14px', flexShrink: 0, color: 'white' },
  userCardName:   { fontWeight: '600', fontSize: '14px', color: '#f1f5f9', marginBottom: '2px' },
  userCardEmail:  { fontSize: '12px', color: '#64748b', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  roleBadge:   { display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', color: 'white' },
  clubCard:    { backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' },
  clubCardBody:{ padding: '16px', textAlign: 'center' },
  clubLogo:    { width: '60px', height: '60px', borderRadius: '10px', objectFit: 'cover', marginBottom: '10px' },
  clubLogoPlaceholder: { width: '60px', height: '60px', borderRadius: '10px', backgroundColor: '#0f172a', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  clubCardName:    { fontWeight: '700', fontSize: '14px', color: '#f1f5f9' },
  clubCardActions: { display: 'flex', justifyContent: 'center', gap: '4px', padding: '8px', borderTop: '1px solid #334155' },
  emptyText:   { color: '#475569', fontSize: '14px', textAlign: 'center', padding: '20px 0' },
  modalOverlay:{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 500 },
  modal:       { backgroundColor: '#1e293b', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '560px', border: '1px solid #334155', maxHeight: '90vh', overflowY: 'auto' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', color: '#f1f5f9' },
  form:        { display: 'flex', flexDirection: 'column', gap: '10px' },
  fieldLabel:  { display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px', fontWeight: '600' },
  fieldGroup:  { marginBottom: '14px' },
  input:       { width: '100%', padding: '11px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px', fontFamily: 'inherit' },
  select:      { width: '100%', padding: '11px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px', fontFamily: 'inherit' },
  saveBtn:     { width: '100%', backgroundColor: '#ef4444', border: 'none', color: 'white', padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' },
};
