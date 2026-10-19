import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATEGORIES, YAHOO_DEFAULTS, allocate, livePrices, valuePlayers } from '../site/lib/valuation.js';

const data = JSON.parse(readFileSync(new URL('../site/data/players.json', import.meta.url), 'utf8'));

// A made-up player: average at everything unless overridden.
const make = (id, o = {}) => ({
  id, name: id, gp: 70, fgm: 5, fga: 10, ftm: 2, fta: 2.5, tpm: 1.5, pts: 13.5, reb: 5, ast: 3, stl: 1, blk: 0.5, tov: 1.5, ...o,
});
const small = { teams: 2, budget: 100, rosterSize: 2, minGames: 20 };

test('values add up to the whole league budget', () => {
  for (const league of [YAHOO_DEFAULTS, { ...YAHOO_DEFAULTS, teams: 10, budget: 300, rosterSize: 15 }]) {
    const v = valuePlayers(data.players, league);
    const total = v.reduce((a, p) => a + p.value, 0);
    assert.ok(Math.abs(total - league.teams * league.budget) < 1e-6, `total ${total}`);
    assert.equal(v.filter((p) => p.value > 0).length, league.teams * league.rosterSize);
  }
});

test('every rostered player is worth at least $1, and values fall with rank', () => {
  const v = valuePlayers(data.players, YAHOO_DEFAULTS);
  const rostered = v.slice(0, 156);
  assert.ok(rostered.every((p) => p.value >= 1));
  for (let i = 1; i < rostered.length; i++) assert.ok(rostered[i].value <= rostered[i - 1].value);
});

test('values scale with the budget the commissioner sets', () => {
  const at200 = valuePlayers(data.players, YAHOO_DEFAULTS);
  const at400 = valuePlayers(data.players, { ...YAHOO_DEFAULTS, budget: 400 });
  assert.equal(at200[0].id, at400[0].id);
  assert.ok(at400[0].value > 1.9 * at200[0].value);
});

test('players under the games minimum are left out', () => {
  const v = valuePlayers([make('a'), make('b', { gp: 5 })], small);
  assert.deepEqual(v.map((p) => p.id), ['a']);
});

test('turnovers count against a player', () => {
  const v = valuePlayers([make('careful', { tov: 0.5 }), make('sloppy', { tov: 4 }), make('x'), make('y'), make('z')], small);
  assert.ok(v.find((p) => p.id === 'careful').z.tov > 0);
  assert.ok(v.find((p) => p.id === 'sloppy').z.tov < 0);
});

test('a percentage matters more on more attempts', () => {
  const players = [
    make('volume', { fgm: 12, fga: 20 }), // 60% on 20 shots
    make('low', { fgm: 3, fga: 5 }), // 60% on 5 shots
    make('a'), make('b'), make('c', { fgm: 4, fga: 10 }),
  ];
  const v = valuePlayers(players, small);
  const z = (id) => v.find((p) => p.id === id).z.fg;
  assert.ok(z('volume') > z('low'));
  assert.ok(z('low') > 0);
});

test('there is a z-score for each of the 9 categories', () => {
  const [top] = valuePlayers(data.players, YAHOO_DEFAULTS);
  assert.deepEqual(Object.keys(top.z), CATEGORIES.map((c) => c.key));
});

test('allocate gives everyone $1 when nobody stands out', () => {
  const ranked = [{ id: 'a', total: 0 }, { id: 'b', total: 0 }, { id: 'c', total: 0 }];
  const prices = allocate(ranked, 2, 10);
  assert.equal(prices.get('a'), 5);
  assert.equal(prices.get('b'), 5);
  assert.equal(prices.has('c'), false);
});

test('with no picks, live prices equal the pre-draft values', () => {
  const v = valuePlayers(data.players, YAHOO_DEFAULTS);
  const live = livePrices(v, [], YAHOO_DEFAULTS);
  assert.ok(Math.abs(live.inflation) < 1e-9);
  for (const p of v.slice(0, 156)) assert.ok(Math.abs(live.prices.get(p.id) - p.value) < 1e-9);
});

test('overpaying elsewhere deflates, bargains inflate', () => {
  const v = valuePlayers(data.players, YAHOO_DEFAULTS);
  const [first, second] = v;
  const over = livePrices(v, [{ playerId: first.id, price: Math.round(first.value) + 30, team: 1 }], YAHOO_DEFAULTS);
  const under = livePrices(v, [{ playerId: first.id, price: Math.round(first.value) - 30, team: 1 }], YAHOO_DEFAULTS);
  assert.ok(over.inflation < 0 && under.inflation > 0);
  assert.ok(over.prices.get(second.id) < second.value);
  assert.ok(under.prices.get(second.id) > second.value);
  assert.equal(over.prices.has(first.id), false);
});

test('live prices still share out all the money left', () => {
  const v = valuePlayers(data.players, YAHOO_DEFAULTS);
  const picks = v.slice(0, 20).map((p, i) => ({ playerId: p.id, price: Math.round(p.value) + (i % 3) - 1, team: i % 12 }));
  const live = livePrices(v, picks, YAHOO_DEFAULTS);
  const total = [...live.prices.values()].reduce((a, b) => a + b, 0);
  assert.equal(live.slotsLeft, 136);
  assert.ok(Math.abs(total - live.moneyLeft) < 1e-6);
});
