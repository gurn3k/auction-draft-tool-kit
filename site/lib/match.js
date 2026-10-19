// Turns what someone typed in "Player sold" into a player, without guessing.
// Exact names, aliases and suffix-free names ("Jaren Jackson") resolve at once;
// a surname, partial name or typo only suggests, so a pick never lands on the
// wrong player (or on a made-up one) without a second look.
import { nameKey } from './names.js';

const names = (p) => [p.name, ...(p.aliases ?? [])];

// Levenshtein distance, stopping early once it passes max.
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// Every typed word starts a word of the name, in any order: "jokic", "porter",
// "jaren jack", "shai gilg".
function wordsMatch(typed, key) {
  const words = key.split(' ');
  return typed.split(' ').every((t) => words.some((w) => w.startsWith(t)));
}

// Close misspelling of the whole name or the surname: "jokc", "wembanyamma".
function nearMiss(typed, key) {
  const max = typed.length >= 9 ? 2 : typed.length >= 4 ? 1 : 0;
  if (!max) return false;
  return distance(typed, key, max) <= max || distance(typed, key.split(' ').pop(), max) <= max;
}

// label(p) is the exact dropdown text, e.g. "Nikola Jokić (DEN)".
// Returns one of:
//   { kind: 'player', player }          safe to log
//   { kind: 'suggest', options: [...] } close matches, best first; ask which
//   { kind: 'unknown' }                 nothing close (a rookie not in the data, or junk)
export function findPlayer(text, pool, { drafted = new Set(), label = (p) => p.name } = {}) {
  const raw = text.trim();
  if (!raw) return null;
  const byLabel = pool.find((p) => label(p) === raw);
  if (byLabel) return { kind: 'player', player: byLabel };

  // A trailing "(TEAM)" from the dropdown is dropped before comparing names.
  const typed = nameKey(raw.replace(/\s*\([^)]*\)$/, ''));
  if (!typed) return { kind: 'unknown' };
  // Prefer an undrafted player when two share a name; a drafted one is still
  // returned so the caller can say "already drafted" instead of logging a copy.
  const prefer = (list) => list.find((p) => !drafted.has(p.id)) ?? list[0];
  const same = pool.filter((p) => names(p).some((n) => nameKey(n) === typed));
  if (same.length === 1 || (same.length > 1 && same.filter((p) => !drafted.has(p.id)).length <= 1)) {
    return { kind: 'player', player: prefer(same) };
  }
  if (same.length > 1) return { kind: 'suggest', options: same.filter((p) => !drafted.has(p.id)) };

  const rank = (p) => p.rank ?? 9999;
  // Spelling guesses only when nothing matches as typed, so "jokic" offers
  // Jokić alone, not Jović (a different player one letter away).
  const by = (test) => pool.filter((p) => names(p).some((n) => test(typed, nameKey(n))));
  const words = by(wordsMatch);
  const close = (words.length ? words : by(nearMiss))
    .sort((a, b) => Number(drafted.has(a.id)) - Number(drafted.has(b.id)) || rank(a) - rank(b));
  return close.length ? { kind: 'suggest', options: close.slice(0, 6) } : { kind: 'unknown' };
}
