// Gedeelde helpers voor de web-wachtwoord-gate E2E-tests.
// Geïmporteerd door zowel het desktop- als mobiel-spec-bestand.
import { expect, test, type Page } from "@playwright/test";

import { setupApiProxy } from "./web-api-proxy";
import {
  E2E_WW_GATE_EMAIL,
  E2E_WW_GATE_WACHTWOORD,
  genereerVersGateTotp,
  wachtOpNieuwTotpVenster,
} from "../src/e2e-wachtwoord-testaccounts";

const INHOUD_TIMEOUT = 20_000;
const PORTAAL_TIMEOUT = 30_000;

export async function logInAlsGateGebruiker(page: Page): Promise<void> {
  await setupApiProxy(page);
  await page.goto("/");

  await expect(page.locator("#email")).toBeVisible({ timeout: 60_000 });
  await page.locator("#email").fill(E2E_WW_GATE_EMAIL);
  await page.locator("#wachtwoord").fill(E2E_WW_GATE_WACHTWOORD);

  for (let poging = 1; poging <= 3; poging++) {
    if (poging > 1) {
      await wachtOpNieuwTotpVenster();
      if (await page.locator("#email").isVisible().catch(() => false)) {
        await page.locator("#email").fill(E2E_WW_GATE_EMAIL);
        await page.locator("#wachtwoord").fill(E2E_WW_GATE_WACHTWOORD);
      }
    }

    if (await page.getByRole("button", { name: "Inloggen" }).isVisible()) {
      await page.getByRole("button", { name: "Inloggen" }).click();
    }

    try {
      await page.locator("[data-input-otp]").waitFor({ state: "attached", timeout: 15_000 });
    } catch {
      if (poging === 3) throw new Error("TOTP-invoer niet verschenen na 3 pogingen.");
      continue;
    }

    const code = await genereerVersGateTotp();
    await page.locator("[data-input-otp]").focus();
    await page.keyboard.type(code);

    try {
      await page.locator("[data-input-otp]").waitFor({ state: "detached", timeout: 15_000 });
      return;
    } catch {
      if (poging === 3) throw new Error("Inloggen mislukt na 3 pogingen (TOTP/login).");
    }
  }
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

    await expect(page.getByText("Wachtwoord gewijzigd. Een moment...")).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });

    await expect(
      page.getByRole("heading", { name: "Wachtwoord wijzigen vereist" }),
    ).not.toBeVisible({ timeout: PORTAAL_TIMEOUT });
    await expect(page.locator("#ww-huidig")).not.toBeVisible();

    const me = await page.request.get("/api/auth/me");
    expect(me.status()).toBe(200);
    const meBody = await me.json();
    expect(meBody.moet_wachtwoord_wijzigen).toBe(false);

    await expect(page.locator('[data-sidebar="trigger"]')).toBeAttached({
      timeout: PORTAAL_TIMEOUT,
    });

    await expect(page.locator("#email")).not.toBeVisible();
  });
}
