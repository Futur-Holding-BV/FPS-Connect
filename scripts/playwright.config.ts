import { execSync } from "node:child_process";

import { defineConfig, devices } from "@playwright/test";

// De Expo monteur-app draait buiten de /api-proxy op het Expo dev-domein.
const expoDomain = process.env.REPLIT_EXPO_DEV_DOMAIN;
const baseURL = expoDomain ? `https://${expoDomain}` : undefined;

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
  // Een koude Expo-load is traag; ruime timeouts zodat de test niet flaky is.
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    // Mobiel viewport.
    viewport: { width: 400, height: 720 },
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 400, height: 720 },
        launchOptions: chromiumPad ? { executablePath: chromiumPad } : {},
      },
    },
  ],
});
