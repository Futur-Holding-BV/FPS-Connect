// ─── BANK_01 — Bankafschrift import + afletter + AccountView-kern ─────────────
//
// Eén pad voor upload én mailbox. Architectuur-invarianten:
//   • Volledig parsen/valideren vóór definitieve opslag
//   • IBAN-resolutie via werkgever_bankrekeningen (exact één globale rij — anders
//     heel bestand weigeren)
//   • Statement-reekscontrole (hiaat is signaal, saldo-/rekenfout blokkeert)
//   • Bestand-SHA-256 idempotentie: zelfde bestand → duplicate: true, 0 nieuwe regels
//   • Transactionele opslag: import + archief + afschriften + mutaties in één tx
//   • Deterministische matching in dezelfde tx (bedrag in centen)
//   • Batch-completeness-check na matching
//   • Objectopslag-cleanup bij DB-fout

import crypto from "node:crypto";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import {
  db,
  bankImportsTable,
  bankImportArchievenTable,
  bankAfschriftenTable,
  bankMutatiesTable,
  bankAfletterVoorstellenTable,
  bankAfletterAuditTable,
  werkgeverBankrekeningenTable,
  werkgeversTable,
  facturenTable,
  betaalbatchesTable,
  betaalbatchRegelsTable,
  leveranciersTable,
  gebruikersTable,
} from "@workspace/db";
import { logger } from "../lib/logger";
import { parseCamt053, isCamt053 } from "../lib/camt053Parser";
import { parseMt940, isMt940 } from "../lib/mt940Parser";
import type { ParsedBankFile, ParsedStatement, ParsedEntry } from "../lib/bankafschriftTypes";
import {
  bankCentenNaarEuroTekst,
  bankEuroTekstNaarCenten,
  isOpslaanbaarBankbedrag,
} from "../lib/bankafschriftTypes";
import type { ObjectStorageService as ObjectStorageServiceType } from "../lib/objectStorage";
import { stuurBankafschriftHiaatMail } from "./email";

// Lazy-init objectStorage om module-level GCS-initialisatie te vermijden in tests
let _storage: ObjectStorageServiceType | null = null;
async function getStorage(): Promise<ObjectStorageServiceType> {
  if (!_storage) {
    const { ObjectStorageService } = await import("../lib/objectStorage.js");
    _storage = new ObjectStorageService();
  }
  return _storage;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ImporteerBankafschriftInput {
  buffer: Buffer;
  bestandsnaam: string;
  contenttype?: string | null;
  formaat: "camt053" | "mt940";
  bron: "upload" | "mailbox";
  gebruikerId?: number | null;
  mailboxAdres?: string | null;
  mailMessageId?: string | null;
  attachmentId?: string | null;
}

export interface ImporteerBankafschriftResultaat {
  ok: boolean;
  fout?: string;
  /** true als dit bestand al eerder verwerkt is (sha256 dubbel) */
  duplicate?: boolean;
  importId?: number;
  aantalNieuweAfschriften?: number;
  aantalNieuweMutaties?: number;
  aantalGematcht?: number;
  hiatSignalen?: HiatSignaal[];
  /** Gemelde IBAN's die naar geen werkgever-bankrekening resolveren */
  onbekendIbans?: string[];
}

export interface HiatSignaal {
  iban: string;
  statementId: string;
  soort: "volgnummer_hiaat" | "datumreeks_hiaat" | "saldo_mismatch";
  detail: string;
}

function valideerStatementBedragen(stmt: ParsedStatement): string | null {
  if (!Number.isSafeInteger(stmt.openingsbalans) || !Number.isSafeInteger(stmt.slotbalans)) {
    return "openings- of slotbalans is geen veilig geheel aantal centen";
  }

  const opening = BigInt(stmt.openingsbalans);
  const slot = BigInt(stmt.slotbalans);
  if (!isOpslaanbaarBankbedrag(opening) || !isOpslaanbaarBankbedrag(slot)) {
    return "openings- of slotbalans valt buiten het veilige opslagbereik";
  }

  let mutatiesom = 0n;
  for (const entry of stmt.entries) {
    if (!Number.isSafeInteger(entry.bedragCent)) {
      return `mutatie ${entry.bankReferentie} is geen veilig geheel aantal centen`;
    }
    const bedrag = BigInt(entry.bedragCent);
    if (!isOpslaanbaarBankbedrag(bedrag)) {
      return `mutatie ${entry.bankReferentie} valt buiten het veilige opslagbereik`;
    }
    mutatiesom += bedrag;
  }

  if (!isOpslaanbaarBankbedrag(mutatiesom)) {
    return `mutatiesom ${mutatiesom} cent valt buiten het veilige opslagbereik`;
  }
  if (opening + mutatiesom !== slot) {
    return `saldo-verificatie mislukt: opening ${opening} + mutaties ${mutatiesom} ≠ slot ${slot}`;
  }
  return null;
}

interface ReeksVorige {
  statementId: string;
  volgnummer: number | null;
  totDatum: string;
  eindsaldoCent: number;
}

interface ReeksItem {
  sleutel: string;
  dbId: number | null;
  isNieuw: boolean;
  statementId: string;
  volgnummer: number | null;
  openingsdatum: string;
  slotdatum: string;
  openingssaldoCent: number;
  eindsaldoCent: number;
}

class ReeksControleFout extends Error {}

function dagnummer(datum: string): number | null {
  const ms = Date.parse(`${datum.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : null;
}

function vergelijkReeksItem(a: ReeksItem, b: ReeksItem): number {
  const datumVergelijking = a.openingsdatum.localeCompare(b.openingsdatum);
  if (datumVergelijking !== 0) return datumVergelijking;
  if (a.volgnummer != null && b.volgnummer != null && a.volgnummer !== b.volgnummer) {
    return a.volgnummer - b.volgnummer;
  }
  return a.slotdatum.localeCompare(b.slotdatum) || a.statementId.localeCompare(b.statementId);
}

// ── Exporteerbare helper-functies (voor unit-tests) ───────────────────────────

/**
 * Extraheer tokens uit remittance/referentie-string voor factuurnummer-matching.
 * Splitst op niet-alfanumerieke tekens en geeft unieke tokens ≥ 3 tekens terug.
 */
export function extractTokens(tekst: string | null | undefined): string[] {
  if (!tekst) return [];
  return [...new Set(
    tekst
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter((t) => t.length >= 3),
  )];
}

/**
 * Controleer of een factuurnummer/kenmerk als token voorkomt in referentie of omschrijving.
 * Matching-strategie: tokeniseer zowel de zoektekst als de referentie-tekst en kijk of
 * ELKE token van het factuurnummer in de referentietokens zit (AND-match).
 * Zo wordt "F2024-0042" gevonden als zowel "F2024" als "0042" in de referentie staan.
 */
export function tokenMatchesFaktuur(
  factuurnummer: string | null | undefined,
  kenmerk: string | null | undefined,
  referentie: string | null | undefined,
  omschrijving: string | null | undefined,
): boolean {
  const refTokens = new Set([
    ...extractTokens(referentie),
    ...extractTokens(omschrijving),
  ]);

  const kandidaten = [factuurnummer, kenmerk].filter(Boolean) as string[];

  return kandidaten.some((k) => {
    // Tokeniseer het factuurnummer zelf — elk deel moet in de referentie staan
    const factuurTokens = extractTokens(k);
    if (factuurTokens.length === 0) return false;
    // AND-semantiek: alle tokens van het factuurnummer moeten voorkomen
    return factuurTokens.every((t) => refTokens.has(t));
  });
}

/**
 * Parseer FPS-BATCH-{batchId}-{factuurId} uit een endToEnd-referentie.
 * Retourneert { batchId, factuurId } of null.
 */
export function parseerFpsBatchRef(
  endToEndRef: string | null | undefined,
): { batchId: number; factuurId: number } | null {
  if (!endToEndRef) return null;
  const m = endToEndRef.match(/^FPS-BATCH-(\d+)-(\d+)$/i);
  if (!m) return null;
  const batchId = parseInt(m[1], 10);
  const factuurId = parseInt(m[2], 10);
  if (!Number.isFinite(batchId) || !Number.isFinite(factuurId)) return null;
  return { batchId, factuurId };
}

/**
 * Berekend sha256-hash van een buffer als hex-string.
 */
export function berekenSha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// ── Hoofd-import-functie ──────────────────────────────────────────────────────

export async function importeerBankafschrift(
  input: ImporteerBankafschriftInput,
): Promise<ImporteerBankafschriftResultaat> {
  const {
    buffer,
    bestandsnaam,
    contenttype,
    formaat,
    bron,
    gebruikerId,
    mailboxAdres,
    mailMessageId,
    attachmentId,
  } = input;

  // 1. SHA-256 idempotentie-check ─────────────────────────────────────────────
  const sha256 = berekenSha256(buffer);

  const [bestaandeImport] = await db
    .select({ id: bankImportsTable.id, status: bankImportsTable.status })
    .from(bankImportsTable)
    .where(eq(bankImportsTable.sha256, sha256))
    .limit(1);

  if (bestaandeImport) {
    logger.info({ sha256, importId: bestaandeImport.id }, "bankafschrift-import: duplicate sha256 — reeds verwerkt");
    return {
      ok: true,
      duplicate: true,
      importId: bestaandeImport.id,
      aantalNieuweAfschriften: 0,
      aantalNieuweMutaties: 0,
      aantalGematcht: 0,
    };
  }

  // 2. Parsen en valideren ────────────────────────────────────────────────────
  const inhoud = buffer.toString("utf-8");
  let parseResultaat: { ok: true; bestand: ParsedBankFile } | { ok: false; fout: string };

  if (formaat === "camt053") {
    if (!isCamt053(inhoud)) {
      return { ok: false, fout: "Bestand is geen geldig CAMT.053-formaat (geen BkToCstmrStmt gevonden)" };
    }
    parseResultaat = parseCamt053(inhoud);
  } else {
    if (!isMt940(inhoud)) {
      return { ok: false, fout: "Bestand is geen geldig MT940-formaat (geen :20: tag gevonden)" };
    }
    parseResultaat = parseMt940(inhoud);
  }

  if (!parseResultaat.ok) {
    return { ok: false, fout: `Parser-fout: ${parseResultaat.fout}` };
  }

  const bestand = parseResultaat.bestand;
  const { statements } = bestand;

  if (statements.length === 0) {
    return { ok: false, fout: "Bestand bevat geen statements" };
  }
  const nietEuroStatement = statements.find((statement) => statement.valuta !== "EUR");
  if (nietEuroStatement) {
    return {
      ok: false,
      fout:
        `Statement ${nietEuroStatement.statementId} voor IBAN ${nietEuroStatement.iban} ` +
        `heeft valuta ${nietEuroStatement.valuta}; BANK_01 verwerkt uitsluitend EUR zonder valutaconversie.`,
    };
  }
  for (const statement of statements) {
    const bedragFout = valideerStatementBedragen(statement);
    if (bedragFout) {
      return {
        ok: false,
        fout: `Statement ${statement.statementId} voor IBAN ${statement.iban}: ${bedragFout}.`,
      };
    }
  }

  // 3. IBAN-resolutie: elke statement-IBAN moet naar exact één werkgever ───────
  const alleIbans = [...new Set(statements.map((s) => s.iban))];

  // Haal alle werkgever-bankrekeningen op voor deze IBANs
  const bankrekeningRijen = await db
    .select({
      id: werkgeverBankrekeningenTable.id,
      werkgeverId: werkgeverBankrekeningenTable.werkgeverId,
      iban: werkgeverBankrekeningenTable.iban,
      doelen: werkgeverBankrekeningenTable.doelen,
    })
    .from(werkgeverBankrekeningenTable)
    .where(inArray(werkgeverBankrekeningenTable.iban, alleIbans));

  // Bouw IBAN → [rijen] map
  const ibanNaarRijen = new Map<string, typeof bankrekeningRijen>();
  for (const rij of bankrekeningRijen) {
    const bestaand = ibanNaarRijen.get(rij.iban) ?? [];
    bestaand.push(rij);
    ibanNaarRijen.set(rij.iban, bestaand);
  }

  // Valideer: elke IBAN moet exact één rij hebben (globaal = één werkgever-bankrekening)
  const onbekendIbans: string[] = [];
  const ibanNaarBankrekening = new Map<string, { id: number; werkgeverId: number; doelen: string[] }>();

  for (const iban of alleIbans) {
    const rijen = ibanNaarRijen.get(iban) ?? [];
    if (rijen.length === 0) {
      onbekendIbans.push(iban);
    } else if (rijen.length > 1) {
      const uniekeWerkgevers = new Set(rijen.map((r) => r.werkgeverId));
      return {
        ok: false,
        fout: `IBAN ${iban} is dubbelzinnig geregistreerd in ${rijen.length} bankrekeningrecords voor werkgever(s) ${[...uniekeWerkgevers].join(", ")}. Corrigeer het bankrekening-register vóór import.`,
      };
    } else {
      ibanNaarBankrekening.set(iban, { id: rijen[0].id, werkgeverId: rijen[0].werkgeverId, doelen: rijen[0].doelen });
    }
  }

  if (onbekendIbans.length > 0) {
    return {
      ok: false,
      fout: `Onbekende IBAN(s): ${onbekendIbans.join(", ")}. Registreer deze bankrekening(en) bij de juiste werkgever vóór import.`,
      onbekendIbans,
    };
  }

  // 4. Statement-reeksvoorbereiding ───────────────────────────────────────────
  // De gezaghebbende reekscontrole gebeurt binnen de opslagtransactie onder
  // een advisory lock per bankrekening. Zo kunnen twee imports niet allebei
  // tegen dezelfde verouderde reeks valideren.
  const hiatSignalen: HiatSignaal[] = [];
  const perIban = new Map<string, ParsedStatement[]>();
  for (const stmt of statements) perIban.set(stmt.iban, [...(perIban.get(stmt.iban) ?? []), stmt]);

  // 5. Objectopslag: archiveer originele bytes per unieke werkgever ───────────
  // Groepeer statements per werkgever voor archivering
  const werkgeverIds = new Set<number>();
  for (const stmt of statements) {
    werkgeverIds.add(ibanNaarBankrekening.get(stmt.iban)!.werkgeverId);
  }

  const objectPaths: { werkgeverId: number; objectPath: string }[] = [];
  const jaar = new Date().getFullYear();

  const storageService = await getStorage();
  for (const werkgeverId of werkgeverIds) {
    // Een unieke objectsleutel per importpoging voorkomt dat de verliezer van
    // een gelijktijdige sha256-race bij cleanup het archief van de winnaar wist.
    const pogingId = crypto.randomUUID();
    const subPath = `werkgevers/${werkgeverId}/bankafschriften/${jaar}/${bestandsnaam.replace(/[^a-zA-Z0-9._-]/g, "_")}-${sha256.slice(0, 8)}-${pogingId}`;
    try {
      const objectPath = await storageService.uploadBestand(subPath, buffer, contenttype ?? "application/octet-stream");
      objectPaths.push({ werkgeverId, objectPath });
    } catch (err) {
      // Cleanup al geüploade objecten
      for (const up of objectPaths) {
        await storageService.deleteBestand(up.objectPath).catch(() => {});
      }
      return {
        ok: false,
        fout: `Objectopslag mislukt voor werkgever ${werkgeverId}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // 6. Transactionele opslag: import + archief + afschriften + mutaties ────────
  let importId: number;
  let aantalNieuweAfschriften = 0;
  let aantalNieuweMutaties = 0;
  let aantalGematcht = 0;

  try {
    await db.transaction(async (tx) => {
      // 6a. Reekscontrole onder één transactie-lock per rekening. We voegen
      // bestaande en nieuwe statements chronologisch samen en controleren
      // iedere grens waarbij minstens één nieuw statement betrokken is.
      const reeksHiaatPerNieuwStatement = new Set<string>();
      const bestaandeReeksUpdates = new Map<number, boolean>();

      for (const bankrekeningId of [...new Set([...ibanNaarBankrekening.values()].map((r) => r.id))].sort((a, b) => a - b)) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(1171, ${bankrekeningId})`);
      }

      for (const [iban, ibanStatements] of perIban) {
        const bankrekening = ibanNaarBankrekening.get(iban)!;
        const bestaande = await tx
          .select({
            id: bankAfschriftenTable.id,
            statementId: bankAfschriftenTable.statementId,
            volgnummer: bankAfschriftenTable.volgnummer,
            vanDatum: bankAfschriftenTable.vanDatum,
            totDatum: bankAfschriftenTable.totDatum,
            openingssaldo: bankAfschriftenTable.openingssaldo,
            eindsaldo: bankAfschriftenTable.eindsaldo,
          })
          .from(bankAfschriftenTable)
          .where(eq(bankAfschriftenTable.bankrekeningId, bankrekening.id));

        const nieuweIds = new Set<string>();
        for (const stmt of ibanStatements) {
          if (nieuweIds.has(stmt.statementId)) {
            throw new ReeksControleFout(`Statement ${stmt.statementId} komt meer dan één keer voor in hetzelfde bestand voor IBAN ${iban}.`);
          }
          nieuweIds.add(stmt.statementId);
        }
        const bestaandIds = new Set(bestaande.map((r) => r.statementId));
        const reedsOpgeslagen = [...nieuweIds].find((id) => bestaandIds.has(id));
        if (reedsOpgeslagen) {
          throw new ReeksControleFout(
            `Statement ${reedsOpgeslagen} voor IBAN ${iban} is al via een ander importbestand verwerkt. Het hele bestand is geweigerd.`,
          );
        }

        const bestaandeReeks = bestaande.map((r): ReeksItem => {
          const openingssaldoCent = bankEuroTekstNaarCenten(r.openingssaldo);
          const eindsaldoCent = bankEuroTekstNaarCenten(r.eindsaldo);
          if (openingssaldoCent === null || eindsaldoCent === null) {
            throw new ReeksControleFout(
              `Bestaand statement ${r.statementId} voor IBAN ${iban} bevat een ongeldig saldo.`,
            );
          }
          return {
            sleutel: `db:${r.id}`,
            dbId: r.id,
            isNieuw: false,
            statementId: r.statementId,
            volgnummer: r.volgnummer,
            openingsdatum: r.vanDatum,
            slotdatum: r.totDatum,
            openingssaldoCent,
            eindsaldoCent,
          };
        });
        const reeks: ReeksItem[] = [
          ...bestaandeReeks,
          ...ibanStatements.map((stmt) => ({
            sleutel: `nieuw:${stmt.statementId}`,
            dbId: null,
            isNieuw: true,
            statementId: stmt.statementId,
            volgnummer: stmt.volgnummer,
            openingsdatum: stmt.openingsdatum,
            slotdatum: stmt.slotdatum,
            openingssaldoCent: stmt.openingsbalans,
            eindsaldoCent: stmt.slotbalans,
          })),
        ].sort(vergelijkReeksItem);

        for (let index = 1; index < reeks.length; index++) {
          const vorige = reeks[index - 1]!;
          const huidige = reeks[index]!;
          if (!vorige.isNieuw && !huidige.isNieuw) continue;

          if (huidige.openingssaldoCent !== vorige.eindsaldoCent) {
            throw new ReeksControleFout(
              `Saldo-mismatch voor IBAN ${iban}: statement ${huidige.statementId} opent met ${huidige.openingssaldoCent} cent, maar statement ${vorige.statementId} sloot met ${vorige.eindsaldoCent} cent.`,
            );
          }

          let hiaat: HiatSignaal | null = null;
          if (huidige.volgnummer != null && vorige.volgnummer != null) {
            const jaarWisselMetReset =
              vorige.slotdatum.slice(0, 4) !== huidige.openingsdatum.slice(0, 4) &&
              huidige.volgnummer === 1;
            const verwacht = vorige.volgnummer + 1;
            if (!jaarWisselMetReset && huidige.volgnummer !== verwacht) {
              hiaat = {
                iban,
                statementId: huidige.statementId,
                soort: "volgnummer_hiaat",
                detail: `Verwacht volgnummer ${verwacht}, maar aangeleverd ${huidige.volgnummer} (na statement ${vorige.statementId})`,
              };
            }
          } else {
            const vorigDag = dagnummer(vorige.slotdatum);
            const nieuwDag = dagnummer(huidige.openingsdatum);
            if (vorigDag != null && nieuwDag != null && nieuwDag - vorigDag > 1) {
              hiaat = {
                iban,
                statementId: huidige.statementId,
                soort: "datumreeks_hiaat",
                detail: `Er zitten ${nieuwDag - vorigDag - 1} ontbrekende dag(en) tussen ${vorige.slotdatum} en ${huidige.openingsdatum}.`,
              };
            }
          }

          if (hiaat) {
            hiatSignalen.push(hiaat);
            if (huidige.isNieuw) reeksHiaatPerNieuwStatement.add(`${iban}:${huidige.statementId}`);
          }
          if (!huidige.isNieuw && huidige.dbId != null) {
            bestaandeReeksUpdates.set(huidige.dbId, hiaat != null);
          }
        }
      }

      for (const [afschriftId, heeftHiaat] of bestaandeReeksUpdates) {
        await tx.update(bankAfschriftenTable)
          .set({
            reeksHiaat: heeftHiaat,
            status: heeftHiaat ? "hiaat" : "verwerkt",
            bijgewerktOp: new Date(),
          })
          .where(eq(bankAfschriftenTable.id, afschriftId));
      }

      // 6b. bank_imports aanmaken. Mailboxclaims blijven bewust eigendom van
      // bankafschriftMailboxService: alleen die laag kent het actuele leasetoken.
      const [importRij] = await tx
        .insert(bankImportsTable)
        .values({
          sha256,
          formaat,
          bestandsnaam,
          contenttype: contenttype ?? null,
          bron,
          mailboxAdres: mailboxAdres ?? null,
          mailMessageId: mailMessageId ?? null,
          attachmentId: attachmentId ?? null,
          status: hiatSignalen.length > 0 ? "gedeeltelijk" : "verwerkt",
          aangemaaktDoor: gebruikerId ?? null,
        })
        .returning({ id: bankImportsTable.id });

      importId = importRij!.id;

      // 6c. bank_import_archieven aanmaken per werkgever
      for (const { werkgeverId, objectPath } of objectPaths) {
        await tx
          .insert(bankImportArchievenTable)
          .values({
            importId: importId!,
            werkgeverId,
            objectPath,
          })
          .onConflictDoNothing();
      }

      // 6d. Afschriften + mutaties per statement
      for (const stmt of statements) {
        const bankrekening = ibanNaarBankrekening.get(stmt.iban)!;
        const heeftHiaat = reeksHiaatPerNieuwStatement.has(`${stmt.iban}:${stmt.statementId}`);
        const isGRekening = (bankrekening.doelen ?? []).includes("g_rekening");

        // Mutatiesom in euro (voor DB-opslag als numeric)
        const mutatieSomCent = stmt.entries.reduce(
          (s, e) => s + BigInt(e.bedragCent),
          0n,
        );
        const mutatieSomEuro = bankCentenNaarEuroTekst(mutatieSomCent);

        // bank_afschriften INSERT (skip bij conflict = reeds verwerkt)
        const [afschriftRij] = await tx
          .insert(bankAfschriftenTable)
          .values({
            importId: importId!,
            bankrekeningId: bankrekening.id,
            werkgeverId: bankrekening.werkgeverId,
            iban: stmt.iban,
            statementId: stmt.statementId,
            volgnummer: stmt.volgnummer,
            banknaam: bestand.banknaam,
            vanDatum: stmt.openingsdatum,
            totDatum: stmt.slotdatum,
            openingssaldo: bankCentenNaarEuroTekst(stmt.openingsbalans),
            eindsaldo: bankCentenNaarEuroTekst(stmt.slotbalans),
            mutatiesom: mutatieSomEuro,
            valuta: stmt.valuta,
            reeksHiaat: heeftHiaat,
            status: heeftHiaat ? "hiaat" : "verwerkt",
          })
          .onConflictDoNothing()
          .returning({ id: bankAfschriftenTable.id });

        if (!afschriftRij) {
          // Statement reeds opgeslagen (iban+statementId uniek) — skip
          continue;
        }

        aantalNieuweAfschriften++;

        // 6f. Mutaties per entry
        for (const entry of stmt.entries) {
          const creditDebit = entry.bedragCent >= 0 ? "CRDT" : "DBIT";
          const bedragGesigneerd = bankCentenNaarEuroTekst(entry.bedragCent);

          // G-rekening bepalen:
          // 1. Eigen rekening is een G-rekening
          // 2. Tegenpartij-IBAN staat in een werkgever/leverancier G-rekening
          let gRekeningMarkering = isGRekening;

          if (!gRekeningMarkering && entry.tegenpartijIban) {
            // Controleer of tegenpartij-IBAN een bekende G-rekening is
            const gRekeningCheck = await tx
              .select({ id: werkgeverBankrekeningenTable.id })
              .from(werkgeverBankrekeningenTable)
              .where(
                and(
                  eq(werkgeverBankrekeningenTable.iban, entry.tegenpartijIban),
                  sql`'g_rekening' = ANY(${werkgeverBankrekeningenTable.doelen})`,
                ),
              )
              .limit(1);

            if (gRekeningCheck.length > 0) {
              gRekeningMarkering = true;
            } else {
              // Controleer ook leveranciers-G-rekeningen
              const leverGRekening = await tx
                .select({ id: leveranciersTable.id })
                .from(leveranciersTable)
                .where(eq(leveranciersTable.gRekeningIban, entry.tegenpartijIban))
                .limit(1);
              if (leverGRekening.length > 0) {
                gRekeningMarkering = true;
              }
            }
          }

          // Mutatie INSERT (skip bij conflict)
          const [mutatieRij] = await tx
            .insert(bankMutatiesTable)
            .values({
              afschriftId: afschriftRij.id,
              bankrekeningId: bankrekening.id,
              werkgeverId: bankrekening.werkgeverId,
              bankreferentie: entry.bankReferentie,
              txReferentie: entry.txReferentie,
              endToEndReferentie: entry.endToEndReferentie,
              bedrag: bedragGesigneerd,
              valuta: stmt.valuta,
              creditDebit,
              boekdatum: entry.boekingsdatum,
              valuedatum: entry.valutadatum,
              tegenpartijIban: entry.tegenpartijIban,
              tegenpartijNaam: entry.tegenpartijNaam,
              remittance: entry.omschrijving,
              gRekening: gRekeningMarkering,
              reconciliatieStatus: "onbekend",
            })
            .onConflictDoNothing()
            .returning({ id: bankMutatiesTable.id });

          if (!mutatieRij) {
            // Mutatie reeds opgeslagen (bankrekeningId+bankreferentie uniek)
            continue;
          }

          aantalNieuweMutaties++;

          // 6g. Deterministische matching
          const matchResultaat = await matchMutatie(
            tx,
            {
              id: mutatieRij.id,
              werkgeverId: bankrekening.werkgeverId,
              bedragCent: entry.bedragCent,
              creditDebit,
              endToEndReferentie: entry.endToEndReferentie,
              bankreferentie: entry.bankReferentie,
              tegenpartijIban: entry.tegenpartijIban,
              omschrijving: entry.omschrijving,
              gRekening: gRekeningMarkering,
              importId: importId!,
              boekdatum: entry.boekingsdatum,
            },
          );

          if (matchResultaat.gematcht) {
            aantalGematcht++;
          }
        }
      }

      // 6h. Batch-completeness-check na alle mutaties
      await controleerBatchCompleteness(tx, importId!);
    });
  } catch (err) {
    // Cleanup objectopslag bij DB-fout
    const storageForCleanup = await getStorage().catch(() => null);
    for (const { objectPath } of objectPaths) {
      await storageForCleanup?.deleteBestand(objectPath).catch(() => {});
    }
    logger.error({ err, sha256, bestandsnaam }, "bankafschrift-import: transactionele opslag mislukt");
    const [gelijktijdigOpgeslagen] = await db
      .select({ id: bankImportsTable.id })
      .from(bankImportsTable)
      .where(eq(bankImportsTable.sha256, sha256))
      .limit(1);
    if (gelijktijdigOpgeslagen) {
      return {
        ok: true,
        duplicate: true,
        importId: gelijktijdigOpgeslagen.id,
        aantalNieuweAfschriften: 0,
        aantalNieuweMutaties: 0,
        aantalGematcht: 0,
      };
    }
    return {
      ok: false,
      fout: err instanceof ReeksControleFout
        ? err.message
        : `Opslag mislukt: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (bron === "upload" && hiatSignalen.length > 0) {
    const beheerders = await db
      .select({ id: gebruikersTable.id, naam: gebruikersTable.naam, email: gebruikersTable.email })
      .from(gebruikersTable)
      .where(and(eq(gebruikersTable.rol, "hoofdbeheerder"), eq(gebruikersTable.actief, true)));
    for (const beheerder of beheerders) {
      if (!beheerder.email) continue;
      try {
        await stuurBankafschriftHiaatMail({
          naarEmail: beheerder.email,
          naarNaam: beheerder.naam,
          bestandsnaam,
          importId: importId!,
          hiaten: hiatSignalen.map((h) => h.detail),
          deduplicatieSleutel: `bank-hiaat:${sha256}:${beheerder.id}`,
        });
      } catch (err) {
        logger.warn({ err, importId: importId!, beheerderId: beheerder.id }, "bankafschrift-import: hiaatmail kon niet worden ingepland");
      }
    }
  }

  return {
    ok: true,
    duplicate: false,
    importId: importId!,
    aantalNieuweAfschriften,
    aantalNieuweMutaties,
    aantalGematcht,
    hiatSignalen: hiatSignalen.length > 0 ? hiatSignalen : undefined,
  };
}

// ── Matching-kern ─────────────────────────────────────────────────────────────

interface MutatieContext {
  id: number;
  werkgeverId: number;
  bedragCent: number;
  creditDebit: string;
  endToEndReferentie: string | null;
  bankreferentie: string;
  tegenpartijIban: string | null;
  omschrijving: string | null;
  gRekening: boolean;
  importId: number;
  boekdatum: string;
}

interface MatchResultaat {
  gematcht: boolean;
}

type TxDb = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function matchMutatie(
  tx: TxDb,
  ctx: MutatieContext,
): Promise<MatchResultaat> {
  const { id: mutatieId, werkgeverId, bedragCent, creditDebit } = ctx;

  // Credit-mutatie (bedrag > 0): verkoopfactuur-matching
  if (creditDebit === "CRDT" && bedragCent > 0) {
    return await matchCreditMutatie(tx, ctx);
  }

  // Debet-mutatie (bedrag < 0): batch-regel OF inkoopfactuur matching
  if (creditDebit === "DBIT" && bedragCent < 0) {
    return await matchDebetMutatie(tx, ctx);
  }

  // Neutraal (0) of onduidelijk: geen kandidaat
  await tx.update(bankMutatiesTable)
    .set({ reconciliatieStatus: "geen_kandidaat", bijgewerktOp: new Date() })
    .where(eq(bankMutatiesTable.id, mutatieId));
  return { gematcht: false };
}

async function matchCreditMutatie(tx: TxDb, ctx: MutatieContext): Promise<MatchResultaat> {
  const { id: mutatieId, werkgeverId, bedragCent, endToEndReferentie, bankreferentie, omschrijving } = ctx;

  // Zoek openstaande verkoopfacturen van dezelfde werkgever met exact bedrag
  // Facturen table heeft geen directe werkgeverId; we zoeken via tenaamstellingBv → werkgevers.naam
  // Alternatief: via betaalbatches die werkgeverId hebben
  // De facturen-tabel heeft tenaamstellingBv (text) maar geen directe FK naar werkgevers.
  // We gebruiken de werkgever-naam-lookup en vergelijken via accountview_instellingen.werkgeverId

  const [werkgeverRij] = await tx
    .select({ naam: werkgeversTable.naam })
    .from(werkgeversTable)
    .where(eq(werkgeversTable.id, werkgeverId))
    .limit(1);
  if (!werkgeverRij) {
    await tx.update(bankMutatiesTable).set({ reconciliatieStatus: "geen_kandidaat", bijgewerktOp: new Date() }).where(eq(bankMutatiesTable.id, mutatieId));
    return { gematcht: false };
  }

  // Verkoopfacturen: bedrag exact in centen, status openstaand, zelfde werkgever
  // Facturen.bedragInclBtw is numeric (euro-string), converteer naar centen voor vergelijking
  const bedragEuro = bankCentenNaarEuroTekst(bedragCent);

  const kandidatenQuery = await tx
    .select({
      id: facturenTable.id,
      factuurnummer: facturenTable.factuurnummer,
      kenmerk: facturenTable.kenmerk,
      bedragInclBtw: facturenTable.bedragInclBtw,
      betaalstatus: facturenTable.betaalstatus,
      tenaamstellingBv: facturenTable.tenaamstellingBv,
      gRekeningVanToepassing: facturenTable.gRekeningVanToepassing,
    })
    .from(facturenTable)
    .where(
      and(
        eq(facturenTable.type, "verkoop"),
        eq(facturenTable.bedragInclBtw, bedragEuro),
        eq(facturenTable.tenaamstellingBv, werkgeverRij.naam),
      ),
    )
    .for("update")
    .limit(20);

  const gefilterd = kandidatenQuery.filter((f) => !f.betaalstatus || f.betaalstatus === "openstaand");

  // Token-match op factuurnummer/kenmerk in referentie/omschrijving
  const refTekst = [endToEndReferentie, bankreferentie, omschrijving].filter(Boolean).join(" ");
  const tokenGematcht = gefilterd.filter((f) =>
    tokenMatchesFaktuur(f.factuurnummer, f.kenmerk, refTekst, null),
  );

  if (tokenGematcht.length === 1) {
    const factuur = tokenGematcht[0];
    const gRekening = ctx.gRekening || (factuur.gRekeningVanToepassing ?? false);

    const betaalUpdate = await tx
      .update(facturenTable)
      .set({
        betaalstatus: "betaald",
        betaaldatum: ctx.boekdatum,
        betaaldOp: new Date(`${ctx.boekdatum}T12:00:00Z`),
        bijgewerktOp: new Date(),
      })
      .where(
        and(
          eq(facturenTable.id, factuur.id),
          sql`COALESCE(${facturenTable.betaalstatus}, 'openstaand') = 'openstaand'`,
        ),
      )
      .returning({ id: facturenTable.id });
    if (betaalUpdate.length !== 1) {
      throw new Error(`Verkoopfactuur #${factuur.factuurnummer ?? factuur.id} is gelijktijdig al afgeletterd`);
    }

    await tx
      .update(bankMutatiesTable)
      .set({
        reconciliatieStatus: "gematcht",
        matchedFactuurId: factuur.id,
        gRekening,
        bijgewerktOp: new Date(),
      })
      .where(eq(bankMutatiesTable.id, mutatieId));

    await slaAuditOp(tx, mutatieId, null, "automatisch_gematcht",
      `Verkoopfactuur #${factuur.factuurnummer ?? factuur.id} automatisch gematcht op bedrag + token`);

    return { gematcht: true };
  }

  // Geen of meerdere kandidaten: voorstellen opslaan
  if (tokenGematcht.length === 0 && gefilterd.length > 0) {
    // Kandidaten op bedrag maar geen token-match
    let rang = 1;
    for (const f of gefilterd.slice(0, 5)) {
      await slaVoorstelOp(tx, mutatieId, f.id, null, "voorstel",
        `Verkoopfactuur #${f.factuurnummer ?? f.id}: bedrag klopt maar geen factuurnummer/kenmerk in referentie`, rang++);
    }
    await tx.update(bankMutatiesTable).set({ reconciliatieStatus: "meerdere_kandidaten", bijgewerktOp: new Date() }).where(eq(bankMutatiesTable.id, mutatieId));
  } else if (tokenGematcht.length > 1) {
    let rang = 1;
    for (const f of tokenGematcht.slice(0, 5)) {
      await slaVoorstelOp(tx, mutatieId, f.id, null, "voorstel",
        `Verkoopfactuur #${f.factuurnummer ?? f.id}: ambigue match — meerdere facturen met zelfde bedrag + token`, rang++);
    }
    await tx.update(bankMutatiesTable).set({ reconciliatieStatus: "meerdere_kandidaten", bijgewerktOp: new Date() }).where(eq(bankMutatiesTable.id, mutatieId));
  } else {
    await tx.update(bankMutatiesTable).set({ reconciliatieStatus: "geen_kandidaat", bijgewerktOp: new Date() }).where(eq(bankMutatiesTable.id, mutatieId));
  }

  return { gematcht: false };
}

async function matchDebetMutatie(tx: TxDb, ctx: MutatieContext): Promise<MatchResultaat> {
  const { id: mutatieId, werkgeverId, bedragCent, endToEndReferentie, bankreferentie, tegenpartijIban, omschrijving } = ctx;
  const [werkgever] = await tx
    .select({ naam: werkgeversTable.naam })
    .from(werkgeversTable)
    .where(eq(werkgeversTable.id, werkgeverId))
    .limit(1);
  if (!werkgever) {
    await tx.update(bankMutatiesTable)
      .set({ reconciliatieStatus: "geen_kandidaat", bijgewerktOp: new Date() })
      .where(eq(bankMutatiesTable.id, mutatieId));
    return { gematcht: false };
  }

  // Poging 1: FPS-BATCH-{batchId}-{factuurId} exact match
  const fpsBatch = parseerFpsBatchRef(endToEndReferentie);
  if (fpsBatch) {
    const { batchId, factuurId } = fpsBatch;

    const [batchRegel] = await tx
      .select({
        id: betaalbatchRegelsTable.id,
        bedrag: betaalbatchRegelsTable.bedrag,
        crediteurIban: betaalbatchRegelsTable.crediteurIban,
        reconciliatieStatus: betaalbatchRegelsTable.reconciliatieStatus,
        batchId: betaalbatchRegelsTable.batchId,
        batchStatus: betaalbatchesTable.status,
        batchWerkgeverId: betaalbatchesTable.werkgeverId,
      })
      .from(betaalbatchRegelsTable)
      .innerJoin(betaalbatchesTable, eq(betaalbatchRegelsTable.batchId, betaalbatchesTable.id))
      .where(
        and(
          eq(betaalbatchRegelsTable.batchId, batchId),
          eq(betaalbatchRegelsTable.factuurId, factuurId),
          eq(betaalbatchesTable.werkgeverId, werkgeverId),
          inArray(betaalbatchesTable.status, ["bestand_aangemaakt", "bevestigd"]),
        ),
      )
      .for("update")
      .limit(1);

    if (batchRegel) {
      const regelBedragCent = bankEuroTekstNaarCenten(batchRegel.bedrag);
      if (regelBedragCent === null) {
        throw new Error(
          `Betaalbatchregel ${batchRegel.id} bevat een bedrag buiten het exacte opslagbereik`,
        );
      }
      const bedragAbsCent = Math.abs(bedragCent);

      // Bedrag exact (debetmutatie is negatief, batchregel is positief)
      const bedragOk = regelBedragCent === bedragAbsCent;
      // Tegenpartij-IBAN exact (als aanwezig in beide)
      const ibanOk = !tegenpartijIban || !batchRegel.crediteurIban || tegenpartijIban === batchRegel.crediteurIban;

      if (bedragOk && ibanOk && batchRegel.reconciliatieStatus !== "gematcht") {
        const gRekening = ctx.gRekening;

        const regelUpdate = await tx
          .update(betaalbatchRegelsTable)
          .set({
            reconciliatieStatus: "gematcht",
            bankMutatieId: mutatieId,
            gematchBedrag: batchRegel.bedrag,
          })
          .where(
            and(
              eq(betaalbatchRegelsTable.id, batchRegel.id),
              isNull(betaalbatchRegelsTable.bankMutatieId),
              ne(betaalbatchRegelsTable.reconciliatieStatus, "gematcht"),
            ),
          )
          .returning({ id: betaalbatchRegelsTable.id });
        if (regelUpdate.length !== 1) {
          throw new Error(`Betaalbatchregel ${batchRegel.id} is gelijktijdig al afgeletterd`);
        }

        // Markeer inkoopfactuur als betaald
        await tx
          .update(facturenTable)
          .set({
            betaalstatus: "betaald",
            betaaldatum: ctx.boekdatum,
            betaaldOp: new Date(`${ctx.boekdatum}T12:00:00Z`),
            bijgewerktOp: new Date(),
          })
          .where(eq(facturenTable.id, factuurId));

        await tx
          .update(bankMutatiesTable)
          .set({
            reconciliatieStatus: "gematcht",
            matchedFactuurId: factuurId,
            matchedBatchregelId: batchRegel.id,
            gRekening,
            bijgewerktOp: new Date(),
          })
          .where(eq(bankMutatiesTable.id, mutatieId));

        await slaAuditOp(tx, mutatieId, null, "automatisch_gematcht",
          `FPS-BATCH-${batchId}-${factuurId} exact EndToEnd-match`);

        return { gematcht: true };
      }

      // Bedrag of IBAN klopt niet
      if (!bedragOk) {
        await slaVoorstelOp(tx, mutatieId, factuurId, batchRegel.id, "voorstel",
          `FPS-BATCH-${batchId}-${factuurId}: EndToEnd-ref gevonden maar bedrag wijkt af (bank: ${bedragAbsCent}ct, batch: ${regelBedragCent}ct)`, 1);
        await tx.update(bankMutatiesTable).set({ reconciliatieStatus: "geen_kandidaat", bijgewerktOp: new Date() }).where(eq(bankMutatiesTable.id, mutatieId));
        return { gematcht: false };
      }
    }
  }

  // Poging 2: inkoopfactuur op exact factuurnummer/ref + bedrag + leverancier/tegenpartij-IBAN
  const bedragAbsCent = Math.abs(bedragCent);
  const bedragEuro = bankCentenNaarEuroTekst(bedragAbsCent);

  const inkoopKandidaten = await tx
    .select({
      id: facturenTable.id,
      factuurnummer: facturenTable.factuurnummer,
      kenmerk: facturenTable.kenmerk,
      bedragInclBtw: facturenTable.bedragInclBtw,
      betaalstatus: facturenTable.betaalstatus,
      leverancierId: facturenTable.leverancierId,
      gRekeningVanToepassing: facturenTable.gRekeningVanToepassing,
      tenaamstellingBv: facturenTable.tenaamstellingBv,
    })
    .from(facturenTable)
    .where(
      and(
        eq(facturenTable.type, "inkoop"),
        eq(facturenTable.bedragInclBtw, bedragEuro),
        eq(facturenTable.tenaamstellingBv, werkgever.naam),
      ),
    )
    .for("update")
    .limit(20);

  const gefilterd = inkoopKandidaten.filter((f) => !f.betaalstatus || f.betaalstatus === "openstaand");

  const refTekst = [endToEndReferentie, bankreferentie, omschrijving].filter(Boolean).join(" ");
  let tokenGematcht = gefilterd.filter((f) =>
    tokenMatchesFaktuur(f.factuurnummer, f.kenmerk, refTekst, null),
  );

  // Als tegenpartij-IBAN beschikbaar: een geregistreerde leveranciers-IBAN moet
  // exact overeenkomen, ook als er op nummer+bedrag maar één kandidaat is.
  if (tegenpartijIban && tokenGematcht.length > 0) {
    const leverancierIds = tokenGematcht.map((f) => f.leverancierId).filter(Boolean) as number[];
    if (leverancierIds.length > 0) {
      const leveranciers = await tx
        .select({ id: leveranciersTable.id, iban: leveranciersTable.iban })
        .from(leveranciersTable)
        .where(inArray(leveranciersTable.id, leverancierIds));

      const ibanGematchtIds = new Set(
        leveranciers
          .filter((l) => l.iban === tegenpartijIban)
          .map((l) => l.id),
      );

      const metIban = tokenGematcht.filter((f) => f.leverancierId && ibanGematchtIds.has(f.leverancierId));
      tokenGematcht = metIban;
    }
  }

  if (tokenGematcht.length === 1) {
    const factuur = tokenGematcht[0];
    const gRekening = ctx.gRekening || (factuur.gRekeningVanToepassing ?? false);

    const betaalUpdate = await tx
      .update(facturenTable)
      .set({
        betaalstatus: "betaald",
        betaaldatum: ctx.boekdatum,
        betaaldOp: new Date(`${ctx.boekdatum}T12:00:00Z`),
        bijgewerktOp: new Date(),
      })
      .where(
        and(
          eq(facturenTable.id, factuur.id),
          sql`COALESCE(${facturenTable.betaalstatus}, 'openstaand') = 'openstaand'`,
        ),
      )
      .returning({ id: facturenTable.id });
    if (betaalUpdate.length !== 1) {
      throw new Error(`Inkoopfactuur #${factuur.factuurnummer ?? factuur.id} is gelijktijdig al afgeletterd`);
    }

    await tx
      .update(bankMutatiesTable)
      .set({
        reconciliatieStatus: "gematcht",
        matchedFactuurId: factuur.id,
        gRekening,
        bijgewerktOp: new Date(),
      })
      .where(eq(bankMutatiesTable.id, mutatieId));

    await slaAuditOp(tx, mutatieId, null, "automatisch_gematcht",
      `Inkoopfactuur #${factuur.factuurnummer ?? factuur.id} automatisch gematcht op bedrag + token`);

    return { gematcht: true };
  }

  // Geen exacte match of meerdere
  if (tokenGematcht.length > 1) {
    let rang = 1;
    for (const f of tokenGematcht.slice(0, 5)) {
      await slaVoorstelOp(tx, mutatieId, f.id, null, "voorstel",
        `Inkoopfactuur #${f.factuurnummer ?? f.id}: ambigue match — meerdere inkoopfacturen kwalificeren`, rang++);
    }
    await tx.update(bankMutatiesTable).set({ reconciliatieStatus: "meerdere_kandidaten", bijgewerktOp: new Date() }).where(eq(bankMutatiesTable.id, mutatieId));
  } else if (gefilterd.length > 0) {
    let rang = 1;
    for (const f of gefilterd.slice(0, 5)) {
      await slaVoorstelOp(tx, mutatieId, f.id, null, "voorstel",
        `Inkoopfactuur #${f.factuurnummer ?? f.id}: bedrag klopt maar geen factuurnummer in referentie`, rang++);
    }
    await tx.update(bankMutatiesTable).set({ reconciliatieStatus: "meerdere_kandidaten", bijgewerktOp: new Date() }).where(eq(bankMutatiesTable.id, mutatieId));
  } else {
    await tx.update(bankMutatiesTable).set({ reconciliatieStatus: "geen_kandidaat", bijgewerktOp: new Date() }).where(eq(bankMutatiesTable.id, mutatieId));
  }

  return { gematcht: false };
}

// ── Batch-completeness-check ──────────────────────────────────────────────────

async function controleerBatchCompleteness(tx: TxDb, importId: number): Promise<void> {
  // Zoek batches die relevant zijn voor deze import (via bank_mutaties.matched_batchregel_id)
  // Haal alle batchIDs op van gematchte batchregels in deze import
  const gematchteRegels = await tx
    .select({ batchId: betaalbatchRegelsTable.batchId })
    .from(betaalbatchRegelsTable)
    .where(
      and(
        sql`${betaalbatchRegelsTable.bankMutatieId} IN (
          SELECT id FROM bank_mutaties WHERE afschrift_id IN (
            SELECT id FROM bank_afschriften WHERE import_id = ${importId}
          )
        )`,
        eq(betaalbatchRegelsTable.reconciliatieStatus, "gematcht"),
      ),
    );

  const batchIds = [...new Set(gematchteRegels.map((r) => r.batchId))];

  for (const batchId of batchIds) {
    // Een bankbewijs mag zowel de uitgegeven SEPA-batch als de oudere handmatig
    // bevestigde toestand sluiten. Concept/geannuleerd worden nooit uitgevoerd.
    const [batch] = await tx
      .select({ id: betaalbatchesTable.id, status: betaalbatchesTable.status })
      .from(betaalbatchesTable)
      .where(eq(betaalbatchesTable.id, batchId))
      .limit(1);

    if (!batch || !["bestand_aangemaakt", "bevestigd"].includes(batch.status)) continue;

    // Controleer of ALLE regels van de batch gematcht zijn
    const alleRegels = await tx
      .select({ reconciliatieStatus: betaalbatchRegelsTable.reconciliatieStatus })
      .from(betaalbatchRegelsTable)
      .where(eq(betaalbatchRegelsTable.batchId, batchId));

    const allemaalGematcht = alleRegels.every((r) => r.reconciliatieStatus === "gematcht");

    if (allemaalGematcht && alleRegels.length > 0) {
      await tx
        .update(betaalbatchesTable)
        .set({
          status: "uitgevoerd",
          uitgevoerdOp: new Date(),
          uitgevoerdImportId: importId,
          bijgewerktOp: new Date(),
        })
        .where(
          and(
            eq(betaalbatchesTable.id, batchId),
            inArray(betaalbatchesTable.status, ["bestand_aangemaakt", "bevestigd"]),
          ),
        );
    }
  }
}

// ── Audit/voorstel-helpers ────────────────────────────────────────────────────

async function slaVoorstelOp(
  tx: TxDb,
  mutatieId: number,
  factuurId: number | null,
  batchregelId: number | null,
  status: string,
  reden: string,
  rang: number,
): Promise<void> {
  await tx
    .insert(bankAfletterVoorstellenTable)
    .values({
      mutatieId,
      factuurId,
      batchregelId,
      rang,
      reden,
      status,
    })
    .onConflictDoNothing();
}

async function slaAuditOp(
  tx: TxDb,
  mutatieId: number,
  voorstelId: number | null,
  actie: string,
  reden: string,
): Promise<void> {
  await tx.insert(bankAfletterAuditTable).values({
    mutatieId,
    voorstelId,
    actie,
    reden,
  });
}

// ── Lijstfuncties ─────────────────────────────────────────────────────────────

export async function haalBankImportLijst(werkgeverId?: number) {
  const query = db
    .select({
      id: bankImportsTable.id,
      sha256: bankImportsTable.sha256,
      formaat: bankImportsTable.formaat,
      bestandsnaam: bankImportsTable.bestandsnaam,
      bron: bankImportsTable.bron,
      status: bankImportsTable.status,
      fout: bankImportsTable.fout,
      aangemaaktOp: bankImportsTable.aangemaaktOp,
      aangemaaktDoor: bankImportsTable.aangemaaktDoor,
      aantalAfschriften: sql<number>`(
        SELECT count(*)::int FROM bank_afschriften ba WHERE ba.import_id = bank_imports.id
      )`,
      aantalMutaties: sql<number>`(
        SELECT count(*)::int
        FROM bank_mutaties bm
        JOIN bank_afschriften ba ON ba.id = bm.afschrift_id
        WHERE ba.import_id = bank_imports.id
      )`,
      aantalGematcht: sql<number>`(
        SELECT count(*)::int
        FROM bank_mutaties bm
        JOIN bank_afschriften ba ON ba.id = bm.afschrift_id
        WHERE ba.import_id = bank_imports.id
          AND bm.reconciliatie_status = 'gematcht'
      )`,
      aantalHiaten: sql<number>`(
        SELECT count(*)::int FROM bank_afschriften ba
        WHERE ba.import_id = bank_imports.id AND ba.reeks_hiaat = true
      )`,
    })
    .from(bankImportsTable)
    .where(werkgeverId
      ? sql`EXISTS (
          SELECT 1 FROM bank_import_archieven bia
          WHERE bia.import_id = bank_imports.id
            AND bia.werkgever_id = ${werkgeverId}
        )`
      : undefined)
    .orderBy(desc(bankImportsTable.aangemaaktOp))
    .limit(100);

  return await query;
}

export async function haalBankMutatieLijst(params: {
  werkgeverId?: number;
  iban?: string;
  reconciliatieStatus?: string;
  gRekening?: boolean;
  limit?: number;
  offset?: number;
}) {
  const { werkgeverId, iban, reconciliatieStatus, gRekening, limit = 50, offset = 0 } = params;

  const conditions = [];
  if (werkgeverId) conditions.push(eq(bankMutatiesTable.werkgeverId, werkgeverId));
  if (iban) conditions.push(sql`${bankMutatiesTable.bankrekeningId} IN (
    SELECT id FROM werkgever_bankrekeningen WHERE iban = ${iban}
  )`);
  if (reconciliatieStatus) conditions.push(eq(bankMutatiesTable.reconciliatieStatus, reconciliatieStatus));
  if (gRekening !== undefined) conditions.push(eq(bankMutatiesTable.gRekening, gRekening));

  const [items, [telling]] = await Promise.all([
    db
    .select()
    .from(bankMutatiesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(bankMutatiesTable.boekdatum), desc(bankMutatiesTable.id))
    .limit(limit)
    .offset(offset),
    db
      .select({ totaal: sql<number>`count(*)::int` })
      .from(bankMutatiesTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined),
  ]);
  return { items, totaal: telling?.totaal ?? 0 };
}

export async function haalAfletterVoorstellen(mutatieId: number) {
  return await db
    .select()
    .from(bankAfletterVoorstellenTable)
    .where(eq(bankAfletterVoorstellenTable.mutatieId, mutatieId))
    .orderBy(bankAfletterVoorstellenTable.rang);
}

// ── Voorstel toepassen/afwijzen (transactioneel, row-lock, conditional update) ─

export async function pasToeAfletterVoorstel(
  voorstelId: number,
  gebruikerId: number,
  gebruikerNaam?: string,
): Promise<{ ok: boolean; fout?: string }> {
  try {
    await db.transaction(async (tx) => {
      // Row-lock op voorstel
      const [voorstel] = await tx
        .select()
        .from(bankAfletterVoorstellenTable)
        .where(
          and(
            eq(bankAfletterVoorstellenTable.id, voorstelId),
            eq(bankAfletterVoorstellenTable.status, "voorstel"),
          ),
        )
        .for("update")
        .limit(1);

      if (!voorstel) {
        throw new Error("Voorstel niet gevonden of al verwerkt");
      }

      // Haal mutatie op
      const [mutatie] = await tx
        .select()
        .from(bankMutatiesTable)
        .where(eq(bankMutatiesTable.id, voorstel.mutatieId))
        .for("update")
        .limit(1);

      if (!mutatie) throw new Error("Bijbehorende bankmutatie niet gevonden");
      if (mutatie.reconciliatieStatus === "gematcht") {
        throw new Error("Bankmutatie is al gematcht");
      }

      // Controleer doelbedrag als factuur-match
      if (voorstel.factuurId) {
        const [factuur] = await tx
          .select({
            bedragInclBtw: facturenTable.bedragInclBtw,
            betaalstatus: facturenTable.betaalstatus,
            type: facturenTable.type,
            tenaamstellingBv: facturenTable.tenaamstellingBv,
            gRekeningVanToepassing: facturenTable.gRekeningVanToepassing,
          })
          .from(facturenTable)
          .where(eq(facturenTable.id, voorstel.factuurId))
          .for("update")
          .limit(1);

        if (!factuur) throw new Error("Doelfactuur niet gevonden");
        if (factuur.betaalstatus === "betaald" && !voorstel.batchregelId) {
          throw new Error("Doelfactuur is al betaald");
        }
        const [werkgever] = await tx.select({ naam: werkgeversTable.naam })
          .from(werkgeversTable).where(eq(werkgeversTable.id, mutatie.werkgeverId)).limit(1);
        if (!werkgever || factuur.tenaamstellingBv !== werkgever.naam) {
          throw new Error("Doelfactuur hoort niet aantoonbaar bij dezelfde werkmaatschappij");
        }
        if ((mutatie.creditDebit === "CRDT" && factuur.type !== "verkoop") ||
            (mutatie.creditDebit === "DBIT" && factuur.type !== "inkoop")) {
          throw new Error("Factuursoort past niet bij de richting van de bankmutatie");
        }

        const factuurBedragCent = factuur.bedragInclBtw == null
          ? null
          : bankEuroTekstNaarCenten(factuur.bedragInclBtw);
        const mutatieBedragCent = bankEuroTekstNaarCenten(mutatie.bedrag);
        if (factuurBedragCent === null || mutatieBedragCent === null) {
          throw new Error("Factuur- of mutatiebedrag valt buiten het exacte opslagbereik");
        }
        const mutatieBedragAbsCent = Math.abs(mutatieBedragCent);

        if (factuurBedragCent !== mutatieBedragAbsCent) {
          throw new Error(`Bedrag-mismatch: factuur ${factuurBedragCent}ct ≠ mutatie ${mutatieBedragAbsCent}ct. Pas het voorstel niet toe.`);
        }

        // Een handmatig bevestigde betaalbatch heeft de factuur al op betaald
        // gezet. Een los factuurvoorstel blijft wel een openstaande factuur
        // eisen; bij een batchvoorstel volgt hieronder de koppelingcontrole.
        if (factuur.betaalstatus !== "betaald") {
          const betaalUpdate = await tx
            .update(facturenTable)
            .set({
              betaalstatus: "betaald",
              betaaldatum: mutatie.boekdatum,
              betaaldOp: new Date(`${mutatie.boekdatum}T12:00:00Z`),
              bijgewerktOp: new Date(),
            })
            .where(and(eq(facturenTable.id, voorstel.factuurId), sql`COALESCE(${facturenTable.betaalstatus}, 'openstaand') != 'betaald'`))
            .returning({ id: facturenTable.id });
          if (betaalUpdate.length !== 1) throw new Error("Doelfactuur is gelijktijdig al betaald");
        }

        if (factuur.gRekeningVanToepassing) {
          await tx.update(bankMutatiesTable).set({ gRekening: true }).where(eq(bankMutatiesTable.id, mutatie.id));
        }
      }

      // Batchregel bijwerken indien van toepassing
      if (voorstel.batchregelId) {
        const [batchregel] = await tx
          .select({
            id: betaalbatchRegelsTable.id,
            factuurId: betaalbatchRegelsTable.factuurId,
            bedrag: betaalbatchRegelsTable.bedrag,
            bankMutatieId: betaalbatchRegelsTable.bankMutatieId,
            reconciliatieStatus: betaalbatchRegelsTable.reconciliatieStatus,
            batchStatus: betaalbatchesTable.status,
            batchWerkgeverId: betaalbatchesTable.werkgeverId,
          })
          .from(betaalbatchRegelsTable)
          .innerJoin(betaalbatchesTable, eq(betaalbatchRegelsTable.batchId, betaalbatchesTable.id))
          .where(eq(betaalbatchRegelsTable.id, voorstel.batchregelId))
          .for("update")
          .limit(1);
        if (!batchregel || batchregel.bankMutatieId != null || batchregel.reconciliatieStatus === "gematcht") {
          throw new Error("Betaalbatchregel is niet meer beschikbaar voor aflettering");
        }
        if (batchregel.batchWerkgeverId !== mutatie.werkgeverId) {
          throw new Error("Betaalbatchregel hoort niet bij dezelfde werkmaatschappij");
        }
        if (!["bestand_aangemaakt", "bevestigd"].includes(batchregel.batchStatus)) {
          throw new Error("Alleen een uitgegeven of handmatig bevestigde betaalbatch kan worden afgeletterd");
        }
        if (mutatie.creditDebit !== "DBIT") {
          throw new Error("Een betaalbatchregel kan alleen aan een uitgaande bankmutatie worden gekoppeld");
        }
        if (voorstel.factuurId && batchregel.factuurId !== voorstel.factuurId) {
          throw new Error("Betaalbatchregel en voorstel verwijzen niet naar dezelfde factuur");
        }
        const regelCent = bankEuroTekstNaarCenten(batchregel.bedrag);
        const mutatieBedragCent = bankEuroTekstNaarCenten(mutatie.bedrag);
        if (regelCent === null || mutatieBedragCent === null) {
          throw new Error("Betaalbatchregel- of mutatiebedrag valt buiten het exacte opslagbereik");
        }
        const mutatieCent = Math.abs(mutatieBedragCent);
        if (regelCent !== mutatieCent) throw new Error("Bedrag van de betaalbatchregel wijkt af van de bankmutatie");
        const regelUpdate = await tx
          .update(betaalbatchRegelsTable)
          .set({
            reconciliatieStatus: "gematcht",
            bankMutatieId: mutatie.id,
            gematchBedrag: batchregel.bedrag,
          })
          .where(
            and(
              eq(betaalbatchRegelsTable.id, voorstel.batchregelId),
              isNull(betaalbatchRegelsTable.bankMutatieId),
              ne(betaalbatchRegelsTable.reconciliatieStatus, "gematcht"),
            ),
          )
          .returning({ id: betaalbatchRegelsTable.id });
        if (regelUpdate.length !== 1) {
          throw new Error("Betaalbatchregel is gelijktijdig al afgeletterd");
        }
      }

      // Mutatie bijwerken
      const bijgewerkt = await tx
        .update(bankMutatiesTable)
        .set({
          reconciliatieStatus: "gematcht",
          matchedFactuurId: voorstel.factuurId ?? mutatie.matchedFactuurId,
          matchedBatchregelId: voorstel.batchregelId ?? mutatie.matchedBatchregelId,
          bijgewerktOp: new Date(),
        })
        .where(
          and(
            eq(bankMutatiesTable.id, mutatie.id),
            // Conditional update: alleen als nog niet gematcht
            sql`${bankMutatiesTable.reconciliatieStatus} != 'gematcht'`,
          ),
        )
        .returning({ id: bankMutatiesTable.id });
      if (bijgewerkt.length !== 1) throw new Error("Bankmutatie is gelijktijdig door iemand anders afgeletterd");

      // Voorstel geaccepteerd
      await tx
        .update(bankAfletterVoorstellenTable)
        .set({
          status: "geaccepteerd",
          beslistDoor: gebruikerId,
          beslistOp: new Date(),
          bijgewerktOp: new Date(),
        })
        .where(eq(bankAfletterVoorstellenTable.id, voorstelId));

      // Overige voorstellen voor deze mutatie vervallen
      await tx
        .update(bankAfletterVoorstellenTable)
        .set({ status: "vervallen", bijgewerktOp: new Date() })
        .where(
          and(
            eq(bankAfletterVoorstellenTable.mutatieId, mutatie.id),
            sql`${bankAfletterVoorstellenTable.id} != ${voorstelId}`,
            eq(bankAfletterVoorstellenTable.status, "voorstel"),
          ),
        );

      // Audit-log
      await tx.insert(bankAfletterAuditTable).values({
        mutatieId: mutatie.id,
        voorstelId,
        actie: "geaccepteerd",
        reden: "Voorstel handmatig geaccepteerd",
        gebruikerId,
        gebruikerNaam: gebruikerNaam ?? null,
        payload: JSON.stringify({ mutatieId: mutatie.id, factuurId: voorstel.factuurId, batchregelId: voorstel.batchregelId }),
      });

      const [afschrift] = await tx.select({ importId: bankAfschriftenTable.importId })
        .from(bankAfschriftenTable).where(eq(bankAfschriftenTable.id, mutatie.afschriftId)).limit(1);
      if (afschrift) await controleerBatchCompleteness(tx, afschrift.importId);
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, fout: err instanceof Error ? err.message : String(err) };
  }
}

export async function wijsAfAfletterVoorstel(
  voorstelId: number,
  gebruikerId: number,
  reden?: string,
  gebruikerNaam?: string,
): Promise<{ ok: boolean; fout?: string }> {
  try {
    await db.transaction(async (tx) => {
      const [voorstel] = await tx
        .select()
        .from(bankAfletterVoorstellenTable)
        .where(
          and(
            eq(bankAfletterVoorstellenTable.id, voorstelId),
            eq(bankAfletterVoorstellenTable.status, "voorstel"),
          ),
        )
        .for("update")
        .limit(1);

      if (!voorstel) throw new Error("Voorstel niet gevonden of al verwerkt");

      await tx
        .update(bankAfletterVoorstellenTable)
        .set({
          status: "afgewezen",
          beslistDoor: gebruikerId,
          beslistOp: new Date(),
          bijgewerktOp: new Date(),
        })
        .where(eq(bankAfletterVoorstellenTable.id, voorstelId));

      await tx.insert(bankAfletterAuditTable).values({
        mutatieId: voorstel.mutatieId,
        voorstelId,
        actie: "afgewezen",
        reden: reden ?? "Voorstel handmatig afgewezen",
        gebruikerId,
        gebruikerNaam: gebruikerNaam ?? null,
      });

      const [resterend] = await tx
        .select({ id: bankAfletterVoorstellenTable.id })
        .from(bankAfletterVoorstellenTable)
        .where(and(
          eq(bankAfletterVoorstellenTable.mutatieId, voorstel.mutatieId),
          eq(bankAfletterVoorstellenTable.status, "voorstel"),
        ))
        .limit(1);
      if (!resterend) {
        await tx.update(bankMutatiesTable)
          .set({ reconciliatieStatus: "geen_kandidaat", bijgewerktOp: new Date() })
          .where(and(
            eq(bankMutatiesTable.id, voorstel.mutatieId),
            sql`${bankMutatiesTable.reconciliatieStatus} != 'gematcht'`,
          ));
      }
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, fout: err instanceof Error ? err.message : String(err) };
  }
}

export async function haalAfletterAudit(mutatieId: number) {
  return await db
    .select()
    .from(bankAfletterAuditTable)
    .where(eq(bankAfletterAuditTable.mutatieId, mutatieId))
    .orderBy(desc(bankAfletterAuditTable.aangemaaktOp));
}
