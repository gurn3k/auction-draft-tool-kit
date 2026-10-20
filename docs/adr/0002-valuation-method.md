# 0002: Valuation method

Status: accepted, 2026-10-16. Code: `site/lib/valuation.js`.

## Decision

Values use standard z-score valuation for head-to-head categories, then a value-over-replacement split of the league's money.

1. **Eligible players:** those with at least the minimum games (default 15; it was 20 until 2026-10-20, when it was lowered so players back from a short injured season, like Jayson Tatum at 16 games, are priced, while 3–5 game samples still aren't).
2. **Category scores.** For counting stats (3PM, PTS, REB, AST, STL, BLK, TO), the score is the player's per-game number. For FG% and FT%, it is **impact**: makes minus what an average shooter in the pool would make on the same attempts (`made − poolPct × attempts`). A 60% shooter on 20 attempts moves a team's FG% far more than one on 5, and impact captures that.
3. **z-scores** for each category, measured against the **drafted pool**, not the whole league. The pool is the top `teams × roster spots` players, re-computed 4 times until it settles. Turnovers are negated.
4. **Total** = the sum of the 9 z-scores, with every category weighted equally.
5. **Replacement level** = the total of the best player who won't be rostered (rank `teams × spots + 1`).
6. **Dollars.** Every rostered player costs at least $1. The rest of the money (`teams × budget − rostered players`) is split in proportion to each player's total above replacement.

**Live prices** repeat steps 5 and 6 over the undrafted players only, using the money and spots left in the league. The z-scores don't change during a draft. Only the money and the competition for it do.

**Inflation** = money left ÷ (sum of the pre-draft values of the players who will fill the open spots) − 1.

## Known simplifications

- **No positional scarcity.** Yahoo's flexible slots (G, F, two Util) and players eligible at several positions make scarcity small in basketball, and the bundled data's positions aren't Yahoo's eligibility anyway. Worth adding once real eligibility data exists.
- **League-wide money, not per-team.** Live prices use the room's total money left. A team with $3 left can't really bid, and the Teams panel shows that, but the prices ignore it.
- **Per-game, not totals.** Games missed only matter through the minimum-games filter.
- **Equal category weights.** No punting yet, though `valuePlayers` already accepts a category list.
