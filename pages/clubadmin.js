import React, { useState, useEffect, useRef } from 'react';
import {
  UserFactory, ClubFactory, GroupFactory,
  ClubJoinRequestFactory, ClubMemberFactory, BadgeFactory, 
  UserMemberLinkFactory,
} from '../constants/dbSchema';
import { useAuth } from '../contexts/AuthContext';
import {
  ShieldAlert, UserPlus, Building2, Users, Trash2, Search,
  Edit2, X, Save, ArrowLeft, Plus, Heart, HeartOff, PlusCircle,
  Calendar, Bell, CheckCircle2, XCircle, Clock, MessageSquare,
  Check, AlertCircle, Award, ChevronRight
} from 'lucide-react';
import SeasonManager from '../components/SeasonManager';
import LabelGrid     from '../components/LabelGrid';
import { useCurrentSeason } from '../hooks/useCurrentSeason';
import { useDisciplines }   from '../hooks/useDisciplines';

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
          <h3 style={{ margin: 0, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Award size={18} color="#f59e0b" /> Badge uitreiken
          </h3>
          <button style={s.iconBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '14px' }}>
          Aan: <strong style={{ color: '#f1f5f9' }}>{skipper.firstName} {skipper.lastName}</strong>
        </p>

        {done ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '44px', marginBottom: '10px' }}>🎉</div>
            <p style={{ color: '#22c55e', fontWeight: '700', margin: 0 }}>Badge uitgereikt!</p>
          </div>
        ) : badges.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <p style={{ color: '#475569', fontSize: '13px', margin: '0 0 12px' }}>
              Geen manuele badges beschikbaar.
            </p>
            <a href="/badge-beheer" style={{ fontSize: '13px', color: '#a78bfa', fontWeight: '600' }}>
              Maak badges aan via Badge Beheer →
            </a>
          </div>
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

// ─── Membership Edit Modal ────────────────────────────────────────────────────
function MembershipEditModal({ member, groupMember, clubId, groupId, onClose }) {
  const [form, setForm] = useState({
    isSkipper:       groupMember.isSkipper       ?? true,
    isCoach:         groupMember.isCoach         ?? false,
    startMembership: groupMember.startMembership?.toDate ? groupMember.startMembership.toDate().toISOString().split('T')[0] : '',
    endMembership:   groupMember.endMembership?.toDate   ? groupMember.endMembership.toDate().toISOString().split('T')[0]   : '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await GroupFactory.updateMember(clubId, groupId, groupMember.memberId || groupMember.id, {
        isSkipper:       form.isSkipper,
        isCoach:         form.isCoach,
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
          <button onClick={handleSave} disabled={saving} style={{ ...bs.primary, flex: 1, justifyContent: 'center' }}>
            <Save size={15} /> {saving ? 'Opslaan…' : 'Opslaan'}
          </button>
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
    skipperType: member?.skipperType ?? null,
    isStaff:     member?.isStaff     ?? false,
    notes:     member?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const handleSave = async () => {
    setError('');
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('Voornaam en achternaam zijn verplicht.'); return;
    }
    setSaving(true);
    try {
      const data = {
        firstName: form.firstName.trim(),
        lastName:  form.lastName.trim(),
        birthDate: form.birthDate ? new Date(form.birthDate) : null,
        skipperType: form.skipperType,
        isStaff:     form.isStaff,
        notes:     form.notes.trim(),
      };
      isEdit
        ? await ClubMemberFactory.update(clubId, member.id, data)
        : await ClubMemberFactory.create(clubId, data, createdByUid);
      onClose();
    } catch { setError('Opslaan mislukt.'); }
    finally { setSaving(false); }
  };

  return (
    <div style={s.modalOverlay}>
      <div style={s.modal}>
        <div style={s.modalHeader}>
          <h3 style={{ margin: 0, fontSize: '16px' }}>{isEdit ? 'Lid bewerken' : 'Nieuw lid aanmaken'}</h3>
          <button style={s.iconBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
          <div>
            <label style={s.fieldLabel}>Voornaam *</label>
            <input style={s.input} placeholder="Emma" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} autoFocus />
          </div>
          <div>
            <label style={s.fieldLabel}>Achternaam *</label>
            <input style={s.input} placeholder="De Smet" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
          <div>
            <label style={s.fieldLabel}>Geboortedatum</label>
            <input style={s.input} type="date" value={form.birthDate} onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))} />
          </div>
          <div>
            <label style={s.fieldLabel}>Notities</label>
            <input style={s.input} placeholder="optioneel" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <label style={s.fieldLabel}>Type skipper</label>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
            {[
              { value: 'competitive', label: '🏆 Competitief' },
              { value: 'recreative',  label: '🎉 Recreatief'  },
              { value: null,          label: '—  Geen'         },
            ].map(opt => (
              <button
              key={String(opt.value)}
              type="button"
                onClick={() => setForm(f => ({ ...f, skipperType: opt.value }))}
                  style={{
                    flex: 1, padding: '8px 6px', borderRadius: '8px', fontFamily: 'inherit',
                    fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                    border: `1px solid ${form.skipperType === opt.value ? '#3b82f6' : '#334155'}`,
                    backgroundColor: form.skipperType === opt.value ? '#3b82f622' : 'transparent',
                    color: form.skipperType === opt.value ? '#60a5fa' : '#64748b',
                  }}
              >
                {opt.label}
              </button>
            ))}
          </div>
 
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <input
            type="checkbox"
              id="isStaffCheck"
              checked={form.isStaff}
              onChange={e => setForm(f => ({ ...f, isStaff: e.target.checked }))}
            />
            <label htmlFor="isStaffCheck" style={{ fontSize: '13px', color: '#94a3b8', cursor: 'pointer' }}>
              Stafmedewerker (coach, begeleider, …)
            </label>
          </div>
        </div>
        {error && <div style={s.errorBanner}><AlertCircle size={13} /> {error}</div>}
        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button onClick={handleSave} disabled={saving} style={{ ...bs.primary, flex: 1, justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>
            <Save size={15} /> {saving ? 'Opslaan…' : isEdit ? 'Wijzigingen opslaan' : 'Lid aanmaken'}
          </button>
          <button onClick={onClose} style={bs.secondary}><X size={15} /> Annuleren</button>
        </div>
      </div>
    </div>
  );
}

// ─── Approve Member Modal ─────────────────────────────────────────────────────
function ApproveMemberModal({ request, clubId, approvedByUid, onClose }) {
  const [mode, setMode]                     = useState('new');
  const [existingMembers, setExistingMembers] = useState([]);
  const [memberSearch,    setMemberSearch]    = useState('');
  const [selectedMemberId,setSelectedMemberId]= useState('');
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
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: '#a78bfa22', border: '1px solid #a78bfa44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '13px', color: '#a78bfa', flexShrink: 0 }}>
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
          <button type="button" onClick={() => setMode('new')}
            style={{ flex: 1, padding: '10px', borderRadius: '8px', border: `1px solid ${mode === 'new' ? '#22c55e' : '#334155'}`, fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', backgroundColor: mode === 'new' ? '#22c55e22' : 'transparent', color: mode === 'new' ? '#22c55e' : '#64748b' }}>
            + Nieuw lid aanmaken
          </button>
          <button type="button" onClick={() => setMode('existing')}
            style={{ flex: 1, padding: '10px', borderRadius: '8px', border: `1px solid ${mode === 'existing' ? '#3b82f6' : '#334155'}`, fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', backgroundColor: mode === 'existing' ? '#3b82f622' : 'transparent', color: mode === 'existing' ? '#60a5fa' : '#64748b' }}>
            Bestaand lid koppelen
          </button>
        </div>

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
          <button onClick={handleConfirm} disabled={saving}
            style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '12px', backgroundColor: '#22c55e', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '700', fontSize: '13px', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
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
export default function ClubAdmin() {
  const { uid, loading: authLoading } = useAuth();
  const [currentUser,  setCurrentUser]  = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isClubAdmin,  setIsClubAdmin]  = useState(false);

  const [adminClubs, setAdminClubs] = useState([]);
  const [activeClub, setActiveClub] = useState(null);

  // Navigation
  const [activeTab,     setActiveTab]     = useState('groepen');
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [searchTerm,    setSearchTerm]    = useState('');

  // Data
  const [groups,             setGroups]             = useState([]);
  const [memberCounts,       setMemberCounts]       = useState({});
  const [groupMembers,       setGroupMembers]       = useState([]);
  const [clubMemberProfiles, setClubMemberProfiles] = useState([]);
  const [showOnlyActive,     setShowOnlyActive]     = useState(true);
  const [allGroupMemberships,setAllGroupMemberships]= useState({});

  // Leden tab
  const [ledenSearch,  setLedenSearch]  = useState('');
  const [ledenEditing, setLedenEditing] = useState(null);
  const [ledenForm,    setLedenForm]    = useState(false);
  const [awardTarget,  setAwardTarget]  = useState(null);

  // Membership edit modal
  const [editingMembership, setEditingMembership] = useState(null);

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
  const [approveModalRequest,setApproveModalRequest]= useState(null);

  // load disciplines & seasondata
  const { disciplines } = useDisciplines();
  const { currentSeason } = useCurrentSeason(activeClub?.id, activeClub);
  const [activeClubData, setActiveClubData] = useState(activeClub);
  // keep activeClubData in sync:
  useEffect(() => setActiveClubData(activeClub), [activeClub]);

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading || !uid) return;

    UserFactory.get(uid).then(snap => {
      if (!snap.exists()) return;
      const user = { id: uid, ...snap.data() };
      setCurrentUser(user);
      const role = user.role || 'user';

      if (role === 'superadmin') {
        setIsSuperAdmin(true);
        ClubFactory.getAll(all => setAdminClubs(all));
      } else if (role === 'clubadmin') {
        setIsClubAdmin(true);
        // A clubadmin's club access is determined by their UserMemberLinks,
        // not by group coach membership. Resolve their linked clubs directly.
        const unsub = UserMemberLinkFactory.getForUser(uid, async (profiles) => {
          if (profiles.length === 0) { setAdminClubs([]); return; }
          const clubIdSet = new Set(profiles.map(p => p.member.clubId));
          const snaps = await Promise.all([...clubIdSet].map(id => ClubFactory.getById(id)));
          setAdminClubs(snaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() })));
        });
        return () => unsub();
      }
    });
  }, [uid, authLoading]);

  useEffect(() => {
    if (adminClubs.length === 0) return;
    const paramId = getQueryParam('club');
    if (paramId) {
      const match = adminClubs.find(c => c.id === paramId);
      if (match) { setActiveClub(match); return; }
    }
    // Auto-select if only one club
    if (adminClubs.length === 1) setActiveClub(adminClubs[0]);
  }, [adminClubs]);

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

  // ── All group memberships ──────────────────────────────────────────────────
  useEffect(() => {
    if (!activeClub || groups.length === 0) return;
    const memberMap = {};
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

  useEffect(() => {
    if (!activeClub || activeTab !== 'groepen') return;
    const u = ClubMemberFactory.getAll(activeClub.id, setClubMemberProfiles);
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
  const currentUserName   = currentUser ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() : 'Admin';
  const pendingCount      = joinRequests.filter(r => r.status === 'pending').length;
  const filteredRequests  = requestFilter === 'all' ? joinRequests : joinRequests.filter(r => r.status === requestFilter);
  const memberIdsInGroup  = new Set(groupMembers.map(m => m.memberId || m.id));
  const assignedMemberIds = new Set(Object.keys(allGroupMemberships).filter(mid => allGroupMemberships[mid]?.length > 0));
  const unassignedMembers = clubMemberProfiles.filter(p => !assignedMemberIds.has(p.id));
  const availableToAdd    = clubMemberProfiles.filter(p => !memberIdsInGroup.has(p.id));
  const filteredAvailable = availableToAdd.filter(p => `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredLeden     = clubMemberProfiles.filter(m => `${m.firstName} ${m.lastName}`.toLowerCase().includes(ledenSearch.toLowerCase()));
  const getMemberProfile  = (memberId) => clubMemberProfiles.find(p => p.id === memberId) || null;
  const showClubPicker    = isSuperAdmin || adminClubs.length > 1;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleGroupSubmit = async (e) => {
    e.preventDefault();
    editingGroupId
      ? await GroupFactory.update(activeClub.id, editingGroupId, groupForm)
      : await GroupFactory.create(activeClub.id, groupForm);
    setIsGroupModalOpen(false); setEditingGroupId(null);
  };

  const handleAddMember = async (profileId) => {
    await GroupFactory.addMember(activeClub.id, selectedGroup.id, profileId, {
      isSkipper: true, isCoach: false, startMembership: new Date(), endMembership: null,
    });
  };

  const handleDropOnGroup = async (e, group) => {
    e.preventDefault();
    const memberId = e.dataTransfer.getData('memberId');
    if (!memberId) return;
    await GroupFactory.addMember(activeClub.id, group.id, memberId, {
      isSkipper: true, isCoach: false, startMembership: new Date(), endMembership: null,
    });
    setDragOver(false); setDragMemberId(null);
  };

  const handleDeleteLeden = async (member) => {
    if (!confirm(`Lid "${member.firstName} ${member.lastName}" verwijderen? Dit verwijdert ook groepslidmaatschappen en koppelingen.`)) return;
    await ClubMemberFactory.delete(activeClub.id, member.id);
  };

  const handleConfirmReject = async () => {
    if (!rejectReason.trim()) { setRejectError('Een reden is verplicht.'); return; }
    setRejectSaving(true);
    try {
      await ClubJoinRequestFactory.reject(rejectingRequestId, rejectReason.trim());
      setRejectModalOpen(false); setRejectReason(''); setRejectingRequestId(null);
    } catch { setRejectError('Er ging iets mis.'); }
    finally { setRejectSaving(false); }
  };

  const tabs = [
    { key: 'groepen',  label: 'Groepen' },
    { key: 'leden',    label: 'Leden' },
    { key: 'seizoenen', label: 'Seizoenen & Labels', badge: 0 },
    { key: 'requests', label: 'Aanvragen', badge: pendingCount },
  ];

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (authLoading) return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
      <style>{css}</style>
      <div style={s.spinner} />
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

  // Club selection screen (multi-club or no club selected yet)
  if (!activeClub) return (
    <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{css}</style>
      <div style={{ maxWidth: '440px', width: '100%', padding: '24px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <Building2 size={22} color="#22c55e" />
          <span style={{ fontWeight: '800', fontSize: '18px', color: '#f1f5f9' }}>Clubbeheer</span>
        </div>
        <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '20px' }}>Kies de club die je wil beheren.</p>
        {adminClubs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#475569' }}>
            <Building2 size={36} color="#334155" style={{ marginBottom: '10px' }} />
            <p style={{ fontSize: '13px' }}>Je bent nog niet gekoppeld aan een club als beheerder.</p>
            {isSuperAdmin && <p style={{ fontSize: '12px', color: '#475569', marginTop: '8px' }}>Maak eerst een club aan via <a href="/superadmin" style={{ color: '#ef4444' }}>/superadmin</a>.</p>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {adminClubs.map(club => (
              <button key={club.id} onClick={() => setActiveClub(club)}
                style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '14px', color: 'white', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s' }}>
                {club.logoUrl
                  ? <img src={club.logoUrl} style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} alt={club.name} />
                  : <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Building2 size={20} color="#22c55e" /></div>
                }
                <span style={{ fontWeight: '600', fontSize: '15px', flex: 1 }}>{club.name}</span>
                <ChevronRight size={16} color="#475569" />
              </button>
            ))}
          </div>
        )}
        {isSuperAdmin && (
          <a href="/superadmin" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#ef4444', marginTop: '20px', textDecoration: 'none', fontWeight: '600' }}>
            ← Terug naar SuperAdmin
          </a>
        )}
      </div>
    </div>
  );

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <style>{css}</style>

      <header style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {activeClub.logoUrl
              ? <img src={activeClub.logoUrl} style={{ width: '28px', height: '28px', borderRadius: '6px', objectFit: 'cover' }} alt={activeClub.name} />
              : <Building2 size={20} color="#22c55e" />
            }
            <span style={s.headerTitle}>{activeClub.name}</span>
            <span style={{ fontSize: '11px', color: '#475569', fontWeight: '400' }}>Clubbeheer</span>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Club switcher — shown when superadmin or managing multiple clubs */}
            {showClubPicker && (
              <select
                value={activeClub.id}
                onChange={e => {
                  const club = adminClubs.find(c => c.id === e.target.value);
                  if (club) {
                    setActiveClub(club);
                    setSelectedGroup(null);
                    setGroups([]);
                    setActiveTab('groepen');
                  }
                }}
                style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#f1f5f9', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
              >
                {adminClubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <a href="/badge-beheer" style={{ fontSize: '11px', color: '#a78bfa', textDecoration: 'none', fontWeight: '600', padding: '5px 10px', backgroundColor: '#a78bfa15', borderRadius: '6px', border: '1px solid #a78bfa33' }}>
              Badge Beheer →
            </a>
            {isSuperAdmin && (
              <a href="/superadmin" style={{ fontSize: '11px', color: '#ef4444', textDecoration: 'none', fontWeight: '600', padding: '5px 10px', backgroundColor: '#ef444415', borderRadius: '6px', border: '1px solid #ef444433' }}>
                SuperAdmin →
              </a>
            )}
          </div>
        </div>

        <div style={s.tabBar}>
          {tabs.map(tab => (
            <button key={tab.key}
              onClick={() => { setActiveTab(tab.key); setSelectedGroup(null); setSearchTerm(''); }}
              style={{ ...s.tab, ...(activeTab === tab.key ? s.tabActive : {}) }}
            >
              {tab.label}
              {tab.badge > 0 && (
                <span style={s.tabBadge}>{tab.badge > 9 ? '9+' : tab.badge}</span>
              )}
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

            {!selectedGroup && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px', alignItems: 'start' }}>
                {/* Left: groups */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <div style={{ fontWeight: '800', fontSize: '16px', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Users size={18} color="#3b82f6" /> Groepen
                    </div>
                    <button style={bs.primary} onClick={() => { setEditingGroupId(null); setGroupForm({ name: '', useHRM: true }); setIsGroupModalOpen(true); }}>
                      <Plus size={15} /> Nieuwe groep
                    </button>
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                            <Users size={24} color="#3b82f6" />
                            <span style={{ fontWeight: '700', fontSize: '14px', color: '#f1f5f9' }}>{group.name}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={s.countBadge}>{memberCounts[group.id] || 0} leden</span>
                            <span style={{ ...s.hrmBadge, backgroundColor: group.useHRM ? '#065f46' : '#334155' }}>
                              {group.useHRM ? <Heart size={10} fill="white" /> : <HeartOff size={10} />} HRM {group.useHRM ? 'AAN' : 'UIT'}
                            </span>
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
                    {unassignedMembers.length > 0 && (
                      <span style={{ marginLeft: 'auto', backgroundColor: '#f59e0b22', color: '#f59e0b', fontSize: '10px', fontWeight: '800', padding: '2px 7px', borderRadius: '10px', border: '1px solid #f59e0b44' }}>
                        {unassignedMembers.length}
                      </span>
                    )}
                  </div>
                  {unassignedMembers.length === 0 ? (
                    <p style={{ color: '#475569', fontSize: '12px', textAlign: 'center', padding: '16px 0' }}>Alle leden zijn ingedeeld 🎉</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '400px', overflowY: 'auto' }}>
                      <p style={{ fontSize: '11px', color: '#475569', marginBottom: '6px' }}>Sleep een lid naar een groep om het toe te voegen.</p>
                      {unassignedMembers.map(p => {
                        const initials = `${p.firstName?.[0] || '?'}${p.lastName?.[0] || ''}`.toUpperCase();
                        return (
                          <div
                            key={p.id}
                            draggable
                            onDragStart={e => { e.dataTransfer.setData('memberId', p.id); setDragMemberId(p.id); }}
                            onDragEnd={() => setDragMemberId(null)}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', backgroundColor: '#0f172a', border: `1px solid ${dragMemberId === p.id ? '#3b82f6' : '#1e293b'}`, borderRadius: '8px', cursor: 'grab', userSelect: 'none', opacity: dragMemberId === p.id ? 0.5 : 1, transition: 'all 0.15s' }}
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

            {/* Group detail */}
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

                <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden', marginBottom: '24px' }}>
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
                      const memberId  = m.memberId || m.id;
                      const profile   = getMemberProfile(memberId);
                      const initials  = profile ? `${profile.firstName?.[0] || '?'}${profile.lastName?.[0] || ''}`.toUpperCase() : '?';
                      const startDate = m.startMembership?.toDate ? m.startMembership.toDate() : null;
                      const endDate   = m.endMembership?.toDate   ? m.endMembership.toDate()   : null;
                      return (
                        <div key={memberId} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 110px 110px 80px', gap: '0', padding: '10px 14px', alignItems: 'center', borderBottom: '1px solid #334155', backgroundColor: idx % 2 === 0 ? 'transparent' : '#0f172a44' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#3b82f622', border: '1px solid #3b82f644', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '10px', color: '#60a5fa', flexShrink: 0 }}>{initials}</div>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: '600', color: '#f1f5f9' }}>
                                {profile ? `${profile.firstName} ${profile.lastName}` : <span style={{ color: '#475569', fontStyle: 'italic' }}>Onbekend</span>}
                              </div>
                              {profile?.birthDate?.seconds && <div style={{ fontSize: '10px', color: '#64748b' }}>{new Date(profile.birthDate.seconds * 1000).toLocaleDateString('nl-BE')}</div>}
                            </div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <button onClick={() => GroupFactory.updateMember(activeClub.id, selectedGroup.id, memberId, { isSkipper: !m.isSkipper })}
                              style={{ width: '26px', height: '26px', borderRadius: '6px', border: `1px solid ${m.isSkipper ? '#3b82f6' : '#334155'}`, backgroundColor: m.isSkipper ? '#3b82f622' : 'transparent', color: m.isSkipper ? '#60a5fa' : '#475569', fontSize: '12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                              {m.isSkipper ? '✓' : '–'}
                            </button>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <button onClick={() => GroupFactory.updateMember(activeClub.id, selectedGroup.id, memberId, { isCoach: !m.isCoach })}
                              style={{ width: '26px', height: '26px', borderRadius: '6px', border: `1px solid ${m.isCoach ? '#f59e0b' : '#334155'}`, backgroundColor: m.isCoach ? '#f59e0b22' : 'transparent', color: m.isCoach ? '#fbbf24' : '#475569', fontSize: '12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                              {m.isCoach ? '✓' : '–'}
                            </button>
                          </div>
                          <div style={{ fontSize: '12px', color: '#94a3b8' }}>{startDate ? startDate.toLocaleDateString('nl-BE') : '–'}</div>
                          <div style={{ fontSize: '12px', color: '#94a3b8' }}>{endDate ? endDate.toLocaleDateString('nl-BE') : <span style={{ color: '#475569' }}>Geen</span>}</div>
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
                <div style={{ fontWeight: '800', fontSize: '16px', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Users size={18} color="#3b82f6" /> Leden
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{clubMemberProfiles.length} leden in {activeClub.name}</div>
              </div>
              <button onClick={() => { setLedenEditing(null); setLedenForm(true); }} style={bs.primary}>
                <UserPlus size={15} /> Nieuw lid
              </button>
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
                  const birthYear    = member.birthDate?.seconds ? new Date(member.birthDate.seconds * 1000).getFullYear() : null;
                  const initials     = `${member.firstName?.[0] || '?'}${member.lastName?.[0] || ''}`.toUpperCase();
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
                          {memberGroups.length > 0 && (
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '5px' }}>
                              {memberGroups.map(g => (
                                <span key={g.groupId} style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '10px', backgroundColor: '#3b82f611', border: '1px solid #3b82f633', color: '#60a5fa', fontWeight: '600' }}>{g.groupName}</span>
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
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0' }}>
                <Bell size={36} color="#334155" />
                <p style={{ color: '#64748b', margin: '12px 0 0', fontSize: '14px' }}>Geen aanvragen gevonden.</p>
              </div>
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
                              {req.status === 'pending' && <Clock size={10} />}
                              {req.status === 'approved' && <CheckCircle2 size={10} />}
                              {req.status === 'rejected' && <XCircle size={10} />}
                              {cfg.label}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {req.email && <span>{req.email}</span>}
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Calendar size={11} />
                              {req.createdAt?.seconds ? new Date(req.createdAt.seconds * 1000).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                            </span>
                          </div>
                        </div>
                        <button style={{ ...s.iconBtn, color: '#64748b', flexShrink: 0 }} onClick={() => { if (confirm('Verwijderen?')) ClubJoinRequestFactory.delete(req.id); }}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                      {req.message && (
                        <div style={s.requestMessage}><MessageSquare size={11} color="#475569" />"{req.message}"</div>
                      )}
                      {req.status === 'rejected' && req.rejectionReason && (
                        <div style={s.rejectionReason}><XCircle size={13} style={{ flexShrink: 0 }} /><div><strong>Reden:</strong> {req.rejectionReason}</div></div>
                      )}
                      {req.resolvedAt?.seconds && req.status !== 'pending' && (
                        <div style={{ fontSize: '11px', color: '#475569', marginTop: '8px' }}>
                          Behandeld op {new Date(req.resolvedAt.seconds * 1000).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                      )}
                      {req.status === 'pending' && (
                        <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
                          <button style={s.approveBtn} onClick={() => setApproveModalRequest(req)}><Check size={15} /> Goedkeuren</button>
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

        {/* ═══ SEIZOENEN EN L ═══ */}
        {activeTab === 'seizoenen' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
 
              <div>
                <div style={{ fontWeight: '800', fontSize: '16px', color: '#f1f5f9', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={18} color="#3b82f6" /> Seizoenen
                </div>
                <SeasonManager
                  clubId={activeClub.id}
                  club={activeClubData}
                  uid={uid}
                  onClubUpdate={(updates) => setActiveClubData(prev => ({ ...prev, ...updates }))}
                />
              </div>
 
              <div>
                <div style={{ fontWeight: '800', fontSize: '16px', color: '#f1f5f9', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Award size={18} color="#f59e0b" /> Niveaulabels
                </div>
                <LabelGrid
                  clubId={activeClub.id}
                  season={currentSeason}
                  members={clubMemberProfiles}
                  uid={uid}
                  disciplines={disciplines}
                />
              </div>

            </div>
          </div>
        )}
          
      </main>

      {/* ══ MODALS ══ */}
      {awardTarget && (
        <AwardBadgeModal
          skipper={awardTarget}
          awardedByName={currentUserName}
          clubId={activeClub.id}
          onClose={() => setAwardTarget(null)}
        />
      )}

      {ledenForm && (
        <ClubMemberFormModal
          member={ledenEditing}
          clubId={activeClub.id}
          createdByUid={uid}
          onClose={() => { setLedenForm(false); setLedenEditing(null); }}
        />
      )}

      {editingMembership && (
        <MembershipEditModal
          member={editingMembership.member}
          groupMember={editingMembership.groupMember}
          clubId={activeClub.id}
          groupId={editingMembership.groupId}
          onClose={() => setEditingMembership(null)}
        />
      )}

      {approveModalRequest && (
        <ApproveMemberModal
          request={approveModalRequest}
          clubId={activeClub.id}
          approvedByUid={uid}
          onClose={() => setApproveModalRequest(null)}
        />
      )}

      {rejectModalOpen && (
        <div style={s.modalOverlay}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <h3 style={{ margin: 0, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
                <XCircle size={20} /> Aanvraag afwijzen
              </h3>
              <button style={s.iconBtn} onClick={() => setRejectModalOpen(false)}><X size={18} /></button>
            </div>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>Geef een duidelijke reden op. De gebruiker zal dit zien.</p>
            <label style={s.fieldLabel}>Reden *</label>
            <textarea
              autoFocus
              style={s.textarea}
              placeholder="bijv. De club accepteert momenteel geen nieuwe leden…"
              value={rejectReason}
              onChange={e => { setRejectReason(e.target.value); setRejectError(''); }}
            />
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

      {isGroupModalOpen && (
        <div style={s.modalOverlay}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Groep {editingGroupId ? 'bewerken' : 'toevoegen'}</h3>
              <button style={s.iconBtn} onClick={() => setIsGroupModalOpen(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleGroupSubmit} style={s.form}>
              <label style={s.fieldLabel}>Naam</label>
              <input placeholder="Groep naam" required style={s.input} value={groupForm.name} onChange={e => setGroupForm({ ...groupForm, name: e.target.value })} />
              <label style={s.fieldLabel}>Hartslagmeters (HRM)</label>
              <div style={{ display: 'flex', borderRadius: '4px', overflow: 'hidden', border: '1px solid #334155', cursor: 'pointer' }} onClick={() => setGroupForm({ ...groupForm, useHRM: !groupForm.useHRM })}>
                <div style={{ flex: 1, padding: '10px', textAlign: 'center', fontSize: '12px', fontWeight: '700', color: 'white', backgroundColor: groupForm.useHRM ? '#059669' : '#334155' }}>AAN</div>
                <div style={{ flex: 1, padding: '10px', textAlign: 'center', fontSize: '12px', fontWeight: '700', color: 'white', backgroundColor: !groupForm.useHRM ? '#ef4444' : '#334155' }}>UIT</div>
              </div>
              <button type="submit" style={s.saveBtn}><Save size={16} /> Opslaan</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Button styles ────────────────────────────────────────────────────────────
const bs = {
  primary:   { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' },
  secondary: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '8px', color: '#94a3b8', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' },
};

// ─── CSS ──────────────────────────────────────────────────────────────────────
const css = `
  * { box-sizing: border-box; }
  .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @media (max-width: 700px) {
    .card-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
  }
  @media (max-width: 400px) { .card-grid { grid-template-columns: 1fr; } }
`;

const s = {
  page:        { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'system-ui, sans-serif' },
  spinner:     { width: '36px', height: '36px', border: '3px solid #1e293b', borderTop: '3px solid #22c55e', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  header:      { backgroundColor: '#1e293b', borderBottom: '1px solid #334155', padding: '12px 16px', position: 'sticky', top: 0, zIndex: 100, display: 'flex', flexDirection: 'column', gap: '10px' },
  headerTitle: { fontWeight: '800', fontSize: '16px', color: '#f1f5f9' },
  tabBar:      { display: 'flex', gap: '6px', overflowX: 'auto' },
  tab:         { padding: '7px 14px', borderRadius: '8px', border: 'none', backgroundColor: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap', position: 'relative' },
  tabActive:   { backgroundColor: '#22c55e', color: 'white' },
  tabBadge:    { position: 'absolute', top: '-4px', right: '-4px', backgroundColor: '#ef4444', color: 'white', fontSize: '9px', fontWeight: 'bold', width: '16px', height: '16px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  content:     { padding: '16px', maxWidth: '960px', margin: '0 auto' },
  backBtn:     { background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: '600', padding: '0 0 14px 0' },
  iconBtn:     { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' },
  groupCard:   { backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '14px', display: 'flex', flexDirection: 'column', transition: 'border-color 0.15s, background-color 0.15s' },
  countBadge:  { fontSize: '10px', padding: '3px 8px', backgroundColor: '#0f172a', borderRadius: '4px', color: '#94a3b8' },
  hrmBadge:    { fontSize: '10px', padding: '3px 8px', borderRadius: '4px', color: 'white', display: 'flex', alignItems: 'center', gap: '4px' },
  memberCard:  { backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '14px' },
  searchInput: { padding: '10px 10px 10px 10px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#1e293b', color: 'white', fontSize: '14px' },
  emptyText:   { color: '#475569', fontSize: '14px', textAlign: 'center', padding: '20px 0' },
  filterPills: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' },
  filterPill:  { padding: '6px 12px', borderRadius: '20px', border: '1px solid #334155', backgroundColor: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' },
  filterPillActive: { backgroundColor: '#334155', color: '#f1f5f9', borderColor: '#475569' },
  pillCount:   { padding: '1px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold' },
  requestCard: { backgroundColor: '#1e293b', borderRadius: '14px', border: '1px solid', padding: '16px' },
  requestAvatar: { width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#a78bfa22', border: '1px solid #a78bfa44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '14px', color: '#a78bfa', flexShrink: 0 },
  statusBadge: { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700' },
  requestMessage: { marginTop: '10px', backgroundColor: '#0f172a', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: '#94a3b8', fontStyle: 'italic', borderLeft: '3px solid #334155', display: 'flex', alignItems: 'flex-start', gap: '6px' },
  rejectionReason: { marginTop: '10px', backgroundColor: '#ef444411', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#ef4444', borderLeft: '3px solid #ef4444', display: 'flex', alignItems: 'flex-start', gap: '8px' },
  approveBtn:  { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', backgroundColor: '#22c55e', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '700', fontSize: '13px', cursor: 'pointer' },
  rejectBtn:   { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', backgroundColor: '#ef4444', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '700', fontSize: '13px', cursor: 'pointer' },
  modalOverlay:{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 500 },
  modal:       { backgroundColor: '#1e293b', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '560px', border: '1px solid #334155', maxHeight: '90vh', overflowY: 'auto' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', color: '#f1f5f9' },
  form:        { display: 'flex', flexDirection: 'column', gap: '10px' },
  fieldLabel:  { display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px', fontWeight: '600' },
  input:       { width: '100%', padding: '11px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px' },
  textarea:    { width: '100%', minHeight: '100px', padding: '12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px', resize: 'vertical', lineHeight: 1.5, boxSizing: 'border-box' },
  saveBtn:     { width: '100%', backgroundColor: '#22c55e', border: 'none', color: 'white', padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' },
  cancelBtn:   { padding: '12px', backgroundColor: '#475569', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '600', cursor: 'pointer', fontSize: '13px' },
  errorBanner: { display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#ef444422', color: '#ef4444', fontSize: '13px', padding: '10px 12px', borderRadius: '8px', marginTop: '10px', border: '1px solid #ef444433' },
};
