import { describe, it, expect } from "vitest";
import {
  abilitySpecialtyChoiceMaps,
  CANONICAL_ABILITIES,
} from "../module/vocabulary/cs-canonical-abilities.js";

// spec 021 (US4, D21) — the pure choice-map builder feeding the item-sheet
// dropdowns. Values are the English canonical display names (the format downstream
// name-matching keys by); labels are localized in the sheet, not here.

describe("abilitySpecialtyChoiceMaps — abilities (bare names)", () => {
  const { abilities } = abilitySpecialtyChoiceMaps();

  it("has one entry per canonical ability, value = English name", () => {
    expect(abilities).toHaveLength(CANONICAL_ABILITIES.length);
    const values = abilities.map((a) => a.value);
    expect(values).toContain("Fighting");
    expect(values).toContain("Cunning");
    expect(values).toContain("Marksmanship");
  });

  it("carries the ability's i18n nameKey for the sheet to localize", () => {
    const fighting = abilities.find((a) => a.value === "Fighting");
    expect(fighting.nameKey).toBe("CS.abilities.fighting");
  });
});

describe("abilitySpecialtyChoiceMaps — specialties (Ability:Specialty combos)", () => {
  const { specialties } = abilitySpecialtyChoiceMaps();

  it("emits every Ability:Specialty combo, NO bare-ability entries", () => {
    const total = CANONICAL_ABILITIES.reduce(
      (n, a) => n + a.specialties.length,
      0
    );
    expect(specialties).toHaveLength(total);
    // every value carries exactly one ':' (Ability:Specialty), never a bare name
    for (const s of specialties) {
      expect(s.value.split(":")).toHaveLength(2);
      expect(s.value.split(":")[0]).not.toBe("");
      expect(s.value.split(":")[1]).not.toBe("");
    }
  });

  it("produces the canonical `Ability:Specialty` value format", () => {
    const values = specialties.map((s) => s.value);
    expect(values).toContain("Fighting:Axes");
    expect(values).toContain("Fighting:Long Blades");
    expect(values).toContain("Marksmanship:Bows");
  });

  it("carries both i18n keys for the composite label", () => {
    const axes = specialties.find((s) => s.value === "Fighting:Axes");
    expect(axes.abilityNameKey).toBe("CS.abilities.fighting");
    expect(axes.specialtyNameKey).toBe("CS.specialties.fighting.axes");
  });
});
