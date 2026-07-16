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
import { test } from "@playwright/test";

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
test(
  "Web [desktop]: Wachtwoord-wijzigen gate — gate → fouten → succesvol",
  async ({ page }) => {
    await voerGateScenarioUit(page);
  },
);
