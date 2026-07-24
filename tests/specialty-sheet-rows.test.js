// Spec 024 (US2/US5) — the Abilities tab's row assembly and its ONE visibility
// predicate (contract abilities-tab-modes.md C2/C3, D16). The rows are plain
// objects, so this is pure logic driven by the production builder itself.

import { describe, it, expect } from "vitest";
import {
  buildSpecialtyRows,
  specialtyRelevant,
  specialtyVisible,
} from "../module/actors/sheets/csCharacterActorSheet.js";
import { hasSpecialtyEffect } from "../module/effects/cs-effect-modifiers.js";
import { clampRating } from "../module/data/item/specialty-data.js";
import {
  makeFakeActor,
  makeAbilityItem,
  makeSpecialtyItem,
} from "./helpers/doubles.js";

const fighting = () => makeAbilityItem("Fighting", 3, { slug: "fighting" });

/** An effect targeting one specialty slug, as `appliedEffects` yields it. */
const effectOn = (slug) => ({
  id: "eff",
  name: "Blessing",
  system: { changes: [{ key: `cs.bonusdice.specialty.${slug}`, value: "1" }] },
  getFlag: () => false,
});

function rowsFor({ specialties = [], effects = [] } = {}) {
  const ability = fighting();
  const actor = makeFakeActor({ abilities: [ability], specialties });
  actor.appliedEffects = effects;
  // The buffer accessors the chip/passive path reaches through; neutral here.
  for (const getter of [
    "getTestDice",
    "getBonusDice",
    "getReRoll",
    "getPassive",
  ]) {
    actor[getter] = () => ({ total: 0, detail: [] });
  }
  return buildSpecialtyRows(
    actor,
    ability,
    "fighting",
    specialties,
    hasSpecialtyEffect
  );
}

describe("row membership (C2.1/C2.2)", () => {
  it("builds one row per owned specialty of that ability", () => {
    const rows = rowsFor({
      specialties: [
        makeSpecialtyItem({ name: "Axes", abilitySlug: "fighting", rating: 2 }),
        makeSpecialtyItem({ name: "Spears", abilitySlug: "fighting" }),
      ],
    });
    expect(rows.map((r) => r.name)).toEqual(["Axes", "Spears"]);
    expect(rows[0].slug).toBe("fighting_axes");
  });

  it("produces NO row for a specialty of another ability (an orphan)", () => {
    const rows = rowsFor({
      specialties: [
        makeSpecialtyItem({ name: "Charm", abilitySlug: "persuasion" }),
      ],
    });
    expect(rows).toEqual([]);
  });

  it("orders alphabetically within the ability (C2.5)", () => {
    const rows = rowsFor({
      specialties: ["Spears", "Axes", "Brawling"].map((name) =>
        makeSpecialtyItem({ name, abilitySlug: "fighting", rating: 1 })
      ),
    });
    expect(rows.map((r) => r.name)).toEqual(["Axes", "Brawling", "Spears"]);
  });
});

describe("the ONE predicate (C3 / D16)", () => {
  it("relevant = ranked OR effect-targeted", () => {
    expect(specialtyRelevant({ rating: 2, hasEffect: false })).toBe(true);
    expect(specialtyRelevant({ rating: 0, hasEffect: true })).toBe(true);
    expect(specialtyRelevant({ rating: 0, hasEffect: false })).toBe(false);
  });

  it("visible = edit mode OR relevant", () => {
    const dormant = { rating: 0, hasEffect: false };
    expect(specialtyVisible(dormant, true)).toBe(true);
    expect(specialtyVisible(dormant, false)).toBe(false);
    expect(specialtyVisible({ rating: 1, hasEffect: false }, false)).toBe(true);
  });

  it("SC-006 — read mode renders ZERO rows at rating 0 with no effect", () => {
    const rows = rowsFor({
      specialties: [
        makeSpecialtyItem({ name: "Axes", abilitySlug: "fighting", rating: 0 }),
        makeSpecialtyItem({ name: "Spears", abilitySlug: "fighting" }),
      ],
    });
    expect(rows.filter((r) => specialtyVisible(r, false))).toHaveLength(0);
    expect(rows.filter((r) => specialtyVisible(r, true))).toHaveLength(2);
  });
});

describe("chip and passive ride the SAME condition (C2.4)", () => {
  it("a ranked specialty carries both", () => {
    const [row] = rowsFor({
      specialties: [
        makeSpecialtyItem({ name: "Axes", abilitySlug: "fighting", rating: 2 }),
      ],
    });
    expect(row.chip).not.toBeNull();
    expect(row.passive).not.toBeNull();
  });

  it("a dormant specialty carries NEITHER — strictly less work, not more", () => {
    const [row] = rowsFor({
      specialties: [
        makeSpecialtyItem({ name: "Axes", abilitySlug: "fighting", rating: 0 }),
      ],
    });
    expect(row.relevant).toBe(false);
    expect(row.chip).toBeNull();
    expect(row.passive).toBeNull();
  });

  it("the chip id string is byte-identical to the legacy format (FR-018)", () => {
    const [row] = rowsFor({
      specialties: [
        makeSpecialtyItem({ name: "Axes", abilitySlug: "fighting", rating: 2 }),
      ],
    });
    expect(row.chip.id).toBe("specialty:Axes:Fighting");
  });
});

describe("US5 — an effect keeps a rating-0 specialty alive (FR-009a)", () => {
  it("makes it visible in read mode AND gives it a chip and a passive", () => {
    const [row] = rowsFor({
      specialties: [
        makeSpecialtyItem({ name: "Axes", abilitySlug: "fighting", rating: 0 }),
      ],
      effects: [effectOn("fighting_axes")],
    });
    expect(row.hasEffect).toBe(true);
    expect(specialtyVisible(row, false)).toBe(true);
    expect(row.chip).not.toBeNull();
    expect(row.passive).not.toBeNull();
  });

  it("but in EDIT mode it still shows the 'available' state (FR-014)", () => {
    const [row] = rowsFor({
      specialties: [
        makeSpecialtyItem({ name: "Axes", abilitySlug: "fighting", rating: 0 }),
      ],
      effects: [effectOn("fighting_axes")],
    });
    // `active` — not `relevant` — is what the edit-mode pill keys on.
    expect(row.active).toBe(false);
  });

  it("an effect on ANOTHER specialty does not light this one up", () => {
    const [row] = rowsFor({
      specialties: [
        makeSpecialtyItem({ name: "Axes", abilitySlug: "fighting", rating: 0 }),
      ],
      effects: [effectOn("fighting_spears")],
    });
    expect(row.hasEffect).toBe(false);
    expect(specialtyVisible(row, false)).toBe(false);
  });

  it("the global ALL bucket does NOT count (C7.5 / SC-006)", () => {
    const [row] = rowsFor({
      specialties: [
        makeSpecialtyItem({ name: "Axes", abilitySlug: "fighting", rating: 0 }),
      ],
      effects: [
        {
          id: "all",
          name: "Blessed",
          system: { changes: [{ key: "cs.bonusdice.all", value: "1" }] },
          getFlag: () => false,
        },
      ],
    });
    expect(row.hasEffect).toBe(false);
  });
});

describe("hasSpecialtyEffect (C7)", () => {
  const actorWith = (effects) => ({ appliedEffects: effects });

  it("never throws on a malformed key (C7.7)", () => {
    const actor = actorWith([
      { system: { changes: [{ key: "not.a.cs.key" }, { key: null }] } },
      { system: {} },
      null,
    ]);
    expect(hasSpecialtyEffect(actor, "fighting_axes")).toBe(false);
  });

  it("is false without an actor or without a slug", () => {
    expect(hasSpecialtyEffect(null, "fighting_axes")).toBe(false);
    expect(hasSpecialtyEffect(actorWith([]), "")).toBe(false);
  });

  it("counts an OPTIONAL effect too (C7.6)", () => {
    const optional = {
      system: {
        changes: [{ key: "cs.bonusdice.specialty.fighting_axes", value: "1" }],
      },
      getFlag: (scope, key) =>
        scope === "chroniclesystem" && key === "optional" ? true : undefined,
    };
    expect(hasSpecialtyEffect(actorWith([optional]), "fighting_axes")).toBe(
      true
    );
  });
});

describe("the inline handler's clamp (FR-013)", () => {
  it("floors a negative and coerces garbage to 0", () => {
    expect(clampRating("-2")).toBe(0);
    expect(clampRating("abc")).toBe(0);
    expect(clampRating("3")).toBe(3);
  });
});
