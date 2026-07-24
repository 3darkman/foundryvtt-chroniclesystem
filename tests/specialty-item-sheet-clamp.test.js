// Post-implement fix (2026-07-23) — the Specialty item sheet's Rating field is
// a bare NumberField with no `min` (FR-013/D4: `min` would throw and REJECT the
// submit rather than clamp it). `SpecialtyData.migrateData` clamps it on load;
// this test pins the SAME clamp on the item sheet's own submit path
// (`CSItemSheet#_processFormData`), belt-and-suspenders with the schema-level
// coercion, matching the inline rating input the character sheet already
// clamps at the write path (not just at load).

import { describe, it, expect } from "vitest";
import { CSItemSheet } from "../module/items/sheets/csItemSheet.js";

const proto = CSItemSheet.prototype;

function fakeSheet(type) {
  return { document: { type, _source: { system: {} } } };
}

function formDataWith(object) {
  return { object };
}

describe("CSItemSheet#_processFormData clamps a Specialty's rating", () => {
  it("clamps a negative rating to 0", () => {
    const submit = proto._processFormData.call(
      fakeSheet("specialty"),
      {},
      {},
      formDataWith({ system: { rating: -5 } })
    );
    expect(submit.system.rating).toBe(0);
  });

  it("clamps a malformed rating to 0", () => {
    const submit = proto._processFormData.call(
      fakeSheet("specialty"),
      {},
      {},
      formDataWith({ system: { rating: "abc" } })
    );
    expect(submit.system.rating).toBe(0);
  });

  it("preserves a valid positive rating", () => {
    const submit = proto._processFormData.call(
      fakeSheet("specialty"),
      {},
      {},
      formDataWith({ system: { rating: 3 } })
    );
    expect(submit.system.rating).toBe(3);
  });

  it("does nothing when rating is absent from the submit", () => {
    const submit = proto._processFormData.call(
      fakeSheet("specialty"),
      {},
      {},
      formDataWith({ system: { abilitySlug: "fighting" } })
    );
    expect(submit.system.rating).toBeUndefined();
  });

  it("never touches an unrelated item type's rating (e.g. an Ability)", () => {
    const submit = proto._processFormData.call(
      fakeSheet("ability"),
      {},
      {},
      formDataWith({ system: { rating: -5 } })
    );
    expect(submit.system.rating).toBe(-5); // untouched — abilities are unaffected
  });
});
