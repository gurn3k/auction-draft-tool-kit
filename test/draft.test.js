import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPick, bidCeiling, categorySupply, categoryTotals, checkPick, leagueProblem, newDraft, removePick, scarceStrengths, teamSummaries, wholeNumber } from '../site/lib/draft.js';

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
