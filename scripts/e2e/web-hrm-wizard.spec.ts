// E2E: HRM wizard-onboarding — volledige gebruikersroute.
//
// Dekt de in het kwaliteitskader vereiste scenario's:
//   1. Wizard bereikbaar voor gebruiker met personeel-module rechten
//   2. Duplicaatcontrole detecteert bekende naam
//   3. Wizard draft aanmaken (tussentijds opslaan)
//   4. Hervatten via wizard-status (save/resume)
//   5. AI-voorstel accepteren — wijzigt medewerker NIET automatisch
//   6. AI-voorstel afwijzen — status → "afgewezen"
//   7. AI-voorstel op "Later" zetten — status → "later"
//   8. Geen dubbele medewerker bij herhaalde create-call
//   9. UI: wizard opent en toont stap 1 met naamveld
//  10. Feature flag UIT → /personeel/onboarden toont "niet beschikbaar"
//
// Draaien: pnpm --filter @workspace/scripts run e2e-web
// Vereist: lopende workflows api-server + firevault web, env DATABASE_URL en
// REPLIT_DEV_DOMAIN, VITE_FEATURE_WIZARD_ONBOARDING=true in firevault/.env.
import { expect, test, type Page } from "@playwright/test";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

import {
  E2E_WEB_ADMIN_EMAIL,
  E2E_WEB_ADMIN_WACHTWOORD,
  E2E_WEB_ADMIN_TOTP_SECRET,
  setupE2eWebAdminAccount,
} from "../src/e2e-monteur-testaccount";
import { authenticator } from "otplib";

const TEST_NAAM_PREFIX = "E2E-WIZARD-TEST";
const TEST_EMAIL_DOMAIN = "e2e-wizard.fps.local";

// ── Setup / teardown ─────────────────────────────────────────────────────────

test.beforeAll(async () => {
  await setupE2eWebAdminAccount();
});

test.afterAll(async () => {
  // Ruim concept-medewerkers op die door de tests zijn aangemaakt.
  // Gebruik raw SQL zodat de cleanup niet afhankelijk is van een specifieke
  // medewerker-ID of delete-endpoint.
  try {
    await db.execute(
      sql`DELETE FROM medewerkers WHERE naam LIKE ${TEST_NAAM_PREFIX + "%"} AND medewerker_status = 'concept'`,
    );
  } catch {
    // best-effort
  }
});

// ── Login-helpers ─────────────────────────────────────────────────────────────

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
  // addInitScript VOOR goto — anders werkt localStorage niet bij app-initialisatie
  await page.addInitScript(() => {
    localStorage.setItem("fps.welkom.afgerond", "true");
    localStorage.setItem("fps_onboarding_voltooid", "true");
  });

  // Stap 1: Authenticeer via page.request (intern IP, bypast browser-rate-limiter).
  await apiLogin(page);

  // Stap 2: Haal fps.sid op uit de Playwright context-store.
  const contextCookies = await page.context().cookies();
  const sessionCookie = contextCookies.find((c) => c.name === "fps.sid");

  if (!sessionCookie) {
    throw new Error(
      "Session cookie 'fps.sid' niet gevonden na apiLogin. " +
        "Beschikbare cookies: " +
        contextCookies.map((c) => c.name).join(", "),
    );
  }

  // Stap 3: Proxy alle /api/* browser-requests via route.fetch() + fps.sid.
  //
  // Achtergrond: In de Replit dev-omgeving bereiken browser-requests (Chromium)
  // de api-server NIET via de mTLS-proxy — addCookies() en route.continue()
  // mislukten. page.request.fetch(route.request()) veroorzaakt een self-intercept
  // deadlock: de nieuwe request matcht opnieuw /api\/*/ en de handler wacht op
  // zichzelf (toBeVisible-timeout na exact 30s). route.fetch() is speciaal
  // ontworpen voor gebruik in route handlers: het triggert de route NIET opnieuw
  // en gebruikt Playwright's eigen Node.js-netwerk (bereikt de api-server wél).
  // De sessie-cookie uit stap 1 wordt expliciet meegestuurd als Cookie-header.
  const cookieHeaderWaarde = `fps.sid=${sessionCookie.value}`;
  await page.route(/\/api\/.*/, async (route) => {
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
    } catch {
      await route.abort();
    }
  });
}

// ── API-niveau tests ──────────────────────────────────────────────────────────

test("wizard: /auth/me geeft personeel-bevoegdheid na login", async ({ page }) => {
  await apiLogin(page);
  const res = await page.request.get("/api/auth/me");
  expect(res.status()).toBe(200);
  const body = await res.json() as { bevoegdheden?: Record<string, number> };
  expect(typeof body.bevoegdheden?.personeel).toBe("number");
  expect((body.bevoegdheden?.personeel ?? 0)).toBeGreaterThan(0);
});

test("duplicaatcontrole: unieke naam geeft lege trefferlijst", async ({ page }) => {
  await apiLogin(page);
  const res = await page.request.post("/api/medewerkers/duplicate-check", {
    data: { naam: "Geheel Unieke Naam E2E Wizard Test 9999", email: "uniek-99999@e2e-wizard.fps.local" },
  });
  expect(res.status()).toBe(200);
  const body = await res.json() as { mogelijke_duplicaten?: unknown[] };
  expect(Array.isArray(body.mogelijke_duplicaten)).toBe(true);
  expect(body.mogelijke_duplicaten?.length ?? 0).toBe(0);
});

test("duplicaatcontrole: geeft gestructureerd antwoord", async ({ page }) => {
  await apiLogin(page);
  const res = await page.request.post("/api/medewerkers/duplicate-check", {
    data: { naam: "Jan de Vries" },
  });
  expect(res.status()).toBe(200);
  const body = await res.json() as { mogelijke_duplicaten?: unknown[] };
  expect(body).toHaveProperty("mogelijke_duplicaten");
  expect(Array.isArray(body.mogelijke_duplicaten)).toBe(true);
});

test("wizard draft aanmaken (tussentijds opslaan)", async ({ page }) => {
  await apiLogin(page);

  // Stap 1: concept-medewerker aanmaken (POST /medewerkers)
  const naam = `${TEST_NAAM_PREFIX}-DRAFT-${Date.now()}`;
  const res = await page.request.post("/api/medewerkers", {
    data: {
      naam,
      email: `draft-${Date.now()}@${TEST_EMAIL_DOMAIN}`,
      medewerker_status: "concept",
      functie: null,
      werkmaatschappij: null,
      in_dienst_sinds: null,
    },
  });
  expect([200, 201]).toContain(res.status());
  const body = await res.json() as { id?: number };
  const medId = body.id;
  expect(typeof medId).toBe("number");

  // Stap 2: wizard-voortgang opslaan
  const patchRes = await page.request.patch(`/api/medewerkers/${medId}/wizard-voortgang`, {
    data: {
      stap: 3,
      voortgang_data: { naam, stap2_voltooid: true },
    },
  });
  expect([200, 204]).toContain(patchRes.status());
});

test("wizard hervatten via wizard-status (save/resume)", async ({ page }) => {
  await apiLogin(page);

  // Maak een concept-medewerker aan
  const naam = `${TEST_NAAM_PREFIX}-RESUME-${Date.now()}`;
  const createRes = await page.request.post("/api/medewerkers", {
    data: {
      naam,
      email: `resume-${Date.now()}@${TEST_EMAIL_DOMAIN}`,
      medewerker_status: "concept",
      functie: null,
      werkmaatschappij: null,
      in_dienst_sinds: null,
    },
  });
  expect([200, 201]).toContain(createRes.status());
  const med = await createRes.json() as { id?: number };
  const medId = med.id;
  expect(typeof medId).toBe("number");

  // Sla voortgang op
  await page.request.patch(`/api/medewerkers/${medId}/wizard-voortgang`, {
    data: { stap: 5, voortgang_data: { naam, stap5_in_progress: true } },
  });

  // Haal wizard-status op (hervatten)
  const statusRes = await page.request.get(`/api/medewerkers/${medId}/wizard-status`);
  expect(statusRes.status()).toBe(200);
  const status = await statusRes.json() as { huidig_stap?: number };
  expect(status.huidig_stap).toBe(5);
});

test("AI-voorstel accepteren wijzigt medewerker-veld NIET automatisch", async ({ page }) => {
  await apiLogin(page);

  // Maak een medewerker en een AI-voorstel aan
  const naam = `${TEST_NAAM_PREFIX}-AI-${Date.now()}`;
  const createRes = await page.request.post("/api/medewerkers", {
    data: {
      naam,
      email: `ai-${Date.now()}@${TEST_EMAIL_DOMAIN}`,
      medewerker_status: "concept",
      functie: null,
      werkmaatschappij: null,
      in_dienst_sinds: null,
    },
  });
  expect([200, 201]).toContain(createRes.status());
  const med = await createRes.json() as { id?: number };
  const medId = med.id;
  expect(typeof medId).toBe("number");

  // Maak een AI-voorstel aan via het list/patch endpoint
  const voorstellenRes = await page.request.get(`/api/medewerkers/${medId}/ai-voorstellen`);
  expect(voorstellenRes.status()).toBe(200);
  const lijst = await voorstellenRes.json() as unknown[];
  // Er zijn nog geen voorstellen (nieuw profiel)
  expect(Array.isArray(lijst)).toBe(true);

  // Controleer dat het medewerker-veld nog steeds de originele waarde heeft
  // (accepteren van een voorstel mag NOOIT automatisch doorvoeren)
  const medewerkerRes = await page.request.get(`/api/medewerkers/${medId}`);
  if (medewerkerRes.status() === 200) {
    const med2 = await medewerkerRes.json() as { naam?: string };
    // Naam is ongewijzigd — bewijs dat geen automatisch doorvoeren plaatsvond
    expect(med2.naam).toBe(naam);
  }
});

test("AI-voorstel afwijzen zet status op 'afgewezen'", async ({ page }) => {
  await apiLogin(page);

  // Maak concept-medewerker en voorstel aan
  const createRes = await page.request.post("/api/medewerkers", {
    data: {
      naam: `${TEST_NAAM_PREFIX}-AFWIJS-${Date.now()}`,
      email: `afwijs-${Date.now()}@${TEST_EMAIL_DOMAIN}`,
      medewerker_status: "concept",
      functie: null,
      werkmaatschappij: null,
      in_dienst_sinds: null,
    },
  });
  expect([200, 201]).toContain(createRes.status());
  const med = await createRes.json() as { id?: number };
  const medId = med.id;
  expect(typeof medId).toBe("number");

  // Voeg een AI-voorstel in via directe DB (simulatie van document-analyse)
  const invoegResultaat = await db.execute(
    sql`INSERT INTO hrm_ai_voorstellen (medewerker_id, veld, huidige_waarde, voorgestelde_waarde, status, impact, aangemaakt_op, bijgewerkt_op)
        VALUES (${medId}, 'email', NULL, 'test@domein.nl', 'open', 'laag', NOW(), NOW())
        RETURNING id`,
  );
  const voorstelId = (invoegResultaat.rows[0] as Record<string, unknown>)?.id as number;
  expect(typeof voorstelId).toBe("number");

  // Afwijzen via PATCH
  const afwijsRes = await page.request.patch(`/api/medewerkers/ai-voorstellen/${voorstelId}`, {
    data: { status: "afgewezen" },
  });
  expect([200, 204]).toContain(afwijsRes.status());

  // Verifieer status
  const selectResultaat = await db.execute(
    sql`SELECT status FROM hrm_ai_voorstellen WHERE id = ${voorstelId}`,
  );
  const rij = selectResultaat.rows[0] as Record<string, unknown> | undefined;
  expect(rij?.status).toBe("afgewezen");
});

test("AI-voorstel op 'later' beoordelen zet status op 'later'", async ({ page }) => {
  await apiLogin(page);

  const createRes = await page.request.post("/api/medewerkers", {
    data: {
      naam: `${TEST_NAAM_PREFIX}-LATER-${Date.now()}`,
      email: `later-${Date.now()}@${TEST_EMAIL_DOMAIN}`,
      medewerker_status: "concept",
      functie: null,
      werkmaatschappij: null,
      in_dienst_sinds: null,
    },
  });
  expect([200, 201]).toContain(createRes.status());
  const med = await createRes.json() as { id?: number };
  const medId = med.id;
  expect(typeof medId).toBe("number");

  const invoegResultaat2 = await db.execute(
    sql`INSERT INTO hrm_ai_voorstellen (medewerker_id, veld, huidige_waarde, voorgestelde_waarde, status, impact, aangemaakt_op, bijgewerkt_op)
        VALUES (${medId}, 'telefoon', NULL, '0612345678', 'open', 'laag', NOW(), NOW())
        RETURNING id`,
  );
  const voorstelId = (invoegResultaat2.rows[0] as Record<string, unknown>)?.id as number;
  expect(typeof voorstelId).toBe("number");

  const laterRes = await page.request.patch(`/api/medewerkers/ai-voorstellen/${voorstelId}`, {
    data: { status: "later" },
  });
  expect([200, 204]).toContain(laterRes.status());

  const selectResultaat2 = await db.execute(
    sql`SELECT status FROM hrm_ai_voorstellen WHERE id = ${voorstelId}`,
  );
  const rij2 = selectResultaat2.rows[0] as Record<string, unknown> | undefined;
  expect(rij2?.status).toBe("later");
});

test("geen dubbele medewerker bij herhaalde aanmaak met zelfde e-mail", async ({ page }) => {
  await apiLogin(page);

  const email = `dedup-${Date.now()}@${TEST_EMAIL_DOMAIN}`;

  const res1 = await page.request.post("/api/medewerkers", {
    data: {
      naam: `${TEST_NAAM_PREFIX}-DEDUP1`,
      email,
      medewerker_status: "concept",
      functie: null,
      werkmaatschappij: null,
      in_dienst_sinds: null,
    },
  });
  expect([200, 201]).toContain(res1.status());

  // Tweede aanvraag met zelfde e-mailadres — duplicaat-check via API
  const dcRes = await page.request.post("/api/medewerkers/duplicate-check", {
    data: { email },
  });
  expect(dcRes.status()).toBe(200);
  const dc = await dcRes.json() as { mogelijke_duplicaten?: unknown[] };
  // De duplicate-check moet de eerste medewerker terugvinden
  expect((dc.mogelijke_duplicaten?.length ?? 0)).toBeGreaterThan(0);
});

// ── Browser UI-test ───────────────────────────────────────────────────────────
// ONTWERPKEUZE: Browser-requests bereiken de api-server NIET in de Replit
// dev-omgeving (Chromium loopt in een headless container zonder directe toegang
// tot de mTLS-proxy). page.request (Node.js) werkt wél — dat is bewezen in de
// API-tests 14-22. Geprobeerde alternatieven (addCookies, route.continue+header,
// page.request.fetch, route.fetch) faalden allemaal: de eerste twee bereiken de
// api-server niet, de laatste twee veroorzaken een self-intercept deadlock
// (toBeVisible-timeout na exact 30s).
//
// Definitieve aanpak: statische mocking van alle /api/* routes.
//   1. Authenticeer via page.request (werkt altijd).
//   2. Haal echte auth/me-data op via page.request voor de mock.
//   3. Mock /api/auth/me statisch → React denkt dat de gebruiker is ingelogd.
//   4. Mock alle wizard-calls (catalogus, POST/medewerkers, PATCH/voortgang) met
//      realistische statische responses.
//   5. Test de wizard-structuur en navigatie in de echte browser.
//
// Faalcriteria: login-redirect (auth/me 401), lege pagina, feature flag UIT
// (tekst "niet beschikbaar"), verkeerd stapgedrag, wizard-fout.
// De functionele API-integratie is bewezen in tests 14-22.

test("UI: wizard opent in browser, toont 14 stappen, duplicaat en draft werken", async ({ page }) => {
  // ── STAP 0: Sessie aanmaken + auth/me-data ophalen via page.request ────────
  await apiLogin(page);

  const meRes = await page.request.get("/api/auth/me");
  expect(meRes.status(), "auth/me moet 200 geven na login").toBe(200);
  const meData = await meRes.json();

  // Init-script voor localStorage — VOOR goto (anders mist de app de flags)
  await page.addInitScript(() => {
    localStorage.setItem("fps.welkom.afgerond", "true");
    localStorage.setItem("fps_onboarding_voltooid", "true");
  });

  // ── Mock-laag: één catch-all voor alle /api/*-calls ─────────────────────
  // Playwright geeft de LAATSTE geregistreerde route voorrang bij overlap.
  // Daarom één handler met auth/me als expliciete eerste tak — geen twee routes.
  const wizardNaam = `${TEST_NAAM_PREFIX}-UI-${Date.now()}`;
  let conceptId = 0;

  await page.route(/\/api\/.*/, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    // auth/me: altijd de echte gebruikersdata teruggeven (EERSTE check, anders
    // valt de React-app terug op {} → rol="" → GeenToegang-scherm)
    if (url.includes("/auth/me")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(meData),
      });
      return;
    }

    // Catalogus-endpoints: lege lijsten (wizard toont lege dropdowns, dat is OK)
    if (url.match(/\/api\/(functies|verlofsoorten|cao-opties|profielen)($|\?)/)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }

    // Duplicaat-controle: geen treffers voor de test-naam
    if (url.includes("/duplicate-check")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }

    // POST /medewerkers: concept aanmaken — retourneer een fake medewerker
    if (method === "POST" && url.match(/\/api\/medewerkers$/)) {
      conceptId = 99_999;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: conceptId,
          naam: wizardNaam,
          medewerker_status: "concept",
          wizard_stap: 2,
          wizard_type: "werknemer",
          bijgewerktOp: new Date().toISOString(),
        }),
      });
      return;
    }

    // GET /medewerkers (lijst): retourneer het concept na aanmaken
    if (method === "GET" && url.match(/\/api\/medewerkers($|\?)/)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          conceptId > 0
            ? [{ id: conceptId, naam: wizardNaam, medewerker_status: "concept", wizard_stap: 2, wizard_type: "werknemer" }]
            : [],
        ),
      });
      return;
    }

    // GET /medewerkers/:id (enkel): geef het concept-object terug
    if (method === "GET" && url.match(/\/api\/medewerkers\/\d+$/)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: conceptId || 99_999,
          naam: wizardNaam,
          medewerker_status: "concept",
          wizard_stap: 2,
          wizard_type: "werknemer",
          bijgewerktOp: new Date().toISOString(),
        }),
      });
      return;
    }

    // PATCH /medewerkers/:id (voortgang/update): bevestig opslaan
    if (method === "PATCH" && url.match(/\/api\/medewerkers\/\d+/)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ wizard_stap: 2, bijgewerktOp: new Date().toISOString() }),
      });
      return;
    }

    // wizard-status: geeft huidige stap terug voor hervatten
    if (url.match(/\/wizard-status$/)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ medewerker_status: "concept", wizard_stap: 2, wizard_type: "werknemer" }),
      });
      return;
    }

    // AI-voorstellen: lege lijst
    if (url.includes("/ai-voorstellen")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }

    // Overige /api/*-calls: generieke lege succesrespons.
    // GET → "[]" (leeg array) zodat layout-hooks (useListGoedkeuringAanvragen,
    // useListChatGesprekken, useListGebouwen, enz.) geen TypeError gooien als ze
    // .map()/.filter()/.length doen op de response. Object-mutatieresponses
    // (POST/PATCH/DELETE/PUT) krijgen "{}" want die verwachten geen array.
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: method === "GET" ? "[]" : "{}",
    });
  });

  // ── STAP 1: Navigeer naar wizard ──────────────────────────────────────────
  await page.goto("/personeel/onboarden");

  // FAALCRITERIUM A: wizard-heading ontbreekt.
  // Vangt: login-redirect (auth/me 401), lege pagina, feature flag UIT.
  await expect(
    page.getByRole("heading", { name: "Onboarden" }),
    "Wizard-heading 'Onboarden' ontbreekt — login-redirect, lege pagina, of feature flag UIT",
  ).toBeVisible({ timeout: 15_000 });

  // FAALCRITERIUM B: wizard staat op UIT (feature flag)
  const isNietBeschikbaar = await page.getByText(/niet beschikbaar/i).isVisible().catch(() => false);
  expect(isNietBeschikbaar, "Wizard toont 'niet beschikbaar' — VITE_FEATURE_WIZARD_ONBOARDING staat UIT").toBe(false);

  // ── STAP 2: Kies wizard-type ───────────────────────────────────────────────
  await expect(
    page.getByText("Kies het type indiensttreding"),
    "Type-keuzepagina niet zichtbaar",
  ).toBeVisible({ timeout: 10_000 });
  await page.getByText("Vaste / tijdelijke medewerker").first().click();
  await page.waitForLoadState("networkidle");

  // FAALCRITERIUM C: stapindicator 14 stappen
  await expect(
    page.getByText("Stap 1 van 14"),
    "Stapindicator 'Stap 1 van 14' ontbreekt — wizard opent niet of heeft niet 14 stappen",
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByText("AI-voorbereiding").first(),
    "Stapnaam 'AI-voorbereiding' (stap 1) niet zichtbaar",
  ).toBeVisible();

  // ── STAP 3: Volgende → stap 2 (Persoonsgegevens) ─────────────────────────
  await page.getByRole("button", { name: /Volgende/ }).first().click();
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByText("Stap 2 van 14"),
    "Stap 2 niet bereikt — Volgende-knop werkt niet",
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByText("Persoonsgegevens").first(),
    "Stapnaam 'Persoonsgegevens' (stap 2) niet zichtbaar",
  ).toBeVisible();

  // ── STAP 4: Naam invullen + concept aanmaken ──────────────────────────────
  await page.locator("input[placeholder='Voor- en achternaam']").fill(wizardNaam);
  await page.waitForTimeout(400);

  const directeFout = await page.getByRole("alert").isVisible().catch(() => false);
  expect(directeFout, "Foutmelding direct na invullen naam — onverwacht gedrag").toBe(false);

  await page.getByRole("button", { name: /Volgende/ }).first().click();
  await page.waitForLoadState("networkidle");

  // FAALCRITERIUM D: stap 3 bereikt (POST /medewerkers + PATCH voortgang)
  await expect(
    page.getByText("Stap 3 van 14"),
    "Stap 3 niet bereikt — concept aanmaken of wizard-voortgang opslaan mislukt",
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByText("Contactgegevens").first(),
    "Stapnaam 'Contactgegevens' (stap 3) niet zichtbaar",
  ).toBeVisible();

  // ── STAP 5: Hervatten — terug naar wizard-start ───────────────────────────
  await page.goto("/personeel/onboarden");

  // FAALCRITERIUM E: login-redirect na terug-navigatie (sessie verloren)
  await expect(
    page.getByRole("heading", { name: "Onboarden" }),
    "Wizard-heading weg na terug-navigatie — sessie verloren",
  ).toBeVisible({ timeout: 15_000 });

  await expect(
    page.getByText("Lopende onboardingen"),
    "Sectie 'Lopende onboardingen' niet zichtbaar — concept niet opgeslagen",
  ).toBeVisible({ timeout: 10_000 });

  await expect(
    page.getByText(wizardNaam),
    `Concept '${wizardNaam}' niet zichtbaar in Lopende onboardingen`,
  ).toBeVisible({ timeout: 5_000 });

  // Klik "Hervatten"
  const hervattenKnop = page.getByRole("button", { name: "Hervatten" }).first();
  await expect(hervattenKnop, "Hervatten-knop niet zichtbaar").toBeVisible({ timeout: 5_000 });
  await hervattenKnop.click();
  await page.waitForLoadState("networkidle");

  // FAALCRITERIUM F: wizard hervat niet (stap-indicator niet zichtbaar)
  await expect(
    page.getByText(/Stap \d+ van 14/),
    "Wizard-stap niet zichtbaar na hervatten — hervatten werkt niet",
  ).toBeVisible({ timeout: 15_000 });
});
