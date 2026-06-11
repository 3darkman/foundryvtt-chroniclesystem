import { describe, it, expect } from "vitest";
import { ChronicleSystem } from "../module/system/ChronicleSystem.js";
import {
  collectEffectModifiers,
  parseEffectKey,
} from "../module/effects/cs-effect-modifiers.js";
import { makeModifierActor, makeFakeEffect } from "./helpers/doubles.js";

// Spec 006 — Active Effects PoC parity (FR-012 / contract P5). Pure-logic layer:
// proves the effect collector pushes the SAME modifier totals into the SAME read
// path (getModifier) as the homemade onEquippedChanged path (csArmorItem.js:14-28),
// for the three armor targets. Transfer/suppression/UI are verified in a live
// test world (quickstart Step 3); this guards the value-parity invariant cheaply.

const M = ChronicleSystem.modifiersConstants;
const PENALTY = 2;
const RATING = 4;
const EFFECT_ID = "effect-armor-1";
const ARMOR_ID = "item-armor-1";

// The three armor targets the AE covers (research Decision 5 / contract P2).
// mode:2 = ADD (numeric, portable creation format v13+v14).
const armorChanges = [
  { key: "cs.modifier.agility", value: PENALTY, mode: 2 },
  { key: "cs.modifier.combat_defense", value: PENALTY, mode: 2 },
  { key: "cs.modifier.damage_taken", value: RATING, mode: 2 },
];

// Replicate the homemade path: actor.addModifier for each armor target.
function applyHomemade(actor) {
  actor.updateTempModifiers();
  actor.addModifier(M.AGILITY, ARMOR_ID, PENALTY);
  actor.addModifier(M.COMBAT_DEFENSE, ARMOR_ID, PENALTY);
  actor.addModifier(M.DAMAGE_TAKEN, ARMOR_ID, RATING);
}

describe("active effects parity — key parser", () => {
  it("maps cs.modifier.* keys to modifier types; ignores the rest", () => {
    expect(parseEffectKey("cs.modifier.agility")).toBe("agility");
    expect(parseEffectKey("cs.modifier.combat_defense")).toBe("combat_defense");
    expect(parseEffectKey("cs.modifier.damage_taken")).toBe("damage_taken");
    expect(parseEffectKey("system.derivedStats.value")).toBeNull();
    expect(parseEffectKey("cs.modifier.")).toBeNull();
    expect(parseEffectKey(undefined)).toBeNull();
  });
});

describe("active effects parity — armor penalty totals", () => {
  it("collector delta === homemade delta for agility / combat_defense / damage_taken", () => {
    const targets = [M.AGILITY, M.COMBAT_DEFENSE, M.DAMAGE_TAKEN];

    const homemade = makeModifierActor();
    applyHomemade(homemade);

    const ae = makeModifierActor({
      appliedEffects: [makeFakeEffect(EFFECT_ID, armorChanges)],
    });
    collectEffectModifiers(ae);

    for (const type of targets) {
      const deltaHome = homemade.getModifier(type).total;
      const deltaAe = ae.getModifier(type).total;
      expect(deltaAe).toBe(deltaHome);
    }

    // Concrete values: penalty for the ability/defense targets, rating for damage.
    expect(ae.getModifier(M.AGILITY).total).toBe(PENALTY);
    expect(ae.getModifier(M.COMBAT_DEFENSE).total).toBe(PENALTY);
    expect(ae.getModifier(M.DAMAGE_TAKEN).total).toBe(RATING);
  });

  it("a suppressed (unequipped) effect contributes nothing — no residue", () => {
    // In production `appliedEffects` already filters out suppressed effects, so an
    // unequipped armor's effect is simply absent. The collector must leave zeros.
    const ae = makeModifierActor({ appliedEffects: [] });
    collectEffectModifiers(ae);
    expect(ae.getModifier(M.AGILITY).total).toBe(0);
    expect(ae.getModifier(M.COMBAT_DEFENSE).total).toBe(0);
    expect(ae.getModifier(M.DAMAGE_TAKEN).total).toBe(0);
  });

  it("re-collecting is idempotent — keyed by effect id, never double-counted", () => {
    const ae = makeModifierActor({
      appliedEffects: [makeFakeEffect(EFFECT_ID, armorChanges)],
    });
    collectEffectModifiers(ae);
    collectEffectModifiers(ae);
    expect(ae.getModifier(M.AGILITY).total).toBe(PENALTY);
    expect(ae.getModifier(M.DAMAGE_TAKEN).total).toBe(RATING);
  });

  it("ignores non cs.modifier.* changes — bulk is never touched by the collector", () => {
    const ae = makeModifierActor({
      appliedEffects: [
        makeFakeEffect(EFFECT_ID, [
          { key: "system.unrelated", value: 9, mode: 2 },
          { key: "cs.modifier.agility", value: PENALTY, mode: 2 },
        ]),
      ],
    });
    collectEffectModifiers(ae);
    expect(ae.getModifier(M.AGILITY).total).toBe(PENALTY);
    expect(ae.getModifier(M.BULK).total).toBe(0);
  });
});
