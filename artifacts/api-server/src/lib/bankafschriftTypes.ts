// ─── BANK_01 — Genormaliseerde bankafschrift-types ────────────────────────────
// Gedeeld door camt053Parser en mt940Parser. Privacy-by-design: geen namen
// of adressen opgeslagen buiten de benodigde tegenpartij-info.

/** Maximale absolute centenwaarde die in numeric(14,2) kan worden opgeslagen. */
export const MAX_BANK_OPSLAANBARE_CENTEN = 99_999_999_999_999n;

export function isOpslaanbaarBankbedrag(centen: bigint): boolean {
  const absoluut = centen < 0n ? -centen : centen;
  return absoluut <= MAX_BANK_OPSLAANBARE_CENTEN;
}

/** Formatteer centen zonder tussentijdse Number-conversie naar een DB-decimaal. */
export function bankCentenNaarEuroTekst(centen: bigint | number): string {
  const waarde = typeof centen === "number" ? BigInt(centen) : centen;
  const negatief = waarde < 0n;
  const absoluut = negatief ? -waarde : waarde;
  const euro = absoluut / 100n;
  const fractie = String(absoluut % 100n).padStart(2, "0");
  return `${negatief ? "-" : ""}${euro}.${fractie}`;
}

/** Parseer een DB numeric(14,2)-tekst exact, zonder drijvende-komma-afronding. */
export function bankEuroTekstNaarCenten(raw: string): number | null {
  const match = raw.match(/^(-?)(\d+)\.(\d{2})$/);
  if (!match) return null;
  const absoluteCenten = BigInt(match[2]) * 100n + BigInt(match[3]);
  const centen = match[1] === "-" ? -absoluteCenten : absoluteCenten;
  if (!isOpslaanbaarBankbedrag(centen)) return null;
  return Number(centen);
}

/** Een enkel bestand kan meerdere statements bevatten (multi-account/dag). */
export interface ParsedBankFile {
  /** Bestandsformaat: "camt053" of "mt940" */
  formaat: "camt053" | "mt940";
  /** Naam van de bank als deze afgeleid kon worden; null als onbekend */
  banknaam: string | null;
  statements: ParsedStatement[];
  /**
   * Niet-fatale waarschuwingen (bijv. overgeslagen entries zonder referentie
   * worden hier NIET meer gemeld — die veroorzaken ok:false).
   * Bedoeld voor informatieve observaties die het bestand niet ongeldig maken.
   */
  waarschuwingen: string[];
}

/** Eén rekeningoverzicht (per account per dag/periode). */
export interface ParsedStatement {
  /** Uniek statement-ID zoals aangeleverd in het bestand */
  statementId: string;
  /**
   * Volgnummer van het statement binnen de serie (ElctrncSeqNb / LglSeqNb /
   * :28C: sequentienummer). null als niet aanwezig in het bestand.
   */
  volgnummer: number | null;
  /** IBAN van de eigen rekening, genormaliseerd (geen spaties, uppercase) */
  iban: string;
  /** ISO 4217-valutacode, bijv. "EUR" */
  valuta: string;
  /** Openingsbalans in centen (signed integer) */
  openingsbalans: number;
  /** Slotbalans in centen (signed integer) */
  slotbalans: number;
  /** ISO 8601 datum van de openingsbalans */
  openingsdatum: string;
  /** ISO 8601 datum van de slotbalans */
  slotdatum: string;
  entries: ParsedEntry[];
}

/** Eén geboekte transactie. */
export interface ParsedEntry {
  /**
   * Betrouwbare bankreferentie — de meest betrouwbare beschikbare referentie,
   * in prioriteitsvolgorde: AcctSvcrRef → TxId → EndToEndId (niet NOTPROVIDED).
   * Nooit null — transacties zonder betrouwbare referentie veroorzaken ok:false.
   */
  bankReferentie: string;
  /**
   * EndToEndId zoals aangeleverd in de Refs van de TxDtls, of de
   * klantreferentie uit het MT940 :61:-veld (vóór "//").
   * null als niet aanwezig of gelijk aan "NOTPROVIDED".
   */
  endToEndReferentie: string | null;
  /**
   * TxId (CAMT) of de bank-referentie uit het MT940 :61:-veld (na "//"),
   * als die verschilt van bankReferentie.
   * null als niet aanwezig of al gelijk aan bankReferentie.
   */
  txReferentie: string | null;
  /** Boekingsdatum ISO 8601 */
  boekingsdatum: string;
  /** Valutadatum ISO 8601, mag gelijk zijn aan boekingsdatum */
  valutadatum: string;
  /** Bedrag in centen, positief = credit, negatief = debit */
  bedragCent: number;
  /** IBAN van de tegenrekening, genormaliseerd; null als niet aanwezig */
  tegenpartijIban: string | null;
  /** Naam van de tegenpartij, indien aanwezig */
  tegenpartijNaam: string | null;
  /** Betalingskenmerk / omschrijving / remittance info */
  omschrijving: string | null;
}
