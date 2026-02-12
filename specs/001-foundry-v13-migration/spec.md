# Feature Specification: Foundry VTT v13 Migration

**Feature Branch**: `001-foundry-v13-migration`
**Created**: 2026-02-12
**Status**: Draft
**Input**: Migrate the Chronicle System Foundry VTT module from v10 to v13 compatibility

## User Scenarios & Testing *(mandatory)*

### User Story 1 - System Loads on Foundry v13 (Priority: P1)

As a Game Master running Foundry VTT v13, I want the Chronicle System
to load without errors so that I can use the system to run my game sessions.

Currently the system is verified only for Foundry v10.290. When loaded on
v13, it fails to initialize because removed global functions
(`mergeObject`, `isNewerVersion`), removed dice term globals (`Die`,
`OperatorTerm`, `NumericTerm`), and the deprecated `template.json` data
model prevent the system from bootstrapping.

**Why this priority**: Without a functioning system load, no other
feature works. This is the foundational prerequisite for all other
stories.

**Independent Test**: Install the updated system in Foundry v13, create
a new world, and verify the system initializes without console errors.

**Acceptance Scenarios**:

1. **Given** Foundry VTT v13 with the updated Chronicle System installed,
   **When** a GM creates a new world using this system,
   **Then** the world loads without JavaScript errors in the console and
   the system name and version appear correctly.

2. **Given** Foundry VTT v13 with the updated system,
   **When** the GM opens the system settings panel,
   **Then** all registered system settings (debug logging, ASoIaF armor
   penalty mode, modifier dialog defaults) appear and are editable.

3. **Given** Foundry VTT v13 with the updated system,
   **When** the system initializes,
   **Then** all actor types (character, house, unit) and all item types
   (armor, weapon, ability, equipment, benefit, drawback, event, holding,
   technique, unitType) are registered and available for creation.

---

### User Story 2 - Character Data Persists Correctly (Priority: P2)

As a GM or player editing a character sheet, I want all changes I make
to persist correctly so that my character data is not lost when I reload
the page.

Currently, all update calls use the deprecated `"data."` path prefix
(~35 instances across 10 files). In Foundry v13 these updates silently
fail, meaning the user believes they saved but data reverts on reload.
This affects modifiers, penalties, wounds, injuries, fatigue, stress,
frustration, disposition, equipped states, and house resources.

**Why this priority**: Silent data loss is the most dangerous defect.
Users will not realize their changes are lost until after significant
gameplay has occurred.

**Independent Test**: Open a character sheet, modify a tracked value
(e.g., add a wound), reload the page, and verify the wound is still
present.

**Acceptance Scenarios**:

1. **Given** a character with 0 wounds,
   **When** the GM adds a wound via the character sheet and reloads the
   page,
   **Then** the wound persists after reload.

2. **Given** a character with a weapon in inventory,
   **When** the player equips the weapon to their main hand and reloads,
   **Then** the weapon remains equipped to the main hand after reload.

3. **Given** a character with abilities and specialties,
   **When** the player adds a new specialty to an ability and reloads,
   **Then** the specialty persists after reload.

4. **Given** a house actor with resource values,
   **When** the GM modifies a resource (e.g., Defense) and reloads,
   **Then** the resource value persists after reload.

5. **Given** a house actor with members,
   **When** the GM assigns a character as Head of house and reloads,
   **Then** the Head assignment persists after reload.

6. **Given** an item with qualities (weapon or armor),
   **When** the user adds or removes a quality and reloads,
   **Then** the quality list persists after reload.

---

### User Story 3 - Dice Rolls Function Correctly (Priority: P3)

As a player or GM making ability tests, combat rolls, or house fortune
rolls, I want dice rolls to produce correct results and display in chat
so that gameplay proceeds without interruption.

The dice API changed significantly: `Roll.evaluate({async: false})` was
removed (evaluate is always async now), and the dice term classes (`Die`,
`OperatorTerm`, `NumericTerm`) moved under `foundry.dice.terms`. The
current roll pipeline with manual term construction and `Roll.fromTerms`
must be updated.

**Why this priority**: Dice rolling is the core gameplay mechanic. A
non-functional roll system makes the game unplayable.

**Independent Test**: Open a character sheet, click a rollable ability,
verify the dice roll formula resolves correctly and the result appears
in chat.

**Acceptance Scenarios**:

1. **Given** a character with Fighting 4 (Axes specialty 2B),
   **When** the player clicks the Fighting:Axes roll button,
   **Then** a dice pool of 4d6 is rolled keeping the highest 4, with 2
   bonus dice added, the result displays in chat, and the math is correct.

2. **Given** a character making a roll with the modifier dialog open,
   **When** the player adjusts bonus dice and modifier values,
   **Then** the adjusted formula is applied correctly and the result
   displays in chat.

3. **Given** a house with a Head and Steward assigned,
   **When** the GM clicks the Fortune roll button,
   **Then** the house fortune dice pool is rolled correctly and the result
   appears in chat.

4. **Given** a house with an event being added,
   **When** the event contains formulas for resource modifiers,
   **Then** the formulas evaluate correctly and the event modifiers are
   applied to the house resources.

---

### User Story 4 - Embedded Document Lifecycle Works (Priority: P4)

As a player equipping armor or weapons, I want the system to
automatically apply and remove modifiers (armor penalty, bulk, combat
defense adjustments) so that my character's derived stats remain
accurate.

The embedded document lifecycle hooks
(`_onCreateEmbeddedDocuments`, `_onUpdateEmbeddedDocuments`,
`_onDeleteEmbeddedDocuments`) changed signatures between v10 and v13.
The current 5-parameter override pattern may no longer be called.

**Why this priority**: Automatic modifier management is a core system
mechanic that differentiates this from a simple data sheet. Without it,
GMs must manually track all modifier math.

**Independent Test**: Add armor to a character, equip it, verify combat
defense and movement penalties apply, then unequip and verify they are
removed.

**Acceptance Scenarios**:

1. **Given** a character with no armor,
   **When** the player adds and equips plate armor (rating 8, penalty 4,
   bulk 3),
   **Then** the armor rating modifier is applied, the agility penalty
   is set, and bulk is added to movement calculation.

2. **Given** a character wearing plate armor,
   **When** the player unequips the armor,
   **Then** all modifiers from the armor are removed and derived stats
   recalculate.

3. **Given** a character with an ability item,
   **When** the ability is added to the character,
   **Then** `onObtained()` is called and any associated modifiers are
   registered.

4. **Given** a character with an ability item,
   **When** the ability is removed from the character,
   **Then** `onDiscardedFromActor()` is called and associated modifiers
   are removed.

---

### User Story 5 - Existing v10 World Data Loads in v13 (Priority: P5)

As a GM with an existing campaign world created in Foundry v10, I want
my world data to load correctly in v13 without corruption so that I can
continue my campaign without starting over.

The new TypeDataModel classes must use the same schema structure as the
current `template.json` so that persisted data maps correctly to the new
model. No world data migration should be necessary if the schema is
preserved.

**Why this priority**: Existing users will not adopt v13 if it means
losing their campaign data. Backward data compatibility is essential for
user retention.

**Independent Test**: Export a world from Foundry v10 with the current
system, import it into Foundry v13 with the updated system, and verify
all actors, items, and their data are intact.

**Acceptance Scenarios**:

1. **Given** a v10 world with characters containing abilities, weapons,
   armor, and derived stats,
   **When** the world is opened in Foundry v13,
   **Then** all character data loads correctly with no missing or
   corrupted values.

2. **Given** a v10 world with house actors containing resources, members,
   and historical events,
   **When** the world is opened in Foundry v13,
   **Then** all house data loads correctly including member references
   and event modifiers.

3. **Given** a v10 world with various item types in actor inventories,
   **When** the world is opened in Foundry v13,
   **Then** all items retain their type-specific data (weapon specialties,
   armor qualities, technique works, holding features, etc.).

---

### User Story 6 - Sheets Render and Are Interactive (Priority: P6)

As a GM or player, I want all actor and item sheets to open, display
data correctly, and respond to interactions so that I can manage my
game content through the UI.

The Application v1 framework (`ActorSheet`, `ItemSheet`) is deprecated
in v13 but still functional. Sheets will continue to work with
deprecation warnings. Full migration to ApplicationV2 is deferred to a
follow-up effort.

**Why this priority**: Sheets are the primary user interface. While
Application v1 sheets still render in v13 (with warnings), all
interactive elements must function correctly with the updated data
paths and APIs.

**Independent Test**: Open each type of actor sheet and item sheet,
verify all tabs render, all interactive elements (buttons, checkboxes,
dropdowns) respond, and data changes persist.

**Acceptance Scenarios**:

1. **Given** a character actor,
   **When** the player opens the character sheet,
   **Then** all tabs (abilities, combat, intrigue, possessions, bio,
   sorcery) render correctly with the character's data.

2. **Given** a house actor,
   **When** the GM opens the house sheet,
   **Then** all tabs (resources, members, history) render correctly and
   resource editing dialogs function.

3. **Given** each item type (armor, weapon, ability, equipment, benefit,
   drawback, event, holding, technique, unitType),
   **When** the GM opens the item sheet,
   **Then** the sheet renders with correct data and all interactive
   controls work.

4. **Given** a character sheet with enriched text fields (personal
   history, descriptions),
   **When** the sheet renders,
   **Then** rich text content displays as formatted HTML, not as
   `[object Promise]` or raw text.

---

### Edge Cases

- What happens when a user opens a world that was last saved with a
  v10-era system version and no migration has run? The migration system
  must handle the version check correctly using `foundry.utils.isNewerVersion`.
- What happens when a poison item exists in a v10 world (type exists in
  template.json but has no registered constructor)? The system must not
  crash; it should fall back gracefully.
- What happens when a character's `removeModifier` or `removePenalty` is
  called? The pre-existing `indexOf` bug (should be `findIndex`) causes
  the wrong modifier to be removed. This must be fixed during migration.
- What happens when combat is initiated and the initiative dialog
  renders? The Dialog class must still function or be replaced.
- What happens when `game.actors.tokens` is accessed in chat processing?
  The tokens property structure may have changed in v13.

## Requirements *(mandatory)*

### Functional Requirements

**Phase 1 - System Loading:**

- **FR-001**: System MUST replace all bare global `mergeObject()` calls
  with `foundry.utils.mergeObject()` (4 sheet files).
- **FR-002**: System MUST replace the bare global `isNewerVersion()` call
  with `foundry.utils.isNewerVersion()` in the migration module.
- **FR-003**: System MUST update dice term references (`Die`,
  `OperatorTerm`, `NumericTerm`) to use `foundry.dice.terms.*` namespace.
- **FR-004**: System MUST convert all `Roll.evaluate({async: false})`
  calls to `await Roll.evaluate()` and make calling functions async.
- **FR-005**: System MUST replace `template.json` with TypeDataModel
  classes for all actor types (character, house, unit) and all item types
  (armor, weapon, ability, equipment, benefit, drawback, event, holding,
  technique, unitType), preserving the identical schema structure.
- **FR-006**: System MUST update `system.json` with v13 compatibility
  range and move `gridDistance`/`gridUnits` to `grid.distance`/`grid.units`.

**Phase 2 - Data Persistence:**

- **FR-007**: System MUST replace all `"data."` prefixed update paths
  with `"system."` across all JavaScript files (~35 instances in 10
  files).
- **FR-008**: System MUST replace `name="data.*"` form input attributes
  with `name="system.*"` in all Handlebars templates.
- **FR-009**: System MUST fix `data.data.*` double-path references to
  use `system.*` in dialog templates and sheet code.
- **FR-010**: System MUST replace `item.data._id` with `item.id` in
  actor sheet code.
- **FR-011**: System MUST replace `item.isOwned` with `item.isEmbedded`
  in the item creation hook.

**Phase 3 - API Compatibility:**

- **FR-012**: System MUST update embedded document lifecycle hooks
  (`_onCreateEmbeddedDocuments`, `_onUpdateEmbeddedDocuments`,
  `_onDeleteEmbeddedDocuments`) to use v13-compatible signatures or
  equivalent Hook-based patterns.
- **FR-013**: System MUST replace `getEmbeddedCollection("Item").filter()`
  with `this.items.filter()` or `.contents.filter()`.
- **FR-014**: System MUST register TypeDataModel classes via
  `CONFIG.Actor.dataModels` / `CONFIG.Item.dataModels` for schema
  validation. The existing Proxy-based factory constructor pattern
  (`actorConstructor.js`, `itemConstructor.js`) is retained for
  document class routing (type-specific Actor/Item behavior).
- **FR-015**: System MUST convert the synchronous `TextEditor.enrichHTML`
  Handlebars helper to an async-compatible pattern (pre-enrich in
  `getData()`).

**Bug Fixes (during migration):**

- **FR-016**: System MUST fix the `indexOf()` bug in
  `removeModifier`/`removePenalty` (csCharacterActor.js) by replacing
  with `findIndex()`.
- **FR-017**: System MUST either register the `poison` item type in
  `itemConstructor.js` or remove it from the data model definition.
- **FR-018**: System MUST add the `unit` actor type and `unitType` item
  type to the data model definitions.

### Key Entities

- **Actor: Character**: Playable character with abilities, derived stats
  (combat defense, intrigue defense, health, composure, movement),
  equipment, modifiers/penalties, wounds/injuries, sorcery.
- **Actor: House**: Noble house with 7 resources (Defense, Influence,
  Lands, Law, Population, Power, Wealth), members (head, steward, heirs,
  family, retainers, servants), historical events, holdings.
- **Actor: Unit**: Military unit with training, discipline, equipment,
  and unit type configuration.
- **Item: Weapon**: Specialty binding, damage formula, qualities, equip
  state (none/main/off/both).
- **Item: Armor**: Rating, penalty, bulk, qualities, equip state.
- **Item: Ability**: Rating, modifier, specialties list.
- **Item: Event**: Resource modifier formulas, player choice options.
- **Item: Holding**: Investment, resource binding, features, fortune
  dice/modifier.
- **Item: Technique**: Sorcerous arts, works, learning difficulty.
- **Item: Equipment/Benefit/Drawback**: Basic items with descriptions
  and type-specific attributes.
- **Item: UnitType**: Configuration for military unit types.

## Assumptions

- **Foundry v13 still supports Application v1 sheets** (ActorSheet,
  ItemSheet) with deprecation warnings. Full migration to ApplicationV2
  is deferred.
- **Foundry v13 still supports the legacy Dialog class** with
  deprecation warnings. Migration to DialogV2 is deferred.
- **jQuery remains available** in Foundry v13 for backward compatibility.
  jQuery-to-native-DOM migration is deferred.
- **TypeDataModel classes that mirror the exact template.json structure**
  will load existing world data without a data migration step.
- **The system will NOT support dual v10/v13 compatibility.** This is a
  clean break; the `compatibility.minimum` will be set to v13.
- **Global functions `renderTemplate` and `loadTemplates`** remain
  available in v13 (possibly deprecated). Namespacing is deferred.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The system loads on Foundry v13 with zero JavaScript
  errors in the browser console during initialization.
- **SC-002**: All 6 user stories pass their acceptance scenarios when
  manually tested on Foundry v13.
- **SC-003**: A world created in Foundry v10 with the current system
  version opens in Foundry v13 with the updated system and all actor/item
  data is intact (verified by spot-checking 5 representative actors and
  10 representative items).
- **SC-004**: All interactive sheet controls (ability rolls, equipment
  toggling, wound tracking, house resource editing, member assignment)
  function correctly and persist changes across page reloads.
- **SC-005**: The `npm run lint` command passes with zero errors after
  all migration changes are applied.
- **SC-006**: No deprecation warnings appear in the console related to
  removed APIs (only warnings for deferred items like Application v1,
  Dialog v1, and jQuery are acceptable).
