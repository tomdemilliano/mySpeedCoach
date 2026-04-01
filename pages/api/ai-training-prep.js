/**
 * pages/api/ai-training-prep.js
 *
 * Server-side proxy voor AI-gegenereerde trainingsvoorbereiding.
 * Gebruikt hetzelfde patroon als ai-analysis.js.
 *
 * POST body:
 * {
 *   ageGroup:             'u12' | 'u16' | 'senior' | 'mixed',
 *   level:                'beginner' | 'intermediate' | 'advanced',
 *   totalMin:             number,
 *   focus:                string[],
 *   weeksToCompetition:   number | null,
 *   groupNotes:           string,
 *   availableDisciplines: string[],
 * }
 *
 * Response: { blocks: TrainingBlock[], aiPromptSummary: string }
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    ageGroup            = 'mixed',
    level               = 'intermediate',
    totalMin            = 90,
    focus               = [],
    weeksToCompetition  = null,
    groupNotes          = '',
    availableDisciplines = [],
  } = req.body || {};

  // ── Bouw de prompt ────────────────────────────────────────────────────────
  const AGE_LABELS = { u12: 'jonger dan 12 jaar', u16: '12-16 jaar', senior: '16+ jaar', mixed: 'gemengde leeftijden' };
  const LEVEL_LABELS = { recreatief: 'recreatief (fun & skills, geen wedstrijdfocus)', beginner: 'beginnend', intermediate: 'gevorderd', advanced: 'wedstrijdniveau' };
  const FOCUS_LABELS = { speed: 'snelheid', endurance: 'uithoudingsvermogen', freestyle: 'freestyle', technique: 'techniek', fun: 'plezier en spel', skills: 'nieuwe skills leren' };

  const isRecreatief = level === 'recreatief';
  const ageLabel   = AGE_LABELS[ageGroup]   || ageGroup;
  const levelLabel = LEVEL_LABELS[level]    || level;
  const focusLabel = focus.map(f => FOCUS_LABELS[f] || f).join(', ') || (isRecreatief ? 'plezier, spel en nieuwe skills' : 'algemeen');
  const discLabel  = availableDisciplines.length > 0
    ? availableDisciplines.join(', ')
    : 'Speed Sprint, Endurance';
  const compLine   = isRecreatief
    ? 'Dit is een recreatieve groep zonder wedstrijdfocus.'
    : weeksToCompetition
      ? `Er is een wedstrijd over ${weeksToCompetition} week(en). Pas de intensiteit en focus hierop aan.`
      : 'Er is momenteel geen wedstrijd gepland.';
  const notesLine  = groupNotes ? `Extra info over de groep: ${groupNotes}` : '';

  const recreatiefExtra = isRecreatief ? `
RECREATIEVE GROEP: Focus op plezier, motivatie en een positieve beleving.
- Gebruik spelvormen, uitdagingen en variatie
- Vermijd lange herhalingen van dezelfde oefening
- Bouw nieuwe skills op een speelse manier in
- Intensiteit blijft laag tot medium — niemand mag het gevoel krijgen dat het te zwaar is
- Gebruik motiverende namen voor de blokken (bijv. "Raketstart spel", "Touwen-estafette")` : '';

  const prompt = `Je bent een ervaren touwspringen-coach en schrijft een gedetailleerde trainingsvoorbereiding.

Groep: ${ageLabel}, ${levelLabel} niveau
Trainingsduur: ${totalMin} minuten
Focuspunten: ${focusLabel}
Beschikbare disciplines: ${discLabel}
${compLine}
${notesLine}
${recreatiefExtra}

Maak een trainingsschema met warming-up, hoofdblok en cooling-down blokken.
Verdeel de ${totalMin} minuten logisch over de fases (warmup ~15%, main ~70%, cooldown ~15%).

BELANGRIJK: Antwoord ALLEEN met geldig JSON, geen tekst erbuiten, geen markdown-backticks.

Formaat:
{
  "blocks": [
    {
      "id": "unieke-string-1",
      "phase": "warmup",
      "title": "Opwarming",
      "durationMin": 10,
      "description": "Gedetailleerde beschrijving van de oefening of activiteit.",
      "discipline": null,
      "intensity": "low"
    }
  ],
  "aiPromptSummary": "Korte samenvatting van de trainingsfocus (1 zin)"
}

Regels:
- phase moet "warmup", "main" of "cooldown" zijn
- intensity moet "low", "medium" of "high" zijn
- discipline is null OF een van: ${discLabel}
- durationMin zijn gehele getallen, totaal = ${totalMin}
- id is een unieke string per blok (bijv. "blok-1", "blok-2", ...)
- 4-8 blokken totaal
- Schrijf beschrijvingen in het Nederlands
- Wees specifiek: aantal herhalingen, rust, afstanden, oefeningen`;

  // ── Roep de Anthropic API aan ─────────────────────────────────────────────
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY niet geconfigureerd.' });
  }

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
        max_tokens: 2000,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[ai-training-prep] Anthropic error:', errText);
      return res.status(502).json({ error: 'AI-service tijdelijk onbeschikbaar.' });
    }

    const data    = await response.json();
    const rawText = data?.content?.[0]?.text || '';

    // Strip eventuele markdown-backticks
    const clean = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      console.error('[ai-training-prep] JSON parse failed:', rawText.slice(0, 300));
      return res.status(502).json({ error: 'AI gaf ongeldig formaat terug. Probeer opnieuw.' });
    }

    // Valideer de structuur
    if (!Array.isArray(parsed.blocks) || parsed.blocks.length === 0) {
      return res.status(502).json({ error: 'AI gaf geen bruikbare blokken terug.' });
    }

    // Zorg dat elke block een unieke id heeft
    parsed.blocks = parsed.blocks.map((b, i) => ({
      ...b,
      id: b.id || `blok-${i + 1}`,
    }));

    return res.status(200).json({
      blocks:         parsed.blocks,
      aiPromptSummary: parsed.aiPromptSummary || `${focusLabel} training voor ${ageLabel}`,
    });

  } catch (err) {
    console.error('[ai-training-prep] fetch error:', err);
    return res.status(500).json({ error: 'Interne fout.' });
  }
}
