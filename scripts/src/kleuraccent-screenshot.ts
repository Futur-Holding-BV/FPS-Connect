// Schermafdrukken KLEURACCENT_01 (desktopbreedte, licht schema).
import { chromium, type Page } from "@playwright/test";
import { authenticator } from "otplib";
import {
  E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_TOTP_SECRET, E2E_WEB_ADMIN_WACHTWOORD,
  setupE2eWebAdminAccount,
} from "./e2e-monteur-testaccount";

const devDomain = process.env.REPLIT_DEV_DOMAIN ?? "localhost:80";
const baseURL = devDomain.startsWith("http") ? devDomain : `https://${devDomain}`;
const GEBOUW_ID = process.env.GEBOUW_ID ?? "1";

async function login(page: Page) {
  const r1 = await page.request.post("/api/auth/login", { data: { email: E2E_WEB_ADMIN_EMAIL, wachtwoord: E2E_WEB_ADMIN_WACHTWOORD } });
  if (r1.status() !== 200) throw new Error(`Login: ${r1.status()}`);
  for (let p = 1; p <= 3; p++) {
    const rest = authenticator.timeRemaining();
    if (rest < 15) await new Promise((r) => setTimeout(r, (rest + 1) * 1000));
    const r2 = await page.request.post("/api/auth/2fa/verify", { data: { code: authenticator.generate(E2E_WEB_ADMIN_TOTP_SECRET) } });
    if (r2.status() === 200) return;
    if (p === 3) throw new Error("TOTP mislukt");
    await new Promise((r) => setTimeout(r, 32_000));
  }
}

async function main() {
  await setupE2eWebAdminAccount();
  const { execSync } = await import("node:child_process");
  let executablePath: string | undefined;
  try { executablePath = execSync("which chromium", { encoding: "utf8" }).trim() || undefined; } catch { /* bundled */ }
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const ctx = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, colorScheme: (process.env.SCHEMA === "donker" ? "dark" : "light"), ignoreHTTPSErrors: true });
  if (process.env.SCHEMA === "donker") {
    await ctx.addInitScript(() => {
      localStorage.setItem("fps.weergave", JSON.stringify({ thema: "donker" }));
    });
  }
  const page = await ctx.newPage();
  await login(page);
  const doelen = [
    { naam: "crm-overzicht", pad: "/crm" },
    { naam: "gebouw-detail", pad: `/gebouwen/${GEBOUW_ID}` },
    { naam: "personeel", pad: "/personeel" },
  ];
  for (const d of doelen) {
    await page.goto(d.pad, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `/tmp/kleuraccent/${d.naam}.png` });
    console.log(`OK ${d.naam}`);
  }
  await browser.close();
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
