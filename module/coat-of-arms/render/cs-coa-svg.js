// buildCoaSvg(coa, { size }) → self-contained SVG string. The embedded renderer
// (spec 014), PORTED from Armoria (Shield.svelte:77-234, COA.svelte; MIT — Azgaar /
// Maxim Ganiev). FR-018 exception: the z-order / assembly stays faithful to the
// upstream. The output has explicit width/height (D8), every used charge + pattern
// inlined in <defs>, and ZERO external references (FR-016) — safe to rasterise
// off-DOM and portable. No network, no PIXI. See contracts/renderer-pipeline.md.

import { CATALOG } from "../cs-armoria-catalog.js";
import { transform, getElTransform } from "./cs-coa-transform.js";
import { getTemplate, getViewBox } from "./cs-coa-geometry.js";
import { resolveFill, resolveKey } from "./cs-coa-tincture.js";
import { buildPattern, semyCharge } from "./cs-coa-patterns.js";
import {
  getChargeDef,
  placeholderDef,
  centeringTransform,
} from "./cs-coa-charges.js";

const DEFAULT_BORDER = "#333333";
const DEFAULT_BORDER_WIDTH = 1;

// Instance-unique token so clip-path ids don't collide when several previews live
// in the same page DOM. Charge/pattern ids are content-addressed (id encodes the
// art/colours) → identical ids carry identical content, so collisions are benign.
let UID = 0;

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Resolve the effective charge id ("inescutcheon" → per-shield, Charge.svelte:32). */
function chargeId(name, shield) {
  return name === "inescutcheon" ? "inescutcheon" + cap(shield) : name;
}

/**
 * Build a self-contained SVG string for a COA definition.
 * @param {object} coa    validated COA definition
 * @param {object} [opts]
 * @param {number} [opts.size=500]  width/height in px
 * @returns {{ svg: string, warnings: Array<{key:string,data?:object}> }}
 */
export function buildCoaSvg(coa, { size = 500 } = {}) {
  const uid = `c${++UID}`;
  const c = coa ?? {};
  const shield = c.shield || "heater";
  const division = c.division && c.division.division ? c.division : null;
  const hasDivision = division && division.division !== "no";
  const ordinaries = Array.isArray(c.ordinaries) ? c.ordinaries : [];
  const charges = Array.isArray(c.charges) ? c.charges : [];

  const usedPatterns = new Set();
  const defCache = new Map(); // chargeId → { innerG, bbox, license }
  const warnings = [];

  const ctx = {
    tinctureColors: CATALOG.tinctureColors,
    positionCoords: CATALOG.positionCoords,
    shieldGeom: CATALOG.shieldGeom,
    shieldPaths: CATALOG.shieldPaths,
    ordinaryGeom: CATALOG.ordinaryGeom,
    lineData: CATALOG.lineData,
    chargeArt: CATALOG.chargeArt,
    shield,
    usePattern: (pid) => usedPatterns.add(pid),
  };

  const clr = (t) => resolveFill(t, ctx);

  // Memoised charge definition (falls back to a placeholder + warning — D14).
  const getDef = (id) => {
    if (defCache.has(id)) return defCache.get(id);
    let def = getChargeDef(id, ctx);
    if (!def) {
      def = placeholderDef(id);
      warnings.push({
        key: "CS.coa.warnings.chargeMissingArt",
        data: { charge: id },
      });
    }
    defCache.set(id, def);
    return def;
  };

  const positionsFor = (sh) =>
    ctx.positionCoords[sh] || ctx.positionCoords.spanish;

  /**
   * One charge group (Charge.svelte). `primary` is the resolved primary fill.
   * `counter` = counterchanged: the source drops t2/t3 so --secondary/--tertiary
   * collapse to the single counter fill (a counterchanged charge is one colour).
   */
  const renderCharge = (ch, primary, hideBg, counter = false) => {
    const positions = positionsFor(shield);
    const codes = [...new Set(String(ch.p ?? ""))].filter((p) => positions[p]);
    // No valid position for this shield → render nothing (Charge.svelte:53-55).
    if (!codes.length) return "";

    const id = chargeId(ch.charge, shield);
    const def = getDef(id);
    const centering = centeringTransform(def.bbox);
    const sec = counter ? primary : clr(ch.t2) || primary;
    const ter = counter ? primary : clr(ch.t3) || primary;
    const stroke = ch.stroke || "#000";
    const bg = hideBg ? "none" : "block";
    const gt = transform(ch);

    const uses = codes
      .map((p) => {
        const el = getElTransform(
          ch,
          p,
          shield,
          ctx.positionCoords,
          ctx.shieldGeom
        );
        return `<use href="#${id}" transform="${
          el ? `${el} ${centering}` : centering
        }"/>`;
      })
      .join("");

    return `<g class="charge" fill="${primary}"${
      gt ? ` transform="${gt}"` : ""
    } stroke="${stroke}" style="--secondary: ${sec}; --tertiary: ${ter}; --stroke: ${stroke}; --background: ${bg}">${uses}</g>`;
  };

  /** One ordinary group (Ordinary.svelte). bordure/orle have no template (D14). */
  const renderOrdinary = (o, fillT) => {
    const name = o.ordinary;
    const gt = transform(o);
    const shieldPath = ctx.shieldPaths[shield]?.path;
    if ((name === "bordure" || name === "orle") && shieldPath) {
      const width = name === "bordure" ? 33.3 : 10;
      const transf =
        name === "orle" ? ` transform="translate(15 15) scale(.85)"` : "";
      return `<g class="ordinary"${
        gt ? ` transform="${gt}"` : ""
      } fill="${fillT}" stroke="none" stroke-width="${width}"><path d="${shieldPath}" fill="none" stroke="${fillT}"${transf}/></g>`;
    }
    const tmpl = getTemplate(ctx.ordinaryGeom[name], o.line, ctx.lineData);
    const stroke = o.stroke || "none";
    const width = o.strokeWidth || 1;
    return `<g class="ordinary"${
      gt ? ` transform="${gt}"` : ""
    } fill="${fillT}" stroke="${stroke}" stroke-width="${width}"><g>${tmpl}</g></g>`;
  };

  const regularOrds = ordinaries.filter((o) => !o.above);
  const aboveOrds = ordinaries.filter((o) => o.above);
  const fieldFill = clr(c.t1);
  const divFill = division ? clr(division.t) : null;

  // Optional background fill (spec 014) — painted behind everything, covering the
  // whole viewBox. Resolved via clr() so it registers any pattern before <defs>.
  const viewBox = getViewBox(shield, ctx.shieldPaths);
  const bg = c.background && c.background !== "none" ? clr(c.background) : null;
  const bgRect = bg
    ? (() => {
        const [vx, vy, vw, vh] = viewBox.split(" ").map(Number);
        return `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="${bg}"/>`;
      })()
    : "";

  // ---- Body (Shield.svelte z-order) -----------------------------------------
  let body = bgRect;

  // Outside-below charges (before the shield clip).
  for (const ch of charges)
    if (ch.outside === "below" || ch.outside === "around")
      body += renderCharge(ch, clr(ch.t), false);
  for (const ch of charges)
    if (ch.outside === "below" && ch.layered)
      body += renderCharge(ch, clr(ch.t), true);

  let clipped = "";
  clipped += `<rect class="field" x="0" y="0" width="200" height="200" fill="${fieldFill}"/>`;

  if (hasDivision) {
    // In-field part.
    for (const o of regularOrds) {
      if (o.divided === "field") clipped += renderOrdinary(o, clr(o.t));
      else if (o.divided === "counter") clipped += renderOrdinary(o, divFill);
    }
    for (const ch of charges) {
      if (ch.divided === "field") clipped += renderCharge(ch, clr(ch.t), false);
      else if (ch.divided === "counter")
        clipped += renderCharge(ch, divFill, false, true);
    }
    for (const ch of charges) {
      if (ch.divided === "field" && ch.layered)
        clipped += renderCharge(ch, clr(ch.t), true);
      else if (ch.divided === "counter" && ch.layered)
        clipped += renderCharge(ch, divFill, true, true);
    }
    for (const o of aboveOrds) {
      if (o.divided === "field") clipped += renderOrdinary(o, clr(o.t));
      else if (o.divided === "counter") clipped += renderOrdinary(o, divFill);
    }

    // In-division part (clipped to the division template).
    let div = `<rect x="0" y="0" width="200" height="200" fill="${divFill}"/>`;
    for (const o of regularOrds) {
      if (o.divided === "division") div += renderOrdinary(o, clr(o.t));
      else if (o.divided === "counter") div += renderOrdinary(o, fieldFill);
    }
    for (const ch of charges) {
      if (ch.divided === "division") div += renderCharge(ch, clr(ch.t), false);
      else if (ch.divided === "counter")
        div += renderCharge(ch, fieldFill, false, true);
    }
    for (const ch of charges) {
      if (ch.divided === "division" && ch.layered)
        div += renderCharge(ch, clr(ch.t), true);
      else if (ch.divided === "counter" && ch.layered)
        div += renderCharge(ch, fieldFill, true, true);
    }
    for (const o of aboveOrds) {
      if (o.divided === "division") div += renderOrdinary(o, clr(o.t));
      else if (o.divided === "counter") div += renderOrdinary(o, fieldFill);
    }
    clipped += `<g class="division" clip-path="url(#division_${uid})">${div}</g>`;
  }

  // Overall (undivided) ordinaries, charges, layered charges, ordinaries-above.
  for (const o of regularOrds)
    if (!o.divided) clipped += renderOrdinary(o, clr(o.t));
  for (const ch of charges)
    if (!ch.outside && (!ch.divided || !c.division))
      clipped += renderCharge(ch, clr(ch.t), false);
  for (const ch of charges)
    if (!ch.outside && (!ch.divided || !c.division) && ch.layered)
      clipped += renderCharge(ch, clr(ch.t), true);
  for (const o of aboveOrds)
    if (!o.divided) clipped += renderOrdinary(o, clr(o.t));

  const shieldPath = ctx.shieldPaths[shield]?.path;
  body += shieldPath
    ? `<g clip-path="url(#shield_${uid})">${clipped}</g>`
    : `<g>${clipped}</g>`; // shield "no" → field without clip (D14)

  // Border (outside the clip).
  if (shieldPath)
    body += `<path class="grad" d="${shieldPath}" fill="none" stroke="${DEFAULT_BORDER}" stroke-width="${DEFAULT_BORDER_WIDTH}"/>`;

  // Outside-above charges (after the border).
  for (const ch of charges)
    if (ch.outside === "above") body += renderCharge(ch, clr(ch.t), false);
  for (const ch of charges)
    if ((ch.outside === "above" && ch.layered) || ch.outside === "around")
      body += renderCharge(ch, clr(ch.t), true);

  // ---- Defs (built AFTER body: body registered every used charge + pattern) --
  // Semy patterns reference a charge that must also be inlined.
  for (const pid of usedPatterns) {
    const sc = semyCharge(pid);
    if (sc) getDef(sc);
  }
  const chargeDefs = [...defCache.values()].map((d) => d.innerG).join("");
  const patternDefs = [...usedPatterns]
    .map((pid) =>
      buildPattern(pid, {
        patternGeom: CATALOG.patternGeom,
        resolveKey: (k) => resolveKey(k, ctx.tinctureColors),
      })
    )
    .filter(Boolean)
    .join("");

  let defs = "";
  if (shieldPath)
    defs += `<clipPath id="shield_${uid}"><path d="${shieldPath}"/></clipPath>`;
  if (hasDivision)
    defs += `<clipPath id="division_${uid}">${getTemplate(
      CATALOG.divisionGeom[division.division],
      division.line,
      ctx.lineData
    )}</clipPath>`;
  defs += `<style>.secondary{fill:var(--secondary)}.tertiary{fill:var(--tertiary)}.pseudostroke{fill:var(--stroke)}.background{display:var(--background)}</style>`;
  defs += chargeDefs;
  defs += patternDefs;

  const svg = `<svg viewBox="${viewBox}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs>${defs}</defs>${body}</svg>`;
  return { svg, warnings };
}
