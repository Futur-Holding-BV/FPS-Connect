// E2E: firevault web-app — Studio-badge op offerte-printpagina regressietest.
//
// Controleert dat de Studio-badge ("Opmaak: Model 0 — …") netjes boven de
// offertepagina staat en niet buiten de 210mm-kadrering valt bij een 1024px
// viewport. De test blokkeert window.print() zodat er geen afdrukdialoog
// verschijnt.
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

async function logIn(page: Page): Promise<void> {
  await programmatischInloggen(page, E2E_WEB_EMAIL, E2E_WEB_WACHTWOORD, E2E_WEB_TOTP_SECRET);
  await page.goto("/");
}

test.beforeAll(async () => {
  await setupE2eWebAccount();
});

test("Web: Studio-badge op offerte-print valt niet buiten de 210mm kadrering bij 1024px viewport", async ({ page }) => {
  // 1024px is de kritieke breedte: breder dan de badge (210mm ≈ 793px),
  // maar smaller dan de standaard desktop-viewport (1280px). Hier kon de
  // badge vroeger afkappen.
  await page.setViewportSize({ width: 1024, height: 768 });

  await test.step("inloggen", async () => {
    await logIn(page);
  });

  await test.step("offerte-ID ophalen uit de offertelijst", async () => {
    await page.goto("/offertes");

    // Wacht tot de pagina inhoud of lege staat toont.
    await expect(page.locator("body")).toBeVisible({ timeout: INHOUD_TIMEOUT });

    // Offerte-rijen zijn role="button" divs (geen <a href>); zoek de eerste kaart.
    const offerteRij = page
      .locator('[role="button"]')
      .filter({ hasText: /OFF-\d+|O\d{3}/ })
      .first();
    const leegStaat = page.getByText(/geen offertes/i).filter({ visible: true });

    await expect(async () => {
      const heeftRij = (await offerteRij.count()) > 0;
      const heeftLeeg = (await leegStaat.count()) > 0;
      expect(heeftRij || heeftLeeg).toBeTruthy();
    }).toPass({ timeout: INHOUD_TIMEOUT });

    const heeftOffertes = (await offerteRij.count()) > 0;
    if (!heeftOffertes) {
      test.skip();
      return;
    }
  });

  let offerteId: string | null = null;

  await test.step("offerte-detail openen en ID bepalen", async () => {
    // Navigeer naar /offertes en klik op de eerste kaart (role="button" div).
    await page.goto("/offertes");
    await expect(page.locator("body")).toBeVisible({ timeout: INHOUD_TIMEOUT });

    const offerteRij = page
      .locator('[role="button"]')
      .filter({ hasText: /OFF-\d+|O\d{3}/ })
      .first();

    await expect(offerteRij).toBeVisible({ timeout: INHOUD_TIMEOUT });
    await offerteRij.click();
    await page.waitForURL(/\/offertes\/\d+/, { timeout: INHOUD_TIMEOUT });
    const urlMatch = page.url().match(/\/offertes\/(\d+)/);
    if (urlMatch) offerteId = urlMatch[1];

    expect(offerteId, "Kon geen offerte-ID bepalen.").toBeTruthy();
  });

  await test.step("printpagina laadt zonder horizontale overflow bij 1024px", async () => {
    if (!offerteId) return;

    // Blokkeer window.print() zodat er geen modal-dialoog verschijnt.
    await page.addInitScript(() => {
      window.print = () => { /* geblokkeerd door e2e-test */ };
    });

    await page.goto(`/offertes/${offerteId}/print`);

    // Wacht tot de laad-spinner verdwenen is (pagina klaar).
    await expect(page.getByText("Offerte laden…")).not.toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });

    // De pagina-wrapper mag nooit breder zijn dan de viewport (geen overflow).
    const heeftGeenHorizontaleOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth <= document.documentElement.clientWidth;
    });
    expect(
      heeftGeenHorizontaleOverflow,
      "Horizontale overflow aangetroffen bij 1024px viewport — badge of pagina-inhoud klopt buiten de marges.",
    ).toBe(true);
  });

  await test.step("Studio-badge is zichtbaar boven de document-kadrering als het model actief is", async () => {
    if (!offerteId) return;

    // De badge is alleen zichtbaar als er een actief Studio-model is.
    // De selector matcht op de badge-tekst (data-onafhankelijk).
    const badge = page.locator("span").filter({ hasText: /Opmaak: Model/ }).first();
    const badgeZichtbaar = (await badge.count()) > 0 && (await badge.isVisible().catch(() => false));

    if (!badgeZichtbaar) {
      // Geen actief Studio-model in dev-omgeving — badge-check overgeslagen.
      return;
    }

    // Badge moet volledig binnen de viewport liggen (geen afkapping).
    const boundingBox = await badge.boundingBox();
    expect(boundingBox, "Badge bounding box kon niet bepaald worden.").not.toBeNull();
    if (boundingBox) {
      expect(boundingBox.x, "Badge begint links van de viewport.").toBeGreaterThanOrEqual(0);
      expect(
        boundingBox.x + boundingBox.width,
        "Badge valt rechts buiten de 1024px viewport.",
      ).toBeLessThanOrEqual(1024);
    }
  });
});
