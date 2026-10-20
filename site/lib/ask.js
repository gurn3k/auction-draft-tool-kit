// "Ask the board" (ADR 0008, design 2). A language model only turns a question
// into a small structured request; code checks the request, runs it on the live
// board and writes the answer. The first design let the model read the whole
// board and answer it, and every model tested got the arithmetic wrong (price
// limits, comparing teams' max bids), so the model no longer does any.
// Pure functions, shared by the server, the eval and the tests.

import { findPlayer } from './match.js';

export const MAX_QUESTION = 300;
const MAX_LIST = 5;

const CATEGORY_WORDS = 'fg = field goal %, ft = free throw %, tpm = threes / 3-pointers, pts = points / scoring, reb = rebounds, ast = assists / passing, stl = steals, blk = blocks / shot-blocking, tov = turnovers (fewer is better)';

export const PARSE_PROMPT = `You turn one question from a fantasy basketball salary cap (auction) draft into a JSON request. Do not answer the question. Code will answer it from the live draft board.

Request fields (use null when the question doesn't say):
- "intent", one of:
  "best": the best available players, in one category or overall, optionally under a price.
  "targets": which players to go after with an amount of money and a number of roster spots.
  "weakest": what my team is weakest in, and who fixes it.
  "afford": which other teams can still pay a price for a player.
  "verdict": whether to pay a given price for a player.
  "compare": which of two or more players is better, in one category or overall.
  "player": what a player is worth or what he's good at.
  "cannot_answer": needs injuries, trades, news, this season's form or anything beyond last season's stats and the board.
  A name you don't recognize may be a rookie or a newer player: the board knows every player, so still use the intent the question asks for and copy the name.
  "off_topic": not about this draft.
- "category": one of fg, ft, tpm, pts, reb, ast, stl, blk, tov (${CATEGORY_WORDS}). If the question names a category but asks for players who help with it, use that category.
- "maxPrice": the most the player should cost, for "under $X", "for $X or less", "at most $X".
- "price": the price in "should I pay $X" or "can teams bid $X".
- "money": the money the question says I have. "spots": the roster spots it says I have.
- "count": how many players it asks for.
- "affordable": true if it asks for players I can afford or "should go after".
- "positions": positions the question limits to, from "G" (guards), "F" (forwards), "C" (centers). Empty when it doesn't limit.
- "team": the NBA team the question limits to, as its abbreviation (BOS, LAL, NYK...).
- "players": player names exactly as written in the question.
- "unsupported": every condition in the question that none of the fields above can hold, in a few words each (for example "under 25 years old", "rookies", "good defenders", "plays every night"). Empty when every condition fits a field. Words a field already holds aren't conditions: "cheap" or "bargain" with a price, "left" or "available", "good" or "best". Never drop a condition silently: if it doesn't fit, list it here.

Copy numbers from the question only. Never invent one.

Examples:
"Best shot-blocker left for $10 or less?" → {"intent":"best","category":"blk","maxPrice":10,"players":[],"unsupported":[]}
"Top scoring guard on the Knicks?" → {"intent":"best","category":"pts","positions":["G"],"team":"NYK","players":[],"unsupported":[]}
"Best young rebounder?" → {"intent":"best","category":"reb","players":[],"unsupported":["young"]}
"I have $40 and 4 spots, who should I target?" → {"intent":"targets","money":40,"spots":4,"players":[]}
"My team is short on threes. Who should I go after?" → {"intent":"best","category":"tpm","affordable":true,"players":[]}
"Who can still outbid me at $25 for Jokic?" → {"intent":"afford","price":25,"players":["Jokic"]}
"Is $30 too much for Curry?" → {"intent":"verdict","price":30,"players":["Curry"]}
"Sabonis or Gobert for rebounds?" → {"intent":"compare","category":"reb","players":["Sabonis","Gobert"]}
"Did Ja Morant get traded?" → {"intent":"cannot_answer","players":["Ja Morant"]}
"What's the weather tomorrow?" → {"intent":"off_topic","players":[]}

Reply with the JSON object only.`;

export function parseMessages(question) {
  return [
    { role: 'system', content: PARSE_PROMPT },
    { role: 'user', content: question.slice(0, MAX_QUESTION) },
  ];
}

// Models sometimes wrap JSON in a code fence or add a sentence around it.
export function parseJson(raw) {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try {
    const r = JSON.parse(raw.slice(start, end + 1));
    return typeof r === 'object' && r ? r : null;
  } catch {
    return null;
  }
}

const INTENTS = new Set(['best', 'targets', 'weakest', 'afford', 'verdict', 'compare', 'player', 'cannot_answer', 'off_topic']);
const CATEGORY_LABELS = { fg: 'FG%', ft: 'FT%', tpm: '3PM', pts: 'PTS', reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK', tov: 'TO' };
const CATEGORY_KEYS = new Set(Object.keys(CATEGORY_LABELS));
const NUMBER_FIELDS = ['maxPrice', 'price', 'money', 'spots', 'count'];
const POSITIONS = new Set(['G', 'F', 'C']);

/**
 * Checks the model's request before anything runs. Returns { request, problems }.
 * Every number must appear in the question, so the model can't introduce one.
 */
export function checkRequest(raw, question) {
  if (!raw) return { request: null, problems: ['The reply was not valid JSON.'] };
  const problems = [];
  if (!INTENTS.has(raw.intent)) problems.push(`Unknown intent "${raw.intent}".`);
  const category = raw.category == null ? null : String(raw.category).toLowerCase();
  if (category && !CATEGORY_KEYS.has(category)) problems.push(`Unknown category "${raw.category}".`);
  const asked = new Set([...question.matchAll(/\d+/g)].map((m) => Number(m[0])));
  const nums = {};
  for (const f of NUMBER_FIELDS) {
    if (raw[f] == null) continue;
    const n = Number(raw[f]);
    if (!Number.isInteger(n) || n < 0) problems.push(`${f} is not a whole number.`);
    else if (!asked.has(n)) problems.push(`${f} ${n} isn't in the question.`);
    else nums[f] = n;
  }
  const strings = (xs, max) => (Array.isArray(xs) ? xs.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()).slice(0, max) : []);
  const players = strings(raw.players, MAX_LIST);
  const positions = strings(raw.positions, 3).map((x) => x.toUpperCase());
  if (positions.some((x) => !POSITIONS.has(x))) problems.push(`Unknown position in "${positions.join(', ')}".`);
  const team = typeof raw.team === 'string' && raw.team.trim() ? raw.team.trim().toUpperCase() : null;
  if (team && !/^[A-Z]{2,3}$/.test(team)) problems.push(`"${raw.team}" is not a team abbreviation.`);
  const unsupported = strings(raw.unsupported, 5).map((x) => x.slice(0, 60));
  return { request: { intent: raw.intent, category, ...nums, affordable: raw.affordable === true, positions, team, players, unsupported }, problems };
}

const money = (x) => `$${Math.round(x)}`;
const list = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0] ?? '');
const stat = (p, c) => (c.made ? `${Math.round((p[c.made] / p[c.att]) * 100)}% ${c.label}` : `${p[c.key].toFixed(1)} ${c.label}`);

/**
 * The board as code sees it, from what the app already computes: valuePlayers(),
 * livePrices(), teamSummaries(), and the Bid to price for each player.
 */
export function boardState({ categories, valued, picks, live, teams, myTeam, bidTo }) {
  const drafted = new Map(picks.map((p) => [p.playerId, p]));
  const available = valued.filter((p) => !drafted.has(p.id) && (live.prices.get(p.id) ?? 0) >= 0.5)
    .map((p) => ({ ...p, live: Math.round(live.prices.get(p.id)), bidTo: bidTo(p) }));
  const me = teams[myTeam];
  const byId = new Map(valued.map((p) => [p.id, p]));
  const totals = Object.fromEntries(categories.map((c) => [c.key, me.picks.reduce((a, pk) => a + (byId.get(pk.playerId)?.z?.[c.key] ?? 0), 0)]));
  return { categories, valued, available, drafted, teams, me, totals };
}

function resolve(name, board) {
  const found = findPlayer(name, board.valued, { drafted: new Set(board.drafted.keys()) });
  const p = found?.kind === 'player' ? found.player : found?.kind === 'suggest' ? found.options[0] : null;
  if (!p) return { error: `I couldn't find "${name}" on the board.` };
  const sold = board.drafted.get(p.id);
  if (sold) return { error: `${p.name} is already sold, to ${board.teams[sold.team].name} for $${sold.price}.`, player: p };
  const a = board.available.find((x) => x.id === p.id);
  return a ? { player: a } : { error: `${p.name} isn't priced on this board (below the players expected to be drafted).`, player: p };
}

const POSITION_WORDS = { G: 'guards', F: 'forwards', C: 'centers' };
const reply = (answer, extra = {}) => ({ status: 'ok', answer, players: [], teams: [], verdict: null, ...extra });
const decline = (status, answer) => ({ status, answer, players: [], teams: [], verdict: null });

/** Runs a checked request on the board. Everything in the answer comes from code. */
export function runRequest(req, board) {
  const { categories, available, me, teams, totals } = board;
  const cat = categories.find((c) => c.key === req.category) ?? null;
  const count = Math.min(MAX_LIST, Math.max(1, req.count ?? 3));
  const byCat = (c) => (a, b) => b.z[c.key] - a.z[c.key];
  const byWorth = (a, b) => b.bidTo - a.bidTo || b.live - a.live;
  const named = req.players.map((n) => resolve(n, board));
  const declines = ['off_topic', 'cannot_answer'].includes(req.intent);
  // A condition the request can't hold is never dropped: answering without it
  // would answer a different question ("forwards only" once came back as all
  // players). Say so instead.
  if (!declines && req.unsupported?.length) return decline('cannot_answer', `I can't filter by ${list(req.unsupported.map((u) => `"${u}"`))} yet, so I won't guess. Try asking without it.`);
  const positions = req.positions ?? [];
  if (req.team && !board.valued.some((p) => p.team === req.team)) return reply(`I don't know the team "${req.team}".`);
  // Listed positions (G, F, C, or pairs like G-F), not Yahoo's eligibility.
  const fits = (p) => (!positions.length || positions.some((x) => (p.pos ?? '').includes(x))) && (!req.team || p.team === req.team);
  const scope = [positions.length ? `among ${list(positions.map((x) => POSITION_WORDS[x]))}` : '', req.team ? `on ${req.team}` : ''].filter(Boolean).join(' ');
  if (req.category && !cat && !['off_topic', 'cannot_answer'].includes(req.intent)) return reply(`Your league doesn't score ${CATEGORY_LABELS[req.category]}, so it isn't on this board.`);

  switch (req.intent) {
    case 'off_topic':
      return decline('off_topic', 'I can only help with this draft.');
    case 'cannot_answer':
      return decline('cannot_answer', "I only know last season's stats and this draft board, not injuries, trades or news.");

    case 'best': {
      // Rookies have no NBA stats (ADR 0012), so they can't rank in a category.
      let pool = available.filter((p) => fits(p) && (!cat || p.z));
      if (req.maxPrice != null) pool = pool.filter((p) => p.live <= req.maxPrice);
      if (req.affordable) pool = pool.filter((p) => p.live <= me.maxBid);
      const top = [...pool].sort(cat ? byCat(cat) : byWorth).slice(0, count);
      const limit = `${scope ? ` ${scope}` : ''}${req.maxPrice != null ? ` at $${req.maxPrice} or less` : req.affordable ? ` you can afford (max bid $${me.maxBid})` : ''}`;
      if (!top.length) return reply(`No one left${limit}.`);
      const line = (p) => `${p.name} (${cat ? `${stat(p, cat)}, ` : ''}Live ${money(p.live)}, Bid to ${money(p.bidTo)})`;
      return reply(`Best${cat ? ` in ${cat.label}` : ''}${limit}: ${line(top[0])}.${top.length > 1 ? ` Then ${list(top.slice(1).map(line))}.` : ''}`, { players: top.map((p) => p.name) });
    }

    case 'targets': {
      const cash = req.money ?? me.left;
      const spots = req.spots ?? me.open;
      if (spots <= 0) return reply('Your roster is full.');
      const n = Math.min(count, spots);
      // Keep $1 for every spot beyond these, and spread the rest so one player
      // doesn't take it all: each pick costs at most 1.5x an even share.
      let allowance = cash - (spots - n);
      const picks = [];
      for (let k = 0; k < n; k++) {
        const share = allowance / (n - k);
        const cap = Math.min(allowance - (n - k - 1), Math.max(1, Math.floor(share * 1.5)));
        const p = available.filter((x) => fits(x) && !picks.includes(x) && x.live <= cap).sort(byWorth)[0];
        if (!p) break;
        picks.push(p);
        allowance -= p.live;
      }
      if (!picks.length) return reply(`Nothing fits $${cash} for ${spots} spots.`);
      const total = picks.reduce((a, p) => a + p.live, 0);
      return reply(`With $${cash} for ${spots} spots${scope ? `, ${scope}` : ''}: ${list(picks.map((p) => `${p.name} (Live ${money(p.live)})`))}. That's ${money(total)} at Live prices, leaving $1 for each other open spot.`, { players: picks.map((p) => p.name) });
    }

    case 'weakest': {
      if (!me.picks.length) return reply("Your roster is empty, so there's no weak spot yet. Ask for the best players instead.");
      const order = [...categories].sort((a, b) => totals[a.key] - totals[b.key]);
      const weak = order[0];
      const top = available.filter((p) => fits(p) && p.z && p.live <= me.maxBid).sort(byCat(weak)).slice(0, count);
      return reply(`You're weakest in ${weak.label}, then ${list(order.slice(1, 3).map((c) => c.label))}. Best fixes you can afford${scope ? ` ${scope}` : ''}: ${list(top.map((p) => `${p.name} (${stat(p, weak)}, Live ${money(p.live)})`))}.`, { players: top.map((p) => p.name) });
    }

    case 'afford': {
      const [n] = named;
      if (!n) return reply('Which player? Name him in the question.');
      if (n.error) return reply(n.error);
      const price = req.price ?? n.player.live;
      const can = teams.filter((t) => t.index !== me.index && t.maxBid >= price);
      return reply(can.length
        ? `${can.length} other ${can.length === 1 ? 'team' : 'teams'} can still bid $${price} on ${n.player.name}: ${list(can.map((t) => `${t.name} (max ${money(t.maxBid)})`))}.`
        : `No other team can bid $${price} on ${n.player.name}.`, { teams: can.map((t) => t.name), players: [n.player.name] });
    }

    case 'verdict': {
      const [n] = named;
      if (!n || req.price == null) return reply('Ask it as "should I pay $X for him?" with a player and a price.');
      if (n.error) return reply(n.error);
      const p = n.player;
      const ok = req.price <= p.bidTo;
      return reply(ok
        ? `Bid. $${req.price} is within his Bid to of ${money(p.bidTo)} (Live ${money(p.live)}).`
        : `Pass. $${req.price} is over his Bid to of ${money(p.bidTo)} (Live ${money(p.live)}).`, { verdict: ok ? 'bid' : 'pass', players: [p.name] });
    }

    case 'compare': {
      const found = named.filter((n) => n.player && !n.error).map((n) => n.player);
      if (found.length < 2) return reply(named.find((n) => n.error)?.error ?? 'Name two available players to compare.');
      const rookie = cat && found.find((p) => !p.z);
      if (rookie) return reply(`${rookie.name} is a rookie with no NBA stats yet, so I can't compare him in ${cat.label}. Ask without the category to compare prices.`);
      const ranked = [...found].sort(cat ? byCat(cat) : byWorth);
      const why = (p) => (cat ? stat(p, cat) : `Bid to ${money(p.bidTo)}`);
      return reply(`${ranked[0].name}${cat ? ` helps more in ${cat.label}` : ' is worth more to you'}: ${list(ranked.map((p) => `${p.name} ${why(p)}`))}.`, { players: ranked.map((p) => p.name) });
    }

    case 'player': {
      const [n] = named;
      if (!n) return reply('Which player? Name him in the question.');
      if (n.error) return reply(n.error);
      const p = n.player;
      const strong = p.z ? categories.filter((c) => p.z[c.key] >= 1).sort((a, b) => p.z[b.key] - p.z[a.key]).slice(0, 3) : [];
      // Say where the value comes from when it isn't plain stats (ADRs 0012 and 0013).
      const basis = p.rookie ? ` Rookie${p.pick ? `, drafted #${p.pick}` : ''}: valued from his draft slot, as he has no NBA stats yet.`
        : p.missesGames ? ' Value cut 10% for missing games in recent seasons.' : '';
      return reply(`${p.name}: Live ${money(p.live)}, Bid to ${money(p.bidTo)}.${strong.length ? ` Strong in ${list(strong.map((c) => c.label))}.` : ''}${basis}`, { players: [p.name] });
    }
  }
  return decline('cannot_answer', "I couldn't understand that. Try rephrasing.");
}
