/**
 * pages/calendar-admin.js
 *
 * Beheerpagina voor de kalender — toegankelijk voor clubadmin en coaches.
 *
 * Tabs:
 *   1. Locaties   — CRUD voor sportlocaties (admin only)
 *   2. Templates  — Recurring training-reeksen aanmaken/bewerken (admin)
 *   3. Evenementen — Eenmalige events (coach + admin) [Fase 3, placeholder nu]
 *   4. Rapporten  — Aanwezigheid + coach-overzicht   [Fase 6, placeholder nu]
 *
 * Rules:
 *   - All DB via factories (CLAUDE.md §1)
 *   - No <form> elements (CLAUDE.md §4)
 *   - Inline CSS only (CLAUDE.md §9)
 *   - Dutch UI (CLAUDE.md §9)
 */

import { useState, useEffect } from 'react';
import {
  UserFactory, ClubFactory, GroupFactory,
  UserMemberLinkFactory,
  LocationFactory, EventTemplateFactory, CalendarEventFactory,
} from '../constants/dbSchema';
import { useAuth } from '../contexts/AuthContext';
import {
  recurrenceLabel, formatTs, getEventColor,
  generateVirtualEvents, mergeWithExceptions,
  startOfDay, endOfDay, addDays,
} from '../utils/calendarUtils';
import {
  MapPin, Plus, Edit2, Trash2, X, Save, Check,
  Calendar, Users, Clock, AlertCircle, Building2,
  ChevronRight, RefreshCw, CheckCircle2, ToggleLeft,
  ToggleRight, Repeat, Dumbbell, Star, Trophy,
  ArrowLeft, Settings, BarChart2, Zap,
} from 'lucide-react';
import EventFormModal from '../components/calendar/EventFormModal';
import AttendanceReport from '../components/calendar/AttendanceReport';

// ─── Constants ────────────────────────────────────────────────────────────────
const DAYS_NL = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
const DAYS_FULL_NL = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];

const FREQUENCY_OPTIONS = [
  { value: 'weekly',    label: 'Wekelijks' },
  { value: 'biweekly',  label: 'Tweewekelijks' },
  { value: 'monthly',   label: 'Maandelijks' },
  { value: 'none',      label: 'Eenmalig' },
];

const TYPE_OPTIONS = [
  { value: 'training',   label: 'Training',       icon: Dumbbell, color: '#3b82f6' },
  { value: 'club_event', label: 'Club evenement',  icon: Star,     color: '#a78bfa' },
  { value: 'competition',label: 'Wedstrijd',       icon: Trophy,   color: '#f97316' },
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

// ─── Shared small components ──────────────────────────────────────────────────

function ErrorBanner({ message }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#ef444422', color: '#ef4444', fontSize: '13px', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ef444433', marginBottom: '12px' }}>
      <AlertCircle size={14} style={{ flexShrink: 0 }} /> {message}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
      {children}
    </div>
  );
}

function EmptyState({ icon: Icon, color = '#334155', text, action }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '50px 20px', textAlign: 'center' }}>
      <Icon size={40} color={color} style={{ marginBottom: '12px', opacity: 0.5 }} />
      <p style={{ color: '#475569', fontSize: '14px', margin: '0 0 16px' }}>{text}</p>
      {action}
    </div>
  );
}

// ─── Location Form Modal ──────────────────────────────────────────────────────
function LocationFormModal({ location, clubId, uid, onClose }) {
  const isEdit = !!location?.id;
  const [form, setForm] = useState({
    name:         location?.name         || '',
    address:      location?.address      || '',
    city:         location?.city         || '',
    postalCode:   location?.postalCode   || '',
    contactName:  location?.contactName  || '',
    contactPhone: location?.contactPhone || '',
    notes:        location?.notes        || '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setError('');
    if (!form.name.trim()) { setError('Naam is verplicht.'); return; }
    if (!form.city.trim()) { setError('Gemeente is verplicht.'); return; }
    setSaving(true);
    try {
      const data = {
        name:         form.name.trim(),
        address:      form.address.trim(),
        city:         form.city.trim(),
        postalCode:   form.postalCode.trim(),
        contactName:  form.contactName.trim()  || null,
        contactPhone: form.contactPhone.trim() || null,
        notes:        form.notes.trim(),
      };
      isEdit
        ? await LocationFactory.update(location.id, data)
        : await LocationFactory.create(clubId, data, uid);
      onClose();
    } catch (e) {
      console.error('[LocationFormModal]', e);
      setError('Opslaan mislukt. Probeer opnieuw.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={s.overlay}>
      <div style={{ ...s.modal, maxHeight: '92vh', overflowY: 'auto', borderRadius: '20px' }}>
        <div style={s.modalHeader}>
          <h3 style={{ margin: 0, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: '#f1f5f9' }}>
            <MapPin size={18} color="#3b82f6" />
            {isEdit ? 'Locatie bewerken' : 'Nieuwe locatie'}
          </h3>
          <button style={s.iconBtn} onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={s.label}>Naam *</label>
            <input style={s.input} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Sporthal De Linde" autoFocus />
          </div>
          <div>
            <label style={s.label}>Adres</label>
            <input style={s.input} value={form.address} onChange={e => set('address', e.target.value)} placeholder="Kerkstraat 12" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '10px' }}>
            <div>
              <label style={s.label}>Postcode</label>
              <input style={s.input} value={form.postalCode} onChange={e => set('postalCode', e.target.value)} placeholder="2000" />
            </div>
            <div>
              <label style={s.label}>Gemeente *</label>
              <input style={s.input} value={form.city} onChange={e => set('city', e.target.value)} placeholder="Antwerpen" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={s.label}>Contactpersoon</label>
              <input style={s.input} value={form.contactName} onChange={e => set('contactName', e.target.value)} placeholder="Jan Janssen" />
            </div>
            <div>
              <label style={s.label}>Telefoonnummer</label>
              <input style={s.input} value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)} placeholder="+32 478 …" />
            </div>
          </div>
          <div>
            <label style={s.label}>Notities</label>
            <textarea style={{ ...s.input, minHeight: '70px', resize: 'vertical', lineHeight: 1.5, fontFamily: 'inherit' }} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Parkeren achteraan gebouw, ingang via zijdeur…" />
          </div>
        </div>

        {error && <ErrorBanner message={error} />}

        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button onClick={handleSave} disabled={saving} style={{ ...bs.primary, flex: 1, justifyContent: 'center', opacity: saving ? 0.65 : 1 }}>
            <Save size={15} /> {saving ? 'Opslaan…' : isEdit ? 'Wijzigingen opslaan' : 'Locatie toevoegen'}
          </button>
          <button onClick={onClose} style={bs.secondary}><X size={15} /> Annuleren</button>
        </div>
      </div>
    </div>
  );
}

// ─── Template Form Modal ──────────────────────────────────────────────────────
function TemplateFormModal({ template, clubId, uid, groups, locations, onClose }) {
  const isEdit = !!template?.id;

  const [form, setForm] = useState({
    type:                  template?.type || 'training',
    title:                 template?.title || '',
    groupIds:              template?.groupIds || [],
    locationId:            template?.locationId || '',
    defaultCoachMemberIds: template?.defaultCoachMemberIds || [],
    color:                 template?.color || '',
    recurrence: {
      frequency:   template?.recurrence?.frequency   || 'weekly',
      daysOfWeek:  template?.recurrence?.daysOfWeek  || [],
      startDate:   template?.recurrence?.startDate   || '',
      endDate:     template?.recurrence?.endDate     || '',
      startTime:   template?.recurrence?.startTime   || '19:00',
      durationMin: template?.recurrence?.durationMin || 90,
    },
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set    = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setRec = (k, v) => setForm(f => ({ ...f, recurrence: { ...f.recurrence, [k]: v } }));

  const toggleGroup = (gid) => {
    set('groupIds', form.groupIds.includes(gid)
      ? form.groupIds.filter(id => id !== gid)
      : [...form.groupIds, gid]
    );
  };

  const toggleDay = (day) => {
    setRec('daysOfWeek', form.recurrence.daysOfWeek.includes(day)
      ? form.recurrence.daysOfWeek.filter(d => d !== day)
      : [...form.recurrence.daysOfWeek, day].sort((a, b) => a - b)
    );
  };

  const handleSave = async () => {
    setError('');
    if (!form.title.trim())                             { setError('Titel is verplicht.');           return; }
    if (form.groupIds.length === 0)                     { setError('Kies minstens één groep.');      return; }
    if (!form.recurrence.startDate)                     { setError('Startdatum is verplicht.');      return; }
    if (!form.recurrence.startTime)                     { setError('Starttijd is verplicht.');       return; }
    if (form.recurrence.frequency !== 'none' &&
        form.recurrence.frequency !== 'monthly' &&
        form.recurrence.daysOfWeek.length === 0)       { setError('Kies minstens één dag.');        return; }

    setSaving(true);
    try {
      const data = {
        ...form,
        recurrence: {
          ...form.recurrence,
          endDate:     form.recurrence.endDate     || null,
          locationId:  form.locationId             || null,
          durationMin: parseInt(form.recurrence.durationMin) || 90,
        },
        locationId: form.locationId || null,
        color:      form.color      || null,
      };
      isEdit
        ? await EventTemplateFactory.update(clubId, template.id, data)
        : await EventTemplateFactory.create(clubId, data, uid);
      onClose();
    } catch (e) {
      console.error('[TemplateFormModal]', e);
      setError('Opslaan mislukt. Probeer opnieuw.');
    } finally {
      setSaving(false);
    }
  };

  const selectedType = TYPE_OPTIONS.find(t => t.value === form.type) || TYPE_OPTIONS[0];

  return (
    <div style={s.overlay}>
      <div style={{ ...s.modal, maxHeight: '94vh', overflowY: 'auto', borderRadius: '20px' }}>
        <div style={s.modalHeader}>
          <h3 style={{ margin: 0, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: '#f1f5f9' }}>
            <Repeat size={18} color="#22c55e" />
            {isEdit ? 'Template bewerken' : 'Nieuwe training-reeks'}
          </h3>
          <button style={s.iconBtn} onClick={onClose}><X size={18} /></button>
        </div>

        {/* Type */}
        <div style={{ marginBottom: '16px' }}>
          <SectionLabel>Type evenement</SectionLabel>
          <div style={{ display: 'flex', gap: '8px' }}>
            {TYPE_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const active = form.type === opt.value;
              return (
                <button key={opt.value} type="button" onClick={() => set('type', opt.value)} style={{
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

        {/* Title */}
        <div style={{ marginBottom: '14px' }}>
          <label style={s.label}>Titel *</label>
          <input style={s.input} value={form.title} onChange={e => set('title', e.target.value)} placeholder="Wekelijkse training Groep A" autoFocus />
        </div>

        {/* Groups */}
        <div style={{ marginBottom: '16px' }}>
          <SectionLabel>Groepen * (wie ziet dit event)</SectionLabel>
          {groups.length === 0 ? (
            <p style={{ fontSize: '12px', color: '#475569' }}>Geen groepen gevonden.</p>
          ) : (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {groups.map(g => {
                const active = form.groupIds.includes(g.id);
                return (
                  <button key={g.id} type="button" onClick={() => toggleGroup(g.id)} style={{
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
          )}
        </div>

        {/* Location */}
        <div style={{ marginBottom: '14px' }}>
          <label style={s.label}>Locatie</label>
          <select style={s.select} value={form.locationId || ''} onChange={e => set('locationId', e.target.value)}>
            <option value="">— Geen locatie / later bepalen —</option>
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name} — {loc.city}</option>
            ))}
          </select>
        </div>

        {/* Recurrence */}
        <div style={{ backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b', padding: '14px', marginBottom: '14px' }}>
          <SectionLabel>Herhaling</SectionLabel>

          {/* Frequency */}
          <div style={{ marginBottom: '12px' }}>
            <label style={s.label}>Frequentie</label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {FREQUENCY_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => setRec('frequency', opt.value)} style={{
                  padding: '7px 12px', borderRadius: '8px', fontFamily: 'inherit',
                  border: `1px solid ${form.recurrence.frequency === opt.value ? '#22c55e' : '#334155'}`,
                  backgroundColor: form.recurrence.frequency === opt.value ? '#22c55e22' : 'transparent',
                  color: form.recurrence.frequency === opt.value ? '#22c55e' : '#64748b',
                  fontSize: '12px', fontWeight: form.recurrence.frequency === opt.value ? '700' : '500', cursor: 'pointer',
                }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Days of week (only for weekly/biweekly) */}
          {(form.recurrence.frequency === 'weekly' || form.recurrence.frequency === 'biweekly') && (
            <div style={{ marginBottom: '12px' }}>
              <label style={s.label}>Dag(en) van de week</label>
              <div style={{ display: 'flex', gap: '5px' }}>
                {DAYS_NL.map((day, idx) => {
                  const active = form.recurrence.daysOfWeek.includes(idx);
                  return (
                    <button key={idx} type="button" onClick={() => toggleDay(idx)} style={{
                      flex: 1, padding: '8px 0', borderRadius: '8px', fontFamily: 'inherit',
                      border: `1px solid ${active ? '#22c55e' : '#334155'}`,
                      backgroundColor: active ? '#22c55e22' : 'transparent',
                      color: active ? '#22c55e' : '#64748b',
                      fontSize: '11px', fontWeight: active ? '700' : '400', cursor: 'pointer',
                    }}>
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Start date + End date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <label style={s.label}>Startdatum *</label>
              <input type="date" style={s.input} value={form.recurrence.startDate} onChange={e => setRec('startDate', e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Einddatum (optioneel)</label>
              <input type="date" style={s.input} value={form.recurrence.endDate || ''} onChange={e => setRec('endDate', e.target.value || null)} min={form.recurrence.startDate} />
            </div>
          </div>

          {/* Start time + duration */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={s.label}>Starttijd *</label>
              <input type="time" style={s.input} value={form.recurrence.startTime} onChange={e => setRec('startTime', e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Duur</label>
              <select style={s.select} value={form.recurrence.durationMin} onChange={e => setRec('durationMin', parseInt(e.target.value))}>
                {DURATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Optional color */}
        <div style={{ marginBottom: '16px' }}>
          <label style={s.label}>Kleur (optioneel, overschrijft type-kleur)</label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {['', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a78bfa', '#f97316', '#06b6d4'].map(c => (
              <button key={c || 'none'} type="button" onClick={() => set('color', c)} style={{
                width: c ? '28px' : '52px', height: '28px', borderRadius: '7px',
                backgroundColor: c || '#1e293b',
                border: `2px solid ${form.color === c ? 'white' : 'transparent'}`,
                cursor: 'pointer', flexShrink: 0,
                fontSize: '10px', color: '#64748b', fontFamily: 'inherit',
              }}>
                {!c && 'Geen'}
              </button>
            ))}
          </div>
        </div>

        {error && <ErrorBanner message={error} />}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleSave} disabled={saving} style={{ ...bs.primary, flex: 1, justifyContent: 'center', opacity: saving ? 0.65 : 1 }}>
            <Save size={15} /> {saving ? 'Opslaan…' : isEdit ? 'Wijzigingen opslaan' : 'Reeks aanmaken'}
          </button>
          <button onClick={onClose} style={bs.secondary}><X size={15} /> Annuleren</button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Locaties ────────────────────────────────────────────────────────────
function LocatiesTab({ clubId, uid }) {
  const [locations, setLocations] = useState([]);
  const [formOpen,  setFormOpen]  = useState(false);
  const [editing,   setEditing]   = useState(null);

  useEffect(() => {
    if (!clubId) return;
    const unsub = LocationFactory.getAll(clubId, setLocations);
    return () => unsub();
  }, [clubId]);

  const handleDeactivate = async (loc) => {
    if (!confirm(`Locatie "${loc.name}" verwijderen?`)) return;
    await LocationFactory.deactivate(loc.id);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <div style={{ fontWeight: '800', fontSize: '16px', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MapPin size={18} color="#3b82f6" /> Locaties
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
            {locations.length} actieve locatie{locations.length !== 1 ? 's' : ''}
          </div>
        </div>
        <button onClick={() => { setEditing(null); setFormOpen(true); }} style={bs.primary}>
          <Plus size={15} /> Nieuwe locatie
        </button>
      </div>

      {locations.length === 0 ? (
        <EmptyState
          icon={MapPin}
          text="Nog geen locaties toegevoegd. Voeg de sporthal(len) toe waar jullie trainen."
          action={
            <button onClick={() => { setEditing(null); setFormOpen(true); }} style={bs.primary}>
              <Plus size={14} /> Eerste locatie toevoegen
            </button>
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {locations.map(loc => (
            <div key={loc.id} style={{ backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: '#3b82f622', border: '1px solid #3b82f644', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <MapPin size={17} color="#60a5fa" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: '700', fontSize: '15px', color: '#f1f5f9' }}>{loc.name}</div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    {[loc.address, loc.postalCode, loc.city].filter(Boolean).join(', ')}
                  </div>
                  {(loc.contactName || loc.contactPhone) && (
                    <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>
                      {loc.contactName && `${loc.contactName}`}
                      {loc.contactName && loc.contactPhone && ' · '}
                      {loc.contactPhone}
                    </div>
                  )}
                  {loc.notes && (
                    <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px', fontStyle: 'italic' }}>
                      {loc.notes}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  <button style={s.iconBtn} onClick={() => { setEditing(loc); setFormOpen(true); }}><Edit2 size={15} /></button>
                  <button style={{ ...s.iconBtn, color: '#ef4444' }} onClick={() => handleDeactivate(loc)}><Trash2 size={15} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <LocationFormModal
          location={editing}
          clubId={clubId}
          uid={uid}
          onClose={() => { setFormOpen(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

// ─── Tab: Templates ───────────────────────────────────────────────────────────
function TemplatesTab({ clubId, uid, groups, locations }) {
  const [templates, setTemplates] = useState([]);
  const [formOpen,  setFormOpen]  = useState(false);
  const [editing,   setEditing]   = useState(null);

  useEffect(() => {
    if (!clubId) return;
    const unsub = EventTemplateFactory.getAll(clubId, setTemplates);
    return () => unsub();
  }, [clubId]);

  const handleDeactivate = async (tpl) => {
    if (!confirm(`Training-reeks "${tpl.title}" deactiveren? Toekomstige trainingen worden niet meer gegenereerd.`)) return;
    await EventTemplateFactory.deactivate(clubId, tpl.id);
  };

  const getLocationName = (locationId) => {
    const loc = locations.find(l => l.id === locationId);
    return loc ? loc.name : null;
  };

  const getGroupNames = (groupIds) =>
    groupIds.map(gid => groups.find(g => g.id === gid)?.name || gid).filter(Boolean).join(', ');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <div style={{ fontWeight: '800', fontSize: '16px', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Repeat size={18} color="#22c55e" /> Training-reeksen
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
            {templates.length} actieve reeks{templates.length !== 1 ? 'en' : ''}
          </div>
        </div>
        <button onClick={() => { setEditing(null); setFormOpen(true); }} style={bs.primary}>
          <Plus size={15} /> Nieuwe reeks
        </button>
      </div>

      {templates.length === 0 ? (
        <EmptyState
          icon={Repeat}
          text="Nog geen training-reeksen aangemaakt. Een reeks genereert automatisch de weekelijkse trainingen in de kalender."
          action={
            <button onClick={() => { setEditing(null); setFormOpen(true); }} style={bs.primary}>
              <Plus size={14} /> Eerste reeks aanmaken
            </button>
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {templates.map(tpl => {
            const typeConfig = TYPE_OPTIONS.find(t => t.value === tpl.type) || TYPE_OPTIONS[0];
            const TypeIcon   = typeConfig.icon;
            const color      = tpl.color || typeConfig.color;
            const locName    = getLocationName(tpl.locationId);

            return (
              <div key={tpl.id} style={{ backgroundColor: '#1e293b', borderRadius: '12px', border: `1px solid ${color}33`, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  {/* Color/type indicator */}
                  <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: color + '22', border: `1px solid ${color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <TypeIcon size={17} color={color} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '700', fontSize: '15px', color: '#f1f5f9', marginBottom: '4px' }}>
                      {tpl.title}
                    </div>

                    {/* Recurrence summary */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>
                      <Repeat size={11} color="#64748b" />
                      {recurrenceLabel(tpl.recurrence)}
                      {tpl.recurrence?.startTime && (
                        <span>· {tpl.recurrence.startTime}</span>
                      )}
                      {tpl.recurrence?.durationMin && (
                        <span>· {tpl.recurrence.durationMin}min</span>
                      )}
                    </div>

                    {/* Tags row */}
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                      {/* Groups */}
                      {(tpl.groupIds || []).length > 0 && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: '600', padding: '2px 8px', borderRadius: '5px', backgroundColor: '#3b82f611', color: '#60a5fa', border: '1px solid #3b82f633' }}>
                          <Users size={9} /> {getGroupNames(tpl.groupIds)}
                        </span>
                      )}
                      {/* Location */}
                      {locName && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: '600', padding: '2px 8px', borderRadius: '5px', backgroundColor: '#475569' + '22', color: '#94a3b8', border: '1px solid #47556933' }}>
                          <MapPin size={9} /> {locName}
                        </span>
                      )}
                      {/* Date range */}
                      {tpl.recurrence?.startDate && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#475569', padding: '2px 8px', borderRadius: '5px', backgroundColor: '#1e293b', border: '1px solid #334155' }}>
                          <Calendar size={9} />
                          {tpl.recurrence.startDate}
                          {tpl.recurrence.endDate && ` → ${tpl.recurrence.endDate}`}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <button style={s.iconBtn} onClick={() => { setEditing(tpl); setFormOpen(true); }}><Edit2 size={15} /></button>
                    <button style={{ ...s.iconBtn, color: '#ef4444' }} onClick={() => handleDeactivate(tpl)}><Trash2 size={15} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {formOpen && (
        <TemplateFormModal
          template={editing}
          clubId={clubId}
          uid={uid}
          groups={groups}
          locations={locations}
          onClose={() => { setFormOpen(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

// ─── Tab: Evenementen ─────────────────────────────────────────────────────────
function EventenTab({ clubId, uid, groups, locations }) {
  const [events,    setEvents]    = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [formOpen,  setFormOpen]  = useState(false);
  const [formMode,  setFormMode]  = useState('create');
  const [editing,   setEditing]   = useState(null);
  const [daysAhead, setDaysAhead] = useState(30);

  const TYPE_ICONS = { training: Dumbbell, club_event: Star, competition: Trophy };

  useEffect(() => {
    if (!clubId) return;
    const start = startOfDay(new Date());
    const end   = endOfDay(addDays(new Date(), daysAhead));
    const startTs = { seconds: Math.floor(start.getTime() / 1000) };
    const endTs   = { seconds: Math.floor(end.getTime()   / 1000) };
    setLoading(true);
    const unsub = CalendarEventFactory.getEventsInRange(clubId, startTs, endTs, (docs) => {
      setEvents(docs.sort((a, b) => (a.startAt?.seconds || 0) - (b.startAt?.seconds || 0)));
      setLoading(false);
    });
    return () => unsub();
  }, [clubId, daysAhead]);

  useEffect(() => {
    if (!clubId) return;
    EventTemplateFactory.getAllOnce(clubId).then(setTemplates).catch(console.error);
  }, [clubId]);

  const allEvents = (() => {
    const start = startOfDay(new Date());
    const end   = endOfDay(addDays(new Date(), daysAhead));
    const virtual = generateVirtualEvents(templates, start, end);
    return mergeWithExceptions(virtual, events);
  })();

  const openCancel = (event) => { setEditing(event); setFormMode('cancel'); setFormOpen(true); };
  const openEdit   = (event) => { if (event._virtual) return; setEditing(event); setFormMode('edit'); setFormOpen(true); };

  const handleFormClose = () => {
    setFormOpen(false); setEditing(null);
    EventTemplateFactory.getAllOnce(clubId).then(setTemplates).catch(console.error);
  };

  const getGroupNames = (groupIds) =>
    (groupIds || []).map(gid => groups.find(g => g.id === gid)?.name).filter(Boolean).join(', ');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <div style={{ fontWeight: '800', fontSize: '16px', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={18} color="#3b82f6" /> Evenementen
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
            Komende {daysAhead} dagen · {allEvents.length} events
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select value={daysAhead} onChange={e => setDaysAhead(parseInt(e.target.value))} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#94a3b8', fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer' }}>
            <option value={7}>7 dagen</option>
            <option value={14}>14 dagen</option>
            <option value={30}>30 dagen</option>
            <option value={60}>60 dagen</option>
          </select>
          <button onClick={() => { setEditing(null); setFormMode('create'); setFormOpen(true); }} style={bs.primary}>
            <Plus size={15} /> Nieuw event
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <div style={{ width: '28px', height: '28px', border: '3px solid #1e293b', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : allEvents.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '50px 20px', textAlign: 'center' }}>
          <Calendar size={40} color="#334155" style={{ marginBottom: '12px', opacity: 0.5 }} />
          <p style={{ color: '#475569', fontSize: '14px', margin: '0 0 16px' }}>Geen events de komende {daysAhead} dagen.</p>
          <button onClick={() => { setEditing(null); setFormMode('create'); setFormOpen(true); }} style={bs.primary}>
            <Plus size={14} /> Eerste event aanmaken
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {allEvents.map(event => {
            const color = getEventColor(event);
            const TypeIcon = TYPE_ICONS[event.type] || Calendar;
            const isCancelled = event.status === 'cancelled';
            const startMs = (event.startAt?.seconds || 0) * 1000;
            const d = new Date(startMs);
            const dateStr = d.toLocaleDateString('nl-BE', { weekday: 'short', day: '2-digit', month: 'short' });
            const timeStr = d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
            const loc = event.locationId ? locations.find(l => l.id === event.locationId) : null;

            return (
              <div key={event.id} style={{ backgroundColor: '#1e293b', borderRadius: '12px', border: `1px solid ${isCancelled ? '#ef444433' : color + '33'}`, borderLeft: `3px solid ${isCancelled ? '#ef4444' : color}`, padding: '12px 14px', opacity: isCancelled ? 0.7 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '8px', backgroundColor: color + '22', border: `1px solid ${color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <TypeIcon size={15} color={color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '3px' }}>
                      <span style={{ fontWeight: '700', fontSize: '14px', color: isCancelled ? '#475569' : '#f1f5f9', textDecoration: isCancelled ? 'line-through' : 'none' }}>{event.title}</span>
                      {isCancelled && <span style={{ fontSize: '9px', fontWeight: '800', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#ef444422', color: '#ef4444', border: '1px solid #ef444433' }}>GEANNULEERD</span>}
                      {event.isSpecial && <span style={{ fontSize: '9px', fontWeight: '800', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#22c55e22', color: '#22c55e', border: '1px solid #22c55e44' }}>{event.specialLabel || 'Speciaal'}</span>}
                      {event._virtual && <span style={{ fontSize: '9px', fontWeight: '600', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#334155', color: '#64748b' }}>Recurring</span>}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span>{dateStr} · {timeStr}</span>
                      {loc && <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><MapPin size={10} /> {loc.name}</span>}
                      {event.groupIds?.length > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Users size={10} /> {getGroupNames(event.groupIds)}</span>}
                    </div>
                    {isCancelled && event.cancelReason && <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px', fontStyle: 'italic' }}>{event.cancelReason}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    {!event._virtual && !isCancelled && (
                      <button onClick={() => openEdit(event)} style={s.iconBtn} title="Bewerken"><Edit2 size={14} /></button>
                    )}
                    {!isCancelled && (
                      <button onClick={() => openCancel(event)} style={{ ...s.iconBtn, color: '#ef4444' }} title="Annuleren"><Trash2 size={14} /></button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {formOpen && (
        <EventFormModal
          event={editing}
          clubId={clubId}
          uid={uid}
          groups={groups}
          locations={locations}
          mode={formMode}
          onClose={handleFormClose}
        />
      )}
    </div>
  );
}

// ─── Placeholder tabs ─────────────────────────────────────────────────────────
function PlaceholderTab({ icon: Icon, color, title, description }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', textAlign: 'center' }}>
      <div style={{ width: '72px', height: '72px', borderRadius: '20px', backgroundColor: color + '22', border: `1px solid ${color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
        <Icon size={32} color={color} />
      </div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '20px', backgroundColor: '#334155', color: '#64748b', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px' }}>
        <Clock size={11} /> Binnenkort
      </div>
      <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#f1f5f9', margin: '0 0 8px' }}>{title}</h3>
      <p style={{ fontSize: '14px', color: '#64748b', maxWidth: '360px', lineHeight: 1.6, margin: 0 }}>{description}</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function CalendarAdminPage() {
  const { uid, loading: authLoading } = useAuth();

  const [currentUser,   setCurrentUser]   = useState(null);
  const [isSuperAdmin,  setIsSuperAdmin]  = useState(false);
  const [isClubAdmin,   setIsClubAdmin]   = useState(false);
  const [isCoach,       setIsCoach]       = useState(false);
  const [bootstrapDone, setBootstrapDone] = useState(false);
  const [hasAccess,     setHasAccess]     = useState(false);

  const [adminClubs,   setAdminClubs]   = useState([]);
  const [activeClub,   setActiveClub]   = useState(null);
  const [groups,       setGroups]       = useState([]);
  const [locations,    setLocations]    = useState([]);

  const [activeTab, setActiveTab] = useState('templates');

  // ── Bootstrap: resolve access + clubs ─────────────────────────────────────
  useEffect(() => {
    if (authLoading || !uid) return;
    let cancelled = false;

    const run = async () => {
      const snap = await UserFactory.get(uid);
      if (!snap.exists() || cancelled) { setBootstrapDone(true); return; }
      const user = { id: uid, ...snap.data() };
      setCurrentUser(user);
      const role = user.role || 'user';

      if (role === 'superadmin') {
        setIsSuperAdmin(true);
        const unsub = ClubFactory.getAll(clubs => {
          if (cancelled) return;
          setAdminClubs(clubs);
          if (clubs.length === 1) setActiveClub(clubs[0]);
          setHasAccess(true);
          setBootstrapDone(true);
        });
        return () => unsub();
      }

      if (role === 'clubadmin') {
        setIsClubAdmin(true);
        const unsubLinks = UserMemberLinkFactory.getForUser(uid, async (profiles) => {
          if (cancelled) return;
          const clubIdSet = new Set(profiles.map(p => p.member.clubId));
          const snaps = await Promise.all([...clubIdSet].map(id => ClubFactory.getById(id)));
          const clubs = snaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() }));
          setAdminClubs(clubs);
          if (clubs.length === 1) setActiveClub(clubs[0]);
          setHasAccess(true);
          setBootstrapDone(true);
        });
        return () => unsubLinks();
      }

      // Regular user — check if coach in any group
      const unsubLinks = UserMemberLinkFactory.getForUser(uid, async (profiles) => {
        if (cancelled) return;
        if (profiles.length === 0) { setBootstrapDone(true); return; }

        const memberIdByClub = {};
        profiles.forEach(p => { memberIdByClub[p.member.clubId] = p.member.id; });

        const clubIdSet = new Set(profiles.map(p => p.member.clubId));
        const snaps = await Promise.all([...clubIdSet].map(id => ClubFactory.getById(id)));
        const allClubs = snaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() }));

        const coachClubs = [];
        for (const club of allClubs) {
          const memberId = memberIdByClub[club.id];
          if (!memberId) continue;
          const allGroups = await GroupFactory.getGroupsByClubOnce(club.id);
          for (const group of allGroups) {
            const members = await GroupFactory.getMembersByGroupOnce(club.id, group.id);
            const me = members.find(m => (m.memberId || m.id) === memberId);
            if (me?.isCoach) { coachClubs.push(club); break; }
          }
        }
        if (!cancelled && coachClubs.length > 0) {
          setIsCoach(true);
          setAdminClubs(coachClubs);
          if (coachClubs.length === 1) setActiveClub(coachClubs[0]);
          setHasAccess(true);
        }
        setBootstrapDone(true);
      });
      return () => unsubLinks();
    };

    run();
  }, [uid, authLoading]);

  // ── Load groups + locations when activeClub changes ───────────────────────
  useEffect(() => {
    if (!activeClub) return;
    let cancelled = false;

    const u1 = GroupFactory.getGroupsByClub(activeClub.id, data => {
      if (!cancelled) setGroups(data);
    });
    const u2 = LocationFactory.getAll(activeClub.id, data => {
      if (!cancelled) setLocations(data);
    });

    return () => { cancelled = true; u1(); u2(); };
  }, [activeClub]);

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (authLoading || !bootstrapDone) return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{pageCSS}</style>
      <div style={s.spinner} />
    </div>
  );

  if (!hasAccess) return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', fontFamily: 'system-ui, sans-serif' }}>
      <Calendar size={40} color="#334155" />
      <p style={{ color: '#ef4444', fontSize: '16px', fontWeight: '700' }}>Geen toegang</p>
      <p style={{ color: '#64748b', fontSize: '13px', textAlign: 'center', maxWidth: '300px' }}>
        Alleen clubbeheerders en coaches hebben toegang tot het kalenderbeheer.
      </p>
      <a href="/" style={{ padding: '10px 20px', backgroundColor: '#3b82f6', color: 'white', borderRadius: '8px', textDecoration: 'none', fontWeight: '600', fontSize: '14px' }}>Terug naar home</a>
    </div>
  );

  // No club selected yet (superadmin with multiple clubs)
  if (!activeClub) return (
    <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{pageCSS}</style>
      <div style={{ maxWidth: '440px', width: '100%', padding: '24px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <Calendar size={22} color="#22c55e" />
          <span style={{ fontWeight: '800', fontSize: '18px', color: '#f1f5f9' }}>Kalenderbeheer</span>
        </div>
        <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '16px' }}>Kies de club die je wil beheren.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {adminClubs.map(club => (
            <button key={club.id} onClick={() => setActiveClub(club)}
              style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '14px', color: 'white', cursor: 'pointer', textAlign: 'left' }}>
              <Building2 size={20} color="#22c55e" style={{ flexShrink: 0 }} />
              <span style={{ fontWeight: '600', fontSize: '15px', flex: 1 }}>{club.name}</span>
              <ChevronRight size={16} color="#475569" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Tabs definition ────────────────────────────────────────────────────────
  const canManageAdmin = isSuperAdmin || isClubAdmin;

  const TABS = [
    { key: 'templates',  label: 'Trainingsreeksen', icon: Repeat   },
    ...(canManageAdmin ? [{ key: 'locaties', label: 'Locaties', icon: MapPin }] : []),
    { key: 'events',     label: 'Eenmalige events', icon: Calendar },
    { key: 'rapporten',  label: 'Rapporten',         icon: BarChart2 },
  ];

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <style>{pageCSS}</style>

      {/* Header */}
      <header style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <a href="/agenda" style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#64748b', textDecoration: 'none', fontSize: '13px', fontWeight: '600' }}>
            <ArrowLeft size={15} /> Kalender
          </a>
          <span style={{ color: '#334155' }}>/</span>
          <Calendar size={20} color="#22c55e" />
          <span style={s.headerTitle}>Kalenderbeheer</span>

          {/* Club picker (superadmin with multiple clubs) */}
          {adminClubs.length > 1 && (
            <select
              value={activeClub.id}
              onChange={e => {
                const club = adminClubs.find(c => c.id === e.target.value);
                if (club) setActiveClub(club);
              }}
              style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#f1f5f9', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
            >
              {adminClubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}

          {adminClubs.length === 1 && (
            <span style={{ fontSize: '13px', color: '#64748b' }}>{activeClub.name}</span>
          )}
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', marginTop: '6px', borderBottom: '1px solid #334155' }}>
          {TABS.map(tab => {
            const Icon     = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '10px 14px', background: 'none', border: 'none',
                borderBottom: `2px solid ${isActive ? '#22c55e' : 'transparent'}`,
                cursor: 'pointer', fontSize: '13px',
                fontWeight: isActive ? '700' : '500',
                color: isActive ? '#22c55e' : '#64748b',
                fontFamily: 'inherit', whiteSpace: 'nowrap',
                transition: 'color 0.15s, border-color 0.15s',
              }}>
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Content */}
      <main style={s.content}>
        {activeTab === 'templates' && (
          <TemplatesTab
            clubId={activeClub.id}
            uid={uid}
            groups={groups}
            locations={locations}
          />
        )}
        {activeTab === 'locaties' && canManageAdmin && (
          <LocatiesTab
            clubId={activeClub.id}
            uid={uid}
          />
        )}
        {activeTab === 'events' && (
          <EventenTab
            clubId={activeClub.id}
            uid={uid}
            groups={groups}
            locations={locations}
          />
        )}
        {activeTab === 'rapporten' && (
          <AttendanceReport
            clubId={activeClub.id}
            groups={groups}
          />
        )}
      </main>
    </div>
  );
}

// ─── Button styles ────────────────────────────────────────────────────────────
const bs = {
  primary:   { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', backgroundColor: '#22c55e', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' },
  secondary: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '8px', color: '#94a3b8', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' },
};

// ─── Page CSS ─────────────────────────────────────────────────────────────────
const pageCSS = `
  * { box-sizing: border-box; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  select option { background-color: #1e293b; }
`;

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  page:        { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'system-ui, sans-serif' },
  spinner:     { width: '36px', height: '36px', border: '3px solid #1e293b', borderTop: '3px solid #22c55e', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  header:      { backgroundColor: '#1e293b', borderBottom: '1px solid #334155', padding: '12px 16px', position: 'sticky', top: 0, zIndex: 100, display: 'flex', flexDirection: 'column', gap: '4px' },
  headerTitle: { fontWeight: '800', fontSize: '16px', color: '#f1f5f9' },
  content:     { padding: '24px 16px', maxWidth: '900px', margin: '0 auto' },
  overlay:     { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 500 },
  modal:       { backgroundColor: '#1e293b', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '580px', border: '1px solid #334155', maxHeight: '90vh', overflowY: 'auto' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', color: '#f1f5f9' },
  iconBtn:     { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' },
  label:       { display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '5px' },
  input:       { width: '100%', padding: '11px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box' },
  select:      { width: '100%', padding: '11px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px', fontFamily: 'inherit' },
};
