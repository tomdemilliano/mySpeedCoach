/**
 * components/calendar/AttendanceReport.js
 *
 * Rapportage-component voor de kalender-admin pagina.
 * Twee sub-tabs:
 *   1. Aanwezigheidsmatrix  — rijen=leden, kolommen=trainingen, cellen=status
 *   2. Coach-overzicht      — per coach: aantal trainingen in periode
 *
 * Props:
 *   clubId    : string
 *   groups    : group[]
 *   locations : location[]
 */

import { useState, useEffect } from 'react';
import { Calendar, Users, ChevronDown, ChevronUp, Download } from 'lucide-react';
import {
  CalendarEventFactory, AttendanceFactory,
  GroupFactory, ClubMemberFactory,
} from '../constants/dbSchema';
import { startOfDay, endOfDay, addDays } from '../utils/calendarUtils';

const MONTH_NL = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];

function pad2(n) { return String(n).padStart(2, '0'); }

function dateRangeDefaults() {
  const now  = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: `${from.getFullYear()}-${pad2(from.getMonth()+1)}-${pad2(from.getDate())}`,
    to:   `${to.getFullYear()}-${pad2(to.getMonth()+1)}-${pad2(to.getDate())}`,
  };
}

const STATUS_CELL = {
  present:           { symbol: '✓', color: '#22c55e', bg: '#22c55e22', title: 'Aanwezig' },
  excused:           { symbol: '~', color: '#f59e0b', bg: '#f59e0b22', title: 'Afgemeld' },
  registered_absent: { symbol: '✗', color: '#ef4444', bg: '#ef444422', title: 'Afwezig (coach)' },
  absent:            { symbol: '·', color: '#334155', bg: 'transparent', title: 'Geen data' },
};

// ─── Aanwezigheidsmatrix ──────────────────────────────────────────────────────
function PresenceMatrix({ clubId, groups }) {
  const def = dateRangeDefaults();
  const [from,     setFrom]     = useState(def.from);
  const [to,       setTo]       = useState(def.to);
  const [groupId,  setGroupId]  = useState('');
  const [events,   setEvents]   = useState([]);
  const [members,  setMembers]  = useState([]);
  const [attMap,   setAttMap]   = useState({}); // { eventId: { memberId: status } }
  const [loading,  setLoading]  = useState(false);

  const load = async () => {
    if (!clubId || !from || !to) return;
    setLoading(true);
    try {
      const startTs = { seconds: Math.floor(startOfDay(new Date(from + 'T00:00:00')).getTime() / 1000) };
      const endTs   = { seconds: Math.floor(endOfDay(  new Date(to   + 'T00:00:00')).getTime() / 1000) };

      // Events in range, filter by group
      const evDocs = await CalendarEventFactory.getEventsInRangeOnce(clubId, startTs, endTs);
      const filtered = evDocs
        .filter(e => e.status !== 'cancelled')
        .filter(e => !groupId || (e.groupIds || []).includes(groupId))
        .sort((a, b) => (a.startAt?.seconds || 0) - (b.startAt?.seconds || 0));
      setEvents(filtered);

      // Members in selected group(s)
      const memberMap = {};
      const targetGroups = groupId
        ? groups.filter(g => g.id === groupId)
        : groups;
      for (const g of targetGroups) {
        const gMembers = await GroupFactory.getMembersByGroupOnce(clubId, g.id);
        for (const gm of gMembers) {
          if (!gm.isSkipper) continue;
          const mid = gm.memberId || gm.id;
          if (!memberMap[mid]) {
            const snap = await ClubMemberFactory.getById(clubId, mid);
            if (snap.exists()) memberMap[mid] = { id: snap.id, ...snap.data() };
          }
        }
      }
      const sortedMembers = Object.values(memberMap).sort((a, b) =>
        `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`)
      );
      setMembers(sortedMembers);

      // Attendance per event
      const newAttMap = {};
      for (const ev of filtered) {
        const attDocs = await AttendanceFactory.getForEventOnce(clubId, ev.id);
        newAttMap[ev.id] = {};
        for (const att of attDocs) {
          newAttMap[ev.id][att.memberId] = att.status;
        }
      }
      setAttMap(newAttMap);
    } catch (e) {
      console.error('[PresenceMatrix]', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'flex-end' }}>
        <div>
          <div style={labelStyle}>Van</div>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={labelStyle}>Tot</div>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} min={from} style={inputStyle} />
        </div>
        <div>
          <div style={labelStyle}>Groep</div>
          <select value={groupId} onChange={e => setGroupId(e.target.value)} style={inputStyle}>
            <option value="">Alle groepen</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <button onClick={load} disabled={loading} style={{ padding: '9px 16px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', opacity: loading ? 0.65 : 1 }}>
          {loading ? 'Laden…' : 'Rapport genereren'}
        </button>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
        {Object.entries(STATUS_CELL).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#64748b' }}>
            <span style={{ fontWeight: '800', color: v.color, width: '14px', textAlign: 'center' }}>{v.symbol}</span>
            {v.title}
          </div>
        ))}
      </div>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <div style={{ width: '28px', height: '28px', border: '3px solid #1e293b', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      )}

      {!loading && events.length === 0 && members.length === 0 && (
        <div style={{ padding: '32px', textAlign: 'center', color: '#475569', fontSize: '13px' }}>
          Selecteer een periode en klik op "Rapport genereren".
        </div>
      )}

      {!loading && events.length > 0 && members.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '12px', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: 'left', minWidth: '140px', position: 'sticky', left: 0, backgroundColor: '#0f172a', zIndex: 2 }}>
                  Lid
                </th>
                {events.map(ev => {
                  const d = new Date((ev.startAt?.seconds || 0) * 1000);
                  return (
                    <th key={ev.id} style={{ ...thStyle, maxWidth: '60px', whiteSpace: 'nowrap' }} title={ev.title}>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>{pad2(d.getDate())} {MONTH_NL[d.getMonth()]}</div>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '56px', color: '#94a3b8', fontWeight: '600', fontSize: '9px' }}>
                        {ev.title.length > 10 ? ev.title.slice(0, 9) + '…' : ev.title}
                      </div>
                    </th>
                  );
                })}
                <th style={{ ...thStyle, color: '#22c55e' }}>%</th>
              </tr>
            </thead>
            <tbody>
              {members.map(member => {
                const presCount = events.filter(ev =>
                  attMap[ev.id]?.[member.id] === 'present'
                ).length;
                const pct = events.length ? Math.round(presCount / events.length * 100) : 0;

                return (
                  <tr key={member.id} style={{ borderBottom: '1px solid #0f172a' }}>
                    <td style={{ ...tdStyle, position: 'sticky', left: 0, backgroundColor: '#1e293b', zIndex: 1, fontWeight: '600', color: '#f1f5f9' }}>
                      {member.firstName} {member.lastName}
                    </td>
                    {events.map(ev => {
                      const status = attMap[ev.id]?.[member.id] || 'absent';
                      const cfg    = STATUS_CELL[status] || STATUS_CELL.absent;
                      return (
                        <td key={ev.id} style={{ ...tdStyle, textAlign: 'center', backgroundColor: cfg.bg }} title={`${member.firstName} — ${cfg.title}`}>
                          <span style={{ fontWeight: '800', color: cfg.color }}>{cfg.symbol}</span>
                        </td>
                      );
                    })}
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: '700', color: pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444' }}>
                      {pct}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Coach-overzicht ──────────────────────────────────────────────────────────
function CoachOverview({ clubId }) {
  const def = dateRangeDefaults();
  const [from,    setFrom]    = useState(def.from);
  const [to,      setTo]      = useState(def.to);
  const [report,  setReport]  = useState(null); // { coachId: { eventCount, events[] } }
  const [members, setMembers] = useState({});   // { memberId: { firstName, lastName } }
  const [loading, setLoading] = useState(false);
  const [expanded,setExpanded]= useState({}); // { coachId: bool }

  const load = async () => {
    if (!clubId || !from || !to) return;
    setLoading(true);
    try {
      const startTs = { seconds: Math.floor(startOfDay(new Date(from + 'T00:00:00')).getTime() / 1000) };
      const endTs   = { seconds: Math.floor(endOfDay(  new Date(to   + 'T00:00:00')).getTime() / 1000) };

      const rep = await AttendanceFactory.getCoachReport(clubId, startTs, endTs);
      setReport(rep);

      // Fetch member names for all coachIds
      const memberMap = {};
      await Promise.all(Object.keys(rep).map(async (coachId) => {
        const snap = await ClubMemberFactory.getById(clubId, coachId);
        if (snap.exists()) memberMap[coachId] = { id: snap.id, ...snap.data() };
      }));
      setMembers(memberMap);
    } catch (e) {
      console.error('[CoachOverview]', e);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'flex-end' }}>
        <div>
          <div style={labelStyle}>Van</div>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={labelStyle}>Tot</div>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} min={from} style={inputStyle} />
        </div>
        <button onClick={load} disabled={loading} style={{ padding: '9px 16px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', opacity: loading ? 0.65 : 1 }}>
          {loading ? 'Laden…' : 'Rapport genereren'}
        </button>
      </div>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <div style={{ width: '28px', height: '28px', border: '3px solid #1e293b', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      )}

      {!loading && report === null && (
        <div style={{ padding: '32px', textAlign: 'center', color: '#475569', fontSize: '13px' }}>
          Selecteer een periode en klik op "Rapport genereren".
        </div>
      )}

      {!loading && report !== null && Object.keys(report).length === 0 && (
        <div style={{ padding: '32px', textAlign: 'center', color: '#475569', fontSize: '13px' }}>
          Geen coach-data gevonden voor deze periode.
        </div>
      )}

      {!loading && report !== null && Object.keys(report).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {Object.entries(report)
            .sort((a, b) => b[1].eventCount - a[1].eventCount)
            .map(([coachId, data]) => {
              const member = members[coachId];
              const name   = member ? `${member.firstName} ${member.lastName}` : coachId;
              const isOpen = expanded[coachId];

              return (
                <div key={coachId} style={{ backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' }}>
                  <button
                    onClick={() => toggleExpand(coachId)}
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
                  >
                    {/* Avatar */}
                    <div style={{ width: '34px', height: '34px', borderRadius: '50%', backgroundColor: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', color: '#94a3b8', flexShrink: 0 }}>
                      {name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '700', fontSize: '14px', color: '#f1f5f9' }}>{name}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        {data.eventCount} training{data.eventCount !== 1 ? 'en' : ''} als coach
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '20px', fontWeight: '900', color: '#22c55e' }}>{data.eventCount}</span>
                      {isOpen ? <ChevronUp size={16} color="#64748b" /> : <ChevronDown size={16} color="#64748b" />}
                    </div>
                  </button>

                  {isOpen && (
                    <div style={{ borderTop: '1px solid #334155', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {data.events.map((ev, i) => {
                        const d = ev.startAt?.seconds ? new Date(ev.startAt.seconds * 1000) : null;
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 8px', backgroundColor: '#0f172a', borderRadius: '7px' }}>
                            <span style={{ fontSize: '11px', color: '#64748b', flexShrink: 0, minWidth: '60px' }}>
                              {d ? `${pad2(d.getDate())} ${MONTH_NL[d.getMonth()]}` : '—'}
                            </span>
                            <span style={{ fontSize: '12px', color: '#94a3b8', flex: 1 }}>{ev.title}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function AttendanceReport({ clubId, groups }) {
  const [subTab, setSubTab] = useState('matrix');

  const SUB_TABS = [
    { key: 'matrix', label: 'Aanwezigheid', icon: Users    },
    { key: 'coach',  label: 'Coach',         icon: Calendar },
  ];

  return (
    <div>
      {/* Sub-tab bar */}
      <div style={{ display: 'flex', gap: '4px', backgroundColor: '#0f172a', borderRadius: '10px', padding: '3px', border: '1px solid #334155', marginBottom: '20px', width: 'fit-content' }}>
        {SUB_TABS.map(tab => {
          const Icon   = tab.icon;
          const active = subTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setSubTab(tab.key)} style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px',
              borderRadius: '7px', border: 'none', fontFamily: 'inherit',
              backgroundColor: active ? '#1e293b' : 'transparent',
              color: active ? '#f1f5f9' : '#475569',
              fontSize: '13px', fontWeight: active ? '700' : '500', cursor: 'pointer',
            }}>
              <Icon size={14} /> {tab.label}
            </button>
          );
        })}
      </div>

      {subTab === 'matrix' && <PresenceMatrix clubId={clubId} groups={groups} />}
      {subTab === 'coach'  && <CoachOverview  clubId={clubId} />}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ─── Table styles ─────────────────────────────────────────────────────────────
const thStyle = {
  padding: '8px 6px', borderBottom: '2px solid #334155',
  color: '#64748b', fontWeight: '700', fontSize: '11px',
  textTransform: 'uppercase', letterSpacing: '0.3px',
  whiteSpace: 'nowrap',
};
const tdStyle = {
  padding: '7px 6px', borderBottom: '1px solid #0f172a',
  fontSize: '12px', color: '#94a3b8',
};
const labelStyle = {
  fontSize: '11px', fontWeight: '700', color: '#64748b',
  textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '5px',
};
const inputStyle = {
  padding: '9px 10px', borderRadius: '8px', border: '1px solid #334155',
  backgroundColor: '#0f172a', color: 'white', fontSize: '13px', fontFamily: 'inherit',
};
