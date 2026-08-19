// E2E: firevault web-app — gebruikersmenu (taakbalk) + Instellingen-pagina.
// Bewijst per knop dat hij werkt (business-scenario-validatie, Kwaliteitskader):
//   - Bekijken als (alleen hoofdbeheerder): wisselt weergave en zet terug
//   - Privacy: navigeert via /instellingen naar /mijn/privacy
//     (Privacy & App-informatie zijn verplaatst van sidebar-footer naar
//      Instellingen-pagina, Ondersteuning-groep — 2026-07-14)
//   - App-informatie: navigeert via /instellingen naar /info
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

import { programmatischInloggen } from "./web-api-proxy";
import {
  E2E_WW_ADMIN_EMAIL,
  E2E_WW_ADMIN_WACHTWOORD,
  E2E_WW_ADMIN_TOTP_SECRET,
  E2E_WW_TARGET_NAAM,
  setupE2eWachtwoordAccounts,
} from "../src/e2e-wachtwoord-testaccounts";

const INHOUD_TIMEOUT = 20_000;

async function logIn(page: Page): Promise<void> {
  await programmatischInloggen(
    page,
    E2E_WW_ADMIN_EMAIL,
    E2E_WW_ADMIN_WACHTWOORD,
    E2E_WW_ADMIN_TOTP_SECRET,
  );
  await page.goto("/");
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
      window.localStorage.setItem("fps_onboarding_voltooid", "true");
    } catch {
      // localStorage niet beschikbaar — dan valt de test terug op de knop.
    }
  });

  await test.step("login als hoofdbeheerder met verplichte TOTP", async () => {
    await logIn(page);
    // Als het welkom-scherm verschijnt (fps.welkom.afgerond soms niet opgepikt
    // vóór de eerste goto), wacht dan actief op de knop en klik hem.
    const naarPlatform = page.getByRole("button", { name: "Naar het platform" });
    try {
      await naarPlatform.waitFor({ state: "visible", timeout: 5_000 });
      await naarPlatform.click();
    } catch {
      // Scherm verscheen niet — al op het platform.
    }
    // Platform zichtbaar: wacht op de sidebar (altijd aanwezig na login).
    await expect(page.locator('[data-sidebar="sidebar"]').first()).toBeAttached({ timeout: 30_000 });
    // NieuwsTicker laadt async — wacht op de uitlogknop.
    await expect(page.getByTitle("Uitloggen").first()).toBeVisible({ timeout: 15_000 });
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

  await test.step("Bekijken als: portaal zonder rechten biedt altijd een weg terug", async () => {
    await page.evaluate(() => {
      window.localStorage.setItem(
        "fps.bekijkenAlsPersoon",
        JSON.stringify({
          id: 999_999_999,
          naam: "Testpersoon zonder toegang",
          rol: "gebruiker",
          functietitels: [],
          bevoegdheden: {},
        }),
      );
    });
    await page.reload();

    await expect(page.getByRole("heading", { name: "Geen toegang" })).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });
    await page.getByRole("button", { name: "Terug naar mijn eigen weergave" }).click();
    // Een vers E2E-profiel kan na de rolwissel opnieuw op het eenmalige
    // welkomscherm landen. Dat staat los van Bekijken als; rond het af en
    // controleer daarna de werkelijk herstelde eigen weergave.
    const naarPlatform = page.getByRole("button", { name: "Naar het platform" });
    if (await naarPlatform.isVisible().catch(() => false)) {
      await naarPlatform.click();
    }
    await expect(page.getByRole("button", { name: /Eigen weergave/ })).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });
    await expect.poll(
      () => page.evaluate(() => window.localStorage.getItem("fps.bekijkenAlsPersoon")),
    ).toBeNull();
  });

  await test.step("Verwijderde knoppen: geen Wachtwoord- of Taal-knop meer in het menu", async () => {
    await expect(page.getByTitle("Wachtwoord wijzigen")).toHaveCount(0);
    await expect(page.locator('button[title="Taal"]')).toHaveCount(0);
  });

  await test.step("Privacy: navigeert via Instellingen naar /mijn/privacy", async () => {
    // Privacy & transparantie staat nu op de Instellingen-pagina (Ondersteuning-groep).
    await page.goto("/instellingen");
    await expect(page.getByRole("link", { name: /Privacy & transparantie/ })).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });
    await page.getByRole("link", { name: /Privacy & transparantie/ }).click();
    await expect(page).toHaveURL(/\/mijn\/privacy$/, { timeout: INHOUD_TIMEOUT });
    await expect(page.getByTitle("Uitloggen")).toBeVisible();
  });

  await test.step("App-informatie: navigeert via Instellingen naar /info", async () => {
    // App-informatie staat nu op de Instellingen-pagina (Ondersteuning-groep).
    await page.goto("/instellingen");
    await expect(page.getByRole("link", { name: /App-informatie/ })).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });
    await page.getByRole("link", { name: /App-informatie/ }).click();
    await expect(page).toHaveURL(/\/info$/, { timeout: INHOUD_TIMEOUT });
    await expect(page.getByTitle("Uitloggen")).toBeVisible();
  });

  await test.step("Uitloggen (taakbalk): POST /auth/logout (204) en beland op het loginscherm", async () => {
    await page.evaluate(() => {
      window.localStorage.setItem(
        "fps.bekijkenAlsPersoon",
        JSON.stringify({
          id: 999_999_999,
          naam: "Achtergebleven weergave",
          rol: "gebruiker",
          functietitels: [],
          bevoegdheden: {},
        }),
      );
    });
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
    await expect.poll(
      () => page.evaluate(() => window.localStorage.getItem("fps.bekijkenAlsPersoon")),
    ).toBeNull();
  });
});
