/* global game */
import LOGGER from "../utils/logger.js";
import {CSConstants} from "./csConstants.js";

/**
 * This file defines user settings for the system module.
 */
const registerSystemSettings = () => {
    game.settings.register(CSConstants.Settings.SYSTEM_NAME, CSConstants.Settings.DEBUG_LOGS, {
        name: "CS.settings.debugLogs.name",
        hint: "CS.settings.debugLogs.hint",
        scope: "client",
        config: true,
        type: Boolean,
        default: false,
        onChange: (value) => {
            LOGGER.log(`Changed ${CSConstants.Settings.DEBUG_LOGS} to ${value}`);
        },
    });

    game.settings.register(CSConstants.Settings.SYSTEM_NAME, CSConstants.Settings.TRACE_LOGS, {
        name: "CS.settings.traceLogs.name",
        hint: "CS.settings.traceLogs.hint",
        scope: "client",
        config: true,
        type: Boolean,
        default: false,
        onChange: (value) => {
            LOGGER.log(`Changed ${CSConstants.Settings.TRACE_LOGS} to ${value}`);
        },
    });

    game.settings.register(CSConstants.Settings.SYSTEM_NAME, CSConstants.Settings.ASOIAF_DEFENSE_STYLE, {
        name: "CS.settings.asoiafDefenseStyle.name",
        hint: "CS.settings.asoiafDefenseStyle.hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: (value) => {
            LOGGER.log(`Changed ${CSConstants.Settings.ASOIAF_DEFENSE_STYLE} to ${value}`);
        },
    });

    game.settings.register(CSConstants.Settings.SYSTEM_NAME, CSConstants.Settings.CURRENT_VERSION, {
        name: "Current Version",
        scope: "world",
        config: false,
        type: String,
        onChange: (value) => {
            LOGGER.log(`Changed ${CSConstants.Settings.CURRENT_VERSION} to ${value}`);
        },
    });
};

export default registerSystemSettings;
