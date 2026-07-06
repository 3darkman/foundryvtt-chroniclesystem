// Friendly authoring help for the ActiveEffect config (effect-model redesign,
// docs/ae-effect-model-design.md; the authoring UI proper lands in a later wave).
//
// Rather than subclass the core ActiveEffectConfig (whose exact V2 namespace and
// internal PARTS are version-volatile), we enhance it additively via the
// `renderActiveEffectConfig` hook: a <datalist> of the valid structured change
// keys — `cs.<channel>.<targetKind>[.<slug>]` built via `buildEffectKey` (global
// roll channels result/testdice/bonusdice/reroll/penalty, per-ability
// result/testdice, plus derivedstat/armorrating/bulk) — is attached to every
// change-key input as autocomplete. Typing a raw key remains the fallback; this
// just makes it friendly. The whole enhancement is guarded so it can never block
// the core config.

import {
  EFFECT_CHANNELS,
  TARGET_KINDS,
  DERIVED_STATS,
  buildEffectKey,
  slugify,
} from "./cs-effect-vocabulary.js";

const DATALIST_ID = "cs-effect-key-suggestions";

const ROLL_CHANNEL_LIST = [
  EFFECT_CHANNELS.RESULT,
  EFFECT_CHANNELS.TEST_DICE,
  EFFECT_CHANNELS.BONUS_DICE,
  EFFECT_CHANNELS.REROLL,
  EFFECT_CHANNELS.PENALTY,
];

/** Build the full list of suggested change keys for the current world. */
function suggestedKeys() {
  const keys = [];

  // Global roll channels.
  for (const channel of ROLL_CHANNEL_LIST) {
    keys.push(buildEffectKey({ channel, targetKind: TARGET_KINDS.ALL }));
  }

  // Per-ability examples (result + test dice), value = stable slug.
  const abilities = game.items?.filter?.((i) => i.type === "ability") ?? [];
  for (const item of abilities) {
    const slug = item.system?.slug || slugify(item.name);
    if (!slug) continue;
    keys.push(
      buildEffectKey({
        channel: EFFECT_CHANNELS.RESULT,
        targetKind: TARGET_KINDS.ABILITY,
        target: slug,
      })
    );
    keys.push(
      buildEffectKey({
        channel: EFFECT_CHANNELS.TEST_DICE,
        targetKind: TARGET_KINDS.ABILITY,
        target: slug,
      })
    );
  }

  // Derived stats, armour rating and bulk.
  for (const stat of Object.values(DERIVED_STATS)) {
    keys.push(
      buildEffectKey({
        channel: EFFECT_CHANNELS.DERIVED_STAT,
        targetKind: TARGET_KINDS.STAT,
        target: stat,
      })
    );
  }
  keys.push(
    buildEffectKey({
      channel: EFFECT_CHANNELS.ARMOR_RATING,
      targetKind: TARGET_KINDS.SELF,
    })
  );
  keys.push(
    buildEffectKey({
      channel: EFFECT_CHANNELS.BULK,
      targetKind: TARGET_KINDS.ALL,
    })
  );

  return [...new Set(keys)].filter(Boolean);
}

/**
 * Hook handler for `renderActiveEffectConfig`. Attaches the suggestions datalist
 * to every change-key input. v14 passes the element as an HTMLElement; v13 passed
 * a jQuery object — handle both.
 * @param {Application} app
 * @param {HTMLElement|object} html
 */
export function onRenderActiveEffectConfig(app, html) {
  try {
    const root = app?.element ?? html?.[0] ?? html;
    if (!root || typeof root.querySelectorAll !== "function") return;

    if (!root.querySelector(`#${DATALIST_ID}`)) {
      const datalist = document.createElement("datalist");
      datalist.id = DATALIST_ID;
      for (const key of suggestedKeys()) {
        const option = document.createElement("option");
        option.value = key;
        datalist.appendChild(option);
      }
      root.appendChild(datalist);
    }

    root
      .querySelectorAll('input[name$=".key"]')
      .forEach((input) => input.setAttribute("list", DATALIST_ID));
  } catch (err) {
    // Never block the core config over a UX nicety.
    console.warn("chroniclesystem | effect key suggestions skipped:", err);
  }
}

/** Register the enhancement hook. Called from config.js during init. */
export function registerEffectConfigEnhancements() {
  Hooks.on("renderActiveEffectConfig", onRenderActiveEffectConfig);
}
