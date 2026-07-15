import { describe, it, expect } from "vitest";
import { CSActor } from "../module/actors/csActor.js";

// Wave 2 read-side — the five channel getters share one buffer-aggregation helper.
// Exercised against the REAL prototype methods (data-model §C double pattern).

const proto = CSActor.prototype;

function actorWith(buffers) {
  return {
    ...buffers,
    getEmbeddedDocument: (type, id) => ({ name: `item:${id}` }),
    updateTempModifiers() {
      if (!this.modifiers) this.modifiers = {};
    },
    updateTempPenalties() {
      if (!this.penalties) this.penalties = {};
    },
  };
}

const entry = (mod, _id = "e", isDocument = false) => ({
  _id,
  mod,
  isDocument,
});

describe("read-side getters (buffer aggregation)", () => {
  it("getModifier sums the type bucket plus the global ALL bucket", () => {
    const a = actorWith({
      modifiers: { fighting: [entry(2)], all: [entry(1)] },
    });
    expect(proto.getModifier.call(a, "fighting", false, true).total).toBe(3);
    expect(proto.getModifier.call(a, "fighting", false, false).total).toBe(2);
  });

  it("getPenalty reads the penalty buffer and keeps negative (reduction) values", () => {
    const a = actorWith({
      penalties: { persuasion: [entry(-2)], all: [entry(1)] },
    });
    expect(proto.getPenalty.call(a, "persuasion", false, true).total).toBe(-1);
  });

  it("getTestDice / getBonusDice / getReRoll read their own buffers + ALL", () => {
    const a = actorWith({
      testDice: { marksmanship: [entry(1)], all: [entry(1)] },
      bonusDice: { all: [entry(2)] },
      reRolls: { agility: [entry(1)] },
    });
    expect(proto.getTestDice.call(a, "marksmanship", false, true).total).toBe(
      2
    );
    expect(proto.getBonusDice.call(a, "agility", false, true).total).toBe(2); // only ALL
    expect(proto.getReRoll.call(a, "agility", false, true).total).toBe(1);
  });

  it("preserves negative entries in the new channels (no clamp at getter level)", () => {
    const a = actorWith({
      testDice: { fighting: [entry(-1)] },
      bonusDice: { fighting: [entry(-3)] },
      reRolls: { fighting: [entry(-2)] },
    });
    expect(proto.getTestDice.call(a, "fighting", false, true).total).toBe(-1);
    expect(proto.getBonusDice.call(a, "fighting", false, true).total).toBe(-3);
    expect(proto.getReRoll.call(a, "fighting", false, true).total).toBe(-2);
  });

  it("returns 0 for an absent buffer or empty bucket", () => {
    const a = actorWith({});
    expect(proto.getTestDice.call(a, "fighting", false, true).total).toBe(0);
    expect(proto.getModifier.call(a, "fighting", false, true).total).toBe(0);
  });

  it("includeDetail resolves document-backed entries", () => {
    const a = actorWith({ modifiers: { bulk: [entry(2, "arm", true)] } });
    const { detail } = proto.getModifier.call(a, "bulk", true, false);
    expect(detail).toEqual([{ docName: "item:arm", mod: 2 }]);
  });
});
