import { describe, it, expect } from "vitest";
import {
  parseChangeRow,
  buildChangeFromRow,
  isUnrepresentable,
} from "../module/effects/cs-effect-row-model.js";

// Wave 5 — the authoring cascade's read/write mapping. The critical property is
// a NON-DESTRUCTIVE round-trip: opening a stored change and re-saving it without
// edits must reproduce it. The sheet is makeDefault for ALL effects, so anything
// the cascade can't represent must survive verbatim (review #1/#2/#4).

/** Reduce a parsed row back to a stored change (the sheet's submit path). */
const roundTrip = (change) => buildChangeFromRow(parseChangeRow(change, 0));

describe("round-trip — every representable cs.* channel + value mode", () => {
  const cases = [
    { key: "cs.result.all", value: "2" },
    { key: "cs.testdice.ability.awareness", value: "1" },
    { key: "cs.bonusdice.specialty.axes", value: "1" },
    { key: "cs.reroll.all", value: "1" },
    { key: "cs.penalty.ability.persuasion", value: "-2" },
    { key: "cs.derivedstat.combat_defense", value: "2" },
    { key: "cs.derivedstat.movement", value: "1" },
    { key: "cs.armorrating", value: "1" },
    { key: "cs.bulk", value: "-1" },
    { key: "cs.damage.weapon", value: "1" },
    { key: "cs.damage.weapontype.axes", value: "2" },
    { key: "cs.result.ability.fighting", value: "@rank:fighting" },
    { key: "cs.testdice.specialty.axes", value: "@half:persuasion" },
  ];
  it.each(cases)("preserves %o", (change) => {
    const out = roundTrip(change);
    expect(out.key).toBe(change.key);
    expect(out.value).toBe(change.value);
    expect(out.type).toBe("add");
  });
});

describe("round-trip — quality value is a raw NAME string (not numeric)", () => {
  it.each([
    { key: "cs.quality.weapontype.bludgeon", value: "Shattering" }, // bare canonical
    { key: "cs.quality.weapon", value: "Piercing 1" }, // canonical + numeric rating
    { key: "cs.quality.weapon", value: "Reload Greater" }, // canonical + textual rating
    { key: "cs.quality.weapontype.axes", value: "Vicious" }, // param-less canonical
    { key: "cs.quality.weapon", value: "Homebrew Nastiness" }, // off-list → free text
  ])("preserves the quality name %o", (change) => {
    const out = roundTrip(change);
    expect(out.key).toBe(change.key);
    expect(out.value).toBe(change.value); // NOT coerced to 0
  });
});

describe("verbatim passthrough — changes the cascade cannot represent", () => {
  it("preserves a foreign / legacy key untouched (review #1)", () => {
    const change = {
      key: "system.attributes.health",
      value: "5",
      type: "override",
      phase: "initial",
    };
    expect(isUnrepresentable(change)).toBe(true);
    const row = parseChangeRow(change, 0);
    expect(row.isRaw).toBe(true);
    const out = buildChangeFromRow(row);
    expect(out).toMatchObject({
      key: "system.attributes.health",
      value: "5",
      type: "override", // type/phase preserved (review #4)
      phase: "initial",
    });
  });

  it("preserves a legacy cs.modifier.* key untouched", () => {
    const change = { key: "cs.modifier.all", value: "1" };
    expect(isUnrepresentable(change)).toBe(true);
    expect(buildChangeFromRow(parseChangeRow(change, 0)).key).toBe(
      "cs.modifier.all"
    );
  });

  it("preserves @sacrificed instead of clobbering it to 0 (review #2)", () => {
    const change = { key: "cs.damage.weapon", value: "@sacrificed" };
    expect(isUnrepresentable(change)).toBe(true);
    const out = roundTrip(change);
    expect(out.value).toBe("@sacrificed"); // NOT "0"
    expect(out.key).toBe("cs.damage.weapon");
  });

  it("does NOT treat an empty key as verbatim (fresh/incomplete row → cascade)", () => {
    expect(isUnrepresentable({ key: "", value: "" })).toBe(false);
    const row = parseChangeRow({ key: "", value: "" }, 0);
    expect(row.isRaw).toBeUndefined();
    expect(row.channel).toBe("result"); // default cascade row
  });

  it("does NOT treat a normal authorable derived value as verbatim", () => {
    expect(
      isUnrepresentable({ key: "cs.result.all", value: "@rank:fighting" })
    ).toBe(false);
  });
});

describe("prefill row shape (read path)", () => {
  it("splits an ability roll key into channel + targetKind + slug", () => {
    const row = parseChangeRow(
      { key: "cs.testdice.ability.awareness", value: "1" },
      3
    );
    expect(row).toMatchObject({
      index: 3,
      channel: "testdice",
      rollTargetKind: "ability",
      rollSlug: "awareness",
      valueMode: "fixed",
      fixedValue: 1,
      isRoll: true,
      showRollSlug: true,
    });
  });

  it("splits a canonical quality grant into kind + parameter (not the value spec)", () => {
    const row = parseChangeRow(
      { key: "cs.quality.weapontype.axes", value: "Piercing 1" },
      0
    );
    expect(row).toMatchObject({
      channel: "quality",
      weaponTargetKind: "weapontype",
      weaponSlug: "axes",
      qualityKind: "Piercing",
      qualityParam: "1",
      isQuality: true,
      qualityTakesParam: true,
      qualityIsOther: false,
      showWeaponSlug: true,
    });
  });

  it("routes an off-list quality name to the free-text 'Other…' pick", () => {
    const row = parseChangeRow(
      { key: "cs.quality.weapon", value: "Homebrew Nastiness" },
      0
    );
    expect(row).toMatchObject({
      channel: "quality",
      qualityKind: "__other__",
      qualityCustom: "Homebrew Nastiness",
      qualityIsOther: true,
      qualityTakesParam: false,
    });
  });

  it("defaults an unknown/empty key to a result/all fixed row", () => {
    const row = parseChangeRow({ key: "", value: "" }, 0);
    expect(row).toMatchObject({
      channel: "result",
      rollTargetKind: "all",
      valueMode: "fixed",
      fixedValue: 0,
    });
  });
});

describe("write path normalises free-text slugs", () => {
  it("slugifies a free-text ability slug", () => {
    const out = buildChangeFromRow({
      channel: "result",
      rollTargetKind: "ability",
      rollSlug: "Short Blades",
      valueMode: "fixed",
      fixedValue: 1,
    });
    expect(out.key).toBe("cs.result.ability.short_blades");
  });

  it("derives the weapon-type slug from a full specialty string", () => {
    const out = buildChangeFromRow({
      channel: "damage",
      weaponTargetKind: "weapontype",
      weaponSlug: "Fighting:Axes",
      valueMode: "fixed",
      fixedValue: 2,
    });
    expect(out.key).toBe("cs.damage.weapontype.axes");
  });

  it("yields an empty key for an incomplete row (ability with blank slug)", () => {
    const out = buildChangeFromRow({
      channel: "result",
      rollTargetKind: "ability",
      rollSlug: "",
      valueMode: "fixed",
      fixedValue: 1,
    });
    expect(out.key).toBe(""); // collector ignores it (inert, not a crash)
  });
});
