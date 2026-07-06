import { describe, it, expect } from "vitest";
import {
  collectEffectModifiers,
  applyOwnedItemEffects,
} from "../module/effects/cs-effect-modifiers.js";
import { CSCharacterActor } from "../module/actors/csCharacterActor.js";

// Wave 4 — the four NON-roll channels: derivedstat, damage, quality (collected
// into actor buffers + applied to fields/items) and armorrating (resolved
// per-armour from its OWN effects). Pure logic with the same effect/actor doubles
// the aggregation test uses.

const fakeEffect = ({
  id = "e",
  disabled = false,
  isSuppressed = false,
  optional = false,
  changes = [],
}) => ({
  id,
  disabled,
  isSuppressed,
  system: { changes },
  getFlag: (scope, key) =>
    scope === "chroniclesystem" && key === "optional" ? optional : undefined,
});

const ability = (name, rating = 3, specialties = {}) => ({
  type: "ability",
  name,
  system: { rating, specialties },
});

const fakeActor = (appliedEffects, items = []) => ({ appliedEffects, items });

describe("collector — derivedstat channel", () => {
  it("routes cs.derivedstat.<slug> into the derivedStats buffer (Blood of Heroes)", () => {
    const { derivedStats } = collectEffectModifiers(
      fakeActor([
        fakeEffect({
          id: "bh",
          changes: [{ key: "cs.derivedstat.combat_defense", value: "2" }],
        }),
      ])
    );
    expect(derivedStats.combat_defense[0].mod).toBe(2);
  });

  it("routes movement and resolves a derived (@rank) value", () => {
    const abilities = [ability("Athletics", 4)];
    const { derivedStats } = collectEffectModifiers(
      fakeActor(
        [
          fakeEffect({
            id: "m",
            changes: [{ key: "cs.derivedstat.movement", value: "1" }],
          }),
          fakeEffect({
            id: "h",
            changes: [
              { key: "cs.derivedstat.health", value: "@rank:athletics" },
            ],
          }),
        ],
        abilities
      )
    );
    expect(derivedStats.movement[0].mod).toBe(1);
    expect(derivedStats.health[0].mod).toBe(4);
  });
});

describe("collector — damage channel", () => {
  it("routes cs.damage.weapon to the ALL bucket and weapontype to its slug", () => {
    const { weaponDamage } = collectEffectModifiers(
      fakeActor([
        fakeEffect({
          id: "wm",
          changes: [{ key: "cs.damage.weapon", value: "1" }],
        }),
        fakeEffect({
          id: "af",
          changes: [{ key: "cs.damage.weapontype.axes", value: "2" }],
        }),
      ])
    );
    expect(weaponDamage.all[0].mod).toBe(1);
    expect(weaponDamage.axes[0].mod).toBe(2);
  });
});

describe("collector — quality channel (NAME string, bypasses numeric resolver)", () => {
  it("grants a parameterless quality (Bludgeon Fighter → Shattering)", () => {
    const { weaponQuality } = collectEffectModifiers(
      fakeActor([
        fakeEffect({
          id: "bf",
          changes: [
            { key: "cs.quality.weapontype.bludgeon", value: "Shattering" },
          ],
        }),
      ])
    );
    expect(weaponQuality.bludgeon[0]).toMatchObject({
      name: "Shattering",
      parameter: "",
    });
  });

  it("splits a trailing integer into the parameter (Piercing 1)", () => {
    const { weaponQuality } = collectEffectModifiers(
      fakeActor([
        fakeEffect({
          id: "sb",
          changes: [{ key: "cs.quality.weapon", value: "Piercing 1" }],
        }),
      ])
    );
    expect(weaponQuality.all[0]).toMatchObject({
      name: "Piercing",
      parameter: "1",
    });
  });
});

describe("collector — bulk channel feeds the shared BULK modifier buffer", () => {
  it("routes cs.bulk into modifiers.bulk (Armor Mastery −1 Bulk)", () => {
    const { modifiers } = collectEffectModifiers(
      fakeActor([
        fakeEffect({ id: "am", changes: [{ key: "cs.bulk", value: "-1" }] }),
      ])
    );
    expect(modifiers.bulk[0].mod).toBe(-1);
  });
});

describe("collector — armorrating is NOT an actor buffer (per-item, self)", () => {
  it("produces no actor-level buffer from cs.armorrating", () => {
    const buffers = collectEffectModifiers(
      fakeActor([
        fakeEffect({
          id: "am",
          changes: [{ key: "cs.armorrating", value: "1" }],
        }),
      ])
    );
    expect(buffers.derivedStats).toEqual({});
    expect(buffers.weaponDamage).toEqual({});
    expect(buffers.weaponQuality).toEqual({});
  });

  it("skips disabled/suppressed/optional non-roll changes", () => {
    const effects = [
      fakeEffect({
        id: "d",
        disabled: true,
        changes: [{ key: "cs.derivedstat.health", value: "2" }],
      }),
      fakeEffect({
        id: "s",
        isSuppressed: true,
        changes: [{ key: "cs.damage.weapon", value: "2" }],
      }),
      fakeEffect({
        id: "o",
        optional: true,
        changes: [{ key: "cs.quality.weapon", value: "Fast" }],
      }),
    ];
    const { derivedStats, weaponDamage, weaponQuality } =
      collectEffectModifiers(fakeActor(effects));
    expect(derivedStats).toEqual({});
    expect(weaponDamage).toEqual({});
    expect(weaponQuality).toEqual({});
  });
});

describe("applyOwnedItemEffects — quality grants on weapons", () => {
  const weapon = (specialty) => ({
    type: "weapon",
    system: { specialty, qualities: [] },
    getCSData() {
      return this.system;
    },
  });

  it("appends ALL-weapon then matching-type qualities to system.qualities", () => {
    const axe = weapon("Fighting:Axes");
    applyOwnedItemEffects({
      items: [axe],
      weaponQuality: {
        all: [{ _id: "f", name: "Vicious", parameter: "" }],
        axes: [{ _id: "e", name: "Piercing", parameter: "1" }],
      },
    });
    expect(axe.system.qualities).toEqual([
      { name: "Vicious", parameter: "" },
      { name: "Piercing", parameter: "1" },
    ]);
  });

  it("does not grant a type quality to a weapon of another type", () => {
    const sword = weapon("Fighting:Swords");
    applyOwnedItemEffects({
      items: [sword],
      weaponQuality: { axes: [{ _id: "e", name: "Piercing", parameter: "1" }] },
    });
    expect(sword.system.qualities).toEqual([]);
  });
});

describe("applyOwnedItemEffects — armorrating mutates the armour's own rating", () => {
  const armorEffect = (value, disabled = false) => ({
    disabled,
    isSuppressed: false,
    system: { changes: [{ key: "cs.armorrating", value }] },
  });

  it("adds the armour's own armorrating effects to system.rating, skipping disabled", () => {
    const armor = {
      type: "armor",
      system: { rating: 5 },
      effects: [armorEffect("1"), armorEffect("5", true)],
    };
    applyOwnedItemEffects({ items: [armor] });
    expect(armor.system.rating).toBe(6); // +1 only; disabled +5 ignored
  });

  it("leaves an armour without armorrating effects unchanged", () => {
    const armor = { type: "armor", system: { rating: 3 }, effects: [] };
    applyOwnedItemEffects({ items: [armor] });
    expect(armor.system.rating).toBe(3);
  });
});

describe("read-side getters (Wave 4 buffers)", () => {
  const proto = CSCharacterActor.prototype;
  const entry = (mod, _id = "e") => ({ _id, mod, isDocument: false });
  const withBuffers = (buffers) => ({
    ...buffers,
    getEmbeddedDocument: (type, id) => ({ name: `item:${id}` }),
  });

  it("getDerivedStatBonus sums the stat slug bucket only", () => {
    const a = withBuffers({ derivedStats: { combat_defense: [entry(2)] } });
    expect(proto.getDerivedStatBonus.call(a, "combat_defense")).toBe(2);
    expect(proto.getDerivedStatBonus.call(a, "health")).toBe(0);
  });

  it("getWeaponDamageBonus sums the type bucket plus the ALL (all-weapons) bucket", () => {
    const a = withBuffers({
      weaponDamage: { axes: [entry(1)], all: [entry(2)] },
    });
    expect(proto.getWeaponDamageBonus.call(a, "axes")).toBe(3);
    expect(proto.getWeaponDamageBonus.call(a, "swords")).toBe(2); // only ALL
  });

  it("getWeaponDamageBonus does NOT double-count when the type slug is itself 'all'", () => {
    const a = withBuffers({ weaponDamage: { all: [entry(2)] } });
    expect(proto.getWeaponDamageBonus.call(a, "all")).toBe(2); // not 4
  });
});
