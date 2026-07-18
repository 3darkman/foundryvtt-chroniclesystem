import { describe, it, expect } from "vitest";
import {
  SIZE_DEFENSE_MODIFIER,
  rangePenalty,
  degreesOfSuccess,
  computeDamage,
  computeInfluence,
  combatDefenseSizeModifier,
} from "../module/combat/cs-conflict.js";

// spec 010 / Contract conflict-resolution.md §Testes. The PURE surface of the
// conflict module — no Foundry runtime (numbers/qualities in, numbers out).

describe("constants (SSOT)", () => {
  it("exposes the frozen size→defense modifier map", () => {
    expect(SIZE_DEFENSE_MODIFIER).toEqual({ small: 2, medium: 0, large: -2 });
    expect(Object.isFrozen(SIZE_DEFENSE_MODIFIER)).toBe(true);
  });
});

describe("rangePenalty — data-driven band, started increment rounds up (ceil)", () => {
  // The band {free, inc} comes from the weapon's range quality (weaponRangeBand),
  // in the scene's units — no yards conversion, so any unit / custom value works.
  const close = { free: 10, inc: 10 }; // Close Range seed
  for (const [dist, pen] of [
    [10, 0],
    [11, 1],
    [20, 1],
    [21, 2],
    [30, 2],
  ]) {
    it(`Close band (10): ${dist} → ${pen}`, () => {
      expect(rangePenalty(dist, close)).toBe(pen);
    });
  }
  const long = { free: 100, inc: 100 }; // Long Range seed
  for (const [dist, pen] of [
    [100, 0],
    [101, 1],
    [200, 1],
    [201, 2],
    [300, 2],
  ]) {
    it(`Long band (100): ${dist} → ${pen}`, () => {
      expect(rangePenalty(dist, long)).toBe(pen);
    });
  }
  it("honours a GM's custom band (e.g. 25 metres)", () => {
    const m25 = { free: 25, inc: 25 };
    expect(rangePenalty(25, m25)).toBe(0);
    expect(rangePenalty(26, m25)).toBe(1);
    expect(rangePenalty(51, m25)).toBe(2);
  });
  it("null band (melee) → 0 at any distance", () => {
    expect(rangePenalty(0, null)).toBe(0);
    expect(rangePenalty(9999, null)).toBe(0);
  });
});

describe("degreesOfSuccess — same bands as resolveVerdict", () => {
  const cases = [
    [0, 1],
    [4, 1],
    [5, 2],
    [9, 2],
    [10, 3],
    [14, 3],
    [15, 4],
    [99, 4],
  ];
  for (const [margin, degrees] of cases) {
    it(`margin ${margin} → ${degrees} degrees`, () => {
      expect(degreesOfSuccess(margin)).toBe(degrees);
    });
  }
});

describe("computeDamage / computeInfluence — floor at 0", () => {
  it("damage = max(0, base×degrees − AR)", () => {
    expect(computeDamage(3, 2, 1)).toBe(5);
    expect(computeDamage(2, 1, 5)).toBe(0); // floor
    expect(computeDamage(4, 3, 2)).toBe(10);
  });
  it("influence = max(0, value×degrees − DR)", () => {
    expect(computeInfluence(3, 2, 4)).toBe(2);
    expect(computeInfluence(1, 1, 5)).toBe(0); // floor
  });
  it("composition — Independent Test US4: margin 7 → 2 degrees", () => {
    const degrees = degreesOfSuccess(7);
    expect(degrees).toBe(2);
    expect(computeDamage(3, degrees, 1)).toBe(5);
  });
});

describe("combatDefenseSizeModifier (FR-014)", () => {
  const cases = [
    ["small", 2],
    ["medium", 0],
    ["large", -2],
    [undefined, 0],
    ["huge", 0],
  ];
  for (const [size, mod] of cases) {
    it(`${size} → ${mod}`, () => {
      expect(combatDefenseSizeModifier(size)).toBe(mod);
    });
  }
});
