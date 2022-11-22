import {CSConstants} from "../system/csConstants.js";

export default class LOGGER {
    static log(msg) {
        console.log(`CS LOG | ${msg}`);
    }

    static debug(msg) {
        if (game.settings.get(CSConstants.Settings.SYSTEM_NAME, CSConstants.Settings.DEBUG_LOGS)) {
            console.debug(`CS dbg | ${msg}`);
            if (typeof msg === "object" && msg !== null) {
                console.log(msg);
            }
        }
    }

    static debugObject(obj) {
        if (game.settings.get(CSConstants.Settings.SYSTEM_NAME, CSConstants.Settings.DEBUG_LOGS)) {
            console.debug(obj);
        }
    }

    static warn(msg) {
        console.warn(`CS WRN | ${msg}`);
    }

    static trace(msg) {
        if (game.settings.get(CSConstants.Settings.SYSTEM_NAME, CSConstants.Settings.TRACE_LOGS)) {
            console.log(`CS TRC | ${msg}`);
        }
    }

    static error(msg) {
        console.error(`CS ERR | ${msg}`);
    }

    static credits() {
        console.log("SPECIAL THANKS TO MOO MAN FOR HIS PATIENCE AND HELP!");
    }
}
