import { describe, it, expect } from "vitest";
import { ChronicleSystem } from "../module/system/ChronicleSystem.js";
import { CSActor } from "../module/actors/csActor.js";
import { collectEffectModifiers } from "../module/effects/cs-effect-modifiers.js";

// Spec 008 / US1 — i18n PARITY harness (Quickstart §A). Renaming an ability or
// specialty to ANY language must NOT change the math: armour penalties, dynamic
// conditions and authored effects all route by the STABLE SLUG, so an "Agility"
// sheet and its renamed "Agilidade" twin (same slug `agility`) produce byte-
// identical formulas. These exercise the REAL production methods via the
// prototype (data-model §C) plus the REAL collector.

const proto = CSActor.prototype;

/** Ability item with a persisted slug (rename = same slug, different name). */
function ability(name, slug, rating, { modifier = 0, specialties = {} } = {}) {
  const system = { slug, rating, modifier, specialties };
  return { type: "ability", name, system, getCSData: () => system };
}

/** Equipped armour item (its penalty routes to the `agility` buffer). */
function armor(id, { equipped = 1, penalty = 0, rating = 0, bulk = 0 } = {}) {
  return { type: "armor", _id: id, system: { equipped, penalty, rating, bulk } };
}

/** Authored (permanent) effect with structured cs.* changes. */
function effect(id, changes) {
  return {
    id,
    disabled: false,
    isSuppressed: false,
    system: { changes },
    getFlag: () => undefined, // never optional
  };
}

/** Build an actor double, run the REAL collector, and wire the real read-side. */
function buildActor({ abilities = [], items = [], effects = [], system = {} }) {
  const sys = { derivedStats: {}, ...system };
  const actor = {
    items: [...abilities, ...items],
    appliedEffects: effects,
    system: sys,
    getCSData: () => sys,
    getAbility: proto.getAbility,
    getAbilityBySlug: proto.getAbilityBySlug,
    getAbilityBySpecialty: proto.getAbilityBySpecialty,
    getAbilityBySpecialtySlug: proto.getAbilityBySpecialtySlug,
    getModifier: proto.getModifier,
    getPenalty: proto.getPenalty,
    getTestDice: proto.getTestDice,
    getBonusDice: proto.getBonusDice,
    getReRoll: proto.getReRoll,
    getDerivedStatBonus: proto.getDerivedStatBonus,
    getWeaponDamageBonus: proto.getWeaponDamageBonus,
    updateTempModifiers: proto.updateTempModifiers,
    updateTempPenalties: proto.updateTempPenalties,
    getEmbeddedDocument: (_type, id) => ({ name: id }),
  };
  Object.assign(actor, collectEffectModifiers(actor));
  return actor;
}

const formula = (actor, a, s = null) =>
  ChronicleSystem.getActorAbilityFormula(actor, a, s);

describe("A.1 — armour penalty survives an ability rename", () => {
  const withArmor = (abilityName) =>
    buildActor({
      abilities: [ability(abilityName, "agility", 3)],
      items: [armor("arm", { equipped: 1, penalty: -2 })],
    });

  it("applies the armour penalty under EN and the renamed name identically", () => {
    const en = formula(withArmor("Agility"), "Agility");
    const pt = formula(withArmor("Agilidade"), "Agilidade");
    expect(pt.modifier).toBe(en.modifier);
    // Proof the penalty actually landed (not a trivial 0 === 0): base modifier 0
    // minus the −2 armour penalty routed through the `agility` slug bucket.
    expect(en.modifier).toBe(-2);
  });
});

describe("A.2 — stress condition survives an ability rename", () => {
  const withStress = (abilityName) =>
    buildActor({
      abilities: [ability(abilityName, "awareness", 3)],
      system: { currentStress: 2 },
    });

  it("applies the stress penalty under 'Awareness' and 'Percepção' identically", () => {
    const en = formula(withStress("Awareness"), "Awareness");
    const pt = formula(withStress("Percepção"), "Percepção");
    expect(pt.dicePenalty).toBe(en.dicePenalty);
    expect(en.dicePenalty).toBe(2); // stress 2 → awareness penalty
  });
});

describe("A.3 — authored effect survives an ability rename", () => {
  const withEffect = (abilityName) =>
    buildActor({
      abilities: [ability(abilityName, "agility", 3)],
      effects: [effect("e", [{ key: "cs.result.ability.agility", value: "2" }])],
    });

  it("targets the ability by slug regardless of the display name", () => {
    const en = formula(withEffect("Agility"), "Agility");
    const pt = formula(withEffect("Agilidade"), "Agilidade");
    expect(pt.modifier).toBe(en.modifier);
    expect(en.modifier).toBe(2); // +2 from the authored effect
  });
});

describe("A.5 — specialty effect is SCOPED to its ability (Charm collision)", () => {
  const actor = () =>
    buildActor({
      abilities: [
        ability("Persuasion", "persuasion", 3, {
          specialties: {
            s1: { name: "Charm", slug: "persuasion_charm", rating: 2 },
          },
        }),
        ability("Animal Handling", "animal_handling", 3, {
          specialties: {
            s1: { name: "Charm", slug: "animal_handling_charm", rating: 2 },
          },
        }),
      ],
      effects: [
        effect("ch", [
          { key: "cs.result.specialty.persuasion_charm", value: "3" },
        ]),
      ],
    });

  it("applies to Persuasion:Charm only, never Animal Handling:Charm", () => {
    const onPersuasion = formula(actor(), "Persuasion", "Charm");
    const onAnimal = formula(actor(), "Animal Handling", "Charm");
    expect(onPersuasion.modifier).toBe(3); // the persuasion_charm effect landed
    expect(onAnimal.modifier).toBe(0); // the same-named specialty did NOT
  });
});

describe("B.US2 — a custom-slug effect targets by slug, not display name", () => {
  const withCustom = (abilityName) =>
    buildActor({
      abilities: [ability(abilityName, "fe", 3)], // homebrew slug `fe`
      effects: [effect("e", [{ key: "cs.result.ability.fe", value: "2" }])],
    });

  it("keeps applying after the ability is renamed", () => {
    const original = formula(withCustom("Fé"), "Fé");
    const renamed = formula(withCustom("Faith"), "Faith"); // renamed, slug still `fe`
    expect(renamed.modifier).toBe(original.modifier);
    expect(original.modifier).toBe(2);
  });
});
