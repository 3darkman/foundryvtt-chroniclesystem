import LOGGER from "../utils/logger.js";
import { CSConstants } from "./csConstants.js";
import { CSDifficultyConfig } from "../settings/cs-difficulty-config.js";
import { CANONICAL_DIFFICULTY_SETTING } from "../difficulty/cs-difficulty.js";

/**
 * This file defines user settings for the system module.
 */
const registerSystemSettings = () => {
  game.settings.register(
    CSConstants.Settings.SYSTEM_NAME,
    CSConstants.Settings.DEBUG_LOGS,
    {
      name: "CS.settings.debugLogs.name",
      hint: "CS.settings.debugLogs.hint",
      scope: "client",
      config: true,
      type: Boolean,
      default: false,
      onChange: (value) => {
        LOGGER.log(`Changed ${CSConstants.Settings.DEBUG_LOGS} to ${value}`);
      },
    }
  );

  game.settings.register(
    CSConstants.Settings.SYSTEM_NAME,
    CSConstants.Settings.TRACE_LOGS,
    {
      name: "CS.settings.traceLogs.name",
      hint: "CS.settings.traceLogs.hint",
      scope: "client",
      config: true,
      type: Boolean,
      default: false,
      onChange: (value) => {
        LOGGER.log(`Changed ${CSConstants.Settings.TRACE_LOGS} to ${value}`);
      },
    }
  );

  game.settings.register(
    CSConstants.Settings.SYSTEM_NAME,
    CSConstants.Settings.ASOIAF_DEFENSE_STYLE,
    {
      name: "CS.settings.asoiafDefenseStyle.name",
      hint: "CS.settings.asoiafDefenseStyle.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
      onChange: (value) => {
        LOGGER.log(
          `Changed ${CSConstants.Settings.ASOIAF_DEFENSE_STYLE} to ${value}`
        );
      },
    }
  );

  // spec 021 (US5, FR-021) — the optional SIFRP weapon Training rule, default OFF.
  // World-scoped; re-render open windows so the weapon sheet field + chips update.
  game.settings.register(
    CSConstants.Settings.SYSTEM_NAME,
    CSConstants.Settings.WEAPON_TRAINING_RULE,
    {
      name: "CS.settings.weaponTrainingRule.name",
      hint: "CS.settings.weaponTrainingRule.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
      onChange: () => {
        for (const app of Object.values(ui.windows)) app.render(false);
      },
    }
  );

  game.settings.register(
    CSConstants.Settings.SYSTEM_NAME,
    CSConstants.Settings.CURRENT_VERSION,
    {
      name: "Current Version",
      scope: "world",
      config: false,
      type: String,
      onChange: (value) => {
        LOGGER.log(
          `Changed ${CSConstants.Settings.CURRENT_VERSION} to ${value}`
        );
      },
    }
  );

  // Actionable post-migration review list (spec 008, FR-014): core items whose
  // derived slug isn't canonical. Persisted across sessions; not user-facing.
  game.settings.register(
    CSConstants.Settings.SYSTEM_NAME,
    CSConstants.Settings.SLUG_REVIEW,
    {
      scope: "world",
      config: false,
      type: Array,
      default: [],
    }
  );

  game.settings.register(
    CSConstants.Settings.SYSTEM_NAME,
    CSConstants.Settings.MODIFIER_DIALOG_AS_DEFAULT,
    {
      name: "CS.settings.isModifierDialogDefault.name",
      hint: "CS.settings.isModifierDialogDefault.hint",
      scope: "client",
      config: true,
      type: Boolean,
      default: false,
      onChange: (value) => {
        LOGGER.log(
          `Changed ${CSConstants.Settings.MODIFIER_DIALOG_AS_DEFAULT} to ${value}`
        );
      },
    }
  );

  // Difficulty table (US3): a world Object setting edited via the ApplicationV2
  // menu below. The factory default lives in the pure cs-difficulty.js (SSOT).
  game.settings.register(
    CSConstants.Settings.SYSTEM_NAME,
    CSConstants.Settings.DIFFICULTY_TABLE,
    {
      name: "CS.settings.difficulty.name",
      scope: "world",
      config: false,
      type: Object,
      default: CANONICAL_DIFFICULTY_SETTING,
    }
  );

  game.settings.registerMenu(
    CSConstants.Settings.SYSTEM_NAME,
    CSConstants.Settings.DIFFICULTY_TABLE,
    {
      name: "CS.settings.difficulty.menuName",
      label: "CS.settings.difficulty.menuLabel",
      hint: "CS.settings.difficulty.menuHint",
      icon: "fa-solid fa-table-list",
      type: CSDifficultyConfig,
      restricted: true,
    }
  );
};

export default registerSystemSettings;
