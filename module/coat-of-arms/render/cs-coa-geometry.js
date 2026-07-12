// Division / ordinary / line geometry consumption + shield viewBox. PORTED from
// Armoria (getters.js:10-14, COA.svelte:18-26). FR-018 render math, restricted to
// render/. Pure, no DOM. Geometry lives as DATA in the catalog (FR-017) — here we
// only substitute the {{line}} placeholder and compute the viewBox.

/**
 * Resolve a division/ordinary template, inlining the chosen line path. The catalog
 * `templateLined` is a STRING with `{{line}}` (some embed it 2-4× → replaceAll).
 * @param {{template:?string, templateLined:?string}} geomObj
 * @param {string} [line]
 * @param {object} lineData  catalog { style: "<path-d>" }
 * @returns {string}
 */
export function getTemplate(geomObj, line, lineData) {
  if (!geomObj) return "";
  if (!line || line === "straight" || !geomObj.templateLined)
    return geomObj.template ?? "";
  const linePath = lineData[line];
  if (!linePath) return geomObj.template ?? "";
  return geomObj.templateLined.replaceAll("{{line}}", linePath);
}

/**
 * The SVG viewBox for a shield at zoom 1 (COA.svelte:18-26 with DEFAULT_ZOOM 1).
 * @param {string} shield
 * @param {object} shieldPaths  catalog { shield: { path, box } }
 * @returns {string}
 */
export function getViewBox(shield, shieldPaths) {
  const box = shieldPaths[shield]?.box || "0 0 200 200";
  const [x0, y0, w0, h0] = box.split(" ").map(Number);
  const w = Math.round(w0); // DEFAULT_ZOOM / zoom = 1
  const h = Math.round(h0);
  const x = x0 - w / 2 + 100;
  const y = y0 - h / 2 + 100;
  return `${x} ${y} ${w} ${h}`;
}
