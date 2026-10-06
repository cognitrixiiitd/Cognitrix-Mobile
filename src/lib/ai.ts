// Port of cognitrix/src/utils/aiClient.js — same Gemini model and key as the website.
const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent';

function normaliseGeminiError(status: number, apiError?: { message?: string; status?: string }) {
  if (status === 429 || apiError?.status === 'RESOURCE_EXHAUSTED') {
    return new Error('The AI tutor is over its usage quota right now. Please try again later.');
  }
  if (status === 401 || status === 403) {
    return new Error('The AI tutor rejected the request. Check the API key configuration.');
  }
  return new Error(apiError?.message || `HTTP ${status}`);
}

export async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.EXPO_PUBLIC_AI_API_KEY;
  if (!apiKey) throw new Error('Missing AI key. Set EXPO_PUBLIC_AI_API_KEY in .env.local.');

  const response = await fetch(GEMINI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1500 },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw normaliseGeminiError(response.status, err?.error);
  }

  const result = await response.json();
  const raw: string = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!raw.trim()) throw new Error('The AI tutor returned an empty response.');
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}
