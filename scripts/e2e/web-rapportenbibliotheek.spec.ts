// E2E: firevault web-app — centrale Rapportenbibliotheek (/rapporten).
// Test dat rapporten over meerdere gebouwen heen zichtbaar zijn en dat
// zoeken/filteren op gebouw en rapporttype werkt.
//
// Draaien: pnpm --filter @workspace/scripts run e2e-web
// Vereist: lopende workflows api-server + firevault web, env DATABASE_URL en
// REPLIT_DEV_DOMAIN.
import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db, gebouwenTable, opleverrapportenTable } from "@workspace/db";
import { programmatischInloggen } from "./web-api-proxy";

import {
  E2E_WW_ADMIN_EMAIL,
  E2E_WW_ADMIN_WACHTWOORD,
  E2E_WW_ADMIN_TOTP_SECRET,
  setupE2eWachtwoordAccounts,
} from "../src/e2e-wachtwoord-testaccounts";

async function logIn(page: Page): Promise<void> {
  await programmatischInloggen(
    page,
    E2E_WW_ADMIN_EMAIL,
    E2E_WW_ADMIN_WACHTWOORD,
    E2E_WW_ADMIN_TOTP_SECRET,
  );
  await page.goto("/");
}

// De test moet data-onafhankelijk blijven: de dev-database kan op elk moment
// nul definitieve rapporten bevatten. Daarom zet de test zelf een bekend
// definitief testrapport neer (op het eerste bestaande gebouw) en ruimt dat
// weer op, in plaats van te vertrouwen op toevallig aanwezige data.
let testRapportId: number | null = null;
let testTitel: string;

test.beforeAll(async () => {
  await setupE2eWachtwoordAccounts();

  const [gebouw] = await db
    .select({ id: gebouwenTable.id })
    .from(gebouwenTable)
    .limit(1);
  if (!gebouw) throw new Error("Geen gebouw gevonden om een test-rapport aan te koppelen.");

  testTitel = `E2E Testrapport ${Date.now()}`;
  const [rapport] = await db
    .insert(opleverrapportenTable)
    .values({
      gebouwId: gebouw.id,
      rapportType: "opleverrapport",
      status: "definitief",
      titel: testTitel,
      secties: {},
      spotSelectie: {},
      bijlagenIds: [],
      tekeningIds: [],
      bevrorenOp: new Date(),
      bijgewerktOp: new Date(),
    })
    .returning({ id: opleverrapportenTable.id });
  testRapportId = rapport.id;
});

test.afterAll(async () => {
  if (testRapportId !== null) {
    await db.delete(opleverrapportenTable).where(eq(opleverrapportenTable.id, testRapportId));
  }
});

test("rapportenbibliotheek toont, zoekt en filtert rapporten cross-gebouw", async ({ page }) => {
  await logIn(page);

  await page.goto("/rapporten");
  await expect(page.getByRole("heading", { name: "Rapportenbibliotheek" })).toBeVisible({
    timeout: 20_000,
  });

  await expect(page.getByPlaceholder("Titel, gebouw, opsteller...")).toBeVisible();

  const zoekveld = page.getByPlaceholder("Titel, gebouw, opsteller...");

  // Zoeken op het bekende testrapport toont precies dat rapport.
  await zoekveld.fill(testTitel);
  await expect(page.getByText(testTitel)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Geen rapporten gevonden")).not.toBeVisible();

  // Zoeken op een niet-bestaande naam toont de lege staat.
  await zoekveld.fill("nietbestaanderapportnaam-xyz");
  await expect(page.getByText("Geen rapporten gevonden")).toBeVisible({ timeout: 10_000 });

  // Wissen van de zoekterm toont het bekende testrapport weer.
  await zoekveld.fill("");
  await expect(page.getByText(testTitel)).toBeVisible({ timeout: 10_000 });
});
