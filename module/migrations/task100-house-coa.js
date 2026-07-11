// Migration 0.12.0 — house Coat of Arms init (spec 013, FR-018).
//
// Existing `house` actors predate `system.coa` / `system.coaImg`. This fills the
// pair NON-destructively (idempotent: only houses still missing `coa` are
// touched) so legacy worlds validate under the new schema with zero regression.
// The pre-existing `actor.img` is PRESERVED — it is only overwritten when the
// user actually saves a rendered brasão. `coa` is written as a plain object (never
// a string): ObjectField._cast silently swallows non-objects to `{}`.

/**
 * PURE transform (no Foundry runtime) — testable. Returns the minimal update for
 * each house missing its COA pair; houses already initialised yield nothing.
 * @param {Array<{_id: string, type: string, system?: object}>} actors
 * @returns {Array<{_id: string, "system.coa": object, "system.coaImg": string}>}
 */
export function deriveHouseCoaUpdates(actors) {
  const updates = [];
  for (const actor of actors ?? []) {
    if (!actor || actor.type !== "house") continue;
    const sys = actor.system ?? {};
    const hasCoa = sys.coa != null && typeof sys.coa === "object";
    const hasImg = typeof sys.coaImg === "string";
    if (hasCoa && hasImg) continue;
    updates.push({
      _id: actor._id,
      "system.coa": hasCoa ? sys.coa : {},
      "system.coaImg": hasImg ? sys.coaImg : "",
    });
  }
  return updates;
}

/**
 * World wrapper: initialise the COA pair on every house actor. GM-gated and
 * version-gated by the caller (migration.js). Idempotent.
 */
export async function migrateHouseCoa() {
  const actors = Array.from(game.actors?.values() ?? []);
  const updates = deriveHouseCoaUpdates(
    actors.map((a) => ({ _id: a.id, type: a.type, system: a.system }))
  );
  for (const u of updates) {
    const actor = game.actors.get(u._id);
    if (!actor) continue;
    await actor.update({
      "system.coa": u["system.coa"],
      "system.coaImg": u["system.coaImg"],
    });
  }
}
