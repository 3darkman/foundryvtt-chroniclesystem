import { describe, it, expect } from "vitest";
import {
  parseEffectKey,
  buildEffectKey,
  slugify,
  WEAPON_QUALITIES,
  matchWeaponQuality,
  weaponQualityTakesParam,
  weaponQualitySlug,
  isRollChannel,
  ROLL_CHANNEL_TO_FORMULA_FIELD,
} from "../module/effects/cs-effect-vocabulary.js";

// Spec 008 redesign — the structured key grammar `cs.<channel>.<targetKind>[.<slug>]`
// is the SSOT of the effect model; the parse↔build round-trip is its contract.

describe("parseEffectKey — roll channels", () => {
  it("parses each global roll channel", () => {
    expect(parseEffectKey("cs.result.all")).toEqual({
      channel: "result",
      targetKind: "all",
      target: null,
    });
    expect(parseEffectKey("cs.testdice.all")).toEqual({
      channel: "testdice",
      targetKind: "all",
      target: null,
    });
    expect(parseEffectKey("cs.bonusdice.all")).toEqual({
      channel: "bonusdice",
      targetKind: "all",
      target: null,
    });
    expect(parseEffectKey("cs.reroll.all")).toEqual({
      channel: "reroll",
      targetKind: "all",
      target: null,
    });
    expect(parseEffectKey("cs.penalty.all")).toEqual({
      channel: "penalty",
      targetKind: "all",
      target: null,
    });
  });

  it("parses ability and specialty targets", () => {
    expect(parseEffectKey("cs.result.ability.persuasion")).toEqual({
      channel: "result",
      targetKind: "ability",
      target: "persuasion",
    });
    expect(parseEffectKey("cs.testdice.specialty.axes")).toEqual({
      channel: "testdice",
      targetKind: "specialty",
      target: "axes",
    });
  });
});

describe("parseEffectKey — derived stat / armour / bulk / weapon", () => {
  it("parses derivedstat, armorrating and bulk", () => {
    expect(parseEffectKey("cs.derivedstat.combat_defense")).toEqual({
      channel: "derivedstat",
      targetKind: "stat",
      target: "combat_defense",
    });
    expect(parseEffectKey("cs.armorrating")).toEqual({
      channel: "armorrating",
      targetKind: "self",
      target: null,
    });
    expect(parseEffectKey("cs.bulk")).toEqual({
      channel: "bulk",
      targetKind: "all",
      target: null,
    });
  });

  it("parses damage / quality weapon targets", () => {
    expect(parseEffectKey("cs.damage.weapontype.shortblade")).toEqual({
      channel: "damage",
      targetKind: "weapontype",
      target: "shortblade",
    });
    expect(parseEffectKey("cs.quality.weapon")).toEqual({
      channel: "quality",
      targetKind: "weapon",
      target: null,
    });
  });
});

describe("parseEffectKey — rejection (never throws)", () => {
  it.each([
    ["system.derivedStats.health.modifier"],
    [""],
    [null],
    [undefined],
    ["foo.bar"],
    ["cs."],
    ["cs.unknownchannel.all"],
    ["cs.result.ability."], // ability without slug
    ["cs.result.unknownkind"],
    ["cs.derivedstat"], // stat without slug
    ["cs.derivedstat.combatdefense"], // typo (missing underscore) — not in DERIVED_STATS
    ["cs.derivedstat.bogus"], // unknown stat slug — rejected, not a silent no-op
    // Strict parsing: trailing/extra segments are rejected, not silently ignored.
    ["cs.armorrating.foo"],
    ["cs.armorrating.self"], // non-canonical (canonical is cs.armorrating)
    ["cs.bulk.junk"],
    ["cs.derivedstat.health.extra"],
    ["cs.result.all.extra"],
    ["cs.result.ability.fighting.extra"],
    ["cs.quality.weapon.extra"],
  ])("returns null for %p", (key) => {
    expect(parseEffectKey(key)).toBeNull();
  });
});

describe("buildEffectKey ↔ parseEffectKey round-trip", () => {
  it.each([
    [{ channel: "result", targetKind: "all", target: null }],
    [{ channel: "penalty", targetKind: "ability", target: "persuasion" }],
    [{ channel: "testdice", targetKind: "specialty", target: "axes" }],
    [{ channel: "bonusdice", targetKind: "ability", target: "status" }],
    [{ channel: "reroll", targetKind: "specialty", target: "charm" }],
    [{ channel: "derivedstat", targetKind: "stat", target: "health" }],
    [{ channel: "armorrating", targetKind: "self", target: null }],
    [{ channel: "bulk", targetKind: "all", target: null }],
    [{ channel: "damage", targetKind: "weapontype", target: "shortblade" }],
    [{ channel: "quality", targetKind: "weapon", target: null }],
    [{ channel: "quality", targetKind: "weapontype", target: "shortblade" }],
    [{ channel: "damage", targetKind: "weapon", target: null }],
  ])("round-trips %o", (spec) => {
    expect(parseEffectKey(buildEffectKey(spec))).toEqual(spec);
  });

  it("returns '' for invalid combinations", () => {
    expect(buildEffectKey({ channel: "nope" })).toBe("");
    expect(buildEffectKey({ channel: "result", targetKind: "ability" })).toBe(
      ""
    ); // missing slug
    expect(buildEffectKey({ channel: "derivedstat", targetKind: "stat" })).toBe(
      ""
    ); // missing target
    expect(
      buildEffectKey({ channel: "quality", targetKind: "weapontype" })
    ).toBe(""); // missing weapon-type slug
  });
});

// spec 023 (contract passive-effect-channel.md C1/C5) — the `passive` channel
// rides the SAME trait grammar as the dice channels, but is deliberately absent
// from the formula-field map: it moves a passive value and nothing else.
describe("the passive channel (spec 023)", () => {
  it.each([
    [{ channel: "passive", targetKind: "all", target: null }],
    [{ channel: "passive", targetKind: "ability", target: "awareness" }],
    [
      {
        channel: "passive",
        targetKind: "specialty",
        target: "awareness_empathy",
      },
    ],
  ])("round-trips %o", (spec) => {
    expect(parseEffectKey(buildEffectKey(spec))).toEqual(spec);
  });

  it("parses the three canonical keys", () => {
    expect(parseEffectKey("cs.passive.all")).toEqual({
      channel: "passive",
      targetKind: "all",
      target: null,
    });
    expect(parseEffectKey("cs.passive.ability.awareness")).toEqual({
      channel: "passive",
      targetKind: "ability",
      target: "awareness",
    });
  });

  it.each([
    ["cs.passive.stat.combat_defense"], // roll channels have no `stat` kind (FR-031a)
    ["cs.passive.ability."], // empty slug
    ["cs.passive.ability.awareness.extra"], // extra segment
    ["cs.passive.all.extra"],
    ["cs.passive"], // no target kind
    ["cs.passive.weapon"],
  ])("rejects %p", (key) => {
    expect(parseEffectKey(key)).toBeNull();
  });

  it("has NO formula field — a passive change can never reach a rolled test", () => {
    expect(ROLL_CHANNEL_TO_FORMULA_FIELD).not.toHaveProperty("passive");
    expect(ROLL_CHANNEL_TO_FORMULA_FIELD.passive).toBeUndefined();
  });

  it("IS a trait-targeted channel, so it inherits the authoring cascade", () => {
    expect(isRollChannel("passive")).toBe(true);
  });
});

describe("slugify", () => {
  it("lowercases, strips accents, underscores whitespace", () => {
    expect(slugify("Short Blade")).toBe("short_blade");
    expect(slugify("Persuásion")).toBe("persuasion");
    expect(slugify("  Awareness  ")).toBe("awareness");
  });
  it("removes dots and punctuation so a slug never collides with the separator", () => {
    expect(slugify("St. John")).toBe("st_john");
    expect(slugify("Two-Handed")).toBe("two_handed");
    expect(slugify("a.b.c")).toBe("a_b_c");
  });
  it("returns '' for empty / non-string", () => {
    expect(slugify("")).toBe("");
    expect(slugify(null)).toBe("");
    expect(slugify(7)).toBe("");
  });
});

// Spec 007 Wave 5 — weapon-quality vocabulary (validated against the rulebook via
// NotebookLM). The authoring dropdown and the row-model both key off these.
describe("weapon qualities", () => {
  it("matches a bare canonical name (no parameter)", () => {
    expect(matchWeaponQuality("Shattering")).toEqual({
      name: "Shattering",
      param: "",
    });
  });

  it("splits a canonical name from its trailing numeric rating", () => {
    expect(matchWeaponQuality("Piercing 1")).toEqual({
      name: "Piercing",
      param: "1",
    });
  });

  it("splits a canonical name from a textual rating (Reload Greater)", () => {
    expect(matchWeaponQuality("Reload Greater")).toEqual({
      name: "Reload",
      param: "Greater",
    });
  });

  it("prefers the longest multi-word name (Close Range, not a shorter prefix)", () => {
    expect(matchWeaponQuality("Close Range")).toEqual({
      name: "Close Range",
      param: "",
    });
  });

  it("returns null for an off-list (homebrew) name → free text", () => {
    expect(matchWeaponQuality("Homebrew Nastiness")).toBeNull();
    expect(matchWeaponQuality("")).toBeNull();
    expect(matchWeaponQuality(null)).toBeNull();
  });

  it("flags which canonical qualities carry a parameter", () => {
    expect(weaponQualityTakesParam("Piercing")).toBe(true);
    expect(weaponQualityTakesParam("Shattering")).toBe(true);
    expect(weaponQualityTakesParam("Vicious")).toBe(false);
    expect(weaponQualityTakesParam("__other__")).toBe(false);
  });

  it("derives a dot-free i18n slug for every quality name", () => {
    for (const quality of WEAPON_QUALITIES) {
      const slug = weaponQualitySlug(quality.name);
      expect(slug).not.toContain(".");
      expect(slug).toMatch(/^[a-z0-9_]+$/);
    }
    expect(weaponQualitySlug("Off-hand")).toBe("off_hand");
    expect(weaponQualitySlug("Set for Charge Only")).toBe("set_for_charge_only");
  });
});
