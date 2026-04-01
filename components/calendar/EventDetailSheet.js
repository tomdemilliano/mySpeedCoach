/**
 * components/calendar/EventDetailSheet.js
 *
 * Bottom-sheet met volledige eventdetails.
 * Leden: inchecken / afmelden
 * Coaches: bewerken, annuleren, aanwezigheidslijst openen
 *
 * Props:
 *   event        : calendarEvent object (real or virtual)
 *   location     : location object | null
 *   memberContext: { clubId, memberId, uid } | null
 *   coachView    : boolean
 *   groups       : group[]       — nodig voor AttendanceList
 *   locations    : location[]    — nodig voor EventFormModal
 *   onClose      : () => void
 *   onEventChanged: () => void   — optioneel: refresh na edit/cancel
 */

import { useState, useEffect } from 'react';
import {
  X, MapPin, Star, Trophy, Dumbbell,
  CheckCircle2, XCircle, AlertCircle,
  Edit2, Trash2, ExternalLink, FileText, Users,
} from 'lucide-react';
import {
  getEventColor, formatDuration,
  durationFromEvent, isCheckInOpen, canSelfExcuse,
} from '../../utils/calendarUtils';
import { AttendanceFactory } from '../../constants/dbSchema';
import EventFormModal   from './EventFormModal';
import AttendanceList   from './AttendanceList';

const TYPE_ICONS  = { training: Dumbbell, club_event: Star, competition: Trophy };
const TYPE_LABELS = { training: 'Training', club_event: 'Club evenement', competition: 'Wedstrijd' };

const STATUS_LABELS = {
  present:           { label: 'Aanwezig',       color: '#22c55e', icon: CheckCircle2 },
  absent:            { label: 'Afwezig',         color: '#ef4444', icon: XCircle      },
  excused:           { label: 'Afgemeld',         color: '#f59e0b', icon: AlertCircle  },
  registered_absent: { label: 'Afwezig (coach)', color: '#ef4444', icon: XCircle      },
};

// ─── Excuse modal ─────────────────────────────────────────────────────────────
function ExcuseModal({ onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 600 }}>
      <div style={{ backgroundColor: '#1e293b', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '560px', border: '1px solid #334155' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', color: '#f1f5f9' }}>Afmelden</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}><X size={18} /></button>
        </div>
        <label style={{ display: 'block', fontSize: '12px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>
          Reden (optioneel)
        </label>
        <textarea
          autoFocus
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="bijv. Ziek, vakantie, andere afspraak…"
          style={{ width: '100%', padding: '11px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px', minHeight: '80px', resize: 'vertical', lineHeight: 1.5, fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: '14px' }}
        />
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => onConfirm(reason)} style={{ flex: 1, padding: '12px', backgroundColor: '#f59e0b', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '700', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <XCircle size={15} /> Afmelden bevestigen
          </button>
          <button onClick={onClose} style={{ padding: '12px 16px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '8px', color: '#94a3b8', fontWeight: '600', cursor: 'pointer' }}>
            Terug
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main sheet ───────────────────────────────────────────────────────────────
export default function EventDetailSheet({
  event, location, memberContext, coachView,
  groups = [], locations = [],
  onClose, onEventChanged,
}) {
  const [ownAttendance,   setOwnAttendance]   = useState(null);
  const [actionLoading,   setActionLoading]   = useState(false);
  const [actionError,     setActionError]     = useState('');
  const [showExcuseModal, setShowExcuseModal] = useState(false);
  const [coachModal,      setCoachModal]      = useState(null); // 'edit' | 'cancel' | 'attendance'

  const color       = getEventColor(event);
  const Icon        = TYPE_ICONS[event.type] || Dumbbell;
  const startMs     = (event.startAt?.seconds || 0) * 1000;
  const endMs       = (event.endAt?.seconds   || 0) * 1000;
  const duration    = durationFromEvent(event);
  const isCancelled = event.status === 'cancelled';
  const checkInOpen = isCheckInOpen(event);
  const canExcuse   = canSelfExcuse(event);

  // Load own attendance
  useEffect(() => {
    if (!memberContext || !event?.id || event._virtual) return;
    let cancelled = false;
    AttendanceFactory.getOwnRecord(memberContext.clubId, event.id, memberContext.memberId)
      .then(rec => { if (!cancelled) setOwnAttendance(rec); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [event?.id, memberContext]);

  const handleCheckIn = async () => {
    if (!memberContext) return;
    setActionLoading(true); setActionError('');
    try {
      await AttendanceFactory.selfCheckIn(
        memberContext.clubId, event.id,
        memberContext.memberId, memberContext.uid,
      );
      setOwnAttendance({ status: 'present', selfCheckedIn: true });
    } catch (e) {
      console.error('[EventDetailSheet] check-in:', e);
      setActionError('Inchecken mislukt. Probeer opnieuw.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExcuse = async (reason) => {
    if (!memberContext) return;
    setShowExcuseModal(false);
    setActionLoading(true); setActionError('');
    try {
      await AttendanceFactory.selfExcuse(
        memberContext.clubId, event.id,
        memberContext.memberId, memberContext.uid, reason,
      );
      setOwnAttendance({ status: 'excused', absentReason: reason, selfCheckedIn: true });
    } catch (e) {
      console.error('[EventDetailSheet] excuse:', e);
      setActionError('Afmelden mislukt. Probeer opnieuw.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCoachModalClose = () => {
    setCoachModal(null);
    onEventChanged?.();
  };

  const attendanceCfg = ownAttendance ? STATUS_LABELS[ownAttendance.status] : null;
  const AttIcon       = attendanceCfg?.icon;

  // ── Coach overlay renders ──────────────────────────────────────────────────
  if (coachModal === 'attendance') {
    return (
      <AttendanceList
        event={event}
        clubId={memberContext?.clubId}
        coachUid={memberContext?.uid}
        groups={groups}
        onClose={handleCoachModalClose}
      />
    );
  }

  if (coachModal === 'edit' || coachModal === 'cancel') {
    return (
      <EventFormModal
        event={coachModal === 'edit' ? event : event}
        clubId={memberContext?.clubId}
        uid={memberContext?.uid}
        groups={groups}
        locations={locations}
        mode={coachModal}
        onClose={handleCoachModalClose}
      />
    );
  }

  // ── Main sheet ─────────────────────────────────────────────────────────────
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 400 }} />

      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        backgroundColor: '#1e293b',
        borderRadius: '20px 20px 0 0',
        border: '1px solid #334155', borderBottom: 'none',
        zIndex: 410, maxHeight: '90vh', overflowY: 'auto',
        maxWidth: '640px', margin: '0 auto',
        paddingBottom: 'env(safe-area-inset-bottom, 16px)',
      }}>
        {/* Colour bar */}
        <div style={{ height: '4px', backgroundColor: color, borderRadius: '20px 20px 0 0' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '16px 16px 12px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', backgroundColor: color + '22', border: `1px solid ${color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={20} color={color} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '4px' }}>
              <span style={{ fontSize: '10px', fontWeight: '700', padding: '1px 7px', borderRadius: '8px', backgroundColor: color + '22', color, border: `1px solid ${color}44`, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                {TYPE_LABELS[event.type] || 'Event'}
              </span>
              {isCancelled && (
                <span style={{ fontSize: '10px', fontWeight: '700', padding: '1px 7px', borderRadius: '8px', backgroundColor: '#ef444422', color: '#ef4444', border: '1px solid #ef444433' }}>
                  Geannuleerd
                </span>
              )}
              {event.isSpecial && event.specialLabel && (
                <span style={{ fontSize: '10px', fontWeight: '700', padding: '1px 7px', borderRadius: '8px', backgroundColor: '#22c55e22', color: '#22c55e', border: '1px solid #22c55e44' }}>
                  {event.specialLabel}
                </span>
              )}
              {event.status === 'modified' && (
                <span style={{ fontSize: '10px', fontWeight: '700', padding: '1px 7px', borderRadius: '8px', backgroundColor: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b44' }}>
                  Gewijzigd
                </span>
              )}
            </div>
            <div style={{ fontWeight: '800', fontSize: '18px', color: '#f1f5f9', lineHeight: 1.2, textDecoration: isCancelled ? 'line-through' : 'none' }}>
              {event.title}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '6px', flexShrink: 0 }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '0 16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Cancellation reason */}
          {isCancelled && event.cancelReason && (
            <div style={{ backgroundColor: '#ef444411', border: '1px solid #ef444433', borderRadius: '10px', padding: '10px 12px', fontSize: '13px', color: '#ef4444', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{event.cancelReason}</span>
            </div>
          )}

          {/* Date & time */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '16px' }}>
              🕐
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#f1f5f9' }}>
                {new Date(startMs).toLocaleDateString('nl-BE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
              </div>
              <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                {new Date(startMs).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}
                {' – '}
                {new Date(endMs).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}
                {duration && <span style={{ color: '#64748b' }}> ({formatDuration(duration)})</span>}
              </div>
            </div>
          </div>

          {/* Location */}
          {(location || event.locationNote) && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MapPin size={14} color="#94a3b8" />
              </div>
              <div>
                {location && (
                  <>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#f1f5f9' }}>{location.name}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      {[location.address, location.postalCode, location.city].filter(Boolean).join(', ')}
                    </div>
                  </>
                )}
                {event.locationNote && (
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: location ? '2px' : 0, fontStyle: 'italic' }}>
                    {event.locationNote}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Member notes */}
          {event.memberNotes && (
            <div style={{ backgroundColor: '#0f172a', borderRadius: '10px', border: '1px solid #334155', padding: '10px 12px' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <FileText size={10} /> Info
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{event.memberNotes}</p>
            </div>
          )}

          {/* Internal notes — coach only */}
          {coachView && event.notes && (
            <div style={{ backgroundColor: '#f59e0b0a', borderRadius: '10px', border: '1px solid #f59e0b22', padding: '10px 12px' }}>
              <div style={{ fontSize: '11px', color: '#f59e0b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '5px' }}>
                🔒 Interne notities
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{event.notes}</p>
            </div>
          )}

          {/* Competition details */}
          {event.type === 'competition' && event.competitionDetails && (
            <div style={{ backgroundColor: '#f9731611', border: '1px solid #f9731633', borderRadius: '10px', padding: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#f97316', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Trophy size={12} /> Wedstrijdinfo
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div>Niveau: <strong style={{ color: '#f1f5f9' }}>{event.competitionDetails.level}</strong></div>
                {event.competitionDetails.location && (
                  <div>Locatie: <strong style={{ color: '#f1f5f9' }}>{event.competitionDetails.location}</strong></div>
                )}
                {event.competitionDetails.requiredLabels?.length > 0 && (
                  <div>Vereist niveau: <strong style={{ color: '#f1f5f9' }}>{event.competitionDetails.requiredLabels.join(', ')}</strong></div>
                )}
                {event.competitionDetails.registrationUrl && (
                  <a href={event.competitionDetails.registrationUrl} target="_blank" rel="noopener noreferrer"
                    style={{ color: '#f97316', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none', fontWeight: '600', marginTop: '4px' }}>
                    <ExternalLink size={12} /> Inschrijven
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Own attendance */}
          {memberContext && attendanceCfg && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: attendanceCfg.color + '11', border: `1px solid ${attendanceCfg.color}33`, borderRadius: '10px', padding: '10px 12px' }}>
              <AttIcon size={16} color={attendanceCfg.color} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: attendanceCfg.color }}>{attendanceCfg.label}</div>
                {ownAttendance?.absentReason && (
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>Reden: {ownAttendance.absentReason}</div>
                )}
              </div>
            </div>
          )}

          {actionError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#ef444422', color: '#ef4444', fontSize: '13px', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ef444433' }}>
              <AlertCircle size={14} style={{ flexShrink: 0 }} /> {actionError}
            </div>
          )}

          {/* ── Member actions ── */}
          {memberContext && !isCancelled && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {checkInOpen && ownAttendance?.status !== 'present' && (
                <button onClick={handleCheckIn} disabled={actionLoading} style={{ flex: 1, minWidth: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', backgroundColor: '#22c55e', border: 'none', borderRadius: '10px', color: 'white', fontWeight: '700', fontSize: '14px', cursor: 'pointer', opacity: actionLoading ? 0.65 : 1, fontFamily: 'inherit' }}>
                  <CheckCircle2 size={16} /> Inchecken
                </button>
              )}
              {ownAttendance?.status === 'present' && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', backgroundColor: '#22c55e22', border: '1px solid #22c55e44', borderRadius: '10px', color: '#22c55e', fontWeight: '700', fontSize: '14px' }}>
                  <CheckCircle2 size={16} /> Ingecheckt ✓
                </div>
              )}
              {canExcuse && ownAttendance?.status !== 'excused' && (
                <button onClick={() => setShowExcuseModal(true)} disabled={actionLoading} style={{ flex: 1, minWidth: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', backgroundColor: 'transparent', border: '1px solid #f59e0b44', borderRadius: '10px', color: '#f59e0b', fontWeight: '600', fontSize: '14px', cursor: 'pointer', opacity: actionLoading ? 0.65 : 1, fontFamily: 'inherit' }}>
                  <XCircle size={16} /> Afmelden
                </button>
              )}
              {ownAttendance?.status === 'excused' && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', backgroundColor: '#f59e0b11', border: '1px solid #f59e0b33', borderRadius: '10px', color: '#f59e0b', fontWeight: '600', fontSize: '14px' }}>
                  <XCircle size={16} /> Afgemeld
                </div>
              )}
            </div>
          )}

          {/* ── Coach actions ── */}
          {coachView && (
            <div style={{ borderTop: '1px solid #334155', paddingTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {/* Aanwezigheid */}
              <button onClick={() => setCoachModal('attendance')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', backgroundColor: '#3b82f622', border: '1px solid #3b82f644', borderRadius: '8px', color: '#60a5fa', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                <Users size={13} /> Aanwezigheid
              </button>
              {/* Bewerken — alleen als niet geannuleerd */}
              {!isCancelled && !event._virtual && (
                <button onClick={() => setCoachModal('edit')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '8px', color: '#94a3b8', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <Edit2 size={13} /> Bewerken
                </button>
              )}
              {/* Annuleren */}
              {!isCancelled && (
                <button onClick={() => setCoachModal('cancel')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', backgroundColor: 'transparent', border: '1px solid #ef444433', borderRadius: '8px', color: '#ef4444', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <Trash2 size={13} /> Annuleren
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {showExcuseModal && (
        <ExcuseModal onConfirm={handleExcuse} onClose={() => setShowExcuseModal(false)} />
      )}
    </>
  );
}
