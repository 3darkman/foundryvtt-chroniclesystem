/* global game */
import LOGGER from "../utils/logger.js";

/**
 * This file defines user settings for the system module.
 */
const registerSystemSettings = () => {
    game.settings.register("chroniclesystem", "debugLogs", {
        name: "CS.settings.debugLogs.name",
        hint: "CS.settings.debugLogs.hint",
        scope: "client",
        config: true,
        type: Boolean,
        default: false,
        onChange: (value) => {
            LOGGER.log(`Changed debugLogs to ${value}`);
        },
    });

    game.settings.register("chroniclesystem", "traceLogs", {
        name: "CS.settings.traceLogs.name",
        hint: "CS.settings.traceLogs.hint",
        scope: "client",
        config: true,
        type: Boolean,
        default: false,
        onChange: (value) => {
            LOGGER.log(`Changed traceLogs to ${value}`);
        },
    });
};

export default registerSystemSettings;