import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CSActor } from "../module/actors/csActor.js";
import { CSUnitActorSheet } from "../module/actors/sheets/csUnitActorSheet.js";
import { grantTypeAbilities } from "../module/actors/cs-unit-type-provisioning.js";
import {
  makeAbilityItem,
  makeFakeUnitActor,
  makeUnitTypeItem,
} from "./helpers/doubles.js";

// spec 025 (T010) — contracts/unit-type-assignment.md C1-C5. Slug uniqueness,
// first-assigned-becomes-primary, manual re-designation, auto-promotion, and the
// granted-ability provenance union / removal.

const actorProto = CSActor.prototype;
const sheetProto = CSUnitActorSheet.prototype;
const USER_ID = "spec-025-user";

let originalUser;
beforeEach(() => {
  originalUser = globalThis.game.user;
  globalThis.game.user = { id: USER_ID };
});
afterEach(() => {
  globalThis.game.user = originalUser;
});

/** An ability item double carrying a mutable `grantedBy` provenance flag. */
function makeGrantedAbility(name, slug, grantedBy) {
  const ability = makeAbilityItem(name, 2, { slug });
  ability.id = slug;
  ability.flags = grantedBy ? { chroniclesystem: { grantedBy } } : {};
  ability.getFlag = (scope, key) => ability.flags?.[scope]?.[key];
  ability.setFlag = async (scope, key, value) => {
    ability.flags[scope] = { ...(ability.flags[scope] ?? {}), [key]: value };
    return ability;
  };
  return ability;
}

/**
 * A minimal sheet double. `_onDropItem` really calls `super._onDropItem`, so the
 * actor must satisfy the INHERITED handler too (uuid, createEmbeddedDocuments,
 * `onObtained` on what it returns) — that path is exercised, not stubbed.
 */
function makeSheetDouble(actor) {
  const calls = { updates: [], embedded: [], grants: [] };
  actor.uuid = "Actor.unit";
  actor.isOwner = true;
  actor.update = async (data) => {
    calls.updates.push(data);
    if ("system.primaryTypeSlug" in data)
      actor.getCSData().primaryTypeSlug = data["system.primaryTypeSlug"];
  };
  actor.createEmbeddedDocuments = async (type, payloads) => {
    for (const payload of payloads) {
      if (payload.type === "unitType") {
        calls.embedded.push(payload);
        actor.items.push(payload);
      } else {
        calls.grants.push(payload);
      }
    }
    return payloads.map((payload) => ({ ...payload, onObtained() {} }));
  };
  return {
    actor,
    document: actor,
    isEditable: true,
    itemTypesPermitted: ["unitType", "ability"],
    isItemPermitted: sheetProto.isItemPermitted,
    calls,
  };
}

describe("unit type assignment — slug uniqueness (FR-003, C3)", () => {
  it("blocks a second Unit Type carrying the same stable slug", async () => {
    const infantry = makeUnitTypeItem({ slug: "infantry", name: "Infantry" });
    const actor = makeFakeUnitActor({ types: [infantry] });
    const sheet = makeSheetDouble(actor);
    const duplicate = makeUnitTypeItem({
      id: "other",
      slug: "infantry",
      name: "Infanteria",
    });

    const result = await sheetProto._onDropItem.call(sheet, {}, duplicate);

    expect(result).toBeNull();
    expect(sheet.calls.embedded).toHaveLength(0);
    expect(actor.items.filter((i) => i.type === "unitType")).toHaveLength(1);
  });

  it("falls through to the inherited handler for a non-unitType drop", async () => {
    const actor = makeFakeUnitActor();
    const sheet = makeSheetDouble(actor);
    const ability = makeAbilityItem("Deception", 2, { slug: "deception" });
    ability.toObject = () => ability;

    await sheetProto._onDropItem.call(sheet, {}, ability);

    expect(sheet.calls.grants).toEqual([ability]);
    expect(sheet.calls.updates).toHaveLength(0);
  });
});

describe("unit type assignment — the primary type (FR-003a, C1/C2/C4)", () => {
  it("designates the FIRST assigned type as primary", async () => {
    const actor = makeFakeUnitActor();
    const sheet = makeSheetDouble(actor);
    const infantry = makeUnitTypeItem({ slug: "infantry", name: "Infantry" });

    await sheetProto._onDropItem.call(sheet, {}, infantry);

    expect(actor.getCSData().primaryTypeSlug).toBe("infantry");
  });

  it("leaves the pointer alone when a SECOND type is assigned", async () => {
    const infantry = makeUnitTypeItem({ slug: "infantry", name: "Infantry" });
    const actor = makeFakeUnitActor({
      types: [infantry],
      data: { primaryTypeSlug: "infantry" },
    });
    const sheet = makeSheetDouble(actor);

    await sheetProto._onDropItem.call(
      sheet,
      {},
      makeUnitTypeItem({ id: "archers", slug: "archers", name: "Archers" })
    );

    expect(actor.getCSData().primaryTypeSlug).toBe("infantry");
    expect(actorProto.effectivePrimaryType.call(actor).name).toBe("Infantry");
  });

  it("re-designates the primary through the setPrimaryType action", async () => {
    const actor = makeFakeUnitActor({
      types: [
        makeUnitTypeItem({ id: "a", slug: "infantry", name: "Infantry" }),
        makeUnitTypeItem({ id: "b", slug: "archers", name: "Archers" }),
      ],
      data: { primaryTypeSlug: "infantry" },
    });
    const sheet = makeSheetDouble(actor);

    await CSUnitActorSheet._onSetPrimaryType.call(
      sheet,
      { preventDefault() {} },
      { dataset: { typeSlug: "archers" } }
    );
    expect(actor.getCSData().primaryTypeSlug).toBe("archers");
    expect(actorProto.effectivePrimaryType.call(actor).name).toBe("Archers");
  });

  it("ignores a stale slug the unit no longer owns", async () => {
    const actor = makeFakeUnitActor({
      types: [makeUnitTypeItem({ id: "a", slug: "infantry", name: "Infantry" })],
      data: { primaryTypeSlug: "infantry" },
    });
    const sheet = makeSheetDouble(actor);

    await CSUnitActorSheet._onSetPrimaryType.call(
      sheet,
      { preventDefault() {} },
      { dataset: { typeSlug: "cavalry" } }
    );

    expect(actor.getCSData().primaryTypeSlug).toBe("infantry");
  });

  it("auto-promotes the oldest survivor when the primary is removed", () => {
    const actor = makeFakeUnitActor({
      types: [
        makeUnitTypeItem({
          id: "b",
          slug: "archers",
          name: "Archers",
          createdTime: 200,
        }),
        makeUnitTypeItem({
          id: "c",
          slug: "cavalry",
          name: "Cavalry",
          createdTime: 300,
        }),
      ],
      data: { primaryTypeSlug: "infantry" },
    });

    expect(actorProto.effectivePrimaryType.call(actor).name).toBe("Archers");
  });
});

describe("granted abilities — provenance union (FR-003b, C3a)", () => {
  it("mints a missing ability tagged with the granting type's slug", async () => {
    const actor = makeFakeUnitActor();
    const created = [];
    actor.createEmbeddedDocuments = async (type, payloads) => {
      created.push(...payloads);
      return payloads;
    };

    await grantTypeAbilities(actor, "infantry", [
      { slug: "fighting", name: "Fighting" },
    ]);

    expect(created).toHaveLength(1);
    expect(created[0].system.slug).toBe("fighting");
    expect(created[0].flags.chroniclesystem.grantedBy).toEqual(["infantry"]);
    // The base rank has ONE home — the AbilityData schema initial, not this call.
    expect(created[0].system.rating).toBeUndefined();
  });

  it("unions the slug into an ability the unit already owns, never resetting it", async () => {
    const fighting = makeGrantedAbility("Fighting", "fighting", ["infantry"]);
    fighting.system.rating = 4;
    const actor = makeFakeUnitActor({ abilities: [fighting] });
    let createCalled = false;
    actor.createEmbeddedDocuments = async () => {
      createCalled = true;
      return [];
    };

    await grantTypeAbilities(actor, "outriders", [
      { slug: "fighting", name: "Fighting" },
    ]);

    expect(createCalled).toBe(false);
    expect(fighting.getFlag("chroniclesystem", "grantedBy")).toEqual([
      "infantry",
      "outriders",
    ]);
    expect(fighting.system.rating).toBe(4);
  });

  it("grants the chosen wildcards alongside the fixed abilities", async () => {
    const actor = makeFakeUnitActor();
    const created = [];
    actor.createEmbeddedDocuments = async (type, payloads) => {
      created.push(...payloads);
      return payloads;
    };

    await grantTypeAbilities(
      actor,
      "infantry",
      [{ slug: "fighting", name: "Fighting" }],
      ["awareness"]
    );

    expect(created.map((entry) => entry.system.slug)).toEqual([
      "fighting",
      "awareness",
    ]);
  });
});

describe("granted abilities — removal by provenance (C5, invariants I6/I7)", () => {
  function makeUnitWithProvenance() {
    const fighting = makeGrantedAbility("Fighting", "fighting", ["infantry"]);
    const athletics = makeGrantedAbility("Athletics", "athletics", [
      "infantry",
      "outriders",
    ]);
    const deception = makeGrantedAbility("Deception", "deception", null);
    const outriders = makeUnitTypeItem({
      id: "outriders",
      slug: "outriders",
      name: "Outriders",
    });
    const actor = makeFakeUnitActor({
      types: [outriders],
      abilities: [fighting, athletics, deception],
    });
    actor.updateEmbeddedDocuments = async (type, updates) => {
      actor.updates = updates;
      return updates;
    };
    actor.deleteEmbeddedDocuments = async (type, ids) => {
      actor.deleted = ids;
      return ids;
    };
    return { actor, fighting, athletics, deception };
  }

  it("deletes an ability only the removed type granted, keeps a shared one", async () => {
    const { actor } = makeUnitWithProvenance();
    const removed = makeUnitTypeItem({ slug: "infantry", name: "Infantry" });

    await actorProto._removeGrantedAbilities.call(actor, [removed]);

    expect(actor.deleted).toEqual(["fighting"]);
    expect(actor.updates).toEqual([
      { _id: "athletics", "flags.chroniclesystem.grantedBy": ["outriders"] },
    ]);
  });

  it("never touches a manually dropped ability (no provenance flag)", async () => {
    const { actor } = makeUnitWithProvenance();
    const removed = makeUnitTypeItem({ slug: "infantry", name: "Infantry" });

    await actorProto._removeGrantedAbilities.call(actor, [removed]);

    expect(actor.deleted).not.toContain("deception");
    expect(actor.updates.map((u) => u._id)).not.toContain("deception");
  });

  it("does nothing when the deleted documents contain no Unit Type", async () => {
    const { actor } = makeUnitWithProvenance();

    await actorProto._removeGrantedAbilities.call(actor, [
      makeAbilityItem("Fighting", 2, { slug: "fighting" }),
    ]);

    expect(actor.deleted).toBeUndefined();
    expect(actor.updates).toBeUndefined();
  });

  it("runs the cascade on ONE client only (userId gate)", async () => {
    const { actor } = makeUnitWithProvenance();
    actor._removeGrantedAbilities = () => {
      actor.cascadeRan = true;
    };
    const parentArgs = [null, "items", [], [], {}, "another-user"];

    actorProto._onDeleteDescendantDocuments.call(actor, ...parentArgs);

    expect(actor.cascadeRan).toBeUndefined();
  });
});
