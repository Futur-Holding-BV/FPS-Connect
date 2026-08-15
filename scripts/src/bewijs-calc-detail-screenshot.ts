// Screenshot-bewijs van de heringedeelde calculatie-detailpagina (procesbalk,
// rekenblad-kader, kaarten Financieel & AI-hulp) in licht én donker thema.
//
// Draaien: S3_BUCKET=dummy pnpm --filter @workspace/scripts exec tsx src/bewijs-calc-detail-screenshot.ts
import path from "node:path";

import { chromium } from "@playwright/test";
import { authenticator } from "otplib";

import {
  E2E_WEB_ADMIN_EMAIL,
  E2E_WEB_ADMIN_TOTP_SECRET,
  E2E_WEB_ADMIN_WACHTWOORD,
  setupE2eWebAdminAccount,
} from "./e2e-monteur-testaccount";

const CALC_ID = process.env.CALC_ID ?? "112";
const devDomain = process.env.REPLIT_DEV_DOMAIN ?? "localhost:80";
const baseURL = devDomain.startsWith("http") ? devDomain : `https://${devDomain}`;

async function main(): Promise<void> {
  await setupE2eWebAdminAccount();

  const { execSync } = await import("node:child_process");
  let executablePath: string | undefined;
  try { executablePath = execSync("which chromium", { encoding: "utf8" }).trim() || undefined; }
  catch { /* bundled */ }

  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });

  for (const thema of ["licht", "donker"] as const) {
    const context = await browser.newContext({
      baseURL, ignoreHTTPSErrors: true, viewport: { width: 1512, height: 950 },
      colorScheme: thema === "licht" ? "light" : "dark",
    });
    const page = await context.newPage();
    await page.addInitScript((t) => {
      localStorage.setItem("fps.welkom.afgerond", "true");
      localStorage.setItem("fps_onboarding_voltooid", "true");
      localStorage.setItem("fps.weergave", JSON.stringify({ thema: t }));
    }, thema);

    const res1 = await page.request.post("/api/auth/login", {
      data: { email: E2E_WEB_ADMIN_EMAIL, wachtwoord: E2E_WEB_ADMIN_WACHTWOORD },
    });
    if (res1.status() !== 200) throw new Error(`Login mislukt: ${res1.status()}`);
    for (let poging = 1; poging <= 3; poging++) {
      const resterend = authenticator.timeRemaining();
      if (resterend < 15) await new Promise((r) => setTimeout(r, (resterend + 1) * 1000));
      const code = authenticator.generate(E2E_WEB_ADMIN_TOTP_SECRET);
      const res2 = await page.request.post("/api/auth/2fa/verify", { data: { code } });
      if (res2.status() === 200) break;
      if (poging === 3) throw new Error("TOTP mislukt na 3 pogingen.");
      await new Promise((r) => setTimeout(r, 32_000));
    }

    await page.goto(`/modules/calculatie/${CALC_ID}`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="proces-balk"]', { timeout: 15_000 });
    await page.waitForTimeout(1_500);

    const out = path.resolve(process.cwd(), "..", "screenshots", `bewijs-calc-detail-${thema}.jpg`);
    await page.screenshot({ path: out, fullPage: false });
    console.log(`Screenshot (${thema}): ${out}`);
    await context.close();
  }
  await browser.close();
}

void main();
