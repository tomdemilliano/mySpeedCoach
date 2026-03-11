// pages/api/ai-analysis.js
//
// Server-side proxy that routes requests through the Vercel AI Gateway.
// The gateway provides logging, caching, usage tracking, and handles
// Anthropic auth for you — no Anthropic API key needed.
//
// SETUP (pick one):
//
// Option A — AI Gateway API key (recommended):
//   1. Vercel Dashboard → your project → AI Gateway → API Keys → Create key
//   2. Add environment variable: AI_GATEWAY_API_KEY = <your key>
//
// Option B — OIDC (zero-config on Vercel, needs setup locally):
//   - On Vercel deployments this works automatically via VERCEL_OIDC_TOKEN.
//   - Locally: run `vercel env pull` to get a token (expires every 12h).
//
// The code below prefers AI_GATEWAY_API_KEY and falls back to VERCEL_OIDC_TOKEN.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Prefer explicit API key, fall back to auto-injected OIDC token
  const authToken = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!authToken) {
    return res.status(500).json({
      error: 'No AI Gateway credentials found. Set AI_GATEWAY_API_KEY in your Vercel environment variables.',
    });
  }

  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid prompt.' });
  }

  try {
    // Vercel AI Gateway exposes a drop-in Anthropic-compatible endpoint.
    // Model IDs use the "provider/model" format required by the gateway.
    const response = await fetch('https://ai-gateway.vercel.sh/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Gateway accepts the auth token as either x-api-key or Authorization Bearer
        'Authorization': `Bearer ${authToken}`,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4-5',  // gateway format: provider/model
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('AI Gateway error:', response.status, errorBody);
      return res.status(response.status).json({ error: `AI Gateway error: ${response.status}` });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    return res.status(200).json({ text });
  } catch (err) {
    console.error('AI analysis proxy error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
