import {CSItemSheet} from "./csItemSheet.js";

export class CSHoldingItemSheet extends CSItemSheet {

    getData() {
        const data = super.getData();
        data.resourceChoices = {
            defense: "CS.sheets.house.resources.defense",
            influence: "CS.sheets.house.resources.influence",
            lands: "CS.sheets.house.resources.lands",
            law: "CS.sheets.house.resources.law",
            population: "CS.sheets.house.resources.population",
            power: "CS.sheets.house.resources.power",
            wealth: "CS.sheets.house.resources.wealth"
        }
        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find('.item-feature-create').on("click", this._onClickFeatureCreate.bind(this));
        html.find(".feature-list").on("click", ".item-features-control", this._onclickFeatureControl.bind(this));
    }

    async _onClickFeatureCreate(event) {
        event.preventDefault();
        const item = this.item;
        let feature = {
            name: "",
            rating: 0,
            modifier: 0
        };
        let featureList = Object.values(item.data.data.features);
        featureList.push(feature);
        item.update({"data.features" : featureList});
    }

    async _onclickFeatureControl(event) {
        event.preventDefault();
        const a = event.currentTarget;
        const index = parseInt(a.dataset.id);
        const action = a.dataset.action;

        // Remove existing specialty
        if ( action === "delete" ) {
            const item = this.item;
            let featureList = Object.values(item.data.data.features);
            featureList.splice(index,1);
            item.update({"data.features" : featureList});
        }
    }
}