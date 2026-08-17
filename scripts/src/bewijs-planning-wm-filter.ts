// Screenshot-bewijs: het werkmaatschappij-filter op Planning toont alle
// actieve werkgevers uit de API (incl. de nieuw aangemaakte FPS Bouw en
// Renovatie), niet meer de hardcoded twee.
//
// Draaien: S3_BUCKET=dummy pnpm --filter @workspace/scripts exec tsx src/bewijs-planning-wm-filter.ts
import "./lib/prodGuard";
import { chromium } from "@playwright/test";
import { authenticator } from "otplib";

import {
  E2E_WEB_ADMIN_EMAIL,
  E2E_WEB_ADMIN_TOTP_SECRET,
  E2E_WEB_ADMIN_WACHTWOORD,
  setupE2eWebAdminAccount,
} from "./e2e-monteur-testaccount";

const devDomain = process.env.REPLIT_DEV_DOMAIN ?? "localhost:80";
const baseURL = devDomain.startsWith("http") ? devDomain : `https://${devDomain}`;

async function main(): Promise<void> {
  await setupE2eWebAdminAccount();

  const { execSync } = await import("node:child_process");
  let executablePath: string | undefined;
  try { executablePath = execSync("which chromium", { encoding: "utf8" }).trim() || undefined; }
  catch { /* bundled */ }

  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("fps.welkom.afgerond", "true");
    localStorage.setItem("fps_onboarding_voltooid", "true");
  });

  const res1 = await page.request.post("/api/auth/login", {
    data: { email: E2E_WEB_ADMIN_EMAIL, wachtwoord: E2E_WEB_ADMIN_WACHTWOORD },
  });
  if (res1.status() !== 200) throw new Error(`Login stap 1 mislukt: HTTP ${res1.status()}`);
  for (let poging = 1; poging <= 3; poging++) {
    const resterend = authenticator.timeRemaining();
    if (resterend < 15) await new Promise((r) => setTimeout(r, (resterend + 1) * 1000));
    const code = authenticator.generate(E2E_WEB_ADMIN_TOTP_SECRET);
    const res2 = await page.request.post("/api/auth/2fa/verify", { data: { code } });
    if (res2.status() === 200) break;
    if (poging === 3) throw new Error("TOTP-verificatie mislukt na 3 pogingen.");
    await new Promise((r) => setTimeout(r, 32_000));
  }

  await page.goto("/modules/planning", { waitUntil: "networkidle" });
  // Open het werkmaatschappij-filter (eerste Select in de filterbar)
  const trigger = page.locator("button", { hasText: "Alle werkmaatschappijen" }).first();
  await trigger.waitFor({ timeout: 15_000 });
  await trigger.click();
  await page.waitForTimeout(500);

  const opties = await page.locator("[role=option]").allTextContents();
  console.log("Opties in dropdown:", JSON.stringify(opties));
  if (!opties.some((o) => o.includes("FPS Bouw en Renovatie"))) {
    throw new Error("FPS Bouw en Renovatie ontbreekt in het filter!");
  }
  await page.screenshot({ path: "/tmp/bewijs-planning-wm-filter.png" });
  console.log("Screenshot: /tmp/bewijs-planning-wm-filter.png — BEWIJS OK");
  await browser.close();
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
