// E2E: firevault web-app — gebruikersmenu linksonder in de sidebar + taakbalk.
// Bewijst per knop dat hij werkt (business-scenario-validatie, Kwaliteitskader):
//   - Bekijken als (alleen hoofdbeheerder): wisselt weergave en zet terug
//   - Privacy: navigeert naar /mijn/privacy
//   - App-informatie: navigeert naar /info
//   - Uitloggen (taakbalk, helemaal links): POST /auth/logout (204) en beland
//     op het loginscherm
//
// Opmerking (2026-07-13): de knoppen "Wachtwoord" en de taalkeuze zijn op
// verzoek van de gebruiker uit het menu verwijderd (taal wordt op het
// inlogscherm gekozen; wachtwoord via "wachtwoord vergeten" of de beheerder).
// "Uitloggen" is in de kantooromgeving verplaatst naar de taakbalk.
//
// Draaien: pnpm --filter @workspace/scripts run e2e-web
// Vereist: lopende workflows api-server + firevault web, env DATABASE_URL en
// REPLIT_DEV_DOMAIN.
import { expect, test, type Page } from "@playwright/test";

import {
  E2E_WW_ADMIN_EMAIL,
  E2E_WW_ADMIN_WACHTWOORD,
  E2E_WW_TARGET_NAAM,
  genereerVersAdminTotp,
  setupE2eWachtwoordAccounts,
  wachtOpNieuwTotpVenster,
} from "../src/e2e-wachtwoord-testaccounts";

const INHOUD_TIMEOUT = 20_000;

// ── Login (zelfde patroon als web-wachtwoord-beheer.spec.ts) ────────────────
async function logIn(page: Page): Promise<void> {
  await page.goto("/");

  await expect(page.locator("#email")).toBeVisible({ timeout: 60_000 });
  await page.locator("#email").fill(E2E_WW_ADMIN_EMAIL);
  await page.locator("#wachtwoord").fill(E2E_WW_ADMIN_WACHTWOORD);

  for (let poging = 1; poging <= 3; poging++) {
    if (poging > 1) {
      await wachtOpNieuwTotpVenster();
      if (await page.locator("#email").isVisible().catch(() => false)) {
        await page.locator("#email").fill(E2E_WW_ADMIN_EMAIL);
        await page.locator("#wachtwoord").fill(E2E_WW_ADMIN_WACHTWOORD);
      }
    }

    if (await page.getByRole("button", { name: "Inloggen" }).isVisible()) {
      await page.getByRole("button", { name: "Inloggen" }).click();
    }

    try {
      await expect(page.locator("[data-input-otp]")).toBeVisible({ timeout: 15_000 });
    } catch {
      if (poging === 3) throw new Error("TOTP-invoer niet verschenen na 3 pogingen.");
      continue;
    }

    const code = await genereerVersAdminTotp();
    await page.locator("[data-input-otp]").focus();
    await page.keyboard.type(code);

    try {
      await expect(page.locator("[data-input-otp]")).not.toBeVisible({ timeout: 15_000 });
      return;
    } catch {
      if (poging === 3) throw new Error("Inloggen mislukt na 3 pogingen (TOTP/login).");
    }
  }
}

test.beforeAll(async () => {
  await setupE2eWachtwoordAccounts();
});

test("Web: gebruikersmenu — alle knoppen werken (Bekijken als, privacy, info, uitloggen via taakbalk)", async ({ page }) => {
  // Een frisse Playwright-context heeft het welkom-scherm nog niet afgerond
  // (localStorage-sleutel "fps.welkom.afgerond"); zonder deze vlag landt de
  // gebruiker na login op /welkom in plaats van op het platform met de sidebar.
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("fps.welkom.afgerond", "1");
    } catch {
      // localStorage niet beschikbaar — dan valt de test terug op de knop.
    }
  });

  await test.step("login als hoofdbeheerder met verplichte TOTP", async () => {
    await logIn(page);
    // Mocht het welkom-scherm toch verschijnen, ga dan door naar het platform.
    const naarPlatform = page.getByRole("button", { name: "Naar het platform" });
    if (await naarPlatform.isVisible().catch(() => false)) {
      await naarPlatform.click();
    }
    // Platform zichtbaar: de uitlogknop op de taakbalk (vast title-attribuut)
    // is de anker; in de kantooromgeving staat hij niet meer in de sidebar.
    await expect(page.getByTitle("Uitloggen")).toBeVisible({ timeout: INHOUD_TIMEOUT });
  });

  await test.step("Bekijken als: wissel naar een teamlid en zet terug", async () => {
    const trigger = page.getByRole("button", { name: /Eigen weergave/ });
    await expect(trigger).toBeVisible({ timeout: INHOUD_TIMEOUT });
    await trigger.click();

    const doelItem = page.getByRole("menuitem", { name: new RegExp(E2E_WW_TARGET_NAAM) });
    await expect(doelItem).toBeVisible({ timeout: INHOUD_TIMEOUT });
    await doelItem.click();

    // De weergave wisselt: de trigger toont nu het teamlid en we staan op "/".
    await expect(
      page.getByRole("button", { name: new RegExp(E2E_WW_TARGET_NAAM) }),
    ).toBeVisible({ timeout: INHOUD_TIMEOUT });
    await expect(page).toHaveURL(/\/$/);

    // Terug naar de eigen weergave.
    await page.getByRole("button", { name: new RegExp(E2E_WW_TARGET_NAAM) }).click();
    await page.getByRole("menuitem", { name: /Eigen weergave/ }).click();
    await expect(page.getByRole("button", { name: /Eigen weergave/ })).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });
  });

  await test.step("Verwijderde knoppen: geen Wachtwoord- of Taal-knop meer in het menu", async () => {
    await expect(page.getByTitle("Wachtwoord wijzigen")).toHaveCount(0);
    await expect(page.locator('button[title="Taal"]')).toHaveCount(0);
  });

  await test.step("Privacy: navigeert naar /mijn/privacy", async () => {
    await page.getByTitle("Privacy & transparantie").click();
    await expect(page).toHaveURL(/\/mijn\/privacy$/, { timeout: INHOUD_TIMEOUT });
    await expect(page.getByTitle("Uitloggen")).toBeVisible();
  });

  await test.step("App-informatie: navigeert naar /info", async () => {
    await page.getByTitle("App-informatie").click();
    await expect(page).toHaveURL(/\/info$/, { timeout: INHOUD_TIMEOUT });
    await expect(page.getByTitle("Uitloggen")).toBeVisible();
  });

  await test.step("Uitloggen (taakbalk): POST /auth/logout (204) en beland op het loginscherm", async () => {
    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/auth/logout") && r.request().method() === "POST",
        { timeout: INHOUD_TIMEOUT },
      ),
      page.getByTitle("Uitloggen").click(),
    ]);
    expect(resp.status()).toBe(204);

    // Sessie beëindigd: het loginscherm verschijnt weer.
    await expect(page.locator("#email")).toBeVisible({ timeout: 30_000 });
  });
});
