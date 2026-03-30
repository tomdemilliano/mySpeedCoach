/**
 * pages/live.js  —  Live Hub
 *
 * Central entry point for all live / counting / monitoring features.
 * Cards:
 *   1. Manueel tellen      — skipper selection → /counter
 *   2. Camera tellen       — skipper selection → /ai-counter?mode=camera
 *   3. Video uploaden      — no skipper needed → /ai-counter?mode=upload
 *   4. Hartslag            — → /heart-rate
 *   5. Dashboard           — → /dashboard
 *   6. Live Training       — upcoming (placeholder)
 *
 * Rules followed:
 *   - All DB access via factories only, via the useSkipperSelection hook (CLAUDE.md §1)
 *   - No <form> elements (CLAUDE.md §4)
 *   - Inline CSS only (CLAUDE.md §9)
 *   - Dutch UI strings (CLAUDE.md §9)
 */

import { useState, useEffect } from 'react';
import {
  Hash, Camera, Upload, Heart, LayoutDashboard,
  Zap, ChevronRight, Users, ChevronDown, X,
} from 'lucide-react';
import { useSkipperSelection } from '../hooks/useSkipperSelection';
import { useDisciplines } from '../hooks/useDisciplines';

// ─── DisciplineDropdown ───────────────────────────────────────────────────────
function DisciplineDropdown({ value, onChange, disciplines }) {
  const srDiscs  = disciplines.filter(d => d.ropeType === 'SR');
  const ddDiscs  = disciplines.filter(d => d.ropeType === 'DD');
  const selected = disciplines.find(d => d.id === value) || null;

  const formatDetail = (d) => {
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
          ℹ {formatDetail(selected)}
        </div>
      )}
    </div>
  );
}

// ─── SkipperSelectionPanel ────────────────────────────────────────────────────
// Uses the shared useSkipperSelection hook for all data fetching.
// Props:
//   mode     'manual' | 'camera'
//   onClose  () => void
function SkipperSelectionPanel({ mode, onClose }) {
  const {
    bootstrapDone,
    memberClubs, memberGroups,
    skippers,
    selectedClubId, selectedGroupId,
    setSelectedClubId, setSelectedGroupId,
    getMember, resolveSkipper,
  } = useSkipperSelection();

  const { disciplines, loading: discsLoading, getDisc } = useDisciplines();

  const [disciplineId,    setDisciplineId]    = useState('');
  const [sessionType,     setSessionType]     = useState('Training');
  const [selectedSkipper, setSelectedSkipper] = useState(null);

  const currentDisc = getDisc(disciplineId);
  const isRelayDisc = currentDisc?.specialRule === 'relay';

  // Set default discipline once loaded
  useEffect(() => {
    if (disciplines.length > 0 && !disciplineId) setDisciplineId(disciplines[0].id);
  }, [disciplines]);

  // Reset skipper when group changes
  useEffect(() => { setSelectedSkipper(null); }, [selectedGroupId]);

  const groupReady = !!(selectedClubId && selectedGroupId);
  const canStart   = !!disciplineId && groupReady && (isRelayDisc || !!selectedSkipper);

  const handleStart = () => {
    const params = new URLSearchParams({
      disciplineId,
      sessionType,
      clubId:    selectedClubId,
      groupId:   selectedGroupId,
      memberId:  selectedSkipper?.memberId || '',
      firstName: selectedSkipper?.firstName || '',
      lastName:  selectedSkipper?.lastName  || '',
      rtdbUid:   selectedSkipper?.rtdbUid   || '',
    });
    const path = mode === 'camera'
      ? `/ai-counter?mode=camera&${params}`
      : `/counter?${params}`;
    window.location.href = path;
  };

  const showClubPicker  = memberClubs.length > 1;
  const showGroupPicker = memberGroups.length > 1;

  if (!bootstrapDone) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
      <div style={sp.spinner} />
    </div>
  );

  return (
    <div>
      {/* Club picker */}
      {showClubPicker && (
        <div style={sp.section}>
          <div style={sp.stepLabel}>Club</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {memberClubs.map(c => (
              <button key={c.id} onClick={() => setSelectedClubId(c.id)} style={{
                ...sp.pill,
                borderColor:     selectedClubId === c.id ? '#3b82f6' : '#334155',
                backgroundColor: selectedClubId === c.id ? '#3b82f622' : 'transparent',
                color:           selectedClubId === c.id ? '#60a5fa' : '#64748b',
                fontWeight:      selectedClubId === c.id ? '700' : '500',
              }}>
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Group picker */}
      {selectedClubId && showGroupPicker && (
        <div style={sp.section}>
          <div style={sp.stepLabel}>Groep</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {memberGroups.map(g => (
              <button key={g.id} onClick={() => setSelectedGroupId(g.id)} style={{
                ...sp.pill,
                borderColor:     selectedGroupId === g.id ? '#22c55e' : '#334155',
                backgroundColor: selectedGroupId === g.id ? '#22c55e22' : 'transparent',
                color:           selectedGroupId === g.id ? '#22c55e' : '#64748b',
                fontWeight:      selectedGroupId === g.id ? '700' : '500',
              }}>
                {g.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Discipline */}
      {(!showClubPicker || selectedClubId) && (!showGroupPicker || selectedGroupId) && (
        <div style={sp.section}>
          <div style={sp.stepLabel}>Onderdeel</div>
          {discsLoading && disciplines.length === 0
            ? <div style={{ height: '42px', backgroundColor: '#1e293b', borderRadius: '10px', border: '1px solid #334155', opacity: 0.4 }} />
            : <DisciplineDropdown
                value={disciplineId}
                onChange={id => { setDisciplineId(id); setSelectedSkipper(null); }}
                disciplines={disciplines}
              />
          }
        </div>
      )}

      {/* Session type */}
      {!!disciplineId && (
        <div style={sp.section}>
          <div style={sp.stepLabel}>Type sessie</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['Training', 'Wedstrijd'].map(t => (
              <button key={t} onClick={() => setSessionType(t)} style={{
                flex: 1, padding: '10px', borderRadius: '10px', fontFamily: 'inherit',
                border: `1.5px solid ${sessionType === t ? (t === 'Wedstrijd' ? '#ef4444' : '#3b82f6') : '#334155'}`,
                backgroundColor: sessionType === t ? (t === 'Wedstrijd' ? '#ef444422' : '#3b82f622') : 'transparent',
                color: sessionType === t ? (t === 'Wedstrijd' ? '#ef4444' : '#60a5fa') : '#64748b',
                fontWeight: sessionType === t ? '700' : '500', fontSize: '14px', cursor: 'pointer',
              }}>
                {t === 'Training' ? '🏋️ Training' : '🏆 Wedstrijd'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Skipper grid */}
      {!!disciplineId && groupReady && !isRelayDisc && (
        <div style={sp.section}>
          <div style={sp.stepLabel}>Skipper</div>
          {skippers.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#475569', margin: 0 }}>Geen skippers in deze groep.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '8px' }}>
              {skippers.map(s => {
                const memberId  = s.memberId || s.id;
                const profile   = getMember(memberId);
                const firstName = profile?.firstName || '?';
                const lastName  = profile?.lastName  || '';
                const initials  = `${firstName[0] || '?'}${lastName[0] || ''}`.toUpperCase();
                const isChosen  = selectedSkipper?.memberId === memberId;
                return (
                  <button key={memberId} onClick={async () => {
                    const resolved = await resolveSkipper(s);
                    setSelectedSkipper(resolved);
                  }} style={{
                    padding: '12px 8px', borderRadius: '10px', fontFamily: 'inherit',
                    border: `1.5px solid ${isChosen ? '#3b82f6' : '#334155'}`,
                    backgroundColor: isChosen ? '#1e3a5f' : '#0f172a',
                    cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                  }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: isChosen ? '#3b82f6' : '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '12px', color: 'white' }}>
                      {initials}
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: isChosen ? '700' : '500', color: isChosen ? '#f1f5f9' : '#94a3b8', textAlign: 'center' }}>
                      {firstName} {lastName}
                    </div>
                    {isChosen && <div style={{ fontSize: '9px', color: '#3b82f6', fontWeight: '700' }}>✓</div>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Relay notice */}
      {!!disciplineId && groupReady && isRelayDisc && (
        <div style={{ ...sp.section, backgroundColor: '#f59e0b11', borderRadius: '10px', border: '1px solid #f59e0b33', padding: '12px 14px' }}>
          <div style={{ fontSize: '13px', color: '#f59e0b', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Users size={14} /> Relay-volgorde instellen via de teller
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
            Na het starten kan je de teamvolgorde samenstellen in de teller.
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
        <button
          onClick={handleStart}
          disabled={!canStart}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            padding: '14px', borderRadius: '12px', border: 'none',
            backgroundColor: canStart ? (mode === 'camera' ? '#f59e0b' : '#3b82f6') : '#1e293b',
            color: canStart ? 'white' : '#334155',
            fontWeight: '700', fontSize: '15px', cursor: canStart ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit', opacity: canStart ? 1 : 0.5,
          }}
        >
          {mode === 'camera' ? <Camera size={18} /> : <Hash size={18} />}
          {mode === 'camera' ? 'Start camera' : 'Start tellen'}
        </button>
        <button onClick={onClose} style={{
          padding: '14px 16px', borderRadius: '12px', border: '1px solid #334155',
          backgroundColor: 'transparent', color: '#64748b',
          fontWeight: '600', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit',
        }}>
          Annuleren
        </button>
      </div>
    </div>
  );
}

const sp = {
  section:   { marginBottom: '18px' },
  stepLabel: { fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '8px' },
  pill:      { padding: '8px 14px', borderRadius: '20px', border: '1px solid', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' },
  spinner:   { width: '28px', height: '28px', border: '3px solid #1e293b', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
};

// ─── Feature Card ─────────────────────────────────────────────────────────────
function FeatureCard({ icon: Icon, color, title, subtitle, onClick, disabled, badge, href }) {
  const inner = (
    <div
      onClick={disabled ? undefined : onClick}
      style={{
        backgroundColor: '#1e293b', borderRadius: '14px',
        border: `1px solid ${disabled ? '#1e293b' : color + '33'}`,
        padding: '18px', cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        display: 'flex', flexDirection: 'column', gap: '12px',
        transition: 'border-color 0.15s', textDecoration: 'none', color: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{
          width: '44px', height: '44px', borderRadius: '12px',
          backgroundColor: color + '22', border: `1px solid ${color}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={20} color={color} />
        </div>
        {badge && (
          <span style={{
            fontSize: '9px', fontWeight: '800', letterSpacing: '0.5px',
            padding: '3px 8px', borderRadius: '8px',
            backgroundColor: badge === 'Binnenkort' ? '#475569' : color + '22',
            color: badge === 'Binnenkort' ? '#94a3b8' : color,
            border: `1px solid ${badge === 'Binnenkort' ? '#334155' : color + '44'}`,
          }}>
            {badge}
          </span>
        )}
        {!badge && !disabled && <ChevronRight size={16} color={color + '88'} />}
      </div>
      <div>
        <div style={{ fontWeight: '700', fontSize: '15px', color: '#f1f5f9', marginBottom: '3px' }}>{title}</div>
        <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>{subtitle}</div>
      </div>
    </div>
  );

  if (href && !disabled) return <a href={href} style={{ textDecoration: 'none' }}>{inner}</a>;
  return inner;
}

// ─── Bottom sheet wrapper ─────────────────────────────────────────────────────
function BottomSheet({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 500 }}>
      <div style={{
        backgroundColor: '#1e293b', borderRadius: '20px 20px 0 0',
        padding: '24px', width: '100%', maxWidth: '560px',
        border: '1px solid #334155', maxHeight: '92vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#f1f5f9' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function LivePage() {
  const [sheet, setSheet] = useState(null); // null | 'manual' | 'camera'

  const cards = [
    {
      icon:    Hash,
      color:   '#3b82f6',
      title:   'Manueel tellen',
      subtitle:'Tel stappen handmatig met live hartslag en badgeverificatie',
      action:  () => setSheet('manual'),
    },
    {
      icon:    Camera,
      color:   '#f59e0b',
      title:   'Camera tellen',
      subtitle:'AI-stapteller via live camera',
      badge:   'BETA',
      action:  () => setSheet('camera'),
    },
    {
      icon:    Upload,
      color:   '#a78bfa',
      title:   'Video uploaden',
      subtitle:'Upload een opgenomen video voor automatische staptelling',
      badge:   'BETA',
      href:    '/ai-counter?mode=upload',
    },
    {
      icon:    Heart,
      color:   '#ef4444',
      title:   'Hartslag',
      subtitle:'Volledig scherm hartslagweergave via Bluetooth HRM',
      href:    '/heart-rate',
    },
    {
      icon:    LayoutDashboard,
      color:   '#22c55e',
      title:   'Dashboard',
      subtitle:'Live monitoring van skippers tijdens de training',
      href:    '/dashboard',
    },
    {
      icon:    Zap,
      color:   '#64748b',
      title:   'Live Training',
      subtitle:'AI-coach die je automatisch begeleidt in intervallen, zone 2, …',
      badge:   'Binnenkort',
      disabled: true,
    },
  ];

  return (
    <div style={s.page}>
      <style>{pageCSS}</style>

      <header style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '34px', height: '34px', borderRadius: '9px', backgroundColor: '#22c55e22', border: '1px solid #22c55e44', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={17} color="#22c55e" />
          </div>
          <div>
            <div style={{ fontWeight: '800', fontSize: '15px', color: '#f1f5f9' }}>Live</div>
            <div style={{ fontSize: '11px', color: '#475569' }}>Tellen & monitoren</div>
          </div>
        </div>
      </header>

      <div style={s.content}>
        <div style={s.grid}>
          {cards.map((card, i) => (
            <FeatureCard
              key={i}
              icon={card.icon}
              color={card.color}
              title={card.title}
              subtitle={card.subtitle}
              badge={card.badge}
              disabled={card.disabled}
              onClick={card.action}
              href={card.href}
            />
          ))}
        </div>
      </div>

      {sheet === 'manual' && (
        <BottomSheet title="Manueel tellen" onClose={() => setSheet(null)}>
          <SkipperSelectionPanel mode="manual" onClose={() => setSheet(null)} />
        </BottomSheet>
      )}

      {sheet === 'camera' && (
        <BottomSheet title="Camera tellen" onClose={() => setSheet(null)}>
          <SkipperSelectionPanel mode="camera" onClose={() => setSheet(null)} />
        </BottomSheet>
      )}
    </div>
  );
}

const pageCSS = `
  * { box-sizing: border-box; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

const s = {
  page:    { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'system-ui, sans-serif' },
  header:  { display: 'flex', alignItems: 'center', padding: '12px 16px', backgroundColor: '#1e293b', borderBottom: '1px solid #334155', position: 'sticky', top: 0, zIndex: 50 },
  content: { maxWidth: '720px', margin: '0 auto', padding: '24px 16px 48px' },
  grid:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' },
};
