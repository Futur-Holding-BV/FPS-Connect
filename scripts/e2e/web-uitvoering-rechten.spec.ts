// E2E: uitvoeringsscherm per rechtenprofiel (task #946).
//
// Bewijst dat de tab-gating op /uitvoering/:id correct werkt:
//   - Een hoofdbeheerder (alle rechten) landt op de Stappen-tab en ziet alle tabs.
//   - Een gebruiker met uitsluitend projecten:1 landt op de Planning-tab en
//     krijgt de verboden tabs (Stappen, Oplevering, Materiaal, Documenten) niet
//     te zien.
//
// Data: er wordt een minimale opdracht in aiFase "uitvoering" geseed zodat de
// test data-onafhankelijk is en ook op een schone dev-database slaagt.
//
// Draaien: pnpm --filter @workspace/scripts run e2e-web
// Vereist: lopende workflows api-server + firevault web, env DATABASE_URL en
// REPLIT_DEV_DOMAIN.
import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db, opdrachtenTable } from "@workspace/db";

import { programmatischInloggen } from "./web-api-proxy";
import {
  setupE2eUitvoeringAccounts,
  archiveerE2eUitvoeringAccounts,
  E2E_UITV_ADMIN_EMAIL,
  E2E_UITV_ADMIN_WACHTWOORD,
  E2E_UITV_ADMIN_TOTP_SECRET,
  E2E_UITV_PROJ_EMAIL,
  E2E_UITV_PROJ_WACHTWOORD,
  E2E_UITV_PROJ_TOTP_SECRET,
} from "../src/e2e-monteur-testaccount";

const INHOUD_TIMEOUT = 20_000;

// ── Testdata ──────────────────────────────────────────────────────────────────

let opdrachtId = 0;

test.beforeAll(async () => {
  await setupE2eUitvoeringAccounts();

  // Minimale opdracht in uitvoeringsfase zodat het overzicht niet leeg is.
  const [opdracht] = await db
    .insert(opdrachtenTable)
    .values({
      titel: "E2E Uitvoering-rechten testopdracht",
      werknummer: "E2E-UITV-946",
      opdrachtgever: "E2E BV",
      status: "actief",
      aiFase: "uitvoering",
    })
    .returning({ id: opdrachtenTable.id });
  opdrachtId = opdracht.id;
});

test.afterAll(async () => {
  // Verwijder testopdracht (cascade ruimt eventuele relaties op).
  if (opdrachtId > 0) {
    await db.delete(opdrachtenTable).where(eq(opdrachtenTable.id, opdrachtId));
  }
  await archiveerE2eUitvoeringAccounts();
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

// ── Tests ─────────────────────────────────────────────────────────────────────

test("hoofdbeheerder (alle rechten): landt op Stappen-tab en ziet alle tabs", async ({ page }) => {
  await test.step("inloggen als hoofdbeheerder", async () => {
    await logIn(
      page,
      E2E_UITV_ADMIN_EMAIL,
      E2E_UITV_ADMIN_WACHTWOORD,
      E2E_UITV_ADMIN_TOTP_SECRET,
    );
  });

  await test.step("navigeer naar uitvoeringsoverzicht", async () => {
    await page.goto("/uitvoering");

    // Wacht tot de pagina is geladen (koptekst).
    await expect(
      page.getByText("Uitvoering").filter({ visible: true }).first(),
    ).toBeVisible({ timeout: INHOUD_TIMEOUT });
  });

  await test.step("klik op de geseedde opdracht", async () => {
    const kaart = page.getByTestId(`uitvoering-opdracht-${opdrachtId}`);
    await expect(kaart).toBeVisible({ timeout: INHOUD_TIMEOUT });
    await kaart.click();

    await expect(page).toHaveURL(
      new RegExp(`/uitvoering/${opdrachtId}`),
      { timeout: INHOUD_TIMEOUT },
    );
  });

  await test.step("stappen-tab is actief (eersteTab = stappen bij alle rechten)", async () => {
    // De stappen-tab krijgt aria-selected="true" wanneer hij actief is.
    const stappenTab = page.getByTestId("tab-stappen");
    await expect(stappenTab).toBeVisible({ timeout: INHOUD_TIMEOUT });
    await expect(stappenTab).toHaveAttribute("data-state", "active");
  });

  await test.step("alle verwachte tabs zijn zichtbaar", async () => {
    await expect(page.getByTestId("tab-stappen")).toBeVisible();
    await expect(page.getByTestId("tab-oplevering")).toBeVisible();
    await expect(page.getByTestId("tab-planning")).toBeVisible();
    await expect(page.getByTestId("tab-uren")).toBeVisible();
    await expect(page.getByTestId("tab-materiaal")).toBeVisible();
    await expect(page.getByTestId("tab-signalen")).toBeVisible();
    await expect(page.getByTestId("tab-documenten")).toBeVisible();
  });

  await test.step("inhoud van de actieve tab (signalen of lege staat) is zichtbaar", async () => {
    // De Stappen-tab laadt de PimUitvoeringTab. Zonder PIM-model toont die een
    // lege staat of een laadspinner. Het tabpaneel zelf moet altijd zichtbaar zijn.
    const tabPanel = page.getByRole("tabpanel").filter({ visible: true }).first();
    await expect(tabPanel).toBeVisible({ timeout: INHOUD_TIMEOUT });
  });
});

test("gebruiker met alleen projecten:1: landt op Planning-tab, verboden tabs ontbreken", async ({ page }) => {
  await test.step("inloggen als projecten:1-gebruiker", async () => {
    await logIn(
      page,
      E2E_UITV_PROJ_EMAIL,
      E2E_UITV_PROJ_WACHTWOORD,
      E2E_UITV_PROJ_TOTP_SECRET,
    );
  });

  await test.step("navigeer naar uitvoeringsoverzicht", async () => {
    await page.goto("/uitvoering");

    await expect(
      page.getByText("Uitvoering").filter({ visible: true }).first(),
    ).toBeVisible({ timeout: INHOUD_TIMEOUT });
  });

  await test.step("klik op de geseedde opdracht", async () => {
    const kaart = page.getByTestId(`uitvoering-opdracht-${opdrachtId}`);
    await expect(kaart).toBeVisible({ timeout: INHOUD_TIMEOUT });
    await kaart.click();

    await expect(page).toHaveURL(
      new RegExp(`/uitvoering/${opdrachtId}`),
      { timeout: INHOUD_TIMEOUT },
    );
  });

  await test.step("planning-tab is actief (eersteTab = planning bij geen offertes-recht)", async () => {
    const planningTab = page.getByTestId("tab-planning");
    await expect(planningTab).toBeVisible({ timeout: INHOUD_TIMEOUT });
    await expect(planningTab).toHaveAttribute("data-state", "active");
  });

  await test.step("toegestane tabs zijn zichtbaar: planning, uren, signalen", async () => {
    await expect(page.getByTestId("tab-planning")).toBeVisible();
    await expect(page.getByTestId("tab-uren")).toBeVisible();
    await expect(page.getByTestId("tab-signalen")).toBeVisible();
  });

  await test.step("verboden tabs zijn afwezig: stappen, oplevering, materiaal, documenten", async () => {
    // Tabs die gate'd zijn op offertes:1 / projecten:2 / bibliotheek:1
    // mogen NIET in de DOM staan (display:none is onvoldoende — menu verbergt).
    await expect(page.getByTestId("tab-stappen")).toHaveCount(0);
    await expect(page.getByTestId("tab-oplevering")).toHaveCount(0);
    await expect(page.getByTestId("tab-materiaal")).toHaveCount(0);
    await expect(page.getByTestId("tab-documenten")).toHaveCount(0);
  });

  await test.step("tabpaneel toont inhoud (geen lege tab)", async () => {
    const tabPanel = page.getByRole("tabpanel").filter({ visible: true }).first();
    await expect(tabPanel).toBeVisible({ timeout: INHOUD_TIMEOUT });
  });
});
