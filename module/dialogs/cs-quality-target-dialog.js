import SystemUtils from "../utils/systemUtils.js";

const TEMPLATE =
  "systems/chroniclesystem/templates/dialogs/quality-target-dialog.hbs";

export const QUALITY_TARGETS = [
  {
    path: "system.startingEquipment.fightingQualities",
    group: "CS.sheets.unitTypeItem.startingEquipment",
    label: "CS.dialogs.qualityTarget.fighting",
  },
  {
    path: "system.startingEquipment.marksmanshipQualities",
    group: "CS.sheets.unitTypeItem.startingEquipment",
    label: "CS.dialogs.qualityTarget.marksmanship",
  },
  {
    path: "system.upgradedEquipment.fightingQualities",
    group: "CS.sheets.unitTypeItem.upgradedEquipment",
    label: "CS.dialogs.qualityTarget.fighting",
  },
  {
    path: "system.upgradedEquipment.marksmanshipQualities",
    group: "CS.sheets.unitTypeItem.upgradedEquipment",
    label: "CS.dialogs.qualityTarget.marksmanship",
  },
];

/** The four targets folded into the design's two labelled groups of two. */
function targetGroups() {
  const groups = [];
  for (const target of QUALITY_TARGETS) {
    let group = groups.find((entry) => entry.label === target.group);
    if (!group) groups.push((group = { label: target.group, targets: [] }));
    group.targets.push(target);
  }
  return groups;
}

/**
 * spec 025 (contract unit-type-assignment.md C6a branch B, FR-004a) — ask which
 * of a Unit Type's four weapon-quality lists a dropped Quality belongs to. The
 * four choices ARE the dialog's buttons (design: one click, no confirm step);
 * cancelling — or closing — resolves `null` and nothing is written.
 * @param {string} qualityName the dropped quality, named in the question
 * @returns {Promise<string|null>} the chosen list's system path
 */
export async function pickQualityTarget(qualityName = "") {
  const content = await foundry.applications.handlebars.renderTemplate(
    TEMPLATE,
    { groups: targetGroups(), qualityName }
  );

  let picked = null;
  const result = await foundry.applications.api.DialogV2.wait({
    classes: [
      "chroniclesystem",
      "cs-v2",
      "csv2-dialog",
      "cs-quality-target-dialog",
    ],
    window: { title: SystemUtils.localize("CS.dialogs.qualityTarget.title") },
    position: { width: 420 },
    content,
    buttons: [
      {
        action: "cancel",
        label: SystemUtils.localize("CS.dialogs.actions.cancel"),
        class: "csv2-btn csv2-btn--quiet",
      },
    ],
    render: (event, dialog) => {
      for (const button of dialog.element.querySelectorAll("[data-target]")) {
        button.addEventListener("click", () => {
          picked = button.dataset.target;
          dialog.close();
        });
      }
    },
    close: () => picked,
    rejectClose: false,
  });

  return QUALITY_TARGETS.some((target) => target.path === result)
    ? result
    : null;
}
