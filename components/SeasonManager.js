/**
 * components/SeasonManager.js
 *
 * Manages seasons for a club. Only clubadmins can create/abandon seasons.
 * Season settings (startDay/Month) live on the General tab, not here.
 *
 * Props:
 *   clubId  : string
 *   club    : club object (for seasonStartDay/seasonStartMonth — read only here)
 *   uid     : string
 */

import { useState, useEffect } from 'react';
import { SeasonFactory } from '../constants/dbSchema';
import { useCurrentSeason } from '../hooks/useCurrentSeason';
import {
  Plus, Calendar, ChevronDown, ChevronUp,
  Save, AlertCircle, CheckCircle2, Archive,
} from 'lucide-react';

function fmtDate(val) {
  if (!val) return '—';
  const ms = val?.seconds ? val.seconds * 1000 : new Date(val).getTime();
  if (isNaN(ms)) return '—';
  return new Date(ms).toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Derive season name from start date string, e.g. "2025-2026"
function seasonNameFromStart(startDateStr) {
  if (!startDateStr) return '';
  const d = new Date(startDateStr);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}-${d.getFullYear() + 1}`;
}

// Given a JS Date, return YYYY-MM-DD string for <input type="date">
function toInputDate(date) {
  if (!date || isNaN(date)) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Compute the default start date for a new season:
// - If seasons exist: last season end + 1 day
// - If no seasons: seasonStartDay/Month in current year (or next year if already passed)
function computeDefaultStart(seasons, club) {
  if (seasons && seasons.length > 0) {
    const sorted = [...seasons].sort(
      (a, b) => (b.startDate?.seconds || 0) - (a.startDate?.seconds || 0)
    );
    const lastEnd = sorted[0].endDate?.seconds
      ? new Date(sorted[0].endDate.seconds * 1000)
      : null;
    if (lastEnd) {
      const next = new Date(lastEnd);
      next.setDate(next.getDate() + 1);
      return next;
    }
  }
  // Fall back to club settings
  if (club?.seasonStartDay && club?.seasonStartMonth) {
    const now   = new Date();
    const guess = new Date(now.getFullYear(), club.seasonStartMonth - 1, club.seasonStartDay);
    if (guess < now) guess.setFullYear(guess.getFullYear() + 1);
    return guess;
  }
  return null;
}

export default function SeasonManager({ clubId, club, uid }) {
  const { currentSeason, seasons, loading } = useCurrentSeason(clubId, club);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showHistory,    setShowHistory]    = useState(false);
  const [form,           setForm]           = useState({ name: '', startDate: '', endDate: '' });
  const [creating,       setCreating]       = useState(false);
  const [createError,    setCreateError]    = useState('');

  // Prefill form when opened
  useEffect(() => {
    if (!showCreateForm) return;
    const defaultStart = computeDefaultStart(seasons, club);
    if (!defaultStart) return;
    const endDate = new Date(defaultStart);
    endDate.setFullYear(endDate.getFullYear() + 1);
    endDate.setDate(endDate.getDate() - 1);
    const startStr = toInputDate(defaultStart);
    const endStr   = toInputDate(endDate);
    setForm({ name: seasonNameFromStart(startStr), startDate: startStr, endDate: endStr });
  }, [showCreateForm]);

  // Auto-update name when start date changes
  useEffect(() => {
    if (form.startDate) {
      setForm(f => ({ ...f, name: seasonNameFromStart(f.startDate) }));
    }
  }, [form.startDate]);

  const handleCreate = async () => {
    setCreateError('');
    if (!form.name.trim())   { setCreateError('Geef het seizoen een naam.');                          return; }
    if (!form.startDate)     { setCreateError('Startdatum is verplicht.');                            return; }
    if (!form.endDate)       { setCreateError('Einddatum is verplicht.');                             return; }
    if (form.endDate <= form.startDate) { setCreateError('Einddatum moet na de startdatum liggen.'); return; }
    setCreating(true);
    try {
      await SeasonFactory.create(clubId, {
        name:      form.name.trim(),
        startDate: new Date(form.startDate),
        endDate:   new Date(form.endDate),
        createdBy: uid,
      });
      setForm({ name: '', startDate: '', endDate: '' });
      setShowCreateForm(false);
    } catch (e) {
      console.error('[SeasonManager] create error:', e);
      setCreateError('Aanmaken mislukt. Probeer opnieuw.');
    } finally {
      setCreating(false);
    }
  };

  const handleAbandon = async (season) => {
    if (!confirm(`Seizoen "${season.name}" als verlaten markeren? Labels blijven bewaard.`)) return;
    await SeasonFactory.update(clubId, season.id, { isAbandoned: true });
  };

  const now = new Date();

  const futureSeasons   = seasons.filter(s => !s.isAbandoned && s.startDate?.seconds && new Date(s.startDate.seconds * 1000) > now && s.id !== currentSeason?.id);
  const historicSeasons = seasons.filter(s => !s.isAbandoned && s.endDate?.seconds   && new Date(s.endDate.seconds   * 1000) < now && s.id !== currentSeason?.id);
  const abandonedSeasons = seasons.filter(s => s.isAbandoned);

  return (
    <div>
      {/* ── Current season ── */}
      <div style={s.sectionLabel}>Huidig seizoen</div>

      {loading ? (
        <div style={s.card}><span style={{ fontSize: '13px', color: '#64748b' }}>Laden…</span></div>
      ) : currentSeason ? (
        <div style={{ ...s.card, borderColor: '#22c55e33' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#22c55e22', border: '1px solid #22c55e44', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Calendar size={18} color="#22c55e" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '800', fontSize: '15px', color: '#f1f5f9' }}>{currentSeason.name}</div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                {fmtDate(currentSeason.startDate)} — {fmtDate(currentSeason.endDate)}
              </div>
            </div>
            <span style={{ padding: '3px 10px', borderRadius: '10px', fontSize: '10px', fontWeight: '800', backgroundColor: '#22c55e22', color: '#22c55e', border: '1px solid #22c55e44', flexShrink: 0 }}>
              ● Actief
            </span>
          </div>
        </div>
      ) : (
        <div style={{ ...s.card, borderColor: '#f59e0b33' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertCircle size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '13px', color: '#f59e0b', fontWeight: '600' }}>
              Geen actief seizoen — maak een nieuw seizoen aan.
            </span>
          </div>
        </div>
      )}

      {/* ── Future seasons ── */}
      {futureSeasons.length > 0 && (
        <div style={{ marginTop: '4px' }}>
          <div style={{ ...s.sectionLabel, marginTop: '16px' }}>Toekomstige seizoenen</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {futureSeasons.map(season => (
              <div key={season.id} style={{ ...s.card, borderColor: '#3b82f633' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#3b82f622', border: '1px solid #3b82f644', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Calendar size={18} color="#60a5fa" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '700', fontSize: '14px', color: '#f1f5f9' }}>{season.name}</div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      {fmtDate(season.startDate)} — {fmtDate(season.endDate)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span style={{ padding: '3px 10px', borderRadius: '10px', fontSize: '10px', fontWeight: '800', backgroundColor: '#3b82f622', color: '#60a5fa', border: '1px solid #3b82f644' }}>
                      Gepland
                    </span>
                    <button onClick={() => handleAbandon(season)} style={{ ...s.ghostBtn, color: '#ef4444', fontSize: '11px' }}>
                      <Archive size={12} /> Verlaten
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Create new season ── */}
      {!showCreateForm ? (
        <button onClick={() => setShowCreateForm(true)} style={s.secondaryBtn}>
          <Plus size={14} /> Nieuw seizoen aanmaken
        </button>
      ) : (
        <div style={{ ...s.card, marginTop: '12px' }}>
          <div style={{ fontWeight: '700', fontSize: '14px', color: '#f1f5f9', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={15} color="#3b82f6" /> Nieuw seizoen
          </div>

          <label style={s.label}>Naam *</label>
          <input
            style={{ ...s.input, marginBottom: '10px' }}
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="bijv. 2025-2026"
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={s.label}>Startdatum *</label>
              <input
                type="date"
                style={s.input}
                value={form.startDate}
                onChange={e => {
                  const start = e.target.value;
                  // Auto-update end date to start + 1 year - 1 day
                  let endStr = form.endDate;
                  if (start) {
                    const end = new Date(start);
                    end.setFullYear(end.getFullYear() + 1);
                    end.setDate(end.getDate() - 1);
                    endStr = toInputDate(end);
                  }
                  setForm(f => ({ ...f, startDate: start, endDate: endStr }));
                }}
              />
            </div>
            <div>
              <label style={s.label}>Einddatum *</label>
              <input
                type="date"
                style={s.input}
                value={form.endDate}
                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
              />
            </div>
          </div>

          {createError && (
            <div style={s.errorBanner}><AlertCircle size={13} style={{ flexShrink: 0 }} /> {createError}</div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <button onClick={handleCreate} disabled={creating} style={{ ...s.primaryBtn, flex: 1, opacity: creating ? 0.65 : 1 }}>
              <Save size={14} /> {creating ? 'Aanmaken…' : 'Seizoen aanmaken'}
            </button>
            <button
              onClick={() => { setShowCreateForm(false); setCreateError(''); setForm({ name: '', startDate: '', endDate: '' }); }}
              style={s.cancelBtn}
            >
              Annuleren
            </button>
          </div>
        </div>
      )}

      {/* ── Past seasons history ── */}
      {(historicSeasons.length > 0 || abandonedSeasons.length > 0) && (
        <div style={{ marginTop: '24px' }}>
          <button
            onClick={() => setShowHistory(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '0 0 10px', fontFamily: 'inherit' }}
          >
            <Archive size={12} />
            Seizoengeschiedenis ({historicSeasons.length + abandonedSeasons.length})
            {showHistory ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {showHistory && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[...historicSeasons, ...abandonedSeasons].map(season => (
                <div key={season.id} style={{ ...s.card, opacity: season.isAbandoned ? 0.5 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', fontSize: '14px', color: season.isAbandoned ? '#475569' : '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {season.name}
                        {season.isAbandoned && (
                          <span style={{ fontSize: '10px', fontWeight: '700', color: '#ef4444', backgroundColor: '#ef444422', border: '1px solid #ef444433', padding: '1px 6px', borderRadius: '6px' }}>
                            Verlaten
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                        {fmtDate(season.startDate)} — {fmtDate(season.endDate)}
                      </div>
                    </div>
                    {!season.isAbandoned && (
                      <button onClick={() => handleAbandon(season)} style={{ ...s.ghostBtn, color: '#ef4444', fontSize: '11px' }}>
                        <Archive size={12} /> Verlaten
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const s = {
  sectionLabel: { fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' },
  card:         { backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '14px 16px', marginBottom: '10px' },
  label:        { display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '5px' },
  input:        { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box' },
  primaryBtn:   { display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '10px 16px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '700', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' },
  secondaryBtn: { display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '10px 16px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '8px', color: '#94a3b8', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', marginTop: '8px' },
  cancelBtn:    { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 14px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '8px', color: '#64748b', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' },
  ghostBtn:     { display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '4px 6px' },
  errorBanner:  { display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#ef444422', color: '#ef4444', fontSize: '13px', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ef444433', marginBottom: '10px' },
};
