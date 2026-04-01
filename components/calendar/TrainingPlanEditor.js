/**
 * components/calendar/TrainingPlanEditor.js
 *
 * Genereert en toont een trainingsschema richting een wedstrijd.
 *
 * Props:
 *   plan          : TrainingPlan | null   — null = nieuw
 *   clubId        : string
 *   uid           : string
 *   groups        : group[]
 *   templates     : EventTemplate[]       — om trainingsdatums te berekenen
 *   disciplines   : string[]
 *   onSaved       : (plan) => void
 *   onClose       : () => void
 */

import { useState, useEffect } from 'react';
import {
  X, Save, Sparkles, AlertCircle, Calendar,
  ChevronDown, ChevronUp, Clock, Target,
  Zap, CheckCircle2, Plus, ArrowRight,
} from 'lucide-react';
import {
  TrainingPlanFactory, TrainingPrepFactory,
  EventTemplateFactory, CalendarEventFactory,
} from '../../constants/dbSchema';
import {
  generateVirtualEvents, startOfDay, endOfDay, addDays,
} from '../../utils/calendarUtils';
import TrainingPrepEditor from './TrainingPrepEditor';

// ─── Constants ────────────────────────────────────────────────────────────────
const INTENSITY_CONFIG = {
  low:    { label: 'Laag',    color: '#22c55e', bar: '█░░' },
  medium: { label: 'Midden',  color: '#f59e0b', bar: '██░' },
  high:   { label: 'Hoog',    color: '#ef4444', bar: '███' },
};
const FOCUS_LABELS = {
  speed: '⚡ Snelheid', endurance: '🏃 Uithoudingsvermogen',
  technique: '🎯 Techniek', freestyle: '🎪 Freestyle',
  fun: '🎉 Plezier', skills: '🌟 Skills', competition_prep: '🏆 Wedstrijdprep',
};
const LEVEL_OPTIONS = [
  { value: 'recreatief',   label: '🎉 Recreatief' },
  { value: 'beginner',     label: 'Beginner' },
  { value: 'intermediate', label: 'Gevorderd' },
  { value: 'advanced',     label: 'Wedstrijdniveau' },
];
const AGE_OPTIONS = [
  { value: 'u12',    label: 'U12' },
  { value: 'u16',    label: 'U16' },
  { value: 'senior', label: 'Senior' },
  { value: 'mixed',  label: 'Gemengd' },
];

const inputStyle = {
  width: '100%', padding: '9px 11px', borderRadius: '8px',
  border: '1px solid #334155', backgroundColor: '#0f172a',
  color: 'white', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box',
};
const labelStyle = {
  fontSize: '10px', fontWeight: '700', color: '#64748b',
  textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px', display: 'block',
};
function pad2(n) { return String(n).padStart(2, '0'); }
function dateToStr(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

// ─── Step 1: Setup form ───────────────────────────────────────────────────────
function SetupForm({ groups, templates, disciplines, onGenerate }) {
  const [groupId,         setGroupId]         = useState('');
  const [competitionDate, setCompetitionDate] = useState('');
  const [competitionName, setCompetitionName] = useState('');
  const [level,           setLevel]           = useState('intermediate');
  const [ageGroup,        setAgeGroup]        = useState('mixed');
  const [extraNotes,      setExtraNotes]      = useState('');
  const [selectedDiscip,  setSelectedDiscip]  = useState([]);
  const [generating,      setGenerating]      = useState(false);
  const [error,           setError]           = useState('');

  const selectedGroup = groups.find(g => g.id === groupId);

  // Bereken trainingsdatums vanuit templates voor de geselecteerde groep
  const trainingDates = (() => {
    if (!groupId || !competitionDate) return [];
    const today    = new Date();
    const compDate = new Date(competitionDate + 'T23:59:59');
    if (compDate <= today) return [];

    const groupTemplates = templates.filter(t =>
      t.isActive && (t.groupIds || []).includes(groupId) && t.type === 'training'
    );
    const virtual = generateVirtualEvents(groupTemplates, startOfDay(today), endOfDay(compDate));
    return [...new Set(virtual.map(e => {
      const d = new Date((e.startAt?.seconds || 0) * 1000);
      return dateToStr(d);
    }))].sort();
  })();

  const toggleDisc = (d) =>
    setSelectedDiscip(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  const handleGenerate = async () => {
    if (!groupId)          { setError('Kies een groep.'); return; }
    if (!competitionDate)  { setError('Kies een wedstrijddatum.'); return; }
    if (trainingDates.length === 0) { setError('Geen trainingen gevonden voor deze groep voor de wedstrijd.'); return; }

    setGenerating(true); setError('');
    try {
      const res = await fetch('/api/ai-training-plan', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          groupName:        selectedGroup?.name || '',
          level,
          ageGroup,
          competitionDate,
          competitionName,
          disciplines:      selectedDiscip.length > 0 ? selectedDiscip : disciplines,
          trainingsPerWeek: 2,
          trainingDates,
          extraNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Generatie mislukt.'); return; }
      onGenerate({
        groupId, groupName: selectedGroup?.name || '',
        competitionDate, competitionName,
        level, ageGroup,
        disciplines: selectedDiscip.length > 0 ? selectedDiscip : disciplines,
        summary:   data.summary,
        trainings: data.trainings,
      });
    } catch (e) {
      console.error('[SetupForm]', e);
      setError('Netwerk- of serverfout. Probeer opnieuw.');
    } finally {
      setGenerating(false);
    }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Group */}
      <div>
        <label style={labelStyle}>Groep *</label>
        <select style={inputStyle} value={groupId} onChange={e => setGroupId(e.target.value)}>
          <option value="">— Kies een groep —</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>

      {/* Age + Level */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={labelStyle}>Leeftijdsgroep</label>
          <select style={inputStyle} value={ageGroup} onChange={e => setAgeGroup(e.target.value)}>
            {AGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Niveau</label>
          <select style={inputStyle} value={level} onChange={e => setLevel(e.target.value)}>
            {LEVEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Competition */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={labelStyle}>Wedstrijddatum *</label>
          <input type="date" style={inputStyle} value={competitionDate} min={today} onChange={e => setCompetitionDate(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Naam wedstrijd</label>
          <input style={inputStyle} value={competitionName} onChange={e => setCompetitionName(e.target.value)} placeholder="bijv. BK Springtouw 2025" />
        </div>
      </div>

      {/* Disciplines */}
      {disciplines.length > 0 && (
        <div>
          <label style={labelStyle}>Disciplines (leeg = alle)</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {disciplines.map(d => {
              const active = selectedDiscip.includes(d);
              return (
                <button key={d} onClick={() => toggleDisc(d)} style={{
                  padding: '5px 10px', borderRadius: '20px', fontFamily: 'inherit',
                  border: `1px solid ${active ? '#f97316' : '#334155'}`,
                  backgroundColor: active ? '#f9731622' : 'transparent',
                  color: active ? '#f97316' : '#64748b',
                  fontSize: '12px', fontWeight: active ? '700' : '500', cursor: 'pointer',
                }}>
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Training dates preview */}
      {groupId && competitionDate && (
        <div style={{ backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #334155', padding: '10px 12px' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>
            Gevonden trainingen ({trainingDates.length})
          </div>
          {trainingDates.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#475569', fontStyle: 'italic' }}>
              Geen trainingen gevonden voor deze groep vóór de wedstrijd. Controleer de trainingsreeksen.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
              {trainingDates.slice(0, 12).map(d => (
                <span key={d} style={{ fontSize: '11px', color: '#94a3b8', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#1e293b' }}>
                  {new Date(d + 'T12:00:00').toLocaleDateString('nl-BE', { day: '2-digit', month: 'short' })}
                </span>
              ))}
              {trainingDates.length > 12 && (
                <span style={{ fontSize: '11px', color: '#475569' }}>+{trainingDates.length - 12} meer</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Extra notes */}
      <div>
        <label style={labelStyle}>Extra info (optioneel)</label>
        <textarea
          style={{ ...inputStyle, minHeight: '60px', resize: 'vertical', lineHeight: 1.5 }}
          value={extraNotes}
          onChange={e => setExtraNotes(e.target.value)}
          placeholder="bijv. Groep heeft veel beginners, focus op techniek eerder dan snelheid…"
        />
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#ef444422', color: '#ef4444', fontSize: '13px', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ef444433' }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <button onClick={handleGenerate} disabled={generating || trainingDates.length === 0} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '13px', backgroundColor: '#a78bfa', border: 'none', borderRadius: '10px', color: 'white', fontWeight: '700', fontSize: '15px', cursor: generating ? 'default' : 'pointer', opacity: (generating || trainingDates.length === 0) ? 0.65 : 1, fontFamily: 'inherit' }}>
        {generating ? (
          <><div style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.4)', borderTop: '2px solid white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Schema genereren…</>
        ) : (
          <><Sparkles size={16} /> Schema genereren voor {trainingDates.length} trainingen</>
        )}
      </button>
    </div>
  );
}

// ─── Training row in plan ─────────────────────────────────────────────────────
function TrainingRow({ training, clubId, uid, planId, disciplines, onPrepAdded }) {
  const [expanded,    setExpanded]    = useState(false);
  const [showEditor,  setShowEditor]  = useState(false);
  const [preps,       setPreps]       = useState([]);
  const [generating,  setGenerating]  = useState(false);

  const intCfg = INTENSITY_CONFIG[training.intensity] || INTENSITY_CONFIG.medium;
  const d = new Date(training.date + 'T12:00:00');
  const dateStr = d.toLocaleDateString('nl-BE', { weekday: 'short', day: '2-digit', month: 'short' });
  const prepIds = training.prepIds || [];

  // Laad bestaande preps
  useEffect(() => {
    if (!expanded || prepIds.length === 0) return;
    Promise.all(prepIds.map(id => TrainingPrepFactory.getById(clubId, id)))
      .then(snaps => setPreps(snaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() }))));
  }, [expanded, prepIds.join(','), clubId]);

  // AI prep genereren voor deze specifieke training
  const handleGeneratePrep = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/ai-training-prep', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          level:                training.weekLabel?.includes('Week 1') ? 'beginner' : 'intermediate',
          ageGroup:             'mixed',
          totalMin:             90,
          focus:                training.focus || [],
          weeksToCompetition:   null,
          groupNotes:           `Thema: ${training.theme}. Doelen: ${training.goals?.join(', ')}. ${training.notes || ''}`,
          availableDisciplines: disciplines,
        }),
      });
      const data = await res.json();
      if (!res.ok) { console.error('[TrainingRow] prep gen:', data.error); return; }

      // Sla de prep op
      const prepData = {
        title:           `${training.weekLabel} — ${training.theme}`,
        ageGroup:        'mixed',
        level:           'intermediate',
        totalMin:        90,
        focus:           training.focus || [],
        generatedByAI:   true,
        aiPromptSummary: data.aiPromptSummary,
        blocks:          data.blocks,
        usedInEventIds:  [],
      };
      const ref = await TrainingPrepFactory.create(clubId, prepData, uid);
      // Koppel aan plan
      await TrainingPlanFactory.updateTraining(clubId, planId, training.date, {
        prepIds: [...prepIds, ref.id],
      });
      onPrepAdded?.();
    } catch (e) {
      console.error('[TrainingRow] generatePrep:', e);
    } finally {
      setGenerating(false);
    }
  };

  const handlePrepSaved = async (savedPrep) => {
    setShowEditor(false);
    if (savedPrep?.id) {
      await TrainingPlanFactory.updateTraining(clubId, planId, training.date, {
        prepIds: [...prepIds, savedPrep.id],
      });
      onPrepAdded?.();
    }
  };

  return (
    <div style={{ backgroundColor: '#1e293b', borderRadius: '10px', border: '1px solid #334155', overflow: 'hidden', marginBottom: '6px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
        {/* Date */}
        <div style={{ minWidth: '70px', flexShrink: 0 }}>
          <div style={{ fontSize: '11px', fontWeight: '800', color: '#f1f5f9' }}>{dateStr}</div>
        </div>
        {/* Intensity bar */}
        <div style={{ fontSize: '11px', color: intCfg.color, fontFamily: 'monospace', flexShrink: 0 }}>{intCfg.bar}</div>
        {/* Theme */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {training.theme}
          </div>
          <div style={{ fontSize: '10px', color: '#64748b', display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '1px' }}>
            {(training.focus || []).slice(0, 3).map(f => (
              <span key={f}>{FOCUS_LABELS[f] || f}</span>
            ))}
          </div>
        </div>
        {/* Prep indicator */}
        {prepIds.length > 0 && (
          <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '6px', backgroundColor: '#a78bfa22', color: '#a78bfa', border: '1px solid #a78bfa33', flexShrink: 0 }}>
            ✨ {prepIds.length}
          </span>
        )}
        <span style={{ color: '#334155', fontSize: '12px', flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Expanded */}
      {expanded && (
        <div style={{ borderTop: '1px solid #0f172a', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Goals */}
          {training.goals?.length > 0 && (
            <div>
              <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '5px' }}>Doelen</div>
              {training.goals.map((g, i) => (
                <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', marginBottom: '3px' }}>
                  <CheckCircle2 size={11} color="#22c55e" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.4 }}>{g}</span>
                </div>
              ))}
            </div>
          )}
          {/* Notes */}
          {training.notes && (
            <div style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic', backgroundColor: '#0f172a', borderRadius: '6px', padding: '8px 10px' }}>
              💡 {training.notes}
            </div>
          )}
          {/* Preps */}
          {preps.length > 0 && (
            <div>
              <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '5px' }}>Gekoppelde voorbereidingen</div>
              {preps.map(prep => (
                <div key={prep.id} style={{ fontSize: '12px', color: '#a78bfa', padding: '4px 0', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Zap size={10} /> {prep.title}
                </div>
              ))}
            </div>
          )}
          {/* Actions */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button onClick={handleGeneratePrep} disabled={generating} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', backgroundColor: '#a78bfa22', border: '1px solid #a78bfa44', borderRadius: '7px', color: '#a78bfa', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', opacity: generating ? 0.65 : 1 }}>
              {generating ? '⏳ Genereren…' : <><Sparkles size={11} /> AI prep genereren</>}
            </button>
            <button onClick={() => setShowEditor(true)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '7px', color: '#64748b', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
              <Plus size={11} /> Manuele prep
            </button>
          </div>
        </div>
      )}

      {showEditor && (
        <TrainingPrepEditor
          prep={null}
          clubId={clubId}
          coachMemberId={null}
          coachUid={uid}
          disciplines={disciplines}
          onSaved={handlePrepSaved}
          onClose={() => setShowEditor(false)}
        />
      )}
    </div>
  );
}

// ─── Plan viewer ──────────────────────────────────────────────────────────────
function PlanViewer({ plan, clubId, uid, planId, disciplines, onUpdate }) {
  const weeks = [...new Set((plan.trainings || []).map(t => t.weekLabel))];

  return (
    <div>
      {/* Summary */}
      {plan.summary && (
        <div style={{ backgroundColor: '#a78bfa11', border: '1px solid #a78bfa22', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: '#a78bfa', fontStyle: 'italic', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <Sparkles size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          {plan.summary}
        </div>
      )}

      {/* Competition header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', backgroundColor: '#f9731611', border: '1px solid #f9731633', borderRadius: '10px', marginBottom: '16px' }}>
        <Target size={16} color="#f97316" />
        <div>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#f1f5f9' }}>
            {plan.competitionName || 'Wedstrijd'}
          </div>
          <div style={{ fontSize: '11px', color: '#94a3b8' }}>
            {plan.competitionDate && new Date(plan.competitionDate + 'T12:00:00').toLocaleDateString('nl-BE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
          </div>
        </div>
      </div>

      {/* Trainings per week */}
      {weeks.map(weekLabel => {
        const weekTrainings = (plan.trainings || []).filter(t => t.weekLabel === weekLabel);
        return (
          <div key={weekLabel} style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={11} /> {weekLabel}
              <span style={{ fontWeight: '400', color: '#475569' }}>· {weekTrainings.length} training{weekTrainings.length !== 1 ? 'en' : ''}</span>
            </div>
            {weekTrainings.map(t => (
              <TrainingRow
                key={t.date}
                training={t}
                clubId={clubId}
                uid={uid}
                planId={planId}
                disciplines={disciplines}
                onPrepAdded={onUpdate}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function TrainingPlanEditor({
  plan, clubId, uid, groups = [], templates = [], disciplines = [],
  onSaved, onClose,
}) {
  const [step,        setStep]        = useState(plan ? 'view' : 'setup');
  const [generatedPlan, setGeneratedPlan] = useState(null);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [savedPlanId, setSavedPlanId] = useState(plan?.id || null);
  const [livePlan,    setLivePlan]    = useState(plan || null);

  const handleGenerated = (planData) => {
    setGeneratedPlan(planData);
    setStep('preview');
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const ref = await TrainingPlanFactory.create(clubId, {
        ...generatedPlan,
        trainings: generatedPlan.trainings.map(t => ({ ...t, prepIds: [] })),
      }, uid);
      setSavedPlanId(ref.id);
      setLivePlan({ id: ref.id, ...generatedPlan });
      setStep('view');
      onSaved?.({ id: ref.id, ...generatedPlan });
    } catch (e) {
      console.error('[TrainingPlanEditor] save:', e);
      setError('Opslaan mislukt. Probeer opnieuw.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!savedPlanId) return;
    const snap = await TrainingPlanFactory.getById(clubId, savedPlanId);
    if (snap.exists()) setLivePlan({ id: snap.id, ...snap.data() });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 500 }}>
      <div style={{ backgroundColor: '#1e293b', borderRadius: '20px 20px 0 0', padding: '20px', width: '100%', maxWidth: '680px', border: '1px solid #334155', maxHeight: '95vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Target size={18} color="#f97316" />
            <span style={{ fontWeight: '800', fontSize: '16px', color: '#f1f5f9' }}>
              {step === 'setup'   ? 'Trainingsschema genereren' :
               step === 'preview' ? 'Schema bekijken & opslaan' :
               livePlan?.competitionName || 'Trainingsschema'}
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}>
            <X size={20} />
          </button>
        </div>

        {/* Step indicator */}
        {step !== 'view' && (
          <div style={{ display: 'flex', gap: '4px' }}>
            {['setup', 'preview'].map((s, i) => (
              <div key={s} style={{ flex: 1, height: '3px', borderRadius: '2px', backgroundColor: step === s || (step === 'preview' && i === 0) ? '#a78bfa' : '#334155' }} />
            ))}
          </div>
        )}

        {/* Content */}
        {step === 'setup' && (
          <SetupForm
            groups={groups}
            templates={templates}
            disciplines={disciplines}
            onGenerate={handleGenerated}
          />
        )}

        {step === 'preview' && generatedPlan && (
          <>
            <PlanViewer
              plan={generatedPlan}
              clubId={clubId}
              uid={uid}
              planId={null}
              disciplines={disciplines}
              onUpdate={() => {}}
            />
            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#ef444422', color: '#ef4444', fontSize: '13px', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ef444433' }}>
                <AlertCircle size={14} /> {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleSave} disabled={saving} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '13px', backgroundColor: '#22c55e', border: 'none', borderRadius: '10px', color: 'white', fontWeight: '700', fontSize: '14px', cursor: 'pointer', opacity: saving ? 0.65 : 1, fontFamily: 'inherit' }}>
                <Save size={15} /> {saving ? 'Opslaan…' : 'Schema opslaan'}
              </button>
              <button onClick={() => setStep('setup')} style={{ padding: '13px 16px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '10px', color: '#94a3b8', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                Aanpassen
              </button>
            </div>
          </>
        )}

        {step === 'view' && livePlan && (
          <PlanViewer
            plan={livePlan}
            clubId={clubId}
            uid={uid}
            planId={savedPlanId}
            disciplines={disciplines}
            onUpdate={handleUpdate}
          />
        )}
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
