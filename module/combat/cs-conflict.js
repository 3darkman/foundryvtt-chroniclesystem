// Conflict resolution — the single source of truth (SSOT, constitution §II) for
// the pure math of a targeted conflict roll (spec 010): distance→yards conversion,
// range penalty, degrees of success, damage, influence, and the target's
// size→difficulty modifier.
//
// PURE module (no Foundry runtime at eval time) → testable in Vitest. Mirrors
// `cs-difficulty.js`: numbers in, numbers out, no `game`/`canvas`/`actor`.
//
// IMPORT-CYCLE INVARIANT (spec 008/009, MEMORY slug-identity-and-slugify-cycle):
// this module MUST NOT import `ChronicleSystem.js` NOR `cs-effect-vocabulary.js`
// (the vocabulary reads `ChronicleSystem.modifiersConstants` at eval time). It
// imports only `cs-slugify.js` (dependency-free) — `weaponQualitySlug` is just
// `slugify`, so slugging the quality names here stays clear of the cycle.

import { slugify } from "../effects/cs-slugify.js";

/** Range bands (yards): no penalty up to `free`, then −1D per `inc` started. */
export const RANGE_BANDS = Object.freeze({
  close: { free: 10, inc: 10 }, // Close Range
  long: { free: 100, inc: 100 }, // Long Range
});

/** Scene-unit → yards factors (rounded). Unknown unit → 1 (treated as yards). */
export const DISTANCE_UNIT_TO_YARDS = Object.freeze({
  m: 1,
  ft: 1 / 3, // 3 feet = 1 yard
  yd: 1,
  km: 1000,
});

/** Combat Defense modifier by target size (FR-014); unknown slug → 0. */
export const SIZE_DEFENSE_MODIFIER = Object.freeze({
  small: 2,
  medium: 0,
  large: -2,
});

// Canonical range-quality slugs (weaponQualitySlug === slugify).
const CLOSE_SLUG = "close_range";
const LONG_SLUG = "long_range";

/**
 * Convert a scene-unit distance to yards. Unknown/unlisted unit → 1:1 (yards),
 * never throwing. Case-insensitive on the unit string.
 * @param {number} distance
 * @param {string} units
 * @returns {number}
 */
export function distanceToYards(distance, units) {
  const factor = DISTANCE_UNIT_TO_YARDS[units?.toLowerCase?.()] ?? 1;
  return (Number(distance) || 0) * factor;
}

/**
 * Resolve a weapon's range category from its qualities, by STABLE SLUG (never the
 * displayed text → survives translation). `long` wins if both are present
 * (inconsistent data → the wider band). Melee weapons → `null`.
 * @param {Array<{name: string}>} qualities
 * @returns {"close" | "long" | null}
 */
export function rangeCategoryFromQualities(qualities) {
  let hasClose = false;
  for (const quality of qualities ?? []) {
    const slug = slugify(quality?.name ?? "");
    if (slug === LONG_SLUG) return "long";
    if (slug === CLOSE_SLUG) hasClose = true;
  }
  return hasClose ? "close" : null;
}

/**
 * Range penalty (−#D): 0 within the free range, then +1 per increment STARTED
 * (any fraction beyond the free range already costs the next −1D). `null`
 * category (melee) → 0.
 * @param {number} distanceYards
 * @param {"close" | "long" | null} category
 * @returns {number}
 */
export function rangePenalty(distanceYards, category) {
  if (category == null) return 0;
  const band = RANGE_BANDS[category];
  if (!band) return 0;
  return Math.max(0, Math.ceil((Number(distanceYards) - band.free) / band.inc));
}

/**
 * Degrees of success from the roll margin (= total − target). Same band
 * boundaries as `resolveVerdict.degreeKey` (spec 009), returning the COUNT (1–4)
 * used as the damage/influence multiplier. Assumed called only on a success
 * (`margin >= 0`).
 * @param {number} margin
 * @returns {1 | 2 | 3 | 4}
 */
export function degreesOfSuccess(margin) {
  if (margin <= 4) return 1;
  if (margin <= 9) return 2;
  if (margin <= 14) return 3;
  return 4;
}

/**
 * Damage on a hit: `(baseDamage × degrees) − armorRating`, floored at 0 (FR-017).
 * @param {number} baseDamage
 * @param {number} degrees
 * @param {number} armorRating
 * @returns {number}
 */
export function computeDamage(baseDamage, degrees, armorRating) {
  return Math.max(0, baseDamage * degrees - armorRating);
}

/**
 * Influence on a hit: `(influenceValue × degrees) − dispositionRating`, floored
 * at 0 (FR-018).
 * @param {number} influenceValue
 * @param {number} degrees
 * @param {number} dispositionRating
 * @returns {number}
 */
export function computeInfluence(influenceValue, degrees, dispositionRating) {
  return Math.max(0, influenceValue * degrees - dispositionRating);
}

/**
 * The Combat Defense modifier a target's size adds to the roll's difficulty
 * (FR-014): `small` → +2, `large` → −2, `medium`/unknown/undefined → 0. Read by
 * SLUG so the stored Combat Defense stays size-agnostic.
 * @param {string} sizeSlug
 * @returns {number}
 */
export function combatDefenseSizeModifier(sizeSlug) {
  return SIZE_DEFENSE_MODIFIER[sizeSlug] ?? 0;
}
