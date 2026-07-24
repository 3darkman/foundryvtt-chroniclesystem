import { describe, it, expect, afterEach } from "vitest";
import { CSActor } from "../module/actors/csActor.js";
import { damageTotalFromFormula } from "../module/items/csItem.js";
import { collectEffectModifiers } from "../module/effects/cs-effect-modifiers.js";
import { CSConstants } from "../module/system/csConstants.js";
import {
  makeAbilityItem,
  makeFakeUnitActor,
  makeUnitTypeItem,
} from "./helpers/doubles.js";

// spec 025 (T009) — contracts/unit-derivation.md C1-C5, C8, C9. Production
// methods are exercised in place via prototype `.call`, the derived-stats.test.js
// idiom, so the tests pin production logic and not a reimplementation.

const proto = CSActor.prototype;

const settingsOn = (...keys) => {
  const original = globalThis.game.settings;
  globalThis.game.settings = { get: (scope, key) => keys.includes(key) };
  return () => {
    globalThis.game.settings = original;
  };
};

let restoreSettings = null;
afterEach(() => {
  restoreSettings?.();
  restoreSettings = null;
});

const deriveAll = (actor) => {
  proto.calculateDerivedValues.call(actor);
  proto.calculateUnitDerivedValues.call(actor);
  proto.calculateMovementData.call(actor);
  return actor.getCSData();
};

describe("unit derivation — a bare Unit (Acceptance 1, C1/C4/C4b/C8)", () => {
  it("computes Health 6, Defence 6, Power Cost 1, Discipline 9 and XP 20 with nothing assigned", () => {
    const actor = makeFakeUnitActor();
    const data = deriveAll(actor);

    expect(data.health.max).toBe(6);
    expect(data.derivedStats.combatDefense.value).toBe(6);
    expect(data.derivedStats.combatDefense.total).toBe(6);
    expect(data.powerCost.total).toBe(1);
    expect(data.discipline.total).toBe(9);
    expect(data.xp).toEqual({ total: 20, spent: 0, free: 20 });
  });

  it("still moves 40 with no Unit Type assigned — movement is fixed", () => {
    const actor = makeFakeUnitActor();
    expect(deriveAll(actor).movement.total).toBe(40);
  });

  it("reads Health from Endurance, not from the Training Level (C1)", () => {
    const actor = makeFakeUnitActor({
      abilities: [makeAbilityItem("Endurance", 4)],
      data: { trainingLevel: "elite" },
    });
    expect(deriveAll(actor).health.max).toBe(12);
  });
});

describe("unit derivation — training level and types recompute (Acceptance 2, C4/C4b/C8)", () => {
  const twoTypes = () => [
    makeUnitTypeItem({
      id: "infantry",
      name: "Infantry",
      slug: "infantry",
      powerCost: 4,
      disciplineModifier: 0,
      createdTime: 100,
    }),
    makeUnitTypeItem({
      id: "archers",
      name: "Archers",
      slug: "archers",
      powerCost: 3,
      disciplineModifier: 3,
      createdTime: 200,
    }),
  ];

  it("sums EVERY assigned type into Power Cost and Discipline", () => {
    const actor = makeFakeUnitActor({
      types: twoTypes(),
      data: { trainingLevel: "trained", primaryTypeSlug: "infantry" },
    });
    const data = deriveAll(actor);
    expect(data.powerCost.total).toBe(10);
    expect(data.discipline.total).toBe(9);
  });

  it("recomputes on the next derivation when the training level changes", () => {
    const actor = makeFakeUnitActor({
      types: twoTypes(),
      data: { trainingLevel: "trained", primaryTypeSlug: "infantry" },
    });
    deriveAll(actor);
    actor.getCSData().trainingLevel = "veteran";
    const data = deriveAll(actor);
    expect(data.powerCost.total).toBe(12);
    expect(data.discipline.total).toBe(6);
    expect(data.xp.total).toBe(100);
  });
});

describe("unit derivation — armour penalty and asoiafDefenseStyle (Acceptance 4, C2/C3)", () => {
  const infantry = makeUnitTypeItem({
    id: "infantry",
    name: "Infantry",
    slug: "infantry",
    startingEquipment: { armor: { rating: 3, penalty: -2, bulk: 0 } },
  });

  it("ignores the armour penalty in the Chronicle default", () => {
    const actor = makeFakeUnitActor({ types: [infantry] });
    expect(deriveAll(actor).derivedStats.combatDefense.total).toBe(6);
  });

  it("subtracts the primary type's armour penalty when the setting is on", () => {
    restoreSettings = settingsOn(CSConstants.Settings.ASOIAF_DEFENSE_STYLE);
    const actor = makeFakeUnitActor({
      types: [infantry],
      modifiers: { combat_defense: -2 },
    });
    expect(deriveAll(actor).derivedStats.combatDefense.total).toBe(4);
  });

  it("pushes the primary type's penalty and bulk through the collector (C3)", () => {
    const cavalry = makeUnitTypeItem({
      id: "cavalry",
      name: "Cavalry",
      slug: "cavalry",
      startingEquipment: { armor: { rating: 5, penalty: -3, bulk: 2 } },
    });
    const actor = makeFakeUnitActor({ types: [cavalry] });
    actor.appliedEffects = [];

    const { modifiers } = collectEffectModifiers(actor);
    expect(modifiers.combat_defense[0].mod).toBe(-3);
    expect(modifiers.combat_defense[0].isDocument).toBe(true);
    expect(modifiers.bulk[0].mod).toBe(2);
    // A unit's equipment never touches Agility — no warfare rule says it does.
    expect(modifiers.agility).toBeUndefined();
  });

  it("contributes nothing when the unit has no assigned type", () => {
    const actor = makeFakeUnitActor();
    actor.appliedEffects = [];
    const { modifiers } = collectEffectModifiers(actor);
    expect(modifiers.combat_defense).toBeUndefined();
    expect(modifiers.bulk).toBeUndefined();
  });
});

describe("unit derivation — movement and the edition toggle (Acceptance 5, C5)", () => {
  const cavalry = (bulk = 0) =>
    makeUnitTypeItem({
      id: "cavalry",
      name: "Cavalry",
      slug: "cavalry",
      startingEquipment: { armor: { rating: 0, penalty: 0, bulk } },
    });

  it("moves a flat 40 — there is no movement category", () => {
    const actor = makeFakeUnitActor({ types: [cavalry()] });
    const data = deriveAll(actor);
    expect(data.movement.base).toBe(40);
    expect(data.movement.total).toBe(40);
  });

  it("charges 10 yards per Bulk point", () => {
    const actor = makeFakeUnitActor({
      types: [cavalry(2)],
      modifiers: { bulk: 2 },
    });
    const data = deriveAll(actor);
    expect(data.movement.bulk).toBe(20);
    expect(data.movement.total).toBe(20);
  });

  it("never writes a sprint total for a unit (Sprint is out of Phase 1)", () => {
    const actor = makeFakeUnitActor({ types: [cavalry()] });
    expect(deriveAll(actor).movement.sprintTotal).toBeUndefined();
  });

  it("clamps the total to a minimum of 1", () => {
    const actor = makeFakeUnitActor({
      types: [cavalry()],
      data: { movement: { modifier: -100 } },
    });
    expect(deriveAll(actor).movement.total).toBe(1);
  });
});

describe("unit derivation — XP economy (Acceptance 7, C8)", () => {
  it("charges 20 per rank step above the base rank 2", () => {
    const actor = makeFakeUnitActor({
      abilities: [makeAbilityItem("Fighting", 4), makeAbilityItem("Athletics", 2)],
      data: { trainingLevel: "veteran" },
    });
    expect(deriveAll(actor).xp).toEqual({ total: 100, spent: 40, free: 60 });
  });

  it("lets `free` go negative when the Training Level is lowered (never blocked)", () => {
    const actor = makeFakeUnitActor({
      abilities: [makeAbilityItem("Fighting", 4)],
      data: { trainingLevel: "green" },
    });
    expect(deriveAll(actor).xp.free).toBe(-20);
  });
});

describe("damageTotalFromFormula — the one @Ability parser (C9)", () => {
  const unit = makeFakeUnitActor({
    abilities: [makeAbilityItem("Athletics", 3)],
  });

  it("resolves the @Ability token against a Unit-shaped actor", () => {
    expect(damageTotalFromFormula(unit, "@Athletics+1")).toBe(4);
    expect(damageTotalFromFormula(unit, "@Athletics")).toBe(3);
    expect(damageTotalFromFormula(unit, "@Athletics*2")).toBe(6);
  });

  it("defaults an ability the unit does not own to the untrained rank 2", () => {
    expect(damageTotalFromFormula(unit, "@Fighting+1")).toBe(3);
  });

  it("returns null (never throws) for a string with no @Ability token", () => {
    expect(damageTotalFromFormula(unit, "no token here")).toBeNull();
    expect(damageTotalFromFormula(unit, "")).toBeNull();
    expect(damageTotalFromFormula(unit, undefined)).toBeNull();
  });
});
