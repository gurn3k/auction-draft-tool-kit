// The page in a real browser: what a manager sees while logging picks.
// Uses Playwright when it is installed on the machine. It isn't a dependency of
// this repo, so without it (as in CI) these tests are skipped, and say so.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

let chromium = null;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch { /* not installed: skip */ }
const skip = chromium ? false : 'Playwright is not installed on this machine';

const root = fileURLToPath(new URL('..', import.meta.url));
const STORE = 'cap-drafter:v1';
let server;
let browser;
let base;

const freePort = () => new Promise((resolve) => {
  const s = createServer().listen(0, '127.0.0.1', () => {
    const { port } = s.address();
    s.close(() => resolve(port));
  });
});

before(async () => {
  if (skip) return;
  const port = await freePort();
  base = `http://127.0.0.1:${port}/`;
  server = spawn(process.execPath, ['scripts/serve.js'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (d) => String(d).includes('Serving') && resolve());
    server.on('exit', (code) => reject(new Error(`preview server exited (${code})`)));
  });
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.kill();
});

// A fresh page. The first-visit guide is marked as seen so it doesn't cover the
// page, unless a test asks for a first visit. `storage` seeds a saved draft once.
async function open({ width = 1280, height = 900, storage, firstVisit = false, context: options = {} } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, ...options });
  await context.addInitScript(({ s, store, first }) => {
    if (!first) localStorage.setItem('cap-drafter:help-seen', '1');
    if (s != null && !sessionStorage.getItem('seeded')) {
      localStorage.setItem(store, s);
      sessionStorage.setItem('seeded', '1');
    }
  }, { s: storage ?? null, store: STORE, first: firstVisit });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(base);
  await page.waitForSelector('#players-body tr');
  return page;
}

async function logPick(page, name, price, team) {
  await page.fill('#log-player', name);
  await page.fill('#log-price', '');
  await page.type('#log-price', String(price));
  await page.selectOption('#log-team', String(team));
  await page.click('#log-form button[type=submit]');
  return page.textContent('#log-msg');
}

test('the Sold strip lists recent sales and nothing else', { skip }, async () => {
  const page = await open();
  assert.match(await logPick(page, 'Nikola Jokic', 70, 0), /to My team for \$70/);
  assert.deepEqual(await page.$$eval('#sold-strip > *', (xs) => xs.map((x) => x.textContent)), ['Sold', 'Nikola Jokic $70 My team']);
  for (const [i, name] of ['Victor Wembanyama', 'Shai Gilgeous-Alexander', 'Tyrese Maxey', 'Kawhi Leonard', 'Luka Doncic', 'Anthony Edwards'].entries()) {
    assert.match(await logPick(page, name, 5, i + 1), /for \$5/);
    assert.doesNotMatch(await page.textContent('#sold-strip'), /null|undefined/);
  }
  assert.match(await page.textContent('#sold-strip'), /\+1 more in Picks$/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

// A saved draft in the shape the app writes, for seeding a page.
function savedDraft({ league = {}, picks = [], myValues = {}, teams } = {}) {
  const l = { teams: 12, budget: 200, rosterSize: 13, minGames: 15, categories: null, ...league };
  const names = teams ?? Array.from({ length: l.teams }, (_, i) => ({ name: i === 0 ? 'My team' : `Team ${i + 1}` }));
  return JSON.stringify({ league: l, draft: { teams: names, myTeam: 0, picks }, source: 'bundled', csv: null, myValues, sort: { key: 'live', dir: -1 }, fit: true, showDrafted: false, tab: 'me', minGames15: true });
}
const columnTotal = (page, cls) => page.$$eval(`#players-body td.${cls}`, (xs) => xs.reduce((a, x) => a + (Number((x.firstChild?.textContent ?? '').replace(/[$,]/g, '')) || 0), 0));

test('the Value column adds up to the league money, and My values that no longer fit are scaled and say so', { skip }, async () => {
  let page = await open();
  assert.equal(await columnTotal(page, 'val'), 2400);
  assert.match(await logPick(page, 'Nikola Jokic', 80, 3), /for \$80/);
  assert.equal(await columnTotal(page, 'live'), 2320);
  // Ten values of $150, set in a $200 league, then the budget drops to $100.
  const top = await page.$$eval('#players-body tr[data-id]', (xs) => xs.slice(0, 10).map((x) => x.dataset.id));
  await page.context().close();
  page = await open({ storage: savedDraft({ league: { budget: 100 }, myValues: Object.fromEntries(top.map((id) => [id, 150])) }) });
  assert.equal(await columnTotal(page, 'val'), 1200);
  await page.click(`#players-body tr[data-id="${top[0]}"] td.player`);
  assert.match(await page.textContent('#b-note'), /Your \$150 is scaled to \$\d+, so your values and \$1 for every other spot fit/);
  assert.equal(await page.inputValue('#my-value'), '150');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
