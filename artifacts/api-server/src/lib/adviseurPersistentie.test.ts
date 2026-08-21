// Deterministische tests voor de pure helpers van de server-eigen
// adviseur-persistentie (task-1202). Geen DB — alleen de pure logica:
// identiteits-/rol-isolatie, begrensde historie, klik-veilige citaties,
// tool-resultaat-citaties.
//
// Draaien: pnpm --filter @workspace/api-server exec tsx src/lib/adviseurPersistentie.test.ts
// (of via de root: vitest run)
import { describe, it, expect } from "vitest";
import {
  isolatieSleutel,
  begrensHistorie,
  bouwCitaties,
  normaliseerCitaties,
  maakAutorisatieHash,
  MAX_HISTORIE_BERICHTEN,
  type HistorieBericht,
} from "./adviseurPersistentie";
import type { AiContextBron } from "./aiGateway";
import type { AutorisatieSnapshot } from "@workspace/permissies";

const AUTH_A = "a".repeat(64);
const AUTH_B = "b".repeat(64);

describe("isolatieSleutel — per actor + effectieve gebruiker + rol", () => {
  it("scheidt dezelfde gebruiker met verschillende effectieve rollen", () => {
    const alsBeheerder = isolatieSleutel(1, 7, "hoofdbeheerder", AUTH_A);
    const alsGebruiker = isolatieSleutel(1, 7, "gebruiker", AUTH_A);
    expect(alsBeheerder).not.toBe(alsGebruiker);
  });

  it("normaliseert hoofdletters en witruimte in de rol", () => {
    expect(isolatieSleutel(1, 3, "  Gebruiker ", AUTH_A)).toBe(isolatieSleutel(1, 3, "gebruiker", AUTH_A));
  });

  it("scheidt verschillende gebruikers met dezelfde rol", () => {
    expect(isolatieSleutel(1, 1, "gebruiker", AUTH_A)).not.toBe(isolatieSleutel(1, 2, "gebruiker", AUTH_A));
  });

  it("valt terug op 'gebruiker' bij lege rol", () => {
    expect(isolatieSleutel(4, 9, "", AUTH_A)).toBe(`4:9:gebruiker:${AUTH_A}`);
  });

  it("actor (beheerder) en effectieve gebruiker geven verschillende sleutels", () => {
    // Beheerder (id=1) impersonating gebruiker (id=5, rol=gebruiker)
    expect(isolatieSleutel(1, 5, "gebruiker", AUTH_A)).not.toBe(
      isolatieSleutel(5, 5, "gebruiker", AUTH_A),
    );
  });

  it("scheidt historie bij intrekking binnen dezelfde gebruiker en rol", () => {
    expect(isolatieSleutel(1, 5, "gebruiker", AUTH_A)).not.toBe(
      isolatieSleutel(1, 5, "gebruiker", AUTH_B),
    );
  });
});

describe("maakAutorisatieHash — iedere queryscope is een harde historiegrens", () => {
  const basis: AutorisatieSnapshot = {
    userId: 5,
    rol: "gebruiker",
    bevoegdheden: [["financieel", 1], ["gebouwen", 1]],
    actieveObjectRechten: [],
    toegewezenGebouwIds: [10],
    werkmaatschappijId: null,
  };

  it.each([
    ["module-intrekking", { ...basis, bevoegdheden: [["financieel", 0], ["gebouwen", 1]] }],
    ["gebouw-intrekking", { ...basis, toegewezenGebouwIds: [] }],
    ["objectrecht-intrekking", {
      ...basis,
      actieveObjectRechten: [{
        id: 1, objectType: "factuur", objectId: 7, moduleId: "financieel",
        niveau: 1, geldigVan: null, geldigTot: null, werkmaatschappijId: null,
      }],
    }],
  ] satisfies Array<[string, AutorisatieSnapshot]>)(
    "wijzigt bij %s",
    (_naam, gewijzigd) => {
      expect(maakAutorisatieHash(gewijzigd)).not.toBe(maakAutorisatieHash(basis));
    },
  );

  it("is stabiel bij een andere object-keyvolgorde", () => {
    const opnieuw = JSON.parse(JSON.stringify(basis)) as AutorisatieSnapshot;
    expect(maakAutorisatieHash(opnieuw)).toBe(maakAutorisatieHash(basis));
  });
});

describe("begrensHistorie — server-sourced, begrensd, chronologisch", () => {
  it("houdt alleen de laatste N berichten", () => {
    const veel: HistorieBericht[] = Array.from({ length: 25 }, (_, i) => ({
      rol: i % 2 === 0 ? "user" : "assistant",
      inhoud: `bericht ${i}`,
    }));
    const uit = begrensHistorie(veel);
    expect(uit.length).toBe(MAX_HISTORIE_BERICHTEN);
    // Laatste is behouden (chronologisch oud → nieuw).
    expect(uit[uit.length - 1]?.inhoud).toBe("bericht 24");
  });

  it("filtert lege en ongeldige rollen weg", () => {
    const uit = begrensHistorie([
      { rol: "user", inhoud: "hoi" },
      { rol: "assistant", inhoud: "   " },
      // @ts-expect-error — bewust ongeldige rol
      { rol: "system", inhoud: "systeem" },
      { rol: "assistant", inhoud: "hallo" },
    ]);
    expect(uit).toEqual([
      { rol: "user", inhoud: "hoi" },
      { rol: "assistant", inhoud: "hallo" },
    ]);
  });

  it("respecteert een custom maximum", () => {
    const drie: HistorieBericht[] = [
      { rol: "user", inhoud: "a" },
      { rol: "assistant", inhoud: "b" },
      { rol: "user", inhoud: "c" },
    ];
    expect(begrensHistorie(drie, 2)).toEqual([
      { rol: "assistant", inhoud: "b" },
      { rol: "user", inhoud: "c" },
    ]);
  });
});

describe("bouwCitaties — klik-veilige interne bronverwijzingen", () => {
  it("maakt een klikbare citatie voor geautoriseerde paginacontext", () => {
    const citaties = bouwCitaties([], { object_type: "gebouw", object_id: 42 });
    expect(citaties).toHaveLength(1);
    expect(citaties[0]?.href).toBe("/gebouwen/42");
    expect(citaties[0]?.entiteitstype).toBe("gebouw");
    expect(citaties[0]?.entiteitId).toBe(42);
  });

  it("negeert onbekende entiteitstypes voor de paginacontext", () => {
    const citaties = bouwCitaties([], { object_type: "onbekend", object_id: 1 });
    expect(citaties).toHaveLength(0);
  });

  it("gebruikt alleen interne app-paden (nooit een externe URL)", () => {
    const bronnen: AiContextBron[] = [
      { type: "document", payload: { entiteitstype: "document", entiteitId: 5 } },
    ];
    const citaties = bouwCitaties(bronnen);
    expect(citaties[0]?.href?.startsWith("/")).toBe(true);
    expect(citaties[0]?.href).toBe("/documenten/5");
  });

  it("gebruikt bestaande Connect-detailroutes voor uitgebreide contexttypen", () => {
    expect(bouwCitaties([], { object_type: "calculatie", object_id: 7 })[0]?.href)
      .toBe("/modules/calculatie/7");
    expect(bouwCitaties([], { object_type: "medewerker", object_id: 8 })[0]?.href)
      .toBe("/personeel/8");
    expect(bouwCitaties([], { object_type: "onderhoud", object_id: 9 })[0]?.href)
      .toBe("/onderhoud/werkbonnen/9");
  });

  it("ontdubbelt paginacontext en contextbron van dezelfde entiteit", () => {
    const bronnen: AiContextBron[] = [
      { type: "workflow", payload: { entiteitstype: "gebouw", entiteitId: 42 } },
    ];
    const citaties = bouwCitaties(bronnen, { object_type: "gebouw", object_id: 42 });
    expect(citaties).toHaveLength(1);
  });

  it("neemt een kennisbron op als niet-klikbare bronvermelding", () => {
    const bronnen: AiContextBron[] = [{ type: "kennisbron", payload: {} }];
    const citaties = bouwCitaties(bronnen);
    expect(citaties).toHaveLength(1);
    expect(citaties[0]?.href).toBeUndefined();
    expect(citaties[0]?.label).toBe("Connect-kennisbank");
  });

  it("voegt tool-resultaat-citaties toe (geen antwoord met getal zonder bron)", () => {
    const toolResultaten = [
      { toolNaam: "tel_offertes", bron: "offertes-tabel van FPS Connect", peildatum: "2025-01-15", href: "/offertes" },
      { toolNaam: "tel_facturen", bron: "facturen-tabel van FPS Connect", peildatum: "2025-01-15", href: "/facturen" },
    ];
    const citaties = bouwCitaties([], undefined, toolResultaten);
    expect(citaties).toHaveLength(2);
    expect(citaties[0]?.label).toBe("tel_offertes");
    expect(citaties[0]?.bron).toBe("offertes-tabel van FPS Connect");
    expect(citaties[0]?.href).toBe("/offertes");
    expect(citaties[1]?.label).toBe("tel_facturen");
  });

  it("ontdubbelt tool-citaties bij herhaalde tool-aanroep", () => {
    const toolResultaten = [
      { toolNaam: "tel_offertes", bron: "offertes-tabel", href: "/offertes" },
      { toolNaam: "tel_offertes", bron: "offertes-tabel (tweede aanroep)", href: "/offertes" },
    ];
    const citaties = bouwCitaties([], undefined, toolResultaten);
    expect(citaties).toHaveLength(1);
  });

  it("negeert tool-resultaten zonder bron", () => {
    const toolResultaten = [
      { toolNaam: "mijn_werkbak" }, // geen bron
    ];
    const citaties = bouwCitaties([], undefined, toolResultaten);
    expect(citaties).toHaveLength(0);
  });

  it("combineert paginacontext-citaties en tool-citaties (geen ontdubbeling over types)", () => {
    const bronnen: AiContextBron[] = [];
    const toolResultaten = [{ toolNaam: "tel_gebouwen", bron: "gebouwen-tabel", href: "/gebouwen" }];
    const citaties = bouwCitaties(bronnen, { object_type: "gebouw", object_id: 1 }, toolResultaten);
    // Paginacontext gebouw:1 + tool tel_gebouwen = 2 citaties
    expect(citaties.length).toBeGreaterThanOrEqual(2);
    const hrefs = citaties.map((c) => c.href);
    expect(hrefs).toContain("/gebouwen/1");
    expect(hrefs).toContain("/gebouwen");
  });
});

describe("normaliseerCitaties — opgeslagen JSON blijft klik-veilig", () => {
  it("weigert externe, protocol-relative en ongeldige links", () => {
    const citaties = normaliseerCitaties([
      { label: "goed", bron: "Connect", href: "/facturen/1", entiteitstype: "factuur", entiteitId: 1 },
      { label: "extern", bron: "fout", href: "https://voorbeeld.nl" },
      { label: "protocol", bron: "fout", href: "//voorbeeld.nl" },
      { label: "", bron: "leeg", href: "/facturen" },
    ]);
    expect(citaties).toEqual([
      {
        label: "goed",
        bron: "Connect",
        href: "/facturen/1",
        entiteitstype: "factuur",
        entiteitId: 1,
      },
      {
        label: "extern",
        bron: "fout",
        href: undefined,
        entiteitstype: undefined,
        entiteitId: undefined,
      },
      {
        label: "protocol",
        bron: "fout",
        href: undefined,
        entiteitstype: undefined,
        entiteitId: undefined,
      },
    ]);
  });
});
