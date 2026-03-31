/**
 * pages/agenda.js
 *
 * Kalender-pagina voor leden.
 * Fase 1: fundament aanwezig, kalenderweergave volgt in Fase 2.
 *
 * Deze pagina toont alvast:
 *   - Een coming-soon state met beschrijving van wat er komt
 *   - Een knop naar /calendar-admin voor coaches/admins
 *
 * In Fase 2 wordt dit vervangen door de volledige kalenderimplementatie
 * (CalendarListView, CalendarWeekView, CalendarMonthView).
 */

import { useState, useEffect } from 'react';
import { Calendar, Clock, ChevronRight, Settings } from 'lucide-react';
import { UserFactory, UserMemberLinkFactory, GroupFactory } from '../constants/dbSchema';
import { useAuth } from '../contexts/AuthContext';

const COOKIE_KEY = 'msc_uid';
const getCookie = () => {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`));
  return m ? m[1] : null;
};

export default function AgendaPage() {
  const { uid } = useAuth();
  const [hasCoachAccess, setHasCoachAccess] = useState(false);

  // Check if current user is a coach or admin (to show the admin link)
  useEffect(() => {
    const cookieUid = getCookie();
    if (!cookieUid) return;
    UserFactory.get(cookieUid).then(snap => {
      if (!snap.exists()) return;
      const role = snap.data().role || 'user';
      if (role === 'clubadmin' || role === 'superadmin') {
        setHasCoachAccess(true);
        return;
      }
      // Check if coach in any group
      const unsubLinks = UserMemberLinkFactory.getForUser(cookieUid, async (profiles) => {
        unsubLinks();
        for (const profile of profiles) {
          const groups = await GroupFactory.getGroupsByClubOnce(profile.member.clubId);
          for (const group of groups) {
            const members = await GroupFactory.getMembersByGroupOnce(profile.member.clubId, group.id);
            const me = members.find(m => (m.memberId || m.id) === profile.member.id);
            if (me?.isCoach) { setHasCoachAccess(true); return; }
          }
        }
      });
    });
  }, [uid]);

  const upcomingFeatures = [
    { icon: '📅', text: 'Trainingskalender per groep met maand-, week- en lijstweergave' },
    { icon: '✅', text: 'Aanwezigheid bijhouden — inchecken via de app of QR-code' },
    { icon: '❌', text: 'Zelf afmelden met een reden (excuus)' },
    { icon: '🏆', text: 'Wedstrijden met info over vereiste niveaus' },
    { icon: '🎯', text: 'Trainingsvoorbereiding en AI-gegenereerde oefenschema\'s' },
    { icon: '⭐', text: 'Speciale trainingen (Halloween, carnaval, fluo, ...) uitgelicht' },
  ];

  return (
    <div style={{
      backgroundColor: '#0f172a', minHeight: '100vh',
      color: 'white', fontFamily: 'system-ui, sans-serif',
    }}>
      {/* Header */}
      <header style={{
        padding: '12px 16px', backgroundColor: '#1e293b',
        borderBottom: '1px solid #334155',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '34px', height: '34px', borderRadius: '9px', backgroundColor: '#22c55e22', border: '1px solid #22c55e44', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Calendar size={17} color="#22c55e" />
          </div>
          <div>
            <div style={{ fontWeight: '800', fontSize: '15px', color: '#f1f5f9' }}>Agenda</div>
            <div style={{ fontSize: '11px', color: '#475569' }}>Trainingen & evenementen</div>
          </div>
        </div>

        {hasCoachAccess && (
          <a href="/calendar-admin" style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '7px 12px', borderRadius: '8px',
            backgroundColor: '#22c55e22', border: '1px solid #22c55e44',
            color: '#22c55e', textDecoration: 'none', fontSize: '12px', fontWeight: '600',
          }}>
            <Settings size={13} /> Beheer
          </a>
        )}
      </header>

      {/* Coming soon */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: 'calc(100vh - 57px)',
        padding: '40px 20px', textAlign: 'center',
      }}>
        <div style={{
          width: '80px', height: '80px', borderRadius: '24px',
          backgroundColor: '#1e293b', border: '1px solid #334155',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '24px',
        }}>
          <Calendar size={36} color="#22c55e" />
        </div>

        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '4px 12px', borderRadius: '20px',
          backgroundColor: '#22c55e22', border: '1px solid #22c55e44',
          color: '#22c55e', fontSize: '11px', fontWeight: '700',
          textTransform: 'uppercase', letterSpacing: '0.5px',
          marginBottom: '16px',
        }}>
          <Clock size={11} /> In ontwikkeling
        </div>

        <h2 style={{ fontSize: '22px', fontWeight: '800', color: '#f1f5f9', margin: '0 0 12px' }}>
          Kalender in aanbouw
        </h2>
        <p style={{ fontSize: '14px', color: '#64748b', maxWidth: '340px', lineHeight: 1.6, margin: '0 0 32px' }}>
          De kalender wordt momenteel gebouwd. Hier zie je binnenkort alle geplande trainingen, wedstrijden en clubevenementen.
        </p>

        {/* Feature list */}
        <div style={{
          backgroundColor: '#1e293b', borderRadius: '14px',
          padding: '20px 24px', border: '1px solid #334155',
          maxWidth: '400px', width: '100%', textAlign: 'left',
          marginBottom: '24px',
        }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>
            Wat je kan verwachten
          </div>
          {upcomingFeatures.map((item, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: '12px',
              padding: '8px 0',
              borderTop: i > 0 ? '1px solid #1e293b' : 'none',
            }}>
              <span style={{ fontSize: '18px', flexShrink: 0 }}>{item.icon}</span>
              <span style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>{item.text}</span>
            </div>
          ))}
        </div>

        {/* Coach admin link */}
        {hasCoachAccess && (
          <a href="/calendar-admin" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            padding: '12px 20px', borderRadius: '10px',
            backgroundColor: '#22c55e', border: 'none',
            color: 'white', textDecoration: 'none',
            fontWeight: '700', fontSize: '14px',
          }}>
            <Settings size={16} />
            Trainingsreeksen instellen
            <ChevronRight size={16} />
          </a>
        )}
      </div>
    </div>
  );
}
