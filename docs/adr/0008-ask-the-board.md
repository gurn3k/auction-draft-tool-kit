# 0008: Ask the board, answered by a model and checked by code

Status: proposed, 2026-10-19. Design 1 failed its test (results below); design 2 is built and under test. Nothing ships until a model passes. Code: `site/lib/ask.js`, `scripts/ask-cases.js`, `scripts/ask-eval.js`.

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

Revised for design 2, 2026-10-19.

- **Only the question leaves the browser.** `api/ask.js`, a Vercel Function, holds the OpenRouter key, has the model turn the question into a request, and returns just that request's known fields. The browser checks it (`checkRequest`) and answers it on its own board (`runRequest`), so answers match what's on screen, including a user's own projections CSV and league settings, and no draft data is ever sent.
- **Models:** DeepSeek V4.1 Flash, falling back to Gemini 2.5 Flash-Lite through OpenRouter's `models` list, from providers that don't store or train on prompts (`data_collection: deny`).
- **Spend:** a dedicated `cap-drafter` key with a credit limit is the hard cap; when it runs out, OpenRouter answers 402 and the box says it's resting. Per visitor, 30 questions an hour, kept in memory and not exact across function instances. Questions are capped at 300 characters, and the server refuses calls from other sites' pages.
- **Failure is visible and harmless:** if the server, the model or the limit gets in the way, the box says so and the board works as before. The Chrome extension has no server, so it shows no box.

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

## Design 2: the model reads the question, code answers it

Built 2026-10-19 from what design 1's results showed.

1. **The model turns the question into a request.** One of nine types: best players (in a category, under a price), targets for my money and spots, my weakest category, which teams can afford a price, bid or pass, compare players, one player's worth, can't answer (news, injuries), or off topic. The prompt holds the request format and eight examples, about 750 tokens, with no board in it.
2. **Code checks the request.** Unknown types or categories are refused, and every number in it must appear in the question, so the model can't introduce one.
3. **Code runs it on the board and writes the answer.** Price limits, team max bids and the bid rule are applied by code. Player names are matched with the same matcher as logging a sale, and a sold or unknown player is reported as such.

Every number and name in an answer now comes from code, so the "wrong but shown" risk narrows to the model misreading a question. The test set separates the two: each case carries the request a perfect reading gives, and code answers all 42 correctly from those (`test/ask.test.js`). Any failure in the model run is a misreading.

**Trade-off.** It only answers the nine types. Anything else gets "I couldn't understand that", which is less flexible than design 1 but never wrong in a way the user can't see.

**Held-out questions.** Eight questions were added after design 2 was written, in wordings the prompt's examples don't use ("any cheap rim protectors under 6 bucks?", "who dishes more dimes, A or B"), to check the model reads questions rather than matching examples. Design 1's 34 questions and checks are unchanged.

### Design 2 results, 2026-10-19

42 questions per model (design 1's 34 plus the 8 held out), same pass marks. The run cost $0.007.

| Model | Correct | Wrong but shown | Refused | Median | p90 | Cost / question |
|---|---|---|---|---|---|---|
| **DeepSeek V4.1 Flash** | **100%** | 0% | 0% | 1.6 s | 2.4 s | **$0.00001** |
| GPT-OSS 20B | 100% | 0% | 0% | 2.5 s | 6.4 s | $0.00002 |
| GPT-5 Nano | 100% | 0% | 0% | 0.7 s | 1.1 s | $0.00005 |
| Gemini 2.5 Flash-Lite | 100% | 0% | 0% | 0.4 s | 0.4 s | $0.00008 |

DeepSeek V4.1 Flash's requests matched the expected request on all 42 questions, held-out wordings included. Three models pass every mark; GPT-OSS 20B misses the speed mark (p90 6.4 s).

**Choice:** DeepSeek V4.1 Flash, the cheapest that passes, with Gemini 2.5 Flash-Lite as the fallback if DeepSeek's providers are slow or down. At about $0.00001 a question, $1 covers roughly 100,000 questions; the prompt fell from about 6,300 tokens to about 750.

**Limits of this result.** 42 questions written by me, against nine request types I designed, is a narrow test; real users will phrase things in ways it doesn't cover. Those cases should fail safe, as "I couldn't understand that", since code still does every calculation. Once it's live, counting how often that reply appears (counts only, never the questions) is the measure that matters.

**Re-run with the live settings** (`data_collection: deny`), 2026-10-19: DeepSeek V4.1 Flash 98% correct, 0% wrong but shown, 2% refused, median 1.9 s, p90 2.5 s; Gemini 2.5 Flash-Lite 100%, median 0.4 s. DeepSeek's one miss read "$8 or less" as $10; the number check refused it, so the user would have been asked to rephrase rather than given a wrong answer.

### A dropped condition, found in preview, 2026-10-19

The first preview question, "best in assists, forwards only", came back with Jokić, Cunningham and Giddey: the request had no place for a position, so the model dropped "forwards only" and code answered a different question. The number check couldn't catch it, because nothing was invented; something was left out.

Fixes: requests can now limit by listed position (G, F, C) and NBA team, and must list any condition they can't hold under `unsupported`. If that list isn't empty, the box says "I can't filter by … yet" instead of answering without it. Answers name the limits they applied ("Best in AST among forwards"), so a misreading is visible. Nine cases of this kind were added, including the preview question word for word and three that must be declined (age, rookies, health). On all 51 questions: DeepSeek V4.1 Flash 100% correct, median 1.5 s; Gemini 2.5 Flash-Lite 100%, 0.4 s.

### Rookies and missed games, 2026-10-20

After rookie values (ADR 0012) and the missed-games discount (ADR 0013), rookies are on the board with a price but no category stats. Category answers ("best scorer", "weakest in", comparisons in a category) leave rookies out and say so when one is named. "Tell me about" a rookie gives his price and that it comes from his draft slot; for a discounted player it mentions the missed-games cut. The prompt now says an unfamiliar name may be a rookie, as models declined to answer about AJ Dybantsa without it, and that words a field already holds ("cheap" with a price) aren't unsupported conditions. Two rookie questions were added (53 in all). DeepSeek V4.1 Flash: 100% correct, median 1.5 s. Gemini 2.5 Flash-Lite, the fallback, had 0% wrong but 42–49% provider errors across two runs that day; its earlier runs had none.
