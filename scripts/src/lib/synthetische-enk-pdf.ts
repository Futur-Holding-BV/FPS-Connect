const REGELS = [
  "Calculatierapport",
  "FPS-BP-00098 Synthetische ENK testcalculatie (Offerte) Testopdrachtgever 01-01-2026",
  "BPC-00091",
  "Omschrijving Aantal Totaal Eenheid",
  "Applicatiewerk",
  "Synthetische brandwerende afdichting 1 € 152.535,82 st",
  "Applicatiewerk € 152.535,82",
  "Bouwplaatskosten",
  "Synthetische bouwplaatskosten 1 € 12.927,91 st",
  "Bouwplaatskosten € 12.927,91",
  "Totaal calculatie € 165.463,74",
] as const;

function pdfTekst(waarde: string): string {
  return waarde
    .replaceAll("\\", "\\\\")
    .replaceAll("€", "\\200")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

/**
 * Klantloze ENK-regressiebijlage. De PDF bevat alleen synthetische namen en
 * vaste testbedragen, zodat de importflow geen echt klantdocument in Git nodig heeft.
 */
export function maakSynthetischeEnkPdf(): Buffer {
  const inhoud = [
    "BT",
    "/F1 10 Tf",
    "50 790 Td",
    "14 TL",
    ...REGELS.flatMap((regel, index) => [
      `(${pdfTekst(regel)}) Tj`,
      ...(index < REGELS.length - 1 ? ["T*"] : []),
    ]),
    "ET",
  ].join("\n");

  const objecten = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(inhoud, "latin1")} >>\nstream\n${inhoud}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const posities = [0];
  objecten.forEach((object, index) => {
    posities.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefPositie = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objecten.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const positie of posities.slice(1)) {
    pdf += `${String(positie).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objecten.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPositie}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}