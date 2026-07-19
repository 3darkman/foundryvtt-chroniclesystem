// Weapon Training rule — the pure formula transform (spec 021, US5, D20/FR-023).
//
// The SIFRP "Training" optional rule: a weapon's Training value converts up to that
// many of the roll's BONUS dice into penalty dice. The DEFECT this fixes: the old
// code shrank the base ability POOL (`formula.pool += shortfall`) on a shortfall —
// FR-023 forbids touching the general dice-pool formula. The correct behaviour:
// shortfall → PENALTY dice (which reduce KEPT dice while the full pool is still
// rolled), leaving `pool` untouched.
//
// PURE module (no Foundry runtime, no settings) → Vitest-importable. The setting
// gate lives in `adjustFormulaByWeapon` (the caller), never here.

/**
 * Fold a weapon's Training into a roll formula (SIFRP Training rule):
 *  - `bonusDice >= training` → spend `training` bonus dice (`bonusDice -= training`).
 *  - `bonusDice <  training` → all bonus dice spent (`bonusDice = 0`) and the
 *    shortfall becomes PENALTY dice (`dicePenalty += shortfall`); `pool` UNTOUCHED.
 * `dicePenalty +=` (never overwrite) — the base test formula may already carry a
 * penalty. Mutates and returns `formula`. Training 0 / falsy → a no-op.
 * @param {{pool: number, bonusDice: number, dicePenalty: number}} formula
 * @param {number} training
 * @returns {object} the same formula
 */
export function applyWeaponTraining(formula, training) {
  if (!training) return formula;
  const remaining = formula.bonusDice - training;
  if (remaining >= 0) {
    formula.bonusDice = remaining;
  } else {
    formula.bonusDice = 0;
    formula.dicePenalty += -remaining;
  }
  return formula;
}
