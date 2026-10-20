import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATEGORIES, YAHOO_DEFAULTS, allocate, livePrices, rosterSpots, valuePlayers } from '../site/lib/valuation.js';

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

test('a player note is context only: it never changes a price (ADR 0010)', () => {
  const noted = data.players.filter((p) => p.note);
  assert.ok(noted.length > 0);
  const plain = data.players.map(({ note, ...p }) => p);
  const a = valuePlayers(data.players, YAHOO_DEFAULTS);
  const b = new Map(valuePlayers(plain, YAHOO_DEFAULTS).map((p) => [p.id, p.value]));
  for (const p of a) assert.equal(p.value, b.get(p.id));
});

test('a value the user sets is kept, and everyone else shares exactly the rest (ADR 0011)', () => {
  const base = valuePlayers(data.players, YAHOO_DEFAULTS);
  const [star, , , mid] = base;
  const deep = base[300];
  const myValues = { [star.id]: 20, [deep.id]: 5 };
  const v = valuePlayers(data.players, YAHOO_DEFAULTS, { myValues });
  const get = (id) => v.find((p) => p.id === id);
  assert.equal(get(star.id).value, 20);
  assert.equal(get(deep.id).value, 5); // outside the rostered pool, but priced by the user
  assert.ok(get(star.id).mine && !get(mid.id).mine);
  assert.ok(get(mid.id).value > mid.value); // the money freed up goes to others
  const priced = v.filter((p) => p.value > 0);
  assert.equal(priced.length, rosterSpots(YAHOO_DEFAULTS));
  assert.ok(Math.abs(priced.reduce((a, p) => a + p.value, 0) - YAHOO_DEFAULTS.teams * YAHOO_DEFAULTS.budget) < 1e-6);
  // Live, it stays put while the rest re-share the money left.
  const live = livePrices(v, [{ playerId: mid.id, price: 90, team: 1 }], YAHOO_DEFAULTS);
  assert.equal(live.prices.get(star.id), 20);
  const total = [...live.prices.values()].reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - live.moneyLeft) < 1e-6);
  // Values for players who aren't on the board are ignored.
  assert.deepEqual(valuePlayers(data.players, YAHOO_DEFAULTS, { myValues: { nobody: 50 } }).map((p) => p.value), base.map((p) => p.value));
});

test('rookies are valued from their draft slot, and the total still spends exactly the money (ADR 0012)', () => {
  const history = JSON.parse(readFileSync(new URL('../site/data/rookie-history.json', import.meta.url), 'utf8'));
  const v = valuePlayers(data.players, YAHOO_DEFAULTS, { rookieHistory: history });
  const rookies = v.filter((p) => p.rookie);
  assert.ok(rookies.length > 0 && rookies.every((p) => !p.z));
  const top = rookies.filter((p) => p.pick >= 1 && p.pick <= 3);
  assert.ok(top.every((p) => p.value >= 1 && p.estimate.lo === 1));
  // A higher pick is never valued below a later one.
  const byPick = rookies.filter((p) => p.pick).sort((a, b) => a.pick - b.pick);
  for (let i = 1; i < byPick.length; i++) assert.ok(byPick[i].value <= byPick[i - 1].value + 1e-9, byPick[i].name);
  const priced = v.filter((p) => p.value > 0);
  assert.equal(priced.length, rosterSpots(YAHOO_DEFAULTS));
  assert.ok(Math.abs(priced.reduce((a, p) => a + p.value, 0) - YAHOO_DEFAULTS.teams * YAHOO_DEFAULTS.budget) < 1e-6);
  // Every rookie, even one estimated at $0 or undrafted, can be priced by hand.
  const zero = rookies.find((p) => p.value === 0);
  const mine = valuePlayers(data.players, YAHOO_DEFAULTS, { rookieHistory: history, myValues: { [zero.id]: 6 } });
  assert.equal(mine.find((p) => p.id === zero.id).value, 6);
  // Without the history, rookies stay unvalued, as before.
  assert.ok(!valuePlayers(data.players, YAHOO_DEFAULTS).some((p) => p.rookie));
});

test('a draft slot estimate counts busts and no-shows as worth nothing extra', () => {
  const history = { classes: [2020, 2021], players: [make('star', { pick: 1, pts: 30, reb: 10, ast: 8 })].map((p) => ({ ...p, year: 2020 })) };
  const v = valuePlayers([make('a'), make('b'), make('c'), make('d'), make('e'), { ...make('r'), gp: 0, rookie: true, pick: 2 }], small, { rookieHistory: history });
  const r = v.find((p) => p.id === 'r');
  // One hit in six top-3 picks (two classes of three): a 1-in-6 share of his surplus.
  assert.equal(r.estimate.picks, 6);
  assert.ok(Math.abs(r.estimate.hit - 1 / 6) < 1e-9);
});

test('players who miss games as regulars lose 10% of their value above replacement (ADR 0013)', () => {
  const healthy = make('h', { pts: 25 });
  const seasons = (gps, mpg = 32) => gps.map((gp, i) => [2023 + i, gp, mpg]);
  const players = [
    { ...healthy, seasons: seasons([75, 80, 70]) },
    { ...make('fragile', { pts: 25 }), seasons: seasons([45, 50, 70]) },
    { ...make('bench', { pts: 25 }), seasons: seasons([30, 40, 70], 12) }, // few minutes: not counted
    { ...make('once', { pts: 25 }), seasons: seasons([45, 80, 70]) }, // one short season: not counted
    make('x'), make('y'), make('z'),
  ];
  const v = valuePlayers(players, { ...small, rosterSize: 3 });
  const get = (id) => v.find((p) => p.id === id);
  assert.ok(get('fragile').missesGames && !get('bench').missesGames && !get('once').missesGames);
  assert.ok(get('fragile').value < get('h').value);
  assert.equal(get('bench').value, get('h').value);
  const priced = v.filter((p) => p.value > 0);
  assert.ok(Math.abs(priced.reduce((a, p) => a + p.value, 0) - small.teams * small.budget) < 1e-6);
});
