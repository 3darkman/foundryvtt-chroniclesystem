import { describe, it, expect } from "vitest";
import { buildDieFormula } from "../module/rolls/cs-die-formula.js";
import { DiceRollFormula } from "../module/diceRollFormula.js";

// Spec 010 — the roll-formula string builder. Pure (no Foundry), so the reroll
// semantics the user hit twice are locked here. `rN=1` = reroll up to N ones;
// `r=N` (the old bug) would reroll every die equal to N.

const mk = (over = {}) => {
  const f = new DiceRollFormula();
  f.pool = over.pool ?? 4;
  f.bonusDice = over.bonusDice ?? 0;
  f.dicePenalty = over.dicePenalty ?? 0;
  f.reRoll = over.reRoll ?? 0;
  f.modifier = over.modifier ?? 0;
  return f;
};

describe("buildDieFormula", () => {
  it("no reroll → pool d6 + keep-highest + modifier", () => {
    expect(buildDieFormula(mk({ pool: 4, modifier: 2 }))).toBe("4d6kh4 + 2");
  });

  it("reRoll=1 → r1=1 (reroll up to one die showing 1), placed before kh", () => {
    expect(buildDieFormula(mk({ pool: 5, reRoll: 1, modifier: 1 }))).toBe(
      "5d6r1=1kh5 + 1"
    );
  });

  it("reRoll=2 → r2=1 (reroll up to two 1s), NOT r=2 (which rerolls 2s)", () => {
    const out = buildDieFormula(
      mk({ pool: 4, bonusDice: 2, reRoll: 2, modifier: 2 })
    );
    expect(out).toBe("6d6r2=1kh4 + 2");
    expect(out).not.toContain("r=2");
  });

  it("bonus dice grow the pool; penalty shrinks the kept count", () => {
    expect(buildDieFormula(mk({ pool: 5, bonusDice: 3, dicePenalty: 2 }))).toBe(
      "8d6kh3 + 0"
    );
  });
});
