// Draft-room UI. All the maths lives in lib/; this file reads the forms, keeps
// state in memory (and in localStorage as a convenience) and renders.
import { CATEGORIES, YAHOO_DEFAULTS, livePrices, rosterSpots, valuePlayers } from './lib/valuation.js';
import { SCARCE_LEFT, addPick, bidCeiling, categorySupply, categoryTotals, checkPick, newDraft, removePick, scarceStrengths, teamSummaries } from './lib/draft.js';
import { projectionsFromCsv } from './lib/csv.js';
import { fitDrivers, fitFactor, fitStrength, needWeights, worthToYou } from './lib/fit.js';
import { findPlayer } from './lib/match.js';

const STORE = 'cap-drafter:v1';
const $ = (id) => document.getElementById(id);

function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) node.append(kid);
  return node;
}

const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const pct = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(n * 100).toFixed(1)}%`;
const fmtZ = (z) => (Math.abs(z) < 0.05 ? '0.0' : `${z > 0 ? '' : '−'}${Math.abs(z).toFixed(1)}`);
const zClass = (z) => (z >= 1.5 ? 'g3' : z >= 0.75 ? 'g2' : z >= 0.25 ? 'g1' : z <= -1.5 ? 'b3' : z <= -0.75 ? 'b2' : z <= -0.25 ? 'b1' : '');
const slug = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fold = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const state = {
  league: { ...YAHOO_DEFAULTS },
  draft: newDraft(YAHOO_DEFAULTS),
  source: 'bundled',
  csv: null, // { name, players }
  sort: { key: 'live', dir: -1 },
  fit: true, // Bid to follows Worth to you (ADR 0006)
  query: '',
  showDrafted: false,
  tab: 'me',
  selected: null,
};
let bundled = { players: [], season: '', source: '' };
let valued = [];
let valuedKey = '';

// ---------- persistence (a per-browser convenience; the app works without it) ----------
function save() {
  try {
    const { league, draft, source, csv, sort, fit, showDrafted, tab } = state;
    localStorage.setItem(STORE, JSON.stringify({ league, draft, source, csv, sort, fit, showDrafted, tab }));
  } catch { /* storage full or blocked: keep going in memory */ }
}
// Another tab saved (say, picks logged there): take its state so neither tab
// overwrites the other's picks with a stale copy.
window.addEventListener('storage', (e) => {
  if (e.key !== STORE || !e.newValue) return;
  load();
  fillSetup();
  render();
});
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (!saved?.league || !saved?.draft) return;
    Object.assign(state, saved);
    if (state.source === 'csv' && !state.csv) state.source = 'bundled';
  } catch { /* ignore a corrupt or unreadable save */ }
}

// ---------- derived data ----------
const players = () => (state.source === 'csv' && state.csv ? state.csv.players : bundled.players);
// The categories this league scores (all 9 unless the setup unticks some).
// Scarcity skips negative categories: nearly every low-minute player is "strong" in TO.
const supplyCats = () => cats().filter((c) => !c.negative);
const cats = () => CATEGORIES.filter((c) => (state.league.categories ?? CATEGORIES.map((x) => x.key)).includes(c.key));

function getValued() {
  const key = JSON.stringify([state.source, state.csv?.name, state.csv?.players.length, state.league]);
  if (key !== valuedKey) {
    valued = valuePlayers(players(), state.league, { categories: cats() });
    valuedKey = key;
  }
  return valued;
}

function derive() {
  const v = getValued();
  const live = livePrices(v, state.draft.picks, state.league);
  const teams = teamSummaries(state.draft, state.league);
  const me = teams[state.draft.myTeam];
  const byId = new Map(players().map((p) => [p.id, p]));
  for (const p of v) byId.set(p.id, p);
  // Players on a current roster with no stats to value (rookies, players who sat
  // out last season, or who played under the games minimum) still go on the
  // board, below everyone valued, so they can be found and logged.
  const vIds = new Set(v.map((p) => p.id));
  const board = [...v, ...players().filter((p) => !vIds.has(p.id) && (p.added || (p.team && p.team !== 'FA')))];
  // Worth to you (ADR 0006): Live tilted toward my roster's category gaps.
  const vById = new Map(v.map((p) => [p.id, p]));
  const totals = categoryTotals(me.picks.map((pk) => vById.get(pk.playerId)).filter(Boolean), cats());
  const strength = state.fit ? fitStrength(me.picks.length, state.league.rosterSize) : 0;
  const weights = needWeights(totals, cats(), strength);
  const fit = { strength, weights, replacement: live.replacement };
  fit.worth = (p) => worthToYou(live.prices.get(p.id) ?? 0, strength ? fitFactor(p, live.replacement, weights, cats()) : 1);
  return { v, board, live, teams, me, byId, fit };
}

// ---------- setup ----------
const form = $('setup-form');

function fillSetup() {
  for (const k of ['budget', 'teams', 'rosterSize', 'minGames']) form.elements[k].value = state.league[k];
  const on = new Set(cats().map((c) => c.key));
  $('cat-boxes').replaceChildren(...CATEGORIES.map((c) => el('label', { class: 'check' },
    el('input', { type: 'checkbox', name: 'cat', value: c.key, checked: on.has(c.key) }), ` ${c.label}`)));
  const sel = $('my-team-select');
  sel.replaceChildren(...state.draft.teams.map((t, i) => el('option', { value: i, selected: i === state.draft.myTeam }, `Team ${i + 1}${t.name.startsWith('Team ') || t.name === 'My team' ? '' : ` (${t.name})`}`)));
  form.querySelector(`input[name="source"][value="${state.source}"]`).checked = true;
  form.elements.fit.checked = state.fit;
  $('source-csv').disabled = !state.csv;
  $('csv-status').textContent = state.csv ? `Loaded ${state.csv.players.length} players from ${state.csv.name}.` : 'No file loaded. Columns: name, FGM/FGA (or FG%), FTM/FTA (or FT%), 3PM, PTS, REB, AST, STL, BLK, TO.';
  $('csv-status').classList.remove('error');
}

function setupSummary() {
  const l = state.league;
  const src = state.source === 'csv' ? state.csv.name : `${bundled.season} stats`;
  $('setup-sum').textContent = `${money(l.budget)} budget · ${l.teams} teams · ${l.rosterSize} spots · ${src}`;
}

function readLeague() {
  const n = (k) => Math.round(Number(form.elements[k].value));
  return { teams: n('teams'), budget: n('budget'), rosterSize: n('rosterSize'), minGames: n('minGames'), categories: state.league.categories };
}

function onLeagueChange() {
  const next = readLeague();
  const ok = next.teams >= 2 && next.teams <= 20 && next.budget >= 1 && next.rosterSize >= 1 && next.rosterSize <= 25 && next.minGames >= 0;
  // A number input also fires "change" on blur. Re-rendering then would swap the
  // table out from under the click that caused the blur, so do nothing if unchanged.
  if (!ok || JSON.stringify(next) === JSON.stringify(state.league)) return;
  const shapeChanged = next.teams !== state.league.teams || next.rosterSize !== state.league.rosterSize;
  if (shapeChanged && state.draft.picks.length) {
    if (!confirm('Changing teams or roster spots starts the draft over. Clear the picks logged so far?')) {
      fillSetup();
      return;
    }
  }
  if (next.teams !== state.league.teams) {
    const names = state.draft.teams;
    const myTeam = Math.min(state.draft.myTeam, next.teams - 1);
    state.draft = newDraft(next, myTeam);
    state.draft.teams = state.draft.teams.map((t, i) => names[i] ?? t);
  } else if (shapeChanged) {
    state.draft = { ...state.draft, picks: [] };
  }
  state.league = next;
  fillSetup();
  render();
}

form.addEventListener('change', (e) => {
  const name = e.target.name;
  if (name === 'myTeam') {
    const old = state.draft.myTeam;
    const i = Number(e.target.value);
    const teams = state.draft.teams.map((t, j) => {
      if (j === old && t.name === 'My team') return { name: `Team ${j + 1}` };
      if (j === i && t.name === `Team ${i + 1}`) return { name: 'My team' };
      return t;
    });
    state.draft = { ...state.draft, myTeam: i, teams };
    fillSetup();
    render();
  } else if (name === 'cat') {
    const picked = [...form.querySelectorAll('input[name="cat"]:checked')].map((x) => x.value);
    if (!picked.length) { e.target.checked = true; return; } // values need at least one category
    // All 9 is the default; store null so it reads as "standard 9-cat".
    state.league = { ...state.league, categories: picked.length === CATEGORIES.length ? null : picked };
    render();
  } else if (name === 'source') {
    state.source = e.target.value;
    render();
  } else if (name === 'fit') {
    state.fit = e.target.checked;
    render();
  } else if (['budget', 'teams', 'rosterSize', 'minGames'].includes(name)) {
    clearTimeout(typing);
    onLeagueChange();
  }
});
form.addEventListener('submit', (e) => e.preventDefault());
// Apply number fields as the user types, so by the time the field blurs (say, on a
// click in the player table) there is nothing left to re-render.
let typing;
// Teams and roster spots can clear the draft, so they wait for Enter or leaving the field.
form.addEventListener('input', (e) => {
  if (!['budget', 'minGames'].includes(e.target.name)) return;
  clearTimeout(typing);
  typing = setTimeout(onLeagueChange, 700);
});

$('yahoo-defaults').addEventListener('click', () => {
  for (const k of ['teams', 'rosterSize', 'minGames']) form.elements[k].value = YAHOO_DEFAULTS[k];
  form.elements.budget.value = YAHOO_DEFAULTS.budget;
  state.league = { ...state.league, categories: null }; // Yahoo's default is 9-cat
  onLeagueChange();
  fillSetup();
  render();
});

$('reset-draft').addEventListener('click', () => {
  if (state.draft.picks.length && !confirm(`Clear all ${state.draft.picks.length} picks? Team names and league settings stay.`)) return;
  state.draft = { ...state.draft, picks: [] };
  logMsg('Draft cleared.', 'ok');
  render();
});

$('csv-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const status = $('csv-status');
  const { players: rows, errors } = projectionsFromCsv(await file.text());
  if (!rows.length) {
    status.textContent = errors[0] ?? 'No players found in that file.';
    status.classList.add('error');
    return;
  }
  state.csv = { name: file.name, players: rows };
  state.source = 'csv';
  fillSetup();
  if (errors.length) {
    status.textContent = `Loaded ${rows.length} players. Skipped ${errors.length}: ${errors.slice(0, 2).join(' ')}${errors.length > 2 ? ' …' : ''}`;
  }
  render();
});

// ---------- logging picks ----------
const optionLabel = (p) => `${p.name}${p.team ? ` (${p.team === 'FA' ? 'free agent' : p.team})` : ''}`;

function logMsg(text, kind = '', ...extra) {
  const m = $('log-msg');
  m.replaceChildren(text, ...extra);
  m.className = `log-msg ${kind}`;
}

// A name not in the data is only logged by name after a second Enter on the same text.
let unknownPending = '';

function pickSuggestion(p) {
  $('log-player').value = optionLabel(p);
  logMsg(`${p.name} selected. Check the price and team, then press Enter.`);
  ($('log-price').value ? $('log-team') : $('log-price')).focus();
}

function resolvePlayer(text, byId) {
  const drafted = new Set(state.draft.picks.map((p) => p.playerId));
  const r = findPlayer(text, [...byId.values()], { drafted, label: optionLabel });
  if (!r) return { error: 'Type the player who was sold.' };
  if (r.kind === 'player') return { playerId: r.player.id, name: r.player.name };
  if (r.kind === 'suggest') return { suggest: r.options };
  // Not in the data (a rookie, or a typo). It still costs money and a roster spot,
  // so it is logged by name, but only once the user confirms the spelling.
  const t = text.trim();
  if (unknownPending !== t) {
    unknownPending = t;
    return { error: `“${t}” isn’t in the player data. Check the spelling, or press Enter again to log him by name (for a rookie).` };
  }
  return { playerId: `custom-${slug(t)}`, name: t, custom: true };
}

$('log-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const { byId } = derive();
  const who = resolvePlayer($('log-player').value, byId);
  const price = Number($('log-price').value);
  const team = Number($('log-team').value);
  if (state.draft.picks.length >= state.league.teams * state.league.rosterSize) return logMsg('The draft is over: every roster is full.', 'error');
  if (who.error) return logMsg(who.error, 'error');
  if (who.suggest) {
    if (who.suggest.length === 1) {
      $('log-player').value = optionLabel(who.suggest[0]);
      return logMsg(`Did you mean ${optionLabel(who.suggest[0])}? Press Enter again to log him.`, 'error');
    }
    return logMsg('Which player? ', 'error', ...who.suggest.flatMap((p, i) => [i ? ' ' : '',
      el('button', { type: 'button', class: 'suggest', onclick: () => pickSuggestion(p) }, optionLabel(p))]));
  }
  unknownPending = '';
  const pick = { playerId: who.playerId, name: who.name, price, team };
  const error = checkPick(state.draft, state.league, pick);
  if (error) return logMsg(error, 'error');
  state.draft = addPick(state.draft, state.league, pick);
  const teamName = state.draft.teams[team].name;
  logMsg(`${who.name} to ${teamName} for ${money(price)}.${who.custom ? ' Not in the player data, so logged by name only.' : ''}`, 'ok');
  $('log-player').value = '';
  $('log-price').value = '';
  state.selected = null;
  state.teamChosen = false; // the next sale needs its buyer chosen afresh
  render();
  $('log-player').focus();
});

// A typed name that matches one player puts him on the block, as a click on his row does.
$('log-player').addEventListener('input', () => {
  const { byId } = derive();
  const drafted = new Set(state.draft.picks.map((p) => p.playerId));
  const r = findPlayer($('log-player').value, [...byId.values()], { drafted, label: optionLabel });
  const id = r?.kind === 'player' ? r.player.id : null;
  if (id === state.selected || (!id && !state.selected)) return;
  state.selected = id;
  render();
});

$('log-team').addEventListener('change', () => { state.teamChosen = $('log-team').value !== ''; });
// Enter on the team list logs the pick, like Enter in the name or price box.
$('log-team').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  state.teamChosen = $('log-team').value !== '';
  $('log-form').requestSubmit();
});
// The browser blocks an empty or bad price/team itself; say why in the message line.
$('log-form').addEventListener('invalid', (e) => {
  const why = { 'log-price': 'Enter the price he sold for (whole dollars, $1 or more).', 'log-team': 'Choose the team that bought him.', 'log-player': 'Type the player who was sold.' };
  logMsg(why[e.target.id] ?? 'Check the pick.', 'error');
}, true);

// Rows are picked on mousedown, before any open edit (a team name, a setting)
// blurs and re-renders the table, so the row under the pointer is the one chosen.
$('players-body').addEventListener('mousedown', (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (!tr || e.button !== 0) return;
  e.preventDefault(); // focus moves to the price box below, not to the row
  const { board, live, me } = derive();
  const p = board.find((x) => x.id === tr.dataset.id);
  if (!p || state.draft.picks.some((pk) => pk.playerId === p.id)) return;
  state.selected = p.id;
  $('log-player').value = optionLabel(p);
  $('log-price').focus();
  render();
});

// ---------- board ----------
function teamLabel(p) {
  const team = p.team === 'FA' ? 'Free agent' : p.team;
  return [team, p.pos].filter(Boolean).join(' · ');
}

const COLUMNS = [
  { key: 'rank', label: 'Rk', cls: 'rk', title: 'Pre-draft rank' },
  { key: 'name', label: 'Player', cls: 'player' },
  { key: 'value', label: 'Value', cls: 'val', title: 'Pre-draft dollar value' },
  { key: 'live', label: 'Live', cls: 'live', title: 'Value re-priced with the money and spots left' },
  { key: 'bid', label: 'Bid to', cls: 'bid', title: 'Live, adjusted for your roster’s needs, capped by your max bid' },
  'CATS',
  { key: 'total', label: 'Total', cls: 'sep', title: 'Sum of category z-scores' },
  { key: 'gp', label: 'GP', title: 'Games played' },
  { key: 'mpg', label: 'MPG', title: 'Minutes per game' },
];
// Category columns follow the league's categories.
const columns = () => COLUMNS.flatMap((c) => (c === 'CATS'
  ? cats().map((k, i) => ({ key: `z.${k.key}`, label: k.label, cls: `cat${i === 0 ? ' sep' : ''}`, title: `${k.label} z-score` }))
  : [c]));

function sortValue(row, key) {
  if (key === 'name') return fold(row.p.name);
  if (key === 'live') return row.live;
  if (key === 'bid') return row.bid;
  if (key.startsWith('z.')) return row.p.z?.[key.slice(2)] ?? -Infinity;
  if (key === 'rank') return row.p.rank ?? Infinity;
  return row.p[key] ?? -Infinity;
}

function renderHead() {
  const { key, dir } = state.sort;
  $('players-head').replaceChildren(...columns().map((c) => el('th', {
    class: c.cls, scope: 'col', title: c.title,
    'aria-sort': c.key === key ? (dir < 0 ? 'descending' : 'ascending') : null,
  }, el('button', {
    type: 'button',
    onclick: () => {
      state.sort = c.key === key ? { key, dir: -dir } : { key: c.key, dir: c.key === 'name' || c.key === 'rank' ? 1 : -1 };
      render();
    },
  }, c.label, c.key === key ? el('span', { class: `caret ${dir < 0 ? 'down' : 'up'}`, 'aria-hidden': 'true' }) : ''))));
}

const searchHit = (p, q) => !q || fold(`${p.name} ${(p.aliases ?? []).join(' ')} ${p.team ?? ''} ${p.pos ?? ''}`).includes(q);

let lastLive = new Map(); // player id → the rounded live price last shown
function renderBoard({ v, board, live, me, fit, repriced }) {
  const drafted = new Map(state.draft.picks.map((p) => [p.playerId, p]));
  const q = fold(state.query.trim());
  let rows = board
    .filter((p) => state.showDrafted || !drafted.has(p.id))
    .filter((p) => searchHit(p, q))
    .map((p) => {
      const lv = live.prices.get(p.id) ?? 0;
      return { p, live: lv, bid: drafted.has(p.id) || lv < 0.5 ? 0 : bidCeiling(fit.worth(p), me), pick: drafted.get(p.id) };
    });
  let { key, dir } = state.sort;
  if (key.startsWith('z.') && !cats().some((c) => `z.${c.key}` === key)) ({ key, dir } = state.sort = { key: 'live', dir: -1 });
  rows.sort((a, b) => {
    const x = sortValue(a, key), y = sortValue(b, key);
    return (x < y ? -1 : x > y ? 1 : 0) * dir || (a.p.rank ?? 1e9) - (b.p.rank ?? 1e9) || fold(a.p.name).localeCompare(fold(b.p.name));
  });
  const total = rows.length;
  rows = rows.slice(0, 400); // plenty for a draft; keeps re-renders instant
  $('board-count').textContent = `${total} ${state.showDrafted ? 'players' : 'available'}`;
  const shown = new Map(board.map((p) => [p.id, Math.round(live.prices.get(p.id) ?? 0)]));
  const before = lastLive;
  const moved = (id) => repriced && before.has(id) && before.get(id) !== shown.get(id);
  lastLive = shown;

  const body = $('players-body');
  if (!rows.length) {
    body.replaceChildren(el('tr', { class: 'empty' }, el('td', { colspan: columns().length }, v.length ? 'No players match.' : 'No players meet the minimum games.')));
    return;
  }
  body.replaceChildren(...rows.map(({ p, live: lv, bid, pick }) => {
    const delta = lv >= 1 && p.value >= 1 ? Math.round(lv) - Math.round(p.value) : 0;
    const relit = !pick && moved(p.id);
    const liveCell = pick
      ? el('td', { class: 'live' }, money(pick.price))
      : el('td', { class: relit ? 'live relit' : 'live' }, lv >= 0.5 ? money(lv) : '—',
        delta ? el('span', { class: `delta ${delta > 0 ? 'up' : 'down'}` }, `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`) : null);
    return el('tr', {
      class: [pick ? 'drafted' : '', state.selected === p.id ? 'picked' : ''].join(' ').trim() || null,
      'data-id': p.id,
      title: pick ? `Drafted by ${state.draft.teams[pick.team].name} for ${money(pick.price)}` : null,
    },
    el('td', { class: 'rk' }, p.rank ?? '—'),
    el('td', { class: 'player', title: p.aliases?.length ? `Also listed as ${p.aliases.join(', ')}` : null },
      el('span', { class: 'nm' }, p.name), el('span', { class: 'meta' }, teamLabel(p)),
      p.added ? el('span', { class: 'tag', title: 'On a 2026-27 roster, with no 2025-26 stats to value' }, p.rookie ? 'Rookie' : 'No 2025-26 stats')
        : !p.z ? el('span', { class: 'tag', title: `Played fewer than the ${state.league.minGames} games needed to be valued` }, `${p.gp} GP`) : null),
    el('td', { class: 'val' }, p.value >= 0.5 ? money(p.value) : '—'),
    liveCell,
    el('td', { class: relit ? 'bid relit' : 'bid' }, bid ? money(bid) : ''),
    ...cats().map((c, i) => (p.z
      ? el('td', { class: `cat ${zClass(p.z[c.key])}${i === 0 ? ' sep' : ''}` }, fmtZ(p.z[c.key]))
      : el('td', { class: `cat${i === 0 ? ' sep' : ''}` }, ''))),
    el('td', { class: 'sep' }, p.total == null ? '—' : fmtZ(p.total)),
    el('td', {}, p.added ? '—' : p.gp),
    el('td', {}, p.mpg ? p.mpg.toFixed(1) : '—'));
  }));
  if (total > rows.length) {
    body.append(el('tr', { class: 'empty' }, el('td', { colspan: columns().length }, `Showing the first ${rows.length} of ${total}. Filter to find others.`)));
  }
}

// ---------- side panels ----------
function renderMe({ me, byId, v, teams, board }) {
  const mine = me.picks.map((pk) => ({ pick: pk, p: byId.get(pk.playerId) }));
  const valuedById = new Map(v.map((p) => [p.id, p]));
  const totals = categoryTotals(mine.map((m) => valuedById.get(m.pick.playerId)).filter(Boolean), cats());
  const scale = Math.max(4, ...Object.values(totals).map(Math.abs));

  const roster = el('ul', { class: 'roster' },
    mine.map(({ pick, p }) => el('li', {},
      el('span', {}, pick.name ?? p?.name ?? pick.playerId, p?.team ? el('span', { class: 'hint' }, ` ${p.team}`) : null),
      el('span', { class: 'price' }, money(pick.price)))),
    me.open > 0 ? el('li', {}, el('span', { class: 'open' }, `${me.open} open spot${me.open === 1 ? '' : 's'}`), el('span', { class: 'hint' }, '$1+ each')) : null);

  // The categories to chase (shortest first) and the ones already covered.
  const list = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0]);
  const ranked = cats().map((c) => ({ label: c.label, z: totals[c.key] })).sort((a, b) => a.z - b.z);
  const short = ranked.filter((c) => c.z < 0.5).slice(0, 2).map((c) => c.label);
  const strong = ranked.filter((c) => c.z >= 1).reverse().slice(0, 2).map((c) => c.label);
  const readout = [short.length ? `Short in ${list(short)}.` : '', strong.length ? `Strongest in ${list(strong)}.` : ''].filter(Boolean).join(' ');

  // On a wide screen the room sits under My team, so no tab switch is needed mid-bid.
  const room = el('div', { class: 'room-wide' },
    el('p', { class: 'panel-h' }, 'The room'),
    el('table', { class: 'teams' },
      el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Team'), el('th', { scope: 'col' }, 'Left'), el('th', { scope: 'col' }, 'Open'), el('th', { scope: 'col', title: 'Most this team can bid right now' }, 'Max bid'))),
      el('tbody', {}, teams.map((t) => el('tr', { class: t.index === state.draft.myTeam ? 'mine' : null },
        el('td', {}, t.name), el('td', {}, money(t.left)), el('td', {}, t.open), el('td', {}, t.open ? money(t.maxBid) : '—'))))));

  const catBars = el('div', { class: 'cats' }, cats().flatMap((c) => {
    const z = totals[c.key];
    const w = (Math.min(Math.abs(z), scale) / scale) * 50;
    const bar = el('span', { class: `bar ${z >= 0 ? 'pos' : 'neg'}` });
    bar.style.width = `${w}%`;
    bar.style.left = z >= 0 ? '50%' : `${50 - w}%`;
    return [el('span', { class: 'lbl' }, c.label), el('span', { class: 'track' }, bar), el('span', { class: 'num' }, fmtZ(z))];
  }));

  // How many strong players are left in each category, scarce ones lit.
  const drafted = new Set(state.draft.picks.map((pk) => pk.playerId));
  const supply = categorySupply(board.filter((p) => !drafted.has(p.id)), supplyCats());
  const supplyRow = el('div', { class: 'supply' }, supplyCats().map((c) => el('span', { class: supply[c.key] <= SCARCE_LEFT ? 'scarce' : null },
    el('small', {}, c.label), String(supply[c.key]))));
  supplyRow.style.setProperty('--n', supplyCats().length);

  $('panel-me').replaceChildren(...[
    el('p', { class: 'panel-sum' }, `${money(me.left)} left · ${me.open} open`),
    mine.length ? el('p', { class: 'readout' }, readout || 'No category stands out yet.') : null,
    mine.length ? catBars : el('p', { class: 'empty-note' }, 'Your category strengths appear here once you buy players.'),
    mine.length ? el('p', { class: 'cats-note' }, 'Sum of your players’ z-scores. Short and red bars are categories to target, or to punt.') : null,
    el('p', { class: 'panel-h' }, 'Strong players left'),
    supplyRow,
    el('p', { class: 'cats-note' }, `Undrafted players with a z-score of 1 or more. Lit at ${SCARCE_LEFT} or fewer.`),
    el('p', { class: 'panel-h' }, 'Roster'),
    roster,
    room,
  ].filter(Boolean));
}

function renderTeams({ teams }) {
  $('panel-teams').replaceChildren(el('table', { class: 'teams' },
    el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Team'), el('th', { scope: 'col' }, 'Left'), el('th', { scope: 'col' }, 'Open'), el('th', { scope: 'col', title: 'Most this team can bid right now' }, 'Max bid'))),
    el('tbody', {}, teams.map((t) => el('tr', { class: t.index === state.draft.myTeam ? 'mine' : null },
      el('td', {}, el('input', {
        value: t.name, 'aria-label': `Name for team ${t.index + 1}`, maxlength: 40,
        onchange: (e) => {
          const name = e.target.value.trim() || `Team ${t.index + 1}`;
          state.draft = { ...state.draft, teams: state.draft.teams.map((x, i) => (i === t.index ? { name } : x)) };
          fillSetup();
          render();
        },
      })),
      el('td', {}, money(t.left)),
      el('td', {}, t.open),
      el('td', {}, t.open ? money(t.maxBid) : '—'))))));
}

function renderPicks() {
  const picks = state.draft.picks;
  $('pick-count').textContent = picks.length ? `(${picks.length})` : '';
  $('panel-picks').replaceChildren(picks.length
    ? el('ul', { class: 'roster' }, [...picks].reverse().map((pk, i) => el('li', {},
      el('span', {}, `${picks.length - i}. ${pk.name ?? pk.playerId}`, el('span', { class: 'hint' }, ` → ${state.draft.teams[pk.team]?.name ?? '?'}`)),
      el('span', {}, el('span', { class: 'price' }, money(pk.price)), ' ',
        el('button', {
          type: 'button', class: 'quiet', 'aria-label': `Undo ${pk.name}`,
          onclick: () => { state.draft = removePick(state.draft, pk.playerId); logMsg(`Removed ${pk.name}.`, 'ok'); render(); },
        }, 'Undo')))))
    : el('p', { class: 'empty-note' }, 'Picks you log appear here, newest first. Undo any of them.'));
}

function selectTab(tab) {
  state.tab = tab;
  for (const t of ['me', 'teams', 'picks']) {
    $(`tab-${t}`).setAttribute('aria-selected', String(t === tab));
    $(`tab-${t}`).tabIndex = t === tab ? 0 : -1;
    $(`panel-${t}`).hidden = t !== tab;
  }
}
for (const t of ['me', 'teams', 'picks']) $(`tab-${t}`).addEventListener('click', () => { selectTab(t); save(); });
document.querySelector('.tabs').addEventListener('keydown', (e) => {
  const order = ['me', 'teams', 'picks'];
  const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
  if (!step) return;
  const next = order[(order.indexOf(state.tab) + step + order.length) % order.length];
  selectTab(next);
  $(`tab-${next}`).focus();
});


// ---------- ticker, options, render ----------
// After a sale (or an undo) re-prices the room, figures that moved relight once.
let lastPickCount = null;
function relight(node) {
  node.classList.remove('relit');
  void node.offsetWidth; // restart the animation on an element that already ran it
  node.classList.add('relit');
}
function setFigure(id, text, repriced) {
  const node = $(id);
  if (repriced && node.textContent && node.textContent !== text) relight(node);
  node.textContent = text;
}

function renderTicker({ live, me, repriced }) {
  const total = state.league.teams * state.league.budget;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  setFigure('t-money', money(live.moneyLeft), repriced);
  $('t-money-note').textContent = `of ${money(total)}`;
  setFigure('t-slots', String(live.slotsLeft), repriced);
  $('t-slots-note').textContent = `of ${rosterSpots(state.league)}`;
  const infl = $('t-infl');
  setFigure('t-infl', state.draft.picks.length ? pct(live.inflation) : '0.0%', repriced);
  infl.title = 'Above zero: players left cost more than their pre-draft value, because others have bought bargains.';
  $('t-infl-note').textContent = !state.draft.picks.length || Math.abs(live.inflation) <= 0.005
    ? 'Players left are at their pre-draft values'
    : live.inflation > 0 ? 'Others bought bargains, so the rest cost more' : 'The room has overpaid, so the rest cost less';
  setFigure('t-mine', money(me.left), repriced);
  $('t-mine-note').textContent = plural(me.open, 'spot open', 'spots open');
  setFigure('t-max', me.open ? money(me.maxBid) : 'Full', repriced);
  $('t-max-note').textContent = me.open > 1 ? '$1 held for each other spot' : me.open === 1 ? 'Your last spot' : 'Your roster is full';
}

// The player up for bid: the one clicked on the board or typed in the pick form.
// The jersey plate: number, team and position for the player on the block.
function renderPlate(p) {
  const num = p?.jersey ?? '';
  $('pl-num').textContent = p ? num || '—' : '#';
  $('pl-num').classList.toggle('long', num.length > 1);
  $('pl-team').textContent = p?.team ?? '';
  $('pl-pos').textContent = p?.pos ?? '';
  $('b-plate').setAttribute('aria-label', p ? (num ? `Number ${num}` : 'Number unknown') : 'No player on the block');
}

function renderBlock({ board, live, me, teams, fit }) {
  const drafted = new Set(state.draft.picks.map((p) => p.playerId));
  const p = state.selected && !drafted.has(state.selected) ? board.find((x) => x.id === state.selected) : null;
  $('block').classList.toggle('empty', !p);
  // The price box hints at the bid ceiling for the player on the block, and only him.
  $('log-price').placeholder = p && (live.prices.get(p.id) ?? 0) >= 0.5 ? String(bidCeiling(fit.worth(p), me)) : '';
  renderPlate(p);
  if (!p) {
    $('b-name').textContent = 'No one on the block';
    $('b-meta').textContent = 'Type the nominated player in the board’s search box, or click his row.';
    $('b-cats').replaceChildren();
    $('b-note').textContent = '';
    $('b-scarce').hidden = true;
    $('b-flag').hidden = true;
    for (const id of ['b-value', 'b-live', 'b-bid']) $(id).textContent = '—';
    $('b-bid-note').textContent = me.open ? `Your max bid is ${money(me.maxBid)}` : 'Your roster is full';
    return;
  }
  const lv = live.prices.get(p.id) ?? 0;
  const worth = fit.worth(p);
  const bid = lv >= 0.5 ? bidCeiling(worth, me) : 0;
  $('b-name').textContent = p.name;
  $('b-meta').textContent = ['On the block', teamLabel(p), p.rank ? `#${p.rank} pre-draft` : ''].filter(Boolean).join(' · ');
  $('b-cats').style.setProperty('--n', cats().length);
  $('b-cats').replaceChildren(...(p.z ? cats().map((c) => el('span', { class: zClass(p.z[c.key]) || null }, el('small', {}, c.label), fmtZ(p.z[c.key]))) : []));
  const list = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0]);
  let note;
  if (!p.z && !p.added) {
    note = `Only ${p.gp} games in 2025-26, under your ${state.league.minGames}-game minimum, so he has no value here. Lower the minimum to price him, or log him by name if he sells.`;
  } else if (!p.z) {
    note = 'No 2025-26 stats, so he has no value here. If he sells, log him by name to keep the budgets right.';
  } else {
    const ranked = cats().map((c) => ({ label: c.label, z: p.z[c.key] }));
    const strong = ranked.filter((c) => c.z >= 1).sort((a, b) => b.z - a.z).slice(0, 3).map((c) => c.label);
    const weak = ranked.filter((c) => c.z <= -0.75).sort((a, b) => a.z - b.z).slice(0, 2).map((c) => c.label);
    const open = teams.filter((t) => t.open > 0);
    const afford = open.filter((t) => t.maxBid >= Math.round(lv)).length;
    note = [
      strong.length ? `Strong in ${list(strong)}` : 'No standout category',
      weak.length ? `; costs you ${list(weak)}.` : '.',
      lv >= 0.5 ? ` ${afford === open.length ? 'Every team' : `${afford} of ${open.length} teams`} can still afford him at Live.` : '',
    ].join('');
  }
  $('b-note').textContent = note;
  // A hand-kept note (ADR 0010): context on the data, never a change to the price.
  $('b-flag').hidden = !p.note;
  $('b-flag').textContent = p.note ? `Note: ${p.note}` : '';
  // Warn when he's one of the last few strong players in a category, so a gap
  // doesn't become unfixable without the price itself being inflated.
  const supply = categorySupply(board.filter((x) => !drafted.has(x.id)), supplyCats());
  const scarce = scarceStrengths(p, supply, supplyCats());
  $('b-scarce').hidden = !scarce.length;
  $('b-scarce').textContent = scarce.length
    ? `Scarce: ${scarce.map((c) => (c.left === 1 ? `the last player strong in ${c.label}` : `one of the last ${c.left} strong in ${c.label}`)).join(' · ')}`
    : '';
  $('b-value').textContent = p.value >= 0.5 ? money(p.value) : '—';
  $('b-live').textContent = lv >= 0.5 ? money(lv) : '—';
  $('b-bid').textContent = bid ? money(bid) : '—';
  // Say what moved Bid to away from Live: my max bid, or my roster's needs.
  const fitReason = (labels, dir, w) => {
    const short = labels.every((l) => w[cats().find((c) => c.label === l).key] > 1);
    if (!labels.length) return 'fit with your roster';
    if (dir > 0 && short) return `fills ${list(labels)}, where you’re short`;
    if (dir < 0 && !labels.some((l) => w[cats().find((c) => c.label === l).key] > 1)) return `you’re already strong in ${list(labels)}`;
    return `fit with your roster (${labels.join(', ')})`;
  };
  const tilt = Math.round(worth) - Math.round(lv);
  const drivers = tilt ? fitDrivers(p, fit.replacement, fit.weights, cats(), Math.sign(tilt)).slice(0, 2) : [];
  $('b-bid-note').textContent = !me.open ? 'Your roster is full'
    : !bid ? 'Worth $1 at most here'
      : bid < Math.round(worth) ? `Capped at your ${money(me.maxBid)} max bid`
        : tilt ? `${tilt > 0 ? '+' : '−'}${money(Math.abs(tilt))} on Live: ${fitReason(drivers, tilt, fit.weights)}`
          : `Live price, under your ${money(me.maxBid)} max`;
}

function renderSold() {
  const picks = state.draft.picks;
  const strip = $('sold-strip');
  strip.hidden = !picks.length;
  const SHOWN = 6;
  const more = picks.length - SHOWN;
  strip.replaceChildren(el('span', { class: 'b-label' }, 'Sold'),
    ...[...picks].reverse().slice(0, SHOWN).map((pk) => el('span', {}, `${pk.name ?? pk.playerId} `, el('b', {}, money(pk.price)),
      el('span', { class: 'to' }, ` ${state.draft.teams[pk.team]?.name ?? '?'}`))),
    more > 0 ? el('button', { type: 'button', class: 'more', onclick: () => { selectTab('picks'); save(); $('tab-picks').focus(); } }, `+${more} more in Picks`) : null);
}

function renderOptions({ byId, teams }) {
  const drafted = new Set(state.draft.picks.map((p) => p.playerId));
  const avail = [...byId.values()].filter((p) => !drafted.has(p.id)).sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999) || fold(a.name).localeCompare(fold(b.name)));
  // Aliases are offered too, so typing "Doncic" still suggests Dončić.
  const teamOf = (p) => optionLabel(p).slice(p.name.length);
  $('player-options').replaceChildren(...avail.flatMap((p) => [
    el('option', { value: optionLabel(p) }),
    ...(p.aliases ?? []).map((a) => el('option', { value: `${a}${teamOf(p)}`, label: `${optionLabel(p)}` })),
  ]));
  const sel = $('log-team');
  const current = state.teamChosen ? sel.value : '';
  sel.replaceChildren(el('option', { value: '' }, 'Who bought him?'),
    ...teams.map((t) => el('option', { value: t.index, disabled: t.open <= 0 }, `${t.name}${t.open > 0 ? ` (max ${money(t.maxBid)})` : ' (full)'}`)));
  sel.value = current !== '' && teams[current]?.open > 0 ? current : '';
  sel.required = teams.some((t) => t.open > 0); // once every roster is full, let the submit say so
}

function render() {
  const d = derive();
  d.repriced = lastPickCount !== null && lastPickCount !== state.draft.picks.length;
  lastPickCount = state.draft.picks.length;
  renderHead();
  renderBoard(d);
  renderTicker(d);
  renderBlock(d);
  renderSold();
  renderOptions(d);
  renderMe(d);
  renderTeams(d);
  renderPicks();
  setupSummary();
  selectTab(state.tab);
  save();
}

// The search box doubles as the nomination box: a name that matches one player
// puts him on the block, and Enter nominates the top row and moves on to the price.
function nominate(p) {
  state.selected = p.id;
  $('log-player').value = optionLabel(p);
}
$('search').addEventListener('input', (e) => {
  state.query = e.target.value;
  const { board, byId } = derive();
  const drafted = new Set(state.draft.picks.map((p) => p.playerId));
  const q = fold(state.query.trim());
  const exact = q ? findPlayer(state.query, [...byId.values()], { drafted, label: optionLabel }) : null;
  const hits = q ? board.filter((p) => !drafted.has(p.id) && searchHit(p, q)) : [];
  if (exact?.kind === 'player') nominate(exact.player);
  else if (hits.length === 1) nominate(hits[0]);
  render();
});
$('search').addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.query) {
    e.target.value = state.query = '';
    render();
    return;
  }
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const tr = $('players-body').querySelector('tr[data-id]:not(.drafted)');
  const p = tr && derive().board.find((x) => x.id === tr.dataset.id);
  if (!p) return;
  nominate(p);
  render();
  $('log-price').focus();
});
$('show-drafted').addEventListener('change', (e) => { state.showDrafted = e.target.checked; render(); });

// ---------- boot ----------
load();
try {
  bundled = await (await fetch('data/players.json')).json();
} catch {
  logMsg('Could not load the bundled player data. Upload a projections CSV in League setup.', 'error');
}
$('bundled-label').textContent = `${bundled.season || 'Bundled'} per-game stats`;
$('data-note').replaceChildren(
  'Bundled data: ', el('a', { href: bundled.sourceUrl || '#' }, bundled.source || 'unavailable'),
  bundled.fetchedAt ? `, fetched ${bundled.fetchedAt}.` : '',
  bundled.rostersUpdatedAt
    ? ` Teams from ${bundled.rosterSeason} rosters, ${bundled.rostersUpdatedAt.slice(0, 10)}. Rostered players missing from those stats (mostly rookies) are listed without values.`
    : " Teams are where each player finished last season.");
$('show-drafted').checked = state.showDrafted;
if (state.draft.picks.length) $('setup').open = false;
fillSetup();
render();
