# 0005: Yahoo sign-in, league import and live draft sync

Status: built, then parked 2026-10-19 while waiting for Yahoo's Fantasy API approval (see Verification). The code is kept on a private branch until then. `main` ships without sign-in, so the public app never shows a button that can't work yet. Supersedes the "Yahoo sign-in: out of scope" note in [0001](0001-web-app-first.md).

## Decision

Users can sign in with Yahoo, choose one of their NBA leagues for the current season (with a picker when there is more than one), and import it. Optionally, the app then follows the draft live.

### Server

The app stays a static site. A few Vercel Functions in `api/` handle what a browser can't safely do itself:

| Route | Does |
|---|---|
| `GET /api/auth/login` | Sets a random `state` cookie (10 min) and redirects to Yahoo's consent page |
| `GET /api/auth/callback` | Checks `state`, swaps the code for tokens, seals them into the session cookie |
| `POST /api/auth/logout` | Clears the session cookie |
| `GET /api/yahoo/session` | Whether the server is configured and this browser is signed in |
| `GET /api/yahoo/leagues` | The user's NBA leagues for the latest season |
| `GET /api/yahoo/league?key=` | One league's settings and teams |
| `GET /api/yahoo/draft?key=&have=` | Draft results so far, plus names for players the browser hasn't seen |

- **No database.** The Yahoo access and refresh tokens live in one cookie, encrypted with AES-256-GCM using `SESSION_SECRET`. The cookie is `HttpOnly`, `Secure` and `SameSite=Lax`, so page scripts can never read the tokens.
- **Refresh:** access tokens last an hour. Each API call refreshes one that's about to expire, and sends the browser a new cookie.
- **Input checks:** league and player keys are validated against Yahoo's formats before they go into a Yahoo URL.

### Import

`site/lib/yahoo.js` maps a league into the app's settings:
- number of teams and team names, with the signed-in user's team selected
- roster spots, counting every slot except IL, IL+ and NA
- the budget
- the scoring categories

For categories, the 9 the app can value are used and any others are listed in a warning. Values are then computed for the league's categories only, so an 8-cat league without TO is valued without TO.

Yahoo hasn't documented the auction budget's field name, so several likely names are checked. If none is present, the budget already entered stays, and a warning asks the user to confirm it. Points leagues and snake drafts import, with a warning.

### Live draft sync

While sync is on, the page asks `/api/yahoo/draft` for results every 8 seconds, or every 32 seconds while the tab is hidden.
- **Matching:** each Yahoo player is matched to a board player by the same rules as ADR 0004: name and aliases, with accents and suffixes ignored. A name shared by two players is settled by team, or not at all.
- **Unmatched players** are logged by Yahoo's name, so money and roster spots still add up.
- **Yahoo is the record:** synced picks skip the budget checks, replace any hand-logged pick for the same player, and can't be undone in the app.

## Configuration (Vercel environment variables)

| Variable | What |
|---|---|
| `YAHOO_CLIENT_ID`, `YAHOO_CLIENT_SECRET` | From the Yahoo developer app (Fantasy Sports: Read) |
| `YAHOO_REDIRECT_URI` | `https://<production domain>/api/auth/callback`. Must match the Yahoo app exactly |
| `SESSION_SECRET` | 32+ random characters, used to encrypt session cookies |

## Verification

- **Unit and handler tests** (`test/yahoo.test.js`): parsing, cookie sealing and tampering, the state check, token refresh, key validation, and matching.
- **Browser test:** a mock server ran the real handlers with Yahoo's servers stubbed. It covered the whole flow: sign-in return, picker, import, two sync polls, reload and disconnect.
- **Blocked on Yahoo approval (2026-10-16).** The first live sign-in worked, but every Fantasy API call returned 403 "This application is not authorized to perform this action", even with the app's Fantasy Sports: Read permission ticked and scope `fspt-r` requested. Developers report Yahoo has required approved access for the Fantasy API since July 2026: apply at https://sports.yahoo.com/developer/access/, sign the API access agreement, then submit the Client ID at https://sports.yahoo.com/developer/application-confirmation/. Reported turnaround is 2 to 8 weeks, and some needed a new app created after approval (and so a new Client ID and secret). Source: community reports (yfpy issue #84), not an official Yahoo statement.
- **Not yet checked live.** The fixtures follow Yahoo's documented JSON shape, but the parsers haven't seen a real league yet. The first real sign-in is the check, especially for the budget field.
