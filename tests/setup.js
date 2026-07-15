// Global stub harness — the heart of FR-002 (spec 005-pure-logic-tests).
//
// Registered as a Vitest `setupFile`, this module runs ONCE before any test
// file (and therefore before any production module) is imported. It installs
// the minimal set of Foundry VTT globals that the production code touches at
// import-time (class `extends`, top-level `const fields = foundry.data.fields`,
// `window.ChronicleSystem = ...`) and at the runtime paths the pure-logic tests
// exercise. It deliberately does NOT simulate the whole framework.
//
// Faithful where it matters: `game.i18n.localize` resolves keys against the
// REAL en.json (SSOT, research Decision 6), so the i18n "constant trap" — a
// broken key→label wiring zeroing a derived stat — is genuinely caught.

import enJson from "../lang/en.json";

// --- Flatten the real en.json into dotted keys (CS.constants.abilities.endurance → "endurance").
// Foundry flattens nested localization objects into dot-notation keys at load
// time; we replicate that so localize(KEY) behaves like the real lookup.
const flattenLocalization = (obj, prefix = "", out = {}) => {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flattenLocalization(value, path, out);
    } else {
      out[path] = value;
    }
  }
  return out;
};

const localizationTable = flattenLocalization(enJson);

// --- Import-time globals (production modules read these while loading) ---

// ChronicleSystem.js does `window.ChronicleSystem = ChronicleSystem` at module top.
globalThis.window = globalThis;

// csActor.js: `class CSActor extends Actor`; csItem.js: `class CSItem extends Item`.
globalThis.Actor = class {};
globalThis.Item = class {};

// Data models: `const fields = foundry.data.fields` (top-level) and
// `class XData extends foundry.abstract.TypeDataModel`. `defineSchema()` is
// never invoked by these tests, so `fields` only needs to exist. `migrateData`
// of the data models ends with `super.migrateData(source)` → the stub returns
// the (mutated) source, satisfying FR-007 (return !== undefined).
globalThis.foundry = {
  data: { fields: {} },
  abstract: {
    TypeDataModel: class {
      static migrateData(source) {
        return source;
      }
    },
  },
  // Sheet classes destructure `foundry.applications.*` at module-eval time (class
  // `extends HandlebarsApplicationMixin(ActorSheetV2)`), and csActor.js
  // imports csPublicCharacterSheet.js — so these must exist or that import chain
  // throws before any test runs. Minimal inert stand-ins (never instantiated by
  // the pure-logic tests).
  applications: {
    api: { HandlebarsApplicationMixin: (Base) => Base },
    sheets: { ActorSheetV2: class {}, ItemSheetV2: class {} },
    ux: { TextEditor: { implementation: {} } },
  },
  documents: { ActiveEffect: class {}, Item: class {} },
};

// CONST globals some sheet modules read at eval/prepare time.
globalThis.CONST = globalThis.CONST ?? {
  DEFAULT_TOKEN: "icons/svg/mystery-man.svg",
};

// --- Runtime globals (exercised by the pure-logic paths under test) ---

globalThis.game = {
  i18n: {
    // Real lookup against en.json; fallback to the key itself (research Decision 6).
    localize: (key) =>
      Object.prototype.hasOwnProperty.call(localizationTable, key)
        ? localizationTable[key]
        : key,
    format: (key) => key,
  },
  // ASOIAF defense style off → base combat-defense path (no extra modifier).
  settings: { get: () => false },
};

// Defensive no-ops — not exercised by pure-logic tests, present so any
// incidental call along an import chain does not throw.
globalThis.ui = {
  notifications: {
    info() {},
    warn() {},
    error() {},
    notify() {},
  },
};
globalThis.canvas = { tokens: { controlled: [] } };

// Handlebars: registerHelper must CAPTURE the callback (NOT a no-op). The
// `weapon-test` helper (Group 4) only exists as a callback passed to
// registerHelper inside registerCustomHelpers(); the test recovers it via
// Handlebars._helpers["weapon-test"] (data-model §D).
globalThis.Handlebars = {
  _helpers: {},
  registerHelper(name, fn) {
    this._helpers[name] = fn;
  },
  SafeString: class {
    constructor(s) {
      this.s = s;
    }
  },
};

// Roll / ChatMessage: defensive stubs (the dice engine itself is out of scope —
// FR-011; pure logic is tested via string/serialization transforms only).
globalThis.Roll = class {
  constructor(formula) {
    this.formula = formula;
  }
  async evaluate() {
    return this;
  }
};
globalThis.ChatMessage = { getSpeaker: () => ({}) };
