// E2E: firevault web-app — inbox geconsolideerd-toggle en opslaglocatie update.
//
// Controleert dat het aan/uitzetten van de geconsolideerd-schakelaar op de
// inbox-detailpagina de opslaglocatie in de UI correct bijwerkt:
//   - Aan  → "Geconsolideerde jaarrekeningen"
//   - Uit  → "Jaarrekeningen"
//
// Draaien: pnpm --filter @workspace/scripts run e2e-web
// Vereist: lopende workflows api-server + firevault web, env DATABASE_URL en
// REPLIT_DEV_DOMAIN.
import { expect, test, type Page } from "@playwright/test";
import { eq, sql } from "drizzle-orm";

import { db, inboxItemsTable } from "@workspace/db";

import {
  E2E_WW_ADMIN_EMAIL,
  E2E_WW_ADMIN_WACHTWOORD,
  genereerVersAdminTotp,
  setupE2eWachtwoordAccounts,
  wachtOpNieuwTotpVenster,
} from "../src/e2e-wachtwoord-testaccounts";

const INHOUD_TIMEOUT = 20_000;

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

let testItemId: number | null = null;

test.beforeAll(async () => {
  await setupE2eWachtwoordAccounts();

  // Gebruik een raw SQL-insert zodat ontbrekende (nog niet gepushte) kolommen
  // geen "column does not exist"-fout geven. Alleen kolommen die gegarandeerd
  // bestaan worden opgegeven; de rest krijgt hun DEFAULT-waarde.
  const bestandsnaam = `e2e-jaarrekening-${Date.now()}.pdf`;
  const rijen = await db.execute<{ id: number }>(sql`
    INSERT INTO inbox_items (
      bestandsnaam, bestandspad, status, document_categorie,
      bestemming, ai_geconsolideerd, ai_opslaglocatie, bijgewerkt_op
    ) VALUES (
      ${bestandsnaam}, 'e2e/test-jaarrekening.pdf', 'geanalyseerd', 'jaarrekening',
      'Financieel', false, ${"Archief → Jaarrekeningen → jaar onbekend"}, NOW()
    )
    RETURNING id
  `);
  const id = (rijen.rows[0] as { id: number } | undefined)?.id;
  if (id === undefined) throw new Error("Test inbox-item kon niet worden aangemaakt.");
  testItemId = id;
});

test.afterAll(async () => {
  if (testItemId !== null) {
    await db.delete(inboxItemsTable).where(eq(inboxItemsTable.id, testItemId));
  }
});

test("geconsolideerd toggle werkt end-to-end: aan → Geconsolideerde jaarrekeningen", async ({ page }) => {
  if (testItemId === null) throw new Error("Test-item niet aangemaakt in beforeAll.");
  await logIn(page);

  await page.goto(`/inbox/${testItemId}`);

  // Wacht tot de pagina geladen is (opslaglocatie-sectie is zichtbaar).
  await expect(page.getByText("Opslaglocatie")).toBeVisible({ timeout: INHOUD_TIMEOUT });

  // Controleer de begintoestand: enkelvoudig (niet-geconsolideerd).
  await expect(page.getByText("Enkelvoudig (enkele entiteit)")).toBeVisible();

  // Toggle aan: klik de schakelaar zodat geconsolideerd = true.
  const schakelaar = page.locator('[id="geconsolideerd-toggle"]');
  await expect(schakelaar).toBeVisible();
  await schakelaar.click();

  // Na het opslaan (PATCH) moet de opslaglocatie bijgewerkt zijn.
  await expect(page.getByText("Geconsolideerde jaarrekeningen")).toBeVisible({
    timeout: INHOUD_TIMEOUT,
  });
  await expect(page.getByText("Geconsolideerd (groep/holding)")).toBeVisible();
});

test("geconsolideerd toggle werkt end-to-end: uit → Jaarrekeningen (enkelvoudig)", async ({ page }) => {
  if (testItemId === null) throw new Error("Test-item niet aangemaakt in beforeAll.");
  await logIn(page);

  // Zet eerst geconsolideerd = true via de API (zodat we terug kunnen schakelen).
  await page.request.patch(`/api/inbox/items/${testItemId}`, {
    data: { ai_geconsolideerd: true },
  });

  await page.goto(`/inbox/${testItemId}`);
  await expect(page.getByText("Opslaglocatie")).toBeVisible({ timeout: INHOUD_TIMEOUT });
  await expect(page.getByText("Geconsolideerd (groep/holding)")).toBeVisible();

  // Toggle uit: klik de schakelaar zodat geconsolideerd = false.
  const schakelaar = page.locator('[id="geconsolideerd-toggle"]');
  await expect(schakelaar).toBeVisible();
  await schakelaar.click();

  // Na het opslaan moet de opslaglocatie terugkeren naar "Jaarrekeningen".
  await expect(page.getByText("Enkelvoudig (enkele entiteit)")).toBeVisible({
    timeout: INHOUD_TIMEOUT,
  });
  // "Geconsolideerde jaarrekeningen" mag niet meer zichtbaar zijn.
  await expect(page.getByText("Geconsolideerde jaarrekeningen")).not.toBeVisible({
    timeout: INHOUD_TIMEOUT,
  });
});
