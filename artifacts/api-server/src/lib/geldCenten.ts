// Exacte geldrekenkunde in centen-integers voor de ENK-import.
// De DB-geldkolommen zijn real (float4) en dus niet geschikt voor autoritaire
// vergelijkingen; alle parse-, som- en verschilberekeningen gebeuren hier in
// gehele centen en worden canoniek opgeslagen in jsonb (parse_resultaat).

/**
 * Parseert een Nederlands geldbedrag naar centen.
 * "5.408,85" → 540885, "€ 152.535,82" → 15253582, "1.185,00" → 118500, "145,40" → 14540.
 * Retourneert null bij onbruikbare invoer.
 */
export function parseEuroNaarCenten(invoer: string | null | undefined): number | null {
  if (invoer === null || invoer === undefined) return null;
  const schoon = String(invoer)
    .replace(/€/g, "")
    .replace(/\s/g, "")
    .replace(/EUR/gi, "")
    .trim();
  if (!schoon) return null;
  const negatief = schoon.startsWith("-");
  const zonderTeken = negatief ? schoon.slice(1) : schoon;
  // NL-notatie: punt = duizendtal, komma = decimaal
  const m = zonderTeken.match(/^(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?$/);
  if (!m) return null;
  const euros = parseInt(m[1].replace(/\./g, ""), 10);
  const centDeel = m[2] ? (m[2].length === 1 ? parseInt(m[2], 10) * 10 : parseInt(m[2], 10)) : 0;
  if (!Number.isFinite(euros)) return null;
  const centen = euros * 100 + centDeel;
  return negatief ? -centen : centen;
}

/** 540885 → "5.408,85" (zonder €-teken). */
export function centenNaarEuroTekst(centen: number): string {
  const negatief = centen < 0;
  const abs = Math.abs(Math.round(centen));
  const euros = Math.floor(abs / 100);
  const rest = abs % 100;
  const eurosTekst = euros.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negatief ? "-" : ""}${eurosTekst},${rest.toString().padStart(2, "0")}`;
}

/** Centen → number met 2 decimalen (voor opslag in real-kolommen / API-respons). */
export function centenNaarEuroGetal(centen: number): number {
  return Math.round(centen) / 100;
}

/** Euro-getal (bv. uit AI-output 5408.85) → centen, met afronding op hele centen. */
export function euroGetalNaarCenten(bedrag: number): number {
  return Math.round(bedrag * 100);
}

export function somCenten(lijst: Array<number | null | undefined>): number {
  let som = 0;
  for (const c of lijst) {
    if (typeof c === "number" && Number.isFinite(c)) som += Math.round(c);
  }
  return som;
}
