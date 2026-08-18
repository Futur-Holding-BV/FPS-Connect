// ADMINISTRATIE_01 fase 1+2 — bewijsscript. Test via HTTP (nooit
// api-server-source importeren) + @workspace/db voor controle/opruimen.
// Draaien: pnpm --filter @workspace/scripts run tsx src/verificatie-administratie01-fase12.ts
import "./lib/prodGuard";
import { authenticator } from "otplib";
import { eq, and, like } from "drizzle-orm";
import { db, gebruikersTable, werkgeversTable, werkgeverBankrekeningenTable, werkgeverBankrekeningLogsTable } from "@workspace/db";
import {
  setupE2eWebAccount, setupE2eWebAdminAccount,
  E2E_WEB_EMAIL, E2E_WEB_WACHTWOORD, E2E_WEB_TOTP_SECRET,
  E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET,
} from "./e2e-monteur-testaccount";

const BASIS = process.env.API_BASIS
  ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}/api` : "http://localhost:8080/api");

const TEST_IBAN = "NL91ABNA0417164300"; // geldig voorbeeld-IBAN
const FOUT_IBAN = "NL91ABNA0417164301"; // controlegetal klopt niet

let geslaagd = 0;
let gefaald = 0;
function check(naam: string, conditie: boolean, detail?: string) {
  if (conditie) { geslaagd++; console.log(`  ✓ ${naam}`); }
  else { gefaald++; console.error(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

type Sessie = { cookie: string };
async function login(email: string, wachtwoord: string, totpSecret: string): Promise<Sessie> {
  const r1 = await fetch(`${BASIS}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, wachtwoord }),
  });
  const cookie = (r1.headers.get("set-cookie") ?? "").split(";")[0]!;
  const j1 = (await r1.json()) as { status?: string };
  if (j1.status === "verify_2fa" || j1.status === "setup_2fa") {
    const code = authenticator.generate(totpSecret);
    const r2 = await fetch(`${BASIS}/auth/2fa/verify`, {
      method: "POST", headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ code }),
    });
    if (!r2.ok) throw new Error(`2fa verify faalde: ${r2.status} ${await r2.text()}`);
    const c2 = r2.headers.get("set-cookie");
    return { cookie: c2 ? c2.split(";")[0]! : cookie };
  }
  if (!r1.ok) throw new Error(`login faalde: ${r1.status} ${JSON.stringify(j1)}`);
  return { cookie };
}
async function api(s: Sessie, methode: string, pad: string, body?: unknown) {
  const r = await fetch(`${BASIS}${pad}`, {
    method: methode,
    headers: { "Content-Type": "application/json", cookie: s.cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: unknown = null;
  try { json = await r.json(); } catch { /* leeg (204) */ }
  return { status: r.status, json };
}

type WgResp = { id: number; naam: string; iban: string | null; bankrekeningen: Array<{ id: number; iban: string; tenaamstelling: string; doelen: string[] }> };

async function opruimen(werkgeverId: number) {
  await db.delete(werkgeverBankrekeningenTable).where(and(
    eq(werkgeverBankrekeningenTable.werkgeverId, werkgeverId),
    eq(werkgeverBankrekeningenTable.iban, TEST_IBAN),
  ));
  await db.delete(werkgeverBankrekeningLogsTable).where(eq(werkgeverBankrekeningLogsTable.werkgeverId, werkgeverId));
}

async function main() {
  console.log("— ADMINISTRATIE_01 fase 1+2 bewijsscript —");
  await setupE2eWebAccount();
  await setupE2eWebAdminAccount();

  const admin = await login(E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET);

  // Het standaard web-e2e-account heeft ALLE modules op niveau 4; voor de
  // Financieel-4-toets zetten we de matrix tijdelijk op financieel:3 en
  // herstellen we hem na afloop (bevoegdheden worden per request live gelezen).
  const [webAccount] = await db.select({ id: gebruikersTable.id, bevoegdheden: gebruikersTable.bevoegdheden })
    .from(gebruikersTable).where(eq(gebruikersTable.email, E2E_WEB_EMAIL));
  if (!webAccount) throw new Error("web-e2e-account ontbreekt");
  const origineleBevoegdheden = webAccount.bevoegdheden;
  await db.update(gebruikersTable).set({ bevoegdheden: { financieel: 3, personeel: 2 } })
    .where(eq(gebruikersTable.id, webAccount.id));
  const veld = await login(E2E_WEB_EMAIL, E2E_WEB_WACHTWOORD, E2E_WEB_TOTP_SECRET);

  // Twee werkmaatschappijen nodig voor de cross-BV-toets.
  const lijst1 = await api(admin, "GET", "/werkgevers");
  const wgs = lijst1.json as WgResp[];
  check("GET /werkgevers geeft bankrekeningen-array", lijst1.status === 200 && Array.isArray(wgs) && wgs.every((w) => Array.isArray(w.bankrekeningen)));
  if (wgs.length < 2) throw new Error("Minimaal 2 werkgevers nodig in dev-DB");
  const doelWg = wgs[0]!;
  const andereWg = wgs[1]!;
  await opruimen(doelWg.id);

  // 1. Ongeldig IBAN fail-closed
  const r400 = await api(admin, "POST", `/werkgevers/${doelWg.id}/bankrekeningen`, {
    iban: FOUT_IBAN, tenaamstelling: "Test BV", doelen: ["ontvangst"],
  });
  check("ongeldig IBAN → 400", r400.status === 400, `status ${r400.status}`);

  // 2. Zonder doel fail-closed
  const rDoel = await api(admin, "POST", `/werkgevers/${doelWg.id}/bankrekeningen`, {
    iban: TEST_IBAN, tenaamstelling: "Test BV", doelen: [],
  });
  check("zonder doelen → 400", rDoel.status === 400, `status ${rDoel.status}`);

  // 3. Zonder Financieel-4 geen mutatie (veldaccount)
  const r403 = await api(veld, "POST", `/werkgevers/${doelWg.id}/bankrekeningen`, {
    iban: TEST_IBAN, tenaamstelling: "Test BV", doelen: ["ontvangst"],
  });
  check("zonder Financieel niveau 4 → 403", r403.status === 403, `status ${r403.status}`);
  await db.update(gebruikersTable).set({ bevoegdheden: origineleBevoegdheden })
    .where(eq(gebruikersTable.id, webAccount.id));

  // 4. Geldige toevoeging (met spaties/kleine letters → normalisatie)
  const r201 = await api(admin, "POST", `/werkgevers/${doelWg.id}/bankrekeningen`, {
    iban: "nl91 abna 0417 1643 00", tenaamstelling: "Test BV", doelen: ["ontvangst", "loon"],
  });
  const rek = r201.json as { id: number; iban: string };
  check("geldige rekening → 201 + genormaliseerd IBAN", r201.status === 201 && rek.iban === TEST_IBAN, JSON.stringify(r201.json));

  // 4b. Tweede rekening met een al toegewezen doel → 409 (doel-uniek per BV)
  const rDoelDubbel = await api(admin, "POST", `/werkgevers/${doelWg.id}/bankrekeningen`, {
    iban: "NL20INGB0001234567", tenaamstelling: "Test BV 2", doelen: ["ontvangst"],
  });
  check("doel al toegewezen → 409", rDoelDubbel.status === 409, `status ${rDoelDubbel.status} ${JSON.stringify(rDoelDubbel.json)}`);

  // 5. Dubbel IBAN → 409
  const r409 = await api(admin, "POST", `/werkgevers/${doelWg.id}/bankrekeningen`, {
    iban: TEST_IBAN, tenaamstelling: "Test BV", doelen: ["crediteuren"],
  });
  check("dubbel IBAN → 409", r409.status === 409, `status ${r409.status}`);

  // 6. Afgeleid iban-veld = ontvangstrekening van déze WM; andere WM onaangetast
  const na = await api(admin, "GET", "/werkgevers");
  const naWgs = na.json as WgResp[];
  const naDoel = naWgs.find((w) => w.id === doelWg.id)!;
  const naAndere = naWgs.find((w) => w.id === andereWg.id)!;
  check("iban afgeleid uit ontvangstrekening", naDoel.iban === TEST_IBAN, `iban=${naDoel.iban}`);
  check("andere WM pakt nooit dit nummer", naAndere.iban !== TEST_IBAN && !naAndere.bankrekeningen.some((r) => r.iban === TEST_IBAN));

  // 7. PATCH op werkgever met iban-veld wordt genegeerd (geen Fin4-omzeiling)
  const rOmzeil = await api(admin, "PATCH", `/werkgevers/${andereWg.id}`, { iban: TEST_IBAN });
  const omzeilWg = rOmzeil.json as WgResp;
  check("iban via PATCH /werkgevers genegeerd", rOmzeil.status === 200 && omzeilWg.iban !== TEST_IBAN, `iban=${omzeilWg?.iban}`);

  // 8. Wijzigen + verwijderen, en logregels aanwezig (wie/wanneer/wat)
  const rPatch = await api(admin, "PATCH", `/werkgevers/${doelWg.id}/bankrekeningen/${rek.id}`, {
    iban: TEST_IBAN, tenaamstelling: "Test BV (gewijzigd)", doelen: ["ontvangst", "loon", "crediteuren"],
  });
  check("PATCH rekening → 200", rPatch.status === 200, `status ${rPatch.status}`);
  const rDel = await api(admin, "DELETE", `/werkgevers/${doelWg.id}/bankrekeningen/${rek.id}`);
  check("DELETE rekening → 204", rDel.status === 204, `status ${rDel.status}`);

  const logs = await db.select().from(werkgeverBankrekeningLogsTable)
    .where(eq(werkgeverBankrekeningLogsTable.werkgeverId, doelWg.id));
  const acties = logs.map((l) => l.actie).sort();
  check("logregels toegevoegd/gewijzigd/verwijderd aanwezig",
    acties.includes("toegevoegd") && acties.includes("gewijzigd") && acties.includes("verwijderd"),
    JSON.stringify(acties));
  check("logregels dragen gebruikersnaam", logs.every((l) => !!l.gebruikerNaam), JSON.stringify(logs.map((l) => l.gebruikerNaam)));

  await opruimen(doelWg.id);
  console.log(`\nResultaat: ${geslaagd} geslaagd, ${gefaald} gefaald`);
  if (gefaald > 0) process.exit(1);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
