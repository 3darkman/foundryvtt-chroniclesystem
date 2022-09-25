export const preloadHandlebarsTemplates = async function () {
    const templatePaths = [
        'systems/chroniclesystem/templates/items/partials/header.hbs',
        'systems/chroniclesystem/templates/items/partials/header-delete.hbs',
        'systems/chroniclesystem/templates/items/partials/description.hbs',
        'systems/chroniclesystem/templates/items/partials/physical-item.hbs',
        'systems/chroniclesystem/templates/items/partials/equipment-item.hbs',

        'systems/chroniclesystem/templates/items/tabs/technique-details-tab.hbs',
        'systems/chroniclesystem/templates/items/tabs/technique-works-tab.hbs',

        'systems/chroniclesystem/templates/actors/partials/tabs/abilities-tab.hbs',
        'systems/chroniclesystem/templates/actors/partials/tabs/combat-and-intrigue-tab.hbs',
        'systems/chroniclesystem/templates/actors/partials/tabs/qualities-tab.hbs',
        'systems/chroniclesystem/templates/actors/partials/tabs/sorcery-tab.hbs',
        'systems/chroniclesystem/templates/actors/partials/tabs/equipments-tab.hbs',
        'systems/chroniclesystem/templates/actors/partials/tabs/description-tab.hbs',
        'systems/chroniclesystem/templates/actors/partials/form-group.hbs',

        'systems/chroniclesystem/templates/actors/partials/tabs/resources-tab.hbs',
        'systems/chroniclesystem/templates/actors/partials/tabs/events-tab.hbs',
        'systems/chroniclesystem/templates/actors/partials/tabs/members-tab.hbs',
        'systems/chroniclesystem/templates/actors/partials/tabs/holdings-tab.hbs',

        'systems/chroniclesystem/templates/components/rating-checkbox.hbs',
        'systems/chroniclesystem/templates/components/house-resource-item.hbs',
        'systems/chroniclesystem/templates/components/member-list-item.hbs',
        'systems/chroniclesystem/templates/components/resource-holdings.hbs'
    ];
    return loadTemplates(templatePaths);
};
