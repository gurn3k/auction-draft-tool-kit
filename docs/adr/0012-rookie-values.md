# 0012: Rookies valued from their draft slot

Status: accepted, 2026-10-20. Builds on [0002](0002-valuation-method.md), [0010](0010-player-notes.md) and [0011](0011-my-values.md). Code: `site/lib/valuation.js`; data: `site/data/rookie-history.json`, built by `scripts/fetch-stats.js`.

## Context

Values come from last season's stats, so this year's rookies had none and were listed at no price. Users who don't follow the draft got no starting point, and the top picks can matter.

## Options considered

| Option | Verdict |
|---|---|
| Leave rookies unpriced; users set their own (ADR 0011) | Kept as the fallback, but it gives a less savvy user nothing to start from. |
| **Price by draft slot: what past rookies taken there were worth** | **Chosen.** Objective, the same rule for every rookie, from the licensed source we already use. |
| Expert projections or average draft prices | Rejected: a new data license, and other people's opinions inside the app's prices. Users can upload them as a CSV. |
| Translate college or international stats | Rejected: no licensed data, and a research project of its own. |

## Decision

- **History:** the first-season per-game stats of every drafted rookie in the 2017–2025 draft classes, from balldontlie. A rookie season is the one starting in his draft year. Undrafted players have no draft year, so they're left out.
- **Slot ranges:** picks 1–3, 4–7, 8–14, 15–30 and 31–60.
- **Estimate:** each past rookie is scored against this league's pool, with its categories, by the same method as everyone else. His surplus is how far he was above replacement. A rookie who didn't play, played under the games minimum, or fell below replacement counts as zero surplus, because a team would drop him for a free agent. A range's estimate is the total surplus divided by every pick in it (picks × classes), so busts and no-shows count. Each rookie gets replacement plus his range's estimate, and the usual allocation turns that into dollars. Totals still come to exactly teams × budget.
- **Shown:** the board tags him "Rookie · #pick", with no category cells or total, since he has no stats. His card says the value is an estimate from his draft slot, and what share of past picks in that range were worth a roster spot.
- **Editable:** every rookie can be priced by hand on the board or the card (ADR 0011), including ones estimated at $0 and undrafted rookies.
- **Scope:** only with the bundled stats. A projections CSV brings its own numbers.

## Consequences

- Every pick in a range gets the same estimate. The board can't tell the eventual star from the bust; the hit rate on the card says how often a pick in that range pays off.
- Replacement level is measured before rookies join the pool, a small approximation.
- Roster fit (Worth to you) can't tilt a rookie's price, as he has no category stats.
- The history is saved once per season and grows by one draft class a year.

## Results (Yahoo defaults, 2026-27 rookies)

| Picks | Value | Worth a roster spot as rookies |
|---|---|---|
| 1–3 | $6 | 44% of 27 picks |
| 4–7 | $1 | 19% |
| 8–14 | $0 | 16% |
| 15–30 | $0 | 3% |
| 31–60 | $0 | 1% |

Seven rookies are priced: picks 1–7. They take the place of seven veterans who were worth $1–2 (Stephon Castle, Maxime Raynaud and others). Because the best player left unrostered is now a little better, the method shares slightly more of the money to the top: Jokić goes from $71 to $74 and Wembanyama from $66 to $69. That's the same rule applied to a slightly different pool, not a change to the method.
