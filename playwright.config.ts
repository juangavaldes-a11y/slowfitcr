import { defineConfig, devices } from "@playwright/test";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgresql://slowfit:slowfit@localhost:5433/slowfit_migration_test?schema=public";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "npm run db:migrate && node server.mjs",
      cwd: "./backend",
      env: {
        DATABASE_URL: databaseUrl,
        PORT: "8181",
        REVIEW_MODERATION_TOKEN: "e2e-token",
        REVIEW_MODERATION_SESSION_SECRET: "e2e-session-secret",
      },
      url: "http://localhost:8181/health/ready",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "npm run dev -- --port 3100",
      env: {
        BACKEND_INTERNAL_URL: "http://localhost:8181",
        NEXT_PUBLIC_BACKEND_URL: "http://localhost:8181",
      },
      url: "http://localhost:3100/en",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
