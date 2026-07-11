/**
 * spec 012 — the single, ordered list of the eleven public-visibility keys
 * (FR-011). Imported by BOTH the public sheet (reader,
 * `csPublicCharacterSheet.js`) and the standard sheet's configure-public-sheet
 * UI (writer, `csCharacterActorSheet.js`) so the key set, its order, and its
 * labels live in exactly one place. The set mirrors the `publicVisibility`
 * SchemaField on `CharacterData` verbatim. Extending it (a twelfth key) requires
 * updating both consumers and `contracts/visibility-map.md`.
 *
 * `group` is the render group used for the FR-013 row-collapse derivation:
 *   - "header"   → house / position (character header meta line)
 *   - "identity" → identity block
 *   - "concept"  → concept block
 *   - "trait"    → mannerisms / features row
 *   - "history"  → personal history block
 *   - "bond"     → allies / enemies / oaths / motto row
 *
 * @typedef {Object} PublicVisibilityField
 * @property {string} key       the `system.publicVisibility.<key>` flag name
 * @property {string} labelKey  i18n key for the field's public-sheet label
 * @property {string} group     render group (see above)
 */

/** @type {ReadonlyArray<PublicVisibilityField>} */
export const PUBLIC_VISIBILITY_FIELDS = [
  {
    key: "house",
    labelKey: "CS.sheets.character.publicSheet.house",
    group: "header",
  },
  {
    key: "position",
    labelKey: "CS.sheets.character.publicSheet.position",
    group: "header",
  },
  {
    key: "identity",
    labelKey: "CS.sheets.character.publicSheet.identity",
    group: "identity",
  },
  {
    key: "concept",
    labelKey: "CS.sheets.character.publicSheet.concept",
    group: "concept",
  },
  {
    key: "mannerisms",
    labelKey: "CS.sheets.character.publicSheet.mannerisms",
    group: "trait",
  },
  {
    key: "features",
    labelKey: "CS.sheets.character.publicSheet.features",
    group: "trait",
  },
  {
    key: "history",
    labelKey: "CS.sheets.character.publicSheet.personalHistory",
    group: "history",
  },
  {
    key: "allies",
    labelKey: "CS.sheets.character.publicSheet.allies",
    group: "bond",
  },
  {
    key: "enemies",
    labelKey: "CS.sheets.character.publicSheet.enemies",
    group: "bond",
  },
  {
    key: "oaths",
    labelKey: "CS.sheets.character.publicSheet.oaths",
    group: "bond",
  },
  {
    key: "motto",
    labelKey: "CS.sheets.character.publicSheet.motto",
    group: "bond",
  },
];

/** The eleven keys only, in canonical order. */
export const PUBLIC_VISIBILITY_KEYS = PUBLIC_VISIBILITY_FIELDS.map(
  (f) => f.key
);
