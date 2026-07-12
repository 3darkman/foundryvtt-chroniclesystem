import { CSItem } from "./csItem.js";
import { ChronicleSystem } from "../system/ChronicleSystem.js";
import { weaponTypeSlug, slugify } from "../effects/cs-effect-vocabulary.js";

// Evaluate the arithmetic tail of a damage formula over integers. Never uses
// eval; never throws. Any malformed/incomplete tail → the bare `base` value.
function applyDamageOperator(base, operator, operand) {
  if (operand === "") return base; // bare @Ability, or operator with no operand
  const rhs = Number(operand); // operand is a non-empty [0-9]* match
  switch (operator) {
    case "+":
      return base + rhs;
    case "-":
      return base - rhs;
    case "*":
      return base * rhs;
    case "/":
      return base / rhs; // exact float — no new rounding
    default:
      return base; // operand w/ no operator, or malformed run ("++", "*/")
  }
}

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
    if (matches && matches.length === 4) {
      // Resolve the `@Ability` token by stable slug (spec 008) so the damage
      // formula survives a rename to any language.
      let ability = actor.getAbilityValueBySlug(slugify(matches[1]));
      this.damageValue = applyDamageOperator(ability, matches[2], matches[3]);
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
