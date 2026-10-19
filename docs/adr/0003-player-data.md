# 0003: Bundled player data, with CSV upload

Status: CSV upload still stands. The data source was superseded 2026-10-19 by [0007](0007-licensed-player-data.md): the terms check below failed, so Basketball-Reference and the NBA.com roster scrape were replaced with licensed data.

## Decision

- Ship a baseline: 2025-26 regular-season per-game stats from Basketball-Reference (`npm run fetch` makes one page request and writes `site/data/players.json`). A traded player keeps his combined-season stats, labelled with the last team he played for.
- Let users upload their own projections CSV. Common column names are accepted (`FGM/FGA` or `FG%`, `3PM`/`3P`/`FG3M`, `TO`/`TOV`…). `site/data/projections-template.csv` shows the shape.
- Bring teams up to date and add players on current rosters who aren't in those stats (rookies, players who sat out 2025-26). `npm run update-rosters` reads all 30 NBA.com team pages, matches names (accents, punctuation and Jr./II suffixes ignored, plus a small alias list), and adds the rest with no stats. They show on the board tagged "Rookie" or "No 2025-26 stats", without a value, and can be logged in a draft. Re-running replaces earlier additions, so it always reflects the latest rosters. Added 2026-10-16. A one-shot run is scheduled for 2026-10-18 11:00 ET (`scripts/scheduled-roster-update.sh`, Windows Task Scheduler), and it commits and pushes the result.

## Why

stats.nba.com refused requests from this environment. RealGM's depth charts were the first choice for current rosters, but Cloudflare blocks automated requests, including a headless browser. NBA.com's team pages work and are the official source. Basketball-Reference gave a clean, complete table in one request. Last season's per-game stats are a reasonable, transparent baseline. Serious players already use paid projections, which the CSV upload takes.

## Limits users should know

- Rookies and other players added from rosters have no values, because there are no stats to value them on. A user who wants them priced can upload projections as a CSV.
- Teams come from NBA.com rosters as of the last `update-rosters` run. Players on no roster show as free agents but keep their values. How names are matched across the two sites: [ADR 0004](0004-player-identity.md).
- No injury or role adjustments.

## Open: terms before a public deploy

Sports Reference publishes terms on use and redistribution of its data. Check them before serving `players.json` from a public URL. If bundling isn't allowed, ship without it and lead with CSV upload, or switch source.
