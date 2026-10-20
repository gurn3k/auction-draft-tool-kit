import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMIT, MODELS, handle } from '../api/ask.js';

const ask = (body, { method = 'POST', headers = {} } = {}) => new Request('https://drafter.test/api/ask', {
  method,
  headers: { host: 'drafter.test', 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4', ...headers },
  body: method === 'POST' ? JSON.stringify(body) : undefined,
});
const model = (content, status = 200) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
  };
  return { calls, fetchImpl };
};
const opts = (m) => ({ fetchImpl: m.fetchImpl, key: 'test-key', store: new Map() });

test('returns only the request fields the app knows', async () => {
  const m = model('{"intent":"best","category":"blk","maxPrice":10,"players":[],"note":"ignore me"}');
  const res = await handle(ask({ question: 'Best blocker under $10?' }), opts(m));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).request, { intent: 'best', category: 'blk', maxPrice: 10, players: [] });
});

test('sends only the question, to the tested models, from providers that keep nothing', async () => {
  const m = model('{"intent":"off_topic","players":[]}');
  await handle(ask({ question: 'hello', draft: { secret: true } }), opts(m));
  const sent = m.calls[0];
  assert.equal(sent.model, MODELS[0].model);
  assert.deepEqual(sent.reasoning, MODELS[0].reasoning);
  assert.equal(sent.provider.data_collection, 'deny');
  assert.equal(sent.messages.at(-1).content, 'hello');
  assert.doesNotMatch(JSON.stringify(sent), /secret/);
});

test('refuses other methods, other sites, and missing or long questions', async () => {
  const m = model('{}');
  assert.equal((await handle(ask(null, { method: 'GET' }), opts(m))).status, 405);
  assert.equal((await handle(ask({ question: 'q' }, { headers: { origin: 'https://evil.test' } }), opts(m))).status, 403);
  assert.equal((await handle(ask({ question: '' }), opts(m))).status, 400);
  assert.equal((await handle(ask({ question: 'x'.repeat(301) }), opts(m))).status, 400);
  assert.equal(m.calls.length, 0);
});

test(`limits each visitor to ${LIMIT} questions an hour`, async () => {
  const m = model('{"intent":"off_topic","players":[]}');
  const o = opts(m);
  for (let i = 0; i < LIMIT; i++) assert.equal((await handle(ask({ question: 'q' }), o)).status, 200);
  const res = await handle(ask({ question: 'q' }), o);
  assert.equal(res.status, 429);
  assert.equal((await res.json()).error, 'limit');
  // Another visitor is unaffected.
  assert.equal((await handle(ask({ question: 'q' }, { headers: { 'x-forwarded-for': '5.6.7.8' } }), o)).status, 200);
});

test('rests when there is no key or the credit is used up', async () => {
  const none = await handle(ask({ question: 'q' }), { ...opts(model('{}')), key: '' });
  assert.equal((await none.json()).error, 'resting');
  const spent = await handle(ask({ question: 'q' }), opts(model('', 402)));
  assert.equal(spent.status, 503);
  assert.equal((await spent.json()).error, 'resting');
});

test('an unreadable model reply is an error, not an answer', async () => {
  const res = await handle(ask({ question: 'q' }), opts(model('sorry, no JSON here')));
  assert.equal(res.status, 502);
});

test('passes on every field the browser checks, including filters and unsupported conditions', async () => {
  const m = model('{"intent":"best","category":"ast","positions":["F"],"team":"BOS","players":[],"unsupported":["young"]}');
  const res = await handle(ask({ question: 'young forward passers on the Celtics' }), opts(m));
  const { request } = await res.json();
  assert.deepEqual(request.positions, ['F']);
  assert.equal(request.team, 'BOS');
  assert.deepEqual(request.unsupported, ['young']);
});

test('when the first model fails, the backup is asked with its own settings', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (body.model === MODELS[0].model) return new Response(JSON.stringify({ error: { message: 'rate-limited upstream' } }), { status: 429 });
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"intent":"off_topic","players":[]}' } }] }), { status: 200 });
  };
  const res = await handle(ask({ question: 'q' }), { fetchImpl, key: 'k', store: new Map() });
  assert.equal(res.status, 200);
  assert.deepEqual(calls.map((c) => c.model), MODELS.map((m) => m.model));
  assert.deepEqual(calls[1].reasoning, MODELS[1].reasoning);
});

test('when every model fails, the box gets an error, not an answer', async () => {
  const fetchImpl = async () => new Response('{}', { status: 500 });
  const res = await handle(ask({ question: 'q' }), { fetchImpl, key: 'k', store: new Map() });
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error, 'unavailable');
});
