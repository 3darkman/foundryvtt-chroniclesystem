export const preloadHandlebarsTemplates = async function () {
    const templatePaths = [
        'systems/chroniclesystem/templates/items/partials/header.html',
        'systems/chroniclesystem/templates/items/partials/header-delete.html',
        'systems/chroniclesystem/templates/items/partials/description.html',
        'systems/chroniclesystem/templates/items/partials/physical-item.html',
        'systems/chroniclesystem/templates/items/partials/equipment-item.html',
        'systems/chroniclesystem/templates/actors/partials/tabs/abilities-tab.html',
        'systems/chroniclesystem/templates/actors/partials/tabs/combat-and-intrigue-tab.html',
        'systems/chroniclesystem/templates/actors/partials/tabs/qualities-tab.html',
        'systems/chroniclesystem/templates/actors/partials/tabs/equipments-tab.html',
        'systems/chroniclesystem/templates/actors/partials/tabs/description-tab.html',
        'systems/chroniclesystem/templates/actors/partials/form-group.html',
        'systems/chroniclesystem/templates/components/rating-checkbox.html',
    ];
    return loadTemplates(templatePaths);
};
