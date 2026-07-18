import { describe, it, expect } from "vitest";
import {
  parseEffectKey,
  buildEffectKey,
  EFFECT_CHANNELS,
  QUALITY_LEVERS,
  QUALITY_LEVER_MAP,
  qualityLever,
  qualityAppliesTo,
  qualityBySlug,
} from "../module/effects/cs-effect-vocabulary.js";

// spec 020 — the four new quality-lever channels join the structured key grammar
// (`cs.<channel>`, self-scoped, no target). Their parse↔build round-trip is the
// contract (C8); the lever map + applicability filter are pure helpers (C4/C5).

const NEW_CHANNELS = [
  EFFECT_CHANNELS.ARMOR_BYPASS,
  EFFECT_CHANNELS.ARMOR_PENALTY,
];

describe("quality channels — parse/build round-trip (C8)", () => {
  it.each(NEW_CHANNELS)("round-trips cs.%s as a self-scoped key", (channel) => {
    const spec = { channel, targetKind: "self", target: null };
    const key = buildEffectKey(spec);
    expect(key).toBe(`cs.${channel}`);
    expect(parseEffectKey(key)).toEqual(spec);
  });

  it.each([
    ["cs.armorbypass.foo"],
    ["cs.armorbypass.self"],
    ["cs.armorpenalty.extra.segments"],
  ])("returns null for the oversegmented key %p (never throws)", (key) => {
    expect(parseEffectKey(key)).toBeNull();
  });

  it("still rejects an unknown channel", () => {
    expect(parseEffectKey("cs.notachannel")).toBeNull();
  });
});

describe("QUALITY_LEVERS — lever→channel SSOT map (Entity 3)", () => {
  it("every lever maps to a valid EFFECT_CHANNELS channel", () => {
    const valid = new Set(Object.values(EFFECT_CHANNELS));
    for (const lever of QUALITY_LEVERS) {
      expect(valid.has(lever.channel)).toBe(true);
      expect(typeof lever.id).toBe("string");
      expect(["passive", "auto", "optional"]).toContain(lever.defaultScope);
    }
  });

  it("maps the key levers to their expected channels", () => {
    expect(QUALITY_LEVER_MAP.damage.channel).toBe(EFFECT_CHANNELS.DAMAGE);
    expect(QUALITY_LEVER_MAP.armorbypass.channel).toBe(
      EFFECT_CHANNELS.ARMOR_BYPASS
    );
    expect(QUALITY_LEVER_MAP.defensewhilewielded.channel).toBe(
      EFFECT_CHANNELS.DERIVED_STAT
    );
    expect(QUALITY_LEVER_MAP.defensewhilewielded.target).toBe("combat_defense");
    expect(QUALITY_LEVER_MAP.bulk.channel).toBe(EFFECT_CHANNELS.BULK);
  });

  it("marks the attack-scoped levers (bound to the rolled weapon, FR-016)", () => {
    expect(QUALITY_LEVER_MAP.damage.attackScoped).toBe(true);
    expect(QUALITY_LEVER_MAP.armorbypass.attackScoped).toBe(true);
    expect(QUALITY_LEVER_MAP.defensewhilewielded.attackScoped).toBe(false);
    expect(QUALITY_LEVER_MAP.bulk.attackScoped).toBe(false);
  });

  it("qualityLever(id) returns null for a blank/unknown lever (FR-005)", () => {
    expect(qualityLever("")).toBeNull();
    expect(qualityLever("nope")).toBeNull();
    expect(qualityLever("damage")).toBe(QUALITY_LEVER_MAP.damage);
  });
});

describe("qualityAppliesTo — applicability filter (C4)", () => {
  const weaponOnly = { system: { applicability: "weapon" } };
  const armorOnly = { system: { applicability: "armor" } };
  const both = { system: { applicability: "both" } };

  it("weapon-only is offered for weapons, NOT for armour", () => {
    expect(qualityAppliesTo(weaponOnly, "weapon")).toBe(true);
    expect(qualityAppliesTo(weaponOnly, "armor")).toBe(false);
  });

  it("armour-only is offered for armour, NOT for weapons", () => {
    expect(qualityAppliesTo(armorOnly, "armor")).toBe(true);
    expect(qualityAppliesTo(armorOnly, "weapon")).toBe(false);
  });

  it("both is offered for either", () => {
    expect(qualityAppliesTo(both, "weapon")).toBe(true);
    expect(qualityAppliesTo(both, "armor")).toBe(true);
  });

  it("accepts a bare {applicability} object (compendium index row)", () => {
    expect(qualityAppliesTo({ applicability: "weapon" }, "weapon")).toBe(true);
    expect(qualityAppliesTo({ applicability: "armor" }, "weapon")).toBe(false);
  });

  it("defaults a missing applicability to 'both'", () => {
    expect(qualityAppliesTo({}, "weapon")).toBe(true);
    expect(qualityAppliesTo({}, "armor")).toBe(true);
  });
});

describe("qualityBySlug — synchronous resolver (C5): world first, seed fallback", () => {
  it("returns null for a blank slug", () => {
    expect(qualityBySlug("")).toBeNull();
    expect(qualityBySlug(null)).toBeNull();
    expect(qualityBySlug(undefined)).toBeNull();
  });

  it("falls back to the seed catalog when no world item exists (self-heals a deleted/absent world copy, no version-gated migration needed)", () => {
    // No `game` global in Vitest → the world scan finds nothing; the seed catalog
    // is a pure module, so a built-in quality still resolves.
    const def = qualityBySlug("piercing");
    expect(def).not.toBeNull();
    expect(def.name).toBe("Piercing");
    expect(def.system.parameter.kind).toBe("number");
    expect(def.system.rules).toEqual([
      { lever: "armorbypass", value: "@param", scope: "auto", target: "" },
    ]);
  });

  it("returns null for an unknown homebrew slug that is neither a world item nor a seed", () => {
    expect(qualityBySlug("totally_made_up_quality")).toBeNull();
  });
});
