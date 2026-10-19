// Turns balldontlie's season averages and active rosters into the player shape
// the valuation engine reads. Pure, so it is tested on fixtures. ADR 0007.
//
// Both come from one source keyed by the same player id, so stats and current
// teams join on that id: no name matching across sites (see ADR 0004).

import { ascii } from '../site/lib/names.js';

const EMPTY_STATS = { gp: 0, mpg: 0, fgm: 0, fga: 0, ftm: 0, fta: 0, tpm: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0 };

const fullName = (p) => `${p.first_name} ${p.last_name}`.trim();

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
export function buildPlayers(averages, active, { names = {}, rookieYear } = {}) {
  const teams = new Map(active.map((p) => [p.id, p.team?.abbreviation]));
  const shown = (p) => names[p.id] ?? fullName(p);
  const seen = new Set();

  const pool = averages.map(({ player: p, stats: s }) => {
    seen.add(p.id);
    const name = shown(p);
    return {
      id: `bdl-${p.id}`, name, age: s.age ?? null, team: teams.get(p.id) ?? 'FA', pos: p.position ?? '',
      gp: s.gp, mpg: s.min, fgm: s.fgm, fga: s.fga, ftm: s.ftm, fta: s.fta, tpm: s.fg3m,
      pts: s.pts, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk, tov: s.tov,
      aliases: aliasesFor(name, [name, fullName(p)]),
    };
  });

  // Rostered players with no stats to value (mostly rookies) are added, unvalued.
  const added = active
    .filter((p) => !seen.has(p.id))
    .map((p) => {
      const name = shown(p);
      return {
        id: `bdl-${p.id}`, name, age: null, team: p.team.abbreviation, pos: p.position ?? '', ...EMPTY_STATS,
        added: true, rookie: p.draft_year === rookieYear, aliases: aliasesFor(name, [name, fullName(p)]),
      };
    });

  return [...pool, ...added];
}
