#Change Log

## 0.4.2

### Fixed
- the combat and intrigue tab fields are not retaining the values.

## 0.4.1

### Fixed
- error removing the head of the house.

## 0.4.0

### Added
- glory field to character sheet
- a new function to dice rolls through macros, see the readme to more information.

### Changed
- update character sheet to Foundry V10
- dice roll that previously applied the dice penalty before the roll was made, instead of applying it when calculating how many dice are kept.
- shows a notification if the test resulting dice pool is less than 1.

### Fixed
- adding member to house sheet
- the system ignored all modifiers and penalties when the ability did not exist on the sheet.
- the system gave an error when rolls a specialty test that had no value on the sheet.

## 0.3.0

### Added

- Sorcery Techniques Sheet
- Character's Sorcery Tab
- Settings option to use ASoIaf Armor Penalty rules instead
- Ability's Specialties can be added to World's Abilities Item now 

### Changed
- little code refactoring to clarity

### Fixed
- Changes to Character's Height accept alphanumeric characters 

## 0.2.0

### Added

- House Sheet and your dependencies:
  - Holding Sheets
  - Event Sheets

### Changed

- Added an initially implemented localization to House Sheet and others sheets (not finished)
- Refactoring in the current code to make it more reusable.

### Fixes
 
- Fix a bug with the checkboxes of the settings screen 

## 0.1.5

### Fixes

- A small fix for a bug that occurred when adding a weapon without a correct damage formula for a character.

## 0.1.4

### Fixes

- Fixed a bug where the character sheet would not open.

## 0.1.3

### Changes

- Changes to Project Title, to adding the "Unofficial" text

## 0.1.2

### Fixes

- Fixes some bugs with character sheet fields: ancestries, age and gender

## 0.1.1

### Fixes

- Little fix to weapons, in which when adding a weapon with no specialty or damage (or with wrong formulas) the character sheet crashed.

## 0.1.0

### Added

- An initially functional character sheet.
- Functionals Item Sheets
  - Weapon Sheet
  - Armor Sheet
  - Basic Equipment Sheet
  - Ability Sheet
  - Benefit Sheet
  - Drawback Sheet