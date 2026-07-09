import { describe, it, expect } from "vitest";
import {
  canUserModifyEffect,
  effectSourceName,
  effectOriginKind,
  buildEffectContext,
  effectBlockMessageKey,
} from "../module/effects/cs-effect-permission.js";

// Wave 6 — permission rule + the effects-tab row context (real source + lock).
// Pure: operates only on the passed effect's accessors, so no Foundry stub needed.

const gm = { isGM: true, id: "gm" };
const alice = { isGM: false, id: "alice" };
const bob = { isGM: false, id: "bob" };

/** Minimal effect double with a chroniclesystem flag bag + optional source item. */
const fakeEffect = ({
  id = "e",
  name = "Effect",
  img = "i.svg",
  disabled = false,
  isSuppressed = false,
  origin,
  authorId,
  item = null,
  originItem = null,
} = {}) => ({
  id,
  name,
  img,
  disabled,
  isSuppressed,
  item,
  originItem,
  getFlag: (scope, key) => {
    if (scope !== "chroniclesystem") return undefined;
    if (key === "origin") return origin;
    if (key === "authorId") return authorId;
    return undefined;
  },
});

describe("canUserModifyEffect", () => {
  it("lets the GM modify everything (player/item/system)", () => {
    expect(
      canUserModifyEffect(
        gm,
        fakeEffect({ origin: "player", authorId: "alice" })
      )
    ).toBe(true);
    expect(canUserModifyEffect(gm, fakeEffect({ origin: "item" }))).toBe(true);
    expect(canUserModifyEffect(gm, fakeEffect({ origin: "system" }))).toBe(
      true
    );
    expect(canUserModifyEffect(gm, fakeEffect({}))).toBe(true); // origin absent → item default
  });

  it("lets a player modify ONLY their own player-authored effects", () => {
    const aliceEffect = fakeEffect({ origin: "player", authorId: "alice" });
    expect(canUserModifyEffect(alice, aliceEffect)).toBe(true);
    expect(canUserModifyEffect(bob, aliceEffect)).toBe(false); // not the author
  });

  it("forbids a player from modifying item/system (default) effects", () => {
    expect(canUserModifyEffect(alice, fakeEffect({ origin: "item" }))).toBe(
      false
    );
    expect(canUserModifyEffect(alice, fakeEffect({ origin: "system" }))).toBe(
      false
    );
    expect(canUserModifyEffect(alice, fakeEffect({}))).toBe(false); // absent → item
  });

  it("returns false for a missing user or effect", () => {
    expect(canUserModifyEffect(null, fakeEffect({}))).toBe(false);
    expect(canUserModifyEffect(alice, null)).toBe(false);
  });
});

describe("effectSourceName — the real origin item, or null for own effects", () => {
  const plate = { id: "plate", name: "Plate Armor" };

  it("returns the parent item's name when viewed from the actor", () => {
    const effect = fakeEffect({ item: plate });
    expect(effectSourceName(effect, { id: "actor1" })).toBe("Plate Armor");
  });

  it("falls back to the resolved origin item (originItem) when there is no parent item", () => {
    const effect = fakeEffect({ item: null, originItem: plate });
    expect(effectSourceName(effect, { id: "actor1" })).toBe("Plate Armor");
  });

  it("returns null when the source item IS the document being viewed", () => {
    const effect = fakeEffect({ item: plate });
    expect(effectSourceName(effect, { id: "plate" })).toBeNull(); // on the item's own sheet
  });

  it("returns null for an effect with no source item (the actor's own)", () => {
    expect(effectSourceName(fakeEffect({}), { id: "actor1" })).toBeNull();
  });
});

describe("effectOriginKind — the tab badge classification", () => {
  const plate = { id: "plate", name: "Plate Armor" };

  it("is 'player' for a player-authored effect (regardless of source)", () => {
    expect(effectOriginKind(fakeEffect({ origin: "player" }), null)).toBe(
      "player"
    );
    expect(
      effectOriginKind(fakeEffect({ origin: "player" }), "Plate Armor")
    ).toBe("player");
  });

  it("is 'item' for a non-player effect that has a distinct source item", () => {
    expect(
      effectOriginKind(fakeEffect({ origin: "item" }), "Plate Armor")
    ).toBe("item");
  });

  it("is 'intrinsic' for the actor's own non-player effect (no source item)", () => {
    expect(effectOriginKind(fakeEffect({ origin: "item" }), null)).toBe(
      "intrinsic"
    );
    expect(effectOriginKind(fakeEffect({}), null)).toBe("intrinsic"); // absent → item default
  });

  it("reads a csOrigin getter when getFlag is absent", () => {
    expect(effectOriginKind({ csOrigin: "player" }, null)).toBe("player");
    expect(effectOriginKind({ csOrigin: "item" }, null)).toBe("intrinsic");
  });
});

describe("buildEffectContext", () => {
  it("exposes source name + lock + item origin for a transferred item effect viewed by a player", () => {
    const effect = fakeEffect({
      id: "ae1",
      name: "Armor Mastery",
      origin: "item",
      item: { id: "plate", name: "Plate Armor" },
    });
    const ctx = buildEffectContext(effect, alice, { id: "actor1" });
    expect(ctx).toMatchObject({
      id: "ae1",
      name: "Armor Mastery",
      sourceName: "Plate Armor",
      originKind: "item",
      editable: false,
      locked: true,
    });
  });

  it("tags the actor's own GM effect as intrinsic", () => {
    const ctx = buildEffectContext(
      fakeEffect({ origin: "item" }),
      gm,
      { id: "actor1" } // own effect, no source item
    );
    expect(ctx.originKind).toBe("intrinsic");
  });

  it("tags a player's own effect as player origin", () => {
    const ctx = buildEffectContext(
      fakeEffect({ origin: "player", authorId: "alice" }),
      alice,
      { id: "actor1" }
    );
    expect(ctx.originKind).toBe("player");
  });

  it("is editable + unlocked for the GM, with — source for the actor's own effect", () => {
    const effect = fakeEffect({ id: "ae2", origin: "item" });
    const ctx = buildEffectContext(effect, gm, { id: "actor1" });
    expect(ctx.editable).toBe(true);
    expect(ctx.locked).toBe(false);
    expect(ctx.sourceName).toBeNull();
  });

  it("is editable for the player who authored their own effect", () => {
    const effect = fakeEffect({ origin: "player", authorId: "alice" });
    const ctx = buildEffectContext(effect, alice, { id: "actor1" });
    expect(ctx.editable).toBe(true);
    expect(ctx.locked).toBe(false);
  });
});

describe("buildEffectContext — displayState 3-state matrix (US5)", () => {
  // disabled × isSuppressed → the single badge state. Suppression PREVAILS over a
  // manual disable (FR-023): both true collapses to "suspended".
  const cases = [
    [false, false, "active"],
    [true, false, "disabled"],
    [false, true, "suspended"],
    [true, true, "suspended"], // collapse: suppression wins
  ];
  for (const [disabled, isSuppressed, expected] of cases) {
    it(`disabled=${disabled}, isSuppressed=${isSuppressed} → ${expected}`, () => {
      const ctx = buildEffectContext(
        fakeEffect({ disabled, isSuppressed }),
        gm,
        { id: "actor1" }
      );
      expect(ctx.displayState).toBe(expected);
    });
  }
});

describe("effectBlockMessageKey — the right denial reason per origin", () => {
  it("uses the 'your own' message for another player's player effect", () => {
    expect(effectBlockMessageKey(fakeEffect({ origin: "player" }))).toBe(
      "CS.effects.permission.blockedOther"
    );
  });

  it("uses the GM-only message for item/system (and default) effects", () => {
    expect(effectBlockMessageKey(fakeEffect({ origin: "item" }))).toBe(
      "CS.effects.permission.blockedGmOnly"
    );
    expect(effectBlockMessageKey(fakeEffect({ origin: "system" }))).toBe(
      "CS.effects.permission.blockedGmOnly"
    );
    expect(effectBlockMessageKey(fakeEffect({}))).toBe(
      "CS.effects.permission.blockedGmOnly"
    );
  });
});
