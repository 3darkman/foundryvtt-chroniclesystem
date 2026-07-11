// Random COA generator (US4, FR-007). Builds a VALID, RE-EDITABLE COA from the
// catalog (shield + field + 1–2 charges with valid position/tincture) rather than
// an opaque server seed — so the result loads into the layers and is editable and
// savable through the normal US1 flow. Guaranteed to pass cs-coa-validation.
// Domain layer — no DOM.

import { shieldPositions } from "./cs-armoria-catalog.js";

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const BASIC_CELLS = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];

/**
 * @param {object} CATALOG
 * @returns {object} a valid COA definition
 */
export function randomCoa(CATALOG) {
  const shield = pick(CATALOG.shields);
  const t1 = pick(CATALOG.tinctures);

  // Prefer single-cell positions valid for this shield; fall back to centre.
  const validCells = shieldPositions(shield).filter((p) =>
    BASIC_CELLS.includes(p)
  );
  const cells = validCells.length ? validCells : ["e"];

  const count = 1 + Math.floor(Math.random() * 2); // 1–2 charges
  const charges = [];
  const used = new Set();
  for (let i = 0; i < count; i++) {
    let t = pick(CATALOG.tinctures);
    if (t === t1) t = pick(CATALOG.tinctures); // nudge toward contrast
    let p = pick(cells);
    if (used.has(p) && cells.length > 1) p = pick(cells);
    used.add(p);
    charges.push({ charge: pick(CATALOG.charges), t, p, size: 1.5 });
  }

  return { shield, t1, ordinaries: [], charges };
}
