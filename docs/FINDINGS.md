# Findings: review and fixes, 2026-11-13

I went looking for ways to break Cap Drafter's one promise: every price adds up to the money left in the room.

- **Found:** 18 problems. The worst: the Value column added up to $2,402 in a $2,400 league, and My values could push the board $300 past the league's money.
- **Fixed:** all 18. Each fix has a test that failed on the old code and passes now.
- **Tests:** 54 before, 90 after.
- **Still open:** a few small items, listed under [Open](#open).

The rest of this page is the detail, for anyone checking my work.

## How I checked

- The full test suite, before and after every fix.
- Trying to break it on a local preview, with no deploy: empty, huge and wrong-type entries, other number formats, non-English names, markup in names, double clicks, Undo and refresh.
- The money promise, on 350 seeded random leagues (2 to 20 teams, 1 to 25 spots, $1 a spot up to $400, random categories, 0 to 82 minimum games), with random My values, rookie values on or off, and random legal picks.
- A headless browser at 360, 390, 640, 641, 720, 721, 960, 1180, 1181 and 1440 px, either side of every breakpoint, with the bundled font and with a wider fallback font.
- A security read of the page code, `vercel.json`, the preview server and the data scripts, and the privacy page's claims against what the app stores and sends.
- The figures in the README, PRD and decision records against what the code gives today.
- What a deploy uploads.

**Tests in detail.** Before: 54, all passing. After: 90. With Playwright on the machine, 90 of 90 pass. Without it, as in CI, 80 pass and the 10 page tests in `test/browser.test.js` say they were skipped. I ran a clean clone that way to check CI passes.

I've also reviewed the product myself in a browser.

## Fixed

Each finding lists how to reproduce it, the promise it broke, what happened, how serious it was, and its status.

### 1. The Value column added up to $2,402 in a $2,400 league

Steps: open the app with Yahoo defaults and add up the Value column.

Promise broken: "Pre-draft values add up to exactly teams × budget" (PRD). The README says 156 players are priced at exactly $2,400.

What happened: each price was rounded on its own for display. Without rookie values it happened to come to $2,400. The app always loads them, and then it came to $2,402. Live prices after sales were off by a dollar or two the same way.

Seriousness: medium. This is the promise the product is built on.

Status: fixed, with tests. Prices are whole dollars, rounded down, with the leftover dollars going to the largest fractions. No price moves more than $1 ([ADR 0002](adr/0002-valuation-method.md), step 7). The cost: two players with the same exact share, such as rookies in the same pick range, can end up $1 apart. The tests check the bundled data, 200 random leagues with My values and rookies, the rounding rule, a league with less money than spots, and a rookie with no estimate, who can no longer set replacement level.

### 2. My values could push prices past the league's money

Steps:
1. With Yahoo defaults, price the top 10 players at $150 each. That's allowed.
2. Lower the budget to $100.

Or, live: price players, then log sales that spend more than expected, or reach the point where every open spot is a player I priced.

Promise broken: "Everyone else is re-priced around it, so totals still add up to the league's money" (README, ADR 0011).

What happened: the board was priced at $1,500 in a $1,200 league. Live, the prices left could miss the money left: in one seeded league they came to $34 with $89 left.

Seriousness: medium. It breaks the promise for anyone using My values, and nothing said so.

Status: fixed, with tests. Values that don't fit are scaled down together, never under $1. Once every open spot is a player I priced, the money left is shared among them. The card says when my value was raised or lowered and why, and the box keeps showing what I typed. ADR 0011 records this. 150 random leagues check it live.

### 3. The Sold strip printed "null" after one to six picks

Steps: log one pick, then read the Sold strip.

Promise broken: "Logging a pick takes one click on the board plus a price" (PRD success criteria), with a readable record of it.

What happened: under seven picks there's no "+N more" button. The code passed `null` in its place and the browser printed it.

Seriousness: low. Status: fixed, with test.

### 4. "0,5" logged a $5 sale, "12,5" a $125 sale, and "1,5" set a $15 My value

Steps: type `0,5` as the price and log the pick. Or type `1,5` as a player's value on the board.

Promise broken: "Illegal picks … are refused with a reason" (PRD). An unclear entry should be refused out loud, not read as a different number.

What happened: the browser's number boxes dropped the comma. `1.200` was refused with a message that didn't say why.

Seriousness: medium. These are wrong numbers that look right.

Status: fixed, with tests. One reader handles the price, budget and both My value boxes:
- read as dollars: `56`, `$56`, `1,200`, `1 200` (with plain, no-break, narrow or thin spaces), `1.200.000`
- refused, showing both readings: `1.200` ($1,200 or $1.20)
- refused, with the reason: cents, negatives, words, `5e2`, `0x10`, blanks, digits outside 0-9, and more than 15 digits

### 5. League setup ignored values it couldn't use, and accepted budgets that can't work

Steps:
1. Type 30 teams. The box shows 30, the league stays at 12, and nothing says why.
2. Set a $1 budget with 13 spots.
3. Log a $150 sale, then lower the budget to $100.
4. Type `1e1` as the minimum games.

Promise broken: "Illegal picks … are refused with a reason" (PRD), and the money promise.

What happened: out-of-range values were dropped without a word. A $1 budget left no team able to fill its roster. The budget could fall below what a team had spent. 12.5 teams became 13, and `1e1` games became 10.

Seriousness: medium. Status: fixed, with tests. Setup names the problem under the form, marks the box, and keeps the last good settings. It takes whole numbers in the digits 0-9: 2 to 20 teams, 1 to 25 spots, 0 to 82 games, and a budget from $1 a spot up to $2,000 that covers what every team has spent plus $1 for each spot it still has to fill.

### 6. A second rookie with a non-Latin name couldn't be logged

Steps: log "Ли Вэй", then "김민수", each by name.

Promise broken: "A player missing from the data can still be logged by name, so the budget maths stays right" (PRD item 7).

What happened: the second was refused as already drafted. Both names got the id `custom-`.

Seriousness: medium. Status: fixed, with tests. Latin names keep their old ids, so saved drafts still match.

### 7. A projections CSV with a blank or cut-off row was valued on zeros nobody typed

Steps: upload a CSV with a blank PTS cell, or a row cut short.

Promise broken: CSV upload (PRD item 7), with bad rows reported.

What happened: blank cells read as 0. `-13`, `0x10` (read as 16), `1e1`, and more makes than attempts were all accepted.

Seriousness: medium. Status: fixed, with tests. The row is skipped, and the message names the row and why. Blank minutes, and a blank percentage for a player with no attempts, are still fine. The bundled stats written out as a CSV import all 582 players with the same values.

### 8. A damaged saved draft left the board empty on every reload

Steps: leave a save like `{"league":{"teams":12},"draft":{}}` in the browser, then reload. Or a My value saved as text, `"50"`.

Promise broken: "Survives a refresh" (PRD item 9).

What happened: a script error on every reload, with an empty board, until the browser's storage was cleared by hand. A My value saved as text was added to the money as text. Unreadable saves were dropped without a word.

Seriousness: medium, but rare. Status: fixed, with tests. A save's shape is checked before use: league, teams, picks, My values and an uploaded CSV. A damaged one is copied aside in the browser, a fresh draft starts, and the pick line says so. A draft saved before League setup had limits, with a $5,000 budget say, still loads. A display setting that can't be read falls back to its default without losing the draft.

### 9. A games minimum of 0 valued 84 players on zeros and dropped rookie estimates

Steps: set Minimum games to 0, then find AJ Dybantsa, the first pick.

Promise broken: "Rookies are priced from what past rookies taken in the same range of picks were worth" (How it works). League setup allows 0.

What happened: every rostered player with no 2025-26 stats was scored as if he'd played and put up zeros. Dybantsa went from $6 to nothing, and his card called him an undrafted rookie.

Seriousness: medium to low. Status: fixed, with test. A player needs at least one game to be valued, and rookies keep their estimates.

### 10. The privacy page said Reset draft deletes your data

Steps: log a pick, set a My value, press Reset draft, then read the privacy page.

Promise broken: "Clearing your browser's site data, or pressing Reset draft, deletes them" (privacy page).

What happened: Reset draft clears the picks only. League settings, team names, My values and an uploaded CSV stay. The page also left My values and team names out of what's saved, and the app's Privacy link pointed at the live site, so the local preview left the site.

Seriousness: medium. A page that promises to delete data has to be right about it.

Status: fixed, with test. The page now says clearing site data deletes everything, and Reset draft clears the picks.

### 11. At phone width the page scrolled sideways with long team names and big budgets

Steps: at 360 or 390 px, log a sale to a team with a 40-character name in a $2,000 league, with a player on the block. Try it with a wider fallback font too.

Promise broken: "no page-level horizontal scroll" at phone width (PRD).

What happened: 7 px of sideways scroll at 360 px with the bundled font. With the wider font, 131 px at 360 and 101 px at 390. The Sold entry, the money left and the block's prices ran past their boxes.

Seriousness: low to medium. Status: fixed, with test. All 20 width and font combinations are clean, each element measured against its own box.

### 12. Deploys uploaded the hand-kept data, the CI config and the licence

Steps: compare the repo's top-level folders with `.vercelignore`.

Promise broken: only what the hosted app needs leaves this machine.

What happened: `data/`, `.github/` and `LICENSE` went up on every deploy, though nothing serves them.

Seriousness: low. Status: fixed, with test. Not checked on a real deploy.

### 13. The README quoted values the app no longer shows

Steps: open the app with Yahoo defaults and compare the top three values with the README.

Promise broken: the README's "With Yahoo defaults: Nikola Jokić $71, Victor Wembanyama $66, Shai Gilgeous-Alexander $61".

What happened: those were the values before rookie values and the missed-games discount. The app shows $75, $70 and $64. The README also said 54 tests. The PRD still called choosing categories future work and left the games question open, though both had shipped. ADR 0012 and 0013 gave results for the old 20-game default without saying so.

Seriousness: low. Status: fixed. A test now reads the README's figures and checks them against the code. The ADRs keep their original results, with a dated recheck under each.

### 14. The How it works guide said three things that weren't quite true

What was wrong: rookies are priced from a range of picks, not "the same draft pick". Missed games cost 10% of a player's value above replacement, not 10% of his value. Only rostered players under the games minimum are listed, not every one.

Seriousness: low. Status: fixed.

### 15. Unticking the last category did nothing, and said nothing

Steps: untick every category.

Promise broken: refusals come with a reason.

What happened: the box ticked itself again with no message.

Seriousness: low. Status: fixed, with test.

### 16. A cached data rebuild with a past season missing quietly shrank the data

Steps: run `npm run fetch -- --cached` with no API key, on a machine that has this season's saved data but not every past season.

Promise broken: rookie values and the missed-games discount ([ADR 0012](adr/0012-rookie-values.md), [ADR 0013](adr/0013-missed-games.md)).

What happened: the missing seasons were skipped, and the result was written over the bundled files. Rookies and injury-prone players would have been repriced without a word.

Seriousness: low, since it needs my own machine. Status: fixed, with test. It stops, names the missing file and writes nothing. The test runs the script in a scratch folder with no key, so nothing is fetched.

### 17. A 400-digit price was refused for the wrong reason

Steps: type 400 nines as the price.

What happened: it was read as Infinity, and the message said the price must be a whole number of at least $1.

Seriousness: low. Status: fixed, with test.

### 18. My first fix for finding 2 described a raised value as a cut

Steps: in a league of two teams with one spot each, price the 3rd and 4th best players, then log one sale.

What happened: when every spot left is a player I priced, my $3 value can become $26. The card said it was "scaled" so my values "fit", which reads as a cut and gives the wrong reason.

Seriousness: low. Caught while reviewing the fixes, before anything was pushed. Status: fixed, with test. The card says whether the value was raised or lowered, gives Live with the money left, and says when a value isn't used at all.

## Findings from the earlier review of the sibling repo

The same review was done first on a private copy of this app. I checked each of its 14 findings here before fixing anything.

| Sibling finding | Here | Why |
|---|---|---|
| 1. Sold strip "null" | Applied | Finding 3 |
| 2. $2,402 in a $2,400 league | Applied | Finding 1, and it reaches My values (finding 2) |
| 3. League setup limits | Applied | Finding 5. Its open item, `1e1` games, is fixed here too |
| 4. Non-Latin rookie names | Applied | Finding 6 |
| 5. `0,5` read as $5 | Applied | Finding 4, plus the two My value boxes this repo has |
| 6. CSV blanks and negatives | Applied | Finding 7 |
| 7. Damaged saves | Applied | Finding 8, plus My values and the uploaded CSV |
| 8. Yahoo league with no teams | Doesn't apply | No Yahoo code here. Sync is parked on a private branch ([ADR 0005](adr/0005-yahoo-sign-in.md)) |
| 9. Badly encoded cookie broke Yahoo sign-in | Doesn't apply | No server, sign-in or cookies here |
| 10. Deploys uploaded the video and `data/` | Applied, in another form | Finding 12. No video here; `data/`, `.github/` and `LICENSE` instead |
| 11. Phone-width overflow | Applied | Finding 11. Here it showed even with the bundled font |
| 12. The save check threw away old saves | Avoided | The save check here looks at shape only, and a test loads a $5,000-budget save |
| 13. Last category | Applied | Finding 15 |
| 14. README and PRD out of date | Applied, in another form | Finding 13. Different stale figures here |

## Open

- **Pricing more players than the league has roster spots** is allowed, and the extras aren't used. The card says so, but setting them isn't refused. Low.
- **`1,200` is read as $1,200, while `1.200` is refused.** In a dollar app a comma before three digits is a thousands separator to nearly every reader, so I kept it.
- **The arrow keys no longer step the price, budget and My value boxes by $1,** because they're now text boxes. That's what stops `0,5` turning into $5.

No other known bug is open.

## What held up

- **The money promise.** After the fixes, pre-draft and live prices added up exactly in all 350 random leagues, including 2-team leagues, 20 × 25 leagues, exactly $1 a spot, one category, a 0-game minimum, My values and rookie values.
- **Markup in names.** Team, player, typed and CSV names show as text everywhere. The page only creates text nodes, never HTML, and the content security policy allows scripts from this site only.
- **Double clicks.** A double submit logs one sale.
- **Undo and refresh.** Picks, team names, My values and settings survive a reload, and Undo gives the money back.
- **Hand-logging under a bid clock.** Surnames and typos only suggest a player, an unknown name needs a second Enter, and over-max, full-roster and already-drafted picks are refused with the reason.
- **Player notes.** A note never changes a price (tested), and Kevin Porter Jr.'s note shows on his card.
- **Missed games and rookie values.** 24 priced players are discounted, with their seasons on the card. Picks 1 to 3 are $6 and 4 to 7 are $1, with the hit rate on the card.
- **The How it works guide** opens on a first visit only, never over a draft under way, and fits at 360 px.
- **What the privacy page says about data leaving the device.** The app makes no requests except for its own data files and the analytics script, sets no cookies, and keeps the draft in this browser's storage.
- **What's served.** `vercel.json` serves `site/` only, and the local preview listens on loopback only.
- **The data claims.** 582 players with stats, and 156 players priced at exactly $2,400 with Yahoo defaults.

## Not tested

- A deployed site, including checking that non-page files return 404 on the live URL. Nothing was deployed.
- The Vercel analytics script, which only runs on the live site.
- Browsers other than headless Chromium on Linux, real phones, screen readers, and a light theme (the app only has a dark one).
- `npm run fetch` against balldontlie, because it calls an outside service.
- Yahoo sync, which isn't in this repo.
