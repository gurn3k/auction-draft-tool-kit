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

// Players the user has priced themselves (ADR 0011) take that price first and
// the rest share what's left, so the total still spends exactly the money.
function allocateWithMine(ranked, slots, money, mine) {
  const pinned = ranked.filter((p) => mine.has(p.id)).slice(0, Math.max(0, slots));
  if (!pinned.length) return allocate(ranked, slots, money);
  const fixed = pinned.reduce((a, p) => a + mine.get(p.id), 0);
  const prices = allocate(ranked.filter((p) => !mine.has(p.id)), slots - pinned.length, money - fixed);
  for (const p of pinned) prices.set(p.id, mine.get(p.id));
  return prices;
}

// The most a user may set, in total, for `count` players, leaving $1 for every
// other roster spot in the league.
export const myValueRoom = (league, count) => league.teams * league.budget - (rosterSpots(league) - count);

// Draft-slot ranges for rookie estimates (ADR 0012): top 3, the rest of the top
// 7, the rest of the lottery, the rest of round 1, and round 2.
export const ROOKIE_SLOTS = [[1, 3], [4, 7], [8, 14], [15, 30], [31, 60]];

// What a rookie taken in each slot range has been worth, on average, above
// replacement in his first season, scored against this league's pool. A rookie
// who didn't play, played under the games minimum, or fell below replacement
// counts as worth nothing extra: a team would drop him for a free agent.
export function rookieSlotEstimates(history, pool, categories, replacementTotal, minGames) {
  const played = scorePool(history.players.filter((p) => p.gp >= minGames), pool, categories);
  return ROOKIE_SLOTS.map(([lo, hi]) => {
    const picks = (hi - lo + 1) * history.classes.length;
    const inSlot = played.filter((p) => p.pick >= lo && p.pick <= hi);
    const over = inSlot.map((p) => Math.max(0, p.total - replacementTotal));
    return {
      lo, hi, picks, classes: [history.classes[0], history.classes.at(-1)],
      surplus: over.reduce((a, b) => a + b, 0) / picks,
      hit: over.filter((x) => x > 0).length / picks,
    };
  });
}

// Pre-draft values. Returns every eligible player, best first, with per-category
// z-scores, a total and a dollar value (0 for players outside the rostered pool).
export function valuePlayers(players, league, { categories = CATEGORIES, myValues = {}, rookieHistory = null } = {}) {
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
  // This year's rookies have no NBA stats. Each gets the average surplus of
  // past rookies from his draft slot (ADR 0012). Those it puts at $0, and
  // undrafted rookies, sit below everyone, still there to be priced by hand.
  const rookies = players.filter((p) => p.rookie && p.gp < league.minGames).sort((a, b) => (a.pick ?? 99) - (b.pick ?? 99));
  if (rookieHistory?.players?.length && rookies.length) {
    const replacement = scored[slots]?.total ?? scored.at(-1)?.total ?? 0;
    const slotsFor = rookieSlotEstimates(rookieHistory, pool, categories, replacement, league.minGames);
    const estimated = rookies.map((p) => {
      const est = p.pick ? slotsFor.find((s) => p.pick >= s.lo && p.pick <= s.hi) : null;
      return { ...p, total: est?.surplus > 0 ? replacement + est.surplus : -Infinity, ...(est ? { estimate: est } : {}) };
    });
    scored = [...scored, ...estimated].sort((a, b) => b.total - a.total);
  }
  const mine = new Map(scored.filter((p) => myValues[p.id] >= 1).map((p) => [p.id, myValues[p.id]]));
  const prices = allocateWithMine(scored, slots, league.teams * league.budget, mine);
  return scored.map((p, i) => ({ ...p, rank: i + 1, value: prices.get(p.id) ?? 0, ...(mine.has(p.id) ? { mine: true } : {}) }));
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
  // A value the user set stays where they set it; it doesn't move with inflation.
  const mine = new Map(available.filter((p) => p.mine).map((p) => [p.id, p.value]));
  const prices = allocateWithMine(available, slotsLeft, moneyLeft, mine);
  // Inflation compares what the remaining money buys now with what the same
  // players were worth before the draft.
  const baseline = available.slice(0, Math.max(0, slotsLeft)).reduce((a, p) => a + p.value, 0);
  return {
    prices,
    // The best player left who won't get rostered, as allocate() measures it.
    // Roster fit compares category stats, so a rookie (who has none) is skipped.
    replacement: available.slice(Math.max(0, slotsLeft)).find((p) => p.z) ?? available.at(-1) ?? null,
    spent,
    moneyLeft,
    slotsLeft,
    inflation: baseline > 0 ? moneyLeft / baseline - 1 : 0,
  };
}
