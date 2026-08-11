// AKKOORD_01 — bewijs: de akkoordpoort onder uren en inkoop werkt echt.
// Test via HTTP tegen de draaiende api-server (nooit api-server-source importeren).
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-akkoord01.ts
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, like, inArray } from "drizzle-orm";
import { authenticator } from "otplib";
import {
  db, gebruikersTable, medewerkersTable, opdrachtenTable, urenRegistratiesTable,
  documentenTable, offertesTable, materiaalAanvragenTable, inkoopbonnenTable,
} from "@workspace/db";

const BASIS = process.env.BEWIJS_API_BASIS ?? `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const WW = `${randomBytes(12).toString("base64url")}Aa1!`;
const HB_EMAIL = "bewijs-akkoord01-hb@fps.local";
const MERK = "AKKOORD01-BEWIJS";

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: bewijsscript nooit tegen productie draaien.");
}

const fout: string[] = [];
function check(ok: boolean, regel: string): void {
  console.log(`${ok ? "✓" : "✗"} ${regel}`);
  if (!ok) { fout.push(regel); process.exitCode = 1; }
}

const TOTP = authenticator.generateSecret();

async function ruimOp(): Promise<void> {
  const opdr = await db.select({ id: opdrachtenTable.id }).from(opdrachtenTable).where(like(opdrachtenTable.titel, `${MERK}%`));
  const ids = opdr.map((o) => o.id);
  if (ids.length) {
    await db.delete(urenRegistratiesTable).where(inArray(urenRegistratiesTable.opdrachtId, ids));
    await db.delete(opdrachtenTable).where(inArray(opdrachtenTable.id, ids));
  }
  await db.delete(documentenTable).where(like(documentenTable.naam, `${MERK}%`));
  await db.delete(offertesTable).where(like(offertesTable.titel, `${MERK}%`));
  const gebr = await db.select({ id: gebruikersTable.id }).from(gebruikersTable).where(eq(gebruikersTable.email, HB_EMAIL));
  if (gebr.length) {
    await db.delete(medewerkersTable).where(inArray(medewerkersTable.gebruikerId, gebr.map((g) => g.id)));
    await db.delete(gebruikersTable).where(inArray(gebruikersTable.id, gebr.map((g) => g.id)));
  }
}

async function main(): Promise<void> {
  await ruimOp();

  const [hb] = await db.insert(gebruikersTable).values({
    naam: "Bewijs Akkoord01 HB", email: HB_EMAIL, rol: "hoofdbeheerder",
    wachtwoord: await bcrypt.hash(WW, 10), totpSecret: TOTP,
    tweeFactorIngeschakeld: true, actief: true,
  } as typeof gebruikersTable.$inferInsert).returning();
  await db.insert(medewerkersTable).values({
    gebruikerId: hb.id, naam: "Bewijs Akkoord01 HB",
  } as typeof medewerkersTable.$inferInsert);

  // Opdracht mét gekoppelde offerte onder de €10k-band: zonder bekend bedrag
  // valt de akkoordpoort fail-closed bóven de band (goedkeuring vereist).
  const [offKlein] = await db.insert(offertesTable).values({
    titel: `${MERK} offerte 500`, bedragInclBtw: 500, bedragExclBtw: 413,
  } as typeof offertesTable.$inferInsert).returning();
  const [opdracht] = await db.insert(opdrachtenTable).values({
    titel: `${MERK} testopdracht`, status: "actief", type: "aanneem", offerteId: offKlein.id,
  } as typeof opdrachtenTable.$inferInsert).returning();
  const [opdrachtZonderOfferte] = await db.insert(opdrachtenTable).values({
    titel: `${MERK} zonder offerte`, status: "actief", type: "aanneem",
  } as typeof opdrachtenTable.$inferInsert).returning();

  const login = await fetch(`${BASIS}/auth/mobile/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: HB_EMAIL, wachtwoord: WW, code: authenticator.generate(TOTP) }),
  });
  if (login.status !== 200) throw new Error(`login faalde: ${login.status} ${await login.text()}`);
  const { token } = (await login.json()) as { token: string };
  const hdrs = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const urenBody = (metOpdracht: boolean) => ({
    datum: "2026-08-10", begin_tijd: "08:00", eind_tijd: "10:00", pauze_minuten: 0,
    werkzaamheden: "bewijs", ...(metOpdracht ? {
      opdracht_id: opdracht.id, niet_in_begroting: true,
      niet_in_begroting_omschrijving: "bewijs akkoordpoort",
    } : {}),
  });

  // 1) uren op opdracht zonder akkoord → 422 AKKOORD_ONTBREEKT
  let r = await fetch(`${BASIS}/uren`, { method: "POST", headers: hdrs, body: JSON.stringify(urenBody(true)) });
  let j = await r.json().catch(() => ({}));
  check(r.status === 422 && (j as { code?: string }).code === "AKKOORD_ONTBREEKT",
    `uren op opdracht zonder akkoord geweigerd met 422 AKKOORD_ONTBREEKT (kreeg ${r.status} ${JSON.stringify(j).slice(0, 120)})`);

  // 2) uren zonder opdracht blijven toegestaan (§3.2)
  r = await fetch(`${BASIS}/uren`, { method: "POST", headers: hdrs, body: JSON.stringify(urenBody(false)) });
  check(r.status === 200 || r.status === 201, `uren zonder opdracht blijven toegestaan (kreeg ${r.status})`);

  // 3) grond C zonder herkomst → 422
  r = await fetch(`${BASIS}/opdrachten/${opdracht.id}/akkoord`, { method: "POST", headers: hdrs, body: JSON.stringify({ grond: "vrijgave_pl" }) });
  check(r.status === 422, `grond C zonder herkomst geweigerd (kreeg ${r.status})`);

  // 4) grond A zonder ondertekende offerte → 422
  r = await fetch(`${BASIS}/opdrachten/${opdracht.id}/akkoord`, { method: "POST", headers: hdrs, body: JSON.stringify({ grond: "ondertekening" }) });
  check(r.status === 422, `grond A zonder ondertekende offerte geweigerd (kreeg ${r.status})`);

  // 5) grond B zonder document → 422
  r = await fetch(`${BASIS}/opdrachten/${opdracht.id}/akkoord`, { method: "POST", headers: hdrs, body: JSON.stringify({ grond: "opdrachtbevestiging" }) });
  check(r.status === 422, `grond B zonder document geweigerd (kreeg ${r.status})`);

  // 6) grond C mét herkomst → 201, met condities
  r = await fetch(`${BASIS}/opdrachten/${opdracht.id}/akkoord`, {
    method: "POST", headers: hdrs,
    body: JSON.stringify({ grond: "vrijgave_pl", herkomst: "telefonisch akkoord bewijs", condities: { betaaltermijn_dagen: 30 } }),
  });
  j = await r.json().catch(() => ({}));
  const ak = j as { akkoord_grond?: string; conditie_betaaltermijn_dagen?: number };
  check(r.status === 201 && ak.akkoord_grond === "vrijgave_pl" && ak.conditie_betaaltermijn_dagen === 30,
    `grond C vastgelegd met condities (kreeg ${r.status} ${JSON.stringify(j).slice(0, 120)})`);

  // 7) tweede akkoord → 409
  r = await fetch(`${BASIS}/opdrachten/${opdracht.id}/akkoord`, {
    method: "POST", headers: hdrs, body: JSON.stringify({ grond: "vrijgave_pl", herkomst: "nogmaals" }),
  });
  check(r.status === 409, `tweede akkoord geweigerd met 409 (kreeg ${r.status})`);

  // 8) GET akkoord toont grond
  r = await fetch(`${BASIS}/opdrachten/${opdracht.id}/akkoord`, { headers: hdrs });
  j = await r.json().catch(() => ({}));
  check(r.status === 200 && (j as { akkoord_grond?: string }).akkoord_grond === "vrijgave_pl", `GET akkoord toont grond (kreeg ${r.status})`);

  // 9) uren op opdracht nu toegestaan
  r = await fetch(`${BASIS}/uren`, { method: "POST", headers: hdrs, body: JSON.stringify(urenBody(true)) });
  check(r.status === 200 || r.status === 201, `uren op opdracht mét akkoord toegestaan (kreeg ${r.status})`);

  // 10) condities bijwerken
  r = await fetch(`${BASIS}/opdrachten/${opdracht.id}/condities`, {
    method: "PATCH", headers: hdrs, body: JSON.stringify({ garantietermijn: "5 jaar" }),
  });
  j = await r.json().catch(() => ({}));
  check(r.status === 200 && (j as { conditie_garantietermijn?: string }).conditie_garantietermijn === "5 jaar",
    `condities bijwerken werkt (kreeg ${r.status})`);

  // 11) intrekken zonder reden → 400; met reden → 200; daarna uren weer 422
  r = await fetch(`${BASIS}/opdrachten/${opdracht.id}/akkoord`, { method: "DELETE", headers: hdrs, body: JSON.stringify({}) });
  check(r.status === 400, `intrekken zonder reden geweigerd (kreeg ${r.status})`);
  r = await fetch(`${BASIS}/opdrachten/${opdracht.id}/akkoord`, { method: "DELETE", headers: hdrs, body: JSON.stringify({ reden: "bewijs-test" }) });
  check(r.status === 200, `intrekken door hoofdbeheerder met reden werkt (kreeg ${r.status})`);
  r = await fetch(`${BASIS}/uren`, { method: "POST", headers: hdrs, body: JSON.stringify(urenBody(true)) });
  j = await r.json().catch(() => ({}));
  check(r.status === 422 && (j as { code?: string }).code === "AKKOORD_ONTBREEKT",
    `na intrekken zijn uren op de opdracht weer geblokkeerd (kreeg ${r.status})`);

  // 12) grond B: fout documenttype → 422; correct opdrachtbevestiging-document → 201
  const [offB] = await db.insert(offertesTable).values({
    titel: `${MERK} offerte B`, bedragInclBtw: 900, bedragExclBtw: 744,
  } as typeof offertesTable.$inferInsert).returning();
  const [opdrachtB] = await db.insert(opdrachtenTable).values({
    titel: `${MERK} grond-B`, status: "actief", type: "aanneem", offerteId: offB.id,
  } as typeof opdrachtenTable.$inferInsert).returning();

  // 11b) fail-closed: opdracht zonder offerte = onbekend bedrag → boven de band
  r = await fetch(`${BASIS}/opdrachten/${opdrachtZonderOfferte.id}/akkoord`, {
    method: "POST", headers: hdrs, body: JSON.stringify({ grond: "vrijgave_pl", herkomst: "telefonisch" }),
  });
  j = await r.json().catch(() => ({}));
  check(r.status === 422 && (j as { code?: string }).code === "GOEDKEURING_VEREIST",
    `onbekend bedrag (geen offerte) valt fail-closed boven de beleidsband (kreeg ${r.status})`);
  const [docFout] = await db.insert(documentenTable).values({
    naam: `${MERK} willekeurig doc`, documenttype: "testrapport", pdfUrl: "/objects/bewijs/dummy.pdf",
  } as typeof documentenTable.$inferInsert).returning();
  const [docGoed] = await db.insert(documentenTable).values({
    naam: `${MERK} opdrachtbevestiging`, documenttype: "opdrachtbevestiging", pdfUrl: "/objects/bewijs/dummy.pdf",
  } as typeof documentenTable.$inferInsert).returning();
  r = await fetch(`${BASIS}/opdrachten/${opdrachtB.id}/akkoord`, {
    method: "POST", headers: hdrs, body: JSON.stringify({ grond: "opdrachtbevestiging", document_id: docFout.id }),
  });
  check(r.status === 422, `grond B met verkeerd documenttype geweigerd (kreeg ${r.status})`);
  r = await fetch(`${BASIS}/opdrachten/${opdrachtB.id}/akkoord`, {
    method: "POST", headers: hdrs, body: JSON.stringify({ grond: "opdrachtbevestiging", document_id: docGoed.id }),
  });
  j = await r.json().catch(() => ({}));
  check(r.status === 201 && (j as { akkoord_grond?: string }).akkoord_grond === "opdrachtbevestiging",
    `grond B met geldige opdrachtbevestiging vastgelegd (kreeg ${r.status})`);

  // 13) §6 beleidsband: ≥ €10.000 (incl. btw) vereist eerst formele goedkeuring
  const [off12k] = await db.insert(offertesTable).values({
    titel: `${MERK} offerte 12k`, bedragInclBtw: 12000, bedragExclBtw: 9917,
  } as typeof offertesTable.$inferInsert).returning();
  const [opdr12k] = await db.insert(opdrachtenTable).values({
    titel: `${MERK} 12k`, status: "actief", type: "aanneem", offerteId: off12k.id,
  } as typeof opdrachtenTable.$inferInsert).returning();
  r = await fetch(`${BASIS}/opdrachten/${opdr12k.id}/akkoord`, {
    method: "POST", headers: hdrs, body: JSON.stringify({ grond: "vrijgave_pl", herkomst: "telefonisch, dhr. Test, 11-08" }),
  });
  j = await r.json().catch(() => ({}));
  check(r.status === 422 && (j as { code?: string }).code === "GOEDKEURING_VEREIST",
    `akkoord op €12.000 zonder formele goedkeuring geweigerd (kreeg ${r.status} ${JSON.stringify(j).slice(0, 100)})`);
  const [off8k] = await db.insert(offertesTable).values({
    titel: `${MERK} offerte 8k`, bedragInclBtw: 8000, bedragExclBtw: 6612,
  } as typeof offertesTable.$inferInsert).returning();
  const [opdr8k] = await db.insert(opdrachtenTable).values({
    titel: `${MERK} 8k`, status: "actief", type: "aanneem", offerteId: off8k.id,
  } as typeof opdrachtenTable.$inferInsert).returning();
  r = await fetch(`${BASIS}/opdrachten/${opdr8k.id}/akkoord`, {
    method: "POST", headers: hdrs, body: JSON.stringify({ grond: "vrijgave_pl", herkomst: "telefonisch, dhr. Test, 11-08" }),
  });
  check(r.status === 201, `akkoord op €8.000 onder de beleidsband toegestaan (kreeg ${r.status})`);

  // 14) DB-CHECK fail-closed: ongeldige akkoord-rij (grond B zonder document) wordt geweigerd
  let dbCheckOk = false;
  try {
    await db.insert(opdrachtenTable).values({
      titel: `${MERK} ongeldig`, status: "actief", type: "aanneem",
      akkoordGrond: "opdrachtbevestiging", akkoordOp: new Date(),
    } as typeof opdrachtenTable.$inferInsert);
  } catch { dbCheckOk = true; }
  check(dbCheckOk, "DB-CHECK weigert akkoord-rij zonder grondspecifiek bewijs (grond B zonder document)");

  // 15) meetendpoint
  r = await fetch(`${BASIS}/beheer/metingen/akkoord01`.replace("/beheer", ""), { headers: hdrs });
  j = await r.json().catch(() => ({}));
  const m = j as { t1_totalen_12mnd?: unknown; t4_opdrachten_akkoordstand?: unknown };
  check(r.status === 200 && !!m.t1_totalen_12mnd && !!m.t4_opdrachten_akkoordstand,
    `meetendpoint /metingen/akkoord01 levert tellingen (kreeg ${r.status})`);

  // 16) INKOOPPOORT (§3.3) via de echte goedkeuringsflow: een materiaal-
  // goedkeuring op een opdracht zonder akkoord moet 422 geven (en de hele
  // transactie terugrollen), mét akkoord moet er een concept-inkoopbon komen.
  const [offMat] = await db.insert(offertesTable).values({
    titel: `${MERK} offerte materiaal`, bedragInclBtw: 700, bedragExclBtw: 579,
  } as typeof offertesTable.$inferInsert).returning();
  const [opdrMat] = await db.insert(opdrachtenTable).values({
    titel: `${MERK} materiaalflow`, status: "actief", type: "aanneem", offerteId: offMat.id,
  } as typeof opdrachtenTable.$inferInsert).returning();

  r = await fetch(`${BASIS}/materiaal-aanvragen`, {
    method: "POST", headers: hdrs,
    body: JSON.stringify({ opdracht_id: opdrMat.id, reden: "nodig", omschrijving: `${MERK} brandkleppen`, volgens_opdracht: "ja" }),
  });
  j = await r.json().catch(() => ({}));
  const aanvraagId = (j as { id?: number }).id;
  check(r.status === 201 && !!aanvraagId, `materiaal-aanvraag aangemaakt (kreeg ${r.status})`);

  // 16a) goedkeuren zonder akkoord op de opdracht → 422 AKKOORD_ONTBREEKT
  r = await fetch(`${BASIS}/materiaal-aanvragen/${aanvraagId}`, {
    method: "PATCH", headers: hdrs, body: JSON.stringify({ status: "goedgekeurd" }),
  });
  j = await r.json().catch(() => ({}));
  check(r.status === 422 && (j as { code?: string }).code === "AKKOORD_ONTBREEKT",
    `materiaal-goedkeuring zonder akkoord geweigerd met 422 AKKOORD_ONTBREEKT (kreeg ${r.status} ${JSON.stringify(j).slice(0, 120)})`);

  // 16b) rollback-bewijs: de aanvraag staat nog op "nieuw" en er hangt geen bon
  const [naWeigering] = await db.select().from(materiaalAanvragenTable)
    .where(eq(materiaalAanvragenTable.id, aanvraagId!));
  check(naWeigering?.status === "nieuw" && naWeigering?.inkoopbonId == null,
    `geweigerde goedkeuring is volledig teruggerold (status=${naWeigering?.status}, inkoopbonId=${naWeigering?.inkoopbonId})`);
  const bonnenZonder = await db.select({ id: inkoopbonnenTable.id }).from(inkoopbonnenTable)
    .where(eq(inkoopbonnenTable.opdrachtId, opdrMat.id));
  check(bonnenZonder.length === 0, `geen (wees-)inkoopbon aangemaakt zonder akkoord (vond ${bonnenZonder.length})`);

  // 16c) akkoord vastleggen (grond C, onder de band) → daarna slaagt goedkeuren
  r = await fetch(`${BASIS}/opdrachten/${opdrMat.id}/akkoord`, {
    method: "POST", headers: hdrs, body: JSON.stringify({ grond: "vrijgave_pl", herkomst: "telefonisch akkoord materiaalbewijs" }),
  });
  check(r.status === 201, `akkoord op materiaalopdracht vastgelegd (kreeg ${r.status})`);

  r = await fetch(`${BASIS}/materiaal-aanvragen/${aanvraagId}`, {
    method: "PATCH", headers: hdrs, body: JSON.stringify({ status: "goedgekeurd" }),
  });
  j = await r.json().catch(() => ({}));
  const goed = j as { status?: string; inkoopbon?: { id?: number; kenmerk?: string } };
  check(r.status === 200 && goed.status === "goedgekeurd" && !!goed.inkoopbon?.id && !!goed.inkoopbon?.kenmerk,
    `goedkeuring mét akkoord levert concept-inkoopbon op (kreeg ${r.status} ${JSON.stringify(j).slice(0, 160)})`);

  // 16d) de bon staat écht als concept op de juiste opdracht, via het ene pad
  const [bon] = goed.inkoopbon?.id
    ? await db.select().from(inkoopbonnenTable).where(eq(inkoopbonnenTable.id, goed.inkoopbon.id))
    : [];
  check(!!bon && bon.status === "concept" && bon.opdrachtId === opdrMat.id && bon.offerteId === offMat.id,
    `inkoopbon is concept op de juiste opdracht+offerte (status=${bon?.status}, opdracht=${bon?.opdrachtId}, offerte=${bon?.offerteId})`);
  const [naGoedkeuring] = await db.select().from(materiaalAanvragenTable)
    .where(eq(materiaalAanvragenTable.id, aanvraagId!));
  check(naGoedkeuring?.inkoopbonId === goed.inkoopbon?.id,
    `aanvraag is gekoppeld aan de aangemaakte bon (inkoopbonId=${naGoedkeuring?.inkoopbonId})`);

  await ruimOp();

  if (fout.length) {
    console.error(`\n✗ ${fout.length} controle(s) gefaald.`);
  } else {
    console.log("\n✓ Alle AKKOORD_01-controles geslaagd.");
  }
}

main().catch(async (e) => {
  console.error("FOUT:", e);
  process.exitCode = 1;
  await ruimOp().catch(() => {});
});
