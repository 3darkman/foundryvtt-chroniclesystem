// Quality trigger evaluation — the single source of truth (SSOT, constitution §II)
// for whether a degree/count-gated quality FIRED on a given roll (spec 021, D13/D14).
// Shared by US2 (result-card highlight) and US3 (apply-to-target gate): both read the
// SAME data-driven `trigger` on the quality rule, so there is no code-side slug→
// threshold table to drift.
//
// PURE module (no Foundry runtime) → testable in Vitest. Mirrors `cs-conflict.js`:
// numbers in, numbers out; no `game`/`canvas`/`actor` and no import of
// `ChronicleSystem.js` / `cs-effect-vocabulary.js` (import-cycle invariant).

/**
 * Evaluate a quality rule's `trigger` against the actual roll outcome (spec 021,
 * D13/D14). A miss NEVER fires (FR-008) — `degrees` is already `null` on a miss, but
 * the `!success` guard makes the intent explicit and also blocks the ones-count path.
 *
 * - `kind:"degrees"` — fires when the roll's degrees of success meet the threshold
 *   (Shattering/Staggering/Fragile ≥2, Impale ≥3). `count` = the degrees.
 * - `kind:"ones"` — fires when the per-instance count of 1s EXCEEDS the threshold
 *   (Treacherous). A null threshold falls back to the reference's own `parameter`
 *   (Treacherous's listed value, D15). `count` = the ones count.
 * - `kind:"none"` / unknown — never fires (an ungated reminder is dimmed until a hit
 *   makes it relevant, but degree/count is not what gates it).
 *
 * @param {{kind: string, threshold: number|null}} trigger the rule's trigger
 * @param {{success: boolean, degrees: number|null, onesCount: number, parameter: string|number}} ctx
 * @returns {{triggered: boolean, count: number|null, countKind: string|null}}
 */
export function evaluateTrigger(trigger, ctx = {}) {
  const { success, degrees, onesCount, parameter } = ctx;
  if (!success) return { triggered: false, count: null, countKind: null };

  switch (trigger?.kind) {
    case "degrees":
      return {
        triggered: degrees != null && degrees >= trigger.threshold,
        count: degrees,
        countKind: "degrees",
      };
    case "ones": {
      // Treacherous: threshold defaults to the reference's per-instance parameter.
      const threshold = trigger.threshold ?? (Number(parameter) || 0);
      const count = Number(onesCount) || 0;
      return { triggered: count > threshold, count, countKind: "ones" };
    }
    default:
      return { triggered: false, count: null, countKind: null };
  }
}

/**
 * The single grammar (SSOT, §II) of a condition rule's degree/count gate as the
 * flat string its "Scope / mode" `<select>` carries (spec 021 US3 UI redesign):
 * `"none"` | `"degrees:<N>"` | `"ones"`. Co-located with the trigger type so the
 * encode (Handlebars helper) and decode (sheet submit) share ONE definition and
 * can never drift; presentation imports it (dependencies flow inward, §IV).
 */
export const TRIGGER_COMPOUND_DEGREES_PREFIX = "degrees:";

/** Encode a `{kind, threshold}` trigger into its compound select value. */
export function encodeTriggerCompound(trigger) {
  const kind = trigger?.kind ?? "none";
  if (kind === "degrees") {
    return `${TRIGGER_COMPOUND_DEGREES_PREFIX}${trigger?.threshold ?? 2}`;
  }
  if (kind === "ones") return "ones";
  return "none";
}

/**
 * Decode a compound select value back into a schema `{kind, threshold}` trigger.
 * `threshold` is always a Number (never the raw string) so the `NumberField`
 * validates (foundry-api-expert). Any unrecognised value → the inert `none` gate.
 */
export function decodeTriggerCompound(value) {
  if (value === "ones") return { kind: "ones", threshold: null };
  if (
    typeof value === "string" &&
    value.startsWith(TRIGGER_COMPOUND_DEGREES_PREFIX)
  ) {
    return {
      kind: "degrees",
      threshold:
        Number(value.slice(TRIGGER_COMPOUND_DEGREES_PREFIX.length)) || 2,
    };
  }
  return { kind: "none", threshold: null };
}
