// ── SEPA-betaalbestand (pain.001.001.03) — ADMINISTRATIE_02 §3 ───────────────
// Genereert een credit-transfer-initiatiebestand voor de crediteurenbatch.
// Bewust minimalistisch en deterministisch: één PmtInf per batch, EUR-only,
// SLEV-servicelevel. Geen externe XML-dependency — de structuur is klein en
// vast, dus we bouwen de XML zelf op met strikte escaping.

export type SepaBetaling = {
  eindToEndId: string;
  crediteurNaam: string;
  crediteurIban: string;
  bedrag: number; // in euro's, 2 decimalen
  omschrijving: string;
};

export type SepaBatchInput = {
  referentie: string;      // MsgId / PmtInfId (bv. BATCH-2026-000123)
  debiteurNaam: string;
  debiteurIban: string;
  uitvoerdatum: string;    // YYYY-MM-DD
  aangemaaktOp: Date;
  betalingen: SepaBetaling[];
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// SEPA-tekenset: beperk vrije tekst tot de toegestane karakters; de rest
// wordt vervangen door een spatie zodat banken het bestand niet afwijzen.
function sepaTekst(s: string, maxLen: number): string {
  const schoon = s.replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, " ").replace(/\s+/g, " ").trim();
  return schoon.slice(0, maxLen) || "-";
}

function normIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

export function valideerIban(iban: string): boolean {
  const s = normIban(iban);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  // Mod-97 controle (ISO 13616).
  const herschikt = s.slice(4) + s.slice(0, 4);
  let rest = 0;
  for (const ch of herschikt) {
    const waarde = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of waarde) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest === 1;
}

export function genereerPain001(input: SepaBatchInput): string {
  const bedragStr = (n: number) => n.toFixed(2);
  const totaal = input.betalingen.reduce((s, b) => s + b.bedrag, 0);
  const creDtTm = input.aangemaaktOp.toISOString().slice(0, 19);

  const txs = input.betalingen.map((b) => `
      <CdtTrfTxInf>
        <PmtId><EndToEndId>${esc(sepaTekst(b.eindToEndId, 35))}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${bedragStr(b.bedrag)}</InstdAmt></Amt>
        <Cdtr><Nm>${esc(sepaTekst(b.crediteurNaam, 70))}</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>${esc(normIban(b.crediteurIban))}</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>${esc(sepaTekst(b.omschrijving, 140))}</Ustrd></RmtInf>
      </CdtTrfTxInf>`).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${esc(sepaTekst(input.referentie, 35))}</MsgId>
      <CreDtTm>${creDtTm}</CreDtTm>
      <NbOfTxs>${input.betalingen.length}</NbOfTxs>
      <CtrlSum>${bedragStr(totaal)}</CtrlSum>
      <InitgPty><Nm>${esc(sepaTekst(input.debiteurNaam, 70))}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${esc(sepaTekst(input.referentie, 35))}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${input.betalingen.length}</NbOfTxs>
      <CtrlSum>${bedragStr(totaal)}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt>${esc(input.uitvoerdatum)}</ReqdExctnDt>
      <Dbtr><Nm>${esc(sepaTekst(input.debiteurNaam, 70))}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${esc(normIban(input.debiteurIban))}</IBAN></Id></DbtrAcct>
      <ChrgBr>SLEV</ChrgBr>${txs}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;
}
