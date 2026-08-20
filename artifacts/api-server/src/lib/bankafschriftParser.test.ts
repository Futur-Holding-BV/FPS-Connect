// ─── BANK_01 — Parser unit-tests ──────────────────────────────────────────────
// Privacy-vrije fixtures: geen echte namen, IBANs zijn valide maar fictief.
// Geen DB/routes/frontend-afhankelijkheden.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCamt053, isCamt053 } from "./camt053Parser.js";
import { parseMt940, isMt940 } from "./mt940Parser.js";
import {
  bankCentenNaarEuroTekst,
  bankEuroTekstNaarCenten,
} from "./bankafschriftTypes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fx = (naam: string) =>
  readFileSync(join(__dirname, "__fixtures__/bankafschriften", naam), "utf-8");

function maakValutaCamt(input: {
  accountValuta?: string;
  balansValuta?: string;
  entryValuta?: string;
  bedrag?: string;
  richting?: string | null;
  txDetailAmt?: string;
  txDetailValuta?: string;
  slotBedrag?: string;
} = {}): string {
  const richting =
    input.richting === null ? "" : `<CdtDbtInd>${input.richting ?? "CRDT"}</CdtDbtInd>`;
  const txDetailAmt = input.txDetailAmt === undefined
    ? ""
    : `<Amt Ccy="${input.txDetailValuta ?? "EUR"}">${input.txDetailAmt}</Amt>`;
  return `<?xml version="1.0"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>STRICT-EUR</MsgId></GrpHdr>
    <Stmt>
      <Id>STRICT-EUR-STMT</Id>
      <Acct><Id><IBAN>NL91INGB0001234567</IBAN></Id><Ccy>${input.accountValuta ?? "EUR"}</Ccy></Acct>
      <Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="${input.balansValuta ?? "EUR"}">1000.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2024-01-01</Dt></Dt></Bal>
      <Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp><Amt Ccy="${input.balansValuta ?? "EUR"}">${input.slotBedrag ?? "1100.00"}</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2024-01-01</Dt></Dt></Bal>
      <Ntry>
        <Amt Ccy="${input.entryValuta ?? "EUR"}">${input.bedrag ?? "100.00"}</Amt>
        ${richting}
        <BookgDt><Dt>2024-01-01</Dt></BookgDt>
        <ValDt><Dt>2024-01-01</Dt></ValDt>
        <NtryDtls><TxDtls>
          ${txDetailAmt}
          <Refs><AcctSvcrRef>STRICT-EUR-REF</AcctSvcrRef></Refs>
        </TxDtls></NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;
}

function maakAfrondingsCamt(slotBedrag = "0.01", laatsteBedrag = "0.02"): string {
  const maxBedrag = "999999999999.99";
  const entry = (index: number, richting: "CRDT" | "DBIT", bedrag: string) => `
      <Ntry>
        <Amt Ccy="EUR">${bedrag}</Amt><CdtDbtInd>${richting}</CdtDbtInd>
        <BookgDt><Dt>2024-01-01</Dt></BookgDt>
        <ValDt><Dt>2024-01-01</Dt></ValDt>
        <NtryDtls><TxDtls><Refs><AcctSvcrRef>AGG-${richting}-${index}</AcctSvcrRef></Refs></TxDtls></NtryDtls>
      </Ntry>`;
  const entries = [
    ...Array.from({ length: 91 }, (_, index) => entry(index, "CRDT", maxBedrag)),
    ...Array.from({ length: 91 }, (_, index) => entry(index, "DBIT", maxBedrag)),
    entry(999, "CRDT", laatsteBedrag),
  ].join("");
  return `<?xml version="1.0"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt><GrpHdr><MsgId>AGG-BIGINT</MsgId></GrpHdr><Stmt>
    <Id>AGG-BIGINT-STMT</Id>
    <Acct><Id><IBAN>NL91INGB0001234567</IBAN></Id><Ccy>EUR</Ccy></Acct>
    <Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">0.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2024-01-01</Dt></Dt></Bal>
    <Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">${slotBedrag}</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2024-01-01</Dt></Dt></Bal>
    ${entries}
  </Stmt></BkToCstmrStmt>
</Document>`;
}

function maakAfrondingsMt940(): string {
  const maxBedrag = "999999999999,99";
  const regels = [
    ...Array.from({ length: 91 }, (_, index) =>
      `:61:240101C${maxBedrag}NTRFCREDIT${index}//MT-C-${index}`),
    ...Array.from({ length: 91 }, (_, index) =>
      `:61:240101D${maxBedrag}NTRFDEBIT${index}//MT-D-${index}`),
    ":61:240101C0,02NTRFSLOT//MT-SLOT",
  ].join("\n");
  return `:20:MT-BIGINT
:25:NL91INGB0001234567
:28C:1/1
:60F:C240101EUR0,00
${regels}
:62F:C240101EUR0,01`;
}

// ══════════════════════════════════════════════════════════════════════════════
// CAMT.053 — herkenning
// ══════════════════════════════════════════════════════════════════════════════

describe("isCamt053 — herkenning", () => {
  it("herkent camt.053 namespace", () => {
    expect(
      isCamt053('<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">'),
    ).toBe(true);
  });

  it("herkent BkToCstmrStmt-element", () => {
    expect(isCamt053("<BkToCstmrStmt>")).toBe(true);
  });

  it("wijst een MT940-bestand af", () => {
    expect(isCamt053(":20:TEST\n:25:NL91INGB0001234567")).toBe(false);
  });
});

describe("BANK_01 — exacte DB-decimaalconversie", () => {
  it("converteert de maximale numeric(14,2)-waarde exact heen en terug", () => {
    expect(bankEuroTekstNaarCenten("999999999999.99")).toBe(99_999_999_999_999);
    expect(bankCentenNaarEuroTekst(99_999_999_999_999n)).toBe("999999999999.99");
  });

  it("converteert een maximaal negatief debetbedrag exact heen en terug", () => {
    expect(bankEuroTekstNaarCenten("-999999999999.99")).toBe(-99_999_999_999_999);
    expect(bankCentenNaarEuroTekst(-99_999_999_999_999n)).toBe("-999999999999.99");
  });

  it("weigert niet-canonieke, onvolledige en te grote DB-decimalen", () => {
    for (const bedrag of ["500", "500.0", "500.00rommel", "1e2", "1000000000000.00"]) {
      expect(bankEuroTekstNaarCenten(bedrag)).toBeNull();
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// CAMT.053 — ING basis fixture
// ══════════════════════════════════════════════════════════════════════════════

describe("parseCamt053 — ING fixture (basis)", () => {
  const xml = fx("ing-camt053.xml");
  const result = parseCamt053(xml);

  it("slaagt", () => {
    expect(result.ok).toBe(true);
  });

  it("herkent banknaam als ING", () => {
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.banknaam).toBe("ING");
  });

  it("levert exact 1 statement", () => {
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.statements).toHaveLength(1);
  });

  it("statement heeft juist IBAN (genormaliseerd)", () => {
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.statements[0].iban).toBe("NL91INGB0001234567");
  });

  it("statement heeft juiste valuta", () => {
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.statements[0].valuta).toBe("EUR");
  });

  it("openingsbalans correct (in centen)", () => {
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.statements[0].openingsbalans).toBe(100000);
  });

  it("slotbalans correct (in centen)", () => {
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.statements[0].slotbalans).toBe(125000);
  });

  it("levert 2 entries", () => {
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.statements[0].entries).toHaveLength(2);
  });

  it("eerste entry is credit (positief bedrag)", () => {
    if (!result.ok) throw new Error(result.fout);
    const entry = result.bestand.statements[0].entries[0];
    expect(entry.bedragCent).toBe(50000);
  });

  it("tweede entry is debit (negatief bedrag)", () => {
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.statements[0].entries[1].bedragCent).toBe(-25000);
  });

  it("entries hebben betrouwbare bankReferentie (AcctSvcrRef)", () => {
    if (!result.ok) throw new Error(result.fout);
    for (const e of result.bestand.statements[0].entries) {
      expect(e.bankReferentie).toBeTruthy();
      // AcctSvcrRef → bankReferentie; EndToEndId → endToEndReferentie
      expect(e.bankReferentie).toMatch(/^ING20240101/);
    }
  });

  it("endToEndReferentie gevuld met E2E-id (verschilt van bankReferentie)", () => {
    if (!result.ok) throw new Error(result.fout);
    const e = result.bestand.statements[0].entries[0];
    expect(e.endToEndReferentie).toBe("E2E-INV-2024-001");
  });

  it("tegenpartij-IBAN genormaliseerd (geen spaties, uppercase)", () => {
    if (!result.ok) throw new Error(result.fout);
    const iban = result.bestand.statements[0].entries[0].tegenpartijIban;
    expect(iban).toBe("NL22ABNA0123456789");
    expect(iban).not.toMatch(/\s/);
  });

  it("omschrijving aanwezig", () => {
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.statements[0].entries[0].omschrijving).toContain("factuur");
  });

  it("saldo-verificatie geslaagd (opening + entries = closing)", () => {
    if (!result.ok) throw new Error(result.fout);
    const stmt = result.bestand.statements[0];
    const som = stmt.entries.reduce((a, e) => a + e.bedragCent, 0);
    expect(stmt.openingsbalans + som).toBe(stmt.slotbalans);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// CAMT.053 — Rabobank multi-account
// ══════════════════════════════════════════════════════════════════════════════

describe("parseCamt053 — Rabobank multi-account (2 statements)", () => {
  const xml = fx("rabobank-camt053-multi.xml");
  const result = parseCamt053(xml);

  it("slaagt", () => {
    expect(result.ok).toBe(true);
  });

  it("herkent banknaam als Rabobank", () => {
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.banknaam).toBe("Rabobank");
  });

  it("levert 2 statements", () => {
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.statements).toHaveLength(2);
  });

  it("eerste statement heeft IBAN NL55RABO0123456789", () => {
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.statements[0].iban).toBe("NL55RABO0123456789");
  });

  it("tweede statement heeft ander IBAN", () => {
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.statements[1].iban).toBe("NL55RABO0987654321");
  });

  it("saldo-verificatie per statement geslaagd", () => {
    if (!result.ok) throw new Error(result.fout);
    for (const stmt of result.bestand.statements) {
      const som = stmt.entries.reduce((a, e) => a + e.bedragCent, 0);
      expect(stmt.openingsbalans + som).toBe(stmt.slotbalans);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// CAMT.053 — ABN AMRO multi-TxDtls (elk met eigen Amt)
// ══════════════════════════════════════════════════════════════════════════════

describe("parseCamt053 — ABN AMRO multi-TxDtls per Ntry (elk eigen Amt)", () => {
  const xml = fx("abnamro-camt053-multitxdtls.xml");
  const result = parseCamt053(xml);

  it("slaagt", () => {
    expect(result.ok).toBe(true);
  });

  it("herkent banknaam als ABN AMRO", () => {
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.banknaam).toBe("ABN AMRO");
  });

  it("levert 2 entries (één per TxDtls)", () => {
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.statements[0].entries).toHaveLength(2);
  });

  it("elke entry heeft eigen bankReferentie", () => {
    if (!result.ok) throw new Error(result.fout);
    const refs = result.bestand.statements[0].entries.map((e) => e.bankReferentie);
    expect(refs[0]).not.toBe(refs[1]);
  });

  it("saldo-verificatie: 400+300=700 credit correct", () => {
    if (!result.ok) throw new Error(result.fout);
    const stmt = result.bestand.statements[0];
    const som = stmt.entries.reduce((a, e) => a + e.bedragCent, 0);
    expect(stmt.openingsbalans + som).toBe(stmt.slotbalans);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// CAMT.053 — multi-TxDtls zonder eigen Amt → fail-closed
// ══════════════════════════════════════════════════════════════════════════════

describe("parseCamt053 — multi-TxDtls zonder eigen Amt geweigerd", () => {
  it("weigert Ntry met 2 TxDtls zonder elk eigen Amt (zou bedrag dupliceren)", () => {
    const xml = `<?xml version="1.0"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>NO-AMT-SPLIT</MsgId></GrpHdr>
    <Stmt>
      <Id>NO-AMT-SPLIT-STMT</Id>
      <Acct><Id><IBAN>NL91INGB0001234567</IBAN></Id><Ccy>EUR</Ccy></Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">1000.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2024-01-01</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">1200.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2024-01-01</Dt></Dt>
      </Bal>
      <Ntry>
        <Amt Ccy="EUR">200.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2024-01-01</Dt></BookgDt>
        <ValDt><Dt>2024-01-01</Dt></ValDt>
        <NtryDtls>
          <TxDtls>
            <Refs><AcctSvcrRef>SVCRREF-A</AcctSvcrRef></Refs>
          </TxDtls>
          <TxDtls>
            <Refs><AcctSvcrRef>SVCRREF-B</AcctSvcrRef></Refs>
          </TxDtls>
        </NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;
    const result = parseCamt053(xml);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fout).toMatch(/Amt|bedrag/i);
  });
});

describe("parseCamt053 — Ntry en TxDtls bedragen sluiten exact aan", () => {
  it("weigert één transactiedetail dat afwijkt van het omhullende Ntry-bedrag", () => {
    const result = parseCamt053(maakValutaCamt({
      bedrag: "99.00",
      txDetailAmt: "100.00",
      slotBedrag: "1100.00",
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fout).toMatch(/transactiedetailbedrag.*Ntry-bedrag/i);
  });

  it("weigert meerdere transactiedetails waarvan de som afwijkt van het Ntry-bedrag", () => {
    const xml = fx("abnamro-camt053-multitxdtls.xml")
      .replace('<Amt Ccy="EUR">700.00</Amt>', '<Amt Ccy="EUR">699.00</Amt>');
    const result = parseCamt053(xml);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fout).toMatch(/som transactiedetails.*Ntry-bedrag/i);
  });
});

describe("bankafschriftparsers — aggregaten blijven exact buiten Number-bereik", () => {
  it("weigert CAMT als afgeronde Number-som 1 cent lijkt maar de exacte som 2 cent is", () => {
    const result = parseCamt053(maakAfrondingsCamt());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fout).toMatch(/saldo-verificatie/i);
  });

  it("weigert MT940 als afgeronde Number-som 1 cent lijkt maar de exacte som 2 cent is", () => {
    const result = parseMt940(maakAfrondingsMt940());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fout).toMatch(/saldo-verificatie/i);
  });

  it("weigert een individueel bedrag dat niet in numeric(14,2) past", () => {
    const result = parseCamt053(maakValutaCamt({ bedrag: "1000000000000.00" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fout).toMatch(/veilige opslagbereik/i);
  });
});

describe("parseCamt053 — euro en bedrag/richting fail-closed", () => {
  it("weigert een niet-EUR rekeningvaluta", () => {
    const result = parseCamt053(maakValutaCamt({ accountValuta: "USD" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fout).toMatch(/rekeningvaluta.*USD/i);
  });

  it("weigert een niet-EUR balansbedrag", () => {
    const result = parseCamt053(maakValutaCamt({ balansValuta: "USD" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fout).toMatch(/balans.*valuta.*USD/i);
  });

  it("weigert een niet-EUR entrybedrag", () => {
    const result = parseCamt053(maakValutaCamt({ entryValuta: "USD" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fout).toMatch(/entry.*valuta.*USD/i);
  });

  it("weigert een niet-EUR bedrag in TxDtls ook als het Ntry-bedrag EUR is", () => {
    const result = parseCamt053(maakValutaCamt({
      txDetailAmt: "100.00",
      txDetailValuta: "USD",
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fout).toMatch(/transactiedetail.*valuta.*USD/i);
  });

  it.each(["100.00rommel", "1e2", "100.001", "+100.00", "-100.00"])(
    "weigert het onvolledige of onveilige bedrag %s",
    (bedrag) => {
      const result = parseCamt053(maakValutaCamt({ bedrag }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.fout).toMatch(/volledig eurodecimaal/i);
    },
  );

  it.each([null, "CREDIT", "crdt"])(
    "weigert ontbrekende of ongeldige CdtDbtInd %s",
    (richting) => {
      const result = parseCamt053(maakValutaCamt({ richting }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.fout).toMatch(/CdtDbtInd.*CRDT.*DBIT/i);
    },
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// CAMT.053 — beveiligingstests
// ══════════════════════════════════════════════════════════════════════════════

describe("parseCamt053 — DTD/entity injectie geweigerd", () => {
  it("weigert DOCTYPE (lowercase)", () => {
    const xml = `<?xml version="1.0"?><!doctype foo [<!entity xxe SYSTEM "file:///etc/passwd">]><BkToCstmrStmt/>`;
    const result = parseCamt053(xml);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fout).toMatch(/DOCTYPE/i);
  });

  it("weigert DOCTYPE (uppercase)", () => {
    const xml = `<?xml version="1.0"?><!DOCTYPE foo []><BkToCstmrStmt/>`;
    const result = parseCamt053(xml);
    expect(result.ok).toBe(false);
  });

  it("weigert ENTITY (mixed case)", () => {
    const xml = `<?xml version="1.0"?><!ENTITY xxe SYSTEM "file:///">\n<BkToCstmrStmt/>`;
    const result = parseCamt053(xml);
    expect(result.ok).toBe(false);
  });

  it("weigert bestand groter dan 10 MiB", () => {
    const xml = "a".repeat(10 * 1024 * 1024 + 1);
    const result = parseCamt053(xml);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fout).toMatch(/te groot/i);
  });
});

describe("parseCamt053 — ontbrekend account-IBAN → ok:false (fail-closed)", () => {
  it("weigert statement zonder IBAN", () => {
    const xml = `<?xml version="1.0"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>X</MsgId></GrpHdr>
    <Stmt>
      <Id>STMT-NO-IBAN</Id>
      <Acct><Id><Othr><Id>999</Id></Othr></Id></Acct>
      <Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">100.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2024-01-01</Dt></Dt></Bal>
      <Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">100.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2024-01-01</Dt></Dt></Bal>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;
    const result = parseCamt053(xml);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fout).toMatch(/IBAN/i);
  });
});

describe("parseCamt053 — saldo-mismatch → ok:false", () => {
  it("weigert statement waarbij opening + entries ≠ closing", () => {
    const xml = `<?xml version="1.0"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>MISMATCH</MsgId></GrpHdr>
    <Stmt>
      <Id>MISMATCH-STMT</Id>
      <Acct><Id><IBAN>NL91INGB0001234567</IBAN></Id><Ccy>EUR</Ccy></Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">1000.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2024-01-01</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">9999.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2024-01-01</Dt></Dt>
      </Bal>
      <Ntry>
        <Amt Ccy="EUR">100.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2024-01-01</Dt></BookgDt>
        <ValDt><Dt>2024-01-01</Dt></ValDt>
        <NtryDtls>
          <TxDtls>
            <Refs><AcctSvcrRef>SVCRREF001</AcctSvcrRef></Refs>
          </TxDtls>
        </NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;
    const result = parseCamt053(xml);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fout).toMatch(/saldo/i);
  });
});

describe("parseCamt053 — entry zonder betrouwbare referentie → ok:false (fail-closed)", () => {
  it("entry met EndToEndId=NOTPROVIDED en geen andere ref geeft ok:false", () => {
    const xml = `<?xml version="1.0"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>NO-REF</MsgId></GrpHdr>
    <Stmt>
      <Id>NO-REF-STMT</Id>
      <Acct><Id><IBAN>NL91INGB0001234567</IBAN></Id><Ccy>EUR</Ccy></Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">500.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2024-01-01</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">600.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2024-01-01</Dt></Dt>
      </Bal>
      <Ntry>
        <Amt Ccy="EUR">100.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2024-01-01</Dt></BookgDt>
        <ValDt><Dt>2024-01-01</Dt></ValDt>
        <NtryDtls>
          <TxDtls>
            <Refs><EndToEndId>NOTPROVIDED</EndToEndId></Refs>
          </TxDtls>
        </NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;
    const result = parseCamt053(xml);
    // Fail-closed: geen betrouwbare ref → ok:false
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fout).toMatch(/referentie/i);
  });
});

describe("parseCamt053 — onbekende bank niet geweigerd", () => {
  it("accepteert bestand van onbekende bank (banknaam=null)", () => {
    const xml = `<?xml version="1.0"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>UNKNOWN-BANK</MsgId></GrpHdr>
    <Stmt>
      <Id>UNKNOWN-BANK-STMT</Id>
      <Acct>
        <Id><IBAN>NL91TRIO0001234567</IBAN></Id>
        <Ccy>EUR</Ccy>
        <Svcr><FinInstnId><BICFI>TRIONL2U</BICFI><Nm>Triodos Bank</Nm></FinInstnId></Svcr>
      </Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">100.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2024-01-01</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">100.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2024-01-01</Dt></Dt>
      </Bal>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;
    const result = parseCamt053(xml);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bestand.banknaam).toBeNull();
    }
  });
});

describe("parseCamt053 — PRCD/CLAV fallback balansen", () => {
  it("accepteert PRCD als openingsbalans en CLAV als slotbalans", () => {
    const xml = `<?xml version="1.0"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>FALLBACK-BAL</MsgId></GrpHdr>
    <Stmt>
      <Id>FALLBACK-STMT</Id>
      <Acct><Id><IBAN>NL91INGB0001234567</IBAN></Id><Ccy>EUR</Ccy></Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>PRCD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">200.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2024-01-01</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLAV</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">200.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2024-01-01</Dt></Dt>
      </Bal>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;
    const result = parseCamt053(xml);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bestand.statements[0].openingsbalans).toBe(20000);
      expect(result.bestand.statements[0].slotbalans).toBe(20000);
    }
  });
});

describe("parseCamt053 — volgnummer uit ElctrncSeqNb", () => {
  it("leest ElctrncSeqNb als volgnummer", () => {
    const xml = `<?xml version="1.0"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>SEQ-TEST</MsgId></GrpHdr>
    <Stmt>
      <Id>SEQ-STMT</Id>
      <ElctrncSeqNb>42</ElctrncSeqNb>
      <Acct><Id><IBAN>NL91INGB0001234567</IBAN></Id><Ccy>EUR</Ccy></Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">500.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2024-01-01</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">500.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2024-01-01</Dt></Dt>
      </Bal>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;
    const result = parseCamt053(xml);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bestand.statements[0].volgnummer).toBe(42);
    }
  });

  it("volgnummer is null als ElctrncSeqNb en LglSeqNb ontbreken", () => {
    const xml = fx("ing-camt053.xml");
    const result = parseCamt053(xml);
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.statements[0].volgnummer).toBeNull();
  });
});

describe("parseCamt053 — refs: AcctSvcrRef → bankRef, E2E → endToEnd, TxId → txRef", () => {
  it("AcctSvcrRef wordt bankReferentie; EndToEndId wordt endToEndReferentie", () => {
    const xml = fx("ing-camt053.xml");
    const result = parseCamt053(xml);
    if (!result.ok) throw new Error(result.fout);
    const e = result.bestand.statements[0].entries[0];
    expect(e.bankReferentie).toMatch(/^ING20240101/);
    expect(e.endToEndReferentie).toBe("E2E-INV-2024-001");
    expect(e.txReferentie).toBeNull(); // geen TxId in fixture
  });

  it("als alleen EndToEndId beschikbaar is, wordt die bankReferentie en endToEndReferentie=null", () => {
    const xml = `<?xml version="1.0"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>E2E-ONLY</MsgId></GrpHdr>
    <Stmt>
      <Id>E2E-ONLY-STMT</Id>
      <Acct><Id><IBAN>NL91INGB0001234567</IBAN></Id><Ccy>EUR</Ccy></Acct>
      <Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">100.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2024-01-01</Dt></Dt></Bal>
      <Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">200.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2024-01-01</Dt></Dt></Bal>
      <Ntry>
        <Amt Ccy="EUR">100.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>BOOK</Sts>
        <BookgDt><Dt>2024-01-01</Dt></BookgDt><ValDt><Dt>2024-01-01</Dt></ValDt>
        <NtryDtls>
          <TxDtls>
            <Refs><EndToEndId>E2E-ONLY-REF-001</EndToEndId></Refs>
          </TxDtls>
        </NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;
    const result = parseCamt053(xml);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const e = result.bestand.statements[0].entries[0];
      expect(e.bankReferentie).toBe("E2E-ONLY-REF-001");
      // e2eId IS de bankRef, dus endToEndReferentie is null (niet separaat)
      expect(e.endToEndReferentie).toBeNull();
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// MT940 — herkenning
// ══════════════════════════════════════════════════════════════════════════════

describe("isMt940 — herkenning", () => {
  it("herkent MT940 met :20: en :60F:", () => {
    expect(isMt940(":20:TEST\n:60F:C240101EUR1000,00")).toBe(true);
  });

  it("wijst CAMT.053 af", () => {
    expect(isMt940('<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053">')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// MT940 — ING multi-statement fixture
// ══════════════════════════════════════════════════════════════════════════════

describe("parseMt940 — ING multi-statement fixture", () => {
  const txt = fx("ing-mt940.txt");
  const result = parseMt940(txt);

  it("slaagt", () => {
    expect(result.ok).toBe(true);
  });

  it("levert 2 statements", () => {
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.statements).toHaveLength(2);
  });

  it("herkent banknaam als ING (op basis van IBAN NL..INGB)", () => {
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.banknaam).toBe("ING");
  });

  it("IBAN correct genormaliseerd (geen spaties, uppercase)", () => {
    if (!result.ok) throw new Error(result.fout);
    const iban = result.bestand.statements[0].iban;
    expect(iban).toBe("NL91INGB0001234567");
    expect(iban).not.toMatch(/\s/);
  });

  it("eerste statement openingsbalans = 200000 cent", () => {
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.statements[0].openingsbalans).toBe(200000);
  });

  it("eerste statement 2 transacties", () => {
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.statements[0].entries).toHaveLength(2);
  });

  it("credit entry positief", () => {
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.statements[0].entries[0].bedragCent).toBe(50000);
  });

  it("debit entry negatief", () => {
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.statements[0].entries[1].bedragCent).toBe(-20000);
  });

  it("entries hebben bankReferentie (na //)", () => {
    if (!result.ok) throw new Error(result.fout);
    for (const s of result.bestand.statements) {
      for (const e of s.entries) {
        expect(e.bankReferentie).toBeTruthy();
      }
    }
  });

  it("bankReferentie is de bank-ref na // (BANK-REF-…)", () => {
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.statements[0].entries[0].bankReferentie).toMatch(/^BANK-REF-/);
  });

  it("endToEndReferentie is de klantreferentie vóór // (als die verschilt)", () => {
    if (!result.ok) throw new Error(result.fout);
    // :61: ING-REF-001//BANK-REF-... → bankRef=BANK-REF-..., klantRef=ING-REF-001
    const e = result.bestand.statements[0].entries[0];
    expect(e.endToEndReferentie).toMatch(/^ING-REF-/);
  });

  it("volgnummer geparsed uit :28C: (00001 → 1)", () => {
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.statements[0].volgnummer).toBe(1);
  });

  it("saldo-verificatie per statement", () => {
    if (!result.ok) throw new Error(result.fout);
    for (const stmt of result.bestand.statements) {
      const som = stmt.entries.reduce((a, e) => a + e.bedragCent, 0);
      expect(stmt.openingsbalans + som).toBe(stmt.slotbalans);
    }
  });

  it("tweede statement slotbalans = 240000 cent", () => {
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.statements[1].slotbalans).toBe(240000);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// MT940 — Rabobank fixture
// ══════════════════════════════════════════════════════════════════════════════

describe("parseMt940 — Rabobank fixture", () => {
  const txt = fx("rabobank-mt940.txt");
  const result = parseMt940(txt);

  it("slaagt", () => {
    expect(result.ok).toBe(true);
  });

  it("herkent banknaam als Rabobank", () => {
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.banknaam).toBe("Rabobank");
  });

  it("tegenpartij-IBAN geparsed uit :86:", () => {
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.statements[0].entries[0].tegenpartijIban).toBeTruthy();
  });

  it("tegenpartij-IBAN genormaliseerd", () => {
    if (!result.ok) throw new Error(result.fout);
    const iban = result.bestand.statements[0].entries[0].tegenpartijIban;
    if (iban) expect(iban).not.toMatch(/\s/);
  });

  it("bankReferentie is de ref na // (RABO-TX-…)", () => {
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.statements[0].entries[0].bankReferentie).toMatch(/^RABO-TX-/);
  });

  it("saldo-verificatie geslaagd", () => {
    if (!result.ok) throw new Error(result.fout);
    const stmt = result.bestand.statements[0];
    const som = stmt.entries.reduce((a, e) => a + e.bedragCent, 0);
    expect(stmt.openingsbalans + som).toBe(stmt.slotbalans);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// MT940 — beveiligingstests (fail-closed)
// ══════════════════════════════════════════════════════════════════════════════

describe("parseMt940 — bestand te groot geweigerd", () => {
  it("weigert bestand groter dan 10 MiB", () => {
    const groot = ":20:TEST\n" + "x".repeat(10 * 1024 * 1024 + 1);
    const result = parseMt940(groot);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fout).toMatch(/te groot/i);
  });
});

describe("parseMt940 — euro en bedragen fail-closed", () => {
  it("weigert een niet-EUR statement", () => {
    const txt = [
      ":20:USD-STMT",
      ":25:NL91INGB0001234567",
      ":28C:00001/001",
      ":60F:C240101USD1000,00",
      ":62F:C240101USD1000,00",
    ].join("\n");
    const result = parseMt940(txt);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fout).toMatch(/valuta.*EUR.*USD/i);
  });

  it("weigert een expliciete niet-EUR transactievaluta", () => {
    const txt = [
      ":20:USD-TX",
      ":25:NL91INGB0001234567",
      ":28C:00001/001",
      ":60F:C240101EUR1000,00",
      ":61:2401010101CUSD100,00NMSCBETALING//USD-TX-REF",
      ":62F:C240101EUR1100,00",
    ].join("\n");
    const result = parseMt940(txt);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fout).toMatch(/transactievaluta.*EUR.*USD/i);
  });

  it("weigert een bedrag met een ongeldige numerieke rest", () => {
    const txt = [
      ":20:BAD-AMOUNT",
      ":25:NL91INGB0001234567",
      ":28C:00001/001",
      ":60F:C240101EUR1000,00",
      ":61:2401010101C100,00,1NMSCBETALING//BAD-AMOUNT-REF",
      ":62F:C240101EUR1100,00",
    ].join("\n");
    const result = parseMt940(txt);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fout).toMatch(/eurodecimaal/i);
  });
});

describe("parseMt940 — geen :25: IBAN → ok:false", () => {
  it("weigert statement zonder account-IBAN", () => {
    const txt = `:20:TEST-GEEN-IBAN\n:28C:00001/001\n:60F:C240101EUR1000,00\n:62F:C240101EUR1000,00\n`;
    const result = parseMt940(txt);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fout).toMatch(/IBAN|iban|rekening/i);
  });
});

describe("parseMt940 — saldo-mismatch → ok:false", () => {
  it("weigert statement waarbij opening + entries ≠ closing", () => {
    const txt = [
      ":20:MISMATCH-STMT",
      ":25:NL91INGB0001234567",
      ":28C:00001/001",
      ":60F:C240101EUR1000,00",
      ":61:2401010101C100,00NMSC TX001//BANK-REF-001",
      ":86:Betaling",
      ":62F:C240101EUR9999,00", // fout: zou 1100,00 moeten zijn
    ].join("\n");
    const result = parseMt940(txt);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fout).toMatch(/saldo/i);
  });
});

describe("parseMt940 — transactie zonder referentie → ok:false (fail-closed)", () => {
  it("entry met geen enkel ref-veld geeft ok:false", () => {
    // :61: met leeg referentieveld na verwijdering transactiecode
    const txt = [
      ":20:NO-REF-MT940",
      ":25:NL91INGB0001234567",
      ":28C:00001/001",
      ":60F:C240101EUR1000,00",
      // 2401010101C100,00NMSC = valDat+bookDat+C+bedrag+txCode, geen ref erna
      ":61:2401010101C100,00NMSC",
      ":86:Geen referentie",
      ":62F:C240101EUR1100,00",
    ].join("\n");
    const result = parseMt940(txt);
    // De entry heeft geen referentie → fail-closed → ok:false
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fout).toMatch(/referentie/i);
  });

  it("bestand zonder transacties (lege statements) slaagt als saldo klopt", () => {
    const txt = [
      ":20:EMPTY-STMT",
      ":25:NL91INGB0001234567",
      ":28C:00001/001",
      ":60F:C240101EUR1000,00",
      ":62F:C240101EUR1000,00",
    ].join("\n");
    const result = parseMt940(txt);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bestand.statements[0].entries).toHaveLength(0);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Structuur-invarianten
// ══════════════════════════════════════════════════════════════════════════════

describe("ParsedBankFile — structuur-invarianten", () => {
  it("camt053 resultaat heeft formaat: 'camt053'", () => {
    const result = parseCamt053(fx("ing-camt053.xml"));
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.formaat).toBe("camt053");
  });

  it("mt940 resultaat heeft formaat: 'mt940'", () => {
    const result = parseMt940(fx("ing-mt940.txt"));
    if (!result.ok) throw new Error(result.fout);
    expect(result.bestand.formaat).toBe("mt940");
  });

  it("alle entries hebben een boekingsdatum", () => {
    const result = parseCamt053(fx("ing-camt053.xml"));
    if (!result.ok) throw new Error(result.fout);
    for (const stmt of result.bestand.statements) {
      for (const e of stmt.entries) {
        expect(e.boekingsdatum).toBeTruthy();
      }
    }
  });

  it("bedragCent is altijd een integer", () => {
    const result = parseCamt053(fx("abnamro-camt053-multitxdtls.xml"));
    if (!result.ok) throw new Error(result.fout);
    for (const stmt of result.bestand.statements) {
      for (const e of stmt.entries) {
        expect(Number.isInteger(e.bedragCent)).toBe(true);
      }
    }
  });

  it("ParsedEntry heeft endToEndReferentie en txReferentie velden (ook als null)", () => {
    const result = parseCamt053(fx("ing-camt053.xml"));
    if (!result.ok) throw new Error(result.fout);
    const e = result.bestand.statements[0].entries[0];
    expect("endToEndReferentie" in e).toBe(true);
    expect("txReferentie" in e).toBe(true);
  });

  it("ParsedStatement heeft volgnummer veld (ook als null)", () => {
    const result = parseCamt053(fx("ing-camt053.xml"));
    if (!result.ok) throw new Error(result.fout);
    expect("volgnummer" in result.bestand.statements[0]).toBe(true);
  });

  it("geen ok:true met lege statements-array (bestand met 0 statements is fout)", () => {
    const xml = `<?xml version="1.0"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>EMPTY</MsgId></GrpHdr>
  </BkToCstmrStmt>
</Document>`;
    const result = parseCamt053(xml);
    expect(result.ok).toBe(false);
  });
});
