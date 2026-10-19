// Name normalisation shared by the data script (Node) and the app (browser),
// so both sides match player names by exactly the same rules. ADR 0004.

export const ascii = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/ı/g, 'i').replace(/ł/g, 'l').replace(/ø/g, 'o').replace(/đ/g, 'd').replace(/ß/g, 'ss');

// Names are compared without accents, punctuation or suffixes, so "Luka Dončić"
// matches "Luka Doncic" and "Jaren Jackson Jr." matches "Jaren Jackson".
const SUFFIX = /\b(jr|sr|ii|iii|iv|v)\b/g;
export const nameKey = (s) => ascii(s)
  .toLowerCase().replace(/[.'’`-]/g, '').replace(SUFFIX, '').replace(/[^a-z ]/g, ' ')
  .replace(/\s+/g, ' ').trim();
