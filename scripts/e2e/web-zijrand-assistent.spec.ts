// E2E: ASSISTENT_01 fase 1 — vaste rechterrand met tabbladen Werkbak/Assistent.
//
// Controleert:
//  1. Topbalk toont werkbak- en assistent-knop.
//  2. Assistent-knop opent het rechterrand-paneel met beide tabbladen.
//  3. Contextregel "Je kijkt naar: …" is zichtbaar en verandert per scherm.
//  4. Open/dicht-stand wordt onthouden na herladen (localStorage).
//
// Draaien: pnpm --filter @workspace/scripts run e2e-web (of playwright test dit bestand)
import { expect, test, type Page } from "@playwright/test";

import { programmatischInloggen } from "./web-api-proxy";
import {
  E2E_WEB_ADMIN_EMAIL,
  E2E_WEB_ADMIN_WACHTWOORD,
  E2E_WEB_ADMIN_TOTP_SECRET,
  setupE2eWebAdminAccount,
} from "../src/e2e-monteur-testaccount";

const TIMEOUT = 20_000;
const MOCK_AUTORISATIE_CONTEXT = "a".repeat(64);

test.beforeAll(async () => {
  await setupE2eWebAdminAccount();
});

async function logIn(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("fps_onboarding_voltooid", "1");
    window.localStorage.setItem("fps.welkom.afgerond", "1");
  });
  await programmatischInloggen(page, E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET);
  await page.goto("/");
  await page.addStyleTag({
    content: "#replit-dev-banner { display: none !important; pointer-events: none !important; }",
  });
  // Replit dev-banner overlapt de rechterbovenhoek; wegklikken zodat kliks
  // op zijrand-knoppen niet onderschept worden (alleen in dev-preview aanwezig).
  const bannerDicht = page.locator("#replit-dev-banner .banner-close");
  try {
    await bannerDicht.waitFor({ state: "visible", timeout: 3000 });
    await bannerDicht.click();
  } catch {
    // geen banner — prima
  }
  // Eerste-keer welkomwizard kan alsnog verschijnen; klik hem dan weg.
  const naarPlatform = page.getByRole("button", { name: "Naar het platform" });
  try {
    await naarPlatform.waitFor({ state: "visible", timeout: 5000 });
    await naarPlatform.click();
  } catch {
    // wizard niet getoond — prima
  }
}

test("Web: zijrand met Werkbak/Assistent-tabbladen", async ({ page }) => {
  await test.step("login en topbalk-knoppen zichtbaar", async () => {
    await logIn(page);
    await expect(page.getByTestId("assistent-balk-input")).toBeVisible({ timeout: TIMEOUT });
    await expect(page.getByTestId("knop-assistent")).toBeVisible({ timeout: TIMEOUT });
    await expect(page.getByTestId("knop-werkbak")).toBeVisible({ timeout: TIMEOUT });
  });

  await test.step("assistent-knop opent paneel met beide tabbladen", async () => {
    await page.getByTestId("knop-assistent").click();
    await expect(page.getByTestId("paneel-zijrand")).toBeVisible({ timeout: TIMEOUT });
    await expect(page.getByTestId("tab-zijrand-werkbak")).toBeVisible();
    await expect(page.getByTestId("tab-zijrand-assistent")).toBeVisible();
    await expect(page.getByTestId("assistent-context-label")).toBeVisible();
    await expect(page.getByTestId("assistent-context-label")).toContainText("Je kijkt naar");
  });

  await test.step("contextregel verandert per scherm", async () => {
    await page.evaluate(() => {
      window.history.pushState({}, "", "/gebouwen");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(page.getByTestId("assistent-context-label")).toContainText("Gebouwen", { timeout: TIMEOUT });
  });

  await test.step("open-stand wordt voor herladen opgeslagen", async () => {
    await expect.poll(() => page.evaluate(() => localStorage.getItem("fps.zijrand.open"))).toBe("1");
    // Dichtklappen bewaart dezelfde voorkeur als gesloten.
    await page.getByTestId("knop-zijrand-sluiten").click();
    await expect(page.getByTestId("paneel-zijrand")).toBeHidden();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("fps.zijrand.open"))).toBe("0");
  });
});

test("Web: launcher verstuurt, citeert en bewaart bij clientnavigatie", async ({ page }) => {
  await logIn(page);
  const actueleAutorisatieContext = await page.evaluate(async () => {
    const response = await fetch("/api/adviseur/gesprek");
    const data = await response.json() as { autorisatie_context?: string };
    return data.autorisatie_context ?? "";
  });
  expect(actueleAutorisatieContext).toMatch(/^[a-f0-9]{64}$/);
  // De API-proxy wordt tijdens programmatischInloggen geregistreerd. Registreer
  // deze gerichte mock erna, zodat alleen de nieuwe assistentvraag wordt
  // onderschept en de rest van de app de echte API blijft gebruiken.
  await page.route("**/api/adviseur/vraag", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        antwoord: "Dit antwoord blijft tijdens navigatie beschikbaar.",
        gesprek_id: 123,
        autorisatie_context: actueleAutorisatieContext || MOCK_AUTORISATIE_CONTEXT,
        uitkomst: "beantwoord",
        citaties: [{
          label: "Gebouwen",
          bron: "Gebouwen in FPS Connect",
          entiteitstype: "gebouw",
          entiteit_id: 1,
          href: "/gebouwen",
        }],
      }),
    });
  });

  const launcher = page.getByTestId("assistent-balk-input");
  await launcher.fill("Wat betekent dit scherm?");
  await launcher.press("Enter");
  await expect(page.getByTestId("paneel-zijrand")).toBeVisible({ timeout: TIMEOUT });
  await expect(page.getByText("Dit antwoord blijft tijdens navigatie beschikbaar.")).toBeVisible({ timeout: TIMEOUT });
  const mockCitatie = page
    .locator('[data-testid="assistent-citatie-link"][href="/gebouwen"]')
    .filter({ hasText: "Gebouwen in FPS Connect" });
  await expect(mockCitatie).toBeVisible();
  await expect(page.locator('[data-testid="paneel-zijrand"] input[type="file"]')).toHaveCount(0);

  // Gebruik de zojuist getoonde bronlink zelf; dit bewijst tegelijk dat de
  // citatie naar het juiste Connect-scherm navigeert.
  await mockCitatie.click();
  await expect(page).toHaveURL(/\/gebouwen$/);
  await expect(page.getByText("Dit antwoord blijft tijdens navigatie beschikbaar.")).toBeVisible();

  await page.getByTestId("knop-zijrand-sluiten").click();
  await expect(page.getByTestId("paneel-zijrand")).toBeHidden();
  await page.getByTestId("knop-assistent").click();
  await expect(page.getByText("Dit antwoord blijft tijdens navigatie beschikbaar.")).toBeVisible();
});

test("Mobiel: alleen de volledige assistentpagina, geen zijpaneel", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await logIn(page);
  await expect(page.getByTestId("assistent-balk-input")).toBeHidden();
  await page.getByTestId("knop-assistent").click();
  await expect(page).toHaveURL(/\/assistent$/);
  await expect(page.getByTestId("assistent-context-label")).toBeVisible({ timeout: TIMEOUT });
  await expect(page.getByTestId("paneel-zijrand")).toHaveCount(0);
});
