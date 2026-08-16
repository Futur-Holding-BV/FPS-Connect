// Bewijs: bedrijfsgegevens werken door in andere modules
// A: SCAB-mailconcept valt terug op boekhouder_email als scab_email_adres leeg is
// B: ondertekening van de fallback-mail gebruikt werkgevernaam + intern aanspreekpunt
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-bedrijfsgegevens-doorwerking.ts
import { authenticator } from "otplib";
import { eq } from "drizzle-orm";
import { db, werkgeversTable } from "@workspace/db";
import {
  setupE2eWachtwoordAccounts,
  E2E_WW_ADMIN_EMAIL,
  E2E_WW_ADMIN_WACHTWOORD,
  E2E_WW_ADMIN_TOTP_SECRET,
} from "./e2e-wachtwoord-testaccounts";

const BASE = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
let cookie = "";
let geslaagd = 0;
let mislukt = 0;

function check(naam: string, ok: boolean, detail?: string) {
  if (ok) { geslaagd++; console.log(`  ✓ ${naam}`); }
  else { mislukt++; console.log(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

async function api(pad: string, init: RequestInit = {}): Promise<Response> {
  const resp = await fetch(`${BASE}${pad}`, {
    ...init,
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), cookie, ...(init.headers ?? {}) },
  });
  const setCookie = resp.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  return resp;
}

async function main() {
  await setupE2eWachtwoordAccounts();
  const r1 = await api("/auth/login", { method: "POST", body: JSON.stringify({ email: E2E_WW_ADMIN_EMAIL, wachtwoord: E2E_WW_ADMIN_WACHTWOORD }) });
  if (!r1.ok) throw new Error(`login faalde: ${r1.status}`);
  const r2 = await api("/auth/2fa/verify", { method: "POST", body: JSON.stringify({ code: authenticator.generate(E2E_WW_ADMIN_TOTP_SECRET) }) });
  if (!r2.ok) throw new Error(`2fa faalde: ${r2.status}`);
  console.log("Ingelogd als e2e-hoofdbeheerder\n");

  // Wegwerp-testwerkgever met alleen boekhouder + intern contact (geen scab-adres)
  const [wg] = await db.insert(werkgeversTable).values({
    naam: "Bewijs Doorwerking BV",
    actief: false,
    boekhouderNaam: "T. Teller",
    boekhouderEmail: "boekhouder@fps.local",
    internContactNaam: "I. Intern",
    internContactEmail: "intern@fps.local",
  }).returning({ id: werkgeversTable.id });

  try {
    console.log("Bewijs A+B: SCAB-concept gebruikt boekhouder_email + intern aanspreekpunt");
    const resp = await api("/scab-mails/genereer", {
      method: "POST",
      body: JSON.stringify({ werkmaatschappij: "Bewijs Doorwerking BV", werkgever_id: wg.id, periode_jaar: 2026, periode_maand: 8 }),
    });
    check("concept aangemaakt", resp.ok, String(resp.status));
    const mail = await resp.json() as { id: number; scab_email_adres?: string | null; scabEmailAdres?: string | null; inhoud: string; contactpersoon?: string | null };
    const ontvanger = mail.scab_email_adres ?? mail.scabEmailAdres ?? null;
    check("ontvanger = boekhouder_email (fallback)", ontvanger === "boekhouder@fps.local", String(ontvanger));
    check("contactpersoon = boekhouder_naam", (mail.contactpersoon ?? null) === "T. Teller", String(mail.contactpersoon));
    check("ondertekening bevat werkgevernaam", mail.inhoud.includes("Bewijs Doorwerking BV"), mail.inhoud.slice(-160));
    check("ondertekening bevat intern aanspreekpunt", mail.inhoud.includes("I. Intern") && mail.inhoud.includes("intern@fps.local"), mail.inhoud.slice(-160));
    check("geen hardcoded FPS Bouw en Renovatie-ondertekening", !mail.inhoud.includes("FPS Bouw en Renovatie"));
  } finally {
    // Opruimen: concept-mails + testwerkgever
    const { scabMailsTable } = await import("@workspace/db");
    await db.delete(scabMailsTable).where(eq(scabMailsTable.werkgeverId, wg.id));
    await db.delete(werkgeversTable).where(eq(werkgeversTable.id, wg.id));
  }

  console.log(`\nResultaat: ${geslaagd} geslaagd, ${mislukt} mislukt`);
  process.exit(mislukt === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
