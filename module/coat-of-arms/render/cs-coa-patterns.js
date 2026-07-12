// Pattern / semy <pattern> builder — PORTED from Armoria (getters.js:16-38 +
// dataModel.js patterns; FR-018). Consumes patternGeom (catalog DATA) whose bodies
// carry {{c1}}/{{c2}}/{{chargeId}} placeholders. Pure, no DOM. Sub-tinctures must
// resolve to color KEYS (patterns embed literal colors, not url() references).

/** getSizeMod (getters.js:108-115). `bigger` → 2 (patternSizes lacks it — D). */
export function getSizeMod(size) {
  if (size === "small") return 0.8;
  if (size === "smaller") return 0.5;
  if (size === "smallest") return 0.25;
  if (size === "big") return 1.6;
  if (size === "bigger") return 2;
  return 1;
}

/** The semy charge id in a `semy_of_<charge>-…` string, or null (getters.js:34-38). */
export function semyCharge(patternId) {
  const m = /^semy_of_(.*?)-/.exec(patternId);
  return m ? m[1] : null;
}

/**
 * Build a `<pattern>` element string for a pattern/semy tincture id.
 * @param {string} patternId  e.g. "chequy-or-azure" | "semy_of_mullet-gules-or-small"
 * @param {object} ctx
 * @param {object} ctx.patternGeom  catalog { pattern: { wMul, hMul, viewBox, attrs, body } }
 * @param {function} ctx.resolveKey  (tinctureKey|hex) → hex
 * @returns {string|null}
 */
export function buildPattern(patternId, { patternGeom, resolveKey }) {
  const charge = semyCharge(patternId);
  const [pattern, t1, t2, size] = patternId.split("-");
  const geom = patternGeom[charge ? "semy" : pattern];
  if (!geom) return null;

  const mod = getSizeMod(size);
  let body = geom.body
    .replaceAll("{{c1}}", resolveKey(t1))
    .replaceAll("{{c2}}", resolveKey(t2));
  if (charge) body = body.replaceAll("{{chargeId}}", charge);

  const attrs = (geom.attrs || "")
    .replaceAll("{{c1}}", resolveKey(t1))
    .replaceAll("{{c2}}", resolveKey(t2));
  const w = mod * geom.wMul;
  const h = mod * geom.hMul;
  return `<pattern id="${patternId}" width="${w}" height="${h}" viewBox="${geom.viewBox}" ${attrs}>${body}</pattern>`;
}
