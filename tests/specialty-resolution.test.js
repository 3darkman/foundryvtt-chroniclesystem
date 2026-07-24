// Spec 024 — the shape-preserving adapter and the two rewritten csActor
// resolvers (contract specialty-resolution.md C2–C4). These two methods are the
// ONLY way the rolling engine reaches a specialty, which is why getting their
// shape right is what keeps ChronicleSystem.js at a zero diff.

import { describe, it, expect } from "vitest";
import { makeFakeActor, makeAbilityItem, makeSpecialtyItem } from "./helpers/doubles.js";

function actorWith(abilities, specialties) {
  return makeFakeActor({ abilities, specialties });
}

const persuasion = () =>
  makeAbilityItem("Persuasion", 4, { slug: "persuasion" });
const animalHandling = () =>
  makeAbilityItem("Animal Handling", 3, { slug: "animal_handling" });

describe("SpecialtyAdapter shape (C2)", () => {
  it("is a plain object with exactly the four keys resolveTraitBase reads", () => {
    const actor = actorWith(
      [persuasion()],
      [
        makeSpecialtyItem({
          name: "Convince",
          abilitySlug: "persuasion",
          rating: 3,
          modifier: 1,
        }),
      ]
    );
    const [, adapter] = actor.getAbilityBySpecialty("Persuasion", "Convince");
    expect(Object.keys(adapter).sort()).toEqual([
      "modifier",
      "name",
      "rating",
      "slug",
    ]);
    expect(adapter).toEqual({
      name: "Convince",
      rating: 3,
      modifier: 1,
      slug: "persuasion_convince",
    });
  });

  it("is never the item document (nothing downstream may mutate it)", () => {
    const item = makeSpecialtyItem({
      name: "Convince",
      abilitySlug: "persuasion",
      rating: 3,
    });
    const actor = actorWith([persuasion()], [item]);
    const [, adapter] = actor.getAbilityBySpecialty("Persuasion", "Convince");
    expect(adapter).not.toBe(item);
    expect(adapter.type).toBeUndefined();
  });

  it("coerces rating/modifier with Number(x) || 0 (C2.2)", () => {
    const actor = actorWith(
      [persuasion()],
      [
        makeSpecialtyItem({
          name: "Convince",
          abilitySlug: "persuasion",
          rating: null,
          modifier: undefined,
        }),
      ]
    );
    const [, adapter] = actor.getAbilityBySpecialty("Persuasion", "Convince");
    expect(adapter.rating).toBe(0);
    expect(adapter.modifier).toBe(0);
  });

  it("falls back to the scoped derivation when the slug is blank (C2.3)", () => {
    const actor = actorWith(
      [persuasion()],
      [
        makeSpecialtyItem({
          name: "Convince",
          slug: "",
          abilitySlug: "persuasion",
          rating: 2,
        }),
      ]
    );
    const [, adapter] = actor.getAbilityBySpecialty("Persuasion", "Convince");
    expect(adapter.slug).toBe("persuasion_convince");
  });
});

describe("getAbilityBySpecialty (C3)", () => {
  it("matches the ability by display name, case-insensitively", () => {
    const actor = actorWith(
      [persuasion()],
      [
        makeSpecialtyItem({
          name: "Convince",
          abilitySlug: "persuasion",
          rating: 3,
        }),
      ]
    );
    const [ability, adapter] = actor.getAbilityBySpecialty(
      "persuasion",
      "convince"
    );
    expect(ability?.name).toBe("Persuasion");
    expect(adapter?.rating).toBe(3);
  });

  it("scopes the specialty by the ability's slug — the 'Charm' case (C3.5)", () => {
    const actor = actorWith(
      [persuasion(), animalHandling()],
      [
        makeSpecialtyItem({
          name: "Charm",
          abilitySlug: "persuasion",
          rating: 5,
        }),
        makeSpecialtyItem({
          name: "Charm",
          abilitySlug: "animal_handling",
          rating: 1,
        }),
      ]
    );
    const [, fromPersuasion] = actor.getAbilityBySpecialty(
      "Persuasion",
      "Charm"
    );
    const [, fromAnimals] = actor.getAbilityBySpecialty(
      "Animal Handling",
      "Charm"
    );
    expect(fromPersuasion.rating).toBe(5);
    expect(fromPersuasion.slug).toBe("persuasion_charm");
    expect(fromAnimals.rating).toBe(1);
    expect(fromAnimals.slug).toBe("animal_handling_charm");
  });

  // Deliberate divergence from the contract's C3.4 letter, in favour of its own
  // C1 ("ChronicleSystem.js is not edited"): `resolveTraitBase` only falls
  // through to `getAbilityBySpecialtySlug` while `ability === undefined`, so
  // returning the ability here would swallow the slug fallback and break SC-002
  // (the `calculateMovementData` "athletics_run" case in the parity harness).
  // This is the pre-024 behaviour, kept verbatim.
  it("returns [undefined, undefined] when the specialty does not resolve, so the slug fallback still fires", () => {
    const actor = actorWith([persuasion()], []);
    expect(actor.getAbilityBySpecialty("Persuasion", "Convince")).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("returns [undefined, undefined] when neither is owned (C3.4)", () => {
    const actor = actorWith([], []);
    expect(actor.getAbilityBySpecialty("Persuasion", "Convince")).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("resolves an ability whose slug was set but whose name was renamed", () => {
    const actor = actorWith(
      [makeAbilityItem("Persuadir", 4, { slug: "persuasion" })],
      [
        makeSpecialtyItem({
          name: "Convince",
          abilitySlug: "persuasion",
          rating: 2,
        }),
      ]
    );
    const [ability, adapter] = actor.getAbilityBySpecialty(
      "Persuadir",
      "Convince"
    );
    expect(ability?.name).toBe("Persuadir");
    expect(adapter?.slug).toBe("persuasion_convince");
  });
});

describe("getAbilityBySpecialtySlug (C4)", () => {
  it("finds the specialty by a flat scan and resolves the owning ability after", () => {
    const actor = actorWith(
      [persuasion()],
      [
        makeSpecialtyItem({
          name: "Convince",
          abilitySlug: "persuasion",
          rating: 3,
        }),
      ]
    );
    const [ability, adapter] = actor.getAbilityBySpecialtySlug(
      "persuasion_convince"
    );
    expect(ability?.name).toBe("Persuasion");
    expect(adapter).toEqual({
      name: "Convince",
      rating: 3,
      modifier: 0,
      slug: "persuasion_convince",
    });
  });

  it("returns [undefined, adapter] for an orphan whose ability is absent (C4.3)", () => {
    const actor = actorWith(
      [],
      [
        makeSpecialtyItem({
          name: "Convince",
          abilitySlug: "persuasion",
          rating: 3,
        }),
      ]
    );
    const [ability, adapter] = actor.getAbilityBySpecialtySlug(
      "persuasion_convince"
    );
    expect(ability).toBeUndefined();
    expect(adapter?.rating).toBe(3);
  });

  it("returns [undefined, undefined] for an unknown slug (C4.4)", () => {
    const actor = actorWith([persuasion()], []);
    expect(actor.getAbilityBySpecialtySlug("persuasion_convince")).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("matches a blank-slug specialty by its scoped derivation", () => {
    const actor = actorWith(
      [persuasion()],
      [
        makeSpecialtyItem({
          name: "Convince",
          slug: "",
          abilitySlug: "persuasion",
          rating: 1,
        }),
      ]
    );
    const [, adapter] = actor.getAbilityBySpecialtySlug("persuasion_convince");
    expect(adapter?.rating).toBe(1);
  });
});

// Post-implement fix (2026-07-23) — specialtySlugForRef (cs-effect-modifiers.js)
// resolves an effect/roll's target specialty by NAME as a fallback when no exact
// scoped-slug match exists. That name match ignored the caller's own ability
// scope, so a character owning BOTH "Charm" specialties (Animal Handling's and
// Persuasion's — every fully-provisioned character does, post-024) could have an
// effect/roll targeting one resolve to whichever item happened to come first in
// `actor.items`. Exercised through the exported collectors, which are the only
// public surface over the private resolver.
describe("specialtySlugForRef is scoped by ability (post-implement fix)", () => {
  it("an effect authored for Persuasion's Charm never leaks onto Animal Handling's Charm", async () => {
    const { collectPermanentRollEffects } = await import(
      "../module/effects/cs-effect-modifiers.js"
    );
    const actor = actorWith(
      [persuasion(), animalHandling()],
      [
        makeSpecialtyItem({ name: "Charm", abilitySlug: "persuasion", rating: 2 }),
        makeSpecialtyItem({
          name: "Charm",
          abilitySlug: "animal_handling",
          rating: 1,
        }),
      ]
    );
    actor.appliedEffects = [
      {
        id: "eff",
        name: "Silver Tongue",
        disabled: false,
        isSuppressed: false,
        system: {
          changes: [
            { key: "cs.bonusdice.specialty.persuasion_charm", value: "1" },
          ],
        },
        getFlag: () => false,
      },
    ];

    const onPersuasionCharm = collectPermanentRollEffects(
      actor,
      "Persuasion",
      "Charm"
    );
    expect(onPersuasionCharm).toHaveLength(1);

    const onAnimalHandlingCharm = collectPermanentRollEffects(
      actor,
      "Animal Handling",
      "Charm"
    );
    expect(onAnimalHandlingCharm).toHaveLength(0);
  });
});
