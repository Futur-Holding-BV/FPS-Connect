// AI-voorstel voor opleidingen/cursussen per functie.
//
// Project-principe (hard): AI STELT VOOR, een mens BEVESTIGT. Deze service slaat
// niets op; ze retourneert een voorstel dat de gebruiker in de UI beoordeelt en
// vervolgens zelf opslaat. Op expliciet verzoek vooruit gebouwd (zie replit.md /
// docs/roadmap/parallel-spoor.md); blijft binnen "AI stelt voor".
import { logger } from "../lib/logger";
import { aiGateway, heeftGateway, type LogContext } from "../lib/aiGateway";
import { OPLEIDING_VOORSTEL_PROMPT } from "../lib/aiPrompts";

export interface OpleidingVoorstel {
  naam: string;
  soort: "opleiding" | "cursus";
  categorie: string | null;
  omschrijving: string | null;
  niveau: string | null;
  opleider: string | null;
  studieduur: string | null;
  studiebelasting: string | null;
  lesvorm: string | null;
  kosten_indicatie: string | null;
  kosten_werkgever_pct: number | null;
  kosten_werknemer_pct: number | null;
  geldigheid_maanden: number | null;
  verplicht: boolean;
}

export interface OpleidingenVoorstelResultaat {
  voorstellen: OpleidingVoorstel[];
  toelichting: string | null;
  betrouwbaarheid: string | null;
}

export interface FunctieContext {
  naam: string;
  werkmaatschappij?: string | null;
  omschrijving?: string | null;
  taken?: string | null;
  verantwoordelijkheden?: string | null;
  competenties?: string | null;
  opleidingsvereisten?: string | null;
}

function strOfNull(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 ? t : null;
  }
  return null;
}

function intOfNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  return null;
}

function soortOf(v: unknown): "opleiding" | "cursus" {
  return strOfNull(v) === "opleiding" ? "opleiding" : "cursus";
}


function bouwFunctieTekst(functie: FunctieContext): string {
  const regels: string[] = [`Functie: ${functie.naam}`];
  if (functie.werkmaatschappij) regels.push(`Werkmaatschappij: ${functie.werkmaatschappij}`);
  if (functie.omschrijving) regels.push(`Omschrijving: ${functie.omschrijving}`);
  if (functie.taken) regels.push(`Taken: ${functie.taken}`);
  if (functie.verantwoordelijkheden) regels.push(`Verantwoordelijkheden: ${functie.verantwoordelijkheden}`);
  if (functie.competenties) regels.push(`Competenties: ${functie.competenties}`);
  if (functie.opleidingsvereisten) regels.push(`Bekende opleidingsvereisten: ${functie.opleidingsvereisten}`);
  return regels.join("\n");
}

export async function stelOpleidingenVoor(functie: FunctieContext, logCtx?: Partial<LogContext>): Promise<OpleidingenVoorstelResultaat> {
  if (!heeftGateway()) {
    return {
      voorstellen: [],
      toelichting: "AI is niet geconfigureerd. Stel handmatig opleidingen samen of stel een OpenAI-sleutel in.",
      betrouwbaarheid: null,
    };
  }

  const aiResultaat = await aiGateway.chat("reasoning", {
    response_format: { type: "json_object" },
    max_completion_tokens: 4000,
    messages: [
      { role: "system", content: OPLEIDING_VOORSTEL_PROMPT.tekst },
      { role: "user", content: bouwFunctieTekst(functie) },
    ],
  }, undefined, {
    module: "hrm",
    functie: "opleiding-voorstel",
    promptNaam: OPLEIDING_VOORSTEL_PROMPT.naam,
    promptVersie: OPLEIDING_VOORSTEL_PROMPT.versie,
    ...logCtx,
  });
  if (!aiResultaat.ok) {
    logger.error({ fout: aiResultaat.fout }, "AI-opleidingenvoorstel mislukt");
    return {
      voorstellen: [],
      toelichting: "Het AI-voorstel kon niet worden opgehaald. Probeer het later opnieuw.",
      betrouwbaarheid: null,
    };
  }
  const tekst = aiResultaat.inhoud;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(tekst);
  } catch {
    logger.error({ tekst }, "Kon AI-JSON niet parsen (opleidingenvoorstel)");
    return { voorstellen: [], toelichting: "Het AI-antwoord was onleesbaar.", betrouwbaarheid: null };
  }

  const ruw = Array.isArray(parsed.voorstellen) ? parsed.voorstellen : [];
  const voorstellen: OpleidingVoorstel[] = ruw
    .filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null)
    .map((v) => {
      const naam = strOfNull(v.naam);
      if (!naam) return null;
      let werkgever = intOfNull(v.kosten_werkgever_pct);
      let werknemer = intOfNull(v.kosten_werknemer_pct);
      if (werkgever != null && werknemer == null) werknemer = Math.max(0, 100 - werkgever);
      if (werknemer != null && werkgever == null) werkgever = Math.max(0, 100 - werknemer);
      return {
        naam,
        soort: soortOf(v.soort),
        categorie: strOfNull(v.categorie),
        omschrijving: strOfNull(v.omschrijving),
        niveau: strOfNull(v.niveau),
        opleider: strOfNull(v.opleider),
        studieduur: strOfNull(v.studieduur),
        studiebelasting: strOfNull(v.studiebelasting),
        lesvorm: strOfNull(v.lesvorm),
        kosten_indicatie: strOfNull(v.kosten_indicatie),
        kosten_werkgever_pct: werkgever,
        kosten_werknemer_pct: werknemer,
        geldigheid_maanden: intOfNull(v.geldigheid_maanden),
        verplicht: v.verplicht === true,
      } satisfies OpleidingVoorstel;
    })
    .filter((v): v is OpleidingVoorstel => v !== null);

  return {
    voorstellen,
    toelichting: strOfNull(parsed.toelichting),
    betrouwbaarheid: strOfNull(parsed.betrouwbaarheid),
  };
}
