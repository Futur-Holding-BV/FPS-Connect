// ─── BANK_01 — Bankafschrift-mailbox intake ───────────────────────────────────
//
// Verwerkt mails uit mailboxen met isBankafschriftmailbox=true en modus
// 'verwerken'. Per mail worden bijlagen via de strikte Graph-variant opgehaald,
// herkend als CAMT (.xml / CAMT MIME) of Legacy MT940 (.sta/.mt940/.txt) en
// via de gedeelde importmotor (bankafschriftImportService) verwerkt.
//
// Foutbeleid:
// - Geen bijlage / ongeldige extensie / bijlage zonder bytes / parse/importfout
//   / onbekende IBAN → bankafschrift_fout gezet, samenwerkStatus blijft open,
//   bankafschriftVerwerktOp NULL, duurzame faalmail aan hoofdbeheerders.
// - Claim per bijlage via bank_mailbijlage_claims (atomair, onConflictDoNothing).
// - Mail gemarkeerd als verwerkt (bankafschriftVerwerktOp) pas als ALLE geldige
//   bijlagen verwerkt of duplicate zijn EN er geen fout is.
// - Nooit archiveren/verplaatsen/lezen-markeren bij fout.

import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import {
  db,
  werkInboxMailboxenTable,
  werkInboxMailsTable,
  gebruikersTable,
  bankMailbijlageClaimsTable,
  bankImportsTable,
} from "@workspace/db";
import { logger } from "../lib/logger";
import { haalBijlagenStrikt } from "./werkInboxGraph";
import { stuurBankafschriftMisluktMail } from "./email";
import {
  importeerBankafschrift,
  type ImporteerBankafschriftInput,
  type ImporteerBankafschriftResultaat,
} from "./bankafschriftImportService";

// ── Bijlageherkenning ────────────────────────────────────────────────────────

/** CAMT-MIME-typen die onmiskenbaar een CAMT053-bestand aanduiden. */
const CAMT_MIME_TYPEN = new Set([
  "application/xml",
  "text/xml",
  "application/camt.053.001",
]);

/** Bestandsextensies die als CAMT worden herkend (case-insensitief). */
const CAMT_EXTENSIES = new Set([".xml"]);

/** Bestandsextensies die als MT940/legacy worden herkend (case-insensitief). */
const MT940_EXTENSIES = new Set([".sta", ".mt940", ".txt"]);

export type BijlageFormaat = "camt053" | "mt940" | "onbekend";

/**
 * Bepaalt het formaat van een bijlage op basis van extensie én MIME-type.
 * Pure helper — geen zijeffecten.
 */
export function bepaalBijlageFormaat(naam: string, contentType: string): BijlageFormaat {
  const ext = naam.slice(naam.lastIndexOf(".")).toLowerCase();
  if (CAMT_EXTENSIES.has(ext)) return "camt053";
  // CAMT-MIME zonder .xml extensie (zelden maar mogelijk)
  const mimeNormaal = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (CAMT_MIME_TYPEN.has(mimeNormaal)) return "camt053";
  if (MT940_EXTENSIES.has(ext)) return "mt940";
  return "onbekend";
}

/**
 * Fout-classificatie: onderscheidt permanente invoerfouten (claim bewaren)
 * van tijdelijke technische fouten (claim mag worden verwijderd voor retry).
 */
export function isPermanenteFout(fout: string): boolean {
  // Bijlagefouten, parse/format-fouten en onbekende IBAN zijn permanent
  const permanentePatronen = [
    "geen bijlage",
    "geen geldige bankbijlage",
    "ongeldige extensie",
    "leeg",
    "parse",
    "formaat",
    "iban",
    "onbekend iban",
    "onbekende iban",
    "geen bytes",
    "niet herkend",
  ];
  const lager = fout.toLowerCase();
  return permanentePatronen.some((p) => lager.includes(p));
}

// ── Hoofdbeheerders ──────────────────────────────────────────────────────────

async function haalHoofdbeheerders(): Promise<Array<{ id: number; naam: string; email: string }>> {
  return db.select({ id: gebruikersTable.id, naam: gebruikersTable.naam, email: gebruikersTable.email })
    .from(gebruikersTable)
    .where(and(eq(gebruikersTable.rol, "hoofdbeheerder"), eq(gebruikersTable.actief, true)));
}

// ── Duurzame faalmail ────────────────────────────────────────────────────────

async function stuurFaalmail(opties: {
  mailboxAdres: string;
  messageId: string;
  bijlageNaam: string | null;
  foutOmschrijving: string;
}): Promise<void> {
  const sleutelBasis = `bank-mislukt:${opties.mailboxAdres}:${opties.messageId}:${opties.bijlageNaam ?? ""}`;
  // Dedup per fouttype: zelfde fout op zelfde mail/bijlage komt nooit dubbel in de wachtrij
  const deduplicatieSleutel = `${sleutelBasis}:${opties.foutOmschrijving.slice(0, 80)}`;

  const beheerders = await haalHoofdbeheerders();
  for (const b of beheerders) {
    try {
      await stuurBankafschriftMisluktMail({
        naarEmail: b.email,
        naarNaam: b.naam,
        mailboxAdres: opties.mailboxAdres,
        messageId: opties.messageId,
        bijlageNaam: opties.bijlageNaam,
        foutOmschrijving: opties.foutOmschrijving,
        deduplicatieSleutel: `${deduplicatieSleutel}:${b.id}`,
      });
    } catch (err) {
      logger.warn({ err, beheerderId: b.id }, "bank-mailbox: faalmail versturen mislukt");
    }
  }
}

// ── Claim bijlage atomair ────────────────────────────────────────────────────

/**
 * Claimt een bijlage in bank_mailbijlage_claims. Retourneert:
 * - "nieuw" als de claim nieuw is (doorgaan met importeren)
 * - "verwerkt" als de bestaande claim aantoonbaar aan een import is gekoppeld
 * - "mislukt" als een eerdere permanente foutclaim zonder import bestaat
 */
const CLAIM_LEASE_MS = 15 * 60 * 1000;

type ClaimUitkomst =
  | { status: "nieuw"; claimToken: string }
  | { status: "verwerkt" | "mislukt" | "bezig"; claimToken: null };

export async function claimBijlage(
  mailboxAdres: string,
  mailMessageId: string,
  attachmentId: string,
): Promise<ClaimUitkomst> {
  const nu = new Date();
  const claimToken = randomUUID();
  const leaseTot = new Date(nu.getTime() + CLAIM_LEASE_MS);
  const ingevoegd = await db
    .insert(bankMailbijlageClaimsTable)
    .values({
      mailboxAdres,
      mailMessageId,
      attachmentId,
      status: "bezig",
      claimToken,
      leaseTot,
      fout: null,
      bijgewerktOp: nu,
    })
    .onConflictDoNothing()
    .returning({ id: bankMailbijlageClaimsTable.id });
  if (ingevoegd.length > 0) return { status: "nieuw", claimToken };

  // Een worker kan sterven tussen claim en import. Alleen een verlopen,
  // importloze bezig-claim mag atomair door een nieuwe worker worden overgenomen.
  const overgenomen = await db
    .update(bankMailbijlageClaimsTable)
    .set({
      claimToken,
      leaseTot,
      fout: null,
      bijgewerktOp: nu,
    })
    .where(and(
      eq(bankMailbijlageClaimsTable.mailboxAdres, mailboxAdres),
      eq(bankMailbijlageClaimsTable.mailMessageId, mailMessageId),
      eq(bankMailbijlageClaimsTable.attachmentId, attachmentId),
      isNull(bankMailbijlageClaimsTable.importId),
      eq(bankMailbijlageClaimsTable.status, "bezig"),
      or(
        isNull(bankMailbijlageClaimsTable.leaseTot),
        lt(bankMailbijlageClaimsTable.leaseTot, nu),
      ),
    ))
    .returning({ id: bankMailbijlageClaimsTable.id });
  if (overgenomen.length > 0) return { status: "nieuw", claimToken };

  const [bestaand] = await db
    .select({
      importId: bankMailbijlageClaimsTable.importId,
      status: bankMailbijlageClaimsTable.status,
    })
    .from(bankMailbijlageClaimsTable)
    .where(and(
      eq(bankMailbijlageClaimsTable.mailboxAdres, mailboxAdres),
      eq(bankMailbijlageClaimsTable.mailMessageId, mailMessageId),
      eq(bankMailbijlageClaimsTable.attachmentId, attachmentId),
    ))
    .limit(1);
  if (bestaand?.importId != null || bestaand?.status === "verwerkt") {
    return { status: "verwerkt", claimToken: null };
  }
  if (bestaand?.status === "mislukt") return { status: "mislukt", claimToken: null };
  return { status: "bezig", claimToken: null };
}

function decodeerBase64Strikt(contentBytes: string): Buffer {
  const normaal = contentBytes.replace(/\s+/g, "");
  if (
    normaal.length === 0 ||
    normaal.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(normaal)
  ) {
    throw new Error("Ongeldige base64-codering");
  }
  const buffer = Buffer.from(normaal, "base64");
  const canoniek = buffer.toString("base64");
  if (canoniek !== normaal) throw new Error("Ongeldige base64-codering");
  return buffer;
}

/**
 * Koppelt een import-ID aan een bestaande claim (bijwerken na succesvolle import).
 */
async function koppelImportAanClaim(
  mailboxAdres: string,
  mailMessageId: string,
  attachmentId: string,
  importId: number,
  claimToken: string,
): Promise<void> {
  const gekoppeld = await db
    .update(bankMailbijlageClaimsTable)
    .set({
      importId,
      status: "verwerkt",
      claimToken: null,
      leaseTot: null,
      fout: null,
      bijgewerktOp: new Date(),
    })
    .where(
      and(
        eq(bankMailbijlageClaimsTable.mailboxAdres, mailboxAdres),
        eq(bankMailbijlageClaimsTable.mailMessageId, mailMessageId),
        eq(bankMailbijlageClaimsTable.attachmentId, attachmentId),
        eq(bankMailbijlageClaimsTable.claimToken, claimToken),
      ),
    )
    .returning({ id: bankMailbijlageClaimsTable.id });
  if (gekoppeld.length !== 1) {
    throw new Error("Bankbijlageclaim is verlopen of door een andere worker overgenomen");
  }
}

/**
 * Verwijdert een claim zodat de bijlage bij een tijdelijke fout opnieuw
 * geprobeerd kan worden. Alleen aanroepen bij tijdelijke (niet-permanente)
 * fouten.
 */
async function verwijderClaim(
  mailboxAdres: string,
  mailMessageId: string,
  attachmentId: string,
  claimToken: string,
): Promise<void> {
  await db
    .delete(bankMailbijlageClaimsTable)
    .where(
      and(
        eq(bankMailbijlageClaimsTable.mailboxAdres, mailboxAdres),
        eq(bankMailbijlageClaimsTable.mailMessageId, mailMessageId),
        eq(bankMailbijlageClaimsTable.attachmentId, attachmentId),
        eq(bankMailbijlageClaimsTable.claimToken, claimToken),
      ),
    );
}

async function markeerClaimMislukt(
  mailboxAdres: string,
  mailMessageId: string,
  attachmentId: string,
  claimToken: string,
  fout: string,
): Promise<void> {
  await db.update(bankMailbijlageClaimsTable)
    .set({
      status: "mislukt",
      claimToken: null,
      leaseTot: null,
      fout: fout.slice(0, 1000),
      bijgewerktOp: new Date(),
    })
    .where(and(
      eq(bankMailbijlageClaimsTable.mailboxAdres, mailboxAdres),
      eq(bankMailbijlageClaimsTable.mailMessageId, mailMessageId),
      eq(bankMailbijlageClaimsTable.attachmentId, attachmentId),
      eq(bankMailbijlageClaimsTable.claimToken, claimToken),
    ));
}

// ── Foutmarkering op mail ────────────────────────────────────────────────────

async function markeerMailFout(
  mailboxAdres: string,
  messageId: string,
  fout: string,
): Promise<void> {
  // samenwerkStatus blijft open, bankafschriftVerwerktOp blijft NULL
  await db
    .update(werkInboxMailsTable)
    .set({
      bankafschriftFout: fout.slice(0, 1000),
      bijgewerktOp: new Date(),
    })
    .where(
      and(
        eq(werkInboxMailsTable.mailboxAdres, mailboxAdres),
        eq(werkInboxMailsTable.messageId, messageId),
      ),
    );
}

// ── Kern: één bankmail verwerken ─────────────────────────────────────────────

export interface BankMailRij {
  messageId: string;
  gebruikerId: number;
  mailboxAdres: string;
  onderwerp: string;
  heeftBijlage: boolean;
}

export interface BankmailVerwerkingDependencies {
  haalBijlagen?: typeof haalBijlagenStrikt;
  importeer?: typeof importeerBankafschrift;
  stuurFaalmail?: typeof stuurFaalmail;
}

export async function verwerkBankmail(
  mail: BankMailRij,
  dependencies: BankmailVerwerkingDependencies = {},
): Promise<void> {
  const { messageId, gebruikerId, mailboxAdres } = mail;
  const haalBijlagen = dependencies.haalBijlagen ?? haalBijlagenStrikt;
  const importeer = dependencies.importeer ?? importeerBankafschrift;
  const meldFout = dependencies.stuurFaalmail ?? stuurFaalmail;

  // Bijlagen ophalen — strikt: gooit bij token/Graph 403/404/netwerk
  let bijlagen: Awaited<ReturnType<typeof haalBijlagenStrikt>>;
  try {
    bijlagen = await haalBijlagen(gebruikerId, mailboxAdres, messageId, false);
  } catch (err) {
    const fout = err instanceof Error ? err.message : String(err);
    logger.warn({ err, messageId, mailboxAdres }, "bank-mailbox: bijlagen ophalen mislukt (strikt)");
    await markeerMailFout(mailboxAdres, messageId, fout);
    await meldFout({ mailboxAdres, messageId, bijlageNaam: null, foutOmschrijving: fout });
    return;
  }

  // Geen bijlage
  if (bijlagen.length === 0) {
    const fout = "Geen bijlage gevonden in deze bankmail.";
    await markeerMailFout(mailboxAdres, messageId, fout);
    await meldFout({ mailboxAdres, messageId, bijlageNaam: null, foutOmschrijving: fout });
    return;
  }

  // Filter alleen geldige bankbijlagen. In een expliciete bankmailbox wordt
  // geen enkele onbekende bijlage stil genegeerd, ook niet als er daarnaast
  // wel een geldig afschrift aanwezig is.
  const geldigeBijlagen = bijlagen.filter((b) => bepaalBijlageFormaat(b.name, b.contentType) !== "onbekend");
  const ongeldigeBijlagen = bijlagen.filter((b) => bepaalBijlageFormaat(b.name, b.contentType) === "onbekend");

  if (geldigeBijlagen.length === 0) {
    const namen = bijlagen.map((b) => b.name).join(", ");
    const fout = `Geen geldige bankbijlage gevonden (onbekende extensie/MIME). Aangetroffen bijlagen: ${namen}`;
    await markeerMailFout(mailboxAdres, messageId, fout);
    await meldFout({ mailboxAdres, messageId, bijlageNaam: namen, foutOmschrijving: fout });
    return;
  }

  // Verwerk elke geldige bijlage
  let aantalFouten = 0;
  let aantalVerwerkt = 0;
  let aantalWaarschuwingen = 0;
  let aantalBezig = 0;

  if (ongeldigeBijlagen.length > 0) {
    const namen = ongeldigeBijlagen.map((b) => b.name).join(", ");
    const fout = `Ongeldige bankbijlage(n) blijven ter beoordeling staan: ${namen}`;
    await markeerMailFout(mailboxAdres, messageId, fout);
    await meldFout({ mailboxAdres, messageId, bijlageNaam: namen, foutOmschrijving: fout });
    aantalFouten++;
  }

  for (const bijlage of geldigeBijlagen) {
    const foutContext = { messageId, mailboxAdres, bijlage: bijlage.name };

    // Bytes aanwezig?
    if (!bijlage.contentBytes || bijlage.contentBytes.length === 0) {
      const fout = `Bijlage "${bijlage.name}" heeft geen bytes.`;
      logger.warn(foutContext, "bank-mailbox: " + fout);
      await markeerMailFout(mailboxAdres, messageId, fout);
      await meldFout({ mailboxAdres, messageId, bijlageNaam: bijlage.name, foutOmschrijving: fout });
      aantalFouten++;
      continue;
    }

    // Atomaire claim
    const claim = await claimBijlage(mailboxAdres, messageId, bijlage.id);
    if (claim.status === "verwerkt") {
      logger.info(foutContext, "bank-mailbox: bijlage al geclaimd — overslaan (duplicate)");
      aantalVerwerkt++;
      continue;
    }
    if (claim.status === "mislukt") {
      logger.info(foutContext, "bank-mailbox: eerdere permanente foutclaim blijft zichtbaar");
      aantalFouten++;
      continue;
    }
    if (claim.status === "bezig") {
      logger.info(foutContext, "bank-mailbox: bijlage is door een andere worker geclaimd");
      aantalBezig++;
      continue;
    }
    if (claim.status !== "nieuw" || claim.claimToken == null) {
      throw new Error("Ongeldige bankbijlageclaim-uitkomst");
    }
    const claimToken = claim.claimToken;

    // Buffer decoderen
    let buffer: Buffer;
    try {
      buffer = decodeerBase64Strikt(bijlage.contentBytes);
    } catch (err) {
      const fout = `Bijlage "${bijlage.name}" kon niet worden gedecodeerd (base64-fout).`;
      logger.warn({ err, ...foutContext }, "bank-mailbox: " + fout);
      // Permanente fout — claim bewaren, mail markeren, faalmail
      await markeerClaimMislukt(mailboxAdres, messageId, bijlage.id, claimToken, fout);
      await markeerMailFout(mailboxAdres, messageId, fout);
      await meldFout({ mailboxAdres, messageId, bijlageNaam: bijlage.name, foutOmschrijving: fout });
      aantalFouten++;
      continue;
    }

    // Importeren via gedeelde motor
    let resultaat: ImporteerBankafschriftResultaat;
    try {
      const importInput: ImporteerBankafschriftInput = {
        buffer,
        bestandsnaam: bijlage.name,
        contenttype: bijlage.contentType,
        formaat: bepaalBijlageFormaat(bijlage.name, bijlage.contentType) as "camt053" | "mt940",
        bron: "mailbox",
        mailboxAdres,
        mailMessageId: messageId,
        attachmentId: bijlage.id,
      };
      resultaat = await importeer(importInput);
    } catch (err) {
      // Onverwachte technische fout — tijdelijk: claim verwijderen voor retry
      const fout = `Technische fout bij importeren van "${bijlage.name}": ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`;
      logger.error({ err, ...foutContext }, "bank-mailbox: import technische fout");
      await verwijderClaim(mailboxAdres, messageId, bijlage.id, claimToken);
      await markeerMailFout(mailboxAdres, messageId, fout);
      await meldFout({ mailboxAdres, messageId, bijlageNaam: bijlage.name, foutOmschrijving: fout });
      aantalFouten++;
      continue;
    }

    if (resultaat.duplicate) {
      // Sha256-dedup: zelfde bestand al eerder geïmporteerd
      logger.info({ ...foutContext, importId: resultaat.importId }, "bank-mailbox: bijlage dubbel (sha256) — overslaan");
      if (resultaat.importId) {
        await koppelImportAanClaim(mailboxAdres, messageId, bijlage.id, resultaat.importId, claimToken);
      }
      aantalVerwerkt++;
      continue;
    }

    if (!resultaat.ok || !resultaat.importId) {
      const fout = resultaat.fout ?? `Import van "${bijlage.name}" mislukt (onbekende reden).`;
      logger.warn({ ...foutContext, fout }, "bank-mailbox: import mislukt");

      if (!isPermanenteFout(fout)) {
        // Tijdelijke fout: claim verwijderen zodat een volgende run het opnieuw probeert
        await verwijderClaim(mailboxAdres, messageId, bijlage.id, claimToken);
      } else {
        await markeerClaimMislukt(mailboxAdres, messageId, bijlage.id, claimToken, fout);
      }
      // Permanente invoerfout: claim blijft, fout zichtbaar op mail
      await markeerMailFout(mailboxAdres, messageId, fout);
      await meldFout({ mailboxAdres, messageId, bijlageNaam: bijlage.name, foutOmschrijving: fout });
      aantalFouten++;
      continue;
    }

    // Succes: import-ID aan claim koppelen
    await koppelImportAanClaim(mailboxAdres, messageId, bijlage.id, resultaat.importId, claimToken);
    logger.info({ ...foutContext, importId: resultaat.importId }, "bank-mailbox: bijlage succesvol geïmporteerd");
    aantalVerwerkt++;
    if (resultaat.hiatSignalen?.length) {
      const fout = `Afschriftreeks bevat ${resultaat.hiatSignalen.length} hiaat/hiaten: ${resultaat.hiatSignalen.map((h) => h.detail).join(" | ")}`.slice(0, 1000);
      await markeerMailFout(mailboxAdres, messageId, fout);
      await meldFout({ mailboxAdres, messageId, bijlageNaam: bijlage.name, foutOmschrijving: fout });
      aantalWaarschuwingen++;
    }
  }

  // Mail als verwerkt markeren alleen als ALLE geldige bijlagen verwerkt/dubbel zijn EN geen fout
  if (aantalFouten === 0 && aantalBezig === 0 && aantalVerwerkt === geldigeBijlagen.length) {
    await db
      .update(werkInboxMailsTable)
      .set({
        bankafschriftVerwerktOp: new Date(),
        ...(aantalWaarschuwingen === 0 ? { bankafschriftFout: null } : {}),
        bijgewerktOp: new Date(),
      })
      .where(
        and(
          eq(werkInboxMailsTable.mailboxAdres, mailboxAdres),
          eq(werkInboxMailsTable.messageId, messageId),
        ),
      );
    logger.info({ messageId, mailboxAdres, aantalVerwerkt }, "bank-mailbox: mail volledig verwerkt");
  }
}

// ── Ingang: verwerk alle onverwerkte bankmails ────────────────────────────────

export async function verwerkBankafschriftMails(): Promise<{ verwerkt: number }> {
  // Alleen actieve mailboxen in modus 'verwerken' met bankafschrift-vlag
  const bankMailboxen = await db
    .select({ adres: werkInboxMailboxenTable.emailAdres })
    .from(werkInboxMailboxenTable)
    .where(
      and(
        eq(werkInboxMailboxenTable.actief, true),
        eq(werkInboxMailboxenTable.modus, "verwerken"),
        eq(werkInboxMailboxenTable.isBankafschriftmailbox, true),
      ),
    );

  if (bankMailboxen.length === 0) return { verwerkt: 0 };
  const adressen = bankMailboxen.map((m) => m.adres);

  // Onverwerkte mails (bankafschriftVerwerktOp is null)
  const mails = await db
    .select({
      messageId: werkInboxMailsTable.messageId,
      gebruikerId: werkInboxMailsTable.gebruikerId,
      mailboxAdres: werkInboxMailsTable.mailboxAdres,
      onderwerp: werkInboxMailsTable.onderwerp,
      heeftBijlage: werkInboxMailsTable.heeftBijlage,
    })
    .from(werkInboxMailsTable)
    .where(
      and(
        inArray(werkInboxMailsTable.mailboxAdres, adressen),
        isNull(werkInboxMailsTable.bankafschriftVerwerktOp),
      ),
    )
    .orderBy(werkInboxMailsTable.ontvangenOp)
    .limit(20);

  let verwerkt = 0;
  for (const mail of mails) {
    // Atomaire claim op de mail zelf (dedupe bij parallelle runs)
    // We gebruiken een aparte mark op bankafschriftFout om te weten dat
    // de verwerking begonnen is. Maar de eigenlijke dedupe is de bijlage-claim.
    // Mails met een bestaande fout worden wél opnieuw geprobeerd (retrybaar).
    try {
      await verwerkBankmail(mail);
      verwerkt++;
    } catch (err) {
      logger.error({ err, messageId: mail.messageId, mailboxAdres: mail.mailboxAdres },
        "bank-mailbox: onverwachte fout bij verwerken bankmail");
    }
  }
  return { verwerkt };
}
