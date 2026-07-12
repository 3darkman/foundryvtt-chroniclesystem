// Migration 0.13.0 — house Coat of Arms SVG init (spec 014, FR-010).
//
// Spec 013 houses have `system.coa` / `system.coaImg` but predate `system.coaSvg`
// (the sharp vector shown on the sheet). This fills it NON-destructively
// (idempotent: only houses still missing `coaSvg` are touched). The COA definition
// shape is UNCHANGED (FR-009), and NO re-render is forced (FR-010) — the legacy PNG
// keeps displaying until the owner manually re-renders. Mirrors task100-house-coa.

/**
 * PURE transform (no Foundry runtime) — testable. Returns the minimal update for
 * each house still missing `system.coaSvg`; already-initialised houses yield nothing.
 * @param {Array<{_id: string, type: string, system?: object}>} actors
 * @returns {Array<{_id: string, "system.coaSvg": string}>}
 */
export function deriveHouseCoaSvgUpdates(actors) {
  const updates = [];
  for (const actor of actors ?? []) {
    if (!actor || actor.type !== "house") continue;
    const sys = actor.system ?? {};
    if (typeof sys.coaSvg === "string") continue;
    updates.push({ _id: actor._id, "system.coaSvg": "" });
  }
  return updates;
}

/**
 * World wrapper: initialise `system.coaSvg` on every house actor. GM-gated and
 * version-gated by the caller (migration.js). Idempotent.
 */
export async function migrateHouseCoaSvg() {
  const actors = Array.from(game.actors?.values() ?? []);
  const updates = deriveHouseCoaSvgUpdates(
    actors.map((a) => ({ _id: a.id, type: a.type, system: a.system }))
  );
  for (const u of updates) {
    const actor = game.actors.get(u._id);
    if (!actor) continue;
    await actor.update({ "system.coaSvg": u["system.coaSvg"] });
  }
}
