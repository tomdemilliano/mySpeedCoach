/**
 * pages/training-plan/[planId].js
 *
 * Raadpleegpagina voor een trainingsschema.
 * Toegankelijk voor coaches (volledige weergave + prep-knoppen)
 * en skippers (readonly met thema's en doelen).
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import {
  ArrowLeft, Target, Calendar, CheckCircle2,
  Zap, Sparkles, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import {
  TrainingPlanFactory, TrainingPrepFactory,
  UserMemberLinkFactory, ClubMemberFactory,
} from '../constants/dbSchema';
import TrainingPrepEditor from '../components/calendar/TrainingPrepEditor';
import TrainingPrepViewer from '../components/calendar/TrainingPrepViewer';

const INTENSITY_CONFIG = {
  low:    { label: 'Laag',   color: '#22c55e', bar: '█░░' },
  medium: { label: 'Midden', color: '#f59e0b', bar: '██░' },
  high:   { label: 'Hoog',   color: '#ef4444', bar: '███' },
};
const FOCUS_LABELS = {
  speed: '⚡ Snelheid', endurance: '🏃 Uithoudingsvermogen',
  technique: '🎯 Techniek', freestyle: '🎪 Freestyle',
  fun: '🎉 Plezier', skills: '🌟 Skills', competition_prep: '🏆 Wedstrijdprep',
};

function TrainingCard({ training, isCoach, clubId, uid, planId, disciplines, onUpdate }) {
  const [expanded,   setExpanded]   = useState(false);
  const [preps,      setPreps]      = useState([]);
  const [showEditor, setShowEditor] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [expandPrep, setExpandPrep] = useState(null);

  const prepIds = training.prepIds || [];
  const intCfg  = INTENSITY_CONFIG[training.intensity] || INTENSITY_CONFIG.medium;
  const d       = new Date(training.date + 'T12:00:00');
  const dateStr = d.toLocaleDateString('nl-BE', { weekday: 'short', day: '2-digit', month: 'long' });
  const isPast  = d < new Date();

  useEffect(() => {
    if (!expanded || prepIds.length === 0) return;
    let cancelled = false;
    Promise.all(prepIds.map(id => TrainingPrepFactory.getById(clubId, id)))
      .then(snaps => {
        if (!cancelled) setPreps(snaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() })));
      });
    return () => { cancelled = true; };
  }, [expanded, prepIds.join(','), clubId]);

  const handleGeneratePrep = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/ai-training-prep', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: 'intermediate', ageGroup: 'mixed', totalMin: 90,
          focus: training.focus || [],
          weeksToCompetition: null,
          groupNotes: `Thema: ${training.theme}. Doelen: ${(training.goals || []).join(', ')}. ${training.notes || ''}`,
          availableDisciplines: disciplines,
        }),
      });
      const data = await res.json();
      if (!res.ok) return;

      const prepRef = await TrainingPrepFactory.create(clubId, {
        title: `${training.weekLabel} — ${training.theme}`,
        ageGroup: 'mixed', level: 'intermediate', totalMin: 90,
        focus: training.focus || [], generatedByAI: true,
        aiPromptSummary: data.aiPromptSummary, blocks: data.blocks, usedInEventIds: [],
      }, uid);

      await TrainingPlanFactory.updateTraining(clubId, planId, training.date, {
        prepIds: [...prepIds, prepRef.id],
      });
      onUpdate?.();
    } catch (e) { console.error('[TrainingCard] gen prep:', e); }
    finally { setGenerating(false); }
  };

  const handlePrepSaved = async (savedPrep) => {
    setShowEditor(false);
    if (savedPrep?.id) {
      await TrainingPlanFactory.updateTraining(clubId, planId, training.date, {
        prepIds: [...prepIds, savedPrep.id],
      });
      onUpdate?.();
    }
  };

  return (
    <div style={{
      backgroundColor: '#1e293b', borderRadius: '12px',
      border: `1px solid ${isPast ? '#1e293b' : '#334155'}`,
      opacity: isPast ? 0.65 : 1, overflow: 'hidden', marginBottom: '6px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
        <div style={{ flexShrink: 0, width: '36px', textAlign: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: '800', color: '#f1f5f9', lineHeight: 1 }}>
            {d.getDate()}
          </div>
          <div style={{ fontSize: '9px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
            {d.toLocaleDateString('nl-BE', { month: 'short' })}
          </div>
        </div>
        <div style={{ width: '1px', height: '32px', backgroundColor: '#334155', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#f1f5f9', marginBottom: '2px' }}>
            {training.theme}
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', fontFamily: 'monospace', color: intCfg.color }}>{intCfg.bar}</span>
            {(training.focus || []).slice(0, 2).map(f => (
              <span key={f} style={{ fontSize: '10px', color: '#64748b' }}>{FOCUS_LABELS[f] || f}</span>
            ))}
          </div>
        </div>
        {prepIds.length > 0 && (
          <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 7px', borderRadius: '6px', backgroundColor: '#a78bfa22', color: '#a78bfa', border: '1px solid #a78bfa33', flexShrink: 0 }}>
            ✨ {prepIds.length}
          </span>
        )}
        {expanded ? <ChevronUp size={15} color="#475569" /> : <ChevronDown size={15} color="#475569" />}
      </div>

      {/* Expanded */}
      {expanded && (
        <div style={{ borderTop: '1px solid #0f172a', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Goals */}
          {(training.goals || []).length > 0 && (
            <div>
              <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Doelen</div>
              {training.goals.map((g, i) => (
                <div key={i} style={{ display: 'flex', gap: '7px', alignItems: 'flex-start', marginBottom: '4px' }}>
                  <CheckCircle2 size={12} color="#22c55e" style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>{g}</span>
                </div>
              ))}
            </div>
          )}

          {/* Coach note */}
          {training.notes && (
            <div style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic', backgroundColor: '#0f172a', borderRadius: '8px', padding: '8px 12px', borderLeft: '3px solid #334155' }}>
              💡 {training.notes}
            </div>
          )}

          {/* Preps */}
          {preps.length > 0 && (
            <div>
              <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>Voorbereidingen</div>
              {preps.map(prep => (
                <div key={prep.id} style={{ backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #a78bfa22', marginBottom: '5px', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', cursor: 'pointer' }}
                    onClick={() => setExpandPrep(p => p === prep.id ? null : prep.id)}>
                    <Zap size={12} color="#a78bfa" />
                    <span style={{ flex: 1, fontSize: '12px', fontWeight: '600', color: '#f1f5f9' }}>{prep.title}</span>
                    <span style={{ fontSize: '10px', color: '#475569' }}>
                      {(prep.blocks || []).reduce((s, b) => s + (b.durationMin || 0), 0)} min
                    </span>
                    {expandPrep === prep.id ? <ChevronUp size={12} color="#475569" /> : <ChevronDown size={12} color="#475569" />}
                  </div>
                  {expandPrep === prep.id && (
                    <div style={{ padding: '0 12px 12px', borderTop: '1px solid #1e293b' }}>
                      <TrainingPrepViewer prep={prep} compact />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Coach actions */}
          {isCoach && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button onClick={handleGeneratePrep} disabled={generating} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', backgroundColor: '#a78bfa22', border: '1px solid #a78bfa44', borderRadius: '8px', color: '#a78bfa', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', opacity: generating ? 0.65 : 1 }}>
                {generating ? '⏳ Genereren…' : <><Sparkles size={12} /> AI prep genereren</>}
              </button>
              <button onClick={() => setShowEditor(true)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '8px', color: '#64748b', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                + Manuele prep
              </button>
            </div>
          )}
        </div>
      )}

      {showEditor && (
        <TrainingPrepEditor
          prep={null} clubId={clubId} coachMemberId={null} coachUid={uid}
          disciplines={disciplines}
          onSaved={handlePrepSaved}
          onClose={() => setShowEditor(false)}
        />
      )}
    </div>
  );
}

export default function TrainingPlanPage() {
  const router   = useRouter();
  const { planId } = router.query;
  const { uid, loading: authLoading } = useAuth();

  const [plan,       setPlan]       = useState(null);
  const [clubId,     setClubId]     = useState(null);
  const [isCoach,    setIsCoach]    = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [notFound,   setNotFound]   = useState(false);
  const [version,    setVersion]    = useState(0);   // bump to re-fetch plan

  // Resolve clubId from user's link + check coach role
  useEffect(() => {
    if (!uid || !planId) return;
    let cancelled = false;

    const unsub = UserMemberLinkFactory.getLinksForUser(uid, async (links) => {
      if (cancelled || links.length === 0) { setNotFound(true); setLoading(false); return; }

      // Try each club until we find the plan
      for (const link of links) {
        try {
          const snap = await TrainingPlanFactory.getById(link.clubId, planId);
          if (snap.exists()) {
            if (!cancelled) {
              setClubId(link.clubId);
              setPlan({ id: snap.id, ...snap.data() });
              // Check coach role
              const memberSnap = await ClubMemberFactory.getById(link.clubId, link.memberId);
              if (memberSnap?.exists() && memberSnap.data()?.isCoach) setIsCoach(true);
              setLoading(false);
            }
            return;
          }
        } catch {}
      }
      if (!cancelled) { setNotFound(true); setLoading(false); }
    });

    return () => { cancelled = true; unsub(); };
  }, [uid, planId]);

  // Reload plan when a prep is added
  const handleUpdate = async () => {
    if (!clubId || !planId) return;
    const snap = await TrainingPlanFactory.getById(clubId, planId);
    if (snap.exists()) setPlan({ id: snap.id, ...snap.data() });
  };

  const pageCSS = `* { box-sizing: border-box; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;

  if (authLoading || loading) return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{pageCSS}</style>
      <div style={{ width: '36px', height: '36px', border: '3px solid #1e293b', borderTop: '3px solid #f97316', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  if (!uid) { typeof window !== 'undefined' && router.push('/'); return null; }

  if (notFound || !plan) return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', color: '#475569', fontFamily: 'system-ui, sans-serif' }}>
      <style>{pageCSS}</style>
      <Target size={48} color="#334155" />
      <p style={{ margin: 0, fontSize: '15px' }}>Schema niet gevonden of geen toegang.</p>
      <a href="/agenda" style={{ color: '#60a5fa', fontSize: '13px' }}>← Terug naar kalender</a>
    </div>
  );

  const weeks = [...new Map((plan.trainings || []).map(t => [t.weekLabel, t])).keys()];
  const compDate = plan.competitionDate
    ? new Date(plan.competitionDate + 'T12:00:00').toLocaleDateString('nl-BE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    : null;
  const totalPrepped = (plan.trainings || []).filter(t => (t.prepIds || []).length > 0).length;
  const totalTrainings = (plan.trainings || []).length;

  return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', color: 'white' }}>
      <style>{pageCSS}</style>

      {/* Header */}
      <header style={{ backgroundColor: '#1e293b', borderBottom: '1px solid #334155', padding: '12px 16px', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: '680px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <a href="/agenda" style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#64748b', textDecoration: 'none', fontSize: '13px', fontWeight: '600', flexShrink: 0 }}>
            <ArrowLeft size={15} /> Kalender
          </a>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Target size={16} color="#f97316" />
              <span style={{ fontWeight: '800', fontSize: '15px', color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {plan.competitionName || 'Trainingsschema'}
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>
              {plan.groupName && <span>{plan.groupName} · </span>}
              {totalPrepped}/{totalTrainings} voorbereid
            </div>
          </div>
          {isCoach && (
            <a href="/calendar-admin?tab=schemas" style={{ fontSize: '11px', color: '#64748b', textDecoration: 'none', flexShrink: 0, border: '1px solid #334155', borderRadius: '6px', padding: '4px 8px' }}>
              Beheer
            </a>
          )}
        </div>
      </header>

      <main style={{ maxWidth: '680px', margin: '0 auto', padding: '16px' }}>
        {/* Competition info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', backgroundColor: '#f9731611', border: '1px solid #f9731633', borderRadius: '12px', marginBottom: '20px' }}>
          <Target size={20} color="#f97316" style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#f1f5f9' }}>
              {plan.competitionName || 'Wedstrijd'}
            </div>
            {compDate && <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '1px' }}>{compDate}</div>}
            {plan.disciplines?.length > 0 && (
              <div style={{ fontSize: '11px', color: '#f9731688', marginTop: '2px' }}>
                {plan.disciplines.join(' · ')}
              </div>
            )}
          </div>
        </div>

        {/* AI summary */}
        {plan.summary && (
          <div style={{ backgroundColor: '#a78bfa11', border: '1px solid #a78bfa22', borderRadius: '10px', padding: '10px 14px', marginBottom: '20px', fontSize: '13px', color: '#a78bfa', fontStyle: 'italic', display: 'flex', gap: '8px' }}>
            <Sparkles size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            {plan.summary}
          </div>
        )}

        {/* Progress bar */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginBottom: '5px' }}>
            <span>Voorbereidingsvoortgang</span>
            <span style={{ color: totalPrepped === totalTrainings ? '#22c55e' : '#64748b' }}>{totalPrepped}/{totalTrainings}</span>
          </div>
          <div style={{ height: '4px', backgroundColor: '#1e293b', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${totalTrainings > 0 ? (totalPrepped / totalTrainings) * 100 : 0}%`, backgroundColor: totalPrepped === totalTrainings ? '#22c55e' : '#a78bfa', borderRadius: '2px', transition: 'width 0.3s' }} />
          </div>
        </div>

        {/* Trainings per week */}
        {weeks.map(weekLabel => {
          const weekTrainings = (plan.trainings || []).filter(t => t.weekLabel === weekLabel);
          return (
            <div key={weekLabel} style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <Calendar size={12} color="#64748b" />
                <span style={{ fontSize: '12px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  {weekLabel}
                </span>
                <span style={{ fontSize: '10px', color: '#334155' }}>· {weekTrainings.length} training{weekTrainings.length !== 1 ? 'en' : ''}</span>
              </div>
              {weekTrainings.map(t => (
                <TrainingCard
                  key={t.date}
                  training={t}
                  isCoach={isCoach}
                  clubId={clubId}
                  uid={uid}
                  planId={planId}
                  disciplines={plan.disciplines || []}
                  onUpdate={handleUpdate}
                />
              ))}
            </div>
          );
        })}
      </main>
    </div>
  );
}
