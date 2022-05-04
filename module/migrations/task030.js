import {CSConstants} from "../system/csConstants.js";

function addActorArmorCombatDefenseModifier() {
    const actors = Array.from(game.actors?.values() || []);
    for (const actor of actors) {
        for (const ownedItem of Array.from(actor.items.values())) {
            if (ownedItem.type === CSConstants.ItemTypes.ARMOR) {
                if (ownedItem.data.data.equipped === 1) {
                    actor.updateTempModifiers();
                    actor.addModifier(ChronicleSystem.modifiersConstants.COMBAT_DEFENSE,
                        ownedItem.id,
                        ownedItem.data.data.penalty,
                        true);
                    actor.saveModifiers();
                }
            }
        }
    }
}

export async function task030() {
    addActorArmorCombatDefenseModifier();
}
