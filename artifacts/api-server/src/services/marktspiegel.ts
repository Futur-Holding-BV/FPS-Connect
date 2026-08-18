// ── PRIJS_01 §8 — De marktspiegel (achtergronddienst) ────────────────────────
//
// voerMarktspiegelUit(onderzoekId) bouwt uit het onderwerp een zoekvraag, roept
// de web_search-AI aan (Responses-API, 'default'-slot; prompt in aiPrompts.ts),
// en dwingt de twee harde regels van §8.3 nogmaals server-side af:
//   1. Regels zonder vindplaats_url worden WEGGEGOOID — nooit geschat/geïnterpoleerd.
//   2. De samenvatting mag NOOIT een wisseladvies bevatten: bevat de uitvoer
//      "overstappen/wisselen/switch/andere leverancier kiezen", dan vervangen we
//      die door neutrale bewoording. Altijd voegen we de vaste zin toe dat het
//      doel weten is, niet wisselen, en dat een gesprek met de bestaande
//      leverancier de gebruikelijke vervolgstap is.
//
// Draait asynchroon (fire-and-forget vanuit de route na aanmaak): status
// bezig → klaar/fout. Nooit doorlopend — alleen op aanvraag (§8.2, §9).
import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  marktspiegelOnderzoekenTable,
  prijsafsprakenTable,
  financieleContractenTable,
  leveranciersTable,
} from "@workspace/db";
import type {
  MarktspiegelResultaat,
  MarktspiegelVergelijking,
} from "@workspace/db";
import { aiGateway, heeftGateway } from "../lib/aiGateway";
import { MARKTSPIEGEL_PROMPT } from "../lib/aiPrompts";
import { logger } from "../lib/logger";

// Woorden die op een wisseladvies duiden — nooit toegestaan in de uitvoer (§9).
const WISSEL_PATRONEN = [
  /\boverstap\w*/gi,
  /\bwissel\w*/gi,
  /\bswitch\w*/gi,
  /andere leverancier\w* (kiezen|kies|zoeken|zoek|nemen)/gi,
  /van leverancier (te )?verander\w*/gi,
];

// Vaste afsluitzin — altijd toevoegen aan de samenvatting (§8.3).
const VASTE_ZIN =
  "Het doel van deze marktspiegel is weten, niet wisselen. De gebruikelijke vervolgstap is een gesprek met de bestaande leverancier.";

function bevatWisseladvies(tekst: string): boolean {
  return WISSEL_PATRONEN.some((p) => {
    p.lastIndex = 0;
    return p.test(tekst);
  });
}

function neutraliseerWisseladvies(tekst: string): string {
  let s = tekst;
  for (const p of WISSEL_PATRONEN) {
    s = s.replace(p, "[vergelijk de prijs met de markt]");
  }
  return s;
}

// Bouwt de zoekvraag uit het onderwerp van het onderzoek.
async function bouwZoekvraag(onderzoek: {
  onderwerpType: string;
  onderwerpId: number | null;
  vraag: string;
}): Promise<string> {
  if (onderzoek.onderwerpType === "vrij") {
    return onderzoek.vraag;
  }

  if (onderzoek.onderwerpType === "prijsafspraak" && onderzoek.onderwerpId != null) {
    const [rij] = await db
      .select({
        a: prijsafsprakenTable,
        leverancierNaam: leveranciersTable.naam,
      })
      .from(prijsafsprakenTable)
      .leftJoin(leveranciersTable, eq(prijsafsprakenTable.leverancierId, leveranciersTable.id))
      // Alleen een niet-teruggedraaide afspraak is een geldig onderwerp:
      // een teruggedraaide afspraak bestaat "niet meer".
      .where(and(
        eq(prijsafsprakenTable.id, onderzoek.onderwerpId),
        isNull(prijsafsprakenTable.teruggedraaidOp),
      ))
      .limit(1);
    if (rij) {
      const a = rij.a;
      const omschrijving = a.leverancierOmschrijving ?? a.leverancierArtikelcode ?? "artikel";
      const delen = [
        `Wat vragen andere leveranciers in Nederland voor: ${omschrijving}`,
        a.leverancierArtikelcode ? `(artikelcode ${a.leverancierArtikelcode})` : "",
        a.eenheid ? `per ${a.eenheid}` : "",
        `FPS betaalt hiervoor nu ${a.valuta} ${a.prijs}${a.eenheid ? ` per ${a.eenheid}` : ""}${a.exclBtw ? " (excl. btw)" : ""}`,
        rij.leverancierNaam ? `bij ${rij.leverancierNaam}` : "",
        ".",
      ];
      return delen.filter(Boolean).join(" ");
    }
    // Onderwerp is een prijsafspraak, maar die bestaat niet (meer): zet het
    // onderzoek netjes op 'fout' i.p.v. stil terug te vallen op de vrije vraag.
    throw new Error(
      "De gekoppelde prijsafspraak bestaat niet meer (verwijderd of teruggedraaid). Start de marktspiegel opnieuw vanaf een bestaande prijsafspraak.",
    );
  }

  if (onderzoek.onderwerpType === "financieel_contract" && onderzoek.onderwerpId != null) {
    const [c] = await db
      .select()
      .from(financieleContractenTable)
      .where(eq(financieleContractenTable.id, onderzoek.onderwerpId))
      .limit(1);
    if (c) {
      const periodeTekst = c.kostenBedrag != null
        ? `FPS betaalt nu € ${c.kostenBedrag} per ${c.kostenPeriode}`
        : "";
      const delen = [
        `Wat vragen andere aanbieders in Nederland voor een vergelijkbaar ${c.categorie}-contract: ${c.naam}`,
        c.leverancier ? `(nu bij ${c.leverancier})` : "",
        periodeTekst,
        ".",
      ];
      return delen.filter(Boolean).join(" ");
    }
  }

  // Val terug op de opgeslagen vrije vraag als het onderwerp niet gevonden werd.
  return onderzoek.vraag;
}

// Filtert het ruwe AI-JSON tot een schoon, regelvast resultaat.
function filterResultaat(ruw: unknown): MarktspiegelResultaat {
  const obj = (ruw && typeof ruw === "object" ? ruw : {}) as Record<string, unknown>;
  const ruweVergelijkingen = Array.isArray(obj.vergelijkingen) ? obj.vergelijkingen : [];
  const vandaag = new Date().toISOString().slice(0, 10);

  const vergelijkingen: MarktspiegelVergelijking[] = [];
  for (const item of ruweVergelijkingen) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    const url = typeof v.vindplaats_url === "string" ? v.vindplaats_url.trim() : "";
    // HARDE REGEL 1: geen bron-URL → weggooien (nooit geschat/geïnterpoleerd).
    if (!/^https?:\/\//i.test(url)) continue;
    const aanbieder = typeof v.aanbieder === "string" ? v.aanbieder.trim() : "";
    // indicatie_prijs: nooit meer dan een korte prijsaanduiding. Strip
    // newlines (geen meerregelige uitweidingen) en beperk tot ~60 tekens,
    // zodat de AI hier geen verhaal in kwijt kan.
    const indicatie = typeof v.indicatie_prijs === "string"
      ? v.indicatie_prijs.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60)
      : "";
    if (!aanbieder || !indicatie) continue;
    vergelijkingen.push({
      aanbieder,
      indicatie_prijs: indicatie,
      eenheid: typeof v.eenheid === "string" && v.eenheid.trim() ? v.eenheid.trim() : null,
      vindplaats_url: url,
      // gevonden_op NOOIT van de AI overnemen: de run ís vandaag, dus is de
      // vindplaats vandaag gezien. Anders kan de AI een oude/onjuiste datum
      // opgeven die een vindplaats vers laat lijken.
      gevonden_op: vandaag,
      toelichting: typeof v.toelichting === "string" && v.toelichting.trim() ? v.toelichting.trim() : null,
    });
  }

  // Samenvatting: nooit een wisseladvies (§9). Neutraliseer en voeg de vaste zin toe.
  let samenvatting = typeof obj.samenvatting === "string" ? obj.samenvatting.trim() : "";
  if (!samenvatting) {
    samenvatting = vergelijkingen.length > 0
      ? "Hierboven staat wat FPS betaalt naast wat de markt vraagt."
      : "Er zijn geen vergelijkbare marktprijzen met een controleerbare bron gevonden. Wat niet te vinden was, blijft leeg.";
  }
  if (bevatWisseladvies(samenvatting)) {
    samenvatting = neutraliseerWisseladvies(samenvatting);
  }
  if (!samenvatting.includes("weten, niet wisselen")) {
    samenvatting = `${samenvatting} ${VASTE_ZIN}`.trim();
  }

  return { vergelijkingen, samenvatting };
}

export async function voerMarktspiegelUit(onderzoekId: number): Promise<void> {
  const [onderzoek] = await db
    .select()
    .from(marktspiegelOnderzoekenTable)
    .where(eq(marktspiegelOnderzoekenTable.id, onderzoekId))
    .limit(1);
  if (!onderzoek) {
    logger.warn({ onderzoekId }, "marktspiegel: onderzoek niet gevonden");
    return;
  }

  try {
    if (!heeftGateway()) {
      throw new Error("AI-gateway niet geconfigureerd");
    }

    const zoekvraag = await bouwZoekvraag(onderzoek);

    const resultaat = await aiGateway.responses(
      "default",
      {
        // Let op: web_search_preview kan NIET samen met JSON-mode
        // ("Web Search cannot be used with JSON mode") — daarom geen
        // text.format hier; het JSON wordt hieronder uit de tekst geknipt.
        tools: [{ type: "web_search_preview" }],
        input: `${MARKTSPIEGEL_PROMPT.tekst}\n\n${zoekvraag}`,
      },
      undefined,
      {
        module: "marktspiegel",
        functie: "voerMarktspiegelUit",
        gebruikerId: onderzoek.aangevraagdDoor,
        entiteitstype: "marktspiegel_onderzoek",
        entiteitId: onderzoek.id,
        promptNaam: MARKTSPIEGEL_PROMPT.naam,
        promptVersie: MARKTSPIEGEL_PROMPT.versie,
      },
    );

    if (!resultaat.ok) {
      throw new Error(resultaat.fout);
    }

    // Zonder JSON-mode kan het antwoord in een ```json-blok of tussen
    // lopende tekst staan: knip het eerste {...}-blok eruit.
    let ruw: unknown = {};
    const tekst = resultaat.inhoud.trim();
    const start = tekst.indexOf("{");
    const eind = tekst.lastIndexOf("}");
    if (start === -1 || eind <= start) {
      throw new Error("De AI gaf geen leesbaar JSON-antwoord terug.");
    }
    try {
      ruw = JSON.parse(tekst.slice(start, eind + 1));
    } catch {
      throw new Error("De AI gaf geen leesbaar JSON-antwoord terug.");
    }

    const gefilterd = filterResultaat(ruw);

    await db
      .update(marktspiegelOnderzoekenTable)
      .set({ status: "klaar", resultaat: gefilterd, fout: null, klaarOp: new Date() })
      // Alleen afronden als het onderzoek nog "bezig" is: een time-out (30 min,
      // gezet door de lijstroute) is terminaal en mag niet herrijzen.
      .where(and(eq(marktspiegelOnderzoekenTable.id, onderzoekId), eq(marktspiegelOnderzoekenTable.status, "bezig")));
  } catch (err) {
    const bericht = err instanceof Error ? err.message : "Onbekende fout";
    logger.error({ err, onderzoekId }, "marktspiegel uitvoeren mislukt");
    await db
      .update(marktspiegelOnderzoekenTable)
      .set({ status: "fout", fout: bericht.slice(0, 500), klaarOp: new Date() })
      .where(and(eq(marktspiegelOnderzoekenTable.id, onderzoekId), eq(marktspiegelOnderzoekenTable.status, "bezig")))
      .catch(() => undefined);
  }
}

// Start een onderzoek asynchroon (fire-and-forget). De route roept dit aan na
// het aanmaken van de rij; de HTTP-respons wacht niet op de AI.
export function startMarktspiegelAsync(onderzoekId: number): void {
  void voerMarktspiegelUit(onderzoekId).catch((err) => {
    logger.error({ err, onderzoekId }, "marktspiegel async-start mislukt");
  });
}

// Hulp: bestaat er een prijsafspraak met dit id (niet-teruggedraaid)?
export async function prijsafspraakBestaat(id: number): Promise<boolean> {
  const [rij] = await db
    .select({ id: prijsafsprakenTable.id })
    .from(prijsafsprakenTable)
    .where(and(eq(prijsafsprakenTable.id, id), isNull(prijsafsprakenTable.teruggedraaidOp)))
    .limit(1);
  return !!rij;
}

// Hulp: bestaat er een financieel contract met dit id?
export async function financieelContractBestaat(id: number): Promise<boolean> {
  const [rij] = await db
    .select({ id: financieleContractenTable.id })
    .from(financieleContractenTable)
    .where(eq(financieleContractenTable.id, id))
    .limit(1);
  return !!rij;
}
