import { describe, it, expect } from "vitest";
import {
  parseEffectKey,
  buildEffectKey,
  EFFECT_CHANNELS,
  TARGET_KINDS,
} from "../module/effects/cs-effect-vocabulary.js";
import {
  collectEffectModifiers,
  influenceFor,
} from "../module/effects/cs-effect-modifiers.js";

// US4 / Contract effect-vocabulary-additions §Testes. The disposition + influence
// vocabulary round-trips, and the collector routes them to the dispositionDelta /
// influence buffers (never the plain modifier buffer).

const fakeEffect = ({
  id = "e",
  disabled = false,
  isSuppressed = false,
  optional = false,
  changes = [],
}) => ({
  id,
  disabled,
  isSuppressed,
  system: { changes },
  getFlag: (scope, key) =>
    scope === "chroniclesystem" && key === "optional" ? optional : undefined,
});

const fakeActor = (appliedEffects, items = []) => ({ appliedEffects, items });

describe("vocabulary — disposition + influence round-trip", () => {
  const keys = [
    [
      "cs.result.disposition.persuasion",
      { channel: "result", targetKind: "disposition", target: "persuasion" },
    ],
    [
      "cs.result.disposition.deception",
      { channel: "result", targetKind: "disposition", target: "deception" },
    ],
    [
      "cs.result.disposition.both",
      { channel: "result", targetKind: "disposition", target: "both" },
    ],
    [
      "cs.influence.charm",
      { channel: "influence", targetKind: "influence", target: "charm" },
    ],
    [
      "cs.influence",
      { channel: "influence", targetKind: "influence", target: null },
    ],
  ];

  for (const [key, parsed] of keys) {
    it(`parses + rebuilds "${key}"`, () => {
      expect(parseEffectKey(key)).toEqual(parsed);
      expect(buildEffectKey(parsed)).toBe(key);
    });
  }

  it("rejects an out-of-set disposition facet", () => {
    expect(parseEffectKey("cs.result.disposition.xyz")).toBeNull();
    expect(
      buildEffectKey({
        channel: EFFECT_CHANNELS.RESULT,
        targetKind: TARGET_KINDS.DISPOSITION,
        target: "xyz",
      })
    ).toBe("");
  });

  it("does not confuse a plain result modifier with disposition", () => {
    expect(parseEffectKey("cs.result.all")).toEqual({
      channel: "result",
      targetKind: "all",
      target: null,
    });
  });
});

describe("collector — dispositionDelta buffer", () => {
  it("routes cs.result.disposition.both = 2 into BOTH facets", () => {
    const { dispositionDelta, modifiers } = collectEffectModifiers(
      fakeActor([
        fakeEffect({
          id: "d",
          changes: [{ key: "cs.result.disposition.both", value: "2" }],
        }),
      ])
    );
    expect(dispositionDelta).toEqual({ persuasion: 2, deception: 2 });
    // It must NOT leak into the plain modifier buffer.
    expect(modifiers).toEqual({});
  });

  it("routes a single facet only", () => {
    const { dispositionDelta } = collectEffectModifiers(
      fakeActor([
        fakeEffect({
          id: "p",
          changes: [{ key: "cs.result.disposition.persuasion", value: "3" }],
        }),
      ])
    );
    expect(dispositionDelta).toEqual({ persuasion: 3, deception: 0 });
  });
});

describe("collector — influence buffer (per-technique + ALL)", () => {
  it("sums a technique bucket and the ALL bucket, read via influenceFor", () => {
    const { influence } = collectEffectModifiers(
      fakeActor([
        fakeEffect({
          id: "c",
          changes: [{ key: "cs.influence.charm", value: "1" }],
        }),
        fakeEffect({ id: "a", changes: [{ key: "cs.influence", value: "1" }] }),
      ])
    );
    expect(influence).toEqual({ charm: 1, all: 1 });
    expect(influenceFor(influence, "charm")).toBe(2); // own 1 + ALL 1
    expect(influenceFor(influence, "bargain")).toBe(1); // only ALL 1
    expect(influenceFor(influence, "seduce")).toBe(1); // only ALL 1
  });

  it("reads 0 for an unaddressed technique with no ALL bucket", () => {
    const { influence } = collectEffectModifiers(fakeActor([]));
    expect(influenceFor(influence, "taunt")).toBe(0);
  });
});
