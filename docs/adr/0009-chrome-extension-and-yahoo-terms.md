# 0009: A Chrome extension instead of Yahoo's API: what the terms allow

Status: proposed, 2026-10-19. Waiting on the product owner's decision. The Yahoo API version ([0005](0005-yahoo-sign-in.md)) stays parked on its own branch, untouched.

## Question

Yahoo sync is blocked on approval for Yahoo's Fantasy API. A Chrome extension could read the draft room page the user already has open and log each sale as it appears, with no API call. Would that do the same job and remove the need for Yahoo's approval?

## What the terms say

Checked 2026-10-19.

**[Yahoo Terms of Service](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html)**, which apply to every Yahoo service including Fantasy:
- **2(d)(9):** you must not "access or collect data, or attempt to access or collect data, from our Services using any automated means, including but not limited to robots, spiders, scrapers, data mining tools, or data gathering or extraction tools for any purpose without our express, prior permission."
- **2(d)(10):** you must not use content or data "to create any database" or "to provide any service that competes with or constitutes a material substitute for our Services or data."
- **2(e):** you must not access the services "using a method other than the interface and the instructions that we provide."

**[Fantasy Basketball Additional Terms](https://legal.yahoo.com/us/en/yahoo/terms/product-atos/fantasy-basketball/general/index.html)** say nothing on bots, tools or extensions. They allow suspension for "cheating or manipulation of the Service", and incorporate the Official Game Rules, which I haven't read.

## Reading

- **2(e) is fine.** The extension uses Yahoo's own page in the user's own browser; it doesn't reach Yahoo another way.
- **2(d)(10) is fine.** The picks stay in the user's browser to price the board. Cap Drafter isn't a substitute for Yahoo Fantasy.
- **2(d)(9) is the problem.** A script that reads sales off the draft room page and copies them into another app is, on a plain reading, automated collection of data with an extraction tool. The clause covers "any purpose" and asks for "express, prior permission". Reading the page the user is already viewing, with no extra requests to Yahoo, is a much smaller thing than a crawler. But the words don't make that distinction.

**Industry practice.** Established tools sync with Yahoo draft rooms through extensions: FantasyPros' [Draft Assistant](https://support.fantasypros.com/hc/en-us/articles/360034462253-How-do-I-use-the-FantasyPros-Browser-Extension-with-my-Yahoo-live-and-mock-drafts) and [Draft Caddie](https://addons.mozilla.org/firefox/addon/draft-caddie/), among others. That shows Yahoo has tolerated it for years. It doesn't show permission: I found no Yahoo statement allowing it, and those companies may have agreements I can't see.

## Conclusion

An extension that reads the draft room **does not remove the need for Yahoo's permission. It swaps a formal approval for a terms risk.** That is the same situation as the scraped stats in [0007](0007-licensed-player-data.md), where the terms said no and I changed course. Shipping a public extension on that reading would contradict the reason the project changed data sources.

## Options

| Option | Sync | Terms | Effort |
|---|---|---|---|
| A. Wait for API approval (status quo) | Yes, once approved | Clean | Done; parked |
| **B. Side-panel extension, no page reading** | No; picks logged by hand as today | Clean: it never touches Yahoo's pages | Small |
| C. Ask Yahoo for express permission for the extension | Yes, if granted | Clean, if granted | One email; uncertain answer |
| D. Ship the reading extension on industry practice | Yes | 2(d)(9) risk | Medium; breaks when Yahoo changes the page |

## Recommendation

B now, and keep A pending; C is worth one email alongside the existing API application.

B gets the main usability gain, the app in Chrome's side panel beside the draft room in one window, without reading Yahoo's pages. Logging stays manual, which is how the app already works. D is declined for the public app for the reason above.
