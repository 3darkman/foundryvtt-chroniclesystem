// COA import (US4, FR-006/FR-008). `parseImport` is 100% LOCAL: a raw COA JSON
// string OR an Armoria link with an embedded ?coa= / JSON object. `resolveImport`
// adds the ONE optional network branch (D12): an Armoria link carrying a `seed`
// but no embedded coa is resolved by a single explicit fetch. Both return { coa }
// on success or { error } — callers keep the current layers on error (AC4.3).

import { validate } from "./cs-coa-validation.js";
import { buildSeedResolveUrl } from "./cs-armoria-url.js";

/** Pull a COA object out of arbitrary pasted text (raw JSON or an Armoria URL). */
function extractCoa(raw) {
  // 1) A URL carrying ?coa=<url-encoded JSON>.
  const coaParam = /[?&#]coa=([^&#\s]+)/.exec(raw);
  if (coaParam) {
    try {
      return JSON.parse(decodeURIComponent(coaParam[1]));
    } catch (_e) {
      /* fall through */
    }
  }
  // 2) A bare/whole JSON object (possibly wrapped in surrounding text).
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch (_e) {
      /* fall through */
    }
  }
  return null;
}

/**
 * Pull a shield shape out of a URL's `&shield=` query param, if present and known.
 * Armoria keeps the shield OUTSIDE the coa object (a separate store / query param),
 * so its "Copy edit link" (`?coa=…`) never carries it — only API-style URLs do.
 * Returns a valid catalog shield key or null (unknown / absent → caller decides).
 */
function extractShield(raw, CATALOG) {
  const m = /[?&]shield=([^&#\s]+)/.exec(raw);
  if (!m) return null;
  const shield = decodeURIComponent(m[1]);
  return CATALOG.shields?.includes(shield) ? shield : null;
}

/**
 * Parse pasted text into a validated COA.
 * @param {string} text
 * @param {object} CATALOG
 * @returns {{ coa: object } | { error: string, details?: object[] }}
 */
export function parseImport(text, CATALOG) {
  const raw = (text ?? "").trim();
  if (!raw) return { error: "empty" };

  const coa = extractCoa(raw);
  if (!coa || typeof coa !== "object" || Array.isArray(coa)) {
    return { error: "parse" };
  }

  // Armoria's edit link omits the shield; honour an explicit `&shield=` (API URLs)
  // when the coa itself lacks one, otherwise leave it for the caller to preserve.
  if (!coa.shield) {
    const shield = extractShield(raw, CATALOG);
    if (shield) coa.shield = shield;
  }

  const result = validate(coa, CATALOG);
  if (!result.ok) return { error: "invalid", details: result.errors };

  return { coa };
}

/** Extract an Armoria `seed` from a link, or null (no bare-token guessing). */
function extractSeed(raw) {
  const q = /[?&]seed=([^&#\s]+)/.exec(raw);
  if (q) return decodeURIComponent(q[1]);
  // Path form armoria.../svg|png/<size>/<seed> (only when it is an Armoria link).
  const p = /\/(?:svg|png)\/[^/\s]+\/([^/?#\s]+)/i.exec(raw);
  if (p && /armoria/i.test(raw)) return decodeURIComponent(p[1]);
  return null;
}

/**
 * Parse pasted text into a validated COA, resolving an Armoria seed via ONE
 * explicit network call when (and only when) no coa is embedded (D12/FR-008).
 * @param {string} text
 * @param {object} CATALOG
 * @returns {Promise<{ coa: object } | { error: string, details?: object[] }>}
 */
export async function resolveImport(text, CATALOG) {
  const local = parseImport(text, CATALOG);
  if (!local.error) return local; // embedded coa / JSON — no network

  const seed = extractSeed(text ?? "");
  if (!seed) return local; // nothing to resolve → surface the local error

  try {
    const res = await fetch(buildSeedResolveUrl(seed));
    if (!res.ok) return { error: "network" };
    const coa = await res.json();
    if (!coa || typeof coa !== "object" || Array.isArray(coa)) {
      return { error: "parse" };
    }
    const result = validate(coa, CATALOG);
    if (!result.ok) return { error: "invalid", details: result.errors };
    return { coa };
  } catch (_e) {
    return { error: "network" };
  }
}
