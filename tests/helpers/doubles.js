// Shared test builders (data-model §C). They assemble the minimal `this`/`actor`
// objects needed to invoke the REAL production methods via
// `CSClass.prototype.method.call(fake, ...)` — so the tests exercise production
// logic (FR-014: module/** stays untouched), not a reimplementation.

import { CSActor } from "../../module/actors/csActor.js";
import { scopedSpecialtySlug } from "../../module/vocabulary/cs-canonical-abilities.js";

const proto = CSActor.prototype;

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
export function makeAbilityItem(
  name,
  rating,
  { modifier = 0, specialties = {}, slug } = {}
) {
  const data = { rating, modifier, specialties };
  if (slug !== undefined) data.slug = slug; // spec 008: stable identity
  return {
    name,
    type: "ability",
    system: data,
    getCSData: () => data,
  };
}

/**
 * A fake Specialty ITEM (spec 024) — the new shape the rewritten resolvers scan
 * for. `slug` defaults to the scoped derivation, exactly as production does.
 * The old-shape `makeAbilityItem({specialties})` builder is deliberately kept so
 * the parity harness can construct the same character both ways.
 */
export function makeSpecialtyItem({
  name,
  slug,
  abilitySlug = "",
  rating = 0,
  modifier = 0,
} = {}) {
  const data = {
    slug: slug ?? scopedSpecialtySlug(abilitySlug, name),
    abilitySlug,
    rating,
    modifier,
    description: "",
    type: "",
  };
  return {
    name,
    type: "specialty",
    system: data,
    getCSData: () => data,
  };
}

/**
 * A fake character actor wired to the REAL prototype lookups (getAbility,
 * getAbilityValue, getAbilityBySpecialty) so name/specialty resolution and the
 * i18n key→label wiring are genuinely exercised. getModifier honours the
 * `modifiers` map (type → total); getPenalty is neutral.
 *
 * `specialties` (spec 024) are Specialty ITEMS and simply join the same `items`
 * collection the abilities live in — which is what the actor really holds.
 */
export function makeFakeActor({
  abilities = [],
  specialties = [],
  data,
  modifiers = {},
} = {}) {
  const system = deepMerge(defaultActorData(), data);
  return {
    items: [...abilities, ...specialties],
    getCSData: () => system,
    getAbility: proto.getAbility,
    getAbilityValue: proto.getAbilityValue,
    getAbilityBySpecialty: proto.getAbilityBySpecialty, // required by calculateMovementData
    // spec 008: the derived stats / movement now resolve by stable slug.
    getAbilityBySlug: proto.getAbilityBySlug,
    getAbilityValueBySlug: proto.getAbilityValueBySlug,
    getAbilityBySpecialtySlug: proto.getAbilityBySpecialtySlug,
    // calculateDerivedValues computes combat/intrigue defense too, calling these:
    calcCombatDefense: proto.calcCombatDefense,
    calcIntrigueDefense: proto.calcIntrigueDefense,
    getModifier: (type) => ({ total: modifiers[type] ?? 0, detail: [] }),
    getPenalty: () => ({ total: 0, detail: [] }),
    // Wave 4: neutral AE contributions keep the characterized totals unchanged.
    getDerivedStatBonus: () => 0,
    getWeaponDamageBonus: () => 0,
  };
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
    // `system` mirrors getCSData() (spec 020: weaponWieldingFlags reads
    // item.system.qualities directly, as production does — getCSData() === system).
    system: { training, qualities, equipped, damage },
    getCSData: () => ({ damage, qualities, equipped }),
  };
}
