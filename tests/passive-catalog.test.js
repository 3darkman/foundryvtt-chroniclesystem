import { describe, it, expect, afterEach } from "vitest";
import {
  worldAbilityCatalog,
  invalidatePassiveCatalog,
} from "../module/rolls/cs-passive-catalog.js";
import { CANONICAL_ABILITIES } from "../module/vocabulary/cs-canonical-abilities.js";

// Spec 023 / contract passive-options.md C2. The world ability catalogue: the
// Item directory ∪ the canonical vocabulary, deduped by slug with the WORLD
// entry winning. Synchronous, memoized, and safe with no Foundry runtime — the
// setup harness leaves `game.items` undefined, which IS the "outside Foundry"
// case (C2.7).

/** Install a fake Item-directory ability and drop the memo. */
function withWorldItems(items) {
  globalThis.game.items = items;
  invalidatePassiveCatalog();
}

const worldAbility = (name, { slug, specialties = {} } = {}) => ({
  type: "ability",
  name,
  system: { slug, specialties },
});

afterEach(() => {
  delete globalThis.game.items;
  invalidatePassiveCatalog();
});

describe("worldAbilityCatalog — no Foundry world (C2.7)", () => {
  it("yields exactly the canonical vocabulary", () => {
    const catalog = worldAbilityCatalog();
    expect(catalog).toHaveLength(CANONICAL_ABILITIES.length);
    expect(catalog.map((a) => a.slug)).toEqual(
      CANONICAL_ABILITIES.map((a) => a.slug)
    );
  });

  it("carries the canonical i18n keys and specialties", () => {
    const awareness = worldAbilityCatalog().find((a) => a.slug === "awareness");
    expect(awareness.nameKey).toBe("CS.abilities.awareness");
    expect(awareness.specialties.map((s) => s.slug)).toEqual([
      "awareness_empathy",
      "awareness_notice",
    ]);
  });

  it("is synchronous — it returns an array, never a promise (C2.5)", () => {
    expect(Array.isArray(worldAbilityCatalog())).toBe(true);
  });
});

describe("worldAbilityCatalog — world items (C2.1/C2.2/C2.3)", () => {
  it("a world item OVERRIDES the canonical entry of the same slug", () => {
    withWorldItems([
      worldAbility("Vigilance", {
        slug: "awareness",
        specialties: { s1: { name: "Sixth Sense", rating: 3 } },
      }),
    ]);
    const awareness = worldAbilityCatalog().find((a) => a.slug === "awareness");
    expect(awareness.name).toBe("Vigilance");
    expect(awareness.nameKey).toBeNull();
    expect(awareness.specialties.map((s) => s.slug)).toEqual([
      "awareness_sixth_sense",
    ]);
    // The rest of the vocabulary is untouched.
    expect(worldAbilityCatalog()).toHaveLength(CANONICAL_ABILITIES.length);
  });

  it("adds a world-only ability alongside the canonical ones", () => {
    withWorldItems([worldAbility("Sorcery")]);
    const catalog = worldAbilityCatalog();
    expect(catalog).toHaveLength(CANONICAL_ABILITIES.length + 1);
    expect(catalog.find((a) => a.slug === "sorcery").name).toBe("Sorcery");
  });

  it("dedupes by slug across case and accents", () => {
    // "Awareness" and "awareness" slugify identically; the FIRST world item wins.
    withWorldItems([worldAbility("AWARENESS"), worldAbility("awareness")]);
    const matches = worldAbilityCatalog().filter((a) => a.slug === "awareness");
    expect(matches).toHaveLength(1);
    expect(matches[0].name).toBe("AWARENESS");
  });

  it("dedupes an ability's specialties by scoped slug", () => {
    withWorldItems([
      worldAbility("Awareness", {
        specialties: {
          s1: { name: "Empathy", rating: 2 },
          s2: { name: "empathy", rating: 4 },
        },
      }),
    ]);
    const awareness = worldAbilityCatalog().find((a) => a.slug === "awareness");
    expect(awareness.specialties).toHaveLength(1);
  });

  it("ignores non-ability items in the directory", () => {
    withWorldItems([
      { type: "weapon", name: "Longsword", system: {} },
      worldAbility("Sorcery"),
    ]);
    expect(worldAbilityCatalog()).toHaveLength(CANONICAL_ABILITIES.length + 1);
  });
});

describe("worldAbilityCatalog — memoization (C2.6)", () => {
  it("returns the SAME array instance until invalidated", () => {
    const first = worldAbilityCatalog();
    expect(worldAbilityCatalog()).toBe(first);
  });

  it("invalidatePassiveCatalog() forces a rebuild that sees new items", () => {
    const before = worldAbilityCatalog();
    globalThis.game.items = [worldAbility("Sorcery")];
    // Without invalidation the memo still answers with the old list.
    expect(worldAbilityCatalog()).toBe(before);
    invalidatePassiveCatalog();
    const after = worldAbilityCatalog();
    expect(after).not.toBe(before);
    expect(after.some((a) => a.slug === "sorcery")).toBe(true);
  });
});
