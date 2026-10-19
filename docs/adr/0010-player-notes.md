# 0010: Notes on misleading seasons, not hand-set prices

Status: accepted, 2026-10-19. Builds on [0002](0002-valuation-method.md). Data: `data/player-notes.json`.

## Context

Values come only from last season's per-game stats. Kevin Porter Jr. ranked 14th at $34 in a Yahoo-default league, mostly on 2.2 steals a game over 38 games.

I first set his value to $10 by hand, with everyone else sharing the rest of the money (PR #8). I removed that the same day. A hand-set price puts one person's judgment inside numbers that are meant to be computed the same way for everyone, and a user can't tell which prices are data and which are opinion.

## Decision

- Prices stay objective: every value comes from the stats by the same method. No hand-set prices.
- `data/player-notes.json` holds notes on seasons that may mislead, with the balldontlie id. The data build copies them onto the player as `note`.
- The note appears on the player's card when he's on the block, next to his price. The user makes the call.

## Consequences

- Kevin Porter Jr. is back at $34. His card says his numbers may be an anomaly, and why.
- Notes are hand-kept and need reviewing each season, when the data is refreshed.
- A general fix for short or unusual seasons (such as weighting by games played) is still open, as PRD open question 3. It would apply to every player alike.
