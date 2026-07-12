// DEV TOOL — NOT loaded by Foundry. Regenerates the heraldic vocabulary SSOT.
//
// Reads the Armoria sources (default C:/tmp/armoria) and emits:
//   module/coat-of-arms/data/armoria-catalog.js        — frozen CATALOG (options + allowlist + geometry)
//   module/coat-of-arms/data/armoria-charge-art.js      — inline charge <g> + bbox + license (spec 014)
//   lang/armoria.<locale>.json                          — heraldic-vocabulary display labels (CS.coa.vocab.*)
//   assets/armoria/charges/<id>.svg                     — charge thumbnails (with --thumbs)
//
// The Armoria object literals are valid JS/TS expressions, so we slice the
// balanced literal for a named declaration and evaluate it. `dataModel`'s
// `divisions`/`lines`/`patterns` are FULL literals we evaluate whole (`divisions`
// CONTAINS `templateLined` generator functions; the `patterns` VALUES are
// generator functions) — the `new Function` in evalLit resolves everything,
// including `.repeat()` inside line-path template literals. Geometry generators
// are captured as template STRINGS with `{{line}}`/`{{c1}}`/`{{c2}}`/`{{chargeId}}`
// placeholders (contracts/catalog-geometry.md) so ALL geometry lives in the single
// generated catalog (FR-017) and the renderer only substitutes placeholders.
//
// Usage:  node scripts/extract-armoria-catalog.mjs [--src C:/tmp/armoria] [--thumbs] [--host https://armoria.herokuapp.com]
// See contracts/catalog-geometry.md §Regeneração.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { computeChargeArt } from "./lib/charge-bbox.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---- args -------------------------------------------------------------------
const argv = process.argv.slice(2);
const getArg = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const SRC = getArg("--src", "C:/tmp/armoria").replace(/\\/g, "/");
const HOST = getArg("--host", "https://armoria.herokuapp.com").replace(
  /\/$/,
  ""
);
const DO_THUMBS = argv.includes("--thumbs");

// ---- balanced-literal extraction -------------------------------------------

/** From an index pointing at `{` or `[`, return the balanced literal text,
 *  skipping string and comment content (so braces inside them do not count). */
function balanced(text, i) {
  const open = text[i];
  const close = open === "{" ? "}" : open === "[" ? "]" : null;
  if (!close)
    throw new Error(`expected { or [ at ${i}, got ${JSON.stringify(open)}`);
  let depth = 0;
  let str = null; // active string delimiter
  let esc = false;
  const start = i;
  for (; i < text.length; i++) {
    const c = text[i];
    if (str) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === str) str = null;
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      str = c;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error("unbalanced literal");
}

/** Find `regex` in text, then return the balanced literal that follows. */
function litAfter(text, regex) {
  const m = regex.exec(text);
  if (!m) throw new Error(`pattern not found: ${regex}`);
  let i = m.index + m[0].length;
  while (i < text.length && /\s/.test(text[i])) i++;
  return balanced(text, i);
}

/** Balanced literal of a top-level `const NAME = ...` (allows a TS type annot). */
function constLit(text, name) {
  return litAfter(
    text,
    new RegExp(`(?:export\\s+)?const\\s+${name}\\b[^=]*=\\s*`)
  );
}

/** Evaluate a pure-data literal (object/array) to a JS value. */
function evalLit(lit) {
  // eslint-disable-next-line no-new-func
  return new Function(`return (${lit})`)();
}

/** Parse a generated `<pattern …>…</pattern>` (size=1) into geometry data. The
 *  pattern element's OWN attributes (patternUnits/stroke/stroke-width/fill) are
 *  preserved as `attrs` — several patterns (vair, semy) rely on inherited stroke. */
function parsePattern(html) {
  const openEnd = html.indexOf(">");
  const opening = html.slice(0, openEnd);
  const close = html.lastIndexOf("</pattern>");
  const w = /width="([\d.]+)"/.exec(opening);
  const h = /height="([\d.]+)"/.exec(opening);
  const vb = /viewBox="([^"]*)"/.exec(opening);
  const attrs = opening
    .replace(/^<pattern\s*/, "")
    .replace(/\bid="[^"]*"/, "")
    .replace(/\bwidth="[\d.]+"/, "")
    .replace(/\bheight="[\d.]+"/, "")
    .replace(/\bviewBox="[^"]*"/, "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    wMul: w ? Number(w[1]) : 25,
    hMul: h ? Number(h[1]) : 25,
    viewBox: vb ? vb[1] : "0 0 200 200",
    attrs, // leftover pattern-element attributes (e.g. patternUnits, stroke)
    body: html.slice(openEnd + 1, close), // children (with {{c1}}/{{c2}}/{{chargeId}})
  };
}

const read = (file) => readFileSync(join(SRC, file), "utf8");

// ---- extract each axis -------------------------------------------------------

function extract() {
  const shieldsTxt = read("shields.ts");
  const chargesTxt = read("charges.js");
  const ordTxt = read("ordinaries.js");
  const dmTxt = read("dataModel.js");
  const defTxt = read("defaults.ts");

  // Shields — keys come from the 8 weighted category maps (exclude `types`/`data`);
  // per-shield positions + box come from `shields.data`.
  const shields = evalLit(constLit(shieldsTxt, "shields"));
  const boxMatch = /const\s+DEFAULT_SHIELD_BOX\s*=\s*"([^"]*)"/.exec(
    shieldsTxt
  );
  const DEFAULT_SHIELD_BOX = boxMatch ? boxMatch[1] : "0 0 200 200";
  const shieldKeys = [];
  for (const cat of Object.keys(shields)) {
    if (cat === "types" || cat === "data") continue;
    for (const k of Object.keys(shields[cat]))
      if (!shieldKeys.includes(k)) shieldKeys.push(k);
  }
  const shieldMeta = {};
  const shieldPaths = {};
  // Geometry as DATA (SSOT, FR-017): the renderer consumes these, never re-derives.
  const positionCoords = {}; // { shield: { code: [x, y] } } — relative to centre
  const shieldGeom = {}; // { shield: { size, segments } } — charge scale + compony
  for (const k of shieldKeys) {
    const d = shields.data?.[k];
    shieldMeta[k] = {
      positions: d?.positions ? Object.keys(d.positions) : [],
      box: d?.box ?? DEFAULT_SHIELD_BOX,
    };
    // SVG shape (path + viewBox) so the picker can draw each shield form.
    if (d?.path)
      shieldPaths[k] = { path: d.path, box: d.box ?? DEFAULT_SHIELD_BOX };
    if (d?.positions) positionCoords[k] = d.positions;
    shieldGeom[k] = { size: d?.size ?? 1, segments: d?.segments ?? null };
  }

  // Charges — the full selectable set is the union of the weighted category maps
  // in `charges` (NOT just `chargeData`, which only holds the ~231 with special
  // metadata). `charges` references `chargeData`, so inject it. `semy` is a
  // config map (category → weight) not a charge category, so it is skipped too.
  const chargeData = evalLit(constLit(chargesTxt, "chargeData"));
  // eslint-disable-next-line no-new-func
  const charges = new Function(
    "chargeData",
    `return (${constLit(chargesTxt, "charges")})`
  )(chargeData);
  const CHARGE_CONFIG_KEYS = new Set([
    "types",
    "single",
    "semy",
    "uploaded",
    "data",
  ]);
  const chargeKeys = [];
  for (const cat of Object.keys(charges)) {
    if (CHARGE_CONFIG_KEYS.has(cat)) continue;
    const map = charges[cat];
    if (!map || typeof map !== "object" || Array.isArray(map)) continue;
    for (const k of Object.keys(map))
      if (!chargeKeys.includes(k)) chargeKeys.push(k);
  }
  // Metadata-only charges (present in chargeData but no category) are still valid.
  for (const k of Object.keys(chargeData))
    if (!chargeKeys.includes(k)) chargeKeys.push(k);
  const chargeMeta = {};
  for (const k of chargeKeys) {
    const m = chargeData[k] ?? {};
    const meta = {};
    if (m.colors) meta.colors = m.colors;
    if (m.sinister) meta.sinister = true;
    if (m.reversed) meta.reversed = true;
    if (m.layered) meta.layered = true;
    if (m.positions) meta.positions = Object.keys(m.positions);
    chargeMeta[k] = meta;
  }

  // Ordinaries — lined (accept a `line`) + straight.
  const ordinaries = evalLit(constLit(ordTxt, "ordinaries"));
  const linedOrdinaries = Object.keys(ordinaries.lined);
  const straightOrdinaries = Object.keys(ordinaries.straight);
  const ordinaryKeys = [...linedOrdinaries, ...straightOrdinaries];
  // ordinaryGeom (SSOT): `template` static fragment; `templateLined` = the
  // generator invoked with the `{{line}}` sentinel (bordure/orle: both null →
  // drawn in code from the shield path). D6/catalog-geometry §ordinaryGeom.
  const ordinaryGeom = {};
  for (const [k, v] of Object.entries(ordinaries.data)) {
    ordinaryGeom[k] = {
      template: v.template ?? null,
      templateLined:
        typeof v.templateLined === "function"
          ? v.templateLined("{{line}}")
          : null,
    };
  }

  // Divisions / lines / patterns — evaluate the FULL literals (they carry
  // generator functions / `.repeat()` template literals — evalLit resolves all).
  const divisionsFull = evalLit(constLit(dmTxt, "divisions"));
  const divisions = Object.keys(divisionsFull.variants);
  const divisionGeom = {};
  for (const [k, v] of Object.entries(divisionsFull.data)) {
    divisionGeom[k] = {
      template: v.template ?? null,
      templateLined:
        typeof v.templateLined === "function"
          ? v.templateLined("{{line}}")
          : null,
    };
  }
  const linedDivisions = Object.keys(divisionGeom).filter(
    (k) => divisionGeom[k].templateLined
  );

  const linesFull = evalLit(constLit(dmTxt, "lines"));
  const lines = Object.keys(linesFull.variants);
  const lineData = linesFull.data; // { style: "<path-d>" } (`.repeat` resolved)

  // patternGeom: invoke each generator with string sentinels + size=1 so the
  // multipliers fall out as `size*N → N`; capture wMul/hMul/viewBox/body with the
  // `{{c1}}/{{c2}}/{{chargeId}}` placeholders. catalog-geometry §patternGeom.
  const patternsFull = evalLit(constLit(dmTxt, "patterns"));
  const patternGeom = {};
  for (const [k, fn] of Object.entries(patternsFull)) {
    patternGeom[k] = parsePattern(
      fn("{{id}}", "{{c1}}", "{{c2}}", 1, "{{chargeId}}")
    );
  }
  const patternSizes = evalLit(constLit(dmTxt, "patternSize"));

  // tinctureColors: Armoria's DEFAULT_COLORS render hues (D2), keys accent-
  // normalised (tenné→tenne, cendrée→cendree) to match the catalog axes.
  const rawColors = evalLit(constLit(defTxt, "DEFAULT_COLORS"));
  const tinctureColors = {};
  for (const [k, v] of Object.entries(rawColors)) {
    tinctureColors[k.normalize("NFD").replace(/\p{Diacritic}/gu, "")] = v;
  }

  // Position presets (charge.p picker).
  const positions = evalLit(constLit(dmTxt, "positionsSelect"));

  // Patterns — keys from DEFAULT_TINCTURES.patterns (pure numeric), minus `semy`
  // (which is handled separately as a semy_of_<chargeId> generator).
  const defaultTinctures = evalLit(constLit(defTxt, "DEFAULT_TINCTURES"));
  const patterns = Object.keys(defaultTinctures.patterns).filter(
    (p) => p !== "semy"
  );

  // Tinctures — the 10 canonical keys fixed by the spec (subset of Armoria's 13).
  const tinctures = [
    "or",
    "argent",
    "azure",
    "gules",
    "sable",
    "vert",
    "purpure",
    "murrey",
    "sanguine",
    "tenne",
  ];

  // Pattern sizes — `standard` is the omitted default; `bigger` is accepted by the
  // API (probe V2) though absent from patternSize.
  const sizes = ["standard", "small", "smaller", "smallest", "big", "bigger"];

  return {
    shields: shieldKeys,
    shieldMeta,
    shieldPaths,
    divisions,
    lines,
    ordinaries: ordinaryKeys,
    linedOrdinaries,
    charges: chargeKeys,
    chargeMeta,
    positions,
    tinctures,
    patterns,
    sizes,
    // Geometry (spec 014, SSOT — FR-017).
    positionCoords,
    shieldGeom,
    lineData,
    divisionGeom,
    ordinaryGeom,
    patternGeom,
    patternSizes,
    tinctureColors,
    linedDivisions,
  };
}

// ---- emit -------------------------------------------------------------------

/** Charge ids that have a bundled thumbnail SVG in assets/armoria/charges/. */
function scanThumbs() {
  const dir = join(ROOT, "assets/armoria/charges");
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".svg"))
      .map((f) => f.slice(0, -4))
      .sort();
  } catch (_e) {
    return [];
  }
}

function emitCatalog(cat) {
  const j = (v) => JSON.stringify(v);
  const chargeThumbs = scanThumbs();
  const out = `// GENERATED by scripts/extract-armoria-catalog.mjs — DO NOT EDIT BY HAND.
// Heraldic vocabulary SSOT extracted from the Armoria sources. Regenerate with
// \`node scripts/extract-armoria-catalog.mjs\`. See contracts/vocabulary-catalog.md.

export const shields = ${j(cat.shields)};
export const shieldMeta = ${j(cat.shieldMeta)};
export const shieldPaths = ${j(cat.shieldPaths)};
export const divisions = ${j(cat.divisions)};
export const lines = ${j(cat.lines)};
export const ordinaries = ${j(cat.ordinaries)};
export const linedOrdinaries = ${j(cat.linedOrdinaries)};
export const charges = ${j(cat.charges)};
export const chargeMeta = ${j(cat.chargeMeta)};
export const positions = ${j(cat.positions)};
export const tinctures = ${j(cat.tinctures)};
export const patterns = ${j(cat.patterns)};
export const sizes = ${j(cat.sizes)};
export const chargeThumbs = ${j(chargeThumbs)};

// ---- Geometry (spec 014, SSOT — FR-017). Consumed by module/coat-of-arms/render.
export const positionCoords = ${j(cat.positionCoords)};
export const shieldGeom = ${j(cat.shieldGeom)};
export const lineData = ${j(cat.lineData)};
export const divisionGeom = ${j(cat.divisionGeom)};
export const ordinaryGeom = ${j(cat.ordinaryGeom)};
export const patternGeom = ${j(cat.patternGeom)};
export const patternSizes = ${j(cat.patternSizes)};
export const tinctureColors = ${j(cat.tinctureColors)};
export const linedDivisions = ${j(cat.linedDivisions)};
`;
  const path = join(ROOT, "module/coat-of-arms/data/armoria-catalog.js");
  writeFileSync(path, out, "utf8");
  return path;
}

const isInescutcheon = (name) => name.slice(0, 12) === "inescutcheon";

/** Square viewBox framing a bbox centre (8% margin) — uniform catalog thumbnails. */
function thumbViewBox(bbox) {
  const side = Math.max(bbox.w, bbox.h) * 1.16;
  const cx = bbox.x + bbox.w / 2;
  const cy = bbox.y + bbox.h / 2;
  const r = (n) => Math.round(n * 100) / 100;
  return `${r(cx - side / 2)} ${r(cy - side / 2)} ${r(side)} ${r(side)}`;
}

/** Rewrite a charge SVG's root viewBox to tightly frame its drawn bbox. The art
 *  (the `<g>`) is untouched, so the extracted innerG/bbox are unaffected; only the
 *  <img> catalog thumbnail becomes aligned + uniformly sized. */
function normalizeThumb(svgText, bbox) {
  const vb = thumbViewBox(bbox);
  return /<svg[^>]*\bviewBox="/.test(svgText)
    ? svgText.replace(/(<svg[^>]*\bviewBox=")[^"]*(")/, `$1${vb}$2`)
    : svgText.replace(/<svg\b/, `<svg viewBox="${vb}"`);
}

/**
 * Emit the generated charge-art module (spec 014): for every bundled charge SVG,
 * the inline `<g>` (with license attrs), the pre-computed drawn bbox, and the
 * license metadata. Also normalises each thumbnail file's viewBox for aligned
 * catalog display. inescutcheon* are DERIVED by the renderer (not real art) → they
 * are skipped here and get separate generated thumbnails. Runs the drift assertion.
 * @returns {{ path: string, count: number, missing: string[] }}
 */
function emitChargeArt(chargeKeys) {
  const dir = join(ROOT, "assets/armoria/charges");
  const art = {};
  const missing = [];
  for (const name of chargeKeys) {
    if (isInescutcheon(name)) continue; // derived from shield paths — not art
    let svgText;
    try {
      svgText = readFileSync(join(dir, `${name}.svg`), "utf8");
    } catch {
      missing.push(name); // no bundled SVG (~17 real charges without art) — D14
      continue;
    }
    const computed = computeChargeArt(svgText, name);
    if (!computed) {
      missing.push(name);
      continue;
    }
    // Drift assertion (catalog-geometry §5): every art has a real bbox.
    if (!(computed.bbox.w > 0) || !(computed.bbox.h > 0)) {
      throw new Error(
        `charge ${name}: empty bbox ${JSON.stringify(computed.bbox)}`
      );
    }
    art[name] = computed;
    // Normalise the thumbnail file's viewBox so the catalog <img> is aligned.
    writeFileSync(
      join(dir, `${name}.svg`),
      normalizeThumb(svgText, computed.bbox),
      "utf8"
    );
  }
  const out = `// GENERATED by scripts/extract-armoria-catalog.mjs — DO NOT EDIT BY HAND.
// Inline charge artwork (spec 014): { name: { innerG, bbox:{x,y,w,h}, license } }.
// The renderer inlines innerG into <defs> and centres by bbox (FR-006a). Licenses
// preserved (FR-013). See contracts/catalog-geometry.md + assets/armoria/NOTICE.md.

export const chargeArt = ${JSON.stringify(art)};
`;
  const path = join(ROOT, "module/coat-of-arms/data/armoria-charge-art.js");
  writeFileSync(path, out, "utf8");
  return { path, count: Object.keys(art).length, missing };
}

/**
 * Generate catalog thumbnail SVGs for the inescutcheon* charges (no bundled art):
 * the homonymous shield path scaled/placed exactly like the renderer's
 * inescutcheonDef, with a tight viewBox. Lets them show as real <img> thumbnails
 * instead of a placeholder. Returns the count written.
 */
function emitInescutcheonThumbs(chargeKeys, shieldPaths) {
  const dir = join(ROOT, "assets/armoria/charges");
  let written = 0;
  for (const name of chargeKeys) {
    if (!isInescutcheon(name) || name.length <= 12) continue;
    const shieldName = name.slice(12, 13).toLowerCase() + name.slice(13);
    const path = shieldPaths[shieldName]?.path;
    if (!path) continue;
    const inner = `<path transform="translate(67 67) scale(.33)" d="${path}"/>`;
    // Real bbox of the scaled path → tight, uniform thumbnail framing.
    const computed = computeChargeArt(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g id="${name}">${inner}</g></svg>`,
      name
    );
    const vb = thumbViewBox(computed?.bbox ?? { x: 67, y: 67, w: 66, h: 66 });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" fill="#d7374a" stroke="#000">${inner}</svg>`;
    writeFileSync(join(dir, `${name}.svg`), svg, "utf8");
    written++;
  }
  return written;
}

/** Drift assertions on the generated geometry (catalog-geometry §5). Throws. */
function assertGeometry(cat) {
  for (const [k, v] of Object.entries(cat.patternGeom)) {
    if (!v.body.includes("{{c1}}"))
      throw new Error(`patternGeom.${k}.body missing {{c1}} sentinel`);
  }
  const checkLined = (obj, label) => {
    for (const [k, v] of Object.entries(obj)) {
      if (v.templateLined && !v.templateLined.includes("{{line}}"))
        throw new Error(
          `${label}.${k}.templateLined missing {{line}} sentinel`
        );
    }
  };
  checkLined(cat.divisionGeom, "divisionGeom");
  checkLined(cat.ordinaryGeom, "ordinaryGeom");
}

// Armoria locales emitted as Foundry language files. EN is the native fallback; the
// editor resolves each label via game.i18n against the ACTIVE language (game.i18n.lang).
const LABEL_LOCALES = ["en", "pt-BR"];

/** Read a locale's lang.json — the repo layout is public/locales/<loc>/lang.json;
 *  fall back to a root-level lang.<loc>.json copy. */
function readLocale(loc) {
  try {
    return read(`public/locales/${loc}/lang.json`);
  } catch {
    return read(`lang.${loc}.json`);
  }
}

/** shield.<category>.* → one flat key→label map (skip the `types` category-name map). */
function flattenLocaleShields(L) {
  const out = {};
  const shield = L.shield ?? {};
  for (const cat of Object.keys(shield)) {
    if (cat === "types") continue;
    const map = shield[cat];
    if (map && typeof map === "object") Object.assign(out, map);
  }
  return out;
}

/** Strip diacritics from a map's KEYS — Armoria uses `tenné`/`cendrée`; the catalog
 *  tincture axis is accent-normalised (tenne/cendree). */
function normalizeKeys(map) {
  const out = {};
  for (const [k, v] of Object.entries(map ?? {}))
    out[k.normalize("NFD").replace(/\p{Diacritic}/gu, "")] = v;
  return out;
}

/**
 * Emit the heraldic vocabulary as Foundry language files (one per locale) under
 * `CS.coa.vocab.<axis>.<key>` — so the vocabulary follows the active Foundry language
 * with the native EN fallback (a new language is added exactly like en.json: a lang
 * file declaring CS.coa.vocab.* for that locale). Only the catalog's own keys are
 * emitted (SSOT); a key absent from a locale falls back to EN, then to the raw EN key.
 * `tinctures` spans the full 13-hue render vocabulary (tinctureColors), Armoria's
 * accented keys normalised to match. `sizes` are the size keywords under editor.*.
 */
function emitLabels(cat) {
  const AXES = {
    tinctures: {
      keys: Object.keys(cat.tinctureColors),
      from: (L) => normalizeKeys(L.tinctures),
    },
    shields: { keys: cat.shields, from: flattenLocaleShields },
    divisions: { keys: cat.divisions, from: (L) => L.divisions ?? {} },
    lines: { keys: cat.lines, from: (L) => L.lines ?? {} },
    ordinaries: { keys: cat.ordinaries, from: (L) => L.ordinaries ?? {} },
    charges: { keys: cat.charges, from: (L) => L.charges ?? {} },
    patterns: { keys: cat.patterns, from: (L) => L.patterns ?? {} },
    sizes: { keys: cat.sizes, from: (L) => L.editor ?? {} },
  };
  const paths = [];
  for (const loc of LABEL_LOCALES) {
    const L = JSON.parse(readLocale(loc)); // round-trip validates the JSON
    const vocab = {};
    for (const [axis, { keys, from }] of Object.entries(AXES)) {
      const src = from(L);
      const map = {};
      for (const k of keys) if (src[k] != null) map[k] = src[k];
      vocab[axis] = map;
    }
    const path = join(ROOT, `lang/armoria.${loc}.json`);
    const out = JSON.stringify({ CS: { coa: { vocab } } }, null, 2);
    writeFileSync(path, `${out}\n`, "utf8");
    paths.push(path);
  }
  return paths;
}

async function fetchThumbs(charges) {
  const dir = join(ROOT, "assets/armoria/charges");
  mkdirSync(dir, { recursive: true });
  let saved = 0;
  let skipped = 0;
  const LIMIT = 8;
  let idx = 0;
  async function worker() {
    while (idx < charges.length) {
      const id = charges[idx++];
      try {
        const res = await fetch(`${HOST}/charges/${id}.svg`);
        const ct = res.headers.get("content-type") || "";
        if (res.ok && ct.includes("svg")) {
          const svg = await res.text();
          writeFileSync(join(dir, `${id}.svg`), svg, "utf8");
          saved++;
        } else {
          skipped++; // simple/generated charges have no WappenWiki SVG asset
        }
      } catch {
        skipped++;
      }
      if ((saved + skipped) % 50 === 0) {
        process.stdout.write(
          `  thumbnails: ${saved + skipped}/${charges.length}\r`
        );
      }
    }
  }
  await Promise.all(Array.from({ length: LIMIT }, worker));
  return { saved, skipped };
}

// ---- main -------------------------------------------------------------------

async function main() {
  const cat = extract();
  assertGeometry(cat); // fail loud if an Armoria signature changed (drift, §5)

  const counts = {
    shields: cat.shields.length,
    divisions: cat.divisions.length,
    lines: cat.lines.length,
    ordinaries: cat.ordinaries.length,
    "  lined": cat.linedOrdinaries.length,
    charges: cat.charges.length,
    positions: cat.positions.length,
    tinctures: cat.tinctures.length,
    patterns: cat.patterns.length,
    sizes: cat.sizes.length,
    // Geometry (spec 014).
    positionCoords: Object.keys(cat.positionCoords).length,
    lineData: Object.keys(cat.lineData).length,
    divisionGeom: Object.keys(cat.divisionGeom).length,
    "  linedDiv": cat.linedDivisions.length,
    ordinaryGeom: Object.keys(cat.ordinaryGeom).length,
    patternGeom: Object.keys(cat.patternGeom).length,
    patternSizes: Object.keys(cat.patternSizes).length,
    tinctureColors: Object.keys(cat.tinctureColors).length,
  };
  console.log("Extracted axis counts:");
  for (const [k, v] of Object.entries(counts))
    console.log(`  ${k.padEnd(14)} ${v}`);

  // Charge art + thumbnail normalisation MUST run before emitCatalog, which scans
  // the thumbnail dir into `chargeThumbs`.
  const art = emitChargeArt(cat.charges);
  console.log(
    `Wrote ${art.path} (${art.count} charges with art; ${art.missing.length} without)`
  );
  const inesCount = emitInescutcheonThumbs(cat.charges, cat.shieldPaths);
  console.log(`Generated ${inesCount} inescutcheon thumbnails`);

  const catPath = emitCatalog(cat);
  console.log(`Wrote ${catPath}`);
  const labPaths = emitLabels(cat);
  for (const p of labPaths) console.log(`Wrote ${p}`);

  if (DO_THUMBS) {
    console.log(`\nFetching charge thumbnails from ${HOST}/charges/*.svg ...`);
    const { saved, skipped } = await fetchThumbs(cat.charges);
    console.log(
      `\nThumbnails: ${saved} saved, ${skipped} skipped (no SVG asset).`
    );
  } else {
    console.log(
      `\n(Skipped thumbnails — pass --thumbs to fetch ${cat.charges.length} charge SVGs.)`
    );
  }
}

main().catch((e) => {
  console.error("EXTRACTION FAILED:", e);
  process.exit(1);
});
