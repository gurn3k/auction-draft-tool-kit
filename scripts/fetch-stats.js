// Builds the bundled baseline from balldontlie: last season's per-game averages
// and current rosters. Needs BALLDONTLIE_API_KEY on a plan with season averages
// and active players (ADR 0007). Pass --cached to rebuild from the saved copy
// without fetching.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { buildPlayers } from './bdl.js';

const SEASON = 2025; // balldontlie names a season by the year it starts
const LABEL = '2025-26';
const ROSTER_SEASON = '2026-27';
const API = 'https://api.balldontlie.io/v1/';
const RAW = '.scratch/raw/bdl';
const NAMES = 'data/display-names.json';
const VALUES = 'data/value-overrides.json';
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

const { names } = JSON.parse(await readFile(NAMES, 'utf8'));
const { values } = JSON.parse(await readFile(VALUES, 'utf8'));
const players = buildPlayers(averages, active, { names, values, rookieYear: SEASON + 1 });
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
