# PRD: Cap Drafter (v1)

Status: draft for product-owner review, 2026-10-16. "Cap Drafter" is a working title.

## Problem

In a Yahoo fantasy basketball salary cap (auction) draft, each team gets a budget the commissioner sets ($200 by default) and bids on players one at a time. Yahoo's draft room shows a pre-set "projected salary" for each player. That number doesn't change with your league's budget, roster size or categories, and it ignores what has already happened in the room. Once a few stars go for more or less than expected, every remaining price should move. Doing that maths by hand, under a 30-second bid clock, is impossible.

## Who it's for

- **Primary:** a Yahoo fantasy basketball manager about to run a salary cap draft, who keeps a second window open beside the draft room.
- **Showcase audience:** hiring managers for PM roles. The repo shows a scoped product with a stated valuation method and tested maths.

## What v1 does

1. **League setup.** Budget per team (the commissioner's number), teams, roster spots bought at auction, a minimum-games filter, and which team is mine. "Yahoo defaults" sets 12 teams × $200 × 13 spots.
2. **Pre-draft values.** For each player: z-scores in the 9 Yahoo default categories (FG%, FT%, 3PM, PTS, REB, AST, STL, BLK, TO), a total, and a dollar value. Together the dollar values exactly spend the league's money across the rostered player pool. Method: [ADR 0002](docs/adr/0002-valuation-method.md).
3. **Live re-pricing.** Log each sale (player, price, team). The money and spots left are shared out again over the players left, so the board shows **Live** prices and the league's inflation (positive when others have bought bargains, negative after overpays).
4. **Bid ceiling.** "Bid to" is the live price capped at my max bid: my money left minus $1 for each other open spot.
5. **Room awareness.** Every team's money left, open spots and max bid, so I can see who can still afford a player.
6. **My team.** My roster, money left and category strength (the sum of my players' z-scores), to show what to target or punt.
7. **Data.** It ships with licensed 2025-26 per-game stats and 2026-27 rosters ([ADR 0007](docs/adr/0007-licensed-player-data.md)), with the upload path from [ADR 0003](docs/adr/0003-player-data.md). The user can upload a projections CSV instead. A player missing from the data (a rookie) can still be logged by name, so the budget maths stays right.
8. **Yahoo import and live sync**: built, then parked until Yahoo approves Fantasy API access ([ADR 0005](docs/adr/0005-yahoo-sign-in.md), kept on a private branch).
9. **Survives a refresh.** League settings and picks are saved in the browser (localStorage). It has no account and no server.

## v2 candidate: Ask the board

Status: in discovery, 2026-10-19. It ships only if it passes the test in [ADR 0008](docs/adr/0008-ask-the-board.md).

**Problem.** The board answers one question well: what is this player worth? Mid-draft, the questions are messier. "Who's the best shot-blocker left for $5?" "I have $20 and 3 spots, who should I target?" "Who can still outbid me for him?" Each one means scanning 500 rows, filtering by price and comparing stats, all under a 30-second bid clock.

**What it does.** A question box. You ask in plain English and get a short answer, within about 3 seconds, drawn only from the live board: the players still available, their prices, your money and roster, and every team's max bid.

**Rules.**
- Code computes every fact; the model only reads them and writes the answer.
- Before an answer is shown, code checks that every player in it is still available and every price and stat in it is on the board. If not, you see "Couldn't answer that reliably" instead.
- It declines questions that aren't about the draft, and says so when a question needs facts it doesn't have (injuries, trades, news).
- Only board data is sent. No personal details, no account.

**Success criteria** (measured before launch):
- At least 85% of test questions answered correctly, and at most 5% wrong answers that get past the check.
- A median answer in 3 seconds or less, and 9 in 10 within 5 seconds.
- Under $0.001 a question, with a hard monthly cap on spend.

**Out of scope.** Chat history, draft strategy essays, predictions, and anything the board can't support.

## Success criteria

- Pre-draft values add up to exactly teams × budget, and each rostered player is worth at least $1 (tested).
- With no picks logged, live prices equal pre-draft values. After any picks, live prices share out exactly the money left (tested).
- Logging a pick takes one click on the board plus a price, or typing a name. Illegal picks (over max bid, full roster, already drafted) are refused with a reason.
- It works beside the Yahoo draft room: usable at half a laptop screen and at phone width, with no page-level horizontal scroll.

## Out of scope (v1), candidates next

- **Browser extension** that reads the Yahoo draft room and logs picks automatically. The engine in `site/lib/` is pure, with no DOM and no fetches, so an extension can import it unchanged ([ADR 0001](docs/adr/0001-web-app-first.md)).
- **Punt builds and custom categories.** The engine already takes a category list. The UI to choose one doesn't exist yet.
- **Positional scarcity.** Yahoo positions (PG/SG/G/SF/PF/F/C/Util) aren't modelled yet. See ADR 0002.
- **Points leagues and 8-cat.**
- **Projections** beyond last season's stats (age curves, role changes, injuries).

## Open questions for the product owner

1. **Name.** Keep "Cap Drafter", or pick another?
2. ~~**Public deploy and data terms.**~~ Resolved 2026-10-19: Basketball-Reference's terms rule out tools built on scraped data, so the bundle now comes from a licensed API. See ADR 0007.
3. **Per-game or totals.** v1 values per-game production, so a player who misses games isn't penalised beyond the minimum-games filter. Should games played discount value?
