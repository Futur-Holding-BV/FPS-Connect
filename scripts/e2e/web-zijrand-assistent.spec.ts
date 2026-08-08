// E2E: ASSISTENT_01 fase 1 — vaste rechterrand met tabbladen Werkbak/Assistent.
//
// Controleert:
//  1. Topbalk toont werkbak- en assistent-knop.
//  2. Assistent-knop opent het rechterrand-paneel met beide tabbladen.
//  3. Contextregel "Je kijkt naar: …" is zichtbaar en verandert per scherm.
//  4. Open/dicht-stand wordt onthouden na herladen (localStorage).
//
// Draaien: pnpm --filter @workspace/scripts run e2e-web (of playwright test dit bestand)
import { expect, test, type Page } from "@playwright/test";

import { programmatischInloggen } from "./web-api-proxy";
import {
  E2E_WEB_ADMIN_EMAIL,
  E2E_WEB_ADMIN_WACHTWOORD,
  E2E_WEB_ADMIN_TOTP_SECRET,
  setupE2eWebAdminAccount,
} from "../src/e2e-monteur-testaccount";

const TIMEOUT = 20_000;

test.beforeAll(async () => {
  await setupE2eWebAdminAccount();
});

async function logIn(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("fps_onboarding_voltooid", "1");
    window.localStorage.setItem("fps.welkom.afgerond", "1");
  });
  await programmatischInloggen(page, E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET);
  await page.goto("/");
  // Replit dev-banner overlapt de rechterbovenhoek; wegklikken zodat kliks
  // op zijrand-knoppen niet onderschept worden (alleen in dev-preview aanwezig).
  const bannerDicht = page.locator("#replit-dev-banner .banner-close");
  try {
    await bannerDicht.waitFor({ state: "visible", timeout: 3000 });
    await bannerDicht.click();
  } catch {
    // geen banner — prima
  }
  // Eerste-keer welkomwizard kan alsnog verschijnen; klik hem dan weg.
  const naarPlatform = page.getByRole("button", { name: "Naar het platform" });
  try {
    await naarPlatform.waitFor({ state: "visible", timeout: 5000 });
    await naarPlatform.click();
  } catch {
    // wizard niet getoond — prima
  }
}

test("Web: zijrand met Werkbak/Assistent-tabbladen", async ({ page }) => {
  await test.step("login en topbalk-knoppen zichtbaar", async () => {
    await logIn(page);
    await expect(page.getByTestId("knop-assistent")).toBeVisible({ timeout: TIMEOUT });
    await expect(page.getByTestId("knop-werkbak")).toBeVisible({ timeout: TIMEOUT });
  });

  await test.step("assistent-knop opent paneel met beide tabbladen", async () => {
    await page.getByTestId("knop-assistent").click();
    await expect(page.getByTestId("paneel-zijrand")).toBeVisible({ timeout: TIMEOUT });
    await expect(page.getByTestId("tab-zijrand-werkbak")).toBeVisible();
    await expect(page.getByTestId("tab-zijrand-assistent")).toBeVisible();
    await expect(page.getByTestId("assistent-context-label")).toBeVisible();
    await expect(page.getByTestId("assistent-context-label")).toContainText("Je kijkt naar");
  });

  await test.step("contextregel verandert per scherm", async () => {
    await page.goto("/gebouwen");
    await expect(page.getByTestId("assistent-context-label")).toContainText("Gebouwen", { timeout: TIMEOUT });
  });

  await test.step("open-stand wordt onthouden na herladen", async () => {
    await page.reload();
    await expect(page.getByTestId("paneel-zijrand")).toBeVisible({ timeout: TIMEOUT });
    // Dichtklappen en herladen: paneel blijft dicht
    await page.getByTestId("knop-zijrand-sluiten").click();
    await expect(page.getByTestId("paneel-zijrand")).toBeHidden();
    await page.reload();
    await expect(page.getByTestId("knop-assistent")).toBeVisible({ timeout: TIMEOUT });
    await expect(page.getByTestId("paneel-zijrand")).toBeHidden();
  });
});
