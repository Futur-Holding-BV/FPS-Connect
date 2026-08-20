type VerkoopfactuurMailFactuur = {
  factuurnummer: string;
  kenmerk: string | null;
  factuurdatum: string | null;
  vervaldatum: string | null;
  bedragExclBtw: string | null;
  btwBedrag: string | null;
  bedragInclBtw: string | null;
};

type VerkoopfactuurMailRegel = {
  omschrijving: string;
  hoeveelheid: number | string | null;
  eenheid: string | null;
  stukprijs: string | null;
  bedragExclBtw: string | null;
};

function escapeHtml(tekst: string): string {
  return tekst
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function euro(bedrag: string | null): string {
  if (bedrag == null) return "";
  return `€ ${Number.parseFloat(bedrag).toLocaleString("nl-NL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function bouwVerkoopfactuurMailHtml(opties: {
  factuur: VerkoopfactuurMailFactuur;
  regels: VerkoopfactuurMailRegel[];
  naarNaam: string | null;
  bericht?: string;
}): string {
  const { factuur, regels } = opties;
  const regelsHtml = regels
    .map(
      (regel) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;">${escapeHtml(regel.omschrijving)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${regel.hoeveelheid ?? ""} ${escapeHtml(regel.eenheid ?? "")}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${euro(regel.stukprijs)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${euro(regel.bedragExclBtw)}</td>
    </tr>`,
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#212631;">
      <div style="background:#F23B0D;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;">Factuur ${escapeHtml(factuur.factuurnummer)}</h2>
        ${factuur.kenmerk ? `<div style="opacity:.9;font-size:13px;">Kenmerk: ${escapeHtml(factuur.kenmerk)}</div>` : ""}
      </div>
      <div style="border:1px solid #eee;border-top:0;padding:20px;border-radius:0 0 8px 8px;">
        <p>Geachte ${escapeHtml(opties.naarNaam ?? "relatie")},</p>
        <p>${opties.bericht ? escapeHtml(opties.bericht) : "Hierbij ontvangt u onze factuur. Wij verzoeken u vriendelijk het bedrag binnen de betalingstermijn te voldoen."}</p>
        <table style="margin:12px 0;font-size:14px;">
          <tr><td style="padding:2px 12px 2px 0;color:#666;">Factuurdatum</td><td>${escapeHtml(factuur.factuurdatum ?? "")}</td></tr>
          <tr><td style="padding:2px 12px 2px 0;color:#666;">Vervaldatum</td><td>${escapeHtml(factuur.vervaldatum ?? "")}</td></tr>
        </table>
        ${regels.length > 0 ? `
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead><tr>
            <th style="text-align:left;padding:6px 8px;border-bottom:2px solid #212631;">Omschrijving</th>
            <th style="text-align:right;padding:6px 8px;border-bottom:2px solid #212631;">Aantal</th>
            <th style="text-align:right;padding:6px 8px;border-bottom:2px solid #212631;">Stukprijs</th>
            <th style="text-align:right;padding:6px 8px;border-bottom:2px solid #212631;">Bedrag excl.</th>
          </tr></thead>
          <tbody>${regelsHtml}</tbody>
        </table>` : ""}
        <table style="margin:12px 0 0 auto;font-size:14px;">
          <tr><td style="padding:2px 12px 2px 0;color:#666;">Totaal excl. btw</td><td style="text-align:right;">${euro(factuur.bedragExclBtw)}</td></tr>
          <tr><td style="padding:2px 12px 2px 0;color:#666;">Btw</td><td style="text-align:right;">${euro(factuur.btwBedrag)}</td></tr>
          <tr><td style="padding:2px 12px 2px 0;font-weight:bold;">Totaal incl. btw</td><td style="text-align:right;font-weight:bold;">${euro(factuur.bedragInclBtw)}</td></tr>
        </table>
      </div>
    </div>`;
}