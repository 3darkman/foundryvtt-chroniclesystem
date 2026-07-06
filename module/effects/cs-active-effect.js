// Custom ActiveEffect document (spec 007, research §D8/§D10).
//
// Two responsibilities:
//   - suppress an item-borne effect while its parent item is unequipped, WITHOUT
//     creating/deleting the document (SC-008 — no residue, no doc flicker);
//   - expose the origin/author metadata used by the permission model (D9/D10).
//
// Registered via `CONFIG.ActiveEffect.documentClass` (config.js). The core
// resolves the document class directly (no Factory Proxy needed for AE — there
// is no `isSubclass(documentClass, ActiveEffect)` check, confirmed against the
// v14 bundle).

export class CSActiveEffect extends foundry.documents.ActiveEffect {
  /**
   * Suppress the effect while its parent item carries an `equipped` field that
   * is falsy (Chronicle stores `equipped` numerically; 0 = not equipped). Falls
   * back to the core getter (`system.isSuppressed ?? duration.expired` on v14,
   * `duration.expired` on v13) — the override is portable across both.
   * @override
   */
  get isSuppressed() {
    const item = this.item;
    if (item && "equipped" in (item.system ?? {}) && !item.system.equipped) {
      return true;
    }
    return super.isSuppressed;
  }

  /**
   * The Item this effect originates from, resolved from the `origin` UUID.
   * Returns null when origin is absent or not (synchronously) an Item.
   * @returns {Item|null}
   */
  get originItem() {
    if (!this.origin) return null;
    const doc = foundry.utils.fromUuidSync(this.origin);
    return doc instanceof foundry.documents.Item ? doc : null;
  }

  /**
   * Origin classification flag (design §7): "player" (player-authored),
   * "item" (item/GM content — the default), or "system" (reserved for future
   * system-rule markers). Drives permission + the tab's lock icon.
   */
  get csOrigin() {
    return this.getFlag("chroniclesystem", "origin") ?? "item";
  }

  /** Author user id for player-authored effects (D9). */
  get csAuthorId() {
    return this.getFlag("chroniclesystem", "authorId") ?? null;
  }
}

// Permission + row-context logic lives in the pure cs-effect-permission.js module
// (testable without Foundry); re-exported here so existing callers are unchanged.
export {
  canUserModifyEffect,
  buildEffectContext,
  effectBlockMessageKey,
} from "./cs-effect-permission.js";

/**
 * Create-data builder for a new effect authored from a sheet. Players' effects
 * are stamped player/authorId so the permission rule lets them manage their own.
 * @param {Document} parent - item or actor the effect is embedded in
 * @param {User} user
 * @returns {object}
 */
export function buildNewEffectData(parent, user) {
  const isPlayer = !user.isGM;
  const data = {
    name: game.i18n.localize("CS.effects.create"),
    img: "icons/svg/aura.svg",
    origin: parent.uuid,
    // Item-borne effects transfer to the owning actor; actor effects do not.
    transfer: parent.documentName === "Item",
    flags: {
      chroniclesystem: isPlayer
        ? { origin: "player", authorId: user.id }
        : { origin: "item" },
    },
  };
  return data;
}
