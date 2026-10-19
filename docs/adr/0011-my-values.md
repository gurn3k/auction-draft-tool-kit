# 0011: Users can price a player themselves

Status: accepted, 2026-10-19. Builds on [0002](0002-valuation-method.md) and [0010](0010-player-notes.md). Code: `site/lib/valuation.js`, `site/app.js`.

## Context

The only way to disagree with a price was to upload a projections CSV for the whole league. Most users disagree about a handful of players, such as one whose season looks like an anomaly (ADR 0010). ADR 0010 keeps the built-in prices objective. The user's own judgment belongs to the user.

## Options considered

| Option | Verdict |
|---|---|
| Edit a player's stats, and recompute | Keeps the method, but it's slow to do mid-draft, and people think in dollars, not steals a game. |
| **Type a dollar value for the player** | **Chosen.** Quick, and it's what the user actually believes. |
| Type a value and leave other prices alone | Rejected. Prices would stop adding up to the league's money, which every live price depends on. |

## Decision

- On the player on the block, under his price, a "My value" box sets his price for this user. Clear sets it back, and "Clear all" in League setup removes every one.
- He takes that price, and everyone else shares the rest of the money by the usual method, so the total is still exactly teams × budget. A user can price a player outside the top 156; he then takes a roster spot from the lowest-ranked player.
- Live, his price stays at the user's value and doesn't move with inflation. Bid to isn't tilted by roster fit for him, because the user's value already says what he's worth to them.
- Limits: a whole dollar of at least $1, no more than any team could bid, and the user's values together must leave $1 for every other roster spot.
- Values are kept in this browser with the draft, by player id. They work with the bundled stats or a CSV. Players without stats to value (mostly rookies) can't be priced yet.
- The card label changes to "My value", and the board marks the value with an asterisk, so a user's own price is never mistaken for the data's.

## Consequences

- Nothing is sent anywhere, and the built-in prices are unchanged for everyone else.
- A user who sets values far from the data skews their own Live prices for other players. That's intended: it's their money to reallocate.
