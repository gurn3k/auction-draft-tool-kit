# 0007: Licensed player data from balldontlie

Status: accepted, 2026-10-19. Supersedes the data source in [0003](0003-player-data.md) and makes [0004](0004-player-identity.md) unnecessary. Code: `scripts/fetch-stats.js`, `scripts/bdl.js`.

## Context

ADR 0003 left one item open before a public deploy: check the terms of the stats source. When it came to going public, the check failed. Sports Reference's [data use policy](https://www.sports-reference.com/data_use.html) says you "should not create websites or tools based on data you scrape from Sports Reference", and its terms bar automated access without written permission. The bundled stats came from exactly that: a scrape of Basketball-Reference. Current teams came from scraping NBA.com, which has the same kind of risk.

A tool meant to show careful product judgement can't ship on data it isn't allowed to use. Being allowed to use the data was a launch requirement.

## Options considered

| Option | Cost | Season | Verdict |
|---|---|---|---|
| Keep Basketball-Reference | $0 | 2025-26 | Breaks their stated terms. Rejected. |
| balldontlie, free tier | $0 | none | Tested: stats and rosters return 401. Free covers only player profiles. |
| API-Sports (API-NBA), free tier | $0 | 2024-25 | Tested: 2025-26 refused ("Free plans do not have access to this season, try from 2022 to 2024"). Usable, but two seasons stale and teams out of date. Kept as the fallback. |
| CSV-first, no bundled data | $0 | the user's own | Clean, but the board opens empty. Weak first impression. |
| balldontlie, paid tier for one pull | trial or $10 to $40 | 2025-26 | Chosen. |
| Ask Sports Reference for permission | $0 | 2025-26 | Slow and uncertain. |

## Decision

Bundle 2025-26 regular-season per-game averages and current active rosters from [balldontlie](https://www.balldontlie.io/). The data was pulled once, on 2026-10-19, during the All-Access trial.

Why balldontlie, from [its terms](https://www.balldontlie.io/terms):
- Data may be used "for lawful personal or commercial purposes", including to "publish, display, distribute".
- Caching and storing are permitted.
- "No attribution… or additional permission from us is required." The app credits the source anyway.
- "Termination does not revoke the permissions in Section 6 for Data you lawfully obtained." The snapshot stays usable after the trial ends.
- Not allowed: reselling the raw data, or building a product that competes with balldontlie. A drafting tool does neither.

## What changed

- **One source, one id.** Stats and rosters share balldontlie's player id, so they join directly. The cross-site name matching in ADR 0004 is gone, along with `data/player-links.json` and the NBA.com scraper.
- **Familiar names.** balldontlie lists some players by legal name: "Airious Bailey", "Nah'Shon Hyland". `data/display-names.json` shows 12 of them by the name fans use (Ace Bailey, Bones Hyland). The legal name stays searchable.
- **Accents dropped.** balldontlie spells names without accents: "Nikola Jokic", "Luka Doncic". Search already ignores accents, and CSV matching does too.
- **No "from LAL" note.** The season averages don't say which team a player finished with, so the board shows only the current team.
- **Rosters are a snapshot.** Teams are current as of 2026-10-19. They don't update without another paid pull. Users who need up-to-the-day data should upload a CSV.

## Verification

- **Same pool.** Both sources list the same 582 players. Games, points and rebounds match exactly for all 570 matched by name. The other 12 are the legal-name cases above.
- **Same values.** Yahoo defaults still give Jokić $71, Wembanyama $66 and Gilgeous-Alexander $61, and 156 players priced at exactly $2,400. `test/bdl.test.js` checks that total against the bundled file.

## Consequences

- Refreshing the data means a paid month or another trial. `npm run fetch` does the whole pull in a few minutes, retrying when rate-limited. `npm run fetch -- --cached` rebuilds from the saved copy.
- If paying stops being worth it, fall back to API-Sports' free tier for the newest season it allows, and say in the app how old the data is.
