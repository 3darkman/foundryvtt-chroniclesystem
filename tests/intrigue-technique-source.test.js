import { describe, it, expect } from "vitest";
import {
  INTRIGUE_TECHNIQUES,
  techniqueBySlug,
  techniqueChoices,
} from "../module/vocabulary/cs-intrigue-techniques.js";
import en from "../lang/en.json";

// US4 / Contract intrigue-technique-source §Testes. The canonical intrigue-
// technique source (SSOT): 7 frozen entries, unique slugs, ONE localized name key
// per technique in the CS.intrigue.techniques.* namespace, and the choice helper.

const localize = (key) => key.split(".").reduce((o, k) => o?.[k], en);

describe("INTRIGUE_TECHNIQUES — the canonical source (SSOT)", () => {
  it("has 7 entries with unique, stable slugs", () => {
    expect(INTRIGUE_TECHNIQUES).toHaveLength(7);
    const slugs = INTRIGUE_TECHNIQUES.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(7);
    expect(slugs).toEqual([
      "bargain",
      "charm",
      "convince",
      "incite",
      "intimidate",
      "seduce",
      "taunt",
    ]);
  });

  it("gives every technique ONE unique name key in the intrigue namespace", () => {
    const keys = INTRIGUE_TECHNIQUES.map((t) => t.nameKey);
    expect(new Set(keys).size).toBe(7);
    for (const key of keys) {
      expect(key).toMatch(/^CS\.intrigue\.techniques\./);
    }
  });

  it("maps each technique to its scoped persuasion specialty slug", () => {
    for (const t of INTRIGUE_TECHNIQUES) {
      expect(t.specialtySlug).toBe(`persuasion_${t.slug}`);
    }
  });

  it("wires Charm's influence base to persuasion", () => {
    expect(techniqueBySlug("charm").influenceAbilitySlug).toBe("persuasion");
  });

  it("is frozen (SSOT cannot be mutated)", () => {
    expect(Object.isFrozen(INTRIGUE_TECHNIQUES)).toBe(true);
  });
});

describe("techniqueBySlug", () => {
  it("resolves a known slug and returns undefined for an unknown one", () => {
    expect(techniqueBySlug("seduce").slug).toBe("seduce");
    expect(techniqueBySlug("nope")).toBeUndefined();
  });
});

describe("techniqueChoices — the authoring dropdown source", () => {
  it("returns 7 {value, labelKey} pairs", () => {
    const choices = techniqueChoices();
    expect(choices).toHaveLength(7);
    for (const choice of choices) {
      expect(choice).toHaveProperty("value");
      expect(choice).toHaveProperty("labelKey");
    }
    expect(choices[0]).toEqual({
      value: "bargain",
      labelKey: "CS.intrigue.techniques.bargain",
    });
  });
});

describe("i18n presence — every name key exists in lang/en.json", () => {
  it("resolves each technique nameKey to a non-empty string", () => {
    for (const t of INTRIGUE_TECHNIQUES) {
      const value = localize(t.nameKey);
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
