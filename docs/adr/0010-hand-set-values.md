# 0010: Hand-set values for a season that misleads

Status: accepted, 2026-10-19. Builds on [0002](0002-valuation-method.md). Code: `site/lib/valuation.js`; data: `data/value-overrides.json`.

## Context

Values come only from last season's per-game stats. That's usually right, but a short or unusual season can put a player far from where anyone would draft him. Kevin Porter Jr. ranked 14th at $34 in a Yahoo-default league, mostly on 2.2 steals a game over 38 games (3.3 standard deviations above the drafted pool). As product owner, I judged that season an anomaly and his price should be $10.

## Options considered

| Option | Verdict |
|---|---|
| Edit his stats so the formula lands near $10 | Rejected. The board would show stats he didn't put up. |
| Show $10 but leave the other prices alone | Rejected. Prices would no longer add up to the league's money, which every live price depends on. |
| A general fix, such as discounting short seasons | Worth doing later, but it moves every player who missed games, not just the case in question. Open question 3 in the PRD. |
| **Set his value by hand; everyone else shares the rest** | **Chosen.** |

## Decision

- `data/value-overrides.json` lists hand-set values with a reason. The data build copies them onto the player as `setValue`.
- The value is in dollars for Yahoo's default $200 budget and scales with the league's budget.
- Pre-draft, a hand-set player takes his price first, and the other rostered spots share the remaining money by the usual method. Totals still come to exactly teams × budget. His $24 went back to the board: Jokić $71 to $72, Wembanyama $66 to $67.
- Live, his price stays at his hand-set value and doesn't move with inflation; everyone else shares the rest of the money left, exactly as before.
- His card says "Value set by hand to $10" with the reason, and doesn't show his stats rank, so a low price isn't mistaken for a bargain. His stats are shown as they were.

## Consequences

- One person's judgment now sits inside the prices. It's listed in one file, with a reason, and shown on the card wherever it applies.
- Projections uploaded as CSV aren't affected; those users bring their own numbers.
- The stats rank and the value no longer agree for these players, so tests check rank order for computed values only.
