/**
 * AccountView API client — configurable abstraction layer.
 *
 * In testmodus: logt de payload maar verzend niets naar AccountView.
 * In livemodus: POST naar het geconfigureerde API-endpoint.
 *
 * AccountView.net REST API — boekingsformaat voor inkoop/verkoop dagboek.
 * Het exacte endpoint-pad is configureerbaar zodat de leverancier dit later kan aanpassen.
 */

export interface AccountviewConfig {
  apiEndpoint: string;
  administratiecode: string;
  apiGebruiker: string;
  apiKey: string;
  dagboekInkoop: string;
  dagboekVerkoop: string;
  testmodus: boolean;
}

export interface AccountviewBoeking {
  dagboek: string;
  administratiecode: string;
  factuurnummer: string;
  factuurdatum: string;          // YYYY-MM-DD
  vervaldatum?: string;
  relatienaam: string;
  relatieCode?: string;          // debiteur/crediteurcode in AccountView
  omschrijving: string;
  bedragExclBtw: number;
  btwBedrag: number;
  bedragInclBtw: number;
  btwCode?: string;
  grootboekrekening?: string;
  kostenplaats?: string;
  projectCode?: string;
  pdfVerwijzing?: string;        // URL of pad naar de PDF (indien ondersteund)
  type: "inkoop" | "verkoop";
}

export interface AccountviewBoekingResultaat {
  geslaagd: boolean;
  boekingId?: string;
  httpStatus?: number;
  rawResponse?: unknown;
  foutmelding?: string;
  foutDetails?: string[];
  testmodus: boolean;
}

/**
 * Vertaal een AccountviewBoeking naar de AccountView REST API payload.
 * AccountView web-API accepteert JSON voor journaalposten.
 */
function bouwPayload(boeking: AccountviewBoeking): Record<string, unknown> {
  return {
    AdministratieCode: boeking.administratiecode,
    DagboekCode: boeking.dagboek,
    Factuurnummer: boeking.factuurnummer,
    Factuurdatum: boeking.factuurdatum,
    Vervaldatum: boeking.vervaldatum ?? boeking.factuurdatum,
    RelatieName: boeking.relatienaam,
    RelatieCode: boeking.relatieCode ?? "",
    Omschrijving: boeking.omschrijving,
    BedragExclBtw: boeking.bedragExclBtw,
    BtwBedrag: boeking.btwBedrag,
    BedragInclBtw: boeking.bedragInclBtw,
    BtwCode: boeking.btwCode ?? "",
    GrootboekRekening: boeking.grootboekrekening ?? "",
    KostenPlaats: boeking.kostenplaats ?? "",
    ProjectCode: boeking.projectCode ?? "",
    PdfVerwijzing: boeking.pdfVerwijzing ?? "",
  };
}

/**
 * Vertaal bekende AccountView foutcodes naar leesbare Nederlandse tekst.
 */
function vertaalFout(raw: string): string {
  if (raw.includes("Debiteur") || raw.includes("Crediteur")) return "Onbekende debiteur/crediteur — voeg de relatie eerst toe in AccountView.";
  if (raw.includes("Btw") || raw.includes("BTW")) return "Ontbrekende of ongeldige BTW-code.";
  if (raw.includes("Dagboek")) return "Ongeldig dagboek — controleer de dagboekcode in de instellingen.";
  if (raw.includes("Grootboek")) return "Onbekende grootboekrekening.";
  if (raw.includes("KostenPlaats") || raw.includes("Kostenplaats")) return "Ontbrekende of ongeldige kostenplaats.";
  if (raw.includes("Dubbel") || raw.includes("duplicate") || raw.includes("al bestaat")) return "Dubbele factuur — dit factuurnummer bestaat al in AccountView.";
  if (raw.includes("Administratie")) return "Onbekende administratiecode — controleer de instellingen.";
  return raw;
}

export class AccountViewClient {
  constructor(private config: AccountviewConfig) {}

  async verzendBoeking(boeking: AccountviewBoeking): Promise<AccountviewBoekingResultaat> {
    const payload = bouwPayload(boeking);

    if (this.config.testmodus) {
      // Testmodus: simuleer een succesvolle response zonder daadwerkelijk te verzenden
      console.log("[AccountView TESTMODUS] Payload zou worden verzonden:", JSON.stringify(payload, null, 2));
      return {
        geslaagd: true,
        boekingId: `TEST-${Date.now()}`,
        httpStatus: 200,
        rawResponse: { message: "Testmodus — niet daadwerkelijk verzonden", payload },
        testmodus: true,
      };
    }

    // Livemodus — stuur naar het AccountView API endpoint
    const url = `${this.config.apiEndpoint.replace(/\/$/, "")}/api/journaalposten`;
    const credentials = Buffer.from(`${this.config.apiGebruiker}:${this.config.apiKey}`).toString("base64");

    let httpStatus = 0;
    let rawResponse: unknown;
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${credentials}`,
          "Accept": "application/json",
        },
        body: JSON.stringify(payload),
      });

      httpStatus = resp.status;
      try { rawResponse = await resp.json(); } catch { rawResponse = await resp.text(); }

      if (resp.ok) {
        const data = rawResponse as Record<string, unknown>;
        return {
          geslaagd: true,
          boekingId: String(data["Id"] ?? data["id"] ?? data["BoekingId"] ?? ""),
          httpStatus,
          rawResponse,
          testmodus: false,
        };
      } else {
        // Fout — parseer de foutmelding
        const data = rawResponse as Record<string, unknown>;
        const rawFout =
          (data["Message"] as string) ??
          (data["message"] as string) ??
          (data["error"] as string) ??
          `HTTP ${httpStatus}`;
        const foutDetails = (data["Errors"] as string[] | undefined) ?? [];

        return {
          geslaagd: false,
          httpStatus,
          rawResponse,
          foutmelding: vertaalFout(rawFout),
          foutDetails,
          testmodus: false,
        };
      }
    } catch (err) {
      return {
        geslaagd: false,
        httpStatus,
        rawResponse,
        foutmelding: `Verbindingsfout: ${err instanceof Error ? err.message : String(err)}`,
        testmodus: false,
      };
    }
  }

  /**
   * Ping AccountView om te controleren of de configuratie klopt.
   */
  async pingVerbinding(): Promise<{ bereikbaar: boolean; fout?: string }> {
    if (this.config.testmodus) return { bereikbaar: true };
    const url = `${this.config.apiEndpoint.replace(/\/$/, "")}/api/administraties`;
    const credentials = Buffer.from(`${this.config.apiGebruiker}:${this.config.apiKey}`).toString("base64");
    try {
      const resp = await fetch(url, {
        method: "GET",
        headers: { "Authorization": `Basic ${credentials}`, "Accept": "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      return resp.ok ? { bereikbaar: true } : { bereikbaar: false, fout: `HTTP ${resp.status}` };
    } catch (err) {
      return { bereikbaar: false, fout: err instanceof Error ? err.message : String(err) };
    }
  }
}

/**
 * Maak een AccountViewClient op basis van de instellingen uit de DB.
 */
export function maakAccountViewClient(instellingen: {
  apiEndpoint?: string | null;
  administratiecode?: string | null;
  apiGebruiker?: string | null;
  apiKey?: string | null;
  testmodus: boolean;
  dagboekInkoop?: string | null;
  dagboekVerkoop?: string | null;
}): AccountViewClient {
  return new AccountViewClient({
    apiEndpoint: instellingen.apiEndpoint ?? "https://localhost",
    administratiecode: instellingen.administratiecode ?? "",
    apiGebruiker: instellingen.apiGebruiker ?? "",
    apiKey: instellingen.apiKey ?? "",
    testmodus: instellingen.testmodus,
    dagboekInkoop: instellingen.dagboekInkoop ?? "INK",
    dagboekVerkoop: instellingen.dagboekVerkoop ?? "VRK",
  });
}
