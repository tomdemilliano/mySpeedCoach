/**
 * components/calendar/CalendarWeekView.js
 *
 * Week view: 2 kolommen (Ma–Do links, Vr–Zo rechts).
 * Mobiel-vriendelijk layout.
 *
 * Props:
 *   events           : calendarEvent[]  — pre-merged and filtered for current week
 *   locationMap      : { [locationId]: location }
 *   currentWeekStart : Date  — Monday of the displayed week
 *   onPrev           : () => void
 *   onNext           : () => void
 *   onToday          : () => void
 *   onEventClick     : (event) => void
 */

import { getEventColor, formatDuration, durationFromEvent, isSameDay, addDays } from '../../utils/calendarUtils';
import { MapPin } from 'lucide-react';

const DAYS_NL_FULL  = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];
const DAYS_NL_SHORT = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
const MONTH_NL      = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];

// Kolom-indeling: 0-3 = links (Ma t/m Do), 4-6 = rechts (Vr t/m Zo)
const COL_LEFT  = [0, 1, 2, 3]; // indices in de weekarray
const COL_RIGHT = [4, 5, 6];

function DayBlock({ day, events, isToday, onEventClick, locationMap = {} }) {
  const dayName  = DAYS_NL_FULL[day.dayIndex];
  const dayShort = DAYS_NL_SHORT[day.dayIndex];
  const isEmpty  = events.length === 0;

  return (
    <div style={{
      backgroundColor: isToday ? '#22c55e0a' : '#1e293b',
      border: `1px solid ${isToday ? '#22c55e33' : '#334155'}`,
      borderRadius: '12px',
      overflow: 'hidden',
      marginBottom: '8px',
    }}>
      {/* Dag-header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 12px',
        borderBottom: isEmpty ? 'none' : '1px solid #0f172a',
        backgroundColor: isToday ? '#22c55e14' : 'transparent',
      }}>
        {/* Datum-badge */}
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '10px',
          backgroundColor: isToday ? '#22c55e' : '#0f172a',
          border: `1px solid ${isToday ? '#22c55e' : '#334155'}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <span style={{
            fontSize: '14px',
            fontWeight: '900',
            color: isToday ? 'white' : '#f1f5f9',
            lineHeight: 1,
          }}>
            {day.date.getDate()}
          </span>
          <span style={{
            fontSize: '8px',
            fontWeight: '600',
            color: isToday ? 'rgba(255,255,255,0.8)' : '#475569',
            textTransform: 'uppercase',
            letterSpacing: '0.3px',
            lineHeight: 1,
            marginTop: '1px',
          }}>
            {MONTH_NL[day.date.getMonth()]}
          </span>
        </div>

        {/* Dagnaam */}
        <div>
          <div style={{
            fontSize: '13px',
            fontWeight: isToday ? '800' : '700',
            color: isToday ? '#22c55e' : '#f1f5f9',
            lineHeight: 1,
          }}>
            {dayName}
          </div>
          {events.length > 0 && (
            <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>
              {events.length} event{events.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Today-badge */}
        {isToday && (
          <div style={{
            marginLeft: 'auto',
            fontSize: '9px',
            fontWeight: '800',
            padding: '2px 7px',
            borderRadius: '20px',
            backgroundColor: '#22c55e22',
            color: '#22c55e',
            border: '1px solid #22c55e44',
            textTransform: 'uppercase',
            letterSpacing: '0.4px',
          }}>
            Vandaag
          </div>
        )}
      </div>

      {/* Events */}
      {events.length > 0 && (
        <div style={{ padding: '8px' }}>
          {events.map(event => {
            const color       = getEventColor(event);
            const isCancelled = event.status === 'cancelled';
            const startMs     = (event.startAt?.seconds || 0) * 1000;
            const timeStr     = new Date(startMs).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
            const duration    = durationFromEvent(event);
            const loc         = event.locationId ? locationMap[event.locationId] : null;
            const hasPrepIds  = (event.prepIds?.length > 0) || !!event.prepId;

            return (
              <button
                key={event.id}
                onClick={() => onEventClick(event)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  marginBottom: '5px',
                  borderRadius: '8px',
                  border: `1px solid ${color}33`,
                  borderLeft: `3px solid ${color}`,
                  backgroundColor: color + '0f',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  opacity: isCancelled ? 0.55 : 1,
                  transition: 'background-color 0.1s',
                }}
              >
                {/* Titel */}
                <div style={{
                  fontSize: '13px',
                  fontWeight: '700',
                  color: isCancelled ? '#475569' : '#f1f5f9',
                  textDecoration: isCancelled ? 'line-through' : 'none',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginBottom: '3px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {event.title}
                  </span>
                  {hasPrepIds && (
                    <span style={{ fontSize: '9px', color: '#a78bfa', flexShrink: 0 }}>✨</span>
                  )}
                  {isCancelled && (
                    <span style={{ fontSize: '8px', fontWeight: '800', padding: '1px 4px', borderRadius: '3px', backgroundColor: '#ef444422', color: '#ef4444', border: '1px solid #ef444433', flexShrink: 0, textDecoration: 'none' }}>
                      GEANNULEERD
                    </span>
                  )}
                </div>

                {/* Meta: tijd + locatie */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#64748b' }}>
                  <span style={{ fontWeight: '600', color: color, flexShrink: 0 }}>{timeStr}</span>
                  {duration && (
                    <span style={{ color: '#334155' }}>· {formatDuration(duration)}</span>
                  )}
                  {loc && (
                    <span style={{
                      display: 'flex', alignItems: 'center', gap: '2px',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      · <MapPin size={9} style={{ flexShrink: 0 }} /> {loc.name}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Lege dag — subtiele placeholder */}
      {isEmpty && (
        <div style={{ padding: '10px 12px 12px' }}>
          <div style={{ fontSize: '11px', color: '#2d3f55', fontStyle: 'italic' }}>Geen events</div>
        </div>
      )}
    </div>
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

  // Bouw de 7 dagen van deze week
  const days = Array.from({ length: 7 }, (_, i) => ({
    date:     addDays(currentWeekStart, i),
    dayIndex: i,
  }));

  // Groepeer events per dag
  const eventsByDay = days.map(({ date }) =>
    events
      .filter(e => {
        const d = new Date((e.startAt?.seconds || 0) * 1000);
        return isSameDay(d, date);
      })
      .sort((a, b) => (a.startAt?.seconds || 0) - (b.startAt?.seconds || 0))
  );

  // Week-label
  const weekStart = days[0].date;
  const weekEnd   = days[6].date;
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const weekLabel = sameMonth
    ? `${weekStart.getDate()} – ${weekEnd.getDate()} ${MONTH_NL[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`
    : `${weekStart.getDate()} ${MONTH_NL[weekStart.getMonth()]} – ${weekEnd.getDate()} ${MONTH_NL[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;

  return (
    <div>
      {/* Week-navigatie */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <button onClick={onPrev} style={navBtn}>‹</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#f1f5f9' }}>{weekLabel}</div>
        </div>
        <button onClick={onNext} style={navBtn}>›</button>
      </div>

      {/* Vandaag-knop */}
      <div style={{ textAlign: 'center', marginBottom: '14px' }}>
        <button onClick={onToday} style={{
          padding: '5px 16px',
          borderRadius: '20px',
          border: '1px solid #334155',
          backgroundColor: 'transparent',
          color: '#64748b',
          fontSize: '12px',
          fontWeight: '600',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}>
          Vandaag
        </button>
      </div>

      {/* 2-kolommen grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '10px',
        alignItems: 'start',
      }}>
        {/* Linkerkolom: Ma – Do */}
        <div>
          <div style={columnHeaderStyle}>Ma – Do</div>
          {COL_LEFT.map(i => (
            <DayBlock
              key={i}
              day={days[i]}
              events={eventsByDay[i]}
              isToday={isSameDay(days[i].date, today)}
              onEventClick={onEventClick}
              locationMap={locationMap}
            />
          ))}
        </div>

        {/* Rechterkolom: Vr – Zo */}
        <div>
          <div style={columnHeaderStyle}>Vr – Zo</div>
          {COL_RIGHT.map(i => (
            <DayBlock
              key={i}
              day={days[i]}
              events={eventsByDay[i]}
              isToday={isSameDay(days[i].date, today)}
              onEventClick={onEventClick}
              locationMap={locationMap}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const navBtn = {
  width: '36px',
  height: '36px',
  borderRadius: '50%',
  border: '1px solid #334155',
  backgroundColor: 'transparent',
  color: '#94a3b8',
  fontSize: '20px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
  lineHeight: 1,
};

const columnHeaderStyle = {
  fontSize: '10px',
  fontWeight: '800',
  color: '#475569',
  textTransform: 'uppercase',
  letterSpacing: '0.6px',
  marginBottom: '8px',
  paddingLeft: '2px',
};
