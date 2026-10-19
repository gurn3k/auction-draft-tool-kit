import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, projectionsFromCsv } from '../site/lib/csv.js';

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
