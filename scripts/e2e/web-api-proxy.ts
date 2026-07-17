import { type Page } from "@playwright/test";
import { authenticator } from "otplib";

const API_SERVER_LOCAL = "http://localhost:8080";

/**
 * Installeert een Playwright-route-interceptor die alle browser-requests naar
 * /api/* doorstuurt naar de lokale api-server (localhost:8080), met de
 * sessie-cookie (fps.sid) expliciet meegegeven.
 *
 * ACHTERGROND:
 * Chromium in de Replit-omgeving bereikt de mTLS-proxy niet. Browser-requests
 * naar https://{devDomain}/api/* mislukken dus altijd. De interceptor vervangt
 * ze door Playwright's eigen HTTP-transport (buiten de browser), dat wél bij
 * localhost:8080 kan.
 *
 * SESSIE-PROBLEEM:
 * De sessie-cookie (fps.sid) heeft Secure; SameSite=None. De browser slaat
 * hem op voor het devDomain (HTTPS). Wanneer route.fetch doorleidt naar
 * localhost:8080 (HTTP) zonder expliciete Cookie-header, ziet de server geen
 * fps.sid en geeft hij "Geen actieve inlogpoging". Oplossing: haal fps.sid
 * op uit de Playwright context-store en stuur hem expliciet mee.
 *
 * FILE-UPLOAD UITZONDERING:
 * route.fetch() kan multipart/form-data bodies niet betrouwbaar forwarden —
 * de binary stream is al geconsumeerd zodra Playwright de route intercepteert.
 * Workaround: stuur multipart-requests via route.continue() met cookie-header
 * aanpassing. route.continue() stuurt de originele request door inclusief body.
 *
 * PATROON:
 * Gebruik altijd installeProxyMetSessie() (na programmatisch inloggen).
 * setupApiProxy() is alleen voor tests die géén browsersessie nodig hebben.
 */
export async function setupApiProxy(page: Page): Promise<void> {
  await page.route(/\/api\/.*/, async (route) => {
    const origUrl = new URL(route.request().url());
    const localUrl = `${API_SERVER_LOCAL}${origUrl.pathname}${origUrl.search}`;

    try {
      const response = await route.fetch({ url: localUrl });
      await route.fulfill({ response });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("already handled")) {
        try {
          await route.abort("failed");
        } catch {
          // route.abort() zelf kan ook "already handled" gooien — veilig negeren.
        }
      }
    }
  });
}

/**
 * Installeert de API-proxy met de fps.sid sessie-cookie expliciet meegestuurd.
 * Gebruik dit NA programmatisch inloggen (programmatischInloggen()).
 *
 * Multipart/form-data uploads (bestandsupload) gaan via route.continue() zodat
 * de binaire body intact blijft — route.fetch() verbruikt de stream.
 */
async function installeProxyMetSessie(page: Page, sessionCookieWaarde: string): Promise<void> {
  const cookieHeaderWaarde = `fps.sid=${sessionCookieWaarde}`;
  await page.route(/\/api\/.*/, async (route) => {
    const contentType = route.request().headers()["content-type"] ?? "";
    const isMultipart = contentType.includes("multipart/form-data");

    if (isMultipart) {
      const bestaandeCookie = route.request().headers()["cookie"] ?? "";
      await route.continue({
        headers: {
          ...route.request().headers(),
          cookie: bestaandeCookie
            ? `${bestaandeCookie}; ${cookieHeaderWaarde}`
            : cookieHeaderWaarde,
        },
      });
      return;
    }

    try {
      const bestaandeCookie = route.request().headers()["cookie"] ?? "";
      const response = await route.fetch({
        headers: {
          ...route.request().headers(),
          cookie: bestaandeCookie
            ? `${bestaandeCookie}; ${cookieHeaderWaarde}`
            : cookieHeaderWaarde,
        },
      });
      await route.fulfill({ response });
    } catch (err) {
      // "Route is already handled" treedt op als de route al via continue()/fulfill()
      // afgehandeld is voordat de catch loopt — veilig negeren.
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("already handled")) {
        try {
          await route.abort();
        } catch {
          // Tweede catch: route.abort() zelf kan ook "already handled" gooien.
        }
      }
    }
  });
}

/**
 * Logt programmatisch in via page.request (omzeilt browser + proxy problemen),
 * installeert de sessie-proxy en navigeert naar de app.
 *
 * Dit is de correcte loginmethode voor browser-UI tests:
 * - page.request beheert cookies automatisch en correct (HTTPS devDomain)
 * - fps.sid wordt expliciet meegestuurd bij elke proxy-request
 * - geen browser-UI keyboard-type → geen TOTP-sessie-mismatch
 *
 * @param page        Playwright Page
 * @param email       E-mailadres van het testaccount
 * @param wachtwoord  Wachtwoord van het testaccount
 * @param totpSecret  TOTP-secret van het testaccount
 */
export async function programmatischInloggen(
  page: Page,
  email: string,
  wachtwoord: string,
  totpSecret: string,
): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("fps.welkom.afgerond", "true");
    localStorage.setItem("fps_onboarding_voltooid", "true");
  });

  const res1 = await page.request.post("/api/auth/login", {
    data: { email, wachtwoord },
  });
  if (res1.status() !== 200) {
    throw new Error(`Login stap 1 mislukt: HTTP ${res1.status()}`);
  }

  for (let poging = 1; poging <= 3; poging++) {
    const code = authenticator.generate(totpSecret);
    const res2 = await page.request.post("/api/auth/2fa/verify", { data: { code } });
    if (res2.status() === 200) break;
    if (poging === 3) throw new Error("TOTP-verificatie mislukt na 3 pogingen.");
    await new Promise((r) => setTimeout(r, 32_000));
  }

  const contextCookies = await page.context().cookies();
  const sessionCookie = contextCookies.find((c) => c.name === "fps.sid");
  if (!sessionCookie) {
    throw new Error(
      "fps.sid niet gevonden na login. Beschikbare cookies: " +
        contextCookies.map((c) => c.name).join(", "),
    );
  }

  await installeProxyMetSessie(page, sessionCookie.value);
}
