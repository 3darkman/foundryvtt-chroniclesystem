// Active Effects v13↔v14 compatibility layer (spec 007, research §D5).
//
// v14 rewrote four structural points of Active Effects:
//   - changes live under `effect.system.changes` (v13: root `effect.changes`)
//   - change mode is a STRING `change.type` (v13: numeric `change.mode`)
//   - `applyActiveEffects(phase)` runs in "initial"/"final" (v13: no argument)
//   - `ActiveEffect.applyChange(target, change)` is static (v13: instance #apply)
//
// This module isolates every difference behind our own helpers so the rest of
// the system never branches on the version inline, and so the maintenance is in
// ONE place when v16 removes the core shims. FR-013 (v13↔v14 parity) makes this
// mandatory, not optional.

/** Canonical numeric modes — mirror `CONST.ACTIVE_EFFECT_MODES`. */
export const ACTIVE_EFFECT_MODES = {
  CUSTOM: 0,
  MULTIPLY: 1,
  ADD: 2,
  DOWNGRADE: 3,
  UPGRADE: 4,
  OVERRIDE: 5,
};

/** Application phases of `applyActiveEffects` (v14). v13 has a single pass. */
export const EFFECT_PHASES = {
  INITIAL: "initial",
  FINAL: "final",
};

const MODE_NUM_TO_STRING = {
  [ACTIVE_EFFECT_MODES.CUSTOM]: "custom",
  [ACTIVE_EFFECT_MODES.MULTIPLY]: "multiply",
  [ACTIVE_EFFECT_MODES.ADD]: "add",
  [ACTIVE_EFFECT_MODES.DOWNGRADE]: "downgrade",
  [ACTIVE_EFFECT_MODES.UPGRADE]: "upgrade",
  [ACTIVE_EFFECT_MODES.OVERRIDE]: "override",
};

const MODE_STRING_TO_NUM = {
  custom: ACTIVE_EFFECT_MODES.CUSTOM,
  multiply: ACTIVE_EFFECT_MODES.MULTIPLY,
  add: ACTIVE_EFFECT_MODES.ADD,
  subtract: ACTIVE_EFFECT_MODES.ADD, // defensive: treat as additive (negative value)
  downgrade: ACTIVE_EFFECT_MODES.DOWNGRADE,
  upgrade: ACTIVE_EFFECT_MODES.UPGRADE,
  override: ACTIVE_EFFECT_MODES.OVERRIDE,
};

/**
 * The running Foundry major generation. Lazy (reads globals at call time, not
 * import time) and defensive so pure-logic tests without a `game` stub default
 * to the modern path.
 * @returns {number}
 */
export function foundryGeneration() {
  const g = typeof game !== "undefined" ? game : undefined;
  const gen = g?.release?.generation;
  if (Number.isFinite(gen)) return gen;
  const parsed = parseInt(g?.version ?? g?.data?.version ?? "", 10);
  return Number.isFinite(parsed) ? parsed : 14;
}

/** @returns {boolean} true on Foundry v14+. */
export function isV14Plus() {
  return foundryGeneration() >= 14;
}

/**
 * Normalise a change mode to the canonical numeric form, accepting either a
 * v13 number or a v14 string. Unknown → ADD.
 * @param {number|string} mode
 * @returns {number}
 */
export function normalizeMode(mode) {
  if (typeof mode === "number") return mode;
  if (typeof mode === "string") {
    return MODE_STRING_TO_NUM[mode.toLowerCase()] ?? ACTIVE_EFFECT_MODES.ADD;
  }
  return ACTIVE_EFFECT_MODES.ADD;
}

/**
 * Read the changes array of an effect regardless of version. The v14 core ships
 * a root-access shim, but reading defensively from both shapes keeps us correct
 * once that shim is removed (v16).
 * @param {object} effect
 * @returns {Array<object>}
 */
export function readChanges(effect) {
  if (!effect) return [];
  // v14: read `system.changes` directly — `effect.changes` is a deprecated shim
  // (getter → system.changes) that logs a compatibility warning when touched.
  if (Array.isArray(effect.system?.changes)) return effect.system.changes;
  // v13: changes live at the root.
  if (Array.isArray(effect.changes)) return effect.changes;
  return [];
}

/**
 * Build one `change` entry in the shape the running version persists:
 * `{key, value, type}` on v14, `{key, value, mode}` on v13. `value` is coerced
 * to string (Foundry stores change values as strings). An explicit `phase` is
 * emitted only on v14 (the field is ignored on v13).
 * @param {{key: string, value: *, mode?: number|string, phase?: string}} spec
 * @returns {object}
 */
export function buildChangeData({
  key,
  value,
  mode = ACTIVE_EFFECT_MODES.ADD,
  phase,
} = {}) {
  const numMode = normalizeMode(mode);
  const stringValue =
    value === undefined || value === null ? "" : String(value);
  if (isV14Plus()) {
    const change = {
      key,
      value: stringValue,
      type: MODE_NUM_TO_STRING[numMode] ?? "add",
    };
    if (phase) change.phase = phase;
    return change;
  }
  return { key, value: stringValue, mode: numMode };
}

/**
 * Read a change's mode as a canonical number regardless of which field
 * (`change.type` string on v14, `change.mode` number on v13) carries it.
 * @param {object} change
 * @returns {number}
 */
export function readChangeMode(change) {
  if (!change) return ACTIVE_EFFECT_MODES.ADD;
  if (change.type !== undefined && change.type !== null)
    return normalizeMode(change.type);
  return normalizeMode(change.mode);
}
