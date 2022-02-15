/**
 * Extend the basic ItemSheet with some very simple modifications
 * @extends {ItemSheet}
 */
export class ChronicleSystemItemSheet extends ItemSheet {

  /** @override */
	static get defaultOptions() {
	  return mergeObject(super.defaultOptions, {
			classes: ["worldbuilding","chroniclesystem", "sheet", "item"],
			width: 650,
			height: 500,
            tabs: [
                {
                    navSelector: ".sheet-tabs",
                    contentSelector: ".sheet-body",
                    initial: "description"
                }
            ]
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
              console.log(this.item.actor);
              this.item.actor.deleteEmbeddedDocuments("Item", [this.item.data._id,]);
              this.item.sheet.close();
          }
      });

      html.find('.specialty-create').click((ev) => {
          const actor = this.item.actor;
          const item = this.item;
          console.log(item);
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
      });

      html.find(".specialties-list").on("click", ".specialty-control", this._onclickSpecialtyControl.bind(this));
  }

    async _onclickSpecialtyControl(event) {
        event.preventDefault();
        const a = event.currentTarget;
        const index = a.dataset.id;
        const action = a.dataset.action;

        // Remove existing specialty
        if ( action === "delete" ) {
            const item = this.item;
            let newSpec = Object.values(item.data.data.specialties);
            newSpec.splice(index,1);
            item.update({"data.specialties" : newSpec});
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
    const bodyHeight = position.height - 192;
    sheetBody.css("height", bodyHeight);
    return position;
  }
}
