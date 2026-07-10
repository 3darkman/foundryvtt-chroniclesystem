import { describe, it, expect } from "vitest";
import {
  RANGE_BANDS,
  DISTANCE_UNIT_TO_YARDS,
  SIZE_DEFENSE_MODIFIER,
  distanceToYards,
  rangeCategoryFromQualities,
  rangePenalty,
  degreesOfSuccess,
  computeDamage,
  computeInfluence,
  combatDefenseSizeModifier,
} from "../module/combat/cs-conflict.js";

// spec 010 / Contract conflict-resolution.md §Testes. The PURE surface of the
// conflict module — no Foundry runtime (numbers/qualities in, numbers out).

describe("constants (SSOT)", () => {
  it("exposes the frozen range bands and unit factors", () => {
    expect(RANGE_BANDS.close).toEqual({ free: 10, inc: 10 });
    expect(RANGE_BANDS.long).toEqual({ free: 100, inc: 100 });
    expect(Object.isFrozen(RANGE_BANDS)).toBe(true);
    expect(DISTANCE_UNIT_TO_YARDS.ft).toBeCloseTo(1 / 3);
    expect(SIZE_DEFENSE_MODIFIER).toEqual({ small: 2, medium: 0, large: -2 });
  });
});

describe("distanceToYards", () => {
  const cases = [
    [30, "ft", 10],
    [10, "m", 10],
    [10, "yd", 10],
    [1, "km", 1000],
    [15, "parsec", 15], // unknown unit → 1:1
    [30, "FT", 10], // case-insensitive
  ];
  for (const [distance, units, yards] of cases) {
    it(`${distance} ${units} → ${yards} yd`, () => {
      expect(distanceToYards(distance, units)).toBeCloseTo(yards);
    });
  }
});

describe("rangeCategoryFromQualities — by stable slug", () => {
  it("resolves long / close / melee (null)", () => {
    expect(rangeCategoryFromQualities([{ name: "Long Range" }])).toBe("long");
    expect(rangeCategoryFromQualities([{ name: "Close Range" }])).toBe("close");
    expect(rangeCategoryFromQualities([{ name: "Piercing" }])).toBe(null);
    expect(rangeCategoryFromQualities([])).toBe(null);
    expect(rangeCategoryFromQualities(undefined)).toBe(null);
  });
  it("long wins when both are present (inconsistent data → wider band)", () => {
    expect(
      rangeCategoryFromQualities([
        { name: "Close Range" },
        { name: "Long Range" },
      ])
    ).toBe("long");
  });
});

describe("rangePenalty — band started rounds up (ceil)", () => {
  const close = [
    [10, 0],
    [11, 1],
    [20, 1],
    [21, 2],
    [30, 2],
  ];
  for (const [yd, pen] of close) {
    it(`Close: ${yd} yd → ${pen}`, () => {
      expect(rangePenalty(yd, "close")).toBe(pen);
    });
  }
  const long = [
    [100, 0],
    [101, 1],
    [200, 1],
    [201, 2],
    [300, 2],
  ];
  for (const [yd, pen] of long) {
    it(`Long: ${yd} yd → ${pen}`, () => {
      expect(rangePenalty(yd, "long")).toBe(pen);
    });
  }
  it("null category (melee) → 0 at any distance", () => {
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
