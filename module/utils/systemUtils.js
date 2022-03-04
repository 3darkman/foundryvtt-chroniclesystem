/**
 * class created by the Cyberpunk Red Core system development team
 */
import LOGGER from "./logger.js";

export default class SystemUtils {
    static async displayMessage(msgType, msg) {
        LOGGER.trace("DisplayMessage | CSSystemUtils | Called.");
        const localizedMessage = game.i18n.localize(msg);
        switch (msgType) {
            case "warn":
                ui.notifications.warn(localizedMessage);
                break;
            case "error":
                ui.notifications.error(localizedMessage);
                break;
            case "notify":
                ui.notifications.notify(localizedMessage);
                break;
            default:
        }
    }

    // eslint-disable-next-line foundry-cpr/logger-after-function-definition
    static localize(string) {
        return game.i18n.localize(string);
    }

    // eslint-disable-next-line foundry-cpr/logger-after-function-definition
    static format(string, object) {
        return game.i18n.format(string, object);
    }
}
