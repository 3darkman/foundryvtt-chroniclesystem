// Effect value resolver — a change.value is either a FIXED number or a DERIVED
// spec `@<form>:<slug>` computed from another characteristic (constitution §I:
// single responsibility; §II: the derivation grammar lives here once).
//
// PURE module: it takes accessor functions, not an actor, so it is fully
// testable in Vitest. The domain wires the accessors from the live actor.
//
// Grammar (docs/ae-effect-model-design.md §2):
//   "5"                fixed
//   "@rank:fighting"   rank of an ability/specialty
//   "@half:persuasion" half the rank, rounded up
//   "@bonusdice:axes"  number of bonus dice in a specialty
//   "@sacrificed"      bonus dice sacrificed this roll (runtime context)

export const DERIVED_PREFIX = "@";

/** Derivation forms (also the authoring dropdown options). */
export const VALUE_FORMS = {
  RANK: "rank",
  HALF: "half",
  BONUS_DICE: "bonusdice",
  SACRIFICED: "sacrificed",
};

const SLUG_FORMS = new Set([
  VALUE_FORMS.RANK,
  VALUE_FORMS.HALF,
  VALUE_FORMS.BONUS_DICE,
]);

/**
 * Parse a raw change.value into a value spec.
 * @param {number|string} rawValue
 * @returns {{mode: "fixed", value: number} | {mode: "derived", form: string, slug: string|null} | null}
 */
export function parseValueSpec(rawValue) {
  // Fixed values are integers by contract (they feed dice/modifier math);
  // truncate toward zero in one place so the rest of the system never sees a
  // fractional value. The derived forms already yield integers.
  if (typeof rawValue === "number") {
    return {
      mode: "fixed",
      value: Number.isFinite(rawValue) ? Math.trunc(rawValue) : 0,
    };
  }
  if (typeof rawValue !== "string") return { mode: "fixed", value: 0 };

  const text = rawValue.trim();
  if (!text.startsWith(DERIVED_PREFIX)) {
    return { mode: "fixed", value: Math.trunc(Number(text)) || 0 };
  }

  const [form, slug] = text.slice(DERIVED_PREFIX.length).split(":");
  if (form === VALUE_FORMS.SACRIFICED) {
    return { mode: "derived", form, slug: null };
  }
  if (SLUG_FORMS.has(form) && slug) {
    return { mode: "derived", form, slug };
  }
  return null; // invalid derived spec — ignored by the resolver
}

/**
 * Resolve a raw change.value to a number using the provided accessors.
 * @param {number|string} rawValue
 * @param {{rankOf?: (slug: string) => number, bonusDiceOf?: (slug: string) => number, sacrificed?: number}} accessors
 * @returns {number}
 */
export function resolveEffectValue(rawValue, accessors = {}) {
  const spec = parseValueSpec(rawValue);
  if (!spec) return 0;
  if (spec.mode === "fixed") return spec.value;

  const rankOf = (slug) => Number(accessors.rankOf?.(slug)) || 0;
  switch (spec.form) {
    case VALUE_FORMS.RANK:
      return rankOf(spec.slug);
    case VALUE_FORMS.HALF:
      return Math.ceil(rankOf(spec.slug) / 2);
    case VALUE_FORMS.BONUS_DICE:
      return Number(accessors.bonusDiceOf?.(spec.slug)) || 0;
    case VALUE_FORMS.SACRIFICED:
      return Number(accessors.sacrificed) || 0;
    default:
      return 0;
  }
}

/** True when a raw value is a derived spec (for UI mode toggling). */
export function isDerivedValue(rawValue) {
  return (
    typeof rawValue === "string" && rawValue.trim().startsWith(DERIVED_PREFIX)
  );
}

/**
 * Serialise a value spec back into the stored `change.value` string — the
 * inverse of {@link parseValueSpec}, used by the authoring UI (Wave 5) to write
 * the form selections. Round-trips: `parseValueSpec(buildValueString(spec))`
 * deep-equals `spec` for every valid spec.
 *   {mode:"fixed", value:5}                      → "5"
 *   {mode:"derived", form:"rank", slug:"fighting"} → "@rank:fighting"
 *   {mode:"derived", form:"sacrificed"}            → "@sacrificed"
 * An invalid derived spec (missing slug) falls back to "0".
 * @param {{mode: string, value?: number, form?: string, slug?: string|null}} spec
 * @returns {string}
 */
export function buildValueString(spec) {
  if (!spec || typeof spec !== "object") return "0";
  if (spec.mode === "derived") {
    if (spec.form === VALUE_FORMS.SACRIFICED) {
      return `${DERIVED_PREFIX}${spec.form}`;
    }
    if (SLUG_FORMS.has(spec.form) && spec.slug) {
      return `${DERIVED_PREFIX}${spec.form}:${spec.slug}`;
    }
    return "0"; // invalid derived spec — never persist a broken @form
  }
  const value = Number(spec.value);
  return String(Number.isFinite(value) ? Math.trunc(value) : 0);
}
