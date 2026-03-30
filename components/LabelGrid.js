/**
 * components/LabelGrid.js
 *
 * Grid for assigning competitive level labels (A / B / C) to skippers.
 * Rows = competitive skippers, columns = active disciplines + Allround (last).
 * Group filter above the grid. Group tags on each member row.
 *
 * Props:
 *   clubId      : string
 *   season      : season object { id, name }
 *   members     : ClubMember[]  — all club members (all types)
 *   groups      : group[]       — all groups for this club { id, name }
 *   groupMemberMap : { [groupId]: string[] } — memberId[] per group
 *   uid         : string
 *   disciplines : discipline[]
 */

import { useState, useEffect, useCallback } from 'react';
import { MemberLabelFactory, SeasonFactory } from '../constants/dbSchema';
import { Save, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

const LABEL_OPTIONS = ['A', 'B', 'C'];

// Neutral, non-judgmental color palette for A / B / C
const LABEL_COLORS = {
  A: '#3b82f6',  // blue
  B: '#a78bfa',  // purple
  C: '#06b6d4',  // teal
};

function labelColor(label) {
  return LABEL_COLORS[label] || '#64748b';
}

// ─── Single label cell ────────────────────────────────────────────────────────
function LabelCell({ value, onChange }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value || null)}
        style={{
          appearance: 'none', WebkitAppearance: 'none',
          width: '48px',
          padding: '5px 4px',
          textAlign: 'center',
          backgroundColor: value ? labelColor(value) + '22' : '#0f172a',
          border: `1px solid ${value ? labelColor(value) + '66' : '#334155'}`,
          borderRadius: '7px',
          color: value ? labelColor(value) : '#475569',
          fontSize: '13px',
          fontWeight: value ? '800' : '400',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <option value="">—</option>
        {LABEL_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
      </select>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function LabelGrid({ clubId, season: initialSeason, members, groups, groupMemberMap, uid, disciplines }) {
  const eligibleDiscs = disciplines.filter(d => d.hasCompetitiveLabel && d.isActive !== false);

  // Only competitive skippers
  const competitiveMembers = members.filter(m => m.skipperType === 'competitive');

  // ── Season selector ───────────────────────────────────────────────────────
  const [allSeasons,     setAllSeasons]     = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(initialSeason || null);

  // Load all seasons for this club
  useEffect(() => {
    if (!clubId) return;
    const unsub = SeasonFactory.getAll(clubId, (seasons) => {
      const active = seasons.filter(s => !s.isAbandoned);
      setAllSeasons(active);
    });
    return () => unsub();
  }, [clubId]);

  // When the externally-provided current season changes (initial load), set it
  useEffect(() => {
    if (initialSeason && !selectedSeason) {
      setSelectedSeason(initialSeason);
    }
  }, [initialSeason?.id]);

  const season = selectedSeason;

  // Group filter state
  const [filterGroupId, setFilterGroupId] = useState('');

  // Build a map of memberId → group names (where they are skipper)
  const memberGroupNames = {};
  competitiveMembers.forEach(m => {
    const names = [];
    (groups || []).forEach(g => {
      if ((groupMemberMap?.[g.id] || []).includes(m.id)) names.push(g.name);
    });
    memberGroupNames[m.id] = names;
  });

  // Filtered members based on group selection
  const filteredMembers = filterGroupId
    ? competitiveMembers.filter(m => (groupMemberMap?.[filterGroupId] || []).includes(m.id))
    : competitiveMembers;

  // grid: { [memberId]: { allround: string|null, disciplines: { [discId]: string|null } } }
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
          initial[member.id] = { allround: doc.allroundLabel || null, disciplines: {} };
          eligibleDiscs.forEach(d => { initial[member.id].disciplines[d.id] = null; });
          (doc.disciplines || []).forEach(entry => {
            if (Object.prototype.hasOwnProperty.call(initial[member.id].disciplines, entry.disciplineId)) {
              initial[member.id].disciplines[entry.disciplineId] = entry.label || null;
            }
          });
        }
      }));

      if (!cancelled) { setGrid(initial); setLoading(false); }
    };

    load();
    return () => { cancelled = true; };
  }, [clubId, season?.id, competitiveMembers.length, eligibleDiscs.length]);

  const setAllround = useCallback((memberId, value) => {
    setGrid(prev => ({ ...prev, [memberId]: { ...prev[memberId], allround: value } }));
  }, []);

  const setDisciplineLabel = useCallback((memberId, discId, value) => {
    setGrid(prev => ({
      ...prev,
      [memberId]: { ...prev[memberId], disciplines: { ...prev[memberId].disciplines, [discId]: value } },
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


  if (!season) return (
    <div style={emptyState}>
      <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>
        Kies een seizoen hierboven om de labels te bekijken.
      </p>
    </div>
  );

  if (loading) return (
    <div style={emptyState}>
      <RefreshCw size={18} color="#64748b" style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
      <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>Labels laden…</p>
    </div>
  );

  if (competitiveMembers.length === 0) return (
    <div style={emptyState}>
      <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>
        Geen competitieve skippers. Pas het lidprofiel aan om skippers als competitief te markeren.
      </p>
    </div>
  );

  return (
    <div>
      {/* Season + filter row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>

          {/* Season selector */}
          <select
            value={selectedSeason?.id || ''}
            onChange={e => {
              const s = allSeasons.find(s => s.id === e.target.value);
              setSelectedSeason(s || null);
            }}
            style={{
              padding: '6px 10px', borderRadius: '8px',
              border: `1px solid ${selectedSeason ? '#3b82f666' : '#334155'}`,
              backgroundColor: '#0f172a',
              color: selectedSeason ? '#f1f5f9' : '#64748b',
              fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            <option value="">— Kies seizoen —</option>
            {allSeasons.map(s => {
              const now   = Date.now();
              const start = s.startDate?.seconds ? s.startDate.seconds * 1000 : null;
              const end   = s.endDate?.seconds   ? s.endDate.seconds   * 1000 : null;
              const isCur = start && end && start <= now && now <= end;
              return (
                <option key={s.id} value={s.id}>
                  {s.name}{isCur ? ' (huidig)' : ''}
                </option>
              );
            })}
          </select>

          {selectedSeason && (
            <div style={{ fontSize: '13px', color: '#64748b' }}>
              <span style={{ marginLeft: '4px', fontSize: '11px', color: '#475569' }}>
                {filteredMembers.length} van {competitiveMembers.length} skipper{competitiveMembers.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          {/* Group filter */}
          {(groups || []).length > 0 && (
            <select
              value={filterGroupId}
              onChange={e => setFilterGroupId(e.target.value)}
              style={{
                marginLeft: 'auto',
                padding: '6px 10px', borderRadius: '8px',
                border: '1px solid #334155', backgroundColor: '#0f172a',
                color: filterGroupId ? '#f1f5f9' : '#64748b',
                fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              <option value="">Alle groepen</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
        </div>

      {/* Scrollable table */}
      <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid #334155', marginBottom: '16px' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '400px' }}>
          <thead>
            <tr style={{ backgroundColor: '#0f172a' }}>
              {/* Member name */}
              <th style={{ ...th, textAlign: 'left', paddingLeft: '14px', minWidth: '160px' }}>
                Skipper
              </th>
              {/* Discipline columns — Allround last */}
              {eligibleDiscs.map(d => (
                <th key={d.id} style={{ ...th, width: '58px', minWidth: '58px' }}>
                  <div style={{
                    fontSize: '9px', color: '#94a3b8', fontWeight: '700',
                    lineHeight: 1.3, maxWidth: '54px', margin: '0 auto',
                    whiteSpace: 'normal', wordBreak: 'break-word', textAlign: 'center',
                  }}>
                    {d.name}
                  </div>
                </th>
              ))}
              {/* Allround — always last */}
              <th style={{ ...th, width: '58px', minWidth: '58px' }}>
                <div style={{ fontSize: '9px', color: '#a78bfa', fontWeight: '700', lineHeight: 1.3 }}>
                  Allround
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredMembers.length === 0 ? (
              <tr>
                <td colSpan={eligibleDiscs.length + 2} style={{ padding: '24px', textAlign: 'center', color: '#475569', fontSize: '13px' }}>
                  Geen skippers in deze groep.
                </td>
              </tr>
            ) : filteredMembers.map((member, idx) => {
              const row       = grid[member.id] || { allround: null, disciplines: {} };
              const groupNames = memberGroupNames[member.id] || [];
              return (
                <tr key={member.id} style={{ backgroundColor: idx % 2 === 0 ? '#1e293b' : '#1a2535' }}>
                  {/* Name + group tags */}
                  <td style={{ ...td, paddingLeft: '14px', borderRight: '1px solid #334155' }}>
                    <div style={{ fontWeight: '600', fontSize: '13px', color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }}>
                      {member.firstName} {member.lastName}
                    </div>
                    {groupNames.length > 0 && (
                      <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginTop: '3px' }}>
                        {groupNames.map(name => (
                          <span key={name} style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#3b82f611', border: '1px solid #3b82f633', color: '#60a5fa', fontWeight: '600', whiteSpace: 'nowrap' }}>
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  {/* Discipline cells */}
                  {eligibleDiscs.map(d => (
                    <td key={d.id} style={{ ...td, borderRight: '1px solid #1e293b' }}>
                      <LabelCell
                        value={row.disciplines?.[d.id] || null}
                        onChange={v => setDisciplineLabel(member.id, d.id, v)}
                      />
                    </td>
                  ))}
                  {/* Allround — last column */}
                  <td style={{ ...td, borderRight: '1px solid #1e293b' }}>
                    <LabelCell
                      value={row.allround}
                      onChange={v => setAllround(member.id, v)}
                    />
                  </td>
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
          opacity: saving ? 0.65 : 1, fontFamily: 'inherit',
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

const th = {
  padding: '10px 4px', fontSize: '9px', fontWeight: '700',
  color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px',
  textAlign: 'center', borderBottom: '1px solid #334155',
};
const td          = { padding: '8px 4px', verticalAlign: 'middle' };
const emptyState  = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center' };
