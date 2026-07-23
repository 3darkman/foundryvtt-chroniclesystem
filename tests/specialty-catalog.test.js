// Spec 024 — the seed builders (contract specialty-catalog.md C2) and the
// synchronous catalogue read side (C4). The 19/76 counts are asserted here so
// they can never silently drift from CANONICAL_ABILITIES (D1).

import { describe, it, expect, afterEach } from "vitest";
import {
  SEED_ABILITIES,
  SEED_SPECIALTIES,
  SEED_SPECIALTY_BY_SLUG,
  buildAbilitySeedItemData,
  buildSpecialtySeedItemData,
} from "../module/data/ability-specialty-seeds.js";
import { CANONICAL_ABILITIES } from "../module/vocabulary/cs-canonical-abilities.js";
import { specialtiesForAbility } from "../module/vocabulary/cs-specialty-catalog.js";

const originalGame = globalThis.game;

/** Swap `game.items` for the duration of one assertion. */
function withWorldItems(items, fn) {
  globalThis.game = { ...originalGame, items };
  try {
    return fn();
  } finally {
    globalThis.game = originalGame;
  }
}

function worldSpecialty(name, slug, abilitySlug) {
  return { type: "specialty", name, system: { slug, abilitySlug } };
}

afterEach(() => {
  globalThis.game = originalGame;
});

describe("seed counts (SC-005)", () => {
  it("ships exactly 19 abilities and 76 specialties", () => {
    expect(SEED_ABILITIES).toHaveLength(19);
    expect(SEED_SPECIALTIES).toHaveLength(76);
    expect(CANONICAL_ABILITIES).toHaveLength(19);
  });

  it("indexes every specialty seed by its scoped slug", () => {
    expect(Object.keys(SEED_SPECIALTY_BY_SLUG)).toHaveLength(76);
    expect(SEED_SPECIALTY_BY_SLUG.persuasion_convince.name).toBe("Convince");
  });
});

describe("seed shapes (C2.2–C2.5)", () => {
  it("builds an ability seed at the schema's own initial rating", () => {
    const fighting = CANONICAL_ABILITIES.find((a) => a.slug === "fighting");
    const data = buildAbilitySeedItemData(fighting);
    expect(data).toEqual({
      name: "Fighting",
      type: "ability",
      img: "systems/chroniclesystem/assets/icons/ability.png",
      system: {
        slug: "fighting",
        description: "",
        type: "",
        rating: 2,
        modifier: 0,
        specialties: [],
      },
    });
  });

  it("builds a specialty seed linked by the ability's slug, untrained", () => {
    const persuasion = CANONICAL_ABILITIES.find((a) => a.slug === "persuasion");
    const convince = persuasion.specialties.find((s) => s.name === "Convince");
    const data = buildSpecialtySeedItemData(persuasion, convince);
    expect(data).toEqual({
      name: "Convince",
      type: "specialty",
      img: "systems/chroniclesystem/assets/icons/specialty.png",
      system: {
        slug: "persuasion_convince",
        description: "",
        type: "",
        abilitySlug: "persuasion",
        rating: 0,
        modifier: 0,
      },
    });
  });

  it("scopes the two 'Charm' specialties apart", () => {
    const slugs = SEED_SPECIALTIES.filter((s) => s.name === "Charm").map(
      (s) => s.system.slug
    );
    expect(slugs.sort()).toEqual(["animal_handling_charm", "persuasion_charm"]);
  });

  it("is deterministic — two builds are equal", () => {
    const ability = CANONICAL_ABILITIES[0];
    expect(buildAbilitySeedItemData(ability)).toEqual(
      buildAbilitySeedItemData(ability)
    );
  });
});

describe("specialtiesForAbility (C4)", () => {
  it("yields the canonical entries alone with no `game` (C4.6)", () => {
    globalThis.game = undefined;
    const rows = specialtiesForAbility("fighting");
    expect(rows).toHaveLength(9);
    expect(rows[0]).toEqual({
      slug: "fighting_axes",
      name: "Axes",
      nameKey: "CS.specialties.fighting.axes",
    });
  });

  it("returns [] for an unknown ability with nothing pointing at it", () => {
    expect(specialtiesForAbility("homebrew_ability")).toEqual([]);
    expect(specialtiesForAbility("")).toEqual([]);
  });

  it("unions the world's own specialties with the canonical set", () => {
    const items = [
      worldSpecialty("Whips", "fighting_whips", "fighting"),
      worldSpecialty("Run", "athletics_run", "athletics"),
    ];
    withWorldItems(items, () => {
      const rows = specialtiesForAbility("fighting");
      expect(rows).toHaveLength(10);
      expect(rows.find((r) => r.slug === "fighting_whips")).toEqual({
        slug: "fighting_whips",
        name: "Whips",
        nameKey: null,
      });
    });
  });

  it("lets the WORLD entry win on a slug collision (C4.2)", () => {
    const items = [worldSpecialty("Hatchets", "fighting_axes", "fighting")];
    withWorldItems(items, () => {
      const axes = specialtiesForAbility("fighting").find(
        (r) => r.slug === "fighting_axes"
      );
      expect(axes).toEqual({
        slug: "fighting_axes",
        name: "Hatchets",
        nameKey: null,
      });
    });
  });

  it("drops blank slugs and a slug equal to the bare ability slug (C4.4)", () => {
    const items = [
      worldSpecialty("", "", "fighting"),
      worldSpecialty("", "fighting", "fighting"),
    ];
    withWorldItems(items, () => {
      const rows = specialtiesForAbility("fighting");
      expect(rows).toHaveLength(9);
      expect(rows.some((r) => !r.slug || r.slug === "fighting")).toBe(false);
    });
  });

  it("ignores specialties linked to another ability", () => {
    const items = [worldSpecialty("Charm", "persuasion_charm", "persuasion")];
    withWorldItems(items, () => {
      expect(specialtiesForAbility("fighting")).toHaveLength(9);
    });
  });
});
