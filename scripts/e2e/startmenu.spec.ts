// E2E: FPS radiaal startmenu (login + waaier + doorlinken).
//
// Controleert dat het startmenu achter de verplichte TOTP-login opent en correct
// doorlinkt. Draait tegen de draaiende Expo monteur-app op het Expo dev-domein.
//
// Draaien: pnpm --filter @workspace/scripts run e2e-monteur
// Vereist: lopende workflows api-server + expo monteur-app, env DATABASE_URL en
// REPLIT_EXPO_DEV_DOMAIN.
import { expect, test, type Page } from "@playwright/test";

import {
  E2E_EMAIL,
  E2E_WACHTWOORD,
  genereerVersTotp,
  setupE2eAccount,
  wachtOpNieuwTotpVenster,
} from "../src/e2e-monteur-testaccount";

const SLEUTELS = ["gebouwen", "personeel", "uren", "planning", "fabrikanten", "berichten"] as const;

const ROUTES: { sleutel: string; route: RegExp }[] = [
  { sleutel: "gebouwen", route: /\/gebouwen(\b|\?|$)/ },
  { sleutel: "personeel", route: /\/hrm(\b|\?|$)/ },
  { sleutel: "fabrikanten", route: /\/fabrikanten(\b|\?|$)/ },
  { sleutel: "uren", route: /\/binnenkort(\b|\?|$)/ },
  { sleutel: "planning", route: /\/binnenkort(\b|\?|$)/ },
  { sleutel: "berichten", route: /\/binnenkort(\b|\?|$)/ },
];

const HULPTEKST = "Tik op FPS om het menu te openen";

test.beforeAll(async () => {
  await setupE2eAccount();
});

// Logt in via de UI met een verse TOTP-code. Bij een mislukte poging (bijv. code
// verlopen tijdens een trage koude load) wordt in een nieuw venster opnieuw
// geprobeerd.
async function logIn(page: Page): Promise<void> {
  await page.goto("/");

  const inputs = page.locator("input");
  await expect(inputs.nth(0)).toBeVisible({ timeout: 60_000 });
  await inputs.nth(0).fill(E2E_EMAIL);
  await inputs.nth(1).fill(E2E_WACHTWOORD);

  const fps = page.getByTestId("radiaal-fps");

  for (let poging = 1; poging <= 3; poging++) {
    if (poging > 1) await wachtOpNieuwTotpVenster();
    const code = await genereerVersTotp();
    await inputs.nth(2).fill("");
    await inputs.nth(2).fill(code);
    await page.getByText("Inloggen", { exact: true }).click();

    try {
      await expect(fps).toBeVisible({ timeout: 25_000 });
      return;
    } catch {
      if (poging === 3) {
        throw new Error("Inloggen mislukt na 3 pogingen (TOTP/login).");
      }
    }
  }
}

// Zorgt dat de waaier open staat (de zes items + Sluiten-knop zichtbaar).
async function zorgWaaierOpen(page: Page): Promise<void> {
  await expect(page.getByTestId("radiaal-fps")).toBeVisible();
  const sluiten = page.getByTestId("radiaal-sluiten");
  if ((await sluiten.count()) === 0) {
    await page.getByTestId("radiaal-fps").click();
  }
  await expect(sluiten).toBeVisible();
}

test("FPS startmenu: login, waaier en doorlinken", async ({ page }) => {
  await test.step("login met verplichte TOTP", async () => {
    await logIn(page);
  });

  await test.step("header en zes menu-items zichtbaar", async () => {
    await expect(page.getByText("E2E Test Monteur")).toBeVisible();
    for (const sleutel of SLEUTELS) {
      await expect(page.getByTestId(`radiaal-${sleutel}`)).toBeVisible();
    }
    await expect(page.getByTestId("radiaal-sluiten")).toBeVisible();
  });

  await test.step("waaier sluiten toont hulptekst", async () => {
    await page.getByTestId("radiaal-sluiten").click();
    await expect(page.getByText(HULPTEKST)).toBeVisible();
    await expect(page.getByTestId("radiaal-sluiten")).toHaveCount(0);
  });

  await test.step("FPS-knop heropent de waaier", async () => {
    await page.getByTestId("radiaal-fps").click();
    await expect(page.getByTestId("radiaal-sluiten")).toBeVisible();
    for (const sleutel of SLEUTELS) {
      await expect(page.getByTestId(`radiaal-${sleutel}`)).toBeVisible();
    }
  });

  await test.step("elk item linkt naar de juiste route", async () => {
    for (const { sleutel, route } of ROUTES) {
      await zorgWaaierOpen(page);
      await page.getByTestId(`radiaal-${sleutel}`).click();
      await expect(page).toHaveURL(route);
      await page.goBack();
      await expect(page.getByTestId("radiaal-fps")).toBeVisible();
    }
  });
});
