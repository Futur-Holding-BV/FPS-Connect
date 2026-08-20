// ─── BANK_01 — MT940 parser ───────────────────────────────────────────────────
// Legacy tagged-text parser voor SWIFT MT940 bankafschriften.
// Ondersteunt meerdere :20:/:25:/:28C: statements per bestand.
// Geen DB-afhankelijkheden; pure transformatie-functie.
//
// Beveiligingsmaatregelen:
//   • Maximale bestandsgrootte: 10 MiB
//   • Fail-closed: ieder onparseerbaar statement/entry → ok:false voor HELE bestand
//   • Strict reliable reference: :61: referentie vereist
//   • Saldo-verificatie per statement
//   • IBAN genormaliseerd (geen spaties, uppercase)

import type { ParsedBankFile, ParsedStatement, ParsedEntry } from "./bankafschriftTypes.js";
import {
  MAX_BANK_OPSLAANBARE_CENTEN,
  isOpslaanbaarBankbedrag,
} from "./bankafschriftTypes.js";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MiB

// ── Hulpfuncties ──────────────────────────────────────────────────────────────

/** Normaliseer een (mogelijk geformatteerde) IBAN-string. */
function normaliseerIban(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/** Leid banknaam af uit BIC of IBAN-prefix. */
function leidBanknaamAf(bic: string | null, iban: string | null): string | null {
  const src = [bic ?? "", iban ?? ""].join(" ").toUpperCase();
  if (/RABO/.test(src)) return "Rabobank";
  if (/ABNA/.test(src) || /ABN.?AMRO/.test(src)) return "ABN AMRO";
  // ING: IBAN NL..INGB of BIC INGBNL2A
  if (/INGB/.test(src)) return "ING";
  return null;
}

/**
 * Parseer MT940-datumstring YYMMDD naar ISO 8601 datum.
 * Sliding-window: YY >=70 → 19xx, anders 20xx.
 */
function parseerMt940Datum(yymmdd: string): string {
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  const yyyy = yy >= 70
    ? `19${String(yy).padStart(2, "0")}`
    : `20${String(yy).padStart(2, "0")}`;
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parseer een MT940-balansregel (:60F: of :62F:).
 * Formaat: C/DYYMMDDCCCBEDRAG  (bijv. C230101EUR1234,56)
 */
function parseerMt940Balans(
  raw: string,
): { centen: number; datum: string; valuta: string } | null {
  const m = raw.trim().match(/^([CD])(\d{6})([A-Z]{3})(\d+(?:,\d{1,2})?)$/);
  if (!m) return null;
  const sign = m[1] === "D" ? -1 : 1;
  const datum = parseerMt940Datum(m[2]);
  const valuta = m[3];
  const centen = parseerMt940Centen(m[4]);
  if (centen === null) return null;
  return { centen: centen * sign, datum, valuta };
}

/** Parseer een volledig MT940-bedrag met komma en maximaal twee decimalen. */
function parseerMt940Centen(raw: string): number | null {
  if (!/^\d+(?:,\d{1,2})?$/.test(raw)) return null;
  const [heleEuro, fractie = ""] = raw.split(",");
  const centen = BigInt(heleEuro) * 100n + BigInt(fractie.padEnd(2, "0"));
  if (centen > MAX_BANK_OPSLAANBARE_CENTEN) return null;
  return Number(centen);
}

/**
 * Parseer een :61:-transactieregel.
 * Formaat: YYMMDD[MMDD]CD[N]BEDRAG<TxCode>KLANTREFERENTIE[//BANKREFERENTIE]
 */
interface Mt940TxParsed {
  boekingsdatum: string;
  valutadatum: string;
  bedragCent: number;
  /** Bankreferentie: alles na "//" in het :61:-veld */
  bankReferentie: string | null;
  /** Klantreferentie: alles vóór "//" in het :61:-veld */
  klantreferentie: string | null;
}

type Mt940TxResultaat = Mt940TxParsed | { fout: string };

function parseerMt940Tx(raw: string): Mt940TxResultaat {
  const line = raw.trim();

  // Valutadatum: eerste 6 tekens (YYMMDD)
  if (line.length < 6) return { fout: "datum ontbreekt" };
  const valDatum = parseerMt940Datum(line.slice(0, 6));

  // Optionele boekingsdatum: MMDD direct na de valutadatum vóór C/D
  let offset = 6;
  let boekingsdatum = valDatum;
  if (/^\d{4}[CD]/.test(line.slice(6, 11))) {
    const mm = line.slice(6, 8);
    const dd = line.slice(8, 10);
    const yyyy = valDatum.slice(0, 4);
    boekingsdatum = `${yyyy}-${mm}-${dd}`;
    offset = 10;
  }

  // C/D indicator (RC/RD voor reversals, of gewone C/D)
  const cdMatch = line.slice(offset).match(/^(RD|RC|C|D)/);
  if (!cdMatch) return { fout: "credit-/debetindicator ontbreekt of is ongeldig" };
  const cd = cdMatch[1];
  offset += cd.length;

  // Optioneel 3-letter valutatype bij derde-munt transacties
  const txValuta = line.slice(offset).match(/^([A-Z]{3})(?=\d)/);
  if (txValuta) {
    if (txValuta[1] !== "EUR") {
      return { fout: `transactievaluta moet exact EUR zijn (ontvangen: ${txValuta[1]})` };
    }
    offset += 3;
  }

  // Bedrag (volledig decimaal, gevolgd door de verplichte transactiecode)
  const bedragMatch = line.slice(offset).match(/^(\d+(?:,\d{1,2})?)(?=[A-Z])/);
  if (!bedragMatch) {
    return { fout: "bedrag is geen volledig eurodecimaal met maximaal twee decimalen" };
  }
  const bedragCentAbs = parseerMt940Centen(bedragMatch[1]);
  if (bedragCentAbs === null) return { fout: "bedrag valt buiten het veilige centenbereik" };
  offset += bedragMatch[1].length;

  const sign = cd.startsWith("D") ? -1 : 1;
  const bedragCent = bedragCentAbs * sign;

  // Transaction type code (1-4 uppercase letters) — negeer inhoud
  const ttcMatch = line.slice(offset).match(/^[A-Z]{1,4}/);
  if (ttcMatch) offset += ttcMatch[0].length;

  // Klantreferentie // bankreferentie
  const rest = line.slice(offset);
  const sepIdx = rest.indexOf("//");
  let klantreferentie: string | null = null;
  let bankReferentie: string | null = null;

  if (sepIdx >= 0) {
    klantreferentie = rest.slice(0, sepIdx).trim() || null;
    bankReferentie = rest.slice(sepIdx + 2).trim() || null;
  } else {
    klantreferentie = rest.trim() || null;
  }

  return { boekingsdatum, valutadatum: valDatum, bedragCent, bankReferentie, klantreferentie };
}

/** Parseer :86:-veld voor tegenpartij en omschrijving. */
interface Mt940Narrative {
  tegenpartijIban: string | null;
  tegenpartijNaam: string | null;
  omschrijving: string | null;
}

function parseerMt940Narrative(raw: string): Mt940Narrative {
  const normalized = raw.replace(/\r?\n/g, " ").trim();

  let tegenpartijIban: string | null = null;
  let tegenpartijNaam: string | null = null;

  // ING-stijl: /CNTP/<IBAN>/<BIC>/<naam>/
  const cntpMatch = normalized.match(
    /\/CNTP\/([A-Z]{2}[0-9A-Z]{8,30})\/[A-Z0-9]{8,11}\/([^/]+)/i,
  );
  if (cntpMatch) {
    tegenpartijIban = normaliseerIban(cntpMatch[1]);
    tegenpartijNaam = cntpMatch[2].trim() || null;
  }

  // Generiek /IBAN/<waarde>/
  if (!tegenpartijIban) {
    const ibanMatch = normalized.match(/\/IBAN\/([A-Z]{2}[0-9A-Z]{8,30})/i);
    if (ibanMatch) tegenpartijIban = normaliseerIban(ibanMatch[1]);
  }

  // Rabobank-stijl: /NAME/<naam>/
  if (!tegenpartijNaam) {
    const nameMatch = normalized.match(/\/NAME\/([^/]+)/i);
    if (nameMatch) tegenpartijNaam = nameMatch[1].trim() || null;
  }

  // Omschrijving: /REMI/<tekst>/ of vrije tekst na verwijdering van tags
  const remiMatch = normalized.match(/\/REMI\/([^/]+)/i);
  const omschrijving = remiMatch
    ? remiMatch[1].trim()
    : normalized.replace(/\/[A-Z]+\/[^/]*/g, "").trim() || null;

  return { tegenpartijIban, tegenpartijNaam, omschrijving: omschrijving || null };
}

// ── Statement-splitsing ───────────────────────────────────────────────────────

interface RawMt940Statement {
  tag20: string;
  tag25: string;
  tag28c: string;
  tag60: string;
  tag62: string;
  transactions: Array<{ tag61: string; tag86: string | null }>;
}

/**
 * Splits een MT940-bestand in afzonderlijke statements op basis van :20:.
 * Ondersteunt meerdere :20:/:25:/:28C: blokken per bestand.
 */
function splitMt940Statements(raw: string): RawMt940Statement[] {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");

  const fields: Array<{ tag: string; value: string }> = [];
  let currentTag: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const m = line.match(/^:(\d{2}[A-Z]?):(.*)/);
    if (m) {
      if (currentTag !== null) {
        fields.push({ tag: currentTag, value: currentLines.join("\n") });
      }
      currentTag = m[1];
      currentLines = [m[2]];
    } else if (currentTag !== null) {
      currentLines.push(line);
    }
  }
  if (currentTag !== null) {
    fields.push({ tag: currentTag, value: currentLines.join("\n") });
  }

  const statements: RawMt940Statement[] = [];
  let current: (Partial<RawMt940Statement> & {
    transactions: Array<{ tag61: string; tag86: string | null }>;
  }) | null = null;
  let pendingTx: string | null = null;

  for (const field of fields) {
    if (field.tag === "20") {
      if (current?.tag20) {
        if (pendingTx !== null) {
          current.transactions.push({ tag61: pendingTx, tag86: null });
          pendingTx = null;
        }
        statements.push(current as RawMt940Statement);
      }
      current = { tag20: field.value.trim(), transactions: [] };
      pendingTx = null;
    } else if (!current) {
      continue;
    } else if (field.tag === "25") {
      current.tag25 = field.value.trim();
    } else if (field.tag === "28C") {
      current.tag28c = field.value.trim();
    } else if (field.tag === "60F" || field.tag === "60M") {
      current.tag60 = field.value.trim();
    } else if (field.tag === "62F" || field.tag === "62M") {
      current.tag62 = field.value.trim();
    } else if (field.tag === "61") {
      if (pendingTx !== null) {
        current.transactions.push({ tag61: pendingTx, tag86: null });
      }
      pendingTx = field.value.trim();
    } else if (field.tag === "86") {
      if (pendingTx !== null) {
        current.transactions.push({ tag61: pendingTx, tag86: field.value.trim() });
        pendingTx = null;
      }
    }
  }

  if (current?.tag20) {
    if (pendingTx !== null) {
      current.transactions.push({ tag61: pendingTx, tag86: null });
    }
    statements.push(current as RawMt940Statement);
  }

  return statements;
}

/** Parseer volgnummer uit :28C: (formaat: SEQNR/PAGINA, bijv. "00001/001"). */
function parseerVolgnummer(tag28c: string | undefined): number | null {
  if (!tag28c) return null;
  const m = tag28c.match(/^(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

// ── Hoofd-parser ──────────────────────────────────────────────────────────────

export type Mt940ParseResultaat =
  | { ok: true; bestand: ParsedBankFile }
  | { ok: false; fout: string };

export function parseMt940(input: string): Mt940ParseResultaat {
  // 1. Grootte-check
  const byteLen = Buffer.byteLength(input, "utf-8");
  if (byteLen > MAX_BYTES) {
    return { ok: false, fout: `Bestand te groot: ${byteLen} bytes (max ${MAX_BYTES})` };
  }

  // 2. Basisherkenning
  if (!isMt940(input)) {
    return { ok: false, fout: "Geen MT940-bestand herkend (geen :20: tag gevonden)" };
  }

  const rawStatements = splitMt940Statements(input);
  if (!rawStatements.length) {
    return { ok: false, fout: "Geen MT940-statements gevonden" };
  }

  const statements: ParsedStatement[] = [];
  const waarschuwingen: string[] = [];
  // Fail-closed: verzamel alle fouten, retourneer ok:false als er één is
  const fouten: string[] = [];

  for (const raw of rawStatements) {
    const stmtId = raw.tag20 || raw.tag28c || "onbekend";

    // :25: bevat IBAN (soms ook BIC of valuta erna na "/")
    if (!raw.tag25) {
      fouten.push(`Statement ${stmtId}: geen :25: rekening-IBAN`);
      continue;
    }

    const ibanRaw = raw.tag25.split("/")[0].replace(/\s+/g, "").toUpperCase();
    const iban = normaliseerIban(ibanRaw);

    // Banknaam afleiden
    const banknaam = leidBanknaamAf(null, iban);

    // Volgnummer uit :28C:
    const volgnummer = parseerVolgnummer(raw.tag28c);

    // :60F:/:60M: en :62F:/:62M:
    if (!raw.tag60) {
      fouten.push(`Statement ${stmtId}: geen openingsbalans (:60F:)`);
      continue;
    }
    if (!raw.tag62) {
      fouten.push(`Statement ${stmtId}: geen slotbalans (:62F:)`);
      continue;
    }

    const opening = parseerMt940Balans(raw.tag60);
    const slot = parseerMt940Balans(raw.tag62);

    if (!opening) {
      fouten.push(`Statement ${stmtId}: openingsbalans niet parseerbaar: "${raw.tag60}"`);
      continue;
    }
    if (!slot) {
      fouten.push(`Statement ${stmtId}: slotbalans niet parseerbaar: "${raw.tag62}"`);
      continue;
    }
    if (opening.valuta !== "EUR" || slot.valuta !== "EUR") {
      fouten.push(
        `Statement ${stmtId}: openings- en slotvaluta moeten exact EUR zijn ` +
          `(ontvangen: ${opening.valuta}/${slot.valuta})`,
      );
      continue;
    }

    const valuta = opening.valuta;

    // Transacties — fail-closed
    const entries: ParsedEntry[] = [];
    let stmtFout = false;

    for (const tx of raw.transactions) {
      const parsed = parseerMt940Tx(tx.tag61);
      if ("fout" in parsed) {
        fouten.push(
          `Statement ${stmtId}: :61: regel niet parseerbaar — ${parsed.fout}: "${tx.tag61.slice(0, 40)}"`,
        );
        stmtFout = true;
        break;
      }

      // Betrouwbare referentie: bankReferentie (na "//") heeft prioriteit,
      // dan klantreferentie (vóór "//")
      const bankRef = parsed.bankReferentie;
      const klantRef = parsed.klantreferentie;
      const bestRef = bankRef ?? klantRef;

      if (!bestRef) {
        fouten.push(
          `Statement ${stmtId}: transactie op ${parsed.boekingsdatum} heeft geen betrouwbare bankreferentie`,
        );
        stmtFout = true;
        break;
      }

      let narrative: Mt940Narrative = {
        tegenpartijIban: null,
        tegenpartijNaam: null,
        omschrijving: null,
      };
      if (tx.tag86) {
        narrative = parseerMt940Narrative(tx.tag86);
      }

      // endToEndReferentie: klantreferentie (als die verschilt van bestRef)
      const endToEndReferentie =
        klantRef && klantRef !== bestRef ? klantRef : null;

      // txReferentie: bankRef (als die verschilt van bestRef)
      const txReferentie =
        bankRef && bankRef !== bestRef ? bankRef : null;

      entries.push({
        bankReferentie: bestRef,
        endToEndReferentie,
        txReferentie,
        boekingsdatum: parsed.boekingsdatum,
        valutadatum: parsed.valutadatum,
        bedragCent: parsed.bedragCent,
        tegenpartijIban: narrative.tegenpartijIban,
        tegenpartijNaam: narrative.tegenpartijNaam,
        omschrijving: narrative.omschrijving,
      });
    }

    if (stmtFout) continue;

    // Saldo-verificatie
    const som = entries.reduce((acc, e) => acc + BigInt(e.bedragCent), 0n);
    if (!isOpslaanbaarBankbedrag(som)) {
      fouten.push(
        `Statement ${stmtId}: mutatiesom ${som} cent valt buiten het veilige opslagbereik`,
      );
      continue;
    }
    const verwacht = BigInt(opening.centen) + som;
    if (verwacht !== BigInt(slot.centen)) {
      fouten.push(
        `Statement ${stmtId}: saldo-verificatie mislukt — ` +
          `opening ${opening.centen} + entries ${som} = ${verwacht}, ` +
          `maar slotbalans is ${slot.centen}`,
      );
      continue;
    }

    const parsedStmt: ParsedStatement = {
      statementId: stmtId,
      volgnummer,
      iban,
      valuta,
      openingsbalans: opening.centen,
      slotbalans: slot.centen,
      openingsdatum: opening.datum,
      slotdatum: slot.datum,
      entries,
    };

    // Sla banknaam tijdelijk op (wordt verwijderd na loop)
    (parsedStmt as ParsedStatement & { _banknaam?: string | null })["_banknaam"] = banknaam;
    statements.push(parsedStmt);
  }

  // Fail-closed
  if (fouten.length > 0) {
    return { ok: false, fout: fouten.join("; ") };
  }

  // Eerste banknaam die gevonden is
  const banknaamResult =
    (statements as Array<ParsedStatement & { _banknaam?: string | null }>).find(
      (s) => s["_banknaam"],
    )?.["_banknaam"] ?? null;

  // Verwijder private velden
  for (const s of statements) {
    delete (s as ParsedStatement & { _banknaam?: unknown })["_banknaam"];
  }

  return {
    ok: true,
    bestand: {
      formaat: "mt940",
      banknaam: banknaamResult,
      statements,
      waarschuwingen,
    },
  };
}

/** Is dit bestand (waarschijnlijk) een MT940-bestand? */
export function isMt940(input: string): boolean {
  return /:20:/.test(input) && (/:60F:/.test(input) || /:60M:/.test(input));
}
