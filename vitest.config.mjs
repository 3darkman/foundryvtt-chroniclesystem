import { defineConfig } from "vitest/config";

// Pure-logic test suite for the Chronicle System (spec 005-pure-logic-tests).
// Runs the production ESM directly (no build step — FR-003) under a Node
// environment. tests/setup.js installs the minimal Foundry globals that the
// production modules touch at import-time and runtime (FR-002), so the rule
// logic is importable and exercisable without a live Foundry VTT instance.
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.js"],
    globals: true,
    include: ["tests/**/*.test.js"],
  },
});
