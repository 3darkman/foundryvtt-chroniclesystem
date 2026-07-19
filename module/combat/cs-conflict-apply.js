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
  // spec 021 (US3, D16) — the apply-condition sibling: a non-owner's card click
  // delegates the ActiveEffect create/refresh to the active GM's client (which has
  // OWNER on the target). Handler runs OWNER-side; returns a JSON-serialisable ack.
  CONFIG.queries["chroniclesystem.applyCondition"] = async ({
    actorUuid,
    effectData,
  }) => {
    const actor = await fromUuid(actorUuid);
    if (!actor) return { ok: false };
    await _applyConditionLocal(actor, effectData);
    return { ok: true };
  };
}

/**
 * Create the condition on `actor`, or REFRESH an existing one from the SAME quality
 * (matched by `flags.chroniclesystem.conditionOrigin` = the quality slug) instead of
 * stacking (FR-013a, D18) — refresh restores its duration and re-enables it. Runs
 * OWNER-side (direct owner, or the GM via the query handler).
 * @param {Actor} actor
 * @param {object} effectData ActiveEffect creation data (carries conditionOrigin)
 */
async function _applyConditionLocal(actor, effectData) {
  const origin = effectData?.flags?.chroniclesystem?.conditionOrigin;
  const match = origin
    ? actor.effects.find(
        (e) => e.flags?.chroniclesystem?.conditionOrigin === origin
      )
    : null;
  if (match) {
    return match.update({ duration: effectData.duration, disabled: false });
  }
  return actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
}

/**
 * Apply an authored condition (ActiveEffect) to the attack's TARGET on a qualifying
 * hit (spec 021, US3, D16/FR-011). NEVER touches the wielder (the caller only ever
 * passes the target actor). Owners create/refresh locally; a non-owner delegates to
 * the active GM. With no active GM, warns and does nothing — never silent (FR-011).
 * Refreshes rather than stacks (FR-013a). Mirrors {@link applyResourceDelta}.
 * @param {Actor} actor the TARGET actor
 * @param {object} effectData ActiveEffect creation data
 */
export async function applyConditionToTarget(actor, effectData) {
  if (!actor || !effectData) return;
  if (actor.isOwner) return _applyConditionLocal(actor, effectData);
  const gm = game.users.activeGM;
  if (!gm) {
    return ui.notifications.warn(
      SystemUtils.localize("CS.notifications.noActiveGM")
    );
  }
  return gm.query("chroniclesystem.applyCondition", {
    actorUuid: actor.uuid,
    effectData,
  });
}

/**
 * Resolve the authored condition effect a `scope:"target"` rule references (spec
 * 021, US3, D19/D22/FR-024) into ready-to-create ActiveEffect data, or null. The
 * quality is resolved WORLD-first (a real world Quality carries its `.effects`),
 * then the compendium (the sync seed fallback has no `.effects`, D19). The effect
 * is matched by NAME (`e.name === effectRef`); a miss → null (FR-014 graceful
 * no-op). The returned data is forced to target-only condition semantics:
 * `transfer:false` (D17), `showIcon:ALWAYS` (FR-024 token icon), and a
 * `conditionOrigin` = the quality slug (D18 refresh-match key). Async — resolves
 * `qualityBySlug` via a lazy import (cycle-safe, called only at roll time).
 * @param {string} slug the quality slug
 * @param {string} effectRef the authored effect's name
 * @returns {Promise<object|null>}
 */
export async function resolveConditionEffectData(slug, effectRef) {
  if (!slug || !effectRef) return null;
  const { qualityBySlug, slugify } = await import(
    "../effects/cs-effect-vocabulary.js"
  );

  let effect = null;
  const world = qualityBySlug(slug);
  if (world?.effects) {
    // A real world Quality item — world wins (a missing effect here = deleted).
    effect = world.effects.find((e) => e.name === effectRef) ?? null;
  } else {
    // No world copy → the compendium (load the full doc for its `.effects`).
    for (const pack of game?.packs ?? []) {
      if (pack.metadata?.type !== "Item") continue;
      let index;
      try {
        index = await pack.getIndex({ fields: ["system.slug"] });
      } catch {
        continue;
      }
      const entry = index.find(
        (e) =>
          e.type === "quality" && (e.system?.slug || slugify(e.name)) === slug
      );
      if (!entry) continue;
      const doc = await pack.getDocument(entry._id);
      effect = doc?.effects?.find((e) => e.name === effectRef) ?? null;
      break;
    }
  }
  if (!effect) return null;

  const data =
    typeof effect.toObject === "function" ? effect.toObject() : { ...effect };
  data.transfer = false;
  data.showIcon = CONST?.ACTIVE_EFFECT_SHOW_ICON?.ALWAYS ?? 2;
  data.flags = data.flags ?? {};
  data.flags.chroniclesystem = {
    ...(data.flags.chroniclesystem ?? {}),
    conditionOrigin: slug,
  };
  return data;
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
