import { describe, it, expect } from "vitest";
import { ChronicleSystem } from "../module/system/ChronicleSystem.js";
import { CSCharacterActor } from "../module/actors/csCharacterActor.js";

// Wave 2 — the integration the parity hinges on: getActorTestFormula
// (exposed as ChronicleSystem.getActorAbilityFormula). It must (a) stay
// byte-identical to the legacy formula when no new-channel effects exist, and
// (b) count the global ALL bucket exactly ONCE across ability + specialty.

const proto = CSCharacterActor.prototype;

// A channel getter honouring includeGlobal: total = bucket[type] + (global ? ALL : 0).
const channel = (bucket) => (type, _detail, includeGlobal) => ({
  total: (bucket[type] ?? 0) + (includeGlobal ? bucket.all ?? 0 : 0),
  detail: [],
});
const zero = () => ({ total: 0, detail: [] });

function probeActor({
  rating = 4,
  modifier = 1,
  specialties = {},
  getModifier = zero,
  getPenalty = zero,
  getTestDice = zero,
  getBonusDice = zero,
  getReRoll = zero,
} = {}) {
  const fighting = {
    name: "Fighting",
    type: "ability",
    getCSData: () => ({ rating, modifier, specialties }),
  };
  return {
    items: [fighting],
    getAbility: proto.getAbility,
    getAbilityBySpecialty: proto.getAbilityBySpecialty,
    getModifier,
    getPenalty,
    getTestDice,
    getBonusDice,
    getReRoll,
  };
}

const formula = (actor, ability, specialty = null) =>
  ChronicleSystem.getActorAbilityFormula(actor, ability, specialty);

describe("getActorTestFormula — legacy parity (no new-channel effects)", () => {
  it("reproduces the legacy formula for a found ability", () => {
    const f = formula(
      probeActor({
        rating: 4,
        modifier: 1,
        getModifier: channel({ fighting: 5, all: 2 }),
        getPenalty: channel({ fighting: 3, all: 1 }),
      }),
      "Fighting"
    );
    expect(f.pool).toBe(4); // rating
    expect(f.dicePenalty).toBe(4); // 3 + ALL 1
    expect(f.modifier).toBe(8); // abilityMod 1 + getModifier(5 + ALL 2)
    expect(f.bonusDice).toBe(0); // no specialty
    expect(f.reRoll).toBe(0);
  });

  it("falls back to pool 2 / no ability modifier for a missing ability", () => {
    const f = formula(
      probeActor({ getModifier: channel({ stealth: 5, all: 2 }) }),
      "Stealth" // not on the actor
    );
    expect(f.pool).toBe(2);
    expect(f.modifier).toBe(7); // 0 baseModifier + (5 + ALL 2)
    expect(f.bonusDice).toBe(0);
  });
});

describe("getActorTestFormula — global ALL counted exactly once across ability + specialty", () => {
  const withSpec = (getters) =>
    probeActor({
      rating: 3,
      modifier: 0,
      specialties: { s1: { name: "Axes", rating: 0, modifier: 0 } },
      ...getters,
    });
  const buckets = { fighting: 1, axes: 10, all: 100 }; // → 1 + 100(once) + 10 = 111

  it("modifier lever", () => {
    expect(
      formula(withSpec({ getModifier: channel(buckets) }), "Fighting", "Axes")
        .modifier
    ).toBe(111);
  });
  it("penalty lever → dicePenalty", () => {
    expect(
      formula(withSpec({ getPenalty: channel(buckets) }), "Fighting", "Axes")
        .dicePenalty
    ).toBe(111);
  });
  it("test-dice lever → pool (base rating 3)", () => {
    expect(
      formula(withSpec({ getTestDice: channel(buckets) }), "Fighting", "Axes")
        .pool
    ).toBe(3 + 111);
  });
  it("bonus-dice lever → bonusDice (specialty rating 0 here)", () => {
    expect(
      formula(withSpec({ getBonusDice: channel(buckets) }), "Fighting", "Axes")
        .bonusDice
    ).toBe(111);
  });
  it("reroll lever", () => {
    expect(
      formula(withSpec({ getReRoll: channel(buckets) }), "Fighting", "Axes")
        .reRoll
    ).toBe(111);
  });
});

describe("getActorTestFormula — ability and specialty both contribute (channelTotal sum)", () => {
  it("sums the ability bucket and the specialty bucket on a channel", () => {
    // bonusDice: ability fighting=1, specialty axes=2 → channelTotal 3; plus specValue (Axes rating 2) = 5.
    const f = formula(
      probeActor({
        rating: 3,
        modifier: 0,
        specialties: { s1: { name: "Axes", rating: 2, modifier: 0 } },
        getBonusDice: (type) => ({
          total: { fighting: 1, axes: 2 }[type] ?? 0,
          detail: [],
        }),
      }),
      "Fighting",
      "Axes"
    );
    expect(f.bonusDice).toBe(5); // dropping either operand would give 3 or 4
  });
});
