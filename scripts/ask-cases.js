// Test cases for "Ask the board" (ADR 0008). Three simulated drafts from the
// bundled data (early, middle, late), each with questions whose right answer code
// can work out from the board. Deterministic: the same data gives the same cases.
// Each case also carries the request a perfect reading of the question would
// give (`gold`), so code's answers can be tested apart from the model's reading.

import { CATEGORIES, YAHOO_DEFAULTS, livePrices, valuePlayers } from '../site/lib/valuation.js';
import { addPick, bidCeiling, categoryTotals, newDraft, teamSummaries } from '../site/lib/draft.js';
import { fitFactor, fitStrength, needWeights, worthToYou } from '../site/lib/fit.js';
import { boardState } from '../site/lib/ask.js';
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
  const board = boardState({ categories, valued, picks: draft.picks, live, teams, myTeam: draft.myTeam, bidTo });
  return { categories, valued, live, teams, me, totals, available, board };
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
  const add = (id, question, check, note, gold) => cases.push({ id: `${stage}-${id}`, stage, question, check, note, gold: { category: null, affordable: false, players: [], ...gold } });

  // 1. Best in a category under a price.
  for (const [stat, cap] of CAPS[stage]) {
    const pool = available.filter((p) => p.live <= cap);
    if (!pool.length) continue;
    const want = top(pool, (p) => p.z[stat], 3);
    add(`best-${stat}`, `Who's the best ${STAT_WORDS[stat]} left for $${cap} or less?`,
      (r) => r.status === 'ok' && want.includes(first(r)), `top 3 by ${stat} with Live ≤ $${cap}: ${want.join(', ')}`,
      { intent: 'best', category: stat, maxPrice: cap });
  }

  // 2. Money and spots: the first N picks must fit what I have left.
  if (me.open >= 2) {
    const n = Math.min(3, me.open);
    add('budget', `I have $${me.left} and ${me.open} spots left. Name ${n} players I should target.`,
      (r) => {
        if (r.status !== 'ok' || (r.players?.length ?? 0) < n) return false;
        const picks = r.players.slice(0, n).map((x) => available.find((p) => nameKey(p.name) === nameKey(x)));
        return picks.every(Boolean) && picks.reduce((a, p) => a + p.live, 0) <= me.left - (me.open - n);
      }, `${n} players whose Live prices total ≤ $${me.left - (me.open - n)}`, { intent: 'targets', money: me.left, spots: me.open, count: n });
  }

  // 3. My weakest category, once my roster has a shape (3+ players). Skipped when
  // it's turnovers, where "fixing it" just means low-usage players.
  const weakest = [...categories].sort((a, b) => totals[a.key] - totals[b.key])[0];
  if (me.picks.length >= 3 && !weakest.negative) {
    const pool = available.filter((p) => p.live <= me.maxBid);
    const want = top(pool, (p) => p.z[weakest.key], 5);
    add('weakest', 'What is my team weakest in, and who left can I afford that fixes it?',
      (r) => r.status === 'ok' && want.includes(first(r)), `weakest is ${weakest.label}; top 5 affordable: ${want.join(', ')}`, { intent: 'weakest' });
    add('fill', `My team is short on ${CAT_WORDS[weakest.key]}. Who should I go after?`,
      (r) => r.status === 'ok' && want.includes(first(r)), `top 5 affordable by ${weakest.key}: ${want.join(', ')}`, { intent: 'best', category: weakest.key, affordable: true });
  }

  // 4. Which other teams can still pay a price for the best player left.
  const star = available[0];
  const ask = Math.max(2, star.live);
  const canPay = teams.filter((t) => t.index !== me.index && t.maxBid >= ask).map((t) => t.name.toLowerCase()).sort();
  add('afford', `Which other teams can still bid $${ask} on ${star.name}?`,
    // Listing my own team too isn't wrong advice, so it's ignored.
    (r) => r.status === 'ok' && JSON.stringify((r.teams ?? []).map((t) => t.toLowerCase()).filter((t) => t !== me.name.toLowerCase()).sort()) === JSON.stringify(canPay),
    `${canPay.length} teams: ${canPay.join(', ') || 'none'}`, { intent: 'afford', price: ask, players: [star.name] });

  // 5. Should I pay $X? Over Bid to is a pass, under it a bid.
  const mid = available[Math.min(5, available.length - 1)];
  if (mid.bidTo >= 4) {
    add('verdict-pass', `Is $${mid.bidTo + 6} too much for ${mid.name}?`, (r) => r.status === 'ok' && r.verdict === 'pass', `Bid to is $${mid.bidTo}`, { intent: 'verdict', price: mid.bidTo + 6, players: [mid.name] });
    add('verdict-bid', `Should I pay $${mid.bidTo - 2} for ${mid.name}?`, (r) => r.status === 'ok' && r.verdict === 'bid', `Bid to is $${mid.bidTo}`, { intent: 'verdict', price: mid.bidTo - 2, players: [mid.name] });
  }

  // 6. Head to head in one category.
  const bigs = available.filter((p) => p.z.blk > 0.5).slice(0, 2);
  if (bigs.length === 2) {
    const want = nameKey((bigs[0].z.blk >= bigs[1].z.blk ? bigs[0] : bigs[1]).name);
    add('compare', `${bigs[0].name} or ${bigs[1].name}: who helps me more in blocks?`, (r) => r.status === 'ok' && first(r) === want, `more blocks: ${want}`, { intent: 'compare', category: 'blk', players: [bigs[0].name, bigs[1].name] });
  }

  // 7. Questions it must turn down.
  add('off-topic', 'Write me a short poem about the Lakers.', (r) => r.status === 'off_topic', 'off_topic', { intent: 'off_topic' });
  add('unknown', `Is ${star.name} injured right now?`, (r) => ['cannot_answer', 'off_topic'].includes(r.status) && !r.players?.length, 'declines: no injury data', { intent: 'cannot_answer', players: [star.name] });
  if (stage === 'mid') rephrased(b, add);
  return cases;
}

// Held out: written after design 2, in wordings the parse prompt's examples don't
// use, to check the model reads questions rather than matching the examples.
function rephrased({ available, teams, me }, add) {
  const cheapBigs = available.filter((p) => p.live <= 6);
  const wantBlk = top(cheapBigs, (p) => p.z.blk, 3);
  add('re-rim', 'any cheap rim protectors under 6 bucks?', (r) => r.status === 'ok' && wantBlk.includes(first(r)), `top 3 by blk with Live ≤ $6: ${wantBlk.join(', ')}`, { intent: 'best', category: 'blk', maxPrice: 6 });
  const wantStl = top(available.filter((p) => p.live <= 10), (p) => p.z.stl, 3);
  add('re-steals', 'Need steals. Who is the top guy for ten dollars or less, I mean $10?', (r) => r.status === 'ok' && wantStl.includes(first(r)), `top 3 by stl with Live ≤ $10: ${wantStl.join(', ')}`, { intent: 'best', category: 'stl', maxPrice: 10 });
  const p = available[8];
  add('re-verdict', `Should I go to $${p.bidTo + 4} on ${p.name.split(' ').pop()}?`, (r) => r.status === 'ok' && r.verdict === 'pass', `Bid to is $${p.bidTo}`, { intent: 'verdict', price: p.bidTo + 4, players: [p.name.split(' ').pop()] });
  const q = available[12];
  add('re-verdict-bid', `${q.name} at $${Math.max(1, q.bidTo - 1)}, worth it?`, (r) => r.status === 'ok' && r.verdict === 'bid', `Bid to is $${q.bidTo}`, { intent: 'verdict', price: Math.max(1, q.bidTo - 1), players: [q.name] });
  const price = available[2].live;
  const canPay = teams.filter((t) => t.index !== me.index && t.maxBid >= price).map((t) => t.name.toLowerCase()).sort();
  add('re-afford', `Can anybody else still afford ${available[2].name} at $${price}?`, (r) => r.status === 'ok' && JSON.stringify((r.teams ?? []).map((t) => t.toLowerCase()).filter((t) => t !== me.name.toLowerCase()).sort()) === JSON.stringify(canPay), `${canPay.length} teams`, { intent: 'afford', price, players: [available[2].name] });
  const pair = available.filter((x) => x.z.ast > 0.5).slice(0, 2);
  const wantAst = nameKey((pair[0].z.ast >= pair[1].z.ast ? pair[0] : pair[1]).name);
  add('re-compare', `who dishes more dimes, ${pair[1].name} or ${pair[0].name}`, (r) => r.status === 'ok' && first(r) === wantAst, `more assists: ${wantAst}`, { intent: 'compare', category: 'ast', players: [pair[1].name, pair[0].name] });
  add('re-news', `Did ${available[0].name} sign an extension this summer?`, (r) => ['cannot_answer', 'off_topic'].includes(r.status) && !r.players?.length, 'declines: no news', { intent: 'cannot_answer', players: [available[0].name] });
  add('re-offtopic', 'whats a good pizza place in toronto', (r) => r.status === 'off_topic', 'off_topic', { intent: 'off_topic' });
}

export function allCases(players, league = YAHOO_DEFAULTS) {
  const stages = [['early', { count: 10, mine: 1, seed: 1 }], ['mid', { count: 60, mine: 5, seed: 2 }], ['late', { count: 130, mine: 11, seed: 3 }]];
  return stages.flatMap(([stage, opts]) => {
    const b = derive(players, league, simulate(players, league, opts));
    return casesFor(stage, b).map((c) => ({ ...c, board: b.board }));
  });
}
