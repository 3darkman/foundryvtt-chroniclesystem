import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import CharacterData from "../module/data/actor/character-data.js";

// spec 022 — the defensive, NON-destructive `relationships` migrateData clause
// (T004 / contracts/relationships-data.md §Migration). migrateData runs BEFORE
// validation and only touches the source object; the stubbed `super.migrateData`
// (setup.js) returns the mutated source. It must NEVER discard a real reference
// (a blank/garbage uuid is valid data → an orphan card, FR-014).

describe("CharacterData.migrateData — relationships", () => {
  it("leaves a clean array untouched (idempotent)", () => {
    const rels = [
      { uuid: "Actor.abc", disp: 3, note: "<p>hi</p>" },
      { uuid: "Actor.def", disp: 7, note: "" },
    ];
    const out = CharacterData.migrateData({ relationships: rels });
    expect(out.relationships).toEqual(rels);
  });

  it("does nothing when the field is absent (schema initial [] applies)", () => {
    const out = CharacterData.migrateData({});
    expect(out.relationships).toBeUndefined();
  });

  it("drops the field entirely when it is present but not an array", () => {
    for (const bad of [{}, "oops", 42, null]) {
      const out = CharacterData.migrateData({ relationships: bad });
      expect(out.relationships).toBeUndefined();
    }
  });

  it("drops non-object entries but keeps the valid ones", () => {
    const out = CharacterData.migrateData({
      relationships: [
        "oops",
        7,
        null,
        ["nested"],
        { uuid: "Actor.keep", disp: 4, note: "" },
      ],
    });
    expect(out.relationships).toEqual([
      { uuid: "Actor.keep", disp: 4, note: "" },
    ]);
  });

  it("coerces a missing/NaN disp to 4 (never rejects the document)", () => {
    const out = CharacterData.migrateData({
      relationships: [
        { uuid: "Actor.a", note: "" }, // missing disp
        { uuid: "Actor.b", disp: "not-a-number", note: "" },
      ],
    });
    expect(out.relationships[0].disp).toBe(4);
    expect(out.relationships[1].disp).toBe(4);
  });

  it("clamps an out-of-range disp into [1, 7]", () => {
    const out = CharacterData.migrateData({
      relationships: [
        { uuid: "Actor.lo", disp: -3, note: "" },
        { uuid: "Actor.hi", disp: 99, note: "" },
        { uuid: "Actor.ok", disp: 5, note: "" },
      ],
    });
    expect(out.relationships.map((r) => r.disp)).toEqual([1, 7, 5]);
  });

  it("KEEPS a blank-uuid entry — never discards a reference (orphan-safe)", () => {
    const out = CharacterData.migrateData({
      relationships: [{ uuid: "", disp: 4, note: "kept" }],
    });
    expect(out.relationships).toEqual([{ uuid: "", disp: 4, note: "kept" }]);
  });
});

// SC-004 / D-4 (FR-020) — the per-relationship disposition is DECOUPLED from
// mechanics. No roll/intrigue/collector path may read `system.relationships`.
// A static source scan encodes the invariant so a future edit that wires it into
// a roll path fails CI (the manual re-roll check in quickstart is the runtime
// counterpart).
describe("relationships decoupling invariant (SC-004)", () => {
  const read = (rel) =>
    readFileSync(
      fileURLToPath(new URL(rel, import.meta.url)),
      "utf8"
    );

  it("no roll path references system.relationships", () => {
    const rollPaths = [
      "../module/system/ChronicleSystem.js",
      "../module/effects/cs-effect-modifiers.js",
    ];
    for (const path of rollPaths) {
      expect(read(path)).not.toMatch(/relationships/);
    }
  });
});
