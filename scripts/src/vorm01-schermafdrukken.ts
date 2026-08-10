// VORM_01 F0 — schermafdrukken van zes schermen op één vaste toestelmaat
// (402x874). Zelfde script draait later de "ná"-ronde: MODUS=na.
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/vorm01-schermafdrukken.ts
// Vereist: lopende workflows api-server + expo monteur-app, DATABASE_URL,
// REPLIT_EXPO_DEV_DOMAIN, Nix-chromium (which chromium).
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import { chromium, type Page } from "@playwright/test";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

import {
  E2E_EMAIL,
  E2E_WACHTWOORD,
  archiveerE2eAccount,
  genereerVersTotp,
  setupE2eAccount,
  wachtOpNieuwTotpVenster,
} from "./e2e-monteur-testaccount";

const MODUS = process.env["MODUS"] === "na" ? "na" : "voor";
const MAP = process.env["DONKER"] === "1" ? "../docs/metingen/vorm01/donker" : `../docs/metingen/vorm01/${MODUS}`;
const BASIS = `https://${process.env["REPLIT_EXPO_DEV_DOMAIN"]}`;
const MAAT = { width: 402, height: 874 };

async function logIn(page: Page): Promise<void> {
  // Als string, niet als callback: de callback wordt in de browser uitgevoerd
  // maar door de Node-typecheck van dit pakket getoetst (window onbekend).
  await page.addInitScript(
    `window.localStorage.setItem("fps_onboarding_voltooid", "1");` +
      `window.localStorage.setItem("fps.welkom.afgerond", "1");`,
  );
  await page.goto(BASIS + "/");
  const inputs = page.locator("input");
  await inputs.nth(0).waitFor({ state: "visible", timeout: 60_000 });
  await inputs.nth(0).fill(E2E_EMAIL);
  await inputs.nth(1).fill(E2E_WACHTWOORD);
  for (let poging = 1; poging <= 3; poging++) {
    if (poging > 1) await wachtOpNieuwTotpVenster();
    const code = await genereerVersTotp();
    await inputs.nth(2).fill("");
    await inputs.nth(2).fill(code);
    await page.getByText("Inloggen", { exact: true }).click();
    try {
      await page.getByTestId("radiaal-fps").waitFor({ state: "visible", timeout: 45_000 });
      return;
    } catch {
      if (poging === 3) throw new Error("Inloggen mislukt na 3 pogingen (TOTP/login).");
    }
  }
}

async function main(): Promise<void> {
  mkdirSync(MAP, { recursive: true });
  await setupE2eAccount();

  // Representatieve id's uit de dev-database voor de [id]-schermen.
  const [werkdag] = (await db.execute(sql`SELECT id FROM planning_items ORDER BY id DESC LIMIT 1`)).rows as { id: number }[];
  const [gebouw] = (await db.execute(sql`SELECT id FROM gebouwen WHERE gearchiveerd IS NOT TRUE ORDER BY id LIMIT 1`)).rows as { id: number }[];

  // Optioneel filter: SCHERMEN=mijn-werk,uren draait alleen die schermen.
  const filter = (process.env["SCHERMEN"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const ALLE_SCHERMEN: { naam: string; pad: string; klikLabel?: string }[] = [
    { naam: "mijn-werk", pad: "/mijn-werk" },
    { naam: "menu", pad: "/menu" },
    // Dev-database heeft 0 planning_items (gemeten): dan valt werkdag/[id]
    // terug op de werkdag-index zodat vóór/ná toch vergelijkbaar blijft.
    werkdag
      ? { naam: "werkdag-id", pad: `/werkdag/${werkdag.id}` }
      : { naam: "werkdag-index", pad: "/werkdag" },
    { naam: "uren", pad: "/uren" },
    ...(gebouw ? [{ naam: "gebouw-id", pad: `/gebouw/${gebouw.id}` }] : []),
    { naam: "hrm-index", pad: "/hrm" },
  ];
  const SCHERMEN = filter.length ? ALLE_SCHERMEN.filter((s) => filter.includes(s.naam)) : ALLE_SCHERMEN;

  const executablePath = execSync("which chromium").toString().trim();
  const browser = await chromium.launch({ executablePath });
  try {
    // DONKER=1 emuleert de systeeminstelling donker (prefers-color-scheme),
    // die react-native-web via useColorScheme volgt sinds DONKER_ACTIEF.
    const donker = process.env["DONKER"] === "1";
    const context = await browser.newContext({
      viewport: MAAT,
      deviceScaleFactor: 2,
      colorScheme: donker ? "dark" : "light",
    });
    const page = await context.newPage();
    await logIn(page);
    for (const s of SCHERMEN) {
      // Navigatie zoals een echte gebruiker: via het menu-scherm klikken waar
      // dat kan (token-bewaakte schermen redirecten bij een koude deep-link
      // door de token-herstel-race). mijn-werk is nergens vanuit de UI
      // bereikbaar (gemeten) en gaat via deep-link — kan sinds de
      // bezigLaden-guard.
      if (s.klikLabel) {
        await page.goto(BASIS + "/menu");
        await page.waitForTimeout(4000);
        await page.getByText(s.klikLabel, { exact: false }).filter({ visible: true }).first().click({ force: true });
      } else {
        await page.goto(BASIS + s.pad);
      }
      await page.waitForTimeout(5000); // data + animaties tot rust laten komen
      let url = new URL(page.url());
      // Oude builds zonder bezigLaden-guard verliezen de eerste deep-link-race
      // (redirect naar /menu); een tweede navigatie slaagt omdat het token dan
      // al hersteld is.
      for (let poging = 0; poging < 2 && !url.pathname.startsWith(s.pad === "/menu" ? "/menu" : s.pad); poging++) {
        await page.goto(BASIS + s.pad);
        await page.waitForTimeout(5000);
        url = new URL(page.url());
      }
      if (!url.pathname.startsWith(s.pad === "/menu" ? "/menu" : s.pad)) {
        console.warn(`⚠ ${s.naam}: verwacht ${s.pad}, staat op ${url.pathname}`);
      }
      await page.screenshot({ path: `${MAP}/${s.naam}.png` });
      console.log(`✓ ${s.naam} (${s.pad})`);
    }
  } finally {
    await browser.close();
    await archiveerE2eAccount();
  }
  console.log(`Klaar: ${SCHERMEN.length} schermafdrukken in ${MAP}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
