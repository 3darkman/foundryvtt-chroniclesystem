import { describe, it, expect } from "vitest";
import { DiceRollFormula } from "../module/diceRollFormula.js";

// Group 1 — US5 / Contract 1.1-1.10. The dice engine's PURE surface:
// serialization round-trip, malformed reconstruction → defaults, readable
// formatting with pool clamp and modifier sign. No real roll (FR-011).

describe("DiceRollFormula — serialization", () => {
  it("1.1 toStr() emits pool|bonusDice|modifier|dicePenalty|reRoll", () => {
    const f = new DiceRollFormula();
    f.pool = 5;
    f.bonusDice = 2;
    f.modifier = 1;
    f.dicePenalty = 0;
    f.reRoll = 1;
    expect(f.toStr()).toBe("5|2|1|0|1");
  });

  it("1.2 round-trips a 5-component string", () => {
    const round = DiceRollFormula.fromStr("5|2|1|0|1");
    expect(round.toStr()).toBe("5|2|1|0|1");
  });

  it("1.3 fromStr() with 3 components → defaults (reRoll stays undefined)", () => {
    // ⚠️ Characterized, not corrected: the constructor's `this.reroll = 0`
    // (lowercase typo, diceRollFormula.js:16) never hits the reRoll setter,
    // so the private #reRoll is undefined on a default formula. FR-014 forbids
    // touching module/**, so we assert the REAL behavior.
    const f = DiceRollFormula.fromStr("5|2|1");
    expect(f.pool).toBe(2);
    expect(f.bonusDice).toBe(0);
    expect(f.modifier).toBe(0);
    expect(f.dicePenalty).toBe(0);
    expect(f.reRoll).toBeUndefined();
  });

  it("1.4 fromStr() with length !== 5 → default pool 2", () => {
    expect(DiceRollFormula.fromStr("").pool).toBe(2);
    expect(DiceRollFormula.fromStr("a|b|c|d|e|f").pool).toBe(2);
  });

  it("1.10 setter coerces a string to int (parseInt)", () => {
    const f = new DiceRollFormula();
    f.pool = "7";
    expect(f.pool).toBe(7);
  });
});

describe("DiceRollFormula — ToFormattedStr", () => {
  it("1.5 clamps displayed pool to a minimum of 1d6", () => {
    const f = new DiceRollFormula();
    f.pool = 3;
    f.dicePenalty = 5;
    expect(f.ToFormattedStr().startsWith("1d6")).toBe(true);
  });

  it('1.6 appends " + {n}B" when bonusDice > 0', () => {
    const f = new DiceRollFormula();
    f.pool = 4;
    f.bonusDice = 2;
    expect(f.ToFormattedStr()).toContain(" + 2B");
  });

  it('1.7 shows a positive modifier as " + 3"', () => {
    const f = new DiceRollFormula();
    f.modifier = 3;
    expect(f.ToFormattedStr()).toContain(" + 3");
  });

  it('1.8 shows a negative modifier as " - 3"', () => {
    const f = new DiceRollFormula();
    f.modifier = -3;
    expect(f.ToFormattedStr()).toContain(" - 3");
  });

  it("1.9 hides a zero modifier", () => {
    const f = new DiceRollFormula();
    f.modifier = 0;
    const out = f.ToFormattedStr();
    expect(out).not.toContain(" + 0");
    expect(out).not.toContain(" - 0");
  });
});
