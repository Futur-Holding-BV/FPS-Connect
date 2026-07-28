// E2E: drieledige keuze bij gebruikersaanmaak voor interne profielen.
//
// Dekt de acceptatiecriteria van de taak:
//   1. Keuze 1: alleen gebruikersaccount — geen medewerkerdossier ontstaat
//   2. Keuze 2: account + medewerkerdossier (via bestaande POST
//      /medewerkers/onboarding) — geen onboardingscherm geopend
//   3. Keuze 3: account + doorsturen naar /personeel/onboarden?userId=<id>
//   4. Extern profiel (Klant): stap 3 verschijnt NIET
//
// Draaien: pnpm --filter @workspace/scripts run e2e-web
import { expect, test, type Page } from "@playwright/test";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { authenticator } from "otplib";

import {
  E2E_WEB_ADMIN_EMAIL,
  E2E_WEB_ADMIN_WACHTWOORD,
  E2E_WEB_ADMIN_TOTP_SECRET,
  setupE2eWebAdminAccount,
} from "../src/e2e-monteur-testaccount";

const PREFIX = "E2E-DOSSIERKEUZE";
const EMAIL_DOMEIN = "e2e-dossierkeuze.fps.local";

test.beforeAll(async () => {
  await setupE2eWebAdminAccount();
});

test.afterAll(async () => {
  // Best-effort cleanup: eerst medewerkers (FK), dan gebruikers.
  try {
    await db.execute(sql`DELETE FROM medewerkers WHERE naam LIKE ${PREFIX + "%"}`);
  } catch { /* best-effort */ }
  try {
    await db.execute(sql`DELETE FROM gebruikers WHERE email LIKE ${"%" + EMAIL_DOMEIN}`);
  } catch { /* best-effort */ }
});

// ── Login-helpers (zelfde patroon als web-hrm-wizard.spec.ts) ────────────────

async function apiLogin(page: Page): Promise<void> {
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
  throw new Error("API login mislukt na 3 TOTP-pogingen.");
}

async function apiLoginMetBrowser(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("fps.welkom.afgerond", "true");
    localStorage.setItem("fps_onboarding_voltooid", "true");
  });
  await apiLogin(page);
  const contextCookies = await page.context().cookies();
  const sessionCookie = contextCookies.find((c) => c.name === "fps.sid");
  if (!sessionCookie) throw new Error("Session cookie 'fps.sid' niet gevonden na apiLogin.");
  const cookieHeaderWaarde = `fps.sid=${sessionCookie.value}`;
  await page.route(/\/api\/.*/, async (route) => {
    try {
      const bestaandeCookie = route.request().headers()["cookie"] ?? "";
      const response = await route.fetch({
        headers: {
          ...route.request().headers(),
          cookie: bestaandeCookie ? `${bestaandeCookie}; ${cookieHeaderWaarde}` : cookieHeaderWaarde,
        },
      });
      await route.fulfill({ response });
    } catch {
      await route.abort();
    }
  });
}

// Zorg dat er minstens één functie in de catalogus staat (user-managed,
// bewust niet geseed — zie hrm-lege-catalogi).
async function zorgVoorFunctie(page: Page): Promise<void> {
  const res = await page.request.get("/api/functies");
  expect(res.status()).toBe(200);
  const lijst = (await res.json()) as Array<{ id: number }>;
  if (lijst.length === 0) {
    const aanmaak = await page.request.post("/api/functies", {
      data: { naam: `${PREFIX}-Functie` },
    });
    expect(aanmaak.status()).toBe(201);
  }
}

async function medewerkerAantal(email: string): Promise<number> {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM medewerkers WHERE email = ${email}`);
  return Number((r.rows[0] as any)?.n ?? 0);
}

// Doorloop stap 1+2 van de toevoegen-dialoog voor een functiegroep.
async function openDialoogTotStap2(page: Page, groep: string, naam: string, email: string): Promise<void> {
  await page.goto("/gebruikers");
  await page.getByRole("button", { name: "Gebruiker toevoegen" }).first().click();
  await expect(page.getByText("Kies een functie")).toBeVisible();
  await page.getByRole("button", { name: new RegExp(groep) }).first().click();
  await page.getByLabel("Naam").fill(naam);
  await page.getByLabel(/E-mail/i).fill(email);
}

test("keuze 1: alleen account — geen medewerkerdossier", async ({ page }) => {
  await apiLoginMetBrowser(page);
  const email = `keuze1-${Date.now()}@${EMAIL_DOMEIN}`;
  await openDialoogTotStap2(page, "Monteur", `${PREFIX} Keuze Een`, email);
  await page.getByRole("button", { name: "Volgende" }).click();

  // Drieledige keuze zichtbaar
  await expect(page.getByText("Wil je voor deze gebruiker ook een medewerkerdossier en onboarding starten?")).toBeVisible();
  await page.screenshot({ path: "test-results/dossier-keuze-stap3.png" });

  await page.getByTestId("dossier-keuze-1").click();
  await page.getByRole("button", { name: "Aanmaken", exact: true }).click();
  await expect(page.getByText("Wil je voor deze gebruiker ook een medewerkerdossier")).toBeHidden();

  // Account bestaat, dossier niet
  const g = await db.execute(sql`SELECT id FROM gebruikers WHERE email = ${email}`);
  expect(g.rows.length).toBe(1);
  expect(await medewerkerAantal(email)).toBe(0);
  // Geen redirect naar onboarding
  await expect(page).toHaveURL(/\/gebruikers/);
});

test("keuze 2: account + medewerkerdossier, geen onboardingflow", async ({ page }) => {
  await apiLoginMetBrowser(page);
  await zorgVoorFunctie(page);
  const email = `keuze2-${Date.now()}@${EMAIL_DOMEIN}`;
  await openDialoogTotStap2(page, "Monteur", `${PREFIX} Keuze Twee`, email);
  await page.getByRole("button", { name: "Volgende" }).click();

  await page.getByTestId("dossier-keuze-2").click();
  // Minimale dossiervelden
  await page.getByTestId("dossier-functie").click();
  await page.getByRole("option").first().click();
  await page.getByTestId("dossier-werkmaatschappij").click();
  await page.getByRole("option").first().click();
  await page.getByRole("button", { name: "Aanmaken", exact: true }).click();

  await expect(page.getByText("Wil je voor deze gebruiker ook een medewerkerdossier")).toBeHidden({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/gebruikers/); // géén onboardingscherm

  const g = await db.execute(sql`SELECT id FROM gebruikers WHERE email = ${email}`);
  expect(g.rows.length).toBe(1);
  const gebruikerId = Number((g.rows[0] as any).id);
  // Dossier bestaat en is gekoppeld aan de nieuwe gebruiker
  const m = await db.execute(sql`SELECT gebruiker_id FROM medewerkers WHERE email = ${email}`);
  expect(m.rows.length).toBe(1);
  expect(Number((m.rows[0] as any).gebruiker_id)).toBe(gebruikerId);
});

test("keuze 3: account + doorsturen naar onboardingscherm met userId", async ({ page }) => {
  await apiLoginMetBrowser(page);
  const email = `keuze3-${Date.now()}@${EMAIL_DOMEIN}`;
  await openDialoogTotStap2(page, "Monteur", `${PREFIX} Keuze Drie`, email);
  await page.getByRole("button", { name: "Volgende" }).click();

  await page.getByTestId("dossier-keuze-3").click();
  await page.getByRole("button", { name: "Aanmaken", exact: true }).click();

  // Redirect naar het bestaande onboardingscherm met gebruiker_id vooringevuld
  await expect(page).toHaveURL(/\/personeel\/onboarden\?userId=\d+/, { timeout: 15_000 });
  const g = await db.execute(sql`SELECT id FROM gebruikers WHERE email = ${email}`);
  expect(g.rows.length).toBe(1);
  const gebruikerId = Number((g.rows[0] as any).id);
  expect(page.url()).toContain(`userId=${gebruikerId}`);
  // Nog geen dossier: dat maakt de onboardingflow zelf aan
  expect(await medewerkerAantal(email)).toBe(0);
});

test("rolwijziging in stap 2 naar klant: geen drieledige keuze", async ({ page }) => {
  await apiLoginMetBrowser(page);
  const email = `rolwissel-${Date.now()}@${EMAIL_DOMEIN}`;
  // Start met intern profiel (Monteur), wijzig daarna de rol naar Klant.
  await openDialoogTotStap2(page, "Monteur", `${PREFIX} Rolwissel`, email);
  await page.locator("#g-rol").click();
  await page.getByRole("option", { name: /Klant/ }).click();
  // Knop is nu direct "Toevoegen" (geen "Volgende"/stap 3 meer).
  await page.getByRole("button", { name: "Toevoegen" }).click();
  await expect(page.getByText("Wil je voor deze gebruiker ook een medewerkerdossier")).toBeHidden();
  const g = await db.execute(sql`SELECT rol FROM gebruikers WHERE email = ${email}`);
  expect(g.rows.length).toBe(1);
  expect((g.rows[0] as any).rol).toBe("klant");
  expect(await medewerkerAantal(email)).toBe(0);
});

test("extern profiel (Klant): geen drieledige keuze, direct aangemaakt", async ({ page }) => {
  await apiLoginMetBrowser(page);
  const email = `klant-${Date.now()}@${EMAIL_DOMEIN}`;
  await page.goto("/gebruikers");
  await page.getByRole("button", { name: "Gebruiker toevoegen" }).first().click();
  await expect(page.getByText("Kies een functie")).toBeVisible();
  await page.getByRole("button", { name: /Klant/ }).first().click();
  await page.getByLabel("Naam").fill(`${PREFIX} Klant Extern`);
  await page.getByLabel(/E-mail/i).fill(email);
  // Bij extern profiel is de knop meteen "Toevoegen" (geen stap 3)
  await page.getByRole("button", { name: "Toevoegen" }).click();
  await expect(page.getByText("Wil je voor deze gebruiker ook een medewerkerdossier")).toBeHidden();
  const g = await db.execute(sql`SELECT id FROM gebruikers WHERE email = ${email}`);
  expect(g.rows.length).toBe(1);
  expect(await medewerkerAantal(email)).toBe(0);
});
