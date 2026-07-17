// E2E: firevault web-app — "Beheer wachtwoorden" (Gebruikers → Acties, alleen
// hoofdbeheerder). Test het admin-geïnitieerde wachtwoord-resetten (tijdelijk
// wachtwoord) en sessies beëindigen tegen een toegewijd doelaccount, zodat
// nooit een echt account van de gebruiker wordt geraakt.
//
// Draaien: pnpm --filter @workspace/scripts run e2e-web
// Vereist: lopende workflows api-server + firevault web, env DATABASE_URL en
// REPLIT_DEV_DOMAIN.
import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db, gebruikersTable } from "@workspace/db";
import { programmatischInloggen } from "./web-api-proxy";

import {
  E2E_WW_ADMIN_EMAIL,
  E2E_WW_ADMIN_WACHTWOORD,
  E2E_WW_ADMIN_TOTP_SECRET,
  E2E_WW_TARGET_EMAIL,
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

// Zoekt het doelaccount op via de zoekbalk zodat precies één kaart overblijft,
// en geeft de kaart + de "Acties"-knop daarbinnen terug.
async function vindDoelKaart(page: Page) {
  await page.goto("/gebruikers");
  await expect(page.getByPlaceholder("Naam, e-mail of functie...")).toBeVisible({
    timeout: INHOUD_TIMEOUT,
  });
  await page.getByPlaceholder("Naam, e-mail of functie...").fill(E2E_WW_TARGET_NAAM);

  // getByRole("button", { name: "Acties" }) ipv getByTitle("Acties"):
  // getByTitle matcht ook nieuwsticker-knoppen die title=<nieuwsartikel-titel>
  // hebben, wat een strict-mode-violation geeft als er meer dan één match is.
  const kaart = page
    .locator("div")
    .filter({ hasText: E2E_WW_TARGET_NAAM })
    .filter({ has: page.getByTitle("Acties", { exact: true }) })
    .first();
  await expect(kaart).toBeVisible({ timeout: INHOUD_TIMEOUT });
  return kaart;
}

// ── Setup ─────────────────────────────────────────────────────────────────────
test.beforeAll(async () => {
  await setupE2eWachtwoordAccounts();
});

// ── Spec ──────────────────────────────────────────────────────────────────────
test("Web: Beheer wachtwoorden — sessies beëindigen en wachtwoord resetten (tijdelijk)", async ({ page }) => {
  await test.step("login als hoofdbeheerder met verplichte TOTP", async () => {
    await logIn(page);
  });

  await test.step("sessies beëindigen voor het doelaccount", async () => {
    const kaart = await vindDoelKaart(page);
    await kaart.getByTitle("Acties", { exact: true }).click();
    await page.getByRole("menuitem", { name: /Sessies beëindigen/i }).click();

    await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: INHOUD_TIMEOUT });
    await page.getByRole("button", { name: /^Sessies beëindigen$/ }).click();

    // Dialoog sluit weer zodra de actie is afgerond.
    await expect(page.getByRole("alertdialog")).not.toBeVisible({ timeout: INHOUD_TIMEOUT });
  });

  await test.step("wachtwoord resetten via tijdelijk wachtwoord", async () => {
    const kaart = await vindDoelKaart(page);
    await kaart.getByTitle("Acties", { exact: true }).click();
    await page.getByRole("menuitem", { name: /Wachtwoord resetten/i }).click();

    await expect(page.getByRole("dialog")).toBeVisible({ timeout: INHOUD_TIMEOUT });
    await page.getByText("Tijdelijk wachtwoord genereren").click();
    await page.getByRole("button", { name: "Resetten" }).click();

    // Resultaatweergave: eenmalig tijdelijk wachtwoord + kopieerknop.
    await expect(page.locator("code")).toBeVisible({ timeout: INHOUD_TIMEOUT });
    const tijdelijkWachtwoord = (await page.locator("code").textContent())?.trim();
    expect(tijdelijkWachtwoord?.length ?? 0).toBeGreaterThan(0);
    await expect(page.getByTitle("Kopiëren")).toBeVisible();

    await page.getByRole("button", { name: "Sluiten" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: INHOUD_TIMEOUT });
  });

  await test.step("badge 'Wachtwoord wijzigen vereist' verschijnt na reset", async () => {
    const kaart = await vindDoelKaart(page);
    await expect(kaart.getByText("Wachtwoord wijzigen vereist")).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });
  });

  await test.step("Account ontgrendelen is niet zichtbaar (doelaccount niet vergrendeld)", async () => {
    const kaart = await vindDoelKaart(page);
    await kaart.getByTitle("Acties", { exact: true }).click();
    await expect(page.getByRole("menuitem", { name: /Wachtwoord resetten/i })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /Account ontgrendelen/i })).toHaveCount(0);
    await page.keyboard.press("Escape");
  });
});

// Regressietest: het wachtwoordveld in de bewerkdialoog werd voorheen stilzwijgend
// genegeerd (niet meegestuurd in de PATCH). Deze test bewijst op UI-niveau dat een
// via "Bewerken" ingevuld wachtwoord daadwerkelijk als bcrypt-hash wordt opgeslagen
// en dat er vervolgens mee ingelogd kan worden.
test("Web: Gebruiker bewerken — nieuw wachtwoord wordt opgeslagen en werkt (regressie)", async ({ page }) => {
  const nieuwWachtwoord = `E2eBewerk!${Date.now()}`;

  const [voor] = await db
    .select({ wachtwoord: gebruikersTable.wachtwoord })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.email, E2E_WW_TARGET_EMAIL));
  expect(voor).toBeTruthy();

  await test.step("login als hoofdbeheerder met verplichte TOTP", async () => {
    await logIn(page);
  });

  await test.step("bewerkdialoog: nieuw wachtwoord invullen en opslaan", async () => {
    const kaart = await vindDoelKaart(page);
    await kaart.getByTitle("Bewerken").click();

    await expect(page.getByRole("dialog")).toBeVisible({ timeout: INHOUD_TIMEOUT });
    await page.locator("#g-wachtwoord").fill(nieuwWachtwoord);
    await page.getByRole("button", { name: "Wijzigingen opslaan" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: INHOUD_TIMEOUT });
  });

  await test.step("database bevat een nieuwe bcrypt-hash", async () => {
    const [na] = await db
      .select({ wachtwoord: gebruikersTable.wachtwoord })
      .from(gebruikersTable)
      .where(eq(gebruikersTable.email, E2E_WW_TARGET_EMAIL));
    expect(na?.wachtwoord ?? "").toMatch(/^\$2[aby]\$/);
    expect(na?.wachtwoord).not.toBe(voor?.wachtwoord);
  });

  await test.step("inloggen met het nieuwe wachtwoord slaagt (setup_2fa)", async () => {
    const res = await page.request.post("/api/auth/login", {
      data: { email: E2E_WW_TARGET_EMAIL, wachtwoord: nieuwWachtwoord },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).status).toBe("setup_2fa");
  });
});
