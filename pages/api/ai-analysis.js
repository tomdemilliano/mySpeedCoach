import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Geen prompt meegegeven.' });

  // Lees de skill-file in (eenmalig per request, ~2KB)
  const skillPath = path.join(process.cwd(), 'skills', 'rope-skipping-analysis.skill.md');
  const systemPrompt = fs.existsSync(skillPath)
    ? fs.readFileSync(skillPath, 'utf-8')
    : 'Je bent een professionele rope skipping coach.';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':         'application/json',
      'x-api-key':            process.env.ANTHROPIC_API_KEY,
      'anthropic-version':    '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5',
      max_tokens: 1024,
      system:     systemPrompt,   // ← skill-file als system prompt
      messages:   [{ role: 'user', content: prompt }],
    }),
  });

  const data = await response.json();
  const text = data?.content?.[0]?.text || '';
  if (!text) return res.status(500).json({ error: 'Geen antwoord van AI.' });
  res.status(200).json({ text });
}
