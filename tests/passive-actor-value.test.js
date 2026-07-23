import { describe, it, expect } from "vitest";
import { ChronicleSystem } from "../module/system/ChronicleSystem.js";
import { CSActor } from "../module/actors/csActor.js";
import { collectEffectModifiers } from "../module/effects/cs-effect-modifiers.js";
import { makeSpecialtyItem } from "./helpers/doubles.js";

// Spec 023 / contract passive-derivation.md C2. The ACTOR-level passive:
// getActorTestFormula (the existing SSOT) converted by passiveFromFormula, plus
// the cs.passive.* channel merged by the SAME trait rule every other channel
// uses — ability bucket + ALL, specialty bucket without ALL (counted once).

const proto = CSActor.prototype;

const fakeEffect = (changes) => ({
  id: "eff-passive",
  name: "Test Effect",
  disabled: false,
  isSuppressed: false,
  system: { changes },
  getFlag: (scope, key) =>
    scope === "chroniclesystem" && key === "optional" ? false : undefined,
});

/**
 * Awareness rated `rating`, with an Empathy specialty at `empathy` ranks.
 * @param {object} opts
 * @param {Array} [opts.changes] authored effect changes
 * @param {boolean} [opts.withPassiveAccessor] false → an actor that predates the
 *   passive channel (must contribute 0, never NaN)
 */
function makeActor({
  rating = 4,
  empathy = 3,
  changes = [],
  withPassiveAccessor = true,
} = {}) {
  const awareness = {
    type: "ability",
    name: "Awareness",
    _id: "ab-awareness",
    system: {
      slug: "awareness",
      rating,
      modifier: 0,
    },
    getCSData() {
      return this.system;
    },
  };
  // spec 024 — the Empathy specialty is its own item, linked by the ability slug.
  const specialtyItems = empathy
    ? [
        makeSpecialtyItem({
          name: "Empathy",
          abilitySlug: "awareness",
          rating: empathy,
          modifier: 0,
        }),
      ]
    : [];
  const actor = {
    items: [awareness, ...specialtyItems],
    appliedEffects: changes.length ? [fakeEffect(changes)] : [],
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
  if (withPassiveAccessor) actor.getPassive = proto.getPassive;
  Object.assign(actor, collectEffectModifiers(actor));
  return actor;
}

const passive = (actor, ability, specialty = null) =>
  ChronicleSystem.getActorPassiveValue(actor, ability, specialty);

describe("getActorPassiveValue — the baseline conversion (C2.1/C2.5)", () => {
  it("an ability is its test dice × 4", () => {
    expect(passive(makeActor({ rating: 4 }), "Awareness")).toBe(16);
    expect(passive(makeActor({ rating: 2 }), "Awareness")).toBe(8);
  });

  it("a specialty is its ability's passive + its rating (FR-002)", () => {
    // 4 dice × 4 = 16, + Empathy rated 3 (which the formula carries as bonus dice).
    expect(passive(makeActor({ rating: 4, empathy: 3 }), "Awareness", "Empathy"))
      .toBe(19);
  });

  it("an ability the actor does NOT own falls back to untrained → 8 (FR-014d)", () => {
    expect(passive(makeActor(), "Stealth")).toBe(8);
  });

  it("penalties never take it below the one die a test always rolls (FR-006a)", () => {
    const actor = makeActor({
      rating: 1,
      empathy: 0,
      changes: [{ key: "cs.penalty.ability.awareness", value: "3", type: "add" }],
    });
    // 1 die − 3 penalty dice would be −2 dice; the system floors the test at
    // 1d6, so the passive is that die's 4 — matching the chip's `1d6`.
    expect(passive(actor, "Awareness")).toBe(4);
  });

  it("floors at 0, never blank and never negative (FR-006)", () => {
    const actor = makeActor({
      rating: 1,
      empathy: 0,
      changes: [{ key: "cs.result.ability.awareness", value: "-99", type: "add" }],
    });
    expect(passive(actor, "Awareness")).toBe(0);
  });

  it("never writes to the actor (FR-003)", () => {
    const actor = makeActor();
    const before = JSON.stringify(actor.items[0].system);
    passive(actor, "Awareness");
    passive(actor, "Awareness", "Empathy");
    expect(JSON.stringify(actor.items[0].system)).toBe(before);
  });
});

describe("getActorPassiveValue — the passive channel (C2.3/C2.4/C2.6)", () => {
  it("an ability-targeted passive change moves the ability and its specialty ONCE", () => {
    const actor = makeActor({
      changes: [{ key: "cs.passive.ability.awareness", value: "2", type: "add" }],
    });
    expect(passive(actor, "Awareness")).toBe(18); // 16 + 2
    expect(passive(actor, "Awareness", "Empathy")).toBe(21); // 19 + 2, not +4
  });

  it("the ALL bucket is counted exactly once across ability + specialty (FR-033)", () => {
    const actor = makeActor({
      changes: [{ key: "cs.passive.all", value: "1", type: "add" }],
    });
    expect(passive(actor, "Awareness")).toBe(17); // 16 + 1
    expect(passive(actor, "Awareness", "Empathy")).toBe(20); // 19 + 1, not +2
  });

  it("a specialty-targeted change touches only that specialty (FR-034)", () => {
    const actor = makeActor({
      changes: [
        { key: "cs.passive.specialty.awareness_empathy", value: "-1", type: "add" },
      ],
    });
    expect(passive(actor, "Awareness")).toBe(16); // untouched
    expect(passive(actor, "Awareness", "Empathy")).toBe(18); // 19 − 1
  });

  it("an actor with no getPassive accessor contributes 0, never NaN (C2.6)", () => {
    const actor = makeActor({ withPassiveAccessor: false });
    const result = passive(actor, "Awareness");
    expect(result).toBe(16);
    expect(Number.isNaN(result)).toBe(false);
  });

  it("the passive channel never reaches the rolled formula (FR-032)", () => {
    const actor = makeActor({
      changes: [{ key: "cs.passive.ability.awareness", value: "5", type: "add" }],
    });
    const f = ChronicleSystem.getActorAbilityFormula(actor, "Awareness");
    expect(f.pool).toBe(4);
    expect(f.bonusDice).toBe(0);
    expect(f.dicePenalty).toBe(0);
    expect(f.modifier).toBe(0);
  });
});
