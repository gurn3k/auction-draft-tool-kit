// Turns balldontlie's season averages and active rosters into the player shape
// the valuation engine reads. Pure, so it is tested on fixtures. ADR 0007.
//
// Both come from one source keyed by the same player id, so stats and current
// teams join on that id: no name matching across sites (see ADR 0004).

import { ascii } from '../site/lib/names.js';

const EMPTY_STATS = { gp: 0, mpg: 0, fgm: 0, fga: 0, ftm: 0, fta: 0, tpm: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0 };

const fullName = (p) => `${p.first_name} ${p.last_name}`.trim();

// NBA numbers are 0 to 99 (with 00). Anything else is a data slip ("1922"), so it's left out.
const jerseyOf = (p) => (/^\d{1,2}$/.test(p?.jersey_number ?? '') ? p.jersey_number : undefined);

// Every spelling of a player worth searching by, minus the one shown.
export function aliasesFor(display, names) {
  const all = new Set();
  for (const n of names) {
    if (!n) continue;
    all.add(n);
    all.add(ascii(n));
  }
  all.delete(display);
  return [...all].sort();
}

/**
 * @param averages  season_averages/general rows: { player, stats }
 * @param active    players/active rows: { id, first_name, last_name, position, draft_year, team }
 * @param names     { [bdlId]: display name } for players better known by another name
 * @param rookieYear draft year of this season's rookies
 */
export function buildPlayers(averages, active, { names = {}, notes = {}, rookieYear } = {}) {
  const current = new Map(active.map((p) => [p.id, p]));
  const shown = (p) => names[p.id] ?? fullName(p);
  const seen = new Set();

  const pool = averages.map(({ player: p, stats: s }) => {
    seen.add(p.id);
    const name = shown(p);
    return {
      id: `bdl-${p.id}`, name, age: s.age ?? null, team: current.get(p.id)?.team?.abbreviation ?? 'FA', pos: p.position ?? '',
      // Today's number for a rostered player; a free agent keeps his last one.
      jersey: jerseyOf(current.get(p.id)) ?? jerseyOf(p),
      gp: s.gp, mpg: s.min, fgm: s.fgm, fga: s.fga, ftm: s.ftm, fta: s.fta, tpm: s.fg3m,
      pts: s.pts, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk, tov: s.tov,
      aliases: aliasesFor(name, [name, fullName(p)]),
      // A hand-kept note on a season that may mislead (ADR 0010). Never changes a price.
      ...(notes[p.id] ? { note: notes[p.id].note } : {}),
    };
  });

  // Rostered players with no stats to value (mostly rookies) are added, unvalued.
  const added = active
    .filter((p) => !seen.has(p.id))
    .map((p) => {
      const name = shown(p);
      return {
        id: `bdl-${p.id}`, name, age: null, team: p.team.abbreviation, pos: p.position ?? '', jersey: jerseyOf(p), ...EMPTY_STATS,
        added: true, rookie: p.draft_year === rookieYear, aliases: aliasesFor(name, [name, fullName(p)]),
        // Where he was drafted, for a rookie's draft-slot estimate (ADR 0012).
        ...(p.draft_year === rookieYear && p.draft_number ? { pick: p.draft_number } : {}),
      };
    });

  return [...pool, ...added];
}

/**
 * Past rookie seasons, for pricing this year's rookies by draft slot (ADR 0012).
 * A rookie season is the season that starts in his draft year. Undrafted players
 * carry no draft year, so they can't be placed and are left out.
 * @param bySeason { [season]: season_averages/general rows }
 */
export function buildRookieHistory(bySeason) {
  const classes = Object.keys(bySeason).map(Number).sort((a, b) => a - b);
  const players = [];
  for (const season of classes) {
    for (const { player: p, stats: s } of bySeason[season]) {
      if (p.draft_year !== season || !p.draft_number) continue;
      players.push({
        year: season, pick: p.draft_number, gp: s.gp, mpg: s.min, fgm: s.fgm, fga: s.fga, ftm: s.ftm, fta: s.fta,
        tpm: s.fg3m, pts: s.pts, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk, tov: s.tov,
      });
    }
  }
  players.sort((a, b) => a.year - b.year || a.pick - b.pick);
  return { classes, players };
}
