/**
 * pages/api/ai-training-plan.js
 *
 * Genereert een trainingsschema richting een wedstrijd.
 * Per training: thema, doelen, focuspunten, intensiteit.
 *
 * POST body:
 * {
 *   groupName:         string,
 *   level:             string,
 *   ageGroup:          string,
 *   competitionDate:   string,        // YYYY-MM-DD
 *   competitionName:   string,
 *   disciplines:       string[],
 *   trainingsPerWeek:  number,
 *   trainingDates:     string[],      // YYYY-MM-DD array (echte trainingsdatums)
 *   extraNotes:        string,
 * }
 *
 * Response: { weeks: PlanWeek[], summary: string }
 *
 * PlanWeek: { weekNumber, startDate, label, trainings: PlanTraining[] }
 * PlanTraining: {
 *   date, theme, goals: string[], focus: string[],
 *   intensity: 'low'|'medium'|'high', notes: string
 * }
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });


  const {
    groupName         = '',
    level             = 'intermediate',
    ageGroup          = 'mixed',
    targetDate        = '',       // wedstrijddatum OF zelfgekozen einddatum
    targetName        = '',       // wedstrijdnaam OF zelfgekozen titel
    disciplines       = [],
    trainingsPerWeek  = 2,
    trainingDates     = [],
    extraNotes        = '',
    isIndividual      = false,
    skipperName       = '',
    injuryNotes       = '',
    hasTarget         = true,     // false = geen wedstrijd/einddatum
    manualDurMin = null,
    } = req.body || {};
  
  if (trainingDates.length === 0) {
    return res.status(400).json({ error: 'trainingDates zijn verplicht.' });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY niet geconfigureerd.' });

  // Bereken hoeveel weken er zijn
  const firstMs   = new Date(trainingDates[0]).getTime();
  const totalWeeks = targetDate
    ? Math.ceil((new Date(targetDate).getTime() - firstMs) / (1000 * 60 * 60 * 24 * 7))
    : Math.ceil(trainingDates.length / (trainingsPerWeek || 2));

  const AGE_LABELS   = { u12: 'U12 (< 12j)', u16: 'U16 (12-16j)', senior: 'Senior (16+)', mixed: 'Gemengd' };
  const LEVEL_LABELS = { recreatief: 'recreatief', beginner: 'beginner', intermediate: 'gevorderd', advanced: 'wedstrijdniveau' };

  const discStr      = disciplines.join(', ') || 'Speed Sprint, Endurance';
  const datesStr     = trainingDates.map((d, i) => `${i + 1}. ${d}`).join('\n');
  const notesLine    = extraNotes ? `Extra info: ${extraNotes}` : '';
  const targetLine   = hasTarget && targetDate
    ? `DOEL: "${targetName || 'Wedstrijd'}" op ${targetDate}`
    : `DOEL: Trainingsfocus zonder vaste eindwedstrijd (${trainingDates.length} trainingen)`;
  const skipperLine  = isIndividual && skipperName
    ? `INDIVIDUEEL SCHEMA voor skipper: ${skipperName}`
    : `GROEP: ${groupName || 'Onbekend'}`;
  const injuryLine   = injuryNotes
    ? `BLESSURE/AANDACHTSPUNTEN: ${injuryNotes} — houd hier rekening mee in intensiteit en oefenkeuze.`
    : '';
  const durLine = manualDurMin ? `Trainingsduur: ${manualDurMin} minuten per training` : '';
  
  const prompt = `Je bent een ervaren touwspringen-coach. Maak een trainingsplan.
  
  ${skipperLine}
  - Leeftijd: ${AGE_LABELS[ageGroup] || ageGroup}
  - Niveau: ${LEVEL_LABELS[level] || level}
  - Disciplines op het programma: ${discStr}
  
  ${targetLine}
  Totaal beschikbaar: ${totalWeeks} week(en), ${trainingDates.length} trainingen
  Beschikbare disciplines: ${discStr}
  ${durLine}
  
  TRAININGSDATUMS (in volgorde):
  ${datesStr}
  
  ${notesLine}
  ${injuryLine}
  
  PERIODISERING:
  - Eerste weken: Techniek & basis opbouwen, lage intensiteit
  - Middenfase: Discipline-specifieke training (${discStr}), medium intensiteit
  - Laatste fase: ${hasTarget ? 'Race-specifieke prep & tapering, hoge intensiteit met rust' : 'Consolidatie en verfijning'}
  - ${hasTarget ? 'Laatste 1-2 trainingen: licht, vertrouwen opbouwen' : 'Eindigen met hoogtepunt/evaluatie'}
  ${injuryNotes ? `- Blessurepreventie: vermijd belasting op de genoemde zone, bouw voorzichtig op` : ''}
  
  BELANGRIJK: Antwoord ALLEEN met geldig JSON, geen tekst erbuiten, geen markdown-backticks.
  
  Formaat (één entry PER trainingsdatum):
  {
  "summary": "Beknopte beschrijving van het plan (2-3 zinnen)",
  "trainings": [
  {
  "date": "YYYY-MM-DD",
  "weekNumber": 1,
  "weekLabel": "Week 1 — Opbouw",
  "theme": "Techniek & basisconditie",
  "goals": ["Correcte sprongtechniek bij ${discStr.split(',')[0]?.trim() || 'Speed Sprint'}", "Uithoudingsvermogen opbouwen"],
  "focus": ["technique", "endurance"],
  "intensity": "low",
  "notes": "Rustig starten, veel technische feedback geven."
  }
  ]
  }
  
  Regels:
  - Exact één entry per datum uit de lijst
  - theme = kernthema van de training (max 5 woorden)
  - goals = 2-3 concrete doelen, gericht op de disciplines: ${discStr}
  - focus = array van: "speed", "endurance", "technique", "freestyle", "fun", "skills", "competition_prep"
  - intensity = "low", "medium" of "high"
  - notes = praktische coaching-tip (1-2 zinnen)${injuryNotes ? ', rekening houdend met blessure' : ''}
  - Schrijf alles in het Nederlands behalve de focus-waarden`;
  
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[ai-training-plan] Anthropic error:', errText);
      return res.status(502).json({ error: 'AI-service tijdelijk onbeschikbaar.' });
    }

    const data    = await response.json();
    const rawText = data?.content?.[0]?.text || '';
    const clean   = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      console.error('[ai-training-plan] JSON parse failed:', rawText.slice(0, 500));
      return res.status(502).json({ error: 'AI gaf ongeldig formaat terug. Probeer opnieuw.' });
    }

    if (!Array.isArray(parsed.trainings) || parsed.trainings.length === 0) {
      return res.status(502).json({ error: 'AI gaf geen bruikbare trainingen terug.' });
    }

    return res.status(200).json({
      summary:   parsed.summary || '',
      trainings: parsed.trainings,
    });

  } catch (err) {
    console.error('[ai-training-plan] error:', err);
    return res.status(500).json({ error: 'Interne fout.' });
  }
}
