import { describe, it, expect } from "vitest";
import { migrateActorToAE } from "../module/migrations/task080-ae-unification.js";

// Spec 007 / US4 / FR-010 / SC-004 — the migration strips the residual persisted
// modifier/penalty buffer. Parity holds because totals are recomputed live by the
// collector and the migration touches nothing else. Idempotency is proven by a
// second pass producing no change.

describe("migrateActorToAE", () => {
  it("clears a populated persisted buffer and creates no effects", () => {
    const result = migrateActorToAE({
      modifiers: { all: [{ _id: "x", mod: -1, isDocument: false }] },
      penalties: { all: [{ _id: "y", mod: 2, isDocument: false }] },
    });
    expect(result.changed).toBe(true);
    expect(result.cleanedSystem.modifiers).toEqual({});
    expect(result.cleanedSystem.penalties).toEqual({});
    expect(result.effects).toEqual([]);
  });

  it("reports no change on already-clean data", () => {
    expect(migrateActorToAE({ modifiers: {}, penalties: {} }).changed).toBe(false);
  });

  it("handles missing maps without throwing", () => {
    const result = migrateActorToAE({});
    expect(result.changed).toBe(false);
    expect(result.cleanedSystem).toEqual({ modifiers: {}, penalties: {} });
  });

  it("is idempotent — a 2nd pass on cleaned data is a no-op (FR-010/SC-004)", () => {
    const first = migrateActorToAE({
      modifiers: { all: [{ _id: "x", mod: 1 }] },
      penalties: {},
    });
    const second = migrateActorToAE(first.cleanedSystem);
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(second.cleanedSystem).toEqual(first.cleanedSystem);
  });

  it("never fabricates effects regardless of input", () => {
    expect(
      migrateActorToAE({ modifiers: { agility: [{ _id: "a", mod: -2 }] } }).effects
    ).toEqual([]);
  });
});
