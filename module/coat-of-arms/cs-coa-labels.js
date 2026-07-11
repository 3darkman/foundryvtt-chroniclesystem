// Heraldic-vocabulary display labels (D12). Resolves a canonical EN key to the
// Armoria official pt-BR label, falling back to the EN key when the upstream
// locale has no translation. Charge search matches the pt-BR label AND the EN
// key with accent-insensitive normalisation (FR-019). The editor CHROME (buttons,
// titles, messages) is NOT here — that lives in lang/en.json under CS.coa.*.

import LABELS from "./data/armoria-labels-ptBR.js";
import { CATALOG } from "./cs-armoria-catalog.js";

// Shields are nested by category in the locale (shield.basic.heater, ...). Flatten
// once into a single key → label map (skip the `types` category-name map).
const SHIELD_LABELS = (() => {
  const out = {};
  const shield = LABELS.shield ?? {};
  for (const cat of Object.keys(shield)) {
    if (cat === "types") continue;
    const map = shield[cat];
    if (map && typeof map === "object") Object.assign(out, map);
  }
  return out;
})();

// axis → the locale sub-map that holds its labels.
const AXIS_MAP = {
  tinctures: LABELS.tinctures ?? {},
  shields: SHIELD_LABELS,
  divisions: LABELS.divisions ?? {},
  lines: LABELS.lines ?? {},
  ordinaries: LABELS.ordinaries ?? {},
  charges: LABELS.charges ?? {},
  patterns: LABELS.patterns ?? {},
  sizes: LABELS.editor ?? {}, // size keywords live under editor.*
  categories: LABELS.categories ?? {},
};

/**
 * pt-BR label for a vocabulary key, or the canonical EN key when untranslated.
 * @param {string} axis  "tinctures" | "shields" | "divisions" | "lines" |
 *                        "ordinaries" | "charges" | "patterns" | "sizes" | "categories"
 * @param {string} key   canonical EN key
 * @returns {string}
 */
export function label(axis, key) {
  if (key == null) return "";
  return AXIS_MAP[axis]?.[key] ?? key;
}

/** Lower-case, strip diacritics — for accent-insensitive matching. */
function normalize(text) {
  return String(text)
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

// Precomputed search index: one row per charge with its normalised EN key +
// pt-BR label (built once; the catalog is frozen).
const CHARGE_INDEX = CATALOG.charges.map((key) => ({
  key,
  label: label("charges", key),
  hay: `${normalize(key)} ${normalize(label("charges", key))}`,
}));

/**
 * Charges whose EN key OR pt-BR label contains the (accent-insensitive) query.
 * Empty/blank query returns the full list (catalog order).
 * @param {string} query
 * @returns {Array<{key: string, label: string}>}
 */
export function searchCharges(query) {
  const q = normalize(query ?? "").trim();
  const rows = q
    ? CHARGE_INDEX.filter((row) => row.hay.includes(q))
    : CHARGE_INDEX;
  return rows.map(({ key, label }) => ({ key, label }));
}
