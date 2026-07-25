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
    { name: actor?.name ?? "", img: actor?.img ?? "" }
  );

  // The two roles are the dialog's CONTENT buttons — one click answers, with no
  // confirm step (design). Only Cancel stays in the frame's footer, so the
  // chosen role travels in a closure and `close` hands it back; the same shape
  // the quality-destination picker uses.
  let picked = null;
  const result = await foundry.applications.api.DialogV2.wait({
    classes: ["chroniclesystem", "cs-v2", "csv2-dialog", "cs-attach-dialog"],
    window: {
      title: SystemUtils.format("CS.dialogs.attachCharacter.title", {
        name: actor?.name ?? "",
      }),
    },
    position: { width: 390 },
    content,
    buttons: [
      {
        action: "cancel",
        label: SystemUtils.localize("CS.dialogs.actions.cancel"),
        class: "csv2-btn csv2-btn--quiet",
      },
    ],
    render: (event, dialog) => {
      for (const button of dialog.element.querySelectorAll("[data-role]")) {
        button.addEventListener("click", () => {
          picked = button.dataset.role;
          dialog.close();
        });
      }
    },
    close: () => picked,
    rejectClose: false,
  });

  return ROLES.includes(result) ? result : null;
}
