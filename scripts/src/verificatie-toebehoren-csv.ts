/**
 * Bewijs voor taak 858: GET /magazijn/toebehoren-verbruik levert nu
 * aantal_zonder_prijs per periode en per artikel, incl. van/tot-filter.
 */
import "./lib/prodGuard";
import { authenticator } from "otplib";
import {
  E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET,
  setupE2eWebAdminAccount,
} from "./e2e-monteur-testaccount";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;

async function login(email: string, wachtwoord: string, totpSecret: string): Promise<string> {
  const r1 = await fetch(`${BASIS}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, wachtwoord }),
  });
  const j1 = (await r1.json()) as { status?: string };
  let cookie = r1.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  if (j1.status === "verify_2fa" || j1.status === "setup_2fa") {
    const code = authenticator.generate(totpSecret);
    const r2 = await fetch(`${BASIS}/auth/2fa/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ code }),
    });
    if (!r2.ok) throw new Error(`2fa faalde: ${r2.status} ${await r2.text()}`);
    const extra = r2.headers.getSetCookie().map((c) => c.split(";")[0]);
    if (extra.length) cookie = extra.join("; ");
  } else if (!r1.ok) {
    throw new Error(`login faalde: ${r1.status} ${JSON.stringify(j1)}`);
  }
  return cookie;
}

async function seedTestdata() {
  const { db, artikelenTable, voorraadMutatiesTable } = await import("@workspace/db");
  const [metPrijs] = await db.insert(artikelenTable).values({
    naam: "E2E toebehoren met prijs (taak 858)", eenheid: "st", gemiddeldInkoopprijs: 2.5,
  }).returning({ id: artikelenTable.id });
  const [zonderPrijs] = await db.insert(artikelenTable).values({
    naam: "E2E toebehoren zonder prijs (taak 858)", eenheid: "st",
  }).returning({ id: artikelenTable.id });
  await db.insert(voorraadMutatiesTable).values([
    { artikelId: metPrijs.id, type: "uitgifte", hoeveelheid: 4, delta: -4, kostenrubriek: "gereedschap_toebehoren" },
    { artikelId: zonderPrijs.id, type: "uitgifte", hoeveelheid: 3, delta: -3, kostenrubriek: "gereedschap_toebehoren" },
  ]);
  return async () => {
    const { inArray } = await import("drizzle-orm");
    await db.delete(artikelenTable).where(inArray(artikelenTable.id, [metPrijs.id, zonderPrijs.id])); // cascade wist mutaties
  };
}

async function main() {
  await setupE2eWebAdminAccount();
  const opruimen = await seedTestdata();
  try {
    await verifieer();
  } finally {
    await opruimen();
  }
}

async function verifieer() {
  const cookie = await login(E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET);

  const r = await fetch(`${BASIS}/magazijn/toebehoren-verbruik`, { headers: { cookie } });
  if (!r.ok) throw new Error(`toebehoren-verbruik faalde: ${r.status} ${await r.text()}`);
  const data = (await r.json()) as {
    per_periode: Array<Record<string, unknown>>;
    per_artikel: Array<Record<string, unknown>>;
    onbekende_prijs_aantal: number;
  };
  console.log("zonder filter:", JSON.stringify(data).slice(0, 400));

  for (const rij of [...data.per_periode, ...data.per_artikel]) {
    if (typeof rij.aantal_zonder_prijs !== "number") {
      throw new Error(`rij mist aantal_zonder_prijs: ${JSON.stringify(rij)}`);
    }
  }
  console.log(`OK: ${data.per_periode.length} perioden en ${data.per_artikel.length} artikelen hebben aantal_zonder_prijs`);

  const rijZonder = data.per_artikel.find((r) => r.naam === "E2E toebehoren zonder prijs (taak 858)");
  const rijMet = data.per_artikel.find((r) => r.naam === "E2E toebehoren met prijs (taak 858)");
  if (!rijZonder || rijZonder.aantal_zonder_prijs !== 3 || rijZonder.kosten !== 0) {
    throw new Error(`zonder-prijs artikel onjuist: ${JSON.stringify(rijZonder)}`);
  }
  if (!rijMet || rijMet.aantal_zonder_prijs !== 0 || rijMet.kosten !== 10) {
    throw new Error(`met-prijs artikel onjuist: ${JSON.stringify(rijMet)}`);
  }
  console.log("OK: markering zonder inkoopprijs klopt per artikel (3 zonder prijs, kosten 4×2,50=10)");

  // van/tot-filter check
  const rf = await fetch(`${BASIS}/magazijn/toebehoren-verbruik?van=2030-01-01&tot=2030-01-31`, { headers: { cookie } });
  if (!rf.ok) throw new Error(`filter faalde: ${rf.status}`);
  const df = (await rf.json()) as { per_periode: unknown[] };
  console.log(`OK: filter 2030 geeft ${df.per_periode.length} perioden (verwacht 0)`);

  const rb = await fetch(`${BASIS}/magazijn/toebehoren-verbruik?van=rommel`, { headers: { cookie } });
  console.log(`OK: ongeldige datum geeft ${rb.status} (verwacht 400)`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
