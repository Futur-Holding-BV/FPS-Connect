// E2E: firevault web-app — ENK-import volledige businessflow (regressietest).
//
// Borgt de flow uit modules/calculatie/import.tsx: upload van een echte
// ENK-PDF → analyse → controlescherm met totaalvergelijking (ENK € 165.463,74
// vs Connect € 165.463,73, verschil € 0,01) → keuze "ENK-totaal aanhouden"
// → calculatie aanmaken met zichtbare correctieregel → detailpagina toont
// het geïmporteerde bronbestand in de projectgegevens-strip.
//
// Opruiming: aangemaakte bronbestanden en calculatie worden na afloop (ook
// bij falen) direct via de database verwijderd — bewust niet via de API
// (governance-middleware blokkeert "kritieke" deletes zonder sessierol).
//
// Draaien: pnpm --filter @workspace/scripts run e2e-web
// Vereist: lopende workflows api-server + firevault web, env DATABASE_URL en
// REPLIT_DEV_DOMAIN.
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";

import {
  db,
  modCalcBronbestandenTable,
  modCalcHeadersTable,
  modCalcRegelsTable,
} from "@workspace/db";

import {
  E2E_WEB_ADMIN_EMAIL,
  E2E_WEB_ADMIN_WACHTWOORD,
  genereerVersWebAdminTotp,
  setupE2eWebAdminAccount,
  wachtOpNieuwTotpVenster,
} from "../src/e2e-monteur-testaccount";

const INHOUD_TIMEOUT = 30_000;
const PDF_PAD = resolve(
  new URL("../../", import.meta.url).pathname,
  "attached_assets/begroting_120_woningen_omgeving_Bartokstraat_Almelo_-_Akor_1781209311666.pdf",
);

// ── Login ────────────────────────────────────────────────────────────────────
// De web-login verloopt in twee stappen: e-mail + wachtwoord → TOTP-verificatie.
async function logIn(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("#email")).toBeVisible({ timeout: 60_000 });

  await page.locator("#email").fill(E2E_WEB_ADMIN_EMAIL);
  await page.locator("#wachtwoord").fill(E2E_WEB_ADMIN_WACHTWOORD);

  for (let poging = 1; poging <= 3; poging++) {
    if (poging > 1) {
      await wachtOpNieuwTotpVenster();
      if (await page.locator("#email").isVisible().catch(() => false)) {
        await page.locator("#email").fill(E2E_WEB_ADMIN_EMAIL);
        await page.locator("#wachtwoord").fill(E2E_WEB_ADMIN_WACHTWOORD);
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

    const code = await genereerVersWebAdminTotp();
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

// ── Setup & opruiming ─────────────────────────────────────────────────────────
test.beforeAll(async () => {
  await setupE2eWebAdminAccount();
});

let aangemaakteCalcId: number | null = null;

test.afterEach(async () => {
  try {
    // Bronbestanden van deze run verwijderen (herkenbaar aan het vaste
    // ENK-calculatienummer uit de testbijlage).
    const bronnen = await db
      .select({ id: modCalcBronbestandenTable.id })
      .from(modCalcBronbestandenTable)
      .where(eq(modCalcBronbestandenTable.calculatienummer, "FPS-BP-00098"));
    if (bronnen.length > 0) {
      await db
        .delete(modCalcBronbestandenTable)
        .where(inArray(modCalcBronbestandenTable.id, bronnen.map((b) => b.id)));
    }
    if (aangemaakteCalcId != null) {
      await db.delete(modCalcRegelsTable).where(eq(modCalcRegelsTable.calculatieId, aangemaakteCalcId));
      await db.delete(modCalcHeadersTable).where(eq(modCalcHeadersTable.id, aangemaakteCalcId));
    }
  } catch (err) {
    console.warn(`[web-enk-import] Opruimen mislukt: ${(err as Error).message}`);
  }
  aangemaakteCalcId = null;
});

// ── Spec ──────────────────────────────────────────────────────────────────────
test("Web: ENK-PDF importeren — analyse, totaalvergelijking en calculatie met correctieregel", async ({
  page,
}) => {
  test.setTimeout(180_000);

  await test.step("login met verplichte TOTP", async () => {
    await logIn(page);
  });

  await test.step("calculatie-overzicht: knop 'ENK-import' opent het uploadscherm", async () => {
    await page.goto("/modules/calculatie");
    await expect(page.getByRole("button", { name: "ENK-import" })).toBeVisible({ timeout: INHOUD_TIMEOUT });
    await page.getByRole("button", { name: "ENK-import" }).click();
    await expect(page.getByText("Sleep een ENK-bestand hierheen")).toBeVisible({ timeout: INHOUD_TIMEOUT });
    // Bibliotheek-sectie is aanwezig op het uploadscherm.
    await expect(page.getByText("Bronbestanden-bibliotheek")).toBeVisible();
  });

  await test.step("PDF uploaden: analyse toont herkende gegevens en totaalvergelijking", async () => {
    // Er zijn twee file-inputs (globale slim-upload-balk + import-dropzone);
    // selecteer op het accept-attribuut van de import-dropzone.
    await page.locator('input[type="file"][accept=".pdf,.csv,.xlsx,.xls"]').setInputFiles(PDF_PAD);

    // Controlescherm verschijnt na de analyse (PDF-parse kan even duren).
    await expect(page.getByRole("heading", { name: "Import controleren" })).toBeVisible({ timeout: 60_000 });

    // Herkende kopgegevens uit de echte ENK-PDF.
    await expect(page.getByText("FPS-BP-00098")).toBeVisible();
    await expect(page.getByText("BPC-00091")).toBeVisible();

    // Totaalvergelijking: ENK € 165.463,74 vs Connect € 165.463,73, verschil € 0,01.
    await expect(page.getByText("Totaal volgens ENK-bestand")).toBeVisible();
    await expect(page.getByText(/165\.463,74/).first()).toBeVisible();
    await expect(page.getByText(/165\.463,73/).first()).toBeVisible();
    await expect(page.getByText("Verschil")).toBeVisible();

    // Keuzeblok met zichtbare-correctieregel-uitleg (standaardkeuze = ENK).
    await expect(page.getByText("Welk totaal moet de calculatie krijgen?")).toBeVisible();
    await expect(page.getByText(/zichtbare correctieregel van/)).toBeVisible();
  });

  await test.step("bevestigen: calculatie wordt aangemaakt en detailpagina opent", async () => {
    await page.getByRole("button", { name: "Calculatie aanmaken" }).click();

    // Redirect naar /modules/calculatie/:id.
    await page.waitForURL(/\/modules\/calculatie\/\d+$/, { timeout: 60_000 });
    const match = page.url().match(/\/modules\/calculatie\/(\d+)$/);
    aangemaakteCalcId = match ? Number(match[1]) : null;
    expect(aangemaakteCalcId).not.toBeNull();

    // Projectgegevens-strip toont het geïmporteerde bronbestand.
    await expect(page.getByText("Geïmporteerd uit:")).toBeVisible({ timeout: INHOUD_TIMEOUT });
    await expect(page.getByText(/begroting_120_woningen/).first()).toBeVisible();
  });

  await test.step("DB-bewijs: correctieregel van € 0,01 aanwezig", async () => {
    const regels = await db
      .select()
      .from(modCalcRegelsTable)
      .where(eq(modCalcRegelsTable.calculatieId, aangemaakteCalcId!));
    const correctie = regels.filter((r) => r.isStaartkosten);
    expect(correctie.length).toBe(1);
    expect(Math.abs(correctie[0].totaal - 0.01)).toBeLessThan(0.001);
    const geprijsd = regels.filter((r) => !r.isStaartkosten && r.totaal !== 0);
    expect(geprijsd.length).toBe(26);
  });
});
