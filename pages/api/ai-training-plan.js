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
    competitionDate   = '',
    competitionName   = '',
    disciplines       = [],
    trainingsPerWeek  = 2,
    trainingDates     = [],
    extraNotes        = '',
  } = req.body || {};

  if (!competitionDate || trainingDates.length === 0) {
    return res.status(400).json({ error: 'competitionDate en trainingDates zijn verplicht.' });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY niet geconfigureerd.' });

  // Bereken hoeveel weken er zijn
  const compMs    = new Date(competitionDate).getTime();
  const firstMs   = new Date(trainingDates[0]).getTime();
  const totalDays = Math.ceil((compMs - firstMs) / (1000 * 60 * 60 * 24));
  const totalWeeks = Math.ceil(totalDays / 7);

  const AGE_LABELS   = { u12: 'U12 (< 12j)', u16: 'U16 (12-16j)', senior: 'Senior (16+)', mixed: 'Gemengd' };
  const LEVEL_LABELS = { recreatief: 'recreatief', beginner: 'beginner', intermediate: 'gevorderd', advanced: 'wedstrijdniveau' };

  const discStr   = disciplines.join(', ') || 'Speed Sprint, Endurance';
  const datesStr  = trainingDates.map((d, i) => `${i + 1}. ${d}`).join('\n');
  const notesLine = extraNotes ? `Extra info: ${extraNotes}` : '';

  const prompt = `Je bent een ervaren touwspringen-coach. Maak een trainingsplan richting een wedstrijd.

GROEP:
- Naam: ${groupName || 'Onbekend'}
- Leeftijd: ${AGE_LABELS[ageGroup] || ageGroup}
- Niveau: ${LEVEL_LABELS[level] || level}
- Disciplines: ${discStr}

WEDSTRIJD: "${competitionName || 'Wedstrijd'}" op ${competitionDate}
Totaal beschikbaar: ${totalWeeks} week(en), ${trainingDates.length} trainingen

TRAININGSDATUMS (in volgorde):
${datesStr}

${notesLine}

PERIODISERING:
- Week 1-2 (als ${totalWeeks} >= 6): Techniek & basis opbouwen, lage intensiteit
- Week 3-4: Snelheidsontwikkeling & specifieke discipline-oefeningen, medium intensiteit  
- Week 5+: Race-specifieke prep & tapering richting wedstrijd, hoge intensiteit met rust
- Laatste 1-2 trainingen voor wedstrijd: licht, vertrouwen opbouwen

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
      "goals": ["Correcte sprongtechniek bij Speed Sprint", "Uithoudingsvermogen opbouwen"],
      "focus": ["technique", "endurance"],
      "intensity": "low",
      "notes": "Rustig starten, veel technische feedback geven. Vermijd te snelle progressie."
    }
  ]
}

Regels:
- Exact één entry per datum uit de lijst hierboven
- date = exacte datum uit de lijst (YYYY-MM-DD)
- weekNumber = week 1, 2, 3...
- weekLabel = korte label voor die week (bijv. "Week 2 — Snelheid")
- theme = kernthema van de training (max 5 woorden)
- goals = 2-3 concrete, meetbare doelen
- focus = array van: "speed", "endurance", "technique", "freestyle", "fun", "skills", "competition_prep"
- intensity = "low", "medium" of "high"
- notes = praktische coaching-tip voor deze training (1-2 zinnen)
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
