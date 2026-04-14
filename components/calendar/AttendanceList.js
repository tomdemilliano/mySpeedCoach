/**
 * components/calendar/AttendanceList.js
 *
 * Coach tick-lijst: toont alle leden van de event-groepen
 * met hun aanwezigheidsstatus. Coach kan elk lid markeren
 * als aanwezig, afwezig of afgemeld.
 *
 * Props:
 *   event        : calendarEvent object
 *   clubId       : string
 *   coachUid     : string   — Firebase Auth uid van de coach
 *   groups       : group[]  — alle groepen van de club
 *   onClose      : () => void
 */

import { useState, useEffect } from 'react';
import {
  CheckCircle2, XCircle, AlertCircle, Clock,
  Users, X, ChevronDown, ChevronUp, Search,
} from 'lucide-react';
import { GroupFactory, ClubMemberFactory, AttendanceFactory } from '../../constants/dbSchema';
import { formatTs } from '../../utils/calendarUtils';

const STATUS_CONFIG = {
  present:           { label: 'Aanwezig',       color: '#22c55e', icon: CheckCircle2 },
  registered_absent: { label: 'Afwezig',         color: '#ef4444', icon: XCircle      },
  excused:           { label: 'Afgemeld',         color: '#f59e0b', icon: AlertCircle  },
  absent:            { label: 'Geen melding',     color: '#475569', icon: Clock        },
};

function StatusPill({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.absent;
  const Icon = cfg.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: '700',
      backgroundColor: cfg.color + '22', color: cfg.color, border: `1px solid ${cfg.color}44`,
    }}>
      <Icon size={9} /> {cfg.label}
    </span>
  );
}

function MemberRow({ member, attendance, onMark, loading }) {
  const status = attendance?.status || 'absent';
  const initials = `${member.firstName?.[0] || ''}${member.lastName?.[0] || ''}`.toUpperCase();

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '10px 12px',
      borderBottom: '1px solid #0f172a',
    }}>
      {/* Avatar */}
      <div style={{
        width: '32px', height: '32px', borderRadius: '50%',
        backgroundColor: '#334155', display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: '11px', fontWeight: '700',
        color: '#94a3b8', flexShrink: 0,
      }}>
        {initials || '?'}
      </div>

      {/* Name + status */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {member.firstName} {member.lastName}
        </div>
        {attendance?.absentReason && (
          <div style={{ fontSize: '10px', color: '#64748b', marginTop: '1px', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            "{attendance.absentReason}"
          </div>
        )}
        {attendance?.checkedInAt && (
          <div style={{ fontSize: '10px', color: '#475569', marginTop: '1px' }}>
            {formatTs(attendance.checkedInAt, 'time')}
            {attendance.selfCheckedIn ? ' · zelf' : ' · coach'}
          </div>
        )}
      </div>

      {/* Status display */}
      <StatusPill status={status} />

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
        <button
          onClick={() => onMark(member.id, 'present')}
          disabled={loading || status === 'present'}
          title="Aanwezig"
          style={{
            width: '28px', height: '28px', borderRadius: '7px', border: 'none',
            backgroundColor: status === 'present' ? '#22c55e' : '#22c55e22',
            color: status === 'present' ? 'white' : '#22c55e',
            cursor: loading || status === 'present' ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: loading ? 0.5 : 1, transition: 'all 0.12s',
          }}
        >
          <CheckCircle2 size={14} />
        </button>
        <button
          onClick={() => onMark(member.id, 'registered_absent')}
          disabled={loading || status === 'registered_absent'}
          title="Afwezig"
          style={{
            width: '28px', height: '28px', borderRadius: '7px', border: 'none',
            backgroundColor: status === 'registered_absent' ? '#ef4444' : '#ef444422',
            color: status === 'registered_absent' ? 'white' : '#ef4444',
            cursor: loading || status === 'registered_absent' ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: loading ? 0.5 : 1, transition: 'all 0.12s',
          }}
        >
          <XCircle size={14} />
        </button>
      </div>
    </div>
  );
}

export default function AttendanceList({ event, clubId, coachUid, groups, onClose }) {
  const [members,    setMembers]    = useState([]);
  const [attendance, setAttendance] = useState({}); // { memberId: attendanceDoc }
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(null); // memberId being saved
  const [search,     setSearch]     = useState('');
  const [stats,      setStats]      = useState({ present: 0, absent: 0, excused: 0, total: 0 });

  // ── Load members for this event's groups ──────────────────────────────────
  useEffect(() => {
    if (!event || !clubId) return;
    let cancelled = false;

    const loadMembers = async () => {
      const relevantGroupIds = event.groupIds || [];
      const memberMap = {};

      for (const group of groups) {
        if (relevantGroupIds.length > 0 && !relevantGroupIds.includes(group.id)) continue;
        const groupMembers = await GroupFactory.getMembersByGroupOnce(clubId, group.id);
        for (const gm of groupMembers) {
          if (!gm.isSkipper) continue;
          if (!memberMap[gm.memberId || gm.id]) {
            const snap = await ClubMemberFactory.getById(clubId, gm.memberId || gm.id);
            if (snap.exists()) {
              memberMap[snap.id] = { id: snap.id, ...snap.data() };
            }
          }
        }
      }

      if (!cancelled) {
        setMembers(Object.values(memberMap).sort((a, b) =>
          `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`)
        ));
        setLoading(false);
      }
    };

    loadMembers().catch(console.error);
    return () => { cancelled = true; };
  }, [event?.id, clubId, groups]);

  // ── Subscribe to attendance for this event ────────────────────────────────
  const [materializedId, setMaterializedId] = useState(event?._virtual ? null : event?.id);
  
  useEffect(() => {
    const eventId = materializedId;
    if (!eventId || !clubId) return;
    
    const unsub = AttendanceFactory.getForEvent(clubId, eventId, (docs) => {
      const map = {};
      docs.forEach(d => { map[d.memberId] = d; });
      setAttendance(map);
    });
    return () => unsub();
  }, [materializedId, clubId]);

  // ── Compute stats ─────────────────────────────────────────────────────────
  useEffect(() => {
    const total   = members.length;
    const present = members.filter(m => attendance[m.id]?.status === 'present').length;
    const excused = members.filter(m => attendance[m.id]?.status === 'excused').length;
    const absent  = total - present - excused;
    setStats({ total, present, absent, excused });
  }, [members, attendance]);

// Nieuw:
  const handleMark = async (memberId, status) => {
    setSaving(memberId);
    try {
      if (event._virtual && !materializedId) {
        const { CalendarEventFactory } = await import('../../constants/dbSchema');
        await CalendarEventFactory.materializeVirtual(clubId, event, {}, coachUid);
        setMaterializedId(event.id); // start de subscription
      }
      if (status === 'present') {
        await AttendanceFactory.coachCheckIn(clubId, event.id, memberId, coachUid);
      } else {
        await AttendanceFactory.coachMarkAbsent(clubId, event.id, memberId, coachUid);
      }
    } catch (e) {
      console.error('[AttendanceList] mark error:', e);
    } finally {
      setSaving(null);
    }
  };

  const filteredMembers = members.filter(m =>
    !search || `${m.firstName} ${m.lastName}`.toLowerCase().includes(search.toLowerCase())
  );

  const startMs = (event?.startAt?.seconds || 0) * 1000;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 450,
      display: 'flex', flexDirection: 'column',
      backgroundColor: '#0f172a',
    }}>
      {/* Header */}
      <div style={{
        backgroundColor: '#1e293b', borderBottom: '1px solid #334155',
        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px',
        flexShrink: 0,
      }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px', display: 'flex' }}>
          <X size={20} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: '800', fontSize: '15px', color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Aanwezigheid
          </div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>
            {event?.title} · {new Date(startMs).toLocaleDateString('nl-BE', { weekday: 'short', day: '2-digit', month: 'short' })}
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{
        display: 'flex', gap: 0, backgroundColor: '#1e293b',
        borderBottom: '1px solid #334155', flexShrink: 0,
      }}>
        {[
          { label: 'Aanwezig', value: stats.present, color: '#22c55e' },
          { label: 'Afgemeld', value: stats.excused, color: '#f59e0b' },
          { label: 'Afwezig',  value: stats.absent,  color: '#ef4444' },
          { label: 'Totaal',   value: stats.total,   color: '#60a5fa' },
        ].map((s, i) => (
          <div key={s.label} style={{
            flex: 1, padding: '10px 6px', textAlign: 'center',
            borderRight: i < 3 ? '1px solid #334155' : 'none',
          }}>
            <div style={{ fontSize: '18px', fontWeight: '900', color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: '9px', color: '#475569', fontWeight: '600', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #1e293b', flexShrink: 0, backgroundColor: '#1e293b' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #334155', padding: '8px 12px' }}>
          <Search size={14} color="#475569" style={{ flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Zoek lid…"
            style={{ flex: 1, background: 'none', border: 'none', color: 'white', fontSize: '13px', outline: 'none', fontFamily: 'inherit' }}
          />
        </div>
      </div>

      {/* Member list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
            <div style={{ width: '28px', height: '28px', border: '3px solid #1e293b', borderTop: '3px solid #22c55e', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : filteredMembers.length === 0 ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: '#475569', fontSize: '13px' }}>
            {search ? 'Geen leden gevonden.' : 'Geen leden in deze groep(en).'}
          </div>
        ) : (
          filteredMembers.map(member => (
            <MemberRow
              key={member.id}
              member={member}
              attendance={attendance[member.id]}
              onMark={handleMark}
              loading={saving === member.id}
            />
          ))
        )}
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
