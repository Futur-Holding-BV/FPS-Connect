// Gedeelde helpers voor de web-wachtwoord-gate E2E-tests.
// Geïmporteerd door zowel het desktop- als mobiel-spec-bestand.
import { expect, test, type Page } from "@playwright/test";

import { programmatischInloggen } from "./web-api-proxy";
import {
  E2E_WW_GATE_EMAIL,
  E2E_WW_GATE_WACHTWOORD,
  E2E_WW_GATE_TOTP_SECRET,
} from "../src/e2e-wachtwoord-testaccounts";

const INHOUD_TIMEOUT = 20_000;
const PORTAAL_TIMEOUT = 30_000;

export async function logInAlsGateGebruiker(page: Page): Promise<void> {
  await programmatischInloggen(
    page,
    E2E_WW_GATE_EMAIL,
    E2E_WW_GATE_WACHTWOORD,
    E2E_WW_GATE_TOTP_SECRET,
  );
  await page.goto("/");
}

export async function voerGateScenarioUit(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("fps.welkom.afgerond", "true");
    localStorage.setItem("fps_onboarding_voltooid", "true");
  });

  await test.step("login als gebruiker met moetWachtwoordWijzigen=true", async () => {
    await logInAlsGateGebruiker(page);
  });

  await test.step("gate-scherm is getoond — portaalinhoud niet zichtbaar", async () => {
    await expect(page.getByRole("heading", { name: "Wachtwoord wijzigen vereist" })).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });
    await expect(page.locator("#ww-huidig")).toBeVisible({ timeout: INHOUD_TIMEOUT });
    await expect(page.locator("#ww-nieuw")).toBeVisible();
    await expect(page.locator("#ww-bevestig")).toBeVisible();
    await expect(page.getByText("Uw account vereist een wachtwoordwijziging")).toBeVisible();
    await expect(page.locator("#email")).not.toBeVisible();
  });

  await test.step("wachtwoorden komen niet overeen → foutmelding", async () => {
    await page.locator("#ww-huidig").fill(E2E_WW_GATE_WACHTWOORD);
    await page.locator("#ww-nieuw").fill("NieuwWachtwoord!99");
    await page.locator("#ww-bevestig").fill("AnderWachtwoord!99");
    await page.getByRole("button", { name: "Wachtwoord instellen" }).click();

    await expect(page.getByText("De nieuwe wachtwoorden komen niet overeen.")).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });
    await expect(page.getByRole("heading", { name: "Wachtwoord wijzigen vereist" })).toBeVisible();
  });

  await test.step("onjuist huidig wachtwoord → foutmelding", async () => {
    await page.locator("#ww-huidig").fill("FoutHuidigWachtwoord!1");
    await page.locator("#ww-nieuw").fill("NieuwGeldigWachtwoord!1");
    await page.locator("#ww-bevestig").fill("NieuwGeldigWachtwoord!1");
    await page.getByRole("button", { name: "Wachtwoord instellen" }).click();

    await expect(
      page.getByText(
        "Huidig wachtwoord is onjuist of het nieuwe wachtwoord voldoet niet aan de eisen",
      ),
    ).toBeVisible({ timeout: INHOUD_TIMEOUT });
    await expect(page.getByRole("heading", { name: "Wachtwoord wijzigen vereist" })).toBeVisible();
  });

  const nieuwWachtwoord = "NieuwGeldigGate!2026";
  await test.step("geldig nieuw wachtwoord → portaal is bereikbaar (gate verdwijnt)", async () => {
    await page.locator("#ww-huidig").fill(E2E_WW_GATE_WACHTWOORD);
    await page.locator("#ww-nieuw").fill(nieuwWachtwoord);
    await page.locator("#ww-bevestig").fill(nieuwWachtwoord);
    await page.getByRole("button", { name: "Wachtwoord instellen" }).click();

    // "Wachtwoord gewijzigd" toast is ephemeral: window.location.assign()
    // herlaadt de pagina onmiddellijk na isSuccess → toast kan al weg zijn
    // vóór Playwright hem kan vangen. Wacht alleen op verdwijning van de gate.
    // (Optioneel: vang de toast als hij wél zichtbaar is.)
    await page.getByText("Wachtwoord gewijzigd. Een moment...").waitFor({ state: "visible", timeout: 5_000 }).catch(() => {
      // Toast al weg — page.location.assign heeft de herlaad al gestart.
    });

    await expect(
      page.getByRole("heading", { name: "Wachtwoord wijzigen vereist" }),
    ).not.toBeVisible({ timeout: PORTAAL_TIMEOUT });
    await expect(page.locator("#ww-huidig")).not.toBeVisible();

    const me = await page.request.get("/api/auth/me");
    expect(me.status()).toBe(200);
    const meBody = await me.json();
    expect(meBody.moet_wachtwoord_wijzigen).toBe(false);

    await expect(page.locator('[data-sidebar="trigger"]').first()).toBeAttached({
      timeout: PORTAAL_TIMEOUT,
    });

    await expect(page.locator("#email")).not.toBeVisible();
  });
}
