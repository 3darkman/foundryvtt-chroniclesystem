import { CSItem } from "./csItem.js";

/**
 * Armour item. Its mechanical contributions (agility / combat-defence / damage-
 * taken penalty while WORN, bulk while OWNED) are no longer applied imperatively:
 * the modifier collector (`cs-effect-modifiers.js`) reads them live from this
 * item's data + equipped state on every prepareData. Authored Active Effects can
 * still be attached via the item's "Effects" tab.
 */
export class CSArmorItem extends CSItem {}
