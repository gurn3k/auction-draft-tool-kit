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
  assert.match(await page.textContent('#b-note'), /Your \$150 is lowered to \$\d+ so the prices add up to the league’s money\./);
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

test('two rookies logged by non-Latin names are two players, not one, and markup stays text', { skip }, async () => {
  const page = await open();
  for (const name of ['Ли Вэй', '김민수', '<b>Bold</b> & Co']) {
    assert.match(await logPick(page, name, 3, 1), /isn’t in the player data/);
    assert.match(await logPick(page, name, 3, 1), /logged by name only/, name);
  }
  await page.click('#tab-picks');
  assert.deepEqual(await page.$$eval('#panel-picks li > span:first-child', (xs) => xs.map((x) => x.textContent)),
    ['3. <b>Bold</b> & Co → Team 2', '2. 김민수 → Team 2', '1. Ли Вэй → Team 2']);
  assert.equal(await page.$$eval('#panel-picks b, #sold-strip b', (xs) => xs.filter((x) => x.textContent === 'Bold').length), 0);
  // The same name twice is still one player.
  await logPick(page, '김민수', 3, 2);
  assert.match(await logPick(page, '김민수', 3, 2), /already been drafted/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('a damaged save starts a fresh draft and says so, instead of a blank page, and a sound one comes back', { skip }, async () => {
  const teams2 = [{ name: 'Mine' }, { name: 'Theirs' }];
  const damaged = [
    '{not json',
    '{"league":{"teams":12},"draft":{}}',
    savedDraft({ teams: [{ name: 'A' }] }),
    savedDraft({ league: { teams: 2 }, teams: teams2, picks: [{ playerId: 'x', price: 'lots', team: 9 }] }),
    savedDraft({ myValues: { 'bdl-246': '50' } }),
  ];
  for (const storage of damaged) {
    const page = await open({ storage });
    assert.deepEqual(page.errors, [], storage);
    assert.match(await page.textContent('#log-msg'), /saved in this browser couldn’t be read/, storage);
    assert.match(await page.textContent('#setup-sum'), /\$200 budget · 12 teams · 13 spots/);
    assert.ok((await page.$$('#players-body tr[data-id]')).length > 100);
    assert.equal(await page.evaluate(() => localStorage.getItem('cap-drafter:v1:unreadable')), storage, 'the damaged copy is kept aside');
    await page.context().close();
  }
  // Saved before League setup had limits (a $5,000 budget was accepted then): still usable.
  let page = await open({ storage: savedDraft({ league: { teams: 2, budget: 5000 }, teams: teams2 }) });
  assert.equal(await page.textContent('#log-msg'), '');
  assert.match(await page.textContent('#setup-sum'), /\$5,000 budget · 2 teams/);
  await page.context().close();
  // A sound save comes back as it was, even with an unreadable display preference.
  const good = JSON.parse(savedDraft({ league: { teams: 2, budget: 100 }, teams: teams2, picks: [{ playerId: 'bdl-246', name: 'Nikola Jokic', price: 40, team: 1 }] }));
  page = await open({ storage: JSON.stringify({ ...good, tab: 'nowhere', sort: { key: 'constructor', dir: 1 } }) });
  assert.equal(await page.textContent('#log-msg'), '');
  assert.match(await page.textContent('#setup-sum'), /\$100 budget · 2 teams/);
  assert.equal(await page.textContent('#t-money'), '$160');
  assert.equal(await page.isVisible('#panel-me'), true);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

// Every width either side of each breakpoint (640, 720, 1180), with the bundled
// font and with a wider one that a phone or Linux may fall back to. Each element
// is measured against its own box, not the window.
const WIDTHS = [360, 390, 640, 641, 720, 721, 960, 1180, 1181, 1440];
test('at every width, even with a wider fallback font, nothing pushes the page sideways', { skip }, async () => {
  // A big league ($2,000 budgets), the longest team name allowed, a big sale, and a refusal showing.
  const teams = Array.from({ length: 20 }, (_, i) => ({ name: i === 0 ? 'My team' : i === 1 ? 'The Extremely Long Team Name Of Dunkers!' : `Team ${i + 1}` }));
  const storage = savedDraft({ league: { teams: 20, budget: 2000 }, teams, picks: [{ playerId: 'bdl-246', name: 'Nikola Jokic', price: 1999, team: 1 }] });
  const problems = [];
  for (const wide of [false, true]) {
    for (const width of WIDTHS) {
      const page = await open({ width, storage, context: { bypassCSP: true } });
      if (wide) await page.addStyleTag({ content: '* { font-family: "DejaVu Sans", Verdana, sans-serif !important; letter-spacing: 0.02em; }' });
      await page.fill('#search', 'Shai Gilgeous-Alexander');
      await page.evaluate(() => { document.getElementById('setup').open = true; });
      await page.fill('[name=teams]', '30');
      await page.press('[name=teams]', 'Tab');
      const found = await page.evaluate(() => {
        const sel = '.sold > *, .tick, .tick b, .b-prices > div, .b-bid, .b-title, .my-value, .log > *, .setup-grid > *, .board-head > *, .masthead-inner > *, .colophon-inner > *';
        const outside = [...document.querySelectorAll(sel)].filter((el) => el.offsetParent).filter((el) => {
          const r = el.getBoundingClientRect(), c = el.parentElement.getBoundingClientRect();
          return r.width && (r.left < c.left - 1 || r.right > c.right + 1);
        }).map((el) => el.textContent.trim().slice(0, 30));
        return { scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth, outside };
      });
      if (found.scroll || found.outside.length) problems.push(`${width}px${wide ? ' wide font' : ''}: scrolls ${found.scroll}px; outside: ${found.outside.join(' | ')}`);
      assert.deepEqual(page.errors, []);
      await page.context().close();
    }
  }
  assert.deepEqual(problems, []);
});

test('unticking the last category is refused with a reason', { skip }, async () => {
  const page = await open();
  for (const key of ['ft', 'tpm', 'pts', 'reb', 'ast', 'stl', 'blk', 'tov']) await page.uncheck(`#cat-boxes input[value=${key}]`);
  await page.click('#cat-boxes input[value=fg]');
  assert.equal(await page.isChecked('#cat-boxes input[value=fg]'), true);
  assert.match(await page.textContent('#setup-msg'), /at least one category/);
  await page.check('#cat-boxes input[value=pts]');
  assert.equal(await page.textContent('#setup-msg'), '');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('the privacy page says what Reset draft really clears, and opens from the app on this site', { skip }, async () => {
  const page = await open();
  assert.match(await logPick(page, 'Nikola Jokic', 70, 2), /for \$70/);
  await page.click('#players-body tr[data-id] td.player');
  await page.fill('#my-value', '45');
  await page.press('#my-value', 'Enter');
  await page.fill('#setup-form [name=budget]', '250');
  await page.press('#setup-form [name=budget]', 'Tab');
  await page.click('#reset-draft');
  // What the app does: the picks go; league settings and My values stay.
  assert.equal(await page.textContent('#pick-count'), '');
  assert.match(await page.textContent('#setup-sum'), /\$250 budget/);
  assert.match(await page.textContent('#my-values-count'), /1 player priced by you/);
  // What the privacy page says, reached from the app's own footer link.
  const href = await page.$eval('a[href$="privacy.html"]', (a) => a.href);
  assert.ok(href.startsWith(base), `${href} is on this site`);
  await page.goto(href);
  const stays = await page.textContent('main');
  assert.match(stays, /values you set yourself/);
  assert.match(stays, /Reset draft clears the picks and keeps the rest/);
  assert.doesNotMatch(stays, /or pressing Reset draft, deletes them/);
  await page.setViewportSize({ width: 360, height: 800 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('a My value that Live has to move says so plainly, up or down', { skip }, async () => {
  // Two teams of one spot each. I priced the 3rd and 4th best players at $3 and $2;
  // once one spot is gone, the last spot will be one of mine, and the money left is his.
  let page = await open();
  const ids = await page.$$eval('#players-body tr[data-id]', (xs) => xs.slice(0, 4).map((x) => x.dataset.id));
  await page.context().close();
  const storage = savedDraft({ league: { teams: 2, rosterSize: 1, budget: 20 }, teams: [{ name: 'My team' }, { name: 'Team 2' }], myValues: { [ids[2]]: 3, [ids[3]]: 2 }, picks: [{ playerId: ids[0], name: 'Top', price: 5, team: 1 }] });
  page = await open({ storage });
  assert.equal(await page.textContent('#t-money'), '$35');
  await page.click(`#players-body tr[data-id="${ids[2]}"] td.player`);
  assert.equal(await page.textContent('#b-live'), '$35');
  assert.match(await page.textContent('#b-note'), /Your \$3 is raised to \$\d+ so the prices add up to the league’s money\. Live is \$35, not \$\d+, so live prices add up to the \$35 left\./);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
