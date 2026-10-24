import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  expect: { timeout: 8000 },
  reporter: "list",
  outputDir: "../.local/e2e-results",
  use: {
    baseURL: "http://127.0.0.1:3100",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  webServer: {
    cwd: resolve(import.meta.dirname, ".."),
    command: '"' + process.execPath + '" e2e/server.ts',
    url: "http://127.0.0.1:3100/health",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
