import { Router } from "express";
import { db } from "@workspace/db";
import { crmKlantenTable, gebouwenTable, leveranciersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { aiGateway, heeftGateway } from "../lib/aiGateway";
import { AI_INVULLEN_PROMPT, CRM_CONCURRENT_PROFIEL_PROMPT } from "../lib/aiPrompts";

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

export function saneerInvulVelden(
  formulierType: string,
  invoer: unknown,
): Record<string, string | null> {
  if (!invoer || typeof invoer !== "object" || Array.isArray(invoer)) return {};
  const toegestaneVelden = FORMULIER_VELDBESCHRIJVINGEN[formulierType];
  if (!toegestaneVelden) return {};
  const resultaat: Record<string, string | null> = {};
  for (const [sleutel, waarde] of Object.entries(invoer as Record<string, unknown>)) {
    if (!(sleutel in toegestaneVelden)) continue;
    if (waarde === null) {
      resultaat[sleutel] = null;
    } else if (typeof waarde === "string") {
      resultaat[sleutel] = waarde.slice(0, 1000);
    } else if (typeof waarde === "number" || typeof waarde === "boolean") {
      resultaat[sleutel] = String(waarde).slice(0, 1000);
    }
  }
  return resultaat;
}

export const INVUL_MODULE_PER_FORMULIER: Readonly<Record<string, string>> = {
  crm_organisatie: "crm",
  crm_contactpersoon: "crm",
  gebouw: "gebouwen",
  leverancier: "inkoop",
  werkmaatschappij: "organisatie",
  concurrent: "crm",
  wagenpark_voertuig: "wagenpark",
  medewerker: "personeel",
  magazijn_artikel: "magazijn",
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

// ── Autorisatiehulp voor /ai/invullen context_id ─────────────────────────────
// Controleert of de effectieve gebruiker de entiteit achter context_id mag zien,
// overeenkomstig de gewone module+objectscoping (zelfde regels als de
// respectieve lijstroutes). Fail-closed: twijfel = geweigerd.
async function magContextIdZien(
  formulierType: string,
  contextId: number,
  req: import("express").Request,
): Promise<boolean> {
  const permissies = req.permissies;
  if (!permissies) return false;
  if (permissies.isHoofdbeheerder) return true;

  try {
    if (formulierType === "crm_organisatie" || formulierType === "crm_contactpersoon") {
      // CRM: iedereen met CRM-leesrecht mag organisatiedata inzien (niet per-object)
      return permissies.heeftModuleRecht("crm", 1);
    }
    if (formulierType === "gebouw") {
      // Gebouw: gebouwtoewijzing verplicht
      return permissies.heeftModuleRecht("gebouwen", 1) && permissies.magBijGebouw(contextId);
    }
    if (formulierType === "leverancier") {
      return permissies.heeftModuleRecht("inkoop", 1);
    }
    if (formulierType === "werkmaatschappij") {
      return permissies.isHoofdbeheerder;
    }
    if (formulierType === "concurrent") {
      return permissies.heeftModuleRecht("crm", 1);
    }
    if (formulierType === "wagenpark_voertuig") {
      return permissies.heeftModuleRecht("wagenpark", 1);
    }
    if (formulierType === "medewerker") {
      return permissies.heeftModuleRecht("personeel", 1);
    }
    if (formulierType === "magazijn_artikel") {
      return permissies.heeftModuleRecht("magazijn", 1);
    }
    // Onbekend formuliertype — context_id niet toegestaan
    return false;
  } catch {
    return false;
  }
}

// ── POST /ai/invullen ─────────────────────────────────────────────────────────

router.post("/ai/invullen", requireAuth, async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const formulier_type = typeof body.formulier_type === "string" ? body.formulier_type.trim() : null;
  const raw_context_id = body.context_id;
  const raw_velden = body.huidige_velden;

  if (!formulier_type || !FORMULIER_VELDBESCHRIJVINGEN[formulier_type]) {
    return void res.status(400).json({ error: "Ongeldig formulier_type" });
  }

  // Ook zonder context_id geldt altijd dezelfde modulepoort als op het gewone
  // scherm. Clientvelden of promptinstructies zijn nooit een autorisatiegrens.
  const invulModule = INVUL_MODULE_PER_FORMULIER[formulier_type];
  if (!invulModule || !req.permissies?.heeftModuleRecht(invulModule, 1)) {
    return void res.status(403).json({ error: "Geen toegang" });
  }
  if (!heeftGateway()) return void res.status(503).json({ error: "AI niet geconfigureerd" });

  // context_id moet een positief integer zijn of null
  const context_id: number | null = (() => {
    if (raw_context_id == null) return null;
    const n = Number(raw_context_id);
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
  })();

  // Autoriseer de context_id: de effectieve gebruiker moet het object mogen zien.
  // Fail-closed: als de check mislukt, sturen we geen context naar de AI.
  const effectiefContextId: number | null = (() => {
    if (context_id == null) return null;
    return context_id;
  })();
  if (effectiefContextId !== null) {
    const magZien = await magContextIdZien(formulier_type, effectiefContextId, req);
    if (!magZien) {
      // Weiger — onthul niet eens dat het object bestaat (outside-permission)
      return void res.status(403).json({ error: "Geen toegang" });
    }
  }

  // huidige_velden: alleen plain object met string-sleutels en string-waarden;
  // maximaal 50 velden, elke waarde maximaal 500 tekens
  const huidige_velden: Record<string, string> = (() => {
    if (!raw_velden || typeof raw_velden !== "object" || Array.isArray(raw_velden)) return {};
    const result: Record<string, string> = {};
    let teller = 0;
    for (const [k, v] of Object.entries(raw_velden as Record<string, unknown>)) {
      if (teller >= 50) break;
      if (typeof k !== "string" || typeof v !== "string") continue;
      // Alleen velden die voorkomen in de velddefinitie van dit formuliertype
      const veldenDef = FORMULIER_VELDBESCHRIJVINGEN[formulier_type];
      if (veldenDef && !(k in veldenDef) && k !== "naam" && k !== "organisatie_naam") continue;
      result[k] = v.slice(0, 500);
      teller++;
    }
    return result;
  })();

  const veldenDef = FORMULIER_VELDBESCHRIJVINGEN[formulier_type];
  const veldenLijst = Object.entries(veldenDef)
    .map(([k, omschr]) => `  "${k}": ${omschr}`)
    .join("\n");

  const internContext  = await laadInternContext(formulier_type, effectiefContextId, huidige_velden);
  const zoektekst      = bouwZoektekst(formulier_type, huidige_velden);

  const huidigGevuld = Object.entries(huidige_velden)
    .filter(([, v]) => v?.trim())
    .map(([k, v]) => `${k}="${v}"`)
    .join(", ");

  const systeemPrompt = AI_INVULLEN_PROMPT.tekst.replace("{velden}", veldenLijst);

  const gebruikerPrompt = [
    `Zoek gegevens voor: ${zoektekst}`,
    internContext    ? `Bekende interne data: ${internContext}` : "",
    huidigGevuld     ? `Al ingevuld (niet overschrijven tenzij aantoonbaar fout): ${huidigGevuld}` : "",
    "Dit is een Nederlands bedrijf of persoon.",
  ].filter(Boolean).join("\n");

  // Probeer Responses API met live web search
  const webResultaatInvullen = await aiGateway.responses("default", {
    tools: [{ type: "web_search_preview" }],
    input: `${systeemPrompt}\n\n${gebruikerPrompt}`,
    text: { format: { type: "json_object" } },
  }, undefined, {
    module: "ai",
    functie: "invullen",
    promptNaam: AI_INVULLEN_PROMPT.naam,
    promptVersie: AI_INVULLEN_PROMPT.versie,
  });
  if (webResultaatInvullen.ok) {
    let data: Record<string, string | null> = {};
    try { data = saneerInvulVelden(formulier_type, JSON.parse(webResultaatInvullen.inhoud)); } catch { data = {}; }
    return void res.json({ velden: data });
  }
  req.log.warn({ fout: webResultaatInvullen.fout }, "Web search niet beschikbaar voor ai/invullen, fallback naar kennismodel");

  // Fallback: chat completions
  try {
    const aiInvulResultaat = await aiGateway.chat("default", {
      max_tokens: 800,
      messages: [
        { role: "system", content: systeemPrompt },
        { role: "user",   content: gebruikerPrompt },
      ],
      response_format: { type: "json_object" },
    }, undefined, {
      module: "ai",
      functie: "invullen",
      promptNaam: AI_INVULLEN_PROMPT.naam,
      promptVersie: AI_INVULLEN_PROMPT.versie,
    });
    let data: Record<string, string | null> = {};
    try {
      data = saneerInvulVelden(
        formulier_type,
        JSON.parse(aiInvulResultaat.ok ? aiInvulResultaat.inhoud : "{}"),
      );
    } catch { data = {}; }
    res.json({ velden: data });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "AI-verzoek mislukt" });
  }
});

// ── POST /ai/veld-correctie — generieke leerlus (AI_01 vervolg 17-08-2026) ────
//
// Centrale vastlegging van "AI-voorstel vs. wat de gebruiker ervan maakte" voor
// alle schermen die geen eigen correctie-route hebben. Zelfde tabel en semantiek
// als bedrijfsdocumenten/calculatie: ai_voorstel == gekozen betekent overgenomen,
// afwijkend betekent gecorrigeerd. Whitelist op veld-prefix (per scherm) zodat
// er geen vrije tekst als veldnaam in de leerbron terechtkomt.
import { aiVeldCorrectiesTable } from "@workspace/db";

const AI_CORRECTIE_PREFIXES = [
  // Centrale AI-invullen-knop (formulieren)
  "formulier.crm_organisatie", "formulier.crm_contactpersoon", "formulier.gebouw",
  "formulier.leverancier", "formulier.werkmaatschappij", "formulier.concurrent",
  "formulier.wagenpark_voertuig", "formulier.medewerker", "formulier.magazijn_artikel",
  // Spot-AI (plattegrond web + monteur-app)
  "spot",
  // Overige schermen met een concreet AI-voorstel dat wordt overgenomen/aangepast
  "gereedschap", "incident", "hrm_voorstel", "tekening", "projectsamenvatting",
  "offerte_email", "scab_mail", "toolbox", "pim", "studio_huisstijl", "financieel_contract",
] as const;

const CORRECTIE_MODULE_PER_PREFIX: Record<(typeof AI_CORRECTIE_PREFIXES)[number], string> = {
  "formulier.crm_organisatie": "crm",
  "formulier.crm_contactpersoon": "crm",
  "formulier.gebouw": "gebouwen",
  "formulier.leverancier": "inkoop",
  "formulier.werkmaatschappij": "organisatie",
  "formulier.concurrent": "crm",
  "formulier.wagenpark_voertuig": "wagenpark",
  "formulier.medewerker": "personeel",
  "formulier.magazijn_artikel": "magazijn",
  spot: "voorzieningen",
  gereedschap: "gereedschappen",
  incident: "veiligheid",
  hrm_voorstel: "personeel",
  tekening: "gebouwen",
  projectsamenvatting: "projecten",
  offerte_email: "offertes",
  scab_mail: "scab_mail",
  toolbox: "toolbox",
  pim: "opdrachten",
  studio_huisstijl: "organisatie",
  financieel_contract: "financieel",
};

const VELD_SUFFIX_RE = /^[a-z0-9_]+$/;

// Eenvoudige in-memory rate-limiter per gebruiker (review-bevinding: de route
// is bewust breed toegankelijk, dus begrens misbruik/vergiftiging in volume).
// 120 correcties per uur is ruim boven normaal gebruik (een formulier logt er
// hooguit ~10 per opslag).
const CORRECTIE_LIMIET_PER_UUR = 120;
const correctieTellers = new Map<number, { vanaf: number; n: number }>();

function correctieToegestaan(gebruikerId: number): boolean {
  const nu = Date.now();
  const t = correctieTellers.get(gebruikerId);
  if (!t || nu - t.vanaf > 60 * 60 * 1000) {
    correctieTellers.set(gebruikerId, { vanaf: nu, n: 1 });
    return true;
  }
  t.n += 1;
  return t.n <= CORRECTIE_LIMIET_PER_UUR;
}

export function moduleVoorCorrectieVeld(veldNaam: string): string | null {
  for (const prefix of AI_CORRECTIE_PREFIXES) {
    if (veldNaam.startsWith(prefix + ".")) {
      return VELD_SUFFIX_RE.test(veldNaam.slice(prefix.length + 1))
        ? CORRECTIE_MODULE_PER_PREFIX[prefix]
        : null;
    }
  }
  return null;
}

router.post("/ai/veld-correctie", requireAuth, async (req, res): Promise<void> => {
  try {
    const { veld_naam, ai_voorstel, gekozen, hash, tekst_fragment } = req.body as Record<string, unknown>;
    if (!veld_naam || ai_voorstel === undefined || ai_voorstel === null || gekozen === undefined || gekozen === null) {
      return void res.status(400).json({ error: "veld_naam, ai_voorstel en gekozen zijn verplicht" });
    }
    const module = moduleVoorCorrectieVeld(String(veld_naam));
    if (!module) {
      return void res.status(400).json({ error: "Ongeldig veld" });
    }
    if (!req.permissies?.heeftModuleRecht(module, 1)) {
      return void res.status(403).json({ error: "Geen toegang" });
    }
    const gebruikerId = req.permissies.userId;
    if (gebruikerId !== null && !correctieToegestaan(gebruikerId)) {
      return void res.status(429).json({ error: "Te veel correcties; probeer het later opnieuw" });
    }
    await db.insert(aiVeldCorrectiesTable).values({
      gebruikerId,
      hash: hash ? String(hash).slice(0, 64) : null,
      tekstFragment: tekst_fragment ? String(tekst_fragment).slice(0, 500) : null,
      veldNaam: String(veld_naam),
      aiVoorstel: String(ai_voorstel).slice(0, 4000),
      gekozen: String(gekozen).slice(0, 4000),
    });
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
