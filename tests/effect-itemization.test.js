import { describe, it, expect } from "vitest";
import { ChronicleSystem } from "../module/system/ChronicleSystem.js";
import { CSCharacterActor } from "../module/actors/csCharacterActor.js";
import { collectItemizedAlwaysOn } from "../module/effects/cs-effect-modifiers.js";

// US2 / Contract roll-dialog-composition §Testes. The itemized always-on list
// (condition + equipment + permanent AE, labeled by origin) and the RAW base
// formula (no channels). Pure: reads the actor doubles, no live Foundry.

const proto = CSCharacterActor.prototype;

const fakeEffect = ({ id, name, changes }) => ({
  id,
  name,
  disabled: false,
  isSuppressed: false,
  system: { changes },
  getFlag: (scope, key) =>
    scope === "chroniclesystem" && key === "optional" ? false : undefined,
});

const abilityItem = (name, rating = 3) => ({
  type: "ability",
  name,
  system: { rating, specialties: {} },
  getCSData() {
    return this.system;
  },
});

describe("collectItemizedAlwaysOn — 4 sources, labeled by origin", () => {
  // An Agility roll with: 2 permanent AE, 1 condition (fatigue), 1 equipment
  // (armour penalty). Each contributes ONE itemized entry that applies to Agility.
  const actor = {
    appliedEffects: [
      fakeEffect({
        id: "bless",
        name: "Blessing",
        changes: [{ key: "cs.result.ability.agility", value: "1" }],
      }),
      fakeEffect({
        id: "focus",
        name: "Focus",
        changes: [{ key: "cs.testdice.all", value: "1" }],
      }),
    ],
    items: [
      abilityItem("Agility", 3),
      {
        type: "armor",
        _id: "arm",
        name: "Plate",
        system: { equipped: 1, penalty: -1, rating: 0, bulk: 0 },
      },
    ],
    getCSData: () => ({
      derivedStats: { fatigue: { current: 1 }, frustration: { current: 0 } },
      currentStress: 0,
      wounds: [],
      injuries: [],
    }),
  };

  const items = collectItemizedAlwaysOn(actor, "Agility", null);

  it("yields exactly 4 entries", () => {
    expect(items).toHaveLength(4);
  });

  it("labels each origin correctly", () => {
    const byOrigin = items.reduce((m, i) => {
      (m[i.origin] ??= []).push(i);
      return m;
    }, {});
    expect(byOrigin.effect.map((i) => i.sourceLabel).sort()).toEqual([
      "Blessing",
      "Focus",
    ]);
    expect(byOrigin.condition).toHaveLength(1);
    expect(byOrigin.equipment[0].sourceLabel).toBe("Plate");
  });

  it("carries the right formula field + value per source", () => {
    const find = (label) => items.find((i) => i.sourceLabel === label);
    expect(find("Blessing")).toMatchObject({ field: "modifier", value: 1 });
    expect(find("Focus")).toMatchObject({ field: "pool", value: 1 });
    expect(find("Plate")).toMatchObject({ field: "modifier", value: -1 });
    // Fatigue is an ALL modifier of −1 (condition).
    const fatigue = items.find((i) => i.origin === "condition");
    expect(fatigue).toMatchObject({ field: "modifier", value: -1 });
  });

  it("is empty for an actor with no effects/conditions/equipment", () => {
    const bare = {
      appliedEffects: [],
      items: [abilityItem("Agility", 3)],
      getCSData: () => ({
        derivedStats: { fatigue: { current: 0 }, frustration: { current: 0 } },
        currentStress: 0,
        wounds: [],
        injuries: [],
      }),
    };
    expect(collectItemizedAlwaysOn(bare, "Agility", null)).toEqual([]);
  });
});

// --- RAW formula (no channels) mirrors the base capacity -------------------

const channel = (bucket) => (type, _detail, includeGlobal) => ({
  total: (bucket[type] ?? 0) + (includeGlobal ? bucket.all ?? 0 : 0),
  detail: [],
});
const zero = () => ({ total: 0, detail: [] });

function probeActor({ rating = 3, modifier = 0, getModifier = zero } = {}) {
  const agility = {
    name: "Agility",
    type: "ability",
    getCSData: () => ({ rating, modifier, specialties: {} }),
  };
  return {
    items: [agility],
    getAbility: proto.getAbility,
    getAbilityBySpecialty: proto.getAbilityBySpecialty,
    getModifier,
    getPenalty: zero,
    getTestDice: zero,
    getBonusDice: zero,
    getReRoll: zero,
  };
}

describe("getActorRawTestFormula — the trait capacity without any channel", () => {
  it("returns only the base rating/modifier", () => {
    const raw = ChronicleSystem.getActorRawTestFormula(
      probeActor({ rating: 3, modifier: 2 }),
      "Agility"
    );
    expect(raw.pool).toBe(3);
    expect(raw.modifier).toBe(2);
    expect(raw.bonusDice).toBe(0);
    expect(raw.dicePenalty).toBe(0);
    expect(raw.reRoll).toBe(0);
  });

  it("ignores active channels the effective formula would count (base stays raw)", () => {
    const actor = probeActor({
      rating: 3,
      modifier: 0,
      getModifier: channel({ agility: 5, all: 2 }),
    });
    const raw = ChronicleSystem.getActorRawTestFormula(actor, "Agility");
    const effective = ChronicleSystem.getActorAbilityFormula(actor, "Agility");
    expect(raw.modifier).toBe(0); // raw ignores the +7 channel
    expect(effective.modifier).toBe(7); // 5 + ALL 2
  });

  it("equals the effective formula when there are no channel effects (SC-009)", () => {
    const actor = probeActor({ rating: 4, modifier: 1 });
    const raw = ChronicleSystem.getActorRawTestFormula(actor, "Agility");
    const effective = ChronicleSystem.getActorAbilityFormula(actor, "Agility");
    expect(raw.toStr()).toBe(effective.toStr());
  });
});
