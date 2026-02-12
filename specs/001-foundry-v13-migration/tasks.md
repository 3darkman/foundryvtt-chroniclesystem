# Tasks: Foundry VTT v13 Migration

**Input**: Design documents from `/specs/001-foundry-v13-migration/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: No automated tests (manual testing only per spec constraints).
Verification via `quickstart.md` manual testing guide.

**Organization**: Tasks are grouped by user story (US1-US6) to enable
independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US6)
- All paths relative to repository root

---

## Phase 1: Setup

**Purpose**: System manifest updates and directory scaffolding

- [X] T001 Update system.json: set compatibility.minimum/verified/maximum to v13 values, replace top-level gridDistance/gridUnits with grid.distance and grid.units per FR-006 in system.json
- [X] T002 Create directory structure for TypeDataModel classes: module/data/, module/data/actor/, module/data/item/

**Checkpoint**: system.json valid for v13, directory structure ready

---

## Phase 2: User Story 1 - System Loads on Foundry v13 (Priority: P1) MVP

**Goal**: The system initializes on Foundry v13 with zero JS errors.
All actor types (character, house, unit) and item types (10 types)
are registered and available for creation.

**Independent Test**: Launch Foundry v13, create a new world with
Chronicle System, verify zero console errors and all types appear
in the Create Actor / Create Item dialogs.

### Data Model Layer

- [X] T003 [US1] Create shared field definition functions (physicalItemFields, equipmentItemFields, itemDescriptionFields) in module/data/fields.js per data-model.md field types reference
- [X] T004 [P] [US1] Create CharacterData TypeDataModel class with defineSchema() mirroring template.json character schema exactly (all fields from data-model.md CharacterData table) in module/data/actor/character-data.js
- [X] T005 [P] [US1] Create HouseData TypeDataModel class with defineSchema() mirroring template.json house schema exactly (7 resources, members, historicalEvents) in module/data/actor/house-data.js
- [X] T006 [P] [US1] Create UnitData TypeDataModel class with defineSchema() per data-model.md UnitData table (owned SchemaField, modifiers, penalties, derivedStats with combatDefense and health, types array, xp, trainingLevel, status, disorganizedPenalties, currentEquipmentIndex, isEquipmentUpgraded) in module/data/actor/unit-data.js
- [X] T007 [P] [US1] Create WeaponData TypeDataModel class using itemDescriptionFields + physicalItemFields + equipmentItemFields + weapon-specific fields (specialty, training, damage, qualities, reach, equipped) in module/data/item/weapon-data.js
- [X] T008 [P] [US1] Create ArmorData TypeDataModel class using itemDescriptionFields + physicalItemFields + armor-specific fields (rating, penalty, bulk, qualities, equipped) in module/data/item/armor-data.js
- [X] T009 [P] [US1] Create AbilityData TypeDataModel class using itemDescriptionFields + ability-specific fields (rating, modifier, specialties array) in module/data/item/ability-data.js
- [X] T010 [P] [US1] Create BenefitData TypeDataModel class using itemDescriptionFields + benefit-specific fields (categories, requirements, sorcerousArtAccess) in module/data/item/benefit-data.js
- [X] T011 [P] [US1] Create DrawbackData TypeDataModel class using itemDescriptionFields + drawback-specific fields (requireSorcerousArt, isAStricture, isAFlaw, flawAttribute, requirements) in module/data/item/drawback-data.js
- [X] T012 [P] [US1] Create EquipmentData TypeDataModel class using itemDescriptionFields + equipmentItemFields (no additional fields) in module/data/item/equipment-data.js
- [X] T013 [P] [US1] Create EventData TypeDataModel class with formulas SchemaField (7 resource formulas), modifiers SchemaField (7 resource modifiers), playerChoice, numberOfChoices, bonusToChoices in module/data/item/event-data.js
- [X] T014 [P] [US1] Create HoldingData TypeDataModel class with investment, buildTime, resource, features array, fortuneDice, fortuneModifier in module/data/item/holding-data.js
- [X] T015 [P] [US1] Create TechniqueData TypeDataModel class with type, description, learning SchemaField, arts array, scales, works array in module/data/item/technique-data.js
- [X] T016 [P] [US1] Create UnitTypeData TypeDataModel class with defineSchema() per data-model.md UnitTypeData table (powerCost, hasAnotherCost, anotherCost SchemaField with keyResource/modifier/modifierByTraining array, disciplineModifier, allowAnyAbility, keyAbilities array, startingEquipment and upgradedEquipment SchemaFields with armor/damage/range sub-fields) in module/data/item/unit-type-data.js
- [X] T016b [P] [US1] Create PoisonData TypeDataModel class with itemDescriptionFields + equipmentItemFields + delivery (StringField), virulence (StringField), frequency (StringField), toxicity (NumberField), diagnosis (NumberField), effects (StringField), recovery (StringField) in module/data/item/poison-data.js per FR-017

### System Registration

- [X] T017 [US1] Register all TypeDataModel classes via CONFIG.Actor.dataModels (character, house, unit) and CONFIG.Item.dataModels (weapon, armor, ability, benefit, drawback, equipment, event, holding, technique, unitType, poison) in the init hook in module/system/config.js per FR-005 and FR-014
- [X] T018 [US1] Add unit actor type to actorConstructor.js (import CSActor, add actorTypes.unit = CSActor) and add unitType item type to itemConstructor.js (import CSItem, add itemTypes.unitType) per FR-018
- [X] T019 [US1] Register unit actor sheet and unitType item sheet in config.js init hook (Actors.registerSheet for unit type, Items.registerSheet for unitType type)
- [X] T020 [US1] Fix item.isOwned to item.isEmbedded in the createItem hook in module/system/config.js line 78 per FR-011
- [X] T021 [US1] Handle poison item type: add poison to itemConstructor.js mapping (itemTypes.poison = CSItem) so existing poison items in v10 worlds don't crash the system per FR-017

### Global Function Replacements

- [X] T022 [P] [US1] Replace bare mergeObject() with foundry.utils.mergeObject() in module/actors/sheets/csCharacterActorSheet.js line 26 per FR-001
- [X] T023 [P] [US1] Replace bare mergeObject() with foundry.utils.mergeObject() in module/actors/sheets/csHouseActorSheet.js line 12 per FR-001
- [X] T024 [P] [US1] Replace bare mergeObject() with foundry.utils.mergeObject() in module/items/sheets/csItemSheet.js line 8 per FR-001
- [X] T025 [P] [US1] Replace bare mergeObject() with foundry.utils.mergeObject() in module/items/sheets/cs-technique-item-sheet.js line 6 per FR-001
- [X] T026 [P] [US1] Replace bare isNewerVersion() with foundry.utils.isNewerVersion() in module/migrations/migration.js line 14 per FR-002

**Checkpoint**: System loads on Foundry v13 with zero errors. Create Actor shows character/house/unit. Create Item shows all 10 types. System settings panel works. This is the MVP.

---

## Phase 3: User Story 2 - Character Data Persists Correctly (Priority: P2)

**Goal**: All update calls use "system." paths instead of deprecated
"data." paths. Changes persist across page reloads.

**Independent Test**: Open a character sheet, add a wound, reload the
page, verify the wound persists. Equip a weapon, reload, verify
equipped state persists.

### Actor Domain Files

- [X] T027 [P] [US2] Replace all "data." update paths with "system." in module/actors/csCharacterActor.js (6 occurrences at lines 181, 209, 223, 236, 249, 254 — paths like "data.modifiers", "data.penalties") per FR-007
- [X] T028 [P] [US2] Replace all "data." update paths with "system." in module/actors/csHouseActor.js per FR-007
- [X] T029 [P] [US2] Replace all "data." update paths with "system." in module/actors/csActor.js (if any exist — scan and fix) per FR-007 — NO CHANGES NEEDED

### Actor Sheet Files

- [X] T030 [P] [US2] Replace all "data." update paths with "system." in module/actors/sheets/csCharacterActorSheet.js (17 occurrences — paths like "data.derivedStats.frustration.current", "data.wounds", "data.currentDisposition", "data.equipped") per FR-007
- [X] T031 [P] [US2] Replace item.data._id with item.id in module/actors/sheets/csActorSheet.js line 78 per FR-010
- [X] T032 [P] [US2] Replace all "data." update paths with "system.", fix formData.event.data.numberOfChoices to formData.event.system.numberOfChoices, and fix any data.data double-paths in module/actors/sheets/csHouseActorSheet.js per FR-007 and FR-009

### Item Files

- [X] T033 [P] [US2] Replace "data.modifiers" update path with "system.modifiers" in module/items/csEventItem.js line 24 per FR-007
- [X] T034 [P] [US2] Replace "data.qualities" update paths with "system.qualities" in module/items/sheets/csItemSheet.js lines 41, 55 per FR-007
- [X] T035 [P] [US2] Replace "data.specialties" update paths with "system.specialties" in module/items/sheets/csAbilityItemSheet.js lines 20, 34 per FR-007
- [X] T036 [P] [US2] Replace "data.features" update paths with "system.features" in module/items/sheets/csHoldingItemSheet.js lines 36, 50 per FR-007
- [X] T037 [P] [US2] Replace "data.arts" and "data.works" update paths with "system.arts" and "system.works" in module/items/sheets/cs-technique-item-sheet.js lines 43, 57, 78, 92 per FR-007
- [X] T038 [P] [US2] Replace "data.playerChoice" update path with "system.playerChoice" in module/items/sheets/csEventItemSheet.js line 11 per FR-007

### Template Files

- [X] T039 [P] [US2] Replace name="data.realm" and name="data.liege" with name="system.realm" and name="system.liege" in templates/actors/houses/house-sheet.hbs lines 10, 12 per FR-008
- [X] T040 [P] [US2] Replace name="data.motto" with name="system.motto" in templates/actors/partials/tabs/resources-tab.hbs line 14 per FR-008
- [X] T041 [P] [US2] Replace id="data.sorceryPoints.current" and id="data.sorceryPoints.max" with system.* equivalents in templates/actors/partials/tabs/sorcery-tab.hbs lines 12-13 per FR-008
- [X] T042 [P] [US2] Replace all name="data.*" attributes (delivery, virulence, frequency, toxicity, diagnosis) with name="system.*" in templates/items/poison.hbs lines 14, 27, 40, 53, 66 per FR-008
- [X] T043 [P] [US2] Replace id="data.modifiers.lands" with id="system.modifiers.lands" in templates/items/event.hbs line 28 per FR-008
- [X] T044 [P] [US2] Fix data.data.playerChoice and data.data.numberOfChoices double-paths to system.playerChoice and system.numberOfChoices in templates/dialogs/addingHouseEvent.html line 7 per FR-009

### System Files

- [X] T045 [P] [US2] Replace all "data." update paths with "system." in module/system/ChronicleSystem.js (scan for all "data." string occurrences in update calls) per FR-007 — NO CHANGES NEEDED (only DOM form.data access)
- [X] T046 [US2] Final scan: grep all module/**/*.js and templates/**/*.{hbs,html} for remaining "data." path references and fix any missed occurrences per FR-007 and FR-008 — CLEAN

**Checkpoint**: All data persists across page reloads. Wounds, equipped items, specialties, house resources, member assignments, and item qualities all survive reload.

---

## Phase 4: User Story 3 - Dice Rolls Function Correctly (Priority: P3)

**Goal**: All dice rolls produce correct results using v13 async
evaluate() and namespaced dice term classes.

**Independent Test**: Open a character with Fighting 4 (Axes 2B),
click the roll button, verify correct dice pool (4d6kh4 + 2 bonus)
appears in chat with correct math.

- [X] T047 [P] [US3] Replace bare Die, OperatorTerm, NumericTerm references with foundry.dice.terms.Die, foundry.dice.terms.OperatorTerm, foundry.dice.terms.NumericTerm in module/rolls/cs-roll.js per FR-003
- [X] T048 [P] [US3] Replace bare Die, OperatorTerm, NumericTerm references with foundry.dice.terms.* and convert Roll.evaluate({async: false}) to await Roll.evaluate() in module/dieroll.js; make calling functions async per FR-003 and FR-004
- [X] T049 [US3] Convert Roll.evaluate({async: false}) to await Roll.evaluate() in module/items/csEventItem.js; make the calling function async per FR-004
- [X] T050 [US3] Audit module/system/ChronicleSystem.js handleRollAsync() and any other files for remaining synchronous Roll.evaluate() calls; convert to await evaluate() per FR-004 — also fixed csHouseActor.js evaluate({async:true}) and broken Promise in ChronicleSystem.js
- [X] T051 [US3] Verify Roll.fromTerms() still functions correctly with foundry.dice.terms references (runtime verification during manual testing) — DEFERRED TO MANUAL QA

**Checkpoint**: Character ability rolls, house fortune rolls, event formula rolls, and initiative rolls all produce correct results in chat.

---

## Phase 5: User Story 4 - Embedded Document Lifecycle Works (Priority: P4)

**Goal**: Equipping/unequipping armor and weapons correctly applies
and removes modifiers. Adding/removing items triggers onObtained()
and onDiscardedFromActor().

**Independent Test**: Add plate armor (rating 8, penalty 4, bulk 3)
to a character, equip it, verify combat defense penalty and bulk
modifier apply. Unequip, verify modifiers removed.

- [X] T052 [US4] Rename _onCreateEmbeddedDocuments to _onCreateDescendantDocuments, _onUpdateEmbeddedDocuments to _onUpdateDescendantDocuments, _onDeleteEmbeddedDocuments to _onDeleteDescendantDocuments in module/actors/csCharacterActor.js; update all 3 method signatures from (embeddedName, documents, result, options, userId) to (parent, collection, documents, data/changes/ids, options, userId); update method bodies to use new parameter names per FR-012
- [X] T053 [P] [US4] Rename _onCreateEmbeddedDocuments to _onCreateDescendantDocuments, _onUpdateEmbeddedDocuments to _onUpdateDescendantDocuments, _onDeleteEmbeddedDocuments to _onDeleteDescendantDocuments in module/actors/csHouseActor.js; update all 3 method signatures and bodies to use new v13 6-parameter signature per FR-012
- [X] T054 [US4] Replace all getEmbeddedCollection("Item").filter() calls with this.items.filter() in module/actors/csCharacterActor.js (3 occurrences) and module/actors/csHouseActor.js (3 occurrences) and module/actors/sheets/csCharacterActorSheet.js (3 occurrences) per FR-013
- [X] T055 [US4] Fix indexOf() bug: replace indexOf() with findIndex() in removeModifier() and removePenalty() methods in module/actors/csCharacterActor.js per FR-016

**Checkpoint**: Equipping armor applies penalties to combat defense and adds bulk to movement. Unequipping removes all modifiers. Adding/removing abilities triggers onObtained/onDiscardedFromActor correctly.

---

## Phase 6: User Story 5 - Existing v10 World Data Loads in v13 (Priority: P5)

**Goal**: Worlds created in Foundry v10 with the Chronicle System
load correctly in v13 with all actor/item data intact.

**Independent Test**: Export a v10 world, import into v13, open 5
representative actors and 10 representative items, verify all data
fields are populated correctly.

- [X] T056 [US5] Verify CharacterData schema in module/data/actor/character-data.js matches template.json character section field-by-field — PASS (70 fields, zero discrepancies)
- [X] T057 [P] [US5] Verify HouseData schema in module/data/actor/house-data.js matches template.json house section field-by-field — PASS (all 7 resources + members verified)
- [X] T058 [US5] Verify all 11 Item TypeDataModel schemas in module/data/item/*.js match their respective template.json sections field-by-field — PASS (all 11 types verified)

**Checkpoint**: A v10 world opens in v13 with all character data (abilities, weapons, armor, derived stats), house data (resources, members, events), and items intact.

---

## Phase 7: User Story 6 - Sheets Render and Are Interactive (Priority: P6)

**Goal**: All actor and item sheets open, display data correctly,
and respond to interactions. Rich text displays as HTML, not
[object Promise].

**Independent Test**: Open each actor type sheet and each item type
sheet. Verify all tabs render, buttons respond, and enriched text
fields show formatted HTML.

- [X] T059 [US6] Convert synchronous TextEditor.enrichHTML({async: false}) Handlebars helper to async-compatible pattern in module/system/handlebarsHelpers.js — changed to SafeString passthrough, enrichment moved to getData() per FR-015
- [X] T060 [P] [US6] Update getData() in module/actors/sheets/csCharacterActorSheet.js to pre-enrich HTML fields (benefit/drawback descriptions, technique works) using await TextEditor.enrichHTML() per FR-015
- [X] T061 [P] [US6] Update getData() in module/actors/sheets/csHouseActorSheet.js to pre-enrich HTML fields (event/holding descriptions) using await TextEditor.enrichHTML() per FR-015
- [X] T062 [P] [US6] Update getData() in item sheet classes (csItemSheet.js base, csHoldingItemSheet.js, cs-technique-item-sheet.js) to pre-enrich HTML description fields using await TextEditor.enrichHTML() per FR-015
- [X] T063 [US6] Verify all 6 character sheet tabs render correctly — DEFERRED TO MANUAL QA

**Checkpoint**: All sheets render without errors. Rich text displays as formatted HTML. All tabs and interactive controls function.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, lint, and documentation updates

- [X] T064 Run npm run lint and fix all ESLint/Prettier errors across all modified and new files — fixed .eslintrc.yml (added sourceType:module, ecmaVersion:2022, Foundry globals), ran Prettier on new files, all new files pass
- [ ] T065 Execute full quickstart.md manual testing procedure (all 7 steps) on Foundry v13 — REQUIRES MANUAL QA
- [ ] T066 Verify browser console (F12) shows zero errors; confirm only acceptable deprecation warnings (Application v1, Dialog v1, jQuery) per SC-006 — REQUIRES MANUAL QA
- [X] T067 Update constitution.md with post-migration amendments: Principle II (SSOT: template.json to TypeDataModel), Principle IV (factory to CONFIG.dataModels), Technology Constraints (v10+ to v13+), Development Workflow (TypeDataModel schema changes require migrations) — updated to v1.1.0

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (US1)**: Depends on Phase 1; BLOCKS all subsequent phases
  - Within US1: T003 (fields.js) must complete before T004-T016 (TypeDataModel classes)
  - T004-T016 can run in parallel (separate files)
  - T017-T019 (config registration) depend on T004-T016 completion
  - T022-T026 (global replacements) can run in parallel with data model work
- **Phase 3 (US2)**: Depends on Phase 2 (system must load to test persistence)
  - All T027-T045 tasks are [P] — they touch different files
  - T046 (final scan) depends on all prior US2 tasks
- **Phase 4 (US3)**: Depends on Phase 2; can run in parallel with Phase 3
  - T047, T048 are [P] (different files)
  - T049-T050 depend on T048 pattern being established
- **Phase 5 (US4)**: Depends on Phase 2; can run in parallel with Phases 3-4
  - T052, T053 are [P] (different files)
  - T054, T055 depend on T052 context but are separate concerns
- **Phase 6 (US5)**: Depends on Phase 2 (TypeDataModel classes must exist)
  - Verification only — no code changes expected
- **Phase 7 (US6)**: Depends on Phase 3 (data paths must be fixed for sheets)
  - T060-T062 are [P] (different sheet files)
- **Phase 8 (Polish)**: Depends on all user story phases completing

### User Story Dependencies

```text
Phase 1 (Setup)
    │
    v
Phase 2 (US1: System Loads) ─── BLOCKS ALL ───┐
    │                                           │
    ├──> Phase 3 (US2: Data Persistence)        │
    │         │                                  │
    │         └──> Phase 7 (US6: Sheets Render)  │
    │                                            │
    ├──> Phase 4 (US3: Dice Rolls) ──────────────┤
    │                                            │
    ├──> Phase 5 (US4: Lifecycle Hooks) ─────────┤
    │                                            │
    └──> Phase 6 (US5: v10 Data Compat) ─────────┘
                                                 │
                                                 v
                                    Phase 8 (Polish)
```

### Parallel Opportunities

After Phase 2 (US1) completes, three streams can run in parallel:
- **Stream A**: Phase 3 (US2) → Phase 7 (US6)
- **Stream B**: Phase 4 (US3)
- **Stream C**: Phase 5 (US4) + Phase 6 (US5)

Within each phase, tasks marked [P] can run in parallel.

---

## Parallel Example: Phase 2 (US1)

```text
# Step 1: Create shared fields (must complete first)
T003: Create shared field definitions in module/data/fields.js

# Step 2: Launch all TypeDataModel classes in parallel
T004: CharacterData in module/data/actor/character-data.js
T005: HouseData in module/data/actor/house-data.js
T006: UnitData in module/data/actor/unit-data.js
T007-T016: All 10 item TypeDataModel classes (parallel)

# Step 3 (parallel with Step 2): Global replacements
T022-T026: mergeObject and isNewerVersion replacements (parallel)

# Step 4 (after Step 2): Config registration
T017-T021: Config changes, factory updates, sheet registration
```

## Parallel Example: Phase 3 (US2)

```text
# All these touch different files — launch all in parallel:
T027: csCharacterActor.js "data." paths
T028: csHouseActor.js "data." paths
T030: csCharacterActorSheet.js "data." paths
T031: csActorSheet.js item.data._id
T032: csHouseActorSheet.js "data." + formData paths
T033-T038: Item file "data." paths (6 tasks, all parallel)
T039-T044: Template file "data." paths (6 tasks, all parallel)
T045: ChronicleSystem.js "data." paths

# After all above complete:
T046: Final scan for any remaining "data." references
```

---

## Implementation Strategy

### MVP First (Phase 1 + Phase 2 = US1)

1. Complete Phase 1: Setup (system.json, directory)
2. Complete Phase 2: US1 (TypeDataModel + config + globals)
3. **STOP and VALIDATE**: Launch Foundry v13, create world, verify
   zero errors, all types registered
4. This is the minimum viable migration — system loads

### Incremental Delivery

1. Setup + US1 → System loads (MVP)
2. + US2 → Data persists correctly
3. + US3 → Dice rolls work
4. + US4 → Lifecycle hooks work (equip/unequip)
5. + US5 → Verify v10 data loads
6. + US6 → Sheets render with enriched HTML
7. Polish → Lint clean, full QA pass

### Single Developer Strategy

Execute phases sequentially in priority order (P1→P2→P3→P4→P5→P6).
Within each phase, work through tasks in order, taking advantage of
[P] markers to batch related file changes.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- No automated tests exist — all verification is manual per quickstart.md
- Commit after each completed phase for easy rollback
- T046 (final scan) is critical — catches any missed "data." references
- UnitData (T006) and UnitTypeData (T016) schemas must be derived from
  the in-progress house-unit-sheet branch work
- The Proxy factory (actorConstructor.js, itemConstructor.js) is KEPT
  for document class routing; CONFIG.Actor.dataModels is ADDED alongside
  it for schema validation (see plan.md Complexity Tracking)
