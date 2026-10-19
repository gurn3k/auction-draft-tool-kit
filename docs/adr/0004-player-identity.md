# 0004: Player identity across sources

Status: superseded 2026-10-19 by [0007](0007-licensed-player-data.md). Stats and rosters now come from one source with one player id, so no cross-site matching is needed. The name rules (accents, punctuation, suffixes) live on in `site/lib/names.js` for search and CSV matching. Kept as a record.

## Context

Stats come from Basketball-Reference and current teams come from NBA.com rosters. The two sites spell some names differently:
- accents: Alperen Şengün / Alperen Sengun
- suffixes: Jimmy Butler / Jimmy Butler III
- initials: A.J. Green / AJ Green
- capitals: Tristan Da Silva / Tristan da Silva
- different names entirely: Ron Holland / Ronald Holland II

A wrong match would give one player's stats another's team. A missed match would list a player twice: once as a free agent with value, once as an unvalued "new" player.

## Decision

Match in this order. Never guess.

1. **Recorded link.** `data/player-links.json` maps each Basketball-Reference id to an NBA.com player id, with both spellings. Once a player is linked, later runs match by id, so a spelling change on either site can't break or swap the match.
2. **Hand-kept alias.** `data/name-aliases.json` → `aliases` lists other names a Basketball-Reference player goes by.
3. **Same name after normalising.** Accents (ş, ņ, ć…), punctuation and Jr./Sr./II–V suffixes are ignored. This counts only when exactly one player on each side has the name. If two pool players or two roster players share it, nothing is matched or added. The run prints it under **AMBIGUOUS** for a person to resolve with an alias.

After matching:
- **Every spelling is recorded.** Each player in `site/data/players.json` carries `aliases`: the other site's spelling, any hand-kept aliases, and an accent-free form of each. The app searches and logs picks by any of them, so "Doncic" finds Dončić.
- **Possible mix-ups are flagged.** A veteran who would be added as new while sharing a surname with an unmatched pool player is printed under **CHECK**. A person answers once in `data/name-aliases.json`: under `aliases` if it's the same player, or under `distinct` if not. Confirmed-distinct pairs aren't raised again.
- **Teams** come from the matched roster entry. A pool player on no roster is marked `FA`. Last season's team is kept as `lastSeasonTeam`, with Basketball-Reference codes converted to NBA.com's (BRK→BKN, CHO→CHA, PHO→PHX).

## First run (2026-10-16)

- **Matched:** 471 players. 458 by exact name, 12 after normalising, and 1 by hand-kept alias (Ron Holland).
- **Checked by hand:** all 13 non-exact matches were correct. The 5 surname flags were all different people, and are recorded under `distinct`.
- **Teams:** 133 players changed teams, and 111 pool players are on no roster.

## Consequences

- Re-running `npm run fetch` rewrites `players.json` from Basketball-Reference. Run `npm run update-rosters` afterwards. The links file keeps every match, so nothing is re-guessed.
- Players whose names are typed into an uploaded CSV aren't linked. A CSV is a separate pool.
