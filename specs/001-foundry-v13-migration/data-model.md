# Data Model: Foundry VTT v13 Migration

**Branch**: `001-foundry-v13-migration` | **Date**: 2026-02-12

## Overview

This document defines the TypeDataModel class hierarchy that replaces
`template.json`. Each class mirrors the exact schema structure from
template.json to ensure backward data compatibility.

## Field Types Reference (from v13 source)

All fields are under `foundry.data.fields`:

| Field Type      | Usage                                |
|-----------------|--------------------------------------|
| `SchemaField`   | Nested object with defined sub-fields |
| `StringField`   | String values                        |
| `NumberField`   | Numeric values (int/float)           |
| `BooleanField`  | True/false values                    |
| `ArrayField`    | Ordered lists                        |
| `ObjectField`   | Freeform key-value objects           |

## Actor Data Models

### CharacterData (extends TypeDataModel)

Merges the `common` and `character-common` templates.

**Registration**: `CONFIG.Actor.dataModels.character = CharacterData`

| Field Path                         | Type          | Default    |
|------------------------------------|---------------|------------|
| `age`                              | NumberField   | `0`        |
| `destinyPoints.current`            | NumberField   | `0`        |
| `destinyPoints.max`                | NumberField   | `0`        |
| `sorceryPoints.current`            | NumberField   | `0`        |
| `sorceryPoints.max`                | NumberField   | `0`        |
| `derivedStats.intrigueDefense.*`   | SchemaField   | (value, modifier) |
| `derivedStats.composure.*`         | SchemaField   | (value, modifier, current) |
| `derivedStats.frustration.*`       | SchemaField   | (value, modifier, current) |
| `derivedStats.combatDefense.*`     | SchemaField   | (value, modifier) |
| `derivedStats.health.*`            | SchemaField   | (value, modifier, current) |
| `derivedStats.fatigue.*`           | SchemaField   | (value, modifier, current) |
| `derivedStats.armorRating.*`       | SchemaField   | (value, modifier) |
| `wounds`                           | ArrayField    | `[]`       |
| `injuries`                         | ArrayField    | `[]`       |
| `currentDisposition`               | NumberField   | `4`        |
| `modifiers`                        | ObjectField   | `{}`       |
| `penalties`                        | ObjectField   | `{}`       |
| `movement.base`                    | NumberField   | `4`        |
| `movement.runBonus`                | NumberField   | `0`        |
| `movement.sprintMultiplier`        | NumberField   | `4`        |
| `movement.bulk`                    | NumberField   | `0`        |
| `movement.modifier`                | NumberField   | `0`        |
| `movement.total`                   | NumberField   | `0`        |
| `movement.sprintTotal`             | NumberField   | `0`        |
| `ancestries`                       | ArrayField    | `[]`       |
| `gender`                           | StringField   | `""`       |
| `house`                            | StringField   | `""`       |
| `height`                           | StringField   | `"1.72"`   |
| `weight`                           | StringField   | `"70"`     |
| `eyeColor`                         | StringField   | `""`       |
| `hairColor`                        | StringField   | `""`       |
| `mannerisms`                       | StringField   | `""`       |
| `distinguishingFeatures`           | StringField   | `""`       |
| `personalHistory`                  | StringField   | `""`       |
| `owned`                            | SchemaField   | (nested arrays) |
| `currentStress`                    | NumberField   | `0`        |
| `allies`                           | StringField   | `""`       |
| `enemies`                          | StringField   | `""`       |
| `oaths`                            | StringField   | `""`       |
| `heraldry`                         | StringField   | `""`       |
| `portrait`                         | StringField   | `""`       |
| `motto`                            | StringField   | `""`       |
| `coins.coppers`                    | NumberField   | `0`        |
| `coins.silvers`                    | NumberField   | `0`        |
| `coins.golds`                      | NumberField   | `0`        |
| `glory`                            | NumberField   | `0`        |
| `vice`                             | StringField   | `""`       |
| `virtue`                           | StringField   | `""`       |
| `motivation`                       | StringField   | `""`       |
| `goal`                             | StringField   | `""`       |
| `experience.spent`                 | NumberField   | `0`        |
| `experience.total`                 | NumberField   | `0`        |

### HouseData (extends TypeDataModel)

**Registration**: `CONFIG.Actor.dataModels.house = HouseData`

| Field Path                         | Type          | Default    |
|------------------------------------|---------------|------------|
| `realm`                            | StringField   | `""`       |
| `liege`                            | StringField   | `""`       |
| `defense.startingValue`            | NumberField   | `0`        |
| `defense.description`              | StringField   | `""`       |
| `defense.total`                    | NumberField   | `0`        |
| `influence.*` (same pattern)       | SchemaField   | (same)     |
| `lands.*`                          | SchemaField   | (same)     |
| `law.*`                            | SchemaField   | (same)     |
| `population.*`                     | SchemaField   | (same)     |
| `power.*`                          | SchemaField   | (same)     |
| `wealth.*`                         | SchemaField   | (same)     |
| `historicalEvents`                 | ArrayField    | `[]`       |
| `motto`                            | StringField   | `""`       |
| `members.head`                     | StringField   | `""`       |
| `members.steward`                  | StringField   | `""`       |
| `members.heirs`                    | ArrayField    | `[]`       |
| `members.family`                   | ArrayField    | `[]`       |
| `members.retainers`               | ArrayField    | `[]`       |
| `members.servants`                 | ArrayField    | `[]`       |

### UnitData (extends TypeDataModel)

**Registration**: `CONFIG.Actor.dataModels.unit = UnitData`

Derived from the `house-unit-sheet` branch code
(`module/actors/cs-house-unit-actor.js`).

| Field Path                         | Type          | Default    |
|------------------------------------|---------------|------------|
| `owned.equipments`                 | ArrayField    | `[]`       |
| `owned.weapons`                    | ArrayField    | `[]`       |
| `owned.armors`                     | ArrayField    | `[]`       |
| `owned.qualities`                  | ArrayField    | `[]`       |
| `owned.drawbacks`                  | ArrayField    | `[]`       |
| `owned.abilities`                  | ArrayField    | `[]`       |
| `owned.powers`                     | ArrayField    | `[]`       |
| `owned.benefits`                   | ArrayField    | `[]`       |
| `modifiers`                        | ObjectField   | `{}`       |
| `penalties`                        | ObjectField   | `{}`       |
| `derivedStats.combatDefense.value` | NumberField   | `0`        |
| `derivedStats.combatDefense.modifier` | NumberField | `0`       |
| `derivedStats.health.total`        | NumberField   | `0`        |
| `derivedStats.health.modifier`     | NumberField   | `0`        |
| `derivedStats.health.value`        | NumberField   | `0`        |
| `derivedStats.health.current`      | NumberField   | `0`        |
| `description`                      | StringField   | `""`       |
| `types`                            | ArrayField    | `[]`       |
| `currentEquipmentIndex`            | NumberField   | `0`        |
| `isEquipmentUpgraded`              | BooleanField  | `false`    |
| `xp.value`                         | NumberField   | `0`        |
| `xp.max`                           | NumberField   | `0`        |
| `trainingLevel.base`               | NumberField   | `0`        |
| `trainingLevel.modifier`           | NumberField   | `0`        |
| `status.current`                   | NumberField   | `0`        |
| `disorganizedPenalties`            | NumberField   | `0`        |

## Item Data Models

### Common Patterns (template inheritance via class mixins)

Instead of template.json's `"templates": ["physicalItem"]` pattern,
use shared schema definition functions:

```text
physicalItemFields() -> { weight: NumberField }
equipmentItemFields() -> { quantity: NumberField, cost: StringField }
itemDescriptionFields() -> { description: StringField, type: StringField }
```

### WeaponData

**Registration**: `CONFIG.Item.dataModels.weapon = WeaponData`
**Includes**: itemDescriptionFields, physicalItemFields, equipmentItemFields

| Field          | Type          | Default  |
|----------------|---------------|----------|
| `specialty`    | StringField   | `""`     |
| `training`     | NumberField   | `0`      |
| `damage`       | StringField   | `""`     |
| `qualities`    | ArrayField    | `[]`     |
| `reach`        | StringField   | `""`     |
| `equipped`     | NumberField   | `0`      |

### ArmorData

**Registration**: `CONFIG.Item.dataModels.armor = ArmorData`
**Includes**: itemDescriptionFields, physicalItemFields

| Field          | Type          | Default  |
|----------------|---------------|----------|
| `rating`       | NumberField   | `0`      |
| `penalty`      | NumberField   | `0`      |
| `bulk`         | NumberField   | `0`      |
| `qualities`    | ArrayField    | `[]`     |
| `equipped`     | NumberField   | `0`      |

### AbilityData

**Registration**: `CONFIG.Item.dataModels.ability = AbilityData`
**Includes**: itemDescriptionFields

| Field          | Type          | Default  |
|----------------|---------------|----------|
| `rating`       | NumberField   | `2`      |
| `modifier`     | NumberField   | `0`      |
| `specialties`  | ArrayField    | `[]`     |

### BenefitData

**Registration**: `CONFIG.Item.dataModels.benefit = BenefitData`
**Includes**: itemDescriptionFields

| Field              | Type          | Default  |
|--------------------|---------------|----------|
| `categories`       | StringField   | `""`     |
| `requirements`     | StringField   | `""`     |
| `sorcerousArtAccess` | BooleanField | `false` |

### DrawbackData

**Registration**: `CONFIG.Item.dataModels.drawback = DrawbackData`
**Includes**: itemDescriptionFields

| Field               | Type          | Default  |
|---------------------|---------------|----------|
| `requireSorcerousArt` | BooleanField | `false` |
| `isAStricture`      | BooleanField  | `false`  |
| `isAFlaw`           | BooleanField  | `false`  |
| `flawAttribute`     | StringField   | `""`     |
| `requirements`      | StringField   | `""`     |

### EquipmentData

**Registration**: `CONFIG.Item.dataModels.equipment = EquipmentData`
**Includes**: itemDescriptionFields, equipmentItemFields

No additional fields.

### PoisonData

**Registration**: `CONFIG.Item.dataModels.poison = PoisonData`
**Includes**: itemDescriptionFields, equipmentItemFields

| Field          | Type          | Default  |
|----------------|---------------|----------|
| `delivery`     | StringField   | `""`     |
| `virulence`    | StringField   | `""`     |
| `frequency`    | StringField   | `""`     |
| `toxicity`     | NumberField   | `0`      |
| `diagnosis`    | NumberField   | `0`      |
| `effects`      | StringField   | `""`     |
| `recovery`     | StringField   | `""`     |

### EventData

**Registration**: `CONFIG.Item.dataModels.event = EventData`

| Field                    | Type          | Default  |
|--------------------------|---------------|----------|
| `description`            | StringField   | `""`     |
| `formulas.defense`       | StringField   | `""`     |
| `formulas.influence`     | StringField   | `""`     |
| `formulas.lands`         | StringField   | `""`     |
| `formulas.law`           | StringField   | `""`     |
| `formulas.population`    | StringField   | `""`     |
| `formulas.power`         | StringField   | `""`     |
| `formulas.wealth`        | StringField   | `""`     |
| `modifiers.defense`      | NumberField   | `0`      |
| `modifiers.influence`    | NumberField   | `0`      |
| `modifiers.lands`        | NumberField   | `0`      |
| `modifiers.law`          | NumberField   | `0`      |
| `modifiers.population`   | NumberField   | `0`      |
| `modifiers.power`        | NumberField   | `0`      |
| `modifiers.wealth`       | NumberField   | `0`      |
| `playerChoice`           | BooleanField  | `false`  |
| `numberOfChoices`        | NumberField   | `0`      |
| `bonusToChoices`         | StringField   | `""`     |

### HoldingData

**Registration**: `CONFIG.Item.dataModels.holding = HoldingData`

| Field             | Type          | Default  |
|-------------------|---------------|----------|
| `description`     | StringField   | `""`     |
| `investment`      | NumberField   | `0`      |
| `buildTime`       | StringField   | `""`     |
| `resource`        | StringField   | `""`     |
| `features`        | ArrayField    | `[]`     |
| `fortuneDice`     | StringField   | `""`     |
| `fortuneModifier` | NumberField   | `0`      |

### TechniqueData

**Registration**: `CONFIG.Item.dataModels.technique = TechniqueData`

| Field                  | Type          | Default  |
|------------------------|---------------|----------|
| `type`                 | StringField   | `""`     |
| `description`          | StringField   | `""`     |
| `learning.time`        | StringField   | `""`     |
| `learning.difficult`   | NumberField   | `9`      |
| `arts`                 | ArrayField    | `[]`     |
| `scales`               | StringField   | `""`     |
| `works`                | ArrayField    | `[]`     |

### UnitTypeData

**Registration**: `CONFIG.Item.dataModels.unitType = UnitTypeData`

Derived from the `house-unit-sheet` branch code
(`module/items/cs-house-unit-type-item.js`).

| Field Path                                      | Type          | Default  |
|-------------------------------------------------|---------------|----------|
| `description`                                   | StringField   | `""`     |
| `powerCost`                                     | NumberField   | `0`      |
| `hasAnotherCost`                                | BooleanField  | `false`  |
| `anotherCost.keyResource`                       | StringField   | `""`     |
| `anotherCost.modifier`                          | NumberField   | `0`      |
| `anotherCost.hasModifierByTraining`             | BooleanField  | `false`  |
| `anotherCost.modifierByTraining`                | ArrayField    | `[4 entries]` |
| `anotherCost.modifierByTraining[].training`     | StringField   | (localized key) |
| `anotherCost.modifierByTraining[].modifier`     | NumberField   | `0`      |
| `disciplineModifier`                            | NumberField   | `0`      |
| `allowAnyAbility`                               | BooleanField  | `false`  |
| `keyAbilities`                                  | ArrayField    | `["","",""]` |
| `startingEquipment.armor.rating`                | NumberField   | `0`      |
| `startingEquipment.armor.penalty`               | NumberField   | `0`      |
| `startingEquipment.armor.bulk`                  | NumberField   | `0`      |
| `startingEquipment.fightingDamage`              | StringField   | `""`     |
| `startingEquipment.marksmanshipDamage`          | StringField   | `""`     |
| `startingEquipment.isCloseRange`                | BooleanField  | `false`  |
| `startingEquipment.isLongRange`                 | BooleanField  | `false`  |
| `upgradedEquipment.armor.rating`                | NumberField   | `0`      |
| `upgradedEquipment.armor.penalty`               | NumberField   | `0`      |
| `upgradedEquipment.armor.bulk`                  | NumberField   | `0`      |
| `upgradedEquipment.fightingDamage`              | StringField   | `""`     |
| `upgradedEquipment.marksmanshipDamage`          | StringField   | `""`     |
| `upgradedEquipment.isCloseRange`                | BooleanField  | `false`  |
| `upgradedEquipment.isLongRange`                 | BooleanField  | `false`  |

## File Structure for Data Models

```text
module/data/
├── actor/
│   ├── character-data.js    # CharacterData extends TypeDataModel
│   ├── house-data.js        # HouseData extends TypeDataModel
│   └── unit-data.js         # UnitData extends TypeDataModel
├── item/
│   ├── weapon-data.js       # WeaponData extends TypeDataModel
│   ├── armor-data.js        # ArmorData extends TypeDataModel
│   ├── ability-data.js      # AbilityData extends TypeDataModel
│   ├── benefit-data.js      # BenefitData extends TypeDataModel
│   ├── drawback-data.js     # DrawbackData extends TypeDataModel
│   ├── equipment-data.js    # EquipmentData extends TypeDataModel
│   ├── event-data.js        # EventData extends TypeDataModel
│   ├── holding-data.js      # HoldingData extends TypeDataModel
│   ├── poison-data.js       # PoisonData extends TypeDataModel
│   ├── technique-data.js    # TechniqueData extends TypeDataModel
│   └── unit-type-data.js    # UnitTypeData extends TypeDataModel
└── fields.js                # Shared field definitions (physicalItem,
                             # equipmentItem, itemDescription)
```

## Migration Notes

- No world data migration is needed if schema structures are preserved
  exactly as in template.json.
- template.json is kept alongside DataModel classes during transition
  as a safety fallback.
- After confirming v13 compatibility, template.json can be removed in
  a future release.
