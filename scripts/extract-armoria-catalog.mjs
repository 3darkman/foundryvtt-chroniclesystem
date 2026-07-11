// DEV TOOL — NOT loaded by Foundry. Regenerates the heraldic vocabulary SSOT.
//
// Reads the Armoria sources (default C:/tmp/armoria) and emits:
//   module/coat-of-arms/data/armoria-catalog.js        — frozen CATALOG (options + allowlist)
//   module/coat-of-arms/data/armoria-labels-ptBR.js    — Armoria pt-BR locale (display labels)
//   assets/armoria/charges/<id>.svg                     — charge thumbnails (with --thumbs)
//
// The Armoria object literals are valid JS/TS expressions, so we slice the
// balanced literal for a named declaration and evaluate it. Two sources hold
// generator FUNCTIONS (dataModel `divisions`, `patterns`) — for those we slice
// only the pure-numeric sub-block (`variants`) instead of the whole object.
//
// Usage:  node scripts/extract-armoria-catalog.mjs [--src C:/tmp/armoria] [--thumbs] [--host https://armoria.herokuapp.com]
// See contracts/vocabulary-catalog.md §Regeneração.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

/** Balanced literal of a `subkey: ...` inside an already-sliced block. */
function subLit(block, subkey) {
  return litAfter(block, new RegExp(`\\b${subkey}\\s*:\\s*`));
}

/** Evaluate a pure-data literal (object/array) to a JS value. */
function evalLit(lit) {
  // eslint-disable-next-line no-new-func
  return new Function(`return (${lit})`)();
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
  for (const k of shieldKeys) {
    const d = shields.data?.[k];
    shieldMeta[k] = {
      positions: d?.positions ? Object.keys(d.positions) : [],
      box: d?.box ?? DEFAULT_SHIELD_BOX,
    };
    // SVG shape (path + viewBox) so the picker can draw each shield form.
    if (d?.path)
      shieldPaths[k] = { path: d.path, box: d.box ?? DEFAULT_SHIELD_BOX };
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

  // Divisions / lines — `divisions` holds generator functions, so slice the
  // pure-numeric `variants` sub-block only.
  const divisions = Object.keys(
    evalLit(subLit(constLit(dmTxt, "divisions"), "variants"))
  );
  const lines = Object.keys(
    evalLit(subLit(constLit(dmTxt, "lines"), "variants"))
  );

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
`;
  const path = join(ROOT, "module/coat-of-arms/data/armoria-catalog.js");
  writeFileSync(path, out, "utf8");
  return path;
}

function emitLabels() {
  const raw = read("lang.pt-BR.json");
  // Emit as an ES module (not raw .json) so the browser imports it statically
  // without JSON import-attributes, and cs-coa-labels can stay sync — consistent
  // with the generated armoria-catalog.js. Round-trip validates the JSON.
  const data = JSON.parse(raw);
  const out = `// GENERATED by scripts/extract-armoria-catalog.mjs — DO NOT EDIT BY HAND.
// Armoria official pt-BR locale, bundled as heraldic-vocabulary display labels
// (SSOT of the vocabulary; EN keys stay canonical). See contracts/vocabulary-catalog.md.

export default ${JSON.stringify(data)};
`;
  const path = join(ROOT, "module/coat-of-arms/data/armoria-labels-ptBR.js");
  writeFileSync(path, out, "utf8");
  return path;
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
  };
  console.log("Extracted axis counts:");
  for (const [k, v] of Object.entries(counts))
    console.log(`  ${k.padEnd(12)} ${v}`);

  const catPath = emitCatalog(cat);
  console.log(`\nWrote ${catPath}`);
  const labPath = emitLabels();
  console.log(`Wrote ${labPath}`);

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
