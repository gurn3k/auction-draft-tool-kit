# 0008: Ask the board, answered by a model and checked by code

Status: proposed, 2026-10-19. The test set and the check are built; no model has been chosen and nothing ships until one passes. Code: `site/lib/ask.js`, `scripts/ask-cases.js`, `scripts/ask-eval.js`.

## Context

Cap Drafter prices every player and re-prices the board after each sale. Mid-draft questions cut across that board: the best player in one category under a price, what to buy with the money left, which teams can still outbid me. The app already writes one code-built line per player ("Strong in 3PM, FT% and PTS; costs you TO and REB"), so a model has to do something code can't: take an open question and answer it from the whole board.

The obvious risk is a confident, wrong answer: a player who has already been sold, a price that isn't on the board, a stat that was made up. In a draft, that costs the user real money in their league.

## Options considered

| Option | Verdict |
|---|---|
| More filters and sort controls on the board | Answers single-constraint questions. Fails on combined ones ("$20, 3 spots, short on assists"), and adds controls to a screen used under a 30-second clock. |
| Model answers freely from its own knowledge | Rejected. Its knowledge is stale and unpriced, and it can't know who has been sold. |
| **Model answers from a code-built snapshot, and code checks the answer** | **Chosen.** Same pattern as my Whose Move Is It risks brief: code computes facts, the model writes, code rejects what it can't verify. |
| A model running in the browser | Rejected for now: a large download and slow on phones, which matter beside a draft room. |

## Decision

### What the model sees
`boardSnapshot()` turns the live state into about 3,800 tokens of text: the league, my money, roster and strongest and weakest categories, every team's money and max bid, the 250 best available players with Live, Bid to and per-game stats, and the sales so far. Code computes all of it. The model is told to use nothing else, to reply in JSON, and to decline off-topic questions or ones that need news, injuries or this season's form.

### What code checks before anything is shown (`verifyReply`)
- every recommended player is on the available list (not sold, not invented);
- every dollar amount is a figure on the board, or one the user typed;
- every decimal stat is one shown on the board;
- a sold player is mentioned only if the question named him;
- named teams exist; replies that decline recommend nobody.

If any check fails, the user sees "Couldn't answer that reliably, try rephrasing." A refusal costs a few seconds; a wrong answer costs a bad bid.

### How the model is chosen
`npm run eval:ask` runs 34 questions over three simulated drafts (early, middle and late). The correct answer to each is computed by code: the top players in a category under a price, players that fit the money left, the teams whose max bid covers a price, bid or pass against Bid to, and declining what it should. Each model is scored on:

| Measure | Pass mark |
|---|---|
| Correct and shown | 85% or more |
| Wrong but got past the check | 5% or less |
| Median answer time | 3 s or less |
| 90th-percentile answer time | 5 s or less |
| Cost per question | under $0.001 |

The cheapest model that passes ships. If none passes, the feature doesn't ship, and this record says why.

The candidates are the cheapest models on OpenRouter as of 2026-10-19 that support JSON replies, plus a free one and one higher-priced reference model: GPT-OSS 20B, DeepSeek V4.1 Flash, GPT-5 Nano, Gemini 2.5 Flash-Lite and Gemma 4 26B (free). Pinned model ids, not "latest" aliases, so the model can't change under a passing result.

### Serving it
- **A Vercel Function** (`api/ask`) holds the OpenRouter key; the page sends the question and the draft state, and the function rebuilds the snapshot with the same `site/lib` code. The browser is never trusted to supply the board text.
- **Spend:** a dedicated OpenRouter key with a credit limit is the hard cap: when it runs out, the box says the assistant is resting. Per-visitor limits (about 30 questions an hour) and a 300-character question limit keep any one person from using it up.
- **Privacy:** only the question and the board leave the browser. No names, accounts or IP addresses are sent to the model provider.

## Expected cost

About 3,800 tokens in and 200 out per question. At OpenRouter prices on 2026-10-19 that is $0.0001 to $0.0007 a question, so roughly $0.40 a month for 100 drafts of 20 questions, or $4 to $8 for 1,000. The eval reports the measured figure, which replaces this estimate.

## Consequences

- The app gains its first server code and its first running cost. The static board still works if the function or the provider is down; only the box is affected.
- The check limits what answers can say: a model can't cite a number the board doesn't show, even a true one. That is deliberate.
- The check proves the facts, not the judgment. A correct player at a correct price can still be weak advice; the eval's "correct" column measures that, and it is why the pass mark is on correctness, not just on passing the check.

## Results, 2026-10-19

34 questions per model, thinking turned off where the model allows it, cheapest provider. Three runs in total cost about $0.09.

| Model | Correct | Wrong but shown | Refused | Median | p90 | Cost / question |
|---|---|---|---|---|---|---|
| GPT-OSS 20B | 68% | 21% | 12% | 5.3 s | 11.0 s | $0.00016 |
| **DeepSeek V4.1 Flash** | **85%** | 15% | 0% | 3.6 s | 5.6 s | $0.00013 |
| GPT-5 Nano | 29% | 47% | 24% | 0.5 s | 0.9 s | $0.00015 |
| Gemini 2.5 Flash-Lite | 71% | 29% | 0% | 0.4 s | 0.5 s | $0.00067 |
| Gemma 4 26B (free) | 0% | 0% | 100% | n/a | n/a | $0 |

**No model passes**, so this design doesn't ship. DeepSeek V4.1 Flash came closest: it met the accuracy mark but let 15% wrong answers through, against a limit of 5%, and was slower than the speed marks.

What went wrong is consistent across models. The mistakes are arithmetic and filtering over the board, not language:
- **Price limits:** recommending a $16 player for "$15 or less", or Chet Holmgren for "$10 or less".
- **Comparing 12 rows:** listing the wrong teams for "who can still bid $X".
- **The bid rule:** saying "pass" on a price below Bid to, even with the rule stated in the prompt.

The check catches invented players and numbers (no answer that passed it named a sold or made-up player), but it can't catch a real player at a real price who breaks the question's limit. The free model failed on every question: provider errors and per-minute rate limits.

**Next:** the model shouldn't do arithmetic. A redesign where the model only turns the question into a structured request (for example, best in blocks with a Live price of $10 or less), code runs that request on the board, and the answer is written from code's result. Each step can be tested on its own, and the prompt no longer needs the 250-row board, so it should also be faster and cheaper. It gets its own test run against the same pass marks.
