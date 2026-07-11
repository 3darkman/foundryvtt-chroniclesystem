// Heraldic vocabulary SSOT (FR-019). ONE frozen CATALOG feeds BOTH the editor
// selectors AND the validation allowlist. The raw arrays are generated from the
// Armoria sources by scripts/extract-armoria-catalog.mjs (do not hand-edit
// data/armoria-catalog.js). See contracts/vocabulary-catalog.md.

import {
  shields,
  shieldMeta,
  shieldPaths,
  divisions,
  lines,
  ordinaries,
  linedOrdinaries,
  charges,
  chargeMeta,
  positions,
  tinctures,
  patterns,
  sizes,
  chargeThumbs,
} from "./data/armoria-catalog.js";

/** Frozen vocabulary: array axes (options + allowlist) + per-item metadata. */
export const CATALOG = Object.freeze({
  shields,
  shieldMeta,
  shieldPaths,
  divisions,
  lines,
  ordinaries,
  linedOrdinaries,
  charges,
  chargeMeta,
  positions,
  tinctures,
  patterns,
  sizes,
  chargeThumbs,
});

/** Axes that are simple key allowlists (arrays of canonical EN keys). */
const ALLOWLIST_AXES = new Set([
  "shields",
  "divisions",
  "lines",
  "ordinaries",
  "linedOrdinaries",
  "charges",
  "positions",
  "tinctures",
  "patterns",
  "sizes",
]);

// Sets for O(1) membership on the hot validation path.
const AXIS_SETS = Object.freeze(
  Object.fromEntries(
    [...ALLOWLIST_AXES].map((axis) => [axis, new Set(CATALOG[axis])])
  )
);

/**
 * Is `key` a member of the allowlist axis `axis`?
 * @param {string} axis  one of the array axes (e.g. "charges", "tinctures")
 * @param {string} key   canonical EN key
 * @returns {boolean}
 */
export function has(axis, key) {
  return AXIS_SETS[axis]?.has(key) ?? false;
}

/** Valid charge position codes for a shield (falls back to all presets). */
export function shieldPositions(shieldKey) {
  const meta = CATALOG.shieldMeta[shieldKey];
  return meta?.positions?.length ? meta.positions : CATALOG.positions;
}

/** Per-charge metadata (colors/sinister/reversed/layered/positions) or `{}`. */
export function chargeInfo(chargeKey) {
  return CATALOG.chargeMeta[chargeKey] ?? {};
}
