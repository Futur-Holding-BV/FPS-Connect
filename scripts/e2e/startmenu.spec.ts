// E2E: FPS radiaal startmenu (login + waaier + doorlinken).
//
// Controleert dat het startmenu achter de verplichte TOTP-login opent en correct
// doorlinkt. Draait tegen de draaiende Expo monteur-app op het Expo dev-domein.
//
// Draaien: pnpm --filter @workspace/scripts run e2e-monteur
// Vereist: lopende workflows api-server + expo monteur-app, env DATABASE_URL en
// REPLIT_EXPO_DEV_DOMAIN.
import { expect, test, type Page } from "@playwright/test";

import {
  E2E_EMAIL,
  E2E_WACHTWOORD,
  genereerVersTotp,
  setupE2eAccount,
  wachtOpNieuwTotpVenster,
} from "../src/e2e-monteur-testaccount";

const SLEUTELS = ["werkdag", "gebouwen", "verlof", "uren", "planning", "veiligheid"] as const;

// Lichte inhoudscontrole per route: bovenop de URL-check verifiëren we dat het
// doelscherm zijn eigen inhoud daadwerkelijk rendert (een kop of een lijstitem),
// zodat een regressie waarbij de route klopt maar het scherm leeg blijft of crasht
// alsnog wordt opgemerkt. De checks zijn opzettelijk data-onafhankelijk zodat de
// test stabiel blijft ongeacht de dev-database.
const INHOUD_TIMEOUT = 20_000;

// expo-router houdt het vorige scherm (o.a. het radiale menu met labels als
// "Planning", "Berichten") gemount maar verborgen in de DOM. getByText doet
// substring-matching en zou anders op die verborgen kopieën aanslaan, dus we
// filteren overal expliciet op zichtbare elementen.
function zichtbareTekst(page: Page, tekst: string | RegExp) {
  return page.getByText(tekst).filter({ visible: true });
}

async function controleerGebouwen(page: Page): Promise<void> {
  // Distinctief kop-/body-element van het gebouwenscherm.
  await expect(page.getByPlaceholder("Zoek gebouw, adres of stad…")).toBeVisible({
    timeout: INHOUD_TIMEOUT,
  });
  // Lijst geladen: óf een spots-badge (altijd aanwezig per kaart) óf de lege-staat.
  // De badge rendert het getal en "spots" in aparte Text-elementen; we matchen op
  // "spots" als zelfstandige node omdat de gecombineerde tekst niet als één DOM-element
  // zichtbaar is.
  const lijstitem = zichtbareTekst(page, "spots");
  const leeg = zichtbareTekst(page, "Geen gebouwen gevonden");
  await expect(lijstitem.first().or(leeg.first())).toBeVisible({ timeout: INHOUD_TIMEOUT });
}

async function controleerPersoneel(page: Page): Promise<void> {
  await expect(zichtbareTekst(page, "Personeel").first()).toBeVisible({ timeout: INHOUD_TIMEOUT });
  // Certificaatkaart verschijnt altijd voor de ingelogde medewerker.
  await expect(zichtbareTekst(page, "Mijn veiligheidscertificaten").first()).toBeVisible({ timeout: INHOUD_TIMEOUT });
}

async function controleerPlanning(page: Page): Promise<void> {
  // Routeplanning rendert zijn eigen scherm (kop), niet langer een placeholder.
  await expect(zichtbareTekst(page, "Routeplanning").first()).toBeVisible({
    timeout: INHOUD_TIMEOUT,
  });
}

async function controleerUren(page: Page): Promise<void> {
  await expect(zichtbareTekst(page, "Urenregistratie").first()).toBeVisible({
    timeout: INHOUD_TIMEOUT,
  });
}

async function controleerBerichten(page: Page): Promise<void> {
  await expect(zichtbareTekst(page, "Berichten").first()).toBeVisible({ timeout: INHOUD_TIMEOUT });
  // De Toolbox-tab is altijd aanwezig, ongeacht of er berichten zijn.
  await expect(zichtbareTekst(page, "Toolbox").first()).toBeVisible({ timeout: INHOUD_TIMEOUT });
}

const ROUTES: {
  sleutel: string;
  pad: string;
  route: RegExp;
  controleerInhoud: (page: Page) => Promise<void>;
}[] = [
  { sleutel: "gebouwen", pad: "/gebouwen", route: /\/gebouwen(\b|\?|$)/, controleerInhoud: controleerGebouwen },
  { sleutel: "planning", pad: "/planning", route: /\/planning(\b|\?|$)/, controleerInhoud: controleerPlanning },
  { sleutel: "personeel", pad: "/hrm", route: /\/hrm(\b|\?|$)/, controleerInhoud: controleerPersoneel },
  { sleutel: "uren", pad: "/uren", route: /\/uren(\b|\?|$)/, controleerInhoud: controleerUren },
  { sleutel: "berichten", pad: "/berichten", route: /\/berichten(\b|\?|$)/, controleerInhoud: controleerBerichten },
];

const HULPTEKST = "Tik op FPS om het menu te openen";

test.beforeAll(async () => {
  await setupE2eAccount();
});

// Logt in via de UI met een verse TOTP-code. Bij een mislukte poging (bijv. code
// verlopen tijdens een trage koude load) wordt in een nieuw venster opnieuw
// geprobeerd.
async function logIn(page: Page): Promise<void> {
  // Frisse Playwright-browser heeft geen localStorage. De app redirectt na login
  // naar /onboarding als fps_onboarding_voltooid niet gezet is. Zet het vooraf
  // zodat de onboarding nooit wordt getoond tijdens de e2e-test.
  await page.addInitScript(() => {
    window.localStorage.setItem("fps_onboarding_voltooid", "1");
  });
  await page.goto("/");

  const inputs = page.locator("input");
  await expect(inputs.nth(0)).toBeVisible({ timeout: 60_000 });
  await inputs.nth(0).fill(E2E_EMAIL);
  await inputs.nth(1).fill(E2E_WACHTWOORD);

  const fps = page.getByTestId("radiaal-fps");

  for (let poging = 1; poging <= 3; poging++) {
    if (poging > 1) await wachtOpNieuwTotpVenster();
    const code = await genereerVersTotp();
    await inputs.nth(2).fill("");
    await inputs.nth(2).fill(code);
    await page.getByText("Inloggen", { exact: true }).click();

    try {
      // 90s timeout: cold-start Expo + menu-chunk compilatie kan lang duren;
      // de menu-route heeft een eigen lazy bundle die pas na login wordt geladen.
      await expect(fps).toBeVisible({ timeout: 90_000 });
      return;
    } catch {
      if (poging === 3) {
        throw new Error("Inloggen mislukt na 3 pogingen (TOTP/login).");
      }
    }
  }
}

// Zorgt dat de waaier open staat (de zes items + Sluiten-knop zichtbaar).
async function zorgWaaierOpen(page: Page): Promise<void> {
  await expect(page.getByTestId("radiaal-fps")).toBeVisible();
  const sluiten = page.getByTestId("radiaal-sluiten");
  if ((await sluiten.count()) === 0) {
    await page.getByTestId("radiaal-fps").click({ force: true });
  }
  await expect(sluiten).toBeVisible({ timeout: 10_000 });
  // Wacht tot de waaier-animatie gestabiliseerd is (geen bewegende elementen meer).
  await page.waitForTimeout(600);
}

test("FPS startmenu: login, waaier en doorlinken", async ({ page }) => {
  await test.step("login met verplichte TOTP", async () => {
    await logIn(page);
  });

  await test.step("header en zes menu-items zichtbaar", async () => {
    await expect(page.getByText("E2E Test Monteur").first()).toBeAttached({ timeout: 20_000 });
    for (const sleutel of SLEUTELS) {
      await expect(page.getByTestId(`radiaal-${sleutel}`)).toBeVisible();
    }
    await expect(page.getByTestId("radiaal-sluiten")).toBeVisible();
  });

  await test.step("waaier sluiten toont hulptekst", async () => {
    await page.getByTestId("radiaal-sluiten").click();
    await expect(page.getByText(HULPTEKST)).toBeVisible();
    await expect(page.getByTestId("radiaal-sluiten")).toHaveCount(0);
  });

  await test.step("FPS-knop heropent de waaier", async () => {
    await page.getByTestId("radiaal-fps").click({ force: true });
    await expect(page.getByTestId("radiaal-sluiten")).toBeVisible();
    for (const sleutel of SLEUTELS) {
      await expect(page.getByTestId(`radiaal-${sleutel}`)).toBeVisible();
    }
  });

  await test.step("elk item linkt naar de juiste route én toont zijn inhoud", async () => {
    // Reanimated positioneert waaier-items DOM-matig allemaal op hetzelfde middelpunt
    // (visuele CSS transform verplaatst ze). Klikken werkt niet.
    // menu.tsx registreert window.__FPS_ROUTES__ (sleutel→pad) en window.__FPS_NAVIGEER__(pad)
    // zodat de test via de Expo Router kan navigeren zonder klik-simulatie.
    for (const { sleutel, route, controleerInhoud } of ROUTES) {
      // Lees pad uit de globale route-map die menu.tsx bijhoudt.
      const pad = await page.evaluate((s) => {
        const routes = (window as typeof window & { __FPS_ROUTES__?: Record<string, string> }).__FPS_ROUTES__;
        return routes ? (routes[s] ?? null) : null;
      }, sleutel);
      if (!pad) throw new Error(`__FPS_ROUTES__[${sleutel}] niet beschikbaar — menu.tsx geladen?`);

      // Navigeer via de Expo Router (behoudt auth-state in AsyncStorage).
      await page.evaluate((p) => {
        const nav = (window as typeof window & { __FPS_NAVIGEER__?: (pad: string) => void }).__FPS_NAVIGEER__;
        if (nav) nav(p);
      }, pad);

      await expect(page).toHaveURL(route, { timeout: 15_000 });
      await controleerInhoud(page);
      await page.goBack();
      await expect(page.getByTestId("radiaal-fps")).toBeVisible({ timeout: 15_000 });
    }
  });

  // ── Diepere schermen ────────────────────────────────────────────────────────
  // Na de bovenstaande lus staat het startscherm open (FPS-knop zichtbaar).
  // Elk volgend blok navigeert naar een vervolgscherm en controleert dat het
  // scherm zijn eigen inhoud rendert. De controles zijn data-onafhankelijk:
  // óf een kop/inhoud verschijnt, óf de bijbehorende lege-staat.

  await test.step("dieper: gebouw-detail na klikken op gebouwkaart", async () => {
    await page.evaluate(() => { (window as typeof window & { __FPS_NAVIGEER__?: (p: string) => void }).__FPS_NAVIGEER__?.("/gebouwen"); });
    await expect(page).toHaveURL(/\/gebouwen(\b|\?|$)/, { timeout: 15_000 });
    await expect(page.getByPlaceholder("Zoek gebouw, adres of stad…")).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });

    // De spots-badge rendert getal en "spots" in aparte Text-elementen. We
    // matchen op de eerste zichtbare "spots"-node als proxy voor een geladen kaart.
    const eersteSpotsBadge = zichtbareTekst(page, "spots").first();
    const leegStaatGebouwen = zichtbareTekst(page, "Geen gebouwen gevonden");

    // Wacht tot de lijst (of de lege staat) geladen is.
    await expect(eersteSpotsBadge.or(leegStaatGebouwen.first())).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });

    // Klik op de eerste spots-badge (click bubbles naar de Pressable-kaart).
    const heeftKaarten = (await eersteSpotsBadge.count()) > 0;
    if (heeftKaarten) {
      await eersteSpotsBadge.click();
      await expect(page).toHaveURL(/\/gebouw\/\d+/, { timeout: INHOUD_TIMEOUT });

      // Subkop is altijd aanwezig in het detail-scherm.
      await expect(
        zichtbareTekst(page, "Kies een verdieping om de plattegrond te openen").first(),
      ).toBeVisible({ timeout: INHOUD_TIMEOUT });

      // Verdiepingenlijst óf lege staat.
      const verdiepingRij = page.getByText(/\d+\s+voorzieningen?\b/).filter({ visible: true });
      const geenVerdiepingen = zichtbareTekst(page, "Dit gebouw heeft nog geen verdiepingen.");
      await expect(verdiepingRij.first().or(geenVerdiepingen.first())).toBeVisible({
        timeout: INHOUD_TIMEOUT,
      });

      await page.goBack(); // terug naar /gebouwen
    }

    await page.goBack(); // terug naar root
    await expect(page.getByTestId("radiaal-fps")).toBeVisible({ timeout: INHOUD_TIMEOUT });
  });

  await test.step("dieper: documentenlijst via Documenten-knop op gebouwenscherm", async () => {
    await page.evaluate(() => { (window as typeof window & { __FPS_NAVIGEER__?: (p: string) => void }).__FPS_NAVIGEER__?.("/gebouwen"); });
    await expect(page).toHaveURL(/\/gebouwen(\b|\?|$)/, { timeout: 15_000 });
    await expect(page.getByPlaceholder("Zoek gebouw, adres of stad…")).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });

    // "Documenten"-knop staat in de koptekst van het gebouwenscherm.
    await zichtbareTekst(page, "Documenten").first().click();
    await expect(page).toHaveURL(/\/documenten(\b|\?|$)/, { timeout: INHOUD_TIMEOUT });

    // Zoekbalk is altijd aanwezig ongeacht de data.
    await expect(
      page.getByPlaceholder("Zoek op naam, fabrikant of rapportnummer…"),
    ).toBeVisible({ timeout: INHOUD_TIMEOUT });

    // Lijst: document-kaart (toont "Actueel") óf lege staat.
    const documentKaart = page.getByText("Actueel").filter({ visible: true }).first();
    const leegStaatDocumenten = zichtbareTekst(page, "Geen documenten gevonden.");
    await expect(documentKaart.or(leegStaatDocumenten.first())).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });

    await page.goBack(); // terug naar /gebouwen
    await page.goBack(); // terug naar root
    await expect(page.getByTestId("radiaal-fps")).toBeVisible({ timeout: INHOUD_TIMEOUT });
  });

  await test.step("dieper: hrm-opleidingen toont trainingen-scherm", async () => {
    await page.evaluate(() => { (window as typeof window & { __FPS_NAVIGEER__?: (p: string) => void }).__FPS_NAVIGEER__?.("/hrm"); });
    await expect(page).toHaveURL(/\/hrm(\b|\?|$)/, { timeout: 15_000 });
    await expect(zichtbareTekst(page, "Mijn veiligheidscertificaten").first()).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });

    // "Opleidingen"-navigatiekaart op het HRM-dashboard.
    await zichtbareTekst(page, "Opleidingen").first().click();
    await expect(page).toHaveURL(/\/hrm\/opleidingen(\b|\?|$)/, { timeout: INHOUD_TIMEOUT });

    // Subkop altijd aanwezig — dit bewijst dat het scherm gemount en geladen heeft.
    // Consistent met de aanpak van controleerPersoneel: we controleren de kop,
    // niet de lijstinhoud (die is data-afhankelijk en niet deterministisch).
    await expect(zichtbareTekst(page, "Trainingen en certificaten").first()).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });

    await page.goBack(); // terug naar /hrm
    await page.goBack(); // terug naar root
    await expect(page.getByTestId("radiaal-fps")).toBeVisible({ timeout: INHOUD_TIMEOUT });
  });

  await test.step("dieper: hrm-kennisbank toont vaste kennisartikelen", async () => {
    await page.evaluate(() => { (window as typeof window & { __FPS_NAVIGEER__?: (p: string) => void }).__FPS_NAVIGEER__?.("/hrm"); });
    await expect(page).toHaveURL(/\/hrm(\b|\?|$)/, { timeout: 15_000 });
    await expect(zichtbareTekst(page, "Mijn veiligheidscertificaten").first()).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });

    // "Kennisbank"-navigatiekaart op het HRM-dashboard.
    await zichtbareTekst(page, "Kennisbank").first().click();
    await expect(page).toHaveURL(/\/hrm\/kennisbank(\b|\?|$)/, { timeout: INHOUD_TIMEOUT });

    // Schermkop altijd aanwezig.
    await expect(zichtbareTekst(page, "Kennisbank").first()).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });

    // Vaste statische artikelen zijn altijd aanwezig (geen API-afhankelijkheid).
    await expect(zichtbareTekst(page, "Brandwerende doorvoeringen").first()).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });
    await expect(zichtbareTekst(page, "Veilig werken op locatie").first()).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });

    await page.goBack(); // terug naar /hrm
    await page.goBack(); // terug naar root
    await expect(page.getByTestId("radiaal-fps")).toBeVisible({ timeout: INHOUD_TIMEOUT });
  });

  await test.step("dieper: hrm-verlof toont saldo en aanvragen", async () => {
    await page.evaluate(() => { (window as typeof window & { __FPS_NAVIGEER__?: (p: string) => void }).__FPS_NAVIGEER__?.("/hrm"); });
    await expect(page).toHaveURL(/\/hrm(\b|\?|$)/, { timeout: 15_000 });
    await expect(zichtbareTekst(page, "Mijn veiligheidscertificaten").first()).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });

    // "Verlof"-navigatiekaart op het HRM-dashboard (testID voor betrouwbaar klikken).
    await page.getByTestId("hrm-verlof-navkaart").click();
    await expect(page).toHaveURL(/\/hrm\/verlof(\b|\?|$)/, { timeout: INHOUD_TIMEOUT });

    // Schermkop altijd aanwezig ongeacht de data.
    await expect(zichtbareTekst(page, "Verlof").first()).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });

    // Sectiekop "Verlofsaldo" is altijd aanwezig nadat de data geladen is
    // (óf met saldokaarten, óf met de lege-staat "Geen verlofsaldo beschikbaar").
    const verlofsaldoKop = zichtbareTekst(page, "Verlofsaldo");
    const saldoKaart = page.getByText(/\d+(?:[.,]\d+)?\s*u\b/).filter({ visible: true }).first();
    const geenSaldo = zichtbareTekst(page, /Geen verlofsaldo beschikbaar/);
    await expect(verlofsaldoKop.first()).toBeVisible({ timeout: INHOUD_TIMEOUT });
    await expect(saldoKaart.or(geenSaldo.first())).toBeVisible({ timeout: INHOUD_TIMEOUT });

    // Sectiekop "Aanvragen" en bijbehorende inhoud of lege-staat zijn altijd aanwezig.
    const aanvragenKop = zichtbareTekst(page, "Aanvragen");
    await expect(aanvragenKop.first()).toBeVisible({ timeout: INHOUD_TIMEOUT });
    const aanvraagKaart = page
      .getByText(/Aangevraagd|Goedgekeurd|Afgewezen|Ingetrokken/)
      .filter({ visible: true })
      .first();
    const geenAanvragen = zichtbareTekst(page, "Geen verlofaanvragen gevonden.");
    await expect(aanvraagKaart.or(geenAanvragen.first())).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });

    await page.goBack(); // terug naar /hrm
    await page.goBack(); // terug naar root
    await expect(page.getByTestId("radiaal-fps")).toBeVisible({ timeout: INHOUD_TIMEOUT });
  });

  await test.step("verlofformulier: aanvraagformulier vangt invoerfouten af", async () => {
    await page.evaluate(() => { (window as typeof window & { __FPS_NAVIGEER__?: (p: string) => void }).__FPS_NAVIGEER__?.("/hrm"); });
    await expect(page).toHaveURL(/\/hrm(\b|\?|$)/, { timeout: 15_000 });
    await expect(zichtbareTekst(page, "Mijn veiligheidscertificaten").first()).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });

    await page.getByTestId("hrm-verlof-navkaart").click();
    await expect(page).toHaveURL(/\/hrm\/verlof(\b|\?|$)/, { timeout: INHOUD_TIMEOUT });

    // Wacht tot het verlofscherm volledig geladen is.
    await expect(zichtbareTekst(page, "Verlofsaldo").first()).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });

    // Open het aanvraagformulier.
    await page.getByTestId("verlof-aanvragen-knop").click();
    await expect(zichtbareTekst(page, "Verlofaanvraag indienen").first()).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });

    // Scenario 1: indienen zonder verlofsoort → exact de foutmelding in de fout-container.
    await page.getByTestId("verlof-indienen-knop").click();
    await expect(page.getByTestId("verlof-formulier-fout")).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });
    await expect(
      page.getByTestId("verlof-formulier-fout").getByText("Kies een verlofsoort."),
    ).toBeVisible({ timeout: INHOUD_TIMEOUT });

    // Scenario 2: verlofsoort kiezen + ongeldige datum → datumfout.
    // Conditioneel: alleen uitvoerbaar als er verlofsoorten in de catalog staan.
    await page.getByTestId("verlof-soort-picker-knop").click();
    await expect(zichtbareTekst(page, "Verlofsoort kiezen").first()).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });

    const geenSoorten = zichtbareTekst(page, "Geen verlofsoorten beschikbaar");
    const heeftGeenSoorten = (await geenSoorten.count()) > 0;

    if (!heeftGeenSoorten) {
      // Klik de eerste beschikbare verlofsoort-rij (testID patroon verlof-soort-rij-{id}).
      const eersteRij = page.getByTestId(/^verlof-soort-rij-/).first();
      await expect(eersteRij).toBeVisible({ timeout: INHOUD_TIMEOUT });
      await eersteRij.click();

      // Picker sluit; verlofsoort is nu geselecteerd.
      await expect(zichtbareTekst(page, "Verlofsoort kiezen").first()).toHaveCount(0);

      // Geen datum gekozen (datumveld is nu een klikbare knop, geen tekstinvoer).
      // Indienen zonder datum → datumfout.
      await page.getByTestId("verlof-indienen-knop").click();
      await expect(page.getByTestId("verlof-formulier-fout")).toBeVisible({
        timeout: INHOUD_TIMEOUT,
      });
      await expect(
        page.getByTestId("verlof-formulier-fout").getByText("Kies een geldige startdatum."),
      ).toBeVisible({ timeout: INHOUD_TIMEOUT });

      // Scenario 3: geldige datums, maar einddatum vóór startdatum → volgorde-foutmelding.
      await page.getByTestId("verlof-startdatum-input").fill("2030-06-10");
      await page.getByTestId("verlof-einddatum-input").fill("2030-06-01");
      await page.getByTestId("verlof-indienen-knop").click();
      await expect(page.getByTestId("verlof-formulier-fout")).toBeVisible({
        timeout: INHOUD_TIMEOUT,
      });
      await expect(
        page.getByTestId("verlof-formulier-fout").getByText(
          "De einddatum mag niet vóór de startdatum liggen.",
        ),
      ).toBeVisible({ timeout: INHOUD_TIMEOUT });
    } else {
      // Geen verlofsoorten beschikbaar in de catalog; sluit de picker via testID.
      await page.getByTestId("verlofsoort-picker-sluiten").click();
      await expect(zichtbareTekst(page, "Verlofsoort kiezen").first()).toHaveCount(0);
    }

    // Sluit de hoofd-modal via testID.
    await page.getByTestId("verlofaanvraag-sluiten").click();
    await expect(zichtbareTekst(page, "Verlofaanvraag indienen").first()).toHaveCount(0);

    await page.goBack(); // terug naar /hrm
    await page.goBack(); // terug naar root
    await expect(page.getByTestId("radiaal-fps")).toBeVisible({ timeout: INHOUD_TIMEOUT });
  });
});
