# Quickstart: Verifying v13 Migration

**Branch**: `001-foundry-v13-migration` | **Date**: 2026-02-12

## Prerequisites

- Foundry VTT v13 installed
- A test world (ideally exported from a v10 installation with existing
  character, house, and item data)

## Step 1: Install Updated System

Copy the system folder to:
`<FoundryData>/Data/systems/chroniclesystem/`

## Step 2: Create or Load World

1. Launch Foundry VTT v13
2. Create a new world using "Chronicle System (Unofficial)" OR
   import a v10 test world
3. Open the browser developer console (F12)
4. Verify: Zero JavaScript errors during world load

## Step 3: Verify System Registration

1. In the sidebar, click "Actors" > "Create Actor"
2. Verify all 3 actor types appear: Character, House, Unit
3. Click "Items" > "Create Item"
4. Verify all item types appear: armor, weapon, ability, equipment,
   benefit, drawback, event, holding, technique, unitType

## Step 4: Character Sheet Test

1. Create a new Character actor
2. Open the character sheet
3. Verify all 6 tabs render: Abilities, Combat & Intrigue, Possessions,
   Biography, Sorcery
4. Add an Ability item (e.g., "Fighting" rating 4)
5. Add a specialty to Fighting (e.g., "Axes" 2B)
6. Reload the page - verify ability and specialty persist
7. Add a Weapon, equip it to main hand - reload, verify equipped state
8. Add Armor, equip it - verify armor penalty applies to derived stats
9. Unequip armor - verify modifiers are removed
10. Click "Fighting:Axes" to roll - verify dice result in chat
11. Add a wound - reload, verify wound persists
12. Change disposition - reload, verify persistence

## Step 5: House Sheet Test

1. Create a new House actor
2. Open the house sheet
3. Edit realm and liege fields - reload, verify persistence
4. Click "Regenerate Starting Resources" - verify dice rolls and values
5. Add a Historical Event - verify dialog renders, formulas evaluate
6. Drag a character to the house - assign as Head - reload, verify
7. Add a Holding item - verify resource calculation

## Step 6: Dice Roll Test

1. Open a character with abilities
2. Click a rollable ability - verify chat message with correct formula
3. Hold Shift (or trigger modifier dialog) - adjust values - verify
4. Start a combat encounter - verify initiative dialog renders

## Step 7: Console Check

1. Open developer console (F12)
2. Filter for "error" and "warn"
3. Verify: Zero errors
4. Acceptable warnings: Application v1 deprecation, Dialog v1
   deprecation, jQuery deprecation
5. NOT acceptable: Any "data." path warnings, missing function errors,
   or TypeDataModel validation errors

## Success Criteria

All steps pass without errors. Data persists across reloads.
Dice rolls produce correct results. Existing v10 world data loads
correctly.
