// E2E: firevault web-app — gebouw aanmaken en direct openen (regressietest).
//
// Borgt de flow uit gebouw-aanmaken-dialog.tsx: na "Gebouw opslaan" wordt de
// gebruiker direct doorgestuurd naar de detailpagina /gebouwen/:id van het
// zojuist aangemaakte gebouw (leunt op de returnwaarde van de create-mutatie
// en op wouter-navigatie na het sluiten van de dialoog). Daarnaast wordt
// gecontroleerd dat het gebouw bij terugkeer in de gebouwenlijst verschijnt.
//
// Opruiming: het testgebouw wordt na afloop (ook bij falen) direct via de
// database verwijderd. Bewust NIET via DELETE /api/gebouwen/:id: de
// governance-middleware classificeert dat als "kritiek" en blokkeert het
// (de sessie bevat geen rol, dus ook een hoofdbeheerder krijgt daar 403).
// Een vers aangemaakt gebouw heeft geen kindrijen, dus een directe delete
// is veilig.
//
// Draaien: pnpm --filter @workspace/scripts run e2e-web
// Vereist: lopende workflows api-server + firevault web, env DATABASE_URL en
// REPLIT_DEV_DOMAIN.
import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db, gebouwenTable } from "@workspace/db";
import { programmatischInloggen } from "./web-api-proxy";

import {
  E2E_WEB_ADMIN_EMAIL,
  E2E_WEB_ADMIN_WACHTWOORD,
  E2E_WEB_ADMIN_TOTP_SECRET,
  setupE2eWebAdminAccount,
} from "../src/e2e-monteur-testaccount";

const INHOUD_TIMEOUT = 20_000;

// Unieke naam per run zodat de lijst-controle nooit een oud gebouw matcht.
const GEBOUW_NAAM = `E2E Testgebouw ${Date.now()}`;
const GEBOUW_ADRES = "Teststraat 1";

// ── Login ────────────────────────────────────────────────────────────────────
async function logIn(page: Page): Promise<void> {
  await programmatischInloggen(
    page,
    E2E_WEB_ADMIN_EMAIL,
    E2E_WEB_ADMIN_WACHTWOORD,
    E2E_WEB_ADMIN_TOTP_SECRET,
  );
  await page.goto("/");
}

// ── Setup & opruiming ─────────────────────────────────────────────────────────
test.beforeAll(async () => {
  await setupE2eWebAdminAccount();
});

// Id van het aangemaakte testgebouw; wordt in afterEach opgeruimd zodat de
// dev-database niet vervuild raakt, ook wanneer de test halverwege faalt.
let aangemaaktGebouwId: number | null = null;

test.afterEach(async () => {
  if (aangemaaktGebouwId == null) return;
  try {
    await db
      .delete(gebouwenTable)
      .where(eq(gebouwenTable.id, aangemaaktGebouwId));
  } catch (err) {
    // Niet fataal voor de test zelf, maar wel zichtbaar in de output.
    console.warn(
      `[web-gebouw-aanmaken] Opruimen testgebouw ${aangemaaktGebouwId} mislukt: ${(err as Error).message}`,
    );
  }
  aangemaaktGebouwId = null;
});

// ── Spec ──────────────────────────────────────────────────────────────────────
test("Web: nieuw gebouw opent direct de detailpagina en verschijnt in de lijst", async ({
  page,
}) => {
  // ── Stap 1: Inloggen ───────────────────────────────────────────────────────
  await test.step("login met verplichte TOTP", async () => {
    await logIn(page);
  });

  // ── Stap 2: Dialoog openen ────────────────────────────────────────────────
  await test.step("gebouwenlijst: dialoog 'Nieuw gebouw' openen", async () => {
    await page.goto("/gebouwen");
    await expect(page.getByPlaceholder(/Zoek op gebouw/i)).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });

    await page.getByRole("button", { name: "Nieuw gebouw" }).click();
    await expect(
      page.getByRole("heading", { name: "Nieuw gebouw aanmaken" }),
    ).toBeVisible({ timeout: INHOUD_TIMEOUT });
  });

  // ── Stap 3: Gebouw aanmaken en directe navigatie controleren ─────────────
  await test.step("aanmaken: opslaan navigeert direct naar /gebouwen/:id", async () => {
    await page.locator("#g-naam").fill(GEBOUW_NAAM);
    await page.locator("#g-adres").fill(GEBOUW_ADRES);

    await page.getByRole("button", { name: "Gebouw opslaan" }).click();

    // Kern van de regressietest: de URL moet direct naar de detailpagina van
    // het nieuwe gebouw navigeren (ook bij een trage verbinding — Playwright
    // wacht hier tot de create-mutatie is afgerond en de navigatie plaatsvindt).
    await expect(page).toHaveURL(/\/gebouwen\/\d+/, { timeout: INHOUD_TIMEOUT });

    const match = page.url().match(/\/gebouwen\/(\d+)/);
    expect(match).not.toBeNull();
    aangemaaktGebouwId = Number(match![1]);

    // De dialoog is gesloten na het opslaan.
    await expect(
      page.getByRole("heading", { name: "Nieuw gebouw aanmaken" }),
    ).not.toBeVisible({ timeout: INHOUD_TIMEOUT });
  });

  // ── Stap 4: Detailpagina toont het juiste gebouw ──────────────────────────
  await test.step("detailpagina toont naam en tabbladen van het nieuwe gebouw", async () => {
    // De naam van het zojuist aangemaakte gebouw is zichtbaar op de detailpagina.
    await expect(
      page.getByText(GEBOUW_NAAM).filter({ visible: true }).first(),
    ).toBeVisible({ timeout: INHOUD_TIMEOUT });

    // Het detail-scherm toont altijd de tabbladen (anker dat de pagina echt
    // geladen is en niet slechts een tussenscherm).
    await expect(
      page.getByRole("tab", { name: /Uitvoering/i }).first(),
    ).toBeVisible({ timeout: INHOUD_TIMEOUT });
  });

  // ── Stap 5: Terug naar de lijst — gebouw verschijnt ───────────────────────
  await test.step("terug naar de lijst: nieuw gebouw is vindbaar", async () => {
    await page.goto("/gebouwen");

    const zoekveld = page.getByPlaceholder(/Zoek op gebouw/i);
    await expect(zoekveld).toBeVisible({ timeout: INHOUD_TIMEOUT });

    // Zoek op de unieke naam zodat de controle onafhankelijk is van
    // paginering/sortering van de bestaande gebouwenlijst.
    await zoekveld.fill(GEBOUW_NAAM);

    await expect(
      page.getByText(GEBOUW_NAAM).filter({ visible: true }).first(),
    ).toBeVisible({ timeout: INHOUD_TIMEOUT });
  });
});
