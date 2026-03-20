// Reusable discipline selector that fetches from Firestore.
// Replaces the hardcoded ['30sec', '2min', '3min'] toggles throughout the app.
//
// Props:
//   value         : string (discipline id)
//   onChange      : (disciplineId: string) => void
//   onlyIndividual: boolean — if true, only show isIndividual disciplines (default: false)
//   style         : optional container style overrides

import { useDisciplines } from '../hooks/useDisciplines';

export default function DisciplineSelector({ value, onChange, onlyIndividual = false, style = {} }) {
  const { disciplines, loading } = useDisciplines();

  const visible = onlyIndividual
    ? disciplines.filter(d => d.isIndividual)
    : disciplines;

  if (loading && visible.length === 0) {
    return (
      <div style={{ display: 'flex', gap: '8px', ...style }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ flex: 1, height: '42px', backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155', opacity: 0.4 }} />
        ))}
      </div>
    );
  }

  // Group by ropeType for display
  const srDiscs = visible.filter(d => d.ropeType === 'SR');
  const ddDiscs = visible.filter(d => d.ropeType === 'DD');
  const hasDD   = ddDiscs.length > 0;

  return (
    <div style={style}>
      {hasDD && srDiscs.length > 0 && (
        <div style={{ fontSize: '10px', color: '#475569', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>
          🪢 Single Rope
        </div>
      )}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: hasDD && srDiscs.length > 0 ? '8px' : '0' }}>
        {srDiscs.map(disc => (
          <button
            key={disc.id}
            type="button"
            onClick={() => onChange(disc.id)}
            style={{
              padding: '9px 12px',
              borderRadius: '8px',
              border: `1px solid ${value === disc.id ? '#3b82f6' : '#334155'}`,
              fontSize: '13px',
              fontWeight: value === disc.id ? '700' : '500',
              cursor: 'pointer',
              fontFamily: 'inherit',
              backgroundColor: value === disc.id ? '#3b82f6' : '#0f172a',
              color: value === disc.id ? 'white' : '#94a3b8',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
          >
            {disc.name}
          </button>
        ))}
      </div>
      {hasDD && (
        <>
          <div style={{ fontSize: '10px', color: '#475569', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>
            🌀 Double Dutch
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {ddDiscs.map(disc => (
              <button
                key={disc.id}
                type="button"
                onClick={() => onChange(disc.id)}
                style={{
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: `1px solid ${value === disc.id ? '#a78bfa' : '#334155'}`,
                  fontSize: '13px',
                  fontWeight: value === disc.id ? '700' : '500',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  backgroundColor: value === disc.id ? '#a78bfa' : '#0f172a',
                  color: value === disc.id ? 'white' : '#94a3b8',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s',
                }}
              >
                {disc.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
