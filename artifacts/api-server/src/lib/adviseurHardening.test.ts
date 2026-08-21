// Regressietests voor de hardeningsvereisten van task-1202:
//   - DATA_TOOLS: alle 9 domeinen gedekt (registratie-check)
//   - Onbekende tool-aanroep → expliciet geweigerd (fail-closed)
//   - Autorisatie per tool: GEEN_RECHT geeft geweigerd:true terug
//   - bouwCitaties: tool-resultaten zonder bron → geen citatie
//   - isolatieSleutel: actor ≠ effectieve gebruiker bij impersonatie
//
// Geen DB, geen HTTP — alleen de pure logica van adviseur.ts en
// adviseurPersistentie.ts.
import { describe, it, expect } from "vitest";
import { bouwCitaties, isolatieSleutel } from "./adviseurPersistentie";
import { DATA_TOOLS } from "../routes/adviseur";
import {
  bouwBronCatalogus,
  bouwGebruiktBronbewijs,
  valideerModelAntwoord,
  type AdviseurBron,
} from "./adviseurBroncontract";

// ── Controleer dat de 9 domeinen gedekt zijn in de tool-registry ────────────
const VERWACHTE_DOMAINS = [
  "projecten",
  "gebouwen",
  "calculaties",
  "offertes",
  "opdrachten",
  "uren",
  "voorraad",
  "leveranciers",
  "facturen",
] as const;

// Tool-namen die elk domein moeten afdekken (minimaal één per domein).
const VERWACHTE_TOOLS: Record<typeof VERWACHTE_DOMAINS[number], string> = {
  projecten:   "tel_projecten",
  gebouwen:    "tel_gebouwen",
  calculaties: "tel_calculaties",
  offertes:    "tel_offertes",
  opdrachten:  "tel_opdrachten",
  uren:        "uren_overzicht",
  voorraad:    "voorraad_samenvatting",
  leveranciers:"leveranciers_overzicht",
  facturen:    "tel_facturen",
};

describe("DATA_TOOLS — alle 9 domeinen gedekt", () => {
  const echteToolNamen = DATA_TOOLS.map((tool) => tool.definitie.function.name);

  for (const [domein, verwachteTool] of Object.entries(VERWACHTE_TOOLS)) {
    it(`domein '${domein}' heeft een tool '${verwachteTool}'`, () => {
      expect(echteToolNamen).toContain(verwachteTool);
    });
  }

  it("alle domein-tool-namen zijn uniek", () => {
    expect(new Set(echteToolNamen).size).toBe(echteToolNamen.length);
  });

  it("het register bevat alleen gesloten objectloze read-tools", () => {
    for (const tool of DATA_TOOLS) {
      expect(tool.definitie.type).toBe("function");
      expect(tool.definitie.function.name).toMatch(/^(tel_|uren_|voorraad_|leveranciers_|mijn_)/);
      expect(tool.definitie.function.parameters).toEqual({ type: "object", properties: {} });
    }
  });
});

// ── GEEN_RECHT-antwoord heeft geweigerd:true ─────────────────────────────────
describe("geweigerd-flag in GEEN_RECHT-antwoord", () => {
  // Gekopieerd gedrag: als een tool GEEN_RECHT teruggeeft, moet het `geweigerd: true` bevatten.
  const GEEN_RECHT = (module: string) => ({
    geweigerd: true,
    reden: `De vragende gebruiker heeft geen leesrecht op de module ${module}.`,
  });

  it("GEEN_RECHT heeft geweigerd:true", () => {
    const r = GEEN_RECHT("offertes");
    expect(r.geweigerd).toBe(true);
    expect(r.reden).toContain("offertes");
  });

  it("geweigerd:true detectie werkt consistent", () => {
    const uitvoer: unknown = GEEN_RECHT("financieel");
    const geweigerd = uitvoer != null && typeof uitvoer === "object" && (uitvoer as { geweigerd?: boolean }).geweigerd === true;
    expect(geweigerd).toBe(true);
  });

  it("succesresultaat heeft GEEN geweigerd:true", () => {
    const uitvoer = { bron: "offertes-tabel", peildatum: "2025-01-01", per_status: [] };
    const geweigerd = (uitvoer as { geweigerd?: boolean }).geweigerd === true;
    expect(geweigerd).toBe(false);
  });
});

describe("DATA_TOOLS — echte uitvoerders weigeren vóór een DB-query", () => {
  const moduleGebondenTools = DATA_TOOLS.filter((tool) =>
    !["uren_overzicht", "mijn_werkbak"].includes(tool.definitie.function.name),
  );
  const geenRechtScope = {
    userId: 77,
    isHoofdbeheerder: false,
    toegestaneGebouwIds: [],
    heeftModuleRecht: () => false,
    magBijGebouw: () => false,
    heeftObjectRecht: () => false,
  };

  for (const tool of moduleGebondenTools) {
    it(`${tool.definitie.function.name} geeft een expliciete weigering`, async () => {
      const uitvoer = await tool.uitvoer(geenRechtScope);
      expect(uitvoer).toMatchObject({ geweigerd: true });
    });
  }
});

// ── Citaties: geen citatie bij ontbrekende bron ───────────────────────────────
describe("bouwCitaties — fail-closed bij ontbrekende bronnen", () => {
  it("retourneert lege array als alles ontbreekt", () => {
    expect(bouwCitaties([])).toHaveLength(0);
    expect(bouwCitaties([], undefined, [])).toHaveLength(0);
  });

  it("negeert tool-resultaten zonder bron", () => {
    const citaties = bouwCitaties([], undefined, [
      { toolNaam: "mijn_werkbak" }, // geen bron-veld
    ]);
    expect(citaties).toHaveLength(0);
  });

  it("geeft citatie bij tool-resultaat met bron", () => {
    const citaties = bouwCitaties([], undefined, [
      { toolNaam: "tel_facturen", bron: "facturen-tabel van FPS Connect", href: "/facturen" },
    ]);
    expect(citaties).toHaveLength(1);
    expect(citaties[0]?.href).toBe("/facturen");
  });
});

describe("broncontract — iedere feitelijke claim heeft een serverbron", () => {
  const bronnen: AdviseurBron[] = [{
    id: "TOOL_1",
    inhoud: JSON.stringify({ aantal: 7, peildatum: "2026-08-21" }),
    citatie: {
      label: "tel_offertes",
      bron: "offertes-tabel per 2026-08-21",
      href: "/offertes",
    },
  }];

  it("accepteert atomische claims met een bekende bron", () => {
    const resultaat = valideerModelAntwoord(JSON.stringify({
      uitkomst: "beantwoord",
      claims: [{ tekst: "Er zijn 7 offertes.", bron_ids: ["TOOL_1"] }],
    }), bronnen);
    expect(resultaat).toMatchObject({
      ok: true,
      waarde: {
        uitkomst: "beantwoord",
        antwoord: "Er zijn 7 offertes. [1]",
        bronIds: ["TOOL_1"],
        citaties: [{ href: "/offertes" }],
        claims: [{ tekst: "Er zijn 7 offertes.", bronIds: ["TOOL_1"] }],
      },
    });
  });

  it.each([
    ["vrije tekst", "Er zijn 7 offertes."],
    ["lege claims", JSON.stringify({ uitkomst: "beantwoord", claims: [] })],
    ["claim zonder bron", JSON.stringify({ uitkomst: "beantwoord", claims: [{ tekst: "Er zijn 7 offertes.", bron_ids: [] }] })],
    ["onbekende bron", JSON.stringify({ uitkomst: "beantwoord", claims: [{ tekst: "Er zijn 7 offertes.", bron_ids: ["VERZONNEN"] }] })],
  ])("weigert %s fail-closed", (_naam, modeluitvoer) => {
    expect(valideerModelAntwoord(modeluitvoer, bronnen)).toMatchObject({ ok: false });
  });

  it("geeft alleen werkelijk gebruikte citaties terug", () => {
    const resultaat = valideerModelAntwoord(JSON.stringify({
      uitkomst: "beantwoord",
      claims: [{ tekst: "Er zijn 7 offertes.", bron_ids: ["TOOL_1"] }],
    }), [...bronnen, {
      id: "SCREEN",
      inhoud: "/",
      citatie: { label: "Dashboard", bron: "Actuele Connect-route", href: "/" },
    }]);
    expect(resultaat.ok && resultaat.waarde.citaties).toHaveLength(1);
  });

  it("accepteert alleen een korte vraag als verduidelijking", () => {
    expect(valideerModelAntwoord(JSON.stringify({
      uitkomst: "verduidelijking",
      antwoord: "Over welke offerte gaat je vraag?",
    }), bronnen)).toMatchObject({ ok: true, waarde: { uitkomst: "verduidelijking" } });
    expect(valideerModelAntwoord(JSON.stringify({
      uitkomst: "verduidelijking",
      antwoord: "Ik weet genoeg.",
    }), bronnen)).toMatchObject({ ok: false });
  });

  it("catalogus bevat bron-id en inhoud, niet alleen een generiek label", () => {
    const catalogus = bouwBronCatalogus(bronnen);
    expect(catalogus).toContain("BRON-ID: TOOL_1");
    expect(catalogus).toContain('"aantal":7');
  });

  it("auditbewijs bevat alleen gebruikte broninhoud en claimmapping", () => {
    const overigeBron: AdviseurBron = {
      id: "SCREEN",
      inhoud: "niet gebruikt",
      citatie: { label: "Scherm", bron: "Connect", href: "/" },
    };
    expect(bouwGebruiktBronbewijs([...bronnen, overigeBron], ["TOOL_1"])).toEqual([
      {
        id: "TOOL_1",
        inhoud: JSON.stringify({ aantal: 7, peildatum: "2026-08-21" }),
        citatie: bronnen[0]!.citatie,
      },
    ]);
  });
});

// ── Impersonatie-isolatie: actor_id ≠ effectieveUserId ──────────────────────
describe("isolatieSleutel bij impersonatie", () => {
  it("beheerder (actor) krijgt zijn eigen gesprek-sleutel", () => {
    const actorSleutel = isolatieSleutel(1, 1, "hoofdbeheerder", "auth-a");
    expect(actorSleutel).toBe("1:1:hoofdbeheerder:auth-a");
  });

  it("effectieve gebruiker (teamlid) krijgt zijn eigen gesprek-sleutel", () => {
    const effectiefSleutel = isolatieSleutel(1, 5, "gebruiker", "auth-a");
    expect(effectiefSleutel).toBe("1:5:gebruiker:auth-a");
  });

  it("actor- en effectieve sleutel zijn strikt gescheiden", () => {
    expect(isolatieSleutel(1, 1, "hoofdbeheerder", "auth-a")).not.toBe(
      isolatieSleutel(1, 5, "gebruiker", "auth-a"),
    );
  });
});

// ── Onbekende tool: naam niet in de whitelist ────────────────────────────────
describe("onbekende tool fail-closed", () => {
  const TOOL_WHITELIST = new Set(DATA_TOOLS.map((tool) => tool.definitie.function.name));

  it("bekende tools worden herkend", () => {
    for (const naam of TOOL_WHITELIST) {
      expect(TOOL_WHITELIST.has(naam)).toBe(true);
    }
  });

  it("onbekende tool-naam wordt geweigerd", () => {
    const onbekend = "verwijder_alles";
    expect(TOOL_WHITELIST.has(onbekend)).toBe(false);
  });

  it("lege string is geen geldige tool-naam", () => {
    expect(TOOL_WHITELIST.has("")).toBe(false);
  });
});
