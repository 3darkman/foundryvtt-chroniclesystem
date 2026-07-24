// Post-implement fix (2026-07-23) — `CSActorSheet#_onDropItem`'s duplicate guard
// (research D9, spec 024) was widened from name-only to name+type, closing the
// cross-TYPE collision (a Specialty named "Charm" vs a Technique named "Charm").
// It did NOT close the cross-ABILITY collision WITHIN the specialty type itself:
// two DIFFERENT specialties can share both a name and the type "specialty" —
// Animal Handling's "Charm" and Persuasion's "Charm" are the canonical example,
// and post-024 a fully-provisioned character owns BOTH. The guard must also
// compare `system.abilitySlug` when the dropped item is a specialty.

import { describe, it, expect, vi } from "vitest";
import { CSActorSheet } from "../module/actors/sheets/csActorSheet.js";
import { CSCharacterActorSheet } from "../module/actors/sheets/csCharacterActorSheet.js";

const proto = CSActorSheet.prototype;

function makeSheetFor(ownedItems) {
  const created = [];
  return {
    actor: {
      isOwner: true,
      uuid: "Actor.actor1",
      items: ownedItems,
      createEmbeddedDocuments: vi.fn(async (docType, data) => {
        created.push([docType, data]);
        return data.map((d, i) => ({
          ...d,
          id: `new${i}`,
          onObtained: () => {},
        }));
      }),
    },
    isItemPermitted: () => true,
    created,
  };
}

/** A dropped Item double from a DIFFERENT parent (so `_onSortItem` is skipped). */
function droppedSpecialty({ name, abilitySlug }) {
  return {
    name,
    type: "specialty",
    parent: { uuid: "Actor.other" },
    system: { abilitySlug },
    toObject: () => ({ name, type: "specialty", system: { abilitySlug } }),
  };
}

describe("_onDropItem duplicate guard is scoped by abilitySlug for specialties", () => {
  it("creates Persuasion's Charm even when Animal Handling's Charm is already owned", async () => {
    const owned = [
      { name: "Charm", type: "specialty", system: { abilitySlug: "animal_handling" } },
    ];
    const sheet = makeSheetFor(owned);
    const dropped = droppedSpecialty({ name: "Charm", abilitySlug: "persuasion" });

    const result = await proto._onDropItem.call(sheet, {}, dropped);

    expect(sheet.actor.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
    expect(result).not.toBe(owned[0]);
  });

  it("still resolves to the existing item when the SAME specialty is dropped again", async () => {
    const owned = [
      { name: "Charm", type: "specialty", system: { abilitySlug: "persuasion" } },
    ];
    const sheet = makeSheetFor(owned);
    const dropped = droppedSpecialty({ name: "Charm", abilitySlug: "persuasion" });

    const result = await proto._onDropItem.call(sheet, {}, dropped);

    expect(sheet.actor.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(result).toBe(owned[0]);
  });

  it("a non-specialty type is unaffected — still matches by name+type alone", async () => {
    const owned = [{ name: "Charm", type: "technique", system: {} }];
    const sheet = makeSheetFor(owned);
    const dropped = {
      name: "Charm",
      type: "technique",
      parent: { uuid: "Actor.other" },
      system: {},
      toObject: () => ({ name: "Charm", type: "technique", system: {} }),
    };

    const result = await proto._onDropItem.call(sheet, {}, dropped);

    expect(sheet.actor.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(result).toBe(owned[0]);
  });
});

// Post-implement fix (2026-07-23) — `CSCharacterActorSheet` is the registered
// sheet for BOTH `character` and `unit` actors (config.js), so simply adding
// "specialty" to the shared `itemTypesPermitted` list also made it droppable
// on units, contradicting contract C4.3 ("the house/unit sheets' permitted
// list is not changed"). FR-021 already excludes units from provisioning; a
// unit should not be able to hold a specialty at all.
describe("isItemPermitted refuses a specialty on a unit (spec 024 C4.2/C4.3)", () => {
  // Real instances (not hand-copied field lists) so the test tracks the actual
  // `itemTypesPermitted` array this class ships, not a duplicate that could
  // silently drift from it.
  function sheetFor(actorType) {
    const sheet = new CSCharacterActorSheet();
    sheet.actor = { type: actorType };
    return sheet;
  }

  it("permits a specialty on a character", () => {
    expect(sheetFor("character").isItemPermitted("specialty")).toBe(true);
  });

  it("refuses a specialty on a unit", () => {
    expect(sheetFor("unit").isItemPermitted("specialty")).toBe(false);
  });

  it("still permits every other shared type on a unit", () => {
    const sheet = sheetFor("unit");
    expect(sheet.isItemPermitted("weapon")).toBe(true);
    expect(sheet.isItemPermitted("ability")).toBe(true);
  });
});
