/**
 * components/calendar/UpcomingEventsWidget.js
 *
 * Compact home-screen widget showing the next 3–5 upcoming events
 * for the logged-in member. Placed on index.js alongside AnnouncementsWidget.
 *
 * Props:
 *   clubId        : string
 *   memberGroupIds: string[]  — the member's group memberships
 *   onEventClick  : (event) => void  — optional; if omitted, navigates to /agenda
 */

import { useState, useEffect } from 'react';
import {
  EventTemplateFactory, CalendarEventFactory, LocationFactory,
} from '../../constants/dbSchema';
import {
  generateVirtualEvents, mergeWithExceptions, filterEventsForMember,
  getUpcomingEvents, getEventColor, formatDuration, durationFromEvent,
  startOfDay, endOfDay, addDays,
} from '../../utils/calendarUtils';
import { Calendar, MapPin, Dumbbell, Star, Trophy, ChevronRight } from 'lucide-react';

const TYPE_ICONS = { training: Dumbbell, club_event: Star, competition: Trophy };
const MONTH_NL   = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];

function formatEventDate(startMs) {
  const d = new Date(startMs);
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const eventDay = new Date(d); eventDay.setHours(0,0,0,0);

  const timeStr = d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });

  if (eventDay.getTime() === today.getTime())    return `Vandaag · ${timeStr}`;
  if (eventDay.getTime() === tomorrow.getTime()) return `Morgen · ${timeStr}`;

  const dayName = d.toLocaleDateString('nl-BE', { weekday: 'short' });
  const dateStr = `${d.getDate()} ${MONTH_NL[d.getMonth()]}`;
  return `${dayName} ${dateStr} · ${timeStr}`;
}

export default function UpcomingEventsWidget({ clubId, memberGroupIds = [], ready = true, onEventClick }) {
  const [events,      setEvents]     = useState([]);
  const [locationMap, setLocationMap]= useState({});
  const [loading,     setLoading]    = useState(true);

  useEffect(() => {
    if (!clubId || !ready) return;
    let cancelled = false;

    const load = async () => {
      try {
        // Load locations (one-shot)
        const locs = await LocationFactory.getAllOnce(clubId);
        const locMap = {};
        locs.forEach(l => { locMap[l.id] = l; });
        if (!cancelled) setLocationMap(locMap);

        // Range: today … +30 days
        const rangeStart = startOfDay(new Date());
        const rangeEnd   = endOfDay(addDays(new Date(), 30));
        const startTs    = { seconds: Math.floor(rangeStart.getTime() / 1000) };
        const endTs      = { seconds: Math.floor(rangeEnd.getTime()   / 1000) };

        // Load templates + exceptions in parallel
        const [templates, exceptions] = await Promise.all([
          EventTemplateFactory.getAllOnce(clubId),
          CalendarEventFactory.getEventsInRangeOnce(clubId, startTs, endTs),
        ]);

        const virtual  = generateVirtualEvents(templates, rangeStart, rangeEnd);
        const merged   = mergeWithExceptions(virtual, exceptions);
        const filtered = filterEventsForMember(merged, memberGroupIds);
        const upcoming = getUpcomingEvents(filtered, 5);

        if (!cancelled) {
          setEvents(upcoming);
          setLoading(false);
        }
      } catch (e) {
        console.error('[UpcomingEventsWidget] load error:', e);
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [clubId, ready, memberGroupIds.join(',')]);

  const handleClick = (event) => {
    if (onEventClick) {
      onEventClick(event);
    } else {
      window.location.href = '/agenda';
    }
  };

  return (
    <div style={{ backgroundColor: '#1e293b', borderRadius: '16px', border: '1px solid #334155', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px', borderBottom: '1px solid #1e293b' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: '#22c55e22', border: '1px solid #22c55e44', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Calendar size={14} color="#22c55e" />
          </div>
          <span style={{ fontWeight: '700', fontSize: '14px', color: '#f1f5f9' }}>Volgende trainingen</span>
        </div>
        <a href="/agenda" style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '12px', color: '#64748b', textDecoration: 'none', fontWeight: '600' }}>
          Alles <ChevronRight size={12} />
        </a>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '20px', height: '20px', border: '2px solid #334155', borderTop: '2px solid #22c55e', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : events.length === 0 ? (
        <div style={{ padding: '24px 16px', textAlign: 'center' }}>
          <p style={{ color: '#475569', fontSize: '13px', margin: 0 }}>Geen aankomende trainingen.</p>
        </div>
      ) : (
        <div>
          {events.map((event, i) => {
            const color = getEventColor(event);
            const Icon  = TYPE_ICONS[event.type] || Dumbbell;
            const isCancelled = event.status === 'cancelled';
            const startMs = (event.startAt?.seconds || 0) * 1000;
            const loc = event.locationId ? locationMap[event.locationId] : null;
            const duration = durationFromEvent(event);

            return (
              <button
                key={event.id}
                onClick={() => handleClick(event)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  width: '100%', padding: '11px 16px',
                  borderTop: i > 0 ? '1px solid #0f172a' : 'none',
                  backgroundColor: 'transparent', border: 'none',
                  textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                  opacity: isCancelled ? 0.65 : 1,
                  transition: 'background-color 0.1s',
                }}
              >
                {/* Color dot */}
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />

                {/* Main content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '13px', fontWeight: '700', color: '#f1f5f9',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    textDecoration: isCancelled ? 'line-through' : 'none',
                  }}>
                    {event.title}
                    {event.isSpecial && event.specialLabel && (
                      <span style={{ fontSize: '9px', marginLeft: '6px', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#22c55e22', color: '#22c55e', fontWeight: '700', verticalAlign: 'middle' }}>
                        {event.specialLabel}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{formatEventDate(startMs)}</span>
                    {duration && <span style={{ color: '#334155' }}>· {formatDuration(duration)}</span>}
                    {loc && (
                      <>
                        <span style={{ color: '#334155' }}>·</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <MapPin size={9} /> {loc.name}
                        </span>
                      </>
                    )}
                    {isCancelled && <span style={{ color: '#ef4444', fontWeight: '700' }}>GEANNULEERD</span>}
                  </div>
                </div>

                <ChevronRight size={14} color="#334155" style={{ flexShrink: 0 }} />
              </button>
            );
          })}
        </div>
      )}

      {/* Footer link */}
      <a href="/agenda" style={{ display: 'block', padding: '10px 16px', borderTop: '1px solid #0f172a', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#475569', textDecoration: 'none', backgroundColor: '#172033' }}>
        Volledige kalender bekijken →
      </a>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
