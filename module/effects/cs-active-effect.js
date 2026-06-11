/* global ActiveEffect */
import { ChronicleSystem } from "../system/ChronicleSystem.js";

/**
 * Spike 006 — Active Effects PoC.
 *
 * A thin ActiveEffect subclass whose only job is to suppress itself when its
 * owning item is NOT equipped. Equipping/unequipping the armor therefore does
 * NOT create or destroy the effect document — it only flips `system.equipped`,
 * and because `prepareData` recomputes suppression every cycle the effect turns
 * on/off by itself. This is what eliminates the "ghost" residue by construction
 * (research Decision 3).
 *
 * Version-safe v13+v14: `active` derives from `isSuppressed` in BOTH versions,
 * so overriding `isSuppressed` is the single portable hook. We never reference
 * `CONFIG.ActiveEffect.legacyTransferral` (removed in v14) and never assume the
 * effect appears in `actor.effects` (transferred in-place into
 * `actor.appliedEffects` in v14).
 */
export class CSActiveEffect extends ActiveEffect {
  /** @override */
  get isSuppressed() {
    const item = this.parent;
    if (item?.documentName === "Item") {
      const sys = item.system ?? {};
      if (
        "equipped" in sys &&
        sys.equipped === ChronicleSystem.equippedConstants.IS_NOT_EQUIPPED
      ) {
        return true;
      }
    }
    // Preserve native suppression (duration.expired / system.isSuppressed).
    return super.isSuppressed;
  }

  /**
   * PoC helper (T012): create the armor-penalty Active Effect on an armor item
   * with `transfer: true` and the three domain-key changes. Usable from a macro
   * or the console in the test world; the same effect can equally be authored by
   * hand through the native item Effects UI (documented in the PoC trace).
   *
   * `mode: 2` (numeric ADD) is the portable creation format: native in v13 and
   * silently migrated to `{ type: "add" }` in v14 without a compat warning.
   *
   * @param {Item} item  An armor item with `system.penalty` / `system.rating`.
   * @returns {Promise<ActiveEffect[]>}
   */
  static async createArmorPenaltyEffect(item) {
    const sys = item.system ?? {};
    const penalty = Number(sys.penalty) || 0;
    const rating = Number(sys.rating) || 0;
    return item.createEmbeddedDocuments("ActiveEffect", [
      {
        name: game.i18n.localize("CS.effects.armorPenalty"),
        img: "icons/svg/shield.svg",
        transfer: true,
        changes: [
          { key: "cs.modifier.agility", value: penalty, mode: 2 },
          { key: "cs.modifier.combat_defense", value: penalty, mode: 2 },
          { key: "cs.modifier.damage_taken", value: rating, mode: 2 },
        ],
      },
    ]);
  }
}
