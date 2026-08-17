/**
 * Normaliseert een rauwe AI-respons naar een veilig voorstel.
 *
 * Regels:
 * - String-velden: alleen overnemen als niet-leeg na trim(); anders null
 * - Boolean-velden: alleen overnemen als echt boolean; anders null
 * - staat_indicatie: hetzelfde als string-velden
 *
 * Het resultaat bevat uitsluitend null voor onbekende/whitespace-waarden,
 * zodat de client bestaande handmatige invoer niet overschrijft.
 */
export interface GereedschapAiVoorstel {
  omschrijving: string;
  merk: string | null;
  type: string | null;
  categorie: string | null;
  aandrijving: string | null;
  met_snoer: boolean | null;
  accu_inbegrepen: boolean | null;
  lader_inbegrepen: boolean | null;
  koffer_inbegrepen: boolean | null;
  keuringsplichtig: boolean | null;
  staat_indicatie: string | null;
}

export function normaliserenAiGereedschapVoorstel(
  voorstel: Record<string, unknown>,
): GereedschapAiVoorstel {
  function tekst(waarde: unknown): string | null {
    return typeof waarde === "string" && waarde.trim() ? waarde.trim() : null;
  }
  function bool(waarde: unknown): boolean | null {
    return typeof waarde === "boolean" ? waarde : null;
  }

  return {
    omschrijving: tekst(voorstel.omschrijving) ?? "",
    merk: tekst(voorstel.merk),
    type: tekst(voorstel.type),
    categorie: tekst(voorstel.categorie),
    aandrijving: tekst(voorstel.aandrijving),
    met_snoer: bool(voorstel.met_snoer),
    accu_inbegrepen: bool(voorstel.accu_inbegrepen),
    lader_inbegrepen: bool(voorstel.lader_inbegrepen),
    koffer_inbegrepen: bool(voorstel.koffer_inbegrepen),
    keuringsplichtig: bool(voorstel.keuringsplichtig),
    staat_indicatie: tekst(voorstel.staat_indicatie),
  };
}
