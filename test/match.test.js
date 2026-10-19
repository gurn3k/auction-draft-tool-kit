import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPlayer } from '../site/lib/match.js';

const pool = [
  { id: 'jokic', name: 'Nikola Jokić', team: 'DEN', rank: 1, aliases: ['Nikola Jokic'] },
  { id: 'jjj', name: 'Jaren Jackson Jr.', team: 'MEM', rank: 20 },
  { id: 'mpj', name: 'Michael Porter Jr.', team: 'BKN', rank: 40 },
  { id: 'kpj', name: 'Kevin Porter Jr.', team: 'MIL', rank: 90 },
  { id: 'pg', name: 'Paul George', team: 'PHI', rank: 70 },
  { id: 'jovic', name: 'Nikola Jović', team: 'MIA', rank: 150, aliases: ['Nikola Jovic'] },
  { id: 'wemby', name: 'Victor Wembanyama', team: 'SAS', rank: 2 },
  { id: 'holland', name: 'Ron Holland', team: 'DET', rank: 200, aliases: ['Ronald Holland II'] },
  { id: 'bridges-m', name: 'Mikal Bridges', team: 'NYK', rank: 50 },
  { id: 'bridges-mi', name: 'Miles Bridges', team: 'CHA', rank: 60 },
];
const label = (p) => `${p.name} (${p.team})`;
const find = (t, drafted = []) => findPlayer(t, pool, { label, drafted: new Set(drafted) });
const ids = (r) => r.options.map((p) => p.id);

test('exact dropdown text, names, aliases and accent-free spellings resolve', () => {
  assert.equal(find('Nikola Jokić (DEN)').player.id, 'jokic');
  assert.equal(find('nikola jokic ').player.id, 'jokic');
  assert.equal(find('Ronald Holland II').player.id, 'holland');
  assert.equal(find('Ron Holland (DET)').player.id, 'holland');
});

test('a name without its suffix resolves to the real player', () => {
  assert.equal(find('Jaren Jackson').player.id, 'jjj');
  assert.equal(find('michael porter').player.id, 'mpj');
});

test('a drafted player typed again comes back as that player, not a copy', () => {
  const r = find('Nikola Jokić', ['jokic']);
  assert.equal(r.kind, 'player');
  assert.equal(r.player.id, 'jokic');
});

test('a surname or partial name only suggests', () => {
  assert.deepEqual(find('jokic'), { kind: 'suggest', options: [pool[0]] });
  assert.deepEqual(ids(find('Porter')), ['mpj', 'kpj']);
  assert.deepEqual(ids(find('bridges')), ['bridges-m', 'bridges-mi']);
  assert.deepEqual(ids(find('George')), ['pg']);
  assert.deepEqual(ids(find('wemb')), ['wemby']);
});

test('suggestions put undrafted players first', () => {
  assert.deepEqual(ids(find('bridges', ['bridges-m'])), ['bridges-mi', 'bridges-m']);
});

test('typos suggest the close player', () => {
  assert.deepEqual(ids(find('Jokc')), ['jokic']);
  assert.deepEqual(ids(find('Victor Wembanyamma')), ['wemby']);
});

test('an exact surname does not drag in a one-letter-off player', () => {
  assert.deepEqual(ids(find('jokic')), ['jokic']);
  assert.deepEqual(ids(find('jovic')), ['jovic']);
  assert.equal(find('Nikola Jovic').player.id, 'jovic');
  assert.deepEqual(ids(find('Jokc')), ['jokic']); // a real typo still finds Jokić
});

test('nothing close is unknown', () => {
  assert.equal(find('Zxq Player').kind, 'unknown');
  assert.equal(find('  '), null);
});
