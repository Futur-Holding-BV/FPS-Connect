/**
 * Tests voor gebouwProcessStatus service.
 *
 * Pure tests op berekenProcessStatus(), berekenPublicatieReadiness() en
 * stelPublicatiePreviewSamen() — geen DB-aanroepen nodig voor derivatie-logica.
 */
import { describe, it, expect } from "vitest";
import {
  berekenProcessStatus,
  berekenPublicatieReadiness,
  stelPublicatiePreviewSamen,
  conceptAfgerond,
  internAkkoordAfgerond,
  offerteAfgerond,
  opdrachtAfgerond,
  uitvoeringAfgerond,
  opleveringAfgerond,
  ondertekendeOfferteIds,
  actueleOpdracht,
  actionPathVoorFase,
  huidigeDefinitiefBevrorenRapport,
  huidigeDefinitiefBevrorenRapporten,
  MEERDERE_RAPPORTEN_BLOCKER,
  type GebouwProcessData,
  type GebouwRapportData,
} from "./gebouwProcessStatus";

// ── Test-helpers ──────────────────────────────────────────────────────────────

function legeData(gebouwId = 1): GebouwProcessData {
  return {
    gebouwId,
    calculaties: [],
    offertes: [],
    opdrachten: [],
    rapporten: [],
    partijen: [],
  };
}

function metCalculatie(
  data: GebouwProcessData,
  status: string,
  id = 1,
): GebouwProcessData {
  return { ...data, calculaties: [...data.calculaties, { id, status }] };
}

function metOfferte(
  data: GebouwProcessData,
  opts: { status: string; portaalStatus: string; heeftHandtekening: boolean; id?: number },
): GebouwProcessData {
  return {
    ...data,
    offertes: [
      ...data.offertes,
      {
        id: opts.id ?? 10,
        status: opts.status,
        portaalStatus: opts.portaalStatus,
        heeftHandtekening: opts.heeftHandtekening,
      },
    ],
  };
}

function metOpdracht(
  data: GebouwProcessData,
  opts: { status: string; offerteId: number | null; id?: number },
): GebouwProcessData {
  return {
    ...data,
    opdrachten: [
      ...data.opdrachten,
      { id: opts.id ?? 20, offerteId: opts.offerteId, status: opts.status },
    ],
  };
}

/** Maakt een minimale GebouwRapportData; extra velden zijn optioneel. */
function maakRapport(opts: {
  id?: number;
  status: string;
  bevrorenOp: Date | null;
  vervangenDoorId?: number | null;
  vervangenDoorRapportId?: number | null;
  rapportType?: string;
  titel?: string | null;
  bijlagenIds?: number[];
  tekeningIds?: number[];
  bevrorenDocumentRevisies?: Record<string, { revisie_nummer: number | null; naam: string }> | null;
}): GebouwRapportData {
  return {
    id: opts.id ?? 30,
    status: opts.status,
    rapportType: opts.rapportType ?? "opleverrapport",
    titel: opts.titel ?? null,
    bevrorenOp: opts.bevrorenOp,
    bevrorenDocumentRevisies: opts.bevrorenDocumentRevisies ?? null,
    bijlagenIds: opts.bijlagenIds ?? [],
    tekeningIds: opts.tekeningIds ?? [],
    vervangenDoorId: opts.vervangenDoorId ?? null,
    vervangenDoorRapportId: opts.vervangenDoorRapportId ?? null,
  };
}

function metRapport(
  data: GebouwProcessData,
  opts: Parameters<typeof maakRapport>[0],
): GebouwProcessData {
  return { ...data, rapporten: [...data.rapporten, maakRapport(opts)] };
}

// ── Predicaten ────────────────────────────────────────────────────────────────

describe("conceptAfgerond", () => {
  it("false zonder calculaties", () => {
    expect(conceptAfgerond({ calculaties: [] })).toBe(false);
  });

  it("true met één calculatie (ook concept)", () => {
    expect(conceptAfgerond({ calculaties: [{ id: 1, status: "concept" }] })).toBe(true);
  });

  it("true met gewonnen calculatie", () => {
    expect(conceptAfgerond({ calculaties: [{ id: 1, status: "gewonnen" }] })).toBe(true);
  });
});

describe("internAkkoordAfgerond", () => {
  it("false zonder calculaties", () => {
    expect(internAkkoordAfgerond({ calculaties: [] })).toBe(false);
  });

  it("false met calculatie in concept-status", () => {
    expect(internAkkoordAfgerond({ calculaties: [{ id: 1, status: "concept" }] })).toBe(false);
  });

  it("true bij intern_akkoord", () => {
    expect(internAkkoordAfgerond({ calculaties: [{ id: 1, status: "intern_akkoord" }] })).toBe(true);
  });

  it("true bij aangeboden", () => {
    expect(internAkkoordAfgerond({ calculaties: [{ id: 1, status: "aangeboden" }] })).toBe(true);
  });

  it("true bij gewonnen", () => {
    expect(internAkkoordAfgerond({ calculaties: [{ id: 1, status: "gewonnen" }] })).toBe(true);
  });

  it("false bij verloren (verloren worden al gefilterd, maar als ze er toch zijn)", () => {
    expect(internAkkoordAfgerond({ calculaties: [{ id: 1, status: "verloren" }] })).toBe(false);
  });
});

describe("offerteAfgerond", () => {
  it("false zonder offertes", () => {
    expect(offerteAfgerond({ offertes: [] })).toBe(false);
  });

  it("false bij geaccepteerd zonder handtekening", () => {
    expect(
      offerteAfgerond({
        offertes: [{ id: 1, status: "geaccepteerd", portaalStatus: "geaccepteerd", heeftHandtekening: false }],
      }),
    ).toBe(false);
  });

  it("false bij ondertekende status maar zonder handtekening-bewijs", () => {
    expect(
      offerteAfgerond({
        offertes: [{ id: 1, status: "ondertekend", portaalStatus: "ondertekend", heeftHandtekening: false }],
      }),
    ).toBe(false);
  });

  it("false bij handtekening maar status geaccepteerd (onvoldoende)", () => {
    expect(
      offerteAfgerond({
        offertes: [{ id: 1, status: "geaccepteerd", portaalStatus: "geaccepteerd", heeftHandtekening: true }],
      }),
    ).toBe(false);
  });

  it("true bij status ondertekend + handtekening", () => {
    expect(
      offerteAfgerond({
        offertes: [{ id: 1, status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true }],
      }),
    ).toBe(true);
  });

  it("true bij portaalStatus ondertekend + handtekening", () => {
    expect(
      offerteAfgerond({
        offertes: [{ id: 1, status: "geaccepteerd", portaalStatus: "ondertekend", heeftHandtekening: true }],
      }),
    ).toBe(true);
  });
});

// ── ondertekendeOfferteIds (set-semantiek) ────────────────────────────────────

describe("ondertekendeOfferteIds", () => {
  it("lege set zonder offertes", () => {
    expect(ondertekendeOfferteIds({ offertes: [] }).size).toBe(0);
  });

  it("bevat alleen offertes met handtekening + ondertekend-status", () => {
    const offertes = [
      { id: 10, status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true },
      { id: 11, status: "geaccepteerd", portaalStatus: "geaccepteerd", heeftHandtekening: true }, // onvoldoende
      { id: 12, status: "ondertekend", portaalStatus: "concept", heeftHandtekening: false }, // geen bewijs
      { id: 13, status: "geaccepteerd", portaalStatus: "ondertekend", heeftHandtekening: true }, // ook geldig
    ];
    const ids = ondertekendeOfferteIds({ offertes });
    expect(ids.has(10)).toBe(true);
    expect(ids.has(11)).toBe(false);
    expect(ids.has(12)).toBe(false);
    expect(ids.has(13)).toBe(true);
    expect(ids.size).toBe(2);
  });
});

describe("opdrachtAfgerond — set-semantiek meerdere ondertekende offertes", () => {
  it("false als er geen ondertekende offerte is", () => {
    const data: Pick<GebouwProcessData, "offertes" | "opdrachten"> = {
      offertes: [],
      opdrachten: [{ id: 1, offerteId: 10, status: "actief" }],
    };
    expect(opdrachtAfgerond(data)).toBe(false);
  });

  it("false als opdracht geannuleerd", () => {
    const data: Pick<GebouwProcessData, "offertes" | "opdrachten"> = {
      offertes: [{ id: 10, status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true }],
      opdrachten: [{ id: 1, offerteId: 10, status: "geannuleerd" }],
    };
    expect(opdrachtAfgerond(data)).toBe(false);
  });

  it("true bij actieve opdracht voor de ondertekende offerte", () => {
    const data: Pick<GebouwProcessData, "offertes" | "opdrachten"> = {
      offertes: [{ id: 10, status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true }],
      opdrachten: [{ id: 1, offerteId: 10, status: "actief" }],
    };
    expect(opdrachtAfgerond(data)).toBe(true);
  });

  it("false als opdracht voor andere (niet-ondertekende) offerte", () => {
    const data: Pick<GebouwProcessData, "offertes" | "opdrachten"> = {
      offertes: [{ id: 10, status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true }],
      opdrachten: [{ id: 1, offerteId: 99, status: "actief" }],
    };
    expect(opdrachtAfgerond(data)).toBe(false);
  });

  it("true als opdracht gekoppeld is aan de TWEEDE ondertekende offerte (set-semantiek)", () => {
    // Offerte 10 is ondertekend maar heeft géén opdracht.
    // Offerte 11 is ook ondertekend en HAS een actieve opdracht.
    // Met enkelvoudige eerste-offerte-semantiek zou dit false zijn; met set-semantiek true.
    const data: Pick<GebouwProcessData, "offertes" | "opdrachten"> = {
      offertes: [
        { id: 10, status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true },
        { id: 11, status: "geaccepteerd", portaalStatus: "ondertekend", heeftHandtekening: true },
      ],
      opdrachten: [{ id: 2, offerteId: 11, status: "actief" }],
    };
    expect(opdrachtAfgerond(data)).toBe(true);
  });

  it("true als één opdracht geannuleerd maar andere opdracht actief voor andere ondertekende offerte", () => {
    const data: Pick<GebouwProcessData, "offertes" | "opdrachten"> = {
      offertes: [
        { id: 10, status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true },
        { id: 11, status: "geaccepteerd", portaalStatus: "ondertekend", heeftHandtekening: true },
      ],
      opdrachten: [
        { id: 1, offerteId: 10, status: "geannuleerd" },
        { id: 2, offerteId: 11, status: "actief" },
      ],
    };
    expect(opdrachtAfgerond(data)).toBe(true);
  });
});

describe("actueleOpdracht — deterministische keuze", () => {
  it("null zonder ondertekende offerte", () => {
    const data: Pick<GebouwProcessData, "offertes" | "opdrachten"> = {
      offertes: [],
      opdrachten: [{ id: 1, offerteId: 10, status: "actief" }],
    };
    expect(actueleOpdracht(data)).toBeNull();
  });

  it("null als enige opdracht geannuleerd", () => {
    const data: Pick<GebouwProcessData, "offertes" | "opdrachten"> = {
      offertes: [{ id: 10, status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true }],
      opdrachten: [{ id: 1, offerteId: 10, status: "geannuleerd" }],
    };
    expect(actueleOpdracht(data)).toBeNull();
  });

  it("prefereert afgeronde boven actieve opdracht", () => {
    const data: Pick<GebouwProcessData, "offertes" | "opdrachten"> = {
      offertes: [
        { id: 10, status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true },
        { id: 11, status: "geaccepteerd", portaalStatus: "ondertekend", heeftHandtekening: true },
      ],
      opdrachten: [
        { id: 1, offerteId: 10, status: "actief" },
        { id: 2, offerteId: 11, status: "afgerond" },
      ],
    };
    const r = actueleOpdracht(data);
    expect(r?.id).toBe(2);
    expect(r?.status).toBe("afgerond");
  });

  it("bij gelijke status kiest laagste id", () => {
    const data: Pick<GebouwProcessData, "offertes" | "opdrachten"> = {
      offertes: [
        { id: 10, status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true },
        { id: 11, status: "geaccepteerd", portaalStatus: "ondertekend", heeftHandtekening: true },
      ],
      opdrachten: [
        { id: 5, offerteId: 11, status: "actief" },
        { id: 3, offerteId: 10, status: "actief" },
      ],
    };
    const r = actueleOpdracht(data);
    expect(r?.id).toBe(3); // laagste id
  });
});

describe("uitvoeringAfgerond", () => {
  it("false zonder opdracht", () => {
    const data: Pick<GebouwProcessData, "offertes" | "opdrachten"> = {
      offertes: [],
      opdrachten: [],
    };
    expect(uitvoeringAfgerond(data)).toBe(false);
  });

  it("false bij actieve opdracht", () => {
    const data: Pick<GebouwProcessData, "offertes" | "opdrachten"> = {
      offertes: [{ id: 10, status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true }],
      opdrachten: [{ id: 1, offerteId: 10, status: "actief" }],
    };
    expect(uitvoeringAfgerond(data)).toBe(false);
  });

  it("true bij afgeronde opdracht", () => {
    const data: Pick<GebouwProcessData, "offertes" | "opdrachten"> = {
      offertes: [{ id: 10, status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true }],
      opdrachten: [{ id: 1, offerteId: 10, status: "afgerond" }],
    };
    expect(uitvoeringAfgerond(data)).toBe(true);
  });

  it("true als meest-gevorderde van meerdere opdrachten afgerond is", () => {
    const data: Pick<GebouwProcessData, "offertes" | "opdrachten"> = {
      offertes: [
        { id: 10, status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true },
        { id: 11, status: "geaccepteerd", portaalStatus: "ondertekend", heeftHandtekening: true },
      ],
      opdrachten: [
        { id: 1, offerteId: 10, status: "actief" },
        { id: 2, offerteId: 11, status: "afgerond" },
      ],
    };
    expect(uitvoeringAfgerond(data)).toBe(true);
  });
});

describe("opleveringAfgerond", () => {
  it("false zonder rapporten", () => {
    expect(opleveringAfgerond({ rapporten: [] })).toBe(false);
  });

  it("false bij concept-rapport", () => {
    expect(
      opleveringAfgerond({
        rapporten: [maakRapport({ status: "concept", bevrorenOp: new Date() })],
      }),
    ).toBe(false);
  });

  it("false bij definitief maar niet bevroren", () => {
    expect(
      opleveringAfgerond({
        rapporten: [maakRapport({ status: "definitief", bevrorenOp: null })],
      }),
    ).toBe(false);
  });

  it("false bij definitief, bevroren, maar vervangen (vervangenDoorId)", () => {
    expect(
      opleveringAfgerond({
        rapporten: [maakRapport({ status: "definitief", bevrorenOp: new Date(), vervangenDoorId: 2 })],
      }),
    ).toBe(false);
  });

  it("false bij definitief, bevroren, maar vervangen (vervangenDoorRapportId)", () => {
    expect(
      opleveringAfgerond({
        rapporten: [maakRapport({ status: "definitief", bevrorenOp: new Date(), vervangenDoorRapportId: 2 })],
      }),
    ).toBe(false);
  });

  it("false bij gearchiveerd rapport", () => {
    expect(
      opleveringAfgerond({
        rapporten: [maakRapport({ status: "gearchiveerd", bevrorenOp: new Date() })],
      }),
    ).toBe(false);
  });

  it("true bij definitief, bevroren, niet vervangen", () => {
    expect(
      opleveringAfgerond({
        rapporten: [maakRapport({ status: "definitief", bevrorenOp: new Date() })],
      }),
    ).toBe(true);
  });

  it("false bij TWEE huidig-definitief-bevroren rapporten (exact-één-semantiek)", () => {
    expect(
      opleveringAfgerond({
        rapporten: [
          maakRapport({ id: 30, status: "definitief", bevrorenOp: new Date() }),
          maakRapport({ id: 31, status: "definitief", bevrorenOp: new Date() }),
        ],
      }),
    ).toBe(false);
  });

  it("false bij drie matching rapporten", () => {
    expect(
      opleveringAfgerond({
        rapporten: [
          maakRapport({ id: 30, status: "definitief", bevrorenOp: new Date() }),
          maakRapport({ id: 31, status: "definitief", bevrorenOp: new Date() }),
          maakRapport({ id: 32, status: "definitief", bevrorenOp: new Date() }),
        ],
      }),
    ).toBe(false);
  });
});

// ── huidigeDefinitiefBevrorenRapport / huidigeDefinitiefBevrorenRapporten ─────

describe("huidigeDefinitiefBevrorenRapport — exact-één-semantiek", () => {
  it("null bij 0 matching rapporten", () => {
    expect(huidigeDefinitiefBevrorenRapport({ rapporten: [] })).toBeNull();
  });

  it("geeft het rapport terug bij precies 1 match", () => {
    const r = maakRapport({ id: 30, status: "definitief", bevrorenOp: new Date() });
    expect(huidigeDefinitiefBevrorenRapport({ rapporten: [r] })?.id).toBe(30);
  });

  it("null bij 2 matching rapporten — fail closed bij ambiguïteit", () => {
    expect(
      huidigeDefinitiefBevrorenRapport({
        rapporten: [
          maakRapport({ id: 30, status: "definitief", bevrorenOp: new Date() }),
          maakRapport({ id: 31, status: "definitief", bevrorenOp: new Date() }),
        ],
      }),
    ).toBeNull();
  });

  it("null bij 3 matching rapporten", () => {
    expect(
      huidigeDefinitiefBevrorenRapport({
        rapporten: [
          maakRapport({ id: 30, status: "definitief", bevrorenOp: new Date() }),
          maakRapport({ id: 31, status: "definitief", bevrorenOp: new Date() }),
          maakRapport({ id: 32, status: "definitief", bevrorenOp: new Date() }),
        ],
      }),
    ).toBeNull();
  });

  it("geeft het rapport terug wanneer de tweede van twee is vervangen (1 valide)", () => {
    const geldig = maakRapport({ id: 30, status: "definitief", bevrorenOp: new Date() });
    const vervangen = maakRapport({ id: 31, status: "definitief", bevrorenOp: new Date(), vervangenDoorId: 30 });
    expect(huidigeDefinitiefBevrorenRapport({ rapporten: [geldig, vervangen] })?.id).toBe(30);
  });
});

describe("huidigeDefinitiefBevrorenRapporten — alle matches tellen", () => {
  it("lege array bij geen rapporten", () => {
    expect(huidigeDefinitiefBevrorenRapporten({ rapporten: [] })).toHaveLength(0);
  });

  it("lengte 1 bij precies 1 valide rapport", () => {
    expect(
      huidigeDefinitiefBevrorenRapporten({
        rapporten: [maakRapport({ id: 30, status: "definitief", bevrorenOp: new Date() })],
      }),
    ).toHaveLength(1);
  });

  it("lengte 2 bij twee huidige-definitieve-bevroren rapporten", () => {
    expect(
      huidigeDefinitiefBevrorenRapporten({
        rapporten: [
          maakRapport({ id: 30, status: "definitief", bevrorenOp: new Date() }),
          maakRapport({ id: 31, status: "definitief", bevrorenOp: new Date() }),
        ],
      }),
    ).toHaveLength(2);
  });

  it("filtert vervangen rapporten eruit", () => {
    expect(
      huidigeDefinitiefBevrorenRapporten({
        rapporten: [
          maakRapport({ id: 30, status: "definitief", bevrorenOp: new Date() }),
          maakRapport({ id: 31, status: "definitief", bevrorenOp: new Date(), vervangenDoorId: 30 }),
        ],
      }),
    ).toHaveLength(1);
  });
});

// ── actionPathVoorFase ────────────────────────────────────────────────────────

describe("actionPathVoorFase — gebouw-specifieke deeplinks", () => {
  it("concept → /gebouwen/{id}?tab=calculaties", () => {
    expect(actionPathVoorFase("concept", 42)).toBe("/gebouwen/42?tab=calculaties");
  });

  it("intern_akkoord → /gebouwen/{id}?tab=calculaties", () => {
    expect(actionPathVoorFase("intern_akkoord", 42)).toBe("/gebouwen/42?tab=calculaties");
  });

  it("offerte → /gebouwen/{id}?tab=offertes", () => {
    expect(actionPathVoorFase("offerte", 42)).toBe("/gebouwen/42?tab=offertes");
  });

  it("opdracht → /gebouwen/{id}?tab=offertes", () => {
    expect(actionPathVoorFase("opdracht", 42)).toBe("/gebouwen/42?tab=offertes");
  });

  it("uitvoering → /gebouwen/{id}?tab=opdrachten", () => {
    expect(actionPathVoorFase("uitvoering", 42)).toBe("/gebouwen/42?tab=opdrachten");
  });

  it("oplevering → /gebouwen/{id}?tab=rapporten", () => {
    expect(actionPathVoorFase("oplevering", 42)).toBe("/gebouwen/42?tab=rapporten");
  });

  it("gebouwId is onderdeel van het pad", () => {
    expect(actionPathVoorFase("uitvoering", 99)).toBe("/gebouwen/99?tab=opdrachten");
    expect(actionPathVoorFase("uitvoering", 1)).toBe("/gebouwen/1?tab=opdrachten");
  });
});

// ── berekenProcessStatus ──────────────────────────────────────────────────────

describe("berekenProcessStatus", () => {
  it("volledig lege data: concept is actief, rest toekomstig geblokkeerd door concept", () => {
    const data = legeData(5);
    const result = berekenProcessStatus(data);
    const { fasen } = result;
    expect(fasen[0].sleutel).toBe("concept");
    expect(fasen[0].toestand).toBe("actief");
    expect(fasen[0].blocker_code).toBeNull();
    // action_path bevat het gebouwId
    expect(fasen[0].action_path).toBe("/gebouwen/5?tab=calculaties");

    // Alle overige fasen zijn toekomstig en geblokkeerd door "concept"
    for (const fase of fasen.slice(1)) {
      expect(fase.toestand).toBe("toekomstig");
      expect(fase.blocker_code).toBe("geen_calculatie");
      expect(fase.blocker_message).toContain("calculatie");
      // toekomstige fasen wijzen naar actieve fase deeplink
      expect(fase.action_path).toBe("/gebouwen/5?tab=calculaties");
    }
  });

  it("huidige_stap is de sleutel van de actieve fase", () => {
    const data = legeData(1);
    expect(berekenProcessStatus(data).huidige_stap).toBe("concept");
  });

  it("all_afgerond is false als er een actieve fase is", () => {
    expect(berekenProcessStatus(legeData()).all_afgerond).toBe(false);
  });

  it("calculatie concept: intern_akkoord is actief", () => {
    const data = metCalculatie(legeData(), "concept");
    const { fasen } = berekenProcessStatus(data);
    expect(fasen[0].toestand).toBe("afgerond");
    expect(fasen[1].sleutel).toBe("intern_akkoord");
    expect(fasen[1].toestand).toBe("actief");
    // Rest toekomstig geblokkeerd door intern_akkoord
    for (const fase of fasen.slice(2)) {
      expect(fase.blocker_code).toBe("calculatie_niet_akkoord");
    }
  });

  it("calculatie intern_akkoord: offerte is actief", () => {
    const data = metCalculatie(legeData(), "intern_akkoord");
    const { fasen } = berekenProcessStatus(data);
    expect(fasen[0].toestand).toBe("afgerond");
    expect(fasen[1].toestand).toBe("afgerond");
    expect(fasen[2].sleutel).toBe("offerte");
    expect(fasen[2].toestand).toBe("actief");
  });

  it("ondertekende offerte: opdracht is actief", () => {
    let data = metCalculatie(legeData(), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true });
    const { fasen } = berekenProcessStatus(data);
    expect(fasen[2].toestand).toBe("afgerond");
    expect(fasen[3].sleutel).toBe("opdracht");
    expect(fasen[3].toestand).toBe("actief");
  });

  it("opdracht actief: uitvoering is actief", () => {
    let data = metCalculatie(legeData(), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "actief", offerteId: 10 });
    const { fasen } = berekenProcessStatus(data);
    expect(fasen[3].toestand).toBe("afgerond");
    expect(fasen[4].sleutel).toBe("uitvoering");
    expect(fasen[4].toestand).toBe("actief");
    expect(fasen[4].action_path).toBe("/gebouwen/1?tab=opdrachten");
  });

  it("opdracht afgerond: oplevering is actief", () => {
    let data = metCalculatie(legeData(), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 10 });
    const { fasen } = berekenProcessStatus(data);
    expect(fasen[4].toestand).toBe("afgerond");
    expect(fasen[5].sleutel).toBe("oplevering");
    expect(fasen[5].toestand).toBe("actief");
    expect(fasen[5].action_path).toBe("/gebouwen/1?tab=rapporten");
  });

  it("volledig doorlopen: alle fasen afgerond, huidige_stap null, all_afgerond true", () => {
    let data = metCalculatie(legeData(), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 10 });
    data = metRapport(data, { status: "definitief", bevrorenOp: new Date() });
    const result = berekenProcessStatus(data);
    for (const fase of result.fasen) {
      expect(fase.toestand).toBe("afgerond");
      expect(fase.blocker_code).toBeNull();
      expect(fase.action_path).toBeNull(); // afgeronde fasen hebben geen action_path
    }
    expect(result.huidige_stap).toBeNull();
    expect(result.all_afgerond).toBe(true);
  });

  it("geannuleerde opdracht telt niet mee — opdracht is actief", () => {
    let data = metCalculatie(legeData(), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "geannuleerd", offerteId: 10 });
    const { fasen } = berekenProcessStatus(data);
    const opdrachtFase = fasen.find((f) => f.sleutel === "opdracht");
    expect(opdrachtFase?.toestand).toBe("actief");
  });

  it("verloren calculatie telt niet mee voor intern_akkoord", () => {
    // verloren zijn al gefilterd bij laadfase, maar als ze er toch zijn
    const data: GebouwProcessData = {
      ...legeData(),
      calculaties: [{ id: 1, status: "verloren" }],
    };
    const { fasen } = berekenProcessStatus(data);
    // concept afgerond (calculatie aanwezig), intern_akkoord actief
    expect(fasen[0].toestand).toBe("afgerond");
    expect(fasen[1].toestand).toBe("actief");
  });

  it("offerte geaccepteerd zonder handtekening telt niet", () => {
    let data = metCalculatie(legeData(), "intern_akkoord");
    data = metOfferte(data, { status: "geaccepteerd", portaalStatus: "geaccepteerd", heeftHandtekening: false });
    const { fasen } = berekenProcessStatus(data);
    const offerteFase = fasen.find((f) => f.sleutel === "offerte");
    expect(offerteFase?.toestand).toBe("actief");
  });

  it("vervangen rapport telt niet voor oplevering", () => {
    let data = metCalculatie(legeData(), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 10 });
    data = metRapport(data, { status: "definitief", bevrorenOp: new Date(), vervangenDoorRapportId: 2 });
    const { fasen } = berekenProcessStatus(data);
    const opleveringFase = fasen.find((f) => f.sleutel === "oplevering");
    expect(opleveringFase?.toestand).toBe("actief");
  });

  it("6 fasen aanwezig in volgorde", () => {
    const { fasen } = berekenProcessStatus(legeData());
    expect(fasen.map((f) => f.sleutel)).toEqual([
      "concept", "intern_akkoord", "offerte", "opdracht", "uitvoering", "oplevering",
    ]);
  });

  it("opdracht gekoppeld aan TWEEDE ondertekende offerte → opdracht afgerond", () => {
    let data = metCalculatie(legeData(), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOfferte(data, { status: "geaccepteerd", portaalStatus: "ondertekend", heeftHandtekening: true, id: 11 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 11 }); // gekoppeld aan tweede offerte
    data = metRapport(data, { status: "definitief", bevrorenOp: new Date() });
    const result = berekenProcessStatus(data);
    expect(result.all_afgerond).toBe(true);
  });

  it("action_path voor afgeronde fase is null", () => {
    const data = metCalculatie(legeData(7), "concept");
    const { fasen } = berekenProcessStatus(data);
    expect(fasen[0].action_path).toBeNull(); // concept is afgerond
    expect(fasen[1].action_path).toBe("/gebouwen/7?tab=calculaties"); // intern_akkoord is actief
  });

  // ── Duplicate-rapport (tegenstrijdige data) ──────────────────────────────────

  it("twee huidig-definitief-bevroren rapporten → oplevering actief (niet afgerond)", () => {
    let data = metCalculatie(legeData(50), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 10 });
    // Twee rapporten die allebei matchen
    data = metRapport(data, { id: 30, status: "definitief", bevrorenOp: new Date() });
    data = metRapport(data, { id: 31, status: "definitief", bevrorenOp: new Date() });
    const result = berekenProcessStatus(data);
    expect(result.all_afgerond).toBe(false);
    expect(result.huidige_stap).toBe("oplevering");
  });

  it("twee matching rapporten → oplevering actief met meerdere_definitieve_rapporten blocker", () => {
    let data = metCalculatie(legeData(50), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 10 });
    data = metRapport(data, { id: 30, status: "definitief", bevrorenOp: new Date() });
    data = metRapport(data, { id: 31, status: "definitief", bevrorenOp: new Date() });
    const { fasen } = berekenProcessStatus(data);
    const opleveringFase = fasen.find((f) => f.sleutel === "oplevering")!;
    expect(opleveringFase.toestand).toBe("actief");
    // Geen blocker_code op de actieve fase zelf (consistent met ander gedrag)
    expect(opleveringFase.blocker_code).toBeNull();
    // action_path en action_label verwijzen naar de correctieve actie
    expect(opleveringFase.action_path).toBe("/gebouwen/50?tab=rapporten");
    expect(opleveringFase.action_label).toBe(MEERDERE_RAPPORTEN_BLOCKER.action_label);
  });

  it("toekomstige fasen NA oplevering zouden niet voor komen (oplevering is altijd de laatste), pariteit check", () => {
    // Oplevering is de zesde en laatste fase, er zijn geen toekomstige fasen erna.
    let data = metCalculatie(legeData(51), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 10 });
    data = metRapport(data, { id: 30, status: "definitief", bevrorenOp: new Date() });
    data = metRapport(data, { id: 31, status: "definitief", bevrorenOp: new Date() });
    const { fasen } = berekenProcessStatus(data);
    const toekomstig = fasen.filter((f) => f.toestand === "toekomstig");
    expect(toekomstig).toHaveLength(0); // oplevering is de laatste fase
    // Actieve fase blocker_code is null; de toekomstig-blokkers zijn niet van toepassing
    const oplevering = fasen.find((f) => f.sleutel === "oplevering")!;
    expect(oplevering.toestand).toBe("actief");
  });

  it("twee matching rapporten geven meerdere_definitieve_rapporten als toekomstig blocker_code bij eerder actieve fase", () => {
    // Dit scenario: de duplicatie zit erin maar eerdere fasen blokkeren nog → de eerdere fase blokkeert.
    // Dus: alleen calculatie aanwezig, twee rapporten → actieve fase = intern_akkoord, niet oplevering.
    let data = metCalculatie(legeData(52), "concept");
    data = metRapport(data, { id: 30, status: "definitief", bevrorenOp: new Date() });
    data = metRapport(data, { id: 31, status: "definitief", bevrorenOp: new Date() });
    const result = berekenProcessStatus(data);
    // intern_akkoord is de actieve fase, NIET oplevering
    expect(result.huidige_stap).toBe("intern_akkoord");
    // oplevering is toekomstig en draagt de blocker van de actieve fase (calculatie_niet_akkoord)
    const oplFase = result.fasen.find((f) => f.sleutel === "oplevering")!;
    expect(oplFase.toestand).toBe("toekomstig");
    expect(oplFase.blocker_code).toBe("calculatie_niet_akkoord");
  });
});

// ── berekenPublicatieReadiness ────────────────────────────────────────────────

describe("berekenPublicatieReadiness — volledige geordende fail-closed keten", () => {
  // Bouwstenen om een "volledig afgeronde" keten stapsgewijs te bereiken.
  function ketenTotEnMet(fase: string, gebouwId = 1): GebouwProcessData {
    let data = legeData(gebouwId);
    // concept
    if (["concept", "intern_akkoord", "offerte", "opdracht", "uitvoering", "oplevering"].indexOf(fase) >= 0) {
      // niet-verloren calculatie → concept afgerond
      data = metCalculatie(data, fase === "concept" ? "concept" : "intern_akkoord");
    }
    if (["offerte", "opdracht", "uitvoering", "oplevering"].indexOf(fase) >= 0) {
      data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    }
    if (["opdracht", "uitvoering", "oplevering"].indexOf(fase) >= 0) {
      // opdracht bestaat maar is nog actief tot 'uitvoering'
      const opdrachtStatus = ["uitvoering", "oplevering"].indexOf(fase) >= 0 ? "afgerond" : "actief";
      data = metOpdracht(data, { status: opdrachtStatus, offerteId: 10 });
    }
    if (fase === "oplevering") {
      data = metRapport(data, { status: "definitief", bevrorenOp: new Date() });
    }
    return data;
  }

  it("mag publiceren pas als de VOLLEDIGE keten is afgerond (all_afgerond=true)", () => {
    const data = ketenTotEnMet("oplevering");
    const r = berekenPublicatieReadiness(data);
    expect(r.mag_publiceren).toBe(true);
    expect(r.blocker).toBeNull();
  });

  // ── Volledige geordende matrix: elke ontbrekende fase levert die fase-blocker ──

  it("geen calculatie → geen_calculatie", () => {
    const r = berekenPublicatieReadiness(legeData(3));
    expect(r.mag_publiceren).toBe(false);
    expect(r.blocker?.code).toBe("geen_calculatie");
    expect(r.blocker?.action_path).toBe("/gebouwen/3?tab=calculaties");
  });

  it("calculatie in concept (niet akkoord) → calculatie_niet_akkoord", () => {
    const data = metCalculatie(legeData(4), "concept");
    const r = berekenPublicatieReadiness(data);
    expect(r.blocker?.code).toBe("calculatie_niet_akkoord");
    expect(r.blocker?.action_path).toBe("/gebouwen/4?tab=calculaties");
  });

  it("intern akkoord maar geen ondertekende offerte → geen_ondertekende_offerte", () => {
    const data = metCalculatie(legeData(5), "intern_akkoord");
    const r = berekenPublicatieReadiness(data);
    expect(r.blocker?.code).toBe("geen_ondertekende_offerte");
    expect(r.blocker?.action_path).toBe("/gebouwen/5?tab=offertes");
  });

  it("offerte enkel geaccepteerd (geen handtekening) → geen_ondertekende_offerte", () => {
    let data = metCalculatie(legeData(6), "intern_akkoord");
    data = metOfferte(data, { status: "geaccepteerd", portaalStatus: "geaccepteerd", heeftHandtekening: false });
    const r = berekenPublicatieReadiness(data);
    expect(r.blocker?.code).toBe("geen_ondertekende_offerte");
  });

  it("ondertekende offerte maar geen opdracht → geen_opdracht", () => {
    let data = metCalculatie(legeData(7), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    const r = berekenPublicatieReadiness(data);
    expect(r.blocker?.code).toBe("geen_opdracht");
    expect(r.blocker?.action_path).toBe("/gebouwen/7?tab=offertes");
  });

  it("opdracht gekoppeld aan NIET-ondertekende offerte → geen_opdracht (mismatch)", () => {
    let data = metCalculatie(legeData(8), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "actief", offerteId: 999 }); // andere offerte
    const r = berekenPublicatieReadiness(data);
    expect(r.blocker?.code).toBe("geen_opdracht");
  });

  it("opdracht geannuleerd → geen_opdracht", () => {
    let data = metCalculatie(legeData(9), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "geannuleerd", offerteId: 10 });
    const r = berekenPublicatieReadiness(data);
    expect(r.blocker?.code).toBe("geen_opdracht");
  });

  it("opdracht actief (niet afgerond) → opdracht_niet_afgerond (uitvoering)", () => {
    let data = metCalculatie(legeData(10), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "actief", offerteId: 10 });
    const r = berekenPublicatieReadiness(data);
    expect(r.blocker?.code).toBe("opdracht_niet_afgerond");
    expect(r.blocker?.action_path).toBe("/gebouwen/10?tab=opdrachten");
  });

  it("opdracht afgerond maar geen rapport → geen_definitief_rapport (oplevering)", () => {
    let data = metCalculatie(legeData(11), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 10 });
    const r = berekenPublicatieReadiness(data);
    expect(r.blocker?.code).toBe("geen_definitief_rapport");
    expect(r.blocker?.action_path).toBe("/gebouwen/11?tab=rapporten");
  });

  it("rapport concept (niet definitief) → geen_definitief_rapport", () => {
    let data = metCalculatie(legeData(), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 10 });
    data = metRapport(data, { status: "concept", bevrorenOp: null });
    expect(berekenPublicatieReadiness(data).blocker?.code).toBe("geen_definitief_rapport");
  });

  it("definitief maar niet bevroren → geen_definitief_rapport", () => {
    let data = metCalculatie(legeData(), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 10 });
    data = metRapport(data, { status: "definitief", bevrorenOp: null });
    expect(berekenPublicatieReadiness(data).blocker?.code).toBe("geen_definitief_rapport");
  });

  it("rapport vervangen → geen_definitief_rapport", () => {
    let data = metCalculatie(legeData(), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 10 });
    data = metRapport(data, { status: "definitief", bevrorenOp: new Date(), vervangenDoorId: 2 });
    expect(berekenPublicatieReadiness(data).blocker?.code).toBe("geen_definitief_rapport");
  });

  // ── Tegenstrijdige-data matrix: latere fasen "af" maar vroegere ontbreekt ──────
  // Blocker moet ALTIJD op de VROEGSTE ontbrekende fase vallen (fail closed).

  it("tegenstrijdig: ondertekende offerte + afgeronde opdracht + definitief rapport MAAR geen calculatie → geen_calculatie", () => {
    let data = legeData(20); // geen calculatie
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 10 });
    data = metRapport(data, { status: "definitief", bevrorenOp: new Date() });
    const r = berekenPublicatieReadiness(data);
    expect(r.mag_publiceren).toBe(false);
    expect(r.blocker?.code).toBe("geen_calculatie");
  });

  it("tegenstrijdig: alles af MAAR calculatie niet-akkoord (concept) → calculatie_niet_akkoord", () => {
    let data = metCalculatie(legeData(21), "concept"); // wel calculatie, geen intern akkoord
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 10 });
    data = metRapport(data, { status: "definitief", bevrorenOp: new Date() });
    const r = berekenPublicatieReadiness(data);
    expect(r.blocker?.code).toBe("calculatie_niet_akkoord");
  });

  it("tegenstrijdig: alles af MAAR offerte enkel geaccepteerd → geen_ondertekende_offerte", () => {
    let data = metCalculatie(legeData(22), "intern_akkoord");
    data = metOfferte(data, { status: "geaccepteerd", portaalStatus: "geaccepteerd", heeftHandtekening: false, id: 10 });
    // opdracht gekoppeld aan die (niet-ondertekende) offerte + rapport
    data = metOpdracht(data, { status: "afgerond", offerteId: 10 });
    data = metRapport(data, { status: "definitief", bevrorenOp: new Date() });
    const r = berekenPublicatieReadiness(data);
    expect(r.blocker?.code).toBe("geen_ondertekende_offerte");
  });

  it("tegenstrijdig: afgeronde opdracht op MISMATCHED offerte + definitief rapport → geen_opdracht", () => {
    let data = metCalculatie(legeData(23), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 777 }); // niet gekoppeld aan ondertekende offerte
    data = metRapport(data, { status: "definitief", bevrorenOp: new Date() });
    const r = berekenPublicatieReadiness(data);
    expect(r.blocker?.code).toBe("geen_opdracht");
  });

  it("tegenstrijdig: definitief rapport MAAR opdracht nog actief → opdracht_niet_afgerond", () => {
    let data = metCalculatie(legeData(24), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "actief", offerteId: 10 });
    data = metRapport(data, { status: "definitief", bevrorenOp: new Date() });
    const r = berekenPublicatieReadiness(data);
    expect(r.blocker?.code).toBe("opdracht_niet_afgerond");
  });

  it("blocker code/message/action_path zijn identiek aan de fase-conditie in processtatus (UI/server-pariteit)", () => {
    // Kies een keten die op 'opdracht' blokkeert
    let data = metCalculatie(legeData(25), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    const status = berekenProcessStatus(data);
    // De actieve fase levert action_path/label; de toekomstige fasen dragen de blocker_code
    // van diezelfde actieve fase → publicatie-readiness moet daar exact op aansluiten.
    const actieveFase = status.fasen.find((f) => f.sleutel === status.huidige_stap);
    const toekomstigeFase = status.fasen.find((f) => f.toestand === "toekomstig");
    const r = berekenPublicatieReadiness(data);
    expect(r.blocker?.code).toBe(toekomstigeFase?.blocker_code);
    expect(r.blocker?.message).toBe(toekomstigeFase?.blocker_message);
    expect(r.blocker?.action_path).toBe(actieveFase?.action_path);
    expect(r.blocker?.action_label).toBe(actieveFase?.action_label);
  });

  it("mag publiceren via opdracht voor de TWEEDE ondertekende offerte (set-semantiek)", () => {
    let data = metCalculatie(legeData(), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOfferte(data, { status: "geaccepteerd", portaalStatus: "ondertekend", heeftHandtekening: true, id: 11 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 11 });
    data = metRapport(data, { status: "definitief", bevrorenOp: new Date() });
    expect(berekenPublicatieReadiness(data).mag_publiceren).toBe(true);
  });

  // ── Duplicate-rapport tegenstrijdigheidsmatrix ───────────────────────────────

  it("twee huidig-definitief-bevroren rapporten → mag_publiceren false (fail closed)", () => {
    let data = metCalculatie(legeData(60), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 10 });
    data = metRapport(data, { id: 30, status: "definitief", bevrorenOp: new Date() });
    data = metRapport(data, { id: 31, status: "definitief", bevrorenOp: new Date() });
    const r = berekenPublicatieReadiness(data);
    expect(r.mag_publiceren).toBe(false);
  });

  it("twee rapporten → blocker.code === meerdere_definitieve_rapporten", () => {
    let data = metCalculatie(legeData(61), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 10 });
    data = metRapport(data, { id: 30, status: "definitief", bevrorenOp: new Date() });
    data = metRapport(data, { id: 31, status: "definitief", bevrorenOp: new Date() });
    const r = berekenPublicatieReadiness(data);
    expect(r.blocker?.code).toBe(MEERDERE_RAPPORTEN_BLOCKER.code);
    expect(r.blocker?.code).toBe("meerdere_definitieve_rapporten");
  });

  it("twee rapporten → blocker.message bevat uitleg over meerdere rapporten", () => {
    let data = metCalculatie(legeData(62), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 10 });
    data = metRapport(data, { id: 30, status: "definitief", bevrorenOp: new Date() });
    data = metRapport(data, { id: 31, status: "definitief", bevrorenOp: new Date() });
    const r = berekenPublicatieReadiness(data);
    expect(r.blocker?.message).toBe(MEERDERE_RAPPORTEN_BLOCKER.message);
  });

  it("twee rapporten → blocker.action_path wijst naar rapporten-tab", () => {
    let data = metCalculatie(legeData(63), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 10 });
    data = metRapport(data, { id: 30, status: "definitief", bevrorenOp: new Date() });
    data = metRapport(data, { id: 31, status: "definitief", bevrorenOp: new Date() });
    const r = berekenPublicatieReadiness(data);
    expect(r.blocker?.action_path).toBe("/gebouwen/63?tab=rapporten");
    expect(r.blocker?.action_label).toBe(MEERDERE_RAPPORTEN_BLOCKER.action_label);
    expect(r.blocker?.action_label).toBe("Opleverrapporten controleren");
  });

  it("NIET meerdere_definitieve_rapporten als 0 rapporten (generieke geen_definitief_rapport)", () => {
    let data = metCalculatie(legeData(64), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 10 });
    const r = berekenPublicatieReadiness(data);
    expect(r.blocker?.code).toBe("geen_definitief_rapport");
  });

  it("pariteit: readiness blocker code/action zijn gelijk aan de actieve fase van processtatus (meerdere rapporten)", () => {
    let data = metCalculatie(legeData(65), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 10 });
    data = metRapport(data, { id: 30, status: "definitief", bevrorenOp: new Date() });
    data = metRapport(data, { id: 31, status: "definitief", bevrorenOp: new Date() });
    const processResult = berekenProcessStatus(data);
    const readiness = berekenPublicatieReadiness(data);
    // De actieve fase in processtatus is oplevering
    expect(processResult.huidige_stap).toBe("oplevering");
    const actieveFase = processResult.fasen.find((f) => f.sleutel === "oplevering")!;
    // Readiness blocker action_path en action_label moeten matchen
    expect(readiness.blocker?.action_path).toBe(actieveFase.action_path);
    expect(readiness.blocker?.action_label).toBe(actieveFase.action_label);
    // Toekomstige fasen zouden meerdere_definitieve_rapporten code dragen
    // (er zijn er geen — oplevering is de laatste fase)
    expect(processResult.fasen.filter((f) => f.toestand === "toekomstig")).toHaveLength(0);
  });
});

// ── stelPublicatiePreviewSamen ────────────────────────────────────────────────

describe("stelPublicatiePreviewSamen", () => {
  it("geblokkeerd preview heeft mag_publiceren=false en blocker", () => {
    const data = legeData();
    const preview = stelPublicatiePreviewSamen(data);
    expect(preview.mag_publiceren).toBe(false);
    expect(preview.blocker).not.toBeNull();
    // Lege data blokkeert op de VROEGSTE ontbrekende fase: geen calculatie
    expect(preview.blocker?.code).toBe("geen_calculatie");
  });

  it("bestemming is altijd FPS One", () => {
    expect(stelPublicatiePreviewSamen(legeData()).bestemming).toBe("FPS One");
  });

  it("altijd gebouw_data als eerste content item", () => {
    const preview = stelPublicatiePreviewSamen(legeData());
    expect(preview.content_items[0]).toMatchObject({ type: "gebouw_data", bron_id: null });
  });

  it("geen phantom bijlagen/tekeningen als rapport geen bijlagen/tekeningen heeft", () => {
    let data = metCalculatie(legeData(), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 10 });
    data = metRapport(data, {
      status: "definitief",
      bevrorenOp: new Date(),
      bijlagenIds: [],
      tekeningIds: [],
    });
    const preview = stelPublicatiePreviewSamen(data);
    // Exact 2 items: gebouw_data + opleverrapport
    expect(preview.content_items.length).toBe(2);
    expect(preview.content_items[0].type).toBe("gebouw_data");
    expect(preview.content_items[1].type).toBe("opleverrapport");
    // Geen bijlage/tekening placeholder
    expect(preview.content_items.some((i) => i.type === "bijlage")).toBe(false);
    expect(preview.content_items.some((i) => i.type === "tekening")).toBe(false);
  });

  it("lijst exacte bijlage-ids als bijlagenIds gevuld zijn", () => {
    let data = metCalculatie(legeData(), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 10 });
    data = metRapport(data, {
      id: 30,
      status: "definitief",
      bevrorenOp: new Date(),
      bijlagenIds: [101, 102],
      tekeningIds: [],
      bevrorenDocumentRevisies: {
        "101": { revisie_nummer: 3, naam: "Brandwerende aftichting plan A" },
        "102": { revisie_nummer: 1, naam: "Certificaat" },
      },
    });
    const preview = stelPublicatiePreviewSamen(data);
    const bijlageItems = preview.content_items.filter((i) => i.type === "bijlage");
    expect(bijlageItems.length).toBe(2);
    expect(bijlageItems[0].bron_id).toBe(101);
    expect(bijlageItems[0].label).toBe("Bijlage: Brandwerende aftichting plan A");
    expect(bijlageItems[1].bron_id).toBe(102);
    expect(bijlageItems[1].label).toBe("Bijlage: Certificaat");
  });

  it("lijst exacte tekening-ids als tekeningIds gevuld zijn", () => {
    let data = metCalculatie(legeData(), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 10 });
    data = metRapport(data, {
      id: 30,
      status: "definitief",
      bevrorenOp: new Date(),
      bijlagenIds: [],
      tekeningIds: [201, 202],
      bevrorenDocumentRevisies: {
        "201": { revisie_nummer: 2, naam: "Plattegrond begane grond" },
      },
    });
    const preview = stelPublicatiePreviewSamen(data);
    const tekeningItems = preview.content_items.filter((i) => i.type === "tekening");
    expect(tekeningItems.length).toBe(2);
    expect(tekeningItems[0].bron_id).toBe(201);
    expect(tekeningItems[0].label).toBe("Tekening: Plattegrond begane grond");
    expect(tekeningItems[1].bron_id).toBe(202);
    // Geen naam in bevroren revisies → fallback label
    expect(tekeningItems[1].label).toContain("202");
  });

  it("rapport zonder bevroren revisie-metadata → fallback label met document-id", () => {
    let data = metCalculatie(legeData(), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 10 });
    data = metRapport(data, {
      status: "definitief",
      bevrorenOp: new Date(),
      bijlagenIds: [999],
      bevrorenDocumentRevisies: null,
    });
    const preview = stelPublicatiePreviewSamen(data);
    const bijlage = preview.content_items.find((i) => i.type === "bijlage");
    expect(bijlage?.bron_id).toBe(999);
    expect(bijlage?.label).toContain("999");
  });

  it("rapport-label bevat titel als aanwezig", () => {
    let data = metCalculatie(legeData(), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 10 });
    data = metRapport(data, {
      id: 30,
      status: "definitief",
      bevrorenOp: new Date(),
      titel: "Eindrapport fase 2",
    });
    const preview = stelPublicatiePreviewSamen(data);
    const rapportItem = preview.content_items.find((i) => i.type === "opleverrapport");
    expect(rapportItem?.label).toContain("Eindrapport fase 2");
    expect(rapportItem?.bron_id).toBe(30);
  });

  it("geen rapport → enkel gebouw_data in content_items", () => {
    const data = legeData();
    const preview = stelPublicatiePreviewSamen(data);
    expect(preview.content_items.length).toBe(1);
    expect(preview.content_items[0].type).toBe("gebouw_data");
  });

  it("opdrachtgever uit partijen (organisatienaam gaat voor)", () => {
    const data: GebouwProcessData = {
      ...legeData(),
      partijen: [
        { type: "opdrachtgever", naam: "Jan Jansen", organisatie: "FPS BV", email: null },
      ],
    };
    expect(stelPublicatiePreviewSamen(data).opdrachtgever).toBe("FPS BV");
  });

  it("opdrachtgever valt terug op naam als geen organisatie", () => {
    const data: GebouwProcessData = {
      ...legeData(),
      partijen: [
        { type: "opdrachtgever", naam: "Jan Jansen", organisatie: null, email: null },
      ],
    };
    expect(stelPublicatiePreviewSamen(data).opdrachtgever).toBe("Jan Jansen");
  });

  it("opdrachtgever is null als er geen opdrachtgever-partij is", () => {
    const data: GebouwProcessData = {
      ...legeData(),
      partijen: [
        { type: "beheerder", naam: "Piet", organisatie: null, email: "piet@fps.nl" },
      ],
    };
    expect(stelPublicatiePreviewSamen(data).opdrachtgever).toBeNull();
  });

  it("ontvangers: alleen partijen met e-mail, leeg als geen e-mails", () => {
    const data: GebouwProcessData = {
      ...legeData(),
      partijen: [
        { type: "opdrachtgever", naam: "Geen mail", organisatie: null, email: null },
        { type: "beheerder", naam: "Met mail", organisatie: "Org", email: "beheer@fps.nl" },
      ],
    };
    const preview = stelPublicatiePreviewSamen(data);
    expect(preview.ontvangers.length).toBe(1);
    expect(preview.ontvangers[0].naam).toBe("Met mail");
    expect(preview.ontvangers[0].email).toBe("beheer@fps.nl");
  });

  it("ontvangers is lege array als geen partijen e-mail hebben", () => {
    const preview = stelPublicatiePreviewSamen(legeData());
    expect(preview.ontvangers).toEqual([]);
  });

  it("gevolg_tekst en intrekking_gevolg_tekst zijn niet leeg", () => {
    const preview = stelPublicatiePreviewSamen(legeData());
    expect(preview.gevolg_tekst.length).toBeGreaterThan(10);
    expect(preview.intrekking_gevolg_tekst.length).toBeGreaterThan(10);
  });

  it("process_status is aanwezig en heeft 6 fasen", () => {
    const preview = stelPublicatiePreviewSamen(legeData());
    expect(preview.process_status.fasen.length).toBe(6);
  });

  // ── Ambiguïteit: preview bij duplicate rapporten ──────────────────────────────

  it("twee huidig-definitief-bevroren rapporten → mag_publiceren false in preview", () => {
    let data = metCalculatie(legeData(), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 10 });
    data = metRapport(data, { id: 30, status: "definitief", bevrorenOp: new Date() });
    data = metRapport(data, { id: 31, status: "definitief", bevrorenOp: new Date() });
    const preview = stelPublicatiePreviewSamen(data);
    expect(preview.mag_publiceren).toBe(false);
  });

  it("twee rapporten → blocker code meerdere_definitieve_rapporten in preview", () => {
    let data = metCalculatie(legeData(), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 10 });
    data = metRapport(data, { id: 30, status: "definitief", bevrorenOp: new Date() });
    data = metRapport(data, { id: 31, status: "definitief", bevrorenOp: new Date() });
    const preview = stelPublicatiePreviewSamen(data);
    expect(preview.blocker?.code).toBe("meerdere_definitieve_rapporten");
  });

  it("twee rapporten → GEEN opleverrapport/bijlage/tekening content items (geen willekeurige selectie)", () => {
    let data = metCalculatie(legeData(), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 10 });
    data = metRapport(data, {
      id: 30,
      status: "definitief",
      bevrorenOp: new Date(),
      bijlagenIds: [101, 102],
      tekeningIds: [201],
    });
    data = metRapport(data, {
      id: 31,
      status: "definitief",
      bevrorenOp: new Date(),
      bijlagenIds: [301],
      tekeningIds: [401, 402],
    });
    const preview = stelPublicatiePreviewSamen(data);
    // Enkel gebouw_data — geen rapport/bijlagen/tekeningen van willekeurig rapport
    expect(preview.content_items.length).toBe(1);
    expect(preview.content_items[0].type).toBe("gebouw_data");
    expect(preview.content_items.some((i) => i.type === "opleverrapport")).toBe(false);
    expect(preview.content_items.some((i) => i.type === "bijlage")).toBe(false);
    expect(preview.content_items.some((i) => i.type === "tekening")).toBe(false);
  });

  it("parity: readiness en preview blocker zijn identiek bij duplicate rapporten", () => {
    let data = metCalculatie(legeData(70), "intern_akkoord");
    data = metOfferte(data, { status: "ondertekend", portaalStatus: "concept", heeftHandtekening: true, id: 10 });
    data = metOpdracht(data, { status: "afgerond", offerteId: 10 });
    data = metRapport(data, { id: 30, status: "definitief", bevrorenOp: new Date() });
    data = metRapport(data, { id: 31, status: "definitief", bevrorenOp: new Date() });
    const readiness = berekenPublicatieReadiness(data);
    const preview = stelPublicatiePreviewSamen(data);
    // blocker in preview komt van berekenPublicatieReadiness → moet identiek zijn
    expect(preview.blocker?.code).toBe(readiness.blocker?.code);
    expect(preview.blocker?.message).toBe(readiness.blocker?.message);
    expect(preview.blocker?.action_path).toBe(readiness.blocker?.action_path);
    expect(preview.blocker?.action_label).toBe(readiness.blocker?.action_label);
  });
});
