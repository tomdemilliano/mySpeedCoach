/**
 * components/calendar/CalendarListView.js
 *
 * Chronological list of events, grouped by date.
 * Default view on mobile. Clean and fast to render.
 *
 * Props:
 *   events      : calendarEvent[]  — already merged + filtered
 *   locationMap : { [locationId]: location }
 *   onEventClick: (event) => void
 */

import { getEventColor, groupEventsByDate, formatDuration, durationFromEvent, EVENT_TYPES } from '../../utils/calendarUtils';
import { MapPin, Dumbbell, Star, Trophy } from 'lucide-react';

const TYPE_ICONS  = { training: Dumbbell, club_event: Star, competition: Trophy };
const MONTH_NL    = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
const DAY_NL_FULL = ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];

function formatDayHeader(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);

  if (date.getTime() === today.getTime()) return { label: 'Vandaag', sub: `${d} ${MONTH_NL[m-1]}`, isToday: true };
  if (date.getTime() === tomorrow.getTime()) return { label: 'Morgen', sub: `${d} ${MONTH_NL[m-1]}`, isToday: false };
  return {
    label: DAY_NL_FULL[date.getDay()].charAt(0).toUpperCase() + DAY_NL_FULL[date.getDay()].slice(1),
    sub:   `${d} ${MONTH_NL[m-1]} ${y}`,
    isToday: false,
  };
}

function EventRow({ event, locationMap, onClick }) {
  const color    = getEventColor(event);
  const Icon     = TYPE_ICONS[event.type] || Dumbbell;
  const isCancelled = event.status === 'cancelled';
  const startMs  = (event.startAt?.seconds || 0) * 1000;
  const endMs    = (event.endAt?.seconds   || 0) * 1000;
  const timeStr  = new Date(startMs).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
  const endStr   = new Date(endMs).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
  const loc      = event.locationId ? locationMap[event.locationId] : null;
  const duration = durationFromEvent(event);

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'stretch', gap: 0,
        width: '100%', textAlign: 'left', cursor: 'pointer',
        backgroundColor: isCancelled ? '#1a1a2a' : '#1e293b',
        border: `1px solid ${isCancelled ? '#ef444433' : color + '33'}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: '10px', overflow: 'hidden',
        opacity: isCancelled ? 0.75 : 1,
        transition: 'background-color 0.12s',
        fontFamily: 'inherit',
      }}
    >
      {/* Time column */}
      <div style={{ width: '64px', padding: '10px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRight: `1px solid ${color}22`, flexShrink: 0 }}>
        <span style={{ fontSize: '13px', fontWeight: '800', color: isCancelled ? '#475569' : '#f1f5f9', lineHeight: 1 }}>{timeStr}</span>
        {duration && <span style={{ fontSize: '9px', color: '#475569', marginTop: '3px', fontWeight: '600' }}>{formatDuration(duration)}</span>}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '10px 12px', minWidth: 0 }}>
        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
          <Icon size={12} color={color} style={{ flexShrink: 0 }} />
          <span style={{
            fontWeight: '700', fontSize: '14px',
            color: isCancelled ? '#475569' : '#f1f5f9',
            textDecoration: isCancelled ? 'line-through' : 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {event.title}
          </span>
          {isCancelled && (
            <span style={{ fontSize: '9px', fontWeight: '800', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#ef444422', color: '#ef4444', border: '1px solid #ef444433', flexShrink: 0 }}>
              GEANNULEERD
            </span>
          )}
          {event.isSpecial && event.specialLabel && (
            <span style={{ fontSize: '9px', fontWeight: '800', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#22c55e22', color: '#22c55e', border: '1px solid #22c55e44', flexShrink: 0 }}>
              {event.specialLabel}
            </span>
          )}
          {/* Prep indicator */}
          {((event.prepIds?.length > 0) || event.prepId) && (
            <span title={`${(event.prepIds?.length || 1)} voorbereiding(en)`} style={{ fontSize: '9px', fontWeight: '800', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#a78bfa22', color: '#a78bfa', border: '1px solid #a78bfa33', flexShrink: 0 }}>
              ✨ prep
            </span>
          )}
        </div>

        {/* Location */}
        {(loc || event.locationNote) && (
          <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <MapPin size={10} style={{ flexShrink: 0 }} />
            {loc ? loc.name : event.locationNote}
          </div>
        )}
      </div>

      {/* Right arrow hint */}
      <div style={{ padding: '10px 10px 10px 0', display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: '16px', color: '#334155' }}>›</span>
      </div>
    </button>
  );
}

export default function CalendarListView({ events, locationMap = {}, onEventClick }) {
  if (!events || events.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>📅</div>
        <p style={{ color: '#475569', fontSize: '14px', margin: 0 }}>Geen evenementen in deze periode.</p>
      </div>
    );
  }

  const grouped = groupEventsByDate(events);
  const sortedKeys = Object.keys(grouped).sort();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {sortedKeys.map(dateKey => {
        const { label, sub, isToday } = formatDayHeader(dateKey);
        const dayEvents = grouped[dateKey];
        return (
          <div key={dateKey}>
            {/* Day header */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '15px', fontWeight: '800', color: isToday ? '#22c55e' : '#f1f5f9' }}>
                {label}
              </span>
              <span style={{ fontSize: '12px', color: '#475569' }}>{sub}</span>
              {isToday && (
                <span style={{ fontSize: '9px', fontWeight: '800', padding: '1px 6px', borderRadius: '6px', backgroundColor: '#22c55e22', color: '#22c55e', border: '1px solid #22c55e44', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Vandaag
                </span>
              )}
            </div>

            {/* Events for this day */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {dayEvents.map(event => (
                <EventRow
                  key={event.id}
                  event={event}
                  locationMap={locationMap}
                  onClick={() => onEventClick(event)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
