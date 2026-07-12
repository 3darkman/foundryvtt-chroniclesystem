// Tincture → fill resolution (PORTED from Shield.svelte:28-38; D2). A canonical
// tincture key resolves to Armoria's render hue (`tinctureColors`); a `#rrggbb`
// literal is used directly (the `#` special case fixes the upstream bug where hex
// fell through to black); a pattern/semy string ("a-b-…") registers a <pattern>
// and returns url(#id). Pure, no DOM. FR-018 render logic.

/**
 * Resolve a tincture KEY or hex to a literal hex — used for pattern sub-fills,
 * which must be concrete colors (not url() references).
 * @param {string} t
 * @param {object} tinctureColors
 * @returns {string}
 */
export function resolveKey(t, tinctureColors) {
  if (!t) return "#000000";
  if (t[0] === "#") return t;
  return tinctureColors[t] || "#000000";
}

/**
 * Resolve a tincture value to an SVG fill.
 * @param {string} t
 * @param {object} ctx
 * @param {object} ctx.tinctureColors  catalog hue map
 * @param {function} [ctx.usePattern]  register a pattern id for the <defs> (US2)
 * @returns {string|null}  hex, `url(#id)`, or null when `t` is empty
 */
export function resolveFill(t, ctx) {
  if (!t) return null;
  if (t[0] === "#") return t; // hex literal (D2 fix)
  const hex = ctx.tinctureColors[t];
  if (hex) return hex;
  if (t.includes("-")) {
    ctx.usePattern?.(t);
    return `url(#${t})`;
  }
  return "#000000"; // unknown key → black (Shield.svelte fallback)
}
