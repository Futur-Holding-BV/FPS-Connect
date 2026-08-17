// Schermafdruk van /crm op telefoonbreedte (390x844) — bewijs MOBIEL_01.
import { chromium, type Page } from "@playwright/test";
import { authenticator } from "otplib";
import {
  E2E_WEB_ADMIN_EMAIL,
  E2E_WEB_ADMIN_TOTP_SECRET,
  E2E_WEB_ADMIN_WACHTWOORD,
  setupE2eWebAdminAccount,
} from "./e2e-monteur-testaccount";

const devDomain = process.env.REPLIT_DEV_DOMAIN ?? "localhost:80";
const baseURL = devDomain.startsWith("http") ? devDomain : `https://${devDomain}`;
const UIT = process.env.UITVOER_DIR ?? "/tmp/mobiel";

async function login(page: Page) {
  const res1 = await page.request.post("/api/auth/login", {
    data: { email: E2E_WEB_ADMIN_EMAIL, wachtwoord: E2E_WEB_ADMIN_WACHTWOORD },
  });
  if (res1.status() !== 200) throw new Error(`Login mislukt: ${res1.status()}`);
  for (let poging = 1; poging <= 3; poging++) {
    const resterend = authenticator.timeRemaining();
    if (resterend < 15) await new Promise((r) => setTimeout(r, (resterend + 1) * 1000));
    const code = authenticator.generate(E2E_WEB_ADMIN_TOTP_SECRET);
    const res2 = await page.request.post("/api/auth/2fa/verify", { data: { code } });
    if (res2.status() === 200) return;
    if (poging === 3) throw new Error("TOTP mislukt na 3 pogingen.");
    await new Promise((r) => setTimeout(r, 32_000));
  }
}

async function main(): Promise<void> {
  await setupE2eWebAdminAccount();
  const { execSync } = await import("node:child_process");
  let executablePath: string | undefined;
  try { executablePath = execSync("which chromium", { encoding: "utf8" }).trim() || undefined; } catch { /* bundled */ }

  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: "light",
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  await login(page);

  const doelen: Array<{ naam: string; pad: string; menuOpen?: boolean }> = [
    { naam: "crm-overzicht", pad: "/crm" },
    { naam: "crm-overzicht-menu", pad: "/crm", menuOpen: true },
  ];
  for (const d of doelen) {
    await page.goto(d.pad, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    if (d.menuOpen) {
      await page.getByTitle("Menu openen").click();
      await page.waitForTimeout(600);
    }
    await page.screenshot({ path: `${UIT}/${d.naam}.png` });
    console.log(`OK ${d.naam}`);
  }
  await browser.close();
}

main().catch((err) => { console.error(String(err?.message ?? err)); process.exit(1); });
