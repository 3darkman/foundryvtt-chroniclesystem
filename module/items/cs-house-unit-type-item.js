import {CSItem} from "./csItem.js";
import {ChronicleSystem} from "../system/ChronicleSystem.js";
import LOGGER from "../utils/logger.js";
import {CSConstants} from "../system/csConstants.js";
import SystemUtils from "../utils/systemUtils.js";

export class CsHouseUnitTypeItem extends CSItem {
    obtained = false;


    onObtained(actor) {
        super.onObtained(actor);
        if (!this.obtained) {
            this.obtained = true;
            if (this.system.allowAnyAbility) {
                this.showAbilitiesSelectionDialog()
                    .then((result) => {
                        if (!result.cancelled) {
                            let generateData = result.data;
                            let abilities = [];
                            for (let i = 0; i < 3; i++) {
                                abilities.push(generateData[i].value);
                            }
                            this.update({"data.keyAbilities": abilities}).then(() => {
                                this.addAbilitiesToUnit(actor);
                            });

                        } else {
                            actor.deleteEmbeddedDocuments("Item", [this._id,]);
                        }
                    });
            } else {
                this.addAbilitiesToUnit(actor);
            }
        }
    }

    async showAbilitiesSelectionDialog() {
        LOGGER.trace("show abilities selection dialog | CsHouseUnitTypeItem |" +
            " cs-house-unit-type-item.js");

        const abilities = {};
        ChronicleSystem.getAllItemFromType("ability").forEach((ability) => {
            abilities[ability.name] = ability.name;
        });

        const template = CSConstants.Templates.Dialogs.ABILITIES_SELECION;
        const html = await renderTemplate(template, {data: this, choices: abilities});
        return new Promise(resolve => {
            const data = {
                title: SystemUtils.format("CS.dialogs.abilitiesSelection.title", {name: this.name}),
                content: html,
                buttons: {
                    normal: {
                        label: SystemUtils.localize("CS.dialogs.actions.save"),
                        callback: html => resolve({data: html[0].querySelector("form")})
                    },
                    cancel: {
                        label: SystemUtils.localize("CS.dialogs.actions.cancel"),
                        callback: html => resolve({cancelled: true})
                    }
                },
                default: "normal",
                close: () => resolve({cancelled: true})
            };
            new Dialog(data, null).render(true);
        })
    }

    onDiscardedFromActor(actor, oldId) {
        super.onDiscardedFromActor(actor, oldId);
        this.removeAbilitiesFromActor(actor);
    }

    addAbilitiesToUnit(actor, keyAbilities = null) {
        if (!keyAbilities)
            keyAbilities = this.system.keyAbilities;
        let abilities = Object.values(keyAbilities);
        let itemsToCreate = [];
        abilities.forEach(name => {
            const item = actor.items.find((i) => {
                return i.name === name;
            });
            if (!item) {
                game.items.find(doc => {
                    if (doc.name === name) {
                        itemsToCreate.push(doc);
                    }
                });
            }
        });
        if (itemsToCreate.length > 0) {
            actor.createEmbeddedDocuments("Item", itemsToCreate)
        }
    }

    removeAbilitiesFromActor(actor) {
        let abilities = Object.values(this.system.keyAbilities);
        let idsToDelete = [];
        abilities.forEach(name => {
            let founded = false;
            actor.items.filter(doc => doc.type === "unitType").every(doc => {
                if (doc.name !== this.name) {
                    let otherDocAbilities = Object.values(doc.system.keyAbilities);
                    otherDocAbilities.every(ability => {
                        if (ability === name) {
                            founded = true;
                            return false;
                        }
                        return true;
                    })
                    return !founded;
                }
            })
            LOGGER.debug(`${name} can ${founded ? "not" : ""} be removed`);
            if (!founded) {
                actor.items.filter(doc => doc.type === "ability" && doc.name === name).forEach(ability => {
                    LOGGER.debug(ability);
                    idsToDelete.push(ability._id);
                });
            }
        })
        LOGGER.debugObject(idsToDelete);
        actor.deleteEmbeddedDocuments("Item", idsToDelete);
    }
}