// Post-implement fix (2026-07-23) — `CSItem#_onCreate` provisions a gained
// Ability's specialties, but that hook only fires when the Item goes through
// its OWN creation pipeline. When an Actor arrives with its `items` supplied
// INLINE in the actor's own creation payload — a compendium Actor drag-in, the
// sidebar's "Duplicate", a JSON actor import — the embedded items never run
// their individual `_onCreate` (verified against the installed v14 bundle:
// `ClientDatabaseBackend#preCreateDocumentArray`/`#handleCreateDocuments`,
// foundry.mjs:80359-80479 — that pipeline runs only for documents created
// through their OWN class's `createDocuments`, never for data nested in a
// PARENT's create payload). `CSActor#_onCreate` closes that gap by
// provisioning every owned ability once the actor itself has been created.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CSActor } from "../module/actors/csActor.js";
import * as provisioningModule from "../module/actors/cs-specialty-provisioning.js";

const proto = CSActor.prototype;

function abilityItem(name, slug) {
  return { name, type: "ability", system: { slug } };
}

beforeEach(() => {
  globalThis.game = { ...globalThis.game, user: { id: "u1" } };
  vi.spyOn(provisioningModule, "provisionSpecialties").mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CSActor#_onCreate provisions every ability an actor arrives with", () => {
  it("calls provisionSpecialties once per owned ability, for a character", async () => {
    const fighting = abilityItem("Fighting", "fighting");
    const persuasion = abilityItem("Persuasion", "persuasion");
    const actor = { type: "character", items: [fighting, persuasion] };

    proto._onCreate.call(actor, {}, {}, "u1");
    // Fire-and-forget dynamic import; let its microtasks flush.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(provisioningModule.provisionSpecialties).toHaveBeenCalledTimes(2);
    expect(provisioningModule.provisionSpecialties).toHaveBeenCalledWith(
      actor,
      fighting
    );
    expect(provisioningModule.provisionSpecialties).toHaveBeenCalledWith(
      actor,
      persuasion
    );
  });

  it("skips non-ability items", async () => {
    const actor = {
      type: "character",
      items: [{ name: "Sword", type: "weapon", system: {} }],
    };
    proto._onCreate.call(actor, {}, {}, "u1");
    await new Promise((r) => setImmediate(r));
    expect(provisioningModule.provisionSpecialties).not.toHaveBeenCalled();
  });

  it("does nothing for a house or a unit (FR-021)", async () => {
    for (const type of ["house", "unit"]) {
      const actor = { type, items: [abilityItem("Fighting", "fighting")] };
      proto._onCreate.call(actor, {}, {}, "u1");
    }
    await new Promise((r) => setImmediate(r));
    expect(provisioningModule.provisionSpecialties).not.toHaveBeenCalled();
  });

  it("does nothing on a client that did not originate the creation", async () => {
    const actor = { type: "character", items: [abilityItem("Fighting", "fighting")] };
    proto._onCreate.call(actor, {}, {}, "some-other-user");
    await new Promise((r) => setImmediate(r));
    expect(provisioningModule.provisionSpecialties).not.toHaveBeenCalled();
  });
});
