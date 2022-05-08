import {CSItemSheet} from "./csItemSheet.js";
import {CSConstants} from "../../system/csConstants.js";

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

    getData() {
        const data = super.getData();
        data.data.types = CSConstants.TechniqueType;
        data.data.costs = CSConstants.TechniqueCost;
        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find('.art-create').on("click", this._onClickArtCreate.bind(this));
        html.find(".art-list").on("click", ".art-control", this._onclickArtControl.bind(this));
        html.find('.work-create').on("click", this._onClickWorkCreate.bind(this));
        html.find(".work-list").on("click", ".work-control", this._onclickWorkControl.bind(this));
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

    async _onClickWorkCreate(ev) {
        const item = this.item;
        let work = {
            name: "",
            type: "",
            description: "",
            test: {
                alignment: "",
                invocation: "",
                unleashing: "",
                spellcasting: ""
            },
            cost: "",
            resonance: ""
        };
        let newSpec = Object.values(item.data.data.works);
        newSpec.push(work);
        item.update({"data.works" : newSpec});
    }

    async _onclickWorkControl(event) {
        event.preventDefault();
        const a = event.currentTarget;
        const index = parseInt(a.dataset.id);
        const action = a.dataset.action;

        // Remove existing specialty
        if ( action === "delete" ) {
            const item = this.item;
            let newSpec = Object.values(item.data.data.works);
            newSpec.splice(index,1);
            item.update({"data.works" : newSpec});
        }
    }
}