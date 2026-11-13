import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPick, bidCeiling, categorySupply, categoryTotals, checkPick, leagueProblem, newDraft, parseDollars, removePick, scarceStrengths, teamSummaries, usableSave, wholeNumber } from '../site/lib/draft.js';

const league = { teams: 3, budget: 20, rosterSize: 3, minGames: 0 };

test('a new draft names my team and starts empty', () => {
  const d = newDraft(league, 1);
  assert.deepEqual(d.teams.map((t) => t.name), ['Team 1', 'My team', 'Team 3']);
  assert.deepEqual(d.picks, []);
});

test('max bid leaves $1 for every other open spot', () => {
  let d = newDraft(league);
  assert.equal(teamSummaries(d, league)[0].maxBid, 18);
  d = addPick(d, league, { playerId: 'a', price: 10, team: 0 });
  const me = teamSummaries(d, league)[0];
  assert.deepEqual([me.spent, me.left, me.open, me.maxBid], [10, 10, 2, 9]);
});

test('illegal picks are refused with a reason', () => {
  let d = newDraft(league);
  assert.match(checkPick(d, league, { playerId: 'a', price: 0, team: 0 }), /at least \$1/);
  assert.match(checkPick(d, league, { playerId: 'a', price: 2.5, team: 0 }), /whole number/);
  assert.match(checkPick(d, league, { playerId: 'a', price: 19, team: 0 }), /at most \$18/);
  assert.match(checkPick(d, league, { playerId: 'a', price: 5, team: 7 }), /Pick a team/);
  d = addPick(d, league, { playerId: 'a', price: 5, team: 0 });
  assert.match(checkPick(d, league, { playerId: 'a', price: 5, team: 1 }), /already been drafted/);
  d = addPick(d, league, { playerId: 'b', price: 1, team: 0 });
  d = addPick(d, league, { playerId: 'c', price: 1, team: 0 });
  assert.match(checkPick(d, league, { playerId: 'd', price: 1, team: 0 }), /full roster/);
  assert.throws(() => addPick(d, league, { playerId: 'd', price: 1, team: 0 }), /full roster/);
});

test('removing a pick gives the money back', () => {
  let d = addPick(newDraft(league), league, { playerId: 'a', price: 7, team: 2 });
  d = removePick(d, 'a');
  assert.equal(teamSummaries(d, league)[2].left, 20);
});

test('bid ceiling is the live value, capped by what I can afford', () => {
  assert.equal(bidCeiling(30.4, { open: 3, maxBid: 50 }), 30);
  assert.equal(bidCeiling(30.4, { open: 3, maxBid: 12 }), 12);
  assert.equal(bidCeiling(0.2, { open: 3, maxBid: 12 }), 1);
  assert.equal(bidCeiling(30, { open: 0, maxBid: 0 }), 0);
});

test('category totals sum my players’ z-scores', () => {
  const cats = [{ key: 'pts' }, { key: 'tov' }];
  const totals = categoryTotals([{ z: { pts: 1, tov: -0.5 } }, { z: { pts: 0.5, tov: -1 } }], cats);
  assert.deepEqual(totals, { pts: 1.5, tov: -1.5 });
});

const supplyCats = [{ key: 'reb', label: 'REB' }, { key: 'blk', label: 'BLK' }, { key: 'pts', label: 'PTS' }];

test('supply counts the undrafted players strong in each category', () => {
  const available = [
    { z: { reb: 1, blk: 2, pts: 0.9 } },
    { z: { reb: 1.5, blk: -1, pts: 3 } },
    { z: undefined },
  ];
  assert.deepEqual(categorySupply(available, supplyCats), { reb: 2, blk: 1, pts: 1 });
});

test('a player is flagged only in scarce categories he is strong in, rarest first', () => {
  const supply = { reb: 5, blk: 2, pts: 6 };
  const p = { z: { reb: 1.2, blk: 1.8, pts: 2.5 } };
  assert.deepEqual(scarceStrengths(p, supply, supplyCats), [
    { key: 'blk', label: 'BLK', left: 2 },
    { key: 'reb', label: 'REB', left: 5 },
  ]);
  assert.deepEqual(scarceStrengths({ z: { reb: 0.9, blk: 0, pts: 0 } }, supply, supplyCats), []);
  assert.deepEqual(scarceStrengths({}, supply, supplyCats), []);
});

test('league settings the app cannot value are refused with the reason', () => {
  const ok = { teams: 12, budget: 200, rosterSize: 13, minGames: 15 };
  assert.equal(leagueProblem(ok), null);
  assert.equal(leagueProblem({ ...ok, teams: 2, budget: 13 }), null, 'two teams and exactly $1 a spot is a real league');
  assert.equal(leagueProblem({ teams: 20, budget: 2000, rosterSize: 25, minGames: 82 }), null);
  const cases = [
    [{ teams: 30 }, 'teams', /Teams must be a whole number from 2 to 20/],
    [{ teams: 1 }, 'teams', /from 2 to 20/],
    [{ teams: 12.5 }, 'teams', /whole number/],
    [{ teams: NaN }, 'teams', /Teams/],
    [{ budget: 1 }, 'budget', /from \$13 to \$2,000, so each team has \$1 for each of its 13 roster spots/],
    [{ budget: 0 }, 'budget', /Budget per team/],
    [{ budget: -5 }, 'budget', /Budget per team/],
    [{ budget: 2001 }, 'budget', /\$2,000/],
    [{ rosterSize: 0 }, 'rosterSize', /Roster spots must be a whole number from 1 to 25/],
    [{ rosterSize: 26 }, 'rosterSize', /from 1 to 25/],
    [{ minGames: -1 }, 'minGames', /Minimum games must be a whole number from 0 to 82/],
    [{ minGames: 83 }, 'minGames', /from 0 to 82/],
  ];
  for (const [change, field, message] of cases) {
    const problem = leagueProblem({ ...ok, ...change });
    assert.equal(problem?.field, field, JSON.stringify(change));
    assert.match(problem.message, message);
  }
});

test('the budget cannot drop below what a team has spent plus $1 for each spot it still needs', () => {
  let d = newDraft(league);
  d = addPick(d, league, { playerId: 'a', price: 15, team: 1 }); // $15 spent, 2 spots still to fill
  assert.equal(leagueProblem({ ...league, budget: 17 }, d), null);
  const problem = leagueProblem({ ...league, budget: 16 }, d);
  assert.equal(problem.field, 'budget');
  assert.match(problem.message, /Team 2 has already spent \$15 and has 2 spots to fill, so the budget can’t go below \$17/);
});

test('whole numbers typed in a box are read exactly, and nothing else is', () => {
  for (const [text, n] of [['12', 12], [' 7 ', 7], ['0', 0]]) assert.equal(wholeNumber(text), n, text);
  for (const text of ['', ' ', '12.5', '1e1', '0x10', '-3', '+3', '1,2', 'ten', '١٢']) assert.ok(Number.isNaN(wholeNumber(text)), text);
});

// Typed prices, budgets and My values: each entry is read as one number or
// refused with the reason, never quietly turned into a different number.
test('typed dollar amounts are read as whole dollars or refused with the reason', () => {
  const read = [
    ['56', 56], ['$56', 56], ['$ 56', 56], [' 7 ', 7], ['1,200', 1200], ['1 200', 1200], ['1 200', 1200], ['1 200', 1200],
    ['12,345,678', 12345678], ['1.200.000', 1200000], ['0', 0],
  ];
  for (const [text, n] of read) assert.deepEqual(parseDollars(text), { value: n }, text);
  const refused = [
    ['', /Enter/], ['   ', /Enter/], [null, /Enter/],
    ['0,5', /whole dollars, and “0,5” has cents/], ['1.5', /has cents/], ['12.50', /has cents/], ['1,20', /has cents/],
    ['1.200', /could be \$1,200 or \$1\.20/],
    ['12,34,567', /isn’t an amount/], ['1,200 300', /isn’t an amount/],
    ['-5', /at least \$1/], ['−5', /at least \$1/], ['abc', /isn’t an amount/], ['5e2', /isn’t an amount/], ['0x10', /isn’t an amount/], ['56$', /isn’t an amount/],
    ['٥٦', /digits 0-9/], ['５６', /digits 0-9/],
    ['9'.repeat(400), /more than any league’s budget/], ['1,000,000,000,000,000', /more than any league’s budget/],
  ];
  for (const [text, message] of refused) {
    const r = parseDollars(text);
    assert.equal(r.value, undefined, text);
    assert.match(r.error, message, text);
  }
});

test('a saved draft is used only when its shape is sound, whatever the setup limits', () => {
  const keys = ['fg', 'ft', 'pts'];
  const good = { league: { teams: 2, budget: 100, rosterSize: 13, minGames: 15, categories: null }, draft: { teams: [{ name: 'A' }, { name: 'B' }], myTeam: 0, picks: [{ playerId: 'x', name: 'X', price: 40, team: 1 }] }, myValues: { y: 5 } };
  assert.equal(usableSave(good, keys), true);
  assert.equal(usableSave({ ...good, league: { ...good.league, budget: 5000 } }, keys), true, 'saved before the $2,000 limit');
  const with_ = (path, value) => {
    const s = structuredClone(good);
    const keysOf = path.split('.');
    let o = s;
    for (const k of keysOf.slice(0, -1)) o = o[k];
    o[keysOf.at(-1)] = value;
    return s;
  };
  const damaged = [
    null, 'text', {}, { league: { teams: 12 }, draft: {} },
    with_('league.teams', '2'), with_('league.budget', 0), with_('league.minGames', -1), with_('league.categories', ['nope']), with_('league.categories', []),
    with_('draft.teams', [{ name: 'A' }]), with_('draft.teams', [{ name: 'A' }, {}]), with_('draft.myTeam', 5), with_('draft.picks', {}),
    with_('draft.picks', [{ playerId: 'x', price: 'lots', team: 1 }]), with_('draft.picks', [{ playerId: 'x', price: 4, team: 9 }]),
    with_('myValues', { y: '50' }), with_('myValues', { y: 2.5 }), with_('myValues', []),
    with_('csv', { name: 'p.csv', players: [{ id: 'a', name: 'A' }] }),
  ];
  for (const s of damaged) assert.equal(usableSave(s, keys), false, JSON.stringify(s));
});
