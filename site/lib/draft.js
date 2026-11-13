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

// Reads a typed dollar amount (a price, a budget or a My value) as whole
// dollars: "56", "$56", "1,200", "1 200". Anything that could mean two amounts,
// or isn't whole dollars, is refused with the reason, never guessed: "1.200" is
// $1,200 in some countries and $1.20 in others, and "0,5" is half a dollar, not
// $5. Returns { value } or { error }.
const SPACES = /[    ]/; // plain, no-break, narrow no-break and thin spaces
export function parseDollars(text) {
  const typed = String(text ?? '').trim();
  const s = typed.replace(/^\$\s*/, '');
  if (!s) return { error: 'Enter an amount in whole dollars, like 25.' };
  if (/(?![0-9])\p{Nd}/u.test(s)) return { error: `Type “${typed}” with the digits 0-9.` };
  if (/^[-−]/.test(s)) return { error: 'Amounts are at least $1.' };
  if (/^\d+$/.test(s)) return { value: Number(s) };
  const seps = new Set(s.match(/\D/g));
  const digits = s.replace(/\D/g, '');
  // Thousands grouped with commas or a kind of space, or with dots in two or more groups.
  const grouped = new RegExp(`^\\d{1,3}([,]\\d{3})+$|^\\d{1,3}(${SPACES.source}\\d{3})+$|^\\d{1,3}(\\.\\d{3}){2,}$`);
  if (seps.size === 1 && grouped.test(s)) return { value: Number(digits) };
  if (/^\d{1,3}\.\d{3}$/.test(s)) {
    return { error: `“${s}” could be $${Number(digits).toLocaleString('en-US')} or $${Number(s).toFixed(2)}. Type whole dollars with no separator, like ${digits}.` };
  }
  if (/^\d*[.,]\d+$/.test(s)) return { error: `Amounts are in whole dollars, and “${s}” has cents.` };
  return { error: `“${s}” isn’t an amount. Type whole dollars, like 25.` };
}

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

// Whether a draft saved in the browser can be used as it is. Only its shape is
// checked, not League setup's limits, so a draft saved before those limits (a
// $5,000 budget, say) still loads. A damaged or hand-edited save would stop
// every render, so the app starts fresh instead.
const STAT_KEYS = ['gp', 'fgm', 'fga', 'ftm', 'fta', 'tpm', 'pts', 'reb', 'ast', 'stl', 'blk', 'tov'];
export function usableSave(saved, categoryKeys) {
  const { league, draft, myValues, csv } = saved ?? {};
  const whole = (x, min) => Number.isInteger(x) && x >= min;
  const plain = (o) => o != null && typeof o === 'object' && !Array.isArray(o);
  if (!plain(league) || !plain(draft)) return false;
  if (!whole(league.teams, 1) || !whole(league.rosterSize, 1) || !whole(league.budget, 1) || !whole(league.minGames, 0)) return false;
  if (league.categories != null && !(Array.isArray(league.categories) && league.categories.length && league.categories.every((k) => categoryKeys.includes(k)))) return false;
  const team = (i) => whole(i, 0) && i < league.teams;
  if (!Array.isArray(draft.teams) || draft.teams.length !== league.teams || !draft.teams.every((t) => typeof t?.name === 'string')) return false;
  if (!team(draft.myTeam) || !Array.isArray(draft.picks)) return false;
  if (!draft.picks.every((p) => typeof p?.playerId === 'string' && whole(p.price, 1) && team(p.team) && (p.name == null || typeof p.name === 'string'))) return false;
  if (myValues != null && !(plain(myValues) && Object.values(myValues).every((v) => whole(v, 1)))) return false;
  if (csv != null && !(plain(csv) && typeof csv.name === 'string' && Array.isArray(csv.players)
    && csv.players.every((p) => typeof p?.id === 'string' && typeof p.name === 'string' && STAT_KEYS.every((k) => Number.isFinite(p[k]))))) return false;
  return true;
}
