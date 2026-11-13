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

// Types into a League setup box and leaves it, as a person would.
async function setField(page, name, value) {
  await page.fill(`#setup-form [name=${name}]`, String(value));
  await page.press(`#setup-form [name=${name}]`, 'Tab');
}

test('League setup refuses settings it cannot use, says why, and keeps the last good ones', { skip }, async () => {
  const page = await open();
  const summary = () => page.textContent('#setup-sum');
  assert.equal(await page.textContent('#setup-msg'), '');
  await setField(page, 'teams', 30);
  assert.match(await page.textContent('#setup-msg'), /Teams must be a whole number from 2 to 20/);
  assert.equal(await page.getAttribute('[name=teams]', 'aria-invalid'), 'true');
  assert.match(await summary(), /12 teams/);
  await setField(page, 'teams', 2);
  assert.equal(await page.textContent('#setup-msg'), '');
  assert.match(await summary(), /2 teams/);
  await setField(page, 'minGames', '1e1');
  assert.match(await page.textContent('#setup-msg'), /Minimum games must be a whole number/);
  await setField(page, 'minGames', 15);
  await setField(page, 'budget', 1);
  assert.match(await page.textContent('#setup-msg'), /Budget per team must be a whole number from \$13 to \$2,000/);
  assert.match(await summary(), /\$200 budget/);
  assert.doesNotMatch(await page.textContent('#t-max'), /-/);
  // With a pick logged, the budget can't fall below what that team needs.
  await setField(page, 'budget', 200);
  assert.match(await logPick(page, 'Nikola Jokic', 150, 1), /for \$150/);
  await setField(page, 'budget', 100);
  assert.match(await page.textContent('#setup-msg'), /Team 2 has already spent \$150 and has 12 spots to fill, so the budget can’t go below \$162/);
  assert.match(await summary(), /\$200 budget/);
  await setField(page, 'budget', 162);
  assert.equal(await page.textContent('#setup-msg'), '');
  assert.match(await summary(), /\$162 budget/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('typed prices, budgets and My values are read as whole dollars or refused out loud, never misread', { skip }, async () => {
  const page = await open();
  const typePrice = (text) => logPick(page, 'Tyrese Maxey', text, 2);
  assert.match(await typePrice('0,5'), /whole dollars, and “0,5” has cents/);
  assert.match(await typePrice('12,5'), /“12,5” has cents/);
  assert.match(await typePrice('1.200'), /could be \$1,200 or \$1\.20/);
  assert.match(await typePrice('1,200'), /can bid at most \$188/, '1,200 is read as $1,200');
  assert.match(await typePrice('-5'), /at least \$1/);
  assert.match(await typePrice('lots'), /isn’t an amount/);
  assert.equal(await page.textContent('#pick-count'), '', 'nothing logged so far');
  assert.match(await typePrice('$56'), /Tyrese Maxey to Team 3 for \$56/);

  // The budget box reads money the same way.
  await page.fill('#setup-form [name=budget]', '2,5');
  await page.press('#setup-form [name=budget]', 'Tab');
  assert.match(await page.textContent('#setup-msg'), /Budget per team: .*“2,5” has cents/);
  assert.match(await page.textContent('#setup-sum'), /\$200 budget/);
  await page.fill('#setup-form [name=budget]', '1,000');
  await page.press('#setup-form [name=budget]', 'Tab');
  assert.match(await page.textContent('#setup-sum'), /\$1,000 budget/);

  // So do My values, on the board and on the card.
  const cell = '#players-body tr[data-id]:not(.drafted) td.val[data-edit]';
  const id = await page.$eval(cell, (td) => td.closest('tr').dataset.id);
  await page.click(cell);
  await page.keyboard.type('1,5');
  await page.keyboard.press('Enter');
  assert.match(await page.textContent('#log-msg'), /My value: .*“1,5” has cents/);
  assert.equal(await page.$eval(`tr[data-id="${id}"] td.val`, (td) => td.classList.contains('mine')), false);
  await page.keyboard.press('Escape');
  await page.click(`tr[data-id="${id}"] td.player`);
  await page.fill('#my-value', '1.200');
  await page.press('#my-value', 'Enter');
  assert.match(await page.textContent('#log-msg'), /My value: .*could be \$1,200 or \$1\.20/);
  await page.fill('#my-value', '$40');
  await page.press('#my-value', 'Enter');
  assert.match(await page.textContent('#log-msg'), /to \$40/);
  assert.equal(await page.textContent('#b-value'), '$40');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
