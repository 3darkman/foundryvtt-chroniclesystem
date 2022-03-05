import factory from "../utils/factory.js";
import {CSWeaponItem} from "./csWeaponItem.js";
import {CSItem} from "./csItem.js";
import {CSAbilityItem} from "./csAbilityItem.js";
import {CSArmorItem} from "./csArmorItem.js";

const itemTypes = {};
itemTypes.weapon = CSWeaponItem;
itemTypes.armor = CSArmorItem;
itemTypes.ability = CSAbilityItem;
itemTypes.benefit = CSItem;
itemTypes.drawback = CSItem;
itemTypes.equipment = CSItem;
const itemConstructor = factory(itemTypes, Item);
export default itemConstructor;