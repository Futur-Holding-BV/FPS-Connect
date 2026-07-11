// Bedrijfsadviseur — AI-assistent ingebouwd in FPS Connect.
// Antwoordt op vragen over Connect, wetgeving, CAO's, FPS en personeel.
// Toegang is beperkt tot informatie die de ingelogde gebruiker mag zien:
// de bevoegdhedenmatrix van de gebruiker wordt meegegeven aan de AI zodat
// hij weigert te antwoorden op vragen buiten het toegestane bereik.
import { Router } from "express";
import { db } from "@workspace/db";
import { gebruikersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { aiGateway, heeftGateway } from "../lib/aiGateway";

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

Vandaag is het: ${new Date().toLocaleDateString("nl-NL", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`;
}

router.post("/adviseur/vraag", requireAuth, async (req, res): Promise<void> => {
  if (!heeftGateway()) {
    return void res.status(503).json({ error: "AI niet beschikbaar" });
  }

  try {
    const userId = (req.session as { userId?: number }).userId;
    if (!userId) return void res.status(401).json({ error: "Niet ingelogd" });

    const { vraag, geschiedenis } = req.body as {
      vraag: string;
      geschiedenis?: { rol: "user" | "assistant"; inhoud: string }[];
    };

    if (!vraag || typeof vraag !== "string" || vraag.trim().length === 0) {
      return void res.status(400).json({ error: "vraag is verplicht" });
    }
    if (vraag.trim().length > 2000) {
      return void res.status(400).json({ error: "Vraag is te lang (max 2000 tekens)" });
    }

    const [gebruiker] = await db
      .select({ naam: gebruikersTable.naam, rol: gebruikersTable.rol, bevoegdheden: gebruikersTable.bevoegdheden })
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, userId));

    if (!gebruiker) return void res.status(404).json({ error: "Gebruiker niet gevonden" });

    const bevoegdheden = (gebruiker.bevoegdheden as Record<string, number> | null) ?? {};
    const systeemPrompt = bouwSysteemPrompt(gebruiker.naam, gebruiker.rol, bevoegdheden);

    const historieBeperkt = Array.isArray(geschiedenis)
      ? geschiedenis.slice(-10)
      : [];

    const berichtenVoorAi = [
      { role: "system" as const, content: systeemPrompt },
      ...historieBeperkt.map((b) => ({
        role: b.rol === "assistant" ? ("assistant" as const) : ("user" as const),
        content: b.inhoud,
      })),
      { role: "user" as const, content: vraag.trim() },
    ];

    const resultaat = await aiGateway.chat("default", {
      max_tokens: 1200,
      messages: berichtenVoorAi,
    });

    if (!resultaat.ok) {
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
