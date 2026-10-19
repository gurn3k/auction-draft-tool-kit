# 0006: "Worth to you", a price adjusted for my roster's needs

Status: accepted and built, 2026-10-17. Builds on [0002](0002-valuation-method.md). Code: `site/lib/fit.js`.

## Problem

Live prices are league-wide: what the room as a whole should pay for a player, given the money and spots left. They ignore my roster. A strong rebounder costs the same whether I'm last in rebounds or already lead the league. In head-to-head categories, a category I already win more of is worth less to me, and one I'm losing is worth more.

## Proposal

Add one figure, **Worth to you**: the Live price nudged up or down by how well the player fits my category gaps. Live stays the market price and still shows.

### 1. How short is each category

My category totals are already computed (`categoryTotals`, the sum of my players' z-scores). For each scored category:

- **gap** = my average total across categories − my total in this category.
  A positive gap means this category lags the rest of my roster. Measuring against my own average, not a fixed target, means a team of cheap players isn't told it's short in everything.

### 2. Turn gaps into weights

- **weight** = 1 + strength × clamp(gap ÷ 2, −1, 1)
- Then rescale the weights so they average exactly 1.

A gap of 2 z (about what one strong specialist adds) gets the full adjustment. The rescale means a player who helps my roster evenly comes out at about his Live price; the figure only moves for lopsided fits.

**strength** ramps with my roster: 0 with no players, rising to 0.5 once half my spots are filled. Early on I have no shape to fit, so the figure is just Live. With 0.5, weights range from 0.5 to 1.5.

### 3. Re-score the player with my weights

- **my total** = Σ weight × his z-score, over the scored categories.
- **my replacement** = the same weighted total for the replacement-level player from 0002, step 5.
- **fit** = (my total − my replacement) ÷ (his total − replacement), using the unweighted totals from 0002.

A fit of 1.2 means he's 20% more valuable to me than to an average team.

### 4. The price

- **Worth to you** = Live × fit, then **limited to between 80% and 120% of Live**, never below $1.
- **Bid to** becomes Worth to you, capped at my max bid, as it is today for Live.

The ±20% limit is the guard against chasing categories. It also keeps the number honest: the market price is what someone else will pay, so going far above it to fill a gap means overpaying when a cheaper player could fill it too.

## Worked example (illustrative numbers)

I've filled 7 of 13 spots, so strength is at its full 0.5. I'm short in REB (gap 1.6) and BLK (gap 1.2), and strong in PTS (gap −1.4). After rescaling, the weights come out at about REB 1.4, BLK 1.3, PTS 0.8.

A centre with z-scores REB 2.0, BLK 1.5, PTS 0.5 and 0 elsewhere has a total of 4.0. Replacement is 1.0.

- Unweighted surplus: 4.0 − 1.0 = 3.0
- Weighted: 2.8 + 1.95 + 0.4 = 5.15, minus my replacement of about 1.0 = 4.15
- fit = 4.15 ÷ 3.0 = 1.38, limited to 1.20
- Live $30 → **Worth to you $36**

A scorer with PTS 2.5 and little else would come out under Live, for example $30 → $25.

## Where it shows

Worth to you has no figure or column of its own. **Bid to** carries it, so the difference between Live and Bid to is the fit adjustment (or my max bid, when that is lower).

- **The block:** Bid to follows Worth to you, and the note under it says why, e.g. "+$14 on Live: fills BLK and REB, where you're short" or "−$9 on Live: you're already strong in FT% and 3PM".
- **The board:** the Bid to column follows it too, and sorting by Bid to finds the best fits still available.
- **League setup:** a "Worth to you" toggle, on by default. Off, Bid to is Live capped at my max bid, as before.

A separate "To you" figure and column were planned, but they would repeat Bid to except when my max bid caps it.

## Scarcity (decided 2026-10-17, built)

Scarcity is a warning, not a price change. A player is **strong** in a category at a z-score of 1 or more (`STRONG_Z` in `site/lib/draft.js`).

- **My team** shows how many undrafted strong players are left in each category, lit at 5 or fewer (`SCARCE_LEFT`).
- **The block** warns when the player is strong in a category with 5 or fewer strong players left, counting him: "Scarce: one of the last 4 strong in BLK".

TO is left out of both: nearly every low-minute player rarely turns the ball over, so it is never scarce.

Worth to you does not react to scarcity.

## What it doesn't do

- **Punting.** Deliberately giving up a category (say FT%) isn't modelled. Unticking it in Categories already removes it from all values, which is the honest way to punt.
- **Opponents.** It doesn't look at other teams' rosters. It doesn't know the room's rebounders are already gone.
- **Positions.** Same as 0002: no positional scarcity.

## Settings to revisit

**Strength (0.5) and the ±20% limit** (`FIT_STRENGTH`, `FIT_LIMIT`) are judgement calls, not derived. A wider range rewards fit more, but also overpaying more. Tune them after a real draft. With a lopsided roster the limit binds often, which is intended.

## Testing

`test/fit.test.js`: strength is 0 with an empty roster and full from half a roster. Weights average 1 and favour short categories. An evenly balanced player gets fit 1. Results stay within the ±20% limit and never fall under $1. Players at or below replacement, or without stats, stay at Live.
