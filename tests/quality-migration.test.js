import { describe, it, expect } from "vitest";
import WeaponData from "../module/data/item/weapon-data.js";
import ArmorData from "../module/data/item/armor-data.js";

// spec 020 — non-destructive migration (FR-011 / SC-005): legacy free-text
// `{name, parameter}` quality rows become typed `{slug, parameter}` references.
// migrateData runs BEFORE validation, so it only touches the source object; the
// stubbed `super.migrateData` (setup.js) returns the mutated source.

describe.each([
  ["WeaponData", WeaponData],
  ["ArmorData", ArmorData],
])("%s.migrateData — quality refs", (_name, Model) => {
  it("maps a legacy {name, parameter} row to {slug, parameter}", () => {
    const out = Model.migrateData({
      qualities: [{ name: "Piercing", parameter: "2" }],
    });
    expect(out.qualities).toEqual([{ slug: "piercing", parameter: "2" }]);
  });

  it("slugifies a multi-word name (Close Range → close_range)", () => {
    const out = Model.migrateData({
      qualities: [{ name: "Close Range", parameter: "" }],
    });
    expect(out.qualities).toEqual([{ slug: "close_range", parameter: "" }]);
  });

  it("preserves a non-catalog name as a label-only slug reference (no data lost)", () => {
    const out = Model.migrateData({
      qualities: [{ name: "Homebrew Cut", parameter: "" }],
    });
    expect(out.qualities).toEqual([{ slug: "homebrew_cut", parameter: "" }]);
  });

  it("defaults a missing legacy parameter to '' (never undefined)", () => {
    const out = Model.migrateData({ qualities: [{ name: "Vicious" }] });
    expect(out.qualities).toEqual([{ slug: "vicious", parameter: "" }]);
  });

  it("is idempotent on an already-{slug} row", () => {
    const already = [{ slug: "piercing", parameter: "2" }];
    const out = Model.migrateData({ qualities: already });
    expect(out.qualities).toEqual([{ slug: "piercing", parameter: "2" }]);
  });

  it("does NOT throw on malformed non-object rows (left for the schema to coerce)", () => {
    let out;
    expect(() => {
      out = Model.migrateData({ qualities: ["oops", 7, null] });
    }).not.toThrow();
    // Non-objects are left as-is here; the `blank:true` schema coerces them to empty
    // refs at validation — never dropped, never vanishing the item.
    expect(out.qualities).toEqual(["oops", 7, null]);
  });

  it("keeps a blank row as an empty-slug reference (never discards — corruption fix)", () => {
    // The old '+' button seeded `{name:"", parameter:""}`. slugify("") === "".
    // With `slug: blank:true` this validates fine (no vanished weapon) and renders
    // as a removable "missing item" chip — the reference is preserved, not dropped.
    const out = Model.migrateData({
      qualities: [
        { name: "Piercing", parameter: "2" },
        { name: "", parameter: "" }, // stray blank row → {slug:""} (kept)
        { slug: "", parameter: "x" }, // empty slug → kept
      ],
    });
    expect(out.qualities).toEqual([
      { slug: "piercing", parameter: "2" },
      { slug: "", parameter: "" },
      { slug: "", parameter: "x" },
    ]);
  });

  it("leaves a document with no qualities untouched", () => {
    const out = Model.migrateData({ slug: "Sword" });
    expect(out.qualities).toBeUndefined();
    expect(out.slug).toBe("sword"); // slug still normalised
  });
});
