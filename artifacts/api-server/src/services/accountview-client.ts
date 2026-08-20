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
  grootboekrekening?: string;    // debet-rekening
  creditRekening?: string;       // credit-rekening (tegenboeking)
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
    CreditRekening: boeking.creditRekening ?? "",
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

export const ACCOUNT_VIEW_POST_TIMEOUT_MS = 60_000;

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
        // Een externe POST mag nooit onbeperkt blijven leven. BANK_01 gebruikt
        // een veel ruimere claimvervaltermijn; daardoor kan een oude claim pas
        // naar 'onzeker' nadat deze lokale worker aantoonbaar is gestopt.
        signal: AbortSignal.timeout(ACCOUNT_VIEW_POST_TIMEOUT_MS),
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
   * Leest het actuele banksaldo (bank + kas) uit AccountView.
   *
   * Fail-soft: bij testmodus, ontbrekende configuratie, een niet-ondersteund
   * endpoint of een verbindingsfout wordt GEEN saldo verzonnen — er wordt
   * { beschikbaar: false } teruggegeven met een leesbare reden. Het dashboard
   * toont dan expliciet "niet beschikbaar" in plaats van een misleidend cijfer.
   */
  async leesBankSaldo(): Promise<{ beschikbaar: boolean; saldo?: number; reden?: string }> {
    if (this.config.testmodus) {
      return { beschikbaar: false, reden: "AccountView staat in testmodus — banksaldo wordt niet opgehaald." };
    }
    if (!this.config.apiEndpoint || !this.config.apiGebruiker || !this.config.apiKey) {
      return { beschikbaar: false, reden: "AccountView-koppeling is niet volledig geconfigureerd." };
    }

    // Grootboeksaldi van de liquide middelen (bank + kas). Het exacte pad is
    // configureerbaar in de AccountView-omgeving; we vragen de saldibalans op
    // en sommeren de liquide-middelen-rekeningen.
    const base = this.config.apiEndpoint.replace(/\/$/, "");
    const url = `${base}/api/banksaldi?administratie=${encodeURIComponent(this.config.administratiecode)}`;
    const credentials = Buffer.from(`${this.config.apiGebruiker}:${this.config.apiKey}`).toString("base64");

    try {
      const resp = await fetch(url, {
        method: "GET",
        headers: { "Authorization": `Basic ${credentials}`, "Accept": "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) {
        return { beschikbaar: false, reden: `AccountView gaf HTTP ${resp.status} terug voor het banksaldo.` };
      }
      const data = (await resp.json()) as unknown;

      // Ondersteun zowel een enkel totaalveld als een lijst rekeningen die
      // gesommeerd moet worden.
      let saldo: number | null = null;
      if (data && typeof data === "object") {
        const obj = data as Record<string, unknown>;
        const direct = obj["Saldo"] ?? obj["saldo"] ?? obj["TotaalSaldo"] ?? obj["totaal"];
        if (typeof direct === "number" && Number.isFinite(direct)) {
          saldo = direct;
        } else {
          const lijst = (obj["Rekeningen"] ?? obj["rekeningen"] ?? obj["items"] ?? (Array.isArray(data) ? data : null)) as unknown;
          if (Array.isArray(lijst)) {
            saldo = lijst.reduce<number>((som, r) => {
              const rr = r as Record<string, unknown>;
              const v = rr["Saldo"] ?? rr["saldo"] ?? rr["Bedrag"] ?? rr["bedrag"];
              return som + (typeof v === "number" && Number.isFinite(v) ? v : 0);
            }, 0);
          }
        }
      } else if (Array.isArray(data)) {
        saldo = (data as unknown[]).reduce<number>((som, r) => {
          const rr = r as Record<string, unknown>;
          const v = rr["Saldo"] ?? rr["saldo"] ?? rr["Bedrag"] ?? rr["bedrag"];
          return som + (typeof v === "number" && Number.isFinite(v) ? v : 0);
        }, 0);
      }

      if (saldo == null || !Number.isFinite(saldo)) {
        return { beschikbaar: false, reden: "AccountView leverde geen bruikbaar banksaldo terug." };
      }
      return { beschikbaar: true, saldo };
    } catch (err) {
      return {
        beschikbaar: false,
        reden: `Banksaldo niet opgehaald: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Haalt het rekeningschema (grootboekrekeningen) op uit AccountView.
   *
   * ADMINISTRATIE_01: dit is een MEETBAAR pad — of de gekoppelde AccountView-
   * omgeving dit endpoint ondersteunt, verschilt per installatie. Fail-soft:
   * we verzinnen nooit rekeningen; bij testmodus, ontbrekende configuratie,
   * een niet-ondersteund endpoint (404/405) of verbindingsfout komt
   * { beschikbaar: false } terug met de exacte reden + HTTP-status, zodat de
   * beheerpagina kan melden of de koppeling dit toestaat.
   */
  async haalGrootboekrekeningen(): Promise<{
    beschikbaar: boolean;
    rekeningen?: Array<{ nummer: string; omschrijving: string; soort: string | null }>;
    httpStatus?: number;
    reden?: string;
  }> {
    if (this.config.testmodus) {
      return { beschikbaar: false, reden: "AccountView staat in testmodus — het rekeningschema wordt niet opgehaald." };
    }
    if (!this.config.apiEndpoint || !this.config.apiGebruiker || !this.config.apiKey) {
      return { beschikbaar: false, reden: "AccountView-koppeling is niet volledig geconfigureerd." };
    }
    const base = this.config.apiEndpoint.replace(/\/$/, "");
    const url = `${base}/api/grootboekrekeningen?administratie=${encodeURIComponent(this.config.administratiecode)}`;
    const credentials = Buffer.from(`${this.config.apiGebruiker}:${this.config.apiKey}`).toString("base64");
    try {
      const resp = await fetch(url, {
        method: "GET",
        headers: { "Authorization": `Basic ${credentials}`, "Accept": "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok) {
        const reden = resp.status === 404 || resp.status === 405
          ? `De AccountView-koppeling ondersteunt het rekeningschema-endpoint niet (HTTP ${resp.status}). Gebruik het inlezen van een lijst.`
          : `AccountView gaf HTTP ${resp.status} terug voor het rekeningschema.`;
        return { beschikbaar: false, httpStatus: resp.status, reden };
      }
      const data = (await resp.json()) as unknown;
      const lijst = Array.isArray(data)
        ? data
        : (data && typeof data === "object"
          ? ((data as Record<string, unknown>)["Rekeningen"] ?? (data as Record<string, unknown>)["rekeningen"] ?? (data as Record<string, unknown>)["items"])
          : null);
      if (!Array.isArray(lijst)) {
        return { beschikbaar: false, httpStatus: resp.status, reden: "AccountView leverde geen bruikbare rekeninglijst terug." };
      }
      const rekeningen: Array<{ nummer: string; omschrijving: string; soort: string | null }> = [];
      for (const r of lijst) {
        const rr = r as Record<string, unknown>;
        const nummer = rr["Nummer"] ?? rr["nummer"] ?? rr["Rekening"] ?? rr["rekening"] ?? rr["AccountId"] ?? rr["code"];
        const omschrijving = rr["Omschrijving"] ?? rr["omschrijving"] ?? rr["Naam"] ?? rr["naam"] ?? "";
        const soort = rr["Soort"] ?? rr["soort"] ?? rr["Type"] ?? rr["type"] ?? null;
        if (nummer != null && String(nummer).trim()) {
          rekeningen.push({
            nummer: String(nummer).trim(),
            omschrijving: String(omschrijving ?? "").trim(),
            soort: soort == null ? null : String(soort).trim() || null,
          });
        }
      }
      if (rekeningen.length === 0) {
        return { beschikbaar: false, httpStatus: resp.status, reden: "AccountView gaf een lege of onleesbare rekeninglijst terug." };
      }
      return { beschikbaar: true, httpStatus: resp.status, rekeningen };
    } catch (err) {
      return { beschikbaar: false, reden: `Rekeningschema niet opgehaald: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  /**
   * Haal de btw-codes van de administratie op (ADMINISTRATIE_02 §1).
   * Zelfde fail-soft meetgedrag als haalGrootboekrekeningen: we verzinnen
   * nooit codes; bij testmodus, ontbrekende configuratie, een niet-ondersteund
   * endpoint of verbindingsfout komt { beschikbaar: false } terug met reden.
   */
  async haalBtwCodes(): Promise<{
    beschikbaar: boolean;
    codes?: Array<{ code: string; omschrijving: string; percentage: number | null }>;
    httpStatus?: number;
    reden?: string;
  }> {
    if (this.config.testmodus) {
      return { beschikbaar: false, reden: "AccountView staat in testmodus — de btw-codes worden niet opgehaald." };
    }
    if (!this.config.apiEndpoint || !this.config.apiGebruiker || !this.config.apiKey) {
      return { beschikbaar: false, reden: "AccountView-koppeling is niet volledig geconfigureerd." };
    }
    const base = this.config.apiEndpoint.replace(/\/$/, "");
    const url = `${base}/api/btwcodes?administratie=${encodeURIComponent(this.config.administratiecode)}`;
    const credentials = Buffer.from(`${this.config.apiGebruiker}:${this.config.apiKey}`).toString("base64");
    try {
      const resp = await fetch(url, {
        method: "GET",
        headers: { "Authorization": `Basic ${credentials}`, "Accept": "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok) {
        const reden = resp.status === 404 || resp.status === 405
          ? `De AccountView-koppeling ondersteunt het btw-codes-endpoint niet (HTTP ${resp.status}). Gebruik het inlezen van een lijst.`
          : `AccountView gaf HTTP ${resp.status} terug voor de btw-codes.`;
        return { beschikbaar: false, httpStatus: resp.status, reden };
      }
      const data = (await resp.json()) as unknown;
      const lijst = Array.isArray(data)
        ? data
        : (data && typeof data === "object"
          ? ((data as Record<string, unknown>)["BtwCodes"] ?? (data as Record<string, unknown>)["btw_codes"] ?? (data as Record<string, unknown>)["items"])
          : null);
      if (!Array.isArray(lijst)) {
        return { beschikbaar: false, httpStatus: resp.status, reden: "AccountView leverde geen bruikbare btw-codelijst terug." };
      }
      const codes: Array<{ code: string; omschrijving: string; percentage: number | null }> = [];
      for (const r of lijst) {
        const rr = r as Record<string, unknown>;
        const code = rr["Code"] ?? rr["code"] ?? rr["BtwCode"] ?? rr["btw_code"];
        const omschrijving = rr["Omschrijving"] ?? rr["omschrijving"] ?? rr["Naam"] ?? rr["naam"] ?? "";
        const pctRaw = rr["Percentage"] ?? rr["percentage"] ?? rr["Tarief"] ?? rr["tarief"];
        const pct = pctRaw == null ? null : Number(pctRaw);
        if (code != null && String(code).trim()) {
          codes.push({
            code: String(code).trim(),
            omschrijving: String(omschrijving ?? "").trim(),
            percentage: pct != null && Number.isFinite(pct) ? pct : null,
          });
        }
      }
      if (codes.length === 0) {
        return { beschikbaar: false, httpStatus: resp.status, reden: "AccountView gaf een lege of onleesbare btw-codelijst terug." };
      }
      return { beschikbaar: true, httpStatus: resp.status, codes };
    } catch (err) {
      return { beschikbaar: false, reden: `Btw-codes niet opgehaald: ${err instanceof Error ? err.message : String(err)}` };
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
