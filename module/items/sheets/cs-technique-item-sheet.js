import {CSItemSheet} from "./csItemSheet.js";
import {CSConstants} from "../../system/csConstants.js";

export class CSTechniqueItemSheet extends CSItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
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

    async getData() {
        const data = await super.getData();
        data.types = CSConstants.TechniqueType;
        data.costs = CSConstants.TechniqueCost;
        // Enrich work descriptions for the works tab
        const works = data.item?.system?.works;
        if (works) {
            for (const work of Object.values(works)) {
                if (work.description) {
                    work.description = await TextEditor.enrichHTML(work.description, { async: true });
                }
            }
        }
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
        let newSpec = Object.values(item.getCSData().arts);
        newSpec.push(art);
        item.update({"system.arts" : newSpec});
    }

    async _onclickArtControl(event) {
        event.preventDefault();
        const a = event.currentTarget;
        const index = parseInt(a.dataset.id);
        const action = a.dataset.action;

        // Remove existing specialty
        if ( action === "delete" ) {
            const item = this.item;
            let newSpec = Object.values(item.getCSData().arts);
            newSpec.splice(index,1);
            item.update({"system.arts" : newSpec});
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
        let newSpec = Object.values(item.getCSData().works);
        newSpec.push(work);
        item.update({"system.works" : newSpec});
    }

    async _onclickWorkControl(event) {
        event.preventDefault();
        const a = event.currentTarget;
        const index = parseInt(a.dataset.id);
        const action = a.dataset.action;

        // Remove existing specialty
        if ( action === "delete" ) {
            const item = this.item;
            let newSpec = Object.values(item.getCSData().works);
            newSpec.splice(index,1);
            item.update({"system.works" : newSpec});
        }
    }
}