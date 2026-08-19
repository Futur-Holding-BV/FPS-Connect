// Bedrijfsadviseur — AI-assistent ingebouwd in FPS Connect.
// Antwoordt op vragen over Connect, wetgeving, CAO's, FPS en personeel.
// Toegang is beperkt tot informatie die de ingelogde gebruiker mag zien:
// de bevoegdhedenmatrix van de gebruiker wordt meegegeven aan de AI zodat
// hij weigert te antwoorden op vragen buiten het toegestane bereik.
import { Router } from "express";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "@workspace/db";
import {
  gebruikersTable, offertesTable, facturenTable, opdrachtenTable,
  gebouwenTable, werkbakItemsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { aiGateway, heeftGateway, AI_LIMIET_MELDING_DAGPLAFOND, AI_LIMIET_MELDING_GEBRUIKER } from "../lib/aiGateway";
import type { AiContextBron } from "../lib/aiGateway";
import { bouwContextBundel } from "../lib/aiContext";
import type { ContextEntiteitType } from "../lib/aiContext";
import { berekenEffectieveBevoegdheden } from "../lib/effectieve-bevoegdheden";

// ASSISTENT_01 fase 2 — objecttypen waarvoor de contextmotor gegevens mag
// ophalen. De autorisatie zit in de gegevensvraag zelf (magKnoopZien via
// PermissieService), niet in de prompt.
const CONTEXT_TYPES: readonly ContextEntiteitType[] = [
  "gebouw", "voorziening", "offerte", "medewerker", "document", "dossier", "onderhoud", "klant",
];

// ── ASSISTENT_01 §5.1 — onderhouden Connect-kennis uit de repo ───────────────
// docs/connect-kennis.md is de bron van waarheid; hier alleen inlezen (cache
// 5 min zodat een deploy/bestandswijziging snel doorwerkt zonder herstart).
let kennisCache: { tekst: string; tot: number } | null = null;
function leesConnectKennis(): string {
  if (kennisCache && Date.now() < kennisCache.tot) return kennisCache.tekst;
  let tekst = "";
  const kandidaten = [
    join(process.cwd(), "docs", "connect-kennis.md"),
    join(process.cwd(), "..", "..", "docs", "connect-kennis.md"),
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "docs", "connect-kennis.md"),
  ];
  for (const pad of kandidaten) {
    try { tekst = readFileSync(pad, "utf8"); break; } catch { /* volgende kandidaat */ }
  }
  kennisCache = { tekst, tot: Date.now() + 5 * 60_000 };
  return tekst;
}

// ── ASSISTENT_01 §5.2 — gegevensvragen (alleen-lezen, rechten in de query) ──
// Elke uitvoerder controleert het modulerecht van de vragende gebruiker vóór
// er ook maar één rij wordt gelezen. Geen recht → expliciete weigering die de
// AI letterlijk moet doorgeven. Elk resultaat draagt bron + peildatum zodat
// getallen altijd herkomst hebben.
interface ToolScope {
  heeftModuleRecht(module: string, minNiveau: number): boolean;
  magBijGebouw(gebouwId: number | null): boolean;
  isHoofdbeheerder: boolean;
  userId: number;
}

const GEEN_RECHT = (module: string) => ({
  geweigerd: true,
  reden: `De vragende gebruiker heeft geen leesrecht op de module ${module}. Meld dat je deze gegevens niet voor deze gebruiker mag opvragen; geef ook geen samenvatting of schatting.`,
});

const DATA_TOOLS: Array<{
  definitie: { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };
  uitvoer: (scope: ToolScope) => Promise<unknown>;
}> = [
  {
    definitie: { type: "function", function: {
      name: "tel_offertes",
      description: "Aantal offertes per status (concept, verzonden, geaccepteerd, afgewezen, …). Vereist leesrecht op module offertes.",
      parameters: { type: "object", properties: {} },
    } },
    uitvoer: async (scope) => {
      if (!scope.heeftModuleRecht("offertes", 1)) return GEEN_RECHT("offertes");
      // Gebouw-scoping: een gebouw-gescoopte gebruiker telt alleen offertes
      // van gebouwen waar hij bij mag (zelfde regel als de lijstweergave).
      const rijen = await db.select({ status: offertesTable.status, gebouwId: offertesTable.gebouwId }).from(offertesTable);
      const perStatus = new Map<string, number>();
      for (const r of rijen) {
        if (!scope.isHoofdbeheerder && !scope.magBijGebouw(r.gebouwId ?? null)) continue;
        perStatus.set(r.status, (perStatus.get(r.status) ?? 0) + 1);
      }
      return {
        bron: "offertes-tabel van FPS Connect (binnen de gebouwtoewijzing van de gebruiker)",
        peildatum: new Date().toISOString().slice(0, 10),
        per_status: [...perStatus.entries()].map(([status, aantal]) => ({ status, aantal })),
      };
    },
  },
  {
    definitie: { type: "function", function: {
      name: "tel_facturen",
      description: "Aantal inkoopfacturen per status in de factuurstroom. Vereist leesrecht op module financieel.",
      parameters: { type: "object", properties: {} },
    } },
    uitvoer: async (scope) => {
      if (!scope.heeftModuleRecht("financieel", 1)) return GEEN_RECHT("financieel");
      const rijen = await db.select({ status: facturenTable.status, aantal: sql<number>`count(*)::int` })
        .from(facturenTable).where(eq(facturenTable.type, "inkoop")).groupBy(facturenTable.status);
      return { bron: "facturen-tabel van FPS Connect (alleen inkoopfacturen)", peildatum: new Date().toISOString().slice(0, 10), per_status: rijen };
    },
  },
  {
    definitie: { type: "function", function: {
      name: "tel_opdrachten",
      description: "Aantal opdrachten per status. Vereist leesrecht op module opdrachten.",
      parameters: { type: "object", properties: {} },
    } },
    uitvoer: async (scope) => {
      if (!scope.heeftModuleRecht("opdrachten", 1)) return GEEN_RECHT("opdrachten");
      const rijen = await db.select({ status: opdrachtenTable.status, gebouwId: opdrachtenTable.gebouwId }).from(opdrachtenTable);
      const perStatus = new Map<string, number>();
      for (const r of rijen) {
        if (!scope.isHoofdbeheerder && !scope.magBijGebouw(r.gebouwId ?? null)) continue;
        perStatus.set(r.status, (perStatus.get(r.status) ?? 0) + 1);
      }
      return {
        bron: "opdrachten-tabel van FPS Connect (binnen de gebouwtoewijzing van de gebruiker)",
        peildatum: new Date().toISOString().slice(0, 10),
        per_status: [...perStatus.entries()].map(([status, aantal]) => ({ status, aantal })),
      };
    },
  },
  {
    definitie: { type: "function", function: {
      name: "tel_gebouwen",
      description: "Aantal gebouwen dat de vragende gebruiker mag zien. Vereist leesrecht op module gebouwen; gebouw-scoping wordt toegepast.",
      parameters: { type: "object", properties: {} },
    } },
    uitvoer: async (scope) => {
      if (!scope.heeftModuleRecht("gebouwen", 1)) return GEEN_RECHT("gebouwen");
      const rijen = await db.select({ id: gebouwenTable.id }).from(gebouwenTable);
      const zichtbaar = rijen.filter((r) => scope.magBijGebouw(r.id)).length;
      return { bron: "gebouwen-tabel van FPS Connect (gefilterd op gebouwtoewijzing van de gebruiker)", peildatum: new Date().toISOString().slice(0, 10), aantal_zichtbaar: zichtbaar };
    },
  },
  {
    definitie: { type: "function", function: {
      name: "mijn_werkbak",
      description: "Openstaande werkbak-items van de vragende gebruiker zelf (titel + soort). Altijd toegestaan voor medewerkers.",
      parameters: { type: "object", properties: {} },
    } },
    uitvoer: async (scope) => {
      const rijen = await db.select().from(werkbakItemsTable).where(eq(werkbakItemsTable.status, "open"));
      const zichtbaar = rijen.filter((i) => {
        if (scope.isHoofdbeheerder) return true;
        if (i.gebruikerId != null) return i.gebruikerId === scope.userId;
        if (i.alleenHoofdbeheerder) return false;
        if (i.vereisteModule) return scope.heeftModuleRecht(i.vereisteModule, i.vereistNiveau ?? 1);
        return false;
      });
      return {
        bron: "werkbak van FPS Connect (alleen items zichtbaar voor deze gebruiker)",
        peildatum: new Date().toISOString().slice(0, 10),
        aantal: zichtbaar.length,
        items: zichtbaar.slice(0, 15).map((i) => ({ soort: i.soort, titel: i.titel })),
      };
    },
  },
];

const router = Router();

const MODULE_LABELS: Record<string, string> = {
  gebouwen:           "Gebouwen & spots",
  voorzieningen:      "Voorzieningen",
  inspecties:         "Inspecties",
  onderhoud:          "Onderhoud & werkbonnen",
  gebruikers:         "Gebruikersbeheer",
  bibliotheek:        "Bibliotheek & documentstructuur",
  crm:                "CRM & relatiebeheer",
  personeel:          "HRM & Personeel",
  offertes:           "Offertes",
  dossiers:           "Dossiers",
  rapporten:          "Rapporten",
  financieel:         "Financieel",
  salarisarchief:     "Salarisarchief",
  salaris_mutaties:   "Salarismutaties",
  wagenpark:          "Wagenpark",
  magazijn:           "Magazijn",
  gereedschappen:     "Gereedschappen",
  toolbox:            "Toolbox",
  planning:           "Planning",
  calculatie:         "Calculatie",
  systeem:            "Systeembeheer",
  goedkeuring:        "Goedkeuringsmotor",
  opdrachten:         "Opdrachten & werkbegroting",
  inkoop:             "Inkoop",
  uren:               "Uren & weekstaten",
  veiligheid:         "Veiligheid",
  snagstream:         "SnagStream / Bibliotheek",
  werkvoorbereiding:  "Werkvoorbereiding",
};

const NIVEAU_OMSCHRIJVING: Record<number, string> = {
  0: "geen toegang",
  1: "lezen",
  2: "schrijven",
  3: "beheren",
  4: "volledig beheer",
};

function bouwSysteemPrompt(
  gebruikerNaam: string,
  rol: string,
  bevoegdheden: Record<string, number>,
): string {
  const isHoofdbeheerder = rol === "hoofdbeheerder";

  const toegankelijkeModules = Object.entries(bevoegdheden)
    .filter(([, niveau]) => niveau >= 1)
    .map(([mod, niveau]) => `- ${MODULE_LABELS[mod] ?? mod}: ${NIVEAU_OMSCHRIJVING[niveau] ?? niveau}`)
    .join("\n");

  const geblokkeerdeModules = isHoofdbeheerder
    ? "(geen — je bent hoofdbeheerder)"
    : Object.entries(MODULE_LABELS)
        .filter(([mod]) => !bevoegdheden[mod] || bevoegdheden[mod] === 0)
        .map(([, label]) => `- ${label}`)
        .join("\n") || "(geen geblokkeerde modules)";

  return `Je bent de FPS Bedrijfsadviseur — een interne assistent binnen FPS Connect, het digitale platform van FPS Brandpreventie.

**Jouw rol:**
Je helpt medewerkers van FPS Brandpreventie met vragen over:
- FPS Connect (hoe werkt het platform, welke functionaliteiten zijn beschikbaar, hoe sla ik iets op, wat betekent een status, etc.)
- Brandveiligheid en brandpreventieve voorzieningen (branddeur, doorvoering, brandklep, manchet, coating)
- Toepasselijke wetgeving: Bouwbesluit 2012, NEN-normen, WBDBO, gebruiksbesluit, brandveiligheidseisen
- CAO Metaal & Techniek en CAO Bouw & Infra: arbeidsduur, verlof, ADV, loon, toeslagen, onkostenregelingen
- HRM en personeelszaken: verlofrecht, ziekmeldingen, arbeidsrecht, onboarding, functiehuis
- Operationele vragen: offertes, werkbonnen, inspecties, rapportages, planning

**Kritieke veiligheidsbegrenzingen:**
De gebruiker die dit gesprek voert is: **${gebruikerNaam}** (rol: ${isHoofdbeheerder ? "hoofdbeheerder" : rol}).

${isHoofdbeheerder
  ? "Als hoofdbeheerder heeft deze gebruiker toegang tot alle modules en informatie binnen FPS Connect."
  : `Deze gebruiker heeft toegang tot de volgende modules:\n${toegankelijkeModules || "(geen modules toegewezen)"}

De volgende modules zijn NIET toegankelijk voor deze gebruiker:\n${geblokkeerdeModules}`}

**Strikte regel:** Geef NOOIT concrete personeelsgegevens, salarisgegevens, financiële detailcijfers of informatie uit modules die de gebruiker niet mag zien. Als iemand vraagt naar salarisinformatie van een collega, directiebeloning, vertrouwelijke financiële data of andere informatie buiten zijn toegangsniveau, weiger je beleefd maar stellig en leg je uit waarom je dat niet kunt verstrekken.

**Stijl:**
- Antwoord altijd in het Nederlands
- Bondig en praktisch — geen onnodige bladvulling
- Gebruik kopjes en opsommingen als dat de leesbaarheid verbetert
- Als je iets niet zeker weet, zeg dat dan eerlijk
- Verwijs bij complexe juridische vragen door naar de juiste afdeling of externe adviseur

**Gegevens opvragen (harde regels):**
- Voor vragen over wat er in het systeem staat gebruik je de beschikbare tools. Verzin NOOIT een getal: geen tool-resultaat = geen getal.
- Elk getal in je antwoord noemt de herkomst en de peildatum uit het tool-resultaat (bv. "7 openstaande offertes, volgens de offertes-tabel per vandaag").
- Krijgt een tool-aanroep een weigering terug (geweigerd: true), dan meld je letterlijk dat je dit niet voor deze gebruiker mag opvragen — geen samenvatting, geen omweg.
- Je verandert nooit iets. Wil de gebruiker iets wijzigen, verwijs dan naar de juiste plek in Connect.

**Hoe Connect werkt (onderhouden systeembeschrijving):**
${leesConnectKennis() || "(systeembeschrijving niet gevonden — beantwoord systeemvragen alleen op basis van wat je zeker weet en zeg erbij dat de beschrijving ontbreekt)"}

Vandaag is het: ${new Date().toLocaleDateString("nl-NL", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`;
}

router.post("/adviseur/vraag", requireAuth, async (req, res): Promise<void> => {
  if (!heeftGateway()) {
    return void res.status(503).json({ error: "AI niet beschikbaar" });
  }

  try {
    const userId = req.session.userId;
    if (!userId) return void res.status(401).json({ error: "Niet ingelogd" });

    const { vraag, geschiedenis, context } = req.body as {
      vraag: string;
      geschiedenis?: { rol: "user" | "assistant"; inhoud: string }[];
      context?: { scherm?: string; object_type?: string; object_id?: number };
    };

    if (!vraag || typeof vraag !== "string" || vraag.trim().length === 0) {
      return void res.status(400).json({ error: "vraag is verplicht" });
    }
    if (vraag.trim().length > 2000) {
      return void res.status(400).json({ error: "Vraag is te lang (max 2000 tekens)" });
    }

    const permissies = req.permissies;
    if (!permissies) return void res.status(403).json({ error: "Geen toegang" });
    const [gebruiker] = await db
      .select({ naam: gebruikersTable.naam, rol: gebruikersTable.rol })
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, permissies.userId));

    if (!gebruiker) return void res.status(404).json({ error: "Gebruiker niet gevonden" });

    const bevoegdheden = await berekenEffectieveBevoegdheden(permissies.userId);
    const systeemPrompt = bouwSysteemPrompt(gebruiker.naam, gebruiker.rol, bevoegdheden);

    // ── ASSISTENT_01 fase 2: paginacontext via de geautoriseerde contextmotor ─
    // De afscherming zit in de gegevensvraag (magKnoopZien op effectieve
    // permissies incl. "bekijken als"), niet in de prompt. Ziet de gebruiker
    // het object niet, dan krijgt de AI er ook niets van te zien.
    let contextTekst = "";
    const objectType = context?.object_type as ContextEntiteitType | undefined;
    const objectId = context?.object_id;
    if (
      objectType && CONTEXT_TYPES.includes(objectType) &&
      typeof objectId === "number" && Number.isInteger(objectId) && objectId > 0 &&
      permissies
    ) {
      try {
        const bundel = await bouwContextBundel({
          entiteitstype: objectType,
          entiteitId: objectId,
          scope: permissies,
          modelSlot: "default",
          maxDiepte: 1,
        });
        if (bundel.geautoriseerd && bundel.contextBronnen.length > 0) {
          const bronTekst = bundel.contextBronnen
            .map((b: AiContextBron) => JSON.stringify(b))
            .join("\n");
          contextTekst = `\n\n**Waar de gebruiker nu naar kijkt:** ${objectType} #${objectId}${context?.scherm ? ` (scherm: ${context.scherm})` : ""}.
Onderstaande systeemgegevens over dit object zijn opgehaald binnen de rechten van de gebruiker en mag je gebruiken om de vraag te beantwoorden. Noem bij elk getal of feit dat je hieruit haalt de herkomst ("volgens de gegevens van dit ${objectType}"). Staat iets er niet in, zeg dan dat je het niet kunt zien — verzin niets.\n${bronTekst}`;
        }
      } catch (err) {
        req.log.warn({ err, objectType, objectId }, "adviseur: paginacontext ophalen mislukt (vraag gaat door zonder context)");
      }
    } else if (context?.scherm) {
      contextTekst = `\n\n**Waar de gebruiker nu is:** het scherm "${String(context.scherm).slice(0, 300)}" in FPS Connect. Betrek dit bij je antwoord als de vraag over "dit scherm" of "hier" gaat.`;
    }

    const historieBeperkt = Array.isArray(geschiedenis)
      ? geschiedenis.slice(-10)
      : [];

    const berichtenVoorAi = [
      { role: "system" as const, content: systeemPrompt + contextTekst },
      ...historieBeperkt.map((b) => ({
        role: b.rol === "assistant" ? ("assistant" as const) : ("user" as const),
        content: b.inhoud,
      })),
      { role: "user" as const, content: vraag.trim() },
    ];

    // ── ASSISTENT_01 §5.2: tool-lus (max 3 rondes) — alleen-lezen tools,
    // rechten afgedwongen in de uitvoerder zelf, nooit in de prompt.
    const toolScope: ToolScope = permissies;
    const gesprek: Parameters<typeof aiGateway.chat>[1]["messages"] = [...berichtenVoorAi];
    let resultaat = await aiGateway.chat("default", {
      max_tokens: 1200,
      messages: gesprek,
      tools: DATA_TOOLS.map((t) => t.definitie),
    }, undefined, { module: "adviseur", functie: "assistent_vraag", gebruikerId: userId, promptNaam: "adviseur-assistent", promptVersie: "1.0.0" });

    let rondes = 0;
    while (resultaat.ok && resultaat.toolCalls && resultaat.toolCalls.length > 0 && rondes < 3) {
      rondes++;
      gesprek.push({ role: "assistant", content: resultaat.inhoud || null, tool_calls: resultaat.toolCalls });
      for (const aanroep of resultaat.toolCalls) {
        if (aanroep.type !== "function") continue;
        const tool = DATA_TOOLS.find((t) => t.definitie.function.name === aanroep.function.name);
        let uitvoer: unknown;
        try {
          uitvoer = tool
            ? await tool.uitvoer(toolScope)
            : { fout: "Onbekende tool" };
        } catch (err) {
          req.log.warn({ err, tool: aanroep.function.name }, "adviseur: tool-uitvoering mislukt");
          uitvoer = { fout: "Deze gegevens konden niet worden opgehaald. Meld dat aan de gebruiker in plaats van een getal te noemen." };
        }
        gesprek.push({ role: "tool", tool_call_id: aanroep.id, content: JSON.stringify(uitvoer) });
      }
      resultaat = await aiGateway.chat("default", {
        max_tokens: 1200,
        messages: gesprek,
        tools: DATA_TOOLS.map((t) => t.definitie),
      }, undefined, { module: "adviseur", functie: "assistent_vraag_vervolg", gebruikerId: userId, promptNaam: "adviseur-assistent", promptVersie: "1.0.0" });
    }

    // Na 3 rondes nog steeds tool-aanroepen of leeg antwoord → gecontroleerd
    // afronden in plaats van een lege chatregel tonen.
    if (resultaat.ok && (!resultaat.inhoud || resultaat.inhoud.trim().length === 0)) {
      return void res.json({ antwoord: "Ik kon deze gegevens nu niet volledig ophalen. Probeer de vraag iets specifieker te stellen, of kijk rechtstreeks in de betreffende module." });
    }

    if (!resultaat.ok) {
      // Dagplafond of gebruikerslimiet: in gewone taal melden (ASSISTENT_01 §6)
      if (resultaat.fout === AI_LIMIET_MELDING_DAGPLAFOND) {
        return void res.json({ antwoord: "Het dagelijkse AI-budget van FPS Connect is op. De assistent is vandaag niet meer beschikbaar; morgen kan het weer. Een hoofdbeheerder kan het plafond verhogen." });
      }
      if (resultaat.fout === AI_LIMIET_MELDING_GEBRUIKER) {
        return void res.json({ antwoord: "Je stelt op dit moment te veel vragen achter elkaar. Wacht een minuutje en probeer het dan opnieuw." });
      }
      req.log.warn({ fout: resultaat.fout }, "adviseur: AI-aanroep mislukt");
      return void res.status(502).json({ error: "AI-aanroep mislukt, probeer opnieuw" });
    }

    res.json({ antwoord: resultaat.inhoud.trim() });
  } catch (err) {
    req.log.error(err, "adviseur: onverwachte fout");
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
