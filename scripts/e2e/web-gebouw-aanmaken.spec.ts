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

import { crmKlantenTable, db, gebouwenTable } from "@workspace/db";
import { programmatischInloggen } from "./web-api-proxy";

import {
  E2E_WEB_ADMIN_EMAIL,
  E2E_WEB_ADMIN_WACHTWOORD,
  E2E_WEB_ADMIN_TOTP_SECRET,
  setupE2eWebAdminAccount,
} from "../src/e2e-monteur-testaccount";

const INHOUD_TIMEOUT = 20_000;

test.use({ viewport: { width: 1920, height: 1080 } });

// Unieke naam per run zodat de lijst-controle nooit een oud gebouw matcht.
const GEBOUW_NAAM = `E2E Testgebouw ${Date.now()}`;
const GEBOUW_ADRES = "Teststraat 1";
const OPDRACHTGEVER_NAAM = `E2E Opdrachtgever ${Date.now()}`;

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
  await db
    .delete(crmKlantenTable)
    .where(eq(crmKlantenTable.naam, OPDRACHTGEVER_NAAM));
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
    await page.getByTestId("select-project-opdrachtgever").click();
    await page.getByRole("option", { name: /Nieuwe opdrachtgever aanmaken/i }).click();
    await page.locator("#g-klant-naam").fill(OPDRACHTGEVER_NAAM);
    await page.locator("#g-klant-adres").fill("Relatiestraat 2");
    await page.locator("#g-klant-postcode").fill("1234 AB");
    await page.locator("#g-klant-stad").fill("Testdam");
    await page.locator("#g-naam").fill(GEBOUW_NAAM);
    await page.locator("#g-omschrijving").fill("Brandwerende voorzieningen controleren");
    await page.locator("#g-adres").fill(GEBOUW_ADRES);
    await page.locator("#g-postcode").fill("5678 CD");
    await page.locator("#g-stad").fill("Proefstad");

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

  // ── Stap 4: Compacte projectshell ─────────────────────────────────────────
  await test.step("detailpagina houdt kop, flow en hoofdtabbladen compact", async () => {
    const projectkop = page.getByTestId("projectkop");
    const paginatitel = projectkop.locator("[data-paginatitel]");
    const hoofdTabs = page.getByTestId("project-hoofdtabs");
    const projectflow = page.getByTestId("projectflow");

    await expect(projectkop).toBeVisible({ timeout: INHOUD_TIMEOUT });
    await expect(paginatitel).toContainText(GEBOUW_NAAM);
    await expect(page.locator("[data-paginatitel]")).toHaveCount(1);

    await expect(hoofdTabs.getByRole("tab")).toHaveCount(5);
    for (const tab of ["Dashboard", "Gebouw", "Uitvoering", "Beheer", "Documenten"]) {
      await expect(hoofdTabs.getByRole("tab", { name: tab, exact: true })).toBeVisible();
    }
    for (const verdwenenTab of [
      "Rapporten",
      "Calculaties",
      "Offertes",
      "Opdrachten",
      "Meer/min.",
      "Opnames",
      "Facturen",
    ]) {
      await expect(
        hoofdTabs.getByRole("tab", { name: verdwenenTab, exact: true }),
      ).toHaveCount(0);
    }

    await expect(projectflow).toBeVisible();
    const maten = await projectflow.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, height: rect.height };
    });
    expect(maten.top).toBeLessThanOrEqual(200);
    expect(maten.height).toBeLessThanOrEqual(48);

    const eersteFase = projectflow.getByRole("button").first();
    await eersteFase.hover();
    await expect(page.getByRole("tooltip")).toContainText(/betekent/i);
  });

  await test.step("oude projectbestemmingen blijven binnen twee klikken bereikbaar", async () => {
    const bestemmingen = [
      { label: "Calculaties", segment: "calculaties" },
      { label: "Offertes", segment: "offertes" },
      { label: "Opdrachten", segment: "opdrachten" },
      { label: "Meer-/minderwerk", segment: "meerwerk" },
      { label: "Opnames", segment: "opnames" },
      { label: "Facturen", segment: "facturen" },
      { label: "Rapporten", segment: "rapporten" },
    ];

    for (const bestemming of bestemmingen) {
      await page.getByRole("tab", { name: "Dashboard", exact: true }).click();
      const dossierKnop = page
        .getByRole("button", { name: new RegExp(`^${bestemming.label}\\b`) })
        .first();
      await expect(dossierKnop).toBeVisible();
      await dossierKnop.click();
      await expect(page.getByTestId(`project-segment-${bestemming.segment}`)).toBeVisible();
    }

    const detailUrl = page.url().split("?")[0];
    await page.goto(`${detailUrl}?tab=calculaties`);
    await expect(page.getByTestId("project-segment-calculaties")).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });
  });

  await test.step("stappenplan toont alleen stapgebonden ontbrekende gegevens en navigeert", async () => {
    await page.getByRole("tab", { name: "Dashboard", exact: true }).click();
    await page.getByRole("tab", { name: "Gebouw", exact: true }).click();
    const stappenplanKnop = page.getByRole("button", { name: "Stappenplan" }).first();
    await expect(stappenplanKnop).toBeVisible({ timeout: INHOUD_TIMEOUT });
    await stappenplanKnop.click();
    const dialoog = page.getByRole("dialog").filter({ hasText: `Stappenplan — ${GEBOUW_NAAM}` });
    await expect(dialoog).toBeVisible({ timeout: INHOUD_TIMEOUT });
    await expect(dialoog.getByText("Project/gebouw aanmaken")).toBeVisible();
    await expect(dialoog.getByText("Gebouw-/projectadres controleren")).toBeVisible();
    await expect(dialoog.getByText("Opdrachtgever controleren")).toBeVisible();
    await expect(dialoog.getByText(/Nog niet administratief gereed/i)).toHaveCount(0);

    const bouwlagenStap = dialoog
      .getByText("Vul in deze stap aan: minimaal één bouwlaag.", { exact: true })
      .locator("..");
    await bouwlagenStap.getByRole("button", { name: "Naar deze stap" }).click();
    await expect(page.getByRole("tab", { name: /Uitvoering/i }).first()).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByText("Uitvoeringsstap — nog nodig", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Mogelijk onvoldoende informatie voor de monteur", { exact: true }),
    ).toHaveCount(0);
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
