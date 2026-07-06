import { describe, it, expect } from "vitest";
import {
  collectOptionalRollEffects,
  collectPermanentRollEffects,
} from "../module/effects/cs-effect-modifiers.js";

// Wave 3 — on-read collection of the OPTIONAL (dialog-toggled) roll effects.
// Pure logic: the function reads `actor.appliedEffects` and `actor.items`, so the
// fakes below mirror those shapes (the same effect/actor doubles the aggregation
// test uses), with the optional/condition flags exposed via getFlag.

const fakeEffect = ({
  id = "e",
  name = "Effect",
  disabled = false,
  isSuppressed = false,
  optional = true,
  condition = "",
  changes = [],
}) => ({
  id,
  name,
  disabled,
  isSuppressed,
  system: { changes },
  getFlag: (scope, key) => {
    if (scope !== "chroniclesystem") return undefined;
    if (key === "optional") return optional;
    if (key === "condition") return condition;
    return undefined;
  },
});

const ability = (name, rating = 3, specialties = {}) => ({
  type: "ability",
  name,
  system: { rating, specialties },
});

const fakeActor = (appliedEffects, items = []) => ({ appliedEffects, items });

describe("collectOptionalRollEffects (dialog-toggled effects)", () => {
  it("surfaces an ALL-targeted optional effect for any roll, tagged with its formula field", () => {
    const eff = fakeEffect({
      id: "a",
      name: "Bless",
      changes: [{ key: "cs.result.all", value: "2" }],
    });
    const result = collectOptionalRollEffects(
      fakeActor([eff]),
      "Awareness",
      null
    );
    expect(result).toEqual([
      {
        name: "Bless",
        effectId: "a",
        channel: "result",
        formulaField: "modifier",
        value: 2,
        condition: "",
      },
    ]);
  });

  it("matches an ability-targeted optional effect only on that ability's roll", () => {
    const eff = fakeEffect({
      id: "x",
      changes: [{ key: "cs.testdice.ability.awareness", value: "1" }],
    });
    const actor = fakeActor([eff], [ability("Awareness")]);

    const onAwareness = collectOptionalRollEffects(actor, "Awareness", null);
    expect(onAwareness).toHaveLength(1);
    expect(onAwareness[0].formulaField).toBe("pool"); // testdice → pool

    const onFighting = collectOptionalRollEffects(actor, "Fighting", null);
    expect(onFighting).toHaveLength(0);
  });

  it("matches a specialty-targeted optional effect on that specialty's roll", () => {
    const fighting = ability("Fighting", 3, {
      s1: { name: "Axes", rating: 2 },
    });
    const eff = fakeEffect({
      id: "ax",
      changes: [{ key: "cs.bonusdice.specialty.axes", value: "1" }],
    });
    const actor = fakeActor([eff], [fighting]);

    const onAxes = collectOptionalRollEffects(actor, "Fighting", "Axes");
    expect(onAxes).toHaveLength(1);
    expect(onAxes[0].formulaField).toBe("bonusDice"); // bonusdice → bonusDice

    // Same ability but a different specialty → no match.
    const onSwords = collectOptionalRollEffects(actor, "Fighting", "Swords");
    expect(onSwords).toHaveLength(0);
  });

  it("applies an ability-targeted optional effect when rolling that ability's specialty", () => {
    const fighting = ability("Fighting", 3, {
      s1: { name: "Axes", rating: 2 },
    });
    const eff = fakeEffect({
      id: "f",
      changes: [{ key: "cs.result.ability.fighting", value: "1" }],
    });
    const result = collectOptionalRollEffects(
      fakeActor([eff], [fighting]),
      "Fighting",
      "Axes"
    );
    expect(result).toHaveLength(1);
    expect(result[0].channel).toBe("result");
  });

  it("excludes non-optional (permanent) effects — those enter via the buffer", () => {
    const eff = fakeEffect({
      id: "p",
      optional: false,
      changes: [{ key: "cs.result.all", value: "2" }],
    });
    expect(
      collectOptionalRollEffects(fakeActor([eff]), "Awareness", null)
    ).toEqual([]);
  });

  it("excludes disabled, suppressed, non-roll-channel and zero-value changes", () => {
    const effects = [
      fakeEffect({
        id: "d",
        disabled: true,
        changes: [{ key: "cs.result.all", value: "2" }],
      }),
      fakeEffect({
        id: "s",
        isSuppressed: true,
        changes: [{ key: "cs.result.all", value: "2" }],
      }),
      fakeEffect({
        id: "ds",
        changes: [{ key: "cs.derivedstat.health", value: "2" }], // non-roll channel
      }),
      fakeEffect({
        id: "z",
        changes: [{ key: "cs.result.all", value: "0" }], // zero contribution
      }),
    ];
    expect(
      collectOptionalRollEffects(fakeActor(effects), "Awareness", null)
    ).toEqual([]);
  });

  it("maps every roll channel to the matching DiceRollFormula field", () => {
    const effects = [
      fakeEffect({ id: "r", changes: [{ key: "cs.result.all", value: "1" }] }),
      fakeEffect({
        id: "p",
        changes: [{ key: "cs.penalty.all", value: "-1" }],
      }),
      fakeEffect({
        id: "t",
        changes: [{ key: "cs.testdice.all", value: "1" }],
      }),
      fakeEffect({
        id: "b",
        changes: [{ key: "cs.bonusdice.all", value: "1" }],
      }),
      fakeEffect({ id: "rr", changes: [{ key: "cs.reroll.all", value: "1" }] }),
    ];
    const result = collectOptionalRollEffects(
      fakeActor(effects),
      "Awareness",
      null
    );
    const fields = Object.fromEntries(
      result.map((effect) => [effect.channel, effect.formulaField])
    );
    expect(fields).toEqual({
      result: "modifier",
      penalty: "dicePenalty",
      testdice: "pool",
      bonusdice: "bonusDice",
      reroll: "reRoll",
    });
  });

  it("surfaces the situational condition tag and keeps a negative value", () => {
    const eff = fakeEffect({
      id: "au",
      name: "Authority",
      condition: "vs-persuasion",
      changes: [{ key: "cs.penalty.ability.persuasion", value: "-2" }],
    });
    const result = collectOptionalRollEffects(
      fakeActor([eff], [ability("Persuasion")]),
      "Persuasion",
      null
    );
    expect(result[0].condition).toBe("vs-persuasion");
    expect(result[0].value).toBe(-2);
  });

  it("resolves a derived (@rank) optional value against the actor", () => {
    const abilities = [ability("Fighting", 4), ability("Agility", 2)];
    const eff = fakeEffect({
      id: "wd",
      changes: [
        { key: "cs.testdice.ability.agility", value: "@rank:fighting" },
      ],
    });
    const result = collectOptionalRollEffects(
      fakeActor([eff], abilities),
      "Agility",
      null
    );
    expect(result[0].value).toBe(4); // rank of Fighting
  });
});

// Wave 5 — the PERMANENT roll-effect collector powers the dialog's read-only
// "Active Effects" section (disabled+checked). It is the exact inverse partition
// of the optional collector: same matching, opposite optional flag.
describe("collectPermanentRollEffects (locked dialog rows)", () => {
  it("surfaces a non-optional ALL effect for any roll", () => {
    const eff = fakeEffect({
      id: "k",
      name: "Keen Blade",
      optional: false,
      changes: [{ key: "cs.result.all", value: "1" }],
    });
    const result = collectPermanentRollEffects(
      fakeActor([eff]),
      "Awareness",
      null
    );
    expect(result).toEqual([
      {
        name: "Keen Blade",
        effectId: "k",
        channel: "result",
        formulaField: "modifier",
        value: 1,
        condition: "",
      },
    ]);
  });

  it("EXCLUDES optional effects — they belong to the toggle section", () => {
    const eff = fakeEffect({
      id: "o",
      optional: true,
      changes: [{ key: "cs.result.all", value: "2" }],
    });
    expect(
      collectPermanentRollEffects(fakeActor([eff]), "Awareness", null)
    ).toEqual([]);
  });

  it("partitions a mixed set: permanent vs optional never overlap", () => {
    const permanent = fakeEffect({
      id: "p",
      optional: false,
      changes: [{ key: "cs.result.all", value: "1" }],
    });
    const optional = fakeEffect({
      id: "o",
      optional: true,
      changes: [{ key: "cs.result.all", value: "2" }],
    });
    const actor = fakeActor([permanent, optional]);
    const perm = collectPermanentRollEffects(actor, "Awareness", null);
    const opt = collectOptionalRollEffects(actor, "Awareness", null);
    expect(perm.map((e) => e.effectId)).toEqual(["p"]);
    expect(opt.map((e) => e.effectId)).toEqual(["o"]);
  });

  it("matches ability/specialty scope like the optional path (disabled+suppressed excluded)", () => {
    const fighting = ability("Fighting", 3, { s1: { name: "Axes", rating: 2 } });
    const effects = [
      fakeEffect({
        id: "ab",
        optional: false,
        changes: [{ key: "cs.testdice.ability.fighting", value: "1" }],
      }),
      fakeEffect({
        id: "off",
        optional: false,
        changes: [{ key: "cs.result.ability.awareness", value: "1" }],
      }),
      fakeEffect({
        id: "dis",
        optional: false,
        disabled: true,
        changes: [{ key: "cs.result.all", value: "1" }],
      }),
    ];
    const result = collectPermanentRollEffects(
      fakeActor(effects, [fighting]),
      "Fighting",
      "Axes"
    );
    expect(result.map((e) => e.effectId)).toEqual(["ab"]); // only the Fighting-scoped, enabled one
  });
});
