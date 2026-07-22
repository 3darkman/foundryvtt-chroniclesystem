import { describe, it, expect } from "vitest";
import {
  PASSIVE_PER_DIE,
  MIN_TEST_DICE,
  passiveFromFormula,
  shouldMaskPassive,
} from "../module/rolls/cs-passive.js";

// Spec 023 / contract passive-derivation.md C1. The pure conversion of an
// EFFECTIVE test formula into a passive value: four levers, re-roll ignored,
// die count floored at 1, result floored at 0, never NaN.

const formula = ({ pool = 0, bonusDice = 0, dicePenalty = 0, modifier = 0 }) => ({
  pool,
  bonusDice,
  dicePenalty,
  modifier,
  reRoll: 3, // always present, must never be read (C1.3)
});

describe("passiveFromFormula — the four levers (C1.1)", () => {
  it("weighs a test die at PASSIVE_PER_DIE", () => {
    expect(PASSIVE_PER_DIE).toBe(4);
  });

  // The 8 reference cases of the contract table.
  const cases = [
    { name: "4 dice, nothing else", f: { pool: 4 }, bonus: 0, expected: 16 },
    {
      name: "4 dice + a specialty rated 3 (bonus dice)",
      f: { pool: 4, bonusDice: 3 },
      bonus: 0,
      expected: 19,
    },
    {
      name: "4 dice − 1 penalty die",
      f: { pool: 4, dicePenalty: 1 },
      bonus: 0,
      expected: 12,
    },
    {
      name: "4 dice + a flat +2 result modifier",
      f: { pool: 4, modifier: 2 },
      bonus: 0,
      expected: 18,
    },
    {
      name: "4 dice + 3 bonus dice − a −2 passive channel",
      f: { pool: 4, bonusDice: 3 },
      bonus: -2,
      expected: 17,
    },
    {
      name: "an empty formula (still the one die every test rolls)",
      f: {},
      bonus: 0,
      expected: 4,
    },
    {
      name: "1 die − 3 penalty dice (floored at 1 die, not −8)",
      f: { pool: 1, dicePenalty: 3 },
      bonus: 0,
      expected: 4,
    },
    {
      name: "2 dice with a −99 passive channel (floored)",
      f: { pool: 2 },
      bonus: -99,
      expected: 0,
    },
  ];

  for (const { name, f, bonus, expected } of cases) {
    it(`${name} → ${expected}`, () => {
      expect(passiveFromFormula(formula(f), bonus)).toBe(expected);
    });
  }
});

// C1.1a — the system never rolls an ability with less than one die, so the
// passive never falls below the value of that die either. This is the same floor
// `DiceRollFormula.ToFormattedStr` applies to the chip, which is why the number
// on the sheet and the `1d6` on the chip beside it always agree.
describe("passiveFromFormula — the one-die floor (C1.1a)", () => {
  it("weighs at least MIN_TEST_DICE die", () => {
    expect(MIN_TEST_DICE).toBe(1);
  });

  it.each([
    [1, 0, 4],
    [1, 1, 4],
    [1, 5, 4],
    [3, 2, 4],
    [3, 3, 4],
    [3, 99, 4],
  ])(
    "pool %i − %i penalty dice still weighs one die → %i",
    (pool, dicePenalty, expected) => {
      expect(passiveFromFormula(formula({ pool, dicePenalty }))).toBe(expected);
    }
  );

  it("keeps bonus dice and result modifiers on top of the floored die", () => {
    expect(passiveFromFormula(formula({ pool: 2, dicePenalty: 4 }))).toBe(4);
    expect(
      passiveFromFormula(formula({ pool: 2, dicePenalty: 4, bonusDice: 3 }))
    ).toBe(7);
    expect(
      passiveFromFormula(formula({ pool: 2, dicePenalty: 4, modifier: 2 }))
    ).toBe(6);
  });
});

describe("passiveFromFormula — defensive shape (C1.2/C1.3/C1.4)", () => {
  it("never reads reRoll", () => {
    const base = { pool: 3, bonusDice: 0, dicePenalty: 0, modifier: 0 };
    expect(passiveFromFormula({ ...base, reRoll: 0 })).toBe(
      passiveFromFormula({ ...base, reRoll: 5 })
    );
  });

  it("yields 0 (never NaN) for an undefined formula", () => {
    const result = passiveFromFormula(undefined);
    expect(result).toBe(0);
    expect(Number.isNaN(result)).toBe(false);
  });

  it("coerces non-numeric fields instead of producing NaN", () => {
    const result = passiveFromFormula({
      pool: "4",
      bonusDice: null,
      dicePenalty: undefined,
      modifier: "oops",
    });
    expect(result).toBe(16);
  });

  it("defaults passiveBonus to 0", () => {
    expect(passiveFromFormula(formula({ pool: 2 }))).toBe(8);
  });

  it("floors AFTER the passive bonus, so a −N can only reach 0", () => {
    expect(passiveFromFormula(formula({ pool: 5 }), -1000)).toBe(0);
  });
});

// Contract passive-derivation.md C4 — the shared masking predicate. The full
// truth table, so the dialog and the chat hook can never drift.
describe("shouldMaskPassive — the 4-row truth table (C4)", () => {
  const cases = [
    {
      params: { isPassiveDifficulty: true, valuesVisible: false, isGM: false },
      expected: true,
      why: "a player, setting off, target-derived difficulty → mask",
    },
    {
      params: { isPassiveDifficulty: true, valuesVisible: false, isGM: true },
      expected: false,
      why: "the GM always sees the value (FR-025)",
    },
    {
      params: { isPassiveDifficulty: true, valuesVisible: true, isGM: false },
      expected: false,
      why: "the default world shows everything (FR-022)",
    },
    {
      params: { isPassiveDifficulty: false, valuesVisible: false, isGM: false },
      expected: false,
      why: "a difficulty-table level is never masked (FR-028)",
    },
  ];

  for (const { params, expected, why } of cases) {
    it(why, () => {
      expect(shouldMaskPassive(params)).toBe(expected);
    });
  }

  it("never masks when called with nothing (a message carrying no flag)", () => {
    expect(shouldMaskPassive()).toBe(false);
    expect(shouldMaskPassive({ isPassiveDifficulty: undefined })).toBe(false);
  });
});
