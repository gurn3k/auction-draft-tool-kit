# 0013: A small discount for players who keep missing games

Status: accepted, 2026-10-20. Builds on [0002](0002-valuation-method.md). Code: `site/lib/valuation.js`; data: `seasons` on each player, built by `scripts/fetch-stats.js`.

## Context

Values come from per-game averages, which ignore availability. A player who averages a lot but plays 40 games helps a fantasy team far less than his averages suggest. The product owner asked for a slight discount for players who are injury prone: under 60 games, in back-to-back seasons or across several.

## The data's limit

balldontlie gives games played per season, not why a game was missed. A strict "under 60 games" rule also catches players who weren't hurt: Kevin Porter Jr. played overseas in 2023-24, and young bench players such as Ryan Rollins sat out of the rotation. The rule uses minutes to stand in for "he'd have played if fit".

## Decision

- **Rule:** a player is discounted when, in at least 2 of the last 3 seasons (2023-24 to 2025-26), he played as a regular (20+ minutes a game) but in fewer than 60 games. Seasons he didn't play at all aren't counted, as the data can't tell an injury from being out of the league.
- **Discount:** 10% off his value above replacement. The money goes back to everyone else by the usual method, so totals stay exactly teams × budget.
- **Shown:** a "Missed games" tag on the board, and on his card the seasons and game counts behind it.
- **Applied to everyone alike,** like the rest of the method. Users can still set their own value (ADR 0011). Projections from a CSV aren't discounted, as they carry no history.

## Results (Yahoo defaults)

27 priced players are discounted, including Lauri Markkanen ($37 to $34), Anthony Davis ($33 to $30), Joel Embiid ($30 to $27), LaMelo Ball and Ja Morant. Healthy stars gain a little: Jokić $74 to $76.

## Consequences

- Suspensions count as missed games (Ja Morant's 2023-24), and so does a season cut short by a trade with time off. The card lists the seasons, so a user can judge.
- Last season's games already gate who is valued at all (the games minimum); this adds a lighter, multi-season signal on top.
