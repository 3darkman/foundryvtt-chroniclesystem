// Charge / ordinary positioning math — PORTED VERBATIM from Armoria
// (github.com/Azgaar/Armoria, MIT — Azgaar / Maxim Ganiev). FR-018 exception:
// this render math stays faithful to the upstream (drag.js:105-147); do NOT
// refactor it for "clean code". Pure functions, no DOM. Every scale/mirror pivots
// at (100,100); charge position codes are relative to the shield centre.

/** Armoria's drag.js round (precision 2). */
function round(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Group-level transform for a charge/ordinary (drag.js:105-126). When the element
 * is positioned (has `p`), size/stretch are applied per-<use> instead, so the
 * group transform forces size=1.
 * @returns {string|null}
 */
export function transform(charge) {
  let { x = 0, y = 0, angle = 0, size = 1, stretch = 0, p } = charge;
  if (p) {
    size = 1;
    stretch = 0;
  }

  let sx = size;
  let sy = size;
  if (stretch < 0) sx = round(sx * (1 - stretch));
  else if (stretch > 0) sy = round(sy * (1 + stretch));
  x = round(x - 100 * (sx - 1));
  y = round(y - 100 * (sy - 1));

  let t = "";
  if (x || y) t += `translate(${x} ${y})`;
  if (angle) t += ` rotate(${angle} ${sx * 100} ${sy * 100})`;
  if (sx !== 1 || sy !== 1)
    t += sx === sy ? ` scale(${sx})` : ` scale(${sx} ${sy})`;

  return t ? t.trim() : null;
}

/**
 * Per-<use> transform for a charge at a single position code (drag.js:128-147).
 * @param {object} charge
 * @param {string} p        single position code (e.g. "e", "a")
 * @param {string} shield   shield key
 * @param {object} positionCoords  catalog { shield: { code: [x, y] } }
 * @param {object} shieldGeom      catalog { shield: { size } }
 * @returns {string|null}
 */
export function getElTransform(charge, p, shield, positionCoords, shieldGeom) {
  const positions = positionCoords[shield] || positionCoords.spanish;
  const sizeModifier = shieldGeom[shield]?.size || 1;

  const size = round((charge.size || 1) * sizeModifier);
  let sx = charge.sinister ? -size : size;
  let sy = charge.reversed ? -size : size;
  if (charge.stretch < 0) sx = round(sx * (1 - charge.stretch));
  else if (charge.stretch > 0) sy = round(sy * (1 + charge.stretch));
  let [x, y] = positions[p];
  x = round(x - 100 * (sx - 1));
  y = round(y - 100 * (sy - 1));

  let t = "";
  if (x || y) t += `translate(${x} ${y})`;
  if (sx !== 1 || sy !== 1)
    t += sx === sy ? ` scale(${sx})` : ` scale(${sx} ${sy})`;

  return t ? t.trim() : null;
}
