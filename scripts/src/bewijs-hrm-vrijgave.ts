// Bewijs: RECHTEN_HRM_02 §4 — Poortwachter twee-stapsvrijgave (vier-ogen).
//
//  1. Direct afronden via PATCH is geblokkeerd (422)
//  2. Klaarzetten (personeel:2) zet klaargezet_op/door; dubbel klaarzetten 409
//  3. Vrijgeven door dezelfde persoon die klaarzette → 403 (vier-ogen)
//  4. Vrijgeven zonder hrm_vrijgave-bevoegdheid → 403 (middleware)
//  5. Vrijgeven door een ánder mét hrm_vrijgave:3 → afgerond + vrijgegeven_door
//  6. Terugsturen: reden verplicht (422); met reden → terug naar klaarzet-stap,
//     reden + terugstuurder zichtbaar; opnieuw klaarzetten wist de reden
//  7. Profielen: HRM-adviseur gebruikers=1 + hrm_vrijgave=3; Directie hrm_vrijgave=3
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-hrm-vrijgave.ts

import "./lib/prodGuard";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import { eq, inArray, sql } from "drizzle-orm";
import {
  db,
  gebruikersTable,
  medewerkersTable,
  ziekmeldingenTable,
} from "@workspace/db";

const BASE = process.env.BEWIJS_API_BASIS
  ? process.env.BEWIJS_API_BASIS.replace(/\/api\/?$/, "")
  : `https://${process.env.REPLIT_DEV_DOMAIN}`;

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: bewijsscript draait alleen in dev.");
}

let checks = 0;
let fouten = 0;
function check(naam: string, conditie: boolean, detail?: unknown): void {
  checks += 1;
  if (conditie) console.log(`  ✓ ${naam}`);
  else { fouten += 1; console.error(`  ✗ ${naam}`, detail ?? ""); }
}

type Mijlpaal = {
  type: string;
  status: string;
  klaargezet_op: string | null;
  klaargezet_door_naam: string | null;
  vrijgegeven_door_naam: string | null;
  teruggestuurd_reden: string | null;
  teruggestuurd_door_naam: string | null;
};

async function maakGebruiker(naam: string, email: string, bevoegdheden: Record<string, number>) {
  const wachtwoord = "BewijsHrm2!2026";
  const hash = await bcrypt.hash(wachtwoord, 10);
  const totp = authenticator.generateSecret();
  const [g] = await db.insert(gebruikersTable)
    .values({ naam, email, wachtwoord: hash, rol: "gebruiker", actief: true, tweeFactorIngeschakeld: true, totpSecret: totp, bevoegdheden })
    .onConflictDoUpdate({ target: gebruikersTable.email, set: { naam, wachtwoord: hash, rol: "gebruiker", actief: true, tweeFactorIngeschakeld: true, totpSecret: totp, bevoegdheden } })
    .returning();
  const res = await fetch(`${BASE}/api/auth/mobile/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, wachtwoord, code: authenticator.generate(totp) }),
  });
  const tekst = await res.text();
  let json: { token?: string };
  try {
    json = JSON.parse(tekst) as { token?: string };
  } catch {
    throw new Error(`Login ${email}: geen JSON (status ${res.status}): ${tekst.slice(0, 200)}`);
  }
  if (!res.ok || !json.token) throw new Error(`Login mislukt voor ${email}: ${res.status}`);
  return { id: g.id, naam, headers: { "Content-Type": "application/json", Authorization: `Bearer ${json.token}` } };
}

async function main(): Promise<void> {
  // Twee HRM-medewerkers (personeel:2) waarvan één óók vrijgever (Ans),
  // één pure vrijgever zonder personeel-schrijfrecht is niet nodig; en één
  // gebruiker zonder hrm_vrijgave (Bert) om de middleware-403 te bewijzen.
  const ans = await maakGebruiker("Bewijs Ans (klaarzetter+vrijgever)", "bewijs-hrm-ans@fps.local", { personeel: 2, hrm_vrijgave: 3 });
  const bert = await maakGebruiker("Bewijs Bert (klaarzetter)", "bewijs-hrm-bert@fps.local", { personeel: 2 });
  const carla = await maakGebruiker("Bewijs Carla (vrijgever)", "bewijs-hrm-carla@fps.local", { personeel: 1, hrm_vrijgave: 3 });

  const [mw] = await db.insert(medewerkersTable)
    .values({ naam: "Bewijs Zieke Medewerker HRM02" })
    .returning();
  const [zm] = await db.insert(ziekmeldingenTable)
    .values({ medewerkerId: mw.id, startDatum: "2026-08-01" })
    .returning();

  try {
    // Dossier idempotent aanmaken
    const dosRes = await fetch(`${BASE}/api/hrm/ziekmeldingen/${zm.id}/poortwachter`, { headers: ans.headers });
    const dosTekst = await dosRes.text();
    let dossier: { id: number; mijlpalen: Mijlpaal[] };
    try {
      dossier = JSON.parse(dosTekst) as { id: number; mijlpalen: Mijlpaal[] };
    } catch {
      throw new Error(`Dossier-GET: geen JSON (status ${dosRes.status}): ${dosTekst.slice(0, 200)}`);
    }
    check("dossier aangemaakt met 7 mijlpalen", dosRes.ok && dossier.mijlpalen.length === 7, dossier);

    const t1 = dossier.mijlpalen[0].type;
    const t2 = dossier.mijlpalen[1].type;
    const url = (type: string, actie = "") => `${BASE}/api/hrm/poortwachter/${dossier.id}/mijlpalen/${type}${actie}`;
    const post = async (h: Record<string, string>, type: string, actie: string, body?: unknown) => {
      const res = await fetch(url(type, actie), { method: "POST", headers: h, body: body ? JSON.stringify(body) : undefined });
      const tekst = await res.text();
      try {
        return { status: res.status, json: JSON.parse(tekst) as Mijlpaal & { error?: string } };
      } catch {
        throw new Error(`POST ${type}${actie}: geen JSON (status ${res.status}): ${tekst.slice(0, 200)}`);
      }
    };

    // 1. Direct afronden geblokkeerd
    const p1 = await fetch(url(t1), { method: "PATCH", headers: ans.headers, body: JSON.stringify({ afgerond: true }) });
    check("PATCH afgerond:true → 422 (direct afronden vervallen)", p1.status === 422, p1.status);
    const p2 = await fetch(url(t1), { method: "PATCH", headers: ans.headers, body: JSON.stringify({ notitie: "Rapport bedrijfsarts ontvangen" }) });
    check("PATCH notitie blijft werken (200)", p2.status === 200, p2.status);

    // 2. Klaarzetten door Ans
    const k1 = await post(ans.headers, t1, "/klaarzetten");
    check("klaarzetten → 200, klaargezet door Ans, status niet afgerond", k1.status === 200 && !!k1.json.klaargezet_op && k1.json.klaargezet_door_naam === ans.naam && k1.json.status !== "afgerond", k1);
    const k1b = await post(ans.headers, t1, "/klaarzetten");
    check("dubbel klaarzetten → 409", k1b.status === 409, k1b.status);

    // 3. Vier-ogen: Ans (zelf klaargezet) mag niet vrijgeven
    const v1 = await post(ans.headers, t1, "/vrijgeven");
    check("vrijgeven door klaarzetter zelf → 403 (vier-ogen)", v1.status === 403, v1);

    // 4. Bert (geen hrm_vrijgave) → 403 middleware
    const v2 = await post(bert.headers, t1, "/vrijgeven");
    check("vrijgeven zonder hrm_vrijgave-bevoegdheid → 403", v2.status === 403, v2.status);

    // 5. Carla geeft vrij → afgerond
    const v3 = await post(carla.headers, t1, "/vrijgeven");
    check("vrijgeven door ander mét bevoegdheid → afgerond, namen zichtbaar", v3.status === 200 && v3.json.status === "afgerond" && v3.json.vrijgegeven_door_naam === carla.naam && v3.json.klaargezet_door_naam === ans.naam, v3);
    const v3b = await post(carla.headers, t1, "/vrijgeven");
    check("nogmaals vrijgeven → 409 (al afgerond)", v3b.status === 409, v3b.status);

    // 6. Terugsturen-flow op mijlpaal 2 (Bert zet klaar, Carla stuurt terug)
    const k2 = await post(bert.headers, t2, "/klaarzetten", { notitie: "PvA concept klaar" });
    check("klaarzetten door Bert (incl. notitie) → 200", k2.status === 200 && k2.json.klaargezet_door_naam === bert.naam, k2);
    const ts0 = await post(carla.headers, t2, "/terugsturen", {});
    check("terugsturen zonder reden → 422", ts0.status === 422, ts0.status);
    const ts1 = await post(carla.headers, t2, "/terugsturen", { reden: "PvA mist handtekening medewerker" });
    check("terugsturen met reden → terug naar klaarzet-stap, reden+namen zichtbaar", ts1.status === 200 && !ts1.json.klaargezet_op && ts1.json.teruggestuurd_reden === "PvA mist handtekening medewerker" && ts1.json.teruggestuurd_door_naam === carla.naam && ts1.json.klaargezet_door_naam === bert.naam, ts1);
    const k3 = await post(bert.headers, t2, "/klaarzetten");
    check("opnieuw klaarzetten wist terugstuurreden", k3.status === 200 && !!k3.json.klaargezet_op && k3.json.teruggestuurd_reden == null, k3);
    const v4 = await post(carla.headers, t2, "/vrijgeven");
    check("tweede mijlpaal vrijgegeven door Carla", v4.status === 200 && v4.json.status === "afgerond", v4);

    // 7. Race: twee gelijktijdige vrijgaven op mijlpaal 3 → precies één 200
    const t3 = dossier.mijlpalen[2].type;
    await post(bert.headers, t3, "/klaarzetten");
    const [ra, rb] = await Promise.all([
      post(ans.headers, t3, "/vrijgeven"),
      post(carla.headers, t3, "/vrijgeven"),
    ]);
    const codes = [ra.status, rb.status].sort();
    check("gelijktijdig vrijgeven: precies één 200, ander 409", codes[0] === 200 && codes[1] === 409, codes);
    const winnaar = ra.status === 200 ? ra : rb;
    check("winnaar-audit intact (klaarzetter Bert + één vrijgever)", winnaar.json.klaargezet_door_naam === bert.naam && !!winnaar.json.vrijgegeven_door_naam, winnaar.json);
    // Vrijgeven vs. klaarzetten-ongedaan tegelijk op mijlpaal 4 → nooit allebei
    const t4 = dossier.mijlpalen[3].type;
    await post(bert.headers, t4, "/klaarzetten");
    const [rv, ro] = await Promise.all([
      post(carla.headers, t4, "/vrijgeven"),
      post(bert.headers, t4, "/klaarzetten-ongedaan"),
    ]);
    check("vrijgeven vs. ongedaan: precies één slaagt", [rv.status, ro.status].filter((s) => s === 200).length === 1, { rv: rv.status, ro: ro.status });
    const eind = rv.status === 200 ? rv.json : null;
    if (eind) check("afgeronde mijlpaal behoudt klaarzetter (audit niet gewist)", eind.klaargezet_door_naam === bert.naam, eind);

    // 8. Profielen-check
    const profielen = await db.execute(sql`
      SELECT naam, bevoegdheden->>'gebruikers' AS g, bevoegdheden->>'hrm_vrijgave' AS hv
      FROM profielen WHERE systeem = true AND naam IN ('HRM-adviseur','Directie')`);
    const rows = profielen.rows as { naam: string; g: string | null; hv: string | null }[];
    const hrm = rows.find((r) => r.naam === "HRM-adviseur");
    const dir = rows.find((r) => r.naam === "Directie");
    check("profiel HRM-adviseur: gebruikers=1, hrm_vrijgave=3", hrm?.g === "1" && hrm?.hv === "3", hrm);
    check("profiel Directie: hrm_vrijgave=3", dir?.hv === "3", dir);
  } finally {
    // Opruimen (dossier + mijlpalen cascaden mee met ziekmelding? nee: dossier
    // hangt aan ziekmelding met eigen FK; verwijder expliciet via SQL)
    await db.execute(sql`DELETE FROM poortwachter_dossiers WHERE ziekmelding_id = ${zm.id}`);
    await db.delete(ziekmeldingenTable).where(eq(ziekmeldingenTable.id, zm.id));
    await db.delete(medewerkersTable).where(eq(medewerkersTable.id, mw.id));
    await db.delete(gebruikersTable).where(inArray(gebruikersTable.email, [
      "bewijs-hrm-ans@fps.local", "bewijs-hrm-bert@fps.local", "bewijs-hrm-carla@fps.local",
    ]));
  }

  console.log(`\nKlaar: ${checks} checks, ${fouten} fouten.`);
  if (fouten > 0) process.exit(1);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
