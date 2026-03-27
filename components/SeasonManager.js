/**
 * components/SeasonManager.js
 *
 * Manages seasons for a club. Only clubadmins can create/abandon seasons.
 *
 * Props:
 *   clubId       : string
 *   club         : club object (for seasonStartDay/seasonStartMonth settings)
 *   uid          : string — current user uid
 *   onClubUpdate : (data) => void — called when club settings are saved
 */

import { useState, useEffect } from 'react';
import { SeasonFactory, ClubFactory } from '../constants/dbSchema';
import { useCurrentSeason } from '../hooks/useCurrentSeason';
import {
  Plus, Calendar, Settings, ChevronDown, ChevronUp,
  Save, AlertCircle, CheckCircle2, Archive,
} from 'lucide-react';

// Format a Firestore timestamp or JS Date as DD/MM/YYYY
function fmtDate(val) {
  if (!val) return '—';
  const ms = val?.seconds ? val.seconds * 1000 : new Date(val).getTime();
  if (isNaN(ms)) return '—';
  return new Date(ms).toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Derive a default season name from a start date, e.g. "2024-2025"
function defaultSeasonName(startDateStr) {
  if (!startDateStr) return '';
  const d = new Date(startDateStr);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}-${d.getFullYear() + 1}`;
}

export default function SeasonManager({ clubId, club, uid, onClubUpdate }) {
  const { currentSeason, seasons, loading } = useCurrentSeason(clubId, club);

  const [showCreateForm,  setShowCreateForm]  = useState(false);
  const [showSettings,    setShowSettings]    = useState(false);
  const [showHistory,     setShowHistory]     = useState(false);

  // Create form
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Club settings form (start day/month)
  const [settingsForm, setSettingsForm] = useState({
    seasonStartDay:   club?.seasonStartDay   || '',
    seasonStartMonth: club?.seasonStartMonth || '',
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsOk,     setSettingsOk]     = useState(false);

  useEffect(() => {
    setSettingsForm({
      seasonStartDay:   club?.seasonStartDay   || '',
      seasonStartMonth: club?.seasonStartMonth || '',
    });
  }, [club?.seasonStartDay, club?.seasonStartMonth]);

  // Auto-fill season name when start date changes
  useEffect(() => {
    if (form.startDate) {
      setForm(f => ({ ...f, name: defaultSeasonName(f.startDate) }));
    }
  }, [form.startDate]);

  const handleCreate = async () => {
    setCreateError('');
    if (!form.name.trim())   { setCreateError('Geef het seizoen een naam.');        return; }
    if (!form.startDate)     { setCreateError('Startdatum is verplicht.');          return; }
    if (!form.endDate)       { setCreateError('Einddatum is verplicht.');           return; }
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

  const handleSaveSettings = async () => {
    const day   = parseInt(settingsForm.seasonStartDay);
    const month = parseInt(settingsForm.seasonStartMonth);
    if (!day || day < 1 || day > 31)      { return; }
    if (!month || month < 1 || month > 12){ return; }
    setSavingSettings(true);
    try {
      await ClubFactory.update(clubId, { seasonStartDay: day, seasonStartMonth: month });
      setSettingsOk(true);
      setTimeout(() => setSettingsOk(false), 2500);
      onClubUpdate?.({ seasonStartDay: day, seasonStartMonth: month });
    } catch (e) {
      console.error('[SeasonManager] settings error:', e);
    } finally {
      setSavingSettings(false);
    }
  };

  const activeSeason    = currentSeason;
  const historicSeasons = seasons.filter(s => s.id !== currentSeason?.id);

  const MONTH_NAMES = ['', 'januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];

  return (
    <div>

      {/* ── Current season card ── */}
      <div style={s.sectionLabel}>Huidig seizoen</div>

      {loading ? (
        <div style={s.card}><span style={{ fontSize: '13px', color: '#64748b' }}>Laden…</span></div>
      ) : activeSeason ? (
        <div style={{ ...s.card, borderColor: '#22c55e33' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#22c55e22', border: '1px solid #22c55e44', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Calendar size={18} color="#22c55e" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '800', fontSize: '15px', color: '#f1f5f9' }}>{activeSeason.name}</div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                {fmtDate(activeSeason.startDate)} — {fmtDate(activeSeason.endDate)}
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
              <input type="date" style={s.input} value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div>
              <label style={s.label}>Einddatum *</label>
              <input type="date" style={s.input} value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
            </div>
          </div>

          {createError && (
            <div style={s.errorBanner}><AlertCircle size={13} style={{ flexShrink: 0 }} /> {createError}</div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <button onClick={handleCreate} disabled={creating} style={{ ...s.primaryBtn, flex: 1, opacity: creating ? 0.65 : 1 }}>
              <Save size={14} /> {creating ? 'Aanmaken…' : 'Seizoen aanmaken'}
            </button>
            <button onClick={() => { setShowCreateForm(false); setCreateError(''); setForm({ name: '', startDate: '', endDate: '' }); }} style={s.cancelBtn}>
              Annuleren
            </button>
          </div>
        </div>
      )}

      {/* ── Club season settings ── */}
      <div style={{ marginTop: '24px' }}>
        <button
          onClick={() => setShowSettings(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '0 0 10px', fontFamily: 'inherit' }}
        >
          <Settings size={12} />
          Seizoeninstellingen
          {showSettings ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {showSettings && (
          <div style={s.card}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px', lineHeight: 1.5 }}>
              Stel in op welke dag en maand het nieuwe seizoen normaal begint. De app toont een herinnering één maand voor deze datum.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div>
                <label style={s.label}>Dag (1–31)</label>
                <input
                  type="number" min="1" max="31"
                  style={s.input}
                  value={settingsForm.seasonStartDay}
                  onChange={e => setSettingsForm(f => ({ ...f, seasonStartDay: e.target.value }))}
                  placeholder="1"
                />
              </div>
              <div>
                <label style={s.label}>Maand</label>
                <select
                  style={s.input}
                  value={settingsForm.seasonStartMonth}
                  onChange={e => setSettingsForm(f => ({ ...f, seasonStartMonth: e.target.value }))}
                >
                  <option value="">-- Kies maand --</option>
                  {MONTH_NAMES.slice(1).map((name, i) => (
                    <option key={i + 1} value={i + 1}>{name.charAt(0).toUpperCase() + name.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>

            {settingsForm.seasonStartDay && settingsForm.seasonStartMonth && (
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '12px' }}>
                Herinnering verschijnt vanaf <strong style={{ color: '#94a3b8' }}>
                  {parseInt(settingsForm.seasonStartDay) - 30 <= 0
                    ? `${Math.abs(30 - parseInt(settingsForm.seasonStartDay) + 1)} ${MONTH_NAMES[parseInt(settingsForm.seasonStartMonth) - 1] || ''} van het vorige jaar`
                    : `${parseInt(settingsForm.seasonStartDay) - 30} ${MONTH_NAMES[parseInt(settingsForm.seasonStartMonth)] || ''}`
                  }</strong> (ca. 30 dagen voor de startdatum).
              </div>
            )}

            <button
              onClick={handleSaveSettings}
              disabled={savingSettings}
              style={{ ...s.primaryBtn, opacity: savingSettings ? 0.65 : 1 }}
            >
              {settingsOk ? <><CheckCircle2 size={14} /> Opgeslagen!</> : <><Save size={14} /> Instellingen opslaan</>}
            </button>
          </div>
        )}
      </div>

      {/* ── Season history ── */}
      {historicSeasons.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <button
            onClick={() => setShowHistory(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '0 0 10px', fontFamily: 'inherit' }}
          >
            <Archive size={12} />
            Seizoengeschiedenis ({historicSeasons.length})
            {showHistory ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {showHistory && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {historicSeasons.map(season => (
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
                      <button
                        onClick={() => handleAbandon(season)}
                        style={{ ...s.ghostBtn, color: '#ef4444', fontSize: '11px' }}
                        title="Markeer als verlaten"
                      >
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

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  sectionLabel: {
    fontSize: '11px', fontWeight: '700', color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '0.5px',
    marginBottom: '10px',
  },
  card: {
    backgroundColor: '#1e293b', borderRadius: '12px',
    border: '1px solid #334155', padding: '14px 16px',
    marginBottom: '10px',
  },
  label: {
    display: 'block', fontSize: '11px', fontWeight: '700',
    color: '#64748b', textTransform: 'uppercase',
    letterSpacing: '0.4px', marginBottom: '5px',
  },
  input: {
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    border: '1px solid #334155', backgroundColor: '#0f172a',
    color: 'white', fontSize: '14px', fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  primaryBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '7px',
    padding: '10px 16px', backgroundColor: '#3b82f6',
    border: 'none', borderRadius: '8px',
    color: 'white', fontWeight: '700', fontSize: '13px',
    cursor: 'pointer', fontFamily: 'inherit',
  },
  secondaryBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '7px',
    padding: '10px 16px', backgroundColor: 'transparent',
    border: '1px solid #334155', borderRadius: '8px',
    color: '#94a3b8', fontWeight: '600', fontSize: '13px',
    cursor: 'pointer', fontFamily: 'inherit', marginTop: '8px',
  },
  cancelBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: '10px 14px', backgroundColor: 'transparent',
    border: '1px solid #334155', borderRadius: '8px',
    color: '#64748b', fontWeight: '600', fontSize: '13px',
    cursor: 'pointer', fontFamily: 'inherit',
  },
  ghostBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '5px',
    background: 'none', border: 'none',
    cursor: 'pointer', fontFamily: 'inherit', padding: '4px 6px',
  },
  errorBanner: {
    display: 'flex', alignItems: 'center', gap: '8px',
    backgroundColor: '#ef444422', color: '#ef4444',
    fontSize: '13px', padding: '10px 12px',
    borderRadius: '8px', border: '1px solid #ef444433',
    marginBottom: '10px',
  },
};
