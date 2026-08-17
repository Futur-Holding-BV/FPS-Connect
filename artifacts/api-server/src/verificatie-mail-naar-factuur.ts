// Verificatie — Task 793: bewijs de mail-naar-factuur-pijplijn met een
// (gesimuleerde) echte factuurmail.
//
// Wat wordt hier ECHT doorlopen (ongewijzigde productiecode):
//   - verwerkFactuurmails: claim/dedupe op werk_inbox_mails
//   - bijlage → analyseerFactuurVoorStroom (echte AI-extractie via de gateway)
//   - PDF-opslag in object storage, factuurrij + AI-voorstel + tijdlijn
//   - leverancierherkenning in het LEVERANCIERSREGISTER (LEVERANCIER_01) en
//     routering: inkoper via inkoopbon (directe id-vergelijking op
//     leverancier_id), anders directie; bij onzekerheid controle door
//     administratie. crm_klanten wordt bewust NIET aangeraakt; het script
//     bewijst dat de telling van crm_klanten voor/na gelijk blijft.
//   - §8: leveranciersreactie in dezelfde mailthread (conversationId) heropent
//     een afgewezen factuur
//
// Alleen het Graph-HTTP-randje is vervangen (zetBijlagenOphalerVoorVerificatie):
// op dev is geen Microsoft-account gekoppeld, dus de bijlage komt uit een
// hier gegenereerde, realistische factuur-PDF in plaats van uit Graph.
//
// Draaien: pnpm --filter @workspace/api-server exec tsx src/verificatie-mail-naar-factuur.ts
import PDFDocument from "pdfkit";
import { and, count, eq, inArray } from "drizzle-orm";
import {
  db,
  facturenTable,
  factuurSignalenTable,
  factuurTijdlijnTable,
  factuurCorrespondentieTable,
  crmKlantenTable,
  gebruikersTable,
  leveranciersTable,
  opdrachtenTable,
  inkoopbonnenTable,
  werkInboxMailboxenTable,
  werkInboxMailsTable,
  werkInboxKoppelingenTable,
} from "@workspace/db";

// De api-server-build injecteert `globalThis.require` via een esbuild-banner;
// onder tsx bestaat die niet, dus hier zelf zetten vóór de service laadt
// (objectStorage.ts gebruikt hem voor lazy GCS-import).
import { createRequire } from "node:module";
(globalThis as typeof globalThis & { require?: NodeRequire }).require ??= createRequire(import.meta.url);

// Dynamische import ná de require-polyfill (statische imports zouden hoisten).
const { verwerkFactuurmails, zetBijlagenOphalerVoorVerificatie } =
  await import("./services/factuurstroomService");

const MARK = "E2E-MAILFACTUUR";
const LEVERANCIER_NAAM = `${MARK} De Vries Bouwmaterialen BV`;
const FACTUURNUMMER = `DV-2026-${Date.now() % 100000}`;
const CONVERSATIE = `${MARK}-conv-${Date.now()}`;
// Uniek per run zodat cleanup nooit bestaande mailbox- of maildata kan raken.
const MAILBOX_ADRES = `facturen-e2e-${Date.now()}-${process.pid}@fpsbrandpreventie.nl`;

function eis(v: boolean, stap: string, detail: string): void {
  if (!v) throw new Error(`FAIL — ${stap}: ${detail}`);
}

// ── Realistische factuur-PDF genereren ───────────────────────────────────────

async function maakFactuurPdf(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text(LEVERANCIER_NAAM, { align: "left" });
    doc.fontSize(10).text("Industrieweg 14, 5432 KB Veghel\nKvK 12345678 — BTW NL001234567B01");
    doc.moveDown(2);
    doc.fontSize(14).text("FACTUUR", { underline: true });
    doc.moveDown();
    doc.fontSize(10);
    doc.text(`Factuurnummer: ${FACTUURNUMMER}`);
    doc.text("Factuurdatum: 05-08-2026");
    doc.text("Vervaldatum: 04-09-2026");
    doc.moveDown();
    doc.text("Aan:");
    doc.text("FPS Brandpreventie BV");
    doc.text("t.a.v. de administratie");
    doc.moveDown();
    doc.text("Omschrijving: Levering brandwerende beplating en kit, project Veghel, week 31.");
    doc.moveDown();
    doc.text("Bedrag exclusief BTW:  € 1.250,00");
    doc.text("BTW 21%:               € 262,50");
    doc.text("Totaal inclusief BTW:  € 1.512,50");
    doc.moveDown();
    doc.text("Gelieve te betalen op IBAN NL91ABNA0417164300 t.n.v. De Vries Bouwmaterialen BV");
    doc.text(`onder vermelding van ${FACTUURNUMMER}.`);
    doc.end();
  });
}

// ── Seeds & cleanup ──────────────────────────────────────────────────────────

let leverancierId = 0;
let crmAantalVoor = -1;
let opdrachtId = 0;
let inkoopbonId = 0;
let mailboxId = 0;
let seedGebruikerId = 0;
const seedMessageIds: string[] = [];

async function cleanup(): Promise<void> {
  zetBijlagenOphalerVoorVerificatie(null);
  const facturen = await db.select({ id: facturenTable.id, pdfUrl: facturenTable.pdfUrl })
    .from(facturenTable)
    .where(eq(facturenTable.conversationId, CONVERSATIE));
  const ids = facturen.map((f) => f.id);
  if (ids.length > 0) {
    await db.delete(factuurTijdlijnTable).where(inArray(factuurTijdlijnTable.factuurId, ids));
    await db.delete(factuurSignalenTable).where(inArray(factuurSignalenTable.factuurId, ids));
    await db.delete(factuurCorrespondentieTable).where(inArray(factuurCorrespondentieTable.factuurId, ids));
    await db.delete(werkInboxKoppelingenTable).where(and(
      eq(werkInboxKoppelingenTable.entityType, "factuur"),
      inArray(werkInboxKoppelingenTable.entityId, ids),
    ));
    await db.delete(facturenTable).where(inArray(facturenTable.id, ids));
  }
  // Object storage opruimen: pad zit als querystring in pdfUrl; deleteBestand
  // verwacht het genormaliseerde /objects/{subPath}-formaat.
  for (const f of facturen) {
    const pad = f.pdfUrl ? new URL(f.pdfUrl, "http://x").searchParams.get("path") : null;
    if (!pad) continue;
    const objectPath = pad.startsWith("/objects/") ? pad : `/objects/${pad}`;
    const { ObjectStorageService } = await import("./lib/objectStorage");
    const storage = new ObjectStorageService();
    await storage.deleteBestand(objectPath);
    // Controleer dat het bestand echt weg is (getObjectEntityFile gooit bij afwezigheid)
    let nogAanwezig = false;
    try {
      await storage.getObjectEntityFile(objectPath);
      nogAanwezig = true;
    } catch { /* verwacht: bestand bestaat niet meer */ }
    if (nogAanwezig) throw new Error(`FAIL — cleanup: PDF ${objectPath} staat nog in object storage`);
  }
  // Alleen de in déze run geseedde mails verwijderen (invocatie-specifiek)
  if (seedGebruikerId && seedMessageIds.length > 0) {
    await db.delete(werkInboxMailsTable).where(and(
      eq(werkInboxMailsTable.gebruikerId, seedGebruikerId),
      inArray(werkInboxMailsTable.messageId, seedMessageIds),
    ));
  }
  if (mailboxId) await db.delete(werkInboxMailboxenTable).where(eq(werkInboxMailboxenTable.id, mailboxId));
  if (inkoopbonId) await db.delete(inkoopbonnenTable).where(eq(inkoopbonnenTable.id, inkoopbonId));
  if (opdrachtId) await db.delete(opdrachtenTable).where(eq(opdrachtenTable.id, opdrachtId));
  if (leverancierId) await db.delete(leveranciersTable).where(eq(leveranciersTable.id, leverancierId));
}

async function main(): Promise<void> {
  try {
    // ── Stap 0: omgeving klaarzetten ─────────────────────────────────────────
    const [admin] = await db.select({ id: gebruikersTable.id, naam: gebruikersTable.naam })
      .from(gebruikersTable)
      .where(and(eq(gebruikersTable.rol, "hoofdbeheerder"), eq(gebruikersTable.actief, true)))
      .limit(1);
    eis(!!admin, "stap 0", "geen actieve hoofdbeheerder gevonden");
    const uid = admin.id;
    seedGebruikerId = uid;

    // LEVERANCIER_01: de testleverancier staat in het LEVERANCIERSREGISTER,
    // bewust NIET in crm_klanten — acceptatie: een factuur van een leverancier
    // die wél in leveranciers maar níét in crm_klanten staat, koppelt correct.
    // De telling van crm_klanten moet voor/na de run gelijk blijven.
    const [{ aantal: crmVoor }] = await db.select({ aantal: count() }).from(crmKlantenTable);
    crmAantalVoor = Number(crmVoor);

    const [lev] = await db.insert(leveranciersTable)
      .values({ naam: LEVERANCIER_NAAM, bron: "handmatig" })
      .returning({ id: leveranciersTable.id });
    leverancierId = lev.id;

    const [opdr] = await db.insert(opdrachtenTable)
      .values({ titel: `${MARK} opdracht inkoperroute` })
      .returning({ id: opdrachtenTable.id });
    opdrachtId = opdr.id;

    const [bon] = await db.insert(inkoopbonnenTable).values({
      opdrachtId,
      leverancier: LEVERANCIER_NAAM,
      leverancierId,
      status: "goedgekeurd",
      goedgekeurdDoorId: uid,
      goedgekeurdOp: new Date(),
    }).returning({ id: inkoopbonnenTable.id });
    inkoopbonId = bon.id;

    const [mb] = await db.insert(werkInboxMailboxenTable).values({
      emailAdres: MAILBOX_ADRES,
      label: `${MARK} factuurmailbox`,
      actief: true,
      modus: "verwerken",
      isFactuurmailbox: true,
    }).returning({ id: werkInboxMailboxenTable.id });
    mailboxId = mb.id;

    // ── Stap 1: "gesynchroniseerde" factuurmail + Graph-bijlage-simulatie ────
    const pdf = await maakFactuurPdf();
    const msg1 = `${MARK}-msg-1-${Date.now()}`;
    seedMessageIds.push(msg1);
    await db.insert(werkInboxMailsTable).values({
      messageId: msg1,
      gebruikerId: uid,
      mailboxAdres: MAILBOX_ADRES,
      onderwerp: `Factuur ${FACTUURNUMMER} — De Vries Bouwmaterialen`,
      afzenderNaam: "Administratie De Vries",
      afzenderEmail: "administratie@devriesbouw.nl",
      ontvangenOp: new Date(),
      snippet: "Bijgaand onze factuur voor de levering van week 31.",
      heeftBijlage: true,
      conversationId: CONVERSATIE,
    });

    zetBijlagenOphalerVoorVerificatie(async (_uid, _mb, messageId) => {
      if (messageId === msg1) {
        return [{ id: "att-1", name: `factuur-${FACTUURNUMMER}.pdf`, contentType: "application/pdf", size: pdf.length, contentBytes: pdf.toString("base64") }];
      }
      return []; // reactiemail heeft geen bijlage nodig
    });

    console.log("Stap 1: factuurmail gesynchroniseerd (gesimuleerd Graph-randje), pijplijn draaien…");
    const res1 = await verwerkFactuurmails(uid);
    eis(res1.verwerkt === 1, "stap 1 pijplijn", `verwerkt=${res1.verwerkt}`);

    // ── Stap 2: factuur + AI-voorstel + routering + tijdlijn controleren ─────
    const [factuur] = await db.select().from(facturenTable)
      .where(eq(facturenTable.conversationId, CONVERSATIE)).limit(1);
    eis(!!factuur, "stap 2 factuur", "geen factuur aangemaakt uit de mail");
    eis(factuur.bron === "mailbox" && factuur.aiGelezen === true, "stap 2 bron/AI",
      JSON.stringify({ bron: factuur.bron, aiGelezen: factuur.aiGelezen }));
    eis(!!factuur.aiVoorstelStroom, "stap 2 AI-voorstel", "aiVoorstelStroom is leeg");
    eis(factuur.factuurnummer === FACTUURNUMMER, "stap 2 factuurnummer",
      `AI las "${factuur.factuurnummer}", verwacht "${FACTUURNUMMER}"`);
    eis(factuur.leverancierId === leverancierId, "stap 2 leveranciersregister-koppeling",
      `leverancierId=${factuur.leverancierId}, verwacht ${leverancierId} (uit leveranciers, niet crm_klanten)`);
    eis(factuur.pdfUrl != null && factuur.pdfUrl.startsWith("/api/storage/objects/"), "stap 2 PDF-opslag", String(factuur.pdfUrl));

    // Deterministisch routeringsbewijs: de PDF is bewust volledig en eenduidig,
    // dus de AI mag géén onzekere velden melden. Er is een goedgekeurde
    // inkoopbon voor deze leverancier geseed, dus de factuur MOET op de
    // inkoperroute uitkomen (niet directie). Elk ander resultaat = FAIL.
    const onzeker = (factuur.onzekereVelden as string[] | null) ?? [];
    eis(factuur.status === "wacht_op_inkoper", "stap 2 inkoperroute",
      `status=${factuur.status}, onzekere velden: [${onzeker.join(", ")}] (verwacht wacht_op_inkoper via inkoopbon)`);
    eis(factuur.inkoperId === uid, "stap 2 inkoper-id",
      `inkoperId=${factuur.inkoperId}, verwacht ${uid} (goedkeurder van de geseedde inkoopbon)`);
    console.log(`Stap 2: factuur #${factuur.id} → inkoperroute (inkoper via directe leverancier_id-match op de inkoopbon, wacht op bevestiging)`);

    const tijdlijn1 = await db.select().from(factuurTijdlijnTable)
      .where(eq(factuurTijdlijnTable.factuurId, factuur.id));
    eis(tijdlijn1.some((r) => /binnengekomen via de mail/i.test(r.tekst)), "stap 2 tijdlijn",
      JSON.stringify(tijdlijn1.map((r) => r.tekst)));
    const [koppeling] = await db.select().from(werkInboxKoppelingenTable).where(and(
      eq(werkInboxKoppelingenTable.entityType, "factuur"),
      eq(werkInboxKoppelingenTable.entityId, factuur.id),
    ));
    eis(!!koppeling, "stap 2 mailkoppeling", "geen werk-inbox-koppeling mail↔factuur");
    console.log("Stap 2: AI-voorstel, CRM-koppeling, PDF-opslag, tijdlijn en mailkoppeling kloppen.");

    // Dedupe: nogmaals draaien mag niets nieuws opleveren
    const res1b = await verwerkFactuurmails(uid);
    eis(res1b.verwerkt === 0, "stap 2 dedupe", `tweede run verwerkte ${res1b.verwerkt} mails`);

    // ── Stap 3: afwijzen, daarna reactie in dezelfde thread → heropenen ──────
    await db.update(facturenTable).set({
      status: "afgekeurd",
      afwijsredenCode: "bedrag_wijkt_af",
      afgekeurdOp: new Date(),
      statusVoorAfwijzing: factuur.status,
      bijgewerktOp: new Date(),
    }).where(eq(facturenTable.id, factuur.id));

    const msg2 = `${MARK}-msg-2-${Date.now()}`;
    seedMessageIds.push(msg2);
    await db.insert(werkInboxMailsTable).values({
      messageId: msg2,
      gebruikerId: uid,
      mailboxAdres: MAILBOX_ADRES,
      onderwerp: `RE: Factuur ${FACTUURNUMMER} — De Vries Bouwmaterialen`,
      afzenderNaam: "Administratie De Vries",
      afzenderEmail: "administratie@devriesbouw.nl",
      ontvangenOp: new Date(),
      snippet: "Excuses, hierbij de toelichting op het bedrag zoals gevraagd.",
      heeftBijlage: false,
      conversationId: CONVERSATIE,
    });

    const res2 = await verwerkFactuurmails(uid);
    eis(res2.verwerkt === 1, "stap 3 pijplijn", `verwerkt=${res2.verwerkt}`);

    const alle = await db.select({ id: facturenTable.id }).from(facturenTable)
      .where(eq(facturenTable.conversationId, CONVERSATIE));
    eis(alle.length === 1, "stap 3 geen duplicaat", `reactie maakte ${alle.length} facturen (verwacht 1)`);

    const [heropend] = await db.select().from(facturenTable).where(eq(facturenTable.id, factuur.id));
    eis(heropend.status === "controle_nodig", "stap 3 heropend", `status=${heropend.status}`);
    const tijdlijn2 = await db.select().from(factuurTijdlijnTable)
      .where(eq(factuurTijdlijnTable.factuurId, factuur.id));
    eis(tijdlijn2.some((r) => /heropend/i.test(r.tekst)), "stap 3 tijdlijn heropend",
      JSON.stringify(tijdlijn2.map((r) => r.tekst)));
    const inkomend = await db.select().from(factuurCorrespondentieTable).where(and(
      eq(factuurCorrespondentieTable.factuurId, factuur.id),
      eq(factuurCorrespondentieTable.richting, "inkomend"),
    ));
    eis(inkomend.length === 1, "stap 3 correspondentie", `inkomend=${inkomend.length}`);
    const signalen = await db.select().from(factuurSignalenTable)
      .where(eq(factuurSignalenTable.factuurId, factuur.id));
    eis(signalen.some((s) => /gereageerd op de afgewezen factuur/i.test(s.omschrijving)),
      "stap 3 signaal", JSON.stringify(signalen.map((s) => s.omschrijving)));
    console.log("Stap 3: reactie in dezelfde mailthread heropende de afgewezen factuur (controle administratie) — met tijdlijn, correspondentie en signaal.");

    // ── Stap 4 (LEVERANCIER_01 acceptatie): klantenregister onaangeroerd ─────
    const [{ aantal: crmNa }] = await db.select({ aantal: count() }).from(crmKlantenTable);
    eis(Number(crmNa) === crmAantalVoor, "stap 4 crm_klanten intact",
      `crm_klanten voor=${crmAantalVoor}, na=${Number(crmNa)} — de pijplijn mag het klantenregister niet raken`);
    console.log(`Stap 4: crm_klanten-telling voor/na gelijk (${crmAantalVoor}) — klantenregister onaangeroerd.`);

    console.log("\nALLE STAPPEN GESLAAGD — mail-naar-factuur-pijplijn bewezen (Graph-randje gesimuleerd, rest productiecode).");
  } finally {
    await cleanup();
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exitCode = 1; });
