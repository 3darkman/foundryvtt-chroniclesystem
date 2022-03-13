export class CSActorSheet extends ActorSheet {

    activateListeners(html) {
        super.activateListeners(html);

        // Everything below here is only needed if the sheet is editable
        if (!this.options.editable) return;

        // Update Inventory Item
        html.find('.item-edit').click(this._showEmbeddedItemSheet.bind(this));
    }

    _showEmbeddedItemSheet(event) {
        event.preventDefault();
        const li = $(event.currentTarget).parents('.item');
        const item = this.actor.items.get(li.data('itemId'));
        item.data.isOwned = true;
        item.sheet.render(true);
    }

    isItemPermitted(type) {
        return true;
    }

    splitItemsByType(data) {
        data.itemsByType = {};
        for (const item of data.items) {
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

    async _onDropItemCreate(itemData) {
        let embeddedItem = [];
        let itemsToCreate = [];
        let data = [];
        data = data.concat(itemData);
        data.forEach((doc) => {
            const item = this.actor.items.find((i) => {
                return i.name === doc.name;
            });
            if (item) {
                embeddedItem.push(this.actor.getEmbeddedDocument("Item", item.data._id));
            } else {
                if (this.isItemPermitted(doc.type))
                    itemsToCreate.push(doc);
            }
        });

        if (itemsToCreate.length > 0) {
            this.actor.createEmbeddedDocuments("Item", itemsToCreate)
                .then(function(result) {
                    result.forEach((item) => {
                        item.onObtained(item.actor);
                    });
                    embeddedItem.concat(result);
                });
        }

        return embeddedItem;
    }
}