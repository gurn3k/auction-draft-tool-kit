import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { YAHOO_DEFAULTS } from '../site/lib/valuation.js';
import { messages, parseReply, verifyReply } from '../site/lib/ask.js';
import { allCases, derive, simulate } from '../scripts/ask-cases.js';

const data = JSON.parse(readFileSync(new URL('../site/data/players.json', import.meta.url), 'utf8'));
const draft = simulate(data.players, YAHOO_DEFAULTS, { count: 60, mine: 5, seed: 2 });
const board = derive(data.players, YAHOO_DEFAULTS, draft);
const snap = board.snapshot;
const best = board.available[0];
const sold = draft.picks[0];
const ok = (extra = {}) => ({ status: 'ok', answer: `Bid up to $${best.bidTo} on ${best.name}.`, players: [best.name], teams: [], verdict: null, ...extra });

test('the snapshot lists available players only, with Live and Bid to', () => {
  const available = snap.text.split('AVAILABLE')[1].split('SOLD:')[0];
  assert.ok(available.includes(`${best.name}, ${best.team}, ${best.pos}, $${best.live}, $${best.bidTo}`));
  assert.ok(!available.includes(`\n${sold.name},`));
  assert.ok(snap.allowedDollars.has(board.me.maxBid));
  assert.ok(messages(snap, 'x'.repeat(1000))[1].content.length <= 300);
});

test('an answer built from the board passes', () => {
  assert.deepEqual(verifyReply(ok(), snap, 'Who should I bid on?'), []);
});

test('an invented or sold player is rejected', () => {
  assert.match(verifyReply(ok({ players: ['Made Up Guy'] }), snap, 'q').join(), /not an available player/);
  assert.match(verifyReply(ok({ players: [sold.name] }), snap, 'q').join(), /not an available player/);
  assert.match(verifyReply(ok({ answer: `Go for ${sold.name}.`, players: [] }), snap, 'q').join(), /already sold/);
  // ...unless the question asked about him.
  assert.deepEqual(verifyReply(ok({ answer: `${sold.name} is gone. Try ${best.name}.` }), snap, `Is ${sold.name} still there?`), []);
});

test('a price or stat that is not on the board is rejected', () => {
  assert.match(verifyReply(ok({ answer: `Pay $9999 for ${best.name}.` }), snap, 'q').join(), /\$9999 is not on the board/);
  assert.match(verifyReply(ok({ answer: `${best.name} blocks 17.3 shots a game.` }), snap, 'q').join(), /17.3 is not a stat/);
  // Numbers from the question can be repeated back.
  assert.deepEqual(verifyReply(ok({ answer: `With $9999 left, take ${best.name}.` }), snap, 'I have $9999 left'), []);
});

test('replies that are not answers carry no players, and bad JSON fails', () => {
  assert.match(verifyReply(ok({ status: 'off_topic' }), snap, 'q').join(), /not an answer/);
  assert.deepEqual(verifyReply(ok({ status: 'off_topic', players: [], answer: 'I can only help with this draft.' }), snap, 'q'), []);
  assert.equal(parseReply('not json'), null);
  assert.deepEqual(parseReply('```json\n{"status":"ok"}\n```'), { status: 'ok' });
  assert.match(verifyReply(null, snap, 'q').join(), /not valid JSON/);
  assert.match(verifyReply(ok({ teams: ['Team 99'] }), snap, 'q').join(), /not a team/);
});

test('every test case has a question, a check and a board', () => {
  const cases = allCases(data.players);
  assert.ok(cases.length >= 30);
  for (const c of cases) assert.ok(c.question && typeof c.check === 'function' && c.snapshot.text);
});
