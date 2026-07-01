import { Router } from "express";
import { db } from "@workspace/db";
import { crmKlantenTable, gebouwenTable, leveranciersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { heeftOpenAi, maakOpenAiClient } from "../lib/openai";

const router = Router();

// ── Veldbeschrijvingen per formuliertype ──────────────────────────────────────

const FORMULIER_VELDBESCHRIJVINGEN: Record<string, Record<string, string>> = {
  crm_organisatie: {
    adres:    "Straat en huisnummer",
    postcode: "Postcode (formaat 1234 AB)",
    stad:     "Plaatsnaam",
    regio:    "Regio of provincie",
    telefoon: "Telefoonnummer",
    email:    "Algemeen e-mailadres",
    website:  "Website URL (volledig, inclusief https://)",
    branche:  "Branche of sector",
    kvk:      "KVK-nummer (8 cijfers)",
    btw:      "BTW-nummer (formaat NL999999999B01)",
    org_type: "Type organisatie (Woningcorporatie, VvE Beheerder, Aannemer, Installateur, Vastgoedbeheerder, Adviseur, Gemeente, Zorginstelling, Onderwijsinstelling, of Overig)",
  },
  crm_contactpersoon: {
    email:    "Zakelijk e-mailadres",
    telefoon: "Direct telefoonnummer",
    mobiel:   "Mobiel nummer",
    functie:  "Functietitel",
    afdeling: "Afdeling of team",
  },
  gebouw: {
    bouwjaar:    "Bouwjaar (getal, bijv. 1985)",
    gebouw_type: "Gebouwtype (bijv. wooncomplex, kantoorgebouw, zorginstelling)",
    eigenaar:    "Eigenaar of beheerder van het gebouw",
    oppervlakte: "Bruto vloeroppervlak in m² (getal)",
    omschrijving:"Korte omschrijving van het gebouw (1-2 zinnen)",
    postcode:    "Postcode (formaat 1234 AB)",
    stad:        "Plaatsnaam",
  },
  leverancier: {
    kvk:      "KVK-nummer (8 cijfers)",
    btw:      "BTW-nummer (formaat NL999999999B01)",
    adres:    "Straat en huisnummer",
    postcode: "Postcode (formaat 1234 AB)",
    stad:     "Plaatsnaam",
    telefoon: "Telefoonnummer",
    email:    "E-mailadres",
    website:  "Website URL",
    iban:     "IBAN-bankrekeningnummer",
  },
  werkmaatschappij: {
    kvk:      "KVK-nummer (8 cijfers)",
    btw:      "BTW-nummer (formaat NL999999999B01)",
    adres:    "Straat en huisnummer",
    postcode: "Postcode (formaat 1234 AB)",
    stad:     "Plaatsnaam",
    telefoon: "Telefoonnummer",
    email:    "E-mailadres",
    website:  "Website URL",
  },
  concurrent: {
    website:              "Website URL",
    regio:                "Werkgebied of regio in Nederland",
    bekende_klanten:      "Bekende klanten (kommalijst)",
    bekende_projecttypes: "Soorten projecten die zij uitvoeren",
    sterke_punten:        "Sterke punten t.o.v. FPS",
    zwakke_punten:        "Zwakke punten of beperkingen",
    where_we_encounter:   "Waar we ze tegenkomen (aanbestedingen, projecten, beurzen)",
  },
  wagenpark_voertuig: {
    merk:         "Automerk",
    voertuig_type:"Type of model",
    bouwjaar:     "Bouwjaar",
    brandstof:    "Brandstoftype (diesel, benzine, elektrisch, hybride)",
    kleur:        "Kleur",
    laadvermogen: "Laadvermogen in kg",
  },
  medewerker: {
    email:               "Zakelijk e-mailadres",
    telefoon:            "Telefoonnummer",
    functie_omschrijving:"Korte functiebeschrijving (1 zin)",
  },
  magazijn_artikel: {
    omschrijving:    "Artikelomschrijving",
    eenheid:         "Eenheid (stuk, meter, liter, etc.)",
    leverancier_naam:"Naam van de leverancier",
    catalogusprijs:  "Richtprijs excl. BTW in euro (getal)",
    artikel_nummer:  "Artikelnummer bij de leverancier",
  },
};

// ── Interne DB-context laden ──────────────────────────────────────────────────

async function laadInternContext(
  formulierType: string,
  contextId: number | null,
  huidigVelden: Record<string, string>,
): Promise<string> {
  if (!contextId) return "";
  try {
    if (formulierType === "crm_organisatie") {
      const [klant] = await db.select().from(crmKlantenTable).where(eq(crmKlantenTable.id, contextId)).limit(1);
      if (klant) return `Bestaande organisatiedata: naam="${klant.naam}", stad="${(klant as any).stad ?? ""}", website="${(klant as any).website ?? ""}", branche="${(klant as any).branche ?? ""}"`;
    }
    if (formulierType === "crm_contactpersoon") {
      const [klant] = await db.select().from(crmKlantenTable).where(eq(crmKlantenTable.id, contextId)).limit(1);
      if (klant) return `Organisatie van de contactpersoon: naam="${klant.naam}", website="${(klant as any).website ?? ""}", stad="${(klant as any).stad ?? ""}"`;
    }
    if (formulierType === "gebouw") {
      const [geb] = await db.select().from(gebouwenTable).where(eq(gebouwenTable.id, contextId)).limit(1);
      if (geb) return `Gebouwdata: naam="${geb.naam}", adres="${geb.adres ?? ""}", stad="${(geb as any).stad ?? ""}"`;
    }
    if (formulierType === "leverancier") {
      const [lev] = await db.select().from(leveranciersTable).where(eq(leveranciersTable.id, contextId)).limit(1);
      if (lev) return `Leverancierdata: naam="${lev.naam}", stad="${(lev as any).stad ?? ""}"`;
    }
  } catch {
    // val terug zonder context
  }
  return "";
}

// ── Zoektekst afleiden uit huidige velden ────────────────────────────────────

function bouwZoektekst(formulierType: string, huidigVelden: Record<string, string>): string {
  const v = huidigVelden;
  switch (formulierType) {
    case "crm_organisatie":
    case "leverancier":
    case "werkmaatschappij":
    case "concurrent":
      return v.naam ?? "";
    case "crm_contactpersoon":
      return [v.naam, v.organisatie_naam].filter(Boolean).join(" bij ");
    case "gebouw":
      return [v.naam, v.adres, v.postcode, v.stad].filter(Boolean).join(", ");
    case "wagenpark_voertuig":
      return v.kenteken ? `kenteken ${v.kenteken} RDW Nederland` : (v.naam ?? "");
    case "medewerker":
      return [v.naam, v.organisatie].filter(Boolean).join(" ");
    case "magazijn_artikel":
      return [v.naam, v.leverancier_naam].filter(Boolean).join(" bij ");
    default:
      return v.naam ?? "";
  }
}

// ── POST /ai/invullen ─────────────────────────────────────────────────────────

router.post("/ai/invullen", requireAuth, async (req, res) => {
  if (!heeftOpenAi()) return res.status(503).json({ error: "AI niet geconfigureerd" });

  const {
    formulier_type,
    context_id = null,
    huidige_velden = {},
  } = req.body as {
    formulier_type: string;
    context_id?: number | null;
    huidige_velden?: Record<string, string>;
  };

  if (!formulier_type || !FORMULIER_VELDBESCHRIJVINGEN[formulier_type]) {
    return res.status(400).json({ error: "Ongeldig formulier_type" });
  }

  const veldenDef = FORMULIER_VELDBESCHRIJVINGEN[formulier_type];
  const veldenLijst = Object.entries(veldenDef)
    .map(([k, omschr]) => `  "${k}": ${omschr}`)
    .join("\n");

  const internContext  = await laadInternContext(formulier_type, context_id, huidige_velden);
  const zoektekst      = bouwZoektekst(formulier_type, huidige_velden);

  const huidigGevuld = Object.entries(huidige_velden)
    .filter(([, v]) => v?.trim())
    .map(([k, v]) => `${k}="${v}"`)
    .join(", ");

  const systeemPrompt =
    "Je bent een Nederlandse data-assistent die bedrijfs- en contactgegevens opzoekt op internet. " +
    "Zoek naar de meest actuele informatie. " +
    `Geef een JSON-object terug met exact de volgende velden (stel een veld in op null als het nergens te vinden is — verzin niets):\n${veldenLijst}`;

  const gebruikerPrompt = [
    `Zoek gegevens voor: ${zoektekst}`,
    internContext    ? `Bekende interne data: ${internContext}` : "",
    huidigGevuld     ? `Al ingevuld (niet overschrijven tenzij aantoonbaar fout): ${huidigGevuld}` : "",
    "Dit is een Nederlands bedrijf of persoon.",
  ].filter(Boolean).join("\n");

  const client = maakOpenAiClient();

  // Probeer Responses API met live web search
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const webResp = await (client as any).responses.create({
      model: "gpt-4o",
      tools: [{ type: "web_search_preview" }],
      input: `${systeemPrompt}\n\n${gebruikerPrompt}`,
      text: { format: { type: "json_object" } },
    });
    let data: Record<string, string | null> = {};
    try { data = JSON.parse(webResp.output_text ?? "{}") as Record<string, string | null>; } catch { data = {}; }
    return res.json({ velden: data });
  } catch (webErr) {
    req.log.warn({ err: webErr }, "Web search niet beschikbaar voor ai/invullen, fallback naar kennismodel");
  }

  // Fallback: chat completions
  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 800,
      messages: [
        { role: "system", content: systeemPrompt },
        { role: "user",   content: gebruikerPrompt },
      ],
      response_format: { type: "json_object" },
    });
    let data: Record<string, string | null> = {};
    try { data = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as Record<string, string | null>; } catch { data = {}; }
    res.json({ velden: data });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "AI-verzoek mislukt" });
  }
});

export default router;
