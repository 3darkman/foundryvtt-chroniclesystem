import {ChronicleSystem} from "../../system/ChronicleSystem.js";
import LOGGER from "../../utils/logger.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class CSActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

    static DEFAULT_OPTIONS = {
        classes: ["chroniclesystem", "sheet", "actor"],
        form: {
            submitOnChange: true
        },
        actions: {
            editItem: CSActorSheet._onEditItem,
            rollDice: CSActorSheet._onRollDice,
            toggleDescription: CSActorSheet._onToggleDescription,
        }
    };

    static PARTS = {};

    /** @override */
    async _onRender(context, options) {
        await super._onRender(context, options);
        // Re-apply active tab state after each render
        for (const [group, tab] of Object.entries(this.tabGroups)) {
            this.changeTab(tab, group, {force: true, updatePosition: false});
        }
    }

    async _onDropActor(event, actor) {
        LOGGER.trace("On Drop Actor | CSActorSheet | csActorSheet.js");
    }

    _attachPartListeners(partId, htmlElement, options) {
        super._attachPartListeners(partId, htmlElement, options);
    }

    static _onToggleDescription(event, target) {
        event.preventDefault();
        const description = target.closest('.item').querySelector('.description');
        if (description) description.classList.toggle('hidden');
    }

    static _onEditItem(event, target) {
        event.preventDefault();
        const item = this.actor.items.get(target.closest('.item').dataset.itemId);
        if (item) item.sheet.render({force: true});
    }

    static async _onRollDice(event, target) {
        event.preventDefault();
        let showModifierDialog = false;
        if (event.shiftKey) {
            showModifierDialog = true;
        }
        const rollType = target.id;
        await ChronicleSystem.handleRollAsync(rollType, this.actor, showModifierDialog);
    }

    isItemPermitted(type) {
        return true;
    }

    splitItemsByType(data) {
        data.itemsByType = {};
        for (const item of this.actor.getEmbeddedCollection("Item")) {
            let list = data.itemsByType[item.type];
            if (!list) {
                list = [];
                data.itemsByType[item.type] = list;
            }
            list.push(item);
        }
    }

    _checkNull(items) {
        if (items && items.length) {
            return items;
        }
        return [];
    }

    async _onDropItem(event, item) {
        if (!this.actor.isOwner) return null;

        // If the item already belongs to this actor, handle sorting
        if (this.actor.uuid === item.parent?.uuid) {
            return this._onSortItem(event, item);
        }

        // Check for duplicate items by name. Weapons are allowed to stack as
        // separate items, so a second weapon of the same name is not merged
        // into the existing one.
        const existingItem = this.actor.items.find(i => i.name === item.name);
        if (existingItem && item.type !== "weapon") {
            return existingItem;
        }

        // Check if item type is permitted
        if (!this.isItemPermitted(item.type)) return null;

        // Create the embedded item
        const created = await this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
        if (created && created.length > 0) {
            created.forEach((createdItem) => {
                createdItem.onObtained(createdItem.actor);
            });
        }

        return created;
    }
}
