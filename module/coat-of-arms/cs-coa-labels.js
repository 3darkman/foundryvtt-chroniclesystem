// Heraldic-vocabulary display labels (D12). Resolved through Foundry i18n so the
// vocabulary follows the ACTIVE language (game.i18n.lang) with the native EN
// fallback — a new language is added exactly like en.json: a lang file declaring
// `CS.coa.vocab.*` for that locale (see system.json `languages`). The canonical EN
// keys stay stable; an untranslated key falls back to EN, then to the raw key. The
// editor CHROME (buttons, titles, messages) lives in lang/en.json under CS.coa.*;
// the vocabulary lives in lang/armoria.<locale>.json under CS.coa.vocab.* (generated
// by scripts/extract-armoria-catalog.mjs). Charge search matches the localised label
// AND the EN key with accent-insensitive normalisation (FR-019).

import { CATALOG } from "./cs-armoria-catalog.js";

/**
 * Localised label for a vocabulary key, or the canonical EN key when untranslated.
 * @param {string} axis  "tinctures" | "shields" | "divisions" | "lines" |
 *                        "ordinaries" | "charges" | "patterns" | "sizes"
 * @param {string} key   canonical EN key
 * @returns {string}
 */
export function label(axis, key) {
  if (key == null) return "";
  const path = `CS.coa.vocab.${axis}.${key}`;
  // has() checks the EN fallback too, so localize() only runs for real keys — an
  // unknown key returns the raw EN key instead of the ugly dot-path string.
  return game.i18n?.has(path) ? game.i18n.localize(path) : key;
}

/** Lower-case, strip diacritics — for accent-insensitive matching. */
function normalize(text) {
  return String(text)
    .toLocaleLowerCase(game.i18n?.lang || "en")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

// Charge search index: one row per charge with its normalised EN key + localised
// label. Built lazily on first use (game.i18n must be ready) and cached per active
// language — core.language requires a reload to change, so a single build per load
// suffices; the lang guard just rebuilds if the map somehow changes mid-session.
let indexCache = null;
let indexLang = null;
function chargeIndex() {
  const lang = game?.i18n?.lang ?? "en";
  if (!indexCache || indexLang !== lang) {
    indexLang = lang;
    indexCache = CATALOG.charges.map((key) => {
      const lbl = label("charges", key);
      return { key, label: lbl, hay: `${normalize(key)} ${normalize(lbl)}` };
    });
  }
  return indexCache;
}

/**
 * Charges whose EN key OR localised label contains the (accent-insensitive) query.
 * Empty/blank query returns the full list (catalog order).
 * @param {string} query
 * @returns {Array<{key: string, label: string}>}
 */
export function searchCharges(query) {
  const q = normalize(query ?? "").trim();
  const rows = q
    ? chargeIndex().filter((row) => row.hay.includes(q))
    : chargeIndex();
  return rows.map(({ key, label }) => ({ key, label }));
}
