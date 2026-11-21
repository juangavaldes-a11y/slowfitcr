import { defineConfig } from "@playwright/test";

// Unit tests for app code that uses bundler-style imports (no browser, no servers).
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.unit.spec.ts",
  reporter: "list",
});
