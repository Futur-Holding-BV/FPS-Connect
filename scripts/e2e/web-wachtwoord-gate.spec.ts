// E2E: firevault web-app — "Wachtwoord wijzigen vereist"-gate (desktop 1280×800).
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
// Draaien: pnpm --filter @workspace/scripts run e2e-web
// Vereist: lopende workflows api-server + firevault web, env DATABASE_URL en
// REPLIT_DEV_DOMAIN.
import { devices, test } from "@playwright/test";

import {
  resetE2eWachtwoordGateAccount,
  setupE2eWachtwoordGateAccount,
} from "../src/e2e-wachtwoord-testaccounts";

import { voerGateScenarioUit } from "./web-wachtwoord-gate-helpers";

// ── Setup / teardown ──────────────────────────────────────────────────────────

// beforeEach zodat elk test-scenario start met een vers account.
test.beforeEach(async () => {
  await setupE2eWachtwoordGateAccount();
});

test.afterEach(async () => {
  try {
    await resetE2eWachtwoordGateAccount();
  } catch {
    // best-effort; fout in opruiming mag een geslaagde test niet falen.
  }
});

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
