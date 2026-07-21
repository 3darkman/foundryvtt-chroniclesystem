export const preloadHandlebarsTemplates = async function () {
  const templatePaths = [
    // spec 019 — unified item sheet field-control components (invoked via
    // `{{> "…"}}` inside the shared parts + per-type Sistema bodies). The skeleton
    // parts (parts/header.hbs, parts/details.hbs) and the per-type system/<type>.hbs
    // bodies are AppV2 PARTS, auto-loaded by the mixin — not registered here.
    "systems/chroniclesystem/templates/items/components/field-cell.hbs",
    "systems/chroniclesystem/templates/items/components/rich-text-field.hbs",
    "systems/chroniclesystem/templates/items/components/repeatable-list.hbs",
    "systems/chroniclesystem/templates/items/components/works-card.hbs",
    "systems/chroniclesystem/templates/items/components/quality-refs.hbs",
    "systems/chroniclesystem/templates/items/components/quality-range.hbs",

    "systems/chroniclesystem/templates/actors/characters/public-character-sheet.hbs",

    "systems/chroniclesystem/templates/actors/partials/tabs/abilities-tab.hbs",
    "systems/chroniclesystem/templates/actors/partials/tabs/combat-and-intrigue-tab.hbs",
    "systems/chroniclesystem/templates/actors/partials/tabs/qualities-tab.hbs",
    "systems/chroniclesystem/templates/actors/partials/tabs/sorcery-tab.hbs",
    "systems/chroniclesystem/templates/actors/partials/tabs/equipments-tab.hbs",
    "systems/chroniclesystem/templates/actors/partials/tabs/description-tab.hbs",
    "systems/chroniclesystem/templates/actors/partials/tabs/relationships-tab.hbs",
    "systems/chroniclesystem/templates/actors/partials/cs-sheet-icons.hbs",
    "systems/chroniclesystem/templates/actors/partials/pub-eye.hbs",
    "systems/chroniclesystem/templates/actors/partials/pub-eye-inline.hbs",
    "systems/chroniclesystem/templates/actors/partials/tabs/resources-tab.hbs",
    "systems/chroniclesystem/templates/actors/partials/tabs/events-tab.hbs",
    "systems/chroniclesystem/templates/actors/partials/tabs/members-tab.hbs",
    "systems/chroniclesystem/templates/actors/partials/tabs/holdings-tab.hbs",

    "systems/chroniclesystem/templates/components/cs-eye-icons.hbs",
    "systems/chroniclesystem/templates/components/effects-tab.hbs",
    "systems/chroniclesystem/templates/components/rating-checkbox.hbs",
    "systems/chroniclesystem/templates/components/rollable-chip.hbs",
    "systems/chroniclesystem/templates/components/stat-row.hbs",
    "systems/chroniclesystem/templates/components/house-resource-item.hbs",
    "systems/chroniclesystem/templates/components/member-list-item.hbs",
    "systems/chroniclesystem/templates/components/resource-holdings.hbs",

    // Coat of Arms editor (spec 013) — window + partials.
    "systems/chroniclesystem/templates/apps/coat-of-arms-editor.hbs",
    "systems/chroniclesystem/templates/apps/partials/coa-preview.hbs",
    "systems/chroniclesystem/templates/apps/partials/coa-layers.hbs",
    "systems/chroniclesystem/templates/apps/partials/coa-import.hbs",
    "systems/chroniclesystem/templates/apps/partials/coa-inspector.hbs",
    "systems/chroniclesystem/templates/apps/partials/coa-tincture.hbs",
    "systems/chroniclesystem/templates/apps/partials/coa-inspector-shield.hbs",
    "systems/chroniclesystem/templates/apps/partials/coa-inspector-field.hbs",
    "systems/chroniclesystem/templates/apps/partials/coa-inspector-division.hbs",
    "systems/chroniclesystem/templates/apps/partials/coa-inspector-ordinary.hbs",
    "systems/chroniclesystem/templates/apps/partials/coa-inspector-charge.hbs",
    "systems/chroniclesystem/templates/apps/partials/coa-charge-catalog.hbs",
    "systems/chroniclesystem/templates/apps/partials/coa-footer.hbs",
  ];
  await foundry.applications.handlebars.loadTemplates(templatePaths);

  // Register form-group partial under its full path only.
  // Using loadTemplates would also register it under the short name "form-group",
  // which collides with Foundry's built-in partial used by Scene Config and other core dialogs.
  const fgPath =
    "systems/chroniclesystem/templates/actors/partials/form-group.hbs";
  const fgResp = await fetch(fgPath);
  const fgText = await fgResp.text();
  Handlebars.registerPartial(fgPath, Handlebars.compile(fgText));
};
