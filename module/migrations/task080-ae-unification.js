// Migration 0.8.0 — Active Effects unification (spec 007, US4).
//
// In the unified architecture the modifier/penalty buffer is recomputed live by
// the collector on every prepareData, so the persisted `system.modifiers` /
// `system.penalties` map is pure residue of the old imperative path (FR-004).
// This migration strips it. Manual stat adjustments (`derivedStats.*.modifier`,
// `movement.modifier`) and per-ability `system.modifier` are NOT touched — they
// are read directly by the read-side and keep working unchanged, so totals are
// identical before and after (parity, SC-002).

/**
 * Pure transform (testable without Foundry): report whether an actor's persisted
 * buffer needs clearing and return the partial system update that clears it.
 * Idempotent — on already-clean data `changed` is false and the cleaned maps are
 * empty, so a second pass is a no-op (FR-010 / SC-004).
 * @param {object} sourceData - the actor's `system` data (or an equivalent plain object)
 * @returns {{changed: boolean, effects: Array, cleanedSystem: {modifiers: object, penalties: object}}}
 */
export function migrateActorToAE(sourceData = {}) {
  const modifiers = sourceData?.modifiers ?? {};
  const penalties = sourceData?.penalties ?? {};
  const changed =
    Object.keys(modifiers).length > 0 || Object.keys(penalties).length > 0;
  return {
    changed,
    effects: [], // nothing to create — every source is recomputed live
    cleanedSystem: { modifiers: {}, penalties: {} },
  };
}

/**
 * World wrapper: clear the residual buffer on every actor that still carries one.
 * GM-gated by the caller (migration.js). Runs once per world (version-gated).
 */
export async function migrateWorldToAE() {
  const actors = Array.from(game.actors?.values() || []);
  for (const actor of actors) {
    const { changed, cleanedSystem } = migrateActorToAE(actor.system ?? {});
    if (changed) {
      await actor.update({
        "system.modifiers": cleanedSystem.modifiers,
        "system.penalties": cleanedSystem.penalties,
      });
    }
  }
}
