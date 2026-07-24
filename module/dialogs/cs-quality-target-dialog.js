import SystemUtils from "../utils/systemUtils.js";

const TEMPLATE =
  "systems/chroniclesystem/templates/dialogs/quality-target-dialog.hbs";

export const QUALITY_TARGETS = [
  {
    path: "system.startingEquipment.fightingQualities",
    label: "CS.dialogs.qualityTarget.startingFighting",
  },
  {
    path: "system.startingEquipment.marksmanshipQualities",
    label: "CS.dialogs.qualityTarget.startingMarksmanship",
  },
  {
    path: "system.upgradedEquipment.fightingQualities",
    label: "CS.dialogs.qualityTarget.upgradedFighting",
  },
  {
    path: "system.upgradedEquipment.marksmanshipQualities",
    label: "CS.dialogs.qualityTarget.upgradedMarksmanship",
  },
];

/**
 * spec 025 (contract unit-type-assignment.md C6a branch B, FR-004a) — ask which
 * of a Unit Type's four weapon-quality lists a dropped Quality belongs to.
 * Cancelling (or closing) resolves `null` and nothing is written.
 * @returns {Promise<string|null>} the chosen list's system path
 */
export async function pickQualityTarget() {
  const targets = QUALITY_TARGETS.map((target, index) => ({
    ...target,
    checked: index === 0,
  }));
  const content = await foundry.applications.handlebars.renderTemplate(
    TEMPLATE,
    { targets }
  );

  const result = await foundry.applications.api.DialogV2.wait({
    classes: ["chroniclesystem", "cs-v2", "cs-quality-target-dialog"],
    window: { title: SystemUtils.localize("CS.dialogs.qualityTarget.title") },
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
        callback: (event, button) => button.form?.qualityTarget?.value ?? null,
      },
    ],
    rejectClose: false,
  });

  return QUALITY_TARGETS.some((target) => target.path === result)
    ? result
    : null;
}
