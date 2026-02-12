# Implementation Plan: Foundry VTT v13 Migration

**Branch**: `001-foundry-v13-migration` | **Date**: 2026-02-12 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-foundry-v13-migration/spec.md`

## Summary

Migrate the Chronicle System from Foundry VTT v10 to v13 compatibility.
The migration replaces removed global functions with namespaced equivalents,
introduces TypeDataModel classes to replace `template.json` as the data
schema authority, fixes ~35 silent data-loss paths (`"data."` to `"system."`),
updates embedded document lifecycle hook signatures, and converts
synchronous dice/enrichHTML calls to async. Phase 3 modernization
(ApplicationV2, DialogV2, jQuery removal) is explicitly deferred.

## Technical Context

**Language/Version**: JavaScript ES Modules (ES2020+, no TypeScript)
**Primary Dependencies**: Foundry VTT v13 built-ins (no external runtime
dependencies). Dev: ESLint, Prettier, Husky.
**Storage**: Foundry VTT document model (NeDB/LevelDB managed by Foundry)
**Testing**: Manual testing only (no automated test framework). Verification
via `quickstart.md` testing guide.
**Target Platform**: Browser (Foundry VTT v13 client). Chromium-based
browsers primarily.
**Project Type**: Foundry VTT system module (single project, no build step)
**Performance Goals**: Zero additional latency. System must load and render
sheets as fast as or faster than v10 baseline.
**Constraints**: Zero runtime dependencies. Clean break from v10 (no dual
compatibility). Existing world data must load without migration.
**Scale/Scope**: ~40 JS files, ~40 HBS/HTML templates, 3 actor types,
10 item types. Estimated ~35 `"data."` path replacements, ~15 global
function replacements, 14 new TypeDataModel classes, 6 lifecycle hook
signature updates.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Check

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Clean Code** | PASS | Migration fixes pre-existing bugs (indexOf vs findIndex). New TypeDataModel classes follow single-responsibility. No dead code introduced. |
| **II. SSOT** | VIOLATION (justified) | Constitution declares `template.json` as sole authority for data schemas. Migration replaces this with TypeDataModel classes registered via `CONFIG.Actor.dataModels` / `CONFIG.Item.dataModels`. This is a necessary evolution: TypeDataModel IS the v13 canonical SSOT mechanism. Constitution amendment required post-migration. |
| **III. DRY** | PASS | Shared field definitions (`physicalItemFields`, `equipmentItemFields`, `itemDescriptionFields`) eliminate duplication across item TypeDataModel classes. Actor class hierarchy preserved. |
| **IV. Clean Architecture** | PASS (with addition) | Constitution mandates the factory pattern — factory Proxy is retained for document class routing. CONFIG.Actor.dataModels is added alongside it for schema validation. Both coexist: factory handles behavior, dataModels handle schema. Constitution amendment needed to document the dual-registration pattern. |
| **V. Internationalization** | PASS | No new user-facing strings without localization keys. All existing i18n patterns preserved. |

### Post-Design Check

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Clean Code** | PASS | TypeDataModel classes are self-documenting with explicit `defineSchema()`. Magic strings replaced with field definitions. |
| **II. SSOT** | PASS (with amendment) | TypeDataModel classes become the new SSOT for data schemas. `template.json` retained as fallback only during transition. New SSOT: `module/data/` directory. |
| **III. DRY** | PASS | `fields.js` provides shared field factories. No schema duplication between TypeDataModel and template.json (identical structures). |
| **IV. Clean Architecture** | PASS (with amendment) | Layer separation preserved: Data layer moves from `template.json` to `module/data/`. Domain layer (`module/actors/`, `module/items/`) unchanged. Presentation layer unchanged. System layer (`config.js`) adds CONFIG.dataModels registration alongside existing factory Proxy. |
| **V. Internationalization** | PASS | No changes to i18n approach. |

**Required Constitution Amendments** (post-migration):
1. Principle II: Replace `template.json` reference with `module/data/` TypeDataModel classes as SSOT for data schemas.
2. Principle IV: Document the dual-registration pattern — factory Proxy for document class routing + `CONFIG.Actor.dataModels` / `CONFIG.Item.dataModels` for schema validation.
3. Technology Constraints: Update compatibility from "v10+" to "v13+".
4. Development Workflow: Update migrations note — changes to TypeDataModel schemas (not template.json) require migrations.

## Project Structure

### Documentation (this feature)

```text
specs/001-foundry-v13-migration/
├── plan.md              # This file
├── research.md          # Verified v13 API findings (10 topics)
├── data-model.md        # TypeDataModel schema mapping (13 classes)
├── quickstart.md        # Manual testing guide (7 steps)
├── checklists/
│   └── requirements.md  # Spec quality checklist (all pass)
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
module/
├── actors/
│   ├── actorConstructor.js      # MODIFY: Add unit type to factory
│   │                            #   (keep Proxy for document routing)
│   ├── csActor.js               # MODIFY: "data." -> "system.",
│   │                            #   lifecycle hooks
│   ├── csCharacterActor.js      # MODIFY: "data." -> "system.",
│   │                            #   lifecycle hooks, indexOf bug fix
│   ├── csHouseActor.js          # MODIFY: "data." -> "system.",
│   │                            #   lifecycle hooks
│   └── sheets/
│       ├── csActorSheet.js      # MODIFY: item.data._id -> item.id
│       ├── csCharacterActorSheet.js  # MODIFY: mergeObject,
│       │                             #   "data." -> "system.",
│       │                             #   enrichHTML async
│       └── csHouseActorSheet.js      # MODIFY: mergeObject,
│                                     #   "data." -> "system.",
│                                     #   enrichHTML async, formData paths
├── data/                        # NEW DIRECTORY
│   ├── fields.js                # NEW: Shared field definitions
│   │                            #   (physicalItemFields,
│   │                            #   equipmentItemFields,
│   │                            #   itemDescriptionFields)
│   ├── actor/
│   │   ├── character-data.js    # NEW: CharacterData TypeDataModel
│   │   ├── house-data.js        # NEW: HouseData TypeDataModel
│   │   └── unit-data.js         # NEW: UnitData TypeDataModel
│   └── item/
│       ├── ability-data.js      # NEW: AbilityData TypeDataModel
│       ├── armor-data.js        # NEW: ArmorData TypeDataModel
│       ├── benefit-data.js      # NEW: BenefitData TypeDataModel
│       ├── drawback-data.js     # NEW: DrawbackData TypeDataModel
│       ├── equipment-data.js    # NEW: EquipmentData TypeDataModel
│       ├── event-data.js        # NEW: EventData TypeDataModel
│       ├── holding-data.js      # NEW: HoldingData TypeDataModel
│       ├── poison-data.js       # NEW: PoisonData TypeDataModel
│       ├── technique-data.js    # NEW: TechniqueData TypeDataModel
│       ├── unit-type-data.js    # NEW: UnitTypeData TypeDataModel
│       └── weapon-data.js       # NEW: WeaponData TypeDataModel
├── items/
│   ├── itemConstructor.js       # MODIFY: Add unitType + poison to
│   │                            #   factory (keep Proxy for routing)
│   ├── csItem.js                # MODIFY: "data." -> "system."
│   ├── csEventItem.js           # MODIFY: evaluate() async,
│   │                            #   "data." -> "system."
│   ├── csWeaponItem.js          # REVIEW: "data." paths
│   ├── csArmorItem.js           # REVIEW: "data." paths
│   ├── csAbilityItem.js         # REVIEW: "data." paths
│   ├── cs-holding-item.js       # REVIEW: "data." paths
│   ├── cs-technique-item.js     # REVIEW: "data." paths
│   └── sheets/
│       ├── csItemSheet.js       # MODIFY: enrichHTML async
│       └── (other sheets)       # REVIEW: "data." paths
├── rolls/
│   └── cs-roll.js               # MODIFY: Die/OperatorTerm/NumericTerm
│                                #   -> foundry.dice.terms.*
├── dieroll.js                   # MODIFY: Die/OperatorTerm/NumericTerm
│                                #   -> foundry.dice.terms.*,
│                                #   evaluate() async
├── migrations/
│   └── migration.js             # MODIFY: isNewerVersion ->
│                                #   foundry.utils.isNewerVersion
├── system/
│   ├── config.js                # MODIFY: ADD CONFIG.Actor.dataModels +
│   │                            #   CONFIG.Item.dataModels alongside
│   │                            #   existing factory. Fix
│   │                            #   item.isOwned -> item.isEmbedded.
│   │                            #   Add unit/unitType sheet registration.
│   ├── handlebarsHelpers.js     # MODIFY: enrichHTML async pattern
│   ├── ChronicleSystem.js       # MODIFY: handleRollAsync() ensure
│   │                            #   async, "data." -> "system."
│   └── (settings.js, etc.)      # REVIEW
└── utils/
    └── factory.js               # KEEP (still needed for document
                                 #   class routing; CONFIG.dataModels
                                 #   handles schema only)

templates/
├── actors/
│   └── houses/
│       └── house-sheet.hbs      # MODIFY: name="data.*" ->
│                                #   name="system.*"
├── dialogs/
│   └── addingHouseEvent.html    # MODIFY: data.data.* ->
│                                #   system.* double-path fix
└── (all other templates)        # REVIEW for "data." references

system.json                      # MODIFY: compatibility range,
                                 #   grid.distance / grid.units
template.json                    # KEEP as fallback (no modifications)
```

**Structure Decision**: The existing module structure is preserved. A new
`module/data/` directory is added for TypeDataModel classes, following the
Foundry v13 convention. The factory Proxy (`module/utils/factory.js`) is
retained for document class routing (type-specific Actor/Item behavior).
`CONFIG.Actor.dataModels` / `CONFIG.Item.dataModels` registration is
added alongside the factory in `config.js` for schema validation. No
other structural changes.

## Complexity Tracking

> Constitution violations that must be justified:

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| SSOT: Replace `template.json` with TypeDataModel classes | `template.json` alone does not support schema validation, `prepareDerivedData` on models, or migration hooks. TypeDataModel is the v13 canonical approach. | Keeping template.json as sole SSOT works in v13 but misses DataModel benefits and will break in future Foundry versions. |
| Clean Architecture: Add CONFIG.dataModels alongside factory Proxy | The factory Proxy handles document class routing (type-specific behavior like prepareDerivedData, lifecycle hooks). CONFIG.Actor.dataModels handles schema validation (TypeDataModel). Both are needed: the factory cannot be removed without moving all type-specific behavior to TypeDataModel, which is a larger refactor deferred to a future release. | Removing the factory would require moving prepareDerivedData, addModifier, lifecycle hooks, etc. from Actor subclasses to TypeDataModel classes — too large for this migration scope. |
