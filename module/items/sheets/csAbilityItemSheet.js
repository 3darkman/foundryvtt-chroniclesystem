import {CSItemSheet} from "./csItemSheet.js";

export class CSAbilityItemSheet extends CSItemSheet {
    activateListeners(html) {
        super.activateListeners(html);

        html.find('.specialty-create').on("click", this._onClickSpecialtyCreate.bind(this));
        html.find(".specialties-list").on("click", ".specialty-control", this._onclickSpecialtyControl.bind(this));
    }

    async _onClickSpecialtyCreate(ev) {
        const actor = this.item.actor;
        const item = this.item;
        if (actor) {
            let specialty = {
                name: "",
                rating: 0,
                modifier: 0
            };
            let newSpec = Object.values(item.data.data.specialties);
            newSpec.push(specialty);
            item.update({"data.specialties" : newSpec});
        }
    }

    async _onclickSpecialtyControl(event) {
        event.preventDefault();
        const a = event.currentTarget;
        const index = parseInt(a.dataset.id);
        const action = a.dataset.action;

        // Remove existing specialty
        if ( action === "delete" ) {
            const item = this.item;
            let newSpec = Object.values(item.data.data.specialties);
            newSpec.splice(index,1);
            item.update({"data.specialties" : newSpec});
        }
    }

}