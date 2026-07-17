import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  resolveRuleValue,
  dedupeQualitiesBySlug,
  collectEffectModifiers,
  weaponRangeBand,
  weaponReminders,
} from "../module/effects/cs-effect-modifiers.js";

// spec 020 (US3) — the referenced-quality collector: value resolution (fixed /
// @param bind / blank→0), dedupe-by-slug (FR-028), and routing a passive rule into
// the derived-stat buffer only while the item is equipped (SC-003).

describe("resolveRuleValue — fixed / @param bind (contract C6)", () => {
  it("parses a fixed number (with or without sign)", () => {
    expect(resolveRuleValue("+1", "")).toBe(1);
    expect(resolveRuleValue("-2", "")).toBe(-2);
    expect(resolveRuleValue("3", "")).toBe(3);
  });

  it("binds @param to the reference's per-instance parameter", () => {
    expect(resolveRuleValue("@param", "2")).toBe(2);
    expect(resolveRuleValue("-@param", "2")).toBe(-2);
  });

  it("resolves a blank / absent / unparseable value to 0 (never NaN)", () => {
    expect(resolveRuleValue("", "2")).toBe(0);
    expect(resolveRuleValue("@param", "")).toBe(0); // blank param → 0
    expect(resolveRuleValue("@param", "abc")).toBe(0);
    expect(resolveRuleValue("nonsense", "2")).toBe(0);
    expect(Number.isNaN(resolveRuleValue("@param", undefined))).toBe(false);
  });
});

describe("dedupeQualitiesBySlug — union by slug (FR-028 / C7)", () => {
  it("a quality present as BOTH a reference and a grant appears once", () => {
    const out = dedupeQualitiesBySlug(
      [{ slug: "piercing", parameter: "2" }],
      [{ name: "Piercing", parameter: "1" }]
    );
    expect(out).toHaveLength(1);
    expect(out[0].slug).toBe("piercing");
    expect(out[0].parameter).toBe("2"); // the reference wins (its per-instance param)
  });

  it("keeps distinct slugs and stamps a grant-only slug", () => {
    const out = dedupeQualitiesBySlug(
      [{ slug: "bulk", parameter: "3" }],
      [{ name: "Vicious", parameter: "" }]
    );
    expect(out.map((q) => q.slug).sort()).toEqual(["bulk", "vicious"]);
  });

  it("drops blank/duplicate slugs", () => {
    const out = dedupeQualitiesBySlug(
      [{ slug: "" }, { slug: "bulk" }, { slug: "bulk" }],
      []
    );
    expect(out).toEqual([{ slug: "bulk" }]);
  });
});

describe("collectReferencedQualities — equipped-gating + Defensive routing (SC-003)", () => {
  beforeAll(() => {
    globalThis.game = globalThis.game ?? {};
    globalThis.game.items = [
      {
        type: "quality",
        name: "Defensive",
        system: {
          slug: "defensive",
          parameter: { kind: "number" },
          rules: [
            { lever: "defensewhilewielded", value: "@param", scope: "passive" },
          ],
        },
      },
      {
        type: "quality",
        name: "Piercing",
        system: {
          slug: "piercing",
          parameter: { kind: "number" },
          // attack-scoped: NOT routed into the passive buffers (applied at roll time)
          rules: [{ lever: "armorbypass", value: "@param", scope: "auto" }],
        },
      },
      {
        type: "quality",
        name: "Proofed",
        system: {
          slug: "proofed",
          parameter: { kind: "none" },
          rules: [{ lever: "bulk", value: "+1", scope: "passive" }],
        },
      },
    ];
  });
  afterAll(() => {
    globalThis.game.items = [];
  });

  const actorWith = (equipped, slug, parameter) => ({
    appliedEffects: [],
    items: [
      {
        type: "weapon",
        _id: "w1",
        system: { equipped, qualities: [{ slug, parameter }] },
      },
    ],
    getCSData: () => ({}),
  });

  it("routes an equipped Defensive weapon's @param into combat_defense", () => {
    const { derivedStats } = collectEffectModifiers(actorWith(1, "defensive", "2"));
    expect(derivedStats.combat_defense.reduce((s, e) => s + e.mod, 0)).toBe(2);
  });

  it("contributes ZERO once the weapon is unequipped (SC-003)", () => {
    const { derivedStats } = collectEffectModifiers(actorWith(0, "defensive", "2"));
    expect(derivedStats.combat_defense ?? []).toEqual([]);
  });

  it("does NOT buffer an attack-scoped lever (armorbypass) — it applies at roll time", () => {
    const buffers = collectEffectModifiers(actorWith(1, "piercing", "2"));
    expect(buffers.derivedStats.combat_defense ?? []).toEqual([]);
    expect(buffers.modifiers.damage_taken ?? []).toEqual([]);
  });

  it("routes an equipped armour's Proofed bulk rule into the BULK modifier (US6/SC-003)", () => {
    const armour = {
      appliedEffects: [],
      items: [
        {
          type: "armor",
          _id: "a1",
          system: { equipped: 1, qualities: [{ slug: "proofed", parameter: "" }] },
        },
      ],
      getCSData: () => ({}),
    };
    const { modifiers } = collectEffectModifiers(armour);
    expect((modifiers.bulk ?? []).reduce((s, e) => s + e.mod, 0)).toBe(1);
    // Removed/unworn armour contributes nothing.
    armour.items[0].system.equipped = 0;
    expect(collectEffectModifiers(armour).modifiers.bulk ?? []).toEqual([]);
  });
});

describe("weaponRangeBand — data-driven range from the quality's `range` field", () => {
  beforeAll(() => {
    globalThis.game = globalThis.game ?? {};
    globalThis.game.items = [
      { type: "quality", name: "Close Range", system: { slug: "close_range", range: 10, rules: [] } },
      { type: "quality", name: "Long Range", system: { slug: "long_range", range: 100, rules: [] } },
      { type: "quality", name: "Piercing", system: { slug: "piercing", range: 0, rules: [] } },
    ];
  });
  afterAll(() => {
    globalThis.game.items = [];
  });

  const weapon = (slugs) => ({
    system: { qualities: slugs.map((slug) => ({ slug, parameter: "" })) },
  });

  it("resolves a single ranged quality to its {free, inc} band", () => {
    expect(weaponRangeBand(weapon(["close_range"]))).toEqual({ free: 10, inc: 10 });
    expect(weaponRangeBand(weapon(["long_range"]))).toEqual({ free: 100, inc: 100 });
  });

  it("the WIDEST range wins when several are referenced", () => {
    expect(weaponRangeBand(weapon(["close_range", "long_range"]))).toEqual({
      free: 100,
      inc: 100,
    });
  });

  it("a melee / non-ranged quality (range 0) → null", () => {
    expect(weaponRangeBand(weapon(["piercing"]))).toBeNull();
    expect(weaponRangeBand(weapon([]))).toBeNull();
  });

  it("an unresolved slug (no world definition) contributes no range", () => {
    expect(weaponRangeBand(weapon(["homebrew_missing"]))).toBeNull();
  });
});

describe("weaponReminders — every quality as a roll-card note (FR-018, revised)", () => {
  // Force the seed-catalog fallback (empty world) so a built-in quality resolves to
  // its name + description without a materialised world copy.
  let savedGame;
  beforeAll(() => {
    savedGame = globalThis.game;
    globalThis.game = { items: [] };
  });
  afterAll(() => {
    globalThis.game = savedGame;
  });

  const weapon = (refs) => ({ system: { qualities: refs } });

  it("lists ALL referenced qualities as {name, parameter, description} (seed fallback)", () => {
    expect(
      weaponReminders(
        weapon([
          { slug: "vicious", parameter: "" },
          { slug: "piercing", parameter: "2" },
        ])
      )
    ).toEqual([
      {
        name: "Vicious",
        parameter: "",
        description:
          "If you defeat a foe with a Vicious weapon, the consequence of defeat is death (a Destiny Point may avoid this fate).",
      },
      {
        name: "Piercing",
        parameter: "2",
        description:
          "On a hit, your damage ignores an amount of the target's Armor Rating equal to the listed value.",
      },
    ]);
  });

  it("keeps an unresolved slug visible via its stamped name, then its slug (never dropped)", () => {
    expect(
      weaponReminders(weapon([{ slug: "homebrew_x", name: "Homebrew X" }]))
    ).toEqual([{ name: "Homebrew X", parameter: "", description: "" }]);
    expect(weaponReminders(weapon([{ slug: "unknown_slug" }]))).toEqual([
      { name: "unknown_slug", parameter: "", description: "" },
    ]);
  });

  it("skips a blank reference and an item with no qualities", () => {
    expect(weaponReminders(weapon([{ slug: "" }]))).toEqual([]);
    expect(weaponReminders({ system: {} })).toEqual([]);
  });
});
