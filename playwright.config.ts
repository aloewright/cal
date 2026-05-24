import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const bravePath = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
  (existsSync(bravePath) ? bravePath : undefined);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: "http://127.0.0.1:8788",
    trace: "retain-on-failure",
    browserName: "chromium",
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  webServer: {
    command: "tsx tests/e2e/server.ts",
    url: "http://127.0.0.1:8788/health",
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 5"] },
    },
  ],
});
