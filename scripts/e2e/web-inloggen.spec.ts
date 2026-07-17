// E2E: firevault web-app — inlogmodule regressietest.
//
// Dekt alle relevante login-scenario's:
//   1. API: correct wachtwoord geeft "verify_2fa" of "setup_2fa"
//   2. API: verkeerd wachtwoord → 401
//   3. API: onbekend e-mailadres → 401 (geen email-enumeratie)
//   4. API: wachtwoord-vergeten altijd 204 (ook voor onbekend adres)
//   5. API: /auth/me zonder sessie → 401
//   6. API: volledige login + /auth/me geeft correcte structuur incl. effectieve bevoegdheden
//   7. API: uitloggen vernietigt sessie, daarna /auth/me → 401
//   8. UI: volledige login via browser (e-mail → wachtwoord → TOTP → dashboard)
//
// Draaien: pnpm --filter @workspace/scripts run e2e-web
// Vereist: lopende workflows api-server + firevault web, env DATABASE_URL en
// REPLIT_DEV_DOMAIN.
import { expect, test, type Page } from "@playwright/test";

import { authenticator } from "otplib";

import { programmatischInloggen } from "./web-api-proxy";
import {
  E2E_WEB_EMAIL,
  E2E_WEB_WACHTWOORD,
  E2E_WEB_TOTP_SECRET,
  setupE2eWebAccount,
  archiveerE2eWebAccount,
} from "../src/e2e-monteur-testaccount";

// ── Setup / teardown ─────────────────────────────────────────────────────────
test.beforeAll(async () => {
  await setupE2eWebAccount();
});

test.afterAll(async () => {
  await archiveerE2eWebAccount();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function logIn(page: Page): Promise<void> {
  await programmatischInloggen(page, E2E_WEB_EMAIL, E2E_WEB_WACHTWOORD, E2E_WEB_TOTP_SECRET);
  await page.goto("/");
}

// ── API-niveau tests (page.request) ─────────────────────────────────────────

test("API: correct wachtwoord → 200 met status-veld", async ({ page }) => {
  const res = await page.request.post("/api/auth/login", {
    data: { email: E2E_WEB_EMAIL, wachtwoord: E2E_WEB_WACHTWOORD },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(["verify_2fa", "setup_2fa"]).toContain(body.status);
});

test("API: verkeerd wachtwoord → 401", async ({ page }) => {
  const res = await page.request.post("/api/auth/login", {
    data: { email: E2E_WEB_EMAIL, wachtwoord: "FoutWachtwoord!999" },
  });
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body.error).toBeTruthy();
});

test("API: onbekend e-mailadres → 401 (geen email-enumeratie)", async ({ page }) => {
  const res = await page.request.post("/api/auth/login", {
    data: { email: "onbestaand-e2e@fps.local", wachtwoord: "EnigWachtwoord!1" },
  });
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body.error).toBeTruthy();
});

test("API: wachtwoord-vergeten altijd 204 (ook voor onbekend adres)", async ({ page }) => {
  const resBekend = await page.request.post("/api/auth/wachtwoord-vergeten", {
    data: { email: E2E_WEB_EMAIL },
  });
  expect(resBekend.status()).toBe(204);

  const resOnbekend = await page.request.post("/api/auth/wachtwoord-vergeten", {
    data: { email: "bestaat-niet@fps.local" },
  });
  expect(resOnbekend.status()).toBe(204);
});

test("API: /auth/me zonder sessie → 401", async ({ page }) => {
  const res = await page.request.get("/api/auth/me");
  expect(res.status()).toBe(401);
});

test("API: volledige login + /auth/me geeft correcte structuur met effectieve bevoegdheden", async ({
  page,
}) => {
  await test.step("stap 1 — e-mail en wachtwoord", async () => {
    const res = await page.request.post("/api/auth/login", {
      data: { email: E2E_WEB_EMAIL, wachtwoord: E2E_WEB_WACHTWOORD },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).status).toBe("verify_2fa");
  });

  await test.step("stap 2 — TOTP verificatie", async () => {
    const code = authenticator.generate(E2E_WEB_TOTP_SECRET);
    const res = await page.request.post("/api/auth/2fa/verify", {
      data: { code },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.id).toBeGreaterThan(0);
    expect(body.email).toBe(E2E_WEB_EMAIL);
    expect(typeof body.bevoegdheden).toBe("object");
    expect(body.bevoegdheden).not.toBeNull();
    expect(body.rol).toBeTruthy();
  });

  await test.step("/auth/me geeft consistente gebruikersdata terug", async () => {
    const res = await page.request.get("/api/auth/me");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.email).toBe(E2E_WEB_EMAIL);
    expect(typeof body.bevoegdheden).toBe("object");
    expect(body.bevoegdheden).not.toBeNull();
    // Effectieve bevoegdheden: alle sleutels zijn modules met een getal-waarde
    for (const [, waarde] of Object.entries(body.bevoegdheden)) {
      expect(typeof waarde).toBe("number");
    }
    expect(body.id).toBeGreaterThan(0);
    expect(body.naam).toBeTruthy();
    expect(body.rol).toBeTruthy();
  });
});

test("API: uitloggen vernietigt sessie — daarna /auth/me → 401", async ({ page }) => {
  await test.step("inloggen via API", async () => {
    await page.request.post("/api/auth/login", {
      data: { email: E2E_WEB_EMAIL, wachtwoord: E2E_WEB_WACHTWOORD },
    });
    const code = authenticator.generate(E2E_WEB_TOTP_SECRET);
    const res = await page.request.post("/api/auth/2fa/verify", { data: { code } });
    expect(res.status()).toBe(200);
  });

  await test.step("/auth/me werkt na inloggen", async () => {
    const res = await page.request.get("/api/auth/me");
    expect(res.status()).toBe(200);
  });

  await test.step("uitloggen", async () => {
    const res = await page.request.post("/api/auth/logout");
    expect(res.status()).toBe(204);
  });

  await test.step("/auth/me geeft 401 na uitloggen", async () => {
    const res = await page.request.get("/api/auth/me");
    expect(res.status()).toBe(401);
  });
});

// ── UI-niveau test ───────────────────────────────────────────────────────────

test("UI: volledige login via browser leidt naar dashboard", async ({ page }) => {
  // Onboarding-scherm omzeilen — de e2e-browser heeft geen localStorage.
  await page.addInitScript(() => {
    localStorage.setItem("fps.welkom.afgerond", "true");
    localStorage.setItem("fps_onboarding_voltooid", "true");
  });

  await logIn(page);

  // Na succesvolle login verschijnt de sidebar (shadcn: data-sidebar="sidebar")
  // die voor alle ingelogde rollen zichtbaar is.
  await expect(page.locator('[data-sidebar="sidebar"]')).toBeVisible({ timeout: 20_000 });

  // Het loginscherm is verdwenen.
  await expect(page.locator("#email")).not.toBeVisible();

  // De app is geladen — geen lege pagina of foutpagina.
  await expect(page.locator("body")).not.toBeEmpty();
});
