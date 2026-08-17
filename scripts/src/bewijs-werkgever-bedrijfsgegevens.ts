// Bewijs: PATCH /werkgevers/:id bewaart boekhouder/loonaanlever/intern-contactvelden
// A: zetten via PATCH komt gevuld terug én blijft staan bij herladen (GET)
// B: expliciet null maakt de velden weer leeg
// C: weggelaten velden blijven onaangeraakt (PATCH-semantiek)
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-werkgever-bedrijfsgegevens.ts
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

  const [wg] = await db.insert(werkgeversTable).values({
    naam: `Bewijs Bedrijfsgegevens BV ${Date.now()}`,
  }).returning({ id: werkgeversTable.id });

  try {
    console.log("A: velden zetten via PATCH");
    const rZet = await api(`/werkgevers/${wg.id}`, { method: "PATCH", body: JSON.stringify({
      boekhouder_naam: "Kruders & Weda",
      boekhouder_email: "loon@krudersweda.nl",
      scab_email_adres: "aanlevering@voorbeeld.nl",
      intern_contact_naam: "Intern Contact",
      intern_contact_email: "intern@voorbeeld.nl",
    }) });
    check("PATCH = 200", rZet.status === 200, String(rZet.status));
    const gezet = await rZet.json() as any;
    check("respons bevat de gezette velden", gezet.boekhouder_naam === "Kruders & Weda" && gezet.boekhouder_email === "loon@krudersweda.nl" && gezet.scab_email_adres === "aanlevering@voorbeeld.nl" && gezet.intern_contact_naam === "Intern Contact" && gezet.intern_contact_email === "intern@voorbeeld.nl", JSON.stringify(gezet).slice(0, 200));
    const naLaden = (await (await api("/werkgevers")).json() as any[]).find((w) => w.id === wg.id);
    check("velden blijven staan bij herladen (GET)", naLaden?.boekhouder_naam === "Kruders & Weda" && naLaden?.scab_email_adres === "aanlevering@voorbeeld.nl");

    console.log("\nC: weggelaten velden blijven onaangeraakt");
    const rDeel = await api(`/werkgevers/${wg.id}`, { method: "PATCH", body: JSON.stringify({ telefoon: "0612345678" }) });
    const deel = await rDeel.json() as any;
    check("boekhouder-velden onaangeraakt na PATCH zonder die velden", deel.boekhouder_naam === "Kruders & Weda" && deel.scab_email_adres === "aanlevering@voorbeeld.nl", JSON.stringify({ b: deel.boekhouder_naam, s: deel.scab_email_adres }));

    console.log("\nB: expliciet null maakt leeg");
    const rLeeg = await api(`/werkgevers/${wg.id}`, { method: "PATCH", body: JSON.stringify({
      boekhouder_naam: null, boekhouder_email: null, scab_email_adres: null,
      intern_contact_naam: null, intern_contact_email: null,
    }) });
    const leeg = await rLeeg.json() as any;
    check("alle vijf velden weer null", [leeg.boekhouder_naam, leeg.boekhouder_email, leeg.scab_email_adres, leeg.intern_contact_naam, leeg.intern_contact_email].every((v) => v === null), JSON.stringify(leeg).slice(0, 200));
  } finally {
    await db.delete(werkgeversTable).where(eq(werkgeversTable.id, wg.id));
  }

  console.log(`\nResultaat: ${geslaagd} geslaagd, ${mislukt} mislukt`);
  if (mislukt > 0) process.exit(1);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
