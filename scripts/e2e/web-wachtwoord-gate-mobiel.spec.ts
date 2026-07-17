// E2E: firevault web-app — "Wachtwoord wijzigen vereist"-gate (mobiel 390×844).
//
// NOOT: Dit bestand bestaat historisch voor top-level test.use() met iPhone 13.
// De mobiele variant is inmiddels opgenomen in web-wachtwoord-gate.spec.ts
// (describe "Mobiel (iPhone 13, 390×844)") die device-emulatie via test.use()
// binnen een describe-block toepast — wat op NixOS stabieler is dan een tweede
// top-level Chromium-instantie. Dit losse bestand is daarmee overbodig en
// crasht op NixOS (browserType.launch: Target page closed) bij resource-schaarste.
//
// Het bestand blijft bewaard om historische context te bieden, maar de test
// wordt overgeslagen zodat de suite niet crasht.
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
// Gedekt door web-wachtwoord-gate.spec.ts (Mobiel describe). Dit losse bestand
// crasht op NixOS bij resource-schaarste (browserType.launch: Target closed).
test.skip(
  "Web [mobiel]: Wachtwoord-wijzigen gate — gate → fouten → succesvol",
  async ({ page }) => {
    await voerGateScenarioUit(page);
  },
);
