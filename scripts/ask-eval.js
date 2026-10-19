// Runs the "Ask the board" test set (ADR 0008) against one or more models on
// OpenRouter and reports accuracy, speed and cost, so the model is chosen on
// measured results. Needs OPENROUTER_API_KEY in .env.local.
//
//   npm run eval:ask -- --dry                         cases and prompt size, no calls
//   (design 2: the model turns each question into a request; code answers it)
//   npm run eval:ask -- openai/gpt-oss-20b deepseek/deepseek-v4.1-flash

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { allCases } from './ask-cases.js';
import { checkRequest, parseJson, parseMessages, runRequest } from '../site/lib/ask.js';

export const DEFAULT_MODELS = [
  'openai/gpt-oss-20b',
  'deepseek/deepseek-v4.1-flash',
  'openai/gpt-5-nano',
  'google/gemini-2.5-flash-lite',
];

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const models = args.filter((a) => !a.startsWith('--'));
const data = JSON.parse(readFileSync(new URL('../site/data/players.json', import.meta.url), 'utf8'));
const cases = allCases(data.players);

if (dry) {
  for (const c of cases) console.log(`${c.id.padEnd(20)} ${c.question}\n${' '.repeat(21)}expects ${c.note}`);
  const chars = parseMessages(cases[0].question).reduce((a, m) => a + m.content.length, 0);
  console.log(`\n${cases.length} cases. Prompt is about ${Math.round(chars / 3.5)} tokens.`);
  process.exit(0);
}

const key = process.env.OPENROUTER_API_KEY;
if (!key) {
  console.error('Set OPENROUTER_API_KEY in .env.local');
  process.exit(1);
}

async function ask(model, c, reasoning = { enabled: false }) {
  const started = performance.now();
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Cap Drafter eval' },
    body: JSON.stringify({
      model,
      messages: parseMessages(c.question),
      temperature: 0,
      max_tokens: 300,
      response_format: { type: 'json_object' },
      // Thinking adds hidden output and time, and can use up the whole reply
      // allowance. Off where the model allows it, otherwise as low as it goes.
      reasoning,
      // The cheapest provider for the model, not OpenRouter's default routing.
      provider: { sort: 'price' },
      usage: { include: true },
    }),
  });
  const ms = performance.now() - started;
  const body = await res.json().catch(() => ({}));
  if (!res.ok && reasoning.enabled === false) return ask(model, c, { effort: 'minimal', exclude: true });
  if (!res.ok) return { ms, error: body.error?.message ?? `HTTP ${res.status}` };
  return { ms, raw: body.choices?.[0]?.message?.content ?? '', cost: body.usage?.cost ?? 0, tokensIn: body.usage?.prompt_tokens, tokensOut: body.usage?.completion_tokens, provider: body.provider };
}

const pctl = (xs, q) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))] : NaN);
const rows = [];
const out = new URL('../.scratch/ask-eval/design-2/', import.meta.url);
mkdirSync(out, { recursive: true });

for (const model of models.length ? models : DEFAULT_MODELS) {
  const results = [];
  for (const c of cases) {
    const r = await ask(model, c);
    // Design 2: the model only reads the question; code checks and answers it.
    const { request, problems } = r.error ? { request: null, problems: [r.error] } : checkRequest(parseJson(r.raw), c.question);
    const shown = problems.length === 0;
    const reply = shown ? runRequest(request, c.board) : null;
    const correct = shown && c.check(reply);
    results.push({ id: c.id, question: c.question, expects: c.note, gold: c.gold, provider: r.provider, ms: Math.round(r.ms), cost: r.cost ?? 0, tokensIn: r.tokensIn, tokensOut: r.tokensOut, shown, correct, problems, request: request ?? r.raw ?? null, answer: reply?.answer });
    process.stdout.write(correct ? '.' : shown ? 'x' : 'r');
  }
  const n = results.length;
  const ms = results.map((r) => r.ms);
  const row = {
    model,
    correct: results.filter((r) => r.correct).length / n,
    wrongShown: results.filter((r) => r.shown && !r.correct).length / n,
    refused: results.filter((r) => !r.shown).length / n,
    medianMs: pctl(ms, 0.5),
    p90Ms: pctl(ms, 0.9),
    costPerQ: results.reduce((a, r) => a + r.cost, 0) / n,
  };
  rows.push(row);
  writeFileSync(new URL(`${model.replace(/[^a-z0-9.-]+/gi, '_')}.json`, out), JSON.stringify(results, null, 2));
  console.log(` ${model}`);
}

const p = (x) => `${Math.round(x * 100)}%`;
console.log('\n| Model | Correct | Wrong but shown | Refused | Median | p90 | Cost / question |');
console.log('|---|---|---|---|---|---|---|');
for (const r of rows) {
  console.log(`| ${r.model} | ${p(r.correct)} | ${p(r.wrongShown)} | ${p(r.refused)} | ${(r.medianMs / 1000).toFixed(1)} s | ${(r.p90Ms / 1000).toFixed(1)} s | $${r.costPerQ.toFixed(5)} |`);
}
console.log(`\n${cases.length} cases per model. Details in .scratch/ask-eval/design-2/.`);
