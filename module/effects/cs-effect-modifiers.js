/**
 * Spike 006 — Active Effects PoC: the effect-modifier collector.
 *
 * Bridges E2 (declarative AE changes) to E1 (the system's existing
 * `actor.system.modifiers` map). Mirrors foundry-fe2's `_effectModifiers`
 * pre-collection, but instead of inventing a new structure it reuses the
 * chroniclesystem's own modifier map — so every existing consumer
 * (`getActorTestFormula`, `calcCombatDefense`, `calculateMovementData`) sees the
 * effect with zero changes (research Decision 1).
 *
 * Critical invariant (anti-corruption / anti double-count): the collector NEVER
 * persists. It pushes into the in-memory `actor.system.modifiers` during
 * `applyActiveEffects("initial")`; that map is reset from source at the start of
 * the next `prepareData`, so entries never accumulate across cycles and never
 * reach the saved document.
 */

import LOGGER from "../utils/logger.js";

/** Domain-key prefix the PoC parses (research Decision 1). */
export const CS_MODIFIER_PREFIX = "cs.modifier.";

/**
 * Resolve an AE change key into a chroniclesystem modifier type.
 * `cs.modifier.agility` → `"agility"`. Returns null for unrelated keys.
 * @param {string} key
 * @returns {string|null}
 */
export function parseEffectKey(key) {
  if (typeof key !== "string" || !key.startsWith(CS_MODIFIER_PREFIX)) {
    return null;
  }
  const type = key.slice(CS_MODIFIER_PREFIX.length);
  return type.length > 0 ? type : null;
}

/**
 * Collect every active, applicable `cs.modifier.*` change and push it into the
 * actor's in-memory modifier map. Idempotent within a prepare cycle: entries are
 * keyed by `effect.id`, so re-running updates rather than duplicating.
 *
 * Portable v13+v14: `actor.appliedEffects` already filters by `effect.active`
 * (not disabled AND not suppressed) in both versions, and `effect.changes` is a
 * warning-free accessor in both (root field in v13, getter for `system.changes`
 * in v14). We read only `change.key` / `change.value` — never `change.mode`.
 *
 * @param {Actor} actor
 */
export function collectEffectModifiers(actor) {
  // Bind `actor.modifiers` to the live in-memory `system.modifiers` map.
  actor.updateTempModifiers();

  const effects = actor.appliedEffects;
  let applied = 0;
  for (const effect of effects) {
    const changes = effect.changes ?? [];
    for (const change of changes) {
      const type = parseEffectKey(change.key);
      if (!type) continue;
      // isDocument=false: the source is an effect id, not an embedded Item id.
      // save omitted (false): in-memory only — never touches the document.
      actor.addModifier(type, effect.id, Number(change.value) || 0, false);
      applied++;
      LOGGER.trace(
        `AE collector: "${effect.name}" → ${type} += ${
          Number(change.value) || 0
        } | cs-effect-modifiers.js`
      );
    }
  }
  LOGGER.trace(
    `AE collector summary: ${actor.name} — appliedEffects=${effects.length}, cs.modifier changes applied=${applied} | cs-effect-modifiers.js`
  );
}
