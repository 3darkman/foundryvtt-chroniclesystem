import { CSItemSheet } from "./csItemSheet.js";

export class CSEventItemSheet extends CSItemSheet {
  static DEFAULT_OPTIONS = {
    actions: {
      togglePlayerChoice: CSEventItemSheet._onTogglePlayerChoice,
    },
  };

  /**
   * Action handler: Toggle the playerChoice flag on this event item.
   * For use with data-action="togglePlayerChoice" in templates.
   */
  // eslint-disable-next-line no-unused-vars
  static _onTogglePlayerChoice(event, target) {
    this.document.update({
      "system.playerChoice": !this.document.system.playerChoice,
    });
  }
}