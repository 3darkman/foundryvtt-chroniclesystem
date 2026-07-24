// Spec 024 (D15) — the SHARED pure decision layer both the drop path and the
// migration's backfill consume. These assertions are the executable form of
// FR-019a ("copies carrying their description and their Active Effects, not bare
// placeholders") and of FR-027a's "identical field by field".

import { describe, it, expect } from "vitest";
import {
  selectMissingSpecialtySources,
  buildProvisionedSpecialtyData,
} from "../module/data/specialty-create-data.js";

/** A document-like specialty source (a pack document or a world Item). */
function makeSource({
  name,
  slug,
  abilitySlug = "fighting",
  rating = 0,
  modifier = 0,
  description = "",
  effects = [],
  _id = "abc123",
  img = "systems/chroniclesystem/assets/icons/specialty.png",
  flags = {},
}) {
  const data = {
    _id,
    name,
    type: "specialty",
    img,
    flags,
    effects,
    system: { slug, abilitySlug, rating, modifier, description, type: "" },
  };
  return {
    name,
    system: data.system,
    toObject: () => JSON.parse(JSON.stringify(data)),
  };
}

describe("selectMissingSpecialtySources", () => {
  it("returns everything when nothing is owned", () => {
    const sources = [
      makeSource({ name: "Axes", slug: "fighting_axes" }),
      makeSource({ name: "Spears", slug: "fighting_spears" }),
    ];
    expect(selectMissingSpecialtySources(sources, new Set())).toHaveLength(2);
  });

  it("drops sources whose slug is already owned, preserving order", () => {
    const sources = [
      makeSource({ name: "Axes", slug: "fighting_axes" }),
      makeSource({ name: "Spears", slug: "fighting_spears" }),
      makeSource({ name: "Shields", slug: "fighting_shields" }),
    ];
    const missing = selectMissingSpecialtySources(
      sources,
      new Set(["fighting_spears"])
    );
    expect(missing.map((s) => s.system.slug)).toEqual([
      "fighting_axes",
      "fighting_shields",
    ]);
  });

  it("de-dupes survivors by slug, first wins", () => {
    const sources = [
      makeSource({ name: "Axes", slug: "fighting_axes" }),
      makeSource({ name: "Hatchets", slug: "fighting_axes" }),
    ];
    const missing = selectMissingSpecialtySources(sources, new Set());
    expect(missing).toHaveLength(1);
    expect(missing[0].name).toBe("Axes");
  });

  it("accepts a plain iterable of owned slugs", () => {
    const sources = [makeSource({ name: "Axes", slug: "fighting_axes" })];
    expect(selectMissingSpecialtySources(sources, ["fighting_axes"])).toEqual(
      []
    );
  });

  it("derives the effective slug from the source's own abilitySlug", () => {
    const sources = [makeSource({ name: "Axes", slug: "" })];
    expect(selectMissingSpecialtySources(sources, ["fighting_axes"])).toEqual(
      []
    );
  });

  it("is empty-safe", () => {
    expect(selectMissingSpecialtySources(undefined, undefined)).toEqual([]);
  });
});

describe("buildProvisionedSpecialtyData", () => {
  it("strips the source's _id (a copy never inherits an id)", () => {
    const data = buildProvisionedSpecialtyData(
      makeSource({ name: "Axes", slug: "fighting_axes" }),
      "fighting"
    );
    expect("_id" in data).toBe(false);
    expect(data.type).toBe("specialty");
  });

  it("forces rating to 0 even when the source carries a value (FR-019)", () => {
    const data = buildProvisionedSpecialtyData(
      makeSource({ name: "Axes", slug: "fighting_axes", rating: 4 }),
      "fighting"
    );
    expect(data.system.rating).toBe(0);
  });

  it("stamps the abilitySlug over a wrong one on the source", () => {
    const data = buildProvisionedSpecialtyData(
      makeSource({
        name: "Axes",
        slug: "fighting_axes",
        abilitySlug: "persuasion",
      }),
      "fighting"
    );
    expect(data.system.abilitySlug).toBe("fighting");
  });

  it("preserves the description and the Active Effects verbatim (FR-019a)", () => {
    const effects = [
      {
        name: "Axe Mastery",
        system: { changes: [{ key: "cs.bonusdice.specialty.fighting_axes" }] },
      },
    ];
    const data = buildProvisionedSpecialtyData(
      makeSource({
        name: "Axes",
        slug: "fighting_axes",
        description: "<p>Hatchets and war axes.</p>",
        effects,
      }),
      "fighting"
    );
    expect(data.system.description).toBe("<p>Hatchets and war axes.</p>");
    expect(data.effects).toEqual(effects);
  });

  it("carries the img and the flags through", () => {
    const data = buildProvisionedSpecialtyData(
      makeSource({
        name: "Axes",
        slug: "fighting_axes",
        img: "icons/custom.png",
        flags: { chroniclesystem: { homebrew: true } },
      }),
      "fighting"
    );
    expect(data.img).toBe("icons/custom.png");
    expect(data.flags).toEqual({ chroniclesystem: { homebrew: true } });
  });

  it("keeps the source's slug when present", () => {
    const data = buildProvisionedSpecialtyData(
      makeSource({ name: "Hatchets", slug: "fighting_axes" }),
      "fighting"
    );
    expect(data.system.slug).toBe("fighting_axes");
  });

  it("derives a scoped slug when the source has none", () => {
    const data = buildProvisionedSpecialtyData(
      makeSource({ name: "War Axes", slug: "" }),
      "fighting"
    );
    expect(data.system.slug).toBe("fighting_war_axes");
  });

  it("preserves the modifier, coerced to an integer", () => {
    const data = buildProvisionedSpecialtyData(
      makeSource({ name: "Axes", slug: "fighting_axes", modifier: "2" }),
      "fighting"
    );
    expect(data.system.modifier).toBe(2);
  });

  it("tolerates a plain-object source with no toObject()", () => {
    const data = buildProvisionedSpecialtyData(
      {
        name: "Axes",
        system: { slug: "fighting_axes", abilitySlug: "fighting", rating: 3 },
      },
      "fighting"
    );
    expect(data.system.rating).toBe(0);
    expect(data.system.slug).toBe("fighting_axes");
  });

  it("does not mutate the source", () => {
    const source = makeSource({
      name: "Axes",
      slug: "fighting_axes",
      rating: 4,
    });
    buildProvisionedSpecialtyData(source, "persuasion");
    expect(source.system.rating).toBe(4);
    expect(source.system.abilitySlug).toBe("fighting");
  });
});
