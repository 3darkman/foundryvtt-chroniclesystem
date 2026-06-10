import { describe, it, expect } from "vitest";
import { CSWeaponItem } from "../module/items/csWeaponItem.js";
import { ChronicleSystem } from "../module/system/ChronicleSystem.js";
import { registerCustomHelpers } from "../module/system/handlebarsHelpers.js";
import { DiceRollFormula } from "../module/diceRollFormula.js";
import { makeFakeWeapon, makeFakeActor } from "./helpers/doubles.js";

// Group 4 — US4 / Contract 4.1-4.11. Characterizes the CURRENT damage parsing
// (@Ability(±*/)number, incl. eval and the adaptable quality) and specialty
// split (Ability:Specialty) as a safety net for the Step-4 redesign. We pin
// existing behavior — including eval — without changing module/** (FR-014).

const updateDamage = CSWeaponItem.prototype.updateDamageValue;
const ability4 = { getAbilityValue: () => 4 };

describe("weapon damage — updateDamageValue (eval-based, characterized)", () => {
  it("4.1 @Ability+1 → value + 1", () => {
    const weapon = makeFakeWeapon({ damage: "@Fighting+1" });
    updateDamage.call(weapon, ability4);
    expect(weapon.damageValue).toBe(5);
  });

  it("4.2 @Ability-1 → value − 1", () => {
    const weapon = makeFakeWeapon({ damage: "@Fighting-1" });
    updateDamage.call(weapon, ability4);
    expect(weapon.damageValue).toBe(3);
  });

  it("4.3 @Ability*2 → value × 2", () => {
    const weapon = makeFakeWeapon({ damage: "@Fighting*2" });
    updateDamage.call(weapon, ability4);
    expect(weapon.damageValue).toBe(8);
  });

  it("4.4 @Ability/2 → value ÷ 2", () => {
    const weapon = makeFakeWeapon({ damage: "@Fighting/2" });
    updateDamage.call(weapon, ability4);
    expect(weapon.damageValue).toBe(2);
  });

  it("4.5 @Ability with no number → the bare ability value (eval of '4')", () => {
    const weapon = makeFakeWeapon({ damage: "@Fighting" });
    updateDamage.call(weapon, ability4);
    expect(weapon.damageValue).toBe(4);
  });

  it("4.6 a string with no @ leaves damageValue unchanged (no throw)", () => {
    const weapon = makeFakeWeapon({ damage: "texto sem arroba" });
    weapon.damageValue = 99; // sentinel proves it is left untouched
    updateDamage.call(weapon, ability4);
    expect(weapon.damageValue).toBe(99);
  });

  it("4.7 adaptable + BOTH_HANDS adds +1", () => {
    const weapon = makeFakeWeapon({
      damage: "@Fighting+1",
      qualities: [{ name: "adaptable" }],
      equipped: ChronicleSystem.equippedConstants.BOTH_HANDS,
    });
    updateDamage.call(weapon, ability4);
    expect(weapon.damageValue).toBe(6);
  });

  it("4.8 adaptable + MAIN_HAND gets no bonus", () => {
    const weapon = makeFakeWeapon({
      damage: "@Fighting+1",
      qualities: [{ name: "adaptable" }],
      equipped: ChronicleSystem.equippedConstants.MAIN_HAND,
    });
    updateDamage.call(weapon, ability4);
    expect(weapon.damageValue).toBe(5);
  });
});

describe("weapon specialty — split via the 'weapon-test' helper", () => {
  // The helper only exists as a registerHelper callback; the harness captures
  // it into Handlebars._helpers when registerCustomHelpers() runs (data-model §D).
  registerCustomHelpers();
  const helper = Handlebars._helpers["weapon-test"];

  it("captures the weapon-test helper from registration", () => {
    expect(helper).toBeTypeOf("function");
  });

  it("4.9 'Fighting:Axes' (length 2) → a DiceRollFormula, not ''", () => {
    const result = helper(
      makeFakeActor({}),
      makeFakeWeapon({ specialty: "Fighting:Axes", training: 0 })
    );
    expect(result).not.toBe("");
    expect(result).toBeInstanceOf(DiceRollFormula);
  });

  it("4.10 'Fighting' (no ':') → '' (no throw)", () => {
    const result = helper(
      makeFakeActor({}),
      makeFakeWeapon({ specialty: "Fighting", training: 0 })
    );
    expect(result).toBe("");
  });

  it("4.11 '' → '' (no throw)", () => {
    const result = helper(
      makeFakeActor({}),
      makeFakeWeapon({ specialty: "", training: 0 })
    );
    expect(result).toBe("");
  });
});
