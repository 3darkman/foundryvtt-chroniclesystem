import { describe, it, expect } from "vitest";
import {
  CANONICAL_ABILITIES,
  ABILITY_SLUGS,
  SPECIALTY_SLUGS,
  isCanonicalAbilitySlug,
  isCanonicalSpecialtySlug,
  scopedSpecialtySlug,
  deriveSlugUpdate,
  deriveSpecialtySlugs,
  findSlugCollision,
} from "../module/vocabulary/cs-canonical-abilities.js";

// Spec 008 / Phase 2 — the canonical vocabulary SSOT and the pure derivation
// rules. Exercises the REAL exported functions (no reimplementation), including
// the parameterized-Language rule (Decision 5), the accent behaviour of the
// existing slugify (G2), and the FR-013 collision base (G1). Quickstart §A.6.

describe("canonical vocabulary shape", () => {
  it("holds the 19 canonical abilities and is frozen", () => {
    expect(CANONICAL_ABILITIES).toHaveLength(19);
    expect(Object.isFrozen(CANONICAL_ABILITIES)).toBe(true);
    expect(() => CANONICAL_ABILITIES.push({})).toThrow();
  });

  it("scopes every specialty slug under its ability", () => {
    for (const ability of CANONICAL_ABILITIES) {
      for (const specialty of ability.specialties) {
        expect(specialty.slug.startsWith(`${ability.slug}_`)).toBe(true);
        expect(SPECIALTY_SLUGS.has(specialty.slug)).toBe(true);
      }
    }
    expect(ABILITY_SLUGS.has("animal_handling")).toBe(true);
  });
});

describe("isCanonicalAbilitySlug", () => {
  it("accepts the plain canonical slugs", () => {
    expect(isCanonicalAbilitySlug("agility")).toBe(true);
    expect(isCanonicalAbilitySlug("animal_handling")).toBe(true);
    expect(isCanonicalAbilitySlug("language")).toBe(true);
  });

  it("accepts language_* variants (parameterized identity, Decision 5)", () => {
    expect(isCanonicalAbilitySlug("language_high_valyrian")).toBe(true);
    expect(isCanonicalAbilitySlug("language_dothraki")).toBe(true);
  });

  it("rejects non-canonical and non-string inputs", () => {
    expect(isCanonicalAbilitySlug("agilidade")).toBe(false);
    expect(isCanonicalAbilitySlug("fe")).toBe(false);
    expect(isCanonicalAbilitySlug("")).toBe(false);
    expect(isCanonicalAbilitySlug(undefined)).toBe(false);
  });
});

describe("isCanonicalSpecialtySlug", () => {
  it("accepts scoped canonical specialties, rejects unscoped names", () => {
    expect(isCanonicalSpecialtySlug("persuasion_charm")).toBe(true);
    expect(isCanonicalSpecialtySlug("animal_handling_charm")).toBe(true);
    expect(isCanonicalSpecialtySlug("charm")).toBe(false); // unscoped ≠ canonical
  });
});

describe("scopedSpecialtySlug", () => {
  it("joins ability + specialty with _ (disambiguates Charm)", () => {
    expect(scopedSpecialtySlug("persuasion", "Charm")).toBe("persuasion_charm");
    expect(scopedSpecialtySlug("animal_handling", "Charm")).toBe(
      "animal_handling_charm"
    );
  });
});

describe("deriveSlugUpdate (derive-when-empty, keep editable — FR-012)", () => {
  it("derives from the name when the slug is blank", () => {
    expect(deriveSlugUpdate("Agility", "")).toBe("agility");
    expect(deriveSlugUpdate("Animal Handling", "   ")).toBe("animal_handling");
  });

  it("returns null (does not overwrite) when a slug already exists", () => {
    expect(deriveSlugUpdate("Agility", "custom")).toBeNull();
    expect(deriveSlugUpdate("Agility", "agility")).toBeNull();
  });

  it("derives the composite slug for a Language variant naturally", () => {
    expect(deriveSlugUpdate("Language (High Valyrian)", "")).toBe(
      "language_high_valyrian"
    );
  });

  it("G2 — accented pt-BR names slug through the existing slugify (accents stripped)", () => {
    // Documents the EXACT value the system's slugify produces (no new transliteration).
    expect(deriveSlugUpdate("Percepção", "")).toBe("percepcao");
    expect(deriveSlugUpdate("Coação", "")).toBe("coacao");
  });
});

describe("deriveSpecialtySlugs (idempotent scoped fill)", () => {
  it("fills blank slugs and preserves set ones", () => {
    const out = deriveSpecialtySlugs("persuasion", [
      { name: "Charm", rating: 3 },
      { name: "Bargain", rating: 2, slug: "persuasion_custom" },
    ]);
    expect(out[0].slug).toBe("persuasion_charm");
    expect(out[1].slug).toBe("persuasion_custom"); // untouched
  });

  it("is idempotent — a 2nd pass equals the 1st", () => {
    const once = deriveSpecialtySlugs("agility", [{ name: "Quickness" }]);
    const twice = deriveSpecialtySlugs("agility", once);
    expect(twice).toEqual(once);
    expect(twice[0].slug).toBe("agility_quickness");
  });

  it("does not mutate the input array/objects", () => {
    const input = [{ name: "Charm" }];
    deriveSpecialtySlugs("persuasion", input);
    expect(input[0].slug).toBeUndefined();
  });
});

describe("findSlugCollision (FR-013 base)", () => {
  it("G1 — true when the slug is already present in the scope", () => {
    expect(findSlugCollision("agility", ["awareness", "agility"])).toBe(true);
  });

  it("G1 — false when the slug is unique in the scope", () => {
    expect(findSlugCollision("fe", ["agility", "awareness"])).toBe(false);
  });

  it("accepts a Set and never collides on a blank slug", () => {
    expect(findSlugCollision("status", new Set(["status"]))).toBe(true);
    expect(findSlugCollision("", ["", "agility"])).toBe(false);
  });
});
