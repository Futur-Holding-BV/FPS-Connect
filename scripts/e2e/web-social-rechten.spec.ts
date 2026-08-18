// E2E-bewijs social-campagnekoppeling-rechten (task #1061).
//
// De campagnekoppeling-UI in OpstellerDialog (social.tsx) is gated op
// marketing:3. Twee profielen worden getoetst:
//   1. Social-only   (social:3, marketing:0) → select-campagne NIET zichtbaar
//   2. Social+Mktg   (social:3, marketing:3) → select-campagne WEL zichtbaar
//
// Draaien: pnpm --filter @workspace/scripts run e2e-web
// Vereist: lopende workflows api-server + firevault, env DATABASE_URL +
// REPLIT_DEV_DOMAIN.
import { expect, test, type Page } from "@playwright/test";

import { programmatischInloggen } from "./web-api-proxy";
import {
  setupE2eSocialRechtenAccounts,
  archiveerE2eSocialRechtenAccounts,
  E2E_SOC_ONLY_EMAIL,
  E2E_SOC_ONLY_WACHTWOORD,
  E2E_SOC_ONLY_TOTP_SECRET,
  E2E_SOC_MKTG_EMAIL,
  E2E_SOC_MKTG_WACHTWOORD,
  E2E_SOC_MKTG_TOTP_SECRET,
} from "../src/e2e-monteur-testaccount";

const INHOUD_TIMEOUT = 20_000;

// ── Setup / teardown ──────────────────────────────────────────────────────────

test.beforeAll(async () => {
  await setupE2eSocialRechtenAccounts();
});

test.afterAll(async () => {
  await archiveerE2eSocialRechtenAccounts();
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

/**
 * Navigeert naar de social-pagina, activeert de tab "Berichten" en opent de
 * OpstellerDialog via de "Nieuw bericht"-knop. Geeft de open dialog-content
 * terug.
 *
 * De pagina opent standaard op de "kalender"-tab; `button-nieuw-bericht` is
 * uitsluitend zichtbaar binnen de inactieve `BerichtenTab`, dus de tab moet
 * eerst expliciet worden aangeklikt.
 */
async function openNieuwBerichtDialog(page: Page) {
  await page.goto("/crm/social");
  // Wacht tot de pagina geladen is (paginatitel zichtbaar).
  await expect(
    page.getByRole("heading", { name: "Social media" }),
  ).toBeVisible({ timeout: INHOUD_TIMEOUT });

  // Klik op de "Berichten"-tab zodat de BerichtenTab gerenderd wordt.
  const berichtenTab = page.getByRole("tab", { name: /Berichten/i });
  await expect(berichtenTab).toBeVisible({ timeout: INHOUD_TIMEOUT });
  await berichtenTab.click();

  const knop = page.getByTestId("button-nieuw-bericht");
  await expect(knop).toBeVisible({ timeout: INHOUD_TIMEOUT });
  await knop.click();

  // Dialog is open wanneer de titel zichtbaar is.
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Nieuw social bericht")).toBeVisible({
    timeout: 5_000,
  });
  return dialog;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("Social-only (marketing:0): campagnekoppeling-UI NIET zichtbaar in opsteller", async ({
  page,
}) => {
  await test.step("inloggen als social-only gebruiker", async () => {
    await logIn(
      page,
      E2E_SOC_ONLY_EMAIL,
      E2E_SOC_ONLY_WACHTWOORD,
      E2E_SOC_ONLY_TOTP_SECRET,
    );
  });

  let dialog: ReturnType<Page["getByRole"]>;

  await test.step("navigeer naar /crm/social en open OpstellerDialog", async () => {
    dialog = await openNieuwBerichtDialog(page);
  });

  await test.step("select-campagne is NIET aanwezig (marketing:0)", async () => {
    // Het element wordt bewust niet gerenderd (magCampagneKoppelen = false),
    // dus het mag ook niet in de DOM zitten.
    await expect(dialog!.getByTestId("select-campagne")).not.toBeAttached();
  });
});

test("Social+Marketing (marketing:3): campagnekoppeling-UI WEL zichtbaar in opsteller", async ({
  page,
}) => {
  await test.step("inloggen als social+marketing gebruiker", async () => {
    await logIn(
      page,
      E2E_SOC_MKTG_EMAIL,
      E2E_SOC_MKTG_WACHTWOORD,
      E2E_SOC_MKTG_TOTP_SECRET,
    );
  });

  let dialog: ReturnType<Page["getByRole"]>;

  await test.step("navigeer naar /crm/social en open OpstellerDialog", async () => {
    dialog = await openNieuwBerichtDialog(page);
  });

  await test.step("select-campagne is WEL zichtbaar (marketing:3)", async () => {
    await expect(dialog!.getByTestId("select-campagne")).toBeVisible({
      timeout: 5_000,
    });
  });
});
