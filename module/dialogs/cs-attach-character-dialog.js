import SystemUtils from "../utils/systemUtils.js";

const TEMPLATE =
  "systems/chroniclesystem/templates/dialogs/attach-character-dialog.hbs";

const ROLES = ["leader", "hero"];

/**
 * spec 025 (contract unit-relations.md C6, handoff §11) — dropping a Character
 * on a Unit asks whether it joins as the Leader or as an Attached Hero. There is
 * no visible drop zone; this dialog IS the affordance. Cancelling (or closing)
 * resolves `null` and nothing is written.
 * @param {object} actor the dropped character, named in the dialog title
 * @returns {Promise<"leader"|"hero"|null>}
 */
export async function pickAttachRole(actor) {
  const content = await foundry.applications.handlebars.renderTemplate(
    TEMPLATE,
    {}
  );

  const result = await foundry.applications.api.DialogV2.wait({
    classes: ["chroniclesystem", "cs-v2", "cs-attach-dialog"],
    window: {
      title: SystemUtils.format("CS.dialogs.attachCharacter.title", {
        name: actor?.name ?? "",
      }),
    },
    content,
    buttons: [
      {
        action: "cancel",
        label: SystemUtils.localize("CS.dialogs.actions.cancel"),
        icon: "fas fa-times",
      },
      {
        action: "confirm",
        label: SystemUtils.localize("CS.dialogs.actions.confirm"),
        icon: "fas fa-check",
        default: true,
        callback: (event, button) => button.form?.attachRole?.value ?? null,
      },
    ],
    rejectClose: false,
  });

  return ROLES.includes(result) ? result : null;
}
