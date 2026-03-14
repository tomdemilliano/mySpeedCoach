import { Calendar, Clock, Bell } from 'lucide-react';

export default function AgendaPage() {
  return (
    <div style={{
      backgroundColor: '#0f172a', minHeight: '100vh',
      color: 'white', fontFamily: 'system-ui, sans-serif',
    }}>
      {/* Header */}
      <header style={{
        padding: '12px 16px', backgroundColor: '#1e293b',
        borderBottom: '1px solid #334155',
      }}>
        <div style={{ fontWeight: '800', fontSize: '16px', color: '#f1f5f9' }}>Agenda</div>
        <div style={{ fontSize: '11px', color: '#475569' }}>Trainingen & evenementen</div>
      </header>

      {/* Coming soon */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: 'calc(100vh - 56px)',
        padding: '40px 20px', textAlign: 'center',
      }}>
        <div style={{
          width: '80px', height: '80px', borderRadius: '24px',
          backgroundColor: '#1e293b', border: '1px solid #334155',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '24px',
        }}>
          <Calendar size={36} color="#a78bfa" />
        </div>

        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '4px 12px', borderRadius: '20px',
          backgroundColor: '#a78bfa22', border: '1px solid #a78bfa44',
          color: '#a78bfa', fontSize: '11px', fontWeight: '700',
          textTransform: 'uppercase', letterSpacing: '0.5px',
          marginBottom: '16px',
        }}>
          <Clock size={11} /> Binnenkort beschikbaar
        </div>

        <h2 style={{ fontSize: '22px', fontWeight: '800', color: '#f1f5f9', margin: '0 0 12px' }}>
          Agenda in aanbouw
        </h2>
        <p style={{ fontSize: '14px', color: '#64748b', maxWidth: '300px', lineHeight: 1.6, margin: 0 }}>
          Hier zie je binnenkort je geplande trainingen, wedstrijden en clubevenementen.
        </p>

        <div style={{
          marginTop: '32px', backgroundColor: '#1e293b', borderRadius: '14px',
          padding: '16px 20px', border: '1px solid #334155', maxWidth: '340px', width: '100%',
        }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px' }}>
            Wat je kan verwachten
          </div>
          {[
            { icon: '📅', text: 'Trainingskalender per club & groep' },
            { icon: '🏆', text: 'Wedstrijdplanning met inschrijvingen' },
            { icon: '🔔', text: 'Meldingen voor aankomende sessies' },
            { icon: '📊', text: 'Sessiedoelen per training instellen' },
          ].map((item, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '8px 0',
              borderTop: i > 0 ? '1px solid #1e293b' : 'none',
            }}>
              <span style={{ fontSize: '18px' }}>{item.icon}</span>
              <span style={{ fontSize: '13px', color: '#94a3b8' }}>{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
