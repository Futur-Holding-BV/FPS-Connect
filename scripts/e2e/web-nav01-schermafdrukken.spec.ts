// NAV_01 — schermafdrukken van het twee-traps menu (bewijsmateriaal, geen
// regressietest). Maakt ingelogd:
//   1. desktop sidebar met alleen hoofdstuknamen (dashboard)
//   2. geopend hoofdstukpaneel (Projectaanpak)
//   3. modulepagina met accentlijn in de hoofdstukkleur (/gebouwen)
//   4. smalle weergave (mobiel) = terugval op de bestaande inklapweergave
// Uitvoer: docs/metingen/afbeeldingen/NAV_01_*.png
// Draaien: pnpm --filter @workspace/scripts exec playwright test --config=playwright.web.config.ts e2e/web-nav01-schermafdrukken.spec.ts
import { test, expect } from "@playwright/test";

import { programmatischInloggen } from "./web-api-proxy";
import {
  E2E_WEB_EMAIL,
  E2E_WEB_WACHTWOORD,
  E2E_WEB_TOTP_SECRET,
  setupE2eWebAccount,
  archiveerE2eWebAccount,
} from "../src/e2e-monteur-testaccount";

const MAP = "../docs/metingen/afbeeldingen";

test.beforeAll(async () => {
  await setupE2eWebAccount();
});

test.afterAll(async () => {
  await archiveerE2eWebAccount();
});

test("NAV_01 schermafdrukken", async ({ page }) => {
  await programmatischInloggen(page, E2E_WEB_EMAIL, E2E_WEB_WACHTWOORD, E2E_WEB_TOTP_SECRET);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /projectaanpak/i })).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${MAP}/NAV_01_na_sidebar_hoofdstukken.png` });

  // Paneel openen
  await page.getByRole("button", { name: /projectaanpak/i }).click();
  const paneel = page.getByRole("navigation", { name: /Onderdelen van/i });
  await expect(paneel).toBeVisible();
  await page.waitForTimeout(400); // animatie uitspelen
  await page.screenshot({ path: `${MAP}/NAV_01_na_paneel_projectaanpak.png` });

  // Escape sluit het paneel
  await page.keyboard.press("Escape");
  await expect(paneel).toBeHidden();

  // Accentlijn op een modulepagina
  await page.goto("/gebouwen");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${MAP}/NAV_01_na_accentlijn_gebouwen.png` });

  // Smal scherm: terugval op de bestaande inklapweergave ("vóór"-weergave)
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto("/");
  await page.getByTitle("Menu openen").click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${MAP}/NAV_01_voor_terugval_smal.png` });
});
