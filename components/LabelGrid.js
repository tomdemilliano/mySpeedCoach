/**
 * components/LabelGrid.js
 *
 * Grid for assigning competitive level labels (A / B / C) to skippers.
 * Rows = competitive skippers, columns = label-eligible disciplines + Allround.
 * One "Opslaan" button saves the entire grid state.
 *
 * Props:
 *   clubId        : string
 *   season        : season object { id, name }
 *   members       : ClubMember[] — all club members
 *   uid           : string — current user uid (for updatedBy)
 *   disciplines   : discipline[] — from useDisciplines()
 */

import { useState, useEffect, useCallback } from 'react';
import { MemberLabelFactory } from '../constants/dbSchema';
import { Save, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

const LABEL_OPTIONS = ['A', 'B', 'C'];

// ─── Single label cell ────────────────────────────────────────────────────────
function LabelCell({ value, onChange, disabled }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value || null)}
        disabled={disabled}
        style={{
          appearance: 'none', WebkitAppearance: 'none',
          width: '52px',
          padding: '5px 4px',
          textAlign: 'center',
          backgroundColor: value ? labelColor(value) + '22' : '#0f172a',
          border: `1px solid ${value ? labelColor(value) + '66' : '#334155'}`,
          borderRadius: '7px',
          color: value ? labelColor(value) : '#475569',
          fontSize: '13px',
          fontWeight: value ? '800' : '400',
          cursor: disabled ? 'default' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <option value="">—</option>
        {LABEL_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
      </select>
    </div>
  );
}

function labelColor(label) {
  return label === 'A' ? '#22c55e' : label === 'B' ? '#f59e0b' : '#ef4444';
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function LabelGrid({ clubId, season, members, uid, disciplines }) {
  // Only label-eligible disciplines
  const eligibleDiscs = disciplines.filter(d => d.isActive !== false);

  // Only competitive skippers
  const competitiveMembers = members.filter(m => m.skipperType === 'competitive');

  // grid: { [memberId]: { allround: 'A'|'B'|'C'|null, disciplines: { [discId]: 'A'|'B'|'C'|null } } }
  const [grid,    setGrid]    = useState({});
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saveOk,  setSaveOk]  = useState(false);
  const [error,   setError]   = useState('');

  // Load existing labels for this season
  useEffect(() => {
    if (!clubId || !season?.id || competitiveMembers.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    const load = async () => {
      const initial = {};
      competitiveMembers.forEach(m => {
        initial[m.id] = { allround: null, disciplines: {} };
        eligibleDiscs.forEach(d => { initial[m.id].disciplines[d.id] = null; });
      });

      await Promise.all(competitiveMembers.map(async member => {
        const doc = await MemberLabelFactory.getForMember(clubId, season.id, member.id);
        if (doc && !cancelled) {
          initial[member.id] = {
            allround: doc.allroundLabel || null,
            disciplines: {},
          };
          eligibleDiscs.forEach(d => { initial[member.id].disciplines[d.id] = null; });
          (doc.disciplines || []).forEach(entry => {
            if (initial[member.id].disciplines.hasOwnProperty(entry.disciplineId)) {
              initial[member.id].disciplines[entry.disciplineId] = entry.label || null;
            }
          });
        }
      }));

      if (!cancelled) {
        setGrid(initial);
        setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [clubId, season?.id, competitiveMembers.length, eligibleDiscs.length]);

  const setAllround = useCallback((memberId, value) => {
    setGrid(prev => ({
      ...prev,
      [memberId]: { ...prev[memberId], allround: value },
    }));
  }, []);

  const setDisciplineLabel = useCallback((memberId, discId, value) => {
    setGrid(prev => ({
      ...prev,
      [memberId]: {
        ...prev[memberId],
        disciplines: { ...prev[memberId].disciplines, [discId]: value },
      },
    }));
  }, []);

  const handleSave = async () => {
    setError('');
    setSaving(true);
    try {
      await Promise.all(competitiveMembers.map(async member => {
        const row = grid[member.id];
        if (!row) return;

        const discEntries = eligibleDiscs
          .map(d => ({ disciplineId: d.id, label: row.disciplines[d.id] || null }))
          .filter(e => e.label !== null);

        const hasAllround = !!row.allround;
        const hasDiscs    = discEntries.length > 0;

        if (!hasAllround && !hasDiscs) {
          // Nothing assigned — delete if exists
          await MemberLabelFactory.delete(clubId, season.id, member.id);
          return;
        }

        await MemberLabelFactory.upsert(clubId, season.id, member.id, {
          memberId:      member.id,
          labelType:     hasAllround && !hasDiscs ? 'allround' : 'per_discipline',
          allroundLabel: row.allround || null,
          disciplines:   discEntries,
          updatedBy:     uid,
        });
      }));

      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2500);
    } catch (e) {
      console.error('[LabelGrid] save error:', e);
      setError('Opslaan mislukt. Probeer opnieuw.');
    } finally {
      setSaving(false);
    }
  };

  if (!season) {
    return (
      <div style={emptyState}>
        <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>
          Geen actief seizoen gevonden. Maak eerst een seizoen aan.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={emptyState}>
        <RefreshCw size={18} color="#64748b" style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
        <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>Labels laden…</p>
      </div>
    );
  }

  if (competitiveMembers.length === 0) {
    return (
      <div style={emptyState}>
        <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>
          Geen competitieve skippers gevonden. Pas het ledenprofiel aan om skippers als competitief te markeren.
        </p>
      </div>
    );
  }

  if (eligibleDiscs.length === 0) {
    return (
      <div style={emptyState}>
        <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>
          Geen disciplines met competitief label gevonden.
        </p>
      </div>
    );
  }

  // Column widths
  const nameColW  = '160px';
  const cellColW  = '64px';

  return (
    <div>
      {/* Season indicator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ fontSize: '13px', color: '#64748b' }}>
          Seizoen: <strong style={{ color: '#f1f5f9' }}>{season.name}</strong>
          <span style={{ marginLeft: '12px', fontSize: '11px', color: '#475569' }}>
            {competitiveMembers.length} competitieve skipper{competitiveMembers.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {LABEL_OPTIONS.map(l => (
            <span key={l} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '700', color: labelColor(l) }}>
              <span style={{ width: '16px', height: '16px', borderRadius: '4px', backgroundColor: labelColor(l) + '22', border: `1px solid ${labelColor(l)}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>{l}</span>
              {l === 'A' ? 'Nationaal' : l === 'B' ? 'Regionaal' : 'Club'}
            </span>
          ))}
        </div>
      </div>

      {/* Scrollable grid */}
      <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid #334155', marginBottom: '16px' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: `calc(${nameColW} + ${eligibleDiscs.length + 1} * ${cellColW})` }}>
          <thead>
            <tr style={{ backgroundColor: '#0f172a' }}>
              {/* Name column */}
              <th style={{ ...thStyle, textAlign: 'left', width: nameColW, minWidth: nameColW, paddingLeft: '14px' }}>
                Skipper
              </th>
              {/* Allround column */}
              <th style={{ ...thStyle, width: cellColW }}>
                <div style={{ fontSize: '10px', color: '#a78bfa', fontWeight: '700' }}>Allround</div>
              </th>
              {/* Discipline columns */}
              {eligibleDiscs.map(d => (
                <th key={d.id} style={{ ...thStyle, width: cellColW }}>
                  <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: '700', lineHeight: 1.3, maxWidth: '56px', margin: '0 auto' }}>
                    {d.name}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {competitiveMembers.map((member, idx) => {
              const row = grid[member.id] || { allround: null, disciplines: {} };
              const isEven = idx % 2 === 0;
              return (
                <tr key={member.id} style={{ backgroundColor: isEven ? '#1e293b' : '#1a2535' }}>
                  {/* Name */}
                  <td style={{ ...tdStyle, paddingLeft: '14px', borderRight: '1px solid #334155' }}>
                    <div style={{ fontWeight: '600', fontSize: '13px', color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }}>
                      {member.firstName} {member.lastName}
                    </div>
                  </td>
                  {/* Allround */}
                  <td style={{ ...tdStyle, borderRight: '1px solid #1e293b' }}>
                    <LabelCell
                      value={row.allround}
                      onChange={v => setAllround(member.id, v)}
                    />
                  </td>
                  {/* Per discipline */}
                  {eligibleDiscs.map(d => (
                    <td key={d.id} style={{ ...tdStyle, borderRight: '1px solid #1e293b' }}>
                      <LabelCell
                        value={row.disciplines?.[d.id] || null}
                        onChange={v => setDisciplineLabel(member.id, d.id, v)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#ef444422', color: '#ef4444', fontSize: '13px', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ef444433', marginBottom: '12px' }}>
          <AlertCircle size={14} style={{ flexShrink: 0 }} /> {error}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          padding: '11px 20px',
          backgroundColor: saveOk ? '#22c55e' : '#3b82f6',
          border: 'none', borderRadius: '10px',
          color: 'white', fontWeight: '700', fontSize: '14px',
          cursor: saving ? 'default' : 'pointer',
          opacity: saving ? 0.65 : 1,
          fontFamily: 'inherit',
          transition: 'background-color 0.2s',
        }}
      >
        {saveOk
          ? <><CheckCircle2 size={16} /> Opgeslagen!</>
          : saving
          ? <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Opslaan…</>
          : <><Save size={16} /> Labels opslaan</>}
      </button>
    </div>
  );
}

const thStyle = {
  padding: '10px 6px',
  fontSize: '10px',
  fontWeight: '700',
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
  textAlign: 'center',
  borderBottom: '1px solid #334155',
  whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '8px 4px',
  verticalAlign: 'middle',
};

const emptyState = {
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  padding: '40px 20px', textAlign: 'center',
};
