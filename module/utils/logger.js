export default class LOGGER {
    static log(msg) {
        console.log(`CS LOG | ${msg}`);
    }

    static debug(msg) {
        if (game.settings.get("chroniclesystem", "debugLogs")) {
            console.debug(`CS DBG | ${msg}`);
            if (typeof msg === "object" && msg !== null) {
                console.log(msg);
            }
        }
    }

    static debugObject(obj) {
        if (game.settings.get("chroniclesystem", "debugLogs")) {
            console.debug(obj);
        }
    }

    static warn(msg) {
        console.warn(`CS WRN | ${msg}`);
    }

    static trace(msg) {
        if (game.settings.get("chroniclesystem", "traceLogs")) {
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
