// POST /api/ask (ADR 0008). Has a language model turn one question into a
// structured request, and returns that request. Nothing more: the browser checks
// it and answers it from its own board, so only the question leaves the browser.
// The OpenRouter key lives in the OPENROUTER_API_KEY environment variable.

import { MAX_QUESTION, parseJson, parseMessages } from '../site/lib/ask.js';

// Chosen by the tests in ADR 0008: the cheapest model that passed, then a backup
// tried as its own request, with its own settings. Each runs on many providers,
// so one provider's rate limit doesn't take the feature down. (Gemini 2.5
// Flash-Lite, the first backup, had one provider and was rate-limited upstream.)
export const MODELS = [
  { model: 'deepseek/deepseek-v4.1-flash', reasoning: { enabled: false }, timeout: 5000 },
  // gpt-oss can't turn reasoning off; minimal keeps it quick.
  { model: 'openai/gpt-oss-20b', reasoning: { effort: 'minimal', exclude: true }, timeout: 6000 },
];
export const LIMIT = 30; // questions per visitor per hour
const HOUR = 60 * 60 * 1000;
const FIELDS = ['intent', 'category', 'maxPrice', 'price', 'money', 'spots', 'count', 'affordable', 'positions', 'team', 'players', 'unsupported'];

// Per-visitor limit, kept in memory. Instances are reused, so it holds for a
// burst from one visitor, but it isn't exact across instances: the hard cap on
// spend is the key's credit limit at OpenRouter. Addresses are never logged.
const recent = new Map();
export function rateLimited(ip, now = Date.now(), store = recent) {
  const times = (store.get(ip) ?? []).filter((t) => now - t < HOUR);
  if (times.length >= LIMIT) return true;
  times.push(now);
  store.set(ip, times);
  if (store.size > 10_000) store.clear();
  return false;
}

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export async function handle(request, { fetchImpl = fetch, key = process.env.OPENROUTER_API_KEY, now = Date.now(), store = recent } = {}) {
  if (request.method !== 'POST') return json(405, { error: 'method' });
  // Only the app's own pages may call this from a browser.
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== request.headers.get('host')) return json(403, { error: 'origin' });
  if (!key) return json(503, { error: 'resting' });

  let question = '';
  try {
    const body = await request.json();
    question = typeof body?.question === 'string' ? body.question.trim() : '';
  } catch {
    return json(400, { error: 'question' });
  }
  if (!question || question.length > MAX_QUESTION) return json(400, { error: 'question' });

  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip, now, store)) return json(429, { error: 'limit' });

  let failure = 'unavailable';
  for (const { model, reasoning, timeout } of MODELS) {
    let res;
    try {
      res = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Cap Drafter' },
        body: JSON.stringify({
          model,
          messages: parseMessages(question),
          temperature: 0,
          max_tokens: 300,
          response_format: { type: 'json_object' },
          reasoning,
          // The cheapest provider that doesn't store or train on what it's sent.
          provider: { sort: 'price', data_collection: 'deny' },
        }),
        signal: AbortSignal.timeout(timeout),
      });
    } catch {
      failure = 'slow';
      continue;
    }
    // 402: the key's credit is used up, which is the spending cap working.
    if (res.status === 402) return json(503, { error: 'resting' });
    if (!res.ok) {
      failure = 'unavailable';
      continue;
    }
    const data = await res.json().catch(() => null);
    const raw = parseJson(data?.choices?.[0]?.message?.content ?? '');
    if (!raw) {
      failure = 'unreadable';
      continue;
    }
    return json(200, { request: Object.fromEntries(FIELDS.filter((f) => f in raw).map((f) => [f, raw[f]])) });
  }
  return json(failure === 'slow' ? 504 : 502, { error: failure });
}

export function POST(request) {
  return handle(request);
}
