import {CSItemSheet} from "./csItemSheet.js";

export class CSTechniqueItemSheet extends CSItemSheet {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            classes: ["chroniclesystem", "technique", "sheet", "item"],
            width: 650,
            height: 560,
            tabs: [
                {
                    navSelector: ".tabs",
                    contentSelector: ".sheet-body",
                    initial: "details"
                }
            ]
        });
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find('.art-create').on("click", this._onClickArtCreate.bind(this));
        html.find(".art-list").on("click", ".art-control", this._onclickArtControl.bind(this));
    }

    async _onClickArtCreate(ev) {
        const item = this.item;
        let art = {
            name: ""
        };
        let newSpec = Object.values(item.data.data.arts);
        newSpec.push(art);
        item.update({"data.arts" : newSpec});
    }

    async _onclickArtControl(event) {
        event.preventDefault();
        const a = event.currentTarget;
        const index = parseInt(a.dataset.id);
        const action = a.dataset.action;

        // Remove existing specialty
        if ( action === "delete" ) {
            const item = this.item;
            let newSpec = Object.values(item.data.data.arts);
            newSpec.splice(index,1);
            item.update({"data.arts" : newSpec});
        }
    }
}