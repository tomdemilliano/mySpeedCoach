/**
 * components/calendar/TrainingPrepEditor.js
 *
 * Volledige editor voor trainingsvoorbereiding.
 * Twee modi:
 *   - Manueel: blokken toevoegen/bewerken/verwijderen/sorteren
 *   - AI-gegenereerd: invulformulier → API-call → resultaat bewerken
 *
 * Props:
 *   prep        : TrainingPrep | null  — null = nieuw
 *   clubId      : string
 *   coachMemberId: string              — memberId van de coach (voor createdBy)
 *   coachUid    : string               — Firebase Auth uid
 *   eventId     : string | null        — als geladen vanuit een event, koppel direct
 *   disciplines : string[]             — beschikbare disciplines van de club
 *   onSaved     : (prep) => void
 *   onClose     : () => void
 */

import { useState, useCallback } from 'react';
import {
  X, Save, Zap, Plus, Trash2, ChevronUp, ChevronDown,
  Edit2, Check, AlertCircle, Clock, Wind, TrendingUp,
  Sparkles, RotateCcw,
} from 'lucide-react';
import { TrainingPrepFactory } from '../../constants/dbSchema';

// ─── Constants ────────────────────────────────────────────────────────────────
const PHASE_OPTIONS = [
  { value: 'warmup',   label: 'Opwarming',    color: '#f59e0b' },
  { value: 'main',     label: 'Hoofdblok',    color: '#3b82f6' },
  { value: 'cooldown', label: 'Cooling-down', color: '#22c55e' },
];

const INTENSITY_OPTIONS = [
  { value: 'low',    label: 'Laag',   dot: '🟢' },
  { value: 'medium', label: 'Midden', dot: '🟡' },
  { value: 'high',   label: 'Hoog',   dot: '🔴' },
];

const AGE_OPTIONS = [
  { value: 'u12',    label: 'U12 (< 12 jaar)' },
  { value: 'u16',    label: 'U16 (12-16 jaar)' },
  { value: 'senior', label: 'Senior (16+)' },
  { value: 'mixed',  label: 'Gemengd' },
];

const LEVEL_OPTIONS = [
  { value: 'beginner',     label: 'Beginner' },
  { value: 'intermediate', label: 'Gevorderd' },
  { value: 'advanced',     label: 'Wedstrijdniveau' },
];

const FOCUS_OPTIONS = [
  { value: 'speed',      label: '⚡ Snelheid' },
  { value: 'endurance',  label: '🏃 Uithoudingsvermogen' },
  { value: 'technique',  label: '🎯 Techniek' },
  { value: 'freestyle',  label: '🎪 Freestyle' },
];

const PHASE_COLOR = { warmup: '#f59e0b', main: '#3b82f6', cooldown: '#22c55e' };
const INTENSITY_COLOR = { low: '#22c55e', medium: '#f59e0b', high: '#ef4444' };

// ─── Helpers ──────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);

const emptyBlock = (phase = 'main') => ({
  id:          uid(),
  phase,
  title:       '',
  durationMin: 10,
  description: '',
  discipline:  null,
  intensity:   'medium',
});

const inputStyle = {
  width: '100%', padding: '9px 11px', borderRadius: '8px',
  border: '1px solid #334155', backgroundColor: '#0f172a',
  color: 'white', fontSize: '13px', fontFamily: 'inherit',
  boxSizing: 'border-box',
};
const selectStyle = { ...inputStyle };
const labelStyle = {
  fontSize: '10px', fontWeight: '700', color: '#64748b',
  textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px', display: 'block',
};

// ─── Single block editor row ──────────────────────────────────────────────────
function BlockRow({ block, index, total, disciplines, onChange, onDelete, onMove }) {
  const [expanded, setExpanded] = useState(!block.title);
  const phaseColor = PHASE_COLOR[block.phase] || '#3b82f6';

  return (
    <div style={{
      backgroundColor: '#0f172a', borderRadius: '10px',
      border: `1px solid ${phaseColor}33`,
      borderLeft: `3px solid ${phaseColor}`,
      overflow: 'hidden',
    }}>
      {/* Collapsed header */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        {/* Phase dot */}
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: phaseColor, flexShrink: 0 }} />

        {/* Title */}
        <span style={{ flex: 1, fontSize: '13px', fontWeight: '600', color: block.title ? '#f1f5f9' : '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {block.title || 'Nieuw blok…'}
        </span>

        {/* Duration */}
        <span style={{ fontSize: '11px', color: '#64748b', flexShrink: 0 }}>{block.durationMin}′</span>

        {/* Intensity dot */}
        <span style={{ fontSize: '12px', flexShrink: 0 }}>
          {{ low: '🟢', medium: '🟡', high: '🔴' }[block.intensity] || '🟡'}
        </span>

        {/* Move + delete */}
        <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button onClick={() => onMove(index, -1)} disabled={index === 0} style={{ background: 'none', border: 'none', color: index === 0 ? '#1e293b' : '#475569', cursor: index === 0 ? 'default' : 'pointer', padding: '2px' }}>
            <ChevronUp size={14} />
          </button>
          <button onClick={() => onMove(index, 1)} disabled={index === total - 1} style={{ background: 'none', border: 'none', color: index === total - 1 ? '#1e293b' : '#475569', cursor: index === total - 1 ? 'default' : 'pointer', padding: '2px' }}>
            <ChevronDown size={14} />
          </button>
          <button onClick={() => onDelete(index)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}>
            <Trash2 size={13} />
          </button>
        </div>

        {/* Expand chevron */}
        <span style={{ color: '#334155', fontSize: '14px', flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Expanded fields */}
      {expanded && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Phase + Title */}
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px' }}>
            <div>
              <label style={labelStyle}>Fase</label>
              <select style={selectStyle} value={block.phase} onChange={e => onChange(index, { phase: e.target.value })}>
                {PHASE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Naam *</label>
              <input style={inputStyle} value={block.title} onChange={e => onChange(index, { title: e.target.value })} placeholder="bijv. Techniekblok sprint" autoFocus={!block.title} />
            </div>
          </div>

          {/* Duration + Intensity + Discipline */}
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: '8px' }}>
            <div>
              <label style={labelStyle}>Minuten</label>
              <input
                type="number" min="1" max="90" style={inputStyle}
                value={block.durationMin}
                onChange={e => onChange(index, { durationMin: parseInt(e.target.value) || 1 })}
              />
            </div>
            <div>
              <label style={labelStyle}>Intensiteit</label>
              <select style={selectStyle} value={block.intensity} onChange={e => onChange(index, { intensity: e.target.value })}>
                {INTENSITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.dot} {o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Discipline</label>
              <select style={selectStyle} value={block.discipline || ''} onChange={e => onChange(index, { discipline: e.target.value || null })}>
                <option value="">— Geen —</option>
                {disciplines.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Beschrijving</label>
            <textarea
              style={{ ...inputStyle, minHeight: '70px', resize: 'vertical', lineHeight: 1.5 }}
              value={block.description}
              onChange={e => onChange(index, { description: e.target.value })}
              placeholder="Beschrijf de oefening, aantal herhalingen, rust, focus…"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AI prompt panel ──────────────────────────────────────────────────────────
function AiPromptPanel({ disciplines, onGenerated, onClose }) {
  const [form, setForm] = useState({
    ageGroup:            'mixed',
    level:               'intermediate',
    totalMin:            90,
    focus:               [],
    weeksToCompetition:  '',
    groupNotes:          '',
  });
  const [generating, setGenerating] = useState(false);
  const [error,      setError]      = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleFocus = (f) => set('focus', form.focus.includes(f) ? form.focus.filter(x => x !== f) : [...form.focus, f]);

  const handleGenerate = async () => {
    setGenerating(true); setError('');
    try {
      const res = await fetch('/api/ai-training-prep', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ...form,
          totalMin:            parseInt(form.totalMin) || 90,
          weeksToCompetition:  form.weeksToCompetition ? parseInt(form.weeksToCompetition) : null,
          availableDisciplines: disciplines,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Generatie mislukt.'); return; }
      onGenerated(data.blocks, data.aiPromptSummary, form);
    } catch (e) {
      console.error('[AiPromptPanel]', e);
      setError('Netwerk- of serverfout. Probeer opnieuw.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 600 }}>
      <div style={{ backgroundColor: '#1e293b', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '560px', border: '1px solid #a78bfa33', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} color="#a78bfa" />
            <span style={{ fontWeight: '800', fontSize: '16px', color: '#f1f5f9' }}>AI training genereren</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Age + Level */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>Leeftijdsgroep</label>
              <select style={selectStyle} value={form.ageGroup} onChange={e => set('ageGroup', e.target.value)}>
                {AGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Niveau</label>
              <select style={selectStyle} value={form.level} onChange={e => set('level', e.target.value)}>
                {LEVEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Duration + Weeks to comp */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>Duur (minuten)</label>
              <input type="number" min="30" max="180" style={inputStyle} value={form.totalMin} onChange={e => set('totalMin', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Weken tot wedstrijd</label>
              <input type="number" min="0" max="52" style={inputStyle} value={form.weeksToCompetition} onChange={e => set('weeksToCompetition', e.target.value)} placeholder="Leeg = geen wedstrijd" />
            </div>
          </div>

          {/* Focus */}
          <div>
            <label style={labelStyle}>Focus (meerdere mogelijk)</label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {FOCUS_OPTIONS.map(opt => {
                const active = form.focus.includes(opt.value);
                return (
                  <button key={opt.value} onClick={() => toggleFocus(opt.value)} style={{
                    padding: '6px 12px', borderRadius: '20px', fontFamily: 'inherit',
                    border: `1px solid ${active ? '#a78bfa' : '#334155'}`,
                    backgroundColor: active ? '#a78bfa22' : 'transparent',
                    color: active ? '#a78bfa' : '#64748b',
                    fontSize: '12px', fontWeight: active ? '700' : '500', cursor: 'pointer',
                  }}>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Extra info over de groep (optioneel)</label>
            <textarea
              style={{ ...inputStyle, minHeight: '60px', resize: 'vertical', lineHeight: 1.5 }}
              value={form.groupNotes}
              onChange={e => set('groupNotes', e.target.value)}
              placeholder="bijv. Veel jongere skippers, recent blessure bij enkelen, werken aan dubbele sprong…"
            />
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#ef444422', color: '#ef4444', fontSize: '13px', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ef444433' }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <button onClick={handleGenerate} disabled={generating} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '13px', backgroundColor: '#a78bfa', border: 'none', borderRadius: '10px', color: 'white', fontWeight: '700', fontSize: '15px', cursor: generating ? 'default' : 'pointer', opacity: generating ? 0.75 : 1, fontFamily: 'inherit' }}>
            {generating ? (
              <>
                <div style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.4)', borderTop: '2px solid white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                Genereren…
              </>
            ) : (
              <><Sparkles size={16} /> Training genereren</>
            )}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ─── Main editor ──────────────────────────────────────────────────────────────
export default function TrainingPrepEditor({
  prep, clubId, coachMemberId, coachUid,
  eventId = null, disciplines = [], onSaved, onClose,
}) {
  const isEdit = !!prep?.id;

  const [title,      setTitle]      = useState(prep?.title      || '');
  const [ageGroup,   setAgeGroup]   = useState(prep?.ageGroup   || 'mixed');
  const [level,      setLevel]      = useState(prep?.level      || 'intermediate');
  const [focus,      setFocus]      = useState(prep?.focus      || []);
  const [blocks,     setBlocks]     = useState(prep?.blocks     || [emptyBlock('warmup'), emptyBlock('main'), emptyBlock('cooldown')]);
  const [aiSummary,  setAiSummary]  = useState(prep?.aiPromptSummary || '');
  const [isAI,       setIsAI]       = useState(prep?.generatedByAI || false);

  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [showAiPanel, setShowAiPanel] = useState(false);

  const totalMin = blocks.reduce((s, b) => s + (b.durationMin || 0), 0);

  const toggleFocus = (f) =>
    setFocus(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);

  const handleBlockChange = useCallback((index, changes) => {
    setBlocks(prev => prev.map((b, i) => i === index ? { ...b, ...changes } : b));
  }, []);

  const handleBlockDelete = useCallback((index) => {
    setBlocks(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleBlockMove = useCallback((index, dir) => {
    setBlocks(prev => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const handleAddBlock = (phase = 'main') => {
    setBlocks(prev => [...prev, emptyBlock(phase)]);
  };

  const handleAiGenerated = (newBlocks, summary, formData) => {
    setBlocks(newBlocks);
    setAiSummary(summary);
    setIsAI(true);
    if (!title) setTitle(`Training ${new Date().toLocaleDateString('nl-BE', { day: '2-digit', month: 'short' })}`);
    setAgeGroup(formData.ageGroup);
    setLevel(formData.level);
    setFocus(formData.focus);
    setShowAiPanel(false);
  };

  const handleSave = async () => {
    setError('');
    if (!title.trim()) { setError('Titel is verplicht.'); return; }
    if (blocks.length === 0) { setError('Voeg minstens één blok toe.'); return; }
    if (blocks.some(b => !b.title.trim())) { setError('Elk blok heeft een naam nodig.'); return; }

    setSaving(true);
    try {
      const data = {
        title:           title.trim(),
        ageGroup,
        level,
        totalMin,
        focus,
        generatedByAI:   isAI,
        aiPromptSummary: aiSummary,
        blocks,
        createdBy:       coachMemberId || null,
      };

      let savedPrep;
      if (isEdit) {
        await TrainingPrepFactory.update(clubId, prep.id, data);
        savedPrep = { id: prep.id, ...data };
      } else {
        const ref = await TrainingPrepFactory.create(clubId, data, coachUid);
        savedPrep = { id: ref.id, ...data };
        // Koppel aan event als opgegeven
        if (eventId) {
          await TrainingPrepFactory.linkToEvent(clubId, ref.id, eventId);
        }
      }

      onSaved?.(savedPrep);
    } catch (e) {
      console.error('[TrainingPrepEditor] save:', e);
      setError('Opslaan mislukt. Probeer opnieuw.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 500 }}>
        <div style={{ backgroundColor: '#1e293b', borderRadius: '20px 20px 0 0', padding: '20px', width: '100%', maxWidth: '640px', border: '1px solid #334155', maxHeight: '94vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={18} color="#3b82f6" />
              <span style={{ fontWeight: '800', fontSize: '16px', color: '#f1f5f9' }}>
                {isEdit ? 'Voorbereiding bewerken' : 'Nieuwe trainingsvoorbereiding'}
              </span>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}>
              <X size={20} />
            </button>
          </div>

          {/* AI generate button */}
          <button
            onClick={() => setShowAiPanel(true)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '11px', backgroundColor: '#a78bfa22', border: '1px solid #a78bfa44', borderRadius: '10px', color: '#a78bfa', fontWeight: '700', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <Sparkles size={15} /> {isAI ? 'Opnieuw AI-genereren' : 'Genereer met AI'}
          </button>

          {/* AI banner */}
          {isAI && aiSummary && (
            <div style={{ backgroundColor: '#a78bfa11', border: '1px solid #a78bfa22', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#a78bfa', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={11} /> {aiSummary}
            </div>
          )}

          {/* Title */}
          <div>
            <label style={labelStyle}>Titel *</label>
            <input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} placeholder="bijv. Snelheidstraining gevorderden" />
          </div>

          {/* Age + Level + Focus */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>Leeftijdsgroep</label>
              <select style={selectStyle} value={ageGroup} onChange={e => setAgeGroup(e.target.value)}>
                {AGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Niveau</label>
              <select style={selectStyle} value={level} onChange={e => setLevel(e.target.value)}>
                {LEVEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Focus</label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {FOCUS_OPTIONS.map(opt => {
                const active = focus.includes(opt.value);
                return (
                  <button key={opt.value} onClick={() => toggleFocus(opt.value)} style={{
                    padding: '5px 10px', borderRadius: '20px', fontFamily: 'inherit',
                    border: `1px solid ${active ? '#3b82f6' : '#334155'}`,
                    backgroundColor: active ? '#3b82f622' : 'transparent',
                    color: active ? '#60a5fa' : '#64748b',
                    fontSize: '12px', fontWeight: active ? '700' : '500', cursor: 'pointer',
                  }}>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Total time indicator */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={14} color="#64748b" /> Blokken
            </span>
            <span style={{ fontSize: '12px', color: totalMin > 0 ? '#22c55e' : '#475569', fontWeight: '700' }}>
              {totalMin} min totaal
            </span>
          </div>

          {/* Blocks */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {blocks.map((block, i) => (
              <BlockRow
                key={block.id}
                block={block}
                index={i}
                total={blocks.length}
                disciplines={disciplines}
                onChange={handleBlockChange}
                onDelete={handleBlockDelete}
                onMove={handleBlockMove}
              />
            ))}
          </div>

          {/* Add block buttons */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {PHASE_OPTIONS.map(phase => (
              <button key={phase.value} onClick={() => handleAddBlock(phase.value)} style={{
                display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px',
                borderRadius: '20px', fontFamily: 'inherit',
                border: `1px solid ${phase.color}44`, backgroundColor: `${phase.color}11`,
                color: phase.color, fontSize: '12px', fontWeight: '600', cursor: 'pointer',
              }}>
                <Plus size={12} /> {phase.label}
              </button>
            ))}
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#ef444422', color: '#ef4444', fontSize: '13px', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ef444433' }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}

          {/* Save */}
          <div style={{ display: 'flex', gap: '10px', paddingBottom: '4px' }}>
            <button onClick={handleSave} disabled={saving} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '13px', backgroundColor: '#22c55e', border: 'none', borderRadius: '10px', color: 'white', fontWeight: '700', fontSize: '14px', cursor: 'pointer', opacity: saving ? 0.65 : 1, fontFamily: 'inherit' }}>
              <Save size={15} /> {saving ? 'Opslaan…' : isEdit ? 'Wijzigingen opslaan' : 'Voorbereiding opslaan'}
            </button>
            <button onClick={onClose} style={{ padding: '13px 16px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '10px', color: '#94a3b8', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
              Annuleren
            </button>
          </div>
        </div>
      </div>

      {showAiPanel && (
        <AiPromptPanel
          disciplines={disciplines}
          onGenerated={handleAiGenerated}
          onClose={() => setShowAiPanel(false)}
        />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
        select option { background-color: #1e293b; }
      `}</style>
    </>
  );
}
