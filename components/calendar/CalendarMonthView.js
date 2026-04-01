/**
 * components/calendar/CalendarMonthView.js
 *
 * Classic month grid (Ma–Zo, 5–6 rows).
 * Each day cell shows compact event pills.
 * Tap a day with multiple events → day expands inline.
 * Tap a single event → opens EventDetailSheet.
 *
 * Props:
 *   events        : calendarEvent[]  — pre-merged, filtered, full month range
 *   locationMap   : { [locationId]: location }
 *   currentMonth  : Date  — any date in the displayed month
 *   onPrev        : () => void
 *   onNext        : () => void
 *   onToday       : () => void
 *   onEventClick  : (event) => void
 */

import { useState } from 'react';
import {
  getEventColor, isSameDay, startOfMonth, endOfMonth,
  startOfWeek, addDays,
} from '../../utils/calendarUtils';

const DAYS_HEADER = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
const MONTH_NL_FULL = [
  'Januari','Februari','Maart','April','Mei','Juni',
  'Juli','Augustus','September','Oktober','November','December',
];

// Build calendar grid: 6 rows × 7 cols, starting on Monday
function buildGrid(month) {
  const first = startOfMonth(month);
  const last  = endOfMonth(month);
  const gridStart = startOfWeek(first); // Monday of first week
  const cells = [];
  let cursor = new Date(gridStart);
  // Always render 6 weeks for consistent height
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(cursor));
    cursor = addDays(cursor, 1);
  }
  return cells;
}

function DayCell({ date, events, isCurrentMonth, isToday, isSelected, onSelect, onEventClick }) {
  const color = '#94a3b8';
  const MAX_PILLS = 2;
  const overflow = events.length > MAX_PILLS ? events.length - MAX_PILLS : 0;

  return (
    <div
      onClick={() => events.length > 0 && onSelect(date)}
      style={{
        backgroundColor: isToday ? '#22c55e11' : isSelected ? '#3b82f611' : 'transparent',
        border: `1px solid ${isToday ? '#22c55e33' : isSelected ? '#3b82f633' : '#1e293b'}`,
        borderRadius: '8px',
        padding: '4px 3px 3px',
        minHeight: '58px',
        cursor: events.length > 0 ? 'pointer' : 'default',
        transition: 'background-color 0.1s',
        overflow: 'hidden',
      }}
    >
      {/* Day number */}
      <div style={{
        fontSize: '12px', fontWeight: isToday ? '800' : '600',
        color: isToday ? '#22c55e' : isCurrentMonth ? '#f1f5f9' : '#334155',
        textAlign: 'right', paddingRight: '2px', marginBottom: '3px', lineHeight: 1,
      }}>
        {date.getDate()}
      </div>

      {/* Event pills */}
      {events.slice(0, MAX_PILLS).map(event => {
        const c = getEventColor(event);
        const isCancelled = event.status === 'cancelled';
        return (
          <div
            key={event.id}
            onClick={e => { e.stopPropagation(); onEventClick(event); }}
            style={{
              height: '5px', borderRadius: '3px',
              backgroundColor: isCancelled ? '#ef444488' : c,
              marginBottom: '2px',
              opacity: isCancelled ? 0.5 : 1,
              cursor: 'pointer',
            }}
            title={event.title}
          />
        );
      })}

      {/* Overflow */}
      {overflow > 0 && (
        <div style={{ fontSize: '9px', color: '#64748b', fontWeight: '700', textAlign: 'right', paddingRight: '2px' }}>
          +{overflow}
        </div>
      )}
    </div>
  );
}

export default function CalendarMonthView({
  events = [],
  locationMap = {},
  currentMonth,
  onPrev,
  onNext,
  onToday,
  onEventClick,
}) {
  const [selectedDate, setSelectedDate] = useState(null);
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const cells = buildGrid(currentMonth);

  // Group events by day key (reuse the cells array)
  const eventsByDay = new Map();
  for (const event of events) {
    if (!event.startAt) continue;
    const d = new Date((event.startAt.seconds || 0) * 1000);
    d.setHours(0, 0, 0, 0);
    const key = d.getTime();
    if (!eventsByDay.has(key)) eventsByDay.set(key, []);
    eventsByDay.get(key).push(event);
  }

  // Sort events within each day by time
  for (const [, arr] of eventsByDay) {
    arr.sort((a, b) => (a.startAt?.seconds || 0) - (b.startAt?.seconds || 0));
  }

  // Selected day events (for the expanded panel below the grid)
  const selectedKey = selectedDate ? selectedDate.getTime() : null;
  const selectedEvents = selectedKey ? (eventsByDay.get(selectedKey) || []) : [];

  const handleSelect = (date) => {
    const d = new Date(date); d.setHours(0,0,0,0);
    setSelectedDate(prev => prev?.getTime() === d.getTime() ? null : d);
  };

  return (
    <div>
      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <button onClick={onPrev} style={navBtn}>‹</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '16px', fontWeight: '800', color: '#f1f5f9' }}>
            {MONTH_NL_FULL[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </div>
        </div>
        <button onClick={onNext} style={navBtn}>›</button>
      </div>

      {/* Today */}
      <div style={{ textAlign: 'center', marginBottom: '10px' }}>
        <button onClick={onToday} style={{ padding: '4px 14px', borderRadius: '20px', border: '1px solid #334155', backgroundColor: 'transparent', color: '#64748b', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
          Vandaag
        </button>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px', marginBottom: '3px' }}>
        {DAYS_HEADER.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: '10px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px', padding: '3px 0' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px' }}>
        {cells.map((cell, i) => {
          const key = cell.getTime();
          const cellEvents = eventsByDay.get(key) || [];
          const isCurrentMonth = cell.getMonth() === currentMonth.getMonth();
          const isToday = isSameDay(cell, today);
          const isSelected = selectedDate ? isSameDay(cell, selectedDate) : false;

          return (
            <DayCell
              key={i}
              date={cell}
              events={cellEvents}
              isCurrentMonth={isCurrentMonth}
              isToday={isToday}
              isSelected={isSelected}
              onSelect={handleSelect}
              onEventClick={onEventClick}
            />
          );
        })}
      </div>

      {/* Selected day panel */}
      {selectedDate && selectedEvents.length > 0 && (
        <div style={{ marginTop: '16px', backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#f1f5f9' }}>
              {selectedDate.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
            <button onClick={() => setSelectedDate(null)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: '2px', fontFamily: 'inherit', fontSize: '16px' }}>×</button>
          </div>
          <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
            {selectedEvents.map(event => {
              const color = getEventColor(event);
              const isCancelled = event.status === 'cancelled';
              const startMs = (event.startAt?.seconds || 0) * 1000;
              const timeStr = new Date(startMs).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
              const loc = event.locationId ? locationMap[event.locationId] : null;

              return (
                <button
                  key={event.id}
                  onClick={() => onEventClick(event)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '9px 10px', borderRadius: '8px',
                    backgroundColor: color + '11',
                    border: `1px solid ${color}33`,
                    borderLeft: `3px solid ${color}`,
                    textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                    opacity: isCancelled ? 0.65 : 1,
                  }}
                >
                  <span style={{ fontSize: '12px', fontWeight: '800', color, flexShrink: 0 }}>{timeStr}</span>
                  <span style={{
                    fontSize: '13px', fontWeight: '700', color: '#f1f5f9', flex: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    textDecoration: isCancelled ? 'line-through' : 'none',
                  }}>
                    {event.title}
                  </span>
                  {loc && <span style={{ fontSize: '11px', color: '#64748b', flexShrink: 0 }}>{loc.name}</span>}
                  {isCancelled && <span style={{ fontSize: '9px', color: '#ef4444', fontWeight: '700', flexShrink: 0 }}>GEANNULEERD</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
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
