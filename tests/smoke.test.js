import { describe, it, expect } from "vitest";

// US1 / Contract T.2-T.3: importing a framework-coupled production module
// (csCharacterActor extends CSActor extends the global `Actor`, and pulls in
// ChronicleSystem.js which assigns `window.ChronicleSystem`) proves the
// harness's import-time globals make production importable WITHOUT a live
// Foundry. If the harness were missing a global, this import would throw.
import { CSCharacterActor } from "../module/actors/csCharacterActor.js";

describe("smoke — production loads under the test harness (no Foundry)", () => {
  it("loads a framework-coupled production class from source ESM", () => {
    expect(CSCharacterActor).toBeTypeOf("function");
    expect(CSCharacterActor.prototype.calculateDerivedValues).toBeTypeOf(
      "function"
    );
  });

  it("trivially exercises expect (suite is wired)", () => {
    expect(1 + 1).toBe(2);
  });
});
