import { CSItem } from "./csItem.js";
import { ChronicleSystem } from "../system/ChronicleSystem.js";
import { weaponTypeSlug } from "../effects/cs-effect-vocabulary.js";

/**
 * Weapon item. Its bulk contribution is no longer applied imperatively: the
 * modifier collector (`cs-effect-modifiers.js`) reads the `bulk` quality live
 * from this item's data on every prepareData. `updateDamageValue` (a transient
 * display computation, not a modifier) also folds in any authored `damage`
 * Active Effects for this weapon's type (Wave 4).
 */
export class CSWeaponItem extends CSItem {
  updateDamageValue(actor) {
    let matches = this.getCSData().damage.match(
      "@([a-zsA-Z]*)([-+/*]*)([0-9]*)"
    );
    if (matches) {
      if (matches.length === 4) {
        let ability = actor.getAbilityValue(matches[1]);
        this.damageValue = eval(`${ability}${matches[2]}${matches[3]}`);
        let adaptableQuality = Object.values(this.getCSData().qualities).filter(
          (quality) => quality.name.toLowerCase() === "adaptable"
        );
        if (
          adaptableQuality.length > 0 &&
          this.getCSData().equipped ===
            ChronicleSystem.equippedConstants.BOTH_HANDS
        ) {
          this.damageValue += 1;
        }
        // Wave 4: authored `damage` effects targeting this weapon's type (its
        // combat specialty) or all weapons. Optional-chained so the unit tests'
        // bare actor double (no getWeaponDamageBonus) simply contributes 0.
        this.damageValue +=
          actor.getWeaponDamageBonus?.(
            weaponTypeSlug(this.getCSData().specialty)
          ) ?? 0;
      }
    }
  }
}
