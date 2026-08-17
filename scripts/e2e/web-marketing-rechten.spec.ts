// E2E-bewijs marketingpagina-rechten (task #1038, migratie 0069).
//
// Vier profielen getoetst:
//   1. CRM-only   (crm:3, marketing:0)  — sidebar CRM ✓ Marketing ✗; API 403
//   2. Mktg-only  (marketing:3, crm:0)  — sidebar Marketing ✓ CRM ✗; CRM-dashboard
//                                         toont Marketing-kaart
//   3. Commercieel (crm:4, marketing:3) — marketing-pagina: Proef-knop ✓,
//                                         Verzenden-knop ✗
//   4. Directie   (crm:4, marketing:4)  — marketing-pagina: Proef-knop ✓,
//                                         Verzenden-knop ✓ (ook al uitgeschakeld)
//
// Testdata: één concept-campagne (naam bevat de stempel) wordt via DB geseed
// en via DB opgeruimd — bewust GEEN API-aanroep via het beheerder-account
// zodat de rechtentest niet afhangt van een hoofd-beheerders-sessie.
//
// Draaien: pnpm --filter @workspace/scripts run e2e-web
// Vereist: lopende workflows api-server + firevault, env DATABASE_URL +
// REPLIT_DEV_DOMAIN.
import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db, marketingCampagnesTable } from "@workspace/db";

import { programmatischInloggen } from "./web-api-proxy";
import {
  setupE2eMarketingRechtenAccounts,
  archiveerE2eMarketingRechtenAccounts,
  E2E_MKTG_CRM_EMAIL,
  E2E_MKTG_CRM_WACHTWOORD,
  E2E_MKTG_CRM_TOTP_SECRET,
  E2E_MKTG_ONLY_EMAIL,
  E2E_MKTG_ONLY_WACHTWOORD,
  E2E_MKTG_ONLY_TOTP_SECRET,
  E2E_MKTG_COM_EMAIL,
  E2E_MKTG_COM_WACHTWOORD,
  E2E_MKTG_COM_TOTP_SECRET,
  E2E_MKTG_DIR_EMAIL,
  E2E_MKTG_DIR_WACHTWOORD,
  E2E_MKTG_DIR_TOTP_SECRET,
} from "../src/e2e-monteur-testaccount";

const INHOUD_TIMEOUT = 20_000;
const STEMPEL = Date.now();
const CAMPAGNE_NAAM = `E2E-rechtentest-${STEMPEL}`;

// ── Testdata ──────────────────────────────────────────────────────────────────

let campagneId = 0;

test.beforeAll(async () => {
  await setupE2eMarketingRechtenAccounts();

  // Concept-campagne rechtstreeks in DB: geen doelgroep/sjabloon nodig,
  // status "concept" is de default. De campagne is alleen bedoeld om
  // op de campagnes-tab een kaart zichtbaar te maken.
  const [campagne] = await db
    .insert(marketingCampagnesTable)
    .values({ naam: CAMPAGNE_NAAM })
    .returning({ id: marketingCampagnesTable.id });
  campagneId = campagne.id;
});

test.afterAll(async () => {
  if (campagneId > 0) {
    await db
      .delete(marketingCampagnesTable)
      .where(eq(marketingCampagnesTable.id, campagneId));
  }
  await archiveerE2eMarketingRechtenAccounts();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function logIn(
  page: Page,
  email: string,
  wachtwoord: string,
  totpSecret: string,
): Promise<void> {
  await programmatischInloggen(page, email, wachtwoord, totpSecret);
  await page.goto("/");
}

async function wachtOpSidebar(page: Page): Promise<void> {
  // Wacht tot de sidebar geladen is (shadcn: data-sidebar="sidebar").
  await expect(page.locator('[data-sidebar="sidebar"]').first()).toBeAttached({
    timeout: INHOUD_TIMEOUT,
  });
}

/**
 * Klikt op de "Commercie" hoofdstuk-knop in de sidebar en geeft het
 * uitgeschoven paneel terug. De TweeTrapsHoofdstuk rendert zijn links in een
 * portal op document.body (alleen zichtbaar na klik), dus we moeten eerst de
 * knop activeren voordat we de links kunnen inspecteren.
 */
async function openCommercieHoofdstuk(page: Page) {
  // De hoofdstuk-knop heeft data-hoofdstuk-knop en de tekst "Commercie".
  const knop = page.locator('[data-hoofdstuk-knop]', { hasText: "Commercie" });
  await expect(knop).toBeVisible({ timeout: INHOUD_TIMEOUT });
  await knop.click();
  // Paneel verschijnt als portal met aria-label "Onderdelen van Commercie".
  const paneel = page.locator('nav[aria-label="Onderdelen van Commercie"]');
  await expect(paneel).toBeVisible({ timeout: 5_000 });
  return paneel;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("CRM-only: sidebar CRM ✓, Marketing ✗ — API /marketing/campagnes → 403", async ({
  page,
}) => {
  await test.step("inloggen als CRM-only gebruiker", async () => {
    await logIn(
      page,
      E2E_MKTG_CRM_EMAIL,
      E2E_MKTG_CRM_WACHTWOORD,
      E2E_MKTG_CRM_TOTP_SECRET,
    );
  });

  await test.step("sidebar: Commercie-hoofdstuk openen en CRM-link zichtbaar", async () => {
    await wachtOpSidebar(page);
    const paneel = await openCommercieHoofdstuk(page);
    await expect(paneel.getByRole("link", { name: /^CRM$/ })).toBeVisible();
  });

  await test.step("sidebar: Marketing-link NIET aanwezig in paneel (crm:3, marketing:0)", async () => {
    // Het paneel is al open van de vorige step; zoek opnieuw op om zeker te zijn.
    const paneel = page.locator('nav[aria-label="Onderdelen van Commercie"]');
    await expect(paneel.getByRole("link", { name: /^Marketing$/ })).not.toBeAttached();
  });

  await test.step("API GET /marketing/campagnes → 403", async () => {
    const resp = await page.request.get("/api/marketing/campagnes");
    expect(resp.status()).toBe(403);
  });
});

test("Mktg-only: sidebar Marketing ✓, CRM ✗ — CRM-dashboard toont Marketing-kaart", async ({
  page,
}) => {
  await test.step("inloggen als marketing-only gebruiker", async () => {
    await logIn(
      page,
      E2E_MKTG_ONLY_EMAIL,
      E2E_MKTG_ONLY_WACHTWOORD,
      E2E_MKTG_ONLY_TOTP_SECRET,
    );
  });

  await test.step("sidebar: Commercie-hoofdstuk openen en Marketing-link zichtbaar", async () => {
    await wachtOpSidebar(page);
    const paneel = await openCommercieHoofdstuk(page);
    await expect(paneel.getByRole("link", { name: /^Marketing$/ })).toBeVisible();
  });

  await test.step("sidebar: CRM-link NIET aanwezig in paneel (crm:0)", async () => {
    const paneel = page.locator('nav[aria-label="Onderdelen van Commercie"]');
    await expect(paneel.getByRole("link", { name: /^CRM$/ })).not.toBeAttached();
  });

  await test.step("CRM-dashboard: Marketing-navigatiekaart aanwezig", async () => {
    await page.goto("/crm");
    // De kaart linkt naar /crm/marketing en heeft het label "Marketing".
    await expect(
      page.getByRole("link", { name: /Marketing/i }).filter({ hasText: "Marketing" }).first(),
    ).toBeVisible({ timeout: INHOUD_TIMEOUT });
  });
});

test("Commercieel (marketing:3): Proef-knop ✓, Verzenden-knop ✗", async ({
  page,
}) => {
  await test.step("inloggen als Commercieel", async () => {
    await logIn(
      page,
      E2E_MKTG_COM_EMAIL,
      E2E_MKTG_COM_WACHTWOORD,
      E2E_MKTG_COM_TOTP_SECRET,
    );
  });

  await test.step("navigeer naar /crm/marketing", async () => {
    await page.goto("/crm/marketing");
    // Wacht tot de paginatitel zichtbaar is.
    await expect(
      page.getByText("Marketing").filter({ visible: true }).first(),
    ).toBeVisible({ timeout: INHOUD_TIMEOUT });
  });

  await test.step("campagne-kaart van de geseedde campagne zichtbaar", async () => {
    await expect(
      page.getByTestId(`campagne-kaart-${campagneId}`),
    ).toBeVisible({ timeout: INHOUD_TIMEOUT });
  });

  await test.step("Proef-knop aanwezig op de campagne-kaart", async () => {
    const kaart = page.getByTestId(`campagne-kaart-${campagneId}`);
    await expect(kaart.getByTestId("btn-proef")).toBeVisible();
  });

  await test.step("Verzenden-knop NIET aanwezig (marketing:3, niet 4)", async () => {
    const kaart = page.getByTestId(`campagne-kaart-${campagneId}`);
    await expect(kaart.getByTestId("btn-verzenden")).not.toBeAttached();
  });

  await test.step("uitlegzin vermeldt dat hogere rechten nodig zijn", async () => {
    await expect(
      page.getByText("verzenden vereist een hoger recht", { exact: false }),
    ).toBeVisible();
  });
});

test("Directie (marketing:4): Proef-knop ✓, Verzenden-knop ✓", async ({
  page,
}) => {
  await test.step("inloggen als Directie", async () => {
    await logIn(
      page,
      E2E_MKTG_DIR_EMAIL,
      E2E_MKTG_DIR_WACHTWOORD,
      E2E_MKTG_DIR_TOTP_SECRET,
    );
  });

  await test.step("navigeer naar /crm/marketing", async () => {
    await page.goto("/crm/marketing");
    await expect(
      page.getByText("Marketing").filter({ visible: true }).first(),
    ).toBeVisible({ timeout: INHOUD_TIMEOUT });
  });

  await test.step("campagne-kaart van de geseedde campagne zichtbaar", async () => {
    await expect(
      page.getByTestId(`campagne-kaart-${campagneId}`),
    ).toBeVisible({ timeout: INHOUD_TIMEOUT });
  });

  await test.step("Proef-knop aanwezig op de campagne-kaart", async () => {
    const kaart = page.getByTestId(`campagne-kaart-${campagneId}`);
    await expect(kaart.getByTestId("btn-proef")).toBeVisible();
  });

  await test.step("Verzenden-knop aanwezig (marketing:4)", async () => {
    // De knop is aanwezig maar uitgeschakeld zolang er geen proef is verzonden.
    // Aanwezig = gerenderd; de disabled-staat is apart serverlabel-bewijs.
    const kaart = page.getByTestId(`campagne-kaart-${campagneId}`);
    await expect(kaart.getByTestId("btn-verzenden")).toBeAttached();
  });
});
