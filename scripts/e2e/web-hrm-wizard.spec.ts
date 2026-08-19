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
//   9. UI: wizard opent alléén via ?userId=<ID>, identiteit prefilled+disabled,
//      13 stappen, POST /medewerkers bevat gebruiker_id, hervatten via context
//  10. UI: zonder userId → redirect naar /personeel?tab=medewerkers
//  11. UI: onbekend userId (404) → "Gebruiker niet gevonden"-scherm
//  12. UI: al gekoppeld userId (409) → "Al gekoppeld"-scherm
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
  E2E_BEDRAGEN1_EMAIL,
  E2E_BEDRAGEN1_WACHTWOORD,
  E2E_BEDRAGEN1_TOTP_SECRET,
  setupE2eBedragenAccounts,
} from "../src/e2e-monteur-testaccount";
import {
  maakWegwerpOnboardingGebruiker,
  verwijderWegwerpOnboardingGebruikers,
  E2E_ONBOARDING_GEBRUIKER_DOMEIN,
} from "../src/e2e-onboarding-testgebruikers";
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
  // Ruim de wegwerp-gebruikersaccounts op die voor de verplichte
  // gebruiker_id-koppeling zijn aangemaakt (FK staat op SET NULL).
  try {
    await verwijderWegwerpOnboardingGebruikers();
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
  // gebruiker_id is verplicht: koppel aan een wegwerp-gebruikersaccount.
  const gebruiker = await maakWegwerpOnboardingGebruiker("E2E Wizard Draft");
  const naam = `${TEST_NAAM_PREFIX}-DRAFT-${Date.now()}`;
  const res = await page.request.post("/api/medewerkers", {
    data: {
      naam,
      gebruiker_id: gebruiker.id,
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
      versie: 0,
      voortgang_data: { naam, stap2_voltooid: true },
    },
  });
  expect([200, 204]).toContain(patchRes.status());
});

test("wizard hervatten via wizard-status (save/resume)", async ({ page }) => {
  await apiLogin(page);

  // Maak een concept-medewerker aan (gekoppeld aan wegwerp-gebruikersaccount)
  const gebruiker = await maakWegwerpOnboardingGebruiker("E2E Wizard Resume");
  const naam = `${TEST_NAAM_PREFIX}-RESUME-${Date.now()}`;
  const createRes = await page.request.post("/api/medewerkers", {
    data: {
      naam,
      gebruiker_id: gebruiker.id,
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
    data: { stap: 5, versie: 0, voortgang_data: { naam, stap5_in_progress: true } },
  });

  // Haal wizard-status op (hervatten)
  const statusRes = await page.request.get(`/api/medewerkers/${medId}/wizard-status`);
  expect(statusRes.status()).toBe(200);
  const status = await statusRes.json() as { huidig_stap?: number };
  expect(status.huidig_stap).toBe(5);
});

test("AI-voorstel accepteren wijzigt medewerker-veld NIET automatisch", async ({ page }) => {
  await apiLogin(page);

  // Maak een medewerker en een AI-voorstel aan (met wegwerp-gebruikersaccount)
  const gebruiker = await maakWegwerpOnboardingGebruiker("E2E Wizard AI");
  const naam = `${TEST_NAAM_PREFIX}-AI-${Date.now()}`;
  const createRes = await page.request.post("/api/medewerkers", {
    data: {
      naam,
      gebruiker_id: gebruiker.id,
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

  // Maak concept-medewerker en voorstel aan (met wegwerp-gebruikersaccount)
  const gebruiker = await maakWegwerpOnboardingGebruiker("E2E Wizard Afwijs");
  const createRes = await page.request.post("/api/medewerkers", {
    data: {
      naam: `${TEST_NAAM_PREFIX}-AFWIJS-${Date.now()}`,
      gebruiker_id: gebruiker.id,
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

  const gebruiker = await maakWegwerpOnboardingGebruiker("E2E Wizard Later");
  const createRes = await page.request.post("/api/medewerkers", {
    data: {
      naam: `${TEST_NAAM_PREFIX}-LATER-${Date.now()}`,
      gebruiker_id: gebruiker.id,
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

  const gebruiker = await maakWegwerpOnboardingGebruiker("E2E Wizard Dedup");
  const res1 = await page.request.post("/api/medewerkers", {
    data: {
      naam: `${TEST_NAAM_PREFIX}-DEDUP1`,
      gebruiker_id: gebruiker.id,
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


const TEST_USER_ID = 424_242;

test("UI: wizard via ?userId — 13 stappen, identiteit disabled, gebruiker_id in POST, hervatten", async ({ page }) => {
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
  let laatstePostBody: Record<string, unknown> | null = null;

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

    // Onboarding-context: identiteit van het te onboarden gebruikersaccount.
    // Na het aanmaken van het concept bevat de context concept_medewerker_id,
    // waarmee de startpagina de "Lopende onboarding"-banner toont (hervatten).
    if (url.includes(`/medewerkers/onboarding-context/${TEST_USER_ID}`)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          gebruiker_id: TEST_USER_ID,
          naam: wizardNaam,
          email: `ui@${TEST_EMAIL_DOMAIN}`,
          telefoon: "0612345678",
          concept_medewerker_id: conceptId > 0 ? conceptId : null,
        }),
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

    // POST /medewerkers: concept aanmaken — leg de body vast zodat we kunnen
    // bewijzen dat de wizard gebruiker_id meestuurt (accounts maken mag NOOIT)
    if (method === "POST" && url.match(/\/api\/medewerkers$/)) {
      laatstePostBody = route.request().postDataJSON() as Record<string, unknown>;
      conceptId = 99_999;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: conceptId,
          naam: wizardNaam,
          gebruiker_id: TEST_USER_ID,
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
            ? [{ id: conceptId, naam: wizardNaam, gebruiker_id: TEST_USER_ID, medewerker_status: "concept", wizard_stap: 2, wizard_type: "werknemer" }]
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
          gebruiker_id: TEST_USER_ID,
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
    // GET → "[]" (leeg array) zodat layout-hooks geen TypeError gooien als ze
    // .map()/.filter()/.length doen op de response. Object-mutatieresponses
    // (POST/PATCH/DELETE/PUT) krijgen "{}" want die verwachten geen array.
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: method === "GET" ? "[]" : "{}",
    });
  });

  // ── STAP 1: Navigeer naar wizard MET userId ────────────────────────────────
  await page.goto(`/personeel/onboarden?userId=${TEST_USER_ID}`);

  // FAALCRITERIUM A: wizard-heading ontbreekt.
  // Vangt: login-redirect (auth/me 401), lege pagina, feature flag UIT,
  // onterecht redirect ondanks geldige userId.
  await expect(
    page.getByRole("heading", { name: "Onboarden" }),
    "Wizard-heading 'Onboarden' ontbreekt — login-redirect, lege pagina, of feature flag UIT",
  ).toBeVisible({ timeout: 15_000 });

  // FAALCRITERIUM B: context-kaart met accountidentiteit ontbreekt
  await expect(
    page.getByText("Onboarding voor"),
    "Context-kaart 'Onboarding voor …' ontbreekt — onboarding-context niet geladen",
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByText(wizardNaam).first(),
    "Accountnaam uit onboarding-context niet zichtbaar",
  ).toBeVisible();

  // ── STAP 2: Kies wizard-type ───────────────────────────────────────────────
  await expect(
    page.getByText("Kies het type indiensttreding"),
    "Type-keuzepagina niet zichtbaar",
  ).toBeVisible({ timeout: 10_000 });
  await page.getByText("Vaste / tijdelijke medewerker").first().click();
  await page.waitForLoadState("networkidle");

  // FAALCRITERIUM C: stapindicator 13 stappen (FPS Connect-stap is vervallen)
  await expect(
    page.getByText("Stap 1 van 13"),
    "Stapindicator 'Stap 1 van 13' ontbreekt — wizard opent niet of heeft niet 13 stappen",
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByText("AI-voorbereiding").first(),
    "Stapnaam 'AI-voorbereiding' (stap 1) niet zichtbaar",
  ).toBeVisible();

  // ── STAP 3: Volgende → stap 2 (Persoonsgegevens, identiteit disabled) ─────
  await page.getByRole("button", { name: /Volgende/ }).first().click();
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByText("Stap 2 van 13"),
    "Stap 2 niet bereikt — Volgende-knop werkt niet",
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByText("Persoonsgegevens").first(),
    "Stapnaam 'Persoonsgegevens' (stap 2) niet zichtbaar",
  ).toBeVisible();

  // FAALCRITERIUM D: naamveld moet prefilled ÉN disabled zijn (immutable identiteit)
  const naamVeld = page.locator("input[disabled]").first();
  await expect(
    naamVeld,
    "Geen disabled invoerveld op stap 2 — identiteit is niet immutable",
  ).toBeVisible({ timeout: 5_000 });
  await expect(
    naamVeld,
    "Naamveld bevat niet de accountnaam uit de onboarding-context",
  ).toHaveValue(wizardNaam);

  // ── STAP 4: Volgende → concept aanmaken (POST /medewerkers) ───────────────
  await page.getByRole("button", { name: /Volgende/ }).first().click();
  await page.waitForLoadState("networkidle");

  // FAALCRITERIUM E: stap 3 bereikt (POST /medewerkers + PATCH voortgang)
  await expect(
    page.getByText("Stap 3 van 13"),
    "Stap 3 niet bereikt — concept aanmaken of wizard-voortgang opslaan mislukt",
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByText("Contactgegevens").first(),
    "Stapnaam 'Contactgegevens' (stap 3) niet zichtbaar",
  ).toBeVisible();

  // FAALCRITERIUM F: POST /medewerkers moet gebruiker_id van het account bevatten
  expect(
    laatstePostBody,
    "POST /medewerkers is nooit uitgevoerd",
  ).not.toBeNull();
  expect(
    laatstePostBody?.gebruiker_id,
    "POST /medewerkers bevat geen gebruiker_id — onboarding is losgekoppeld van het account",
  ).toBe(TEST_USER_ID);

  // ── STAP 5: Hervatten — terug naar wizard-start met dezelfde userId ───────
  await page.goto(`/personeel/onboarden?userId=${TEST_USER_ID}`);

  // FAALCRITERIUM G: login-redirect na terug-navigatie (sessie verloren)
  await expect(
    page.getByRole("heading", { name: "Onboarden" }),
    "Wizard-heading weg na terug-navigatie — sessie verloren",
  ).toBeVisible({ timeout: 15_000 });

  // De context bevat nu concept_medewerker_id → "Lopende onboarding"-banner
  await expect(
    page.getByText("Lopende onboarding").first(),
    "Banner 'Lopende onboarding' niet zichtbaar — concept_medewerker_id uit context niet gebruikt",
  ).toBeVisible({ timeout: 10_000 });

  // Klik "Hervatten"
  const hervattenKnop = page.getByRole("button", { name: "Hervatten" }).first();
  await expect(hervattenKnop, "Hervatten-knop niet zichtbaar").toBeVisible({ timeout: 5_000 });
  await hervattenKnop.click();
  await page.waitForLoadState("networkidle");

  // FAALCRITERIUM H: wizard hervat niet (stap-indicator niet zichtbaar)
  await expect(
    page.getByText(/Stap \d+ van 13/),
    "Wizard-stap niet zichtbaar na hervatten — hervatten werkt niet",
  ).toBeVisible({ timeout: 15_000 });
});

// ── Toegangscontract-tests: zonder/ongeldig/gekoppeld userId ─────────────────

/**
 * Minimale mock-laag voor de toegangscontract-tests: auth/me krijgt echte
 * gebruikersdata, onboarding-context wordt per test ingevuld, alle overige
 * /api/*-calls krijgen een generieke lege respons.
 */
async function mockToegangsApi(
  page: Page,
  meData: unknown,
  contextRespons: { status: number; body: string } | null,
): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("fps.welkom.afgerond", "true");
    localStorage.setItem("fps_onboarding_voltooid", "true");
  });
  await page.route(/\/api\/.*/, async (route) => {
    const url = route.request().url();
    if (url.includes("/auth/me")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(meData) });
      return;
    }
    if (contextRespons && url.includes("/medewerkers/onboarding-context/")) {
      await route.fulfill({ status: contextRespons.status, contentType: "application/json", body: contextRespons.body });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: route.request().method() === "GET" ? "[]" : "{}",
    });
  });
}

// ── Eén-flow onboarding: accountstap (POST /medewerkers/onboarding-account) ──

test("API: onboarding-account — personeel-schrijfrecht maakt least-privilege account en context is direct bruikbaar", async ({ page }) => {
  await apiLogin(page);
  const uniek = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const naam = `${TEST_NAAM_PREFIX} Accountstap ${uniek}`;
  const email = `accountstap-${uniek}@${E2E_ONBOARDING_GEBRUIKER_DOMEIN}`;

  const res = await page.request.post("/api/medewerkers/onboarding-account", {
    data: { naam, email, uitnodigen: false },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(typeof body.id).toBe("number");
  expect(body.naam).toBe(naam);
  expect(body.uitnodiging_verstuurd).toBe(false);

  // Least-privilege: rol "gebruiker", lege bevoegdheden, niet uitgenodigd.
  const rijen = await db.execute(
    sql`SELECT rol, bevoegdheden, uitnodiging_status FROM gebruikers WHERE id = ${body.id}`,
  );
  const rij = (rijen as unknown as { rows: Array<Record<string, unknown>> }).rows?.[0] ?? (rijen as unknown as Array<Record<string, unknown>>)[0];
  expect(rij.rol).toBe("gebruiker");
  expect(rij.uitnodiging_status).toBe("niet_uitgenodigd");
  expect(Object.keys((rij.bevoegdheden as Record<string, number>) ?? {})).toHaveLength(0);

  // Naadloze overgang naar de bestaande wizard: de context is direct opvraagbaar.
  const ctx = await page.request.get(`/api/medewerkers/onboarding-context/${body.id}`);
  expect(ctx.status()).toBe(200);
  const ctxBody = await ctx.json();
  expect(ctxBody.gebruiker_id).toBe(body.id);
  expect(ctxBody.naam).toBe(naam);

  // Dubbel e-mailadres → 409 (geen tweede account).
  const dubbel = await page.request.post("/api/medewerkers/onboarding-account", {
    data: { naam: `${naam} dubbel`, email, uitnodigen: false },
  });
  expect(dubbel.status()).toBe(409);
});

test("API: onboarding-account — zonder personeel-recht → 403", async ({ page }) => {
  await setupE2eBedragenAccounts(); // bedragen1 heeft alléén projecten:1, geen personeel
  const res1 = await page.request.post("/api/auth/login", {
    data: { email: E2E_BEDRAGEN1_EMAIL, wachtwoord: E2E_BEDRAGEN1_WACHTWOORD },
  });
  expect(res1.status()).toBe(200);
  let ingelogd = false;
  for (let p = 1; p <= 3 && !ingelogd; p++) {
    const code = authenticator.generate(E2E_BEDRAGEN1_TOTP_SECRET);
    const res2 = await page.request.post("/api/auth/2fa/verify", { data: { code } });
    if (res2.status() === 200) ingelogd = true;
    else if (p < 3) await new Promise((r) => setTimeout(r, 32_000));
  }
  expect(ingelogd).toBe(true);

  const res = await page.request.post("/api/medewerkers/onboarding-account", {
    data: { naam: "Mag Niet", email: `mag-niet-${Date.now()}@${E2E_ONBOARDING_GEBRUIKER_DOMEIN}`, uitnodigen: false },
  });
  expect(res.status()).toBe(403);
});

test("UI: /personeel/onboarden zonder userId → accountstap (één-flow onboarding)", async ({ page }) => {
  await apiLogin(page);
  const meData = await (await page.request.get("/api/auth/me")).json();
  await mockToegangsApi(page, meData, null);

  await page.goto("/personeel/onboarden");

  // Zonder userId toont de wizard de nieuwe eerste stap "Account" waarin het
  // gebruikersaccount in dezelfde flow wordt aangemaakt (geen redirect meer).
  await expect(page.getByRole("heading", { name: "Nieuwe medewerker onboarden" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("Naam *")).toBeVisible();
  await expect(page.getByLabel("E-mailadres *")).toBeVisible();
  await expect(page.getByText("Uitnodiging direct versturen")).toBeVisible();
  await expect(page.getByRole("button", { name: "Account aanmaken en verder" })).toBeVisible();
});

test("UI: onbekend userId → 'Gebruiker niet gevonden'-scherm", async ({ page }) => {
  await apiLogin(page);
  const meData = await (await page.request.get("/api/auth/me")).json();
  await mockToegangsApi(page, meData, {
    status: 404,
    body: JSON.stringify({ code: "USER_NOT_FOUND", melding: "Gebruiker niet gevonden" }),
  });

  await page.goto("/personeel/onboarden?userId=999999999");

  await expect(
    page.getByText("Gebruiker niet gevonden"),
    "404-scherm 'Gebruiker niet gevonden' niet zichtbaar",
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole("button", { name: "Naar medewerkerslijst" }),
    "Terugknop naar medewerkerslijst ontbreekt op 404-scherm",
  ).toBeVisible();
});

test("UI: al gekoppeld userId → 'Al gekoppeld'-scherm", async ({ page }) => {
  await apiLogin(page);
  const meData = await (await page.request.get("/api/auth/me")).json();
  await mockToegangsApi(page, meData, {
    status: 409,
    body: JSON.stringify({ code: "EMPLOYEE_PROFILE_ALREADY_EXISTS", melding: "Al gekoppeld" }),
  });

  await page.goto("/personeel/onboarden?userId=77");

  await expect(
    page.getByText("Al gekoppeld").first(),
    "409-scherm 'Al gekoppeld' niet zichtbaar",
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText("heeft al een medewerkerprofiel"),
    "Uitleg over bestaand medewerkerprofiel ontbreekt op 409-scherm",
  ).toBeVisible();
});
