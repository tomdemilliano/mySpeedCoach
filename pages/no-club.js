// pages/no-club.js
//
// Shown to verified users who have no club membership and no pending request.
// All other app pages are blocked until the user has a link or pending request.

import { useState, useEffect } from 'react';
import { Building2, Send, Clock, CheckCircle2, XCircle, AlertCircle, ChevronRight, LogOut, EyeOff, Trash2 } from 'lucide-react';
import { ClubFactory, ClubJoinRequestFactory, UserFactory } from '../constants/dbSchema';
import { useAuth } from '../contexts/AuthContext';

const STATUS_CONFIG = {
  pending:  { label: 'In behandeling', color: '#f59e0b', icon: Clock },
  approved: { label: 'Goedgekeurd',    color: '#22c55e', icon: CheckCircle2 },
  rejected: { label: 'Afgewezen',      color: '#ef4444', icon: XCircle },
};

export default function NoClubPage() {
  const { uid, logout } = useAuth();

  const [clubs,        setClubs]        = useState([]);
  const [requests,     setRequests]     = useState([]);
  const [currentUser,  setCurrentUser]  = useState(null);
  const [showForm,     setShowForm]     = useState(false);
  const [selectedClub, setSelectedClub] = useState('');
  const [message,      setMessage]      = useState('');
  const [sending,      setSending]      = useState(false);
  const [error,        setError]        = useState('');

  useEffect(() => {
    if (!uid) return;
    UserFactory.get(uid).then(snap => {
      if (snap.exists()) setCurrentUser({ id: uid, ...snap.data() });
    });
    const u1 = ClubFactory.getAll(setClubs);
    const u2 = ClubJoinRequestFactory.getByUser(uid, (data) => {
      setRequests([...data].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    });
    return () => { u1(); u2(); };
  }, [uid]);

  const visibleRequests = requests.filter(r => !r.hidden);
  const hasPending = requests.some(r => r.status === 'pending');

  const handleSend = async () => {
    setError('');
    if (!selectedClub) { setError('Selecteer een club.'); return; }
    const already = requests.find(r => r.clubId === selectedClub && r.status === 'pending');
    if (already) { setError('Je hebt al een openstaande aanvraag voor deze club.'); return; }
    setSending(true);
    try {
      const club = clubs.find(c => c.id === selectedClub);
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
      setError('Aanvraag kon niet worden verzonden. Probeer opnieuw.');
    } finally {
      setSending(false);
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div style={s.page}>
      <style>{css}</style>

      {/* Header */}
      <header style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={s.logoBox}><Building2 size={18} color="#a78bfa" /></div>
          <div>
            <div style={{ fontWeight: '800', fontSize: '15px', color: '#f1f5f9' }}>MySpeedCoach</div>
            {currentUser && <div style={{ fontSize: '11px', color: '#475569' }}>{currentUser.firstName} {currentUser.lastName}</div>}
          </div>
        </div>
        <button onClick={handleLogout} style={s.logoutBtn}>
          <LogOut size={14} /> Uitloggen
        </button>
      </header>

      <div style={s.content}>

        {/* Status card */}
        <div style={s.statusCard}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🏟️</div>
          <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#f1f5f9', margin: '0 0 8px' }}>
            Geen clublidmaatschap
          </h2>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0, lineHeight: 1.6, maxWidth: '320px' }}>
            Je hebt nog geen lidmaatschap bij een club. Stuur een aanvraag naar een club om toegang te krijgen tot de app.
          </p>
        </div>

        {/* Existing requests */}
        {visibleRequests.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <div style={s.sectionLabel}>Jouw aanvragen</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {visibleRequests.map(req => {
                const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
                const Icon = cfg.icon;
                return (
                  <div key={req.id} style={{ ...s.requestCard, borderColor: `${cfg.color}44` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: req.rejectionReason ? '8px' : 0 }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: `${cfg.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Building2 size={16} color={cfg.color} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: '700', fontSize: '14px', color: '#f1f5f9' }}>{req.clubName}</div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '700', color: cfg.color, marginTop: '2px' }}>
                          <Icon size={10} /> {cfg.label}
                        </div>
                      </div>
                      {req.status !== 'pending' && (
                        <button onClick={() => ClubJoinRequestFactory.hide(req.id)} style={s.iconBtn} title="Verbergen">
                          <EyeOff size={14} />
                        </button>
                      )}
                      <button onClick={() => { if (confirm('Aanvraag verwijderen?')) ClubJoinRequestFactory.delete(req.id); }} style={{ ...s.iconBtn, color: '#ef4444' }} title="Verwijderen">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {req.status === 'rejected' && req.rejectionReason && (
                      <div style={{ fontSize: '12px', color: '#ef4444', backgroundColor: '#ef444411', borderRadius: '6px', padding: '8px 10px', borderLeft: '3px solid #ef4444' }}>
                        <strong>Reden:</strong> {req.rejectionReason}
                      </div>
                    )}
                    {req.status === 'approved' && (
                      <div style={{ fontSize: '12px', color: '#22c55e', backgroundColor: '#22c55e11', borderRadius: '6px', padding: '8px 10px', borderLeft: '3px solid #22c55e' }}>
                        Je aanvraag is goedgekeurd. Een coach voegt je toe aan een groep — je krijgt dan automatisch toegang.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* New request form */}
        {!showForm ? (
          <button onClick={() => setShowForm(true)} style={s.primaryBtn}>
            <Send size={15} /> Aanvraag indienen bij een club
          </button>
        ) : (
          <div style={s.formCard}>
            <div style={{ fontWeight: '700', fontSize: '15px', color: '#f1f5f9', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Send size={16} color="#a78bfa" /> Nieuwe aanvraag
            </div>

            <label style={s.fieldLabel}>Club *</label>
            <select
              style={{ ...s.input, marginBottom: '14px' }}
              value={selectedClub}
              onChange={e => setSelectedClub(e.target.value)}
            >
              <option value="">-- Selecteer een club --</option>
              {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <label style={s.fieldLabel}>Motivatie <span style={{ color: '#475569', fontWeight: '400', textTransform: 'none' }}>(optioneel)</span></label>
            <textarea
              placeholder="Vertel iets over jezelf…"
              value={message}
              onChange={e => setMessage(e.target.value)}
              style={{ ...s.input, paddingLeft: '12px', minHeight: '80px', resize: 'vertical', lineHeight: 1.5, marginBottom: '14px' }}
            />

            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#ef444422', color: '#ef4444', fontSize: '13px', padding: '10px 12px', borderRadius: '8px', marginBottom: '14px', border: '1px solid #ef444433' }}>
                <AlertCircle size={14} style={{ flexShrink: 0 }} /> {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleSend} disabled={!selectedClub || sending} style={{ ...s.primaryBtn, flex: 1, opacity: !selectedClub || sending ? 0.5 : 1 }}>
                {sending ? 'Versturen…' : <><Send size={14} /> Versturen</>}
              </button>
              <button onClick={() => { setShowForm(false); setError(''); setSelectedClub(''); setMessage(''); }} style={s.secondaryBtn}>
                Annuleren
              </button>
            </div>
          </div>
        )}

        {hasPending && (
          <p style={{ fontSize: '12px', color: '#475569', textAlign: 'center', marginTop: '16px', lineHeight: 1.6 }}>
            Zodra een beheerder je aanvraag goedkeurt en een coach je toevoegt aan een groep, krijg je automatisch toegang tot de app.
          </p>
        )}
      </div>
    </div>
  );
}

const css = `* { box-sizing: border-box; } select option { background-color: #1e293b; }`;

const s = {
  page:        { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'system-ui, sans-serif' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: '#1e293b', borderBottom: '1px solid #334155' },
  logoBox:     { width: '34px', height: '34px', borderRadius: '9px', backgroundColor: '#2d1d4e', border: '1px solid #a78bfa44', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  logoutBtn:   { display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' },
  content:     { maxWidth: '480px', margin: '0 auto', padding: '32px 16px 48px' },
  statusCard:  { backgroundColor: '#1e293b', borderRadius: '16px', border: '1px solid #334155', padding: '32px 24px', textAlign: 'center', marginBottom: '24px' },
  sectionLabel:{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' },
  requestCard: { backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' },
  formCard:    { backgroundColor: '#1e293b', borderRadius: '14px', border: '1px solid #334155', padding: '20px' },
  iconBtn:     { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' },
  primaryBtn:  { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '13px', backgroundColor: '#7c3aed', border: 'none', borderRadius: '10px', color: 'white', fontWeight: '700', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit', marginBottom: '0' },
  secondaryBtn:{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '13px 20px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '10px', color: '#94a3b8', fontWeight: '600', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' },
  fieldLabel:  { display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' },
  input:       { width: '100%', padding: '11px 11px 11px 11px', borderRadius: '10px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px', fontFamily: 'inherit' },
};
