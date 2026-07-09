// Difficulty table + verdict/degree resolution — the single source of truth
// (SSOT, constitution §II) for the canonical difficulty ladder and the two-sided
// success/failure degree bands (US3).
//
// PURE module (no Foundry runtime at eval time) → testable in Vitest. `game` is
// referenced ONLY inside `readDifficultyTable()`'s body, never at module scope.
//
// IMPORT-CYCLE INVARIANT (spec 008/009, MEMORY slug-identity-and-slugify-cycle):
// this module MUST NOT import `cs-effect-vocabulary.js` NOR `ChronicleSystem.js`.
// `cs-effect-vocabulary` reads `ChronicleSystem.modifiersConstants` at eval time,
// so any module ChronicleSystem could reach must stay clear of the vocabulary.
// It imports only `csConstants.js` (a plain object, no Foundry deps).

import { CSConstants } from "../system/csConstants.js";

/**
 * The 8 canonical difficulty levels (SSOT). Targets from A Song of Ice and Fire
 * RPG p.31 (Table 2-1) / Sword Chronicle Core p.12. `label` is the GM override
 * literal (null on the factory entries → the localized `labelKey` is shown).
 * @type {ReadonlyArray<{labelKey: string, label: string|null, target: number}>}
 */
export const CANONICAL_DIFFICULTIES = Object.freeze(
  [
    ["CS.difficulty.automatic", 0],
    ["CS.difficulty.easy", 3],
    ["CS.difficulty.routine", 6],
    ["CS.difficulty.challenging", 9],
    ["CS.difficulty.formidable", 12],
    ["CS.difficulty.hard", 15],
    ["CS.difficulty.veryHard", 18],
    ["CS.difficulty.heroic", 21],
  ].map(([labelKey, target]) =>
    Object.freeze({ labelKey, label: null, target })
  )
);

/** The factory setting shape: the canonical entries + "no default" (free roll). */
export const CANONICAL_DIFFICULTY_SETTING = Object.freeze({
  entries: CANONICAL_DIFFICULTIES,
  defaultIndex: -1,
});

/** Degree bands (Sword Chronicle Core p.12), keyed by margin = total − target. */
function degreeKeyForMargin(margin) {
  if (margin <= -5) return "CS.difficulty.degree.criticalFailure";
  if (margin < 0) return "CS.difficulty.degree.marginalFailure"; // −4 … −1
  if (margin <= 4) return "CS.difficulty.degree.marginalSuccess"; // 0 … +4
  if (margin <= 9) return "CS.difficulty.degree.greatSuccess"; // +5 … +9
  if (margin <= 14) return "CS.difficulty.degree.incredibleSuccess"; // +10 … +14
  return "CS.difficulty.degree.astoundingSuccess"; // ≥ +15
}

/**
 * Resolve a roll total against a difficulty target. Success is `total >= target`
 * (equal = success, a marginal one — FR-013/edge case). NEVER called when there
 * is no difficulty (free roll).
 * @param {number} total
 * @param {number} target
 * @returns {{success: boolean, margin: number, degreeKey: string}}
 */
export function resolveVerdict(total, target) {
  const margin = Number(total) - Number(target);
  return {
    success: margin >= 0,
    margin,
    degreeKey: degreeKeyForMargin(margin),
  };
}

/**
 * The display label of one entry: the GM's literal override when set, else the
 * canonical `labelKey`. The caller localizes the key (pass `localize` to have it
 * done here — kept optional so the module stays pure/testable).
 * @param {{label: string|null, labelKey: string|null}} entry
 * @param {(key: string) => string} [localize]
 * @returns {string}
 */
export function entryLabel(entry, localize = null) {
  if (entry?.label) return entry.label;
  const key = entry?.labelKey ?? "";
  return localize ? localize(key) : key;
}

/** Coerce one raw entry into the `{labelKey, label, target}` shape. */
function sanitizeEntry(entry) {
  return {
    labelKey: entry?.labelKey ?? null,
    label: entry?.label ?? null,
    target: Number(entry?.target) || 0,
  };
}

/**
 * Sanitize + clamp a raw difficulty-table object: coerce targets to ints, fall
 * back to the canonical set when `entries` is missing/empty, and clamp
 * `defaultIndex` to `-1 ≤ i < entries.length` (out of range → -1). Pure.
 * @param {{entries?: Array, defaultIndex?: number}} raw
 * @returns {{entries: Array, defaultIndex: number}}
 */
function sanitizeDifficultyTable(raw) {
  // A corrupt/empty `entries` triggers a WHOLESALE canonical reset (entries AND
  // default): trusting a broken table's defaultIndex would be arbitrary.
  const hasEntries = Array.isArray(raw?.entries) && raw.entries.length > 0;
  const entries = (hasEntries ? raw.entries : CANONICAL_DIFFICULTIES).map(
    sanitizeEntry
  );
  let defaultIndex = hasEntries ? Number(raw?.defaultIndex) : -1;
  if (
    !Number.isInteger(defaultIndex) ||
    defaultIndex < -1 ||
    defaultIndex >= entries.length
  ) {
    defaultIndex = -1;
  }
  return { entries, defaultIndex };
}

/**
 * Read the difficulty table from world settings, sanitized/clamped. Pass an
 * explicit `raw` to sanitize any table without touching `game.settings` (the
 * pure path the tests use).
 * @param {{entries?: Array, defaultIndex?: number}} [raw]
 * @returns {{entries: Array, defaultIndex: number}}
 */
export function readDifficultyTable(raw) {
  const table =
    raw ??
    game.settings.get(
      CSConstants.Settings.SYSTEM_NAME,
      CSConstants.Settings.DIFFICULTY_TABLE
    );
  return sanitizeDifficultyTable(table);
}

/** A fresh, mutable deep copy of the factory setting (for the Restore action). */
export function cloneCanonicalSetting() {
  return {
    entries: CANONICAL_DIFFICULTIES.map((e) => ({ ...e })),
    defaultIndex: -1,
  };
}
