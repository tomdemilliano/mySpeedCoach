/**
 * components/calendar/CalendarWeekView.js
 *
 * Week view: 7 columns (ma–zo), events shown as compact cards per day.
 * Navigable via prev/next week arrows.
 *
 * Props:
 *   events       : calendarEvent[]  — pre-merged and filtered for current week
 *   locationMap  : { [locationId]: location }
 *   currentWeekStart : Date  — Monday of the displayed week
 *   onPrev       : () => void
 *   onNext       : () => void
 *   onToday      : () => void
 *   onEventClick : (event) => void
 */

import { getEventColor, formatDuration, durationFromEvent, isSameDay, addDays } from '../../utils/calendarUtils';
import { Dumbbell, Star, Trophy } from 'lucide-react';

const DAYS_NL_SHORT = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
const MONTH_NL      = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
const TYPE_ICONS    = { training: Dumbbell, club_event: Star, competition: Trophy };

function WeekEventPill({ event, onClick }) {
  const color = getEventColor(event);
  const isCancelled = event.status === 'cancelled';
  const startMs = (event.startAt?.seconds || 0) * 1000;
  const timeStr = new Date(startMs).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });

  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '4px 6px', marginBottom: '3px',
        borderRadius: '6px', border: `1px solid ${color}44`,
        borderLeft: `2.5px solid ${color}`,
        backgroundColor: color + '18',
        cursor: 'pointer', fontFamily: 'inherit',
        opacity: isCancelled ? 0.55 : 1,
      }}
    >
      <div style={{
        fontSize: '10px', fontWeight: '700', color,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        textDecoration: isCancelled ? 'line-through' : 'none',
        lineHeight: 1.3,
      }}>
        {event.title}
        {((event.prepIds?.length > 0) || event.prepId) && (
          <span style={{ marginLeft: '3px', fontSize: '8px', color: '#a78bfa' }}>✨</span>
        )}
      </div>
      <div style={{ fontSize: '9px', color: '#64748b', fontWeight: '600', marginTop: '1px' }}>
        {timeStr}
      </div>
    </button>
  );
}

export default function CalendarWeekView({
  events = [],
  locationMap = {},
  currentWeekStart,
  onPrev,
  onNext,
  onToday,
  onEventClick,
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build the 7 days of this week
  const days = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));

  // Group events by day index (0=Mon … 6=Sun)
  const eventsByDay = days.map(day =>
    events.filter(e => {
      const d = new Date((e.startAt?.seconds || 0) * 1000);
      return isSameDay(d, day);
    }).sort((a, b) => (a.startAt?.seconds || 0) - (b.startAt?.seconds || 0))
  );

  // Week label
  const weekStart = days[0];
  const weekEnd   = days[6];
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const weekLabel = sameMonth
    ? `${weekStart.getDate()} – ${weekEnd.getDate()} ${MONTH_NL[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`
    : `${weekStart.getDate()} ${MONTH_NL[weekStart.getMonth()]} – ${weekEnd.getDate()} ${MONTH_NL[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;

  return (
    <div>
      {/* Week navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <button onClick={onPrev} style={navBtn}>‹</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#f1f5f9' }}>{weekLabel}</div>
        </div>
        <button onClick={onNext} style={navBtn}>›</button>
      </div>

      {/* Today button */}
      <div style={{ textAlign: 'center', marginBottom: '12px' }}>
        <button onClick={onToday} style={{ padding: '5px 14px', borderRadius: '20px', border: '1px solid #334155', backgroundColor: 'transparent', color: '#64748b', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
          Vandaag
        </button>
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
        {days.map((day, i) => {
          const isToday = isSameDay(day, today);
          const hasEvents = eventsByDay[i].length > 0;
          return (
            <div key={i} style={{
              backgroundColor: isToday ? '#22c55e11' : '#1e293b',
              border: `1px solid ${isToday ? '#22c55e44' : '#334155'}`,
              borderRadius: '10px',
              padding: '8px 4px',
              minHeight: '90px',
            }}>
              {/* Day header */}
              <div style={{ textAlign: 'center', marginBottom: '6px' }}>
                <div style={{ fontSize: '9px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {DAYS_NL_SHORT[i]}
                </div>
                <div style={{
                  fontSize: '15px', fontWeight: '800',
                  color: isToday ? '#22c55e' : '#f1f5f9',
                  lineHeight: 1,
                }}>
                  {day.getDate()}
                </div>
              </div>

              {/* Events */}
              {eventsByDay[i].map(event => (
                <WeekEventPill
                  key={event.id}
                  event={event}
                  onClick={() => onEventClick(event)}
                />
              ))}

              {/* Empty day placeholder */}
              {!hasEvents && (
                <div style={{ height: '20px' }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const navBtn = {
  width: '36px', height: '36px', borderRadius: '50%',
  border: '1px solid #334155', backgroundColor: 'transparent',
  color: '#94a3b8', fontSize: '20px', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'inherit', lineHeight: 1,
};
