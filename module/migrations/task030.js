export async function task030() {
    const actors = Array.from(game.actors?.values() || []);
    for (const actor of actors) {
        for (const ownedItem of Array.from(actor.items.values())) {
            if (ownedItem.type === "armor") {
                let data = ownedItem.getCSData();
                if (data.equipped === 1) {
                    actor.updateTempModifiers();
                    actor.addModifier(ChronicleSystem.modifiersConstants.COMBAT_DEFENSE,
                        ownedItem._id,
                        data.penalty,
                        true);
                    actor.saveModifiers();
                }
            }
        }
    }
}
