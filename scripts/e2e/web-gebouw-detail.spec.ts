// E2E: firevault web-app — gebouw-detail en voorziening-detail regressietest.
//
// Controleert dat de vervolgschermen (gebouw-detail, voorziening-detail) achter
// de verplichte TOTP-login laden en daadwerkelijk inhoud tonen (of de juiste
// lege staat). De checks zijn opzettelijk data-onafhankelijk zodat de test
// stabiel blijft ongeacht de dev-database.
//
// Draaien: pnpm --filter @workspace/scripts run e2e-web
// Vereist: lopende workflows api-server + firevault web, env DATABASE_URL en
// REPLIT_DEV_DOMAIN.
import { expect, test, type Page } from "@playwright/test";

import { programmatischInloggen } from "./web-api-proxy";
import {
  E2E_WEB_EMAIL,
  E2E_WEB_WACHTWOORD,
  E2E_WEB_TOTP_SECRET,
  setupE2eWebAccount,
} from "../src/e2e-monteur-testaccount";

const INHOUD_TIMEOUT = 20_000;

// ── Login ────────────────────────────────────────────────────────────────────
async function logIn(page: Page): Promise<void> {
  await programmatischInloggen(page, E2E_WEB_EMAIL, E2E_WEB_WACHTWOORD, E2E_WEB_TOTP_SECRET);
  await page.goto("/");
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function zichtbaar(page: Page, tekst: string | RegExp) {
  return page.getByText(tekst).filter({ visible: true });
}

// ── Setup ─────────────────────────────────────────────────────────────────────
test.beforeAll(async () => {
  await setupE2eWebAccount();
});

// ── Spec ──────────────────────────────────────────────────────────────────────
test("Web: gebouw-detail en voorziening-detail regressie", async ({ page }) => {
  // ── Stap 1: Inloggen ───────────────────────────────────────────────────────
  await test.step("login met verplichte TOTP", async () => {
    await logIn(page);
  });

  // ── Stap 2: Gebouwenlijst ─────────────────────────────────────────────────
  await test.step("gebouwenlijst laadt (zoekbalk en inhoud of lege staat)", async () => {
    await page.goto("/gebouwen");

    // Zoekbalk is altijd aanwezig ongeacht de data.
    await expect(
      page.getByPlaceholder(/Zoek op gebouw/i),
    ).toBeVisible({ timeout: INHOUD_TIMEOUT });

    // Lijst: gebouwkaart (toont "spot(s)") óf lege-staat.
    const gebouwKaart = page.getByText(/\d+\s+spots?\b/).filter({ visible: true });
    const leegStaat = zichtbaar(page, "Geen gebouwen gevonden.");
    await expect(gebouwKaart.first().or(leegStaat.first())).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });
  });

  // ── Stap 3: Gebouw-detail ─────────────────────────────────────────────────
  await test.step("gebouw-detail: klik op eerste kaart en controleer inhoud", async () => {
    await page.goto("/gebouwen");
    await expect(page.getByPlaceholder(/Zoek op gebouw/i)).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });

    const eersteKaart = page.getByText(/\d+\s+spots?\b/).filter({ visible: true }).first();
    const leegStaat = zichtbaar(page, "Geen gebouwen gevonden.");

    // Wacht tot de lijst geladen is.
    await expect(eersteKaart.or(leegStaat.first())).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });

    const heeftKaarten = (await eersteKaart.count()) > 0;
    if (!heeftKaarten) {
      // Lege database — slaan dit scherm over en beëindigen de stap.
      return;
    }

    // Klik op de kaart (de Link omhult de hele Card).
    await eersteKaart.click();
    await expect(page).toHaveURL(/\/gebouwen\/\d+/, { timeout: INHOUD_TIMEOUT });

    // Het detail-scherm toont altijd de tabbladen.
    // De tab "Uitvoering" is altijd aanwezig (niet alleen bij beheerder).
    await expect(
      page.getByRole("tab", { name: /Uitvoering/i }).first(),
    ).toBeVisible({ timeout: INHOUD_TIMEOUT });

    // Het eerste tabblad (project) is actief: bouwlagen/verdiepingen worden geladen.
    // Data-onafhankelijke check: óf de tab-content is zichtbaar, óf de lege staat.
    const tabContent = page
      .getByRole("tabpanel")
      .filter({ visible: true })
      .first();
    await expect(tabContent).toBeVisible({ timeout: INHOUD_TIMEOUT });
  });

  // ── Stap 4: Spotslijst (Voorzieningen) ────────────────────────────────────
  await test.step("spotslijst laadt (zoekbalk en inhoud of lege staat)", async () => {
    await page.goto("/voorzieningen");

    // Zoekbalk is altijd aanwezig.
    await expect(
      page.getByPlaceholder(/Zoek op nummer/i),
    ).toBeVisible({ timeout: INHOUD_TIMEOUT });

    // Lijst: tabelrij met objectnummer óf lege staat.
    // Gebruik aparte count-check om strict mode violation te voorkomen wanneer
    // de lege staat als tbody-rij én als losstaande tekst beide zichtbaar zijn.
    const spotRij = page.locator("table tbody tr").filter({ visible: true });
    const leegStaat = zichtbaar(page, "Geen spots gevonden.");
    await expect(async () => {
      const heeftRijen = (await spotRij.count()) > 0;
      const heeftLeeg = (await leegStaat.count()) > 0;
      expect(heeftRijen || heeftLeeg).toBeTruthy();
    }).toPass({ timeout: INHOUD_TIMEOUT });
  });

  // ── Stap 5: Voorziening-detail ────────────────────────────────────────────
  await test.step("voorziening-detail: klik op Details en controleer inhoud", async () => {
    await page.goto("/voorzieningen");
    await expect(page.getByPlaceholder(/Zoek op nummer/i)).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });

    const detailKnop = page.getByTestId("spot-details-knop").first();
    const leegStaat = zichtbaar(page, "Geen spots gevonden.");

    // Wacht tot de lijst geladen is.
    await expect(detailKnop.or(leegStaat.first()).first()).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });

    const heeftSpots = (await detailKnop.count()) > 0;
    if (!heeftSpots) {
      // Lege database — slaan dit scherm over.
      return;
    }

    await detailKnop.click();
    await expect(page).toHaveURL(/\/voorzieningen\/\d+/, { timeout: INHOUD_TIMEOUT });

    // Het detail-scherm toont altijd het objectnummer (groot, bovenin).
    // We controleren de aanwezigheid van de "Locatie"-sectie als anker.
    await expect(
      zichtbaar(page, "Locatie").first(),
    ).toBeVisible({ timeout: INHOUD_TIMEOUT });

    // Materialen & Details-sectie is altijd aanwezig.
    await expect(
      zichtbaar(page, "Materialen & Details").first(),
    ).toBeVisible({ timeout: INHOUD_TIMEOUT });
  });
});
