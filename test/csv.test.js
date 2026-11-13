import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv, projectionsFromCsv } from '../site/lib/csv.js';
import { YAHOO_DEFAULTS, valuePlayers } from '../site/lib/valuation.js';

test('parses quoted fields, escaped quotes and CRLF line endings', () => {
  assert.deepEqual(parseCsv('a,"b,c","say ""hi"""\r\n1,2,3\r\n\r\n'), [['a', 'b,c', 'say "hi"'], ['1', '2', '3']]);
});

test('reads makes and attempts directly', () => {
  const csv = 'Player,Team,GP,FGM,FGA,FTM,FTA,3PM,PTS,REB,AST,STL,BLK,TO\nNikola Jokić,DEN,70,10,17.5,6,7.5,1.5,27,12.5,10,1.4,0.8,3.5\n';
  const { players, errors } = projectionsFromCsv(csv);
  assert.deepEqual(errors, []);
  assert.equal(players[0].id, 'csv-nikola-jokic');
  assert.equal(players[0].fgm, 10);
  assert.equal(players[0].tov, 3.5);
  assert.equal(players[0].gp, 70);
});

test('derives makes from percentages in either 0.475 or 47.5 form', () => {
  const csv = 'Name,FG%,FGA,FT%,FTA,3PM,PTS,REB,AST,STL,BLK,TOV\nA,0.5,10,80,5,1,10,5,3,1,1,2\n';
  const { players, errors } = projectionsFromCsv(csv);
  assert.deepEqual(errors, []);
  assert.equal(players[0].fgm, 5);
  assert.equal(players[0].ftm, 4);
  assert.equal(players[0].gp, 82, 'projections without GP count as a full season');
});

test('names the columns it cannot find', () => {
  const { players, errors } = projectionsFromCsv('Name,PTS\nA,10\n');
  assert.equal(players.length, 0);
  assert.match(errors[0], /Missing columns: fga, fta, tpm, reb, ast, stl, blk, tov, fgm or fg%, ftm or ft%/);
});

test('reports rows with bad numbers and keeps the rest', () => {
  const csv = 'Name,FGM,FGA,FTM,FTA,3PM,PTS,REB,AST,STL,BLK,TO\nA,5,10,2,3,1,13,5,3,1,1,2\nB,5,ten,2,3,1,13,5,3,1,1,2\n';
  const { players, errors } = projectionsFromCsv(csv);
  assert.deepEqual(players.map((p) => p.name), ['A']);
  assert.match(errors[0], /Row 3 \(B\): "fga"/);
});

const HEAD = 'Name,GP,MIN,FGM,FGA,FTM,FTA,3PM,PTS,REB,AST,STL,BLK,TO\n';
const GOOD = '70,30,5,10,2,3,1,13,5,3,1,1,2';

test('a blank or cut-off stat is reported, not read as zero', () => {
  const csv = `${HEAD}A,${GOOD}\nBlank,70,30,5,10,2,3,1,,5,3,1,1,2\nShort,70,30,5,10\nNo games,,30,5,10,2,3,1,13,5,3,1,1,2\n`;
  const { players, errors } = projectionsFromCsv(csv);
  assert.deepEqual(players.map((p) => p.name), ['A']);
  assert.equal(errors.length, 3);
  assert.match(errors[0], /Row 3 \(Blank\): "pts" is blank/);
  assert.match(errors[1], /Row 4 \(Short\): "fta" is blank/);
  assert.match(errors[2], /Row 5 \(No games\): "gp" is blank/);
});

test('a blank minutes cell is fine: minutes are only shown, not valued', () => {
  const { players, errors } = projectionsFromCsv(`${HEAD}A,70,,5,10,2,3,1,13,5,3,1,1,2\n`);
  assert.deepEqual(errors, []);
  assert.equal(players[0].mpg, 0);
});

test('negative, hex, exponent and comma-decimal numbers are refused', () => {
  const rows = ['Neg,70,30,5,10,2,3,1,-13,5,3,1,1,2', 'Hex,70,30,5,10,2,3,1,0x10,5,3,1,1,2', 'Exp,70,30,5,10,2,3,1,1e1,5,3,1,1,2', 'Comma,70,30,5,10,2,3,1,"13,5",5,3,1,1,2'];
  const { players, errors } = projectionsFromCsv(HEAD + rows.join('\n'));
  assert.equal(players.length, 0);
  assert.deepEqual(errors.map((e) => e.match(/\((\w+)\)/)[1]), ['Neg', 'Hex', 'Exp', 'Comma']);
  for (const e of errors) assert.match(e, /"pts" is not a number/);
});

test('more makes than attempts is refused, including a percentage over 100', () => {
  const { players, errors } = projectionsFromCsv(`${HEAD}A,70,30,11,10,2,3,1,13,5,3,1,1,2\nB,70,30,5,10,4,3,1,13,5,3,1,1,2\n`);
  assert.equal(players.length, 0);
  assert.match(errors[0], /Row 2 \(A\): more field goals made \(11\) than attempted \(10\)/);
  assert.match(errors[1], /Row 3 \(B\): more free throws made \(4\) than attempted \(3\)/);
  const pct = projectionsFromCsv('Name,FG%,FGA,FT%,FTA,3PM,PTS,REB,AST,STL,BLK,TO\nA,150,10,80,5,1,10,5,3,1,1,2\n');
  assert.equal(pct.players.length, 0);
  assert.match(pct.errors[0], /more field goals made/);
});

test('a file saved by Excel (byte-order mark, CRLF) reads normally, and markup in names stays text', () => {
  const { players, errors } = projectionsFromCsv(`﻿${HEAD.replace('\n', '\r\n')}<img src=x onerror=alert(1)>,${GOOD}\r\n`);
  assert.deepEqual(errors, []);
  assert.equal(players[0].name, '<img src=x onerror=alert(1)>');
});

test('a blank percentage is fine for a player with no attempts, and reported for one with attempts', () => {
  const csv = 'Name,FG%,FGA,FT%,FTA,3PM,PTS,REB,AST,STL,BLK,TO\nNo FTs,0.5,10,,0,1,10,5,3,1,1,2\nBlank FT%,0.5,10,,4,1,10,5,3,1,1,2\n';
  const { players, errors } = projectionsFromCsv(csv);
  assert.deepEqual(players.map((p) => [p.name, p.ftm]), [['No FTs', 0]]);
  assert.match(errors[0], /Row 3 \(Blank FT%\): "ft%" is blank/);
});

test('the bundled stats written out as a CSV import every player and give the same values', () => {
  const data = JSON.parse(readFileSync(new URL('../site/data/players.json', import.meta.url), 'utf8'));
  const withStats = data.players.filter((p) => !p.added);
  const cols = ['gp', 'mpg', 'fgm', 'fga', 'ftm', 'fta', 'tpm', 'pts', 'reb', 'ast', 'stl', 'blk', 'tov'];
  const quote = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const csv = `Player,Team,GP,MIN,FGM,FGA,FTM,FTA,3PM,PTS,REB,AST,STL,BLK,TO\r\n${withStats.map((p) => [quote(p.name), p.team, ...cols.map((k) => p[k])].join(',')).join('\r\n')}\r\n`;
  const { players, errors } = projectionsFromCsv(csv);
  assert.deepEqual(errors, []);
  assert.equal(players.length, withStats.length);
  // Missed-games history isn't in a CSV, so compare against the stats alone.
  const plain = withStats.map(({ seasons, ...p }) => p);
  const a = valuePlayers(plain, YAHOO_DEFAULTS).map((p) => [p.name, p.value]);
  const b = valuePlayers(players, YAHOO_DEFAULTS).map((p) => [p.name, p.value]);
  assert.deepEqual(b, a);
});
