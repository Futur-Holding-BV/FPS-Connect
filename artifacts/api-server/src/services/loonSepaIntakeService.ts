// ─── LOON_01 Schakel 1: binnengekomen SEPA-loonbestanden naar het archief ─────
//
// Connect genereert géén SEPA voor lonen — die komen extern binnen (SCAB of de
// boekhouder) per mail. Deze service is de extra actiesoort op het bestaande
// FACTUUR_02-intakemechanisme: hij herkent PAIN.001-bijlagen in alle actieve
// verwerk-mailboxen, slaat ze op als sepa_bestand met status 'ontvangen',
// gekoppeld aan werkgever/periode en aan de bronmail.
//
// Harde regels:
// - De status gaat NOOIT automatisch verder dan 'ontvangen' — geld weg vraagt
//   altijd een menselijke handeling (klaar_voor_bank blijft handwerk).
// - Werkgever of periode onzeker? Dan wél opslaan, maar gemarkeerd als
//   onvolledig + een gebeurtenis. Nooit een gok.

import { and, eq, inArray, isNull, lt, notExists, sql } from "drizzle-orm";
import {
  db,
  sepaBestandenTable,
  salarisdocumentAuditTable,
  werkgeversTable,
  werkgeverBankrekeningenTable,
  werkInboxMailboxenTable,
  werkInboxMailsTable,
} from "@workspace/db";
import { logger } from "../lib/logger";
import { ObjectStorageService } from "../lib/objectStorage";
import { isPainXml, parsePainXml } from "../lib/painParser";
import { haalBijlagen } from "./werkInboxGraph";
import { maakSignaal } from "./factuurstroomService";

const objectStorage = new ObjectStorageService();

interface MailRij {
  messageId: string;
  gebruikerId: number;
  mailboxAdres: string;
  onderwerp: string;
  afzenderNaam: string | null;
  afzenderEmail: string;
  heeftBijlage: boolean;
}

interface WerkgeverRij {
  id: number;
  naam: string;
  /** IBAN's van de bankrekeningen met doel "loon" van déze werkmaatschappij
   *  (ADMINISTRATIE_01 fase 2 — nooit het nummer van een andere BV). */
  loonIbans: string[];
  scabEmailAdres: string | null;
}

function normaliseer(naam: string): string {
  return naam.trim().toLowerCase().replace(/\s*(b\.?v\.?|v\.?o\.?f\.?|n\.?v\.?)\s*$/i, "").replace(/\./g, "").trim();
}

/** Werkgever bepalen — uitsluitend bij een eenduidige match, anders null.
 *  Volgorde van bewijskracht: IBAN-opdrachtgever > afzender is het bekende
 *  SCAB-adres van precies één werkgever > debiteurnaam in het bestand. */
export function bepaalWerkgever(
  werkgevers: WerkgeverRij[],
  parsed: { ibanOpdrachtgever: string | null; naamOpdrachtgever: string | null },
  afzenderEmail: string,
): WerkgeverRij | null {
  if (parsed.ibanOpdrachtgever) {
    const opIban = werkgevers.filter((w) => w.loonIbans.some((iban) => iban.replace(/\s/g, "").toUpperCase() === parsed.ibanOpdrachtgever));
    if (opIban.length === 1) return opIban[0];
    if (opIban.length > 1) return null;
  }
  const afz = afzenderEmail.trim().toLowerCase();
  if (afz) {
    const opScab = werkgevers.filter((w) => w.scabEmailAdres && w.scabEmailAdres.trim().toLowerCase() === afz);
    if (opScab.length === 1) return opScab[0];
    if (opScab.length > 1) return null;
  }
  if (parsed.naamOpdrachtgever) {
    const genorm = normaliseer(parsed.naamOpdrachtgever);
    if (genorm.length >= 3) {
      const opNaam = werkgevers.filter((w) => normaliseer(w.naam) === genorm);
      if (opNaam.length === 1) return opNaam[0];
    }
  }
  return null;
}

/** Periode (jaar, maand) afleiden uit de gevraagde uitvoerdatum van het bestand. */
export function bepaalPeriode(betaaldatum: string | null): { jaar: number; maand: number } | null {
  if (!betaaldatum) return null;
  const m = betaaldatum.match(/^(\d{4})-(\d{2})-\d{2}/);
  if (!m) return null;
  const jaar = parseInt(m[1], 10);
  const maand = parseInt(m[2], 10);
  if (jaar < 2000 || jaar > 2100 || maand < 1 || maand > 12) return null;
  return { jaar, maand };
}

async function verwerkSepaBijlage(
  mail: MailRij,
  bijlage: { name: string; contentType: string; contentBytes?: string },
  werkgevers: WerkgeverRij[],
): Promise<boolean> {
  const buffer = Buffer.from(bijlage.contentBytes ?? "", "base64");
  const xml = buffer.toString("utf-8");
  if (!isPainXml(xml)) return false;

  // Idempotentie: dezelfde mailbijlage nooit twee keer in het archief.
  const [bestaand] = await db.select({ id: sepaBestandenTable.id }).from(sepaBestandenTable)
    .where(and(
      eq(sepaBestandenTable.bronMailMessageId, mail.messageId),
      eq(sepaBestandenTable.bestandsnaam, bijlage.name),
    )).limit(1);
  if (bestaand) {
    logger.info({ messageId: mail.messageId, bijlage: bijlage.name, sepaId: bestaand.id },
      "loon-sepa-intake: bijlage al opgenomen — overslaan");
    return true;
  }

  const parsed = parsePainXml(xml);
  const werkgever = bepaalWerkgever(werkgevers, parsed, mail.afzenderEmail);
  const periode = bepaalPeriode(parsed.betaaldatum);
  const onvolledig = !werkgever || !periode;

  const veiligeNaam = bijlage.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const subPath = `sepa/mailintake/${Date.now()}-${veiligeNaam}`;
  const objectPath = await objectStorage.uploadBestand(subPath, buffer, "application/xml");

  let sepa: typeof sepaBestandenTable.$inferSelect;
  const inserted = await db.insert(sepaBestandenTable).values({
    omschrijving: `Per mail ontvangen van ${mail.afzenderNaam ?? mail.afzenderEmail} ("${mail.onderwerp}")`,
    werkgeverId: werkgever?.id ?? null,
    werkmaatschappij: werkgever?.naam ?? null,
    periodeJaar: periode?.jaar ?? null,
    periodeMaand: periode?.maand ?? null,
    betaaldatum: parsed.betaaldatum,
    totaalbedrag: parsed.controleSom,
    aantalBetalingen: parsed.aantalBetalingen,
    ibanOpdrachtgever: parsed.ibanOpdrachtgever,
    bestandsformaat: "pain.001",
    status: "ontvangen", // en verder gaat hij hier bewust nooit automatisch
    bestandsnaam: bijlage.name,
    objectPath,
    bestandsgrootte: buffer.length,
    uploaderNaam: "Automatische mailintake",
    fouten: parsed.fouten.length > 0 ? parsed.fouten : null,
    batchReferentie: parsed.msgId,
    bron: "mail",
    bronMailMessageId: mail.messageId,
    bronMailboxAdres: mail.mailboxAdres,
    onvolledig,
  }).onConflictDoNothing({
    target: [sepaBestandenTable.bronMailMessageId, sepaBestandenTable.bestandsnaam],
    where: sql`${sepaBestandenTable.bronMailMessageId} IS NOT NULL`,
  }).returning();

  if (inserted.length === 0) {
    // Unieke index vong een race met een parallelle run — idempotent succes.
    logger.info({ messageId: mail.messageId, bijlage: bijlage.name },
      "loon-sepa-intake: race gedetecteerd via unieke index — bijlage al opgenomen");
    return true;
  }
  sepa = inserted[0];

  try {
    await db.insert(salarisdocumentAuditTable).values({
      sepaId: sepa.id,
      actie: "mail_intake",
      gebruikerId: null,
      gebruikerNaam: "Automatische mailintake",
      documentType: "sepa",
      extra: {
        mailbox: mail.mailboxAdres,
        messageId: mail.messageId,
        afzender: mail.afzenderEmail,
        werkgeverGevonden: werkgever?.naam ?? null,
        onvolledig,
      },
    });
  } catch (err) {
    logger.error({ err }, "loon-sepa-intake: auditlog mislukt");
  }

  if (onvolledig) {
    const ontbreekt = [!werkgever ? "werkgever" : null, !periode ? "periode" : null].filter(Boolean).join(" en ");
    await maakSignaal({
      type: "loon_sepa_onvolledig",
      mailMessageId: mail.messageId,
      omschrijving: `SEPA-loonbestand "${bijlage.name}" van ${mail.afzenderNaam ?? mail.afzenderEmail} is opgeslagen in het salarisarchief, maar de ${ontbreekt} kon niet met zekerheid bepaald worden. Iemand moet dit aanvullen voordat het bestand klaargezet kan worden.`,
    });
  }

  logger.info({ sepaId: sepa.id, werkgever: werkgever?.naam ?? null, onvolledig },
    "loon-sepa-intake: SEPA-loonbestand uit mail opgenomen in salarisarchief");
  return true;
}

// ── Ingang: alle onverwerkte mails in actieve verwerk-mailboxen ───────────────

export async function verwerkLoonSepaMails(): Promise<{ verwerkt: number }> {
  const mailboxen = await db.select({ adres: werkInboxMailboxenTable.emailAdres })
    .from(werkInboxMailboxenTable)
    .where(and(
      eq(werkInboxMailboxenTable.actief, true),
      eq(werkInboxMailboxenTable.modus, "verwerken"),
    ));
  if (mailboxen.length === 0) return { verwerkt: 0 };
  const adressen = mailboxen.map((m) => m.adres);

  // Herstel verweesde claims: een procescrash ná het claimen maar vóór de
  // verwerking zou een betaalbestand anders permanent laten liggen. Een claim
  // ouder dan een uur zonder resultaat in het archief geven we terug.
  const uurGeleden = new Date(Date.now() - 60 * 60 * 1000);
  await db.update(werkInboxMailsTable)
    .set({ sepaVerwerktOp: null })
    .where(and(
      inArray(werkInboxMailsTable.mailboxAdres, adressen),
      lt(werkInboxMailsTable.sepaVerwerktOp, uurGeleden),
      notExists(
        db.select({ een: sql`1` }).from(sepaBestandenTable)
          .where(eq(sepaBestandenTable.bronMailMessageId, werkInboxMailsTable.messageId)),
      ),
    ));

  const mails = await db.select({
    messageId: werkInboxMailsTable.messageId,
    gebruikerId: werkInboxMailsTable.gebruikerId,
    mailboxAdres: werkInboxMailsTable.mailboxAdres,
    onderwerp: werkInboxMailsTable.onderwerp,
    afzenderNaam: werkInboxMailsTable.afzenderNaam,
    afzenderEmail: werkInboxMailsTable.afzenderEmail,
    heeftBijlage: werkInboxMailsTable.heeftBijlage,
  })
    .from(werkInboxMailsTable)
    .where(and(
      inArray(werkInboxMailsTable.mailboxAdres, adressen),
      eq(werkInboxMailsTable.heeftBijlage, true),
      isNull(werkInboxMailsTable.sepaVerwerktOp),
    ))
    .orderBy(werkInboxMailsTable.ontvangenOp)
    .limit(20);

  if (mails.length === 0) return { verwerkt: 0 };

  const werkgeverRijen = await db.select({
    id: werkgeversTable.id,
    naam: werkgeversTable.naam,
    scabEmailAdres: werkgeversTable.scabEmailAdres,
  }).from(werkgeversTable);
  // Loonrekeningen per werkmaatschappij (doel "loon") — de oude enkele
  // iban-kolom is bevroren; matching loopt uitsluitend via deze lijst.
  const loonRekeningen = await db.select({
    werkgeverId: werkgeverBankrekeningenTable.werkgeverId,
    iban: werkgeverBankrekeningenTable.iban,
  }).from(werkgeverBankrekeningenTable)
    .where(sql`'loon' = ANY(${werkgeverBankrekeningenTable.doelen})`);
  const werkgevers: WerkgeverRij[] = werkgeverRijen.map((w) => ({
    ...w,
    loonIbans: loonRekeningen.filter((r) => r.werkgeverId === w.id).map((r) => r.iban),
  }));

  let verwerkt = 0;
  for (const mail of mails) {
    // Eerst claimen (dedupe bij parallelle runs), dan verwerken.
    const claim = await db.update(werkInboxMailsTable)
      .set({ sepaVerwerktOp: new Date() })
      .where(and(
        eq(werkInboxMailsTable.mailboxAdres, mail.mailboxAdres),
        eq(werkInboxMailsTable.messageId, mail.messageId),
        isNull(werkInboxMailsTable.sepaVerwerktOp),
      ))
      .returning({ id: werkInboxMailsTable.id });
    if (claim.length === 0) continue;

    try {
      const bijlagen = await bijlagenOphaler(mail.gebruikerId, mail.mailboxAdres, mail.messageId, false);
      const xmlKandidaten = bijlagen.filter((b) =>
        b.contentType.includes("xml") || b.name.toLowerCase().endsWith(".xml"));
      let gevonden = false;
      for (const bijlage of xmlKandidaten) {
        const was = await verwerkSepaBijlage(mail, bijlage, werkgevers);
        gevonden = gevonden || was;
      }
      if (gevonden) verwerkt += 1;
    } catch (err) {
      logger.error({ err, messageId: mail.messageId }, "loon-sepa-intake: verwerking mislukt");
      // Claim teruggeven zodat een volgende run het opnieuw probeert — een
      // tijdelijke Graph-fout mag een betaalbestand nooit stil laten liggen.
      await db.update(werkInboxMailsTable)
        .set({ sepaVerwerktOp: null })
        .where(and(
          eq(werkInboxMailsTable.mailboxAdres, mail.mailboxAdres),
          eq(werkInboxMailsTable.messageId, mail.messageId),
        ));
    }
  }
  return { verwerkt };
}

// Verificatie-haak (zelfde patroon als factuurstroom): alleen het Graph-randje
// is vervangbaar zodat het bewijs-script de volledige pijplijn doorloopt.
type BijlagenOphaler = typeof haalBijlagen;
let bijlagenOphaler: BijlagenOphaler = haalBijlagen;
export function zetLoonSepaBijlagenOphalerVoorVerificatie(fn: BijlagenOphaler | null): void {
  bijlagenOphaler = fn ?? haalBijlagen;
}
