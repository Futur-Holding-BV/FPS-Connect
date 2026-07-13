// AI-voorstel voor rollen (toegangsprofielen) met bijbehorende rechten.
//
// Project-principe (hard): AI STELT VOOR, een mens BEVESTIGT. Deze service slaat
// niets op; ze retourneert een voorstel dat de hoofdbeheerder in de UI beoordeelt,
// aanpast en vervolgens zelf opslaat als profielen. AI mag nooit zelf rollen of
// rechten activeren of toekennen.
import { logger } from "../lib/logger";
import { aiGateway, heeftGateway, type LogContext } from "../lib/aiGateway";
import { PROFIEL_VOORSTEL_PROMPT } from "../lib/aiPrompts";
import { MODULES, NIVEAUS, MODULE_IDS, MAX_NIVEAU, PRESETS } from "@workspace/permissies";

// Gevoelige modules: AI mag deze nooit boven 0 voorstellen. De hoofdbeheerder kan
// ze daarna in de reviewdialoog bewust handmatig verhogen (een expliciete
// menselijke handeling), conform het principe "AI stelt voor, mens bevestigt".
const GEVOELIGE_MODULES = new Set<string>([
  "systeem",
  "financieel_vertrouwelijk",
  "salarisarchief",
  "salaris_mutaties",
  "scab_mail",
  "boekhouder_portaal",
]);

export interface RolVoorstel {
  naam: string;
  omschrijving: string | null;
  bevoegdheden: Record<string, number>;
}

export interface RollenVoorstelResultaat {
  voorstellen: RolVoorstel[];
  toelichting: string | null;
}

export interface FunctieBron {
  naam: string;
  omschrijving?: string | null;
  taken?: string | null;
  verantwoordelijkheden?: string | null;
}

function strOfNull(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 ? t : null;
  }
  return null;
}

// Sanitiseer een door AI voorgestelde bevoegdheden-map: alleen bekende modules,
// niveaus geclampt 0..MAX_NIVEAU, gevoelige modules geforceerd op 0, en alle
// modules aangevuld met 0 zodat de reviewmatrix compleet en voorspelbaar is.
function saneerBevoegdheden(invoer: unknown): Record<string, number> {
  const uit: Record<string, number> = {};
  for (const id of MODULE_IDS) uit[id] = 0;
  if (invoer && typeof invoer === "object" && !Array.isArray(invoer)) {
    for (const [sleutel, waarde] of Object.entries(invoer as Record<string, unknown>)) {
      if (!(sleutel in uit)) continue;
      let n = typeof waarde === "number" ? Math.round(waarde) : Number(waarde);
      if (!Number.isFinite(n)) n = 0;
      n = Math.max(0, Math.min(MAX_NIVEAU, n));
      uit[sleutel] = n;
    }
  }
  for (const id of GEVOELIGE_MODULES) {
    if (id in uit) uit[id] = 0;
  }
  return uit;
}

function bouwContextTekst(functies: FunctieBron[]): string {
  const moduleRegels = MODULES.map((m) => `- ${m.id} (${m.label}): ${m.omschrijving}`).join("\n");
  const niveauRegels = NIVEAUS.map((n) => `- ${n.waarde} = ${n.label}: ${n.omschrijving}`).join("\n");
  const bestaandeRollen = PRESETS.map((p) => p.naam).join(", ");
  const regels: string[] = [];
  regels.push("BESCHIKBARE MODULES (gebruik uitsluitend deze id's):");
  regels.push(moduleRegels);
  regels.push("");
  regels.push("NIVEAUS (per module een geheel getal 0 t/m 4):");
  regels.push(niveauRegels);
  regels.push("");
  regels.push(`Bestaande standaardrollen (kies onderscheidende, andere namen): ${bestaandeRollen}`);
  if (functies.length > 0) {
    regels.push("");
    regels.push("FUNCTIEHUIS (stem de rollen hierop af):");
    for (const f of functies) {
      const delen = [`- ${f.naam}`];
      if (f.omschrijving) delen.push(`omschrijving: ${f.omschrijving}`);
      if (f.taken) delen.push(`taken: ${f.taken}`);
      if (f.verantwoordelijkheden) delen.push(`verantwoordelijkheden: ${f.verantwoordelijkheden}`);
      regels.push(delen.join(" | "));
    }
  } else {
    regels.push("");
    regels.push("Er is nog geen functiehuis ingericht; stel een generieke, gangbare set rollen voor een brandpreventie-/bouwbedrijf voor.");
  }
  return regels.join("\n");
}

// Stelt een set rollen met rechten voor. `bestaandeProfielNamen` zijn de namen van
// reeds bestaande profielen; samen met de PRESET-namen worden deze uitgesloten,
// zodat een AI-voorstel nooit een naam voorstelt die botst met een bestaand of
// systeemprofiel (case-insensitive). Zo blijft "Standaardrollen aanmaken" (dat op
// unieke namen inserteert) werken en ontstaan er geen dubbele rollen.
export async function stelRollenVoor(
  functies: FunctieBron[],
  bestaandeProfielNamen: string[],
  logCtx?: Partial<LogContext>,
): Promise<RollenVoorstelResultaat> {
  if (!heeftGateway()) {
    return {
      voorstellen: [],
      toelichting:
        "AI is niet geconfigureerd. Stel de rollen handmatig samen of gebruik 'Standaardrollen aanmaken'.",
    };
  }

  const aiResultaat = await aiGateway.chat(
    "default",
    {
      response_format: { type: "json_object" },
      max_tokens: 4000,
      messages: [
        { role: "system", content: PROFIEL_VOORSTEL_PROMPT.tekst },
        { role: "user", content: bouwContextTekst(functies) },
      ],
    },
    undefined,
    {
      module: "gebruikers",
      functie: "rollen-voorstel",
      promptNaam: PROFIEL_VOORSTEL_PROMPT.naam,
      promptVersie: PROFIEL_VOORSTEL_PROMPT.versie,
      ...logCtx,
    },
  );
  if (!aiResultaat.ok) {
    logger.error({ fout: aiResultaat.fout }, "AI-rollenvoorstel mislukt");
    return {
      voorstellen: [],
      toelichting: "Het AI-voorstel kon niet worden opgehaald. Probeer het later opnieuw.",
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(aiResultaat.inhoud);
  } catch {
    logger.error({ tekst: aiResultaat.inhoud }, "Kon AI-JSON niet parsen (rollenvoorstel)");
    return { voorstellen: [], toelichting: "Het AI-antwoord was onleesbaar." };
  }

  const verboden = new Set<string>([
    ...PRESETS.map((p) => p.naam.toLowerCase()),
    ...bestaandeProfielNamen.map((n) => n.toLowerCase()),
  ]);
  const gezien = new Set<string>();
  const ruw = Array.isArray(parsed.voorstellen) ? parsed.voorstellen : [];
  const voorstellen: RolVoorstel[] = ruw
    .filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null)
    .map((v) => {
      const naam = strOfNull(v.naam);
      if (!naam) return null;
      const sleutel = naam.toLowerCase();
      if (verboden.has(sleutel) || gezien.has(sleutel)) return null;
      gezien.add(sleutel);
      return {
        naam,
        omschrijving: strOfNull(v.omschrijving),
        bevoegdheden: saneerBevoegdheden(v.bevoegdheden),
      } satisfies RolVoorstel;
    })
    .filter((v): v is RolVoorstel => v !== null);

  return {
    voorstellen,
    toelichting: strOfNull(parsed.toelichting),
  };
}
