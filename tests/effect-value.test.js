import { describe, it, expect } from "vitest";
import {
  parseValueSpec,
  resolveEffectValue,
  isDerivedValue,
  buildValueString,
} from "../module/effects/cs-effect-value.js";

// Spec 008 redesign — a change.value is fixed or a derived spec (@rank/@half/
// @bonusdice/@sacrificed). The resolver is pure (accessor-driven), so it is
// fully characterised without a Foundry actor.

describe("parseValueSpec", () => {
  it("reads fixed values", () => {
    expect(parseValueSpec("5")).toEqual({ mode: "fixed", value: 5 });
    expect(parseValueSpec(3)).toEqual({ mode: "fixed", value: 3 });
    expect(parseValueSpec("-2")).toEqual({ mode: "fixed", value: -2 });
    expect(parseValueSpec("abc")).toEqual({ mode: "fixed", value: 0 }); // NaN → 0
  });

  it("truncates fractional fixed values to integers (toward zero)", () => {
    expect(parseValueSpec("2.5")).toEqual({ mode: "fixed", value: 2 });
    expect(parseValueSpec("-1.5")).toEqual({ mode: "fixed", value: -1 });
    expect(parseValueSpec(2.9)).toEqual({ mode: "fixed", value: 2 });
  });

  it("treats empty / whitespace as fixed 0", () => {
    expect(parseValueSpec("")).toEqual({ mode: "fixed", value: 0 }); // Number("") === 0
    expect(parseValueSpec("   ")).toEqual({ mode: "fixed", value: 0 });
  });

  it("takes the first slug segment when extra colons are present", () => {
    expect(parseValueSpec("@rank:fighting:extra")).toEqual({
      mode: "derived",
      form: "rank",
      slug: "fighting",
    });
  });

  it("reads derived specs", () => {
    expect(parseValueSpec("@rank:fighting")).toEqual({
      mode: "derived",
      form: "rank",
      slug: "fighting",
    });
    expect(parseValueSpec("@half:persuasion")).toEqual({
      mode: "derived",
      form: "half",
      slug: "persuasion",
    });
    expect(parseValueSpec("@bonusdice:axes")).toEqual({
      mode: "derived",
      form: "bonusdice",
      slug: "axes",
    });
    expect(parseValueSpec("@sacrificed")).toEqual({
      mode: "derived",
      form: "sacrificed",
      slug: null,
    });
  });

  it("returns null for invalid derived specs", () => {
    expect(parseValueSpec("@rank:")).toBeNull();
    expect(parseValueSpec("@unknown:x")).toBeNull();
    expect(parseValueSpec("@rank")).toBeNull();
  });
});

describe("resolveEffectValue", () => {
  const accessors = {
    rankOf: (slug) => ({ fighting: 4, persuasion: 3 }[slug] ?? 0),
    bonusDiceOf: (slug) => ({ axes: 2 }[slug] ?? 0),
    sacrificed: 3,
  };

  it("resolves a fixed value", () => {
    expect(resolveEffectValue("5", accessors)).toBe(5);
  });
  it("resolves @rank", () => {
    expect(resolveEffectValue("@rank:fighting", accessors)).toBe(4);
  });
  it("resolves @half rounding up", () => {
    expect(resolveEffectValue("@half:persuasion", accessors)).toBe(2); // ceil(3/2)
  });
  it("resolves @bonusdice", () => {
    expect(resolveEffectValue("@bonusdice:axes", accessors)).toBe(2);
  });
  it("resolves @sacrificed from runtime context", () => {
    expect(resolveEffectValue("@sacrificed", accessors)).toBe(3);
  });
  it("yields 0 for a missing target or invalid spec", () => {
    expect(resolveEffectValue("@rank:unknown", accessors)).toBe(0);
    expect(resolveEffectValue("@bad", accessors)).toBe(0);
  });
  it("truncates a fractional fixed value", () => {
    expect(resolveEffectValue("2.5", accessors)).toBe(2);
  });
  it("tolerates absent accessors for every derived form", () => {
    expect(resolveEffectValue("@rank:fighting", {})).toBe(0);
    expect(resolveEffectValue("@half:persuasion", {})).toBe(0);
    expect(resolveEffectValue("@bonusdice:axes", {})).toBe(0);
    expect(resolveEffectValue("@sacrificed", {})).toBe(0);
    expect(resolveEffectValue("4", {})).toBe(4);
  });
});

describe("isDerivedValue", () => {
  it("detects derived vs fixed", () => {
    expect(isDerivedValue("@rank:x")).toBe(true);
    expect(isDerivedValue("5")).toBe(false);
    expect(isDerivedValue(5)).toBe(false);
  });
});

// Wave 5 — buildValueString is the inverse of parseValueSpec, used by the
// authoring UI to serialise the form selections back into change.value.
describe("buildValueString", () => {
  it("serialises fixed values", () => {
    expect(buildValueString({ mode: "fixed", value: 5 })).toBe("5");
    expect(buildValueString({ mode: "fixed", value: -2 })).toBe("-2");
    expect(buildValueString({ mode: "fixed", value: 1.9 })).toBe("1"); // trunc
  });

  it("serialises the slug-bearing derived forms", () => {
    expect(
      buildValueString({ mode: "derived", form: "rank", slug: "fighting" })
    ).toBe("@rank:fighting");
    expect(
      buildValueString({ mode: "derived", form: "half", slug: "persuasion" })
    ).toBe("@half:persuasion");
    expect(
      buildValueString({ mode: "derived", form: "bonusdice", slug: "axes" })
    ).toBe("@bonusdice:axes");
  });

  it("serialises the slugless sacrificed form", () => {
    expect(buildValueString({ mode: "derived", form: "sacrificed" })).toBe(
      "@sacrificed"
    );
  });

  it("falls back to '0' for an invalid spec (no @broken value persisted)", () => {
    expect(buildValueString({ mode: "derived", form: "rank" })).toBe("0"); // missing slug
    expect(buildValueString(null)).toBe("0");
    expect(buildValueString(undefined)).toBe("0");
  });

  it("round-trips with parseValueSpec for every valid spec", () => {
    const specs = [
      { mode: "fixed", value: 5 },
      { mode: "fixed", value: -2 },
      { mode: "derived", form: "rank", slug: "fighting" },
      { mode: "derived", form: "half", slug: "persuasion" },
      { mode: "derived", form: "bonusdice", slug: "axes" },
      { mode: "derived", form: "sacrificed", slug: null },
    ];
    for (const spec of specs) {
      expect(parseValueSpec(buildValueString(spec))).toEqual(spec);
    }
  });
});
