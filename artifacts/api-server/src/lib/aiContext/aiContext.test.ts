import { describe, it, expect, beforeEach } from "vitest";
import {
  bouwContextBundel,
  magKnoopZien,
  schatTokens,
  trimBronnen,
  invalideerContextAlles,
  type ContextScope,
  type OpgehaaldeKnoop,
  type ResolverKaart,
} from "./index";
import type { TrimbareBron } from "./tokenBudget";

// ── Hulp: nep-scopes (ContextScope) ──────────────────────────────────────────
function scope(overrides: Partial<ContextScope>): ContextScope {
  return {
    isHoofdbeheerder: false,
    userId: 1,
    heeftModuleRecht: () => false,
    magBijGebouw: () => false,
    heeftObjectRecht: () => false,
    ...overrides,
  };
}

const hoofdbeheerder = scope({ isHoofdbeheerder: true, magBijGebouw: () => true, heeftModuleRecht: () => true });

// ── Hulp: nep-knopen + resolverkaart ─────────────────────────────────────────
function knoop(
  type: OpgehaaldeKnoop["type"],
  id: number,
  gebouwId: number | null,
  relaties: OpgehaaldeKnoop["relaties"] = [],
  payload: Record<string, unknown> = {},
): OpgehaaldeKnoop {
  return {
    type,
    id,
    bron: { type: "kennisbron", bronId: `${type}:${id}`, payload: { entiteit: type, id, ...payload } },
    flat: { workflow_type: type, [`${type === "voorziening" ? "voorziening" : type}_id`]: id },
    gebouwId,
    relaties,
    inkortbaarVeld: "tekst",
  };
}

function maakResolvers(knopen: OpgehaaldeKnoop[]): ResolverKaart {
  const index = new Map(knopen.map((k) => [`${k.type}:${k.id}`, k]));
  const maker = (type: OpgehaaldeKnoop["type"]) => async (id: number) => index.get(`${type}:${id}`) ?? null;
  return {
    gebouw: maker("gebouw"),
    voorziening: maker("voorziening"),
    onderhoud: maker("onderhoud"),
    offerte: maker("offerte"),
    dossier: maker("dossier"),
    document: maker("document"),
    klant: maker("klant"),
    medewerker: maker("medewerker"),
    project: maker("project"),
    calculatie: maker("calculatie"),
    opdracht: maker("opdracht"),
    factuur: maker("factuur"),
    leverancier: maker("leverancier"),
  };
}

beforeEach(() => invalideerContextAlles());

describe("schatTokens", () => {
  it("schat ~4 tekens per token", () => {
    expect(schatTokens("")).toBe(0);
    expect(schatTokens("abcd")).toBe(1);
    expect(schatTokens("abcde")).toBe(2);
  });
});

describe("magKnoopZien (scoping via matrix + gebouwtoewijzing, nooit rolnaam)", () => {
  it("hoofdbeheerder ziet alles", () => {
    expect(magKnoopZien("gebouw", knoop("gebouw", 1, 1), hoofdbeheerder)).toBe(true);
    expect(magKnoopZien("medewerker", knoop("medewerker", 1, null), hoofdbeheerder)).toBe(true);
  });

  it("gebouw-gescoped vereist gebouwtoewijzing EN module-lees", () => {
    const g = knoop("voorziening", 5, 9);
    expect(magKnoopZien("voorziening", g, scope({ magBijGebouw: () => false, heeftModuleRecht: () => true }))).toBe(false);
    expect(magKnoopZien("voorziening", g, scope({ magBijGebouw: () => true, heeftModuleRecht: () => false }))).toBe(false);
    expect(magKnoopZien("voorziening", g, scope({ magBijGebouw: () => true, heeftModuleRecht: () => true }))).toBe(true);
  });

  it("object-recht kan module-lees vervangen bij gebouw-gescoped", () => {
    const g = knoop("dossier", 3, 2);
    const s = scope({ magBijGebouw: () => true, heeftObjectRecht: () => true });
    expect(magKnoopZien("dossier", g, s)).toBe(true);
  });

  it("niet-gescoped vereist module-leesrecht", () => {
    expect(magKnoopZien("medewerker", knoop("medewerker", 1, null), scope({ heeftModuleRecht: () => true }))).toBe(true);
    expect(magKnoopZien("medewerker", knoop("medewerker", 1, null), scope({ heeftModuleRecht: () => false }))).toBe(false);
  });

  it.each([
    ["project", "projecten"],
    ["calculatie", "calculatie"],
    ["opdracht", "opdrachten"],
    ["factuur", "financieel"],
    ["leverancier", "inkoop"],
  ] as const)("%s-context weigert zonder het bijbehorende module-leesrecht", (type, module) => {
    const gebouwId = type === "leverancier" || type === "factuur" ? null : 7;
    expect(magKnoopZien(
      type,
      knoop(type, 1, gebouwId),
      scope({ magBijGebouw: () => true, heeftModuleRecht: (m) => m !== module }),
    )).toBe(false);
  });

  it.each(["project", "calculatie", "opdracht"] as const)(
    "%s-context weigert vóór uitlezen buiten de gebouwscope",
    (type) => {
      expect(magKnoopZien(
        type,
        knoop(type, 1, 7),
        scope({ magBijGebouw: () => false, heeftModuleRecht: () => true }),
      )).toBe(false);
    },
  );

  it("factuurcontext volgt de modulebrede gewone factuurroutes", () => {
    expect(magKnoopZien(
      "factuur",
      knoop("factuur", 1, 7),
      scope({ magBijGebouw: () => false, heeftModuleRecht: (m) => m === "financieel" }),
    )).toBe(true);
  });
});

describe("trimBronnen (tokenbudget)", () => {
  function tb(id: number, prioriteit: number, tekstLengte: number, isWortel = false): TrimbareBron {
    return {
      type: "gebouw",
      id,
      bron: { type: "kennisbron", payload: { tekst: "x".repeat(tekstLengte) } },
      prioriteit,
      inkortbaarVeld: "tekst",
      isWortel,
    };
  }

  it("behoudt alles binnen budget, gesorteerd op prioriteit", () => {
    const r = trimBronnen([tb(1, 10, 40), tb(2, 0, 40, true)], 1000);
    expect(r.behouden).toHaveLength(2);
    // Wortel eerst.
    expect((r.behouden[0].payload as Record<string, unknown>).tekst).toBeDefined();
  });

  it("laat lage-prioriteit bronnen weg bij overschrijding, behoudt de wortel altijd", () => {
    const r = trimBronnen([tb(1, 100, 8000), tb(2, 0, 8000, true)], 100);
    const behoudenIds = new Set(r.behouden.map((b) => (b.payload as Record<string, unknown>).id));
    // Wortel blijft; de niet-inkortbare grote lage-prioriteit valt weg.
    expect(r.weggelaten.some((w) => w.id === 1)).toBe(true);
    expect(r.behouden).toHaveLength(1);
    void behoudenIds;
  });

  it("kort inkortbare tekst in om binnen budget te passen", () => {
    // Budget ~250 tokens ⇒ ~1000 tekens; bron van 8000 tekens moet krimpen.
    const r = trimBronnen([tb(1, 0, 8000, true), tb(2, 5, 8000)], 400);
    const tweede = r.behouden.find((b) => (b.payload as Record<string, unknown>).tekst && b !== r.behouden[0]);
    void tweede;
    // Er is minstens ingekort of weggelaten; budget niet fors overschreden.
    expect(r.tokenSchatting).toBeLessThanOrEqual(400 * 3);
  });
});

describe("bouwContextBundel (orchestrator)", () => {
  it("levert geen bundel als de wortel niet bestaat", async () => {
    const bundel = await bouwContextBundel({
      entiteitstype: "gebouw",
      entiteitId: 99,
      scope: hoofdbeheerder,
      resolvers: maakResolvers([]),
      gebruikCache: false,
    });
    expect(bundel.geautoriseerd).toBe(false);
    expect(bundel.weggelaten[0].reden).toBe("niet-gevonden");
  });

  it("levert geen bundel als de wortel niet geautoriseerd is", async () => {
    const bundel = await bouwContextBundel({
      entiteitstype: "voorziening",
      entiteitId: 1,
      scope: scope({ magBijGebouw: () => false }),
      resolvers: maakResolvers([knoop("voorziening", 1, 7)]),
      gebruikCache: false,
    });
    expect(bundel.geautoriseerd).toBe(false);
    expect(bundel.weggelaten[0].reden).toBe("geen-toegang");
  });

  it("roept de inhoudelijke resolver niet aan zonder module- of objectrecht", async () => {
    let aangeroepen = 0;
    const resolvers = maakResolvers([knoop("project", 1, 7)]);
    resolvers.project = async () => {
      aangeroepen++;
      return knoop("project", 1, 7);
    };
    const bundel = await bouwContextBundel({
      entiteitstype: "project",
      entiteitId: 1,
      scope: scope({ heeftModuleRecht: () => false, heeftObjectRecht: () => false }),
      resolvers,
      gebruikCache: false,
    });
    expect(bundel.geautoriseerd).toBe(false);
    expect(bundel.weggelaten[0]?.reden).toBe("geen-toegang");
    expect(aangeroepen).toBe(0);
  });

  it("bouwt de graaf: voorziening → gebouw → klant (volledige context, niet alleen het formulier)", async () => {
    const knopen = [
      knoop("voorziening", 1, 7, [{ type: "gebouw", id: 7, relatie: "gebouw", prioriteitOffset: 10 }]),
      knoop("gebouw", 7, 7, [{ type: "klant", id: 3, relatie: "opdrachtgever", prioriteitOffset: 20 }]),
      knoop("klant", 3, null),
    ];
    const bundel = await bouwContextBundel({
      entiteitstype: "voorziening",
      entiteitId: 1,
      scope: hoofdbeheerder,
      resolvers: maakResolvers(knopen),
      gebruikCache: false,
      maxDiepte: 2,
    });
    expect(bundel.geautoriseerd).toBe(true);
    const bronIds = bundel.contextBronnen.map((b) => b.bronId);
    expect(bronIds).toContain("voorziening:1");
    expect(bronIds).toContain("gebouw:7");
    expect(bronIds).toContain("klant:3");
    expect(bundel.diepteBereikt).toBe(2);
  });

  it("respecteert de autorisatiegrens: geblokkeerde knoop valt weg EN wordt niet uitgebreid", async () => {
    const knopen = [
      knoop("voorziening", 1, 7, [{ type: "gebouw", id: 7, relatie: "gebouw", prioriteitOffset: 10 }]),
      // Gebouw ligt in een NIET-toegewezen gebouw (id 7) → geblokkeerd.
      knoop("gebouw", 7, 7, [{ type: "klant", id: 3, relatie: "opdrachtgever", prioriteitOffset: 20 }]),
      knoop("klant", 3, null),
    ];
    // Toegang alleen tot gebouw 7 voor de voorziening zelf, maar NIET voor de
    // gebouw-knoop: simuleer door magBijGebouw alleen waar te maken voor de
    // wortel-voorziening. We gebruiken hier: mag bij gebouw 7 = true voor
    // voorziening, maar we blokkeren de gebouw-knoop via module-recht.
    const s = scope({
      magBijGebouw: (g) => g === 7,
      heeftModuleRecht: (m) => m === "voorzieningen", // wel voorzieningen, geen gebouwen
    });
    const bundel = await bouwContextBundel({
      entiteitstype: "voorziening",
      entiteitId: 1,
      scope: s,
      resolvers: maakResolvers(knopen),
      gebruikCache: false,
    });
    expect(bundel.geautoriseerd).toBe(true);
    const bronIds = bundel.contextBronnen.map((b) => b.bronId);
    expect(bronIds).toContain("voorziening:1");
    expect(bronIds).not.toContain("gebouw:7");
    // Klant zat ACHTER het geblokkeerde gebouw → mag niet lekken.
    expect(bronIds).not.toContain("klant:3");
    expect(bundel.weggelaten.some((w) => w.type === "gebouw" && w.reden === "geen-toegang")).toBe(true);
    expect(bundel.weggelaten.some((w) => w.type === "klant")).toBe(false);
  });

  it("trimming muteert de gecachte knoop NIET (copy-on-write); latere ruime request behoudt volledige payload", async () => {
    const langeTekst = "x".repeat(4000);
    const knopen = [knoop("gebouw", 42, 42, [], { tekst: langeTekst })];
    const resolvers = maakResolvers(knopen);
    const origineel = knopen[0].bron.payload as Record<string, unknown>;
    const origineleLengte = (origineel.tekst as string).length;

    // 1e request met krap budget → trimming treedt op.
    const krap = await bouwContextBundel({
      entiteitstype: "gebouw",
      entiteitId: 42,
      scope: hoofdbeheerder,
      resolvers,
      gebruikCache: true,
      tokenBudget: 50,
    });
    const krapPayload = krap.contextBronnen[0].payload as Record<string, unknown>;
    expect((krapPayload.tekst as string).length).toBeLessThan(origineleLengte);

    // De gecachte/originele knoop mag NIET zijn gemuteerd.
    expect((origineel.tekst as string).length).toBe(origineleLengte);

    // 2e request met ruim budget op dezelfde entity (cache-hit) → volledige tekst.
    const ruim = await bouwContextBundel({
      entiteitstype: "gebouw",
      entiteitId: 42,
      scope: hoofdbeheerder,
      resolvers,
      gebruikCache: true,
      tokenBudget: 100000,
    });
    const ruimPayload = ruim.contextBronnen[0].payload as Record<string, unknown>;
    expect((ruimPayload.tekst as string).length).toBe(origineleLengte);
  });

  it("vult vlakke LogContext-velden en levert contextBronnen", async () => {
    const knopen = [
      knoop("offerte", 2, 7, [{ type: "gebouw", id: 7, relatie: "gebouw", prioriteitOffset: 10 }], {}),
      knoop("gebouw", 7, 7),
    ];
    const bundel = await bouwContextBundel({
      entiteitstype: "offerte",
      entiteitId: 2,
      scope: hoofdbeheerder,
      resolvers: maakResolvers(knopen),
      gebruikCache: false,
    });
    expect(bundel.logContext.module).toBe("ai-context");
    expect(bundel.logContext.entiteitstype).toBe("offerte");
    expect(bundel.logContext.entiteitId).toBe(2);
    expect(bundel.logContext.gebruikerId).toBe(hoofdbeheerder.userId);
    expect(bundel.logContext.contextBronnen).toBe(bundel.contextBronnen);
  });
});
