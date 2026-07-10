/**
 * Pure builder for the Foundry roll-formula string. Kept in its own module (no
 * imports) so it is unit-testable without the Foundry runtime — the same reason
 * cs-conflict.js / cs-slugify.js are standalone.
 *
 * Re-roll uses `rN=1` — re-roll up to N dice showing 1 (SIFRP's "re-roll N
 * ones"): in Foundry's reroll modifier the number BEFORE the operator is the
 * re-roll LIMIT and the number after is the TARGET value (core docstring:
 * `20d20r1=1` → "reroll a single 1"). `r=N` would instead put the count where
 * the target goes, re-rolling every die equal to N — the bug the value-2 case
 * exposed. Re-roll is placed BEFORE `kh` so the kept-highest set is chosen after
 * the re-rolls resolve (v13: all terms must evaluate together).
 * @param {{pool:number, bonusDice:number, dicePenalty:number, reRoll:number,
 *   modifier:number}} formula
 * @returns {string}
 */
export function buildDieFormula(formula) {
  const pool = Math.max(formula.pool, 1);
  const dices = pool + formula.bonusDice;
  const keep = Math.max(formula.pool - formula.dicePenalty, 0);
  let dieFormula = `${dices}d6`;
  if (formula.reRoll > 0) {
    dieFormula += `r${formula.reRoll}=1`;
  }
  dieFormula += `kh${keep}`;
  dieFormula += ` + ${formula.modifier}`;
  return dieFormula;
}
