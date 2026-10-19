// "Ask the board" (ADR 0008): a plain-English question about the live draft,
// answered by a language model from a snapshot of the board. Code computes every
// fact; the model only reads them. Before an answer is shown, verifyReply()
// checks every player and number in it against the snapshot. Pure functions, so
// the server, the eval and the tests share them.

import { nameKey } from './names.js';

// How many available players the snapshot lists, best first. About 4,000 tokens.
export const BOARD_ROWS = 250;
export const MAX_QUESTION = 300;
export const MAX_ANSWER_WORDS = 70;

export const SYSTEM_PROMPT = `You help one manager during a fantasy basketball salary cap (auction) draft.
Answer only from the BOARD below. It was computed by code and is the only truth you have.

Rules:
- Only recommend players listed under AVAILABLE. Copy names exactly as written there.
- Only use dollar amounts and stats that appear in the BOARD or the question. Never estimate or round them.
- "Live" is the market price now. "Bid to" is the most this manager should pay, already adjusted for their roster and capped at what they can afford.
- "Under $X" means a Live price of $X or less. "Can afford" means a team's Max bid is at least the price.
- Stats are per game from last season. You don't know about injuries, trades, news or this season. If the question needs that, say so.
- If the question isn't about this draft, don't answer it.
- Answer in at most ${MAX_ANSWER_WORDS} words. Lead with the recommendation.

Reply with JSON only:
{"status": "ok" | "off_topic" | "cannot_answer",
 "answer": "your answer in plain English",
 "players": ["players you recommend, best first, exact names from AVAILABLE"],
 "teams": ["team names, only if the question asks which teams"],
 "verdict": "bid" | "pass" | null (only for "should I pay $X for him?" questions)}`;

const round1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const pct = (made, att) => (att ? String(Math.round((made / att) * 100)) : '');
const dollars = (x) => Math.max(0, Math.round(x));

/**
 * The board as text for the model, plus everything verifyReply() needs.
 * `valued` is valuePlayers() output, `live` livePrices(), `teams` teamSummaries(),
 * `worth(p)` the Worth to you price and `bidTo(p)` the Bid to price for player p.
 */
export function boardSnapshot({ league, categories, valued, picks, live, teams, myTeam, worth, bidTo, rows = BOARD_ROWS }) {
  const drafted = new Set(picks.map((p) => p.playerId));
  const me = teams[myTeam];
  const available = valued.filter((p) => !drafted.has(p.id) && (live.prices.get(p.id) ?? 0) >= 0.5).slice(0, rows);
  const allowedDollars = new Set([league.budget, league.teams * league.budget, live.moneyLeft]);
  const allowedDecimals = new Set();
  // Dollars are kept as numbers and stats as the exact text the model sees.
  const add = (set, xs) => xs.forEach((x) => x !== '' && set.add(set === allowedDollars ? Number(x) : String(x)));

  const lines = [];
  lines.push(`LEAGUE: ${league.teams} teams, $${league.budget} each, ${league.rosterSize} roster spots. Money left in the room: $${dollars(live.moneyLeft)}. Spots left: ${live.slotsLeft}. Inflation: ${Math.round(live.inflation * 100)}%.`);
  lines.push(`CATEGORIES: ${categories.map((c) => c.label).join(', ')}${categories.some((c) => c.negative) ? ' (fewer TO is better)' : ''}.`);

  // My roster and how it stacks up, computed here so the model never has to.
  const myPicks = picks.filter((p) => p.team === myTeam);
  const byId = new Map(valued.map((p) => [p.id, p]));
  const totals = Object.fromEntries(categories.map((c) => [c.key, myPicks.reduce((a, pk) => a + (byId.get(pk.playerId)?.z?.[c.key] ?? 0), 0)]));
  const order = [...categories].sort((a, b) => totals[b.key] - totals[a.key]);
  lines.push('');
  lines.push(`MY TEAM (${me.name}): $${me.left} left, ${me.open} spots open, max bid $${me.maxBid}.`);
  lines.push(myPicks.length ? `Roster: ${myPicks.map((p) => `${p.name} $${p.price}`).join(', ')}.` : 'Roster: empty.');
  if (myPicks.length) lines.push(`Strongest categories: ${order.slice(0, 3).map((c) => c.label).join(', ')}. Weakest: ${order.slice(-3).reverse().map((c) => c.label).join(', ')}.`);
  add(allowedDollars, [me.left, me.maxBid, ...myPicks.map((p) => p.price)]);

  lines.push('');
  lines.push('TEAMS (name, money left, spots open, max bid):');
  for (const t of teams) {
    lines.push(`${t.name}, $${t.left}, ${t.open}, $${t.maxBid}`);
    add(allowedDollars, [t.left, t.maxBid]);
  }

  lines.push('');
  lines.push(`AVAILABLE (best first; per game, last season): Player, Team, Pos, Live, Bid to, ${categories.map((c) => c.label).join(', ')}`);
  for (const p of available) {
    const lv = dollars(live.prices.get(p.id));
    const bid = bidTo(p);
    const stats = categories.map((c) => (c.made ? pct(p[c.made], p[c.att]) : round1(p[c.key])));
    lines.push([p.name, p.team, p.pos, `$${lv}`, `$${bid}`, ...stats].join(', '));
    add(allowedDollars, [lv, bid, dollars(worth(p))]);
    add(allowedDecimals, stats);
  }

  const sold = picks.map((p) => `${p.name} $${p.price} to ${teams[p.team]?.name ?? '?'}`);
  add(allowedDollars, picks.map((p) => p.price));
  lines.push('');
  lines.push(sold.length ? `SOLD: ${sold.join('; ')}.` : 'SOLD: nobody yet.');

  return {
    text: lines.join('\n'),
    available: new Map(available.map((p) => [nameKey(p.name), p])),
    draftedNames: new Set(picks.map((p) => nameKey(p.name))),
    teamNames: new Set(teams.map((t) => t.name.toLowerCase())),
    allowedDollars,
    allowedDecimals,
  };
}

export function messages(snapshot, question) {
  return [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\nBOARD\n${snapshot.text}` },
    { role: 'user', content: question.slice(0, MAX_QUESTION) },
  ];
}

// Models sometimes wrap JSON in a code fence or add a sentence around it.
export function parseReply(raw) {
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

const numbersIn = (s) => [...s.matchAll(/\$\s?(\d[\d,]*)/g)].map((m) => m[1].replace(/,/g, ''));
const decimalsIn = (s) => [...s.replace(/\$\s?\d[\d,]*(\.\d+)?/g, '').matchAll(/(?<![\d.])(\d+\.\d+)(?![\d.])/g)].map((m) => m[1]);

/**
 * Checks a parsed reply against the snapshot. Returns a list of problems; empty
 * means it can be shown. The question's own numbers count as allowed, so "I have
 * $20" can be repeated back.
 */
export function verifyReply(reply, snapshot, question) {
  const problems = [];
  if (!reply) return ['The reply was not valid JSON.'];
  if (!['ok', 'off_topic', 'cannot_answer'].includes(reply.status)) problems.push(`Unknown status "${reply.status}".`);
  if (typeof reply.answer !== 'string' || !reply.answer.trim()) problems.push('No answer text.');
  const answer = typeof reply.answer === 'string' ? reply.answer : '';
  const players = Array.isArray(reply.players) ? reply.players : [];
  const teams = Array.isArray(reply.teams) ? reply.teams : [];
  if (reply.status !== 'ok' && players.length) problems.push('Recommended players on a reply that is not an answer.');
  if (answer.split(/\s+/).length > MAX_ANSWER_WORDS * 1.5) problems.push('Answer is too long.');

  for (const name of players) {
    if (typeof name !== 'string' || !snapshot.available.has(nameKey(name))) problems.push(`"${name}" is not an available player.`);
  }
  for (const t of teams) {
    if (typeof t !== 'string' || !snapshot.teamNames.has(t.toLowerCase())) problems.push(`"${t}" is not a team in this league.`);
  }
  if (reply.verdict != null && !['bid', 'pass'].includes(reply.verdict)) problems.push(`Unknown verdict "${reply.verdict}".`);

  const asked = new Set(numbersIn(question));
  for (const n of numbersIn(answer)) {
    if (!snapshot.allowedDollars.has(Number(n)) && !asked.has(n)) problems.push(`$${n} is not on the board.`);
  }
  const askedDecimals = new Set(decimalsIn(question));
  for (const d of decimalsIn(answer)) {
    if (!snapshot.allowedDecimals.has(d) && !askedDecimals.has(d)) problems.push(`${d} is not a stat on the board.`);
  }

  // A sold player may come up only if the question named him.
  const q = nameKey(question);
  const a = ` ${nameKey(answer)} `;
  for (const n of snapshot.draftedNames) {
    if (a.includes(` ${n} `) && !q.includes(n)) problems.push(`Mentions ${n}, who is already sold.`);
  }
  return problems;
}
