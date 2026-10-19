import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIT_LIMIT, fitDrivers, fitFactor, fitStrength, needWeights, worthToYou } from '../site/lib/fit.js';

const cats = [{ key: 'reb', label: 'REB' }, { key: 'blk', label: 'BLK' }, { key: 'pts', label: 'PTS' }];
const zero = { z: { reb: 0, blk: 0, pts: 0 } };

test('fit counts for nothing with an empty roster and fully from half a roster', () => {
  assert.equal(fitStrength(0, 13), 0);
  assert.ok(fitStrength(3, 13) > 0 && fitStrength(3, 13) < 0.5);
  assert.equal(fitStrength(7, 13), 0.5);
  assert.equal(fitStrength(13, 13), 0.5);
});

test('weights average 1, favour the short categories, and are flat at zero strength', () => {
  const w = needWeights({ reb: -1, blk: 0, pts: 3 }, cats, 0.5);
  const avg = Object.values(w).reduce((a, b) => a + b, 0) / 3;
  assert.ok(Math.abs(avg - 1) < 1e-9);
  assert.ok(w.reb > w.blk && w.blk > w.pts);
  assert.deepEqual(needWeights({ reb: -1, blk: 0, pts: 3 }, cats, 0), { reb: 1, blk: 1, pts: 1 });
});

test('an evenly balanced player fits about evenly', () => {
  const w = needWeights({ reb: -1, blk: 0, pts: 3 }, cats, 0.5);
  assert.ok(Math.abs(fitFactor({ z: { reb: 1, blk: 1, pts: 1 } }, zero, w, cats) - 1) < 1e-9);
});

test('a player who fills the short categories is worth more to me, a specialist in my strength less', () => {
  const w = needWeights({ reb: -1, blk: -1, pts: 3 }, cats, 0.5);
  const big = { z: { reb: 2, blk: 1.5, pts: 0.5 } };
  const scorer = { z: { reb: 0, blk: 0, pts: 2.5 } };
  assert.ok(fitFactor(big, zero, w, cats) > 1);
  assert.ok(fitFactor(scorer, zero, w, cats) < 1);
  assert.deepEqual(fitDrivers(big, zero, w, cats, 1), ['REB', 'BLK']);
  assert.deepEqual(fitDrivers(scorer, zero, w, cats, -1), ['PTS']);
});

test('worth to you stays within the limit of Live and never under $1', () => {
  assert.equal(worthToYou(30, 1.38), 30 * (1 + FIT_LIMIT));
  assert.equal(worthToYou(30, 0.5), 30 * (1 - FIT_LIMIT));
  assert.equal(worthToYou(30, 1.1), 33);
  assert.equal(worthToYou(1.1, 0.5), 1);
  assert.equal(worthToYou(0, 1.2), 0);
});

test('players at or below replacement, or without stats, are left at Live', () => {
  const w = needWeights({ reb: -1, blk: 0, pts: 3 }, cats, 0.5);
  assert.equal(fitFactor({ z: { reb: -1, blk: 0, pts: 0 } }, zero, w, cats), 1);
  assert.equal(fitFactor({}, zero, w, cats), 1);
});
