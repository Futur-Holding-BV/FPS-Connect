// Bewijs: MATERIAAL_01 fase 3 (keuze A, René 2026-08-10) — goedkeuring van een
// materiaal-aanvraag maakt automatisch een concept-inkoopbon op de opdracht.
// Test via HTTP + @workspace/db (nooit api-server-source importeren):
//
//  1. Materiaal-aanvraag (wijkt_af) goedkeuren → concept-bon met I-kenmerk,
//     aanvraag.inkoopbon_id gezet, opmerkingen bevatten LET OP + aanvraag-#,
//     één regel, leverancier "Nog te bepalen", prijs leeg (inkoop-eigen-cijfers)
//  2. Her-goedkeuren (via in_behandeling) → GEEN tweede bon (idempotent)
//  3. Afwijzen → geen bon; toebehoren-aanvraag goedkeuren → geen bon
//  4. Handmatige POST inkoopbon-route (gedeeld pad) werkt ongewijzigd
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-materiaal01-fase3.ts

import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import { eq } from "drizzle-orm";
import {
  db,
  gebruikersTable,
  opdrachtenTable,
  materiaalAanvragenTable,
  inkoopbonnenTable,
  inkoopbonRegelsTable,
} from "@workspace/db";

const BASE = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const EMAIL = "bewijs-materiaal01-fase3@fps.local";
const WACHTWOORD = "BewijsMat3!2026";

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
    .values({ naam: "Bewijs Mat3 Admin", email: EMAIL, wachtwoord: hash, rol: "hoofdbeheerder", actief: true, tweeFactorIngeschakeld: true, totpSecret: TOTP_SECRET })
    .onConflictDoUpdate({ target: gebruikersTable.email, set: { wachtwoord: hash, rol: "hoofdbeheerder", actief: true, tweeFactorIngeschakeld: true, totpSecret: TOTP_SECRET } })
    .returning();
  if (!admin) throw new Error("Testgebruiker niet aangemaakt");

  const [opdracht] = await db.insert(opdrachtenTable)
    .values({ titel: "Bewijs MATERIAAL_01 fase 3", type: "vast", status: "actief" })
    .returning();
  const aanvraagIds: number[] = [];
  const bonIds: number[] = [];

  try {
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, wachtwoord: WACHTWOORD }),
    });
    let cookie = loginRes.headers.get("set-cookie")?.split(";")[0] ?? "";
    const verifyRes = await fetch(`${BASE}/api/auth/2fa/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ code: authenticator.generate(TOTP_SECRET) }),
    });
    cookie = verifyRes.headers.get("set-cookie")?.split(";")[0] ?? cookie;
    check("login als hoofdbeheerder (incl. 2FA)", loginRes.ok && verifyRes.ok && cookie.length > 0, { login: loginRes.status, verify: verifyRes.status });

    const patch = async (id: number, status: string): Promise<{ status: number; json: Record<string, unknown> }> => {
      const res = await fetch(`${BASE}/api/materiaal-aanvragen/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ status }),
      });
      return { status: res.status, json: (await res.json()) as Record<string, unknown> };
    };

    // ── 1. Goedkeuren maakt concept-bon ────────────────────────────────────
    const [a1] = await db.insert(materiaalAanvragenTable).values({
      opdrachtId: opdracht.id, soort: "materiaal", volgensOpdracht: "wijkt_af",
      ingediendDoorId: admin.id, reden: "op", omschrijving: "Bewijs brandklep 200mm",
      aiArtikelNaam: "Brandklep 200mm", aiLeverancier: "Testleverancier BV",
    }).returning();
    aanvraagIds.push(a1.id);

    const r1 = await patch(a1.id, "goedgekeurd");
    const bonInfo = r1.json.inkoopbon as { id: number; kenmerk: string | null } | undefined;
    check("PATCH goedgekeurd → 200 + inkoopbon in respons", r1.status === 200 && !!bonInfo, r1);
    check("kenmerk is I-reeks", !!bonInfo?.kenmerk && /I\d+/.test(bonInfo.kenmerk), bonInfo);
    if (bonInfo) bonIds.push(bonInfo.id);

    const [na1] = await db.select().from(materiaalAanvragenTable).where(eq(materiaalAanvragenTable.id, a1.id));
    check("aanvraag.inkoopbon_id verwijst naar de bon", na1?.inkoopbonId === bonInfo?.id, na1?.inkoopbonId);

    const [bon] = bonInfo ? await db.select().from(inkoopbonnenTable).where(eq(inkoopbonnenTable.id, bonInfo.id)) : [];
    check("bon status = concept", bon?.status === "concept", bon?.status);
    check("bon op de juiste opdracht", bon?.opdrachtId === opdracht.id, bon?.opdrachtId);
    check("bon leverancier = Nog te bepalen (niet uit AI)", bon?.leverancier === "Nog te bepalen", bon?.leverancier);
    check("opmerkingen: LET OP wijkt af + aanvraag-#", !!bon?.opmerkingen?.includes("wijkt af") && !!bon?.opmerkingen?.includes(`#${a1.id}`), bon?.opmerkingen);
    const regels = bon ? await db.select().from(inkoopbonRegelsTable).where(eq(inkoopbonRegelsTable.inkoopbonId, bon.id)) : [];
    check("één regel met AI-artikelnaam, prijs leeg", regels.length === 1 && regels[0]?.omschrijving === "Brandklep 200mm" && regels[0]?.prijs == null, regels);

    // ── 2. Her-goedkeuren → geen tweede bon ────────────────────────────────
    await patch(a1.id, "in_behandeling");
    const r2 = await patch(a1.id, "goedgekeurd");
    const [na2] = await db.select().from(materiaalAanvragenTable).where(eq(materiaalAanvragenTable.id, a1.id));
    const alleBonnen = await db.select().from(inkoopbonnenTable).where(eq(inkoopbonnenTable.opdrachtId, opdracht.id));
    check("her-goedkeuren: geen tweede bon, verwijzing intact", r2.status === 200 && !r2.json.inkoopbon && na2?.inkoopbonId === bonInfo?.id && alleBonnen.length === 1, { r2: r2.status, bonnen: alleBonnen.length });

    // ── 3. Afwijzen en toebehoren → geen bon ───────────────────────────────
    const [a2] = await db.insert(materiaalAanvragenTable).values({
      opdrachtId: opdracht.id, soort: "materiaal", volgensOpdracht: "ja",
      ingediendDoorId: admin.id, reden: "beschadigd",
    }).returning();
    aanvraagIds.push(a2.id);
    const r3 = await patch(a2.id, "afgewezen");
    const [na3] = await db.select().from(materiaalAanvragenTable).where(eq(materiaalAanvragenTable.id, a2.id));
    check("afwijzen: geen bon", r3.status === 200 && na3?.inkoopbonId == null, na3?.inkoopbonId);

    const [a3] = await db.insert(materiaalAanvragenTable).values({
      soort: "toebehoren", ingediendDoorId: admin.id, reden: "op",
    }).returning();
    aanvraagIds.push(a3.id);
    const r4 = await patch(a3.id, "goedgekeurd");
    const [na4] = await db.select().from(materiaalAanvragenTable).where(eq(materiaalAanvragenTable.id, a3.id));
    check("toebehoren goedkeuren: geen bon", r4.status === 200 && na4?.inkoopbonId == null, na4?.inkoopbonId);

    // ── 3b. Concurrentie: twee gelijktijdige goedkeuringen → precies één bon ─
    const [a4] = await db.insert(materiaalAanvragenTable).values({
      opdrachtId: opdracht.id, soort: "materiaal", volgensOpdracht: "ja",
      ingediendDoorId: admin.id, reden: "nodig", omschrijving: "Racetest artikel",
    }).returning();
    aanvraagIds.push(a4.id);
    const [p1, p2] = await Promise.all([patch(a4.id, "goedgekeurd"), patch(a4.id, "goedgekeurd")]);
    const [na5] = await db.select().from(materiaalAanvragenTable).where(eq(materiaalAanvragenTable.id, a4.id));
    const raceBon = na5?.inkoopbonId ?? null;
    if (raceBon) bonIds.push(raceBon);
    const bonnenNaRace = await db.select().from(inkoopbonnenTable).where(eq(inkoopbonnenTable.opdrachtId, opdracht.id));
    const geslaagd = [p1, p2].filter((r) => r.status === 200).length;
    const geweigerd = [p1, p2].filter((r) => r.status === 409).length;
    check("parallel goedkeuren: 1×200 + 1×409, precies één bon, geen wees-bon",
      geslaagd === 1 && geweigerd === 1 && raceBon != null && bonnenNaRace.length === 2,
      { p1: p1.status, p2: p2.status, bonnen: bonnenNaRace.length });

    // ── 4. Handmatig pad ongewijzigd ───────────────────────────────────────
    const r5 = await fetch(`${BASE}/api/opdrachten/${opdracht.id}/inkoopplanning/inkoopbonnen`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ leverancier: "Handmatig BV", regels: [{ omschrijving: "Testregel", hoeveelheid: 2, eenheid: "st", prijs: 10 }] }),
    });
    const j5 = (await r5.json()) as { id?: number; status?: string; kenmerk?: string };
    if (j5.id) bonIds.push(j5.id);
    check("handmatige POST inkoopbon: 201 concept met kenmerk", r5.status === 201 && j5.status === "concept" && !!j5.kenmerk, { status: r5.status, j5 });
  } finally {
    for (const bid of bonIds) await db.delete(inkoopbonnenTable).where(eq(inkoopbonnenTable.id, bid));
    for (const aid of aanvraagIds) await db.delete(materiaalAanvragenTable).where(eq(materiaalAanvragenTable.id, aid));
    if (opdracht) await db.delete(opdrachtenTable).where(eq(opdrachtenTable.id, opdracht.id));
    await db.delete(gebruikersTable).where(eq(gebruikersTable.email, EMAIL));
  }

  console.log(`\nKlaar: ${checks} checks, ${fouten} fouten.`);
  if (fouten > 0) process.exit(1);
}

void main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
