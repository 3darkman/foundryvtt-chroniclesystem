import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CSActor } from "../module/actors/csActor.js";

// spec 025 (T033) — contracts/house-power-allocation.md C1/C4. The reverse scan
// lives in the domain; the sheet only subtracts. Over-allocation is a SIGNAL,
// never a block (SC-006).

const proto = CSActor.prototype;
const HOUSE_UUID = "Actor.house";

const makeUnit = (id, powerCost, houseUuid = HOUSE_UUID) => ({
  id,
  name: `Unit ${id}`,
  type: "unit",
  system: { houseUuid, powerCost: { total: powerCost } },
});

const makeHouse = () => ({
  type: "house",
  uuid: HOUSE_UUID,
  getUnitsPowerAllocated: proto.getUnitsPowerAllocated,
});

let originalActors;
beforeEach(() => {
  originalActors = globalThis.game.actors;
});
afterEach(() => {
  globalThis.game.actors = originalActors;
});

const withActors = (actors) => {
  globalThis.game.actors = actors;
};

describe("house power allocation — the sum (C1, FR-016)", () => {
  it("sums the Power Cost of every Unit linked to this House", () => {
    withActors([makeUnit("a", 7), makeUnit("b", 3)]);
    const house = makeHouse();
    const { allocated, units } = house.getUnitsPowerAllocated();
    expect(allocated).toBe(10);
    expect(units.map((unit) => unit.id)).toEqual(["a", "b"]);
  });

  it("excludes an unaffiliated Unit (FR-015, Acceptance 4)", () => {
    withActors([makeUnit("a", 7), makeUnit("b", 5, "")]);
    expect(makeHouse().getUnitsPowerAllocated().allocated).toBe(7);
  });

  it("excludes a Unit linked to a DIFFERENT House", () => {
    withActors([makeUnit("a", 7), makeUnit("b", 5, "Actor.otherHouse")]);
    expect(makeHouse().getUnitsPowerAllocated().allocated).toBe(7);
  });

  it("ignores non-unit actors entirely", () => {
    withActors([
      { id: "c", name: "Ned", type: "character", system: {} },
      makeUnit("a", 4),
    ]);
    expect(makeHouse().getUnitsPowerAllocated().allocated).toBe(4);
  });

  it("returns 0 AND an empty units[] for a House with no linked Unit", () => {
    withActors([makeUnit("a", 4, "Actor.otherHouse")]);
    const { allocated, units } = makeHouse().getUnitsPowerAllocated();
    expect(allocated).toBe(0);
    expect(units).toEqual([]);
  });

  it("treats a not-yet-derived Power Cost as 0 rather than NaN", () => {
    withActors([makeUnit("a", undefined), makeUnit("b", 3)]);
    expect(makeHouse().getUnitsPowerAllocated().allocated).toBe(3);
  });
});

describe("house power allocation — the render context (C2/C4, FR-017/FR-018)", () => {
  // The three lines CSHouseActorSheet._prepareContext writes, kept together so
  // the arithmetic they encode is pinned without instantiating a sheet.
  const contextFor = (powerTotal) => {
    const { allocated, units } = makeHouse().getUnitsPowerAllocated();
    return {
      allocated,
      remaining: powerTotal - allocated,
      overAllocated: allocated > powerTotal,
      hasUnits: units.length > 0,
    };
  };

  it("reports the remaining balance and no over-allocation within budget", () => {
    withActors([makeUnit("a", 7), makeUnit("b", 3)]);
    expect(contextFor(20)).toEqual({
      allocated: 10,
      remaining: 10,
      overAllocated: false,
      hasUnits: true,
    });
  });

  it("flags over-allocation without blocking anything (SC-006)", () => {
    withActors([makeUnit("a", 7), makeUnit("b", 8)]);
    const context = contextFor(10);
    expect(context.overAllocated).toBe(true);
    expect(context.remaining).toBe(-5);
    // Linking a further Unit still succeeds — nothing consults `overAllocated`.
    withActors([makeUnit("a", 7), makeUnit("b", 8), makeUnit("c", 5)]);
    expect(contextFor(10).allocated).toBe(20);
  });

  it("suppresses the allocation line only when NO Unit is linked", () => {
    withActors([]);
    expect(contextFor(20).hasUnits).toBe(false);
    // A House whose Units total 0 Power still shows the line (0 is not "none").
    withActors([makeUnit("a", 0)]);
    const context = contextFor(20);
    expect(context.hasUnits).toBe(true);
    expect(context.allocated).toBe(0);
  });
});
