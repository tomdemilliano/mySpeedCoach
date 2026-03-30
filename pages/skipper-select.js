/**
 * pages/skipper-select.js  —  Skipper & sessie selectie
 *
 * Unified selection page for both manual counting and camera counting.
 * Replaces the setup screen that was previously embedded in counter.js.
 *
 * URL params (read on mount):
 *   mode    'manual' | 'camera'
 *   return  '/counter' | '/ai-counter'  (where to navigate after confirm)
 *   prev    JSON-encoded previous selection (for "Nieuwe sessie" flow)
 *
 * On confirm, navigates to the return URL with:
 *   disciplineId, sessionType, clubId, groupId,
 *   memberId, firstName, lastName, rtdbUid,
 *   teamOrder (JSON, relay only)
 *
 * Rules followed:
 *   - All DB access via useSkipperSelection hook (CLAUDE.md §1)
 *   - No <form> elements (CLAUDE.md §4)
 *   - Inline CSS only (CLAUDE.md §9)
 *   - Dutch UI strings (CLAUDE.md §9)
 */

import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Camera, Hash, Users, GripVertical,
  X, ChevronDown, AlertTriangle, Trophy,
} from 'lucide-react';
import { useSkipperSelection } from '../hooks/useSkipperSelection';
import { useDisciplines }       from '../hooks/useDisciplines';
import { ClubMemberFactory }    from '../constants/dbSchema';

// ─── Read URL params once (SSR-safe) ─────────────────────────────────────────
const getParams = () => {
  if (typeof window === 'undefined') return {};
  const p = new URLSearchParams(window.location.search);
  let prev = null;
  try { prev = p.get('prev') ? JSON.parse(decodeURIComponent(p.get('prev'))) : null; } catch {}
  return {
    mode:       p.get('mode')   || 'manual',
    returnPath: p.get('return') || '/counter',
    prev,
  };
};

// ─── Discipline Dropdown ──────────────────────────────────────────────────────
function DisciplineDropdown({ value, onChange, disciplines }) {
  const srDiscs  = disciplines.filter(d => d.ropeType === 'SR');
  const ddDiscs  = disciplines.filter(d => d.ropeType === 'DD');
  const selected = disciplines.find(d => d.id === value) || null;

  const detail = (d) => {
    if (!d) return '';
    const parts = [];
    if (d.durationSeconds) {
      parts.push(d.durationSeconds < 60 ? `${d.durationSeconds}s` : `${d.durationSeconds / 60}min`);
    } else {
      parts.push('∞');
    }
    if (!d.isIndividual) parts.push(`Team ${d.teamSize}`);
    if (d.specialRule === 'relay')        parts.push('beurtelings');
    if (d.specialRule === 'triple_under') parts.push('15s herstart');
    return parts.join(' · ');
  };

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            width: '100%', appearance: 'none', WebkitAppearance: 'none',
            backgroundColor: '#0f172a', border: '1.5px solid #334155',
            borderRadius: '10px', color: '#f1f5f9',
            fontSize: '14px', fontWeight: '600',
            padding: '10px 36px 10px 12px', fontFamily: 'inherit',
            cursor: 'pointer', outline: 'none',
          }}
        >
          {srDiscs.length > 0 && ddDiscs.length > 0 && (
            <optgroup label="─── Single Rope ───">
              {srDiscs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </optgroup>
          )}
          {srDiscs.length > 0 && ddDiscs.length === 0 &&
            srDiscs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          {ddDiscs.length > 0 && (
            <optgroup label="─── Double Dutch ───">
              {ddDiscs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </optgroup>
          )}
        </select>
        <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#64748b' }}>
          <ChevronDown size={16} />
        </div>
      </div>
      {selected && (
        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', paddingLeft: '2px' }}>
          ℹ {detail(selected)}
        </div>
      )}
    </div>
  );
}

// ─── Relay Team Builder ───────────────────────────────────────────────────────
// Drag-and-drop ordering for relay disciplines (manual mode only).
function RelayTeamBuilder({ skippers, getMember, value, onChange, required }) {
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const selectedIds = new Set(value.map(v => v.memberId));
  const isFull      = value.length >= required;
  const isDone      = value.length === required;

  const handleToggle = (memberId) => {
    if (selectedIds.has(memberId)) {
      onChange(value.filter(v => v.memberId !== memberId));
    } else {
      if (isFull) return;
      const profile = getMember(memberId);
      onChange([...value, {
        memberId,
        name: profile ? `${profile.firstName} ${profile.lastName}` : memberId,
      }]);
    }
  };

  const handleDrop = (e, targetIdx) => {
    e.preventDefault();
    if (dragging === null || dragging === targetIdx) { setDragging(null); setDragOver(null); return; }
    const next = [...value];
    const [moved] = next.splice(dragging, 1);
    next.splice(targetIdx, 0, moved);
    onChange(next);
    setDragging(null); setDragOver(null);
  };

  if (skippers.length === 0) return (
    <p style={{ color: '#475569', fontSize: '13px', padding: '8px 0' }}>Geen skippers in deze groep.</p>
  );

  return (
    <div>
      <div style={{ fontSize: '11px', marginBottom: '8px', color: isDone ? '#22c55e' : '#64748b', display: 'flex', alignItems: 'center', gap: '5px' }}>
        {isDone
          ? `✓ ${required} skipper${required > 1 ? 's' : ''} geselecteerd`
          : `Tik om te selecteren · ${required - value.length} nog nodig`}
      </div>

      {/* Skipper chips for selection */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: value.length > 0 ? '14px' : '0' }}>
        {skippers.map(s => {
          const memberId  = s.memberId || s.id;
          const profile   = getMember(memberId);
          const firstName = profile?.firstName || '?';
          const lastName  = profile?.lastName  || '';
          const initials  = `${firstName[0] || '?'}${lastName[0] || ''}`.toUpperCase();
          const isIn      = selectedIds.has(memberId);
          const position  = isIn ? value.findIndex(v => v.memberId === memberId) + 1 : null;
          const dimmed    = !isIn && isFull;
          return (
            <button key={memberId} type="button" onClick={() => handleToggle(memberId)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '20px', cursor: dimmed ? 'not-allowed' : 'pointer', fontFamily: 'inherit', border: '1.5px solid', borderColor: isIn ? '#3b82f6' : '#334155', backgroundColor: isIn ? '#1e3a5f' : 'transparent', opacity: dimmed ? 0.35 : 1 }}>
              <div style={{ width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0, backgroundColor: isIn ? '#3b82f6' : '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: 'white' }}>
                {isIn ? position : initials}
              </div>
              <span style={{ fontSize: '13px', fontWeight: isIn ? '700' : '400', color: isIn ? '#f1f5f9' : '#94a3b8' }}>{firstName} {lastName}</span>
              {isIn && <span style={{ fontSize: '13px', color: '#60a5fa' }}>✓</span>}
            </button>
          );
        })}
      </div>

      {/* Drag-to-reorder list */}
      {value.length > 0 && (
        <div>
          <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <GripVertical size={11} /> Volgorde aanpassen
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {value.map((item, idx) => {
              const profile  = getMember(item.memberId);
              const initials = `${profile?.firstName?.[0] || '?'}${profile?.lastName?.[0] || ''}`.toUpperCase();
              return (
                <div key={item.memberId}
                  draggable
                  onDragStart={() => setDragging(idx)}
                  onDragOver={e => { e.preventDefault(); setDragOver(idx); }}
                  onDrop={e => handleDrop(e, idx)}
                  onDragEnd={() => { setDragging(null); setDragOver(null); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '10px', backgroundColor: dragOver === idx ? '#1e3a5f' : '#0f172a', border: `1px solid ${dragOver === idx ? '#3b82f6' : dragging === idx ? '#475569' : '#1e293b'}`, cursor: 'grab', userSelect: 'none', opacity: dragging === idx ? 0.5 : 1 }}>
                  <span style={{ color: '#475569', flexShrink: 0, fontSize: '16px' }}>⠿</span>
                  <div style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: '#3b82f622', border: '1px solid #3b82f644', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', color: '#60a5fa', flexShrink: 0 }}>{initials}</div>
                  <div style={{ flex: 1, fontSize: '13px', fontWeight: '600', color: '#f1f5f9' }}>
                    {profile ? `${profile.firstName} ${profile.lastName}` : item.memberId}
                  </div>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: isDone ? '#22c55e' : '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', color: 'white', flexShrink: 0 }}>{idx + 1}</div>
                  <button type="button" onClick={() => onChange(value.filter((_, i) => i !== idx))}
                    style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function SkipperSelectPage() {
  const { mode, returnPath, prev } = getParams();
  const isCamera = mode === 'camera';

  const {
    bootstrapDone,
    memberClubs, memberGroups,
    skippers, clubMembers,
    selectedClubId, selectedGroupId,
    setSelectedClubId, setSelectedGroupId,
    getMember, resolveSkipper,
  } = useSkipperSelection();

  const { disciplines, loading: discsLoading, getDisc } = useDisciplines();

  // ── Local selection state ─────────────────────────────────────────────────
  const [disciplineId,    setDisciplineId]    = useState(prev?.disciplineId    || '');
  const [sessionType,     setSessionType]     = useState(prev?.sessionType     || 'Training');
  const [selectedSkipper, setSelectedSkipper] = useState(prev?.selectedSkipper || null);
  const [teamOrder,       setTeamOrder]       = useState(prev?.teamOrder       || []);
  const [starting,        setStarting]        = useState(false);

  // ── Discipline metadata ───────────────────────────────────────────────────
  const currentDisc     = getDisc(disciplineId);
  const sessionMode     = !currentDisc       ? 'individual'
    : currentDisc.specialRule === 'relay'        ? 'relay'
    : currentDisc.specialRule === 'triple_under' ? 'triple_under'
    : 'individual';
  const isRelayDisc     = sessionMode === 'relay';
  const requiredSkippers = currentDisc?.skippersCount ?? 1;

  // Camera mode cannot count relay/team disciplines
  const cameraBlockedByTeam = isCamera && isRelayDisc;

  // ── Pre-fill club/group from prev if provided ─────────────────────────────
  const prevAppliedRef = useRef(false);
  useEffect(() => {
    if (!prev || prevAppliedRef.current || !bootstrapDone) return;
    if (prev.clubId && memberClubs.some(c => c.id === prev.clubId)) {
      setSelectedClubId(prev.clubId);
    }
    prevAppliedRef.current = true;
  }, [bootstrapDone, memberClubs]);

  useEffect(() => {
    if (!prev?.groupId || !memberGroups.some(g => g.id === prev.groupId)) return;
    setSelectedGroupId(prev.groupId);
  }, [memberGroups]);

  // ── Default discipline once loaded ────────────────────────────────────────
  useEffect(() => {
    if (disciplines.length > 0 && !disciplineId) setDisciplineId(disciplines[0].id);
  }, [disciplines]);

  // ── Reset skipper/team when discipline or group changes ───────────────────
  useEffect(() => {
    setSelectedSkipper(null);
    setTeamOrder([]);
  }, [disciplineId, selectedGroupId]);

  // ── Can the user start? ───────────────────────────────────────────────────
  const groupReady = !!(selectedClubId && selectedGroupId);
  const selectionReady = groupReady && !!disciplineId && (
    isRelayDisc
      ? teamOrder.length === requiredSkippers
      : !!selectedSkipper
  );
  const canStart = selectionReady && !cameraBlockedByTeam;

  // ── Navigate to counter / ai-counter ─────────────────────────────────────
  const handleStart = async () => {
    if (!canStart) return;
    setStarting(true);
    try {
      const params = new URLSearchParams({ disciplineId, sessionType, clubId: selectedClubId, groupId: selectedGroupId });

      if (isRelayDisc) {
        // For relay: pass the lead skipper's memberId + full team order as JSON
        const leadMemberId = teamOrder[0]?.memberId || '';
        const leadProfile  = getMember(leadMemberId);
        params.set('memberId',  leadMemberId);
        params.set('firstName', leadProfile?.firstName || '');
        params.set('lastName',  leadProfile?.lastName  || '');
        // Resolve rtdbUid for the lead (needed for RTDB relay session node)
        const { rtdbUid } = await resolveSkipper({ memberId: leadMemberId, id: leadMemberId });
        params.set('rtdbUid', rtdbUid || '');
        params.set('teamOrder', encodeURIComponent(JSON.stringify(teamOrder)));
      } else {
        params.set('memberId',  selectedSkipper?.memberId  || '');
        params.set('firstName', selectedSkipper?.firstName || '');
        params.set('lastName',  selectedSkipper?.lastName  || '');
        params.set('rtdbUid',   selectedSkipper?.rtdbUid   || '');
      }

      window.location.href = `${returnPath}?${params}`;
    } catch (e) {
      console.error('[SkipperSelect] handleStart error:', e);
      setStarting(false);
    }
  };

  const showClubPicker  = memberClubs.length > 1;
  const showGroupPicker = memberGroups.length > 1;

  // ── Loading state ─────────────────────────────────────────────────────────
  if (!bootstrapDone) return (
    <div style={s.page}>
      <style>{pageCSS}</style>
      <div style={s.loadingWrap}>
        <div style={s.spinner} />
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <style>{pageCSS}</style>

      {/* Header */}
      <header style={s.header}>
        <a href="/live" style={s.backBtn}>
          <ArrowLeft size={16} /> Live
        </a>
        <div style={s.headerCenter}>
          <div style={s.modeChip(isCamera)}>
            {isCamera ? <Camera size={11} /> : <Hash size={11} />}
            {isCamera ? 'Camera tellen' : 'Manueel tellen'}
          </div>
        </div>
        {/* Spacer to balance back button */}
        <div style={{ width: '60px' }} />
      </header>

      <div style={s.content}>

        {/* ── Club ── */}
        {showClubPicker && (
          <section style={s.section}>
            <div style={s.stepLabel}>Club</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {memberClubs.map(c => (
                <button key={c.id} onClick={() => setSelectedClubId(c.id)} style={{
                  ...s.pill,
                  borderColor:     selectedClubId === c.id ? '#3b82f6' : '#334155',
                  backgroundColor: selectedClubId === c.id ? '#3b82f622' : 'transparent',
                  color:           selectedClubId === c.id ? '#60a5fa' : '#64748b',
                  fontWeight:      selectedClubId === c.id ? '700' : '500',
                }}>
                  {c.name}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Group ── */}
        {selectedClubId && showGroupPicker && (
          <section style={s.section}>
            <div style={s.stepLabel}>Groep</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {memberGroups.map(g => (
                <button key={g.id} onClick={() => setSelectedGroupId(g.id)} style={{
                  ...s.pill,
                  borderColor:     selectedGroupId === g.id ? '#22c55e' : '#334155',
                  backgroundColor: selectedGroupId === g.id ? '#22c55e22' : 'transparent',
                  color:           selectedGroupId === g.id ? '#22c55e' : '#64748b',
                  fontWeight:      selectedGroupId === g.id ? '700' : '500',
                }}>
                  {g.name}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Discipline ── */}
        {(!showClubPicker || selectedClubId) && (!showGroupPicker || selectedGroupId) && (
          <section style={s.section}>
            <div style={s.stepLabel}>Onderdeel</div>
            {discsLoading && disciplines.length === 0
              ? <div style={{ height: '42px', backgroundColor: '#1e293b', borderRadius: '10px', border: '1px solid #334155', opacity: 0.4 }} />
              : <DisciplineDropdown
                  value={disciplineId}
                  onChange={id => setDisciplineId(id)}
                  disciplines={disciplines}
                />
            }
          </section>
        )}

        {/* ── Session type ── */}
        {!!disciplineId && (
          <section style={s.section}>
            <div style={s.stepLabel}>Type sessie</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {['Training', 'Wedstrijd'].map(t => (
                <button key={t} onClick={() => setSessionType(t)} style={{
                  flex: 1, padding: '11px', borderRadius: '10px', fontFamily: 'inherit',
                  border: `1.5px solid ${sessionType === t ? (t === 'Wedstrijd' ? '#ef4444' : '#3b82f6') : '#334155'}`,
                  backgroundColor: sessionType === t ? (t === 'Wedstrijd' ? '#ef444422' : '#3b82f622') : 'transparent',
                  color: sessionType === t ? (t === 'Wedstrijd' ? '#ef4444' : '#60a5fa') : '#64748b',
                  fontWeight: sessionType === t ? '700' : '500', fontSize: '14px', cursor: 'pointer',
                }}>
                  {t === 'Training' ? '🏋️ Training' : '🏆 Wedstrijd'}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Skipper / team selection ── */}
        {!!disciplineId && groupReady && (
          <section style={s.section}>
            {isRelayDisc ? (
              /* Relay — only for manual mode */
              isCamera ? (
                <div style={s.warningBox}>
                  <AlertTriangle size={16} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '13px', color: '#f59e0b', marginBottom: '3px' }}>
                      Teamprestaties niet beschikbaar via camera
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>
                      De AI-camera kan momenteel maar één springer tegelijk volgen. Kies een individueel onderdeel of gebruik manueel tellen voor relay.
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div style={s.stepLabel}>
                    Team samenstellen
                    <span style={{ marginLeft: '8px', fontSize: '10px', fontWeight: '600', color: teamOrder.length === requiredSkippers ? '#22c55e' : '#f59e0b' }}>
                      {teamOrder.length} / {requiredSkippers}
                    </span>
                  </div>
                  <RelayTeamBuilder
                    skippers={skippers}
                    getMember={getMember}
                    value={teamOrder}
                    onChange={setTeamOrder}
                    required={requiredSkippers}
                  />
                </>
              )
            ) : (
              /* Individual skipper */
              <>
                <div style={s.stepLabel}>Skipper</div>
                {skippers.length === 0 ? (
                  <p style={{ fontSize: '13px', color: '#475569', margin: 0 }}>Geen skippers in deze groep.</p>
                ) : (
                  <div style={s.skipperGrid}>
                    {skippers.map(sk => {
                      const memberId  = sk.memberId || sk.id;
                      const profile   = getMember(memberId);
                      const firstName = profile?.firstName || '?';
                      const lastName  = profile?.lastName  || '';
                      const initials  = `${firstName[0] || '?'}${lastName[0] || ''}`.toUpperCase();
                      const isChosen  = selectedSkipper?.memberId === memberId;
                      return (
                        <button key={memberId} onClick={async () => {
                          const resolved = await resolveSkipper(sk);
                          setSelectedSkipper(resolved);
                        }} style={{
                          padding: '14px 10px', borderRadius: '12px', fontFamily: 'inherit',
                          border: `1.5px solid ${isChosen ? '#3b82f6' : '#334155'}`,
                          backgroundColor: isChosen ? '#1e3a5f' : '#1e293b',
                          cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                        }}>
                          <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: isChosen ? '#3b82f6' : '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '15px', color: 'white' }}>
                            {initials}
                          </div>
                          <div style={{ fontSize: '13px', fontWeight: isChosen ? '700' : '500', color: isChosen ? '#f1f5f9' : '#94a3b8', textAlign: 'center', lineHeight: 1.3 }}>
                            {firstName}{'\n'}{lastName}
                          </div>
                          {isChosen && <div style={{ fontSize: '9px', color: '#3b82f6', fontWeight: '800', letterSpacing: '0.4px' }}>✓ GESELECTEERD</div>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* ── Start button ── */}
        <div style={{ paddingTop: '8px' }}>
          <button
            onClick={handleStart}
            disabled={!canStart || starting}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
              padding: '16px', borderRadius: '14px', border: 'none',
              backgroundColor: canStart ? (isCamera ? '#f59e0b' : '#3b82f6') : '#1e293b',
              color: canStart ? 'white' : '#334155',
              fontWeight: '800', fontSize: '16px',
              cursor: canStart ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              opacity: starting ? 0.65 : 1,
              transition: 'background-color 0.15s',
            }}
          >
            {isCamera ? <Camera size={20} /> : <Hash size={20} />}
            {starting ? 'Starten…' : isCamera ? 'Start camera' : 'Start tellen'}
          </button>
        </div>

      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const pageCSS = `
  * { box-sizing: border-box; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

const s = {
  page:       { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'system-ui, sans-serif' },
  loadingWrap:{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  spinner:    { width: '32px', height: '32px', border: '3px solid #1e293b', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },

  header:     {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 16px', backgroundColor: '#1e293b', borderBottom: '1px solid #334155',
    position: 'sticky', top: 0, zIndex: 50,
  },
  backBtn:    { display: 'flex', alignItems: 'center', gap: '5px', color: '#64748b', textDecoration: 'none', fontSize: '13px', fontWeight: '600', minWidth: '60px' },
  headerCenter: { display: 'flex', justifyContent: 'center', flex: 1 },
  modeChip:   (isCamera) => ({
    display: 'inline-flex', alignItems: 'center', gap: '5px',
    padding: '5px 12px', borderRadius: '20px',
    backgroundColor: isCamera ? '#f59e0b22' : '#3b82f622',
    border: `1px solid ${isCamera ? '#f59e0b44' : '#3b82f644'}`,
    color: isCamera ? '#f59e0b' : '#60a5fa',
    fontSize: '12px', fontWeight: '700',
  }),

  content:    { maxWidth: '560px', margin: '0 auto', padding: '24px 16px 48px' },
  section:    { marginBottom: '28px' },
  stepLabel:  { fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '10px', display: 'flex', alignItems: 'center' },
  pill:       { padding: '9px 16px', borderRadius: '20px', border: '1px solid', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' },
  skipperGrid:{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '10px' },
  warningBox: { display: 'flex', gap: '12px', alignItems: 'flex-start', backgroundColor: '#f59e0b11', border: '1px solid #f59e0b33', borderRadius: '12px', padding: '14px 16px' },
};
