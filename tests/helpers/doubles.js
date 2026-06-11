// Shared test builders (data-model §C). They assemble the minimal `this`/`actor`
// objects needed to invoke the REAL production methods via
// `CSClass.prototype.method.call(fake, ...)` — so the tests exercise production
// logic (FR-014: module/** stays untouched), not a reimplementation.

import { CSCharacterActor } from "../../module/actors/csCharacterActor.js";

const proto = CSCharacterActor.prototype;

// Deep-merge plain objects (arrays/primitives replace). Used to let a test
// override only the data slice it cares about while keeping the skeleton.
const deepMerge = (base, override) => {
  if (!override) return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      out[key] &&
      typeof out[key] === "object" &&
      !Array.isArray(out[key])
    ) {
      out[key] = deepMerge(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
};

// The derivedStats/movement skeleton that calculateDerivedValues /
// calculateMovementData read from and write back into.
const defaultActorData = () => ({
  derivedStats: {
    combatDefense: { value: 0, modifier: 0, total: 0 },
    intrigueDefense: { value: 0, modifier: 0, total: 0 },
    health: { value: 0, modifier: 0, total: 0, current: 0 },
    composure: { value: 0, modifier: 0, total: 0, current: 0 },
    frustration: { value: 0, modifier: 0, total: 0, current: 0 },
    fatigue: { value: 0, modifier: 0, total: 0, current: 0 },
  },
  movement: {
    base: 4,
    runBonus: 0,
    sprintMultiplier: 4,
    bulk: 0,
    modifier: 0,
    total: 0,
    sprintTotal: 0,
  },
});

/**
 * A fake ability Item feeding the REAL getAbilityValue / getAbilityBySpecialty.
 * `specialties` is a map { key: { name, rating, modifier } }, e.g.
 *   makeAbilityItem("athletics", 3, { specialties: { run: { name: "run", rating: 4, modifier: 0 } } })
 */
export function makeAbilityItem(name, rating, { modifier = 0, specialties = {} } = {}) {
  return {
    name,
    type: "ability",
    getCSData: () => ({ rating, modifier, specialties }),
  };
}

/**
 * A fake character actor wired to the REAL prototype lookups (getAbility,
 * getAbilityValue, getAbilityBySpecialty) so name/specialty resolution and the
 * i18n key→label wiring are genuinely exercised. getModifier honours the
 * `modifiers` map (type → total); getPenalty is neutral.
 */
export function makeFakeActor({ abilities = [], data, modifiers = {} } = {}) {
  const system = deepMerge(defaultActorData(), data);
  return {
    items: abilities,
    getCSData: () => system,
    getAbility: proto.getAbility,
    getAbilityValue: proto.getAbilityValue,
    getAbilityBySpecialty: proto.getAbilityBySpecialty, // required by calculateMovementData
    // calculateDerivedValues computes combat/intrigue defense too, calling these:
    calcCombatDefense: proto.calcCombatDefense,
    calcIntrigueDefense: proto.calcIntrigueDefense,
    getModifier: (type) => ({ total: modifiers[type] ?? 0, detail: [] }),
    getPenalty: () => ({ total: 0, detail: [] }),
  };
}

/**
 * A fake character actor that exercises the REAL modifier machinery
 * (updateTempModifiers / addModifier / removeModifier / getModifier via the
 * prototype) backed by a live `system.modifiers` object, plus an injectable
 * `appliedEffects` list. Used by the Active Effects parity test (spec 006): it
 * lets a test compare the homemade modifier total against the total pushed by
 * the effect collector through the SAME read path (FR-012 / contract P5).
 */
export function makeModifierActor({ appliedEffects = [] } = {}) {
  const system = { modifiers: {}, penalties: {} };
  return {
    system,
    appliedEffects,
    getCSData: () => system,
    getEmbeddedDocument: () => null,
    updateTempModifiers: proto.updateTempModifiers,
    updateTempPenalties: proto.updateTempPenalties,
    addModifier: proto.addModifier,
    removeModifier: proto.removeModifier,
    getModifier: proto.getModifier,
    getPenalty: proto.getPenalty,
  };
}

/**
 * A minimal Active Effect double: an `id` plus a `changes` array. Mirrors the
 * portable read path the collector uses (`effect.changes` with `{ key, value }`).
 */
export function makeFakeEffect(id, changes = []) {
  return { id, changes };
}

/**
 * A fake weapon. `specialty` is read directly by the `weapon-test` helper;
 * `system.training` is read by adjustFormulaByWeapon; `getCSData()` feeds
 * updateDamageValue (damage formula, qualities, equipped slot).
 */
export function makeFakeWeapon({
  damage = "@Fighting+1",
  qualities = [],
  equipped = 0,
  specialty = "",
  training = 0,
} = {}) {
  return {
    specialty,
    system: { training },
    getCSData: () => ({ damage, qualities, equipped }),
  };
}
