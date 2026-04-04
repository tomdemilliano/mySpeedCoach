/**
 * components/calendar/CalendarWeekView.js
 *
 * Week view: 2 kolommen (Ma–Do links, Vr–Zo rechts).
 * Vaste breedte/hoogte per dagvak. Max 2 events zichtbaar,
 * overflow-indicator bij meer. Weeknummer in leeg vak onder Zo.
 *
 * Props:
 *   events           : calendarEvent[]
 *   locationMap      : { [locationId]: location }
 *   currentWeekStart : Date  — Monday of the displayed week
 *   onPrev           : () => void
 *   onNext           : () => void
 *   onToday          : () => void
 *   onEventClick     : (event) => void
 */

import { getEventColor, formatDuration, durationFromEvent, isSameDay, addDays } from '../../utils/calendarUtils';

const DAYS_NL_FULL = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];
const MONTH_NL     = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];

const MAX_VISIBLE = 2;    // max events getoond per dag
const CELL_HEIGHT = 130;  // px — vaste hoogte per dagvak

// ISO weeknummer
function getISOWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

// ─── Enkel dagvak ─────────────────────────────────────────────────────────────
function DayCell({ dayIndex, date, events, isToday, onEventClick }) {
  const visible  = events.slice(0, MAX_VISIBLE);
  const overflow = events.length - MAX_VISIBLE;

  return (
    <div style={{
      height:          `${CELL_HEIGHT}px`,
      backgroundColor: isToday ? '#22c55e0d' : '#1e293b',
      border:          `1px solid ${isToday ? '#22c55e44' : '#334155'}`,
      borderRadius:    '10px',
      overflow:        'hidden',
      display:         'flex',
      flexDirection:   'column',
      boxSizing:       'border-box',
    }}>
      {/* Dag-header */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '6px 8px 5px',
        borderBottom:   `1px solid ${isToday ? '#22c55e22' : '#0f172a'}`,
        flexShrink:     0,
      }}>
        <span style={{
          fontSize:      '10px',
          fontWeight:    '700',
          color:         isToday ? '#22c55e' : '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.4px',
        }}>
          {DAYS_NL_FULL[dayIndex].slice(0, 2)}
        </span>
        <span style={{
          fontSize:     '14px',
          fontWeight:   '900',
          color:        isToday ? '#22c55e' : '#f1f5f9',
          lineHeight:   1,
          background:   isToday ? '#22c55e22' : 'transparent',
          borderRadius: '6px',
          padding:      isToday ? '1px 5px' : '0',
        }}>
          {date.getDate()}
        </span>
      </div>

      {/* Events */}
      <div style={{
        flex:          1,
        padding:       '4px 5px',
        overflow:      'hidden',
        display:       'flex',
        flexDirection: 'column',
        gap:           '2px',
      }}>
        {visible.map(event => {
          const color       = getEventColor(event);
          const isCancelled = event.status === 'cancelled';
          const startMs     = (event.startAt?.seconds || 0) * 1000;
          const timeStr     = new Date(startMs).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });

          return (
            <button
              key={event.id}
              onClick={() => onEventClick(event)}
              title={event.title}
              style={{
                display:         'flex',
                alignItems:      'center',
                gap:             '4px',
                width:           '100%',
                padding:         '3px 5px',
                borderRadius:    '5px',
                border:          'none',
                borderLeft:      `2px solid ${color}`,
                backgroundColor: color + '18',
                cursor:          'pointer',
                fontFamily:      'inherit',
                opacity:         isCancelled ? 0.5 : 1,
                flexShrink:      0,
                textAlign:       'left',
                boxSizing:       'border-box',
              }}
            >
              <span style={{
                fontSize:   '10px',
                fontWeight: '700',
                color:      color,
                flexShrink: 0,
                lineHeight: 1,
              }}>
                {timeStr}
              </span>
              <span style={{
                fontSize:       '11px',
                fontWeight:     '600',
                color:          isCancelled ? '#475569' : '#e2e8f0',
                overflow:       'hidden',
                textOverflow:   'ellipsis',
                whiteSpace:     'nowrap',
                flex:           1,
                lineHeight:     1.2,
                textDecoration: isCancelled ? 'line-through' : 'none',
              }}>
                {event.title}
              </span>
              {((event.prepIds?.length > 0) || event.prepId) && (
                <span style={{ fontSize: '8px', flexShrink: 0, color: '#a78bfa' }}>✨</span>
              )}
            </button>
          );
        })}

        {/* Lege dag */}
        {events.length === 0 && (
          <div style={{
            flex:           1,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
          }}>
            <span style={{ fontSize: '10px', color: '#1e3a4a' }}>—</span>
          </div>
        )}

        {/* Overflow */}
        {overflow > 0 && (
          <div style={{
            fontSize:        '10px',
            fontWeight:      '700',
            color:           '#64748b',
            padding:         '2px 5px',
            borderRadius:    '4px',
            backgroundColor: '#33415540',
            textAlign:       'center',
            flexShrink:      0,
          }}>
            +{overflow} meer
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Weeknummer-vak ────────────────────────────────────────────────────────────
function WeekNumberCell({ weekNumber }) {
  return (
    <div style={{
      height:          `${CELL_HEIGHT}px`,
      backgroundColor: '#111827',
      border:          '1px dashed #1e293b',
      borderRadius:    '10px',
      display:         'flex',
      flexDirection:   'column',
      alignItems:      'center',
      justifyContent:  'center',
      gap:             '2px',
      boxSizing:       'border-box',
    }}>
      <span style={{
        fontSize:      '9px',
        fontWeight:    '700',
        color:         '#1e3a4a',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}>
        week
      </span>
      <span style={{
        fontSize:   '32px',
        fontWeight: '900',
        color:      '#1e3050',
        lineHeight: 1,
      }}>
        {weekNumber}
      </span>
    </div>
  );
}

// ─── Hoofdcomponent ────────────────────────────────────────────────────────────
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

  const days = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));

  const eventsByDay = days.map(day =>
    events
      .filter(e => {
        const d = new Date((e.startAt?.seconds || 0) * 1000);
        return isSameDay(d, day);
      })
      .sort((a, b) => (a.startAt?.seconds || 0) - (b.startAt?.seconds || 0))
  );

  const weekStart  = days[0];
  const weekEnd    = days[6];
  const weekNumber = getISOWeek(weekStart);
  const sameMonth  = weekStart.getMonth() === weekEnd.getMonth();
  const weekLabel  = sameMonth
    ? `${weekStart.getDate()} – ${weekEnd.getDate()} ${MONTH_NL[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`
    : `${weekStart.getDate()} ${MONTH_NL[weekStart.getMonth()]} – ${weekEnd.getDate()} ${MONTH_NL[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;

  return (
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
      {/* Navigatie */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <button onClick={onPrev} style={navBtn}>‹</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#f1f5f9' }}>{weekLabel}</div>
          <div style={{ fontSize: '11px', color: '#475569', marginTop: '1px' }}>Week {weekNumber}</div>
        </div>
        <button onClick={onNext} style={navBtn}>›</button>
      </div>

      {/* Vandaag-knop */}
      <div style={{ textAlign: 'center', marginBottom: '12px' }}>
        <button onClick={onToday} style={todayBtn}>Vandaag</button>
      </div>

      {/* 2-kolommen grid */}
      <div style={{
        display:             'grid',
        gridTemplateColumns: '1fr 1fr',
        gap:                 '8px',
        width:               '100%',
        boxSizing:           'border-box',
      }}>
        {/* Links: Ma – Do */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
          <div style={colHeader}>Ma – Do</div>
          {[0, 1, 2, 3].map(i => (
            <DayCell
              key={i}
              dayIndex={i}
              date={days[i]}
              events={eventsByDay[i]}
              isToday={isSameDay(days[i], today)}
              onEventClick={onEventClick}
            />
          ))}
        </div>

        {/* Rechts: Vr – Zo + weeknummer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
          <div style={colHeader}>Vr – Zo</div>
          {[4, 5, 6].map(i => (
            <DayCell
              key={i}
              dayIndex={i}
              date={days[i]}
              events={eventsByDay[i]}
              isToday={isSameDay(days[i], today)}
              onEventClick={onEventClick}
            />
          ))}
          <WeekNumberCell weekNumber={weekNumber} />
        </div>
      </div>
    </div>
  );
}

// ─── Stijlen ──────────────────────────────────────────────────────────────────
const navBtn = {
  width:           '36px',
  height:          '36px',
  borderRadius:    '50%',
  border:          '1px solid #334155',
  backgroundColor: 'transparent',
  color:           '#94a3b8',
  fontSize:        '20px',
  cursor:          'pointer',
  display:         'flex',
  alignItems:      'center',
  justifyContent:  'center',
  fontFamily:      'inherit',
  lineHeight:      1,
};

const todayBtn = {
  padding:         '5px 16px',
  borderRadius:    '20px',
  border:          '1px solid #334155',
  backgroundColor: 'transparent',
  color:           '#64748b',
  fontSize:        '12px',
  fontWeight:      '600',
  cursor:          'pointer',
  fontFamily:      'inherit',
};

const colHeader = {
  fontSize:      '10px',
  fontWeight:    '800',
  color:         '#334155',
  textTransform: 'uppercase',
  letterSpacing: '0.6px',
  paddingLeft:   '2px',
};
