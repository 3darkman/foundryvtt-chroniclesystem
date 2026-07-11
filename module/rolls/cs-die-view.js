/**
 * Pure presentation transform for the result card's die faces (spec 011, US2).
 * Standalone (no imports) so it is unit-testable without the Foundry runtime —
 * the same reason cs-die-formula.js / cs-conflict.js are standalone.
 *
 * Foundry models a re-roll as TWO results: the original is marked in place
 * (`rerolled:true, active:false`) and the replacement is APPENDED to the end of
 * `term.results` (not adjacent), with no pairing metadata. A keep-highest discard
 * is `active:false, discarded:true`. The card wants ONE pip per physical die
 * showing the FINAL face (data-model §5): collapse those raw results here.
 */

/** @typedef {{result:number, active:boolean, discarded?:boolean,
 *   rerolled?:boolean, exploded?:boolean}} DiceTermResult */
/** @typedef {{value:number, state:'kept'|'discarded'|'rerolled', pips:number}} DieView */

/**
 * Collapse the raw `term.results` into one view per physical die (final face +
 * mutually-exclusive state). Count-guarded (D5): a clean single re-roll pass over
 * one Die term (SIFRP's `r{N}=1`) zips originals to replacements by order; when
 * the counts do not line up (recursive re-rolls / explosions) it DEGRADES to the
 * final faces with their base kept/discarded state only — it never fabricates a
 * re-rolled badge it cannot prove (F3).
 *
 * @param {DiceTermResult[]} results the raw `term.results`
 * @param {number} number the term's die count (`term.number`)
 * @returns {DieView[]}
 */
export function collapseDiceResults(results, number) {
  const safe = Array.isArray(results) ? results : [];
  const n = Number.isInteger(number) ? number : safe.length;

  // A physical die's base view: its final face + kept/discarded from `active`.
  const base = (r) => ({
    value: r.result,
    state: r.active ? "kept" : "discarded",
    pips: r.result,
  });

  // The final faces (one physical die each): re-rolled originals and explosion
  // parents are excluded so only the surviving face of each die remains.
  const finals = safe.filter((r) => !r.rerolled && !r.exploded);

  // No re-roll happened → the finals ARE the physical dice, in order.
  const rerolledCount = safe.filter((r) => r.rerolled).length;
  if (rerolledCount === 0) return finals.map(base);

  // Clean single pass: the n originals lead the array, their replacements are
  // appended after them, and no replacement was itself re-rolled/exploded.
  const initial = safe.slice(0, n);
  const appended = safe.slice(n);
  const recursive = appended.some((r) => r.rerolled || r.exploded);
  const canZip =
    initial.length === n &&
    !recursive &&
    appended.length === initial.filter((r) => r.rerolled).length;

  if (!canZip) {
    // Degrade (F3): the final faces with base state only, no invented re-roll.
    return finals.map(base);
  }

  let a = 0;
  return initial.map((r) => {
    if (!r.rerolled) return base(r);
    // A re-rolled die shows its replacement's face; state 'rerolled' takes
    // precedence over the replacement's own kept/discarded (data-model §5.3).
    const repl = appended[a++];
    return { value: repl.result, state: "rerolled", pips: repl.result };
  });
}
