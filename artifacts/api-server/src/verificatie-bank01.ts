/**
 * BANK_01 ketenbewijs op de ontwikkelomgeving.
 *
 * Beproeft de echte importtransactie en ruimt alle database- en objectdata op.
 * Nooit uitvoeren in productie.
 *
 * Draaien:
 *   pnpm --filter @workspace/api-server exec tsx src/verificatie-bank01.ts
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  accountviewExportLogsTable,
  bankAfschriftenTable,
  bankAfletterAuditTable,
  bankAfletterVoorstellenTable,
  bankImportArchievenTable,
  bankImportsTable,
  bankMailbijlageClaimsTable,
  bankMutatiesTable,
  betaalbatchRegelsTable,
  betaalbatchesTable,
  db,
  facturenTable,
  gebruikersTable,
  mailWachtrijTable,
  werkInboxMailsTable,
  werkgeverBankrekeningenTable,
  werkgeversTable,
} from "@workspace/db";
import { and, eq, inArray, like, or, sql } from "drizzle-orm";
import {
  exporteerBankmutatieNaarAccountView,
  herstelOnzekereBankexport,
} from "./services/accountviewExportService";
import {
  berekenSha256,
  importeerBankafschrift,
  pasToeAfletterVoorstel,
} from "./services/bankafschriftImportService";
import {
  bankCentenNaarEuroTekst,
  bankEuroTekstNaarCenten,
} from "./lib/bankafschriftTypes";
import {
  claimBijlage,
  verwerkBankmail,
} from "./services/bankafschriftMailboxService";

(globalThis as typeof globalThis & { require?: NodeRequire }).require ??= createRequire(import.meta.url);

function weigerBuitenDev(): void {
  if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
    throw new Error("GEWEIGERD: BANK_01-ketenbewijs mag alleen tegen de ontwikkelomgeving draaien");
  }
}

function bewijs(tekst: string): void {
  console.log(`✓ ${tekst}`);
}

async function ruimOudeBewijsdataOp(
  storage: { deleteObjectEntity: (objectPath: string) => Promise<unknown> },
): Promise<void> {
  await db.delete(bankMailbijlageClaimsTable)
    .where(like(bankMailbijlageClaimsTable.mailMessageId, "BANK01-BEWIJS-%"));
  await db.delete(werkInboxMailsTable)
    .where(like(werkInboxMailsTable.messageId, "BANK01-BEWIJS-%"));
  const imports = await db.select({ id: bankImportsTable.id }).from(bankImportsTable)
    .where(like(bankImportsTable.bestandsnaam, "BANK01-BEWIJS-%"));
  const importIds = imports.map((i) => i.id);
  if (importIds.length > 0) {
    const archieven = await db.select({ objectPath: bankImportArchievenTable.objectPath })
      .from(bankImportArchievenTable)
      .where(inArray(bankImportArchievenTable.importId, importIds));
    for (const archief of archieven) {
      try {
        await storage.deleteObjectEntity(archief.objectPath);
      } catch {
        console.warn(`Waarschuwing: oud bewijsobject kon niet worden verwijderd: ${archief.objectPath}`);
      }
    }
    const afschriften = await db.select({ id: bankAfschriftenTable.id })
      .from(bankAfschriftenTable)
      .where(inArray(bankAfschriftenTable.importId, importIds));
    if (afschriften.length > 0) {
      const mutaties = await db.select({ id: bankMutatiesTable.id })
        .from(bankMutatiesTable)
        .where(inArray(bankMutatiesTable.afschriftId, afschriften.map((a) => a.id)));
      if (mutaties.length > 0) {
        await db.delete(accountviewExportLogsTable)
          .where(inArray(accountviewExportLogsTable.bankMutatieId, mutaties.map((m) => m.id)));
      }
    }
    await db.delete(bankImportsTable).where(inArray(bankImportsTable.id, importIds));
  }
  await db.delete(betaalbatchesTable)
    .where(like(betaalbatchesTable.bestandReferentie, "BANK01-BEWIJS-%"));
  await db.delete(facturenTable).where(like(facturenTable.omschrijving, "BANK01-BEWIJS-%"));
  await db.delete(werkgeverBankrekeningenTable)
    .where(like(werkgeverBankrekeningenTable.tenaamstelling, "BANK01-BEWIJS-%"));
  await db.delete(werkgeversTable).where(like(werkgeversTable.naam, "BANK01-BEWIJS-%-TWEEDE-BV"));
}

function xmlEntry(input: {
  bedrag: string;
  richting: "CRDT" | "DBIT";
  valuta?: string;
  detailBedrag?: string;
  detailValuta?: string;
  bankref: string;
  endToEnd: string;
  omschrijving: string;
  tegenpartijIban: string;
  boekdatum?: string;
}): string {
  const partij = input.richting === "CRDT"
    ? `<Dbtr><Nm>BANK_01 Debiteur</Nm></Dbtr><DbtrAcct><Id><IBAN>${input.tegenpartijIban}</IBAN></Id></DbtrAcct>`
    : `<Cdtr><Nm>BANK_01 Crediteur</Nm></Cdtr><CdtrAcct><Id><IBAN>${input.tegenpartijIban}</IBAN></Id></CdtrAcct>`;
  return `
    <Ntry>
      <Amt Ccy="${input.valuta ?? "EUR"}">${input.bedrag}</Amt>
      <CdtDbtInd>${input.richting}</CdtDbtInd>
      <Sts>BOOK</Sts>
      <BookgDt><Dt>${input.boekdatum ?? "2026-08-20"}</Dt></BookgDt>
      <ValDt><Dt>${input.boekdatum ?? "2026-08-20"}</Dt></ValDt>
      <NtryDtls><TxDtls>
        ${input.detailBedrag == null ? "" : `<Amt Ccy="${input.detailValuta ?? input.valuta ?? "EUR"}">${input.detailBedrag}</Amt>`}
        <Refs><AcctSvcrRef>${input.bankref}</AcctSvcrRef><EndToEndId>${input.endToEnd}</EndToEndId></Refs>
        <RltdPties>${partij}</RltdPties>
        <RmtInf><Ustrd>${input.omschrijving}</Ustrd></RmtInf>
      </TxDtls></NtryDtls>
    </Ntry>`;
}

function camt(input: {
  iban: string;
  statementId: string;
  entries: string;
  volgnummer?: number;
  openingsdatum?: string;
  slotdatum?: string;
  openingsbalans?: string;
  slotbalans?: string;
}): Buffer {
  const openingsdatum = input.openingsdatum ?? "2026-08-20";
  const slotdatum = input.slotdatum ?? openingsdatum;
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>${input.statementId}</MsgId><CreDtTm>2026-08-20T08:00:00Z</CreDtTm></GrpHdr>
    <Stmt>
      <Id>${input.statementId}</Id>
      ${input.volgnummer == null ? "" : `<ElctrncSeqNb>${input.volgnummer}</ElctrncSeqNb>`}
      <FrToDt><FrDtTm>${openingsdatum}T00:00:00Z</FrDtTm><ToDtTm>${slotdatum}T23:59:59Z</ToDtTm></FrToDt>
      <Acct><Id><IBAN>${input.iban}</IBAN></Id><Ccy>EUR</Ccy></Acct>
      <Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">${input.openingsbalans ?? "1000.00"}</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>${openingsdatum}</Dt></Dt></Bal>
      <Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">${input.slotbalans ?? "1225.00"}</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>${slotdatum}</Dt></Dt></Bal>
      ${input.entries}
    </Stmt>
  </BkToCstmrStmt>
</Document>`);
}

function combineerCamtStatements(statementDocumenten: Buffer[], messageId: string): Buffer {
  const statements = statementDocumenten.map((document) => {
    const match = document.toString("utf-8").match(/<Stmt>[\s\S]*<\/Stmt>/);
    assert(match, "CAMT-bewijsdocument bevat geen Stmt");
    return match[0];
  });
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>${messageId}</MsgId><CreDtTm>2026-08-20T08:00:00Z</CreDtTm></GrpHdr>
    ${statements.join("\n")}
  </BkToCstmrStmt>
</Document>`);
}

async function main(): Promise<void> {
  weigerBuitenDev();
  const run = Date.now().toString().slice(-9);
  const tag = `BANK01-BEWIJS-${run}`;
  const iban = `NL00BNK${run.padStart(11, "0")}`;
  const onbekendIban = `NL00UNK${run.padStart(11, "0")}`;
  const { ObjectStorageService } = await import("./lib/objectStorage");
  const storage = new ObjectStorageService();
  await ruimOudeBewijsdataOp(storage);
  const factuurIds: number[] = [];
  const batchIds: number[] = [];
  const importIds: number[] = [];
  const bankrekeningIds: number[] = [];
  const bewijsWerkgeverIds: number[] = [];
  const bewijsMailMessageIds: string[] = [];
  const bewijsMailDedupPatronen: string[] = [];
  let dubbelWerkgeverId: number | null = null;

  try {
    const [werkgever] = await db.select({ id: werkgeversTable.id, naam: werkgeversTable.naam })
      .from(werkgeversTable).orderBy(werkgeversTable.id).limit(1);
    assert(werkgever, "Geen werkgever beschikbaar in de ontwikkel-DB");

    const [rekening] = await db.insert(werkgeverBankrekeningenTable).values({
      werkgeverId: werkgever.id,
      iban,
      tenaamstelling: tag,
      doelen: ["ontvangst", "crediteuren", "g_rekening"],
    }).returning({ id: werkgeverBankrekeningenTable.id });
    bankrekeningIds.push(rekening.id);

    const reeksIban = `NL00SEQ${run.padStart(11, "0")}`;
    const mailIban = `NL00MAIL${run.padStart(10, "0")}`;
    const [reeksWerkgever, mailWerkgever] = await db.insert(werkgeversTable).values([
      { naam: `${tag}-REEKS-BV` },
      { naam: `${tag}-MAIL-BV` },
    ]).returning({ id: werkgeversTable.id });
    bewijsWerkgeverIds.push(reeksWerkgever.id, mailWerkgever.id);
    const [reeksRekening, mailRekening] = await db.insert(werkgeverBankrekeningenTable).values([
      {
        werkgeverId: reeksWerkgever.id,
        iban: reeksIban,
        tenaamstelling: `${tag}-reeks`,
        doelen: ["ontvangst"],
      },
      {
        werkgeverId: mailWerkgever.id,
        iban: mailIban,
        tenaamstelling: `${tag}-mail`,
        doelen: ["ontvangst"],
      },
    ]).returning({ id: werkgeverBankrekeningenTable.id });
    bankrekeningIds.push(reeksRekening.id, mailRekening.id);

    const seq1Buffer = camt({
      iban: reeksIban,
      statementId: `${tag}-SEQ-1`,
      volgnummer: 1,
      openingsdatum: "2026-08-17",
      openingsbalans: "100.00",
      slotbalans: "110.00",
      entries: xmlEntry({
        bedrag: "10.00",
        richting: "CRDT",
        bankref: `${tag}-SEQ-TX-1`,
        endToEnd: "NOTPROVIDED",
        omschrijving: "Reeksbewijs 1",
        tegenpartijIban: "NL00TEGEN0000000101",
        boekdatum: "2026-08-17",
      }),
    });
    const seq3Buffer = camt({
      iban: reeksIban,
      statementId: `${tag}-SEQ-3`,
      volgnummer: 3,
      openingsdatum: "2026-08-19",
      openingsbalans: "110.00",
      slotbalans: "120.00",
      entries: xmlEntry({
        bedrag: "10.00",
        richting: "CRDT",
        bankref: `${tag}-SEQ-TX-3`,
        endToEnd: "NOTPROVIDED",
        omschrijving: "Reeksbewijs 3",
        tegenpartijIban: "NL00TEGEN0000000103",
        boekdatum: "2026-08-19",
      }),
    });
    const seq2Buffer = camt({
      iban: reeksIban,
      statementId: `${tag}-SEQ-2`,
      volgnummer: 2,
      openingsdatum: "2026-08-18",
      openingsbalans: "110.00",
      slotbalans: "110.00",
      entries: "",
    });
    const seq2FoutBuffer = camt({
      iban: reeksIban,
      statementId: `${tag}-SEQ-2-FOUT`,
      volgnummer: 2,
      openingsdatum: "2026-08-18",
      openingsbalans: "110.00",
      slotbalans: "115.00",
      entries: xmlEntry({
        bedrag: "5.00",
        richting: "CRDT",
        bankref: `${tag}-SEQ-TX-2-FOUT`,
        endToEnd: "NOTPROVIDED",
        omschrijving: "Reeksbewijs onjuiste aansluiting",
        tegenpartijIban: "NL00TEGEN0000000102",
        boekdatum: "2026-08-18",
      }),
    });
    const seq1 = await importeerBankafschrift({
      buffer: seq1Buffer,
      bestandsnaam: `${tag}-seq-1.xml`,
      formaat: "camt053",
      bron: "upload",
    });
    assert.equal(seq1.ok, true, seq1.fout);
    assert(seq1.importId);
    importIds.push(seq1.importId);
    const seq3 = await importeerBankafschrift({
      buffer: seq3Buffer,
      bestandsnaam: `${tag}-seq-3.xml`,
      formaat: "camt053",
      bron: "upload",
    });
    assert.equal(seq3.ok, true, seq3.fout);
    assert.equal(seq3.hiatSignalen?.[0]?.soort, "volgnummer_hiaat");
    assert(seq3.importId);
    importIds.push(seq3.importId);
    bewijsMailDedupPatronen.push(`bank-hiaat:${berekenSha256(seq3Buffer)}:%`);
    const seq2Fout = await importeerBankafschrift({
      buffer: seq2FoutBuffer,
      bestandsnaam: `${tag}-seq-2-fout.xml`,
      formaat: "camt053",
      bron: "upload",
    });
    assert.equal(seq2Fout.ok, false);
    assert.match(seq2Fout.fout ?? "", /saldo-mismatch.*SEQ-3.*SEQ-2-FOUT/i);
    if (seq2Fout.importId) importIds.push(seq2Fout.importId);
    bewijs("historische backfill met saldoafwijking richting bestaande opvolger blokkeert volledig");
    const seq2 = await importeerBankafschrift({
      buffer: seq2Buffer,
      bestandsnaam: `${tag}-seq-2-backfill.xml`,
      formaat: "camt053",
      bron: "upload",
    });
    assert.equal(seq2.ok, true, seq2.fout);
    assert.equal(seq2.hiatSignalen, undefined);
    assert(seq2.importId);
    importIds.push(seq2.importId);
    const [seq3NaBackfill] = await db.select({
      reeksHiaat: bankAfschriftenTable.reeksHiaat,
      status: bankAfschriftenTable.status,
    }).from(bankAfschriftenTable)
      .where(and(
        eq(bankAfschriftenTable.bankrekeningId, reeksRekening.id),
        eq(bankAfschriftenTable.statementId, `${tag}-SEQ-3`),
      ));
    assert.equal(seq3NaBackfill.reeksHiaat, false);
    assert.equal(seq3NaBackfill.status, "verwerkt");
    bewijs("volgnummerhiaat wordt zichtbaar en een historische backfill valideert voorganger én opvolger en sluit het hiaat");

    const [bewijsGebruiker] = await db.select({ id: gebruikersTable.id })
      .from(gebruikersTable)
      .orderBy(gebruikersTable.id)
      .limit(1);
    assert(bewijsGebruiker, "Geen gebruiker beschikbaar voor mailboxbewijs");
    const mailboxAdres = `${tag.toLowerCase()}@example.invalid`;
    const mailBuffer = camt({
      iban: mailIban,
      statementId: `${tag}-MAIL-STMT`,
      openingsdatum: "2026-08-16",
      openingsbalans: "200.00",
      slotbalans: "225.00",
      entries: xmlEntry({
        bedrag: "25.00",
        richting: "CRDT",
        bankref: `${tag}-MAIL-TX`,
        endToEnd: "NOTPROVIDED",
        omschrijving: "Bankmail bewijs",
        tegenpartijIban: "NL00TEGEN0000000201",
        boekdatum: "2026-08-16",
      }),
    });
    const geldigeMessageId = `${tag}-MAIL-GELDIG`;
    bewijsMailMessageIds.push(geldigeMessageId);
    await db.insert(werkInboxMailsTable).values({
      messageId: geldigeMessageId,
      gebruikerId: bewijsGebruiker.id,
      mailboxAdres,
      onderwerp: tag,
      afzenderEmail: "bank@example.invalid",
      ontvangenOp: new Date(),
      heeftBijlage: true,
    });
    let importAanroepen = 0;
    const geldigeBijlage = {
      id: `${tag}-ATT-GELDIG`,
      name: `${tag}.xml`,
      contentType: "application/xml",
      size: mailBuffer.length,
      contentBytes: mailBuffer.toString("base64"),
    };
    const mailboxDependencies = {
      haalBijlagen: async () => [geldigeBijlage],
      importeer: async (input: Parameters<typeof importeerBankafschrift>[0]) => {
        importAanroepen++;
        return importeerBankafschrift(input);
      },
      stuurFaalmail: async () => {},
    };
    const mailRij = {
      messageId: geldigeMessageId,
      gebruikerId: bewijsGebruiker.id,
      mailboxAdres,
      onderwerp: tag,
      heeftBijlage: true,
    };
    await verwerkBankmail(mailRij, mailboxDependencies);
    await verwerkBankmail(mailRij, mailboxDependencies);
    assert.equal(importAanroepen, 1, "Tweede mailboxrun mag de importmotor niet opnieuw aanroepen");
    const [mailImport] = await db.select({ id: bankImportsTable.id })
      .from(bankImportsTable)
      .where(eq(bankImportsTable.sha256, berekenSha256(mailBuffer)));
    assert(mailImport);
    importIds.push(mailImport.id);
    const [mailClaim] = await db.select()
      .from(bankMailbijlageClaimsTable)
      .where(and(
        eq(bankMailbijlageClaimsTable.mailboxAdres, mailboxAdres),
        eq(bankMailbijlageClaimsTable.mailMessageId, geldigeMessageId),
        eq(bankMailbijlageClaimsTable.attachmentId, geldigeBijlage.id),
      ));
    assert.equal(mailClaim.status, "verwerkt");
    assert.equal(mailClaim.importId, mailImport.id);
    bewijs("Microsoft-bijlage gebruikt de centrale importmotor en een tweede mailboxrun maakt geen tweede import");

    const leaseMessageId = `${tag}-MAIL-LEASE`;
    bewijsMailMessageIds.push(leaseMessageId);
    await db.insert(bankMailbijlageClaimsTable).values({
      mailboxAdres,
      mailMessageId: leaseMessageId,
      attachmentId: `${tag}-ATT-LEASE`,
      status: "bezig",
      claimToken: `${tag}-OUDE-CLAIM`,
      leaseTot: new Date(Date.now() - 60_000),
      bijgewerktOp: new Date(Date.now() - 60_000),
    });
    const overgenomenClaim = await claimBijlage(mailboxAdres, leaseMessageId, `${tag}-ATT-LEASE`);
    assert.equal(overgenomenClaim.status, "nieuw");
    assert(overgenomenClaim.claimToken && overgenomenClaim.claimToken !== `${tag}-OUDE-CLAIM`);
    bewijs("een gecrashte mailboxworker laat een verlopen claim veilig en atomair overnemen");

    const foutMessageId = `${tag}-MAIL-FOUT`;
    bewijsMailMessageIds.push(foutMessageId);
    await db.insert(werkInboxMailsTable).values({
      messageId: foutMessageId,
      gebruikerId: bewijsGebruiker.id,
      mailboxAdres,
      onderwerp: tag,
      afzenderEmail: "bank@example.invalid",
      ontvangenOp: new Date(),
      heeftBijlage: true,
    });
    let permanenteImportAanroepen = 0;
    const foutBuffer = camt({
      iban: onbekendIban,
      statementId: `${tag}-MAIL-ONBEKEND`,
      entries: "",
      openingsbalans: "0.00",
      slotbalans: "0.00",
    });
    const foutMailRij = { ...mailRij, messageId: foutMessageId };
    const foutBijlage = {
      id: `${tag}-ATT-FOUT`,
      name: `${tag}-fout.xml`,
      contentType: "application/xml",
      size: foutBuffer.length,
      contentBytes: foutBuffer.toString("base64"),
    };
    await verwerkBankmail(foutMailRij, {
      haalBijlagen: async () => [foutBijlage],
      importeer: async (input) => {
        permanenteImportAanroepen++;
        return importeerBankafschrift(input);
      },
      stuurFaalmail: async () => {},
    });
    await verwerkBankmail(foutMailRij, {
      haalBijlagen: async () => [foutBijlage],
      importeer: async (input) => {
        permanenteImportAanroepen++;
        return importeerBankafschrift(input);
      },
      stuurFaalmail: async () => {},
    });
    assert.equal(permanenteImportAanroepen, 1);
    const [foutClaim] = await db.select()
      .from(bankMailbijlageClaimsTable)
      .where(and(
        eq(bankMailbijlageClaimsTable.mailboxAdres, mailboxAdres),
        eq(bankMailbijlageClaimsTable.mailMessageId, foutMessageId),
        eq(bankMailbijlageClaimsTable.attachmentId, foutBijlage.id),
      ));
    assert.equal(foutClaim.status, "mislukt");
    assert.match(foutClaim.fout ?? "", /IBAN/i);
    bewijs("permanente mailboxfout blijft zichtbaar en wordt niet eindeloos opnieuw geïmporteerd");

    const graphMessageId = `${tag}-MAIL-GRAPH`;
    bewijsMailMessageIds.push(graphMessageId);
    await db.insert(werkInboxMailsTable).values({
      messageId: graphMessageId,
      gebruikerId: bewijsGebruiker.id,
      mailboxAdres,
      onderwerp: tag,
      afzenderEmail: "bank@example.invalid",
      ontvangenOp: new Date(),
      heeftBijlage: true,
    });
    let graphFaalmeldingen = 0;
    await verwerkBankmail({ ...mailRij, messageId: graphMessageId }, {
      haalBijlagen: async () => { throw new Error("Microsoft Graph HTTP 403: mailboxtoegang ontbreekt"); },
      stuurFaalmail: async () => { graphFaalmeldingen++; },
    });
    const [graphMail] = await db.select({ fout: werkInboxMailsTable.bankafschriftFout })
      .from(werkInboxMailsTable)
      .where(and(
        eq(werkInboxMailsTable.mailboxAdres, mailboxAdres),
        eq(werkInboxMailsTable.messageId, graphMessageId),
      ));
    assert.match(graphMail.fout ?? "", /403.*mailboxtoegang/i);
    assert.equal(graphFaalmeldingen, 1);
    bewijs("Graph-/toegangsfout blijft op de mail zichtbaar en roept de duurzame faalmeldingsroute aan");

    const multiAccountBuffer = combineerCamtStatements([
      camt({
        iban: mailIban,
        statementId: `${tag}-MAIL-STMT-2`,
        openingsdatum: "2026-08-17",
        openingsbalans: "225.00",
        slotbalans: "226.00",
        entries: xmlEntry({
          bedrag: "1.00",
          richting: "CRDT",
          bankref: `${tag}-MAIL-TX-2`,
          endToEnd: "NOTPROVIDED",
          omschrijving: "Tweede rekening in multi-accountbestand",
          tegenpartijIban: "NL00TEGEN0000000202",
          boekdatum: "2026-08-17",
        }),
      }),
      camt({
        iban: reeksIban,
        statementId: `${tag}-SEQ-4`,
        volgnummer: 4,
        openingsdatum: "2026-08-20",
        openingsbalans: "120.00",
        slotbalans: "121.00",
        entries: xmlEntry({
          bedrag: "1.00",
          richting: "CRDT",
          bankref: `${tag}-SEQ-TX-4`,
          endToEnd: "NOTPROVIDED",
          omschrijving: "Tweede werkmaatschappij in multi-accountbestand",
          tegenpartijIban: "NL00TEGEN0000000104",
          boekdatum: "2026-08-20",
        }),
      }),
    ], `${tag}-MULTI`);
    const multiAccount = await importeerBankafschrift({
      buffer: multiAccountBuffer,
      bestandsnaam: `${tag}-meerdere-rekeningen-en-dagen.xml`,
      formaat: "camt053",
      bron: "upload",
    });
    assert.equal(multiAccount.ok, true, multiAccount.fout);
    assert.equal(multiAccount.aantalNieuweAfschriften, 2);
    assert.equal(multiAccount.aantalNieuweMutaties, 2);
    assert(multiAccount.importId);
    importIds.push(multiAccount.importId);
    const multiArchieven = await db.select({ werkgeverId: bankImportArchievenTable.werkgeverId })
      .from(bankImportArchievenTable)
      .where(eq(bankImportArchievenTable.importId, multiAccount.importId));
    assert.equal(new Set(multiArchieven.map((a) => a.werkgeverId)).size, 2);
    bewijs("één CAMT.053-bestand verwerkt twee rekeningen, twee dagen en archiveert bij beide werkmaatschappijen");

    const verkoopNummer = `BKV${run}`;
    const inkoopNummer = `BKI${run}`;
    const [verkoop, inkoop, batchFactuur, ambigu1, ambigu2] = await db
      .insert(facturenTable)
      .values([
        { type: "verkoop", factuurnummer: verkoopNummer, bedragInclBtw: "500.00", betaalstatus: "openstaand", tenaamstellingBv: werkgever.naam, omschrijving: tag },
        { type: "inkoop", factuurnummer: inkoopNummer, bedragInclBtw: "250.00", betaalstatus: "openstaand", tenaamstellingBv: werkgever.naam, omschrijving: tag },
        { type: "inkoop", factuurnummer: `BKB${run}`, bedragInclBtw: "100.00", betaalstatus: "openstaand", tenaamstellingBv: werkgever.naam, omschrijving: tag },
        { type: "verkoop", factuurnummer: `AMB1${run}`, bedragInclBtw: "75.00", betaalstatus: "openstaand", tenaamstellingBv: werkgever.naam, omschrijving: tag },
        { type: "verkoop", factuurnummer: `AMB2${run}`, bedragInclBtw: "75.00", betaalstatus: "openstaand", tenaamstellingBv: werkgever.naam, omschrijving: tag },
      ] as (typeof facturenTable.$inferInsert)[])
      .returning({ id: facturenTable.id });
    factuurIds.push(verkoop.id, inkoop.id, batchFactuur.id, ambigu1.id, ambigu2.id);

    const [batch] = await db.insert(betaalbatchesTable).values({
      werkgeverId: werkgever.id,
      status: "bestand_aangemaakt",
      uitvoerdatum: "2026-08-20",
      debiteurIban: iban,
      debiteurNaam: werkgever.naam,
      totaalBedrag: "100.00",
      aantalBetalingen: 1,
      bestandReferentie: tag,
    }).returning({ id: betaalbatchesTable.id });
    batchIds.push(batch.id);
    const [handmatigBevestigdeBatch] = await db.insert(betaalbatchesTable).values({
      werkgeverId: werkgever.id,
      status: "bevestigd",
      uitvoerdatum: "2026-08-20",
      debiteurIban: iban,
      debiteurNaam: werkgever.naam,
      totaalBedrag: "0.01",
      aantalBetalingen: 0,
      bestandReferentie: `${tag}-HANDMATIG`,
      bevestigdOp: new Date(),
    }).returning({ id: betaalbatchesTable.id });
    batchIds.push(handmatigBevestigdeBatch.id);
    const batchRef = `FPS-BATCH-${batch.id}-${batchFactuur.id}`;
    const [batchRegel] = await db.insert(betaalbatchRegelsTable).values({
      batchId: batch.id,
      factuurId: batchFactuur.id,
      crediteurNaam: "BANK_01 Batchcrediteur",
      crediteurIban: "NL00TEGEN0000000001",
      bedrag: "100.00",
      omschrijving: tag,
    }).returning({ id: betaalbatchRegelsTable.id });

    const nietEuroBuffer = camt({
      iban,
      statementId: `${tag}-USD-GEWEIGERD`,
      openingsbalans: "1000.00",
      slotbalans: "1400.00",
      entries: [
        xmlEntry({
          bedrag: "500.00",
          richting: "CRDT",
          valuta: "USD",
          bankref: `${tag}-USD-V`,
          endToEnd: verkoopNummer,
          omschrijving: `Betaling ${verkoopNummer}`,
          tegenpartijIban: "NL00TEGEN0000000002",
        }),
        xmlEntry({
          bedrag: "100.00",
          richting: "DBIT",
          valuta: "USD",
          bankref: `${tag}-USD-B`,
          endToEnd: batchRef,
          omschrijving: batchRef,
          tegenpartijIban: "NL00TEGEN0000000001",
        }),
      ].join(""),
    });
    const nietEuro = await importeerBankafschrift({
      buffer: nietEuroBuffer,
      bestandsnaam: `${tag}-usd-geweigerd.xml`,
      contenttype: "application/xml",
      formaat: "camt053",
      bron: "upload",
    });
    assert.equal(nietEuro.ok, false);
    assert.match(nietEuro.fout ?? "", /valuta.*USD/i);
    const [verkoopNaNietEuro] = await db.select({
      betaalstatus: facturenTable.betaalstatus,
    }).from(facturenTable).where(eq(facturenTable.id, verkoop.id));
    const [batchNaNietEuro] = await db.select({
      status: betaalbatchesTable.status,
      uitgevoerdImportId: betaalbatchesTable.uitgevoerdImportId,
    }).from(betaalbatchesTable).where(eq(betaalbatchesTable.id, batch.id));
    const [batchRegelNaNietEuro] = await db.select({
      reconciliatieStatus: betaalbatchRegelsTable.reconciliatieStatus,
    }).from(betaalbatchRegelsTable).where(eq(betaalbatchRegelsTable.id, batchRegel.id));
    const [opgeslagenNietEuro] = await db.select({ id: bankImportsTable.id })
      .from(bankImportsTable)
      .where(eq(bankImportsTable.sha256, berekenSha256(nietEuroBuffer)))
      .limit(1);
    assert.equal(verkoopNaNietEuro.betaalstatus, "openstaand");
    assert.equal(batchNaNietEuro.status, "bestand_aangemaakt");
    assert.equal(batchNaNietEuro.uitgevoerdImportId, null);
    assert.notEqual(batchRegelNaNietEuro.reconciliatieStatus, "gematcht");
    assert.equal(opgeslagenNietEuro, undefined);
    bewijs("niet-EUR mutaties weigeren het hele bestand vóór opslag, factuuraflettering en batchsluiting");

    const afwijkendDetailBuffer = camt({
      iban,
      statementId: `${tag}-DETAIL-AFWIJKING`,
      openingsbalans: "1000.00",
      slotbalans: "1500.00",
      entries: xmlEntry({
        bedrag: "499.00",
        detailBedrag: "500.00",
        richting: "CRDT",
        bankref: `${tag}-DETAIL-AFWIJKING-V`,
        endToEnd: verkoopNummer,
        omschrijving: `Betaling ${verkoopNummer}`,
        tegenpartijIban: "NL00TEGEN0000000002",
      }),
    });
    const afwijkendDetail = await importeerBankafschrift({
      buffer: afwijkendDetailBuffer,
      bestandsnaam: `${tag}-detail-afwijking.xml`,
      contenttype: "application/xml",
      formaat: "camt053",
      bron: "upload",
    });
    assert.equal(afwijkendDetail.ok, false);
    assert.match(afwijkendDetail.fout ?? "", /transactiedetailbedrag.*Ntry-bedrag/i);
    const [verkoopNaAfwijkendDetail] = await db.select({
      betaalstatus: facturenTable.betaalstatus,
    }).from(facturenTable).where(eq(facturenTable.id, verkoop.id));
    const [opgeslagenAfwijkendDetail] = await db.select({ id: bankImportsTable.id })
      .from(bankImportsTable)
      .where(eq(bankImportsTable.sha256, berekenSha256(afwijkendDetailBuffer)))
      .limit(1);
    assert.equal(verkoopNaAfwijkendDetail.betaalstatus, "openstaand");
    assert.equal(opgeslagenAfwijkendDetail, undefined);
    bewijs("afwijkend TxDtls-bedrag weigert het bestand vóór opslag en factuuraflettering");

    const maxOpslagbedrag = "999999999999.99";
    const afrondingsEntries = [
      ...Array.from({ length: 91 }, (_, index) => xmlEntry({
        bedrag: maxOpslagbedrag,
        richting: "CRDT" as const,
        bankref: `${tag}-AGG-C-${index}`,
        endToEnd: `${tag}-AGG-C-${index}`,
        omschrijving: "Aggregaatprecisie credit",
        tegenpartijIban: "NL00TEGEN0000000003",
      })),
      ...Array.from({ length: 91 }, (_, index) => xmlEntry({
        bedrag: maxOpslagbedrag,
        richting: "DBIT" as const,
        bankref: `${tag}-AGG-D-${index}`,
        endToEnd: `${tag}-AGG-D-${index}`,
        omschrijving: "Aggregaatprecisie debet",
        tegenpartijIban: "NL00TEGEN0000000003",
      })),
      xmlEntry({
        bedrag: "500.00",
        richting: "CRDT",
        bankref: `${tag}-AGG-VERKOOP`,
        endToEnd: verkoopNummer,
        omschrijving: `Betaling ${verkoopNummer}`,
        tegenpartijIban: "NL00TEGEN0000000003",
      }),
    ].join("");
    const afrondingsBuffer = camt({
      iban,
      statementId: `${tag}-AGG-AFRONDING`,
      openingsbalans: "1000.00",
      slotbalans: "1499.99",
      entries: afrondingsEntries,
    });
    const afrondingsImport = await importeerBankafschrift({
      buffer: afrondingsBuffer,
      bestandsnaam: `${tag}-aggregaat-afronding.xml`,
      contenttype: "application/xml",
      formaat: "camt053",
      bron: "upload",
    });
    assert.equal(afrondingsImport.ok, false);
    assert.match(afrondingsImport.fout ?? "", /saldo-verificatie/i);
    const [verkoopNaAfronding] = await db.select({
      betaalstatus: facturenTable.betaalstatus,
    }).from(facturenTable).where(eq(facturenTable.id, verkoop.id));
    const [opgeslagenAfronding] = await db.select({ id: bankImportsTable.id })
      .from(bankImportsTable)
      .where(eq(bankImportsTable.sha256, berekenSha256(afrondingsBuffer)))
      .limit(1);
    assert.equal(verkoopNaAfronding.betaalstatus, "openstaand");
    assert.equal(opgeslagenAfronding, undefined);
    bewijs("BigInt-saldoverificatie weigert afgeronde aggregaten vóór opslag en factuuraflettering");

    const entries = [
      xmlEntry({ bedrag: "500.00", richting: "CRDT", bankref: `${tag}-V`, endToEnd: verkoopNummer, omschrijving: `Betaling ${verkoopNummer}`, tegenpartijIban: "NL00TEGEN0000000002" }),
      xmlEntry({ bedrag: "250.00", richting: "DBIT", bankref: `${tag}-I`, endToEnd: inkoopNummer, omschrijving: `Inkoopfactuur ${inkoopNummer}`, tegenpartijIban: "NL00TEGEN0000000003" }),
      xmlEntry({ bedrag: "100.00", richting: "DBIT", bankref: `${tag}-B`, endToEnd: batchRef, omschrijving: batchRef, tegenpartijIban: "NL00TEGEN0000000001" }),
      xmlEntry({ bedrag: "75.00", richting: "CRDT", bankref: `${tag}-A`, endToEnd: "NOTPROVIDED", omschrijving: "Verzamelbetaling zonder factuurkenmerk", tegenpartijIban: "NL00TEGEN0000000004" }),
    ].join("");
    const buffer = camt({ iban, statementId: `${tag}-STMT`, entries });

    const resultaat = await importeerBankafschrift({
      buffer,
      bestandsnaam: `${tag}.xml`,
      contenttype: "application/xml",
      formaat: "camt053",
      bron: "upload",
    });
    assert.equal(resultaat.ok, true, resultaat.fout);
    assert.equal(resultaat.aantalNieuweAfschriften, 1);
    assert.equal(resultaat.aantalNieuweMutaties, 4);
    assert.equal(resultaat.aantalGematcht, 3);
    assert(resultaat.importId);
    importIds.push(resultaat.importId);
    bewijs("één CAMT.053-bestand verwerkt met 1 afschrift, 4 mutaties en 3 exacte matches");

    const mutaties = await db.select().from(bankMutatiesTable)
      .where(sql`${bankMutatiesTable.afschriftId} IN (
        SELECT id FROM bank_afschriften WHERE import_id = ${resultaat.importId}
      )`);
    assert.equal(mutaties.length, 4);
    assert(mutaties.every((m) => m.gRekening), "Alle mutaties op de eigen G-rekening moeten gemarkeerd zijn");
    const ambigue = mutaties.find((m) => m.bankreferentie === `${tag}-A`);
    assert(ambigue);
    assert.equal(ambigue.reconciliatieStatus, "meerdere_kandidaten");
    const voorstellen = await db.select().from(bankAfletterVoorstellenTable)
      .where(eq(bankAfletterVoorstellenTable.mutatieId, ambigue.id));
    assert.equal(voorstellen.length, 2);
    bewijs("onzekere betaling blijft op de werklijst met twee uitlegbare voorstellen; G-rekeningmarkering is gezet");

    const handmatigVerkoop = await pasToeAfletterVoorstel(
      voorstellen[0]!.id,
      bewijsGebruiker.id,
      "BANK_01 bewijs",
    );
    assert.equal(handmatigVerkoop.ok, true, handmatigVerkoop.fout);
    const [handmatigVerkoopMutatie] = await db.select({
      status: bankMutatiesTable.reconciliatieStatus,
    }).from(bankMutatiesTable).where(eq(bankMutatiesTable.id, ambigue.id));
    const [handmatigVerkoopFactuur] = await db.select({
      betaalstatus: facturenTable.betaalstatus,
    }).from(facturenTable).where(eq(facturenTable.id, voorstellen[0]!.factuurId!));
    assert.equal(handmatigVerkoopMutatie.status, "gematcht");
    assert.equal(handmatigVerkoopFactuur.betaalstatus, "betaald");
    bewijs("handmatig verkoopvoorstel verwerkt exacte DB-decimalen en laat geen tweede aflettering toe");

    assert.equal(bankEuroTekstNaarCenten("999999999999.99"), 99_999_999_999_999);
    assert.equal(bankEuroTekstNaarCenten("-999999999999.99"), -99_999_999_999_999);
    assert.equal(bankCentenNaarEuroTekst(-99_999_999_999_999n), "-999999999999.99");
    assert.equal(bankEuroTekstNaarCenten("500.00rommel"), null);
    bewijs("numeric(14,2)-grenzen en negatieve debetbedragen converteren exact; niet-canonieke tekst faalt gesloten");

    const [handmatigBatchFactuur] = await db.insert(facturenTable).values({
      type: "inkoop",
      factuurnummer: `BKM${run}`,
      bedragInclBtw: "0.02",
      betaalstatus: "openstaand",
      tenaamstellingBv: werkgever.naam,
      omschrijving: tag,
    } as typeof facturenTable.$inferInsert).returning({ id: facturenTable.id });
    factuurIds.push(handmatigBatchFactuur.id);
    const [handmatigBatch] = await db.insert(betaalbatchesTable).values({
      werkgeverId: werkgever.id,
      status: "bestand_aangemaakt",
      uitvoerdatum: "2026-08-20",
      debiteurIban: iban,
      debiteurNaam: werkgever.naam,
      totaalBedrag: "0.02",
      aantalBetalingen: 1,
      bestandReferentie: `${tag}-HANDMATIG-BATCH`,
    }).returning({ id: betaalbatchesTable.id });
    batchIds.push(handmatigBatch.id);
    const [handmatigBatchRegel] = await db.insert(betaalbatchRegelsTable).values({
      batchId: handmatigBatch.id,
      factuurId: handmatigBatchFactuur.id,
      crediteurNaam: "BANK_01 handmatig batchbewijs",
      crediteurIban: "NL00TEGEN0000000041",
      bedrag: "0.02",
      omschrijving: tag,
    }).returning({ id: betaalbatchRegelsTable.id });
    const [handmatigBatchMutatie] = await db.insert(bankMutatiesTable).values({
      afschriftId: ambigue.afschriftId,
      bankrekeningId: ambigue.bankrekeningId,
      werkgeverId: werkgever.id,
      bankreferentie: `${tag}-HANDMATIG-BATCH-TX`,
      endToEndReferentie: `${tag}-HANDMATIG-BATCH`,
      bedrag: "-0.02",
      valuta: "EUR",
      creditDebit: "DBIT",
      boekdatum: "2026-08-20",
      valuedatum: "2026-08-20",
      reconciliatieStatus: "meerdere_kandidaten",
    }).returning({ id: bankMutatiesTable.id });
    const [handmatigBatchVoorstel] = await db.insert(bankAfletterVoorstellenTable).values({
      mutatieId: handmatigBatchMutatie.id,
      factuurId: handmatigBatchFactuur.id,
      batchregelId: handmatigBatchRegel.id,
      rang: 1,
      score: "1.0000",
      reden: "BANK_01 exact negatief DB-decimaalbewijs",
      status: "voorstel",
    }).returning({ id: bankAfletterVoorstellenTable.id });
    const handmatigBatchResultaat = await pasToeAfletterVoorstel(
      handmatigBatchVoorstel.id,
      bewijsGebruiker.id,
      "BANK_01 bewijs",
    );
    assert.equal(handmatigBatchResultaat.ok, true, handmatigBatchResultaat.fout);
    const [handmatigBatchNa] = await db.select({
      status: betaalbatchRegelsTable.reconciliatieStatus,
      bankMutatieId: betaalbatchRegelsTable.bankMutatieId,
    }).from(betaalbatchRegelsTable).where(eq(betaalbatchRegelsTable.id, handmatigBatchRegel.id));
    assert.equal(handmatigBatchNa.status, "gematcht");
    assert.equal(handmatigBatchNa.bankMutatieId, handmatigBatchMutatie.id);
    bewijs("handmatige betaalbatchaflettering verwerkt een negatief DB-bedrag exact en transactioneel");

    const [batchNaImport] = await db.select().from(betaalbatchesTable).where(eq(betaalbatchesTable.id, batch.id));
    const [regelNaImport] = await db.select().from(betaalbatchRegelsTable).where(eq(betaalbatchRegelsTable.id, batchRegel.id));
    assert.equal(batchNaImport.status, "uitgevoerd");
    assert.equal(batchNaImport.uitgevoerdImportId, resultaat.importId);
    assert.equal(regelNaImport.reconciliatieStatus, "gematcht");
    bewijs("volledig bewezen betaalbatch transactioneel naar uitgevoerd gezet");
    const [handmatigNaImport] = await db.select({
      status: betaalbatchesTable.status,
      uitgevoerdImportId: betaalbatchesTable.uitgevoerdImportId,
    }).from(betaalbatchesTable).where(eq(betaalbatchesTable.id, handmatigBevestigdeBatch.id));
    assert.equal(handmatigNaImport.status, "bevestigd");
    assert.equal(handmatigNaImport.uitgevoerdImportId, null);
    bewijs("legacy handmatige bevestiging blijft herkenbaar bevestigd en wordt niet als bankbewijs uitgevoerd");

    const [legacyFactuur] = await db.insert(facturenTable).values({
      type: "inkoop",
      factuurnummer: `BKH${run}`,
      bedragInclBtw: "0.01",
      betaalstatus: "betaald",
      betaaldatum: "2026-08-20",
      betaaldOp: new Date("2026-08-20T12:00:00Z"),
      tenaamstellingBv: werkgever.naam,
      omschrijving: tag,
    } as typeof facturenTable.$inferInsert).returning({ id: facturenTable.id });
    factuurIds.push(legacyFactuur.id);
    const [legacyBatchMetBankbewijs] = await db.insert(betaalbatchesTable).values({
      werkgeverId: werkgever.id,
      status: "bevestigd",
      uitvoerdatum: "2026-08-20",
      debiteurIban: iban,
      debiteurNaam: werkgever.naam,
      totaalBedrag: "0.01",
      aantalBetalingen: 1,
      bestandReferentie: `${tag}-HANDMATIG-MET-LATER-BANKBEWIJS`,
      bevestigdOp: new Date(),
    }).returning({ id: betaalbatchesTable.id });
    batchIds.push(legacyBatchMetBankbewijs.id);
    const legacyBatchRef = `FPS-BATCH-${legacyBatchMetBankbewijs.id}-${legacyFactuur.id}`;
    await db.insert(betaalbatchRegelsTable).values({
      batchId: legacyBatchMetBankbewijs.id,
      factuurId: legacyFactuur.id,
      crediteurNaam: "BANK_01 Legacy bevestigd",
      crediteurIban: "NL00TEGEN0000000031",
      bedrag: "0.01",
      omschrijving: tag,
    });
    const laterBankbewijs = await importeerBankafschrift({
      buffer: camt({
        iban,
        statementId: `${tag}-HANDMATIG-BANKBEWIJS`,
        openingsdatum: "2026-08-21",
        openingsbalans: "1225.00",
        slotbalans: "1224.99",
        entries: xmlEntry({
          bedrag: "0.01",
          richting: "DBIT",
          bankref: `${tag}-HANDMATIG-TX`,
          endToEnd: legacyBatchRef,
          omschrijving: legacyBatchRef,
          tegenpartijIban: "NL00TEGEN0000000031",
          boekdatum: "2026-08-21",
        }),
      }),
      bestandsnaam: `${tag}-handmatig-later-bewezen.xml`,
      formaat: "camt053",
      bron: "upload",
    });
    assert.equal(laterBankbewijs.ok, true, laterBankbewijs.fout);
    assert.equal(laterBankbewijs.aantalGematcht, 1);
    assert(laterBankbewijs.importId);
    importIds.push(laterBankbewijs.importId);
    const [legacyNaBankbewijs] = await db.select({
      status: betaalbatchesTable.status,
      uitgevoerdImportId: betaalbatchesTable.uitgevoerdImportId,
    }).from(betaalbatchesTable).where(eq(betaalbatchesTable.id, legacyBatchMetBankbewijs.id));
    assert.equal(legacyNaBankbewijs.status, "uitgevoerd");
    assert.equal(legacyNaBankbewijs.uitgevoerdImportId, laterBankbewijs.importId);
    bewijs("een oudere handmatig bevestigde batch wordt pas uitgevoerd zodra een later afschrift alle regels bewijst");

    const dubbel = await importeerBankafschrift({
      buffer,
      bestandsnaam: `${tag}-opnieuw.xml`,
      formaat: "camt053",
      bron: "upload",
    });
    assert.equal(dubbel.ok, true);
    assert.equal(dubbel.duplicate, true);
    assert.equal(dubbel.aantalNieuweAfschriften, 0);
    assert.equal(dubbel.aantalNieuweMutaties, 0);
    bewijs("dubbele bestandsupload levert nul nieuwe afschriften en mutaties op");

    const onbekend = await importeerBankafschrift({
      buffer: camt({ iban: onbekendIban, statementId: `${tag}-ONBEKEND`, entries }),
      bestandsnaam: `${tag}-onbekend.xml`,
      formaat: "camt053",
      bron: "upload",
    });
    if (onbekend.importId) importIds.push(onbekend.importId);
    assert.equal(onbekend.ok, false);
    assert(onbekend.onbekendIbans?.includes(onbekendIban));
    bewijs("onbekende IBAN wijst het volledige bestand leesbaar af");

    const [dubbelWerkgever] = await db.insert(werkgeversTable)
      .values({ naam: `${tag}-TWEEDE-BV` })
      .returning({ id: werkgeversTable.id });
    dubbelWerkgeverId = dubbelWerkgever.id;
    await db.insert(werkgeverBankrekeningenTable).values({
      werkgeverId: dubbelWerkgever.id,
      iban,
      tenaamstelling: `${tag}-dubbel`,
      doelen: ["ontvangst"],
    });
    const dubbelzinnig = await importeerBankafschrift({
      buffer: camt({ iban, statementId: `${tag}-DUBBEL`, entries: entries.replaceAll(tag, `${tag}-DUBBEL`) }),
      bestandsnaam: `${tag}-dubbelzinnig.xml`,
      formaat: "camt053",
      bron: "upload",
    });
    if (dubbelzinnig.importId) importIds.push(dubbelzinnig.importId);
    assert.equal(dubbelzinnig.ok, false);
    assert.match(dubbelzinnig.fout ?? "", /dubbelzinnig.*bankrekeningrecords/i);
    bewijs("dubbelzinnige IBAN faalt gesloten vóór opslag van mutaties");
    await db.delete(werkgeversTable).where(eq(werkgeversTable.id, dubbelWerkgever.id));
    dubbelWerkgeverId = null;

    const saldoFout = await importeerBankafschrift({
      buffer: camt({ iban, statementId: `${tag}-SALDO`, entries: entries.replaceAll(tag, `${tag}-SALDO`), slotbalans: "9999.99" }),
      bestandsnaam: `${tag}-saldo-fout.xml`,
      formaat: "camt053",
      bron: "upload",
    });
    if (saldoFout.importId) importIds.push(saldoFout.importId);
    assert.equal(saldoFout.ok, false);
    assert.match(saldoFout.fout ?? "", /saldo/i);
    bewijs("saldofout blokkeert het hele bestand");

    const gematchteMutatie = mutaties.find((m) => m.bankreferentie === `${tag}-V`);
    assert(gematchteMutatie);
    const exportNietGematcht = await exporteerBankmutatieNaarAccountView(ambigue.id);
    assert.equal(exportNietGematcht.httpStatus, 422);

    const onzekereExportMutatie = mutaties.find((m) => m.bankreferentie === `${tag}-I`);
    assert(onzekereExportMutatie);
    await db.update(bankMutatiesTable).set({
      accountviewStatus: "bezig",
      accountviewClaimToken: `${tag}-AV-CLAIM`,
      accountviewClaimOp: new Date(Date.now() - 20 * 60 * 1000),
      bijgewerktOp: new Date(Date.now() - 20 * 60 * 1000),
    }).where(eq(bankMutatiesTable.id, onzekereExportMutatie.id));
    const staleExport = await exporteerBankmutatieNaarAccountView(
      onzekereExportMutatie.id,
      bewijsGebruiker.id,
    );
    assert.equal(staleExport.httpStatus, 409);
    assert.match(staleExport.fout ?? "", /onzeker/i);
    bewijsMailDedupPatronen.push(`accountview-bankmutatie:${onzekereExportMutatie.id}:%`);
    const [naStaleExport] = await db.select({
      status: bankMutatiesTable.accountviewStatus,
    }).from(bankMutatiesTable).where(eq(bankMutatiesTable.id, onzekereExportMutatie.id));
    assert.equal(naStaleExport.status, "onzeker");

    const vrijgegeven = await herstelOnzekereBankexport(
      onzekereExportMutatie.id,
      "opnieuw_proberen",
      "Gecontroleerd op bankreferentie en bedrag; geen boeking gevonden",
      bewijsGebruiker.id,
    );
    assert.equal(vrijgegeven.ok, true);
    assert.equal(vrijgegeven.geslaagd, false);
    const [naVrijgave] = await db.select({
      status: bankMutatiesTable.accountviewStatus,
    }).from(bankMutatiesTable).where(eq(bankMutatiesTable.id, onzekereExportMutatie.id));
    assert.equal(naVrijgave.status, "mislukt");

    await db.update(bankMutatiesTable).set({
      accountviewStatus: "onzeker",
      accountviewFout: "Gesimuleerde onzekere tweede poging",
      bijgewerktOp: new Date(),
    }).where(eq(bankMutatiesTable.id, onzekereExportMutatie.id));
    const bevestigd = await herstelOnzekereBankexport(
      onzekereExportMutatie.id,
      "bevestig_geboekt",
      "Bestaande boeking op bankreferentie, datum en bedrag gecontroleerd",
      bewijsGebruiker.id,
      `${tag}-AV-HERSTEL`,
    );
    assert.equal(bevestigd.ok, true);
    assert.equal(bevestigd.geslaagd, true);
    const [naBevestiging] = await db.select({
      status: bankMutatiesTable.accountviewStatus,
      boekingId: bankMutatiesTable.accountviewId,
    }).from(bankMutatiesTable).where(eq(bankMutatiesTable.id, onzekereExportMutatie.id));
    assert.equal(naBevestiging.status, "geslaagd");
    assert.equal(naBevestiging.boekingId, `${tag}-AV-HERSTEL`);
    bewijs("verlopen AccountView-claim wordt fail-closed onzeker en vereist expliciet, geaudit herstel vóór retry of bevestiging");

    const [exportLog] = await db.insert(accountviewExportLogsTable).values({
      factuurId: null,
      bankMutatieId: gematchteMutatie.id,
      status: "geslaagd",
      actie: "export",
      testmodus: true,
      accountviewBoekingId: `${tag}-AV`,
    }).returning({ id: accountviewExportLogsTable.id });
    const exportEen = await exporteerBankmutatieNaarAccountView(gematchteMutatie.id);
    const exportTwee = await exporteerBankmutatieNaarAccountView(gematchteMutatie.id);
    assert.equal(exportEen.ok, true);
    assert.equal(exportTwee.ok, true);
    const [{ aantal }] = await db.select({ aantal: sql<number>`count(*)::int` })
      .from(accountviewExportLogsTable)
      .where(and(
        eq(accountviewExportLogsTable.bankMutatieId, gematchteMutatie.id),
        eq(accountviewExportLogsTable.status, "geslaagd"),
      ));
    assert.equal(aantal, 1);
    assert(exportLog.id);
    bewijs("AccountView weigert niet-afgeletterd en herstelt een geslaagde export idempotent zonder tweede log");

    const audit = await db.select().from(bankAfletterAuditTable)
      .where(inArray(bankAfletterAuditTable.mutatieId, mutaties.map((m) => m.id)));
    assert(audit.filter((a) => a.actie === "automatisch_gematcht").length >= 3);
    bewijs("automatische matches hebben een duurzaam auditspoor");
  } finally {
    if (bewijsMailMessageIds.length > 0) {
      await db.delete(bankMailbijlageClaimsTable)
        .where(inArray(bankMailbijlageClaimsTable.mailMessageId, bewijsMailMessageIds));
      await db.delete(werkInboxMailsTable)
        .where(inArray(werkInboxMailsTable.messageId, bewijsMailMessageIds));
    }
    if (bewijsMailDedupPatronen.length > 0) {
      await db.delete(mailWachtrijTable)
        .where(or(...bewijsMailDedupPatronen.map((patroon) => like(mailWachtrijTable.deduplicatieSleutel, patroon))));
    }
    const imports = await db.select({ id: bankImportsTable.id }).from(bankImportsTable)
      .where(like(bankImportsTable.bestandsnaam, `${tag}%`));
    const ids = [...new Set([...importIds, ...imports.map((i) => i.id)])];
    if (ids.length > 0) {
      const archieven = await db.select({ objectPath: bankImportArchievenTable.objectPath })
        .from(bankImportArchievenTable).where(inArray(bankImportArchievenTable.importId, ids));
      for (const archief of archieven) {
        try {
          await storage.deleteObjectEntity(archief.objectPath);
        } catch {
          console.warn(`Waarschuwing: bewijsobject kon niet worden verwijderd: ${archief.objectPath}`);
        }
      }
      const afschriften = await db.select({ id: bankAfschriftenTable.id })
        .from(bankAfschriftenTable)
        .where(inArray(bankAfschriftenTable.importId, ids));
      const mutaties = afschriften.length > 0
        ? await db.select({ id: bankMutatiesTable.id }).from(bankMutatiesTable)
          .where(inArray(bankMutatiesTable.afschriftId, afschriften.map((a) => a.id)))
        : [];
      if (mutaties.length > 0) {
        await db.delete(accountviewExportLogsTable)
          .where(inArray(accountviewExportLogsTable.bankMutatieId, mutaties.map((m) => m.id)));
      }
      await db.delete(bankImportsTable).where(inArray(bankImportsTable.id, ids));
    }
    if (batchIds.length > 0) await db.delete(betaalbatchesTable).where(inArray(betaalbatchesTable.id, batchIds));
    if (factuurIds.length > 0) await db.delete(facturenTable).where(inArray(facturenTable.id, factuurIds));
    if (dubbelWerkgeverId) await db.delete(werkgeversTable).where(eq(werkgeversTable.id, dubbelWerkgeverId));
    if (bankrekeningIds.length > 0) {
      await db.delete(werkgeverBankrekeningenTable)
        .where(inArray(werkgeverBankrekeningenTable.id, bankrekeningIds));
    }
    if (bewijsWerkgeverIds.length > 0) {
      await db.delete(werkgeversTable).where(inArray(werkgeversTable.id, bewijsWerkgeverIds));
    }
  }
}

main()
  .then(() => {
    console.log("BANK_01 ketenbewijs: GESLAAGD");
    process.exit(0);
  })
  .catch((err) => {
    console.error("BANK_01 ketenbewijs: MISLUKT", err);
    process.exit(1);
  });