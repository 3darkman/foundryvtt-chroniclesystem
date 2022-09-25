import LOGGER from "./logger.js";
import SystemUtils from "./systemUtils.js";

/**
 * This code is heavily borrowed from the Burning Wheel system module. The jist
 * is to provide a Proxy object (this a native thing in JavaScript) whenever an actor
 * object is created with a sheet. We associate the Proxy object to CONFIG.Actor.documentClass
 * in the top-level cpr.js, which allows us to have custom classes underneath for each actor
 * type.
 *
 * Beware, a lot of this code is inspected (loaded) when Foundry is initializing, so any code
 * that depends on basic things like system settings will not work. During that time they do
 * not exist yet.
 *
 * @param {} entities - a mapping of actor types to classes
 * @param {*} baseClass - the basic Actor class from Foundry we put the Proxy in front of
 * @returns - a Proxy object with interceptions routing to the desired actor class
 */
export default function factory(entities, baseClass) {
    return new Proxy(baseClass, {
        construct: (target, args) => {
            const [data, options] = args;
            const constructor = entities[data.type];
            if (!constructor) {
                // emit error
                const error = `${SystemUtils.localize("CS.messages.unsupportedEntityError")}: ${data.type}`;
                SystemUtils.displayMessage("error", error);
                throw new Error(error);
            }
            return new constructor(data, options);
        },
        get: (target, prop) => {
            switch (prop) {
                case "create":
                    // Calling the class' create() static function
                    return (data, options) => {
                        const constructor = entities[data.type];
                        if (!constructor) {
                            const error = `${SystemUtils.localize("CS.messages.unsupportedEntityError")}: ${data.type}`;
                            SystemUtils.displayMessage("error", error);
                            throw new Error(error);
                        }
                        return constructor.create(data, options);
                    };
                case Symbol.hasInstance:
                    // Applying the "instanceof" operator on the instance object
                    return (instance) => {
                        const constr = entities[instance.type];
                        if (!constr) {
                            return false;
                        }
                        return instance instanceof constr;
                    };
                default:
                    // Just forward any requested properties to the base Actor class
                    return baseClass[prop];
            }
        },
    });
}