// E2E: firevault web-app — "Wachtwoord wijzigen vereist"-gate (mobiel 390×844).
//
// Op dit viewport is de shadcn-sidebar standaard verborgen achter een
// hamburgermenu. De assertions in voerGateScenarioUit zijn exclusief gebaseerd
// op gate-specifieke elementen en de /auth/me API, zodat ze ook hier betrouwbaar
// werken zonder van de desktop-sidebar afhankelijk te zijn.
//
// test.use() staat verplicht op top-niveau (niet in describe) in Playwright.
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

// iPhone 13-formaat instellen — moet top-level staan (buiten describe).
test.use({
  ...devices["iPhone 13"],
});

// ── Setup / teardown ──────────────────────────────────────────────────────────

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

// ── Mobiel scenario ────────────────────────────────────────────────────────────
test(
  "Web [mobiel]: Wachtwoord-wijzigen gate — gate → fouten → succesvol",
  async ({ page }) => {
    await voerGateScenarioUit(page);
  },
);
