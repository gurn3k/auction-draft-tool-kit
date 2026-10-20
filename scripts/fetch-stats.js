// Builds the bundled baseline from balldontlie: last season's per-game averages
// and current rosters. Needs BALLDONTLIE_API_KEY on a plan with season averages
// and active players (ADR 0007). Pass --cached to rebuild from the saved copy
// without fetching.
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { buildPlayers, buildRookieHistory } from './bdl.js';

const SEASON = 2025; // balldontlie names a season by the year it starts
const HISTORY_FROM = 2017; // first draft class in the rookie history (ADR 0012)
const HISTORY = 'site/data/rookie-history.json';
const LABEL = '2025-26';
const ROSTER_SEASON = '2026-27';
const API = 'https://api.balldontlie.io/v1/';
const RAW = '.scratch/raw/bdl';
const NAMES = 'data/display-names.json';
const NOTES = 'data/player-notes.json';
const OUT = 'site/data/players.json';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path) {
  const key = process.env.BALLDONTLIE_API_KEY;
  if (!key) throw new Error('Set BALLDONTLIE_API_KEY (in .env.local).');
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(API + path, { headers: { Authorization: key } });
    if (res.ok) return res.json();
    // The rate limit can be as low as 5 requests a minute, so wait it out.
    if (res.status !== 429 || attempt === 8) throw new Error(`${path} → HTTP ${res.status}`);
    await pause(15000 * attempt);
  }
}

async function all(path) {
  const rows = [];
  let cursor;
  do {
    const page = await get(`${path}${path.includes('?') ? '&' : '?'}per_page=100${cursor ? `&cursor=${cursor}` : ''}`);
    rows.push(...page.data);
    cursor = page.meta?.next_cursor;
  } while (cursor);
  return rows;
}

let averages;
let active;
let pulledAt = new Date().toISOString();
if (process.argv.includes('--cached')) {
  // A rebuild keeps the date the data was pulled, not today's.
  pulledAt = JSON.parse(await readFile(OUT, 'utf8')).rostersUpdatedAt ?? pulledAt;
  averages = JSON.parse(await readFile(`${RAW}/season-averages-${SEASON}-regular.json`, 'utf8'));
  active = JSON.parse(await readFile(`${RAW}/active-players.json`, 'utf8'));
} else {
  averages = await all(`season_averages/general?season=${SEASON}&season_type=regular&type=base`);
  active = await all('players/active');
  await mkdir(RAW, { recursive: true });
  await writeFile(`${RAW}/season-averages-${SEASON}-regular.json`, JSON.stringify(averages));
  await writeFile(`${RAW}/active-players.json`, JSON.stringify(active));
}

// Past seasons, for the rookie history. Each is saved once and never refetched:
// a finished season's averages don't change. A missing one is fetched even with
// --cached when a key is set, as it doesn't change this season's data.
const bySeason = { [SEASON]: averages };
for (let season = HISTORY_FROM; season < SEASON; season++) {
  const file = `${RAW}/season-averages-${season}-regular.json`;
  const saved = await access(file).then(() => true, () => false);
  if (saved) bySeason[season] = JSON.parse(await readFile(file, 'utf8'));
  else if (!process.argv.includes('--cached') || process.env.BALLDONTLIE_API_KEY) {
    console.log(`Fetching ${season}-${String(season + 1).slice(2)} season averages…`);
    bySeason[season] = await all(`season_averages/general?season=${season}&season_type=regular&type=base`);
    await writeFile(file, JSON.stringify(bySeason[season]));
  }
}
const history = buildRookieHistory(bySeason);
await writeFile(HISTORY, JSON.stringify({ source: 'balldontlie, regular season per-game averages in each draft class\'s first season', ...history }));
console.log(`Wrote ${history.players.length} rookie seasons from the ${history.classes.join(', ')} draft classes to ${HISTORY}.`);

const { names } = JSON.parse(await readFile(NAMES, 'utf8'));
const { notes } = JSON.parse(await readFile(NOTES, 'utf8'));
const players = buildPlayers(averages, active, { names, notes, rookieYear: SEASON + 1 });
const out = {
  season: LABEL,
  source: `balldontlie, ${LABEL} regular season per-game averages`,
  sourceUrl: 'https://www.balldontlie.io/',
  fetchedAt: pulledAt.slice(0, 10),
  rostersSource: 'balldontlie active players',
  rostersUpdatedAt: pulledAt,
  rosterSeason: ROSTER_SEASON,
  players,
};
await writeFile(OUT, JSON.stringify(out));
const added = players.filter((p) => p.added);
console.log(`Wrote ${players.length} players to ${OUT}: ${players.length - added.length} with ${LABEL} stats, ${added.length} rostered without (${added.filter((p) => p.rookie).length} rookies).`);
