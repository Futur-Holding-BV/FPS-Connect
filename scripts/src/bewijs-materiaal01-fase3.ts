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

import "./lib/prodGuard";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import { eq, and, isNull } from "drizzle-orm";
import {
  db,
  gebruikersTable,
  opdrachtenTable,
  materiaalAanvragenTable,
  inkoopbonnenTable,
  inkoopbonRegelsTable,
} from "@workspace/db";

// BEWIJS_API_BASIS wordt door de CI-runner gezet (eigen geïsoleerde server);
// in dev kan het script ook rechtstreeks worden gedraaid met de dev-domain URL.
const BASE = process.env.BEWIJS_API_BASIS
  ? process.env.BEWIJS_API_BASIS.replace(/\/api\/?$/, "")
  : `https://${process.env.REPLIT_DEV_DOMAIN}`;
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

  // vrijgave_pl vereist akkoord_herkomst + akkoord_op (geen document nodig)
  const [opdracht] = await db.insert(opdrachtenTable)
    .values({
      titel: "Bewijs MATERIAAL_01 fase 3", type: "vast", status: "actief",
      akkoordGrond: "vrijgave_pl",
      akkoordHerkomst: "René, bewijsscript MATERIAAL_01 fase 3",
      akkoordOp: new Date(),
    })
    .returning();
  const aanvraagIds: number[] = [];
  const bonIds: number[] = [];

  try {
    // Mobiele Bearer-login (één stap: e-mail + wachtwoord + TOTP-code).
    // Werkt ook op http://localhost (geen Secure-cookie nodig); requireAuth
    // staat globaal op de router (routes/index.ts) en zet req.session.userId
    // op de stateless stub-sessie voordat requireBevoegdheid controleert.
    const mobileRes = await fetch(`${BASE}/api/auth/mobile/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, wachtwoord: WACHTWOORD, code: authenticator.generate(TOTP_SECRET) }),
    });
    const mobileJson = (await mobileRes.json()) as { token?: string };
    const bearer = mobileJson.token ?? "";
    check("mobile Bearer-login geslaagd (incl. TOTP)", mobileRes.ok && bearer.length > 0, { status: mobileRes.status, json: mobileJson });

    const authHeader = { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` };
    const patch = async (id: number, status: string): Promise<{ status: number; json: Record<string, unknown> }> => {
      const res = await fetch(`${BASE}/api/materiaal-aanvragen/${id}`, {
        method: "PATCH",
        headers: authHeader,
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

    // ── 3b. Race-guard op DB-niveau ────────────────────────────────────────
    // BonClaimConflict treedt op als UPDATE ... WHERE inkoopbon_id IS NULL
    // 0 rijen retourneert (een andere transactie won de claim). We testen dit
    // deterministische pad rechtstreeks op DB-niveau (HTTP-parallel is op
    // localhost niet betrouwbaar omdat Node.js request-voor-request serialiseert).

    // Setup: aanvraag met bon via PATCH
    const [a4] = await db.insert(materiaalAanvragenTable).values({
      opdrachtId: opdracht.id, soort: "materiaal", volgensOpdracht: "ja",
      ingediendDoorId: admin.id, reden: "nodig", omschrijving: "Racetest artikel",
    }).returning();
    aanvraagIds.push(a4.id);
    const r_p1 = await patch(a4.id, "goedgekeurd");
    const bonP1 = (r_p1.json.inkoopbon as { id: number } | undefined);
    if (bonP1?.id) bonIds.push(bonP1.id);
    check("race setup: goedkeuren maakt bon (R1=200)", r_p1.status === 200 && bonP1 != null, r_p1);

    // Conditionele claim retourneert 0 rijen als inkoopbon_id al gezet is
    // (dit is precies het pad dat BonClaimConflict activeert in de route)
    const nulRijen = await db.update(materiaalAanvragenTable)
      .set({ inkoopbonId: bonP1!.id })
      .where(and(
        eq(materiaalAanvragenTable.id, a4.id),
        isNull(materiaalAanvragenTable.inkoopbonId), // al geclaimd → 0 rijen
      ))
      .returning({ id: materiaalAanvragenTable.id });
    check("conditionele claim: 0 rijen als al geclaimd (BonClaimConflict-basis)", nulRijen.length === 0, nulRijen);

    // Partiële unieke index: dezelfde bon_id aan een tweede aanvraag geven faalt
    const [a5] = await db.insert(materiaalAanvragenTable).values({
      soort: "materiaal", ingediendDoorId: admin.id, reden: "dup-uniek-test",
    }).returning();
    aanvraagIds.push(a5.id);
    let uniqueIndexHielp = false;
    try {
      await db.update(materiaalAanvragenTable)
        .set({ inkoopbonId: bonP1!.id })
        .where(eq(materiaalAanvragenTable.id, a5.id));
    } catch {
      uniqueIndexHielp = true;
    }
    check("partiële unieke index: dezelfde bon_id aan 2e aanvraag geven faalt", uniqueIndexHielp);

    // ── 4. Handmatig pad ongewijzigd ───────────────────────────────────────
    const r5 = await fetch(`${BASE}/api/opdrachten/${opdracht.id}/inkoopplanning/inkoopbonnen`, {
      method: "POST",
      headers: authHeader,
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
