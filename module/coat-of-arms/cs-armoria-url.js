// Armoria SEED resolution URL (US4, FR-008). The embedded renderer made the render
// URL + complexity budget obsolete (FR-014) — those were removed. The ONLY surviving
// use of the external host is the OPTIONAL, EXPLICIT resolution of an imported seed
// (an Armoria link with a `seed` but no embedded `coa`) into a COA definition — a
// single deliberate network call (D12). No DOM, no Foundry — domain layer.

/** The only remaining external host — the optional import seed resolver. */
export const ARMORIA_HOST = "https://armoria.herokuapp.com";

/**
 * Build the URL that attempts to resolve an Armoria seed into a COA JSON
 * definition — the sole network call in the feature, reached only on explicit
 * seed import (US4). NOTE: the public heroku Armoria API serves only svg/png
 * images and may NOT expose a JSON definition endpoint, in which case this branch
 * fails gracefully (import keeps the current layers) and only embedded `?coa=`
 * links / raw COA strings import (both fully local). Adjust the query here if a
 * given Armoria instance exposes a JSON route. See research.md D12 / FR-008.
 * @param {string} seed
 * @returns {string}
 */
export function buildSeedResolveUrl(seed) {
  return `${ARMORIA_HOST}/?format=json&seed=${encodeURIComponent(seed)}`;
}
