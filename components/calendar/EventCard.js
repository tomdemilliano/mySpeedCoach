/**
 * components/calendar/EventCard.js
 *
 * Compact event card used in CalendarListView, CalendarWeekView
 * and CalendarMonthView. Clicking opens EventDetailSheet via onPress callback.
 *
 * Props:
 *   event      : calendarEvent object (real or virtual)
 *   location   : location object | null
 *   onClick    : () => void
 *   compact    : boolean — extra-small variant for month grid dots
 *   showDate   : boolean — prepend weekday + date (used in list view)
 */

import { MapPin, Users, Star, Trophy, Dumbbell, X } from 'lucide-react';
import { getEventColor, formatTs, formatDuration, durationFromEvent, EVENT_TYPES } from '../../utils/calendarUtils';

const TYPE_ICONS = {
  training:    Dumbbell,
  club_event:  Star,
  competition: Trophy,
};

export default function EventCard({ event, location, onClick, compact = false, showDate = false }) {
  const color    = getEventColor(event);
  const Icon     = TYPE_ICONS[event.type] || Dumbbell;
  const isCancelled = event.status === 'cancelled';
  const duration = durationFromEvent(event);

  const startMs  = (event.startAt?.seconds || 0) * 1000;
  const timeStr  = new Date(startMs).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });

  if (compact) {
    // Dot variant for month grid
    return (
      <button
        onClick={onClick}
        title={event.title}
        style={{
          display: 'block', width: '100%',
          padding: '2px 5px', borderRadius: '4px',
          backgroundColor: color + '33',
          border: `1px solid ${color}55`,
          textAlign: 'left', cursor: 'pointer',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontSize: '10px', fontWeight: '600', color,
          textDecoration: isCancelled ? 'line-through' : 'none',
          opacity: isCancelled ? 0.6 : 1,
          fontFamily: 'inherit',
        }}
      >
        {timeStr} {event.title}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'stretch', gap: 0,
        width: '100%', textAlign: 'left', cursor: 'pointer',
        backgroundColor: '#1e293b',
        border: `1px solid ${isCancelled ? '#ef444433' : color + '33'}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: '10px', overflow: 'hidden',
        opacity: isCancelled ? 0.7 : 1,
        transition: 'background-color 0.12s',
        fontFamily: 'inherit',
      }}
    >
      <div style={{ flex: 1, padding: '10px 12px' }}>
        {/* Date header (list view) */}
        {showDate && (
          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>
            {new Date(startMs).toLocaleDateString('nl-BE', { weekday: 'long', day: '2-digit', month: 'long' })}
          </div>
        )}

        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
          <Icon size={12} color={color} style={{ flexShrink: 0 }} />
          <span style={{
            fontWeight: '700', fontSize: '14px', color: '#f1f5f9',
            textDecoration: isCancelled ? 'line-through' : 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {event.title}
          </span>
          {event.isSpecial && event.specialLabel && (
            <span style={{
              fontSize: '10px', fontWeight: '700', padding: '1px 6px', borderRadius: '8px',
              backgroundColor: '#22c55e22', color: '#22c55e', border: '1px solid #22c55e44', flexShrink: 0,
            }}>
              {event.specialLabel}
            </span>
          )}
          {isCancelled && (
            <span style={{
              fontSize: '10px', fontWeight: '700', padding: '1px 6px', borderRadius: '8px',
              backgroundColor: '#ef444422', color: '#ef4444', border: '1px solid #ef444433', flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: '3px',
            }}>
              <X size={9} /> Geannuleerd
            </span>
          )}
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Time */}
          <span style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '3px' }}>
            🕐 {timeStr}
            {duration && <span style={{ color: '#64748b' }}>· {formatDuration(duration)}</span>}
          </span>

          {/* Location */}
          {location && (
            <span style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>
              <MapPin size={10} style={{ flexShrink: 0 }} /> {location.name}
            </span>
          )}
          {event.locationNote && !location && (
            <span style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '3px' }}>
              <MapPin size={10} /> {event.locationNote}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
