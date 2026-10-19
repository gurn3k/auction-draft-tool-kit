// Auction values for a 9-category head-to-head league, as pure functions.
// No DOM and no fetches, so the same file can run in the web app, in tests and,
// later, inside a browser extension. Method: docs/adr/0002-valuation-method.md.

export const CATEGORIES = [
  { key: 'fg', label: 'FG%', made: 'fgm', att: 'fga' },
  { key: 'ft', label: 'FT%', made: 'ftm', att: 'fta' },
  { key: 'tpm', label: '3PM' },
  { key: 'pts', label: 'PTS' },
  { key: 'reb', label: 'REB' },
  { key: 'ast', label: 'AST' },
  { key: 'stl', label: 'STL' },
  { key: 'blk', label: 'BLK' },
  { key: 'tov', label: 'TO', negative: true },
];

// Yahoo's defaults for a new salary cap league: 12 teams, $200 each, 13 roster
// spots (PG SG G SF PF F C C Util Util BN BN BN). IL spots aren't bought at auction.
export const YAHOO_DEFAULTS = { teams: 12, budget: 200, rosterSize: 13, minGames: 20 };

const POOL_PASSES = 4;

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length) || 1;
};

export const rosterSpots = (league) => league.teams * league.rosterSize;

// A percentage category is scored by its impact on a team's percentage: makes
// above what the pool's average shooter would make on the same attempts. A 50%
// shooter on 20 attempts helps more than one on 5 attempts.
function rawScore(p, cat, poolPct) {
  if (cat.made) return p[cat.made] - poolPct[cat.key] * p[cat.att];
  return p[cat.key];
}

function scorePool(players, pool, categories) {
  const poolPct = {};
  for (const cat of categories) {
    if (!cat.made) continue;
    const made = pool.reduce((a, p) => a + p[cat.made], 0);
    const att = pool.reduce((a, p) => a + p[cat.att], 0);
    poolPct[cat.key] = att ? made / att : 0;
  }
  const stats = {};
  for (const cat of categories) {
    const xs = pool.map((p) => rawScore(p, cat, poolPct));
    stats[cat.key] = { mean: mean(xs), sd: sd(xs) };
  }
  return players.map((p) => {
    const z = {};
    let total = 0;
    for (const cat of categories) {
      const { mean: m, sd: s } = stats[cat.key];
      const v = ((rawScore(p, cat, poolPct) - m) / s) * (cat.negative ? -1 : 1);
      z[cat.key] = v;
      total += v;
    }
    return { ...p, z, total };
  });
}

// Spreads `money` across the best `slots` players by value over replacement.
// Every rostered player costs at least $1, so only money beyond $1 a slot is
// shared out. Replacement level is the best player who won't get rostered.
export function allocate(ranked, slots, money) {
  const prices = new Map();
  if (slots <= 0 || ranked.length === 0) return prices;
  const top = ranked.slice(0, slots);
  const replacement = ranked[slots]?.total ?? top[top.length - 1].total;
  const over = top.map((p) => Math.max(0, p.total - replacement));
  const sum = over.reduce((a, b) => a + b, 0);
  const surplus = Math.max(0, money - top.length);
  top.forEach((p, i) => {
    prices.set(p.id, sum > 0 ? 1 + (over[i] / sum) * surplus : money / top.length);
  });
  return prices;
}

// Players with a hand-set value (ADR 0010) take that price first and the rest
// share what's left, so the total still spends exactly the money.
function allocateWithSet(ranked, slots, money, set) {
  const pinned = ranked.filter((p) => set.has(p.id)).slice(0, Math.max(0, slots));
  const fixed = pinned.reduce((a, p) => a + set.get(p.id), 0);
  const prices = allocate(ranked.filter((p) => !set.has(p.id)), slots - pinned.length, money - fixed);
  for (const p of pinned) prices.set(p.id, set.get(p.id));
  return prices;
}

// A hand-set value is in dollars for Yahoo's default $200 budget, scaled to this league's.
const setPrice = (p, league) => Math.max(1, Math.round((p.setValue.value * league.budget) / YAHOO_DEFAULTS.budget));

// Pre-draft values. Returns every eligible player, best first, with per-category
// z-scores, a total and a dollar value (0 for players outside the rostered pool).
export function valuePlayers(players, league, { categories = CATEGORIES } = {}) {
  const eligible = players.filter((p) => p.gp >= league.minGames);
  const slots = rosterSpots(league);
  // The averages that z-scores compare against should describe the players who
  // actually get drafted, not the whole league, so re-centre on the top of the
  // pool a few times until it settles.
  let pool = eligible;
  let scored = [];
  for (let i = 0; i < POOL_PASSES; i++) {
    scored = scorePool(eligible, pool, categories).sort((a, b) => b.total - a.total);
    pool = scored.slice(0, slots);
  }
  const set = new Map(scored.filter((p) => p.setValue).map((p) => [p.id, setPrice(p, league)]));
  const prices = allocateWithSet(scored, slots, league.teams * league.budget, set);
  return scored.map((p, i) => ({ ...p, rank: i + 1, value: prices.get(p.id) ?? 0 }));
}

// Re-prices the players still available once some have been bought. The money
// left and the slots left are shared out again over the remaining players, so
// overpays elsewhere make the rest cheaper and bargains make them dearer.
export function livePrices(valued, picks, league) {
  const drafted = new Set(picks.map((p) => p.playerId));
  const spent = picks.reduce((a, p) => a + p.price, 0);
  const slotsLeft = rosterSpots(league) - picks.length;
  const moneyLeft = league.teams * league.budget - spent;
  const available = valued.filter((p) => !drafted.has(p.id));
  // A hand-set value stays where it was set; it doesn't move with inflation.
  const set = new Map(available.filter((p) => p.setValue && p.value > 0).map((p) => [p.id, p.value]));
  const prices = allocateWithSet(available, slotsLeft, moneyLeft, set);
  // Inflation compares what the remaining money buys now with what the same
  // players were worth before the draft.
  const baseline = available.slice(0, Math.max(0, slotsLeft)).reduce((a, p) => a + p.value, 0);
  return {
    prices,
    // The best player left who won't get rostered, as allocate() measures it.
    replacement: available[Math.max(0, slotsLeft)] ?? available.at(-1) ?? null,
    spent,
    moneyLeft,
    slotsLeft,
    inflation: baseline > 0 ? moneyLeft / baseline - 1 : 0,
  };
}
