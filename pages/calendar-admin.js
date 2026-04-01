/**
 * pages/agenda.js
 *
 * Kalender-pagina voor alle leden.
 * Toont alle trainingen, wedstrijden en club-evenementen voor de actieve club.
 *
 * Weergaven (toggle): lijst | week | maand
 * Data-flow:
 *   1. Load active EventTemplates (one-shot)
 *   2. Subscribe to real calendarEvent docs for current range (onSnapshot)
 *   3. Generate virtual events client-side (generateVirtualEvents)
 *   4. Merge with exceptions (mergeWithExceptions)
 *   5. Filter for member's groups (filterEventsForMember)
 *   6. Render in selected view
 *
 * Rules:
 *   - All DB via factories (CLAUDE.md §1)
 *   - No <form> elements (CLAUDE.md §4)
 *   - Inline CSS only (CLAUDE.md §9)
 *   - Dutch UI (CLAUDE.md §9)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  UserFactory, ClubFactory, GroupFactory,
  UserMemberLinkFactory,
  EventTemplateFactory, CalendarEventFactory, LocationFactory,
  TrainingPlanFactory,
} from '../constants/dbSchema';
import {
  generateVirtualEvents, mergeWithExceptions, filterEventsForMember,
  startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, addDays,
} from '../utils/calendarUtils';
import CalendarListView  from '../components/calendar/CalendarListView';
import CalendarWeekView  from '../components/calendar/CalendarWeekView';
import CalendarMonthView from '../components/calendar/CalendarMonthView';
import EventDetailSheet  from '../components/calendar/EventDetailSheet';
import { Calendar, List, Grid3x3, CalendarDays, Settings, Filter, Target } from 'lucide-react';

// ─── Cookie helper ────────────────────────────────────────────────────────────
const COOKIE_KEY = 'msc_uid';
const getCookieUid = () => {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`));
  return m ? m[1] : null;
};

// ─── View types ───────────────────────────────────────────────────────────────
const VIEWS = [
  { key: 'lijst',  label: 'Lijst',  icon: List        },
  { key: 'week',   label: 'Week',   icon: CalendarDays },
  { key: 'maand',  label: 'Maand',  icon: Grid3x3     },
];

// ─── Range calculation per view ───────────────────────────────────────────────
function getRangeForView(view, anchor) {
  switch (view) {
    case 'week':
      return { start: startOfWeek(anchor), end: endOfWeek(anchor) };
    case 'maand':
      return {
        start: addDays(startOfWeek(startOfMonth(anchor)), -7),
        end:   addDays(endOfWeek(endOfMonth(anchor)), 7),
      };
    case 'lijst':
    default:
      return { start: startOfDay(anchor), end: endOfDay(addDays(anchor, 60)) };
  }
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AgendaPage() {
  const [uid,            setUid]            = useState(null);
  const [currentUser,    setCurrentUser]    = useState(null);
  const [memberContext,  setMemberContext]  = useState(null);
  const [memberGroupIds, setMemberGroupIds] = useState([]);
  const [isCoachOrAdmin, setIsCoachOrAdmin] = useState(false);
  const [activeClub,     setActiveClub]     = useState(null);
  const [bootstrapDone,  setBootstrapDone]  = useState(false);

  const [view,             setView]            = useState('lijst');
  const [anchor,           setAnchor]          = useState(() => new Date());
  const [selectedEvent,    setSelectedEvent]   = useState(null);
  const [showGroupFilter,  setShowGroupFilter] = useState(false);
  const [activeGroupFilter,setActiveGroupFilter] = useState(null);

  const [templates,   setTemplates]   = useState([]);
  const [realEvents,  setRealEvents]  = useState([]);
  const [locationMap, setLocationMap] = useState({});
  const [allGroups,   setAllGroups]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [plans,       setPlans]       = useState([]);

  const unsubEventsRef = useRef(null);

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const cookieUid = getCookieUid();
    if (!cookieUid) { setBootstrapDone(true); return; }
    setUid(cookieUid);

    let cancelled = false;
    const run = async () => {
      const snap = await UserFactory.get(cookieUid);
      if (!snap.exists() || cancelled) { setBootstrapDone(true); return; }
      const user = { id: cookieUid, ...snap.data() };
      setCurrentUser(user);

      const role = user.role || 'user';
      if (role === 'superadmin' || role === 'clubadmin') setIsCoachOrAdmin(true);

      const unsubLinks = UserMemberLinkFactory.getForUser(cookieUid, async (profiles) => {
        unsubLinks();
        if (cancelled) return;
        if (profiles.length === 0) { setBootstrapDone(true); return; }

        const profile  = profiles[0];
        const clubId   = profile.member.clubId;
        const memberId = profile.member.id;

        const clubSnap = await ClubFactory.getById(clubId);
        if (!clubSnap.exists() || cancelled) { setBootstrapDone(true); return; }
        setActiveClub({ id: clubSnap.id, ...clubSnap.data() });
        setMemberContext({ clubId, memberId, uid: cookieUid });

        const groups = await GroupFactory.getGroupsByClubOnce(clubId);
        if (cancelled) return;
        setAllGroups(groups);

        const gids = [];
        for (const group of groups) {
          const members = await GroupFactory.getMembersByGroupOnce(clubId, group.id);
          const me = members.find(m => (m.memberId || m.id) === memberId);
          if (me) {
            gids.push(group.id);
            if (me.isCoach) setIsCoachOrAdmin(true);
          }
        }
        if (!cancelled) {
          setMemberGroupIds(gids);
          setBootstrapDone(true);
        }
      });
    };
    run();
    return () => { cancelled = true; };
  }, []);

  // ── Load locations ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeClub) return;
    LocationFactory.getAllOnce(activeClub.id)
      .then(locs => {
        const m = {};
        locs.forEach(l => { m[l.id] = l; });
        setLocationMap(m);
      })
      .catch(console.error);
  }, [activeClub?.id]);

  // ── Load templates ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeClub) return;
    EventTemplateFactory.getAllOnce(activeClub.id)
      .then(setTemplates)
      .catch(console.error);
  }, [activeClub?.id]);

  // ── Subscribe to training plans for this club ──────────────────────────────
  useEffect(() => {
    if (!activeClub) return;
    const unsub = TrainingPlanFactory.getAll(activeClub.id, (data) => {
      // Filter: toon enkel toekomstige wedstrijden (of max 7 dagen geleden)
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      setPlans(data.filter(p => p.competitionDate && new Date(p.competitionDate + 'T12:00:00') > cutoff));
    });
    return () => unsub();
  }, [activeClub?.id]);

  // ── Subscribe to real Firestore events for current range ───────────────────
  useEffect(() => {
    if (!activeClub) return;

    const { start, end } = getRangeForView(view, anchor);
    const startTs = { seconds: Math.floor(start.getTime() / 1000) };
    const endTs   = { seconds: Math.floor(end.getTime()   / 1000) };

    if (unsubEventsRef.current) { unsubEventsRef.current(); unsubEventsRef.current = null; }
    setLoading(true);

    const unsub = CalendarEventFactory.getEventsInRange(
      activeClub.id, startTs, endTs,
      (docs) => { setRealEvents(docs); setLoading(false); }
    );
    unsubEventsRef.current = unsub;

    return () => { if (unsubEventsRef.current) { unsubEventsRef.current(); unsubEventsRef.current = null; } };
  }, [activeClub?.id, view, anchor.getTime()]);

  // ── Derived: merged + filtered events ─────────────────────────────────────
  const visibleEvents = (() => {
    if (!bootstrapDone) return [];
    const { start, end } = getRangeForView(view, anchor);
    const virtual = generateVirtualEvents(templates, start, end);
    const merged  = mergeWithExceptions(virtual, realEvents);
    if (isCoachOrAdmin && !activeGroupFilter) return merged;
    const filterIds = activeGroupFilter ? [activeGroupFilter] : memberGroupIds;
    return filterEventsForMember(merged, filterIds);
  })();

  // ── Navigation ─────────────────────────────────────────────────────────────
  const goNext = useCallback(() => {
    setAnchor(a => {
      if (view === 'week')  return addDays(a, 7);
      if (view === 'maand') return new Date(a.getFullYear(), a.getMonth() + 1, 1);
      return addDays(a, 30);
    });
  }, [view]);

  const goPrev = useCallback(() => {
    setAnchor(a => {
      if (view === 'week')  return addDays(a, -7);
      if (view === 'maand') return new Date(a.getFullYear(), a.getMonth() - 1, 1);
      return addDays(a, -30);
    });
  }, [view]);

  const goToday = useCallback(() => setAnchor(new Date()), []);

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (!bootstrapDone) {
    return (
      <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        <div style={{ width: '32px', height: '32px', border: '3px solid #1e293b', borderTop: '3px solid #22c55e', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  if (!activeClub) {
    return (
      <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', fontFamily: 'system-ui, sans-serif', padding: '24px' }}>
        <Calendar size={40} color="#334155" />
        <p style={{ color: '#64748b', fontSize: '14px', textAlign: 'center', maxWidth: '280px', margin: 0 }}>
          Je bent nog niet gekoppeld aan een club. Vraag toegang via de clubpagina.
        </p>
        <a href="/" style={{ padding: '10px 20px', backgroundColor: '#3b82f6', color: 'white', borderRadius: '8px', textDecoration: 'none', fontWeight: '600', fontSize: '14px' }}>
          Terug naar home
        </a>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'system-ui, sans-serif', paddingBottom: '80px' }}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

      {/* ── Header ── */}
      <header style={{ backgroundColor: '#1e293b', borderBottom: '1px solid #334155', padding: '12px 16px', position: 'sticky', top: 0, zIndex: 100 }}>

        {/* Top row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '9px', backgroundColor: '#22c55e22', border: '1px solid #22c55e44', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={17} color="#22c55e" />
            </div>
            <div>
              <div style={{ fontWeight: '800', fontSize: '15px', color: '#f1f5f9' }}>Agenda</div>
              <div style={{ fontSize: '11px', color: '#475569' }}>{activeClub.name}</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            {allGroups.length > 1 && (
              <button
                onClick={() => setShowGroupFilter(p => !p)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 10px',
                  borderRadius: '8px', fontFamily: 'inherit',
                  border: `1px solid ${activeGroupFilter ? '#3b82f6' : '#334155'}`,
                  backgroundColor: activeGroupFilter ? '#3b82f622' : 'transparent',
                  color: activeGroupFilter ? '#60a5fa' : '#64748b',
                  fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                }}
              >
                <Filter size={12} />
                {activeGroupFilter
                  ? (allGroups.find(g => g.id === activeGroupFilter)?.name || 'Groep')
                  : 'Groep'}
              </button>
            )}
            {isCoachOrAdmin && (
              <a href="/calendar-admin" style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 10px', borderRadius: '8px', border: '1px solid #334155', color: '#64748b', textDecoration: 'none', fontSize: '12px', fontWeight: '600' }}>
                <Settings size={12} /> Beheer
              </a>
            )}
          </div>
        </div>

        {/* Group filter dropdown */}
        {showGroupFilter && allGroups.length > 1 && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', paddingBottom: '8px' }}>
            <button
              onClick={() => { setActiveGroupFilter(null); setShowGroupFilter(false); }}
              style={{
                padding: '5px 12px', borderRadius: '20px', fontFamily: 'inherit',
                border: `1px solid ${!activeGroupFilter ? '#22c55e' : '#334155'}`,
                backgroundColor: !activeGroupFilter ? '#22c55e22' : 'transparent',
                color: !activeGroupFilter ? '#22c55e' : '#64748b',
                fontSize: '12px', fontWeight: '600', cursor: 'pointer',
              }}
            >
              Alle mijn groepen
            </button>
            {allGroups
              .filter(g => isCoachOrAdmin || memberGroupIds.includes(g.id))
              .map(g => (
                <button
                  key={g.id}
                  onClick={() => { setActiveGroupFilter(g.id); setShowGroupFilter(false); }}
                  style={{
                    padding: '5px 12px', borderRadius: '20px', fontFamily: 'inherit',
                    border: `1px solid ${activeGroupFilter === g.id ? '#3b82f6' : '#334155'}`,
                    backgroundColor: activeGroupFilter === g.id ? '#3b82f622' : 'transparent',
                    color: activeGroupFilter === g.id ? '#60a5fa' : '#64748b',
                    fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                  }}
                >
                  {g.name}
                </button>
              ))}
          </div>
        )}

        {/* View toggle */}
        <div style={{ display: 'flex', backgroundColor: '#0f172a', borderRadius: '10px', padding: '3px', border: '1px solid #334155' }}>
          {VIEWS.map(v => {
            const Icon   = v.icon;
            const active = view === v.key;
            return (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                  padding: '7px 0', borderRadius: '7px', fontFamily: 'inherit',
                  border: 'none',
                  backgroundColor: active ? '#1e293b' : 'transparent',
                  color: active ? '#f1f5f9' : '#475569',
                  fontSize: '12px', fontWeight: active ? '700' : '500',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                <Icon size={13} />
                {v.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* ── Content ── */}
      <main style={{ padding: '16px' }}>

        {/* ── Trainingsschema's banner ── */}
        {plans.length > 0 && (
          <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {plans.map(plan => {
              const compDate = new Date(plan.competitionDate + 'T12:00:00');
              const daysLeft = Math.ceil((compDate - new Date()) / (1000 * 60 * 60 * 24));
              const totalTrainings = (plan.trainings || []).length;
              const prepped = (plan.trainings || []).filter(t => (t.prepIds || []).length > 0).length;
              const progress = totalTrainings > 0 ? prepped / totalTrainings : 0;

              // Alleen tonen voor relevante groepen
              const isRelevant = !plan.groupId ||
                memberGroupIds.includes(plan.groupId) || isCoachOrAdmin;
              if (!isRelevant) return null;

              return (
                <a
                  key={plan.id}
                  href={`/training-plan/${plan.id}`}
                  style={{ textDecoration: 'none', display: 'block', backgroundColor: '#1e293b', borderRadius: '10px', border: '1px solid #f9731633', padding: '10px 14px', overflow: 'hidden', position: 'relative' }}
                >
                  {/* Progress bar achtergrond */}
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${progress * 100}%`, backgroundColor: '#a78bfa0a', transition: 'width 0.4s' }} />
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Target size={16} color="#f97316" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {plan.competitionName || 'Wedstrijdschema'}
                      </div>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>
                        {daysLeft > 0
                          ? `Nog ${daysLeft} dag${daysLeft !== 1 ? 'en' : ''}`
                          : 'Wedstrijd voorbij'}
                        {plan.groupName && ` · ${plan.groupName}`}
                        {isCoachOrAdmin && ` · ✨ ${prepped}/${totalTrainings} voorbereid`}
                      </div>
                    </div>
                    <span style={{ fontSize: '11px', color: '#475569', flexShrink: 0 }}>→</span>
                  </div>
                </a>
              );
            })}
          </div>
        )}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '50px' }}>
            <div style={{ width: '28px', height: '28px', border: '3px solid #1e293b', borderTop: '3px solid #22c55e', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        )}

        {!loading && view === 'lijst' && (
          <CalendarListView
            events={visibleEvents}
            locationMap={locationMap}
            onEventClick={setSelectedEvent}
          />
        )}

        {!loading && view === 'week' && (
          <CalendarWeekView
            events={visibleEvents}
            locationMap={locationMap}
            currentWeekStart={startOfWeek(anchor)}
            onPrev={goPrev}
            onNext={goNext}
            onToday={goToday}
            onEventClick={setSelectedEvent}
          />
        )}

        {!loading && view === 'maand' && (
          <CalendarMonthView
            events={visibleEvents}
            locationMap={locationMap}
            currentMonth={anchor}
            onPrev={goPrev}
            onNext={goNext}
            onToday={goToday}
            onEventClick={setSelectedEvent}
          />
        )}
      </main>

      {/* ── Event detail sheet ── */}
      {selectedEvent && (
        <EventDetailSheet
          event={selectedEvent}
          location={selectedEvent.locationId ? locationMap[selectedEvent.locationId] : null}
          memberContext={memberContext}
          coachView={isCoachOrAdmin}
          groups={allGroups}
          locations={Object.values(locationMap)}
          onClose={() => setSelectedEvent(null)}
          onEventChanged={() => {
            // Re-fetch templates after edit/cancel so virtual events update
            if (activeClub) {
              EventTemplateFactory.getAllOnce(activeClub.id).then(setTemplates).catch(console.error);
            }
            setSelectedEvent(null);
          }}
        />
      )}
    </div>
  );
}
