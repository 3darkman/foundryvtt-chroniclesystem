// Targeting & distance (runtime) — isolates the Foundry canvas reads (targets,
// attacker token, ruler distance, conditions) from the pure conflict math
// (`cs-conflict.js`). Only this module touches `game`/`canvas`/`ui`; all numbers
// are delegated to the pure layer. Contract: targeting-and-distance.md.

import SystemUtils from "../utils/systemUtils.js";

/**
 * Resolve the user's single target into the roll-time target context. NEVER
 * throws — every path returns a `status` (robustness, SC-007). The core clears
 * `game.user.targets` on canvas-ready, so the target is always on the viewed
 * scene (research §D1, confirmed against the V14 bundle).
 * @param {Actor} attackerActor
 * @param {"weapon"|"intrigue"} kind the roll kind, so the guard validates the
 *   defense THIS roll needs (Combat vs Intrigue). A `unit` carries Combat Defense
 *   but no Intrigue Defense, so an intrigue technique vs a unit must omit.
 * @returns {{status: "none"|"multiple"|"invalid"|"ok", token?: Token, actor?: Actor,
 *   combatDefense?: number, intrigueDefense?: number, armorRating?: number,
 *   dispositionRating?: number, conditions?: {prone: boolean}, size?: string}}
 */
export function getUserTarget(attackerActor, kind = "weapon") {
  const targets = game?.user?.targets;
  const size = targets?.size ?? 0;
  if (size === 0) return { status: "none" };
  if (size > 1) {
    ui.notifications?.warn(
      SystemUtils.localize("CS.notifications.multipleTargets")
    );
    return { status: "multiple" };
  }

  const token = targets.first();
  const actor = token?.actor ?? null;
  // Self-target or a token with no actor → omit derivatives (FR-023, edge).
  if (!actor || actor === attackerActor) return { status: "invalid" };
  // The defense THIS roll kind needs must be a real computed number. This rejects
  // non-character/non-combatant tokens (houses, generic tokens — no derivedStats)
  // AND actor types carrying one defense but not the other: a `unit` has Combat
  // Defense but no Intrigue Defense, so an intrigue technique vs a unit omits
  // graciously (FR-023) instead of resolving against a bogus difficulty 0. A
  // legitimate 0 defense on a character is finite, so it still reads as "ok".
  const ds = actor.system?.derivedStats;
  const combatDefense = Number(ds?.combatDefense?.total);
  const intrigueDefense = Number(ds?.intrigueDefense?.total);
  const needed = kind === "intrigue" ? intrigueDefense : combatDefense;
  if (!Number.isFinite(needed)) return { status: "invalid" };

  return {
    status: "ok",
    token,
    actor,
    combatDefense: Number.isFinite(combatDefense) ? combatDefense : 0,
    intrigueDefense: Number.isFinite(intrigueDefense) ? intrigueDefense : 0,
    armorRating: Number(actor.getModifier?.("damage_taken")?.total) || 0,
    dispositionRating: Number(actor.system?.currentDisposition) || 4,
    conditions: { prone: actor.statuses?.has("prone") ?? false },
    size: actor.system?.size ?? "medium",
  };
}

/**
 * The attacker's token, for measuring distance: synthetic (unlinked) actor →
 * controlled token → any active token → null. `null` is NOT an error — it only
 * omits the RANGE penalty (FR-011/edge); the other target derivatives still apply.
 * @param {Actor} actor
 * @returns {Token|null}
 */
export function getAttackerToken(actor) {
  if (!actor) return null;
  const synthetic = actor.token?.object;
  if (synthetic) return synthetic;
  const controlled = canvas?.tokens?.controlled?.find((t) => t.actor === actor);
  if (controlled) return controlled;
  return (actor.getActiveTokens?.() ?? [])[0] ?? null;
}

/**
 * The game (ruler) distance between two tokens, in the SCENE's distance units
 * (`canvas.grid.units`). Grid-aware on a gridded scene, straight line when gridless —
 * matching what the player measures on the canvas. Compared directly to a quality's
 * `range` field, which the GM authors in those same units (spec 020 — no yards
 * conversion, so metres/feet/etc. work). `null` when the canvas isn't ready or a
 * token is missing (range omitted). NEVER uses `canvas.grid.measureDistance`
 * (removed in v13+).
 * @param {Token} attackerToken
 * @param {Token} targetToken
 * @returns {number|null}
 */
export function measureDistance(attackerToken, targetToken) {
  if (!canvas?.ready || !attackerToken || !targetToken) return null;
  const { distance } = canvas.grid.measurePath([
    attackerToken.center,
    targetToken.center,
  ]);
  return distance;
}
