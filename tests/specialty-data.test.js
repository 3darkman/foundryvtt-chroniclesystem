// Spec 024 — SpecialtyData: the rating clamp (FR-013) and the load-time
// migrateData coercion. `clampRating` is the ONE coercion applied at every write
// path, precisely because the schema carries no `min: 0` (a `min` would make a
// negative submission throw and REJECT the update, losing the keystroke).

import { describe, it, expect } from "vitest";
import SpecialtyData, {
  clampRating,
} from "../module/data/item/specialty-data.js";

describe("clampRating", () => {
  it("coerces every unusable value to 0", () => {
    for (const value of [null, undefined, "", "abc", NaN, {}, []]) {
      expect(clampRating(value)).toBe(0);
    }
  });

  it("floors negatives at 0 instead of rejecting them (FR-013)", () => {
    expect(clampRating(-3)).toBe(0);
    expect(clampRating("-1")).toBe(0);
  });

  it("truncates towards zero and preserves valid ratings", () => {
    expect(clampRating(2.7)).toBe(2);
    expect(clampRating("3")).toBe(3);
    expect(clampRating(0)).toBe(0);
    expect(clampRating(5)).toBe(5);
  });
});

describe("SpecialtyData.migrateData", () => {
  it("normalises a stored slug", () => {
    const source = { slug: "Persuasion Convince", rating: 1 };
    SpecialtyData.migrateData(source);
    expect(source.slug).toBe("persuasion_convince");
  });

  it("leaves a blank slug alone (derivation is the lifecycle's job)", () => {
    const source = { slug: "", rating: 0 };
    SpecialtyData.migrateData(source);
    expect(source.slug).toBe("");
  });

  it("clamps the rating BEFORE validation", () => {
    const source = { slug: "", rating: -4 };
    SpecialtyData.migrateData(source);
    expect(source.rating).toBe(0);

    const dirty = { slug: "", rating: "abc" };
    SpecialtyData.migrateData(dirty);
    expect(dirty.rating).toBe(0);
  });

  it("does not invent a rating key on a source that lacks one", () => {
    const source = { slug: "" };
    SpecialtyData.migrateData(source);
    expect("rating" in source).toBe(false);
  });
});
