import { describe, it, expect } from "vitest";
import CharacterData from "../module/data/actor/character-data.js";
import HouseData from "../module/data/actor/house-data.js";
import UnitData from "../module/data/actor/unit-data.js";
import { deriveWorldSlugs } from "../module/migrations/task090-slug-identity.js";
import { CANONICAL_ABILITIES } from "../module/vocabulary/cs-canonical-abilities.js";
import {
  makeLegacyCharacter,
  makeValidCharacter,
  makeLegacyHouse,
  makeValidHouse,
  makeLegacyUnit,
  makeValidUnit,
} from "./helpers/fixtures.js";

// Group 2 — US2 / Contract 2.1-2.18. Protects the highest-risk asset (saved
// worlds) by characterizing migrateData against legacy null/NaN/string/old-shape
// data: correct coercion (FR-006), a defined return (FR-007), idempotency (FR-008).

describe("CharacterData.migrateData — ancestries", () => {
  it("2.1 joins a legacy string array into a comma list", () => {
    expect(CharacterData.migrateData({ ancestries: ["Andal", "First Men"] }).ancestries).toBe(
      "Andal, First Men"
    );
  });

  it("2.2 yields '' for empty / non-string arrays", () => {
    expect(CharacterData.migrateData({ ancestries: [] }).ancestries).toBe("");
    expect(CharacterData.migrateData({ ancestries: [{}] }).ancestries).toBe("");
  });

  it("2.3 leaves an already-string value unchanged (idempotent)", () => {
    expect(CharacterData.migrateData({ ancestries: "Andal, First Men" }).ancestries).toBe(
      "Andal, First Men"
    );
  });
});

describe("CharacterData.migrateData — injuries / wounds", () => {
  it("2.4 coerces ObjectField entries to strings, preserving length", () => {
    expect(CharacterData.migrateData({ injuries: [{}, {}] }).injuries).toEqual(["", ""]);
  });

  it("2.5 leaves a string array unchanged", () => {
    expect(CharacterData.migrateData({ injuries: ["cut", "burn"] }).injuries).toEqual([
      "cut",
      "burn",
    ]);
  });

  it("2.6 converts an object form via Object.values", () => {
    expect(CharacterData.migrateData({ injuries: { 0: "x", 1: "y" } }).injuries).toEqual([
      "x",
      "y",
    ]);
  });

  it("2.7 leaves undefined wounds absent (no throw)", () => {
    const out = CharacterData.migrateData({});
    expect(out.wounds).toBeUndefined();
  });
});

describe("CharacterData.migrateData — numeric coercion", () => {
  it("2.8 makes movement values finite (NaN→fallback, '4'→4, null→fallback)", () => {
    const out = CharacterData.migrateData({
      movement: { total: NaN, base: null, sprintMultiplier: "4" },
    });
    expect(Number.isFinite(out.movement.total)).toBe(true);
    expect(Number.isFinite(out.movement.base)).toBe(true);
    expect(out.movement.sprintMultiplier).toBe(4);
  });

  it("2.9 preserves a null derivedStat value (rule only coerces non-finite ≠ null)", () => {
    const out = CharacterData.migrateData({ derivedStats: { health: { value: null } } });
    expect(out.derivedStats.health.value).toBeNull();
  });

  it('2.10 coerces a "NaN" string derivedStat to 0', () => {
    const out = CharacterData.migrateData({ derivedStats: { health: { modifier: "NaN" } } });
    expect(out.derivedStats.health.modifier).toBe(0);
  });
});

describe("CharacterData.migrateData — contract invariants", () => {
  it("2.11 returns a defined object for any fixture (FR-007)", () => {
    expect(CharacterData.migrateData(makeLegacyCharacter())).toBeDefined();
    expect(CharacterData.migrateData(makeValidCharacter())).toBeDefined();
  });

  it("2.12 is idempotent — a 2nd pass equals the 1st (FR-008)", () => {
    const once = CharacterData.migrateData(makeLegacyCharacter());
    const twice = CharacterData.migrateData(structuredClone(once));
    expect(twice).toEqual(once);
  });
});

describe("HouseData.migrateData — members head/steward", () => {
  it('2.13 wraps "" into { id: "", description: "" }', () => {
    expect(HouseData.migrateData({ members: { head: "" } }).members.head).toEqual({
      id: "",
      description: "",
    });
  });

  it('2.14 wraps the corrupted "[object Object]" into an empty id', () => {
    expect(
      HouseData.migrateData({ members: { head: "[object Object]" } }).members.head
    ).toEqual({ id: "", description: "" });
  });

  it("2.15 treats any other string as a legacy bare actor id", () => {
    expect(HouseData.migrateData({ members: { head: "actorId123" } }).members.head).toEqual({
      id: "actorId123",
      description: "",
    });
  });

  it("2.16 leaves an already-valid object unchanged (idempotent)", () => {
    const valid = { id: "x", description: "y" };
    expect(HouseData.migrateData({ members: { steward: valid } }).members.steward).toEqual(
      valid
    );
  });

  it("2.17 returns a defined object for any fixture (FR-007)", () => {
    expect(HouseData.migrateData(makeLegacyHouse())).toBeDefined();
    expect(HouseData.migrateData(makeValidHouse())).toBeDefined();
  });

  it("2.18 is idempotent — a 2nd pass equals the 1st (FR-008)", () => {
    const once = HouseData.migrateData(makeLegacyHouse());
    const twice = HouseData.migrateData(structuredClone(once));
    expect(twice).toEqual(once);
  });
});

// Spec 008 / US3 — the 0.9.0 world slug backfill (pure `deriveWorldSlugs`).
// Non-destructive (blank-only), idempotent, and flags renamed CORE items for
// review WITHOUT silently rewriting to a canonical slug (FR-014). Quickstart §A.6.
describe("deriveWorldSlugs — spec 008 backfill", () => {
  const items = () => [
    { _id: "a1", uuid: "Item.a1", name: "Agility", type: "ability", system: { specialties: [] } },
    { _id: "a2", uuid: "Item.a2", name: "Agilidade", type: "ability", system: { specialties: [] } },
    { _id: "l1", uuid: "Item.l1", name: "Language (High Valyrian)", type: "ability", system: { specialties: [] } },
    { _id: "w1", uuid: "Item.w1", name: "Longsword", type: "weapon", system: {} },
  ];

  it("backfills a blank slug from the name (every item type — FR-011)", () => {
    const { updates } = deriveWorldSlugs(items());
    expect(updates.find((u) => u._id === "a1")["system.slug"]).toBe("agility");
    expect(updates.find((u) => u._id === "w1")["system.slug"]).toBe("longsword");
  });

  it("is idempotent — applying then re-deriving yields no updates (FR-008)", () => {
    const first = deriveWorldSlugs(items());
    const applied = items().map((it) => {
      const u = first.updates.find((x) => x._id === it._id);
      if (!u) return it;
      const system = { ...it.system, slug: u["system.slug"] };
      if (u["system.specialties"]) system.specialties = u["system.specialties"];
      return { ...it, system };
    });
    expect(deriveWorldSlugs(applied).updates).toEqual([]);
  });

  it("flags a renamed CORE ability in review, but NOT an English one (FR-014)", () => {
    // The fixture is missing most canonical abilities, so the review is active
    // and lists the non-canonical (renamed) ability, never the English one.
    const { review } = deriveWorldSlugs(items());
    const abilityNames = review
      .filter((r) => r.kind === "ability")
      .map((r) => r.name);
    expect(abilityNames).toContain("Agilidade");
    expect(abilityNames).not.toContain("Agility");
    expect(review.find((r) => r.name === "Agilidade")).toMatchObject({
      uuid: "Item.a2",
      derivedSlug: "agilidade",
      kind: "ability",
    });
  });

  it("does NOT alert for homebrew when every canonical ability is present", () => {
    // The user's case: a world with all 19 canonical abilities + custom content
    // must NOT raise the review — homebrew never removes a canonical slug.
    const canonical = CANONICAL_ABILITIES.map((a, i) => ({
      _id: `c${i}`,
      uuid: `Item.c${i}`,
      name: a.slug,
      type: "ability",
      system: { slug: a.slug, specialties: [] },
    }));
    const homebrew = {
      _id: "fe",
      uuid: "Item.fe",
      name: "Fé",
      type: "ability",
      system: { specialties: [] },
    };
    const { review, updates } = deriveWorldSlugs([...canonical, homebrew]);
    expect(review).toEqual([]); // all canonical present → no alert
    // …but the homebrew slug is still backfilled (FR-011).
    expect(updates.find((u) => u.uuid === "Item.fe")["system.slug"]).toBe("fe");
  });

  it("does NOT flag a custom specialty on a canonical ability (no specialty review)", () => {
    // Add all canonical abilities so the world isn't 'missing' any, plus a
    // canonical ability carrying a homebrew specialty → still silent.
    const canonical = CANONICAL_ABILITIES.map((a, i) => ({
      _id: `c${i}`,
      uuid: `Item.c${i}`,
      name: a.slug,
      type: "ability",
      system: {
        slug: a.slug,
        specialties:
          a.slug === "persuasion" ? [{ name: "Smooth Talk", rating: 2 }] : [],
      },
    }));
    const { review } = deriveWorldSlugs(canonical);
    expect(review).toEqual([]);
  });

  it("does NOT flag a Language variant (parameterized identity, Decision 5)", () => {
    const { review } = deriveWorldSlugs(items());
    expect(review.some((r) => String(r.name).startsWith("Language"))).toBe(false);
  });

  it("G2 — an accented rename keeps its slugify'd slug, no silent canonical rewrite", () => {
    const { updates, review } = deriveWorldSlugs([
      { _id: "aw", uuid: "Item.aw", name: "Percepção", type: "ability", system: { specialties: [] } },
    ]);
    expect(updates[0]["system.slug"]).toBe("percepcao"); // NOT "awareness"
    expect(review).toContainEqual({
      uuid: "Item.aw",
      name: "Percepção",
      derivedSlug: "percepcao",
      kind: "ability",
    });
  });

  it("scopes and backfills blank specialty slugs on a canonical ability", () => {
    const { updates, review } = deriveWorldSlugs([
      {
        _id: "p",
        uuid: "Item.p",
        name: "Persuasion",
        type: "ability",
        system: { specialties: [{ name: "Charm", rating: 2 }] },
      },
    ]);
    expect(updates[0]["system.specialties"][0].slug).toBe("persuasion_charm");
    expect(review).toEqual([]); // canonical ability + canonical specialty
  });
});

// Group — spec 018 / Contract unit-migratedata.md (U1-U13). Shields legacy `unit`
// actors: every numeric leaf (null/NaN/string) is coerced to a finite integer
// before v13/v14 validation, while non-numeric branches survive intact.

describe("UnitData.migrateData — numeric coercion", () => {
  it("U1 coerces a null derived-stat leaf to 0", () => {
    expect(
      UnitData.migrateData({ derivedStats: { health: { value: null } } })
        .derivedStats.health.value
    ).toBe(0);
  });

  it("U2 coerces a NaN derived-stat leaf to 0", () => {
    expect(
      UnitData.migrateData({ derivedStats: { health: { modifier: NaN } } })
        .derivedStats.health.modifier
    ).toBe(0);
  });

  it("U3 coerces a numeric string to its integer", () => {
    expect(
      UnitData.migrateData({ derivedStats: { combatDefense: { value: "5" } } })
        .derivedStats.combatDefense.value
    ).toBe(5);
  });

  it("U4 coerces a non-numeric string to 0", () => {
    expect(
      UnitData.migrateData({
        derivedStats: { combatDefense: { modifier: "abc" } },
      }).derivedStats.combatDefense.modifier
    ).toBe(0);
  });

  it("U5 truncates a fractional string to an integer", () => {
    expect(UnitData.migrateData({ xp: { value: "3.5" } }).xp.value).toBe(3);
  });

  it("U6 leaves a valid integer unchanged", () => {
    expect(
      UnitData.migrateData({ trainingLevel: { base: 7 } }).trainingLevel.base
    ).toBe(7);
  });

  it("U7 coerces a null nested scalar to 0", () => {
    expect(
      UnitData.migrateData({ status: { current: null } }).status.current
    ).toBe(0);
  });

  it("U8 coerces a numeric-string top-level scalar", () => {
    expect(
      UnitData.migrateData({ disorganizedPenalties: "2" }).disorganizedPenalties
    ).toBe(2);
  });

  it("U9 coerces a NaN top-level scalar to 0", () => {
    expect(
      UnitData.migrateData({ currentEquipmentIndex: NaN }).currentEquipmentIndex
    ).toBe(0);
  });

  it("U10 preserves non-numeric branches (description / types) intact", () => {
    const out = UnitData.migrateData({
      description: "Cavalaria",
      types: [{}],
    });
    expect(out.description).toBe("Cavalaria");
    expect(out.types).toEqual([{}]);
  });

  it("U11 returns a defined object and never invents absent keys", () => {
    const out = UnitData.migrateData({});
    expect(out).toBeDefined();
    expect(out.derivedStats).toBeUndefined();
    expect(out.xp).toBeUndefined();
    expect(out.trainingLevel).toBeUndefined();
    expect(out.status).toBeUndefined();
  });

  it("U12 is idempotent — migrate(migrate(x)) equals migrate(x)", () => {
    const once = UnitData.migrateData(makeLegacyUnit());
    const twice = UnitData.migrateData(UnitData.migrateData(makeLegacyUnit()));
    expect(twice).toEqual(once);
  });

  it("U13 returns a defined object for both fixtures", () => {
    expect(UnitData.migrateData(makeLegacyUnit())).toBeDefined();
    expect(UnitData.migrateData(makeValidUnit())).toBeDefined();
  });
});
