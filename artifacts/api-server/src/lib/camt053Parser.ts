// ─── BANK_01 — CAMT.053 parser ────────────────────────────────────────────────
// Veilige, namespace-onafhankelijke parser voor ISO 20022 BkToCstmrStmt
// bankafschriften. Geen DB-afhankelijkheden; pure transformatie-functie.
//
// Beveiligingsmaatregelen:
//   • Maximale bestandsgrootte: 10 MiB
//   • <!DOCTYPE en <!ENTITY (case-insensitive) geweigerd
//   • Fail-closed: ieder onparseerbaar statement/entry → ok:false voor het HELE bestand
//   • Saldo-verificatie per statement (opening + entries = closing)
//   • Multi-TxDtls zonder eigen Amt → geweigerd (geen stille bedragduplicatie)
//   • IBANs genormaliseerd (geen spaties, uppercase)

import { XMLParser } from "fast-xml-parser";
import type { ParsedBankFile, ParsedStatement, ParsedEntry } from "./bankafschriftTypes.js";
import {
  MAX_BANK_OPSLAANBARE_CENTEN,
  isOpslaanbaarBankbedrag,
} from "./bankafschriftTypes.js";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MiB

// ── Hulpfuncties ──────────────────────────────────────────────────────────────

/** Verwijder XML-namespace prefix (alles vóór en inclusief ":"). */
function stripNs(tag: string): string {
  const i = tag.lastIndexOf(":");
  return i >= 0 ? tag.slice(i + 1) : tag;
}

/** Zoek recursief een sleutel in een object, namespace-onafhankelijk. */
function find(obj: unknown, key: string): unknown {
  if (obj === null || typeof obj !== "object") return undefined;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (stripNs(k) === key) return v;
    const nested = find(v, key);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

/** Zorg dat een waarde altijd een array is. */
function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Haal een directe child op van een object, namespace-onafhankelijk. */
function child(obj: Record<string, unknown>, key: string): unknown {
  for (const [k, v] of Object.entries(obj)) {
    if (stripNs(k) === key) return v;
  }
  return undefined;
}

/** Haal tekstwaarde op (string of number → string). */
function text(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  // fast-xml-parser slaat tekst soms op als { "#text": "..." }
  if (typeof v === "object" && "#text" in (v as Record<string, unknown>)) {
    const t = (v as Record<string, unknown>)["#text"];
    return text(t);
  }
  return null;
}

/** Normaliseer IBAN: verwijder spaties, uppercase. */
function normIban(raw: string | null): string | null {
  if (!raw) return null;
  const n = raw.replace(/\s+/g, "").toUpperCase();
  return n || null;
}

type ParseAmtResult =
  | { ok: true; centen: number; valuta: "EUR" }
  | { ok: false; fout: string };

/** Parseer een CAMT-bedrag fail-closed naar eurocenten.
 *
 * CAMT gebruikt een los CdtDbtInd voor het teken. Daarom accepteren we hier
 * uitsluitend een positief decimaal met maximaal twee decimalen, een expliciete
 * EUR-valuta en exact CRDT of DBIT. Number.parseFloat is bewust verboden: die
 * accepteert ongeldige numerieke voorvoegsels zoals "100.00rommel".
 */
function parseAmt(
  amtNode: unknown,
  cdtDbtInd: string | null,
): ParseAmtResult {
  let rawAmt: string | null = null;
  let valuta: string | null = null;

  if (typeof amtNode === "number") {
    rawAmt = String(amtNode);
  } else if (typeof amtNode === "string") {
    rawAmt = amtNode;
  } else if (amtNode && typeof amtNode === "object") {
    const o = amtNode as Record<string, unknown>;
    rawAmt = text(o["#text"] ?? o["Amt"]);
    const ccy = o["@_Ccy"] ?? o["Ccy"];
    valuta = text(ccy);
  }

  if (cdtDbtInd !== "CRDT" && cdtDbtInd !== "DBIT") {
    return {
      ok: false,
      fout: `CdtDbtInd moet exact CRDT of DBIT zijn (ontvangen: ${cdtDbtInd ?? "ontbreekt"})`,
    };
  }
  if (valuta !== "EUR") {
    return {
      ok: false,
      fout: `valuta moet exact EUR zijn (ontvangen: ${valuta ?? "ontbreekt"})`,
    };
  }
  if (!rawAmt || !/^\d+(?:\.\d{1,2})?$/.test(rawAmt)) {
    return {
      ok: false,
      fout: `bedrag is geen volledig eurodecimaal met maximaal twee decimalen: "${rawAmt ?? ""}"`,
    };
  }

  const [heleEuro, fractie = ""] = rawAmt.split(".");
  const absoluteCenten =
    BigInt(heleEuro) * 100n + BigInt(fractie.padEnd(2, "0"));
  if (absoluteCenten > MAX_BANK_OPSLAANBARE_CENTEN) {
    return { ok: false, fout: `bedrag valt buiten het veilige opslagbereik: "${rawAmt}"` };
  }

  // DBIT = debit = negatief; CRDT = credit = positief
  const sign = cdtDbtInd === "DBIT" ? -1 : 1;
  return { ok: true, centen: Number(absoluteCenten) * sign, valuta: "EUR" };
}

/** Parseer CAMT-balanselement naar centen (signed). */
function parseBalanceCenten(balNode: Record<string, unknown>): ParseAmtResult {
  const amtNode = child(balNode, "Amt");
  const cdtDbt = text(child(balNode, "CdtDbtInd"));
  return parseAmt(amtNode, cdtDbt);
}

/** Leid banknaam af uit BIC, instelling-naam of tekst. */
function leidBanknaamAf(bic: string | null, naam: string | null): string | null {
  const candidates = [bic ?? "", naam ?? ""].join(" ").toUpperCase();
  if (/RABO/.test(candidates)) return "Rabobank";
  if (/ABNA/.test(candidates) || /ABN.?AMRO/.test(candidates)) return "ABN AMRO";
  // ING: BIC begint met INGB of naam bevat ING
  if (/INGB/.test(candidates) || /\bING\b/.test(candidates)) return "ING";
  return null;
}

/** Extraheer referenties uit een Refs-node.
 *  Geeft { acctSvcrRef, txId, e2eId } terug. */
interface RefsExtracted {
  acctSvcrRef: string | null;
  txId: string | null;
  e2eId: string | null;
}

function extractRefs(node: Record<string, unknown>): RefsExtracted {
  const acctSvcrRef = text(find(node, "AcctSvcrRef"));
  const txId = text(find(node, "TxId"));
  const rawE2e = text(find(node, "EndToEndId"));
  const e2eId =
    rawE2e && rawE2e !== "NOTPROVIDED" && rawE2e !== "NOT PROVIDED" ? rawE2e : null;
  return { acctSvcrRef, txId, e2eId };
}

/** Kies de beste bankReferentie en vul endToEnd/txReferentie in. */
function resolveEntryRefs(refs: RefsExtracted): {
  bankReferentie: string | null;
  endToEndReferentie: string | null;
  txReferentie: string | null;
} {
  // Prioriteit: AcctSvcrRef > TxId > EndToEndId
  const bankReferentie = refs.acctSvcrRef ?? refs.txId ?? refs.e2eId;

  // endToEndReferentie: altijd de e2eId (als die verschilt van bankRef)
  const endToEndReferentie =
    refs.e2eId && refs.e2eId !== bankReferentie ? refs.e2eId : null;

  // txReferentie: TxId als die niet al de bankRef is
  const txReferentie =
    refs.txId && refs.txId !== bankReferentie ? refs.txId : null;

  return { bankReferentie, endToEndReferentie, txReferentie };
}

// ── Hoofd-parser ──────────────────────────────────────────────────────────────

export type Camt053ParseResultaat =
  | { ok: true; bestand: ParsedBankFile }
  | { ok: false; fout: string };

export function parseCamt053(xml: string): Camt053ParseResultaat {
  // 1. Grootte-check
  const byteLen = Buffer.byteLength(xml, "utf-8");
  if (byteLen > MAX_BYTES) {
    return { ok: false, fout: `Bestand te groot: ${byteLen} bytes (max ${MAX_BYTES})` };
  }

  // 2. DTD-injectie weigeren (case-insensitive)
  if (/<!doctype/i.test(xml) || /<!entity/i.test(xml)) {
    return {
      ok: false,
      fout: "Bestand bevat een DOCTYPE- of ENTITY-declaratie en wordt geweigerd",
    };
  }

  // 3. XML parsen
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseAttributeValue: false,
    parseTagValue: false,
    allowBooleanAttributes: true,
  });

  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch (e: unknown) {
    return { ok: false, fout: `XML-parsefout: ${e instanceof Error ? e.message : String(e)}` };
  }

  // 4. Root-element zoeken: BkToCstmrStmt (namespace-onafhankelijk)
  let bkNode: Record<string, unknown> | null = null;
  for (const [k, v] of Object.entries(doc)) {
    if (stripNs(k) === "BkToCstmrStmt" && v && typeof v === "object") {
      bkNode = v as Record<string, unknown>;
      break;
    }
    // Soms gewrapped in Document
    if (typeof v === "object" && v !== null) {
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
        if (stripNs(k2) === "BkToCstmrStmt" && v2 && typeof v2 === "object") {
          bkNode = v2 as Record<string, unknown>;
          break;
        }
      }
    }
    if (bkNode) break;
  }

  if (!bkNode) {
    return {
      ok: false,
      fout: "Geen BkToCstmrStmt-element gevonden; dit is geen CAMT.053-bestand",
    };
  }

  // 5. Banknaam afleiden uit GrpHdr
  const grpHdr = child(bkNode, "GrpHdr") as Record<string, unknown> | undefined;

  let banknaam: string | null = null;
  {
    const agntBic = text(find(grpHdr ?? {}, "BICFI") ?? find(grpHdr ?? {}, "BIC"));
    const agntNm = text(find(grpHdr ?? {}, "Nm"));
    banknaam = leidBanknaamAf(agntBic, agntNm);
  }

  // 6. Statements parsen
  const stmtRaw = toArray(child(bkNode, "Stmt") as unknown);
  if (!stmtRaw.length) {
    return { ok: false, fout: "Geen Stmt-elementen gevonden in BkToCstmrStmt" };
  }

  const statements: ParsedStatement[] = [];
  const waarschuwingen: string[] = [];
  // Fail-closed: verzamel ALLE fouten, retourneer ok:false als er één is
  const fouten: string[] = [];

  for (const stmtRaw_ of stmtRaw) {
    const stmt = stmtRaw_ as Record<string, unknown>;

    // Statement-ID
    const stmtId = text(child(stmt, "Id"));
    if (!stmtId) {
      fouten.push("Statement zonder Id gevonden");
      continue;
    }

    // Volgnummer (ElctrncSeqNb heeft voorkeur boven LglSeqNb)
    const elctrncSeqNbRaw = text(child(stmt, "ElctrncSeqNb"));
    const lglSeqNbRaw = text(child(stmt, "LglSeqNb"));
    const seqRaw = elctrncSeqNbRaw ?? lglSeqNbRaw;
    const volgnummer = seqRaw !== null ? parseInt(seqRaw, 10) : null;

    // IBAN van eigen rekening
    const acctNode = child(stmt, "Acct") as Record<string, unknown> | undefined;
    const acctIdNode = acctNode
      ? (child(acctNode, "Id") as Record<string, unknown> | undefined)
      : undefined;
    const ibanRaw = text(acctIdNode ? child(acctIdNode, "IBAN") : null);
    const iban = normIban(ibanRaw);
    if (!iban) {
      fouten.push(`Statement ${stmtId}: geen account-IBAN`);
      continue;
    }

    // Valuta
    const ccy = text(child(acctNode ?? {}, "Ccy") ?? find(acctNode ?? {}, "Ccy"));
    if (ccy !== "EUR") {
      fouten.push(
        `Statement ${stmtId}: rekeningvaluta moet exact EUR zijn (ontvangen: ${ccy ?? "ontbreekt"})`,
      );
      continue;
    }

    // Banknaam uit servicer (als nog niet gevonden uit GrpHdr)
    if (!banknaam) {
      const svcrBic = text(find(acctNode ?? {}, "BICFI") ?? find(acctNode ?? {}, "BIC"));
      const svcrNm = text(find(acctNode ?? {}, "Nm"));
      banknaam = leidBanknaamAf(svcrBic, svcrNm);
    }

    // Balansen
    const balansen = toArray(child(stmt, "Bal") as unknown) as Record<string, unknown>[];

    let openingsbalans: number | null = null;
    let slotbalans: number | null = null;
    let openingsdatum: string | null = null;
    let slotdatum: string | null = null;
    let balansFout = false;

    for (const bal of balansen) {
      const tpNode = child(bal, "Tp") as Record<string, unknown> | undefined;
      const cdOrPrtry = tpNode
        ? (child(tpNode, "CdOrPrtry") as Record<string, unknown> | undefined)
        : undefined;
      const cd = text(cdOrPrtry ? child(cdOrPrtry, "Cd") : null)?.toUpperCase();

      const dtNode = child(bal, "Dt") as Record<string, unknown> | undefined;
      const dt = text(dtNode ? (child(dtNode, "Dt") ?? child(dtNode, "DtTm")) : null);
      const isOpeningsbalans = cd === "OPBD" || cd === "PRCD";
      const isSlotbalans = cd === "CLBD" || cd === "CLAV";
      if (!isOpeningsbalans && !isSlotbalans) continue;

      const bedrag = parseBalanceCenten(bal);
      if (!bedrag.ok) {
        fouten.push(`Statement ${stmtId}: balans ${cd ?? "onbekend"} ongeldig — ${bedrag.fout}`);
        balansFout = true;
        break;
      }

      if (isOpeningsbalans) {
        if (openingsbalans === null) {
          openingsbalans = bedrag.centen;
          openingsdatum = dt;
        }
      } else if (isSlotbalans) {
        if (slotbalans === null) {
          slotbalans = bedrag.centen;
          slotdatum = dt;
        }
      }
    }

    if (balansFout) continue;
    if (openingsbalans === null) {
      fouten.push(`Statement ${stmtId}: geen openingsbalans (OPBD/PRCD)`);
      continue;
    }
    if (slotbalans === null) {
      fouten.push(`Statement ${stmtId}: geen slotbalans (CLBD/CLAV)`);
      continue;
    }

    // Entries parsen — fail-closed: iedere ongeldige entry = fout voor het bestand
    const entriesRaw = toArray(
      child(stmt, "Ntry") as unknown,
    ) as Record<string, unknown>[];
    const entries: ParsedEntry[] = [];
    let stmtFout = false;

    for (const ntry of entriesRaw) {
      const cdtDbt = text(child(ntry, "CdtDbtInd"));
      const amtNode = child(ntry, "Amt");

      const ntryAmtResult = parseAmt(amtNode, cdtDbt);
      if (!ntryAmtResult.ok) {
        fouten.push(`Statement ${stmtId}: entry ongeldig — ${ntryAmtResult.fout}`);
        stmtFout = true;
        break;
      }

      const bookgDt = child(ntry, "BookgDt") as Record<string, unknown> | undefined;
      const boekingsdatum =
        text(bookgDt ? (child(bookgDt, "Dt") ?? child(bookgDt, "DtTm")) : null) ?? "";

      const valDt = child(ntry, "ValDt") as Record<string, unknown> | undefined;
      const valutadatum =
        text(valDt ? (child(valDt, "Dt") ?? child(valDt, "DtTm")) : null) ?? boekingsdatum;

      // TxDtls — meerdere per Ntry
      const ntryDtlsNode = child(ntry, "NtryDtls") as Record<string, unknown> | undefined;
      const txDtlsList = toArray(
        ntryDtlsNode
          ? (child(ntryDtlsNode, "TxDtls") as unknown)
          : (find(ntry, "TxDtls") as unknown),
      ) as Record<string, unknown>[];

      if (txDtlsList.length === 0) {
        // Geen TxDtls: gebruik de Ntry-refs en het Ntry-bedrag direct
        const ntryRefs = extractRefs(ntry);
        const resolved = resolveEntryRefs(ntryRefs);
        if (!resolved.bankReferentie) {
          fouten.push(
            `Statement ${stmtId}: entry op ${boekingsdatum} heeft geen betrouwbare bankreferentie`,
          );
          stmtFout = true;
          break;
        }
        entries.push({
          bankReferentie: resolved.bankReferentie,
          endToEndReferentie: resolved.endToEndReferentie,
          txReferentie: resolved.txReferentie,
          boekingsdatum,
          valutadatum,
          bedragCent: ntryAmtResult.centen,
          tegenpartijIban: null,
          tegenpartijNaam: null,
          omschrijving: null,
        });
      } else if (txDtlsList.length === 1) {
        // Eén TxDtls: mag Ntry-bedrag gebruiken als eigen Amt ontbreekt
        const txDtls = txDtlsList[0];
        const combinedRefs = mergeRefs(extractRefs(ntry), extractRefs(txDtls));
        const resolved = resolveEntryRefs(combinedRefs);

        if (!resolved.bankReferentie) {
          fouten.push(
            `Statement ${stmtId}: transactie op ${boekingsdatum} heeft geen betrouwbare bankreferentie`,
          );
          stmtFout = true;
          break;
        }

        const txAmtNode = child(txDtls, "Amt");
        let bedragCent = ntryAmtResult.centen;
        if (txAmtNode !== undefined && txAmtNode !== null) {
          const txAmtResult = parseAmt(txAmtNode, cdtDbt);
          if (!txAmtResult.ok) {
            fouten.push(`Statement ${stmtId}: transactiedetail ongeldig — ${txAmtResult.fout}`);
            stmtFout = true;
            break;
          }
          if (txAmtResult.centen !== ntryAmtResult.centen) {
            fouten.push(
              `Statement ${stmtId}: transactiedetailbedrag ${txAmtResult.centen} cent ` +
                `wijkt af van Ntry-bedrag ${ntryAmtResult.centen} cent`,
            );
            stmtFout = true;
            break;
          }
          bedragCent = txAmtResult.centen;
        }

        const { tegenpartijIban, tegenpartijNaam, omschrijving } = extractTxParties(
          txDtls,
          cdtDbt,
        );

        entries.push({
          bankReferentie: resolved.bankReferentie,
          endToEndReferentie: resolved.endToEndReferentie,
          txReferentie: resolved.txReferentie,
          boekingsdatum,
          valutadatum,
          bedragCent,
          tegenpartijIban,
          tegenpartijNaam,
          omschrijving,
        });
      } else {
        // Meerdere TxDtls: elke TxDtls MOET een eigen Amt hebben
        const detailEntries: ParsedEntry[] = [];
        let detailSomCenten = 0n;
        for (const txDtls of txDtlsList) {
          const txAmtNode = child(txDtls, "Amt");
          if (txAmtNode === undefined || txAmtNode === null) {
            fouten.push(
              `Statement ${stmtId}: Ntry met meerdere TxDtls op ${boekingsdatum} heeft een TxDtls zonder eigen Amt (bedragduplicatie geweigerd)`,
            );
            stmtFout = true;
            break;
          }
          const txAmtResult = parseAmt(txAmtNode, cdtDbt);
          if (!txAmtResult.ok) {
            fouten.push(
              `Statement ${stmtId}: transactiedetail op ${boekingsdatum} ongeldig — ${txAmtResult.fout}`,
            );
            stmtFout = true;
            break;
          }

          const combinedRefs = mergeRefs(extractRefs(ntry), extractRefs(txDtls));
          const resolved = resolveEntryRefs(combinedRefs);

          if (!resolved.bankReferentie) {
            fouten.push(
              `Statement ${stmtId}: TxDtls op ${boekingsdatum} heeft geen betrouwbare bankreferentie`,
            );
            stmtFout = true;
            break;
          }

          const { tegenpartijIban, tegenpartijNaam, omschrijving } = extractTxParties(
            txDtls,
            cdtDbt,
          );

          detailSomCenten += BigInt(txAmtResult.centen);
          detailEntries.push({
            bankReferentie: resolved.bankReferentie,
            endToEndReferentie: resolved.endToEndReferentie,
            txReferentie: resolved.txReferentie,
            boekingsdatum,
            valutadatum,
            bedragCent: txAmtResult.centen,
            tegenpartijIban,
            tegenpartijNaam,
            omschrijving,
          });
        }
        if (stmtFout) break;
        if (detailSomCenten !== BigInt(ntryAmtResult.centen)) {
          fouten.push(
            `Statement ${stmtId}: som transactiedetails ${detailSomCenten} cent ` +
              `wijkt af van Ntry-bedrag ${ntryAmtResult.centen} cent`,
          );
          stmtFout = true;
          break;
        }
        entries.push(...detailEntries);
      }
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
    const verwacht = BigInt(openingsbalans) + som;
    if (verwacht !== BigInt(slotbalans)) {
      fouten.push(
        `Statement ${stmtId}: saldo-verificatie mislukt — ` +
          `opening ${openingsbalans} + entries ${som} = ${verwacht}, ` +
          `maar slotbalans is ${slotbalans}`,
      );
      continue;
    }

    statements.push({
      statementId: stmtId,
      volgnummer: Number.isFinite(volgnummer) ? volgnummer : null,
      iban,
      valuta: ccy,
      openingsbalans,
      slotbalans,
      openingsdatum: openingsdatum ?? "",
      slotdatum: slotdatum ?? "",
      entries,
    });
  }

  // Fail-closed: als ook maar één fout, geef ok:false terug
  if (fouten.length > 0) {
    return { ok: false, fout: fouten.join("; ") };
  }

  return {
    ok: true,
    bestand: {
      formaat: "camt053",
      banknaam,
      statements,
      waarschuwingen,
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Merge refs: TxDtls-waarden hebben voorkeur boven Ntry-waarden. */
function mergeRefs(ntryRefs: RefsExtracted, txRefs: RefsExtracted): RefsExtracted {
  return {
    acctSvcrRef: txRefs.acctSvcrRef ?? ntryRefs.acctSvcrRef,
    txId: txRefs.txId ?? ntryRefs.txId,
    e2eId: txRefs.e2eId ?? ntryRefs.e2eId,
  };
}

/** Extraheer tegenpartij en omschrijving uit een TxDtls-node. */
function extractTxParties(
  txDtls: Record<string, unknown>,
  cdtDbt: string | null,
): { tegenpartijIban: string | null; tegenpartijNaam: string | null; omschrijving: string | null } {
  const rltdPties = child(txDtls, "RltdPties") as Record<string, unknown> | undefined;
  let tegenpartijIban: string | null = null;
  let tegenpartijNaam: string | null = null;

  if (rltdPties) {
    const isDebit = cdtDbt === "DBIT";
    const partyKey = isDebit ? "Cdtr" : "Dbtr";
    const acctKey = isDebit ? "CdtrAcct" : "DbtrAcct";

    const partyNode = child(rltdPties, partyKey) as Record<string, unknown> | undefined;
    if (partyNode) {
      tegenpartijNaam = text(find(partyNode, "Nm"));
    }
    const acctNode = child(rltdPties, acctKey) as Record<string, unknown> | undefined;
    if (acctNode) {
      const idNode = child(acctNode, "Id") as Record<string, unknown> | undefined;
      tegenpartijIban = normIban(text(idNode ? child(idNode, "IBAN") : null));
    }
  }

  const rmtInf = child(txDtls, "RmtInf") as Record<string, unknown> | undefined;
  const omschrijving =
    text(rmtInf ? (child(rmtInf, "Ustrd") ?? find(rmtInf, "Ref")) : null) ??
    text(find(txDtls, "Purp")) ??
    null;

  return { tegenpartijIban, tegenpartijNaam, omschrijving };
}

/** Is dit bestand (waarschijnlijk) een CAMT.053-bestand? */
export function isCamt053(xml: string): boolean {
  return (
    /urn:iso:std:iso:20022:tech:xsd:camt\.053/.test(xml) ||
    /<(?:[^:>]+:)?BkToCstmrStmt[\s>]/.test(xml)
  );
}
