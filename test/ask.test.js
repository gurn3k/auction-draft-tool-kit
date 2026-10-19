import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { YAHOO_DEFAULTS } from '../site/lib/valuation.js';
import { checkRequest, parseJson, parseMessages, runRequest } from '../site/lib/ask.js';
import { allCases, derive, simulate } from '../scripts/ask-cases.js';

const data = JSON.parse(readFileSync(new URL('../site/data/players.json', import.meta.url), 'utf8'));
const draft = simulate(data.players, YAHOO_DEFAULTS, { count: 60, mine: 5, seed: 2 });
const { board, available } = derive(data.players, YAHOO_DEFAULTS, draft);
const sold = draft.picks[0];
const req = (r) => ({ category: null, affordable: false, players: [], ...r });

test('with a perfect reading of each question, code answers every test case correctly', () => {
  const cases = allCases(data.players);
  assert.ok(cases.length >= 40);
  for (const c of cases) assert.ok(c.check(runRequest(c.gold, c.board)), c.id);
});

test('the model may not add a number the question does not contain', () => {
  const ok = checkRequest({ intent: 'best', category: 'blk', maxPrice: 10, players: [] }, 'best blocker for $10?');
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.request.maxPrice, 10);
  const bad = checkRequest({ intent: 'best', category: 'blk', maxPrice: 12, players: [] }, 'best blocker for $10?');
  assert.match(bad.problems.join(), /maxPrice 12 isn't in the question/);
});

test('unknown intents and categories, and bad JSON, are refused', () => {
  assert.match(checkRequest({ intent: 'trade', players: [] }, 'q').problems.join(), /Unknown intent/);
  assert.match(checkRequest({ intent: 'best', category: 'dunks', players: [] }, 'q').problems.join(), /Unknown category/);
  assert.match(checkRequest(parseJson('not json'), 'q').problems.join(), /not valid JSON/);
  assert.deepEqual(parseJson('```json\n{"intent":"off_topic"}\n```'), { intent: 'off_topic' });
  assert.ok(parseMessages('x'.repeat(1000))[1].content.length <= 300);
});

test('a price limit is applied by code, never by the model', () => {
  const r = runRequest(req({ intent: 'best', category: 'ast', maxPrice: 5 }), board);
  const priced = new Map(available.map((p) => [p.name, p.live]));
  assert.ok(r.players.length > 0);
  for (const name of r.players) assert.ok(priced.get(name) <= 5, name);
});

test('a sold player is reported as sold, not recommended', () => {
  const r = runRequest(req({ intent: 'verdict', price: 5, players: [sold.name] }), board);
  assert.match(r.answer, /already sold/);
  assert.equal(r.verdict, null);
  const unknown = runRequest(req({ intent: 'player', players: ['Made Up Guy'] }), board);
  assert.match(unknown.answer, /couldn't find/);
});

test('the bid verdict follows Bid to exactly', () => {
  const p = available[5];
  assert.equal(runRequest(req({ intent: 'verdict', price: p.bidTo, players: [p.name] }), board).verdict, 'bid');
  assert.equal(runRequest(req({ intent: 'verdict', price: p.bidTo + 1, players: [p.name] }), board).verdict, 'pass');
});

test('targets fit the money, keeping $1 for every other open spot', () => {
  const r = runRequest(req({ intent: 'targets', money: 30, spots: 5, count: 3 }), board);
  const priced = new Map(available.map((p) => [p.name, p.live]));
  const total = r.players.reduce((a, n) => a + priced.get(n), 0);
  assert.equal(r.players.length, 3);
  assert.ok(total <= 30 - 2);
});

test('declines carry no players', () => {
  for (const intent of ['off_topic', 'cannot_answer']) {
    const r = runRequest(req({ intent, players: [available[0].name] }), board);
    assert.equal(r.status, intent);
    assert.deepEqual(r.players, []);
  }
});
