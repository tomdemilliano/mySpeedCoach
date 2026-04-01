/**
 * pages/agenda/checkin.js
 *
 * QR-scan landing page voor aanwezigheidsregistratie.
 * URL: /agenda/checkin?eventId=<id>
 *
 * Flow:
 *  1. Lees eventId uit query params
 *  2. Haal event op (of herken als virtueel via templateId_YYYYMMDD patroon)
 *  3. Check of de ingelogde gebruiker lid is van de juiste groep
 *  4. Check of check-in window open is
 *  5. Voer selfCheckIn uit → toon bevestiging
 *
 * Gebruik: QR-code op whiteboard/deur verwijst naar deze URL.
 * De coach genereert de QR via /calendar-admin (toekomstige feature).
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import {
  CheckCircle2, XCircle, Clock, AlertCircle,
  Calendar, Users, MapPin, Zap,
} from 'lucide-react';
import {
  UserFactory, ClubFactory, GroupFactory,
  UserMemberLinkFactory,
  CalendarEventFactory, EventTemplateFactory,
  AttendanceFactory, LocationFactory,
} from '../../constants/dbSchema';
import {
  isCheckInOpen, getEventColor, formatDuration, durationFromEvent,
} from '../../utils/calendarUtils';

// ─── Cookie helper ────────────────────────────────────────────────────────────
const getCookieUid = () => {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(/(?:^|; )msc_uid=([^;]*)/);
  return m ? m[1] : null;
};

// ─── States ───────────────────────────────────────────────────────────────────
const STATE = {
  LOADING:     'loading',
  NOT_LOGGED:  'not_logged',
  NO_EVENT:    'no_event',
  NOT_MEMBER:  'not_member',
  WINDOW_CLOSED: 'window_closed',
  ALREADY_IN:  'already_in',
  READY:       'ready',
  CHECKING_IN: 'checking_in',
  SUCCESS:     'success',
  ERROR:       'error',
};

export default function CheckinPage() {
  const router = useRouter();
  const { eventId } = router.query;

  const [state,         setState]         = useState(STATE.LOADING);
  const [event,         setEvent]         = useState(null);
  const [location,      setLocation]      = useState(null);
  const [memberContext, setMemberContext]  = useState(null);
  const [errorMsg,      setErrorMsg]      = useState('');

  useEffect(() => {
    if (!router.isReady) return;
    if (!eventId) { setState(STATE.NO_EVENT); return; }

    const uid = getCookieUid();
    if (!uid) { setState(STATE.NOT_LOGGED); return; }

    let cancelled = false;

    const run = async () => {
      try {
        // 1. Resolve member context
        const profiles = await new Promise(resolve => {
          const unsub = UserMemberLinkFactory.getForUser(uid, (p) => { unsub(); resolve(p); });
        });

        if (!profiles.length) { if (!cancelled) setState(STATE.NOT_MEMBER); return; }
        const profile  = profiles[0];
        const clubId   = profile.member.clubId;
        const memberId = profile.member.id;
        if (!cancelled) setMemberContext({ clubId, memberId, uid });

        // 2. Fetch event — try Firestore first
        let ev = null;
        const evSnap = await CalendarEventFactory.getById(clubId, eventId);
        if (evSnap.exists()) {
          ev = { id: evSnap.id, ...evSnap.data() };
        } else {
          // Maybe it's a virtual recurring event (templateId_YYYYMMDD)
          const parts = eventId.split('_');
          if (parts.length >= 2) {
            const templateId = parts.slice(0, -1).join('_');
            const tplSnap    = await EventTemplateFactory.getById(clubId, templateId);
            if (tplSnap.exists()) {
              const tpl = { id: tplSnap.id, ...tplSnap.data() };
              const dateStr = parts[parts.length - 1];
              const y = parseInt(dateStr.slice(0, 4));
              const m = parseInt(dateStr.slice(4, 6)) - 1;
              const d = parseInt(dateStr.slice(6, 8));
              const date = new Date(y, m, d);
              const [h, min] = (tpl.recurrence?.startTime || '00:00').split(':').map(Number);
              const startAt = new Date(date); startAt.setHours(h, min, 0, 0);
              const endAt   = new Date(startAt.getTime() + (tpl.recurrence?.durationMin || 90) * 60000);
              ev = {
                _virtual:     true,
                id:           eventId,
                templateId:   tpl.id,
                type:         tpl.type || 'training',
                title:        tpl.title,
                groupIds:     tpl.groupIds || [],
                locationId:   tpl.locationId || null,
                startAt:      { seconds: Math.floor(startAt.getTime() / 1000) },
                endAt:        { seconds: Math.floor(endAt.getTime()   / 1000) },
                status:       'scheduled',
                isSpecial:    false,
                specialLabel: '',
              };
            }
          }
        }

        if (!ev) { if (!cancelled) setState(STATE.NO_EVENT); return; }
        if (!cancelled) setEvent(ev);

        // 3. Load location
        if (ev.locationId) {
          const locSnap = await LocationFactory.getById(ev.locationId);
          if (locSnap.exists() && !cancelled) setLocation({ id: locSnap.id, ...locSnap.data() });
        }

        // 4. Check group membership
        const myGroups = await (async () => {
          const groups = await GroupFactory.getGroupsByClubOnce(clubId);
          const gids = [];
          for (const g of groups) {
            const members = await GroupFactory.getMembersByGroupOnce(clubId, g.id);
            if (members.find(m => (m.memberId || m.id) === memberId)) gids.push(g.id);
          }
          return gids;
        })();

        const eventGroups = ev.groupIds || [];
        const isMember = eventGroups.length === 0 || eventGroups.some(gid => myGroups.includes(gid));
        if (!isMember) { if (!cancelled) setState(STATE.NOT_MEMBER); return; }

        // 5. Check if already checked in
        if (!ev._virtual) {
          const own = await AttendanceFactory.getOwnRecord(clubId, eventId, memberId);
          if (own?.status === 'present') { if (!cancelled) setState(STATE.ALREADY_IN); return; }
        }

        // 6. Check window
        if (!isCheckInOpen(ev)) { if (!cancelled) setState(STATE.WINDOW_CLOSED); return; }

        if (!cancelled) setState(STATE.READY);
      } catch (e) {
        console.error('[checkin]', e);
        if (!cancelled) { setErrorMsg(e.message || 'Onbekende fout'); setState(STATE.ERROR); }
      }
    };

    run();
    return () => { cancelled = true; };
  }, [router.isReady, eventId]);

  const handleCheckIn = async () => {
    if (!event || !memberContext) return;
    setState(STATE.CHECKING_IN);
    try {
      // Materialise virtual event if needed
      if (event._virtual) {
        await CalendarEventFactory.materializeVirtual(
          memberContext.clubId, event, {}, memberContext.uid
        );
      }
      await AttendanceFactory.selfCheckIn(
        memberContext.clubId, event.id,
        memberContext.memberId, memberContext.uid,
      );
      setState(STATE.SUCCESS);
    } catch (e) {
      console.error('[checkin] selfCheckIn error:', e);
      setErrorMsg('Inchecken mislukt. Probeer opnieuw.');
      setState(STATE.ERROR);
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────────
  const color    = event ? getEventColor(event) : '#22c55e';
  const startMs  = (event?.startAt?.seconds || 0) * 1000;
  const duration = event ? durationFromEvent(event) : null;

  const EventInfo = () => event ? (
    <div style={{ backgroundColor: '#1e293b', borderRadius: '14px', border: `1px solid ${color}33`, padding: '16px', marginBottom: '20px', textAlign: 'left' }}>
      <div style={{ fontWeight: '800', fontSize: '16px', color: '#f1f5f9', marginBottom: '8px' }}>{event.title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <div style={{ fontSize: '13px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Calendar size={12} color="#64748b" />
          {new Date(startMs).toLocaleDateString('nl-BE', { weekday: 'long', day: '2-digit', month: 'long' })}
        </div>
        <div style={{ fontSize: '13px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Clock size={12} color="#64748b" />
          {new Date(startMs).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}
          {duration && <span style={{ color: '#64748b' }}>· {formatDuration(duration)}</span>}
        </div>
        {location && (
          <div style={{ fontSize: '13px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <MapPin size={12} color="#64748b" /> {location.name}
          </div>
        )}
      </div>
    </div>
  ) : null;

  // ── State renders ──────────────────────────────────────────────────────────
  const renderContent = () => {
    switch (state) {
      case STATE.LOADING:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '48px', height: '48px', border: '4px solid #1e293b', borderTop: `4px solid ${color}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ color: '#64748b', fontSize: '14px' }}>Laden…</p>
          </div>
        );

      case STATE.NOT_LOGGED:
        return (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔐</div>
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#f1f5f9', margin: '0 0 8px' }}>Inloggen vereist</h2>
            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '20px' }}>
              Je moet ingelogd zijn om in te checken.
            </p>
            <a href={`/login?redirect=/agenda/checkin?eventId=${eventId}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 24px', backgroundColor: '#22c55e', borderRadius: '10px', color: 'white', fontWeight: '700', fontSize: '15px', textDecoration: 'none' }}>
              <Zap size={16} /> Inloggen
            </a>
          </div>
        );

      case STATE.NO_EVENT:
        return (
          <div style={{ textAlign: 'center' }}>
            <XCircle size={52} color="#ef4444" style={{ marginBottom: '16px' }} />
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#f1f5f9', margin: '0 0 8px' }}>Event niet gevonden</h2>
            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '20px' }}>
              De QR-code verwijst naar een onbekend of verlopen event.
            </p>
            <a href="/agenda" style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: '600', fontSize: '14px' }}>← Terug naar agenda</a>
          </div>
        );

      case STATE.NOT_MEMBER:
        return (
          <div style={{ textAlign: 'center' }}>
            <EventInfo />
            <XCircle size={52} color="#ef4444" style={{ marginBottom: '16px' }} />
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#f1f5f9', margin: '0 0 8px' }}>Niet van toepassing</h2>
            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '20px' }}>
              Dit event is niet voor jouw groep.
            </p>
            <a href="/agenda" style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: '600', fontSize: '14px' }}>← Terug naar agenda</a>
          </div>
        );

      case STATE.WINDOW_CLOSED: {
        const now = Date.now();
        const before = startMs - now > 0;
        return (
          <div style={{ textAlign: 'center' }}>
            <EventInfo />
            <Clock size={52} color="#f59e0b" style={{ marginBottom: '16px' }} />
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#f1f5f9', margin: '0 0 8px' }}>
              {before ? 'Nog niet open' : 'Check-in gesloten'}
            </h2>
            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '20px' }}>
              {before
                ? `Check-in opent 30 min voor de start (${new Date(startMs - 30 * 60000).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}).`
                : 'De check-in periode is voorbij (sluit 30 min na start).'}
            </p>
            <a href="/agenda" style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: '600', fontSize: '14px' }}>← Terug naar agenda</a>
          </div>
        );
      }

      case STATE.ALREADY_IN:
        return (
          <div style={{ textAlign: 'center' }}>
            <EventInfo />
            <CheckCircle2 size={60} color="#22c55e" style={{ marginBottom: '16px' }} />
            <h2 style={{ fontSize: '22px', fontWeight: '800', color: '#22c55e', margin: '0 0 8px' }}>Al ingecheckt ✓</h2>
            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '20px' }}>
              Je aanwezigheid is al geregistreerd.
            </p>
            <a href="/agenda" style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: '600', fontSize: '14px' }}>← Terug naar agenda</a>
          </div>
        );

      case STATE.READY:
        return (
          <div style={{ textAlign: 'center' }}>
            <EventInfo />
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>👋</div>
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#f1f5f9', margin: '0 0 8px' }}>Aanwezig?</h2>
            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px' }}>
              Bevestig je aanwezigheid voor dit event.
            </p>
            <button
              onClick={handleCheckIn}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '16px 32px', backgroundColor: '#22c55e', border: 'none', borderRadius: '14px', color: 'white', fontWeight: '800', fontSize: '18px', cursor: 'pointer', width: '100%', maxWidth: '300px', margin: '0 auto', fontFamily: 'inherit', boxShadow: '0 0 24px #22c55e44' }}
            >
              <CheckCircle2 size={22} /> Inchecken
            </button>
          </div>
        );

      case STATE.CHECKING_IN:
        return (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: '60px', height: '60px', border: '5px solid #1e293b', borderTop: '5px solid #22c55e', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 20px' }} />
            <p style={{ color: '#64748b', fontSize: '15px' }}>Inchecken…</p>
          </div>
        );

      case STATE.SUCCESS:
        return (
          <div style={{ textAlign: 'center' }}>
            <div style={{ animation: 'scaleIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards' }}>
              <CheckCircle2 size={80} color="#22c55e" style={{ marginBottom: '20px' }} />
            </div>
            <h2 style={{ fontSize: '26px', fontWeight: '900', color: '#22c55e', margin: '0 0 8px' }}>Ingecheckt! ✓</h2>
            <p style={{ color: '#94a3b8', fontSize: '15px', marginBottom: '8px' }}>
              {event?.title}
            </p>
            <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '28px' }}>
              Je aanwezigheid is geregistreerd.
            </p>
            <a href="/agenda" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 24px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '10px', color: '#94a3b8', fontWeight: '600', fontSize: '14px', textDecoration: 'none' }}>
              ← Terug naar agenda
            </a>
          </div>
        );

      case STATE.ERROR:
        return (
          <div style={{ textAlign: 'center' }}>
            <AlertCircle size={52} color="#ef4444" style={{ marginBottom: '16px' }} />
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#f1f5f9', margin: '0 0 8px' }}>Er ging iets mis</h2>
            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '20px' }}>{errorMsg}</p>
            <button onClick={() => window.location.reload()} style={{ padding: '10px 20px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
              Opnieuw proberen
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', fontFamily: 'system-ui, sans-serif', color: 'white' }}>
      <style>{`
        @keyframes spin    { from { transform: rotate(0deg); }    to { transform: rotate(360deg); } }
        @keyframes scaleIn { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        select option { background-color: #1e293b; }
      `}</style>

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '32px' }}>
        <div style={{ width: '34px', height: '34px', borderRadius: '9px', backgroundColor: '#1e293b', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Zap size={18} color="#22c55e" />
        </div>
        <span style={{ fontWeight: '800', fontSize: '16px', color: '#f1f5f9' }}>MySpeedCoach</span>
      </div>

      {/* Card */}
      <div style={{ width: '100%', maxWidth: '400px', backgroundColor: '#1e293b', borderRadius: '20px', border: `1px solid ${color}33`, padding: '28px 24px' }}>
        {renderContent()}
      </div>
    </div>
  );
}
