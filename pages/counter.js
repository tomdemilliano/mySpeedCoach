import { useState, useEffect, useRef, memo, useCallback } from 'react';
import {
  LiveSessionFactory, GroupFactory, UserFactory,
  BadgeFactory, CounterBadgeFactory, ClubMemberFactory, UserMemberLinkFactory,
} from '../constants/dbSchema';
import { useDisciplines } from '../hooks/useDisciplines';
import {
  Hash, Timer, Square, History as HistoryIcon,
  Play, Clock, Users, Building2, Trophy, ArrowLeft,
  Award, Check, X, Zap, Medal, ChevronRight,
  SkipForward, AlertTriangle, GripVertical, RefreshCw,
  ChevronDown,
} from 'lucide-react';
import { Sparkles } from 'lucide-react';
import { useSkipperSelection } from '../hooks/useSkipperSelection';

// ─── Constants ────────────────────────────────────────────────────────────────
const AUTO_STOP_IDLE_MS  = 15000;
const TRIPLE_UNDER_IDLE  = 15000;

const COOKIE_KEY = 'msc_uid';
const getCookie = () => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`));
  return match ? match[1] : null;
};

if (typeof document !== 'undefined') {
  const styleId = 'counter-keyframes';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes sparkFlyA { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(-120px,-200px) scale(0);opacity:0} }
      @keyframes sparkFlyB { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(80px,-250px) scale(0);opacity:0} }
      @keyframes sparkFlyC { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(150px,-180px) scale(0);opacity:0} }
      @keyframes sparkFlyD { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(-80px,-220px) scale(0);opacity:0} }
      @keyframes sparkFlyE { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(30px,-300px) scale(0);opacity:0} }
      @keyframes sparkFlyF { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(-200px,-150px) scale(0);opacity:0} }
      @keyframes pulse      { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
      @keyframes fadeInUp   { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
      @keyframes spin       { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      @keyframes countPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.15)} }
    `;
    document.head.appendChild(style);
  }
}

const SPARK_ANIMS = ['sparkFlyA','sparkFlyB','sparkFlyC','sparkFlyD','sparkFlyE','sparkFlyF'];

// ─── Celebration Overlay ──────────────────────────────────────────────────────
function CelebrationOverlay({ type, data, onAccept, onDecline }) {
  const isBadge     = type === 'badge';
  const accentColor = isBadge ? '#f59e0b' : '#facc15';
  const Icon        = isBadge ? Medal : Award;
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 3000, overflow: 'hidden' }}>
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} style={{ position: 'absolute', left: `${10 + (i * 3.5) % 80}%`, top: `${15 + (i * 7) % 70}%`, width: `${5 + (i % 4) * 3}px`, height: `${5 + (i % 4) * 3}px`, borderRadius: '50%', backgroundColor: ['#facc15','#f97316','#ef4444','#22c55e','#60a5fa','#a78bfa'][i % 6], animation: `${SPARK_ANIMS[i % 6]} ${0.9 + (i % 5) * 0.2}s ease-out ${(i % 8) * 0.12}s forwards` }} />
        ))}
      </div>
      <div style={st.modalOverlay}>
        <div style={{ ...st.modalContent, borderColor: accentColor, animation: 'fadeInUp 0.4s ease-out' }}>
          {isBadge && data.badgeImageUrl ? (
            <img src={data.badgeImageUrl} alt={data.badgeName} style={{ width: '90px', height: '90px', borderRadius: '50%', objectFit: 'cover', margin: '0 auto 16px', display: 'block', border: `3px solid ${accentColor}` }} />
          ) : (
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: `${accentColor}22`, border: `2px solid ${accentColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', animation: 'pulse 1.5s ease-in-out infinite', fontSize: isBadge ? '40px' : undefined }}>
              {isBadge ? (data.badgeEmoji || '🏅') : <Icon size={40} color={accentColor} />}
            </div>
          )}
          <h2 style={{ color: accentColor, fontSize: '24px', margin: '0 0 8px', textAlign: 'center' }}>
            {isBadge ? '🎖️ BADGE VERDIEND!' : '🏆 NIEUW RECORD!'}
          </h2>
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            {isBadge ? (
              <>
                <div style={{ fontSize: '22px', fontWeight: '900', color: 'white', lineHeight: 1 }}>{data.badgeName}</div>
                <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '8px' }}>{data.badgeDescription || ''}</div>
                <div style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>Uitgereikt door: {data.awardedByName || 'Systeem'}</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '42px', fontWeight: '900', color: 'white', lineHeight: 1 }}>{data.score}</div>
                <div style={{ color: '#94a3b8', fontSize: '14px', marginTop: '4px' }}>stappen</div>
                {data.previousBest > 0 && (
                  <div style={{ color: '#22c55e', fontSize: '13px', marginTop: '8px' }}>+{data.score - data.previousBest} beter dan vorig record ({data.previousBest})</div>
                )}
              </>
            )}
          </div>
          {isBadge ? (
            <button onClick={onAccept} style={{ width: '100%', padding: '14px', backgroundColor: accentColor, border: 'none', borderRadius: '10px', color: 'white', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Check size={20} /> GEWELDIG!
            </button>
          ) : (
            <>
              <p style={{ color: '#cbd5e1', textAlign: 'center', fontSize: '14px', marginBottom: '20px' }}>Wil je dit als officieel record registreren?</p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={onAccept}  style={{ flex: 1, padding: '14px', backgroundColor: '#22c55e', border: 'none', borderRadius: '10px', color: 'white', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><Check size={20} /> JA</button>
                <button onClick={onDecline} style={{ flex: 1, padding: '14px', backgroundColor: '#475569', border: 'none', borderRadius: '10px', color: 'white', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><X size={20} /> NEE</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Isolated Timer ────────────────────────────────────────────────────────────
const LiveTimer = memo(({ startTime, durationSeconds, isRecording, isFinished, overtimeColor = '#f97316' }) => {
  const [display,    setDisplay]    = useState('0:00');
  const [isOvertime, setIsOvertime] = useState(false);

  useEffect(() => {
    if (!isRecording && !isFinished) { setDisplay('0:00'); setIsOvertime(false); return; }
    const interval = setInterval(() => {
      if (isRecording && startTime) {
        const elapsed   = Math.floor((Date.now() - startTime) / 1000);
        const remaining = durationSeconds ? durationSeconds - elapsed : -elapsed;
        const abs  = Math.abs(remaining);
        const mins = Math.floor(abs / 60);
        const secs = abs % 60;
        setIsOvertime(remaining < 0);
        setDisplay(`${remaining < 0 ? '+' : ''}${mins}:${secs.toString().padStart(2, '0')}`);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [startTime, durationSeconds, isRecording, isFinished]);

  return (
    <div style={{ fontSize: '28px', fontWeight: 'bold', fontFamily: 'monospace', color: isOvertime ? overtimeColor : '#60a5fa', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <Timer size={22} color={isOvertime ? overtimeColor : '#60a5fa'} />
      {display}
    </div>
  );
});

// ─── Discipline Dropdown ───────────────────────────────────────────────────────
// Clean native-style dropdown with a custom wrapper for consistent dark styling.
function DisciplineDropdown({ value, onChange, disciplines, disabled }) {
  if (!disciplines || disciplines.length === 0) {
    return (
      <div style={{ height: '40px', backgroundColor: '#1e293b', borderRadius: '10px', border: '1px solid #334155', opacity: 0.4 }} />
    );
  }

  const selected = disciplines.find(d => d.id === value) || null;
  const srDiscs  = disciplines.filter(d => d.ropeType === 'SR');
  const ddDiscs  = disciplines.filter(d => d.ropeType === 'DD');

  const formatDur = (d) => {
    if (!d.durationSeconds) return '∞';
    if (d.durationSeconds < 60) return `${d.durationSeconds}s`;
    return `${d.durationSeconds / 60}min`;
  };

  const detailLine = (d) => {
    if (!d) return '';
    const parts = [formatDur(d)];
    if (!d.isIndividual) parts.push(`Team ${d.teamSize}`);
    if (d.specialRule === 'triple_under') parts.push('15s herstart');
    if (d.specialRule === 'relay')        parts.push('beurtelings');
    return parts.join(' · ');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {/* Custom select wrapper */}
      <div style={{ position: 'relative' }}>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          style={{
            width: '100%',
            appearance: 'none', WebkitAppearance: 'none',
            backgroundColor: '#0f172a',
            border: '1.5px solid #334155',
            borderRadius: '10px',
            color: '#f1f5f9',
            fontSize: '14px',
            fontWeight: '600',
            padding: '10px 36px 10px 12px',
            fontFamily: 'inherit',
            cursor: disabled ? 'default' : 'pointer',
            outline: 'none',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => { e.target.style.borderColor = '#3b82f6'; }}
          onBlur={e  => { e.target.style.borderColor = '#334155'; }}
        >
          {srDiscs.length > 0 && ddDiscs.length > 0 && <optgroup label="─── Single Rope ───" style={{ color: '#475569' }}>{srDiscs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>}
          {srDiscs.length > 0 && ddDiscs.length === 0 && srDiscs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          {ddDiscs.length > 0 && <optgroup label="─── Double Dutch ───" style={{ color: '#475569' }}>{ddDiscs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>}
        </select>
        {/* Chevron icon */}
        <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#64748b' }}>
          <ChevronDown size={16} />
        </div>
      </div>
      {/* Detail line for selected discipline */}
      {selected && (
        <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', paddingLeft: '2px' }}>
          <span style={{ color: '#475569' }}>ℹ</span> {detailLine(selected)}
        </div>
      )}
    </div>
  );
}

// ─── Relay Team Builder ───────────────────────────────────────────────────────
function RelayTeamBuilder({ skippers, clubMembers, value, onChange, required = 2 }) {
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const selectedIds = new Set(value.map(v => v.memberId));
  const isFull      = value.length >= required;
  const isDone      = value.length === required;

//  const getProfile = (memberId) => clubMembers.find(m => m.id === memberId);

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

  const handleDragStart = (idx) => setDragging(idx);
  const handleDragOver  = (e, idx) => { e.preventDefault(); setDragOver(idx); };
  const handleDrop      = (e, targetIdx) => {
    e.preventDefault();
    if (dragging === null || dragging === targetIdx) { setDragging(null); setDragOver(null); return; }
    const next = [...value];
    const [moved] = next.splice(dragging, 1);
    next.splice(targetIdx, 0, moved);
    onChange(next);
    setDragging(null); setDragOver(null);
  };

  if (skippers.length === 0) {
    return <p style={{ color: '#475569', fontSize: '13px', padding: '8px 0' }}>Geen skippers in deze groep.</p>;
  }

  return (
    <div>
      <div style={{ fontSize: '11px', marginBottom: '8px', color: isDone ? '#22c55e' : '#64748b', display: 'flex', alignItems: 'center', gap: '5px' }}>
        {isDone ? `✓ ${required} skipper${required > 1 ? 's' : ''} geselecteerd` : `Tik om te selecteren · ${required - value.length} nog nodig`}
      </div>
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
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '20px', cursor: dimmed ? 'not-allowed' : 'pointer', fontFamily: 'inherit', border: '1.5px solid', borderColor: isIn ? '#3b82f6' : '#334155', backgroundColor: isIn ? '#1e3a5f' : 'transparent', opacity: dimmed ? 0.35 : 1, transition: 'all 0.12s' }}>
              <div style={{ width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0, backgroundColor: isIn ? '#3b82f6' : '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: 'white' }}>
                {isIn ? position : initials}
              </div>
              <span style={{ fontSize: '13px', fontWeight: isIn ? '700' : '400', color: isIn ? '#f1f5f9' : '#94a3b8' }}>{firstName} {lastName}</span>
              {isIn && <span style={{ fontSize: '13px', color: '#60a5fa' }}>✓</span>}
            </button>
          );
        })}
      </div>
      {value.length > 0 && (
        <div>
          <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <GripVertical size={11} /> Volgorde aanpassen
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {value.map((item, idx) => {
              const profile   = getMember(item.memberId);
              const initials  = `${profile?.firstName?.[0] || '?'}${profile?.lastName?.[0] || ''}`.toUpperCase();
              const isDraggedOver = dragOver === idx;
              return (
                <div key={item.memberId} draggable onDragStart={() => handleDragStart(idx)} onDragOver={(e) => handleDragOver(e, idx)} onDrop={(e) => handleDrop(e, idx)} onDragEnd={() => { setDragging(null); setDragOver(null); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '10px', backgroundColor: isDraggedOver ? '#1e3a5f' : '#0f172a', border: `1px solid ${isDraggedOver ? '#3b82f6' : dragging === idx ? '#475569' : '#1e293b'}`, cursor: 'grab', userSelect: 'none', opacity: dragging === idx ? 0.5 : 1, transition: 'border-color 0.12s, background-color 0.12s' }}>
                  <span style={{ color: '#475569', flexShrink: 0, fontSize: '16px' }}>⠿</span>
                  <div style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: '#3b82f622', border: '1px solid #3b82f644', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', color: '#60a5fa', flexShrink: 0 }}>{initials}</div>
                  <div style={{ flex: 1, fontSize: '13px', fontWeight: '600', color: '#f1f5f9' }}>{profile ? `${profile.firstName} ${profile.lastName}` : item.memberId}</div>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: isDone ? '#22c55e' : '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', color: 'white', flexShrink: 0 }}>{idx + 1}</div>
                  <button type="button" onClick={() => onChange(value.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', flexShrink: 0 }}><X size={14} /></button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Relay scoreboard ────────────────────────────────────────────────────────
function RelayScoreboard({ relayOrder, relayResults, currentSkipperIndex, discName }) {
  const total = relayResults.reduce((s, r) => s + (r.steps || 0), 0);
  return (
    <div style={{ width: '100%', maxWidth: '440px', backgroundColor: '#1e293b', borderRadius: '14px', border: '1px solid #334155', padding: '14px', marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{discName} · Teamtotaal</div>
        <div style={{ fontSize: '22px', fontWeight: '900', color: '#60a5fa' }}>{total} <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '400' }}>stappen</span></div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {relayOrder.map((item, idx) => {
          const result    = relayResults[idx] || { steps: 0 };
          const isCurrent = idx === currentSkipperIndex;
          const isDone    = idx < currentSkipperIndex;
          return (
            <div key={item.memberId} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '8px', backgroundColor: isCurrent ? '#1e3a5f' : '#0f172a', border: `1px solid ${isCurrent ? '#3b82f688' : isDone ? '#22c55e33' : '#1e293b'}`, opacity: !isCurrent && !isDone ? 0.45 : 1, transition: 'all 0.3s' }}>
              <div style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: isCurrent ? '#3b82f6' : isDone ? '#22c55e' : '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', color: 'white', flexShrink: 0 }}>{isDone ? '✓' : idx + 1}</div>
              <div style={{ flex: 1, fontSize: '13px', fontWeight: isCurrent ? '700' : '400', color: isCurrent ? '#f1f5f9' : isDone ? '#94a3b8' : '#475569' }}>{item.name}</div>
              <div style={{ fontSize: '16px', fontWeight: '800', color: isCurrent ? '#60a5fa' : isDone ? '#22c55e' : '#334155' }}>{result.steps ?? '—'}</div>
              {isCurrent && <div style={{ fontSize: '9px', fontWeight: '700', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.5px' }}>ACTIEF</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Relay results summary ────────────────────────────────────────────────────
function RelayResultsSummary({ relayOrder, relayResults, discName, sessionType, onNewSession, onReset }) {
  const total = relayResults.reduce((s, r) => s + (r.steps || 0), 0);
  return (
    <div style={{ width: '100%', maxWidth: '440px', backgroundColor: '#1e293b', borderRadius: '14px', border: '1px solid #22c55e44', padding: '20px', animation: 'fadeInUp 0.4s ease-out' }}>
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <div style={{ fontSize: '36px', marginBottom: '6px' }}>🏆</div>
        <div style={{ fontSize: '14px', fontWeight: '700', color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sessie voltooid!</div>
        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{discName} · {sessionType}</div>
      </div>
      <div style={{ backgroundColor: '#0f172a', borderRadius: '10px', padding: '14px', marginBottom: '14px', textAlign: 'center', border: '1px solid #22c55e33' }}>
        <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Teamtotaal</div>
        <div style={{ fontSize: '44px', fontWeight: '900', color: '#22c55e', lineHeight: 1 }}>{total}</div>
        <div style={{ fontSize: '12px', color: '#64748b' }}>stappen</div>
      </div>
      <div style={{ marginBottom: '8px', fontSize: '11px', color: '#475569', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Individueel</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '16px' }}>
        {relayOrder.map((item, idx) => {
          const result = relayResults[idx] || { steps: 0 };
          return (
            <div key={item.memberId} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b' }}>
              <div style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', color: '#94a3b8', flexShrink: 0 }}>{idx + 1}</div>
              <div style={{ flex: 1, fontSize: '13px', color: '#94a3b8' }}>{item.name}</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#60a5fa' }}>{result.steps ?? 0}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
        <button onClick={onNewSession} style={{ flex: 1, padding: '13px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '10px', color: 'white', fontWeight: '700', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <Play size={16} fill="white" /> Nieuwe sessie
        </button>
        <button onClick={onReset} style={{ padding: '13px 16px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '10px', color: '#94a3b8', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
          Andere skipper
        </button>
      </div>
    </div>
  );
}

// ─── Triple Under display ─────────────────────────────────────────────────────
function TripleUnderDisplay({ attempts, currentAttempt, missCountdown, onMisser }) {
  const best = Math.max(...attempts.map(a => a.steps), 0);
  return (
    <div style={{ width: '100%', maxWidth: '440px' }}>
      {attempts.length > 0 && (
        <div style={{ backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '12px 14px', marginBottom: '10px' }}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Pogingen · Beste: <span style={{ color: '#facc15' }}>{best}</span>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {attempts.map((a, i) => (
              <div key={i} style={{ padding: '4px 10px', borderRadius: '6px', backgroundColor: a.steps === best && best > 0 ? '#facc1522' : '#0f172a', border: `1px solid ${a.steps === best && best > 0 ? '#facc1544' : '#334155'}`, fontSize: '13px', fontWeight: '700', color: a.steps === best && best > 0 ? '#facc15' : '#94a3b8' }}>
                #{i + 1}: {a.steps}
              </div>
            ))}
          </div>
        </div>
      )}
      {missCountdown !== null && (
        <div style={{ backgroundColor: '#ef444422', border: '1px solid #ef444444', borderRadius: '12px', padding: '12px 16px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ fontSize: '28px', fontWeight: '900', color: '#ef4444', fontFamily: 'monospace', animation: 'countPulse 1s ease-in-out infinite', minWidth: '36px', textAlign: 'center' }}>{missCountdown}</div>
          <div>
            <div style={{ fontWeight: '700', fontSize: '13px', color: '#ef4444' }}>Misser! Nog {missCountdown}s om verder te gaan</div>
            <div style={{ fontSize: '11px', color: '#ef444488', marginTop: '2px' }}>Begin opnieuw te tellen om poging {attempts.length + 2} te starten</div>
          </div>
        </div>
      )}
      {missCountdown === null && (
        <button onClick={onMisser} style={{ width: '100%', padding: '12px', backgroundColor: '#ef444422', border: '2px solid #ef444466', borderRadius: '12px', color: '#ef4444', fontWeight: '700', fontSize: '15px', cursor: 'pointer', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <AlertTriangle size={18} /> MISSER (start 15s countdown)
        </button>
      )}
    </div>
  );
}

// ─── Action buttons shown in setup — Manueel tellen + AI Stapteller ───────────
// Both styled as wide cards, visually sibling to each other.
function SessionActionButtons({ canStart, onManual, aiHref }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px 0 24px' }}>
      {/* Manueel tellen — primary action */}
      <button
        onClick={onManual}
        disabled={!canStart}
        style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '14px 16px', width: '100%',
          backgroundColor: canStart ? '#1e293b' : '#141e2d',
          border: `1px solid ${canStart ? '#3b82f644' : '#1e293b'}`,
          borderRadius: '10px', textDecoration: 'none',
          cursor: canStart ? 'pointer' : 'not-allowed',
          opacity: canStart ? 1 : 0.4,
          transition: 'border-color 0.15s',
          fontFamily: 'inherit',
        }}
      >
        <div style={{
          width: '34px', height: '34px', borderRadius: '9px',
          backgroundColor: '#3b82f622', border: '1px solid #3b82f644',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Hash size={16} color="#60a5fa" />
        </div>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#f1f5f9', marginBottom: '2px' }}>Manueel tellen</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>Teller met live hartslag & badges</div>
        </div>
        <ChevronRight size={15} color="#475569" style={{ flexShrink: 0 }} />
      </button>

      {/* AI Stapteller — secondary action */}
      <a
        href={canStart ? aiHref : undefined}
        onClick={e => { if (!canStart) e.preventDefault(); }}
        style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '14px 16px',
          backgroundColor: canStart ? '#1e293b' : '#141e2d',
          border: `1px solid ${canStart ? '#f59e0b44' : '#1e293b'}`,
          borderRadius: '10px', textDecoration: 'none',
          opacity: canStart ? 1 : 0.4,
          cursor: canStart ? 'pointer' : 'not-allowed',
          transition: 'border-color 0.15s',
        }}
      >
        <div style={{
          width: '34px', height: '34px', borderRadius: '9px',
          backgroundColor: '#f59e0b22', border: '1px solid #f59e0b44',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Sparkles size={16} color="#f59e0b" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#f1f5f9' }}>AI Stapteller</span>
            <span style={{ fontSize: '9px', fontWeight: '800', color: '#f59e0b', backgroundColor: '#f59e0b22', border: '1px solid #f59e0b44', borderRadius: '8px', padding: '1px 6px', letterSpacing: '0.5px' }}>BETA</span>
          </div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>Automatisch tellen via camera of video</div>
        </div>
        <ChevronRight size={15} color="#475569" style={{ flexShrink: 0 }} />
      </a>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function CounterPage() {
  const { disciplines, getDisc, getDuration, getLabel } = useDisciplines();

// Read params passed from /live hub (skipper + discipline pre-selected)
  const _urlParams = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();
  const _paramDisciplineId = _urlParams.get('disciplineId') || '';
  const _paramSessionType  = _urlParams.get('sessionType')  || 'Training';
  const _paramMemberId     = _urlParams.get('memberId')     || '';
  const _paramFirstName    = _urlParams.get('firstName')    || '';
  const _paramLastName     = _urlParams.get('lastName')     || '';
  const _paramRtdbUid      = _urlParams.get('rtdbUid')      || '';
  const _paramClubId       = _urlParams.get('clubId')       || '';
  const _paramGroupId      = _urlParams.get('groupId')      || '';
  const _hasLiveParams     = !!(
    _paramDisciplineId && _paramClubId && _paramGroupId && _paramMemberId
  );

  const {
    bootstrapDone,
    memberClubs, memberGroups,
    skippers, clubMembers,
    selectedClubId, selectedGroupId,
    setSelectedClubId, setSelectedGroupId,
    getMember,
    resolveSkipper,
  } = useSkipperSelection();

  const _urlParams = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();
  const _paramDisciplineId = _urlParams.get('disciplineId') || '';
  const _paramSessionType  = _urlParams.get('sessionType')  || 'Training';
  const _paramMemberId     = _urlParams.get('memberId')     || '';
  const _paramFirstName    = _urlParams.get('firstName')    || '';
  const _paramLastName     = _urlParams.get('lastName')     || '';
  const _paramRtdbUid      = _urlParams.get('rtdbUid')      || '';
  const _paramClubId       = _urlParams.get('clubId')       || '';
  const _paramGroupId      = _urlParams.get('groupId')      || '';
  const _hasLiveParams     = !!(
    _paramDisciplineId && _paramClubId && _paramGroupId && _paramMemberId
  );

  const [counterUser, setCounterUser] = useState(null);

  const [selectedSkipper, setSelectedSkipper] = useState(null);

  const [setupDone,         setSetupDone]         = useState(false);
  const [selectedTeamOrder, setSelectedTeamOrder] = useState([]);
  const [sessionType,       setSessionType]       = useState('Training');
  const [disciplineId,      setDisciplineId]      = useState('');

  const currentDisc = getDisc(disciplineId);
  const sessionMode = !currentDisc ? 'individual'
    : currentDisc.specialRule === 'triple_under' ? 'triple_under'
    : currentDisc.specialRule === 'relay'        ? 'relay'
    : 'individual';

  const [currentData,    setCurrentData]    = useState(null);
  const [liveBpm,        setLiveBpm]        = useState(0);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [bestRecord,     setBestRecord]     = useState(null);

  const [pendingQueue,      setPendingQueue]      = useState([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [newlyEarnedBadges, setNewlyEarnedBadges] = useState([]);

  const [tuAttempts,      setTuAttempts]      = useState([]);
  const [tuCurrentSteps,  setTuCurrentSteps]  = useState(0);
  const [tuMissCountdown, setTuMissCountdown] = useState(null);
  const [tuIsActive,      setTuIsActive]      = useState(false);
  const [tuIsFinished,    setTuIsFinished]    = useState(false);
  const tuMissTimerRef  = useRef(null);
  const tuCountdownRef  = useRef(null);

  const [relayOrder,          setRelayOrder]          = useState([]);
  const [relayResults,        setRelayResults]        = useState([]);
  const [currentSkipperIndex, setCurrentSkipperIndex] = useState(0);
  const [relayIsActive,       setRelayIsActive]       = useState(false);
  const [relayIsFinished,     setRelayIsFinished]     = useState(false);
  const [relaySkipperStart,   setRelaySkipperStart]   = useState(null);
  const relayTimerRef = useRef(null);
  const relayCurrentStepsRef = useRef(0);
  const relayLeadUidRef = useRef(null);

  const telemetryRef     = useRef([]);
  const sessionStartRef  = useRef(null);
  const autoStopTimerRef = useRef(null);
  // Guard against triggerPostSessionFlow being called twice while async work is in flight.
  // isProcessingQueue (state) can't prevent this because React state updates are async.
  const postSessionRunningRef = useRef(false);

  useEffect(() => {
    if (disciplines.length > 0 && !disciplineId) setDisciplineId(disciplines[0].id);
  }, [disciplines]);

  useEffect(() => {
    if (!_hasLiveParams || !bootstrapDone) return;
    setDisciplineId(_paramDisciplineId);
    setSessionType(_paramSessionType);
    setSelectedClubId(_paramClubId);
    setSelectedGroupId(_paramGroupId);
    setSelectedSkipper({
      memberId:  _paramMemberId,
      clubId:    _paramClubId,
      firstName: _paramFirstName,
      lastName:  _paramLastName,
      rtdbUid:   _paramRtdbUid,
    });
    setSetupDone(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrapDone]);
  
  // Auto-skip setup when /live hub has already collected skipper + discipline
  useEffect(() => {
    if (!_hasLiveParams || !bootstrapDone) return;
    setDisciplineId(_paramDisciplineId);
    setSessionType(_paramSessionType);
    setSelectedClubId(_paramClubId);
    setSelectedGroupId(_paramGroupId);
    setSelectedSkipper({
      memberId:  _paramMemberId,
      clubId:    _paramClubId,
      firstName: _paramFirstName,
      lastName:  _paramLastName,
      rtdbUid:   _paramRtdbUid,
    });
    setSetupDone(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrapDone]);

   useEffect(() => {
     const uid = getCookie(); if (!uid) return;
     UserFactory.get(uid).then(s => { if (s.exists()) setCounterUser({ id: uid, ...s.data() }); });
   }, []);

  useEffect(() => {
    if (!bootstrapDone || memberClubs.length === 0) return;
    if (memberClubs.length === 1) setSelectedClubId(memberClubs[0].id);
  }, [bootstrapDone, memberClubs]);

  useEffect(() => {
    if (!selectedSkipper?.rtdbUid || sessionMode !== 'individual') return;
    const unsub = LiveSessionFactory.subscribeToLive(selectedSkipper.rtdbUid, data => {
      if (!data) return;
      setLiveBpm(data.bpm || 0);
      setCurrentData(data.session || null);
    });
    return () => unsub();
  }, [selectedSkipper, sessionMode]);

  useEffect(() => {
    if (!selectedSkipper || sessionMode !== 'individual') return;
    const { clubId, memberId } = selectedSkipper;
    const unsub = ClubMemberFactory.getSessionHistory(clubId, memberId, setSessionHistory);
    return () => unsub();
  }, [selectedSkipper, sessionMode]);

  useEffect(() => {
    if (!selectedSkipper || sessionMode !== 'individual' || !disciplineId) return;
    const { clubId, memberId } = selectedSkipper;
    const unsub = ClubMemberFactory.subscribeToRecords(clubId, memberId, disciplineId, sessionType, setBestRecord);
    return () => unsub();
  }, [selectedSkipper, disciplineId, sessionType, sessionMode]);

  useEffect(() => {
    if (sessionMode !== 'individual') return;
    if (!currentData?.isActive) { clearTimeout(autoStopTimerRef.current); return; }
    clearTimeout(autoStopTimerRef.current);
    autoStopTimerRef.current = setTimeout(() => handleStopSession(), AUTO_STOP_IDLE_MS);
    return () => clearTimeout(autoStopTimerRef.current);
  }, [currentData?.lastStepTime, currentData?.isActive, sessionMode]);

  useEffect(() => {
    if (sessionMode !== 'individual') return;
    if (currentData?.isFinished && !postSessionRunningRef.current) {
      triggerPostSessionFlow();
    }
  }, [currentData?.isFinished]);

  useEffect(() => {
    if (sessionMode !== 'relay' || !relayIsActive || relayIsFinished) return;
    const disc = currentDisc; if (!disc?.durationSeconds) return;
    clearInterval(relayTimerRef.current);
    relayTimerRef.current = setInterval(() => {
      if (!relaySkipperStart) return;
      const elapsed   = (Date.now() - relaySkipperStart) / 1000;
      const remaining = disc.durationSeconds - elapsed;
      if (remaining <= 0) { clearInterval(relayTimerRef.current); advanceRelaySkipper(); }
    }, 200);
    return () => clearInterval(relayTimerRef.current);
  }, [relayIsActive, relayIsFinished, relaySkipperStart, currentSkipperIndex, sessionMode]);

  useEffect(() => {
    if (sessionMode !== 'relay') return;
    if (!relayIsActive && !relayIsFinished) return;
    const rtdbUid = relayLeadUidRef.current; if (!rtdbUid) return;
    const currentItem = relayOrder[currentSkipperIndex];
    const total = relayResults.reduce((s, r) => s + (r.steps || 0), 0);
    import('../firebaseConfig').then(({ rtdb }) => {
      import('firebase/database').then(({ ref, update }) => {
        update(ref(rtdb, `live_sessions/${rtdbUid}/relaySession`), {
          isActive: relayIsActive, isFinished: relayIsFinished, currentSkipperIndex,
          currentSkipperName: currentItem?.name || '', currentSkipperMemberId: currentItem?.memberId || '',
          totalSteps: total, skipperCount: relayOrder.length,
          results: relayResults.map((r, i) => ({ memberId: relayOrder[i]?.memberId || '', name: relayOrder[i]?.name || '', steps: r.steps || 0 })),
          updatedAt: Date.now(),
        }).catch(() => {});
      });
    });
  }, [relayResults, currentSkipperIndex, relayIsActive, relayIsFinished, sessionMode]);

  useEffect(() => {
    if (sessionMode !== 'relay') return;
    return () => {
      const rtdbUid = relayLeadUidRef.current; if (!rtdbUid) return;
      import('../firebaseConfig').then(({ rtdb }) => {
        import('firebase/database').then(({ ref, remove }) => {
          remove(ref(rtdb, `live_sessions/${rtdbUid}/relaySession`)).catch(() => {});
        });
      });
    };
  }, [sessionMode]);

  useEffect(() => {
    if (tuMissCountdown === null) return;
    if (tuMissCountdown <= 0) { clearInterval(tuCountdownRef.current); finishTripleUnder(); return; }
    clearInterval(tuCountdownRef.current);
    tuCountdownRef.current = setInterval(() => {
      setTuMissCountdown(prev => { if (prev === null || prev <= 1) { clearInterval(tuCountdownRef.current); return 0; } return prev - 1; });
    }, 1000);
    return () => clearInterval(tuCountdownRef.current);
  }, [tuMissCountdown]);

  // ─────────────────────────────────────────────────────────────────────────
  // SESSION HANDLERS
  // ─────────────────────────────────────────────────────────────────────────
  const handleStartSession = async () => {
    telemetryRef.current = []; sessionStartRef.current = null;

    if (sessionMode === 'triple_under') {
      setTuAttempts([]); setTuCurrentSteps(0); setTuMissCountdown(null); setTuIsActive(true); setTuIsFinished(false); setSetupDone(true); return;
    }

    if (sessionMode === 'relay') {
      const order = selectedTeamOrder.length > 0 ? selectedTeamOrder : skippers.map(s => {
        const memberId = s.memberId || s.id;
        const profile  = clubMembers.find(m => m.id === memberId);
        return { memberId, name: profile ? `${profile.firstName} ${profile.lastName}` : memberId };
      });
      setRelayOrder(order); setRelayResults(new Array(order.length).fill({ steps: 0 }));
      setCurrentSkipperIndex(0); setRelayIsActive(false); setRelayIsFinished(false); setRelaySkipperStart(null);
      relayCurrentStepsRef.current = 0;
      if (order.length > 0) {
        UserMemberLinkFactory.getUidForMember(selectedClubId, order[0].memberId).then(uid => { relayLeadUidRef.current = uid || null; }).catch(() => { relayLeadUidRef.current = null; });
      }
      setSetupDone(true); return;
    }

    await LiveSessionFactory.startCounter(selectedSkipper.rtdbUid, disciplineId, sessionType);
    setSetupDone(true);
  };

  const handleCountStep = () => {
    if (sessionMode === 'triple_under') { handleTuStep(); return; }
    if (sessionMode === 'relay') { handleRelayStep(); return; }
    if (!currentData || currentData?.isFinished) return;
    if (!sessionStartRef.current) sessionStartRef.current = Date.now();
    LiveSessionFactory.incrementSteps(selectedSkipper.rtdbUid, liveBpm, sessionStartRef.current);
    telemetryRef.current.push({ time: Date.now() - sessionStartRef.current, steps: (currentData?.steps || 0) + 1, heartRate: liveBpm });
  };

  const handleStopSession = useCallback(async () => {
    if (sessionMode === 'triple_under') { handleTuMisser(); return; }
    if (!selectedSkipper || !currentData?.isActive) return;
    clearTimeout(autoStopTimerRef.current);
    await LiveSessionFactory.stopCounter(selectedSkipper.rtdbUid);
  }, [selectedSkipper, currentData, sessionMode]);

  const handleTuStep = () => {
    if (tuIsFinished) return;
    if (tuMissCountdown !== null) {
      setTuAttempts(prev => [...prev, { steps: tuCurrentSteps }]);
      setTuCurrentSteps(1); setTuMissCountdown(null); clearInterval(tuCountdownRef.current); return;
    }
    setTuCurrentSteps(prev => prev + 1); setTuIsActive(true);
  };

  const handleTuMisser = () => {
    if (tuIsFinished || tuMissCountdown !== null) return;
    if (tuCurrentSteps > 0) { setTuAttempts(prev => [...prev, { steps: tuCurrentSteps }]); setTuCurrentSteps(0); }
    setTuMissCountdown(Math.ceil(TRIPLE_UNDER_IDLE / 1000));
  };

  const finishTripleUnder = () => { setTuIsActive(false); setTuIsFinished(true); setTuMissCountdown(null); clearInterval(tuCountdownRef.current); };

  useEffect(() => {
    if (!tuIsFinished || !selectedSkipper) return;
    const saveSession = async () => {
      const { clubId, memberId } = selectedSkipper;
      const allAttempts = tuAttempts.length > 0 ? tuAttempts : [{ steps: tuCurrentSteps }];
      const bestScore = Math.max(...allAttempts.map(a => a.steps), 0);
      try {
        const _tuDisc = getDisc(disciplineId);
        await ClubMemberFactory.saveSessionHistory(clubId, memberId, {
          discipline: disciplineId, disciplineName: _tuDisc?.name || disciplineId, ropeType: _tuDisc?.ropeType || 'SR',
          sessionType, score: bestScore, avgBpm: 0, maxBpm: 0, sessionStart: null, telemetry: [],
          countedBy: counterUser?.id || null, countedByName: counterUser ? `${counterUser.firstName} ${counterUser.lastName}` : null,
        });
      } catch (e) { console.error('Failed to save TU session:', e); }
      const freshHistory = await ClubMemberFactory.getSessionHistoryOnce(clubId, memberId);
      try {
        const _tuDiscBadge = getDisc(disciplineId);
        const newBadges = await BadgeFactory.checkAndAward(clubId, memberId, { score: bestScore, discipline: disciplineId, disciplineName: _tuDiscBadge?.name || disciplineId, ropeType: _tuDiscBadge?.ropeType || 'SR', sessionType }, freshHistory);
        if (newBadges.length > 0) setNewlyEarnedBadges(newBadges);
      } catch (e) { console.error('Badge check failed:', e); }
      const prevBest = bestRecord?.score || 0;
      if (bestScore > prevBest) { setPendingQueue([{ type: 'record', data: { score: bestScore, discipline: disciplineId, sessionType, previousBest: prevBest, telemetry: [] } }]); setIsProcessingQueue(true); }
    };
    saveSession();
  }, [tuIsFinished]);

  const handleRelayStep = () => {
    if (relayIsFinished) return;
    if (!relayIsActive) { setRelayIsActive(true); setRelaySkipperStart(Date.now()); relayCurrentStepsRef.current = 0; }
    relayCurrentStepsRef.current += 1;
    setRelayResults(prev => {
      const next = [...prev];
      next[currentSkipperIndex] = { ...(next[currentSkipperIndex] || {}), memberId: relayOrder[currentSkipperIndex]?.memberId, steps: relayCurrentStepsRef.current };
      return next;
    });
  };

  const advanceRelaySkipper = () => {
    clearInterval(relayTimerRef.current);
    const nextIdx = currentSkipperIndex + 1;
    if (nextIdx >= relayOrder.length) { setRelayIsActive(false); setRelayIsFinished(true); return; }
    setCurrentSkipperIndex(nextIdx); setRelaySkipperStart(Date.now()); relayCurrentStepsRef.current = 0;
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([200, 100, 200]);
  };

  const handleManualAdvance = () => { if (!relayIsActive || relayIsFinished) return; advanceRelaySkipper(); };

  useEffect(() => {
    if (!relayIsFinished || relayOrder.length === 0) return;
    const saveRelaySession = async () => {
      const total = relayResults.reduce((s, r) => s + (r.steps || 0), 0);
      const leadMemberId = relayOrder[0].memberId;
      const clubId = selectedClubId;
      try {
        const _relayDisc = getDisc(disciplineId);
        await ClubMemberFactory.saveSessionHistory(clubId, leadMemberId, {
          discipline: disciplineId, disciplineName: _relayDisc?.name || disciplineId, ropeType: _relayDisc?.ropeType || 'SR',
          sessionType, score: total, avgBpm: 0, maxBpm: 0, sessionStart: null, telemetry: [],
          teamResults: relayResults.map((r, i) => ({ ...r, name: relayOrder[i]?.name || '' })),
          countedBy: counterUser?.id || null, countedByName: counterUser ? `${counterUser.firstName} ${counterUser.lastName}` : null,
        });
      } catch (e) { console.error('Failed to save relay session:', e); }
      const freshHistory = await ClubMemberFactory.getSessionHistoryOnce(clubId, leadMemberId);
      try {
        const _relayDiscBadge = getDisc(disciplineId);
        const newBadges = await BadgeFactory.checkAndAward(clubId, leadMemberId, { score: total, discipline: disciplineId, disciplineName: _relayDiscBadge?.name || disciplineId, ropeType: _relayDiscBadge?.ropeType || 'SR', sessionType }, freshHistory);
        if (newBadges.length > 0) setNewlyEarnedBadges(newBadges);
      } catch (e) { console.error('Badge check failed:', e); }
    };
    saveRelaySession();
  }, [relayIsFinished]);

  const triggerPostSessionFlow = async () => {
    if (!selectedSkipper || !currentData) return;
    if (postSessionRunningRef.current) return;   // ← synchronous double-call guard
    postSessionRunningRef.current = true;

    const { clubId, memberId } = selectedSkipper;
    const score     = currentData.steps || 0;
    const telemetry = telemetryRef.current;
    const bpmValues = telemetry.map(t => t.heartRate).filter(b => b > 0);
    const avgBpm    = bpmValues.length ? Math.round(bpmValues.reduce((a, b) => a + b, 0) / bpmValues.length) : liveBpm;
    const maxBpm    = bpmValues.length ? Math.max(...bpmValues) : liveBpm;
    try {
      const _disc = getDisc(disciplineId);
      await ClubMemberFactory.saveSessionHistory(clubId, memberId, {
        discipline: disciplineId, disciplineName: _disc?.name || disciplineId, ropeType: _disc?.ropeType || 'SR',
        sessionType, score, avgBpm, maxBpm, sessionStart: currentData.startTime || sessionStartRef.current, telemetry,
        countedBy: counterUser?.id || null, countedByName: counterUser ? `${counterUser.firstName} ${counterUser.lastName}` : null,
      });
    } catch (e) { console.error('Failed to save session history:', e); }
    const freshHistory = await ClubMemberFactory.getSessionHistoryOnce(clubId, memberId);
    try {
      const _discForBadge = getDisc(disciplineId);
      const newBadges = await BadgeFactory.checkAndAward(clubId, memberId, { score, discipline: disciplineId, disciplineName: _discForBadge?.name || disciplineId, ropeType: _discForBadge?.ropeType || 'SR', sessionType }, freshHistory);
      if (newBadges.length > 0) setNewlyEarnedBadges(newBadges);
    } catch (e) { console.error('Badge check failed:', e); }
    if (counterUser) {
      try { await CounterBadgeFactory.checkAndAward(counterUser.id, { discipline: disciplineId, sessionType, score }); }
      catch (e) { console.error('Counter badge check failed:', e); }
    }
    const previousBest = bestRecord?.score || 0;
    if (score > previousBest) {
      setPendingQueue([{ type: 'record', data: { score, discipline: disciplineId, sessionType, previousBest, telemetry } }]);
      setIsProcessingQueue(true);
    }
    postSessionRunningRef.current = false;  // ← release the guard
  };

  const handleQueueAccept = async () => {
    const current = pendingQueue[0]; if (!current) return;
    if (current.type === 'record') {
      const { clubId, memberId } = selectedSkipper;
      try { await ClubMemberFactory.addRecord(clubId, memberId, current.data); }
      catch (e) { console.error('Failed to save record:', e); }
    }
    advanceQueue();
  };

  const advanceQueue = () => {
    setPendingQueue(prev => { const next = prev.slice(1); if (next.length === 0) setIsProcessingQueue(false); return next; });
  };

  const handleReset = async () => {
    clearTimeout(autoStopTimerRef.current); clearInterval(relayTimerRef.current); clearInterval(tuCountdownRef.current);
    telemetryRef.current = [];
    postSessionRunningRef.current = false;
    if (selectedSkipper?.rtdbUid) await LiveSessionFactory.resetSession(selectedSkipper.rtdbUid);
    setSelectedSkipper(null); setSetupDone(false); setSelectedTeamOrder([]); setIsProcessingQueue(false); setPendingQueue([]); setNewlyEarnedBadges([]);
    setTuAttempts([]); setTuCurrentSteps(0); setTuMissCountdown(null); setTuIsActive(false); setTuIsFinished(false);
    setRelayOrder([]); setRelayResults([]); setCurrentSkipperIndex(0); setRelayIsActive(false); setRelayIsFinished(false); setRelaySkipperStart(null);
    relayLeadUidRef.current = null;
  };

  const handleNewSession = async () => {
    clearTimeout(autoStopTimerRef.current); clearInterval(relayTimerRef.current); clearInterval(tuCountdownRef.current);
    telemetryRef.current = [];
    postSessionRunningRef.current = false;
    if (selectedSkipper?.rtdbUid) await LiveSessionFactory.resetSession(selectedSkipper.rtdbUid);
    setIsProcessingQueue(false); setPendingQueue([]); setNewlyEarnedBadges([]); setSetupDone(false); setSelectedTeamOrder([]);
    setTuAttempts([]); setTuCurrentSteps(0); setTuMissCountdown(null); setTuIsActive(false); setTuIsFinished(false);
    setRelayOrder([]); setRelayResults([]); setCurrentSkipperIndex(0); setRelayIsActive(false); setRelayIsFinished(false); setRelaySkipperStart(null);
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const isRecording  = sessionMode === 'individual' && currentData?.isActive === true;
  const isFinished   = sessionMode === 'individual' && currentData?.isFinished === true && !currentData?.isActive;
  const isStartklaar = sessionMode === 'individual' && currentData !== null && !isRecording && !isFinished;
  const showClubPicker  = memberClubs.length > 1;
  const showGroupPicker = memberGroups.length > 1;
  const relayDurationSec = currentDisc?.durationSeconds || 30;

  // ── Build the AI counter URL with all selection params ───────────────────
  const buildAiUrl = () => {
    if (!disciplineId) return '/ai-counter';
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
    return `/ai-counter?${params.toString()}`;
  };

  // ── Determine whether enough is selected to start ─────────────────────────
  const requiredSkippers = currentDisc?.skippersCount ?? 1;
  const isRelayDisc  = sessionMode === 'relay';
  const isTuDisc     = sessionMode === 'triple_under';
  const groupReady   = !!(selectedClubId && selectedGroupId);
  const disciplineReady = !!disciplineId;
  const canStart = disciplineReady && groupReady && (
    isRelayDisc ? selectedTeamOrder.length === requiredSkippers :
    isTuDisc    ? !!selectedSkipper :
    !!selectedSkipper
  );

  if (!bootstrapDone) return (
    <div style={{ ...st.container, alignItems: 'center', justifyContent: 'center' }}><div style={st.spinner} /></div>
  );

  if (bootstrapDone && memberClubs.length === 0) return (
    <div style={{ ...st.container, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
      <Users size={40} color="#334155" />
      <p style={{ color: '#64748b', fontSize: '14px', textAlign: 'center', maxWidth: '280px' }}>Je bent nog geen lid van een club. Vraag toegang aan via je profiel.</p>
      <a href="/" style={{ padding: '10px 20px', backgroundColor: '#3b82f6', color: 'white', borderRadius: '8px', textDecoration: 'none', fontWeight: '600', fontSize: '14px' }}>Naar profiel</a>
    </div>
  );

  // ── Setup screen ──────────────────────────────────────────────────────────
  if (!setupDone) {
    return (
      <div style={st.container}>
        <div style={st.header}>
         <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
           <a href="/live" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#64748b', textDecoration: 'none', fontSize: '13px', fontWeight: '600' }}>
             <ArrowLeft size={15} /> Live
           </a>
           <h1 style={{ fontSize: '18px', fontWeight: '800', color: '#f1f5f9', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
             <Hash size={20} color="#3b82f6" /> Nieuwe sessie
           </h1>
         </div>
        </div>

        <div style={{ width: '100%', maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '0' }}>

          {/* Club picker */}
          {showClubPicker && (
            <div style={st.setupSection}>
              <div style={st.setupStepLabel}>Club</div>
              <div style={st.clubGrid}>
                {memberClubs.map(club => (
                  <button key={club.id} style={{ ...st.clubCard, ...(selectedClubId === club.id ? st.clubCardActive : {}) }} onClick={() => setSelectedClubId(club.id)}>
                    {club.logoUrl ? <img src={club.logoUrl} style={{ width: '32px', height: '32px', borderRadius: '6px', objectFit: 'cover', marginBottom: '6px' }} alt={club.name} /> : <Building2 size={24} color={selectedClubId === club.id ? '#3b82f6' : '#475569'} style={{ marginBottom: '6px' }} />}
                    <div style={{ fontSize: '12px', fontWeight: '600', textAlign: 'center' }}>{club.name}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Group picker */}
          {selectedClubId && showGroupPicker && (
            <div style={st.setupSection}>
              <div style={st.setupStepLabel}>Groep</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {memberGroups.map(group => (
                  <button key={group.id} style={{ ...st.groupPill, ...(selectedGroupId === group.id ? st.groupPillActive : {}) }} onClick={() => setSelectedGroupId(group.id)}>
                    {group.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Discipline dropdown */}
          {(!showClubPicker || selectedClubId) && (!showGroupPicker || selectedGroupId) && (
            <div style={st.setupSection}>
              <div style={st.setupStepLabel}>Onderdeel</div>
              <DisciplineDropdown
                value={disciplineId}
                onChange={(id) => { setDisciplineId(id); setSelectedSkipper(null); setSelectedTeamOrder([]); }}
                disciplines={disciplines}
                disabled={false}
              />
            </div>
          )}

          {/* Session type */}
          {disciplineReady && (
            <div style={st.setupSection}>
              <div style={st.setupStepLabel}>Type sessie</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['Training', 'Wedstrijd'].map(t => (
                  <button key={t} onClick={() => setSessionType(t)} style={{
                    flex: 1, padding: '11px', borderRadius: '10px',
                    border: `1.5px solid ${sessionType === t ? (t === 'Wedstrijd' ? '#ef4444' : '#3b82f6') : '#334155'}`,
                    backgroundColor: sessionType === t ? (t === 'Wedstrijd' ? '#ef444422' : '#3b82f622') : 'transparent',
                    color: sessionType === t ? (t === 'Wedstrijd' ? '#ef4444' : '#60a5fa') : '#64748b',
                    fontWeight: sessionType === t ? '700' : '500', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    {t === 'Training' ? '🏋️ Training' : '🏆 Wedstrijd'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Relay team builder */}
          {disciplineReady && isRelayDisc && groupReady && (
            <div style={st.setupSection}>
              <div style={st.setupStepLabel}>
                Team samenstellen
                <span style={{ marginLeft: '8px', fontSize: '10px', fontWeight: '600', color: selectedTeamOrder.length === requiredSkippers ? '#22c55e' : '#f59e0b' }}>
                  {selectedTeamOrder.length} / {requiredSkippers}
                </span>
              </div>
              <RelayTeamBuilder skippers={skippers} clubMembers={clubMembers} value={selectedTeamOrder} onChange={setSelectedTeamOrder} required={requiredSkippers} />
            </div>
          )}

          {/* Individual skipper picker */}
          {disciplineReady && !isRelayDisc && groupReady && (
            <div style={st.setupSection}>
              <div style={st.setupStepLabel}>Skipper</div>
              {skippers.length > 0 ? (
                <div style={st.grid}>
                  {skippers.map(s => {
                    const memberId  = s.memberId || s.id;
                    const profile   = clubMembers.find(m => m.id === memberId);
                    const firstName = profile?.firstName || '?';
                    const lastName  = profile?.lastName  || '';
                    const initials  = `${firstName[0] || '?'}${lastName[0] || ''}`.toUpperCase();
                    const isChosen  = selectedSkipper?.memberId === memberId;
                    return (
                      <button key={memberId}
                        style={{ ...st.card, borderColor: isChosen ? '#3b82f6' : '#334155', backgroundColor: isChosen ? '#1e3a5f' : '#1e293b' }}
                        onClick={async () => { const resolved = await resolveSkipper(s); setSelectedSkipper(resolved); }}
                      >
                        <div style={{ ...st.avatar, backgroundColor: isChosen ? '#3b82f6' : '#334155', width: '44px', height: '44px', fontSize: '15px' }}>{initials}</div>
                        <div style={{ marginTop: '8px', fontSize: '13px', fontWeight: isChosen ? '700' : '500', color: isChosen ? '#f1f5f9' : '#94a3b8', textAlign: 'center' }}>{firstName} {lastName}</div>
                        {isChosen && <div style={{ marginTop: '4px', fontSize: '10px', color: '#3b82f6', fontWeight: '700' }}>✓ Geselecteerd</div>}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p style={st.infoText}>Geen actieve skippers in deze groep.</p>
              )}
            </div>
          )}

          {/* Best record hint */}
          {selectedSkipper && sessionMode === 'individual' && bestRecord && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', backgroundColor: '#1e293b', borderRadius: '10px', border: '1px solid #facc1533', marginTop: '4px', marginBottom: '4px' }}>
              <Trophy size={14} color="#facc15" />
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                Huidig record: <strong style={{ color: '#facc15' }}>{bestRecord.score} stappen</strong>
              </span>
            </div>
          )}

          {/* Manueel tellen + AI Stapteller action buttons */}
          <SessionActionButtons
            canStart={canStart}
            onManual={handleStartSession}
            aiHref={buildAiUrl()}
          />

        </div>
      </div>
    );
  }

  // ── Screen: RELAY counter ─────────────────────────────────────────────────
  if (sessionMode === 'relay') {
    const currentItem    = relayOrder[currentSkipperIndex];
    const currentProfile = currentItem ? clubMembers.find(m => m.id === currentItem.memberId) : null;
    const currentName    = currentProfile ? `${currentProfile.firstName} ${currentProfile.lastName}` : currentItem?.name || '?';
    const currentInitials = currentProfile ? `${currentProfile.firstName?.[0] || '?'}${currentProfile.lastName?.[0] || ''}`.toUpperCase() : '??';
    const totalSteps     = relayResults.reduce((s, r) => s + (r.steps || 0), 0);
    const discName       = currentDisc?.name || disciplineId;

    if (relayIsFinished) {
      return (
        <div style={st.container}>
          {isProcessingQueue && pendingQueue.length > 0 && <CelebrationOverlay type={pendingQueue[0].type} data={pendingQueue[0].data} onAccept={handleQueueAccept} onDecline={advanceQueue} />}
          <RelayResultsSummary relayOrder={relayOrder} relayResults={relayResults} discName={discName} sessionType={sessionType} onNewSession={handleNewSession} onReset={handleReset} />
        </div>
      );
    }

    return (
      <div style={st.container}>
        {isProcessingQueue && pendingQueue.length > 0 && <CelebrationOverlay type={pendingQueue[0].type} data={pendingQueue[0].data} onAccept={handleQueueAccept} onDecline={advanceQueue} />}
        <div style={st.activeHeader}>
          <button style={st.backBtn} onClick={handleReset}><ArrowLeft size={18} /> Stoppen</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ ...st.avatar, width: '44px', height: '44px', fontSize: '15px' }}>{currentInitials}</div>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '18px' }}>{currentName}</div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>{discName} · Skipper {currentSkipperIndex + 1} van {relayOrder.length}</div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#60a5fa', fontFamily: 'monospace' }}>
                {relayIsActive ? `${Math.max(0, Math.ceil(relayDurationSec - (Date.now() - relaySkipperStart) / 1000))}s` : `${relayDurationSec}s`}
              </div>
              <div style={{ fontSize: '9px', color: '#475569', fontWeight: '700', textTransform: 'uppercase' }}>{relayIsActive ? 'RESTERENDE TIJD' : 'WACHT OP TELLER'}</div>
            </div>
          </div>
        </div>
        <RelayScoreboard relayOrder={relayOrder} relayResults={relayResults} currentSkipperIndex={currentSkipperIndex} discName={discName} />
        <button style={{ ...st.counterButton, backgroundColor: '#1e293b', border: `3px solid ${relayIsActive ? '#3b82f6' : '#334155'}`, boxShadow: relayIsActive ? '0 0 60px rgba(59,130,246,0.25)' : 'none' }}
          onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.96)'; handleCountStep(); }}
          onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
          onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}>
          <span style={st.stepLabel}>STAPPEN</span>
          <span style={{ fontSize: '100px', lineHeight: 1, fontWeight: '900' }}>{relayResults[currentSkipperIndex]?.steps ?? 0}</span>
          {!relayIsActive && <span style={{ fontSize: '14px', color: '#64748b', marginTop: '8px' }}>Tik om te starten</span>}
        </button>
        <div style={st.controls}>
          {relayIsActive && <button onClick={handleManualAdvance} style={{ ...st.stopButton, backgroundColor: '#f59e0b', marginBottom: '10px' }}><SkipForward size={18} /> VOLGENDE SKIPPER</button>}
          <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>Teamtotaal: <strong style={{ color: '#60a5fa' }}>{totalSteps}</strong> stappen</div>
        </div>
      </div>
    );
  }

  // ── Screen: TRIPLE UNDER counter ──────────────────────────────────────────
  if (sessionMode === 'triple_under') {
    const discName  = currentDisc?.name || disciplineId;
    const bestSoFar = Math.max(...tuAttempts.map(a => a.steps), tuCurrentSteps, 0);

    if (tuIsFinished) {
      return (
        <div style={st.container}>
          {isProcessingQueue && pendingQueue.length > 0 && <CelebrationOverlay type={pendingQueue[0].type} data={pendingQueue[0].data} onAccept={handleQueueAccept} onDecline={advanceQueue} />}
          <div style={{ width: '100%', maxWidth: '440px', backgroundColor: '#1e293b', borderRadius: '14px', border: '1px solid #22c55e44', padding: '20px', animation: 'fadeInUp 0.4s ease-out' }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '36px', marginBottom: '6px' }}>⚡</div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sessie voltooid!</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{discName}</div>
            </div>
            <div style={{ backgroundColor: '#0f172a', borderRadius: '10px', padding: '14px', marginBottom: '14px', textAlign: 'center', border: '1px solid #facc1533' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Beste poging</div>
              <div style={{ fontSize: '44px', fontWeight: '900', color: '#facc15', lineHeight: 1 }}>{bestSoFar}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>stappen · {tuAttempts.length} pogi{tuAttempts.length === 1 ? 'ng' : 'ngen'}</div>
            </div>
            {tuAttempts.length > 1 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
                {tuAttempts.map((a, i) => (
                  <div key={i} style={{ padding: '4px 10px', borderRadius: '6px', backgroundColor: a.steps === bestSoFar ? '#facc1522' : '#0f172a', border: `1px solid ${a.steps === bestSoFar ? '#facc1544' : '#334155'}`, fontSize: '13px', fontWeight: '700', color: a.steps === bestSoFar ? '#facc15' : '#64748b' }}>
                    #{i + 1}: {a.steps}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleNewSession} style={{ flex: 1, padding: '13px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '10px', color: 'white', fontWeight: '700', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Play size={16} fill="white" /> Nieuwe sessie
              </button>
              <button onClick={handleReset} style={{ padding: '13px 16px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '10px', color: '#94a3b8', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>Andere skipper</button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div style={st.container}>
        {isProcessingQueue && pendingQueue.length > 0 && <CelebrationOverlay type={pendingQueue[0].type} data={pendingQueue[0].data} onAccept={handleQueueAccept} onDecline={advanceQueue} />}
        <div style={st.activeHeader}>
          <button style={st.backBtn} onClick={handleReset}><ArrowLeft size={18} /> Andere skipper</button>
          <div style={st.userInfo}>
            <div style={{ ...st.avatar, width: '44px', height: '44px', fontSize: '15px' }}>{selectedSkipper.firstName[0]}{selectedSkipper.lastName[0]}</div>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '18px' }}>{selectedSkipper.firstName} {selectedSkipper.lastName}</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>{discName} · {sessionType}</div>
            </div>
            {bestSoFar > 0 && <div style={{ marginLeft: 'auto', textAlign: 'right' }}><div style={{ fontSize: '18px', fontWeight: '900', color: '#facc15' }}>{bestSoFar}</div><div style={{ fontSize: '9px', color: '#475569' }}>BESTE</div></div>}
          </div>
        </div>
        <TripleUnderDisplay attempts={tuAttempts} currentAttempt={tuCurrentSteps} missCountdown={tuMissCountdown} onMisser={handleTuMisser} />
        <button style={{ ...st.counterButton, backgroundColor: tuMissCountdown !== null ? '#1a0a0a' : '#1e293b', border: `3px solid ${tuMissCountdown !== null ? '#ef444466' : tuIsActive ? '#3b82f6' : '#334155'}`, boxShadow: tuIsActive && tuMissCountdown === null ? '0 0 60px rgba(59,130,246,0.25)' : 'none' }}
          onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.96)'; handleCountStep(); }}
          onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
          onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}>
          <span style={st.stepLabel}>{tuMissCountdown !== null ? 'POGING KLAAR' : 'STAPPEN'}</span>
          <span style={{ fontSize: '100px', lineHeight: 1, fontWeight: '900' }}>{tuCurrentSteps}</span>
          {!tuIsActive && <span style={{ fontSize: '14px', color: '#64748b', marginTop: '8px' }}>Tik om te starten</span>}
          {tuMissCountdown !== null && <span style={{ fontSize: '14px', color: '#ef4444', marginTop: '8px' }}>Tik om nieuwe poging te starten</span>}
        </button>
        <div style={st.controls}>
          <button onClick={handleReset} style={{ ...st.stopButton, backgroundColor: '#475569' }}><Square size={18} fill="white" /> STOPPEN</button>
        </div>
      </div>
    );
  }

  // ── Screen: INDIVIDUAL counter ─────────────────────────────────────────────
  return (
    <div style={st.container}>
      {isProcessingQueue && pendingQueue.length > 0 && <CelebrationOverlay type={pendingQueue[0].type} data={pendingQueue[0].data} onAccept={handleQueueAccept} onDecline={advanceQueue} />}
      <div style={st.activeHeader}>
        <button style={st.backBtn} onClick={handleReset}><ArrowLeft size={18} /> Andere skipper</button>
        <div style={st.userInfo}>
          <div style={{ ...st.avatar, width: '44px', height: '44px', fontSize: '15px' }}>{selectedSkipper.firstName[0]}{selectedSkipper.lastName[0]}</div>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '18px' }}>{selectedSkipper.firstName} {selectedSkipper.lastName}</div>
            <div style={{ fontSize: '12px', display: 'flex', gap: '8px', marginTop: '2px' }}>
              <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold', backgroundColor: sessionType === 'Wedstrijd' ? '#ef4444' : '#3b82f6' }}>{sessionType}</span>
              <span style={{ color: '#94a3b8' }}>{currentDisc?.name || disciplineId}</span>
            </div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: '22px', fontWeight: '900', color: '#ef4444' }}>{liveBpm > 0 ? liveBpm : '--'}</div>
            <div style={{ fontSize: '10px', color: '#94a3b8' }}>BPM</div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
          <LiveTimer startTime={currentData?.startTime} durationSeconds={currentDisc?.durationSeconds || null} isRecording={isRecording} isFinished={isFinished} />
          <div style={{ fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {isRecording ? <><span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444', animation: 'pulse 1s ease-in-out infinite', display: 'inline-block' }} /><span style={{ color: '#ef4444' }}>OPNAME</span></> : isFinished ? <span style={{ color: '#22c55e' }}>KLAAR</span> : isStartklaar ? <span style={{ color: '#facc15' }}>STARTKLAAR</span> : <span style={{ color: '#64748b' }}>WACHT</span>}
          </div>
        </div>
      </div>

      {newlyEarnedBadges.length > 0 && (
        <div style={{ width: '100%', maxWidth: '440px', backgroundColor: '#1a1a2e', border: '1px solid #f59e0b44', borderRadius: '12px', padding: '12px 16px', marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#f59e0b', marginBottom: '8px' }}>🎖️ Nieuwe badges verdiend door {selectedSkipper?.firstName}!</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {newlyEarnedBadges.map(b => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#0f172a', borderRadius: '8px', padding: '6px 10px', border: '1px solid #334155' }}>
                {b.imageUrl ? <img src={b.imageUrl} style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }} alt={b.name} /> : <span style={{ fontSize: '20px' }}>{b.emoji}</span>}
                <span style={{ fontSize: '12px', color: '#f1f5f9', fontWeight: '600' }}>{b.name}</span>
              </div>
            ))}
          </div>
          <button onClick={() => setNewlyEarnedBadges([])} style={{ marginTop: '10px', background: 'none', border: 'none', color: '#64748b', fontSize: '11px', cursor: 'pointer', padding: 0 }}>Sluiten</button>
        </div>
      )}

      {bestRecord && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '8px 16px', backgroundColor: '#1e293b', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', color: '#facc15' }}>
          <Trophy size={14} /> Record: <strong>{bestRecord.score} stappen</strong>
        </div>
      )}

      <button style={{ ...st.counterButton, backgroundColor: isFinished ? '#1e293b' : isRecording ? '#1e3a5f' : '#1e293b', border: isRecording ? '3px solid #3b82f6' : isFinished ? '3px solid #22c55e' : '3px solid #334155', boxShadow: isRecording ? '0 0 60px rgba(59,130,246,0.25)' : 'none', cursor: isFinished ? 'default' : 'pointer' }}
        disabled={isFinished || !selectedSkipper}
        onPointerDown={e => { if (!isFinished) { e.currentTarget.style.transform = 'scale(0.96)'; handleCountStep(); } }}
        onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}>
        <span style={st.stepLabel}>STEPS</span>
        <span style={{ fontSize: '100px', lineHeight: 1, fontWeight: '900' }}>{currentData?.steps ?? 0}</span>
        {!isRecording && !isFinished && <span style={{ fontSize: '14px', color: '#64748b', marginTop: '8px' }}>Tik om te starten</span>}
      </button>

      <div style={st.controls}>
        {isRecording ? (
          <button style={st.stopButton} onClick={handleStopSession}><Square size={18} fill="white" /> STOP</button>
        ) : isFinished ? (
          <button style={{ ...st.stopButton, backgroundColor: '#3b82f6' }} onClick={handleNewSession}><Play size={18} fill="white" /> NIEUWE SESSIE</button>
        ) : isStartklaar ? (
          <>
            <div style={{ color: '#facc15', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}><Zap size={16} /> Eerste tik start de opname</div>
            <button style={{ ...st.stopButton, backgroundColor: '#3b82f6' }} onClick={handleNewSession}><Play size={18} fill="white" /> NIEUWE SESSIE</button>
          </>
        ) : (
          <div style={{ color: '#64748b', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}><Zap size={16} /> Selecteer een skipper</div>
        )}
      </div>

      <div style={st.historySection}>
        <h3 style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}><HistoryIcon size={16} /> Recente sessies</h3>
        {sessionHistory.slice(0, 5).map((item, idx) => {
          const discLabel = item.disciplineName || getLabel(item.discipline);
          return (
            <div key={idx} style={st.historyItem}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', backgroundColor: item.sessionType === 'Wedstrijd' ? '#ef444422' : '#3b82f622', color: item.sessionType === 'Wedstrijd' ? '#ef4444' : '#60a5fa', border: `1px solid ${item.sessionType === 'Wedstrijd' ? '#ef444440' : '#3b82f640'}` }}>{item.sessionType || 'Training'}</span>
                <span style={{ color: '#94a3b8', fontSize: '12px' }}>{discLabel}</span>
              </div>
              <span style={{ fontWeight: 'bold', color: '#60a5fa', fontSize: '16px' }}>{item.score} <span style={{ fontSize: '11px', color: '#64748b' }}>stappen</span></span>
            </div>
          );
        })}
        {sessionHistory.length === 0 && <p style={{ color: '#475569', fontSize: '13px', textAlign: 'center' }}>Nog geen sessies.</p>}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = {
  container:      { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'sans-serif', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  header:         { width: '100%', maxWidth: '500px', padding: '14px 0 16px', borderBottom: '1px solid #1e293b', marginBottom: '20px' },
  spinner:        { width: '36px', height: '36px', border: '3px solid #1e293b', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  setupSection:   { borderBottom: '1px solid #1e293b', paddingBottom: '18px', marginBottom: '18px', width: '100%' },
  setupStepLabel: { fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' },
  groupPill:      { padding: '8px 16px', borderRadius: '20px', border: '1px solid #334155', backgroundColor: 'transparent', color: '#64748b', fontWeight: '500', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' },
  groupPillActive:{ border: '1px solid #22c55e', backgroundColor: '#22c55e22', color: '#22c55e', fontWeight: '700' },
  clubGrid:       { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' },
  clubCard:       { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '16px 12px', color: 'white', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'border-color 0.15s' },
  clubCardActive: { borderColor: '#3b82f6', backgroundColor: '#1e3a5f' },
  grid:           { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' },
  card:           { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '16px', color: 'white', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'border-color 0.2s' },
  avatar:         { width: '50px', height: '50px', backgroundColor: '#3b82f6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '16px' },
  infoText:       { textAlign: 'center', color: '#64748b', fontSize: '14px', marginTop: '20px' },
  modalOverlay:   { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.92)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', zIndex: 100 },
  modalContent:   { backgroundColor: '#1e293b', padding: '30px', borderRadius: '20px', width: '100%', maxWidth: '440px', border: '1px solid #334155' },
  mainStartBtn:   { width: '100%', padding: '15px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '10px', color: 'white', fontWeight: 'bold', marginTop: '10px', display: 'flex', justifyContent: 'center', gap: '10px', alignItems: 'center', cursor: 'pointer', fontSize: '16px', fontFamily: 'sans-serif' },
  activeHeader:   { backgroundColor: '#1e293b', padding: '16px', borderRadius: '14px', marginBottom: '16px', width: '100%', maxWidth: '440px', border: '1px solid #334155', transition: 'border-color 0.3s' },
  backBtn:        { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', marginBottom: '12px', padding: 0 },
  userInfo:       { display: 'flex', alignItems: 'center', gap: '14px' },
  counterButton:  { width: '280px', height: '280px', borderRadius: '50%', color: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', touchAction: 'manipulation', userSelect: 'none', transition: 'transform 0.08s, box-shadow 0.2s', margin: '10px 0' },
  stepLabel:      { fontSize: '13px', letterSpacing: '4px', color: 'rgba(255,255,255,0.35)', fontWeight: '700' },
  controls:       { display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', marginTop: '16px', marginBottom: '24px' },
  stopButton:     { backgroundColor: '#ef4444', color: 'white', padding: '14px 32px', borderRadius: '12px', border: 'none', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '15px' },
  historySection: { width: '100%', maxWidth: '440px', borderTop: '1px solid #1e293b', paddingTop: '16px' },
  historyItem:    { backgroundColor: '#1e293b', padding: '12px 16px', borderRadius: '10px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '3px solid #3b82f6' },
};
