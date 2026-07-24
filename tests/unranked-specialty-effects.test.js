import { describe, it, expect } from "vitest";
import { ChronicleSystem } from "../module/system/ChronicleSystem.js";
import { CSActor } from "../module/actors/csActor.js";
import { collectEffectModifiers } from "../module/effects/cs-effect-modifiers.js";
import { makeSpecialtyItem } from "./helpers/doubles.js";

// Regression (bug 2026-07): a roll of a specialty the character has NO ranks in
// must still receive effects/modifiers that TARGET that specialty. Real case: a
// "Battleaxe" declares "Fighting:Axes", the character has Fighting (rating 2, no
// Axes specialty), and a weapon-borne effect grants +5 result / +1 bonus die on
// the Axes specialty (cs.*.specialty.fighting_axes). Before the fix the specialty
// key resolved to null (no registered specialty) so the effect was dropped; now
// the key is derived from the requested specialty name, so the effect applies at
// rating 0 (no rank bonus — only the effect). Applies to ANY test, weapon or not.

const proto = CSActor.prototype;

const fakeEffect = (changes) => ({
  id: "wpn-eff",
  name: "Battleaxe Masterpiece",
  disabled: false,
  isSuppressed: false,
  system: { changes },
  getFlag: (scope, key) =>
    scope === "chroniclesystem" && key === "optional" ? false : undefined,
});

// Fighting ability, rating 2, specialties as given (default: NONE — the reported actor).
function actorWithEffect(changes, { specialties = {} } = {}) {
  const fighting = {
    type: "ability",
    name: "Fighting",
    _id: "ab-fight",
    system: { slug: "fighting", rating: 2, modifier: 0 },
    getCSData() {
      return this.system;
    },
  };
  // spec 024 — a registered specialty is its own item, linked by `fighting`.
  const specialtyItems = Object.values(specialties).map((sp) =>
    makeSpecialtyItem({
      name: sp.name,
      abilitySlug: "fighting",
      rating: sp.rating,
      modifier: sp.modifier,
    })
  );
  const actor = {
    items: [fighting, ...specialtyItems],
    appliedEffects: [fakeEffect(changes)],
    getCSData: () => ({
      derivedStats: { fatigue: { current: 0 }, frustration: { current: 0 } },
      currentStress: 0,
      wounds: [],
      injuries: [],
    }),
    getAbility: proto.getAbility,
    getAbilityBySlug: proto.getAbilityBySlug,
    getAbilityBySpecialty: proto.getAbilityBySpecialty,
    getAbilityBySpecialtySlug: proto.getAbilityBySpecialtySlug,
    getEmbeddedDocument: (t, id) => ({ name: id }),
    updateTempModifiers() {
      if (!this.modifiers) this.modifiers = {};
    },
    updateTempPenalties() {
      if (!this.penalties) this.penalties = {};
    },
    getModifier: proto.getModifier,
    getPenalty: proto.getPenalty,
    getTestDice: proto.getTestDice,
    getBonusDice: proto.getBonusDice,
    getReRoll: proto.getReRoll,
  };
  Object.assign(actor, collectEffectModifiers(actor));
  return actor;
}

const AXES_EFFECT = [
  { key: "cs.result.specialty.fighting_axes", value: "5", type: "add" },
  { key: "cs.bonusdice.specialty.fighting_axes", value: "1", type: "add" },
];

describe("effects on an UN-RANKED specialty still apply (bug 2026-07)", () => {
  it("a specialty the character lacks receives its specialty-keyed effects", () => {
    const actor = actorWithEffect(AXES_EFFECT); // no Axes specialty registered
    const f = ChronicleSystem.getActorAbilityFormula(actor, "Fighting", "Axes");
    expect(f.pool).toBe(2); // Fighting rating; no rank bonus for Axes
    expect(f.bonusDice).toBe(1); // 0 ranks + cs.bonusdice.* 1
    expect(f.modifier).toBe(5); // cs.result.specialty.fighting_axes
  });

  it("shows through the weapon chip (adjustFormulaByWeapon keeps the modifier)", () => {
    const actor = actorWithEffect(AXES_EFFECT);
    let f = ChronicleSystem.getActorAbilityFormula(actor, "Fighting", "Axes");
    f = ChronicleSystem.adjustFormulaByWeapon(actor, f, {
      system: { training: null },
    });
    expect(f.ToFormattedStr()).toBe("2d6+1B+5");
  });

  it("tolerates whitespace in the free-text specialty ('Fighting: Axes')", () => {
    const actor = actorWithEffect(AXES_EFFECT);
    const f = ChronicleSystem.getActorAbilityFormula(actor, "Fighting", " Axes");
    expect(f.modifier).toBe(5);
    expect(f.bonusDice).toBe(1);
  });

  it("isolates the effect — a different unranked specialty is untouched", () => {
    const actor = actorWithEffect(AXES_EFFECT);
    const f = ChronicleSystem.getActorAbilityFormula(
      actor,
      "Fighting",
      "Short Blade"
    );
    expect(f.modifier).toBe(0);
    expect(f.bonusDice).toBe(0);
    expect(f.pool).toBe(2);
  });

  it("a REGISTERED specialty keeps its rank bonus AND the effect", () => {
    const actor = actorWithEffect(AXES_EFFECT, {
      specialties: { s1: { name: "Axes", rating: 3, modifier: 0 } },
    });
    const f = ChronicleSystem.getActorAbilityFormula(actor, "Fighting", "Axes");
    expect(f.pool).toBe(2);
    expect(f.bonusDice).toBe(4); // rank 3 + effect 1
    expect(f.modifier).toBe(5);
  });

  it("never double-counts the ability bucket for a blank specialty name", () => {
    // A bare "Ability:" string must not make the ability-targeted effect count
    // twice — the derived key must stay null when it scopes to the ability itself.
    const actor = actorWithEffect([
      { key: "cs.result.ability.fighting", value: "3", type: "add" },
    ]);
    const f = ChronicleSystem.getActorAbilityFormula(actor, "Fighting", "");
    expect(f.modifier).toBe(3); // once, not 6
  });
});
