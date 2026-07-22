/**
 * Passive values — the pure layer (spec 023).
 *
 * A passive value is the static score equivalent of a rolled test: what a
 * character achieves without rolling. It is DERIVED on demand from the
 * EFFECTIVE test formula and never stored (FR-003).
 *
 * This module is deliberately dependency-free (numbers/strings/arrays in,
 * numbers/strings/arrays out) so it is Vitest-testable and can never take part
 * in an eval-time import cycle — the same discipline `cs-conflict.js` and
 * `cs-slugify.js` follow.
 */

/** Each test die is worth this much on the passive scale (FR-001). */
export const PASSIVE_PER_DIE = 4;

/**
 * The system floors every test at ONE die: no matter how many penalty dice pile
 * up, an ability is never rolled with less than `1d6` — the same floor
 * `DiceRollFormula.ToFormattedStr` applies to the chip the player reads. The
 * passive mirrors it, so the sheet's number and the chip beside it can never
 * disagree (FR-005/006a).
 */
export const MIN_TEST_DICE = 1;

/** Coerce anything to a finite number, defaulting to 0 (C1.4). */
function num(value) {
  return Number(value) || 0;
}

/**
 * Convert an EFFECTIVE test formula into its passive value (FR-001/005/006).
 *
 * `reRoll` is deliberately never read: re-rolling ones is a dice behaviour with
 * no static equivalent.
 *
 * The die count is floored at {@link MIN_TEST_DICE} before being weighed, so
 * penalties that would take the pool to 0 or below still leave the one die the
 * system always rolls. A MISSING formula is not a test at all and yields `0`.
 *
 * @param {{pool: number, bonusDice: number, dicePenalty: number, modifier: number}} formula
 *   the effective formula (base capacity + every always-on channel)
 * @param {number} [passiveBonus] total of the `cs.passive.*` channel for this trait
 * @returns {number} integer ≥ 0
 */
export function passiveFromFormula(formula, passiveBonus = 0) {
  if (formula === null || formula === undefined) return 0;
  const dice = Math.max(
    num(formula.pool) - num(formula.dicePenalty),
    MIN_TEST_DICE
  );
  const raw =
    PASSIVE_PER_DIE * dice +
    num(formula.bonusDice) +
    num(formula.modifier) +
    num(passiveBonus);
  return Math.max(0, raw);
}

/* ==========================================================================
   The grouped difficulty selector (spec 023 US2, contract passive-options.md)
   ========================================================================== */

/** Key prefixes of the two FIXED groups — they keep their authored order and
 *  are never sorted among the ability groups (C4.2). */
const FIXED_GROUP_IDS = ["tbl", "def"];

/**
 * The group an option belongs to, derived from its stable key. Deriving it
 * (rather than grouping by display name) is what lets two abilities with the
 * SAME name on the same actor survive as DISTINCT groups — they carry
 * different item ids (D6, data-model §1.3 invariant 3).
 * @param {string} key
 * @returns {string}
 */
function groupIdOf(key) {
  const parts = String(key ?? "").split(":");
  if (FIXED_GROUP_IDS.includes(parts[0])) return parts[0];
  return `${parts[0]}:${parts[1] ?? ""}`;
}

/** True when the key addresses an ability itself rather than one of its
 *  specialties (`own:<id>` / `cat:<slug>`, i.e. no third segment). */
function isOwnOption(key) {
  return String(key ?? "").split(":").length === 2;
}

/**
 * The full display name carried to the dialog's big label and to the chat card
 * (C4.4): a defense or a difficulty level reads as itself; an ability reads as
 * its own name; a specialty reads as `<Ability>: <Specialty>`.
 */
function fullLabel(entry) {
  if (entry.kind === "specialty")
    return `${entry.groupLabel}: ${entry.shortLabel}`;
  if (entry.kind === "ability") return entry.groupLabel;
  return entry.shortLabel;
}

/**
 * Group, order, key and format the flat entry list into the `<optgroup>` shape
 * the roll dialog renders (contract C4). PURE — same input, same output.
 *
 * @param {Array<{kind: string, key: string, shortLabel: string, groupLabel: string,
 *   value: number, fromTarget: boolean, maskable: boolean, groupId?: string}>} entries
 *   in ASSEMBLY order: difficulty levels, then defenses, then abilities.
 *   `groupId` overrides the key-derived grouping — the catalogue uses it to file
 *   a `cat:*` specialty INSIDE the target's own `own:*` ability group (FR-014a)
 * @param {{showValues?: boolean}} [options] `showValues: false` hides the value
 *   of every `maskable` entry — and only those (FR-023a: a difficulty level is
 *   public information, so it keeps its number even while masking)
 * @returns {Array<{label: string, options: Array<object>}>}
 */
export function buildPassiveGroups(entries, { showValues = true } = {}) {
  const byGroup = new Map();
  for (const entry of entries ?? []) {
    const id = entry.groupId ?? groupIdOf(entry.key);
    if (!byGroup.has(id))
      byGroup.set(id, { id, label: entry.groupLabel, options: [] });
    byGroup.get(id).options.push({
      key: entry.key,
      shortLabel: entry.shortLabel,
      label: fullLabel(entry),
      optionText:
        showValues || !entry.maskable
          ? `${entry.shortLabel} · ${entry.value}`
          : entry.shortLabel,
      value: entry.value,
      group: entry.groupLabel,
      fromTarget: Boolean(entry.fromTarget),
      maskable: Boolean(entry.maskable),
    });
  }

  const groups = [...byGroup.values()];
  const fixed = groups.filter((g) => FIXED_GROUP_IDS.includes(g.id));
  const abilities = groups
    .filter((g) => !FIXED_GROUP_IDS.includes(g.id))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Fixed groups keep their authored order; ability groups sort alphabetically,
  // and inside each the ability's own option leads its specialties (C4.2/C4.3).
  for (const group of abilities) {
    group.options.sort((a, b) => {
      const aOwn = isOwnOption(a.key);
      const bOwn = isOwnOption(b.key);
      if (aOwn !== bOwn) return aOwn ? -1 : 1;
      return a.shortLabel.localeCompare(b.shortLabel);
    });
  }

  return [...fixed, ...abilities].map(({ label, options }) => ({
    label,
    // `shortLabel` was only a sort key — the rendered option carries the full
    // label and the pre-formatted option text.
    options: options.map(({ shortLabel, ...option }) => option), // eslint-disable-line no-unused-vars
  }));
}

/**
 * Flat lookup of one option by its stable key (contract C5). `null` for an
 * unknown or absent key — the caller reads that as "keep the pre-dialog
 * difficulty", which is what makes a token deleted mid-dialog harmless (D10).
 */
export function findPassiveOption(groups, key) {
  if (!key) return null;
  for (const group of groups ?? [])
    for (const option of group.options ?? [])
      if (option.key === key) return option;
  return null;
}

/**
 * Drop the itemized rows that belong to a passive OTHER than the selected one
 * (D9). Today only the target's size adjustment is scoped — it is a Combat
 * Defense modifier, already baked into `def:combat`'s value, so it must not
 * ride along when the player opposes an ability passive instead. Unscoped rows
 * always survive.
 * @param {Array<object>} rows
 * @param {string} selectedKey
 * @returns {Array<object>}
 */
export function filterPassiveScopedRows(rows, selectedKey) {
  return (rows ?? []).filter(
    (row) => !row?.passiveScope || row.passiveScope === selectedKey
  );
}

/**
 * Should this figure be hidden from this viewer (spec 023 US3, contract C4)?
 * Shared by the roll dialog and the chat-card render hook so the two can never
 * drift. A difficulty taken from the difficulty table is public and a GM always
 * sees everything, so both read `false` here.
 *
 * Masking is PRESENTATION-ONLY by explicit spec decision (FR-026/027): the
 * caller replaces displayed text, never a computed value.
 * @param {{isGM?: boolean, valuesVisible?: boolean, isPassiveDifficulty?: boolean}} params
 * @returns {boolean}
 */
export function shouldMaskPassive({
  isGM,
  valuesVisible,
  isPassiveDifficulty,
} = {}) {
  return Boolean(isPassiveDifficulty) && !valuesVisible && !isGM;
}
