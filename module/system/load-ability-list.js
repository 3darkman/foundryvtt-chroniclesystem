import {CSConstants} from "./csConstants.js";

export async function loadAbilityList() {
    const items = Array.from(game.items?.values() || []);
    for (const item of items) {
        if (item.type === CSConstants.ItemTypes.ABILITY) {
            console.log(item.data.data);
        }
    }
}
