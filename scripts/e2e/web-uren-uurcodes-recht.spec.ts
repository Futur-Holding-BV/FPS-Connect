// E2E: nette uitleg bij uurcodelijst zonder projectenrecht (task #866).
//
// Bewaakt twee garanties uit taak #865:
//   1. Een gebruiker ZONDER projectenrecht (projecten:0) die in de uren-invoer
//      een opdracht kiest, krijgt geen kale/lege uurcodelijst maar de melding
//      "Vraag je beheerder om het projectenrecht" (data-testid
//      melding-uurcodes-geen-recht). De 403 komt écht van de api-server
//      (requireBevoegdheid("projecten", 1) op GET /opdrachten/:id/uurcodes) en
//      loopt door de generated hooks (useGetOpdrachtUurcodes + ApiError), zodat
//      een regressie in de foutafhandeling van de codegen-laag hier faalt.
//   2. Alle presets in groep "Uitvoering" (lib/permissies) hebben projecten>=1,
//      zodat een nieuwe veld-preset het recht niet kan vergeten (migratie 0032).
//
// OPZET MELDING-TEST:
// Zonder projectenrecht geeft ook GET /opdrachten een 403, waardoor de
// opdracht-combobox leeg blijft en de melding via de UI onbereikbaar zou zijn.
// Daarom wordt ALLEEN de opdrachtenlijst gemockt (één fictieve opdracht); de
// uurcodes-request gaat ongemoeid naar de echte api-server en levert de echte
// 403. Dit spiegelt het regressiescenario: de melding moet blijven verschijnen
// zodra de server de uurcodelijst weigert.
//
// Draaien: pnpm --filter @workspace/scripts run e2e-web
// Vereist: lopende workflows api-server + firevault web, env DATABASE_URL en
// REPLIT_DEV_DOMAIN.
import { expect, test } from "@playwright/test";

import { PRESETS } from "@workspace/permissies";

import { programmatischInloggen } from "./web-api-proxy";
import {
  setupE2eUurcodesAccount,
  archiveerE2eUurcodesAccount,
  E2E_UURCODES_EMAIL,
  E2E_UURCODES_WACHTWOORD,
  E2E_UURCODES_TOTP_SECRET,
} from "../src/e2e-monteur-testaccount";

const INHOUD_TIMEOUT = 20_000;

// Fictieve opdracht die alleen in de gemockte lijst-respons bestaat; de
// uurcodes-request voor dit id wordt door de server al vóór de query geweigerd
// (403), dus het id hoeft niet in de database te bestaan.
const MOCK_OPDRACHT_ID = 986_866;
const MOCK_OPDRACHT = {
  id: MOCK_OPDRACHT_ID,
  titel: "E2E Uurcodes testopdracht",
  werknummer: "E2E-UURC-866",
  opdrachtgever: "E2E BV",
  status: "actief",
  gebouw_naam: null,
};

test.beforeAll(async () => {
  await setupE2eUurcodesAccount();
});

test.afterAll(async () => {
  await archiveerE2eUurcodesAccount();
});

// ── Preset-borging (geen browser nodig) ──────────────────────────────────────

test("alle presets in groep Uitvoering hebben projecten >= 1 (UREN_01 §6b)", () => {
  const uitvoering = PRESETS.filter((p) => p.groep === "Uitvoering");

  // Vangnet: als de groep ooit hernoemd wordt, mag deze check niet stil
  // slagen op een lege lijst.
  expect(uitvoering.length).toBeGreaterThanOrEqual(1);

  const zonderRecht = uitvoering
    .filter((p) => (p.bevoegdheden.projecten ?? 0) < 1)
    .map((p) => p.naam);

  expect(
    zonderRecht,
    `Veld-presets zonder projecten>=1 (uurcodelijst per opdracht geeft dan 403): ${zonderRecht.join(", ")}`,
  ).toEqual([]);
});

// ── Melding in de uren-invoer ────────────────────────────────────────────────

test("gebruiker zonder projectenrecht ziet nette uitleg i.p.v. lege uurcodelijst", async ({ page }) => {
  await test.step("inloggen als account zonder projectenrecht", async () => {
    await programmatischInloggen(
      page,
      E2E_UURCODES_EMAIL,
      E2E_UURCODES_WACHTWOORD,
      E2E_UURCODES_TOTP_SECRET,
    );
  });

  await test.step("mock alleen de opdrachtenlijst (uurcodes blijft echte server)", async () => {
    // Later geregistreerde routes winnen van de sessie-proxy uit
    // programmatischInloggen; alleen exact /api/opdrachten (querystring
    // toegestaan) wordt hier afgevangen.
    await page.route(
      (url) => url.pathname.endsWith("/api/opdrachten"),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([MOCK_OPDRACHT]),
        });
      },
    );
  });

  await test.step("open de uren-invoer en kies de opdracht", async () => {
    await page.goto("/uren");
    await page
      .getByRole("button", { name: "Uren registreren" })
      .click({ timeout: INHOUD_TIMEOUT });

    // Opdracht-combobox openen en de (gemockte) opdracht kiezen.
    await page.getByText("Kies een opdracht (optioneel)").click();
    await page
      .getByText("E2E Uurcodes testopdracht")
      .click({ timeout: INHOUD_TIMEOUT });
  });

  await test.step("server weigert de uurcodelijst met een echte 403", async () => {
    const response = await page.waitForResponse(
      (res) => res.url().includes(`/api/opdrachten/${MOCK_OPDRACHT_ID}/uurcodes`),
      { timeout: INHOUD_TIMEOUT },
    );
    expect(response.status()).toBe(403);
  });

  await test.step("de nette uitleg is zichtbaar", async () => {
    const melding = page.getByTestId("melding-uurcodes-geen-recht");
    await expect(melding).toBeVisible({ timeout: INHOUD_TIMEOUT });
    await expect(melding).toContainText(
      "Vraag je beheerder om het projectenrecht",
    );
  });
});
