import { describe, it, expect } from "vitest";
import {
  TRAINING_LEVELS,
  TRAINING_POWER_COST,
  DISCIPLINE_BY_TRAINING,
  TRAINING_XP_TOTAL,
  XP_PER_RANK_STEP,
  ABILITY_BASE_RANK,
  UNIT_CATEGORIES,
  UNIT_BASE_MOVEMENT,
  MOVEMENT_BY_CATEGORY_SIFRP,
  BULK_YARDS_PER_POINT,
  LEADER_ROLES,
  powerCostFor,
  disciplineFor,
  computeXp,
  pickEffectivePrimaryType,
  movementProfileFor,
} from "../module/vocabulary/cs-warfare.js";

// spec 025 (T003) — the four rulebook ladders and every pure helper of
// cs-warfare.js. Foundry-free by construction: the module imports nothing.

describe("warfare rulebook constants", () => {
  it("orders the four training levels as the rulebook ladder", () => {
    expect(TRAINING_LEVELS).toEqual(["green", "trained", "veteran", "elite"]);
  });

  it("keeps the Power Cost ladder at 1/3/5/7", () => {
    expect(TRAINING_POWER_COST).toEqual({
      green: 1,
      trained: 3,
      veteran: 5,
      elite: 7,
    });
  });

  it("keeps the Discipline ladder at 9/6/3/0", () => {
    expect(DISCIPLINE_BY_TRAINING).toEqual({
      green: 9,
      trained: 6,
      veteran: 3,
      elite: 0,
    });
  });

  it("keeps the XP ladder at 20/60/100/140 with 20 per rank step", () => {
    expect(TRAINING_XP_TOTAL).toEqual({
      green: 20,
      trained: 60,
      veteran: 100,
      elite: 140,
    });
    expect(XP_PER_RANK_STEP).toBe(20);
    expect(ABILITY_BASE_RANK).toBe(2);
  });

  it("exposes the movement and leader vocabulary", () => {
    expect(UNIT_CATEGORIES).toEqual(["infantry", "cavalry", "naval"]);
    expect(UNIT_BASE_MOVEMENT).toBe(40);
    expect(MOVEMENT_BY_CATEGORY_SIFRP).toEqual({
      infantry: 40,
      cavalry: 80,
      naval: 60,
    });
    expect(BULK_YARDS_PER_POINT).toBe(10);
    expect(LEADER_ROLES).toEqual(["commander", "subcommander"]);
  });
});

describe("powerCostFor", () => {
  it("is the training base alone when no type is assigned", () => {
    expect(powerCostFor("green")).toBe(1);
    expect(powerCostFor("elite", [])).toBe(7);
  });

  it("sums EVERY assigned type's power cost onto the base", () => {
    expect(powerCostFor("trained", [4, 3])).toBe(10);
  });

  it("floors an unknown training level to green and ignores garbage costs", () => {
    expect(powerCostFor("legendary", [2])).toBe(3);
    expect(powerCostFor("green", [null, "x", undefined, 2])).toBe(3);
  });
});

describe("disciplineFor", () => {
  it("is the training base alone when no type is assigned", () => {
    expect(disciplineFor("green")).toBe(9);
    expect(disciplineFor("elite")).toBe(0);
  });

  it("sums every assigned type's modifier", () => {
    expect(disciplineFor("trained", [0, 3])).toBe(9);
    expect(disciplineFor("veteran", [0, 3])).toBe(6);
  });

  it("floors the result at 0 (Automatic), never negative", () => {
    expect(disciplineFor("veteran", [-3, -3])).toBe(0);
    expect(disciplineFor("elite", [-5])).toBe(0);
  });
});

describe("computeXp", () => {
  it("spends nothing while every ability sits at the base rank", () => {
    expect(computeXp("green", [2, 2, 2])).toEqual({
      total: 20,
      spent: 0,
      free: 20,
    });
  });

  it("charges 20 per rank step above 2", () => {
    expect(computeXp("veteran", [4, 3])).toEqual({
      total: 100,
      spent: 60,
      free: 40,
    });
  });

  it("never credits XP for a rank below the base", () => {
    expect(computeXp("green", [0, 1, 2])).toEqual({
      total: 20,
      spent: 0,
      free: 20,
    });
  });

  it("lets `free` go negative when the training level is lowered", () => {
    expect(computeXp("green", [4])).toEqual({
      total: 20,
      spent: 40,
      free: -20,
    });
  });
});

describe("pickEffectivePrimaryType", () => {
  const infantry = { slug: "infantry", createdTime: 100 };
  const archers = { slug: "archers", createdTime: 200 };
  const cavalry = { slug: "cavalry", createdTime: 300 };

  it("returns undefined when the unit has no types", () => {
    expect(pickEffectivePrimaryType([], "infantry")).toBeUndefined();
  });

  it("honours the stored pointer when it still matches", () => {
    expect(pickEffectivePrimaryType([infantry, archers], "infantry")).toBe(
      infantry
    );
    expect(pickEffectivePrimaryType([infantry, archers], "archers")).toBe(
      archers
    );
  });

  it("falls back to the oldest type when the pointer is blank", () => {
    expect(pickEffectivePrimaryType([archers, infantry], "")).toBe(infantry);
  });

  it("promotes the oldest survivor when the designated primary is gone", () => {
    expect(pickEffectivePrimaryType([cavalry, archers], "infantry")).toBe(
      archers
    );
  });

  it("keeps input order when createdTime is missing (stable minimum)", () => {
    const first = { slug: "first" };
    const second = { slug: "second" };
    expect(pickEffectivePrimaryType([first, second], "")).toBe(first);
  });

  it("keeps input order on a createdTime tie", () => {
    const a = { slug: "a", createdTime: 500 };
    const b = { slug: "b", createdTime: 500 };
    expect(pickEffectivePrimaryType([a, b], "")).toBe(a);
  });
});

describe("movementProfileFor", () => {
  it("uses the flat 40 base for every category in the Chronicle edition", () => {
    expect(movementProfileFor("infantry", 0, false)).toEqual({
      base: 40,
      runBonus: 0,
      bulkPenalty: 0,
    });
    expect(movementProfileFor("cavalry", 0, false).base).toBe(40);
    expect(movementProfileFor("naval", 0, false).base).toBe(40);
  });

  it("uses the per-category base in the SIFRP edition", () => {
    expect(movementProfileFor("infantry", 0, true).base).toBe(40);
    expect(movementProfileFor("cavalry", 0, true).base).toBe(80);
    expect(movementProfileFor("naval", 0, true).base).toBe(60);
  });

  it("charges 10 yards per Bulk point in both editions", () => {
    expect(movementProfileFor("cavalry", 2, false).bulkPenalty).toBe(20);
    expect(movementProfileFor("cavalry", 2, true).bulkPenalty).toBe(20);
  });

  it("floors an unknown category to infantry and a garbage bulk to zero", () => {
    expect(movementProfileFor("siege", 0, true).base).toBe(40);
    expect(movementProfileFor("naval", "x", true).bulkPenalty).toBe(0);
  });
});
