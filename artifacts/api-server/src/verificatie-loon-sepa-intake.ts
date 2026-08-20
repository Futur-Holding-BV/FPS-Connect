// Verificatie — LOON_01 Schakel 1: bewijs de mail-naar-salarisarchief-pijplijn
// met een (gesimuleerd) echt binnengekomen SEPA-loonbestand van SCAB.
//
// Wat wordt hier ECHT doorlopen (ongewijzigde productiecode):
//   - verwerkLoonSepaMails: mailboxselectie (actief+verwerken), claim/dedupe
//   - PAIN.001-herkenning op namespace (niet op extensie)
//   - werkgever-herkenning (IBAN/SCAB-afzender/debiteurnaam), periode uit ReqdExctnDt
//   - opslag in object storage + sepa_bestanden status 'ontvangen' + audit
//   - twijfelpad: onbekende werkgever → wél opslaan, onvolledig + signaal
//   - status blijft ALTIJD 'ontvangen' — nooit automatisch klaar_voor_bank
//
// Alleen het Graph-HTTP-randje is vervangen (zetLoonSepaBijlagenOphalerVoorVerificatie).
//
// Draaien: pnpm --filter @workspace/api-server exec tsx src/verificatie-loon-sepa-intake.ts
import { and, eq, like } from "drizzle-orm";
import {
  db,
  sepaBestandenTable,
  salarisdocumentAuditTable,
  factuurSignalenTable,
  werkgeversTable,
  werkInboxMailboxenTable,
  werkInboxMailsTable,
} from "@workspace/db";

import { createRequire } from "node:module";
(globalThis as typeof globalThis & { require?: NodeRequire }).require ??= createRequire(import.meta.url);

const { verwerkLoonSepaMails, zetLoonSepaBijlagenOphalerVoorVerificatie } =
  await import("./services/loonSepaIntakeService");

const MARK = "E2E-LOONSEPA";
const MAILBOX_ADRES = `salaris-e2e-${Date.now()}-${process.pid}@fpsbrandpreventie.nl`;
const IBAN = "NL91ABNA0417164300";

function eis(v: boolean, stap: string, detail: string): void {
  if (!v) throw new Error(`FAIL — ${stap}: ${detail}`);
}

function painXml(opts: { msgId: string; dbtrNaam: string; iban: string; datum: string }): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr><MsgId>${opts.msgId}</MsgId><NbOfTxs>12</NbOfTxs><CtrlSum>34567.89</CtrlSum></GrpHdr>
    <PmtInf>
      <ReqdExctnDt>${opts.datum}</ReqdExctnDt>
      <Dbtr><Nm>${opts.dbtrNaam}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${opts.iban}</IBAN></Id></DbtrAcct>
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;
}

let mailboxId = 0;
const mailIds: number[] = [];
let werkgeverId = 0;

async function opruimen(): Promise<void> {
  await db.delete(factuurSignalenTable).where(like(factuurSignalenTable.mailMessageId, `${MARK}%`));
  const sepas = await db.select({ id: sepaBestandenTable.id }).from(sepaBestandenTable)
    .where(like(sepaBestandenTable.bronMailMessageId, `${MARK}%`));
  for (const s of sepas) {
    await db.delete(salarisdocumentAuditTable).where(eq(salarisdocumentAuditTable.sepaId, s.id));
    await db.delete(sepaBestandenTable).where(eq(sepaBestandenTable.id, s.id));
  }
  await db.delete(werkInboxMailsTable).where(eq(werkInboxMailsTable.mailboxAdres, MAILBOX_ADRES));
  if (mailboxId) await db.delete(werkInboxMailboxenTable).where(eq(werkInboxMailboxenTable.id, mailboxId));
  if (werkgeverId) await db.delete(werkgeversTable).where(eq(werkgeversTable.id, werkgeverId));
}

try {
  // ── Opzet: werkgever met bekend IBAN + actieve verwerken-mailbox ────────────
  const { caoCatalogusTable } = await import("@workspace/db");
  const [cao] = await db.select({ id: caoCatalogusTable.id })
    .from(caoCatalogusTable)
    .where(eq(caoCatalogusTable.code, "ONBEKEND"));
  if (!cao) throw new Error("CAO-catalogus ontbreekt");
  const [wg] = await db.insert(werkgeversTable).values({
    naam: `${MARK} Testwerkgever BV`,
    caoId: cao.id,
    scabEmailAdres: "loon@scab-e2e.nl",
  }).returning();
  werkgeverId = wg.id;
  // ADMINISTRATIE_01 fase 2: het loonnummer staat niet meer op werkgevers.iban
  // maar als bankrekening met doel "loon".
  const { werkgeverBankrekeningenTable } = await import("@workspace/db");
  await db.insert(werkgeverBankrekeningenTable).values({
    werkgeverId: wg.id,
    iban: IBAN,
    tenaamstelling: `${MARK} Testwerkgever BV`,
    doelen: ["loon"],
  });

  const [mb] = await db.insert(werkInboxMailboxenTable).values({
    emailAdres: MAILBOX_ADRES,
    label: "Salaris e2e",
    actief: true,
    modus: "verwerken",
    isFactuurmailbox: false,
  }).returning();
  mailboxId = mb.id;

  // Bestaande gebruiker als 'eigenaar' van de mailrij (FK-eis).
  const { gebruikersTable } = await import("@workspace/db");
  const [eersteGebruiker] = await db.select({ id: gebruikersTable.id }).from(gebruikersTable).limit(1);
  const gid = eersteGebruiker?.id ?? 0;
  eis(!!gid, "opzet", "geen gebruiker in dev-db");

  const maakMail = async (nr: number, afzender: string) => {
    const [rij] = await db.insert(werkInboxMailsTable).values({
      messageId: `${MARK}-${Date.now()}-${nr}`,
      gebruikerId: gid,
      mailboxAdres: MAILBOX_ADRES,
      onderwerp: `Betaalbestand salarissen periode 2026-07 (${nr})`,
      afzenderNaam: "SCAB Salarisadministratie",
      afzenderEmail: afzender,
      ontvangenOp: new Date(),
      heeftBijlage: true,
    }).returning();
    mailIds.push(rij.id);
    return rij.messageId;
  };

  const msg1 = await maakMail(1, "loon@scab-e2e.nl");     // volledig herkenbaar
  const msg2 = await maakMail(2, "onbekend@elders.nl");   // twijfelpad

  zetLoonSepaBijlagenOphalerVoorVerificatie(async (_uid, _mailbox, messageId) => {
    const xml = messageId === msg1
      ? painXml({ msgId: `${MARK}-A`, dbtrNaam: `${MARK} Testwerkgever BV`, iban: IBAN, datum: "2026-07-24" })
      : painXml({ msgId: `${MARK}-B`, dbtrNaam: "Volstrekt Onbekende Firma", iban: "NL00FOUT0000000000", datum: "gebroken-datum" });
    return [{
      name: `SEPA_${messageId}.xml`,
      contentType: "application/xml",
      contentBytes: Buffer.from(xml, "utf-8").toString("base64"),
    }] as any;
  });

  // ── Run 1 ───────────────────────────────────────────────────────────────────
  const r1 = await verwerkLoonSepaMails();
  console.log("run 1:", r1);
  eis(r1.verwerkt === 2, "run 1", `verwacht 2 verwerkte mails, kreeg ${r1.verwerkt}`);

  const [sepa1] = await db.select().from(sepaBestandenTable)
    .where(eq(sepaBestandenTable.bronMailMessageId, msg1));
  eis(!!sepa1, "schakel 1", "geen sepa-rij voor herkenbare mail");
  eis(sepa1.status === "ontvangen", "status", `status=${sepa1.status}, moet 'ontvangen' blijven`);
  eis(sepa1.werkgeverId === werkgeverId, "werkgever", `werkgeverId=${sepa1.werkgeverId}`);
  eis(sepa1.periodeJaar === 2026 && sepa1.periodeMaand === 7, "periode", `${sepa1.periodeJaar}-${sepa1.periodeMaand}`);
  eis(sepa1.onvolledig === false, "volledig", "ten onrechte onvolledig gemarkeerd");
  eis(sepa1.bron === "mail" && sepa1.bronMailboxAdres === MAILBOX_ADRES, "herkomst", "bronmail-koppeling ontbreekt");
  eis(!!sepa1.objectPath && sepa1.objectPath.length > 5, "opslag", "geen objectPath");
  console.log(`OK — herkenbaar bestand: sepa#${sepa1.id} ontvangen, werkgever+periode gekoppeld, object=${sepa1.objectPath}`);

  const audits = await db.select().from(salarisdocumentAuditTable)
    .where(and(eq(salarisdocumentAuditTable.sepaId, sepa1.id), eq(salarisdocumentAuditTable.actie, "mail_intake")));
  eis(audits.length === 1, "audit", `verwacht 1 mail_intake-audit, kreeg ${audits.length}`);

  const [sepa2] = await db.select().from(sepaBestandenTable)
    .where(eq(sepaBestandenTable.bronMailMessageId, msg2));
  eis(!!sepa2, "twijfelpad", "onzeker bestand is NIET opgeslagen (moet wél)");
  eis(sepa2.onvolledig === true, "twijfelpad", "onzeker bestand niet als onvolledig gemarkeerd");
  eis(sepa2.werkgeverId === null, "twijfelpad", "werkgever gegokt terwijl die onzeker is");
  eis(sepa2.status === "ontvangen", "twijfelpad", `status=${sepa2.status}`);
  const signalen = await db.select().from(factuurSignalenTable)
    .where(and(eq(factuurSignalenTable.mailMessageId, msg2), eq(factuurSignalenTable.type, "loon_sepa_onvolledig")));
  eis(signalen.length === 1, "gebeurtenis", `verwacht 1 signaal, kreeg ${signalen.length}`);
  console.log(`OK — twijfelpad: sepa#${sepa2.id} opgeslagen als onvolledig + gebeurtenis op dashboard`);

  // ── Run 2: idempotentie ─────────────────────────────────────────────────────
  const r2 = await verwerkLoonSepaMails();
  const alle = await db.select({ id: sepaBestandenTable.id }).from(sepaBestandenTable)
    .where(like(sepaBestandenTable.bronMailMessageId, `${MARK}%`));
  eis(alle.length === 2, "idempotentie", `run 2 maakte extra rijen: totaal ${alle.length}`);
  console.log(`OK — idempotentie: run 2 (verwerkt=${r2.verwerkt}) maakte geen dubbele rijen`);

  console.log("\nALLE CONTROLES GESLAAGD — LOON_01 Schakel 1 bewezen.");
} finally {
  zetLoonSepaBijlagenOphalerVoorVerificatie(null);
  await opruimen();
  process.exit(0);
}
