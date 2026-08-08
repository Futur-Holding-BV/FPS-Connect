// ─── SEPA PAIN.001-parser ─────────────────────────────────────────────────────
// Gedeeld tussen de handmatige upload (salarisarchief) en de automatische
// mailintake (LOON_01). Bewust een lichte, tolerante parser: hij leest de
// kernvelden uit; ontbrekende velden worden als fout gerapporteerd, nooit
// gegokt.

export interface PainParseResultaat {
  msgId: string | null;
  aantalBetalingen: number | null;
  controleSom: string | null;
  betaaldatum: string | null;
  ibanOpdrachtgever: string | null;
  naamOpdrachtgever: string | null;
  fouten: string[];
}

/** Is dit bestand (waarschijnlijk) een SEPA PAIN.001-betaalbestand?
 *  Herkenning op de ISO 20022-namespace of het CstmrCdtTrfInitn-element —
 *  nooit alleen op bestandsextensie. */
export function isPainXml(xml: string): boolean {
  return /urn:iso:std:iso:20022:tech:xsd:pain\.001/.test(xml)
    || /<(?:[^:>]+:)?CstmrCdtTrfInitn[\s>]/.test(xml);
}

export function parsePainXml(xml: string): PainParseResultaat {
  const tag = (naam: string) => {
    const m = xml.match(new RegExp(`<(?:[^:>]+:)?${naam}[^>]*>([^<]*)</(?:[^:>]+:)?${naam}>`));
    return m ? m[1].trim() : null;
  };

  const msgId = tag("MsgId");
  const nbOfTxs = tag("NbOfTxs");
  const ctrlSum = tag("CtrlSum");
  const datum = tag("ReqdExctnDt") ?? tag("ReqdColltnDt");

  const ibanMatch = xml.match(/<(?:[^:>]+:)?DbtrAcct[^>]*>[\s\S]*?<(?:[^:>]+:)?IBAN>([A-Z0-9]+)<\/(?:[^:>]+:)?IBAN>/);
  const iban = ibanMatch ? ibanMatch[1] : null;

  // Naam van de opdrachtgever (debiteur) — voor werkgever-herkenning bij mailintake.
  const dbtrMatch = xml.match(/<(?:[^:>]+:)?Dbtr>[\s\S]*?<(?:[^:>]+:)?Nm>([^<]*)<\/(?:[^:>]+:)?Nm>/);
  const naamOpdrachtgever = dbtrMatch ? dbtrMatch[1].trim() : null;

  const fouten: string[] = [];
  if (!msgId) fouten.push("Geen bericht-ID gevonden");
  if (!ctrlSum) fouten.push("Geen controlessom gevonden");

  return {
    msgId,
    aantalBetalingen: nbOfTxs ? parseInt(nbOfTxs, 10) : null,
    controleSom: ctrlSum,
    betaaldatum: datum,
    ibanOpdrachtgever: iban,
    naamOpdrachtgever,
    fouten,
  };
}
