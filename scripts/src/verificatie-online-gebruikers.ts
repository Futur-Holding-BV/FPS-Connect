// Bewijsscript: online-lijst is database-gedragen (overleeft herstart).
// 1. Log in als e2e-webaccount.
// 2. Zet laatst_online van het e2e-adminaccount op nu (simuleert actieve collega).
// 3. GET /api/mijn/online-gebruikers → bevat die collega, niet jezelf.
// 4. Zet laatst_online 10 minuten terug → collega verdwijnt uit de lijst.
import {
  setupE2eWebAccount,
  setupE2eWebAdminAccount,
  archiveerE2eWebAccount,
  archiveerE2eWebAdminAccount,
  genereerVersWebTotp,
  E2E_WEB_EMAIL,
  E2E_WEB_WACHTWOORD,
  E2E_WEB_ADMIN_EMAIL,
} from "./e2e-monteur-testaccount";
import { db, gebruikersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}`;

class Sessie {
  private cookies = new Map<string, string>();
  async fetch(pad: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    if (typeof init?.body === "string") headers.set("Content-Type", "application/json");
    const cookie = [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    if (cookie) headers.set("Cookie", cookie);
    const res = await fetch(`${BASIS}${pad}`, { ...init, headers, redirect: "manual" });
    for (const sc of res.headers.getSetCookie()) {
      const [paar] = sc.split(";");
      const idx = paar.indexOf("=");
      if (idx > 0) this.cookies.set(paar.slice(0, idx).trim(), paar.slice(idx + 1).trim());
    }
    return res;
  }
}

function eis(v: boolean, stap: string, detail: string): void {
  if (!v) throw new Error(`FAIL — ${stap}: ${detail}`);
}

async function zetLaatstOnline(email: string, wanneer: Date): Promise<void> {
  await db.update(gebruikersTable).set({ laatstOnline: wanneer }).where(eq(gebruikersTable.email, email));
}

async function main(): Promise<void> {
  await setupE2eWebAccount();
  await setupE2eWebAdminAccount();
  const s = new Sessie();

  let res = await s.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: E2E_WEB_EMAIL, wachtwoord: E2E_WEB_WACHTWOORD }) });
  eis(res.status === 200, "login", `${res.status}`);
  res = await s.fetch("/api/auth/2fa/verify", { method: "POST", body: JSON.stringify({ code: await genereerVersWebTotp() }) });
  eis(res.status === 200, "2fa", `${res.status}`);
  console.log("STAP 0 PASS — ingelogd");

  // Collega actief (rechtstreeks in DB — bewijst dat de lijst uit de DB komt,
  // niet uit servergeheugen: dit proces heeft geen enkele request als admin gedaan).
  await zetLaatstOnline(E2E_WEB_ADMIN_EMAIL, new Date());
  let lijst = await (await s.fetch("/api/mijn/online-gebruikers")).json() as Array<{ naam: string }>;
  const adminNamen = lijst.map((g) => g.naam);
  eis(lijst.some((g) => g.naam.includes("E2E")), "stap 1", `collega ontbreekt: ${JSON.stringify(adminNamen)}`);
  console.log(`STAP 1 PASS — actieve collega zichtbaar zonder eigen serverproces-activiteit (${lijst.length} online)`);

  // Eigen account nooit in de lijst — ook niet als het net actief was (eigen
  // laatst_online staat op nu door de zojuist gedane requests).
  await zetLaatstOnline(E2E_WEB_EMAIL, new Date());
  lijst = await (await s.fetch("/api/mijn/online-gebruikers")).json() as Array<{ naam: string }>;
  eis(!lijst.some((g) => g.naam === "E2E Test Web"), "stap 2", `eigen account in lijst: ${JSON.stringify(lijst.map((g) => g.naam))}`);
  console.log("STAP 2 PASS — aanvrager zelf uitgesloten (op naam gecontroleerd)");

  // Gedeactiveerd (actief=false, niet gearchiveerd) account met recente
  // laatst_online mag NIET verschijnen.
  await zetLaatstOnline(E2E_WEB_ADMIN_EMAIL, new Date());
  await db.update(gebruikersTable).set({ actief: false }).where(eq(gebruikersTable.email, E2E_WEB_ADMIN_EMAIL));
  lijst = await (await s.fetch("/api/mijn/online-gebruikers")).json() as Array<{ naam: string }>;
  eis(!lijst.some((g) => g.naam.includes("E2E Test Web Beheerder")), "stap 2b", "gedeactiveerd account zichtbaar");
  await db.update(gebruikersTable).set({ actief: true }).where(eq(gebruikersTable.email, E2E_WEB_ADMIN_EMAIL));
  console.log("STAP 2b PASS — gedeactiveerd account onzichtbaar");

  // 10 minuten inactief → weg.
  await zetLaatstOnline(E2E_WEB_ADMIN_EMAIL, new Date(Date.now() - 10 * 60 * 1000));
  lijst = await (await s.fetch("/api/mijn/online-gebruikers")).json() as Array<{ naam: string }>;
  const nogAanwezig = lijst.filter((g) => g.naam.includes("E2E Test Web Beheerder"));
  eis(nogAanwezig.length === 0, "stap 3", "collega nog zichtbaar na 10 min inactiviteit");
  console.log("STAP 3 PASS — na 10 minuten inactiviteit offline");

  await archiveerE2eWebAccount();
  await archiveerE2eWebAdminAccount();
  console.log("ALLE STAPPEN PASS — online-lijst komt uit de database en overleeft server-herstarts.");
}

main().catch(async (err) => {
  console.error(String(err?.message ?? err));
  try { await archiveerE2eWebAccount(); await archiveerE2eWebAdminAccount(); } catch { /* best effort */ }
  process.exit(1);
});
