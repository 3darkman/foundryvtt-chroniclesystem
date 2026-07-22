import SystemUtils from "../utils/systemUtils.js";
import { CSConstants } from "../system/csConstants.js";
import { resolveVerdict } from "../difficulty/cs-difficulty.js";
import {
  degreesOfSuccess,
  computeDamage,
  computeInfluence,
} from "../combat/cs-conflict.js";
import { buildDieFormula } from "./cs-die-formula.js";
import { collapseDiceResults } from "./cs-die-view.js";
import { evaluateTrigger } from "../combat/cs-quality-triggers.js";
import { resolveConditionEffectData } from "../combat/cs-conflict-apply.js";

export class CSRoll {
  /**
   * @param {string} title the rolled test's name
   * @param {DiceRollFormula} formula
   * @param {{target: number, labelKey: string|null, label: string|null}|null} difficulty
   *   the resolved difficulty. Player test rolls always carry one (handleRollAsync
   *   coerces an unselected one to target 0, spec 011); a null only reaches the
   *   sync initiative path, which keeps the default Foundry message.
   * @param {object|null} conflictContext spec 010: the card decomposition
   *   ({ itemized, baseLabel, kind, targetActor, baseValue, armorRating,
   *   dispositionRating }), or null for a plain roll with no decomposition.
   */
  constructor(title, formula, difficulty = null, conflictContext = null) {
    this.formula = formula;
    this.title = title;
    this.difficulty = difficulty;
    this.conflictContext = conflictContext;
    this.results = [];
  }

  async doRoll(actor) {
    if (this.formula.pool - this.formula.dicePenalty <= 0) {
      ui.notifications.info(
        SystemUtils.localize("CS.notifications.dicePoolInvalid")
      );
      return null;
    }
    const dieFormula = buildDieFormula(this.formula);

    let resultRoll = new Roll(dieFormula);
    await resultRoll.evaluate();
    this.results = resultRoll.terms[0].results;

    // spec 011 (FR-011/FR-013): every player TEST roll now carries a resolved
    // difficulty (handleRollAsync coerces an unselected one to target 0), so it
    // always renders the unified card. The else branch is now exclusively the
    // no-difficulty SYNC path — initiative (handleRoll → CsCombatant), which
    // posts its own message and stays as-is (D6).
    if (this.difficulty && this.difficulty.target != null) {
      await this._toVerdictMessage(resultRoll, actor);
    } else {
      resultRoll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        // The test name alone (spec 010 polish) — not the "<name> make a <test>
        // roll" sentence, whose translation surfaces the word "test"/"teste".
        flavor: this.title,
      });
    }
    return resultRoll;
  }

  /**
   * Resolve the conflict outcome on a hit (spec 010, US4): degrees → damage or
   * influence, floored at 0. Never called on a miss (FR-020). Returns null when
   * there is no conflict resolution (a plain difficulty roll, or a miss).
   * @returns {object|null}
   */
  _resolveConflict(verdict) {
    const cc = this.conflictContext;
    if (!cc || !cc.kind || !cc.targetActor || !verdict.success) return null;
    const degrees = degreesOfSuccess(verdict.margin);
    const isDamage = cc.kind === "weapon";
    return {
      kind: isDamage ? "damage" : "influence",
      degrees,
      value: isDamage
        ? computeDamage(cc.baseValue, degrees, cc.armorRating)
        : computeInfluence(cc.baseValue, degrees, cc.dispositionRating),
      reduction: isDamage ? cc.armorRating : cc.dispositionRating,
      path: isDamage
        ? "system.derivedStats.health.current"
        : "system.derivedStats.composure.current",
      targetUuid: cc.targetActor.uuid,
      targetName: cc.targetActor.name,
    };
  }

  /**
   * Post the unified result card (spec 011) — the single surface for every roll:
   * verdict + numbers (target 0 with no difficulty) + base + itemized
   * decomposition + one pip face per physical die (kept/discarded/re-rolled) and,
   * on a hit of a real conflict, the damage/influence resolution + apply button.
   */
  async _toVerdictMessage(roll, actor) {
    const { target, label, labelKey } = this.difficulty;
    const verdict = resolveVerdict(roll.total, target);
    const cc = this.conflictContext;
    // The target's own token name is the explicit "Target" line (below); the
    // difficulty NAME is the defense type / table level and is shown above the
    // numbers on BOTH plain and conflict rolls (spec 011, handoff).
    const targetName = cc?.targetName ?? null;
    const difficultyName =
      label || (labelKey ? SystemUtils.localize(labelKey) : "");
    // spec 023 — when the difficulty IS one of the target's ability/specialty
    // passives, the card says so beside the name (a defense and a table level
    // read as themselves and carry no badge).
    const difficultyIsPassive = Boolean(this.difficulty?.passiveTrait);
    const marginText =
      verdict.margin >= 0 ? `+${verdict.margin}` : `${verdict.margin}`;
    // Margin tone: a hit (margin ≥ 0) reads green, a miss red (spec 011).
    const marginTone = verdict.margin >= 0 ? "gain" : "loss";
    const degree = SystemUtils.localize(verdict.degreeKey);
    // Degrees of success shown on EVERY successful roll, not just conflicts.
    const degrees = verdict.success ? degreesOfSuccess(verdict.margin) : null;

    // spec 011 (T014): collapse the raw die results into one pip-view per physical
    // die (final face + kept/discarded/rerolled) and attach the i18n tooltip HERE
    // — the single source the template renders as title/data-tooltip (F2). The hook
    // never recomputes it.
    const term = roll.terms?.[0];
    const dice = collapseDiceResults(term?.results ?? [], term?.number).map(
      (d) => {
        const label = SystemUtils.localize(`CS.conflict.dice.${d.state}`);
        // Handoff tooltips: "Kept · N" / "Discarded · N" / "Re-rolled 1 → N".
        const sep = d.state === "rerolled" ? "→" : "·";
        return { ...d, tooltip: `${label} ${sep} ${d.value}` };
      }
    );

    // spec 021 (US2, D14/D15): the number of 1s the player actually SEES on the
    // collapsed dice view (after the rN=1 re-roll collapse) — the Treacherous count.
    const onesCount = dice.filter((d) => d.value === 1).length;
    // Enrich each quality reminder with whether it FIRED on this roll (degree/count
    // trigger vs the actual outcome). A miss fires nothing (FR-008, forced inside
    // evaluateTrigger). `countKindLabel` is the i18n key the card renders.
    const reminders = (cc?.reminders ?? []).map((reminder) => {
      const fired = evaluateTrigger(reminder.trigger, {
        success: verdict.success,
        degrees,
        onesCount,
        parameter: reminder.parameter,
      });
      return {
        ...reminder,
        ...fired,
        countKindLabel: fired.countKind
          ? `CS.quality.trigger.${fired.countKind}`
          : null,
      };
    });

    // spec 021 (US3, D16/D19) — one apply-condition entry per TRIGGERED
    // `scope:"target"` rule: on a HIT with a valid target, resolve the quality's
    // authored effect (world ∪ compendium) and stamp it for the card's apply
    // button. An ungated target rule fires on any hit; a gated one per its trigger.
    // A deleted/absent effect yields no entry (FR-014). Always the TARGET actor —
    // never the wielder (the apply relay only ever receives the target).
    const applyConditions = [];
    if (verdict.success && cc?.targetActor) {
      for (const reminder of reminders) {
        for (const targetRule of reminder.targetRules ?? []) {
          const fired =
            targetRule.trigger?.kind === "none" ||
            evaluateTrigger(targetRule.trigger, {
              success: verdict.success,
              degrees,
              onesCount,
              parameter: reminder.parameter,
            }).triggered;
          if (!fired) continue;
          const effectData = await resolveConditionEffectData(
            reminder.slug,
            targetRule.effectRef
          );
          if (!effectData) continue;
          applyConditions.push({
            targetUuid: cc.targetActor.uuid,
            effectData,
            label: effectData.name ?? targetRule.effectRef,
          });
        }
      }
    }

    const resolution = this._resolveConflict(verdict);
    // The reduction unit shown beside the resolution value ("−2 armor" / "… disposition").
    if (resolution) {
      resolution.reductionUnit = SystemUtils.localize(
        resolution.kind === "damage"
          ? "CS.conflict.reduction.armor"
          : "CS.conflict.reduction.disposition"
      );
    }
    // spec 011 (FR-011/T017): ONE structure for every roll. difficulty-result.hbs
    // is gone; the unified card handles the plain case (target 0, no target line,
    // no resolution) through its own conditional blocks.
    const template = CSConstants.Templates.Chat.CONFLICT_RESULT;

    const content = await foundry.applications.handlebars.renderTemplate(
      template,
      {
        title: this.title,
        difficultyName,
        difficultyIsPassive,
        targetName,
        target,
        total: roll.total,
        margin: verdict.margin,
        marginText,
        marginTone,
        success: verdict.success,
        degree,
        degrees,
        baseLabel: cc?.baseLabel ?? null,
        itemized: cc?.itemized ?? [],
        dice,
        roll,
        resolution,
        // spec 020 (FR-018) — all of THIS weapon's qualities listed on the result
        // card as adjudication notes; spec 021 (US2) enriches each with whether it
        // FIRED (is-triggered/is-dimmed) + the count/countKindLabel.
        reminders,
        // spec 021 (US3) — one apply-condition button per triggered target rule.
        applyConditions,
      }
    );
    const messageData = {
      speaker: ChatMessage.getSpeaker({ actor: actor }),
      // The test name is now shown inside the card title (spec 010 polish); the
      // "<name> make a <test> roll" flavor would only duplicate it — omit it.
      content,
      rolls: [roll],
      flags: {
        chroniclesystem: {
          difficulty: { target, labelKey, label },
          total: roll.total,
          margin: verdict.margin,
          success: verdict.success,
          degreeKey: verdict.degreeKey,
          // spec 023 (US3) — this difficulty came FROM THE TARGET (the passive
          // picker, or a quick/untouched conflict roll's defense), so a non-GM
          // viewer may have its target number and margin masked at render time.
          // Absent on every other path, so a table-difficulty roll, a free roll
          // and every pre-existing card are never flagged (FR-028).
          ...(this.difficulty?.targetDerived
            ? { passiveDifficulty: true }
            : {}),
          ...(resolution
            ? {
                apply: {
                  targetUuid: resolution.targetUuid,
                  path: resolution.path,
                  delta: resolution.value,
                },
              }
            : {}),
          // spec 021 (US3) — the per-target-rule condition data the card's apply
          // button(s) hand to the GM relay (an array; index = data-cond-index).
          ...(applyConditions.length ? { applyConditions } : {}),
        },
      },
    };
    // Respect the selected chat mode (v14 messageMode; v13 rollMode fallback).
    const isV14 =
      typeof CONFIG !== "undefined" &&
      CONFIG.ChatMessage &&
      "modes" in CONFIG.ChatMessage;
    const mode = game.settings.get("core", isV14 ? "messageMode" : "rollMode");
    if (isV14 && ChatMessage.applyMode)
      ChatMessage.applyMode(messageData, mode);
    else if (ChatMessage.applyRollMode)
      ChatMessage.applyRollMode(messageData, mode);
    await ChatMessage.create(messageData);
  }
}
