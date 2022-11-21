export class CsCombatTracker extends CombatTracker {
    constructor(options) {
        super(options);
    }

    /** @inheritdoc */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "combat",
            template: "systems/chroniclesystem/templates/combat/combat-tracker.hbs",
            title: "Combat Tracker",
            scrollY: [".directory-list"]
        });
    }

    /** @inheritdoc */
    async getData(options) {
        const context = await super.getData(options);
    }
}
