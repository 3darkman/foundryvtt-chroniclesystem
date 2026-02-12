# Research: Foundry VTT v13 Migration

**Branch**: `001-foundry-v13-migration` | **Date**: 2026-02-12

All findings verified against the actual Foundry v13 source at:
`c:\Program Files\Foundry Virtual Tabletop\resources\app\public\scripts\foundry.mjs`

## 1. template.json Support in v13

**Decision**: template.json is STILL SUPPORTED in v13 as a fallback.
TypeDataModel classes registered via `CONFIG.Actor.dataModels` are the
preferred approach, but template.json continues to work.

**Evidence** (line 11002):
```js
// Use the defined template.json
const template = game?.model[this.documentName]?.[type] || {};
```

**Rationale**: We can adopt TypeDataModel incrementally. However, since
the Proxy factory pattern must be replaced anyway, and DataModel classes
are the canonical v13 approach, we will implement TypeDataModel for all
types and keep template.json as a safety fallback during transition.

**Alternatives considered**:
- Keep template.json only: Works but misses DataModel benefits (schema
  validation, `prepareDerivedData` on the model, migration hooks).
- Remove template.json immediately: Risky without testing. Better to
  keep as fallback.

## 2. CONFIG.Actor.dataModels Registration

**Decision**: Register via `CONFIG.Actor.dataModels` and
`CONFIG.Item.dataModels` in the `init` hook.

**Evidence** (lines 55286-55290, official example in source):
```js
Hooks.on("init", () => {
  Object.assign(CONFIG.Actor.dataModels, {
    "my-module.sidekick": SidekickModel,
    "my-module.villain": VillainModel
  });
});
```

And lookup (line 10982):
```js
return globalThis.CONFIG?.[this.documentName]?.dataModels?.[type] ?? null;
```

## 3. Embedded Document Lifecycle Hooks

**Decision**: The v10 methods `_onCreateEmbeddedDocuments`,
`_onUpdateEmbeddedDocuments`, `_onDeleteEmbeddedDocuments` have been
RENAMED to `_onCreateDescendantDocuments`,
`_onUpdateDescendantDocuments`, `_onDeleteDescendantDocuments` with a
DIFFERENT signature.

**Evidence** - v13 Actor class (lines 41807-41835):
```js
_onCreateDescendantDocuments(parent, collection, documents, data,
                             options, userId)
_onUpdateDescendantDocuments(parent, collection, documents, changes,
                             options, userId)
_onDeleteDescendantDocuments(parent, collection, documents, ids,
                             options, userId)
```

**Key difference**: The v10 signature was
`(embeddedName, documents, result, options, userId)`.
The v13 signature is
`(parent, collection, documents, data/changes/ids, options, userId)`.
- `parent` is the parent document (the Actor)
- `collection` is the collection name string (e.g., "Item")
- `documents` are the actual document instances
- 4th param differs: `data` for create, `changes` for update, `ids`
  for delete

## 4. Roll.evaluate() API

**Decision**: `evaluate()` is always async. Passing `{async: ...}`
produces a deprecation warning but does NOT throw.

**Evidence** (lines 30487-30500):
```js
async evaluate({minimize=false, maximize=false, allowStrings=false,
                allowInteractive=true, ...options}={}) {
  // ...
  if ( "async" in options ) {
    foundry.utils.logCompatibilityWarning(
      "The async option for Roll#evaluate has been removed. "
      + "Use Roll#evaluateSync for synchronous roll evaluation.");
  }
}
```

**Note**: v13 provides `Roll#evaluateSync` as an alternative for
synchronous evaluation. However, we will convert all calls to
`await evaluate()` for consistency.

## 5. Dice Term Classes

**Decision**: `Die`, `OperatorTerm`, `NumericTerm` are still defined as
classes in v13. They exist in the source as top-level classes.
`Roll.fromTerms()` still works and internally references
`foundry.dice.terms.OperatorTerm`.

**Evidence**:
- `class Die extends DiceTerm` (line 162377)
- `class NumericTerm extends RollTerm` (line 163037)
- `class OperatorTerm extends RollTerm` (line 163094)
- `Roll.fromTerms` (line 31320) uses `foundry.dice.terms.OperatorTerm`

**Decision**: We will reference these via `foundry.dice.terms.*` to be
safe, and verify at runtime if they remain as globals.

## 6. Application v1 (ActorSheet, ItemSheet, Dialog)

**Decision**: ALL v1 classes still exist in v13 and are functional.

**Evidence**:
- `class ActorSheet extends DocumentSheet` (line 117415)
- `class Dialog extends Application` (line 117093)

**Rationale**: We can defer ApplicationV2 migration. The v1 sheets will
work with deprecation warnings. This keeps the migration scope manageable.

## 7. TextEditor.enrichHTML

**Decision**: Always async. No `async` option.

**Evidence** (line 31513):
```js
static async enrichHTML(content, options={}) {
```

Options accepted: `{secrets, documents, links, embeds, rolls, custom, rollData}`
No `async` parameter.

## 8. Item.isOwned

**Decision**: Still exists as a getter that delegates to `isEmbedded`.

**Evidence** (line 45164):
```js
get isOwned() {
  return this.isEmbedded;
}
```

It still works but is a compatibility shim. We will migrate to
`isEmbedded` for clarity.

## 9. Grid Configuration

**Decision**: v13 reads grid config from `game.system.grid.distance`
and `game.system.grid.units`.

**Evidence** (lines 21009-21011):
```js
distance: new NumberField({...,
  initial: () => game.system.grid.distance}),
units: new StringField({required: true,
  initial: () => game.system.grid.units})
```

The system.json must provide `grid.distance` and `grid.units` instead
of the old top-level `gridDistance` and `gridUnits` fields.

## 10. Global Functions (mergeObject, isNewerVersion)

**Decision**: Need to verify at runtime if globals still exist. The v13
source uses `foundry.utils.mergeObject` internally (e.g., ActorSheet
line 117419). We will replace all bare globals with the namespaced
versions regardless.

**Alternatives considered**:
- Keep globals and hope they exist: Too risky.
- Use namespaced versions everywhere: Safe and future-proof.
