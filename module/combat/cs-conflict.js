// Conflict resolution — the single source of truth (SSOT, constitution §II) for
// the pure math of a targeted conflict roll (spec 010): range penalty, degrees of
// success, damage, influence, and the target's size→difficulty modifier.
//
// PURE module (no Foundry runtime at eval time) → testable in Vitest. Mirrors
// `cs-difficulty.js`: numbers in, numbers out, no `game`/`canvas`/`actor`.
//
// IMPORT-CYCLE INVARIANT (spec 008/009, MEMORY slug-identity-and-slugify-cycle):
// this module MUST NOT import `ChronicleSystem.js` NOR `cs-effect-vocabulary.js`
// (the vocabulary reads `ChronicleSystem.modifiersConstants` at eval time). It is
// dependency-free — numbers in, numbers out.

/** Combat Defense modifier by target size (FR-014); unknown slug → 0. */
export const SIZE_DEFENSE_MODIFIER = Object.freeze({
  small: 2,
  medium: 0,
  large: -2,
});

/**
 * Range penalty (−#D): 0 within the free range, then +1 per increment STARTED (any
 * fraction beyond the free range already costs the next −1D). `band` = {free, inc}
 * (scene units), resolved data-driven from the weapon's range quality by
 * `weaponRangeBand` (spec 020); `null` (melee / no ranged quality) → 0.
 * @param {number} distance the measured distance, in the scene's units
 * @param {{free: number, inc: number} | null} band
 * @returns {number}
 */
export function rangePenalty(distance, band) {
  if (!band || !(band.inc > 0)) return 0;
  return Math.max(0, Math.ceil((Number(distance) - band.free) / band.inc));
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
