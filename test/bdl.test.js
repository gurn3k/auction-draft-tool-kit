import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aliasesFor, buildPlayers } from '../scripts/bdl.js';
import { YAHOO_DEFAULTS, valuePlayers } from '../site/lib/valuation.js';

const player = (id, first, last, extra = {}) => ({ id, first_name: first, last_name: last, position: 'G', draft_year: 2020, ...extra });
const stats = { gp: 70, min: 34.8, fgm: 9.9, fga: 17.4, ftm: 6.1, fta: 7.4, fg3m: 1.7, pts: 27.7, reb: 12.9, ast: 10.7, stl: 1.4, blk: 0.8, tov: 3.7, age: 31 };
const team = (abbreviation) => ({ abbreviation });

test('season averages map onto the player shape, with the current team', () => {
  const [p] = buildPlayers([{ player: player(246, 'Nikola', 'Jokic', { position: 'C' }), stats }], [{ ...player(246, 'Nikola', 'Jokic'), team: team('DEN') }]);
  assert.deepEqual(p, {
    id: 'bdl-246', name: 'Nikola Jokic', age: 31, team: 'DEN', pos: 'C',
    gp: 70, mpg: 34.8, fgm: 9.9, fga: 17.4, ftm: 6.1, fta: 7.4, tpm: 1.7,
    pts: 27.7, reb: 12.9, ast: 10.7, stl: 1.4, blk: 0.8, tov: 3.7, aliases: [],
  });
});

test('a player on no current roster is a free agent but keeps his stats', () => {
  const [p] = buildPlayers([{ player: player(1, 'Old', 'Vet'), stats }], []);
  assert.equal(p.team, 'FA');
  assert.equal(p.pts, 27.7);
});

test('rostered players without stats are added unvalued, rookies tagged', () => {
  const active = [{ ...player(2, 'New', 'Rookie', { draft_year: 2026 }), team: team('SAC') }, { ...player(3, 'Back', 'FromInjury'), team: team('BOS') }];
  const [rookie, returning] = buildPlayers([], active, { rookieYear: 2026 });
  assert.equal(rookie.added, true);
  assert.equal(rookie.rookie, true);
  assert.equal(rookie.gp, 0);
  assert.equal(returning.rookie, false);
  assert.equal(returning.team, 'BOS');
});

test('a hand-kept display name is shown, the legal name kept searchable', () => {
  const [p] = buildPlayers([{ player: player(1057260888, 'Airious', 'Bailey'), stats }], [], { names: { 1057260888: 'Ace Bailey' } });
  assert.equal(p.name, 'Ace Bailey');
  assert.deepEqual(p.aliases, ['Airious Bailey']);
});

test('aliases include an accent-free spelling but not the shown name', () => {
  assert.deepEqual(aliasesFor('Luka Dončić', ['Luka Dončić']), ['Luka Doncic']);
});

test('the hand-kept names point at real players in the bundled data', () => {
  const { names } = JSON.parse(readFileSync(new URL('../data/display-names.json', import.meta.url), 'utf8'));
  const data = JSON.parse(readFileSync(new URL('../site/data/players.json', import.meta.url), 'utf8'));
  const byId = new Map(data.players.map((p) => [p.id, p.name]));
  for (const [id, name] of Object.entries(names)) assert.equal(byId.get(`bdl-${id}`), name);
});

test('the bundled data adds up: every roster spot priced, $2,400 in a Yahoo-default league', () => {
  const data = JSON.parse(readFileSync(new URL('../site/data/players.json', import.meta.url), 'utf8'));
  const v = valuePlayers(data.players, YAHOO_DEFAULTS);
  const priced = v.filter((p) => p.value >= 1);
  assert.equal(priced.length, YAHOO_DEFAULTS.teams * YAHOO_DEFAULTS.rosterSize);
  assert.equal(Math.round(priced.reduce((a, p) => a + p.value, 0)), YAHOO_DEFAULTS.teams * YAHOO_DEFAULTS.budget);
});
