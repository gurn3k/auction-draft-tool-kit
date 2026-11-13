// Draft-room bookkeeping: who bought whom, for how much, and what each team can
// still afford. Pure functions over a plain state object, so it can be saved as JSON.

export function newDraft(league, myTeam = 0) {
  return {
    teams: Array.from({ length: league.teams }, (_, i) => ({ name: i === myTeam ? 'My team' : `Team ${i + 1}` })),
    myTeam,
    picks: [],
  };
}

export function teamSummaries(draft, league) {
  return draft.teams.map((t, i) => {
    const picks = draft.picks.filter((p) => p.team === i);
    const spent = picks.reduce((a, p) => a + p.price, 0);
    const left = league.budget - spent;
    const open = league.rosterSize - picks.length;
    // Every empty spot still needs at least $1, so the most a team can bid now
    // is what it has left minus $1 for each other open spot.
    const maxBid = open > 0 ? left - (open - 1) : 0;
    return { index: i, name: t.name, picks, spent, left, open, maxBid };
  });
}

// A count typed in a box (teams, spots, games): digits 0-9 only, or NaN. The
// browser's number box reads "1e1" as 10 and "12.5" as 12.5, and neither
// should quietly become a league setting.
export const wholeNumber = (text) => (/^\s*\d+\s*$/.test(String(text ?? '')) ? Number(text) : NaN);

// The league settings the app accepts. Every team must be able to fill every
// spot at $1, so the budget is at least the number of roster spots.
export const LEAGUE_LIMITS = {
  teams: { min: 2, max: 20, label: 'Teams' },
  budget: { min: 1, max: 2000, label: 'Budget per team', money: true },
  rosterSize: { min: 1, max: 25, label: 'Roster spots' },
  minGames: { min: 0, max: 82, label: 'Minimum games' },
};

// Why these league settings can't be used, as { field, message }, or null if
// they're fine. With picks already logged (and teams and spots unchanged), the
// budget can't drop below what a team has spent plus $1 for each spot it still
// has to fill.
export function leagueProblem(league, draft = null) {
  for (const [field, { min, max, label, money }] of Object.entries(LEAGUE_LIMITS)) {
    const v = league[field];
    const lo = field === 'budget' && Number.isInteger(league.rosterSize) ? Math.max(min, league.rosterSize) : min;
    const unit = money ? '$' : '';
    if (!Number.isInteger(v) || v < lo || v > max) {
      const why = field === 'budget' && lo > min ? `, so each team has $1 for each of its ${lo} roster spots` : '';
      return { field, message: `${label} must be a whole number from ${unit}${lo} to ${unit}${max.toLocaleString('en-US')}${why}.` };
    }
  }
  if (draft?.picks.length && draft.teams.length === league.teams) {
    for (const t of teamSummaries(draft, league)) {
      const need = t.spent + Math.max(0, t.open);
      if (need > league.budget) {
        return { field: 'budget', message: `${t.name} has already spent $${t.spent} and has ${t.open} spot${t.open === 1 ? '' : 's'} to fill, so the budget can’t go below $${need}.` };
      }
    }
  }
  return null;
}

// Returns an error message, or null if the pick is legal.
export function checkPick(draft, league, { playerId, price, team }) {
  if (!Number.isInteger(price) || price < 1) return 'Price must be a whole number of at least $1.';
  if (!(team >= 0 && team < draft.teams.length)) return 'Pick a team.';
  if (draft.picks.some((p) => p.playerId === playerId)) return 'That player has already been drafted.';
  const t = teamSummaries(draft, league)[team];
  if (t.open <= 0) return `${t.name} has a full roster.`;
  if (price > t.maxBid) return `${t.name} can bid at most $${t.maxBid}.`;
  return null;
}

export function addPick(draft, league, pick) {
  const error = checkPick(draft, league, pick);
  if (error) throw new Error(error);
  // The name is stored too, so picks of players missing from the data (a rookie,
  // say) still read properly and survive switching data sources.
  return { ...draft, picks: [...draft.picks, { playerId: pick.playerId, name: pick.name ?? pick.playerId, price: pick.price, team: pick.team }] };
}

export function removePick(draft, playerId) {
  return { ...draft, picks: draft.picks.filter((p) => p.playerId !== playerId) };
}

// What to bid on a player: the live value, capped at what my team can afford.
export function bidCeiling(liveValue, me) {
  if (me.open <= 0) return 0;
  return Math.max(1, Math.min(Math.round(liveValue), me.maxBid));
}

// My roster's strength by category: the sum of my players' z-scores.
export function categoryTotals(myPlayers, categories) {
  return Object.fromEntries(categories.map((c) => [c.key, myPlayers.reduce((a, p) => a + (p.z?.[c.key] ?? 0), 0)]));
}

// A player counts as strong in a category at a z-score of 1 or more, and a
// category is scarce once this few strong players are left in it.
export const STRONG_Z = 1;
export const SCARCE_LEFT = 5;

// How many undrafted players are still strong in each category.
export function categorySupply(available, categories) {
  return Object.fromEntries(categories.map((c) => [c.key, available.filter((p) => (p.z?.[c.key] ?? 0) >= STRONG_Z).length]));
}

// The scarce categories this player is strong in, rarest first. `left` counts him.
export function scarceStrengths(player, supply, categories) {
  if (!player.z) return [];
  return categories
    .filter((c) => player.z[c.key] >= STRONG_Z && supply[c.key] <= SCARCE_LEFT)
    .map((c) => ({ key: c.key, label: c.label, left: supply[c.key] }))
    .sort((a, b) => a.left - b.left);
}
