// Difficulty table editor (US3) — an ApplicationV2 settings menu (registerMenu)
// that edits the world `difficultyTable` Object setting. The factory defaults and
// all validation live in the pure cs-difficulty.js (SSOT); this class is only the
// presentation + form wiring (idiomatic v14: tag:"form", form.handler, PARTS body
// + the CORE form-footer.hbs, actions).

import { CSConstants } from "../system/csConstants.js";
import {
  readDifficultyTable,
  cloneCanonicalSetting,
  entryLabel,
} from "../difficulty/cs-difficulty.js";
import SystemUtils from "../utils/systemUtils.js";

const SYSTEM = CSConstants.Settings.SYSTEM_NAME;
const KEY = CSConstants.Settings.DIFFICULTY_TABLE;

// Guarded base (mirrors cs-effect-config-sheet.js): the class still DEFINES
// without throwing if the V2 namespace is somehow absent. On v13+ (our floor) the
// real ApplicationV2 is always present when the system module loads.
const { HandlebarsApplicationMixin, ApplicationV2 } =
  foundry.applications?.api ?? {};
const DifficultyConfigBase = ApplicationV2
  ? HandlebarsApplicationMixin(ApplicationV2)
  : class {};

export class CSDifficultyConfig extends DifficultyConfigBase {
  /** In-memory draft so add/delete-row keep the GM's unsaved edits. */
  #draft = null;

  static DEFAULT_OPTIONS = {
    id: "cs-difficulty-config",
    tag: "form",
    classes: ["chroniclesystem", "cs-v2", "difficulty-table"],
    position: { width: 560, height: "auto" },
    window: {
      title: "CS.settings.difficulty.menuName",
      icon: "fa-solid fa-table-list",
      contentClasses: ["standard-form"],
    },
    form: {
      handler: CSDifficultyConfig.#onSubmit,
      closeOnSubmit: true,
    },
    actions: {
      restore: CSDifficultyConfig.#onRestore,
      addRow: CSDifficultyConfig.#onAddRow,
      deleteRow: CSDifficultyConfig.#onDeleteRow,
    },
  };

  static PARTS = {
    body: {
      template:
        "systems/chroniclesystem/templates/settings/difficulty-table.hbs",
      scrollable: [""],
    },
    footer: { template: "templates/generic/form-footer.hbs" },
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const table = this.#draft ?? readDifficultyTable();
    context.entries = table.entries.map((entry, index) => ({
      index,
      labelKey: entry.labelKey ?? "",
      label: entry.label ?? "",
      placeholder: entryLabel(entry, SystemUtils.localize),
      target: entry.target,
      isDefault: index === table.defaultIndex,
    }));
    context.noneDefault = table.defaultIndex < 0;
    context.buttons = [
      {
        type: "button",
        action: "restore",
        icon: "fa-solid fa-rotate-left",
        label: "CS.settings.difficulty.restore",
      },
      {
        type: "submit",
        icon: "fa-solid fa-floppy-disk",
        label: "CS.dialogs.actions.save",
      },
    ];
    return context;
  }

  /** Read the CURRENT form (not the stored setting) so unsaved edits survive an
   *  add/delete-row re-render. */
  #readForm() {
    const fd = new foundry.applications.ux.FormDataExtended(this.element);
    const data = foundry.utils.expandObject(fd.object);
    return normalizeSubmitted(data);
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const table = normalizeSubmitted(data);
    this.#draft = null;
    await game.settings.set(SYSTEM, KEY, table);
  }

  static async #onRestore() {
    this.#draft = null;
    await game.settings.set(SYSTEM, KEY, cloneCanonicalSetting());
    this.render();
  }

  static async #onAddRow() {
    const draft = this.#readForm();
    draft.entries.push({ labelKey: null, label: "New Difficulty", target: 0 });
    this.#draft = draft;
    this.render();
  }

  static async #onDeleteRow(event, target) {
    const index = Number(target.dataset.index);
    const draft = this.#readForm();
    draft.entries.splice(index, 1);
    if (draft.defaultIndex >= draft.entries.length) draft.defaultIndex = -1;
    this.#draft = draft;
    this.render();
  }
}

/**
 * Rebuild the `{entries, defaultIndex}` shape from an expanded form object.
 * Numeric `entries` keys expand to an object (not an array) → Object.values; a
 * blank `label` means "use the canonical labelKey"; defaultIndex is clamped.
 */
function normalizeSubmitted(data) {
  const entries = Object.values(data.entries ?? {}).map((entry) => ({
    labelKey: entry.labelKey ? String(entry.labelKey) : null,
    label:
      entry.label && String(entry.label).trim()
        ? String(entry.label).trim()
        : null,
    target: Number(entry.target) || 0,
  }));
  let defaultIndex = Number(data.defaultIndex);
  if (
    !Number.isInteger(defaultIndex) ||
    defaultIndex < -1 ||
    defaultIndex >= entries.length
  ) {
    defaultIndex = -1;
  }
  return { entries, defaultIndex };
}
