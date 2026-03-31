/**
 * utils/calendarUtils.js
 *
 * Pure JavaScript helpers for the calendar feature.
 * NO Firestore imports — everything here is deterministic,
 * testable, and runs entirely client-side.
 *
 * Key responsibilities:
 *   1. Generate virtual event objects from recurring templates
 *   2. Merge virtual events with real exception documents
 *   3. Build deterministic event IDs for recurring instances
 *   4. Check-in window calculation
 *   5. Date/time formatting helpers
 */

// ─── Constants ─────────────────────────────────────────────────────────────────

export const EVENT_TYPES = {
  training:   { label: 'Training',      color: '#3b82f6', bg: '#3b82f622', border: '#3b82f644' },
  club_event: { label: 'Club evenement', color: '#a78bfa', bg: '#a78bfa22', border: '#a78bfa44' },
  competition:{ label: 'Wedstrijd',     color: '#f97316', bg: '#f9731622', border: '#f9731644' },
};

export const EVENT_STATUS = {
  scheduled:  'scheduled',
  cancelled:  'cancelled',
  modified:   'modified',
};

// Colour override for special trainings and cancelled
export const SPECIAL_COLOR  = '#22c55e';
export const CANCELLED_COLOR = '#ef4444';

// Days of week: 0=Monday … 6=Sunday (matching the data model)
// Note: JS Date.getDay() returns 0=Sunday, 1=Monday … 6=Saturday
// We convert internally: our 0=Monday maps to JS 1=Monday
const OUR_DAY_TO_JS = [1, 2, 3, 4, 5, 6, 0]; // ourDay -> jsDay

// ─── ID helpers ───────────────────────────────────────────────────────────────

/**
 * Pad a number to two digits.
 */
function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Format a Date object as 'YYYYMMDD' string.
 */
export function formatDateKey(date) {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
}

/**
 * Build the deterministic Firestore document ID for a recurring event instance.
 * Pattern: `${templateId}_${YYYYMMDD}`
 *
 * @param {string} templateId
 * @param {Date}   date         The calendar date of this instance
 * @returns {string}
 */
export function buildEventId(templateId, date) {
  return `${templateId}_${formatDateKey(date)}`;
}

/**
 * Parse a 'YYYYMMDD' suffix back into a Date object.
 * Useful when you have an eventId and need the date.
 */
export function parseDateFromEventId(eventId) {
  const parts = eventId.split('_');
  const dateStr = parts[parts.length - 1]; // last segment
  if (!/^\d{8}$/.test(dateStr)) return null;
  const y = parseInt(dateStr.slice(0, 4));
  const m = parseInt(dateStr.slice(4, 6)) - 1;
  const d = parseInt(dateStr.slice(6, 8));
  return new Date(y, m, d);
}

// ─── Date/time helpers ────────────────────────────────────────────────────────

/**
 * Parse a "HH:MM" string and apply it to a given Date, returning a new Date.
 */
export function applyTimeToDate(date, timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

/**
 * Format a timestamp (Firestore seconds or JS ms) as a localised date string.
 * @param {object|number} ts  Firestore timestamp or milliseconds
 * @param {'date'|'time'|'datetime'|'daymonth'} format
 */
export function formatTs(ts, fmt = 'datetime') {
  if (!ts) return '—';
  const ms = ts?.seconds ? ts.seconds * 1000 : Number(ts);
  if (isNaN(ms)) return '—';
  const d = new Date(ms);
  switch (fmt) {
    case 'date':
      return d.toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' });
    case 'daymonth':
      return d.toLocaleDateString('nl-BE', { weekday: 'short', day: '2-digit', month: 'short' });
    case 'time':
      return d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
    case 'datetime':
    default:
      return d.toLocaleDateString('nl-BE', {
        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
      }) + ' · ' + d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
  }
}

/**
 * Returns a Date object for midnight (00:00:00.000) of the given date.
 */
export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Returns a Date object for 23:59:59.999 of the given date.
 */
export function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Returns the first day of the month containing `date`.
 */
export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

/**
 * Returns the last day of the month containing `date`.
 */
export function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

/**
 * Returns the Monday of the week containing `date`.
 */
export function startOfWeek(date) {
  const d = new Date(date);
  const jsDay = d.getDay(); // 0=Sun
  const diff = jsDay === 0 ? -6 : 1 - jsDay; // shift to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Returns the Sunday of the week containing `date`.
 */
export function endOfWeek(date) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Add `days` days to a Date, returning a new Date.
 */
export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * True if two Dates fall on the same calendar day.
 */
export function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate()
  );
}

// ─── Recurring generation ─────────────────────────────────────────────────────

/**
 * Given a list of active EventTemplate objects and a date range,
 * produce an array of "virtual" event objects (not Firestore documents).
 *
 * Virtual events have the same shape as real calendarEvent documents
 * but with `_virtual: true` so callers can distinguish them.
 *
 * @param {object[]} templates   Array of EventTemplate docs (with .id)
 * @param {Date}     rangeStart  Inclusive start of the date range
 * @param {Date}     rangeEnd    Inclusive end of the date range
 * @returns {object[]}           Array of virtual event objects
 */
export function generateVirtualEvents(templates, rangeStart, rangeEnd) {
  const result = [];
  const rsMs = rangeStart.getTime();
  const reMs = rangeEnd.getTime();

  for (const tpl of templates) {
    if (!tpl.isActive) continue;
    const rec = tpl.recurrence;
    if (!rec) continue;

    // Parse template start/end dates
    const tplStart = new Date(rec.startDate + 'T00:00:00');
    const tplEnd   = rec.endDate ? new Date(rec.endDate + 'T23:59:59') : null;

    // The window to iterate is the intersection of [rangeStart,rangeEnd]
    // and [tplStart, tplEnd]
    const iterStart = tplStart > rangeStart ? tplStart : rangeStart;
    const iterEnd   = tplEnd && tplEnd < rangeEnd ? tplEnd : rangeEnd;

    if (iterStart > iterEnd) continue;

    if (rec.frequency === 'none') {
      // Single occurrence — use startDate as the date
      const eventDate = tplStart;
      if (eventDate >= rangeStart && eventDate <= rangeEnd) {
        result.push(_buildVirtual(tpl, eventDate));
      }
      continue;
    }

    // Iterate day by day across the range
    let cursor = startOfDay(iterStart);
    while (cursor <= iterEnd) {
      const jsDay = cursor.getDay(); // 0=Sun … 6=Sat
      // Convert JS day to our day index (0=Mon … 6=Sun)
      const ourDay = jsDay === 0 ? 6 : jsDay - 1;

      let include = false;

      if (rec.frequency === 'weekly' || rec.frequency === 'biweekly') {
        if ((rec.daysOfWeek || []).includes(ourDay)) {
          if (rec.frequency === 'biweekly') {
            // Biweekly: count full weeks since template start, include only even weeks
            const weeksSinceStart = Math.floor(
              (startOfDay(cursor) - startOfDay(tplStart)) / (7 * 24 * 60 * 60 * 1000)
            );
            include = weeksSinceStart % 2 === 0;
          } else {
            include = true;
          }
        }
      } else if (rec.frequency === 'monthly') {
        // Monthly: same day-of-month as template start
        include = cursor.getDate() === tplStart.getDate();
      }

      if (include) {
        // Apply the time from recurrence.startTime
        const eventDate = applyTimeToDate(cursor, rec.startTime || '00:00');
        const eventDateMs = eventDate.getTime();
        if (eventDateMs >= rsMs && eventDateMs <= reMs) {
          result.push(_buildVirtual(tpl, cursor));
        }
      }

      cursor = addDays(cursor, 1);
    }
  }

  return result;
}

/**
 * Build a single virtual event object from a template + a concrete date.
 */
function _buildVirtual(tpl, date) {
  const rec = tpl.recurrence;
  const startAt = applyTimeToDate(date, rec.startTime || '00:00');
  const endAt   = new Date(startAt.getTime() + (rec.durationMin || 60) * 60 * 1000);
  const id      = buildEventId(tpl.id, date);

  return {
    _virtual:        true,
    id,
    templateId:      tpl.id,
    type:            tpl.type            || 'training',
    title:           tpl.title           || '',
    groupIds:        tpl.groupIds        || [],
    locationId:      tpl.locationId      || null,
    locationNote:    '',
    startAt:         { seconds: Math.floor(startAt.getTime() / 1000) },
    endAt:           { seconds: Math.floor(endAt.getTime()   / 1000) },
    status:          'scheduled',
    cancelReason:    '',
    isSpecial:       false,
    specialLabel:    '',
    coachMemberIds:  tpl.defaultCoachMemberIds || [],
    substituteNotes: '',
    notes:           '',
    memberNotes:     '',
    prepId:          null,
    competitionDetails: null,
    color:           tpl.color || null,
    createdAt:       tpl.createdAt || null,
    createdBy:       tpl.createdBy || null,
  };
}

// ─── Exception merging ────────────────────────────────────────────────────────

/**
 * Merge virtual events with real Firestore exception/standalone documents.
 *
 * Rules:
 *   - If a real doc has the same ID as a virtual event → real doc wins
 *   - Real docs with templateId=null are standalone events (always included)
 *   - Virtual events with no matching real doc are included as-is
 *
 * @param {object[]} virtualEvents   Output of generateVirtualEvents()
 * @param {object[]} realDocs        Firestore calendarEvent documents
 * @returns {object[]}               Sorted by startAt ascending
 */
export function mergeWithExceptions(virtualEvents, realDocs) {
  // Build a lookup of real docs by ID
  const realById = {};
  for (const doc of realDocs) {
    realById[doc.id] = doc;
  }

  // Build set of real-doc IDs that are exceptions (have templateId)
  const exceptionIds = new Set(
    realDocs.filter(d => d.templateId).map(d => d.id)
  );

  const merged = [];

  // 1. Add virtual events, replacing with real exception docs where they exist
  for (const virt of virtualEvents) {
    if (realById[virt.id]) {
      // Exception exists — use the real doc (may be cancelled / modified)
      merged.push({ ...realById[virt.id], _virtual: false });
    } else {
      merged.push(virt);
    }
  }

  // 2. Add standalone real docs (templateId === null) that aren't already in merged
  const mergedIds = new Set(merged.map(e => e.id));
  for (const doc of realDocs) {
    if (!doc.templateId && !mergedIds.has(doc.id)) {
      merged.push({ ...doc, _virtual: false });
    }
  }

  // 3. Sort by startAt ascending
  merged.sort((a, b) => {
    const aMs = (a.startAt?.seconds || 0) * 1000;
    const bMs = (b.startAt?.seconds || 0) * 1000;
    return aMs - bMs;
  });

  return merged;
}

// ─── Event colour helpers ─────────────────────────────────────────────────────

/**
 * Returns the display colour for an event.
 * Priority: custom template colour → status override → type colour
 */
export function getEventColor(event) {
  if (event.status === 'cancelled') return CANCELLED_COLOR;
  if (event.isSpecial) return SPECIAL_COLOR;
  if (event.color) return event.color;
  return EVENT_TYPES[event.type]?.color || '#3b82f6';
}

/**
 * Returns background + border colours for an event card.
 */
export function getEventStyle(event) {
  const color = getEventColor(event);
  return {
    color,
    bg:     color + '22',
    border: color + '44',
  };
}

// ─── Check-in helpers ─────────────────────────────────────────────────────────

/**
 * Returns true if the check-in window is currently open for an event.
 * Window: [startAt − 30min, startAt + 30min]
 */
export function isCheckInOpen(event) {
  if (!event?.startAt) return false;
  const now    = Date.now();
  const startMs = (event.startAt.seconds || 0) * 1000;
  return now >= startMs - 30 * 60 * 1000 && now <= startMs + 30 * 60 * 1000;
}

/**
 * Returns true if a member can still self-report as absent (excused).
 * Allowed until the event's start time.
 */
export function canSelfExcuse(event) {
  if (!event?.startAt) return false;
  return Date.now() < (event.startAt.seconds || 0) * 1000;
}

// ─── Grouping helpers (for list/week/month views) ────────────────────────────

/**
 * Group an array of events by calendar date (YYYY-MM-DD key).
 * @param {object[]} events
 * @returns {Object.<string, object[]>}
 */
export function groupEventsByDate(events) {
  const groups = {};
  for (const event of events) {
    if (!event.startAt) continue;
    const d    = new Date((event.startAt.seconds || 0) * 1000);
    const key  = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(event);
  }
  return groups;
}

/**
 * Filter events to only those visible to a specific set of groupIds.
 * An event is visible if it has at least one groupId in common,
 * OR if its groupIds array is empty (club-wide event).
 */
export function filterEventsForMember(events, memberGroupIds) {
  const gidSet = new Set(memberGroupIds);
  return events.filter(e => {
    if (!e.groupIds || e.groupIds.length === 0) return true; // club-wide
    return e.groupIds.some(gid => gidSet.has(gid));
  });
}

/**
 * Returns the next N upcoming events from a sorted event list,
 * starting from now.
 */
export function getUpcomingEvents(events, n = 5) {
  const now = Date.now();
  return events
    .filter(e => (e.startAt?.seconds || 0) * 1000 >= now - 60 * 60 * 1000) // include events started up to 1hr ago
    .slice(0, n);
}

// ─── Duration helpers ─────────────────────────────────────────────────────────

/**
 * Format a duration in minutes as a human-readable string.
 * e.g. 90 → "1u30"
 */
export function formatDuration(minutes) {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}u`;
  return `${h}u${pad2(m)}`;
}

/**
 * Compute duration in minutes between two Firestore timestamps.
 */
export function durationFromEvent(event) {
  if (!event?.startAt || !event?.endAt) return null;
  const startMs = (event.startAt.seconds || 0) * 1000;
  const endMs   = (event.endAt.seconds   || 0) * 1000;
  return Math.round((endMs - startMs) / 60000);
}

// ─── Recurrence label ─────────────────────────────────────────────────────────

const DAY_LABELS_NL = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

/**
 * Build a human-readable recurrence summary in Dutch.
 * e.g. "Wekelijks op ma, wo" / "Tweewekelijks op di" / "Eenmalig"
 */
export function recurrenceLabel(recurrence) {
  if (!recurrence) return '';
  const { frequency, daysOfWeek, startDate, endDate } = recurrence;

  let base = '';
  if (frequency === 'none')      base = 'Eenmalig';
  else if (frequency === 'weekly')    base = 'Wekelijks';
  else if (frequency === 'biweekly')  base = 'Tweewekelijks';
  else if (frequency === 'monthly')   base = 'Maandelijks';

  const days = (daysOfWeek || [])
    .sort((a, b) => a - b)
    .map(d => DAY_LABELS_NL[d] || '')
    .filter(Boolean)
    .join(', ');

  if (days && frequency !== 'none' && frequency !== 'monthly') {
    base += ` op ${days}`;
  }

  if (endDate) {
    const end = new Date(endDate + 'T00:00:00');
    base += ` t/m ${end.toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  }

  return base;
}
