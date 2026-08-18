// Bewijs: ADMINISTRATIE_01 fase 3 — werkmaatschappij hangt aan het WERK
// (offerte/opdracht), gebouw levert alleen de default (besluit René 18-08-2026).
//
//  1. POST offerte met gebouw → BV default uit gebouw
//  2. Expliciete werkmaatschappij_id in de body wint van de gebouw-default
//  3. PATCH offerte: BV wijzigbaar; onbestaande BV → 400
//  4. maak-opdracht erft de offerte-BV; PATCH opdracht: BV wijzigbaar
//  5. Factuur-BV-keten: offerte → opdracht → gebouw-default (bron zichtbaar)
//  6. Nacalculatie bv_controle: afwijkende + onbekende uren zichtbaar (fail-closed)
//  7. AccountView weigert fail-closed: geen BV op koppeling / factuur-BV onbekend /
//     BV-mismatch — ook via forceer-herexport (geen achterdeur)
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/verificatie-administratie01-fase3.ts

import "./lib/prodGuard";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  gebruikersTable,
  gebouwenTable,
  werkgeversTable,
  offertesTable,
  opdrachtenTable,
  facturenTable,
  medewerkersTable,
  urenRegistratiesTable,
  accountviewInstellingenTable,
} from "@workspace/db";

const BASE = process.env.BEWIJS_API_BASIS
  ? process.env.BEWIJS_API_BASIS.replace(/\/api\/?$/, "")
  : `https://${process.env.REPLIT_DEV_DOMAIN}`;
const EMAIL = "bewijs-administratie01-fase3@fps.local";
const WACHTWOORD = "BewijsAdmin3!2026";

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

async function main(): Promise<void> {
  const hash = await bcrypt.hash(WACHTWOORD, 10);
  const TOTP_SECRET = authenticator.generateSecret();
  const [admin] = await db.insert(gebruikersTable)
    .values({ naam: "Bewijs Admin3", email: EMAIL, wachtwoord: hash, rol: "hoofdbeheerder", actief: true, tweeFactorIngeschakeld: true, totpSecret: TOTP_SECRET })
    .onConflictDoUpdate({ target: gebruikersTable.email, set: { wachtwoord: hash, rol: "hoofdbeheerder", actief: true, tweeFactorIngeschakeld: true, totpSecret: TOTP_SECRET } })
    .returning();
  if (!admin) throw new Error("Testgebruiker niet aangemaakt");

  // Twee BV's + gebouw met BV A als default
  const [bvA] = await db.insert(werkgeversTable).values({ naam: "Bewijs BV Alpha (adm3)" }).returning();
  const [bvB] = await db.insert(werkgeversTable).values({ naam: "Bewijs BV Beta (adm3)" }).returning();
  if (!bvA || !bvB) throw new Error("BV's niet aangemaakt");
  const [gebouw] = await db.insert(gebouwenTable)
    .values({ naam: "Bewijs Gebouw ADM3", adres: "Teststraat 1", stad: "Testdam", werkgeverId: bvA.id })
    .returning();
  if (!gebouw) throw new Error("Gebouw niet aangemaakt");

  const opruimOffertes: number[] = [];
  const opruimOpdrachten: number[] = [];
  const opruimFacturen: number[] = [];
  const opruimMedewerkers: number[] = [];
  const opruimUren: number[] = [];

  // AccountView-instellingen: originele rij bewaren om te herstellen
  const [instOrigineel] = await db.select().from(accountviewInstellingenTable).where(eq(accountviewInstellingenTable.id, 1));

  try {
    const mobileRes = await fetch(`${BASE}/api/auth/mobile/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, wachtwoord: WACHTWOORD, code: authenticator.generate(TOTP_SECRET) }),
    });
    const mobileJson = (await mobileRes.json()) as { token?: string };
    const bearer = mobileJson.token ?? "";
    check("Bearer-login geslaagd", mobileRes.ok && bearer.length > 0, { status: mobileRes.status });
    const H = { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` };

    // 1. Default uit gebouw
    const r1 = await fetch(`${BASE}/api/offertes`, { method: "POST", headers: H, body: JSON.stringify({ titel: "ADM3 default", gebouw_id: gebouw.id }) });
    const o1 = (await r1.json()) as Record<string, unknown>;
    if (o1["id"]) opruimOffertes.push(o1["id"] as number);
    check("1. offerte krijgt BV-default uit gebouw", r1.ok && o1["werkmaatschappij_id"] === bvA.id, o1["werkmaatschappij_id"]);
    check("1b. BV-naam in respons", o1["werkmaatschappij_naam"] === bvA.naam, o1["werkmaatschappij_naam"]);

    // 2. Expliciete keuze wint
    const r2 = await fetch(`${BASE}/api/offertes`, { method: "POST", headers: H, body: JSON.stringify({ titel: "ADM3 expliciet", gebouw_id: gebouw.id, werkmaatschappij_id: bvB.id }) });
    const o2 = (await r2.json()) as Record<string, unknown>;
    if (o2["id"]) opruimOffertes.push(o2["id"] as number);
    check("2. expliciete werkmaatschappij_id wint van gebouw-default", r2.ok && o2["werkmaatschappij_id"] === bvB.id, o2["werkmaatschappij_id"]);

    // 3. PATCH wijzigbaar + validatie
    const r3 = await fetch(`${BASE}/api/offertes/${o1["id"]}`, { method: "PATCH", headers: H, body: JSON.stringify({ werkmaatschappij_id: bvB.id }) });
    const o3 = (await r3.json()) as Record<string, unknown>;
    check("3. PATCH offerte wijzigt BV", r3.ok && o3["werkmaatschappij_id"] === bvB.id, o3["werkmaatschappij_id"]);
    const r3b = await fetch(`${BASE}/api/offertes/${o1["id"]}`, { method: "PATCH", headers: H, body: JSON.stringify({ werkmaatschappij_id: 99999999 }) });
    check("3b. onbestaande BV → 400", r3b.status === 400, r3b.status);

    // 4. maak-opdracht erft BV van offerte (o2 = BV B)
    const r4 = await fetch(`${BASE}/api/offertes/${o2["id"]}/maak-opdracht`, { method: "POST", headers: H, body: JSON.stringify({}) });
    const op4 = (await r4.json()) as Record<string, unknown>;
    if (op4["id"]) opruimOpdrachten.push(op4["id"] as number);
    check("4. opdracht erft BV van offerte", r4.ok && op4["werkmaatschappij_id"] === bvB.id, { status: r4.status, wm: op4["werkmaatschappij_id"], fout: op4["error"] });
    const r4b = await fetch(`${BASE}/api/opdrachten/${op4["id"]}`, { method: "PATCH", headers: H, body: JSON.stringify({ werkmaatschappij_id: bvA.id }) });
    const op4b = (await r4b.json()) as Record<string, unknown>;
    check("4b. PATCH opdracht wijzigt BV", r4b.ok && op4b["werkmaatschappij_id"] === bvA.id, op4b["werkmaatschappij_id"]);

    // 5. Factuur-BV-keten
    const [fOfferte] = await db.insert(facturenTable).values({ type: "verkoop", status: "concept", offerteId: o2["id"] as number, gebouwId: gebouw.id }).returning();
    const [fGebouw] = await db.insert(facturenTable).values({ type: "verkoop", status: "concept", gebouwId: gebouw.id }).returning();
    const [fLos] = await db.insert(facturenTable).values({ type: "inkoop", status: "concept" }).returning();
    if (!fOfferte || !fGebouw || !fLos) throw new Error("Testfacturen niet aangemaakt");
    opruimFacturen.push(fOfferte.id, fGebouw.id, fLos.id);
    const g5a = (await (await fetch(`${BASE}/api/facturen/${fOfferte.id}`, { headers: H })).json()) as Record<string, unknown>;
    check("5. factuur volgt offerte-BV (bron=offerte)", g5a["werkmaatschappij_id"] === bvB.id && g5a["werkmaatschappij_bron"] === "offerte", { wm: g5a["werkmaatschappij_id"], bron: g5a["werkmaatschappij_bron"] });
    const g5b = (await (await fetch(`${BASE}/api/facturen/${fGebouw.id}`, { headers: H })).json()) as Record<string, unknown>;
    check("5b. factuur zonder offerte/opdracht valt terug op gebouw-default (bron=gebouw)", g5b["werkmaatschappij_id"] === bvA.id && g5b["werkmaatschappij_bron"] === "gebouw", { wm: g5b["werkmaatschappij_id"], bron: g5b["werkmaatschappij_bron"] });
    const g5c = (await (await fetch(`${BASE}/api/facturen/${fLos.id}`, { headers: H })).json()) as Record<string, unknown>;
    check("5c. losse factuur: BV onbekend (null, geen stille terugval)", g5c["werkmaatschappij_id"] === null, g5c["werkmaatschappij_id"]);

    // 6. Nacalculatie bv_controle — opdracht = BV A; medewerker BV B (afwijkend) + BV-loos (onbekend)
    const [mwB] = await db.insert(medewerkersTable).values({ naam: "Bewijs Medewerker Beta", werkgeverId: bvB.id }).returning();
    const [mwX] = await db.insert(medewerkersTable).values({ naam: "Bewijs Medewerker Zonder BV", werkgeverId: null }).returning();
    if (!mwB || !mwX) throw new Error("Medewerkers niet aangemaakt");
    opruimMedewerkers.push(mwB.id, mwX.id);
    const opdrachtId = op4["id"] as number;
    const u1 = await db.insert(urenRegistratiesTable).values({ datum: "2026-08-17", medewerkerId: mwB.id, beginTijd: "08:00", eindTijd: "12:00", pauzeMinuten: 0, nettoUren: 4, status: "goedgekeurd", opdrachtId }).returning();
    const u2 = await db.insert(urenRegistratiesTable).values({ datum: "2026-08-17", medewerkerId: mwX.id, beginTijd: "08:00", eindTijd: "11:00", pauzeMinuten: 0, nettoUren: 3, status: "goedgekeurd", opdrachtId }).returning();
    opruimUren.push(...u1.map((u) => u.id), ...u2.map((u) => u.id));
    const nac = (await (await fetch(`${BASE}/api/opdrachten/${opdrachtId}/nacalculatie`, { headers: H })).json()) as Record<string, unknown>;
    const bvc = nac["bv_controle"] as { werk_bv_id: number; regels: Array<{ medewerker_naam: string; afwijkend: boolean | null; uren: number }>; afwijkende_uren: number; onbekende_uren: number } | undefined;
    check("6. bv_controle aanwezig met werk-BV", !!bvc && bvc.werk_bv_id === bvA.id, bvc?.werk_bv_id);
    const regelB = bvc?.regels.find((r) => r.medewerker_naam === "Bewijs Medewerker Beta");
    const regelX = bvc?.regels.find((r) => r.medewerker_naam === "Bewijs Medewerker Zonder BV");
    check("6b. medewerker andere BV = afwijkend", regelB?.afwijkend === true && regelB.uren === 4, regelB);
    check("6c. medewerker zonder BV = onbekend (null, niet stil goed)", regelX?.afwijkend === null && regelX.uren === 3, regelX);
    check("6d. totalen: afwijkende_uren=4, onbekende_uren=3", bvc?.afwijkende_uren === 4 && bvc?.onbekende_uren === 3, { a: bvc?.afwijkende_uren, o: bvc?.onbekende_uren });

    // 7. AccountView weigert fail-closed (via forceer-herexport, geen achterdeur)
    await db.insert(accountviewInstellingenTable)
      .values({ id: 1, apiGebruiker: "bewijs", werkgeverId: null })
      .onConflictDoUpdate({ target: accountviewInstellingenTable.id, set: { apiGebruiker: "bewijs", werkgeverId: null } });
    const r7a = await fetch(`${BASE}/api/facturen/${fOfferte.id}/forceer-herexport`, { method: "POST", headers: H, body: JSON.stringify({ reden: "bewijs" }) });
    const j7a = (await r7a.json()) as Record<string, unknown>;
    check("7. koppeling zonder BV → 422 geweigerd", r7a.status === 422 && String(j7a["error"]).includes("werkmaatschappij"), { status: r7a.status, error: j7a["error"] });
    await db.update(accountviewInstellingenTable).set({ werkgeverId: bvA.id }).where(eq(accountviewInstellingenTable.id, 1));
    const r7b = await fetch(`${BASE}/api/facturen/${fOfferte.id}/forceer-herexport`, { method: "POST", headers: H, body: JSON.stringify({ reden: "bewijs" }) });
    const j7b = (await r7b.json()) as Record<string, unknown>;
    check("7b. factuur-BV ≠ administratie-BV → 422 geweigerd", r7b.status === 422 && String(j7b["error"]).includes("andere werkmaatschappij"), { status: r7b.status, error: j7b["error"] });
    const r7c = await fetch(`${BASE}/api/facturen/${fLos.id}/forceer-herexport`, { method: "POST", headers: H, body: JSON.stringify({ reden: "bewijs" }) });
    const j7c = (await r7c.json()) as Record<string, unknown>;
    check("7c. factuur zonder herleidbare BV → 422 geweigerd", r7c.status === 422 && String(j7c["error"]).includes("onbekend"), { status: r7c.status, error: j7c["error"] });
  } finally {
    // Opruimen (volgorde: afhankelijkheden eerst)
    if (opruimUren.length) await db.delete(urenRegistratiesTable).where(inArray(urenRegistratiesTable.id, opruimUren));
    if (opruimMedewerkers.length) await db.delete(medewerkersTable).where(inArray(medewerkersTable.id, opruimMedewerkers));
    if (opruimFacturen.length) await db.delete(facturenTable).where(inArray(facturenTable.id, opruimFacturen));
    if (opruimOpdrachten.length) await db.delete(opdrachtenTable).where(inArray(opdrachtenTable.id, opruimOpdrachten));
    if (opruimOffertes.length) await db.delete(offertesTable).where(inArray(offertesTable.id, opruimOffertes));
    await db.delete(gebouwenTable).where(eq(gebouwenTable.id, gebouw.id));
    await db.delete(werkgeversTable).where(inArray(werkgeversTable.id, [bvA.id, bvB.id]));
    await db.delete(gebruikersTable).where(eq(gebruikersTable.id, admin.id));
    // AccountView-instellingen herstellen
    if (instOrigineel) {
      await db.update(accountviewInstellingenTable)
        .set({ apiGebruiker: instOrigineel.apiGebruiker, werkgeverId: instOrigineel.werkgeverId })
        .where(eq(accountviewInstellingenTable.id, 1));
    } else {
      await db.delete(accountviewInstellingenTable).where(eq(accountviewInstellingenTable.id, 1));
    }
  }

  console.log(`\n${checks} checks, ${fouten} fouten`);
  if (fouten > 0) process.exit(1);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
