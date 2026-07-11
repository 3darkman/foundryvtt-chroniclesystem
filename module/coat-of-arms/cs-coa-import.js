// Pure COA import (US2, FR-006). Accepts a raw COA JSON string OR an Armoria link
// (extracts the ?coa= param / an embedded JSON object), normalises it, and
// validates against the allowlist. Returns { coa } on success or { error } —
// callers keep the current layers on error (AC2.3). Domain layer — no DOM.
// See contracts/armoria-api.md §Rotas.

import { validate } from "./cs-coa-validation.js";

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

  const result = validate(coa, CATALOG);
  if (!result.ok) return { error: "invalid", details: result.errors };

  return { coa };
}
