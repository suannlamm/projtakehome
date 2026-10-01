import { defineConfig } from "@playwright/test";

// End-to-end tests drive the real app in a browser against the Supabase project in .env.local,
// using temporary accounts that e2e/setup.ts creates and deletes. Run with `npm run test:e2e`.
process.loadEnvFile(".env.local");

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/setup.ts",
  // One user journey, in order: each step builds on the last.
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  // Uses the dev server if it's already running, otherwise starts one.
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
});
