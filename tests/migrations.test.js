import { describe, it, expect } from "vitest";
import CharacterData from "../module/data/actor/character-data.js";
import HouseData from "../module/data/actor/house-data.js";
import {
  makeLegacyCharacter,
  makeValidCharacter,
  makeLegacyHouse,
  makeValidHouse,
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
