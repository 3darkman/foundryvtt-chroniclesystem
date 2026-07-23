import { describe, it, expect, afterEach } from "vitest";
import {
  worldAbilityCatalog,
  invalidatePassiveCatalog,
  targetPassiveOptions,
} from "../module/rolls/cs-passive-catalog.js";
import { CANONICAL_ABILITIES } from "../module/vocabulary/cs-canonical-abilities.js";
import {
  makeFakeActor,
  makeAbilityItem,
  makeSpecialtyItem,
} from "./helpers/doubles.js";

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

const worldAbility = (name, { slug } = {}) => ({
  type: "ability",
  name,
  system: { slug },
});

// spec 024 — an ability's specialties are their OWN world items now, linked by
// the ability's slug (the catalogue unions them with the canonical set).
const worldSpecialty = (name, abilitySlug, { slug } = {}) => ({
  type: "specialty",
  name,
  system: { slug, abilitySlug },
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
      worldAbility("Vigilance", { slug: "awareness" }),
      worldSpecialty("Sixth Sense", "awareness"),
    ]);
    const awareness = worldAbilityCatalog().find((a) => a.slug === "awareness");
    expect(awareness.name).toBe("Vigilance");
    expect(awareness.nameKey).toBeNull();
    // World entries first, then the canonical ones the world does not override.
    expect(awareness.specialties.map((s) => s.slug)).toEqual([
      "awareness_sixth_sense",
      "awareness_empathy",
      "awareness_notice",
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
      worldAbility("Awareness"),
      worldSpecialty("Empathy", "awareness"),
      worldSpecialty("empathy", "awareness"),
    ]);
    const awareness = worldAbilityCatalog().find((a) => a.slug === "awareness");
    // The two collapse into one; the canonical "Notice" still rides along.
    expect(
      awareness.specialties.filter((s) => s.slug === "awareness_empathy")
    ).toHaveLength(1);
    expect(awareness.specialties).toHaveLength(2);
  });

  it("ignores non-ability items in the directory", () => {
    withWorldItems([
      { type: "weapon", name: "Longsword", system: {} },
      worldAbility("Sorcery"),
    ]);
    expect(worldAbilityCatalog()).toHaveLength(CANONICAL_ABILITIES.length + 1);
  });
});

// spec 024 — targetPassiveOptions section 2 ("the TARGET's own abilities") reads the
// target's Specialty ITEMS, not the deprecated embedded array. This was the gap the
// original task list missed: with the legacy reader, a post-024 character's own rated
// specialties silently stopped being offered as "from the target".
describe("targetPassiveOptions — the target's OWN specialties (spec 024)", () => {
  /** A target character owning Awareness, with Empathy at 3 and Notice at 0. */
  function targetActor({ ratings = { Empathy: 3, Notice: 0 } } = {}) {
    const ability = makeAbilityItem("Awareness", 4, { slug: "awareness" });
    ability._id = "ab-aware";
    ability.id = "ab-aware";
    const specialties = Object.entries(ratings).map(([name, rating]) =>
      makeSpecialtyItem({ name, abilitySlug: "awareness", rating })
    );
    const actor = makeFakeActor({ abilities: [ability], specialties });
    actor.type = "character";
    return actor;
  }

  /** The option keys of the "Awareness" group. */
  function awarenessKeys(actor) {
    const groups = targetPassiveOptions(actor, {}, { showValues: true });
    const group = groups.find((g) => g.label === "Awareness");
    return group ? group.options.map((o) => o.key) : [];
  }

  it("offers a RATED specialty as the target's own", () => {
    const keys = awarenessKeys(targetActor());
    expect(keys).toContain("own:ab-aware:awareness_empathy");
  });

  it("does NOT offer a rating-0 specialty as the target's own", () => {
    // Post-024 a character owns EVERY specialty of every ability they have, so
    // without the rated-only rule the picker would list all 76 as "from target".
    const keys = awarenessKeys(targetActor());
    expect(keys).not.toContain("own:ab-aware:awareness_notice");
  });

  it("still offers the unrated one through the catalogue extension", () => {
    const keys = awarenessKeys(targetActor());
    expect(keys).toContain("cat:awareness:awareness_notice");
  });

  it("never lists a specialty twice across the two sections", () => {
    const keys = awarenessKeys(targetActor());
    expect(keys.filter((k) => k.endsWith("awareness_empathy"))).toHaveLength(1);
  });

  it("groups a homebrew specialty of the target under its ability", () => {
    const actor = targetActor({ ratings: {} });
    actor.items.push(
      makeSpecialtyItem({
        name: "Sixth Sense",
        abilitySlug: "awareness",
        rating: 2,
      })
    );
    expect(awarenessKeys(actor)).toContain("own:ab-aware:awareness_sixth_sense");
  });

  it("ignores a specialty linked to an ability the target does not own", () => {
    const actor = targetActor({ ratings: {} });
    actor.items.push(
      makeSpecialtyItem({ name: "Charm", abilitySlug: "persuasion", rating: 3 })
    );
    const groups = targetPassiveOptions(actor, {}, { showValues: true });
    const persuasion = groups.find((g) => g.label === "Persuasion");
    // It reaches the picker only through the catalogue extension, never as "own".
    const ownKeys = (persuasion?.options ?? []).filter((o) =>
      o.key.startsWith("own:")
    );
    expect(ownKeys).toHaveLength(0);
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
