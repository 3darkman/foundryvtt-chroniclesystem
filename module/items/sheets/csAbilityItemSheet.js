import { CSItemSheet } from "./csItemSheet.js";

export class CSAbilityItemSheet extends CSItemSheet {
  static DEFAULT_OPTIONS = {
    actions: {
      createSpecialty: CSAbilityItemSheet._onCreateSpecialty,
      deleteSpecialty: CSAbilityItemSheet._onDeleteSpecialty,
    },
  };

  /**
   * Action handler: Create a new specialty entry on this ability item.
   * For use with data-action="createSpecialty" in templates.
   */
  // eslint-disable-next-line no-unused-vars
  static _onCreateSpecialty(event, target) {
    const item = this.document;
    let specialty = {
      name: "",
      rating: 0,
      modifier: 0,
    };
    let newSpec = Object.values(item.getCSData().specialties);
    newSpec.push(specialty);
    item.update({ "system.specialties": newSpec });
  }

  /**
   * Action handler: Delete a specialty entry from this ability item.
   * For use with data-action="deleteSpecialty" in templates.
   * Expects target to have data-id attribute with the specialty index.
   */
  static _onDeleteSpecialty(event, target) {
    const item = this.document;
    const index = parseInt(target.dataset.id);
    let newSpec = Object.values(item.getCSData().specialties);
    newSpec.splice(index, 1);
    item.update({ "system.specialties": newSpec });
  }
}
