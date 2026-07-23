// Spec 024 — the PURE conversion planner (contract specialty-migration.md C2).
// The whole decision logic of the 0.17.0 task, driven without a Foundry runtime.

import { describe, it, expect } from "vitest";
import { planSpecialtyConversion } from "../module/migrations/task140-specialty-items.js";
import { buildProvisionedSpecialtyData } from "../module/data/specialty-create-data.js";

const fighting = (specialties) => ({
  name: "Fighting",
  slug: "fighting",
  specialties,
});

/** A catalogue source, as `specialtySourcesForAbility` yields it. */
function source({
  name,
  slug,
  description = "",
  effects = [],
  modifier = 0,
  abilitySlug = "fighting",
}) {
  const data = {
    _id: "pack123",
    name,
    type: "specialty",
    img: "systems/chroniclesystem/assets/icons/specialty.png",
    flags: {},
    effects,
    system: { slug, abilitySlug, rating: 0, modifier, description, type: "" },
  };
  return {
    name,
    system: data.system,
    toObject: () => JSON.parse(JSON.stringify(data)),
  };
}

describe("planSpecialtyConversion — convert (C2.1)", () => {
  it("converts each legacy row, preserving name, slug, rating and modifier", () => {
    const plan = planSpecialtyConversion(
      fighting([
        { name: "Axes", slug: "fighting_axes", rating: 3, modifier: 1 },
      ]),
      new Set()
    );
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0]).toEqual({
      name: "Axes",
      type: "specialty",
      img: "systems/chroniclesystem/assets/icons/specialty.png",
      system: {
        slug: "fighting_axes",
        description: "",
        type: "",
        abilitySlug: "fighting",
        rating: 3,
        modifier: 1,
      },
    });
  });

  it("derives the scoped slug for a legacy row that has none", () => {
    const plan = planSpecialtyConversion(
      fighting([{ name: "Long Blades", rating: 2 }]),
      new Set()
    );
    expect(plan.create[0].system.slug).toBe("fighting_long_blades");
  });

  it("clamps a negative or dirty legacy rating (FR-013)", () => {
    const plan = planSpecialtyConversion(
      fighting([
        { name: "Axes", rating: -2 },
        { name: "Spears", rating: "abc" },
      ]),
      new Set()
    );
    expect(plan.create.map((r) => r.system.rating)).toEqual([0, 0]);
  });

  it("tolerates the historical object-map shape (C2.7)", () => {
    const plan = planSpecialtyConversion(
      fighting({ a: { name: "Axes", rating: 3 } }),
      new Set()
    );
    expect(plan.create[0].name).toBe("Axes");
  });

  it("stamps abilitySlug from the ability's NAME when it carries no slug", () => {
    const plan = planSpecialtyConversion(
      { name: "Animal Handling", specialties: [{ name: "Charm", rating: 1 }] },
      new Set()
    );
    expect(plan.create[0].system.abilitySlug).toBe("animal_handling");
    expect(plan.create[0].system.slug).toBe("animal_handling_charm");
  });
});

describe("planSpecialtyConversion — idempotence and skips", () => {
  it("skips a slug already present and leaves its value alone (C2.3)", () => {
    const plan = planSpecialtyConversion(
      fighting([{ name: "Axes", slug: "fighting_axes", rating: 3 }]),
      new Set(["fighting_axes"])
    );
    expect(plan.create).toEqual([]);
  });

  it("a second run over the result of the first creates nothing (SC-008)", () => {
    const first = planSpecialtyConversion(
      fighting([{ name: "Axes", rating: 3 }]),
      new Set(),
      [source({ name: "Spears", slug: "fighting_spears" })]
    );
    const owned = new Set(first.create.map((r) => r.system.slug));
    const second = planSpecialtyConversion(
      fighting([{ name: "Axes", rating: 3 }]),
      owned,
      [source({ name: "Spears", slug: "fighting_spears" })]
    );
    expect(second.create).toEqual([]);
  });

  it("keeps the FIRST of two duplicate legacy rows and skips the rest (C2.4)", () => {
    const plan = planSpecialtyConversion(
      fighting([
        { name: "Axes", rating: 3 },
        { name: "Axes", rating: 1 },
      ]),
      new Set()
    );
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0].system.rating).toBe(3);
    expect(plan.skipped).toEqual([
      { slug: "fighting_axes", name: "Axes", reason: "duplicate" },
    ]);
  });

  it("reports an uninterpretable row instead of dropping it silently (C2.5)", () => {
    const plan = planSpecialtyConversion(
      fighting([{ name: "", rating: 2 }, null, "garbage"]),
      new Set()
    );
    expect(plan.create).toEqual([]);
    expect(plan.skipped.map((s) => s.reason)).toEqual([
      "unreadable",
      "unreadable",
      "unreadable",
    ]);
  });

  it("emits no delete branch of any kind (C2.6)", () => {
    const plan = planSpecialtyConversion(
      fighting([{ name: "Axes", rating: 3 }]),
      new Set()
    );
    expect(Object.keys(plan).sort()).toEqual(["create", "skipped"]);
  });

  it("does not mutate the caller's existingSlugs set", () => {
    const owned = new Set(["fighting_axes"]);
    planSpecialtyConversion(fighting([{ name: "Spears" }]), owned);
    expect([...owned]).toEqual(["fighting_axes"]);
  });
});

describe("planSpecialtyConversion — backfill (C2.2 / D15)", () => {
  it("backfills the catalogue entries the scope lacks, at rating 0", () => {
    const plan = planSpecialtyConversion(
      fighting([{ name: "Axes", rating: 3 }]),
      new Set(),
      [
        source({ name: "Axes", slug: "fighting_axes" }),
        source({ name: "Spears", slug: "fighting_spears" }),
      ]
    );
    expect(plan.create).toHaveLength(2);
    const axes = plan.create.find((r) => r.system.slug === "fighting_axes");
    const spears = plan.create.find((r) => r.system.slug === "fighting_spears");
    expect(axes.system.rating).toBe(3); // the converted value wins
    expect(spears.system.rating).toBe(0);
  });

  it("never backfills a slug already owned by the scope", () => {
    const plan = planSpecialtyConversion(fighting([]), new Set(["fighting_axes"]), [
      source({ name: "Axes", slug: "fighting_axes" }),
    ]);
    expect(plan.create).toEqual([]);
  });

  it("carries a homebrew source's description and Active Effects (FR-019a)", () => {
    const effects = [
      {
        name: "Whip Mastery",
        system: { changes: [{ key: "cs.bonusdice.specialty.fighting_whips" }] },
      },
    ];
    const plan = planSpecialtyConversion(fighting([]), new Set(), [
      source({
        name: "Whips",
        slug: "fighting_whips",
        description: "<p>Homebrew.</p>",
        effects,
      }),
    ]);
    expect(plan.create[0].system.description).toBe("<p>Homebrew.</p>");
    expect(plan.create[0].effects).toEqual(effects);
  });

  it("is deepEqual to buildProvisionedSpecialtyData — the D15 guarantee (C2.9)", () => {
    const homebrew = source({
      name: "Whips",
      slug: "fighting_whips",
      description: "<p>Homebrew.</p>",
      effects: [{ name: "Whip Mastery", system: { changes: [] } }],
      modifier: 2,
    });
    const plan = planSpecialtyConversion(fighting([]), new Set(), [homebrew]);
    expect(plan.create[0]).toEqual(
      buildProvisionedSpecialtyData(homebrew, "fighting")
    );
  });

  it("does nothing extra when the catalogue is empty (a homebrew ability)", () => {
    const plan = planSpecialtyConversion(
      { name: "Sorcery", slug: "sorcery", specialties: [] },
      new Set(),
      []
    );
    expect(plan.create).toEqual([]);
  });
});
