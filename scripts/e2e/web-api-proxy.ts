import { type Page } from "@playwright/test";

const API_SERVER_LOCAL = "http://localhost:8080";

/**
 * Installeert een Playwright-route-interceptor die alle browser-requests naar
 * /api/* doorstelt naar de lokale api-server (localhost:8080).
 *
 * ACHTERGROND:
 * Chromium in de Replit-omgeving bereikt de mTLS-proxy niet. Browser-requests
 * naar https://{devDomain}/api/* mislukken dus altijd. De interceptor vervangt
 * ze door Playwright's eigen HTTP-transport (buiten de browser), dat wél bij
 * localhost:8080 kan.
 *
 * IMPLEMENTATIE — route.fetch({ url }) ipv page.request.fetch():
 * - route.fetch({ url }) is speciaal ontworpen voor gebruik in route-handlers
 *   (Playwright 1.35+). Het stuurt het originele verzoek (inclusief body,
 *   Cookie en andere headers) door naar een andere URL via Playwright's intern
 *   HTTP-transport, dus buiten de browser-stack.
 * - page.request.fetch() werkt NIET betrouwbaar vanuit een page.route()-handler
 *   in Playwright ^1.60 — requests bereiken localhost:8080 niet.
 * - route.fulfill({ response }) geeft de volledige response (inclusief
 *   Set-Cookie) terug aan de browser zodat sessie-cookies correct worden
 *   opgeslagen.
 *
 * PATROON:
 * Matcht uitsluitend https://<devDomain>/api/ zodat localhost:8080-aanroepen
 * van route.fetch zelf NIET worden onderschept (geen self-intercept deadlock,
 * ook al zou route.fetch internaal een globaal patroon gebruiken).
 */
export async function setupApiProxy(page: Page): Promise<void> {
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  if (!devDomain) {
    throw new Error(
      "REPLIT_DEV_DOMAIN is niet ingesteld — setupApiProxy vereist dit",
    );
  }

  const escaped = devDomain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`https://${escaped}/api/`);

  await page.route(pattern, async (route) => {
    const origUrl = new URL(route.request().url());
    const localUrl = `${API_SERVER_LOCAL}${origUrl.pathname}${origUrl.search}`;

    try {
      // route.fetch() stuurt het originele verzoek (methode, headers incl.
      // Cookie, body) door naar localUrl via Playwright's intern HTTP-transport.
      const response = await route.fetch({ url: localUrl });
      await route.fulfill({ response });
    } catch {
      await route.abort("failed");
    }
  });
}
