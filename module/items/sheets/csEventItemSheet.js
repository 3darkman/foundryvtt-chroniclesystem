import {CSItemSheet} from "./csItemSheet.js";

export class CSEventItemSheet extends CSItemSheet {
    activateListeners(html) {
        super.activateListeners(html);

        html.find('.checkButton').on("click", this._onClickPlayerChoice.bind(this));
    }
    async _onClickPlayerChoice(ev) {
        ev.preventDefault();
        this.item.update({"data.playerChoice": !this.item.getCSData().playerChoice});
    }
}