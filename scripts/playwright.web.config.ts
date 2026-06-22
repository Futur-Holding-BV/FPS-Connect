import { execSync } from "node:child_process";

import { defineConfig, devices } from "@playwright/test";

// De web-app (firevault) draait via de gedeelde proxy op REPLIT_DEV_DOMAIN.
const devDomain = process.env.REPLIT_DEV_DOMAIN;
const baseURL = devDomain ? `https://${devDomain}` : "http://localhost:80";

// Op NixOS draait de meegeleverde Playwright-chromium niet (prebuilt binary).
// Gebruik de Nix-chromium; dynamisch opgezocht zodat er geen /nix/store-pad is
// hardgecodeerd. Overschrijfbaar via PLAYWRIGHT_CHROMIUM_EXECUTABLE.
function vindChromium(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  }
  try {
    return execSync("which chromium", { encoding: "utf8" }).trim() || undefined;
  } catch {
    return undefined;
  }
}

const chromiumPad = vindChromium();

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/web-*.spec.ts",
  // De web-app laadt sneller dan Expo; ruime timeouts voor koude API-starts.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    // Desktop-viewport: de firevault-app is desktop-first.
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        launchOptions: chromiumPad ? { executablePath: chromiumPad } : {},
      },
    },
  ],
});
