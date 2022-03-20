/**
 * Extend the basic ItemSheet with some very simple modifications
 * @extends {ItemSheet}
 */
export class CSItemSheet extends ItemSheet {
    /** @override */
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            classes: ["worldbuilding","chroniclesystem", "sheet", "item"],
            width: 650,
            height: 560,
        });
    }

    get template() {
        const path = 'systems/chroniclesystem/templates/items';
        return `${path}/${this.item.data.type}.html`;
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find('.item-delete').click((ev) => {
            if (this.item.actor) {
                this.item.actor.deleteEmbeddedDocuments("Item", [this.item.data._id,]);
            }
        });

        html.find(".item-qualities-control").on("click", this._onClickItemQualityControl.bind(this));
        html.find('.item-quality-create').on("click", this._onClickItemQualityCreate.bind(this));
    }

    async _onClickItemQualityCreate(ev) {
        const item = this.item;
        let quality = {
            name: "",
            parameter: ""
        };
        let newQuality = Object.values(item.data.data.qualities);
        newQuality.push(quality);
        item.update({"data.qualities" : newQuality});
    }

    async _onClickItemQualityControl(event) {
        event.preventDefault();
        const a = event.currentTarget;
        const index = parseInt(a.dataset.id);
        const action = a.dataset.action;

        // Remove existing specialty
        if ( action === "delete" ) {
            const item = this.item;
            let qualities = Object.values(item.data.data.qualities);
            qualities.splice(index,1);
            item.update({"data.qualities" : qualities});
        }
    }


    /* -------------------------------------------- */

    /** @override */
    getData() {
        const data = super.getData();
        data.dtypes = ["String", "Number", "Boolean"];
        return data;
    }

    /* -------------------------------------------- */

    /** @override */
    setPosition(options={}) {
        const position = super.setPosition(options);
        const sheetBody = this.element.find(".sheet-body");
        const bodyHeight = position.height - 142;
        sheetBody.css("height", bodyHeight);
        return position;
    }
}
