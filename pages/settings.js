/**
 * pages/settings.js  —  Gebruikersinstellingen
 *
 * Replaces the settings modal on index.js with a full page.
 * Four tabs:
 *   1. Algemeen      — naam, e-mail
 *   2. Meldingen     — push-notificaties
 *   3. Lidmaatschap  — clubaanvragen beheren, nieuwe aanvraag indienen
 *   4. Hartslagzones — BPM-zones aanpassen
 *
 * Rules followed:
 *   - All DB calls go through factories (CLAUDE.md §1)
 *   - No <form> elements (CLAUDE.md §4)
 *   - All styles are inline (CLAUDE.md §9)
 *   - Dutch UI strings (CLAUDE.md §9)
 *   - Pages Router (CLAUDE.md §10)
 */

import { useState, useEffect } from 'react';
import {
  UserFactory, ClubFactory, ClubJoinRequestFactory,
  UserMemberLinkFactory, GroupFactory, MemberLabelFactory, SeasonFactory
} from '../constants/dbSchema';
import { useAuth } from '../contexts/AuthContext';
import { PushSettingsToggle } from '../components/PushPermissionBanner';
import {
  User, Bell, Users, Heart,
  Save, Send, Trash2, EyeOff,
  CheckCircle2, XCircle, Clock,
  Building2, UserX, AlertCircle,
  ArrowLeft, ChevronRight, Trophy, ChevronDown
} from 'lucide-react';
import { useDisciplines } from '../hooks/useDisciplines';

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_ZONES = [
  { name: 'Warm-up',   min: 0,   max: 120, color: '#94a3b8' },
  { name: 'Fat Burn',  min: 120, max: 145, color: '#22c55e' },
  { name: 'Aerobic',   min: 145, max: 165, color: '#facc15' },
  { name: 'Anaerobic', min: 165, max: 185, color: '#f97316' },
  { name: 'Red Line',  min: 185, max: 250, color: '#ef4444' },
];

const STATUS_CONFIG = {
  pending:  { label: 'In behandeling', color: '#f59e0b', icon: Clock },
  approved: { label: 'Goedgekeurd',    color: '#22c55e', icon: CheckCircle2 },
  rejected: { label: 'Afgewezen',      color: '#ef4444', icon: XCircle },
};

const TABS = [
  { key: 'algemeen',    label: 'Algemeen',      icon: User   },
  { key: 'meldingen',   label: 'Meldingen',     icon: Bell   },
  { key: 'lidmaatschap',label: 'Lidmaatschap',  icon: Users  },
  { key: 'labels',      label: 'Niveaulabels',  icon: Trophy },
  { key: 'hartslag',    label: 'Hartslagzones', icon: Heart  },
];

// ─── Tab: Algemeen ────────────────────────────────────────────────────────────
function AlgemeenTab({ uid, currentUser, onSaved }) {
  const [form,   setForm]   = useState({
    firstName: currentUser?.firstName || '',
    lastName:  currentUser?.lastName  || '',
    email:     currentUser?.email     || '',
  });
  const [saving,   setSaving]   = useState(false);
  const [saveOk,   setSaveOk]   = useState(false);
  const [error,    setError]    = useState('');

  // Sync when currentUser loads
  useEffect(() => {
    if (currentUser) {
      setForm({
        firstName: currentUser.firstName || '',
        lastName:  currentUser.lastName  || '',
        email:     currentUser.email     || '',
      });
    }
  }, [currentUser?.firstName, currentUser?.lastName, currentUser?.email]);

  const handleSave = async () => {
    setError('');
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('Voornaam en achternaam zijn verplicht.');
      return;
    }
    setSaving(true);
    try {
      await UserFactory.updateProfile(uid, {
        firstName: form.firstName.trim(),
        lastName:  form.lastName.trim(),
        email:     form.email.trim(),
      });
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2500);
      onSaved?.({ firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim() });
    } catch {
      setError('Opslaan mislukt. Probeer opnieuw.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={css.tabBody}>
      <SectionHeader title="Profielgegevens" subtitle="Je naam en e-mailadres" />

      <div style={css.fieldGroup}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={css.label}>Voornaam *</label>
            <input
              style={css.input}
              value={form.firstName}
              onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
              placeholder="Emma"
            />
          </div>
          <div>
            <label style={css.label}>Achternaam *</label>
            <input
              style={css.input}
              value={form.lastName}
              onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
              placeholder="De Smet"
            />
          </div>
        </div>

        <div style={{ marginTop: '12px' }}>
          <label style={css.label}>E-mailadres</label>
          <input
            style={css.input}
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="jouw@email.com"
          />
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      <button
        onClick={handleSave}
        disabled={saving}
        style={{ ...css.primaryBtn, opacity: saving ? 0.65 : 1 }}
      >
        {saveOk
          ? <><CheckCircle2 size={16} color="white" /> Opgeslagen!</>
          : <><Save size={16} /> {saving ? 'Opslaan…' : 'Wijzigingen opslaan'}</>}
      </button>
    </div>
  );
}

// ─── Tab: Meldingen ───────────────────────────────────────────────────────────
function MeldingenTab({ uid }) {
  return (
    <div style={css.tabBody}>
      <SectionHeader title="Push-notificaties" subtitle="Ontvang meldingen als je coach een nieuw bericht plaatst" />
      <div style={css.card}>
        <PushSettingsToggle uid={uid} />
      </div>
    </div>
  );
}

// ─── Tab: Lidmaatschap ────────────────────────────────────────────────────────
function LidmaatschapTab({ uid, currentUser }) {
  const [allClubs,     setAllClubs]     = useState([]);
  const [requests,     setRequests]     = useState([]);
  const [memberships,  setMemberships]  = useState([]);
  const [showForm,     setShowForm]     = useState(false);
  const [selectedClub, setSelectedClub] = useState('');
  const [message,      setMessage]      = useState('');
  const [sending,      setSending]      = useState(false);
  const [joinError,    setJoinError]    = useState('');

  useEffect(() => {
    const u1 = ClubFactory.getAll(setAllClubs);
    return () => u1();
  }, []);

  useEffect(() => {
    if (!uid) return;
    const u = ClubJoinRequestFactory.getByUser(uid, (data) => {
      setRequests([...data].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    });
    return () => u();
  }, [uid]);

  // Resolve active group memberships
  useEffect(() => {
    if (!uid || allClubs.length === 0) return;
    const collected = {};
    const allUnsubs = [];

    allClubs.forEach(club => {
      const u = GroupFactory.getGroupsByClub(club.id, (groups) => {
        groups.forEach(group => {
          const u2 = GroupFactory.getMembersByGroup(club.id, group.id, (members) => {
            const me  = members.find(m => m.id === uid);
            const key = `${club.id}-${group.id}`;
            if (me) {
              collected[key] = {
                clubId:     club.id,
                clubName:   club.name,
                groupId:    group.id,
                groupName:  group.name,
                isSkipper:  me.isSkipper,
                isCoach:    me.isCoach,
              };
            } else {
              delete collected[key];
            }
            setMemberships(Object.values(collected));
          });
          allUnsubs.push(u2);
        });
      });
      allUnsubs.push(u);
    });

    return () => allUnsubs.forEach(u => u && u());
  }, [uid, allClubs]);

  const handleSend = async () => {
    setJoinError('');
    if (!selectedClub) { setJoinError('Selecteer een club.'); return; }
    const already = requests.find(r => r.clubId === selectedClub && r.status === 'pending');
    if (already) { setJoinError('Je hebt al een openstaande aanvraag voor deze club.'); return; }
    setSending(true);
    try {
      const club = allClubs.find(c => c.id === selectedClub);
      await ClubJoinRequestFactory.create(
        uid,
        { firstName: currentUser?.firstName || '', lastName: currentUser?.lastName || '', email: currentUser?.email || '' },
        selectedClub,
        club?.name || '',
        message.trim(),
      );
      setShowForm(false);
      setSelectedClub('');
      setMessage('');
    } catch {
      setJoinError('Aanvraag kon niet worden verzonden. Probeer opnieuw.');
    } finally {
      setSending(false);
    }
  };

  const visibleRequests = requests.filter(r => !r.hidden);

  return (
    <div style={css.tabBody}>

      {/* Active memberships */}
      {memberships.length > 0 && (
        <>
          <SectionHeader title="Actieve lidmaatschappen" subtitle="Clubs en groepen waar je nu lid van bent" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '28px' }}>
            {memberships.map((m, i) => (
              <div key={i} style={{ ...css.card, display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '9px', backgroundColor: '#3b82f622', border: '1px solid #3b82f644', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Building2 size={16} color="#60a5fa" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: '700', fontSize: '14px', color: '#f1f5f9' }}>{m.clubName}</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>{m.groupName}</div>
                </div>
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  {m.isSkipper && <RolePill label="Skipper" color="#3b82f6" />}
                  {m.isCoach   && <RolePill label="Coach"   color="#f59e0b" />}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Requests */}
      {visibleRequests.length > 0 && (
        <>
          <SectionHeader title="Clubaanvragen" subtitle="Status van je ingediende aanvragen" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '28px' }}>
            {visibleRequests.map(req => {
              const cfg  = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
              const Icon = cfg.icon;
              return (
                <div key={req.id} style={{ ...css.card, borderColor: `${cfg.color}33` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '9px', backgroundColor: `${cfg.color}22`, border: `1px solid ${cfg.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Building2 size={16} color={cfg.color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: '700', fontSize: '14px', color: '#f1f5f9' }}>{req.clubName}</div>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '700', color: cfg.color, marginTop: '2px' }}>
                        <Icon size={10} /> {cfg.label}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                      {req.status !== 'pending' && (
                        <button onClick={() => ClubJoinRequestFactory.hide(req.id)} style={css.iconBtn} title="Verbergen">
                          <EyeOff size={14} />
                        </button>
                      )}
                      <button onClick={() => { if (confirm('Aanvraag verwijderen?')) ClubJoinRequestFactory.delete(req.id); }} style={{ ...css.iconBtn, color: '#ef4444' }} title="Verwijderen">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {req.status === 'rejected' && req.rejectionReason && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#ef4444', backgroundColor: '#ef444411', borderRadius: '6px', padding: '8px 10px', borderLeft: '3px solid #ef4444' }}>
                      <strong>Reden:</strong> {req.rejectionReason}
                    </div>
                  )}
                  {req.status === 'approved' && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#22c55e', backgroundColor: '#22c55e11', borderRadius: '6px', padding: '8px 10px', borderLeft: '3px solid #22c55e' }}>
                      Aanvraag goedgekeurd. Een coach voegt je toe aan een groep.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* New join request */}
      <SectionHeader title="Nieuwe aanvraag" subtitle="Word lid van een club" />
      {!showForm ? (
        <button onClick={() => { setShowForm(true); setJoinError(''); }} style={css.secondaryBtn}>
          <Send size={14} /> Aanvraag indienen bij een club
        </button>
      ) : (
        <div style={css.card}>
          <label style={css.label}>Club *</label>
          <select
            style={{ ...css.input, marginBottom: '12px' }}
            value={selectedClub}
            onChange={e => setSelectedClub(e.target.value)}
          >
            <option value="">-- Selecteer een club --</option>
            {allClubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <label style={css.label}>Motivatie <span style={{ color: '#475569', fontWeight: '400', textTransform: 'none' }}>(optioneel)</span></label>
          <textarea
            placeholder="Vertel iets over jezelf…"
            value={message}
            onChange={e => setMessage(e.target.value)}
            style={{ ...css.input, minHeight: '80px', resize: 'vertical', lineHeight: 1.5, marginBottom: '12px', fontFamily: 'inherit' }}
          />

          {joinError && <ErrorBanner message={joinError} />}

          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <button
              onClick={handleSend}
              disabled={!selectedClub || sending}
              style={{ ...css.primaryBtn, flex: 1, opacity: !selectedClub || sending ? 0.5 : 1 }}
            >
              <Send size={14} /> {sending ? 'Versturen…' : 'Versturen'}
            </button>
            <button
              onClick={() => { setShowForm(false); setJoinError(''); setSelectedClub(''); setMessage(''); }}
              style={css.secondaryBtn}
            >
              Annuleren
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Hartslagzones ───────────────────────────────────────────────────────
function HartslagTab({ uid, currentUser, onSaved }) {
  const [zones,   setZones]   = useState(currentUser?.heartrateZones || DEFAULT_ZONES);
  const [saving,  setSaving]  = useState(false);
  const [saveOk,  setSaveOk]  = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (currentUser?.heartrateZones) setZones(currentUser.heartrateZones);
  }, [currentUser]);

  const handleSave = async () => {
    setError('');
    // Basic validation: each zone's min must be < max
    for (const z of zones) {
      if (z.min >= z.max) {
        setError(`Zone "${z.name}": min (${z.min}) moet kleiner zijn dan max (${z.max}).`);
        return;
      }
    }
    setSaving(true);
    try {
      await UserFactory.updateZones(uid, zones);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2500);
      onSaved?.(zones);
    } catch {
      setError('Opslaan mislukt. Probeer opnieuw.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => setZones(DEFAULT_ZONES);

  const updateZone = (idx, field, value) => {
    setZones(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: typeof value === 'string' && field !== 'name' && field !== 'color' ? parseInt(value) || 0 : value };
      return next;
    });
  };

  return (
    <div style={css.tabBody}>
      <SectionHeader title="Hartslagzones" subtitle="Pas de BPM-grenzen aan voor jouw profiel" />

      {/* Visual zone bar */}
      <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', marginBottom: '20px', gap: '2px' }}>
        {zones.map(z => (
          <div key={z.name} style={{ flex: 1, backgroundColor: z.color, borderRadius: '2px' }} />
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
        {zones.map((zone, idx) => (
          <div key={idx} style={css.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {/* Color dot */}
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: zone.color, flexShrink: 0 }} />

              {/* Zone name */}
              <div style={{ width: '80px', fontSize: '13px', fontWeight: '600', color: '#94a3b8', flexShrink: 0 }}>
                {zone.name}
              </div>

              {/* Min */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                <input
                  type="number"
                  value={zone.min}
                  onChange={e => updateZone(idx, 'min', e.target.value)}
                  style={{ ...css.inputCompact, width: '70px' }}
                />
                <span style={{ fontSize: '11px', color: '#475569' }}>–</span>
                <input
                  type="number"
                  value={zone.max}
                  onChange={e => updateZone(idx, 'max', e.target.value)}
                  style={{ ...css.inputCompact, width: '70px' }}
                />
                <span style={{ fontSize: '11px', color: '#475569', flexShrink: 0 }}>BPM</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {error && <ErrorBanner message={error} />}

      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ ...css.primaryBtn, flex: 1, opacity: saving ? 0.65 : 1 }}
        >
          {saveOk
            ? <><CheckCircle2 size={16} color="white" /> Opgeslagen!</>
            : <><Save size={16} /> {saving ? 'Opslaan…' : 'Zones opslaan'}</>}
        </button>
        <button onClick={handleReset} style={css.secondaryBtn} title="Standaard herstellen">
          Standaard
        </button>
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ fontSize: '15px', fontWeight: '700', color: '#f1f5f9', marginBottom: '2px' }}>{title}</div>
      {subtitle && <div style={{ fontSize: '12px', color: '#64748b' }}>{subtitle}</div>}
    </div>
  );
}

function RolePill({ label, color }) {
  return (
    <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700', backgroundColor: `${color}22`, color, border: `1px solid ${color}44` }}>
      {label}
    </span>
  );
}

function ErrorBanner({ message }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#ef444422', color: '#ef4444', fontSize: '13px', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ef444433', marginBottom: '12px' }}>
      <AlertCircle size={14} style={{ flexShrink: 0 }} />
      <span>{message}</span>
    </div>
  );
}

const LABEL_COLORS = { A: '#22c55e', B: '#f59e0b', C: '#ef4444' };
const LABEL_DESCRIPTIONS = {
  A: 'Nationaal niveau',
  B: 'Regionaal niveau',
  C: 'Clubniveau',
};
 
function LabelBadge({ label }) {
  if (!label) return <span style={{ fontSize: '12px', color: '#334155' }}>—</span>;
  const color = LABEL_COLORS[label] || '#64748b';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: '28px', height: '28px', borderRadius: '7px',
      backgroundColor: color + '22', border: `1px solid ${color}55`,
      fontSize: '13px', fontWeight: '800', color,
    }}>
      {label}
    </span>
  );
}
 
export function LabelsTab({ uid, currentUser }) {
  const { disciplines, loading: discsLoading } = useDisciplines();
  const [memberContext, setMemberContext] = useState(null);
  const [club,          setClub]          = useState(null);
  const [seasons,       setSeasons]       = useState([]);
  const [labelsBySeasonId, setLabelsBySeasonId] = useState({});
  const [loading,       setLoading]       = useState(true);
  const [expandedSeason, setExpandedSeason] = useState(null);
 
  const eligibleDiscs = disciplines.filter(d => d.hasCompetitiveLabel && d.isActive !== false);
 
  // Resolve member context
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    const unsub = UserMemberLinkFactory.getForUser(uid, async (profiles) => {
      const self = profiles.find(p => p.link.relationship === 'self');
      if (!self || cancelled) { setLoading(false); return; }
      const ctx = { clubId: self.member.clubId, memberId: self.member.id };
      setMemberContext(ctx);
 
      // Load club
      const clubSnap = await ClubFactory.getById(ctx.clubId);
      if (!cancelled && clubSnap.exists()) setClub({ id: clubSnap.id, ...clubSnap.data() });
    });
    return () => { cancelled = true; unsub(); };
  }, [uid]);
 
  // Load seasons and labels for this member
  useEffect(() => {
    if (!memberContext) return;
    let cancelled = false;
    const { clubId, memberId } = memberContext;
 
    const unsub = SeasonFactory.getAll(clubId, async (allSeasons) => {
      if (cancelled) return;
      const active = allSeasons.filter(s => !s.isAbandoned);
      setSeasons(active);
 
      // Auto-expand current season
      const now = Date.now();
      const current = active.find(s => {
        const start = s.startDate?.seconds ? s.startDate.seconds * 1000 : null;
        const end   = s.endDate?.seconds   ? s.endDate.seconds   * 1000 : null;
        return start && end && start <= now && now <= end;
      });
      if (current && !expandedSeason) setExpandedSeason(current.id);
 
      // Load labels for each season
      const map = {};
      await Promise.all(active.map(async season => {
        const labelDoc = await MemberLabelFactory.getForMember(clubId, season.id, memberId);
        map[season.id] = labelDoc || null;
      }));
      if (!cancelled) {
        setLabelsBySeasonId(map);
        setLoading(false);
      }
    });
 
    return () => { cancelled = true; unsub(); };
  }, [memberContext]);
 
  const fmtDate = (val) => {
    if (!val) return '—';
    const ms = val?.seconds ? val.seconds * 1000 : new Date(val).getTime();
    if (isNaN(ms)) return '—';
    return new Date(ms).toLocaleDateString('nl-BE', { month: 'short', year: 'numeric' });
  };
 
  if (!discsLoading && (currentUser?.skipperType !== 'competitive')) {
    return (
      <div style={tabBody}>
        <SectionHeaderSimple title="Niveaulabels" subtitle="Jouw competitief niveau per seizoen en discipline" />
        <div style={emptyCard}>
          <Trophy size={32} color="#334155" style={{ marginBottom: '10px' }} />
          <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>
            Niveaulabels zijn alleen van toepassing op competitieve skippers.
          </p>
        </div>
      </div>
    );
  }
 
  if (loading) {
    return (
      <div style={tabBody}>
        <SectionHeaderSimple title="Niveaulabels" subtitle="Jouw competitief niveau per seizoen en discipline" />
        <div style={emptyCard}><span style={{ fontSize: '13px', color: '#64748b' }}>Laden…</span></div>
      </div>
    );
  }
 
  if (seasons.length === 0) {
    return (
      <div style={tabBody}>
        <SectionHeaderSimple title="Niveaulabels" subtitle="Jouw competitief niveau per seizoen en discipline" />
        <div style={emptyCard}>
          <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>
            Nog geen seizoenen aangemaakt voor jouw club.
          </p>
        </div>
      </div>
    );
  }
 
  return (
    <div style={tabBody}>
      <SectionHeaderSimple title="Niveaulabels" subtitle="Jouw competitief niveau per seizoen en discipline" />
 
      {/* Legend */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {Object.entries(LABEL_DESCRIPTIONS).map(([label, desc]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <LabelBadge label={label} />
            <span style={{ fontSize: '11px', color: '#64748b' }}>{desc}</span>
          </div>
        ))}
      </div>
 
      {/* Season list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {seasons.map(season => {
          const labelDoc   = labelsBySeasonId[season.id];
          const isExpanded = expandedSeason === season.id;
          const now        = Date.now();
          const start      = season.startDate?.seconds ? season.startDate.seconds * 1000 : null;
          const end        = season.endDate?.seconds   ? season.endDate.seconds   * 1000 : null;
          const isCurrent  = start && end && start <= now && now <= end;
 
          const hasAnyLabel = labelDoc && (
            labelDoc.allroundLabel ||
            (labelDoc.disciplines || []).some(d => d.label)
          );
 
          return (
            <div key={season.id} style={{
              backgroundColor: '#1e293b', borderRadius: '12px',
              border: `1px solid ${isCurrent ? '#3b82f644' : '#334155'}`,
              overflow: 'hidden',
            }}>
              {/* Season header row */}
              <button
                onClick={() => setExpandedSeason(isExpanded ? null : season.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 14px', background: 'none', border: 'none',
                  cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: '700', fontSize: '14px', color: '#f1f5f9' }}>
                      {season.name}
                    </span>
                    {isCurrent && (
                      <span style={{ fontSize: '9px', fontWeight: '800', color: '#3b82f6', backgroundColor: '#3b82f622', border: '1px solid #3b82f644', borderRadius: '6px', padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                        Huidig
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                    {fmtDate(season.startDate)} — {fmtDate(season.endDate)}
                  </div>
                </div>
 
                {/* Summary badges when collapsed */}
                {!isExpanded && hasAnyLabel && (
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    {labelDoc.allroundLabel && <LabelBadge label={labelDoc.allroundLabel} />}
                    {(labelDoc.disciplines || []).slice(0, 3).map((d, i) => (
                      d.label ? <LabelBadge key={i} label={d.label} /> : null
                    ))}
                  </div>
                )}
 
                {!isExpanded && !hasAnyLabel && (
                  <span style={{ fontSize: '11px', color: '#334155', flexShrink: 0 }}>Geen labels</span>
                )}
 
                {isExpanded
                  ? <ChevronUp size={15} color="#475569" style={{ flexShrink: 0 }} />
                  : <ChevronDown size={15} color="#475569" style={{ flexShrink: 0 }} />}
              </button>
 
              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid #334155', padding: '12px 14px' }}>
                  {!labelDoc ? (
                    <p style={{ fontSize: '12px', color: '#475569', margin: 0 }}>
                      Nog geen labels toegewezen voor dit seizoen.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {/* Allround */}
                      {labelDoc.allroundLabel && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b' }}>
                          <span style={{ fontSize: '12px', color: '#94a3b8', flex: 1 }}>Allround</span>
                          <LabelBadge label={labelDoc.allroundLabel} />
                          <span style={{ fontSize: '11px', color: LABEL_COLORS[labelDoc.allroundLabel] || '#64748b' }}>
                            {LABEL_DESCRIPTIONS[labelDoc.allroundLabel] || ''}
                          </span>
                        </div>
                      )}
 
                      {/* Per discipline */}
                      {(labelDoc.disciplines || []).map(entry => {
                        if (!entry.label) return null;
                        const disc = eligibleDiscs.find(d => d.id === entry.disciplineId);
                        if (!disc) return null;
                        return (
                          <div key={entry.disciplineId} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b' }}>
                            <span style={{ fontSize: '12px', color: '#94a3b8', flex: 1 }}>{disc.name}</span>
                            <LabelBadge label={entry.label} />
                            <span style={{ fontSize: '11px', color: LABEL_COLORS[entry.label] || '#64748b' }}>
                              {LABEL_DESCRIPTIONS[entry.label] || ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
 
function SectionHeaderSimple({ title, subtitle }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ fontSize: '15px', fontWeight: '700', color: '#f1f5f9', marginBottom: '2px' }}>{title}</div>
      {subtitle && <div style={{ fontSize: '12px', color: '#64748b' }}>{subtitle}</div>}
    </div>
  );
}
 
const tabBody   = { display: 'flex', flexDirection: 'column', gap: '0' };
const emptyCard = { backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '32px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' };


// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function SettingsPage() {
  const { uid } = useAuth();
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return 'algemeen';
    const param = new URLSearchParams(window.location.search).get('tab');
    return TABS.some(t => t.key === param) ? param : 'algemeen';
  });
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    UserFactory.get(uid).then(snap => {
      if (snap.exists()) setCurrentUser({ id: uid, ...snap.data() });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [uid]);

  const handleProfileSaved = (updates) => {
    setCurrentUser(prev => prev ? { ...prev, ...updates } : prev);
  };

  const handleZonesSaved = (zones) => {
    setCurrentUser(prev => prev ? { ...prev, heartrateZones: zones } : prev);
  };

  if (loading) {
    return (
      <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{pageCSS}</style>
        <div style={spinner} />
      </div>
    );
  }

  if (!uid || !currentUser) {
    return (
      <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', fontFamily: 'system-ui, sans-serif' }}>
        <p style={{ color: '#64748b', fontSize: '14px' }}>Niet ingelogd.</p>
        <a href="/login" style={{ padding: '10px 20px', backgroundColor: '#3b82f6', color: 'white', borderRadius: '8px', textDecoration: 'none', fontWeight: '600', fontSize: '14px' }}>Inloggen</a>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'system-ui, sans-serif' }}>
      <style>{pageCSS}</style>

      {/* ── Sticky header ── */}
      <header style={css.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#64748b', textDecoration: 'none', fontSize: '13px', fontWeight: '600', padding: '4px 0' }}>
            <ArrowLeft size={15} /> Home
          </a>
          <span style={{ color: '#334155' }}>/</span>
          <div>
            <div style={{ fontWeight: '800', fontSize: '15px', color: '#f1f5f9' }}>Instellingen</div>
            <div style={{ fontSize: '11px', color: '#475569' }}>{currentUser.firstName} {currentUser.lastName}</div>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 0 48px' }}>

        {/* ── Mobile: tab strip (horizontal scroll) ── */}
        <div style={css.tabStrip} className="settings-tab-strip">
          {TABS.map(tab => {
            const Icon     = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  display:        'flex',
                  alignItems:     'center',
                  gap:            '6px',
                  padding:        '11px 16px',
                  background:     'none',
                  border:         'none',
                  borderBottom:   `2px solid ${isActive ? '#3b82f6' : 'transparent'}`,
                  cursor:         'pointer',
                  fontSize:       '13px',
                  fontWeight:     isActive ? '700' : '500',
                  color:          isActive ? '#60a5fa' : '#64748b',
                  whiteSpace:     'nowrap',
                  fontFamily:     'inherit',
                  transition:     'color 0.15s, border-color 0.15s',
                }}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── Tab content ── */}
        <div style={{ padding: '24px 16px' }}>
          {activeTab === 'algemeen'     && <AlgemeenTab     uid={uid} currentUser={currentUser} onSaved={handleProfileSaved} />}
          {activeTab === 'meldingen'    && <MeldingenTab    uid={uid} />}
          {activeTab === 'lidmaatschap' && <LidmaatschapTab uid={uid} currentUser={currentUser} />}
          {activeTab === 'labels'       && <LabelsTab       uid={uid} currentUser={currentUser} />}
          {activeTab === 'hartslag'     && <HartslagTab     uid={uid} currentUser={currentUser} onSaved={handleZonesSaved} />}
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const pageCSS = `
  * { box-sizing: border-box; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  .settings-tab-strip { overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
  .settings-tab-strip::-webkit-scrollbar { display: none; }
  select option { background-color: #1e293b; }
`;

const spinner = {
  width: '36px', height: '36px',
  border: '3px solid #1e293b',
  borderTop: '3px solid #3b82f6',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
};

const css = {
  header: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '12px 16px',
    backgroundColor: '#1e293b',
    borderBottom: '1px solid #334155',
    position: 'sticky', top: 0, zIndex: 50,
  },
  tabStrip: {
    display: 'flex',
    backgroundColor: '#1e293b',
    borderBottom: '1px solid #334155',
    position: 'sticky', top: '53px', zIndex: 40,
    padding: '0 4px',
  },
  tabBody: {
    display: 'flex', flexDirection: 'column', gap: '0',
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: '12px',
    border: '1px solid #334155',
    padding: '14px 16px',
    marginBottom: '10px',
  },
  fieldGroup: {
    backgroundColor: '#1e293b',
    borderRadius: '12px',
    border: '1px solid #334155',
    padding: '16px',
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    fontSize: '11px',
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '11px 12px',
    borderRadius: '8px',
    border: '1px solid #334155',
    backgroundColor: '#0f172a',
    color: 'white',
    fontSize: '14px',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  inputCompact: {
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1px solid #334155',
    backgroundColor: '#0f172a',
    color: 'white',
    fontSize: '13px',
    fontFamily: 'inherit',
    textAlign: 'center',
  },
  primaryBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
    padding: '12px 20px',
    backgroundColor: '#3b82f6',
    border: 'none', borderRadius: '10px',
    color: 'white', fontWeight: '700', fontSize: '14px',
    cursor: 'pointer', fontFamily: 'inherit',
    transition: 'opacity 0.15s',
  },
  secondaryBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
    padding: '11px 16px',
    backgroundColor: 'transparent',
    border: '1px solid #334155', borderRadius: '10px',
    color: '#94a3b8', fontWeight: '600', fontSize: '13px',
    cursor: 'pointer', fontFamily: 'inherit',
  },
  iconBtn: {
    background: 'none', border: 'none',
    color: '#64748b', cursor: 'pointer',
    padding: '6px', display: 'flex', alignItems: 'center',
  },
};
