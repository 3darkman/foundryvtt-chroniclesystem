// Charge definition + centering. getChargeDef ports the Armoria charge/inescutcheon
// resolution (getters.js:44-56,73-88): a bundled charge returns its inline <g> +
// pre-computed bbox; an `inescutcheon*` charge is drawn from the homonymous shield
// path. centeringTransform is spec-014 NEW (FR-006a, D4): because we rasterise
// off-DOM (getBBox returns 0), we centre each charge by its pre-computed bbox onto
// (100,100) and scale to a canonical extent — so getElTransform's (100,100) pivot
// stays correct. Pure, no DOM.

/** Canonical charge extent (px) after normalisation — calibratable (risk #1, T030). */
export const CANONICAL_EXTENT = 80;

const round = (n) => Math.round(n * 1000) / 1000;

/**
 * Resolve a charge's inline artwork.
 * @param {string} name  charge key
 * @param {object} ctx
 * @param {object} ctx.chargeArt    catalog { name: { innerG, bbox, license } }
 * @param {object} ctx.shieldPaths  catalog shield paths (for inescutcheon)
 * @param {string} ctx.shield       current shield key (bare "inescutcheon")
 * @returns {{ innerG: string, bbox: {x,y,w,h}, license: object } | null}
 *          innerG is a COMPLETE `<g id=name>…</g>` inlined verbatim into <defs>;
 *          null → no bundled art (caller draws a placeholder + warns — D14).
 */
export function getChargeDef(name, ctx) {
  if (name.slice(0, 12) === "inescutcheon") return inescutcheonDef(name, ctx);
  const art = ctx.chargeArt[name];
  if (!art) return null;
  return art;
}

/** Middle-earth shields under a Weta Workshop fair-use license (getters.js:51). */
const WETA_SHIELDS = new Set([
  "noldor",
  "gondor",
  "easterling",
  "ironHills",
  "urukHai",
  "moriaOrc",
]);

/** Inescutcheon charge = the homonymous shield path, scaled/placed (getters.js:44-56). */
function inescutcheonDef(name, ctx) {
  const shieldName =
    name.length > 12
      ? name.slice(12, 13).toLowerCase() + name.slice(13)
      : ctx.shield;
  const path = ctx.shieldPaths[shieldName]?.path;
  if (!path) return null;
  // Preserve attribution on the <g>, matching addInescutcheon (getters.js:51-54)
  // and FR-013 (license on every inlined charge <g>).
  const license = WETA_SHIELDS.has(shieldName)
    ? {
        author: "Weta Workshop",
        source: "www.wetanz.com",
        license: "https://en.wikipedia.org/wiki/Fair_use",
      }
    : {
        author: "Azgaar",
        license: "https://creativecommons.org/publicdomain/zero/1.0",
      };
  const attrs = Object.entries(license)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");
  const innerG = `<g id="${name}" ${attrs}><path transform="translate(67 67) scale(.33)" d="${path}"/></g>`;
  // scale .33 of a ~200-unit shield translated (67,67) → centred ~ (100,100).
  return { innerG, bbox: { x: 67, y: 67, w: 66, h: 66 }, license };
}

/** A neutral placeholder group for a charge with no bundled art (D14). */
export function placeholderDef(name) {
  const innerG = `<g id="${name}"><rect x="62" y="62" width="76" height="76" rx="8" fill="#cccccc" stroke="#000" stroke-width="2"/><path d="M100 78a12 12 0 0 1 8 21c-4 4-8 5-8 11m0 10v.5" fill="none" stroke="#000" stroke-width="6" stroke-linecap="round"/></g>`;
  return { innerG, bbox: { x: 62, y: 62, w: 76, h: 76 }, license: {} };
}

/**
 * Normalisation transform mapping a charge's drawn bbox centre onto (100,100) and
 * scaling it to the canonical extent (FR-006a). Applied to the `<use>` BEFORE
 * getElTransform (i.e. as the inner transform).
 * @param {{x:number,y:number,w:number,h:number}} bbox
 * @param {number} [canonical=CANONICAL_EXTENT]
 * @returns {string}
 */
export function centeringTransform(bbox, canonical = CANONICAL_EXTENT) {
  const cx = bbox.x + bbox.w / 2;
  const cy = bbox.y + bbox.h / 2;
  const s = canonical / Math.max(bbox.w, bbox.h);
  return `translate(${round(100 - s * cx)} ${round(
    100 - s * cy
  )}) scale(${round(s)})`;
}
