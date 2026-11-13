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

// The id of a player logged by name only (a rookie missing from the data). A
// Latin name keeps its readable id ("custom-jose-garcia"). A name in another
// script keeps its letters: stripping them left "custom-" for every such name,
// so a second Korean or Cyrillic rookie was refused as already drafted.
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const slug = (s) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const customId = (name) => {
  const plain = slug(name);
  const kept = /[^\x00-\x7f]/.test(fold(name)) || !plain;
  return `custom-${kept ? encodeURIComponent(fold(name).replace(/\s+/g, '-')) : plain}`;
};
