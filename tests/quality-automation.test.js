import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  effectiveWeaponQualityRefs,
  weaponArmorBypassTotal,
  productOfRangeMultipliers,
} from "../module/effects/cs-effect-modifiers.js";
import { SEED_BY_SLUG } from "../module/data/quality-seeds.js";

// spec 021 (US1) — the pure roll-time attack helpers: per-quality armour-bypass
// decay (D1), the conferral resolver + dedup (D4), and the Inaccurate distance
// multiplier (D5). All resolve their quality definitions via `qualityBySlug`, so a
// hand-authored `game.items` set drives them deterministically.

const weapon = (refs) => ({ system: { qualities: refs } });

let savedGame;
beforeAll(() => {
  savedGame = globalThis.game;
  globalThis.game = {
    items: [
      {
        type: "quality",
        name: "Penetration",
        system: {
          slug: "penetration",
          range: 10, // decay increment
          rules: [{ lever: "armorbypass", value: "@param", scope: "auto" }],
        },
      },
      {
        type: "quality",
        name: "Piercing",
        system: {
          slug: "piercing",
          range: 0, // flat (no decay)
          rules: [{ lever: "armorbypass", value: "@param", scope: "auto" }],
        },
      },
      {
        type: "quality",
        name: "Longarm",
        system: {
          slug: "longarm",
          confers: ["long_range", "slow", "two_handed"],
          rules: [],
        },
      },
      { type: "quality", name: "Long Range", system: { slug: "long_range", range: 100, rules: [] } },
      { type: "quality", name: "Two-Handed", system: { slug: "two_handed", rules: [] } },
      { type: "quality", name: "Slow", system: { slug: "slow", rules: [] } },
      {
        type: "quality",
        name: "Inaccurate",
        system: {
          slug: "inaccurate",
          rules: [{ lever: "rangemultiplier", value: "2", scope: "auto" }],
        },
      },
    ],
  };
});
afterAll(() => {
  globalThis.game = savedGame;
});

describe("weaponArmorBypassTotal — per-quality range decay (D1/FR-001)", () => {
  it("Penetration (range 10) decays 1 per full increment: max(0, N − floor(dist/inc))", () => {
    const w = weapon([{ slug: "penetration", parameter: "3" }]);
    expect(weaponArmorBypassTotal(w, 0)).toBe(3); // floor(0/10)=0
    expect(weaponArmorBypassTotal(w, 9)).toBe(3); // floor(9/10)=0
    expect(weaponArmorBypassTotal(w, 25)).toBe(1); // 3 − floor(25/10)=3−2
    expect(weaponArmorBypassTotal(w, 35)).toBe(0); // 3 − 3
    expect(weaponArmorBypassTotal(w, 100)).toBe(0); // floored at 0, never negative
  });

  it("no measurable distance (dist == null) → full value (US1.6 fallback)", () => {
    const w = weapon([{ slug: "penetration", parameter: "3" }]);
    expect(weaponArmorBypassTotal(w, null)).toBe(3);
  });

  it("Piercing (range 0) is flat at any distance", () => {
    const p = weapon([{ slug: "piercing", parameter: "2" }]);
    expect(weaponArmorBypassTotal(p, 0)).toBe(2);
    expect(weaponArmorBypassTotal(p, 999)).toBe(2);
    expect(weaponArmorBypassTotal(p, null)).toBe(2);
  });

  it("sums across several bypass qualities (Penetration decayed + Piercing flat)", () => {
    const both = weapon([
      { slug: "penetration", parameter: "3" },
      { slug: "piercing", parameter: "2" },
    ]);
    expect(weaponArmorBypassTotal(both, 25)).toBe(1 + 2);
  });

  it("no bypass quality → 0", () => {
    expect(weaponArmorBypassTotal(weapon([{ slug: "slow" }]), 0)).toBe(0);
    expect(weaponArmorBypassTotal(weapon([]), 0)).toBe(0);
  });
});

describe("effectiveWeaponQualityRefs — conferral + dedupe (D4/FR-005)", () => {
  it("expands a conferring quality into its component slugs", () => {
    const refs = effectiveWeaponQualityRefs(weapon([{ slug: "longarm" }]));
    expect(refs.map((r) => r.slug).sort()).toEqual(
      ["long_range", "longarm", "slow", "two_handed"].sort()
    );
  });

  it("a component present directly counts once, keeping its own parameter", () => {
    const refs = effectiveWeaponQualityRefs(
      weapon([{ slug: "longarm" }, { slug: "two_handed", parameter: "X" }])
    );
    const th = refs.filter((r) => r.slug === "two_handed");
    expect(th).toHaveLength(1);
    expect(th[0].parameter).toBe("X"); // the direct reference wins (D4)
  });

  it("a weapon with no conferring quality is unchanged", () => {
    const refs = effectiveWeaponQualityRefs(
      weapon([{ slug: "piercing", parameter: "2" }])
    );
    expect(refs).toEqual([{ slug: "piercing", parameter: "2" }]);
  });

  it("skips a blank slug; an unknown slug confers nothing (never throws)", () => {
    expect(effectiveWeaponQualityRefs(weapon([{ slug: "" }]))).toEqual([]);
    expect(
      effectiveWeaponQualityRefs(weapon([{ slug: "homebrew_x" }])).map(
        (r) => r.slug
      )
    ).toEqual(["homebrew_x"]);
  });
});

describe("productOfRangeMultipliers — Inaccurate ×2 (D5/FR-002)", () => {
  it("Inaccurate contributes ×2", () => {
    expect(productOfRangeMultipliers(weapon([{ slug: "inaccurate" }]))).toBe(2);
  });

  it("defaults to 1 with no multiplier quality", () => {
    expect(productOfRangeMultipliers(weapon([]))).toBe(1);
    expect(
      productOfRangeMultipliers(weapon([{ slug: "piercing", parameter: "2" }]))
    ).toBe(1);
  });
});

describe("seed integrity — grades (US6) + conditions (US3) + auto levers", () => {
  const autoRule = (seed, lever) =>
    seed.rules.find((r) => r.lever === lever && r.scope === "auto");

  it("weapon grades carry the right auto levers (FR-015)", () => {
    expect(autoRule(SEED_BY_SLUG.poor, "penalty")?.value).toBe("1");
    expect(autoRule(SEED_BY_SLUG.superior, "result")?.value).toBe("1");
    expect(autoRule(SEED_BY_SLUG.extraordinary, "result")?.value).toBe("1");
    expect(autoRule(SEED_BY_SLUG.extraordinary, "damage")?.value).toBe("1");
    for (const slug of ["poor", "superior", "extraordinary"]) {
      expect(SEED_BY_SLUG[slug].applicability).toBe("weapon");
    }
  });

  it("Penetration/Penetrating armour-bypass shape (D1/D3)", () => {
    expect(SEED_BY_SLUG.penetration.range).toBe(10); // decay increment
    expect(autoRule(SEED_BY_SLUG.penetration, "armorbypass")?.value).toBe(
      "@param"
    );
    expect(autoRule(SEED_BY_SLUG.penetrating, "armorbypass")?.value).toBe(
      "@param"
    );
  });

  it("Reach is a distance-gated penalty; Inaccurate a rangemultiplier (D5/D6)", () => {
    const reach = autoRule(SEED_BY_SLUG.reach, "penalty");
    expect(reach?.value).toBe("1");
    expect(reach?.maxDistance).toBe(1);
    expect(autoRule(SEED_BY_SLUG.inaccurate, "rangemultiplier")?.value).toBe(
      "2"
    );
  });

  it("Longarm confers its component slugs (D4)", () => {
    expect(SEED_BY_SLUG.longarm.confers).toEqual([
      "long_range",
      "slow",
      "two_handed",
      "unwieldy",
    ]);
  });

  it("condition qualities carry a target rule + a matching authored effect (D19/D22)", () => {
    const cases = {
      grab: "Grabbed",
      entangling: "Entangled",
      impale: "Impaled",
      staggering: "Staggered",
      shattering: "Shattered",
    };
    for (const [slug, effectName] of Object.entries(cases)) {
      const seed = SEED_BY_SLUG[slug];
      // spec 021 UI redesign — a condition rule is keyed by the `applycondition`
      // lever (was `scope:"target"`), and its scope is now `auto`.
      const rule = seed.rules.find((r) => r.lever === "applycondition");
      expect(rule, `${slug} condition rule`).toBeTruthy();
      expect(rule.scope).toBe("auto");
      expect(rule.effectRef).toBe(effectName);
      const effect = seed.effects?.find((e) => e.name === effectName);
      expect(effect, `${slug} authored effect`).toBeTruthy();
      expect(effect.transfer).toBe(false); // never the wielder (D17)
      expect(effect.flags.chroniclesystem.conditionOrigin).toBe(slug); // refresh key (D18)
    }
  });

  it("degree/count triggers on the right qualities (D13/D15)", () => {
    expect(SEED_BY_SLUG.impale.rules[0].trigger).toEqual({
      kind: "degrees",
      threshold: 3,
    });
    expect(SEED_BY_SLUG.shattering.rules[0].trigger.threshold).toBe(2);
    expect(SEED_BY_SLUG.staggering.rules[0].trigger.threshold).toBe(2);
    expect(SEED_BY_SLUG.fragile.rules[0].trigger).toEqual({
      kind: "degrees",
      threshold: 2,
    });
    expect(SEED_BY_SLUG.treacherous.rules[0].trigger).toEqual({
      kind: "ones",
      threshold: null,
    });
  });
});
