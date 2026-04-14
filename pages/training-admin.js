/**
 * pages/training-admin.js
 *
 * Trainingbeheer — toegankelijk voor coaches, clubadmin en superadmin.
 *
 * Tabs:
 *   1. Trainingen   — overzicht van ingeplande trainingen (kalender-items van type 'training')
 *   2. Voorbereiding — prep library (verplaatst van calendar-admin)
 *   3. Schema's      — trainingsschema's richting wedstrijden (verplaatst van calendar-admin)
 *   4. Rapporten     — aanwezigheidsrapporten (verplaatst van calendar-admin)
 *
 * Rules:
 *   - All DB via factories (CLAUDE.md §1)
 *   - No <form> elements (CLAUDE.md §4)
 *   - Inline CSS only (CLAUDE.md §9)
 *   - Dutch UI (CLAUDE.md §9)
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import {
  UserFactory, ClubFactory, GroupFactory,
  UserMemberLinkFactory,
  EventTemplateFactory, CalendarEventFactory, LocationFactory,
  TrainingPrepFactory, TrainingPlanFactory,
} from '../constants/dbSchema';
import { useAuth } from '../contexts/AuthContext';
import {
  generateVirtualEvents, mergeWithExceptions, filterEventsForMember,
  getEventColor, formatDuration, durationFromEvent,
  startOfDay, endOfDay, addDays,
} from '../utils/calendarUtils';
import AttendanceReport    from '../components/calendar/AttendanceReport';
import TrainingPrepEditor  from '../components/calendar/TrainingPrepEditor';
import TrainingPrepViewer  from '../components/calendar/TrainingPrepViewer';
import TrainingPlanEditor  from '../components/calendar/TrainingPlanEditor';
import EventDetailSheet    from '../components/calendar/EventDetailSheet';
import {
  Dumbbell, Zap, Target, BarChart2,
  Plus, Edit2, Trash2, X, Save, Clock,
  ChevronRight, ArrowLeft, Building2,
  Filter, CheckCircle2, AlertCircle, Users,
  MapPin, Sparkles, ChevronDown, ChevronUp,
} from 'lucide-react';

// ─── Shared styles ────────────────────────────────────────────────────────────
const bs = {
  primary:   { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', backgroundColor: '#22c55e', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' },
  secondary: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '8px', color: '#94a3b8', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' },
};

const s = {
  page:        { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'system-ui, sans-serif' },
  spinner:     { width: '36px', height: '36px', border: '3px solid #1e293b', borderTop: '3px solid #22c55e', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  header:      { backgroundColor: '#1e293b', borderBottom: '1px solid #334155', padding: '12px 16px', position: 'sticky', top: 0, zIndex: 100, display: 'flex', flexDirection: 'column', gap: '4px' },
  headerTitle: { fontWeight: '800', fontSize: '16px', color: '#f1f5f9' },
  content:     { padding: '20px 16px', maxWidth: '900px', margin: '0 auto' },
  iconBtn:     { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' },
  label:       { display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '5px' },
  input:       { width: '100%', padding: '11px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box' },
};

const pageCSS = `
  * { box-sizing: border-box; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  select option { background-color: #1e293b; }
`;



// ─── Tab: Trainingen ──────────────────────────────────────────────────────────
function TrainingenTab({ clubId, uid, memberId, groups = [], locations = [], isCoachOnly, memberGroupIds = [] }) {
  const [events,       setEvents]       = useState([]);
  const [templates,    setTemplates]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [daysAhead,    setDaysAhead]    = useState(30);
  const [groupFilter,  setGroupFilter]  = useState('');
  const [showFilter,   setShowFilter]   = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [locationMap,   setLocationMap]   = useState({});
  const [activeMemberId, setActiveMemberId] = useState(null);
  const unsubRef = useRef(null);

  // Laad templates eenmalig
  useEffect(() => {
    if (!clubId) return;
    EventTemplateFactory.getAllOnce(clubId).then(setTemplates).catch(console.error);
  }, [clubId]);

  useEffect(() => {
    const map = {};
    locations.forEach(l => { map[l.id] = l; });
    setLocationMap(map);
  }, [locations]);
  
  // Subscribe to real events in range
  useEffect(() => {
    if (!clubId) return;
    const start   = startOfDay(new Date());
    const end     = endOfDay(addDays(new Date(), daysAhead));
    const startTs = { seconds: Math.floor(start.getTime() / 1000) };
    const endTs   = { seconds: Math.floor(end.getTime()   / 1000) };

    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
    setLoading(true);

    const unsub = CalendarEventFactory.getEventsInRange(clubId, startTs, endTs, (docs) => {
      setEvents(docs);
      setLoading(false);
    });
    unsubRef.current = unsub;
    return () => { if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; } };
  }, [clubId, daysAhead]);

  // Merge + filter to training type only
  const visibleTrainings = (() => {
    const start = startOfDay(new Date());
    const end   = endOfDay(addDays(new Date(), daysAhead));
    const virtual = generateVirtualEvents(templates, start, end);
    const merged  = mergeWithExceptions(virtual, events);

    // Filter op type training
    let trainings = merged.filter(e => e.type === 'training');

    // Coaches zien alleen hun groepen (tenzij admin)
    if (isCoachOnly) {
      const baseGroupIds = groupFilter ? [groupFilter] : memberGroupIds;
      trainings = filterEventsForMember(trainings, baseGroupIds);
    } else if (groupFilter) {
      trainings = filterEventsForMember(trainings, [groupFilter]);
    }

    return trainings;
  })();

  // Groepen relevant voor de filter
  const filterableGroups = isCoachOnly
    ? groups.filter(g => memberGroupIds.includes(g.id))
    : groups;

  const getLocName = (id) => locations.find(l => l.id === id)?.name || null;
  const getGroupNames = (gids) =>
    (gids || []).map(gid => groups.find(g => g.id === gid)?.name).filter(Boolean).join(', ');

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: '800', fontSize: '15px', color: '#f1f5f9' }}>Ingeplande trainingen</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
            {visibleTrainings.length} training{visibleTrainings.length !== 1 ? 'en' : ''} · komende {daysAhead} dagen
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {filterableGroups.length > 1 && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowFilter(p => !p)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 11px',
                  borderRadius: '8px', fontFamily: 'inherit',
                  border: `1px solid ${groupFilter ? '#3b82f6' : '#334155'}`,
                  backgroundColor: groupFilter ? '#3b82f622' : 'transparent',
                  color: groupFilter ? '#60a5fa' : '#64748b',
                  fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                }}
              >
                <Filter size={12} />
                {groupFilter ? (groups.find(g => g.id === groupFilter)?.name || 'Groep') : 'Alle groepen'}
              </button>
              {showFilter && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '6px', zIndex: 50, minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <button
                    onClick={() => { setGroupFilter(''); setShowFilter(false); }}
                    style={{ textAlign: 'left', padding: '7px 10px', borderRadius: '7px', background: !groupFilter ? '#3b82f622' : 'none', border: 'none', color: !groupFilter ? '#60a5fa' : '#94a3b8', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: !groupFilter ? '700' : '500' }}
                  >
                    Alle groepen
                  </button>
                  {filterableGroups.map(g => (
                    <button
                      key={g.id}
                      onClick={() => { setGroupFilter(g.id); setShowFilter(false); }}
                      style={{ textAlign: 'left', padding: '7px 10px', borderRadius: '7px', background: groupFilter === g.id ? '#3b82f622' : 'none', border: 'none', color: groupFilter === g.id ? '#60a5fa' : '#94a3b8', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: groupFilter === g.id ? '700' : '500' }}
                    >
                      {g.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <select
            value={daysAhead}
            onChange={e => setDaysAhead(parseInt(e.target.value))}
            style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#94a3b8', fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer' }}
          >
            <option value={7}>7 dagen</option>
            <option value={14}>14 dagen</option>
            <option value={30}>30 dagen</option>
            <option value={60}>60 dagen</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '50px' }}>
          <div style={s.spinner} />
        </div>
      ) : visibleTrainings.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', textAlign: 'center' }}>
          <Dumbbell size={40} color="#334155" style={{ marginBottom: '12px', opacity: 0.5 }} />
          <p style={{ color: '#475569', fontSize: '14px', margin: 0 }}>Geen trainingen gepland de komende {daysAhead} dagen.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {visibleTrainings.map(event => {
            const color       = getEventColor(event);
            const isCancelled = event.status === 'cancelled';
            const startMs     = (event.startAt?.seconds || 0) * 1000;
            const d           = new Date(startMs);
            const dateStr     = d.toLocaleDateString('nl-BE', { weekday: 'short', day: '2-digit', month: 'short' });
            const timeStr     = d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
            const duration    = durationFromEvent(event);
            const loc         = event.locationId ? getLocName(event.locationId) : null;
            const hasPrepIds  = (event.prepIds?.length > 0) || !!event.prepId;

            return (
              <div
                key={event.id}
                onClick={() => setSelectedEvent(event)}
                style={{
                  backgroundColor: '#1e293b',
                  borderRadius: '12px',
                  border: `1px solid ${isCancelled ? '#ef444433' : color + '33'}`,
                  borderLeft: `3px solid ${isCancelled ? '#ef4444' : color}`,
                  padding: '12px 14px',
                  opacity: isCancelled ? 0.65 : 1,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  {/* Date block */}
                  <div style={{ flexShrink: 0, textAlign: 'center', minWidth: '38px' }}>
                    <div style={{ fontSize: '18px', fontWeight: '900', color: isCancelled ? '#475569' : '#f1f5f9', lineHeight: 1 }}>
                      {d.getDate()}
                    </div>
                    <div style={{ fontSize: '10px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                      {d.toLocaleDateString('nl-BE', { month: 'short' })}
                    </div>
                  </div>

                  <div style={{ width: '1px', backgroundColor: '#334155', alignSelf: 'stretch', flexShrink: 0 }} />

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                      <span style={{ fontWeight: '700', fontSize: '14px', color: isCancelled ? '#475569' : '#f1f5f9', textDecoration: isCancelled ? 'line-through' : 'none' }}>
                        {event.title}
                      </span>
                      {isCancelled && (
                        <span style={{ fontSize: '9px', fontWeight: '800', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#ef444422', color: '#ef4444', border: '1px solid #ef444433' }}>
                          GEANNULEERD
                        </span>
                      )}
                      {event.isSpecial && event.specialLabel && (
                        <span style={{ fontSize: '9px', fontWeight: '800', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#22c55e22', color: '#22c55e', border: '1px solid #22c55e44' }}>
                          {event.specialLabel}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', fontSize: '12px', color: '#64748b' }}>
                      <span>{dateStr} · {timeStr}{duration ? ` · ${formatDuration(duration)}` : ''}</span>
                      {loc && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <MapPin size={10} /> {loc}
                        </span>
                      )}
                      {event.groupIds?.length > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <Users size={10} /> {getGroupNames(event.groupIds)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Prep indicator */}
                  {hasPrepIds ? (
                    <div title="Voorbereiding gekoppeld" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '6px', backgroundColor: '#a78bfa22', border: '1px solid #a78bfa33', fontSize: '10px', fontWeight: '700', color: '#a78bfa' }}>
                      <Zap size={10} /> prep
                    </div>
                  ) : (
                    <div title="Geen voorbereiding" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '6px', backgroundColor: '#33415522', border: '1px solid #33415544', fontSize: '10px', color: '#475569' }}>
                      <Zap size={10} /> —
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedEvent && (         
        <EventDetailSheet
          event={selectedEvent}
          location={selectedEvent.locationId ? locationMap[selectedEvent.locationId] : null}
          memberContext={{ clubId, uid, memberId: memberId || null }}
          coachView={true}
          groups={groups}
          locations={locations}
          onClose={() => setSelectedEvent(null)}
          onEventChanged={() => {
            EventTemplateFactory.getAllOnce(clubId).then(setTemplates).catch(console.error);
            setSelectedEvent(null);
          }}
        />
      )}

    </div>
  );
}

// ─── Tab: Prep Library ────────────────────────────────────────────────────────
function PrepLibraryTab({ clubId, uid, disciplines = [] }) {
  const [preps,      setPreps]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing,    setEditing]    = useState(null);
  const [viewing,    setViewing]    = useState(null);

  useEffect(() => {
    if (!clubId) return;
    const unsub = TrainingPrepFactory.getAll(clubId, (data) => {
      setPreps(data);
      setLoading(false);
    });
    return () => unsub();
  }, [clubId]);

  const handleDelete = async (prep) => {
    if (!confirm(`Voorbereiding "${prep.title}" verwijderen?`)) return;
    await TrainingPrepFactory.delete(clubId, prep.id);
  };

  const FOCUS_LABELS = { speed: 'Snelheid', endurance: 'Uithoudingsvermogen', technique: 'Techniek', freestyle: 'Freestyle', fun: 'Plezier', skills: 'Skills' };
  const LEVEL_COLORS = { beginner: '#22c55e', intermediate: '#f59e0b', advanced: '#ef4444', recreatief: '#a78bfa' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <div style={{ fontWeight: '800', fontSize: '15px', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={16} color="#a78bfa" /> Trainingsvoorbereiding
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
            {preps.length} voorbereiding{preps.length !== 1 ? 'en' : ''} in de bibliotheek
          </div>
        </div>
        <button onClick={() => { setEditing(null); setEditorOpen(true); }} style={bs.primary}>
          <Plus size={15} /> Nieuwe voorbereiding
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '50px' }}>
          <div style={s.spinner} />
        </div>
      ) : preps.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', textAlign: 'center' }}>
          <Zap size={40} color="#334155" style={{ marginBottom: '12px', opacity: 0.5 }} />
          <p style={{ color: '#475569', fontSize: '14px', margin: '0 0 16px' }}>
            Nog geen trainingsvoorbereidingen. Maak er een aan, manueel of met AI.
          </p>
          <button onClick={() => { setEditing(null); setEditorOpen(true); }} style={bs.primary}>
            <Plus size={14} /> Eerste voorbereiding aanmaken
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {preps.map(prep => {
            const levelColor = LEVEL_COLORS[prep.level] || '#64748b';
            const totalMin   = (prep.blocks || []).reduce((s, b) => s + (b.durationMin || 0), 0);
            return (
              <div key={prep.id} style={{ backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '5px' }}>
                      <span style={{ fontWeight: '700', fontSize: '14px', color: '#f1f5f9' }}>{prep.title}</span>
                      {prep.generatedByAI && (
                        <span style={{ fontSize: '9px', fontWeight: '700', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#a78bfa22', color: '#a78bfa', border: '1px solid #a78bfa33' }}>✨ AI</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: '10px', fontWeight: '700', padding: '1px 6px', borderRadius: '5px', backgroundColor: levelColor + '22', color: levelColor, border: `1px solid ${levelColor}33` }}>
                        {prep.level}
                      </span>
                      <span style={{ fontSize: '10px', color: '#475569', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Clock size={9} /> {totalMin} min
                      </span>
                      {(prep.focus || []).map(f => (
                        <span key={f} style={{ fontSize: '10px', color: '#64748b', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#334155' }}>
                          {FOCUS_LABELS[f] || f}
                        </span>
                      ))}
                      {prep.usedInEventIds?.length > 0 && (
                        <span style={{ fontSize: '10px', color: '#475569' }}>· {prep.usedInEventIds.length}× gebruikt</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <button onClick={() => setViewing(prep)} style={{ ...s.iconBtn, color: '#60a5fa' }} title="Bekijken"><Zap size={14} /></button>
                    <button onClick={() => { setEditing(prep); setEditorOpen(true); }} style={s.iconBtn} title="Bewerken"><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(prep)} style={{ ...s.iconBtn, color: '#ef4444' }} title="Verwijderen"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editorOpen && (
        <TrainingPrepEditor
          prep={editing}
          clubId={clubId}
          coachMemberId={null}
          coachUid={uid}
          disciplines={disciplines}
          onSaved={() => setEditorOpen(false)}
          onClose={() => setEditorOpen(false)}
        />
      )}

      {viewing && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 500 }}>
          <div style={{ backgroundColor: '#1e293b', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '600px', border: '1px solid #334155', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontWeight: '800', fontSize: '16px', color: '#f1f5f9' }}>{viewing.title}</span>
              <button onClick={() => setViewing(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}><X size={18} /></button>
            </div>
            <TrainingPrepViewer prep={viewing} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Schema's ────────────────────────────────────────────────────────────
function PlanLibraryTab({ clubId, uid, groups = [], templates = [], disciplines = [] }) {
  const [plans,       setPlans]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [editorOpen,  setEditorOpen]  = useState(false);
  const [viewingPlan, setViewingPlan] = useState(null);

  useEffect(() => {
    if (!clubId) return;
    const unsub = TrainingPlanFactory.getAll(clubId, (data) => {
      setPlans(data);
      setLoading(false);
    });
    return () => unsub();
  }, [clubId]);

  const handleDelete = async (plan) => {
    if (!confirm(`Schema "${plan.competitionName || 'Schema'}" verwijderen?`)) return;
    await TrainingPlanFactory.delete(clubId, plan.id);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <div style={{ fontWeight: '800', fontSize: '15px', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Target size={16} color="#f97316" /> Trainingsschema's
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
            {plans.length} schema{plans.length !== 1 ? "'s" : ''} richting wedstrijden
          </div>
        </div>
        <button onClick={() => setEditorOpen(true)} style={bs.primary}>
          <Plus size={15} /> Nieuw schema
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '50px' }}>
          <div style={{ ...s.spinner, borderTopColor: '#f97316' }} />
        </div>
      ) : plans.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', textAlign: 'center' }}>
          <Target size={40} color="#334155" style={{ marginBottom: '12px', opacity: 0.5 }} />
          <p style={{ color: '#475569', fontSize: '14px', margin: '0 0 16px' }}>
            Nog geen trainingsschema's. Genereer er een richting een wedstrijd.
          </p>
          <button onClick={() => setEditorOpen(true)} style={bs.primary}>
            <Plus size={14} /> Schema genereren
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {plans.map(plan => {
            const trainingCount = (plan.trainings || []).length;
            const prepCount     = (plan.trainings || []).filter(t => (t.prepIds || []).length > 0).length;
            const compDate      = plan.competitionDate
              ? new Date(plan.competitionDate + 'T12:00:00').toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' })
              : '—';
            const group    = groups.find(g => g.id === plan.groupId);
            const daysLeft = plan.competitionDate
              ? Math.ceil((new Date(plan.competitionDate + 'T12:00:00') - new Date()) / (1000 * 60 * 60 * 24))
              : null;
            const progress = trainingCount > 0 ? prepCount / trainingCount : 0;

            return (
              <div key={plan.id} style={{ backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #f9731622', overflow: 'hidden', position: 'relative' }}>
                {/* Progress bar background */}
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${progress * 100}%`, backgroundColor: '#a78bfa08', transition: 'width 0.4s' }} />
                <div style={{ position: 'relative', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '9px', backgroundColor: '#f9731622', border: '1px solid #f9731644', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Target size={16} color="#f97316" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: '700', fontSize: '14px', color: '#f1f5f9', marginBottom: '3px' }}>
                        {plan.competitionName || 'Wedstrijdschema'}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '11px', color: '#64748b' }}>
                        <span>📅 {compDate}</span>
                        {daysLeft !== null && daysLeft > 0 && (
                          <span style={{ color: daysLeft < 14 ? '#f59e0b' : '#64748b' }}>nog {daysLeft}d</span>
                        )}
                        {group && <span>👥 {group.name}</span>}
                        <span>🏋️ {trainingCount} trainingen</span>
                        <span style={{ color: prepCount > 0 ? '#a78bfa' : '#475569' }}>
                          ✨ {prepCount}/{trainingCount} met prep
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                      <button onClick={() => setViewingPlan(plan)} style={{ ...s.iconBtn, color: '#f97316' }} title="Bekijken">
                        <ChevronRight size={15} />
                      </button>
                      <button onClick={() => handleDelete(plan)} style={{ ...s.iconBtn, color: '#ef4444' }} title="Verwijderen">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editorOpen && (
        <TrainingPlanEditor
          plan={null}
          clubId={clubId}
          uid={uid}
          groups={groups}
          templates={templates}
          disciplines={disciplines}
          onSaved={() => setEditorOpen(false)}
          onClose={() => setEditorOpen(false)}
        />
      )}

      {viewingPlan && (
        <TrainingPlanEditor
          plan={viewingPlan}
          clubId={clubId}
          uid={uid}
          groups={groups}
          templates={templates}
          disciplines={disciplines}
          onSaved={() => {}}
          onClose={() => setViewingPlan(null)}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function TrainingBeheerPage() {
  const { uid, loading: authLoading } = useAuth();

  const [bootstrapDone,  setBootstrapDone]  = useState(false);
  const [hasAccess,      setHasAccess]      = useState(false);
  const [isSuperAdmin,   setIsSuperAdmin]   = useState(false);
  const [isClubAdmin,    setIsClubAdmin]    = useState(false);
  const [isCoach,        setIsCoach]        = useState(false);
  // isCoachOnly = true als de user coach is maar geen admin
  const [isCoachOnly,    setIsCoachOnly]    = useState(false);
  const [memberGroupIds, setMemberGroupIds] = useState([]);

  const [adminClubs,  setAdminClubs]  = useState([]);
  const [activeClub,  setActiveClub]  = useState(null);
  const [groups,      setGroups]      = useState([]);
  const [locations,   setLocations]   = useState([]);
  const [templates,   setTemplates]   = useState([]);

  const [activeTab, setActiveTab] = useState('trainingen');
  const [activeMemberId, setActiveMemberId] = useState(null);

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading || !uid) return;
    let cancelled = false;

    const run = async () => {
      const snap = await UserFactory.get(uid);
      if (!snap.exists() || cancelled) { setBootstrapDone(true); return; }
      const user = { id: uid, ...snap.data() };
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

      // Regular user — check coach role
      const unsubLinks = UserMemberLinkFactory.getForUser(uid, async (profiles) => {
        if (cancelled) return;
        if (profiles.length === 0) { setBootstrapDone(true); return; }

        const memberIdByClub = {};
        profiles.forEach(p => { memberIdByClub[p.member.clubId] = p.member.id; });

        const clubIdSet = new Set(profiles.map(p => p.member.clubId));
        const snaps = await Promise.all([...clubIdSet].map(id => ClubFactory.getById(id)));
        const allClubs = snaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() }));

        const coachClubs  = [];
        const allGroupIds = [];

        for (const club of allClubs) {
          const memberId  = memberIdByClub[club.id];
          if (!memberId) continue;
          const allGroups = await GroupFactory.getGroupsByClubOnce(club.id);
          let isCoachHere = false;
          for (const group of allGroups) {
            const members = await GroupFactory.getMembersByGroupOnce(club.id, group.id);
            const me = members.find(m => (m.memberId || m.id) === memberId);
            if (me) {
              allGroupIds.push(group.id);
              if (me.isCoach) isCoachHere = true;
            }
          }
          if (isCoachHere) {
            coachClubs.push(club);
            if (!activeMemberId) setActiveMemberId(memberId);   // ← nieuw
          }
        }

        if (!cancelled && coachClubs.length > 0) {
          setIsCoach(true);
          setIsCoachOnly(true);
          setMemberGroupIds(allGroupIds);
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

  // ── Load groups + locations + templates ────────────────────────────────────
  useEffect(() => {
    if (!activeClub) return;
    let cancelled = false;

    const u1 = GroupFactory.getGroupsByClub(activeClub.id, data => {
      if (!cancelled) setGroups(data);
    });
    const u2 = LocationFactory.getAll(activeClub.id, data => {
      if (!cancelled) setLocations(data);
    });
    const u3 = EventTemplateFactory.getAll(activeClub.id, data => {
      if (!cancelled) setTemplates(data);
    });

    return () => { cancelled = true; u1(); u2(); u3(); };
  }, [activeClub?.id]);

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (authLoading || !bootstrapDone) return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{pageCSS}</style>
      <div style={s.spinner} />
    </div>
  );

  if (!hasAccess) return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', fontFamily: 'system-ui, sans-serif' }}>
      <style>{pageCSS}</style>
      <Dumbbell size={40} color="#334155" />
      <p style={{ color: '#ef4444', fontSize: '16px', fontWeight: '700', margin: 0 }}>Geen toegang</p>
      <p style={{ color: '#64748b', fontSize: '13px', textAlign: 'center', maxWidth: '300px', margin: 0 }}>
        Alleen coaches en clubbeheerders hebben toegang tot trainingbeheer.
      </p>
      <a href="/" style={{ padding: '10px 20px', backgroundColor: '#3b82f6', color: 'white', borderRadius: '8px', textDecoration: 'none', fontWeight: '600', fontSize: '14px' }}>
        Terug naar home
      </a>
    </div>
  );

  // Club picker voor superadmin met meerdere clubs
  if (!activeClub) return (
    <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{pageCSS}</style>
      <div style={{ maxWidth: '440px', width: '100%', padding: '24px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <Dumbbell size={22} color="#3b82f6" />
          <span style={{ fontWeight: '800', fontSize: '18px', color: '#f1f5f9' }}>Trainingbeheer</span>
        </div>
        <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '16px' }}>Kies de club.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {adminClubs.map(club => (
            <button key={club.id} onClick={() => setActiveClub(club)}
              style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '14px', color: 'white', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
              <Building2 size={20} color="#3b82f6" style={{ flexShrink: 0 }} />
              <span style={{ fontWeight: '600', fontSize: '15px', flex: 1 }}>{club.name}</span>
              <ChevronRight size={16} color="#475569" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const TABS = [
    { key: 'trainingen',    label: 'Trainingen',    icon: Dumbbell  },
    { key: 'voorbereiding', label: 'Voorbereiding', icon: Zap       },
    { key: 'schemas',       label: "Schema's",       icon: Target    },
    { key: 'rapporten',     label: 'Rapporten',      icon: BarChart2 },
  ];

  return (
    <div style={s.page}>
      <style>{pageCSS}</style>

      {/* Header */}
      <header style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#64748b', textDecoration: 'none', fontSize: '13px', fontWeight: '600' }}>
            <ArrowLeft size={15} /> Home
          </a>
          <span style={{ color: '#334155' }}>/</span>
          <Dumbbell size={18} color="#3b82f6" />
          <span style={s.headerTitle}>Trainingbeheer</span>

          {/* Club switcher voor superadmin */}
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
        <div style={{ display: 'flex', marginTop: '6px', borderBottom: '1px solid #334155', overflowX: 'auto' }}>
          {TABS.map(tab => {
            const Icon     = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '10px 14px', background: 'none', border: 'none',
                borderBottom: `2px solid ${isActive ? '#3b82f6' : 'transparent'}`,
                cursor: 'pointer', fontSize: '13px',
                fontWeight: isActive ? '700' : '500',
                color: isActive ? '#60a5fa' : '#64748b',
                fontFamily: 'inherit', whiteSpace: 'nowrap',
                transition: 'color 0.15s, border-color 0.15s',
              }}>
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Content */}
      <main style={s.content}>
        {activeTab === 'trainingen' && (
          <TrainingenTab
            clubId={activeClub.id}
            uid={uid}
            memberId={activeMemberId}
            groups={groups}
            locations={locations}
            isCoachOnly={isCoachOnly}
            memberGroupIds={memberGroupIds}
          />
        )}
        {activeTab === 'voorbereiding' && (
          <PrepLibraryTab
            clubId={activeClub.id}
            uid={uid}
            disciplines={[]}
          />
        )}
        {activeTab === 'schemas' && (
          <PlanLibraryTab
            clubId={activeClub.id}
            uid={uid}
            groups={groups}
            templates={templates}
            disciplines={[]}
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
