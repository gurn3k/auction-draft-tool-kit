// "Worth to you" (ADR 0006): the Live price nudged by how well a player fits my
// roster's category gaps. Live stays the market price; this only tilts it.

export const FIT_STRENGTH = 0.5; // most a category's weight moves from 1
export const FIT_LIMIT = 0.2; // worth to you stays within ±20% of Live
const FULL_GAP = 2; // a gap of 2 z (about one strong specialist) gets the full tilt

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// How much category fit counts: none with an empty roster, full once half my
// spots are filled. Early on there's no roster shape to fit.
export function fitStrength(filled, rosterSize) {
  if (rosterSize <= 0) return 0;
  return FIT_STRENGTH * clamp(filled / (rosterSize / 2), 0, 1);
}

// Category weights from my totals (sum of my players' z-scores). A category
// lagging my own average weighs more, one ahead of it less. Weights average 1,
// so a player who helps evenly is worth about his Live price.
export function needWeights(totals, categories, strength) {
  if (!categories.length) return {};
  const avg = categories.reduce((a, c) => a + (totals[c.key] ?? 0), 0) / categories.length;
  const raw = categories.map((c) => 1 + strength * clamp((avg - (totals[c.key] ?? 0)) / FULL_GAP, -1, 1));
  const mean = raw.reduce((a, b) => a + b, 0) / raw.length;
  return Object.fromEntries(categories.map((c, i) => [c.key, raw[i] / mean]));
}

// How much more (or less) a player is worth to me than to an average team: his
// weighted surplus over the replacement player, divided by his plain surplus.
// Players at or below replacement level have no surplus to tilt.
export function fitFactor(player, replacement, weights, categories) {
  if (!player.z || !replacement?.z) return 1;
  const plain = categories.reduce((a, c) => a + player.z[c.key] - replacement.z[c.key], 0);
  if (plain <= 0) return 1;
  const weighted = categories.reduce((a, c) => a + weights[c.key] * (player.z[c.key] - replacement.z[c.key]), 0);
  return weighted / plain;
}

// Live × fit, held within ±20% of Live and never under $1.
export function worthToYou(live, fit) {
  if (live < 0.5) return live;
  return Math.max(1, clamp(live * fit, live * (1 - FIT_LIMIT), live * (1 + FIT_LIMIT)));
}

// The categories that moved his price, biggest first, in the direction it moved.
export function fitDrivers(player, replacement, weights, categories, direction) {
  if (!player.z || !replacement?.z) return [];
  return categories
    .map((c) => ({ label: c.label, d: (weights[c.key] - 1) * (player.z[c.key] - replacement.z[c.key]) }))
    .filter((x) => x.d * direction > 0.05)
    .sort((a, b) => (b.d - a.d) * direction)
    .map((x) => x.label);
}
