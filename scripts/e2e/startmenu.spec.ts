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

const SLEUTELS = ["gebouwen", "planning", "personeel", "uren", "berichten"] as const;

// Lichte inhoudscontrole per route: bovenop de URL-check verifiëren we dat het
// doelscherm zijn eigen inhoud daadwerkelijk rendert (een kop of een lijstitem),
// zodat een regressie waarbij de route klopt maar het scherm leeg blijft of crasht
// alsnog wordt opgemerkt. De checks zijn opzettelijk data-onafhankelijk zodat de
// test stabiel blijft ongeacht de dev-database.
const INHOUD_TIMEOUT = 20_000;

// expo-router houdt het vorige scherm (o.a. het radiale menu met labels als
// "Planning", "Berichten") gemount maar verborgen in de DOM. getByText doet
// substring-matching en zou anders op die verborgen kopieën aanslaan, dus we
// filteren overal expliciet op zichtbare elementen.
function zichtbareTekst(page: Page, tekst: string | RegExp) {
  return page.getByText(tekst).filter({ visible: true });
}

async function controleerGebouwen(page: Page): Promise<void> {
  // Distinctief kop-/body-element van het gebouwenscherm.
  await expect(page.getByPlaceholder("Zoek gebouw, adres of stad…")).toBeVisible({
    timeout: INHOUD_TIMEOUT,
  });
  // Lijst geladen: óf een gebouwkaart (spot-badge) óf de lege-staat.
  const lijstitem = zichtbareTekst(page, /\d+\s+spots?\b/);
  const leeg = zichtbareTekst(page, "Geen gebouwen gevonden");
  await expect(lijstitem.first().or(leeg.first())).toBeVisible({ timeout: INHOUD_TIMEOUT });
}

async function controleerPersoneel(page: Page): Promise<void> {
  await expect(zichtbareTekst(page, "Personeel").first()).toBeVisible({ timeout: INHOUD_TIMEOUT });
  // HRM-overzichtskaarten verschijnen ongeacht de aantallen.
  await expect(zichtbareTekst(page, "Medewerkers").first()).toBeVisible({ timeout: INHOUD_TIMEOUT });
}

async function controleerPlanning(page: Page): Promise<void> {
  // Routeplanning rendert zijn eigen scherm (kop), niet langer een placeholder.
  await expect(zichtbareTekst(page, "Routeplanning").first()).toBeVisible({
    timeout: INHOUD_TIMEOUT,
  });
}

async function controleerUren(page: Page): Promise<void> {
  await expect(zichtbareTekst(page, "Urenregistratie").first()).toBeVisible({
    timeout: INHOUD_TIMEOUT,
  });
}

async function controleerBerichten(page: Page): Promise<void> {
  await expect(zichtbareTekst(page, "Berichten").first()).toBeVisible({ timeout: INHOUD_TIMEOUT });
  // De Toolbox-tab is altijd aanwezig, ongeacht of er berichten zijn.
  await expect(zichtbareTekst(page, "Toolbox").first()).toBeVisible({ timeout: INHOUD_TIMEOUT });
}

const ROUTES: {
  sleutel: string;
  route: RegExp;
  controleerInhoud: (page: Page) => Promise<void>;
}[] = [
  { sleutel: "gebouwen", route: /\/gebouwen(\b|\?|$)/, controleerInhoud: controleerGebouwen },
  { sleutel: "planning", route: /\/planning(\b|\?|$)/, controleerInhoud: controleerPlanning },
  { sleutel: "personeel", route: /\/hrm(\b|\?|$)/, controleerInhoud: controleerPersoneel },
  { sleutel: "uren", route: /\/uren(\b|\?|$)/, controleerInhoud: controleerUren },
  { sleutel: "berichten", route: /\/berichten(\b|\?|$)/, controleerInhoud: controleerBerichten },
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

  await test.step("header en vijf menu-items zichtbaar", async () => {
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

  await test.step("elk item linkt naar de juiste route én toont zijn inhoud", async () => {
    for (const { sleutel, route, controleerInhoud } of ROUTES) {
      await zorgWaaierOpen(page);
      await page.getByTestId(`radiaal-${sleutel}`).click();
      await expect(page).toHaveURL(route);
      await controleerInhoud(page);
      await page.goBack();
      await expect(page.getByTestId("radiaal-fps")).toBeVisible();
    }
  });
});
