// Pure Armoria render-URL builder (D8). Serialises a COA object into the GET-only
// `?coa=` query param and reports the encoded URL length so the editor can gate on
// the complexity budget. No DOM, no Foundry — domain layer (Principle IV).
// See contracts/armoria-api.md §Query params.

/** Single point of failure — the only render host (contracts/armoria-api.md). */
export const ARMORIA_HOST = "https://armoria.herokuapp.com";

/** Canonical saved image format (D3). Preview may differ (SVG for fidelity). */
export const CANONICAL_FORMAT = "png";

// URL-length budget (D8, verified probe): render OK ≤ ~16.161; 431 at ~16.267;
// proxies cut ~8 KB. Safe ceiling well under the hard limit.
export const URL_BUDGET = Object.freeze({ WARN: 10000, BLOCK: 14000 });

const DEFAULT_PREVIEW_SIZE = 350;

/**
 * Build the Armoria render URL for a COA.
 * @param {object} coa                 the COA definition (plain object)
 * @param {object} [opts]
 * @param {"svg"|"png"} [opts.format="svg"]  render format (token !== "svg" → PNG)
 * @param {number|string} [opts.size=350]    pixel size (preview small, save large)
 * @returns {{ url: string, length: number, encoded: string }}
 */
export function buildUrl(
  coa,
  { format = "svg", size = DEFAULT_PREVIEW_SIZE } = {}
) {
  const encoded = encodeURIComponent(JSON.stringify(coa ?? {}));
  const f = format === "svg" ? "svg" : "png";
  const url = `${ARMORIA_HOST}/?format=${f}&size=${size}&coa=${encoded}`;
  return { url, length: url.length, encoded };
}
