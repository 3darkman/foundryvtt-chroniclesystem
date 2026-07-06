import { describe, it, expect } from "vitest";
import {
  applyModifiers,
  collectEffectModifiers,
} from "../module/effects/cs-effect-modifiers.js";
import { ACTIVE_EFFECT_MODES } from "../module/effects/cs-effect-compat.js";

const { ADD, MULTIPLY, OVERRIDE } = ACTIVE_EFFECT_MODES;

// Pure aggregation arithmetic + the collector's authored-effect routing (Wave 1:
// `result` → modifier buffer, `penalty` → penalty buffer; optional effects skipped).

describe("applyModifiers (pure aggregation)", () => {
  it("sums ADD modifiers", () => {
    expect(
      applyModifiers(2, [
        { value: 1, mode: ADD },
        { value: 1, mode: ADD },
      ])
    ).toBe(4);
  });
  it("applies MULTIPLY", () => {
    expect(applyModifiers(3, [{ value: 2, mode: MULTIPLY }])).toBe(6);
  });
  it("adds before multiplying", () => {
    expect(
      applyModifiers(2, [
        { value: 1, mode: ADD },
        { value: 2, mode: MULTIPLY },
      ])
    ).toBe(6);
  });
  it("lets OVERRIDE win", () => {
    expect(
      applyModifiers(5, [
        { value: 3, mode: ADD },
        { value: 9, mode: OVERRIDE },
      ])
    ).toBe(9);
  });
  it("returns the base for an empty list", () => {
    expect(applyModifiers(4, [])).toBe(4);
  });
  it("floors the result", () => {
    expect(applyModifiers(3, [{ value: 1.5, mode: MULTIPLY }])).toBe(4);
  });
});

// --- Collector fakes -------------------------------------------------------

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

const ability = (name) => ({ type: "ability", name, system: { rating: 3 } });
const fakeActor = (appliedEffects, items = []) => ({ appliedEffects, items });

describe("collectEffectModifiers (authored routing)", () => {
  it("routes a result/all change into the modifier buffer", () => {
    const { modifiers, penalties } = collectEffectModifiers(
      fakeActor([
        fakeEffect({
          id: "a",
          changes: [{ key: "cs.result.all", value: "5" }],
        }),
      ])
    );
    expect(modifiers.all).toEqual([{ _id: "a", mod: 5, isDocument: false }]);
    expect(penalties).toEqual({});
  });

  it("routes penalty/ability changes to the penalty buffer (frustration-like)", () => {
    const abilities = [ability("Deception"), ability("Persuasion")];
    const eff = fakeEffect({
      id: "fr",
      changes: [
        { key: "cs.penalty.ability.deception", value: "2" },
        { key: "cs.penalty.ability.persuasion", value: "2" },
      ],
    });
    const { penalties, modifiers } = collectEffectModifiers(
      fakeActor([eff], abilities)
    );
    expect(Object.keys(penalties).sort()).toEqual(["deception", "persuasion"]);
    expect(penalties.deception[0].mod).toBe(2);
    expect(modifiers).toEqual({});
  });

  it("buffers result on a specific ability and result on ALL", () => {
    const abilities = [ability("Awareness")];
    const effects = [
      fakeEffect({
        id: "x",
        changes: [{ key: "cs.result.ability.awareness", value: "1" }],
      }),
      fakeEffect({ id: "y", changes: [{ key: "cs.result.all", value: "2" }] }),
    ];
    const { modifiers } = collectEffectModifiers(fakeActor(effects, abilities));
    expect(modifiers.awareness[0].mod).toBe(1);
    expect(modifiers.all[0].mod).toBe(2);
  });

  it("resolves a derived value (@rank) from the actor's abilities", () => {
    const abilities = [ability("Fighting")]; // rating 3
    const eff = fakeEffect({
      id: "wd",
      changes: [
        { key: "cs.result.ability.awareness", value: "@rank:fighting" },
      ],
    });
    const abilitiesWithAwareness = [...abilities, ability("Awareness")];
    const { modifiers } = collectEffectModifiers(
      fakeActor([eff], abilitiesWithAwareness)
    );
    expect(modifiers.awareness[0].mod).toBe(3);
  });

  it("skips disabled, suppressed, optional, zero-value and non-collector changes", () => {
    const effects = [
      fakeEffect({
        id: "d",
        disabled: true,
        changes: [{ key: "cs.result.all", value: "5" }],
      }),
      fakeEffect({
        id: "s",
        isSuppressed: true,
        changes: [{ key: "cs.result.all", value: "5" }],
      }),
      fakeEffect({
        id: "o",
        optional: true,
        changes: [{ key: "cs.result.all", value: "5" }],
      }),
      fakeEffect({ id: "z", changes: [{ key: "cs.result.all", value: "0" }] }),
      fakeEffect({
        id: "n",
        changes: [{ key: "system.derivedStats.health.modifier", value: "5" }],
      }),
      fakeEffect({
        id: "c",
        changes: [{ key: "cs.derivedstat.health", value: "1" }],
      }), // non-roll channel, not yet wired
    ];
    const { modifiers, penalties, testDice } = collectEffectModifiers(
      fakeActor(effects)
    );
    expect(modifiers).toEqual({});
    expect(penalties).toEqual({});
    expect(testDice).toEqual({});
  });

  it("routes the test-dice, bonus-dice and reroll channels to their buffers", () => {
    const abilities = [ability("Marksmanship")];
    const effects = [
      fakeEffect({
        id: "td",
        changes: [{ key: "cs.testdice.ability.marksmanship", value: "1" }],
      }),
      fakeEffect({
        id: "bd",
        changes: [{ key: "cs.bonusdice.all", value: "2" }],
      }),
      fakeEffect({ id: "rr", changes: [{ key: "cs.reroll.all", value: "1" }] }),
    ];
    const { testDice, bonusDice, reRolls, modifiers } = collectEffectModifiers(
      fakeActor(effects, abilities)
    );
    expect(testDice.marksmanship[0].mod).toBe(1);
    expect(bonusDice.all[0].mod).toBe(2);
    expect(reRolls.all[0].mod).toBe(1);
    expect(modifiers).toEqual({});
  });

  it("routes a specialty target via the single specialty resolver", () => {
    const fighting = {
      type: "ability",
      name: "Fighting",
      system: { rating: 3, specialties: { s1: { name: "Axes", rating: 2 } } },
    };
    const eff = fakeEffect({
      id: "ax",
      changes: [{ key: "cs.result.specialty.axes", value: "1" }],
    });
    const { modifiers } = collectEffectModifiers(fakeActor([eff], [fighting]));
    expect(modifiers.axes[0].mod).toBe(1); // slug → specialty name → buffer key
  });

  it("keeps a negative penalty value (penalty reduction, e.g. Authority)", () => {
    const eff = fakeEffect({
      id: "au",
      changes: [{ key: "cs.penalty.ability.persuasion", value: "-2" }],
    });
    const { penalties } = collectEffectModifiers(
      fakeActor([eff], [ability("Persuasion")])
    );
    expect(penalties.persuasion[0].mod).toBe(-2);
  });
});

// Sources 2 (equipment) and 3 (conditions) must keep their legacy-parity output
// (research §D1; legacy csArmorItem/csWeaponItem). This pins them against
// regression as the redesign proceeds.
describe("collectEffectModifiers (equipment + conditions)", () => {
  const equippedActor = {
    appliedEffects: [],
    items: [
      {
        type: "armor",
        _id: "arm",
        system: { equipped: 1, penalty: -1, rating: 3, bulk: 2 },
      },
      {
        type: "weapon",
        _id: "wpn",
        system: { qualities: { q1: { name: "Bulk", parameter: "1" } } },
      },
    ],
    getCSData: () => ({
      derivedStats: { fatigue: { current: 1 }, frustration: { current: 2 } },
      currentStress: 0,
      wounds: ["w"],
      injuries: [],
    }),
  };

  it("applies armour penalty/rating/bulk and weapon bulk", () => {
    const { modifiers } = collectEffectModifiers(equippedActor);
    expect(modifiers.agility[0].mod).toBe(-1);
    expect(modifiers.combat_defense[0].mod).toBe(-1);
    expect(modifiers.damage_taken[0].mod).toBe(3);
    expect(modifiers.bulk.reduce((s, e) => s + e.mod, 0)).toBe(3); // armour 2 + weapon 1
  });

  it("applies the dynamic conditions with the D1 channel/sign map", () => {
    const { modifiers, penalties } = collectEffectModifiers(equippedActor);
    expect(modifiers.all[0].mod).toBe(-1); // fatigue 1 → ALL −1
    expect(penalties.all[0].mod).toBe(1); // wounds 1 → ALL +1
    expect(penalties.deception[0].mod).toBe(2); // frustration 2
    expect(penalties.persuasion[0].mod).toBe(2);
  });
});
