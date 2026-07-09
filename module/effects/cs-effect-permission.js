// Pure permission + presentation logic for Active Effects (design §7). Separated
// from cs-active-effect.js (which defines the CSActiveEffect document class and
// therefore can't load outside Foundry) so this is a PURE module — unit-testable
// in Vitest. It operates only on the passed effect's accessors (getFlag / item /
// originItem), never on Foundry globals.

/**
 * Permission rule (FR-021/SC-009), enforced in both the UI (control state) and
 * the data layer (pre-hooks): a GM may modify ANY effect; a non-GM may modify
 * only the player-authored effects they themselves created; item/system effects
 * are read-only to non-GMs.
 * @param {{isGM?: boolean, id?: string}} user
 * @param {{getFlag: Function}} effect
 * @returns {boolean}
 */
export function canUserModifyEffect(user, effect) {
  if (!user || !effect) return false;
  if (user.isGM) return true; // GM edits everything (item/system included)
  const origin = effect.getFlag("chroniclesystem", "origin") ?? "item";
  if (origin !== "player") return false; // item/system effects are GM-only
  return effect.getFlag("chroniclesystem", "authorId") === user.id;
}

/**
 * The originating item's name when it differs from the document being viewed,
 * else null (the actor's/item's own effect — shown as "—" in the tab, design §7).
 * @param {{item?: object, originItem?: object}} effect
 * @param {{id?: string}|null} viewingDoc - the actor or item whose tab is rendering
 * @returns {string|null}
 */
export function effectSourceName(effect, viewingDoc) {
  const sourceItem = effect.item ?? effect.originItem;
  if (!sourceItem) return null;
  if (viewingDoc && sourceItem.id === viewingDoc.id) return null;
  return sourceItem.name;
}

/**
 * Classify an effect's origin for the tab badge (design §7, refined per the
 * user's definition of "intrinsic"): a modifier authored directly on the actor
 * (not inherited from an item) and not player-editable.
 *   - "player"    — player-authored (origin flag "player").
 *   - "item"      — inherited from an owned item (has a distinct source item).
 *   - "intrinsic" — the actor's/item's OWN, non-player effect (no source item):
 *                   a standing modifier a GM sets, e.g. a campaign-wide rule.
 * @param {{getFlag?: Function, csOrigin?: string}} effect
 * @param {string|null} sourceName - the origin item's name, or null (own effect)
 * @returns {"player"|"item"|"intrinsic"}
 */
export function effectOriginKind(effect, sourceName) {
  const origin =
    effect?.getFlag?.("chroniclesystem", "origin") ??
    effect?.csOrigin ??
    "item";
  if (origin === "player") return "player";
  return sourceName ? "item" : "intrinsic";
}

/**
 * Build the render context for one effect row (shared by item and actor sheets).
 * The "Source" column shows the real origin item (or "—"); permission is a
 * per-user lock icon (`locked`), not a row label (design §7). `originKind` drives
 * the origin badge (intrinsic / player / item).
 * @param {object} effect
 * @param {object} user
 * @param {object|null} viewingDoc - the document whose effects tab is rendering
 * @returns {object}
 */
export function buildEffectContext(effect, user, viewingDoc = null) {
  const editable = canUserModifyEffect(user, effect);
  const sourceName = effectSourceName(effect, viewingDoc);
  const isSuppressed = !!effect.isSuppressed;
  const disabled = !!effect.disabled;
  return {
    id: effect.id,
    name: effect.name,
    img: effect.img,
    disabled: effect.disabled,
    isSuppressed,
    // "Active" only when it is neither toggled off nor suppressed — drives the
    // Status badge (design §7).
    active: !effect.disabled && !isSuppressed,
    // Single derived 3-state for the tab badge (US5): suppression (an unequipped
    // source item, derived) PREVAILS over a manual disable — FR-023.
    displayState: isSuppressed ? "suspended" : disabled ? "disabled" : "active",
    sourceName,
    originKind: effectOriginKind(effect, sourceName),
    editable,
    locked: !editable,
  };
}

/**
 * The localization key for the warning shown when a user may not modify an
 * effect: a player editing ANOTHER player's effect gets "you can only modify
 * your own"; item/system (GM-only) effects get the GM-only message. Shared by the
 * preUpdate/preDelete data-layer guards so both surfaces report the right reason.
 * @param {{getFlag: Function}} effect
 * @returns {string}
 */
export function effectBlockMessageKey(effect) {
  const origin = effect?.getFlag?.("chroniclesystem", "origin");
  return origin === "player"
    ? "CS.effects.permission.blockedOther"
    : "CS.effects.permission.blockedGmOnly";
}
