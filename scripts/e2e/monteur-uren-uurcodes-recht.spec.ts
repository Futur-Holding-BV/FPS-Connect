// E2E (monteur-app): nette uitleg bij uurcodelijst zonder projectenrecht (task #866).
//
// Bewaakt de app-kant van taak #865: een monteur ZONDER projectenrecht
// (projecten:0) die in de FPS Monteur-app een urenregistratie op een opdracht
// opent, krijgt geen kale/lege uurcodelijst maar de melding "Geen toegang tot
// de uurcodelijst … Je account mist het projectenrecht" (app/uren.tsx). De 403
// komt écht van de api-server (requireBevoegdheid("projecten", 1) op
// GET /opdrachten/:id/uurcodes) en loopt door de generated hooks
// (useGetOpdrachtUurcodes + ApiError), zodat een regressie in de
// foutafhandeling van de codegen-laag hier faalt.
//
// OPZET:
// Het uurcodesblok in de app verschijnt alleen bij een registratie mét
// opdracht_id (bestaand of via planning). Daarom wordt een echte opdracht +
// uren-registratie (status concept, vandaag) voor het testaccount geseed; de
// test opent die registratie via het weekoverzicht (bewerken) en controleert
// de melding.
//
// Draaien: pnpm --filter @workspace/scripts run e2e-monteur
// Vereist: lopende workflows api-server + expo monteur-app, env DATABASE_URL en
// REPLIT_EXPO_DEV_DOMAIN.
import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { authenticator } from "otplib";

import {
  db,
  medewerkersTable,
  opdrachtenTable,
  urenRegistratiesTable,
} from "@workspace/db";

import {
  setupE2eUurcodesAppAccount,
  archiveerE2eUurcodesAppAccount,
  E2E_UURCODES_APP_EMAIL,
  E2E_UURCODES_APP_WACHTWOORD,
  E2E_UURCODES_APP_TOTP_SECRET,
  wachtOpNieuwTotpVenster,
} from "../src/e2e-monteur-testaccount";

const INHOUD_TIMEOUT = 20_000;
const REGISTRATIE_NAAM = "E2E Uurcodes 866";

let gebruikerId = 0;
let medewerkerId = 0;
let opdrachtId = 0;
let urenId = 0;

test.beforeAll(async () => {
  gebruikerId = await setupE2eUurcodesAppAccount();

  // Medewerker-koppeling: /uren/mijn-week zoekt de medewerker op gebruiker_id.
  const [bestaandeMedewerker] = await db
    .select({ id: medewerkersTable.id })
    .from(medewerkersTable)
    .where(eq(medewerkersTable.gebruikerId, gebruikerId));
  if (bestaandeMedewerker) {
    medewerkerId = bestaandeMedewerker.id;
  } else {
    const [nieuw] = await db
      .insert(medewerkersTable)
      .values({ naam: "E2E App Uurcodes Zonder Recht", gebruikerId })
      .returning({ id: medewerkersTable.id });
    medewerkerId = nieuw.id;
  }

  // Idempotent: bij een retry draait beforeAll opnieuw in een verse worker.
  // Restanten van eerdere pogingen eerst opruimen, anders staan er dubbele
  // registraties in het weekoverzicht en klikt de test de verkeerde aan.
  await db
    .delete(urenRegistratiesTable)
    .where(eq(urenRegistratiesTable.medewerkerId, medewerkerId));
  await db
    .delete(opdrachtenTable)
    .where(eq(opdrachtenTable.werknummer, "E2E-UURC-APP-866"));

  const [opdracht] = await db
    .insert(opdrachtenTable)
    .values({
      titel: "E2E Uurcodes app-testopdracht",
      werknummer: "E2E-UURC-APP-866",
      opdrachtgever: "E2E BV",
      status: "actief",
    })
    .returning({ id: opdrachtenTable.id });
  opdrachtId = opdracht.id;

  // Concept-registratie van vandaag mét opdracht: het uurcodesblok in de app
  // verschijnt alleen bij een registratie met opdracht_id.
  const vandaag = new Date().toISOString().slice(0, 10);
  const [uren] = await db
    .insert(urenRegistratiesTable)
    .values({
      datum: vandaag,
      medewerkerId,
      projectNaam: REGISTRATIE_NAAM,
      beginTijd: "08:00",
      eindTijd: "12:00",
      pauzeMinuten: 0,
      nettoUren: 4,
      status: "concept",
      opdrachtId,
    })
    .returning({ id: urenRegistratiesTable.id });
  urenId = uren.id;
});

test.afterAll(async () => {
  if (medewerkerId > 0) {
    await db
      .delete(urenRegistratiesTable)
      .where(eq(urenRegistratiesTable.medewerkerId, medewerkerId));
  }
  await db
    .delete(opdrachtenTable)
    .where(eq(opdrachtenTable.werknummer, "E2E-UURC-APP-866"));
  await archiveerE2eUurcodesAppAccount();
});

// Verse TOTP-code met voldoende resttijd (zie genereerVersTotp, maar dan voor
// het eigen secret van dit account).
async function versTotp(minResterendeSec = 20): Promise<string> {
  const resterend = authenticator.timeRemaining();
  if (resterend < minResterendeSec) {
    await new Promise((r) => setTimeout(r, (resterend + 1) * 1000));
  }
  return authenticator.generate(E2E_UURCODES_APP_TOTP_SECRET);
}

function zichtbareTekst(page: Page, tekst: string | RegExp) {
  return page.getByText(tekst).filter({ visible: true });
}

// UI-login met retries op het TOTP-venster (zelfde patroon als startmenu.spec.ts).
async function logIn(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("fps_onboarding_voltooid", "1");
  });
  await page.goto("/");

  const inputs = page.locator("input");
  await expect(inputs.nth(0)).toBeVisible({ timeout: 60_000 });
  await inputs.nth(0).fill(E2E_UURCODES_APP_EMAIL);
  await inputs.nth(1).fill(E2E_UURCODES_APP_WACHTWOORD);

  for (let poging = 1; poging <= 3; poging++) {
    if (poging > 1) await wachtOpNieuwTotpVenster();
    const code = await versTotp();
    await inputs.nth(2).fill("");
    await inputs.nth(2).fill(code);
    await page.getByText("Inloggen", { exact: true }).click();

    try {
      await expect(page.getByTestId("radiaal-fps")).toBeVisible({ timeout: 90_000 });
      return;
    } catch {
      if (poging === 3) throw new Error("Inloggen mislukt na 3 TOTP-pogingen.");
    }
  }
}

test("app: monteur zonder projectenrecht ziet nette uitleg bij de uurcodelijst", async ({ page }) => {
  await test.step("inloggen als account zonder projectenrecht", async () => {
    await logIn(page);
  });

  await test.step("open het urenscherm", async () => {
    await page.goto("/uren");
    await expect(zichtbareTekst(page, "Urenregistratie").first()).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });
  });

  await test.step("open de geseedde registratie (bewerken)", async () => {
    const kaart = zichtbareTekst(page, REGISTRATIE_NAAM).first();
    await expect(kaart).toBeVisible({ timeout: INHOUD_TIMEOUT });

    const responsePromise = page.waitForResponse(
      (res) => /\/api\/opdrachten\/\d+\/uurcodes/.test(res.url()),
      { timeout: INHOUD_TIMEOUT },
    );
    await kaart.click();

    // De server weigert de uurcodelijst met een echte 403 (geen projectenrecht).
    const response = await responsePromise;
    expect(response.status()).toBe(403);
  });

  await test.step("de nette uitleg is zichtbaar", async () => {
    await expect(
      zichtbareTekst(page, "Geen toegang tot de uurcodelijst").first(),
    ).toBeVisible({ timeout: INHOUD_TIMEOUT });
    await expect(
      zichtbareTekst(page, /Je account mist het projectenrecht/).first(),
    ).toBeVisible({ timeout: INHOUD_TIMEOUT });
  });
});
