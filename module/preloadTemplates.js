export const preloadHandlebarsTemplates = async function () {
    const templatePaths = [
        'systems/chroniclesystem/templates/items/partials/header.html',
        'systems/chroniclesystem/templates/items/partials/header-delete.html',
        'systems/chroniclesystem/templates/items/partials/description.html',
        'systems/chroniclesystem/templates/items/partials/physical-item.html',
        'systems/chroniclesystem/templates/actors/partials/abilities-tab.html',
        'systems/chroniclesystem/templates/actors/partials/qualities-tab.html',
    ];
    return loadTemplates(templatePaths);
};