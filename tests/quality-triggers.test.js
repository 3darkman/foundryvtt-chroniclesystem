import { describe, it, expect } from "vitest";
import {
  evaluateTrigger,
  encodeTriggerCompound,
  decodeTriggerCompound,
} from "../module/combat/cs-quality-triggers.js";

// spec 021 (US2) — the pure trigger evaluator (D13/D14/D15). Numbers in, numbers
// out: degree thresholds, Treacherous ones > parameter, and the every-miss guard.

const degrees = (threshold) => ({ kind: "degrees", threshold });
const ones = (threshold) => ({ kind: "ones", threshold });

describe("evaluateTrigger — degree-gated qualities (D13)", () => {
  it("Impale fires at ≥3 degrees, dims below", () => {
    expect(
      evaluateTrigger(degrees(3), { success: true, degrees: 3 })
    ).toEqual({ triggered: true, count: 3, countKind: "degrees" });
    expect(
      evaluateTrigger(degrees(3), { success: true, degrees: 4 }).triggered
    ).toBe(true);
    expect(
      evaluateTrigger(degrees(3), { success: true, degrees: 2 }).triggered
    ).toBe(false);
  });

  it("Shattering / Staggering / Fragile fire at ≥2 degrees", () => {
    expect(
      evaluateTrigger(degrees(2), { success: true, degrees: 2 }).triggered
    ).toBe(true);
    expect(
      evaluateTrigger(degrees(2), { success: true, degrees: 1 }).triggered
    ).toBe(false);
  });

  it("always reports the count + countKind, even when dimmed", () => {
    expect(evaluateTrigger(degrees(3), { success: true, degrees: 1 })).toEqual({
      triggered: false,
      count: 1,
      countKind: "degrees",
    });
  });
});

describe("evaluateTrigger — Treacherous (ones > parameter, D15)", () => {
  it("fires when the ones count EXCEEDS the threshold", () => {
    expect(
      evaluateTrigger(ones(2), { success: true, onesCount: 3 })
    ).toEqual({ triggered: true, count: 3, countKind: "ones" });
    expect(
      evaluateTrigger(ones(2), { success: true, onesCount: 2 }).triggered
    ).toBe(false);
  });

  it("a null threshold falls back to the reference's parameter", () => {
    expect(
      evaluateTrigger(ones(null), { success: true, onesCount: 3, parameter: "2" })
        .triggered
    ).toBe(true);
    expect(
      evaluateTrigger(ones(null), { success: true, onesCount: 2, parameter: "2" })
        .triggered
    ).toBe(false);
  });

  it("a blank parameter → threshold 0 (any 1 exceeds it)", () => {
    expect(
      evaluateTrigger(ones(null), { success: true, onesCount: 1, parameter: "" })
        .triggered
    ).toBe(true);
    expect(
      evaluateTrigger(ones(null), { success: true, onesCount: 0, parameter: "" })
        .triggered
    ).toBe(false);
  });
});

describe("evaluateTrigger — FR-008 (every miss ⇒ not triggered)", () => {
  it("a miss never fires, regardless of degrees/ones", () => {
    expect(
      evaluateTrigger(degrees(2), { success: false, degrees: null })
    ).toEqual({ triggered: false, count: null, countKind: null });
    expect(
      evaluateTrigger(ones(0), { success: false, onesCount: 5 }).triggered
    ).toBe(false);
  });

  it("an ungated (kind:none / unknown) trigger never fires by degree/count", () => {
    expect(
      evaluateTrigger({ kind: "none" }, { success: true, degrees: 4 })
    ).toEqual({ triggered: false, count: null, countKind: null });
  });
});

// spec 021 (US3 UI redesign) — the compound-select codec the condition rule's
// "Scope / mode" dropdown round-trips through. Encode (Handlebars helper) and decode
// (sheet submit) are one SSOT so they can never drift.
describe("encode/decodeTriggerCompound — condition-rule mode codec", () => {
  it("round-trips every offered gate", () => {
    for (const trigger of [
      { kind: "none", threshold: null },
      { kind: "degrees", threshold: 2 },
      { kind: "degrees", threshold: 5 },
      { kind: "ones", threshold: null },
    ]) {
      expect(decodeTriggerCompound(encodeTriggerCompound(trigger))).toEqual(
        trigger
      );
    }
  });

  it("encodes the canonical select values", () => {
    expect(encodeTriggerCompound({ kind: "degrees", threshold: 3 })).toBe(
      "degrees:3"
    );
    expect(encodeTriggerCompound({ kind: "ones", threshold: null })).toBe(
      "ones"
    );
    expect(encodeTriggerCompound(undefined)).toBe("none");
    expect(encodeTriggerCompound({ kind: "degrees" })).toBe("degrees:2"); // null threshold → default
  });

  it("decodes threshold as a Number (never the raw string, foundry-api-expert)", () => {
    const decoded = decodeTriggerCompound("degrees:4");
    expect(decoded).toEqual({ kind: "degrees", threshold: 4 });
    expect(typeof decoded.threshold).toBe("number");
  });

  it("an unrecognised value decodes to the inert none gate", () => {
    expect(decodeTriggerCompound("")).toEqual({ kind: "none", threshold: null });
    expect(decodeTriggerCompound("garbage")).toEqual({
      kind: "none",
      threshold: null,
    });
    expect(decodeTriggerCompound("degrees:")).toEqual({
      kind: "degrees",
      threshold: 2,
    }); // malformed N → default 2
  });
});
