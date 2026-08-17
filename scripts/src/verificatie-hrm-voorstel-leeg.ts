// HRM AI-voorstellen — bewijsscript voor lege-voorstel-reparatie.
// Test via HTTP (nooit api-server-source importeren) + @workspace/db voor opzet.
// Draaien: pnpm --filter @workspace/scripts run tsx src/verificatie-hrm-voorstel-leeg.ts
import { authenticator } from "otplib";
import { eq, and } from "drizzle-orm";
import { db, medewerkersTable, hrmAiVoorstellenTable } from "@workspace/db";
import {
  setupE2eWebAdminAccount,
  E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET,
} from "./e2e-monteur-testaccount";

const BASIS = process.env.API_BASIS
  ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}/api` : "http://localhost:8080/api");

let geslaagd = 0;
let gefaald = 0;
function check(naam: string, conditie: boolean, detail?: string) {
  if (conditie) { geslaagd++; console.log(`  ✓ ${naam}`); }
  else { gefaald++; console.error(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

type Sessie = { cookie: string };

async function login(email: string, wachtwoord: string, totpSecret: string): Promise<Sessie> {
  const r1 = await fetch(`${BASIS}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, wachtwoord }),
  });
  const cookie = (r1.headers.get("set-cookie") ?? "").split(";")[0]!;
  const j1 = (await r1.json()) as { status?: string };
  if (j1.status === "verify_2fa" || j1.status === "setup_2fa") {
    const code = authenticator.generate(totpSecret);
    const r2 = await fetch(`${BASIS}/auth/2fa/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
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
  try { json = await r.json(); } catch { /* leeg */ }
  return { status: r.status, json };
}

async function main() {
  await setupE2eWebAdminAccount();
  const s = await login(E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET);

  // Opzet: testmedewerker met lege velden + stale signalering met 100% zekerheid
  const [mw] = await db.insert(medewerkersTable).values({
    naam: "Bewijs HRM-Leegvoorstel (tijdelijk)",
    email: `bewijs-hrm-leeg-${Date.now()}@fps.local`,
  }).returning();
  const mwId = mw!.id;

  const [stale] = await db.insert(hrmAiVoorstellenTable).values({
    medewerkerId: mwId,
    veld: "geboortedatum",
    voorgesteldeWaarde: null,
    reden: "Ontbrekend veld: Geboortedatum is nog niet ingevuld in het profiel",
    confidence: 1.0,
    vertrouwenScore: 1.0,
    status: "open",
    impact: "gemiddeld",
    modelGebruikt: "missingFieldScan",
  }).returning();
  const staleId = stale!.id;

  // Tweede stale scan-rij (ander veld) + document-voorstel op hetzelfde veld:
  // zelfheling moet álle scan-rijen helen en document-voorstellen ongemoeid laten.
  const [stale2] = await db.insert(hrmAiVoorstellenTable).values({
    medewerkerId: mwId,
    veld: "telefoon",
    voorgesteldeWaarde: null,
    reden: "Ontbrekend veld: Telefoonnummer is nog niet ingevuld in het profiel",
    confidence: 1.0,
    vertrouwenScore: 1.0,
    status: "open",
    impact: "gemiddeld",
    modelGebruikt: "missingFieldScan",
  }).returning();
  const [docVoorstel] = await db.insert(hrmAiVoorstellenTable).values({
    medewerkerId: mwId,
    veld: "geboortedatum",
    voorgesteldeWaarde: "1990-05-15",
    reden: "Aanvulling uit document",
    brondocument: "bewijs-doc.pdf",
    confidence: 0.8,
    vertrouwenScore: 0.8,
    status: "open",
    impact: "gemiddeld",
    modelGebruikt: "gpt-4o",
  }).returning();

  try {
    console.log("1) Goedkeuren zonder waarde -> 422");
    const r1 = await api(s, "PATCH", `/medewerkers/ai-voorstellen/${staleId}`, { status: "goedgekeurd" });
    check("PATCH goedgekeurd zonder waarde geeft 422", r1.status === 422, `status=${r1.status} ${JSON.stringify(r1.json)}`);
    const [na1] = await db.select().from(hrmAiVoorstellenTable).where(eq(hrmAiVoorstellenTable.id, staleId));
    check("voorstel blijft open na 422", na1?.status === "open", `status=${na1?.status}`);

    console.log("2) Heranalyse -> zelfheling zekerheid + nieuwe signaleringen zonder score");
    const r2 = await api(s, "POST", `/medewerkers/${mwId}/heranalyseer-dossier`, {});
    check("heranalyse ok", r2.status === 200, `status=${r2.status} ${JSON.stringify(r2.json)}`);
    const [na2] = await db.select().from(hrmAiVoorstellenTable).where(eq(hrmAiVoorstellenTable.id, staleId));
    check("stale signalering: confidence -> NULL", na2?.confidence == null, `confidence=${na2?.confidence}`);
    check("stale signalering: vertrouwen_score -> NULL", na2?.vertrouwenScore == null, `score=${na2?.vertrouwenScore}`);
    const [na2b] = await db.select().from(hrmAiVoorstellenTable).where(eq(hrmAiVoorstellenTable.id, stale2!.id));
    check("tweede stale scan-rij óók geheeld", na2b?.confidence == null && na2b?.vertrouwenScore == null, `c=${na2b?.confidence} s=${na2b?.vertrouwenScore}`);
    const [docNa] = await db.select().from(hrmAiVoorstellenTable).where(eq(hrmAiVoorstellenTable.id, docVoorstel!.id));
    check("document-voorstel behoudt eigen zekerheid (0.8)", docNa?.confidence === 0.8 && docNa?.vertrouwenScore === 0.8, `c=${docNa?.confidence} s=${docNa?.vertrouwenScore}`);
    const nieuwe = await db.select().from(hrmAiVoorstellenTable).where(
      and(eq(hrmAiVoorstellenTable.medewerkerId, mwId), eq(hrmAiVoorstellenTable.modelGebruikt, "missingFieldScan")),
    );
    check("nieuwe signaleringen hebben géén zekerheidsscore",
      nieuwe.length > 1 && nieuwe.every((v) => v.confidence == null && v.vertrouwenScore == null),
      JSON.stringify(nieuwe.map((v) => ({ veld: v.veld, c: v.confidence }))));

    console.log("3) Goedkeuren mét ingevulde waarde -> doorgevoerd");
    const r3 = await api(s, "PATCH", `/medewerkers/ai-voorstellen/${staleId}`, { status: "goedgekeurd", correctie_tekst: "1990-05-15" });
    check("PATCH met correctie_tekst geeft 200", r3.status === 200, `status=${r3.status} ${JSON.stringify(r3.json)}`);
    const [mwNa] = await db.select().from(medewerkersTable).where(eq(medewerkersTable.id, mwId));
    check("geboortedatum doorgevoerd op medewerker", String(mwNa?.geboortedatum ?? "").startsWith("1990-05-15"), `waarde=${mwNa?.geboortedatum}`);

    console.log("4) Afwijzen van lege signalering blijft mogelijk");
    const ander = nieuwe.find((v) => v.id !== staleId);
    if (ander) {
      const r4 = await api(s, "PATCH", `/medewerkers/ai-voorstellen/${ander.id}`, { status: "afgewezen" });
      check("PATCH afgewezen geeft 200", r4.status === 200, `status=${r4.status}`);
    } else {
      check("tweede signalering aanwezig voor afwijs-test", false);
    }
  } finally {
    await db.delete(hrmAiVoorstellenTable).where(eq(hrmAiVoorstellenTable.medewerkerId, mwId));
    await db.delete(medewerkersTable).where(eq(medewerkersTable.id, mwId));
  }

  console.log(`\nResultaat: ${geslaagd} geslaagd, ${gefaald} gefaald`);
  if (gefaald > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
