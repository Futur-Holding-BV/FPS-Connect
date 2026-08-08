// Screenshot van het AK-dashboard als geauthenticeerd bewijs.
// Seedt tijdelijk 2023/2024-data, logt in als web-beheerder, maakt screenshot,
// ruimt op in finally.
//
// Draaien: S3_BUCKET=dummy pnpm --filter @workspace/scripts exec tsx src/bewijs-ak-dashboard-screenshot.ts
import path from "node:path";

import { chromium } from "@playwright/test";
import { authenticator } from "otplib";

import {
  db,
  fieAkPostenTable,
  fieJaarbegrotingenTable,
  fieJaarrealisatiesTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import {
  E2E_WEB_ADMIN_EMAIL,
  E2E_WEB_ADMIN_TOTP_SECRET,
  E2E_WEB_ADMIN_WACHTWOORD,
  genereerVersWebAdminTotp,
  setupE2eWebAdminAccount,
} from "./e2e-monteur-testaccount";

const MARKER = "SCREENSHOT_AK_2023_2024";
const J1 = 2023;
const J2 = 2024;

const devDomain = process.env.REPLIT_DEV_DOMAIN ?? "localhost:80";
const baseURL = devDomain.startsWith("http") ? devDomain : `https://${devDomain}`;

async function main(): Promise<void> {
  const begrotingIds: number[] = [];

  try {
    // ── 1. Seed representatieve 2023/2024-data ───────────────────────────────
    console.log("Seeden 2023/2024 data voor screenshot...");
    await db.insert(fieJaarrealisatiesTable).values([
      { boekjaar: J1, werkgeverId: null, omzetGefactureerd: 1_820_000, ohwMutatie: 145_000, bron: "jaarrekening", opmerkingen: MARKER },
      { boekjaar: J2, werkgeverId: null, omzetGefactureerd: 2_050_000, ohwMutatie: -68_000, bron: "jaarrekening", opmerkingen: MARKER },
    ]);

    for (const jaar of [J1, J2]) {
      const [b] = await db.insert(fieJaarbegrotingenTable).values({
        boekjaar: jaar, status: "gesloten",
        omzetDoel: jaar === J1 ? 1_750_000 : 2_000_000,
        opmerkingen: MARKER,
      }).returning();
      begrotingIds.push(b!.id);
    }

    await db.insert(fieAkPostenTable).values([
      { begrotingId: begrotingIds[0]!, categorie: "huisvesting", omschrijving: "Huur kantoor Ridderkerk", bedragJaarbasis: 72_000 },
      { begrotingId: begrotingIds[1]!, categorie: "huisvesting", omschrijving: "Huur kantoor Ridderkerk", bedragJaarbasis: 76_000 },
      { begrotingId: begrotingIds[0]!, categorie: "verzekeringen", omschrijving: "AVB-verzekering bedrijf", bedragJaarbasis: 9_600 },
      { begrotingId: begrotingIds[1]!, categorie: "verzekeringen", omschrijving: "AVB-verzekering bedrijf", bedragJaarbasis: 14_400 },
      { begrotingId: begrotingIds[0]!, categorie: "personeel_indirect", omschrijving: "Indirecte loonkosten", bedragJaarbasis: 195_000 },
      { begrotingId: begrotingIds[1]!, categorie: "personeel_indirect", omschrijving: "Indirecte loonkosten", bedragJaarbasis: 260_000 },
      { begrotingId: begrotingIds[0]!, categorie: "autokosten", omschrijving: "Lease voertuigen", bedragJaarbasis: 28_000 },
      { begrotingId: begrotingIds[1]!, categorie: "autokosten", omschrijving: "Lease voertuigen", bedragJaarbasis: 31_000 },
    ]);

    // ── 2. E2e web-admin account gereed maken ────────────────────────────────
    console.log("E2e web-admin account klaarzetten...");
    await setupE2eWebAdminAccount();

    // ── 3. Playwright: inloggen en screenshot ────────────────────────────────
    console.log(`Playwright starten (baseURL: ${baseURL})...`);

    // Op NixOS: gebruik systeem-chromium
    const { execSync } = await import("node:child_process");
    let executablePath: string | undefined;
    try { executablePath = execSync("which chromium", { encoding: "utf8" }).trim() || undefined; }
    catch { /* use bundled */ }

    const browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });
    const context = await browser.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();

    // localStorage-guards vóór de eerste navigatie
    await page.addInitScript(() => {
      localStorage.setItem("fps.welkom.afgerond", "true");
      localStorage.setItem("fps_onboarding_voltooid", "true");
    });

    // Stap 1: API-login
    const res1 = await page.request.post("/api/auth/login", {
      data: { email: E2E_WEB_ADMIN_EMAIL, wachtwoord: E2E_WEB_ADMIN_WACHTWOORD },
    });
    if (res1.status() !== 200) throw new Error(`Login stap 1 mislukt: HTTP ${res1.status()}`);
    console.log("  Login stap 1 OK, status:", (await res1.json()).status);

    // Stap 2: TOTP-verificatie (met retry)
    for (let poging = 1; poging <= 3; poging++) {
      const resterend = authenticator.timeRemaining();
      if (resterend < 15) await new Promise((r) => setTimeout(r, (resterend + 1) * 1000));
      const code = authenticator.generate(E2E_WEB_ADMIN_TOTP_SECRET);
      const res2 = await page.request.post("/api/auth/2fa/verify", { data: { code } });
      if (res2.status() === 200) { console.log("  TOTP OK"); break; }
      if (poging === 3) throw new Error("TOTP-verificatie mislukt na 3 pogingen.");
      await new Promise((r) => setTimeout(r, 32_000));
    }

    // Controleer sessie
    const me = await page.request.get("/api/auth/me");
    if (me.status() !== 200) throw new Error(`/auth/me mislukt: ${me.status()}`);
    const meBody = await me.json();
    console.log(`  Ingelogd als: ${meBody.email} (${meBody.rol})`);

    // Navigeer naar AK-dashboard
    await page.goto("/financieel/algemene-kosten", { waitUntil: "networkidle" });
    console.log("  Dashboard geladen, URL:", page.url());

    // Wacht op de jaarcijfers-tabel of reeks
    await page.waitForSelector("text=2023", { timeout: 15_000 }).catch(() => {
      console.log("  (geen '2023'-tekst binnen 15s — toch screenshot gemaakt)");
    });

    // Extra 2s voor signalen/adviezen-sectie
    await page.waitForTimeout(2_000);

    // Screenshot opslaan
    const screenshotDir = path.resolve(process.cwd(), "..", "screenshots");
    const screenshotPath = path.join(screenshotDir, "bewijs-ak-dashboard-ingelogd.jpg");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`  Screenshot opgeslagen: ${screenshotPath}`);

    await browser.close();
  } finally {
    // Cleanup — ook bij falen
    await db.delete(fieJaarrealisatiesTable).where(eq(fieJaarrealisatiesTable.opmerkingen, MARKER));
    if (begrotingIds.length > 0) {
      await db.delete(fieJaarbegrotingenTable).where(inArray(fieJaarbegrotingenTable.id, begrotingIds));
    }
    console.log("Testdata opgeruimd.");
  }
}

void main();
