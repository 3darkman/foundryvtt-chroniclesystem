// Stable slug normalisation — the SSOT for turning a display name into a stable,
// localization-independent identity (constitution §II). Extracted into its OWN
// dependency-free module so BOTH `cs-effect-vocabulary.js` (which imports
// ChronicleSystem to read `modifiersConstants` at eval time) and
// `ChronicleSystem.js` itself (which keys the read-side by slug, spec 008) can
// import it WITHOUT the eval-time import cycle. Zero imports on purpose.

/**
 * Stable, localization-independent slug. Normalises a name: strip accents,
 * lowercase, collapse every run of non-alphanumeric characters (whitespace,
 * punctuation, dots) to a single `_`, trimming leading/trailing `_`. Dots are
 * removed so a slug can never collide with the `.` key separator. Uses the
 * `_` separator — NEVER the Foundry `String.prototype.slugify` (`-`), which
 * would break the `cs.*` effect grammar in production.
 * @param {string} name
 * @returns {string}
 */
export function slugify(name) {
  if (!name || typeof name !== "string") return "";
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
