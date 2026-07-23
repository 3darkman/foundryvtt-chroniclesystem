import { describe, it, expect } from "vitest";
import { ChronicleSystem } from "../module/system/ChronicleSystem.js";
import { CSActor } from "../module/actors/csActor.js";
import {
  collectEffectModifiers,
  collectOptionalRollEffects,
  collectItemizedAlwaysOn,
} from "../module/effects/cs-effect-modifiers.js";
import {
  makeFakeActor,
  makeAbilityItem,
  makeSpecialtyItem,
} from "./helpers/doubles.js";

// Spec 023 US4 / contract passive-effect-channel.md C2/C3/C5. The read side of
// the `passive` channel: the collector routes it into its OWN buffer, the actor
// accessor aggregates it by the shared trait rule, and it NEVER reaches a rolled
// test nor a derived defence.

const proto = CSActor.prototype;

const fakeEffect = (changes, { disabled = false, isSuppressed = false } = {}) => ({
  id: "eff-1",
  name: "Passive Effect",
  disabled,
  isSuppressed,
  system: { changes },
  getFlag: (scope, key) =>
    scope === "chroniclesystem" && key === "optional" ? false : undefined,
});

/** Awareness 4 with Empathy 3 and Notice 1, plus the given authored changes. */
function makeActor(changes, effectOptions = {}) {
  const awareness = {
    type: "ability",
    name: "Awareness",
    _id: "ab-aware",
    system: {
      slug: "awareness",
      rating: 4,
      modifier: 0,
    },
    getCSData() {
      return this.system;
    },
  };
  // spec 024 — Empathy and Notice are their own items now.
  const specialtyItems = [
    makeSpecialtyItem({
      name: "Empathy",
      abilitySlug: "awareness",
      rating: 3,
      modifier: 0,
    }),
    makeSpecialtyItem({
      name: "Notice",
      abilitySlug: "awareness",
      rating: 1,
      modifier: 0,
    }),
  ];
  const actor = {
    items: [awareness, ...specialtyItems],
    appliedEffects: [fakeEffect(changes, effectOptions)],
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
    getPassive: proto.getPassive,
  };
  Object.assign(actor, collectEffectModifiers(actor));
  return actor;
}

const passive = (actor, ability, specialty = null) =>
  ChronicleSystem.getActorPassiveValue(actor, ability, specialty);

describe("collector — routing into the `passives` buffer (C2.1/C2.2/C2.3)", () => {
  it("seeds the buffer even with no passive change at all", () => {
    const buffers = collectEffectModifiers(makeActor([]));
    expect(buffers.passives).toEqual({});
  });

  it("routes an ability-targeted change to the ability slug bucket", () => {
    const actor = makeActor([
      { key: "cs.passive.ability.awareness", value: "2", type: "add" },
    ]);
    expect(actor.passives.awareness).toBeDefined();
    expect(actor.getPassive("awareness").total).toBe(2);
  });

  it("routes an ALL change to the global bucket and a specialty change to its own", () => {
    const actor = makeActor([
      { key: "cs.passive.all", value: "1", type: "add" },
      {
        key: "cs.passive.specialty.awareness_empathy",
        value: "5",
        type: "add",
      },
    ]);
    expect(actor.getPassive("awareness", false, true).total).toBe(1);
    expect(actor.getPassive("awareness_empathy").total).toBe(5);
  });

  it("never leaks into the dice buffers", () => {
    const actor = makeActor([
      { key: "cs.passive.ability.awareness", value: "9", type: "add" },
    ]);
    expect(actor.getTestDice("awareness", false, true).total).toBe(0);
    expect(actor.getBonusDice("awareness", false, true).total).toBe(0);
    expect(actor.getModifier("awareness", false, true).total).toBe(0);
    expect(actor.getPenalty("awareness", false, true).total).toBe(0);
  });
});

describe("aggregation — counted exactly once (FR-033/FR-034)", () => {
  it("an ability change reaches its specialties, once", () => {
    const actor = makeActor([
      { key: "cs.passive.ability.awareness", value: "2", type: "add" },
    ]);
    expect(passive(actor, "Awareness")).toBe(18); // 16 + 2
    expect(passive(actor, "Awareness", "Empathy")).toBe(21); // 19 + 2
    expect(passive(actor, "Awareness", "Notice")).toBe(19); // 17 + 2
  });

  it("an ALL change is counted once on an ability AND once on a specialty", () => {
    const actor = makeActor([
      { key: "cs.passive.all", value: "1", type: "add" },
    ]);
    expect(passive(actor, "Awareness")).toBe(17);
    expect(passive(actor, "Awareness", "Empathy")).toBe(20); // 19 + 1, not +2
  });

  it("a specialty change touches ONLY that specialty (FR-034)", () => {
    const actor = makeActor([
      {
        key: "cs.passive.specialty.awareness_empathy",
        value: "-1",
        type: "add",
      },
    ]);
    expect(passive(actor, "Awareness")).toBe(16);
    expect(passive(actor, "Awareness", "Empathy")).toBe(18);
    expect(passive(actor, "Awareness", "Notice")).toBe(17); // sibling untouched
  });
});

describe("lifecycle — disabled / suppressed contribute nothing (FR-036)", () => {
  it.each([
    ["disabled", { disabled: true }],
    ["suppressed", { isSuppressed: true }],
  ])("a %s effect is skipped", (_name, options) => {
    const actor = makeActor(
      [{ key: "cs.passive.ability.awareness", value: "5", type: "add" }],
      options
    );
    expect(actor.passives).toEqual({});
    expect(passive(actor, "Awareness")).toBe(16);
  });
});

describe("FR-032 — a passive change never reaches a rolled test (C2.5, C5)", () => {
  const changes = [
    { key: "cs.passive.ability.awareness", value: "3", type: "add" },
    { key: "cs.passive.all", value: "2", type: "add" },
  ];

  it("leaves the effective formula's four levers untouched", () => {
    const actor = makeActor(changes);
    const f = ChronicleSystem.getActorAbilityFormula(actor, "Awareness");
    expect(f.pool).toBe(4);
    expect(f.bonusDice).toBe(0);
    expect(f.dicePenalty).toBe(0);
    expect(f.modifier).toBe(0);
    expect(f.reRoll).toBe(0);
  });

  it("collectOptionalRollEffects returns nothing for it", () => {
    const actor = makeActor(
      changes.map((change) => ({ ...change })),
      {}
    );
    const optional = collectOptionalRollEffects(actor, "Awareness");
    expect(optional.filter((e) => e.channel === "passive")).toEqual([]);
  });

  it("collectItemizedAlwaysOn never lists it as a roll modifier", () => {
    const actor = makeActor(changes);
    const rows = collectItemizedAlwaysOn(actor, "Awareness");
    // No row carries a passive value; the only fields listed are formula levers.
    expect(rows.some((r) => r.value === 3 || r.value === 2)).toBe(false);
  });
});

// FR-031a as a STATIC guard (the pattern spec 022 used for disposition/intrigue):
// the two Defenses are `derivedstat` targets, so the trait grammar can never
// address them — and the ALL bucket is read only by the passive derivation,
// never by calculateDerivedValues. This must not rest on the manual walkthrough.
describe("FR-031a — an all-traits passive never moves the two Defenses", () => {
  const defenceActor = () =>
    makeFakeActor({
      abilities: [
        makeAbilityItem("awareness", 2),
        makeAbilityItem("agility", 3),
        makeAbilityItem("athletics", 4),
        makeAbilityItem("cunning", 5),
        makeAbilityItem("status", 1),
      ],
    });

  it("calculateDerivedValues does not consult a `passives` buffer", () => {
    const before = defenceActor();
    proto.calculateDerivedValues.call(before);
    const baseline = {
      combat: before.getCSData().derivedStats.combatDefense.total,
      intrigue: before.getCSData().derivedStats.intrigueDefense.total,
    };

    // The same actor, now carrying a large all-traits passive bonus.
    const after = defenceActor();
    after.passives = {
      [ChronicleSystem.modifiersConstants.ALL]: [{ _id: "x", mod: 99 }],
    };
    after.getPassive = proto.getPassive;
    after.getEmbeddedDocument = () => null;
    proto.calculateDerivedValues.call(after);

    expect(after.getCSData().derivedStats.combatDefense.total).toBe(
      baseline.combat
    );
    expect(after.getCSData().derivedStats.intrigueDefense.total).toBe(
      baseline.intrigue
    );
    // The buffer IS readable — it simply is not part of the defence computation.
    expect(after.getPassive("anything", false, true).total).toBe(99);
  });

  it("moves the ability and specialty passives it IS meant to move", () => {
    const actor = makeActor([
      { key: "cs.passive.all", value: "99", type: "add" },
    ]);
    expect(passive(actor, "Awareness")).toBe(115); // 16 + 99
    expect(passive(actor, "Awareness", "Empathy")).toBe(118); // 19 + 99
  });
});
