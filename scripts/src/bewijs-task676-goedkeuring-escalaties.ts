// Bewijs taak #676 — escalaties worden echt verstuurd bij een verlopen
// goedkeuringsaanvraag (einde-tot-einde).
//
// Scenario: beleidsregel met escalatieconfiguratie → aanvraag indienen →
// reactietermijn kunstmatig verlopen (DB) → bewaking handmatig triggeren
// (POST /goedkeuring/bewaking/uitvoeren) → verifieer:
//   1. goedkeuring_escalaties bevat rijen (herinnering, escalatie_1,
//      escalatie_2, max_doorlooptijd) voor de aanvraag;
//   2. mail-verzending aantoonbaar: mail_wachtrij bevat wachtende items met
//      soort=goedkeuring_escalatie aan de goedkeurder (verstuurMail is
//      fail-closed: escalatiemails gaan altijd eerst de wachtrij in);
//   3. dashboard-endpoint levert de escalaties terug en de frontend-logica
//      (bepaalPrioriteit) geeft "Kritiek" zodra escalatie_2 bestaat;
//   4. dedupe: een tweede bewakingsrun maakt géén dubbele escalaties aan.
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-task676-goedkeuring-escalaties.ts
import "./lib/prodGuard";
import bcrypt from "bcryptjs";
import { and, eq, inArray, like } from "drizzle-orm";
import { authenticator } from "otplib";
import {
  db,
  gebruikersTable,
  goedkeuringAanvragenTable,
  goedkeuringBeleidsregelsTable,
  goedkeuringEscalatiesTable,
  mailWachtrijTable,
  workflowTransitieLogTable,
} from "@workspace/db";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const TOTP = "MFRGGZDFMZTWQ2LK";
const WW = "BewijsTaak676!2026";
// .test-domein: mail wordt bij eventuele verzending altijd onderdrukt (isTestAdres)
const EMAIL = "bewijs-task676-hb@fps.test";
const DOC_TYPE = "bewijs676_documenttype";
const OBJECT_TYPE = "bewijs676_object";
const OBJECT_ID = 967667;

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: bewijsscript nooit tegen productie draaien.");
}

let falen = 0;
function check(naam: string, conditie: boolean, detail?: unknown): void {
  if (!conditie) { console.error(`\x1b[31m✗ FAALT: ${naam}\x1b[0m`, detail ?? ""); falen++; return; }
  console.log(`✓ ${naam}`);
}

// Frontend-logica exact gerepliceerd uit goedkeuringen-dashboard.tsx
function bepaalPrioriteit(item: { escalaties: Array<{ type: string }>; is_verlopen: boolean }): "kritiek" | "hoog" | "normaal" {
  const types = new Set(item.escalaties.map((e) => e.type));
  if (types.has("max_doorlooptijd") || types.has("escalatie_2")) return "kritiek";
  if (types.has("escalatie_1") || item.is_verlopen) return "hoog";
  return "normaal";
}

async function ruimOp(): Promise<void> {
  const aanvragen = await db.select({ id: goedkeuringAanvragenTable.id })
    .from(goedkeuringAanvragenTable)
    .where(eq(goedkeuringAanvragenTable.documentType, DOC_TYPE));
  const ids = aanvragen.map((a) => a.id);
  if (ids.length > 0) {
    // escalaties + stappen cascaden mee via FK
    await db.delete(goedkeuringAanvragenTable).where(inArray(goedkeuringAanvragenTable.id, ids));
  }
  await db.delete(workflowTransitieLogTable).where(
    and(eq(workflowTransitieLogTable.entityType, OBJECT_TYPE), eq(workflowTransitieLogTable.entityId, OBJECT_ID)),
  );
  await db.delete(goedkeuringBeleidsregelsTable).where(eq(goedkeuringBeleidsregelsTable.documentType, DOC_TYPE));
  await db.delete(mailWachtrijTable).where(eq(mailWachtrijTable.naarEmail, EMAIL));
  // Ook de max-doorlooptijd-mail aan de echte hoofdbeheerder opruimen (herkenbaar aan het documenttype in de mailbody)
  await db.delete(mailWachtrijTable).where(
    and(eq(mailWachtrijTable.soort, "goedkeuring_escalatie"), like(mailWachtrijTable.html, `%${DOC_TYPE}%`)),
  );
  const [oud] = await db.select({ id: gebruikersTable.id }).from(gebruikersTable).where(eq(gebruikersTable.email, EMAIL));
  if (oud) await db.delete(gebruikersTable).where(eq(gebruikersTable.id, oud.id));
}

async function main(): Promise<void> {
  await ruimOp();

  const [gebruiker] = await db.insert(gebruikersTable).values({
    naam: "Bewijs 676 HB", email: EMAIL, rol: "hoofdbeheerder",
    wachtwoord: await bcrypt.hash(WW, 10), totpSecret: TOTP, tweeFactorIngeschakeld: true, actief: true,
  }).returning({ id: gebruikersTable.id });
  const gebruikerId = gebruiker!.id;

  try {
    // ── Login (bearer) ─────────────────────────────────────────────────────
    const r = await fetch(`${BASIS}/auth/mobile/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, wachtwoord: WW, code: authenticator.generate(TOTP) }),
    });
    if (r.status !== 200) throw new Error(`login faalde: ${r.status} ${await r.text()}`);
    const { token } = await r.json() as { token: string };
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    // ── 1. Beleidsregel met volledige escalatieconfiguratie ───────────────
    const br = await fetch(`${BASIS}/goedkeuring/beleidsregels`, {
      method: "POST", headers,
      body: JSON.stringify({
        naam: "Bewijs 676 escalatiebeleid",
        documentType: DOC_TYPE,
        goedkeurderGebruikerId: gebruikerId,
        reactietermijnUren: 1,
        herinneringUren: 1,
        escalatieStap1Uren: 2,
        escalatieStap1GebruikerId: gebruikerId,
        escalatieStap2Uren: 3,
        escalatieStap2GebruikerId: gebruikerId,
        maxDoorlooptijdUren: 4,
      }),
    });
    const brJson = await br.json() as Record<string, unknown>;
    check("beleidsregel aangemaakt (201)", br.status === 201, brJson);

    // ── 2. Aanvraag indienen ───────────────────────────────────────────────
    const av = await fetch(`${BASIS}/goedkeuring/aanvragen`, {
      method: "POST", headers,
      body: JSON.stringify({ object_type: OBJECT_TYPE, object_id: OBJECT_ID, document_type: DOC_TYPE, omschrijving: "Bewijs 676 e2e" }),
    });
    const avJson = await av.json() as Record<string, unknown>;
    check("aanvraag ingediend (201)", av.status === 201, avJson);
    check("aanvraag status=ingediend", avJson.status === "ingediend", avJson.status);
    const aanvraagId = Number(avJson.id);

    // ── 3. Reactietermijn kunstmatig verlopen (10 uur terug) ──────────────
    await db.update(goedkeuringAanvragenTable)
      .set({ ingediendOp: new Date(Date.now() - 10 * 3_600_000) })
      .where(eq(goedkeuringAanvragenTable.id, aanvraagId));

    // ── 4. Bewaking handmatig triggeren ────────────────────────────────────
    const bw = await fetch(`${BASIS}/goedkeuring/bewaking/uitvoeren`, { method: "POST", headers });
    const bwJson = await bw.json() as { verwerkt: number };
    check("bewaking uitgevoerd (200)", bw.status === 200, bwJson);
    check("bewaking verwerkte ≥ 4 stappen (incl. onze aanvraag)", bwJson.verwerkt >= 4, bwJson.verwerkt);

    // ── 5. Escalatie-rijen in DB ───────────────────────────────────────────
    const escalaties = await db.select().from(goedkeuringEscalatiesTable)
      .where(eq(goedkeuringEscalatiesTable.aanvraagId, aanvraagId));
    const types = new Set(escalaties.map((e) => e.type));
    check("escalatie-rij type=herinnering bestaat", types.has("herinnering"), [...types]);
    check("escalatie-rij type=escalatie_1 bestaat", types.has("escalatie_1"));
    check("escalatie-rij type=escalatie_2 bestaat", types.has("escalatie_2"));
    check("escalatie-rij type=max_doorlooptijd bestaat", types.has("max_doorlooptijd"));
    const herinnering = escalaties.find((e) => e.type === "herinnering");
    check("herinnering gericht aan de aangewezen goedkeurder", herinnering?.naarGebruikerId === gebruikerId, herinnering?.naarGebruikerId);

    // ── 6. Mail aantoonbaar verstuurd (fail-closed wachtrij) ──────────────
    // herinnering + esc1 + esc2 gaan naar de aangewezen (test)goedkeurder;
    // max_doorlooptijd gaat per definitie naar de (eerste) hoofdbeheerder.
    const mails = await db.select().from(mailWachtrijTable)
      .where(and(eq(mailWachtrijTable.naarEmail, EMAIL), eq(mailWachtrijTable.soort, "goedkeuring_escalatie")));
    check("3 escalatiemails aan goedkeurder in mail_wachtrij (herinnering/esc1/esc2)", mails.length === 3, mails.map((m) => m.onderwerp));
    check("goedkeurder-mails staan op status 'wachtend'", mails.every((m) => m.status === "wachtend"), mails.map((m) => m.status));
    check("herinneringsmail-onderwerp noemt de aanvraag", mails.some((m) => m.onderwerp.startsWith("Herinnering") && m.onderwerp.includes(`#${aanvraagId}`)), mails.map((m) => m.onderwerp));
    check("mailinhoud bevat het escalatiebericht", mails.every((m) => m.html.includes(`#${aanvraagId}`)));
    const alleAanvraagMails = await db.select().from(mailWachtrijTable)
      .where(and(eq(mailWachtrijTable.soort, "goedkeuring_escalatie"), like(mailWachtrijTable.onderwerp, `%goedkeuringsaanvraag #${aanvraagId}`)));
    check("alle 4 escalatiemails voor deze aanvraag in mail_wachtrij", alleAanvraagMails.length === 4, alleAanvraagMails.map((m) => m.onderwerp));
    const maxMail = alleAanvraagMails.find((m) => m.onderwerp.startsWith("Maximale doorlooptijd"));
    check("max-doorlooptijd-mail bestaat en staat op 'wachtend'", maxMail?.status === "wachtend", maxMail?.status);
    // Ontvanger van de max-mail moet een actieve hoofdbeheerder zijn
    const actieveHoofdbeheerders = new Set(
      (await db.select({ email: gebruikersTable.email }).from(gebruikersTable)
        .where(and(eq(gebruikersTable.rol, "hoofdbeheerder"), eq(gebruikersTable.actief, true))))
        .map((g) => g.email),
    );
    check("max-doorlooptijd-mail geadresseerd aan een actieve hoofdbeheerder", maxMail != null && actieveHoofdbeheerders.has(maxMail.naarEmail), maxMail?.naarEmail);

    // ── 7. Tijdlijn-logging ────────────────────────────────────────────────
    const tijdlijn = await db.select().from(workflowTransitieLogTable)
      .where(and(eq(workflowTransitieLogTable.entityType, OBJECT_TYPE), eq(workflowTransitieLogTable.entityId, OBJECT_ID)));
    const tijdlijnStatussen = new Set(tijdlijn.map((t) => t.naarStatus));
    check("tijdlijn logt herinnering_verstuurd + escalatie_stap_2", tijdlijnStatussen.has("herinnering_verstuurd") && tijdlijnStatussen.has("escalatie_stap_2"), [...tijdlijnStatussen]);

    // ── 8. Dashboard: escalaties zichtbaar en prioriteit = Kritiek ─────────
    const dash = await fetch(`${BASIS}/goedkeuring/dashboard?document_type=${DOC_TYPE}`, { headers });
    const dashJson = await dash.json() as Array<{ id: number; is_verlopen: boolean; escalaties: Array<{ type: string }> }>;
    const item = dashJson.find((i) => i.id === aanvraagId);
    check("dashboard bevat de aanvraag", Boolean(item));
    check("dashboard-item bevat escalatie_2", item?.escalaties.some((e) => e.type === "escalatie_2") === true, item?.escalaties);
    check('frontend-prioriteit = "kritiek" (Kritiek-badge)', item != null && bepaalPrioriteit(item) === "kritiek");

    // ── 9. Dedupe: tweede run maakt geen dubbele escalaties ───────────────
    const bw2 = await fetch(`${BASIS}/goedkeuring/bewaking/uitvoeren`, { method: "POST", headers });
    const bw2Json = await bw2.json() as { verwerkt: number };
    check("tweede bewakingsrun slaagt (200)", bw2.status === 200, bw2Json);
    check("tweede bewakingsrun verwerkt 0 stappen", bw2Json.verwerkt === 0, bw2Json.verwerkt);
    const escalaties2 = await db.select().from(goedkeuringEscalatiesTable)
      .where(eq(goedkeuringEscalatiesTable.aanvraagId, aanvraagId));
    check("tweede bewakingsrun: aantal escalaties ongewijzigd (dedupe)", escalaties2.length === escalaties.length, { eerste: escalaties.length, tweede: escalaties2.length });
  } finally {
    await ruimOp();
  }

  if (falen > 0) {
    console.error(`\n\x1b[31m${falen} check(s) gefaald.\x1b[0m`);
    process.exit(1);
  }
  console.log("\n\x1b[32mAlle checks geslaagd — escalaties worden aantoonbaar verstuurd bij een verlopen goedkeuringsaanvraag.\x1b[0m");
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
