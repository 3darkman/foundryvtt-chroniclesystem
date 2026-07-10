// Apply damage/influence to the target (runtime) — the only writer of the
// target's Health/Composure at roll-time, and only when the player clicks the
// card's apply button (never auto-applies, FR-019). Owners apply locally; a
// non-owner delegates to the active GM via a User query (v13 `CONFIG.queries`),
// so the GM's client (which has OWNER) performs the update.
// Contract: result-card-and-apply.md §4/§5.

import SystemUtils from "../utils/systemUtils.js";

/**
 * Register the resource-apply query handler on this client. Called at `init` so
 * the handler exists on every client — the GM's client runs it when a non-owner
 * delegates (foundry-api-expert §5/§8). The handler reduces `current` by `delta`,
 * floored at 0. Runs on the RECEIVER (a query context is passed as a 2nd arg —
 * unused here).
 */
export function registerApplyQuery() {
  if (!CONFIG.queries) CONFIG.queries = {};
  CONFIG.queries["chroniclesystem.applyResource"] = async ({
    actorUuid,
    path,
    delta,
  }) => {
    const actor = await fromUuid(actorUuid);
    if (!actor) return { ok: false };
    const current = foundry.utils.getProperty(actor, path) ?? 0;
    await actor.update({ [path]: Math.max(0, current - delta) });
    return { ok: true };
  };
}

/**
 * Reduce a target actor's resource at `path` by `delta` (floored at 0). Owners
 * apply directly; non-owners delegate to the active GM. With no active GM, warns
 * and does nothing — NEVER applies silently without permission (FR-019).
 * @param {Actor} actor
 * @param {string} path e.g. "system.derivedStats.health.current"
 * @param {number} delta
 */
export async function applyResourceDelta(actor, path, delta) {
  if (!actor) return;
  if (actor.isOwner) {
    const cur = foundry.utils.getProperty(actor, path) ?? 0;
    return actor.update({ [path]: Math.max(0, cur - delta) });
  }
  const gm = game.users.activeGM;
  if (!gm) {
    return ui.notifications.warn(
      SystemUtils.localize("CS.notifications.noActiveGM")
    );
  }
  return gm.query("chroniclesystem.applyResource", {
    actorUuid: actor.uuid,
    path,
    delta,
  });
}
