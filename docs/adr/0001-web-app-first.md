# 0001: Web app first, browser extension later

Status: accepted, 2026-10-16

## Context

The eventual home for this tool is inside Yahoo's draft room, as a browser extension that reads each sale and updates prices without typing. Other options were a standalone web app and a web app that signs in with Yahoo (OAuth) to read league settings and draft results.

## Decision

v1 is a static web app the manager keeps open beside the draft room and logs picks into by hand.

All the maths (valuation, live re-pricing, pick rules, CSV parsing) lives in `site/lib/` as pure ES modules with no DOM access and no network calls. The page (`site/app.js`) is a thin layer over them.

## Why

- An extension depends on Yahoo's draft-room markup, which can change without notice and can't be tested outside a live draft. It also needs store review.
- Yahoo's API needs a registered app and OAuth, and draft results only arrive by polling. That is a lot of setup before the valuation itself is proven.
- The value of the tool is the numbers. Proving those first, with tests, is the cheaper order.

## Consequences

- One manual step per sale (click a row, type a price). Logging one sale should take only a few seconds.
- An extension later imports `site/lib/*.js` unchanged and replaces only the input step.
