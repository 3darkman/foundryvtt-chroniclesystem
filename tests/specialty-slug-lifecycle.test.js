// Spec 024 — the `specialty` branch of the slug lifecycle (contract
// abilities-tab-modes.md C7). A specialty's identity is SCOPED by its owning
// ability, so the same name under two abilities must yield two distinct slugs
// (FR-006); a GM-set slug is never overwritten.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { registerSlugLifecycleHooks } from "../module/data/slug-lifecycle.js";

/** Capture the hook callbacks the module registers. */
const hooks = {};
globalThis.Hooks = {
  on(event, fn) {
    hooks[event] = fn;
  },
};
globalThis.foundry.utils = {
  getProperty: (obj, path) =>
    path.split(".").reduce((acc, key) => acc?.[key], obj),
  setProperty: (obj, path, value) => {
    const keys = path.split(".");
    const last = keys.pop();
    const target = keys.reduce((acc, key) => (acc[key] ??= {}), obj);
    target[last] = value;
    return true;
  },
};

registerSlugLifecycleHooks();

/** A specialty item double whose `updateSource` records the applied patch. */
function makeSpecialty({
  name,
  slug = "",
  abilitySlug = "",
  id = "s1",
  siblings = [],
  pack = null,
}) {
  const item = {
    id,
    name,
    type: "specialty",
    pack,
    isEmbedded: false,
    system: { slug, abilitySlug },
    applied: null,
    updateSource(update) {
      this.applied = update;
      if ("system.slug" in update) this.system.slug = update["system.slug"];
    },
  };
  globalThis.game.items = [...siblings, item];
  return item;
}

beforeEach(() => {
  globalThis.game.items = [];
  globalThis.game.i18n.format = vi.fn(() => "collision");
});

describe("specialty slug derivation on create (C7.2)", () => {
  it("derives `<abilitySlug>_<slugify(name)>` when the slug is blank", () => {
    const item = makeSpecialty({ name: "Convince", abilitySlug: "persuasion" });
    hooks.preCreateItem(item);
    expect(item.applied["system.slug"]).toBe("persuasion_convince");
  });

  it("preserves a GM-set slug", () => {
    const item = makeSpecialty({
      name: "Convince",
      slug: "my_custom_slug",
      abilitySlug: "persuasion",
    });
    hooks.preCreateItem(item);
    expect(item.applied).toBeNull();
    expect(item.system.slug).toBe("my_custom_slug");
  });

  it("yields two distinct slugs for one name under two abilities (FR-006)", () => {
    const persuasion = makeSpecialty({
      name: "Charm",
      abilitySlug: "persuasion",
    });
    hooks.preCreateItem(persuasion);
    const animals = makeSpecialty({
      name: "Charm",
      abilitySlug: "animal_handling",
    });
    hooks.preCreateItem(animals);
    expect(persuasion.applied["system.slug"]).toBe("persuasion_charm");
    expect(animals.applied["system.slug"]).toBe("animal_handling_charm");
    expect(persuasion.applied["system.slug"]).not.toBe(
      animals.applied["system.slug"]
    );
  });

  it("writes no slug when the name yields none", () => {
    const item = makeSpecialty({ name: "", abilitySlug: "persuasion" });
    hooks.preCreateItem(item);
    expect(item.applied).toBeNull();
  });

  // Post-implement fix (2026-07-23) — "Create Item" has no field for the
  // owning Ability, so a hand-authored Specialty is ALWAYS born with a blank
  // abilitySlug. The original create-time derivation scoped against that blank
  // value and wrote a malformed `"_<name>"` slug (empty ability prefix) that
  // then never corrected itself, because a non-blank slug is never silently
  // overwritten (FR-012) — the GM picking an Ability afterwards had no effect.
  it("writes NO slug at all when the ability is not yet known — leaves it derivable later", () => {
    const item = makeSpecialty({ name: "Convince", abilitySlug: "" });
    hooks.preCreateItem(item);
    expect(item.applied).toBeNull();
    expect(item.system.slug).toBe("");
  });
});

describe("the create-then-link-ability flow derives the slug correctly (US4)", () => {
  it("derives the scoped slug on the UPDATE that first sets abilitySlug", () => {
    // Step 1: "Create Item" — name known, ability not yet chosen.
    const item = makeSpecialty({ name: "Convince", abilitySlug: "" });
    hooks.preCreateItem(item);
    expect(item.system.slug).toBe("");

    // Step 2: the GM picks "Persuasion" from the sheet's Owning Ability select.
    const changes = { system: { abilitySlug: "persuasion" } };
    hooks.preUpdateItem(item, changes);
    expect(changes.system.slug).toBe("persuasion_convince");
  });

  it("still derives correctly when the ability is set together with a rename", () => {
    const item = makeSpecialty({ name: "New Specialty", abilitySlug: "" });
    hooks.preCreateItem(item);

    const changes = { name: "Whips", system: { abilitySlug: "fighting" } };
    hooks.preUpdateItem(item, changes);
    expect(changes.system.slug).toBe("fighting_whips");
  });

  it("two specialties created blank then linked to different abilities get distinct slugs", () => {
    const persuasionCharm = makeSpecialty({ name: "Charm", abilitySlug: "" });
    hooks.preCreateItem(persuasionCharm);
    const animalCharm = makeSpecialty({ name: "Charm", abilitySlug: "", id: "s2" });
    hooks.preCreateItem(animalCharm);

    const changesA = { system: { abilitySlug: "persuasion" } };
    hooks.preUpdateItem(persuasionCharm, changesA);
    const changesB = { system: { abilitySlug: "animal_handling" } };
    hooks.preUpdateItem(animalCharm, changesB);

    expect(changesA.system.slug).toBe("persuasion_charm");
    expect(changesB.system.slug).toBe("animal_handling_charm");
  });

  it("does not touch an already-scoped slug when the ability is changed again (sticky identity)", () => {
    // Once a slug is non-blank it is GM-owned (FR-012) — reparenting an
    // ALREADY-linked specialty is a distinct, deliberately unhandled case: the
    // fix only unblocks the "still blank" path, it does not add silent re-
    // scoping on every ability change.
    const item = makeSpecialty({
      name: "Charm",
      slug: "persuasion_charm",
      abilitySlug: "persuasion",
    });
    const changes = { system: { abilitySlug: "animal_handling" } };
    hooks.preUpdateItem(item, changes);
    expect(changes.system?.slug).toBeUndefined();
  });
});

// Post-implement fix (2026-07-23) — the SILENT REJECTION already special-cased
// `item.pack` (D17/C7.3a) because a pack document is not embedded, so its
// "siblings" would be resolved against the WORLD — but the collision WARNING
// right next to it (siblingSlugs, shared by every type) was left ungated. Once
// a generated compendium (specialties, abilities, qualities) has been upserted
// once and its slugs also exist in the world, every SUBSEQUENT `ready` would
// re-run the upsert, "discover" that collision on every row, and spam a
// non-blocking warning per row, forever.
describe("collision warning is suppressed for a pack document (spec 024)", () => {
  it("warns on a world/actor collision (baseline, unaffected)", () => {
    // The sibling is under a DIFFERENT ability, so the specialty-specific
    // duplicate REJECTION (which is ability-scoped) does not itself reject
    // this creation — isolating the generic, ability-blind WARNING path that
    // `siblingSlugs` drives for every item type.
    const item = makeSpecialty({
      name: "Convince",
      abilitySlug: "persuasion",
      siblings: [
        {
          id: "w1",
          name: "Convince",
          type: "specialty",
          system: { slug: "persuasion_convince", abilitySlug: "deception" },
        },
      ],
    });
    hooks.preCreateItem(item);
    expect(game.i18n.format).toHaveBeenCalled();
  });

  it("does NOT warn for the identical collision when the document targets a pack", () => {
    const item = makeSpecialty({
      name: "Convince",
      abilitySlug: "persuasion",
      pack: "chroniclesystem.specialties",
      siblings: [{ id: "w1", name: "Convince", type: "specialty", system: {} }],
    });
    hooks.preCreateItem(item);
    expect(game.i18n.format).not.toHaveBeenCalled();
  });

  it("does not warn on update either, for a pack document", () => {
    const item = makeSpecialty({
      name: "Convince",
      slug: "persuasion_convince",
      abilitySlug: "persuasion",
      pack: "chroniclesystem.specialties",
      siblings: [
        {
          id: "w1",
          name: "Convince",
          type: "specialty",
          system: { slug: "persuasion_convince" },
        },
      ],
    });
    hooks.preUpdateItem(item, { name: "Convince" });
    expect(game.i18n.format).not.toHaveBeenCalled();
  });
});

describe("silent duplicate rejection (C7.3 / FR-006a)", () => {
  const sibling = (slug, abilitySlug) => ({
    id: "other",
    name: "Existing",
    type: "specialty",
    system: { slug, abilitySlug },
  });

  it("returns false for a colliding sibling under the SAME ability", () => {
    const item = makeSpecialty({
      name: "Convince",
      abilitySlug: "persuasion",
      siblings: [sibling("persuasion_convince", "persuasion")],
    });
    expect(hooks.preCreateItem(item)).toBe(false);
  });

  it("leaves the existing sibling untouched", () => {
    const existing = sibling("persuasion_convince", "persuasion");
    const item = makeSpecialty({
      name: "Convince",
      abilitySlug: "persuasion",
      siblings: [existing],
    });
    hooks.preCreateItem(item);
    expect(existing.system).toEqual({
      slug: "persuasion_convince",
      abilitySlug: "persuasion",
    });
  });

  it("allows the same NAME under a different ability (FR-006)", () => {
    const item = makeSpecialty({
      name: "Charm",
      abilitySlug: "animal_handling",
      siblings: [sibling("persuasion_charm", "persuasion")],
    });
    expect(hooks.preCreateItem(item)).not.toBe(false);
  });

  it("drops only the colliding entry of a batch, never its siblings", () => {
    const existing = sibling("fighting_axes", "fighting");
    const results = ["Axes", "Spears"].map((name) => {
      const item = makeSpecialty({
        name,
        abilitySlug: "fighting",
        id: name,
        siblings: [existing],
      });
      return hooks.preCreateItem(item);
    });
    expect(results[0]).toBe(false);
    expect(results[1]).not.toBe(false);
  });

  it("never rejects a creation targeting a compendium pack (C7.3a / D17)", () => {
    // A pack document is NOT embedded, so `siblingSlugs` would compare it to the
    // WORLD — and once the conversion has materialised canonical slugs there,
    // re-seeding the pack would silently drop rows, quietly turning SC-005's 76
    // into fewer with no error anywhere.
    const item = makeSpecialty({
      name: "Convince",
      abilitySlug: "persuasion",
      pack: "chroniclesystem.specialties",
      siblings: [sibling("persuasion_convince", "persuasion")],
    });
    expect(hooks.preCreateItem(item)).not.toBe(false);
  });

  it("does not reject a non-specialty type on a slug collision", () => {
    const ability = {
      id: "a1",
      name: "Persuasion",
      type: "ability",
      system: { slug: "" },
      updateSource() {},
    };
    globalThis.game.items = [
      { id: "a0", name: "Persuasion", type: "ability", system: {} },
      ability,
    ];
    expect(hooks.preCreateItem(ability)).not.toBe(false);
  });
});

describe("the hook wrapper propagates the return value (C7.3b / D17)", () => {
  it("passes a handler's `false` through", () => {
    const item = makeSpecialty({
      name: "Convince",
      abilitySlug: "persuasion",
      siblings: [
        {
          id: "other",
          name: "Existing",
          type: "specialty",
          system: { slug: "persuasion_convince", abilitySlug: "persuasion" },
        },
      ],
    });
    expect(hooks.preCreateItem(item)).toBe(false);
  });

  it("still yields undefined when the handler throws — an error never blocks a legitimate creation", () => {
    const broken = {
      get name() {
        throw new Error("boom");
      },
      type: "specialty",
      system: {},
    };
    expect(hooks.preCreateItem(broken)).toBeUndefined();
  });
});

describe("specialty slug derivation on update", () => {
  it("re-derives the scoped slug on rename when the slug is blank", () => {
    const item = makeSpecialty({ name: "Convince", abilitySlug: "persuasion" });
    const changes = { name: "Cajole" };
    hooks.preUpdateItem(item, changes);
    expect(changes.system.slug).toBe("persuasion_cajole");
  });

  it("scopes by the NEW abilitySlug when the link is being changed", () => {
    const item = makeSpecialty({ name: "Charm", abilitySlug: "persuasion" });
    const changes = { system: { abilitySlug: "animal_handling" } };
    hooks.preUpdateItem(item, changes);
    expect(changes.system.slug).toBe("animal_handling_charm");
  });

  it("never overwrites a GM-set slug", () => {
    const item = makeSpecialty({
      name: "Charm",
      slug: "kept",
      abilitySlug: "persuasion",
    });
    const changes = { name: "Renamed" };
    hooks.preUpdateItem(item, changes);
    expect(changes.system?.slug).toBeUndefined();
  });
});
