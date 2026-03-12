// pages/api/ai-analysis.js

export default async function handler(req, res) {
  // Log everything so we can see what's arriving
  console.log('METHOD:', req.method);
  console.log('HEADERS:', JSON.stringify(req.headers));
  console.log('BODY TYPE:', typeof req.body);
  console.log('BODY:', JSON.stringify(req.body));

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in environment variables.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON in request body.' });
    }
  }

  const prompt = body?.prompt;
  console.log('PROMPT:', prompt);

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: `Missing or invalid prompt. Body was: ${JSON.stringify(body)}` });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Anthropic API error:', response.status, errorBody);
      return res.status(response.status).json({ error: `Anthropic API error: ${response.status}` });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    return res.status(200).json({ text });

  } catch (err) {
    console.error('AI analysis proxy error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};
