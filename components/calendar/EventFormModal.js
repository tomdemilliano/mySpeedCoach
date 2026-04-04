/**
 * components/calendar/EventFormModal.js
 *
 * Modal voor het aanmaken en bewerken van kalender-events.
 * Ondersteunt drie types: training, club_event, competition.
 * Kan ook gebruikt worden voor annuleren van een bestaand event.
 *
 * Gedrag per type:
 *   training    — duur verplicht, locatie uit lijst + vrij veld
 *   club_event  — geen duur, optioneel einduur, locatie uit lijst + vrij veld
 *   competition — geen duur, optioneel einduur, locatie uit lijst + vrij veld,
 *                 geen niveau/inschrijvingslink, wel vereiste labels
 *
 * Props:
 *   event       : calendarEvent | null   — null = nieuw event
 *   clubId      : string
 *   uid         : string                 — Firebase Auth uid
 *   groups      : group[]
 *   locations   : location[]
 *   onClose     : () => void
 *   mode        : 'create' | 'edit' | 'cancel'
 */

import { useState } from 'react';
import {
  X, Save, Trash2, AlertCircle, MapPin, Calendar,
  Clock, Users, Dumbbell, Star, Trophy, AlertTriangle,
} from 'lucide-react';
import { CalendarEventFactory } from '../../constants/dbSchema';
import { applyTimeToDate } from '../../utils/calendarUtils';

// ─── Constants ────────────────────────────────────────────────────────────────
const TYPE_OPTIONS = [
  { value: 'training',   label: 'Training',       icon: Dumbbell, color: '#3b82f6' },
  { value: 'club_event', label: 'Club evenement',  icon: Star,     color: '#a78bfa' },
  { value: 'competition',label: 'Wedstrijd',       icon: Trophy,   color: '#f97316' },
];

const COMPETITION_TYPES = [
  { value: 'recrea',  label: 'Recrea' },
  { value: 'masters', label: 'Masters' },
  { value: 'teams',   label: 'Teams' },
  { value: 'demo',    label: 'Demo' },
];

const DURATION_OPTIONS = [
  { value: 45,  label: '45 min' },
  { value: 60,  label: '1 uur' },
  { value: 75,  label: '1u15' },
  { value: 90,  label: '1u30' },
  { value: 105, label: '1u45' },
  { value: 120, label: '2 uur' },
  { value: 150, label: '2u30' },
  { value: 180, label: '3 uur' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function tsToDateStr(ts) {
  if (!ts) return '';
  const d = new Date((ts.seconds || 0) * 1000);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function tsToTimeStr(ts) {
  if (!ts) return '';
  const d = new Date((ts.seconds || 0) * 1000);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function buildTimestamp(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const d = applyTimeToDate(new Date(dateStr + 'T00:00:00'), timeStr);
  return { seconds: Math.floor(d.getTime() / 1000) };
}
function computeEndTs(dateStr, timeStr, durationMin) {
  const start = buildTimestamp(dateStr, timeStr);
  if (!start) return null;
  return { seconds: start.seconds + (durationMin || 90) * 60 };
}

// Bepaal of het type een vaste duur vereist (alleen training)
const needsDuration = (type) => type === 'training';

const FieldLabel = ({ children }) => (
  <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '5px' }}>
    {children}
  </div>
);

const inputStyle = {
  width: '100%', padding: '11px 12px', borderRadius: '8px',
  border: '1px solid #334155', backgroundColor: '#0f172a',
  color: 'white', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box',
};
const selectStyle = { ...inputStyle };

// ─── Cancel Mode ──────────────────────────────────────────────────────────────
function CancelForm({ event, clubId, onClose }) {
  const [reason, setReason]  = useState('');
  const [saving, setSaving]  = useState(false);
  const [error,  setError]   = useState('');

  const handleCancel = async () => {
    setSaving(true); setError('');
    try {
      if (event._virtual) {
        await CalendarEventFactory.materializeVirtual(clubId, event, {}, null);
      }
      await CalendarEventFactory.cancel(clubId, event.id, reason.trim());
      onClose();
    } catch (e) {
      console.error('[CancelForm]', e);
      setError('Annuleren mislukt. Probeer opnieuw.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444' }}>
            <AlertTriangle size={18} />
            <span style={{ fontWeight: '800', fontSize: '16px', color: '#f1f5f9' }}>Event annuleren</span>
          </div>
          <button onClick={onClose} style={iconBtnStyle}><X size={18} /></button>
        </div>

        <div style={{ backgroundColor: '#ef444411', border: '1px solid #ef444433', borderRadius: '10px', padding: '12px', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#f1f5f9', marginBottom: '2px' }}>{event.title}</div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            {new Date((event.startAt?.seconds || 0) * 1000).toLocaleDateString('nl-BE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <FieldLabel>Reden van annulering (optioneel)</FieldLabel>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="bijv. Sporthal niet beschikbaar, coach ziek…"
            style={{ ...inputStyle, minHeight: '80px', resize: 'vertical', lineHeight: 1.5 }}
          />
          <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>
            De reden wordt getoond aan leden in de kalender.
          </div>
        </div>

        {error && <ErrorBanner message={error} />}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleCancel} disabled={saving} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', backgroundColor: '#ef4444', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '700', fontSize: '14px', cursor: 'pointer', opacity: saving ? 0.65 : 1, fontFamily: 'inherit' }}>
            <Trash2 size={15} /> {saving ? 'Annuleren…' : 'Event annuleren'}
          </button>
          <button onClick={onClose} style={{ padding: '12px 16px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '8px', color: '#94a3b8', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
            Terug
          </button>
        </div>
      </div>
    </div>
  );
}

function ErrorBanner({ message }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#ef444422', color: '#ef4444', fontSize: '13px', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ef444433', marginBottom: '12px' }}>
      <AlertCircle size={14} style={{ flexShrink: 0 }} /> {message}
    </div>
  );
}

// ─── Router wrapper ───────────────────────────────────────────────────────────
export default function EventFormModal(props) {
  if (props.mode === 'cancel' && props.event) {
    return <CancelForm event={props.event} clubId={props.clubId} onClose={props.onClose} />;
  }
  return <EventForm {...props} />;
}

// ─── Main form ────────────────────────────────────────────────────────────────
function EventForm({ event, clubId, uid, groups = [], locations = [], onClose, mode = 'create' }) {
  const isEdit = mode === 'edit' && !!event;
  const today  = new Date().toISOString().split('T')[0];

  const initEndTime = () => {
    if (!isEdit || !event?.endAt) return '';
    // Geen einduur tonen als endAt === startAt (punt-event)
    if (event.endAt?.seconds === event.startAt?.seconds) return '';
    return tsToTimeStr(event.endAt);
  };

  // Herstel manuele locatievelden uit de opgeslagen locationNote (formaat: "Naam|Adres|Postcode|Gemeente")
  const parseManualLoc = (note) => {
    if (!note) return { name: '', address: '', postalCode: '', city: '' };
    const parts = note.split('|');
    return {
      name:       parts[0] || '',
      address:    parts[1] || '',
      postalCode: parts[2] || '',
      city:       parts[3] || '',
    };
  };
  const savedManual = parseManualLoc(
    (!event?.locationId && event?.locationNote) ? event.locationNote : ''
  );

  const [form, setForm] = useState({
    type:         event?.type      || 'training',
    title:        event?.title     || '',
    groupIds:     event?.groupIds  || [],
    // Locatie
    locationId:       event?.locationId || '',
    useManualLoc:     !event?.locationId && !!(event?.locationNote),
    manualName:       savedManual.name,
    manualAddress:    savedManual.address,
    manualPostalCode: savedManual.postalCode,
    manualCity:       savedManual.city,
    // Datum & tijd
    date:        isEdit ? tsToDateStr(event.startAt) : today,
    startTime:   isEdit ? tsToTimeStr(event.startAt) : '09:00',
    durationMin: isEdit && needsDuration(event?.type)
      ? Math.round(((event.endAt?.seconds || 0) - (event.startAt?.seconds || 0)) / 60)
      : 90,
    endTime:     initEndTime(),
    // Overige
    isSpecial:    event?.isSpecial    || false,
    specialLabel: event?.specialLabel || '',
    memberNotes:  event?.memberNotes  || '',
    notes:        event?.notes        || '',
    // Competition
    compType:   event?.competitionDetails?.competitionType || '',
    compLabels: event?.competitionDetails?.requiredLabels  || [],
  });

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleGroup = (gid) =>
    set('groupIds', form.groupIds.includes(gid)
      ? form.groupIds.filter(id => id !== gid)
      : [...form.groupIds, gid]);

  const toggleLabel = (lbl) =>
    set('compLabels', form.compLabels.includes(lbl)
      ? form.compLabels.filter(l => l !== lbl)
      : [...form.compLabels, lbl]);

  const isTraining = form.type === 'training';

  const handleSave = async () => {
    setError('');
    if (!form.title.trim()) { setError('Titel is verplicht.'); return; }
    if (!form.date)          { setError('Datum is verplicht.'); return; }
    if (!form.startTime)     { setError('Startuur is verplicht.'); return; }
    if (form.groupIds.length === 0 && form.type !== 'competition') {
      setError('Kies minstens één groep.'); return;
    }

    setSaving(true);
    try {
      const startAt = buildTimestamp(form.date, form.startTime);

      let endAt;
      if (isTraining) {
        endAt = computeEndTs(form.date, form.startTime, form.durationMin);
      } else if (form.endTime) {
        endAt = buildTimestamp(form.date, form.endTime);
        if (endAt && startAt && endAt.seconds <= startAt.seconds) {
          setError('Einduur moet na het startuur liggen.'); setSaving(false); return;
        }
      } else {
        endAt = startAt;
      }

      // Locatie opbouwen
      const locationId = form.useManualLoc ? null : (form.locationId || null);
      // Sla manuele locatie op als pipe-gescheiden string: "Naam|Adres|Postcode|Gemeente"
      const locationNote = form.useManualLoc
        ? [form.manualName, form.manualAddress, form.manualPostalCode, form.manualCity]
            .map(s => s.trim())
            .join('|')
            .replace(/\|+$/, '') // verwijder trailing pipes als achterste velden leeg zijn
        : '';

      const data = {
        type:         form.type,
        title:        form.title.trim(),
        groupIds:     form.groupIds,
        locationId,
        locationNote,
        startAt,
        endAt,
        status:          'scheduled',
        isSpecial:       form.isSpecial,
        specialLabel:    form.isSpecial ? form.specialLabel.trim() : '',
        memberNotes:     form.memberNotes.trim(),
        notes:           form.notes.trim(),
        cancelReason:    '',
        coachMemberIds:  [],
        substituteNotes: '',
        prepId:          null,
        templateId:      null,
        competitionDetails: form.type === 'competition' ? {
          competitionType: form.compType || null,
          registrationUrl: null,
          requiredLabels:  form.compLabels,
          disciplines:     [],
        } : null,
      };

      if (isEdit) {
        await CalendarEventFactory.update(clubId, event.id, data);
      } else {
        await CalendarEventFactory.create(clubId, data, uid);
      }
      onClose();
    } catch (e) {
      console.error('[EventFormModal]', e);
      setError('Opslaan mislukt. Probeer opnieuw.');
    } finally {
      setSaving(false);
    }
  };

  const selectedType = TYPE_OPTIONS.find(t => t.value === form.type) || TYPE_OPTIONS[0];

  return (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, maxHeight: '94vh', overflowY: 'auto' }}>
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <selectedType.icon size={18} color={selectedType.color} />
            <span style={{ fontWeight: '800', fontSize: '16px', color: '#f1f5f9' }}>
              {isEdit ? 'Event bewerken' : 'Nieuw event'}
            </span>
          </div>
          <button onClick={onClose} style={iconBtnStyle}><X size={18} /></button>
        </div>

        {/* Uitzondering-banner */}
        {isEdit && event?.templateId && (
          <div style={{ backgroundColor: '#f59e0b11', border: '1px solid #f59e0b33', borderRadius: '10px', padding: '10px 12px', marginBottom: '16px', fontSize: '12px', color: '#f59e0b', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <span style={{ fontSize: '14px', flexShrink: 0 }}>ℹ️</span>
            <span>Je wijzigt <strong>alleen deze instantie</strong> van de reeks. De overige trainingen blijven ongewijzigd.</span>
          </div>
        )}

        {/* ── Type ── */}
        <div style={{ marginBottom: '16px' }}>
          <FieldLabel>Type</FieldLabel>
          <div style={{ display: 'flex', gap: '8px' }}>
            {TYPE_OPTIONS.map(opt => {
              const Icon   = opt.icon;
              const active = form.type === opt.value;
              return (
                <button key={opt.value} onClick={() => set('type', opt.value)} style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
                  padding: '10px 6px', borderRadius: '10px', fontFamily: 'inherit',
                  border: `1.5px solid ${active ? opt.color : '#334155'}`,
                  backgroundColor: active ? opt.color + '22' : 'transparent',
                  color: active ? opt.color : '#64748b',
                  cursor: 'pointer', transition: 'all 0.12s',
                }}>
                  <Icon size={16} />
                  <span style={{ fontSize: '11px', fontWeight: active ? '700' : '500' }}>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Titel ── */}
        <div style={{ marginBottom: '14px' }}>
          <FieldLabel>Titel *</FieldLabel>
          <input
            style={inputStyle}
            value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder={
              form.type === 'competition' ? 'BK Springtouw 2025' :
              form.type === 'club_event'  ? 'Clubfeest / uitstap…' :
              'Extra training'
            }
            autoFocus
          />
        </div>

        {/* ── Datum ── */}
        <div style={{ marginBottom: '14px' }}>
          <FieldLabel>Datum *</FieldLabel>
          <input type="date" style={inputStyle} value={form.date} onChange={e => set('date', e.target.value)} />
        </div>

        {/* ── Startuur + Duur/Einduur op één rij ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
          <div>
            <FieldLabel>Startuur *</FieldLabel>
            <input type="time" style={inputStyle} value={form.startTime} onChange={e => set('startTime', e.target.value)} />
          </div>
          <div>
            {isTraining ? (
              <>
                <FieldLabel>Duur</FieldLabel>
                <select style={selectStyle} value={form.durationMin} onChange={e => set('durationMin', parseInt(e.target.value))}>
                  {DURATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </>
            ) : (
              <>
                <FieldLabel>Einduur (optioneel)</FieldLabel>
                <input
                  type="time"
                  style={inputStyle}
                  value={form.endTime}
                  onChange={e => set('endTime', e.target.value)}
                />
              </>
            )}
          </div>
        </div>

        {/* ── Groepen ── */}
        <div style={{ marginBottom: '14px' }}>
          <FieldLabel>{form.type === 'competition' ? 'Groepen (leeg = clubbreed)' : 'Groepen *'}</FieldLabel>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {groups.map(g => {
              const active = form.groupIds.includes(g.id);
              return (
                <button key={g.id} onClick={() => toggleGroup(g.id)} style={{
                  padding: '6px 12px', borderRadius: '20px', fontFamily: 'inherit',
                  border: `1px solid ${active ? '#3b82f6' : '#334155'}`,
                  backgroundColor: active ? '#3b82f622' : 'transparent',
                  color: active ? '#60a5fa' : '#64748b',
                  fontSize: '12px', fontWeight: active ? '700' : '500', cursor: 'pointer',
                }}>
                  {g.name} {active ? '✓' : ''}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Locatie ── */}
        <div style={{ marginBottom: '14px' }}>
          <FieldLabel>Locatie</FieldLabel>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
            {[
              { key: false, label: 'Kies uit lijst' },
              { key: true,  label: 'Vrij invullen'  },
            ].map(opt => (
              <button
                key={String(opt.key)}
                onClick={() => set('useManualLoc', opt.key)}
                style={{
                  padding: '5px 12px', borderRadius: '20px', fontFamily: 'inherit',
                  border: `1px solid ${form.useManualLoc === opt.key ? '#3b82f6' : '#334155'}`,
                  backgroundColor: form.useManualLoc === opt.key ? '#3b82f622' : 'transparent',
                  color: form.useManualLoc === opt.key ? '#60a5fa' : '#64748b',
                  fontSize: '12px', fontWeight: form.useManualLoc === opt.key ? '700' : '500',
                  cursor: 'pointer',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {form.useManualLoc ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input
                style={inputStyle}
                value={form.manualName}
                onChange={e => set('manualName', e.target.value)}
                placeholder="Naam (bijv. Sporthal Olympia)"
              />
              <input
                style={inputStyle}
                value={form.manualAddress}
                onChange={e => set('manualAddress', e.target.value)}
                placeholder="Adres (bijv. Olympialaan 1)"
              />
              <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '8px' }}>
                <input
                  style={inputStyle}
                  value={form.manualPostalCode}
                  onChange={e => set('manualPostalCode', e.target.value)}
                  placeholder="Postcode"
                />
                <input
                  style={inputStyle}
                  value={form.manualCity}
                  onChange={e => set('manualCity', e.target.value)}
                  placeholder="Gemeente"
                />
              </div>
            </div>
          ) : (
            <select
              style={selectStyle}
              value={form.locationId}
              onChange={e => set('locationId', e.target.value)}
            >
              <option value="">— Geen / later bepalen —</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name} — {loc.city}</option>
              ))}
            </select>
          )}
        </div>

        {/* ── Speciale training toggle (alleen training) ── */}
        {form.type === 'training' && (
          <div style={{ marginBottom: '14px', backgroundColor: '#0f172a', borderRadius: '10px', padding: '12px', border: '1px solid #334155' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: form.isSpecial ? '10px' : 0 }}>
              <div style={{ flex: 1, fontSize: '13px', color: '#94a3b8', fontWeight: '600' }}>Speciale training</div>
              <button
                onClick={() => set('isSpecial', !form.isSpecial)}
                style={{
                  width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                  backgroundColor: form.isSpecial ? '#22c55e' : '#334155',
                  position: 'relative', transition: 'background-color 0.2s', flexShrink: 0,
                }}
              >
                <div style={{
                  width: '14px', height: '14px', borderRadius: '50%', backgroundColor: 'white',
                  position: 'absolute', top: '3px',
                  left: form.isSpecial ? '19px' : '3px',
                  transition: 'left 0.2s',
                }} />
              </button>
            </div>
            {form.isSpecial && (
              <input
                style={inputStyle}
                value={form.specialLabel}
                onChange={e => set('specialLabel', e.target.value)}
                placeholder="🎃 Halloween training"
              />
            )}
          </div>
        )}

        {/* ── Wedstrijddetails (competition only) ── */}
        {form.type === 'competition' && (
          <div style={{ backgroundColor: '#f9731611', border: '1px solid #f9731633', borderRadius: '12px', padding: '14px', marginBottom: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#f97316', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Trophy size={13} /> Wedstrijdinfo
            </div>

            {/* Type wedstrijd */}
            <div style={{ marginBottom: '12px' }}>
              <FieldLabel>Type wedstrijd</FieldLabel>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {COMPETITION_TYPES.map(opt => {
                  const active = form.compType === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => set('compType', active ? '' : opt.value)}
                      style={{
                        padding: '6px 14px', borderRadius: '20px', fontFamily: 'inherit',
                        border: `1px solid ${active ? '#f97316' : '#334155'}`,
                        backgroundColor: active ? '#f9731622' : 'transparent',
                        color: active ? '#f97316' : '#64748b',
                        fontSize: '12px', fontWeight: active ? '700' : '500', cursor: 'pointer',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Vereiste labels */}
            <div>
              <FieldLabel>Vereist niveau (labels)</FieldLabel>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                {['A', 'B', 'C'].map(lbl => {
                  const active = form.compLabels.includes(lbl);
                  return (
                    <button key={lbl} onClick={() => toggleLabel(lbl)} style={{
                      width: '44px', padding: '7px 0', borderRadius: '8px', fontFamily: 'inherit',
                      border: `1px solid ${active ? '#f97316' : '#334155'}`,
                      backgroundColor: active ? '#f9731622' : 'transparent',
                      color: active ? '#f97316' : '#64748b',
                      fontSize: '13px', fontWeight: active ? '800' : '500', cursor: 'pointer',
                    }}>
                      {lbl}
                    </button>
                  );
                })}
                <span style={{ fontSize: '11px', color: '#475569' }}>
                  Leeg = iedereen welkom
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Info voor leden ── */}
        <div style={{ marginBottom: '14px' }}>
          <FieldLabel>Info voor leden (optioneel)</FieldLabel>
          <textarea
            style={{ ...inputStyle, minHeight: '70px', resize: 'vertical', lineHeight: 1.5 }}
            value={form.memberNotes}
            onChange={e => set('memberNotes', e.target.value)}
            placeholder="Zichtbaar voor leden in de kalender…"
          />
        </div>

        {/* ── Interne notities ── */}
        <div style={{ marginBottom: '16px' }}>
          <FieldLabel>Interne notities (enkel coach/admin)</FieldLabel>
          <textarea
            style={{ ...inputStyle, minHeight: '60px', resize: 'vertical', lineHeight: 1.5 }}
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Niet zichtbaar voor leden…"
          />
        </div>

        {error && <ErrorBanner message={error} />}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleSave} disabled={saving} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', backgroundColor: '#22c55e', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '700', fontSize: '14px', cursor: 'pointer', opacity: saving ? 0.65 : 1, fontFamily: 'inherit' }}>
            <Save size={15} /> {saving ? 'Opslaan…' : isEdit ? 'Wijzigingen opslaan' : 'Event aanmaken'}
          </button>
          <button onClick={onClose} style={{ padding: '12px 16px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '8px', color: '#94a3b8', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
            Annuleren
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const overlayStyle = {
  position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)',
  display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 500,
};
const modalStyle = {
  backgroundColor: '#1e293b', borderRadius: '20px 20px 0 0',
  padding: '24px', width: '100%', maxWidth: '580px',
  border: '1px solid #334155',
};
const headerStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px',
};
const iconBtnStyle = {
  background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '6px', display: 'flex',
};
