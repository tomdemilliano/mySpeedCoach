/**
 * components/calendar/TrainingPrepViewer.js
 *
 * Readonly weergave van een TrainingPrep.
 * Toont blokken gegroepeerd per fase (warmup / main / cooldown).
 *
 * Props:
 *   prep     : TrainingPrep object
 *   compact  : boolean — compacte weergave voor in EventDetailSheet
 */

import { Clock, Zap, TrendingUp, Wind, Dumbbell } from 'lucide-react';

const PHASE_CONFIG = {
  warmup:   { label: 'Opwarming',     color: '#f59e0b', icon: Wind,       bg: '#f59e0b11' },
  main:     { label: 'Hoofdblok',     color: '#3b82f6', icon: Zap,        bg: '#3b82f611' },
  cooldown: { label: 'Cooling-down',  color: '#22c55e', icon: TrendingUp, bg: '#22c55e11' },
};

const INTENSITY_CONFIG = {
  low:    { label: 'Laag',    color: '#22c55e', dot: '🟢' },
  medium: { label: 'Midden',  color: '#f59e0b', dot: '🟡' },
  high:   { label: 'Hoog',    color: '#ef4444', dot: '🔴' },
};

const AGE_LABELS   = { u12: 'U12', u16: 'U16', senior: 'Senior', mixed: 'Gemengd' };
const LEVEL_LABELS = { beginner: 'Beginner', intermediate: 'Gevorderd', advanced: 'Wedstrijd' };
const FOCUS_LABELS = { speed: 'Snelheid', endurance: 'Uithoudingsvermogen', freestyle: 'Freestyle', technique: 'Techniek' };

function BlockCard({ block, compact }) {
  const intensity = INTENSITY_CONFIG[block.intensity] || INTENSITY_CONFIG.medium;
  const phase     = PHASE_CONFIG[block.phase]         || PHASE_CONFIG.main;

  if (compact) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '8px 10px', borderRadius: '8px',
        backgroundColor: phase.bg, border: `1px solid ${phase.color}22`,
      }}>
        <div style={{ flexShrink: 0, fontSize: '12px', fontWeight: '800', color: phase.color, minWidth: '32px', textAlign: 'center' }}>
          {block.durationMin}′
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {block.title}
          </div>
          {block.discipline && (
            <div style={{ fontSize: '10px', color: '#64748b' }}>{block.discipline}</div>
          )}
        </div>
        <span style={{ fontSize: '11px' }}>{intensity.dot}</span>
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: '#1e293b', borderRadius: '10px',
      border: `1px solid ${phase.color}22`,
      borderLeft: `3px solid ${phase.color}`,
      padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: '800', color: '#f1f5f9' }}>{block.title}</span>
          {block.discipline && (
            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '5px', backgroundColor: '#334155', color: '#94a3b8', fontWeight: '600' }}>
              {block.discipline}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Clock size={10} /> {block.durationMin} min
          </span>
          <span style={{ fontSize: '10px', fontWeight: '700', padding: '1px 6px', borderRadius: '5px', backgroundColor: intensity.color + '22', color: intensity.color, border: `1px solid ${intensity.color}44` }}>
            {intensity.dot} {intensity.label}
          </span>
        </div>
      </div>
      {block.description && (
        <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {block.description}
        </p>
      )}
    </div>
  );
}

export default function TrainingPrepViewer({ prep, compact = false }) {
  if (!prep) return null;

  const phases = ['warmup', 'main', 'cooldown'];
  const blocksByPhase = phases.reduce((acc, phase) => {
    acc[phase] = (prep.blocks || []).filter(b => b.phase === phase);
    return acc;
  }, {});

  const totalMin = (prep.blocks || []).reduce((sum, b) => sum + (b.durationMin || 0), 0);

  if (compact) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {(prep.blocks || []).map(block => (
          <BlockCard key={block.id} block={block} compact />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Meta */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {prep.ageGroup && (
          <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '6px', backgroundColor: '#334155', color: '#94a3b8' }}>
            {AGE_LABELS[prep.ageGroup] || prep.ageGroup}
          </span>
        )}
        {prep.level && (
          <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '6px', backgroundColor: '#334155', color: '#94a3b8' }}>
            {LEVEL_LABELS[prep.level] || prep.level}
          </span>
        )}
        {(prep.focus || []).map(f => (
          <span key={f} style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '6px', backgroundColor: '#3b82f622', color: '#60a5fa', border: '1px solid #3b82f633' }}>
            {FOCUS_LABELS[f] || f}
          </span>
        ))}
        <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '6px', backgroundColor: '#334155', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '3px' }}>
          <Clock size={9} /> {totalMin} min
        </span>
        {prep.generatedByAI && (
          <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '6px', backgroundColor: '#a78bfa22', color: '#a78bfa', border: '1px solid #a78bfa33' }}>
            ✨ AI
          </span>
        )}
      </div>

      {/* AI summary */}
      {prep.aiPromptSummary && (
        <div style={{ backgroundColor: '#a78bfa11', border: '1px solid #a78bfa22', borderRadius: '8px', padding: '8px 12px', marginBottom: '16px', fontSize: '12px', color: '#a78bfa', fontStyle: 'italic' }}>
          {prep.aiPromptSummary}
        </div>
      )}

      {/* Phases */}
      {phases.map(phase => {
        const blocks = blocksByPhase[phase];
        if (!blocks.length) return null;
        const cfg = PHASE_CONFIG[phase];
        const PhaseIcon = cfg.icon;
        const phaseMin = blocks.reduce((s, b) => s + (b.durationMin || 0), 0);

        return (
          <div key={phase} style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <PhaseIcon size={13} color={cfg.color} />
              <span style={{ fontSize: '12px', fontWeight: '800', color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {cfg.label}
              </span>
              <span style={{ fontSize: '11px', color: '#475569' }}>· {phaseMin} min</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {blocks.map(block => (
                <BlockCard key={block.id} block={block} compact={false} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
