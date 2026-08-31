import { defineConfig, devices } from "@playwright/test";

/**
 * E2E suite runs against the already-running dev server on :8080 and uses the
 * sandbox Chromium (no Playwright browser download).
 */
const BASE_URL = process.env["E2E_BASE_URL"] ?? "http://localhost:8080";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 1000 },
    launchOptions: {
      executablePath: process.env["E2E_CHROMIUM"] ?? "/bin/chromium",
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
    trace: "off",
    video: "off",
  },
});
