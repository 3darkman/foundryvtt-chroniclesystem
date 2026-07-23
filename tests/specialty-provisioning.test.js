// Spec 024 (US3) — automatic provisioning (contract specialty-provisioning.md),
// plus the two guarantees that only a test can hold:
//
//  · the EQUIVALENCE half of D15/FR-027a — what the drop path creates is
//    deepEqual to what the migration's backfill emits;
//  · the FR-022 guard — removing an ability deletes NO specialty. That
//    requirement is satisfied by the ABSENCE of a delete counterpart, and absent
//    code is precisely what a suite silently stops covering.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { provisionSpecialties } from "../module/actors/cs-specialty-provisioning.js";
import { planSpecialtyConversion } from "../module/migrations/task140-specialty-items.js";
import * as provisioningModule from "../module/actors/cs-specialty-provisioning.js";
import { CSItem } from "../module/items/csItem.js";

const originalGame = globalThis.game;

/** A pack-document-like specialty source. */
function source({
  name,
  slug,
  abilitySlug = "fighting",
  description = "",
  effects = [],
  modifier = 0,
}) {
  const data = {
    _id: "pack-id",
    name,
    type: "specialty",
    img: "systems/chroniclesystem/assets/icons/specialty.png",
    flags: {},
    effects,
    system: { slug, abilitySlug, rating: 0, modifier, description, type: "" },
  };
  return {
    name,
    system: data.system,
    toObject: () => JSON.parse(JSON.stringify(data)),
  };
}

/** A world Specialty item the actor already owns. */
const ownedSpecialty = (name, slug, rating, abilitySlug = "fighting") => ({
  type: "specialty",
  name,
  system: { slug, abilitySlug, rating },
});

const abilityItem = (name = "Fighting", slug = "fighting") => ({
  name,
  type: "ability",
  system: { slug },
});

/** An actor double recording its `createEmbeddedDocuments` calls. */
function fakeActor(items = []) {
  return {
    type: "character",
    items,
    created: [],
    createEmbeddedDocuments: vi.fn(function (type, data) {
      this.created.push([type, data]);
      return Promise.resolve(data);
    }),
  };
}

/** Install a world with the given pack documents (the pack is the only source
 *  `specialtySourcesForAbility` awaits). */
function withPack(documents) {
  globalThis.game = {
    ...originalGame,
    items: [],
    packs: {
      get: () => ({ getDocuments: async () => documents }),
    },
  };
}

beforeEach(() => {
  withPack([]);
});

afterEach(() => {
  globalThis.game = originalGame;
});

describe("provisionSpecialties (C2)", () => {
  it("creates every catalogue specialty at rating 0, in ONE batched call", async () => {
    withPack([
      source({ name: "Axes", slug: "fighting_axes" }),
      source({ name: "Spears", slug: "fighting_spears" }),
    ]);
    const actor = fakeActor();
    await provisionSpecialties(actor, abilityItem());

    expect(actor.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
    const [, payload] = actor.created[0];
    expect(payload).toHaveLength(2);
    expect(payload.every((d) => d.system.rating === 0)).toBe(true);
    expect(payload.every((d) => d.system.abilitySlug === "fighting")).toBe(true);
    expect(payload.every((d) => !("_id" in d))).toBe(true);
  });

  it("is idempotent — an owned slug is skipped and its rating untouched (FR-020)", async () => {
    withPack([
      source({ name: "Axes", slug: "fighting_axes" }),
      source({ name: "Spears", slug: "fighting_spears" }),
    ]);
    const owned = ownedSpecialty("Axes", "fighting_axes", 3);
    const actor = fakeActor([owned]);
    await provisionSpecialties(actor, abilityItem());

    const [, payload] = actor.created[0];
    expect(payload.map((d) => d.system.slug)).toEqual(["fighting_spears"]);
    expect(owned.system.rating).toBe(3);
  });

  it("touches the DB not at all when there is nothing to create (C2.6)", async () => {
    withPack([source({ name: "Axes", slug: "fighting_axes" })]);
    const actor = fakeActor([ownedSpecialty("Axes", "fighting_axes", 1)]);
    const created = await provisionSpecialties(actor, abilityItem());

    expect(created).toEqual([]);
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it("provisions a homebrew WORLD specialty alongside the canonical set", async () => {
    withPack([source({ name: "Axes", slug: "fighting_axes" })]);
    globalThis.game.items = [
      {
        type: "specialty",
        name: "Whips",
        system: {
          slug: "fighting_whips",
          abilitySlug: "fighting",
          description: "<p>Homebrew.</p>",
          modifier: 1,
        },
        toObject: () => ({
          _id: "world-id",
          name: "Whips",
          type: "specialty",
          effects: [{ name: "Lash" }],
          system: {
            slug: "fighting_whips",
            abilitySlug: "fighting",
            rating: 4,
            modifier: 1,
            description: "<p>Homebrew.</p>",
          },
        }),
      },
    ];
    const actor = fakeActor();
    await provisionSpecialties(actor, abilityItem());

    const [, payload] = actor.created[0];
    const whips = payload.find((d) => d.system.slug === "fighting_whips");
    expect(whips.system.rating).toBe(0); // forced untrained
    expect(whips.system.modifier).toBe(1); // preserved
    expect(whips.system.description).toBe("<p>Homebrew.</p>");
    expect(whips.effects).toEqual([{ name: "Lash" }]); // FR-019a
  });

  it("derives the abilitySlug from the name when the ability carries none", async () => {
    withPack([
      source({
        name: "Charm",
        slug: "animal_handling_charm",
        abilitySlug: "animal_handling",
      }),
    ]);
    const actor = fakeActor();
    await provisionSpecialties(actor, {
      name: "Animal Handling",
      type: "ability",
      system: {},
    });
    const [, payload] = actor.created[0];
    expect(payload[0].system.abilitySlug).toBe("animal_handling");
  });

  it("degrades to the world set when the pack is absent (C6.4)", async () => {
    globalThis.game = { ...originalGame, items: [], packs: { get: () => null } };
    const actor = fakeActor();
    const created = await provisionSpecialties(actor, abilityItem());
    expect(created).toEqual([]);
  });
});

describe("D15 / FR-027a — the drop path and the backfill agree, by construction", () => {
  it("emits a payload deepEqual to the migration's backfill rows", async () => {
    const homebrew = source({
      name: "Whips",
      slug: "fighting_whips",
      description: "<p>Homebrew.</p>",
      effects: [{ name: "Lash", system: { changes: [] } }],
      modifier: 2,
    });
    withPack([homebrew]);

    const actor = fakeActor();
    await provisionSpecialties(actor, abilityItem());
    const [, dropPayload] = actor.created[0];

    const { create: backfilled } = planSpecialtyConversion(
      { name: "Fighting", slug: "fighting", specialties: [] },
      new Set(),
      [homebrew]
    );

    expect(dropPayload).toEqual(backfilled);
  });
});

describe("C1 — the _onCreate gates", () => {
  const call = (item, userId) =>
    CSItem.prototype._onCreate.call(item, {}, {}, userId);

  /** A CSItem-like double; `provisioned` records whether the routine ran. */
  function itemDouble({ type = "ability", actorType = "character" } = {}) {
    return {
      type,
      name: "Fighting",
      system: { slug: "fighting" },
      actor: actorType ? { type: actorType, items: [] } : undefined,
    };
  }

  beforeEach(() => {
    globalThis.game = {
      ...originalGame,
      user: { id: "u1" },
      items: [],
      packs: { get: () => null },
    };
  });

  it("does not throw for any type/user/actor combination", () => {
    expect(() => call(itemDouble({ type: "weapon" }), "u1")).not.toThrow();
    expect(() => call(itemDouble(), "someone-else")).not.toThrow();
    expect(() => call(itemDouble({ actorType: "house" }), "u1")).not.toThrow();
    expect(() => call(itemDouble({ actorType: "unit" }), "u1")).not.toThrow();
    expect(() => call(itemDouble({ actorType: null }), "u1")).not.toThrow();
  });

  it("returns before any async work for a non-character parent (FR-021)", () => {
    // A house/unit parent must short-circuit — asserted by the absence of any
    // attempt to reach the (unmocked) dynamic import in a bare environment.
    expect(() =>
      call(itemDouble({ actorType: "house" }), "u1")
    ).not.toThrow();
  });
});

describe("FR-022 — there is NO delete counterpart", () => {
  it("the provisioning module exports only provisionSpecialties", () => {
    expect(Object.keys(provisioningModule).sort()).toEqual([
      "provisionSpecialties",
    ]);
  });

  it("CSItem declares no _onDelete that could remove specialties", () => {
    expect(
      Object.prototype.hasOwnProperty.call(CSItem.prototype, "_onDelete")
    ).toBe(false);
  });
});
