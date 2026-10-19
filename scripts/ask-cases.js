// Test cases for "Ask the board" (ADR 0008). Three simulated drafts from the
// bundled data (early, middle, late), each with questions whose right answer code
// can work out from the board. Deterministic: the same data gives the same cases.

import { CATEGORIES, YAHOO_DEFAULTS, livePrices, valuePlayers } from '../site/lib/valuation.js';
import { addPick, bidCeiling, categoryTotals, newDraft, teamSummaries } from '../site/lib/draft.js';
import { fitFactor, fitStrength, needWeights, worthToYou } from '../site/lib/fit.js';
import { boardSnapshot } from '../site/lib/ask.js';
import { nameKey } from '../site/lib/names.js';

// Small seeded random numbers (mulberry32), so every run builds the same drafts.
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Everything the app would show for this draft: live prices, teams, Bid to. */
export function derive(players, league, draft) {
  const categories = CATEGORIES;
  const valued = valuePlayers(players, league, { categories });
  const live = livePrices(valued, draft.picks, league);
  const teams = teamSummaries(draft, league);
  const me = teams[draft.myTeam];
  const byId = new Map(valued.map((p) => [p.id, p]));
  const totals = categoryTotals(me.picks.map((pk) => byId.get(pk.playerId)).filter(Boolean), categories);
  const strength = fitStrength(me.picks.length, league.rosterSize);
  const weights = needWeights(totals, categories, strength);
  const worth = (p) => worthToYou(live.prices.get(p.id) ?? 0, strength ? fitFactor(p, live.replacement, weights, categories) : 1);
  const bidTo = (p) => bidCeiling(worth(p), me);
  const drafted = new Set(draft.picks.map((p) => p.playerId));
  const available = valued.filter((p) => !drafted.has(p.id) && (live.prices.get(p.id) ?? 0) >= 0.5)
    .map((p) => ({ ...p, live: Math.round(live.prices.get(p.id)), bidTo: bidTo(p) }));
  const snapshot = boardSnapshot({ league, categories, valued, picks: draft.picks, live, teams, myTeam: draft.myTeam, worth, bidTo });
  return { categories, valued, live, teams, me, totals, available, snapshot };
}

/**
 * Plays out `count` sales. Other teams buy the best player left at Live ±25%.
 * My team buys `mine` players spread through the draft, favouring bigs, so my
 * roster ends up lopsided (strong boards and blocks, short on assists) and
 * "what am I weak in" questions have a clear answer.
 */
export function simulate(players, league, { count, mine, seed }) {
  const rand = rng(seed);
  let draft = newDraft(league, 0);
  const myTurns = new Set(Array.from({ length: mine }, (_, i) => Math.floor(((i + 0.5) * count) / mine)));
  let other = 1;
  for (let k = 0; k < count; k++) {
    const { available, teams } = derive(players, league, draft);
    const buyer = myTurns.has(k) ? 0 : other;
    if (buyer !== 0) other = (other % (league.teams - 1)) + 1;
    const pool = available.slice(0, 8);
    const p = buyer === 0
      ? [...pool].sort((a, b) => (b.z.reb + b.z.blk - b.z.ast) - (a.z.reb + a.z.blk - a.z.ast))[0]
      : pool[Math.floor(rand() * Math.min(3, pool.length))];
    const t = teams[buyer];
    const price = Math.max(1, Math.min(t.maxBid, Math.round(p.live * (0.75 + rand() * 0.5))));
    draft = addPick(draft, league, { playerId: p.id, name: p.name, price, team: buyer });
  }
  return draft;
}

const STAT_WORDS = { blk: 'shot-blocker', ast: 'passer', tpm: 'three-point shooter', stl: 'steals player', reb: 'rebounder' };
const CAT_WORDS = { fg: 'field goal percentage', ft: 'free throw percentage', tpm: 'threes', pts: 'points', reb: 'rebounds', ast: 'assists', stl: 'steals', blk: 'blocks', tov: 'turnovers' };
const top = (xs, by, k) => [...xs].sort((a, b) => by(b) - by(a)).slice(0, k).map((p) => nameKey(p.name));
const first = (r) => nameKey(r.players?.[0] ?? '');

/** Questions for one draft state, each with a check that code can mark. */
const CAPS = { early: [['blk', 10], ['ast', 15], ['tpm', 8]], mid: [['blk', 5], ['ast', 8], ['tpm', 12]], late: [['blk', 3], ['ast', 5], ['tpm', 4]] };

export function casesFor(stage, b) {
  const { available, teams, me, totals, categories } = b;
  const cases = [];
  const add = (id, question, check, note) => cases.push({ id: `${stage}-${id}`, stage, question, check, note });

  // 1. Best in a category under a price.
  for (const [stat, cap] of CAPS[stage]) {
    const pool = available.filter((p) => p.live <= cap);
    if (!pool.length) continue;
    const want = top(pool, (p) => p.z[stat], 3);
    add(`best-${stat}`, `Who's the best ${STAT_WORDS[stat]} left for $${cap} or less?`,
      (r) => r.status === 'ok' && want.includes(first(r)), `top 3 by ${stat} with Live ≤ $${cap}: ${want.join(', ')}`);
  }

  // 2. Money and spots: the first N picks must fit what I have left.
  if (me.open >= 2) {
    const n = Math.min(3, me.open);
    add('budget', `I have $${me.left} and ${me.open} spots left. Name ${n} players I should target.`,
      (r) => {
        if (r.status !== 'ok' || (r.players?.length ?? 0) < n) return false;
        const picks = r.players.slice(0, n).map((x) => available.find((p) => nameKey(p.name) === nameKey(x)));
        return picks.every(Boolean) && picks.reduce((a, p) => a + p.live, 0) <= me.left - (me.open - n);
      }, `${n} players whose Live prices total ≤ $${me.left - (me.open - n)}`);
  }

  // 3. My weakest category, once my roster has a shape (3+ players). Skipped when
  // it's turnovers, where "fixing it" just means low-usage players.
  const weakest = [...categories].sort((a, b) => totals[a.key] - totals[b.key])[0];
  if (me.picks.length >= 3 && !weakest.negative) {
    const pool = available.filter((p) => p.live <= me.maxBid);
    const want = top(pool, (p) => p.z[weakest.key], 5);
    add('weakest', 'What is my team weakest in, and who left can I afford that fixes it?',
      (r) => r.status === 'ok' && want.includes(first(r)), `weakest is ${weakest.label}; top 5 affordable: ${want.join(', ')}`);
    add('fill', `My team is short on ${CAT_WORDS[weakest.key]}. Who should I go after?`,
      (r) => r.status === 'ok' && want.includes(first(r)), `top 5 affordable by ${weakest.key}: ${want.join(', ')}`);
  }

  // 4. Which other teams can still pay a price for the best player left.
  const star = available[0];
  const ask = Math.max(2, star.live);
  const canPay = teams.filter((t) => t.index !== me.index && t.maxBid >= ask).map((t) => t.name.toLowerCase()).sort();
  add('afford', `Which other teams can still bid $${ask} on ${star.name}?`,
    (r) => r.status === 'ok' && JSON.stringify((r.teams ?? []).map((t) => t.toLowerCase()).sort()) === JSON.stringify(canPay),
    `${canPay.length} teams: ${canPay.join(', ') || 'none'}`);

  // 5. Should I pay $X? Over Bid to is a pass, under it a bid.
  const mid = available[Math.min(5, available.length - 1)];
  if (mid.bidTo >= 4) {
    add('verdict-pass', `Is $${mid.bidTo + 6} too much for ${mid.name}?`, (r) => r.status === 'ok' && r.verdict === 'pass', `Bid to is $${mid.bidTo}`);
    add('verdict-bid', `Should I pay $${mid.bidTo - 2} for ${mid.name}?`, (r) => r.status === 'ok' && r.verdict === 'bid', `Bid to is $${mid.bidTo}`);
  }

  // 6. Head to head in one category.
  const bigs = available.filter((p) => p.z.blk > 0.5).slice(0, 2);
  if (bigs.length === 2) {
    const want = nameKey((bigs[0].z.blk >= bigs[1].z.blk ? bigs[0] : bigs[1]).name);
    add('compare', `${bigs[0].name} or ${bigs[1].name}: who helps me more in blocks?`, (r) => r.status === 'ok' && first(r) === want, `more blocks: ${want}`);
  }

  // 7. Questions it must turn down.
  add('off-topic', 'Write me a short poem about the Lakers.', (r) => r.status === 'off_topic', 'off_topic');
  add('unknown', `Is ${star.name} injured right now?`, (r) => r.status === 'cannot_answer', 'cannot_answer: no injury data');
  return cases;
}

export function allCases(players, league = YAHOO_DEFAULTS) {
  const stages = [['early', { count: 10, mine: 1, seed: 1 }], ['mid', { count: 60, mine: 5, seed: 2 }], ['late', { count: 130, mine: 11, seed: 3 }]];
  return stages.flatMap(([stage, opts]) => {
    const board = derive(players, league, simulate(players, league, opts));
    return casesFor(stage, board).map((c) => ({ ...c, snapshot: board.snapshot }));
  });
}
