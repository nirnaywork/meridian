import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: {
    baseURL: process.env.TEST_APP_URL ?? "http://localhost:3000",
    headless: true,
  },
  reporter: "list",
  timeout: 45000,
});
