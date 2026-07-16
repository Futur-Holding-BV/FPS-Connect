// E2E: firevault web-app — "Wachtwoord wijzigen vereist"-gate.
//
// Dekt de blokkerende gate die verschijnt wanneer een ingelogde gebruiker
// `moet_wachtwoord_wijzigen = true` heeft (bijv. na een admin-reset met een
// tijdelijk wachtwoord). Als de gate breekt zit de gebruiker volledig vast.
//
// Scenario's (gecombineerde test, loginkosten gedeeld):
//   1. Na login wordt het gate-scherm getoond, niet het portaal.
//   2. Wachtwoorden die niet overeenkomen geven een client-side foutmelding.
//   3. Een onjuist huidig wachtwoord geeft een server-side foutmelding.
//   4. Een geldig nieuw wachtwoord heft de gate op; het portaal is bereikbaar.
//
// Het scenario draait tweemaal:
//   - Desktop-viewport (1280×800, standaard)
//   - Mobiel-viewport (390×844, iPhone 13-formaat)
//
// Portal-assertions zijn mobile-safe: ze steunen niet op de desktop-sidebar
// (die op mobiel standaard verborgen is achter een hamburgermenu) maar op
// de /auth/me API-response en het altijd-aanwezige SidebarTrigger-element.
//
// Draaien: pnpm --filter @workspace/scripts run e2e-web
// Vereist: lopende workflows api-server + firevault web, env DATABASE_URL en
// REPLIT_DEV_DOMAIN.
import { devices, expect, test, type Page } from "@playwright/test";

import {
  E2E_WW_GATE_EMAIL,
  E2E_WW_GATE_WACHTWOORD,
  genereerVersGateTotp,
  resetE2eWachtwoordGateAccount,
  setupE2eWachtwoordGateAccount,
  wachtOpNieuwTotpVenster,
} from "../src/e2e-wachtwoord-testaccounts";

const INHOUD_TIMEOUT = 20_000;
const PORTAAL_TIMEOUT = 30_000;

// ── Setup / teardown ──────────────────────────────────────────────────────────

// beforeEach (niet beforeAll) zodat elk test-scenario start met een vers
// account: juist wachtwoord + moetWachtwoordWijzigen=true. Dit is essentieel
// omdat de desktop-test het wachtwoord wijzigt; de mobiele test moet daarna
// opnieuw het originele wachtwoord kunnen gebruiken.
test.beforeEach(async () => {
  await setupE2eWachtwoordGateAccount();
});

// afterEach als vangnet: zet het account terug ook als een test halverwege
// faalt. De volgende beforeEach doet dit opnieuw; de afterEach zorgt alleen
// dat het gate-account nooit in een onbekende toestand achterblijft.
test.afterEach(async () => {
  try {
    await resetE2eWachtwoordGateAccount();
  } catch {
    // best-effort; fout in opruiming mag een geslaagde test niet falen.
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// Logt volledig in via de browser-UI (e-mail → wachtwoord → TOTP) als de
// gate-gebruiker. Na terugkeer is de gebruiker ingelogd en staat de gate
// of het portaal op het scherm, afhankelijk van moetWachtwoordWijzigen.
async function logInAlsGateGebruiker(page: Page): Promise<void> {
  await page.goto("/");

  await expect(page.locator("#email")).toBeVisible({ timeout: 60_000 });
  await page.locator("#email").fill(E2E_WW_GATE_EMAIL);
  await page.locator("#wachtwoord").fill(E2E_WW_GATE_WACHTWOORD);

  for (let poging = 1; poging <= 3; poging++) {
    if (poging > 1) {
      await wachtOpNieuwTotpVenster();
      if (await page.locator("#email").isVisible().catch(() => false)) {
        await page.locator("#email").fill(E2E_WW_GATE_EMAIL);
        await page.locator("#wachtwoord").fill(E2E_WW_GATE_WACHTWOORD);
      }
    }

    if (await page.getByRole("button", { name: "Inloggen" }).isVisible()) {
      await page.getByRole("button", { name: "Inloggen" }).click();
    }

    try {
      await expect(page.locator("[data-input-otp]")).toBeVisible({ timeout: 15_000 });
    } catch {
      if (poging === 3) throw new Error("TOTP-invoer niet verschenen na 3 pogingen.");
      continue;
    }

    const code = await genereerVersGateTotp();
    await page.locator("[data-input-otp]").focus();
    await page.keyboard.type(code);

    try {
      await expect(page.locator("[data-input-otp]")).not.toBeVisible({ timeout: 15_000 });
      return;
    } catch {
      if (poging === 3) throw new Error("Inloggen mislukt na 3 pogingen (TOTP/login).");
    }
  }
}

// Voert het volledige gate-scenario uit op de opgegeven page-instantie.
// De functie is viewport-agnostisch: alle portal-assertions zijn mobile-safe.
async function voerGateScenarioUit(page: Page): Promise<void> {
  // Onboarding-scherm omzeilen — de e2e-browser heeft geen localStorage.
  await page.addInitScript(() => {
    localStorage.setItem("fps.welkom.afgerond", "true");
    localStorage.setItem("fps_onboarding_voltooid", "true");
  });

  // ── Stap 1: login → gate-scherm verschijnt ────────────────────────────────
  await test.step("login als gebruiker met moetWachtwoordWijzigen=true", async () => {
    await logInAlsGateGebruiker(page);
  });

  await test.step("gate-scherm is getoond — portaalinhoud niet zichtbaar", async () => {
    // Gate-heading en formuliervelden zijn zichtbaar.
    await expect(page.getByRole("heading", { name: "Wachtwoord wijzigen vereist" })).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });
    await expect(page.locator("#ww-huidig")).toBeVisible({ timeout: INHOUD_TIMEOUT });
    await expect(page.locator("#ww-nieuw")).toBeVisible();
    await expect(page.locator("#ww-bevestig")).toBeVisible();
    // Beschrijvende tekst geeft de gebruiker uitleg.
    await expect(page.getByText("Uw account vereist een wachtwoordwijziging")).toBeVisible();
    // Het loginscherm is verdwenen — gebruiker is ingelogd.
    await expect(page.locator("#email")).not.toBeVisible();
  });

  // ── Stap 2: client-side validatie — wachtwoorden komen niet overeen ────────
  await test.step("wachtwoorden komen niet overeen → foutmelding", async () => {
    await page.locator("#ww-huidig").fill(E2E_WW_GATE_WACHTWOORD);
    await page.locator("#ww-nieuw").fill("NieuwWachtwoord!99");
    await page.locator("#ww-bevestig").fill("AnderWachtwoord!99");
    await page.getByRole("button", { name: "Wachtwoord instellen" }).click();

    await expect(page.getByText("De nieuwe wachtwoorden komen niet overeen.")).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });
    // Gate blijft actief na een client-side fout.
    await expect(page.getByRole("heading", { name: "Wachtwoord wijzigen vereist" })).toBeVisible();
  });

  // ── Stap 3: server-side validatie — onjuist huidig wachtwoord ────────────
  await test.step("onjuist huidig wachtwoord → foutmelding", async () => {
    await page.locator("#ww-huidig").fill("FoutHuidigWachtwoord!1");
    await page.locator("#ww-nieuw").fill("NieuwGeldigWachtwoord!1");
    await page.locator("#ww-bevestig").fill("NieuwGeldigWachtwoord!1");
    await page.getByRole("button", { name: "Wachtwoord instellen" }).click();

    await expect(
      page.getByText(
        "Huidig wachtwoord is onjuist of het nieuwe wachtwoord voldoet niet aan de eisen",
      ),
    ).toBeVisible({ timeout: INHOUD_TIMEOUT });
    // Gate blijft actief na een server-side fout.
    await expect(page.getByRole("heading", { name: "Wachtwoord wijzigen vereist" })).toBeVisible();
  });

  // ── Stap 4: succesvol wachtwoord wijzigen → gate verdwijnt, portaal laadt ─
  const nieuwWachtwoord = "NieuwGeldigGate!2026";
  await test.step("geldig nieuw wachtwoord → portaal is bereikbaar (gate verdwijnt)", async () => {
    await page.locator("#ww-huidig").fill(E2E_WW_GATE_WACHTWOORD);
    await page.locator("#ww-nieuw").fill(nieuwWachtwoord);
    await page.locator("#ww-bevestig").fill(nieuwWachtwoord);
    await page.getByRole("button", { name: "Wachtwoord instellen" }).click();

    // Succesbevestiging is kort zichtbaar.
    await expect(page.getByText("Wachtwoord gewijzigd. Een moment...")).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });

    // Gate-heading en formuliervelden zijn verdwenen — gate is opgeheven.
    await expect(
      page.getByRole("heading", { name: "Wachtwoord wijzigen vereist" }),
    ).not.toBeVisible({ timeout: PORTAAL_TIMEOUT });
    await expect(page.locator("#ww-huidig")).not.toBeVisible();

    // API-niveau bevestiging (mobile-safe): de server heeft de gate opgeheven.
    // /auth/me deelt de sessie-context met de page, dus dit verifieert de
    // server-side staat van de ingelogde gebruiker na het wijzigen.
    const me = await page.request.get("/api/auth/me");
    expect(me.status()).toBe(200);
    const meBody = await me.json();
    expect(meBody.moet_wachtwoord_wijzigen).toBe(false);

    // UI-niveau bevestiging (mobile-safe): de portaal-layout is geladen.
    // data-sidebar="trigger" is het SidebarTrigger-element dat in de
    // portaal-layout altijd in de DOM aanwezig is — ook op mobiel wanneer
    // de sidebar ingeklapt is achter een hamburgermenu.
    await expect(page.locator('[data-sidebar="trigger"]')).toBeAttached({
      timeout: PORTAAL_TIMEOUT,
    });

    // Het loginscherm is ook niet teruggekeerd — sessie is intact.
    await expect(page.locator("#email")).not.toBeVisible();
  });
}

// ── Desktop scenario (1280×800) ───────────────────────────────────────────────
test.describe("Desktop (1280×800)", () => {
  test(
    "Web [desktop]: Wachtwoord-wijzigen gate — gate → fouten → succesvol",
    async ({ page }) => {
      await voerGateScenarioUit(page);
    },
  );
});

// ── Mobiel scenario (iPhone 13, 390×844) ─────────────────────────────────────
//
// Op dit viewport is de shadcn-sidebar standaard verborgen achter een
// hamburgermenu. De assertions in voerGateScenarioUit zijn exclusief gebaseerd
// op gate-specifieke elementen en de /auth/me API, zodat ze ook hier betrouwbaar
// werken zonder van de desktop-sidebar afhankelijk te zijn.
// defaultBrowserType mag niet binnen een describe-block (dwingt een nieuwe worker
// af, wat Playwright verbiedt). Destructureer het eruit en gebruik alleen de
// viewport/UA/touch-instellingen voor device-emulatie.
const { defaultBrowserType: _ignored, ...iphone13Device } = devices["iPhone 13"];

test.describe("Mobiel (iPhone 13, 390×844)", () => {
  test.use(iphone13Device);

  test(
    "Web [mobiel]: Wachtwoord-wijzigen gate — gate → fouten → succesvol",
    async ({ page }) => {
      await voerGateScenarioUit(page);
    },
  );
});
