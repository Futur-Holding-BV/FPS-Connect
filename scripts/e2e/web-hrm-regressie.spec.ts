// E2E: HRM regressietest — bestaande routes mogen niet geraakt zijn door wizard.
//
// Dekt:
//   1. Bestaande gebruikers kunnen nog inloggen (API + UI)
//   2. Personeelslijst laadt zonder fout
//   3. Bestaand personeelsdossier opent (GET /medewerkers/:id)
//   4. Legacy POST /medewerkers (zonder wizard) werkt nog
//   5. Wizard raakt bestaande medewerkerdata niet aan
//   6. Uitloggen vernietigt sessie (geen lek via wizard-flow)
//
// Draaien: pnpm --filter @workspace/scripts run e2e-web
// Vereist: lopende workflows api-server + firevault web, env DATABASE_URL.
import { expect, test, type Page } from "@playwright/test";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { setupApiProxy } from "./web-api-proxy";

import {
  E2E_WEB_EMAIL,
  E2E_WEB_WACHTWOORD,
  E2E_WEB_ADMIN_EMAIL,
  E2E_WEB_ADMIN_WACHTWOORD,
  E2E_WEB_ADMIN_TOTP_SECRET,
  setupE2eWebAccount,
  setupE2eWebAdminAccount,
  genereerVersWebTotp,
  wachtOpNieuwTotpVenster,
} from "../src/e2e-monteur-testaccount";
import { authenticator } from "otplib";

const REGRESSIE_NAAM_PREFIX = "E2E-REGRESSIE-MED";

// ── Setup / teardown ─────────────────────────────────────────────────────────

test.beforeAll(async () => {
  await setupE2eWebAccount();
  await setupE2eWebAdminAccount();
});

test.afterAll(async () => {
  // Verwijder eventuele regressie-testmedewerkers
  try {
    await db.execute(
      sql`DELETE FROM medewerkers WHERE naam LIKE ${REGRESSIE_NAAM_PREFIX + "%"} AND medewerker_status = 'concept'`,
    );
  } catch {
    // best-effort
  }
});

// ── Login-helpers ─────────────────────────────────────────────────────────────

async function apiLoginGebruiker(page: Page): Promise<void> {
  const res1 = await page.request.post("/api/auth/login", {
    data: { email: E2E_WEB_EMAIL, wachtwoord: E2E_WEB_WACHTWOORD },
  });
  expect(res1.status()).toBe(200);
  const body1 = await res1.json() as { status?: string };
  const code = genereerTotpCode("KJ4WWZLNMNXW4RTF");
  const res2 = await page.request.post("/api/auth/2fa/verify", { data: { code } });
  if (res2.status() !== 200 && body1.status === "verify_2fa") {
    await new Promise((r) => setTimeout(r, 32_000));
    const code2 = genereerTotpCode("KJ4WWZLNMNXW4RTF");
    await page.request.post("/api/auth/2fa/verify", { data: { code: code2 } });
  }
}

async function apiLoginBeheerder(page: Page): Promise<void> {
  const res1 = await page.request.post("/api/auth/login", {
    data: { email: E2E_WEB_ADMIN_EMAIL, wachtwoord: E2E_WEB_ADMIN_WACHTWOORD },
  });
  expect(res1.status()).toBe(200);
  for (let p = 1; p <= 3; p++) {
    const code = authenticator.generate(E2E_WEB_ADMIN_TOTP_SECRET);
    const res2 = await page.request.post("/api/auth/2fa/verify", { data: { code } });
    if (res2.status() === 200) return;
    if (p < 3) await new Promise((r) => setTimeout(r, 32_000));
  }
}

function genereerTotpCode(secret: string): string {
  return authenticator.generate(secret);
}

async function browserLoginBeheerder(page: Page): Promise<void> {
  await setupApiProxy(page);
  await page.addInitScript(() => {
    localStorage.setItem("fps.welkom.afgerond", "true");
    localStorage.setItem("fps_onboarding_voltooid", "true");
  });
  await page.goto("/");
  await expect(page.locator("#email")).toBeVisible({ timeout: 60_000 });
  await page.locator("#email").fill(E2E_WEB_ADMIN_EMAIL);
  await page.locator("#wachtwoord").fill(E2E_WEB_ADMIN_WACHTWOORD);

  for (let poging = 1; poging <= 3; poging++) {
    if (poging > 1) {
      await wachtOpNieuwTotpVenster();
      if (await page.locator("#email").isVisible().catch(() => false)) {
        await page.locator("#email").fill(E2E_WEB_ADMIN_EMAIL);
        await page.locator("#wachtwoord").fill(E2E_WEB_ADMIN_WACHTWOORD);
      }
    }
    if (await page.getByRole("button", { name: "Inloggen" }).isVisible()) {
      await page.getByRole("button", { name: "Inloggen" }).click();
    }
    try {
      await page.locator("[data-input-otp]").waitFor({ state: "attached", timeout: 15_000 });
    } catch {
      if (poging === 3) throw new Error("TOTP-invoer niet verschenen.");
      continue;
    }
    const code = await genereerVersWebTotp();
    await page.locator("[data-input-otp]").focus();
    await page.keyboard.type(code);
    try {
      await page.locator("[data-input-otp]").waitFor({ state: "detached", timeout: 15_000 });
      return;
    } catch {
      if (poging === 3) throw new Error("Browser login mislukt.");
    }
  }
}

// ── Regressietests ────────────────────────────────────────────────────────────

test("regressie: login werkt nog voor gewone gebruiker (API)", async ({ page }) => {
  const res = await page.request.post("/api/auth/login", {
    data: { email: E2E_WEB_EMAIL, wachtwoord: E2E_WEB_WACHTWOORD },
  });
  expect(res.status()).toBe(200);
  const body = await res.json() as { status?: string };
  expect(["verify_2fa", "setup_2fa"]).toContain(body.status);
});

test("regressie: login werkt nog voor beheerder (API)", async ({ page }) => {
  const res = await page.request.post("/api/auth/login", {
    data: { email: E2E_WEB_ADMIN_EMAIL, wachtwoord: E2E_WEB_ADMIN_WACHTWOORD },
  });
  expect(res.status()).toBe(200);
  const body = await res.json() as { status?: string };
  expect(["verify_2fa", "setup_2fa"]).toContain(body.status);
});

test("regressie: /auth/me na login bevat correcte velden", async ({ page }) => {
  await apiLoginBeheerder(page);
  const res = await page.request.get("/api/auth/me");
  expect(res.status()).toBe(200);
  const body = await res.json() as { id?: number; email?: string; rol?: string; bevoegdheden?: object };
  expect(body.id).toBeGreaterThan(0);
  expect(body.email).toBe(E2E_WEB_ADMIN_EMAIL);
  expect(body.rol).toBeTruthy();
  expect(typeof body.bevoegdheden).toBe("object");
});

test("regressie: personeelslijst laadt zonder fout (GET /medewerkers)", async ({ page }) => {
  await apiLoginBeheerder(page);
  const res = await page.request.get("/api/medewerkers");
  expect(res.status()).toBe(200);
  const body = await res.json() as unknown[];
  expect(Array.isArray(body)).toBe(true);
});

test("regressie: bestaand personeelsdossier opent via GET /medewerkers/:id", async ({ page }) => {
  await apiLoginBeheerder(page);

  // Haal de lijst op — neem de eerste actieve medewerker
  const listRes = await page.request.get("/api/medewerkers");
  expect(listRes.status()).toBe(200);
  const lijst = await listRes.json() as Array<{ id?: number; naam?: string }>;

  if (lijst.length === 0) {
    // Geen medewerkers in de testdatabase — sla over (data-onafhankelijk)
    test.skip();
    return;
  }

  const eersteId = lijst[0]?.id;
  expect(typeof eersteId).toBe("number");

  const detailRes = await page.request.get(`/api/medewerkers/${eersteId}`);
  expect(detailRes.status()).toBe(200);
  const detail = await detailRes.json() as { id?: number; naam?: string };
  expect(detail.id).toBe(eersteId);
  expect(typeof detail.naam).toBe("string");
});

test("regressie: legacy POST /medewerkers werkt zonder wizard (direct aanmaken)", async ({ page }) => {
  await apiLoginBeheerder(page);

  const naam = `${REGRESSIE_NAAM_PREFIX}-DIRECT-${Date.now()}`;
  const res = await page.request.post("/api/medewerkers", {
    data: {
      naam,
      email: `direct-${Date.now()}@e2e-regressie.fps.local`,
      medewerker_status: "concept",
      functie: null,
      werkmaatschappij: null,
      in_dienst_sinds: null,
    },
  });
  expect([200, 201]).toContain(res.status());
  const body = await res.json() as { id?: number; naam?: string };
  expect(typeof body.id).toBe("number");
  expect(body.naam).toBe(naam);
});

test("regressie: wizard-endpoints raken bestaande medewerkerdata niet aan", async ({ page }) => {
  await apiLoginBeheerder(page);

  // Haal een bestaande medewerker op
  const listRes = await page.request.get("/api/medewerkers");
  expect(listRes.status()).toBe(200);
  const lijst = await listRes.json() as Array<{ id?: number; naam?: string; email?: string }>;
  if (lijst.length === 0) {
    test.skip();
    return;
  }

  const bestaande = lijst.find((m) => m.id !== undefined);
  if (!bestaande?.id) {
    test.skip();
    return;
  }

  const origineleNaam = bestaande.naam;

  // GET wizard-status op bestaande medewerker moet niet crashen of data wijzigen
  const statusRes = await page.request.get(`/api/medewerkers/${bestaande.id}/wizard-status`);
  // 200 of 404 zijn beide acceptabel (concept-veld leeg = geen wizardstatus)
  expect([200, 404]).toContain(statusRes.status());

  // Naam is na ophalen wizard-status ongewijzigd
  const detailRes = await page.request.get(`/api/medewerkers/${bestaande.id}`);
  expect(detailRes.status()).toBe(200);
  const detail = await detailRes.json() as { naam?: string };
  expect(detail.naam).toBe(origineleNaam);
});

test("regressie: uitloggen vernietigt sessie — /auth/me daarna 401", async ({ page }) => {
  await apiLoginBeheerder(page);

  const meRes = await page.request.get("/api/auth/me");
  expect(meRes.status()).toBe(200);

  const logoutRes = await page.request.post("/api/auth/logout");
  expect(logoutRes.status()).toBe(204);

  const naLogout = await page.request.get("/api/auth/me");
  expect(naLogout.status()).toBe(401);
});

test("regressie: UI personeelspagina laadt na login (geen witte pagina)", async ({ page }) => {
  await browserLoginBeheerder(page);
  await page.goto("/personeel");
  await page.waitForLoadState("networkidle");

  // Geen loginscherm, geen lege body
  const isLoginPagina = await page.locator("#email").isVisible().catch(() => false);
  expect(isLoginPagina).toBe(false);

  const tekst = await page.locator("body").textContent() ?? "";
  expect(tekst.length).toBeGreaterThan(10);
});
