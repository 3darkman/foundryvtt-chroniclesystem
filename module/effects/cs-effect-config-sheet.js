// Authoring UI for Active Effects (Wave 5, docs/ae-effect-model-design.md §3) —
// a real subclass of the core ActiveEffectConfig that replaces the raw
// key/value/mode change rows with a friendly CASCADE:
//
//     TYPE (channel) → TARGET (conditional subselect) → VALUE (fixed | derived |
//     quality-name)        + per-EFFECT optional?/condition flags.
//
// The cascade fields are SYNTHETIC (named `changes.<N>.*`, consumed only here);
// `_processFormData` rebuilds the real `system.changes` array from them via the
// pure row-model (cs-effect-row-model.js). Mirrors street-fighter's
// effect-sheet.mjs pattern, adapted to the v14 ActiveEffect schema (changes live
// in `system.changes` as `{key, type, value, phase}` — NOT a top-level `changes`
// array, NOT the numeric `mode`; confirmed against the v14.363 bundle).
//
// Registration is GUARDED (this must never brick the effect sheet): the class
// extends a dummy base when the V2 namespace is absent, and it is only registered
// on v14+ (where the `system.changes` shape exists). v13 keeps the core config
// plus the datalist enhancement (cs-active-effect-config.js).

import {
  EFFECT_CHANNELS,
  TARGET_KINDS,
  WEAPON_QUALITIES,
  WEAPON_QUALITY_GROUPS,
  slugify,
  weaponTypeSlug,
  weaponQualitySlug,
  weaponQualityTakesParam,
  isRollChannel,
  isWeaponChannel,
} from "./cs-effect-vocabulary.js";
import {
  CHANNEL_CHOICES,
  ROLL_TARGETKIND_CHOICES,
  WEAPON_TARGETKIND_CHOICES,
  DERIVED_STAT_CHOICES,
  VALUE_MODE_CHOICES,
  DERIVED_FORM_CHOICES,
  DISPOSITION_CHANNEL,
  DISPOSITION_FACET_CHOICES,
  INFLUENCE_SCOPE_CHOICES,
  TECHNIQUE_CHOICES,
  QUALITY_OTHER,
  ROLL_SLUG_CUSTOM,
  parseChangeRow,
  buildChangeFromRow,
} from "./cs-effect-row-model.js";
import { readChanges, foundryGeneration } from "./cs-effect-compat.js";
import { canUserModifyEffect } from "./cs-active-effect.js";
import {
  CANONICAL_ABILITIES,
  ABILITY_SLUGS,
  SPECIALTY_SLUGS,
  scopedSpecialtySlug,
} from "../vocabulary/cs-canonical-abilities.js";

/**
 * Grouped `<optgroup>` options for the roll-target dropdown (spec 008, FR-006):
 * the canonical abilities and their scoped specialties, from the SSOT vocabulary.
 * Plus an "In this world" group of the non-canonical (homebrew) slugs that
 * actually exist, so world-specific identities are pickable directly from the
 * dropdown (no datalist needed on the free-text field). The "Custom…" pick is
 * rendered separately by the template.
 * @param {string} selectedSlug the row's current rollSlug
 * @param {string[]} worldSlugs non-canonical ability/specialty slugs in the world
 */
function buildRollSlugOptionGroups(selectedSlug, worldSlugs = []) {
  const groups = [
    {
      label: game.i18n.localize("CS.effects.groups.abilities"),
      options: CANONICAL_ABILITIES.map((a) => ({
        value: a.slug,
        label: game.i18n.localize(a.nameKey),
        selected: a.slug === selectedSlug,
      })),
    },
    {
      label: game.i18n.localize("CS.effects.groups.specialties"),
      options: CANONICAL_ABILITIES.flatMap((a) =>
        a.specialties.map((s) => ({
          value: s.slug,
          label: game.i18n.localize(s.nameKey),
          selected: s.slug === selectedSlug,
        }))
      ),
    },
  ];
  if (worldSlugs.length) {
    groups.push({
      label: game.i18n.localize("CS.effects.groups.world"),
      options: worldSlugs.map((slug) => ({
        value: slug,
        label: slug,
        selected: slug === selectedSlug,
      })),
    });
  }
  return groups;
}

/**
 * Slug suggestions (datalist) — EVERY ability / specialty / weapon-type slug that
 * actually exists in the world: world-directory items AND items embedded on
 * actors (where most abilities live). Uses the persisted / scoped slugs, so the
 * "Custom…" field autocompletes to real identities. Free text stays allowed.
 */
function collectSlugSuggestions() {
  const abilities = new Set();
  const specialties = new Set();
  const weaponTypes = new Set();
  const addItem = (item) => {
    if (item.type === "ability") {
      const abilitySlug = item.system?.slug || slugify(item.name);
      if (abilitySlug) abilities.add(abilitySlug);
    } else if (item.type === "specialty") {
      // spec 024 — a specialty is its own item, carrying its own scoped slug.
      const s =
        item.system?.slug ||
        scopedSpecialtySlug(item.system?.abilitySlug ?? "", item.name);
      if (s) specialties.add(s);
    } else if (item.type === "weapon") {
      const s = weaponTypeSlug(item.system?.specialty);
      if (s) weaponTypes.add(s);
    }
  };
  for (const item of game.items ?? []) addItem(item);
  for (const actor of game.actors ?? []) {
    for (const item of actor.items ?? []) addItem(item);
  }
  return {
    abilitySlugs: [...abilities].sort(),
    specialtySlugs: [...specialties].sort(),
    weaponTypeSlugs: [...weaponTypes].sort(),
  };
}

/** Localized label for a canonical quality — falls back to the English game
 *  term when no i18n key is defined (so a missing entry never shows a raw key). */
function localizeQualityLabel(name) {
  const key = `CS.effects.weaponQualities.${weaponQualitySlug(name)}`;
  const localized = game.i18n.localize(key);
  return localized === key ? name : localized;
}

/**
 * Build the grouped `<optgroup>` options for the quality dropdown, marking the
 * one matching `selectedKind` (the "Other…" option is rendered separately). The
 * groups' order mirrors {@link WEAPON_QUALITY_GROUPS} (feudal, then gunpowder).
 * @param {string} selectedKind the row's current qualityKind
 */
function buildQualityOptionGroups(selectedKind) {
  const groups = [
    {
      key: WEAPON_QUALITY_GROUPS.FEUDAL,
      label: game.i18n.localize("CS.effects.authoring.qualityGroupFeudal"),
    },
    {
      key: WEAPON_QUALITY_GROUPS.GUNPOWDER,
      label: game.i18n.localize("CS.effects.authoring.qualityGroupGunpowder"),
    },
  ];
  return groups.map((group) => ({
    label: group.label,
    options: WEAPON_QUALITIES.filter((q) => q.group === group.key).map((q) => ({
      value: q.name,
      label: localizeQualityLabel(q.name),
      selected: q.name === selectedKind,
    })),
  }));
}

/* ---------------------------- the config sheet ---------------------------- */

// Dummy base when the V2 namespace is absent (v12 / namespace change) — the
// class still defines without throwing, and registration is guarded so it is
// never instantiated there. On v14 the real ActiveEffectConfig is the base.
const ActiveEffectConfigBase =
  foundry.applications?.sheets?.ActiveEffectConfig ?? class {};

export class CSActiveEffectConfig extends ActiveEffectConfigBase {
  /** @override — override header/details/duration/changes with the redesigned
   *  templates (US6); `...super.PARTS` preserves the `tabs` nav + the core footer.
   *  Order stays header → tabs → details → duration → changes → footer. */
  static PARTS = {
    ...super.PARTS,
    header: {
      template: "systems/chroniclesystem/templates/effects/effect-header.hbs",
    },
    details: {
      template: "systems/chroniclesystem/templates/effects/effect-details.hbs",
      scrollable: [""],
    },
    duration: {
      template: "systems/chroniclesystem/templates/effects/effect-duration.hbs",
    },
    changes: {
      template: "systems/chroniclesystem/templates/effects/effect-changes.hbs",
      // The fixed-height `.cs-changes-scroll` region scrolls internally (window stays
      // auto-sized); track its scroll position across re-renders.
      scrollable: [".cs-changes-scroll"],
    },
    footer: { template: "templates/generic/form-footer.hbs" },
  };

  /** @override */
  static DEFAULT_OPTIONS = {
    // Deliberately NOT "chroniclesystem": that class drags in the actor/item
    // sheet CSS (blue header, h1.charname, nav, form-group layout) which is
    // built for those sheets and badly breaks this core V2 ActiveEffectConfig
    // (overlapping header, vertical nav, unstyled fields, and the
    // `[data-application-part]{display:flex}` rule that stacked the tabs). With
    // only our own scope the core's clean effect layout shows through and our
    // cascade styling (.cs-effect-*) still applies. `cs-v2` pulls in the shared
    // design tokens/components (US6) so this window matches the character sheet.
    classes: ["cs-effect-config", "cs-v2"],
    // The handoff sizes the window at 660px; height stays auto (the Changes list
    // scrolls internally so many changes never push the footer off-screen).
    position: { width: 660, height: "auto" },
  };

  /** @override — fold the system permission rule into the core OWNER gate. */
  get isEditable() {
    return super.isEditable && canUserModifyEffect(game.user, this.document);
  }

  /** @override — inject the cascade data (changes) and the live meta (header).
   *  super._preparePartContext runs for EVERY part, so it populates
   *  `partContext.tab` for the tab parts (the idiomatic no-stacking fix, US6). */
  async _preparePartContext(partId, context) {
    const partContext = await super._preparePartContext(partId, context);
    if (partId === "header") {
      // The header MIRRORS the Optional/Condition flags authored in the Changes
      // tab, updated live by _onChangeForm (FR-030).
      partContext.effectOptional = !!this.document.getFlag(
        "chroniclesystem",
        "optional"
      );
      partContext.effectCondition =
        this.document.getFlag("chroniclesystem", "condition") ?? "";
      return partContext;
    }
    if (partId === "details") {
      // spec 021 (US7, D17/FR-020) — a QUALITY's effects are target-only condition
      // templates: render the transfer-to-actor control OFF + disabled (a disabled
      // input is not submitted, so it can never be turned on).
      partContext.qualityTransferLocked =
        this.document.parent?.type === "quality";
      return partContext;
    }
    if (partId !== "changes") return partContext;

    // Homebrew slugs present in the world (not already in the canonical dropdown),
    // offered as an "In this world" optgroup so the free-text field needs no
    // datalist (which rendered a misaligned browser arrow).
    const suggestions = collectSlugSuggestions();
    const canonicalSet = new Set([...ABILITY_SLUGS, ...SPECIALTY_SLUGS]);
    const worldSlugs = [
      ...new Set([...suggestions.abilitySlugs, ...suggestions.specialtySlugs]),
    ]
      .filter((slug) => !canonicalSet.has(slug))
      .sort();

    partContext.csChanges = readChanges(this.document).map((change, index) => {
      const row = parseChangeRow(change, index);
      // Attach the quality dropdown to EVERY row (not just quality ones): the
      // Type select toggles visibility live without a re-render, so the options
      // must already be in the DOM when a row is switched to "Grant weapon quality".
      row.qualityGroups = buildQualityOptionGroups(row.qualityKind);
      row.qualityOtherSelected = row.qualityKind === QUALITY_OTHER;
      // Roll-target dropdown: canonical vocabulary + world homebrew + "Custom…".
      row.rollSlugGroups = buildRollSlugOptionGroups(row.rollSlug, worldSlugs);
      row.rollSlugCustomSelected = row.rollSlug === ROLL_SLUG_CUSTOM;
      return row;
    });
    partContext.channelChoices = CHANNEL_CHOICES;
    partContext.qualityOtherValue = QUALITY_OTHER;
    partContext.rollSlugCustomValue = ROLL_SLUG_CUSTOM;
    partContext.rollTargetKindChoices = ROLL_TARGETKIND_CHOICES;
    partContext.weaponTargetKindChoices = WEAPON_TARGETKIND_CHOICES;
    partContext.derivedStatChoices = DERIVED_STAT_CHOICES;
    partContext.valueModeChoices = VALUE_MODE_CHOICES;
    partContext.derivedFormChoices = DERIVED_FORM_CHOICES;
    partContext.dispositionFacetChoices = DISPOSITION_FACET_CHOICES;
    partContext.influenceScopeChoices = INFLUENCE_SCOPE_CHOICES;
    partContext.techniqueChoices = TECHNIQUE_CHOICES;
    Object.assign(partContext, suggestions);
    partContext.effectOptional = !!this.document.getFlag(
      "chroniclesystem",
      "optional"
    );
    partContext.effectCondition =
      this.document.getFlag("chroniclesystem", "condition") ?? "";
    return partContext;
  }

  /** @override — live cascade: toggle the dependent sub-fields without submitting. */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    const target = event?.target;
    if (
      target?.matches?.(
        "select.cs-channel, select.cs-roll-targetkind, select.cs-roll-slug-select, select.cs-weapon-targetkind, select.cs-value-mode, select.cs-quality-kind, select.cs-influence-scope"
      )
    ) {
      const row = target.closest("li.cs-change");
      if (row) this._syncRowVisibility(row);
    }
    // Live header meta (US6/FR-030): the Optional/Condition flags authored in the
    // Changes tab are mirrored in the header without a re-render.
    if (
      target?.name === "flags.chroniclesystem.optional" ||
      target?.name === "flags.chroniclesystem.condition"
    ) {
      this._updateHeaderMeta();
    }
  }

  /** Mirror the current Optional/Condition flags into the header meta line. */
  _updateHeaderMeta() {
    const form = this.element;
    if (!form) return;
    const optional = !!form.querySelector(
      'input[name="flags.chroniclesystem.optional"]'
    )?.checked;
    const condition =
      form
        .querySelector('input[name="flags.chroniclesystem.condition"]')
        ?.value?.trim() ?? "";
    const optSpan = form.querySelector(".cs-effect-optional-meta");
    if (optSpan) {
      optSpan.textContent = game.i18n.localize(
        optional ? "CS.effects.redesign.yes" : "CS.effects.redesign.no"
      );
    }
    const condWrap = form.querySelector(".cs-effect-condition-wrap");
    if (condWrap) condWrap.style.display = optional ? "" : "none";
    const condSpan = form.querySelector(".cs-effect-condition-meta");
    if (condSpan) condSpan.textContent = condition || "—";
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    // When a subclass overrides PARTS, the core V2 tab framework does NOT
    // reliably apply the `.active` class to the tab CONTENT sections after
    // render, so every tab stacks vertically. Toggle it by hand on both the
    // nav and the content (proven fix from street-fighter / fragged-empire,
    // which hit the identical bug subclassing this same core config).
    const activeTab = this.tabGroups?.sheet ?? "details";
    this.element
      ?.querySelectorAll(".sheet-tabs [data-tab]")
      .forEach((el) =>
        el.classList.toggle("active", el.dataset.tab === activeTab)
      );
    this.element
      ?.querySelectorAll('.tab[data-group="sheet"]')
      .forEach((el) =>
        el.classList.toggle("active", el.dataset.tab === activeTab)
      );
    // Make every row's conditional fields match its current selects.
    this.element
      ?.querySelectorAll?.("li.cs-change")
      .forEach((row) => this._syncRowVisibility(row));
  }

  /** Toggle one row's conditional groups from its current select values. */
  _syncRowVisibility(row) {
    const valueOf = (selector) => row.querySelector(selector)?.value;
    const channel = valueOf("select.cs-channel");
    if (channel === undefined) return; // verbatim/raw row — nothing to toggle
    row.dataset.channel = channel; // keep the channel-colored rail in sync (CSS)
    const rollKind = valueOf("select.cs-roll-targetkind");
    const weaponKind = valueOf("select.cs-weapon-targetkind");
    const valueMode = valueOf("select.cs-value-mode");
    const isRoll = isRollChannel(channel);
    const isWeapon = isWeaponChannel(channel);
    const isQuality = channel === EFFECT_CHANNELS.QUALITY;

    const show = (selector, condition) => {
      const el = row.querySelector(selector);
      if (el) el.style.display = condition ? "" : "none";
    };
    show(".cs-roll-target", isRoll);
    const rollNeedsSlug =
      isRoll &&
      (rollKind === TARGET_KINDS.ABILITY ||
        rollKind === TARGET_KINDS.SPECIALTY);
    show(".cs-roll-slug", rollNeedsSlug);
    // The free-text slug only when the dropdown is on the "Custom…" pick.
    const rollSlugValue = valueOf("select.cs-roll-slug-select");
    show(
      ".cs-roll-slug-custom",
      rollNeedsSlug && rollSlugValue === ROLL_SLUG_CUSTOM
    );
    show(".cs-stat-target", channel === EFFECT_CHANNELS.DERIVED_STAT);
    show(".cs-armor-label", channel === EFFECT_CHANNELS.ARMOR_RATING);
    show(".cs-bulk-label", channel === EFFECT_CHANNELS.BULK);
    show(".cs-weapon-target", isWeapon);
    show(
      ".cs-weapon-slug",
      isWeapon && weaponKind === TARGET_KINDS.WEAPON_TYPE
    );

    // US4: disposition facet + influence scope/technique subselects.
    const isDisposition = channel === DISPOSITION_CHANNEL;
    const isInfluence = channel === EFFECT_CHANNELS.INFLUENCE;
    show(".cs-disposition-target", isDisposition);
    show(".cs-influence-target", isInfluence);
    const influenceScope = valueOf("select.cs-influence-scope");
    show(".cs-influence-technique", isInfluence && influenceScope === "one");

    show(".cs-value-mode-field", !isQuality);
    show(".cs-value-fixed", !isQuality && valueMode === "fixed");
    show(".cs-value-derived", !isQuality && valueMode === "derived");
    show(".cs-value-quality", isQuality);

    // Quality sub-fields: the parameter input only for canonical qualities that
    // take one; the free-text input only for the "Other…" pick.
    const qualityKind = valueOf("select.cs-quality-kind");
    show(
      ".cs-quality-param",
      isQuality &&
        qualityKind !== QUALITY_OTHER &&
        weaponQualityTakesParam(qualityKind)
    );
    show(".cs-quality-custom", isQuality && qualityKind === QUALITY_OTHER);
  }

  /** @override — the handoff always shows the "Effect Start" section; core returns
   *  null for a not-yet-started effect, so fall back to a localized "Now" so the
   *  section (Start Time: Now) is always present, matching the proposed layout. */
  async _prepareStartContext() {
    return (
      (await super._prepareStartContext()) ?? {
        time: game.i18n.localize("CS.effects.redesign.startNow"),
      }
    );
  }

  /** @override — rebuild the real `system.changes` from the synthetic rows. */
  _processFormData(event, form, formData) {
    const submitData = super._processFormData(event, form, formData);
    const rows = submitData?.changes;
    if (rows && typeof rows === "object") {
      submitData.system = submitData.system ?? {};
      submitData.system.changes = Object.values(rows).map(buildChangeFromRow);
      delete submitData.changes; // drop the synthetic block — only system.changes persists
    }
    // An unchecked checkbox is omitted from form data; force the boolean so that
    // turning "optional" OFF actually persists (Wave 3 reads this effect flag).
    const optional = form?.querySelector?.(
      'input[name="flags.chroniclesystem.optional"]'
    );
    if (optional) {
      submitData.flags ??= {};
      submitData.flags.chroniclesystem ??= {};
      submitData.flags.chroniclesystem.optional = !!optional.checked;
    }
    return submitData;
  }
}

/**
 * Register the cascade authoring sheet as the default ActiveEffect config.
 * Guarded so a missing V2 namespace or pre-v14 schema can never brick the sheet
 * (v13 falls back to the core config + the datalist enhancement). Called from
 * config.js during init.
 */
export function registerEffectConfigSheet() {
  const namespace = foundry.applications?.sheets?.ActiveEffectConfig;
  const registrar = foundry.applications?.apps?.DocumentSheetConfig;
  if (!namespace || !registrar || foundryGeneration() < 14) return;
  try {
    registrar.registerSheet(
      CONFIG.ActiveEffect.documentClass,
      "chroniclesystem",
      CSActiveEffectConfig,
      { makeDefault: true, label: "CS.effects.authoring.sheetLabel" }
    );
  } catch (err) {
    console.warn(
      "chroniclesystem | CSActiveEffectConfig registration skipped:",
      err
    );
  }
}
