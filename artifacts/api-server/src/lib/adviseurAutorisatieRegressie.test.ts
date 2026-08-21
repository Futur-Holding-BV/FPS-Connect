import { describe, expect, it } from "vitest";
import { PermissieEngine, type PermissieContext } from "@workspace/permissies";
import {
  isolatieSleutel,
  maakAutorisatieHash,
  type HistorieBericht,
} from "./adviseurPersistentie";

function gesprekSleutel(ctx: PermissieContext): string {
  const engine = new PermissieEngine(ctx);
  return isolatieSleutel(
    1,
    ctx.userId,
    ctx.rol,
    maakAutorisatieHash(engine.autorisatieSnapshot),
  );
}

/**
 * Simuleert precies de server-eigen opslagselectie die GET /adviseur/gesprek
 * en POST /adviseur/vraag delen: historie wordt uitsluitend via de actuele
 * actor+gebruiker+rol+autorisatiehash benaderd.
 */
describe("adviseurhistorie na rechtenintrekking", () => {
  const basis: PermissieContext = {
    userId: 5,
    rol: "gebruiker",
    bevoegdheden: {
      financieel: 1,
      gebouwen: 1,
      voorzieningen: 2,
    },
    objectRechten: [{
      id: 7,
      objectType: "factuur",
      objectId: 88,
      moduleId: "financieel",
      niveau: 1,
      geldigVan: null,
      geldigTot: null,
      werkmaatschappijId: null,
    }],
    toegewezenGebouwIds: [42],
    nu: new Date("2026-08-21T10:00:00.000Z"),
  };

  it.each([
    ["module", { ...basis, bevoegdheden: { ...basis.bevoegdheden, financieel: 0 } }],
    ["gebouw", { ...basis, toegewezenGebouwIds: [] }],
    ["object", { ...basis, objectRechten: [] }],
  ] satisfies Array<[string, PermissieContext]>)(
    "GET en een vervolgprompt krijgen na %s-intrekking geen oude beschermde inhoud",
    (_soort, ingetrokken) => {
      const opslag = new Map<string, HistorieBericht[]>();
      const ruimeSleutel = gesprekSleutel(basis);
      opslag.set(ruimeSleutel, [
        { rol: "user", inhoud: "Wat is het factuurbedrag?" },
        { rol: "assistant", inhoud: "Factuur 88 bedraagt € 12.345. [1]" },
      ]);

      const beperkteSleutel = gesprekSleutel(ingetrokken);
      expect(beperkteSleutel).not.toBe(ruimeSleutel);

      // GET /adviseur/gesprek selecteert de nieuwe snapshot: leeg.
      const getHistorie = opslag.get(beperkteSleutel) ?? [];
      expect(getHistorie).toEqual([]);

      // POST /adviseur/vraag bouwt de modelprompt uit exact dezelfde selectie.
      const vervolgprompt = [
        ...getHistorie,
        { rol: "user" as const, inhoud: "En kun je dat toelichten?" },
      ];
      expect(JSON.stringify(vervolgprompt)).not.toContain("12.345");
      expect(JSON.stringify(vervolgprompt)).not.toContain("Factuur 88");
    },
  );

  it("een verlopen tijdgebonden objectrecht wijzigt de gesprekssleutel", () => {
    const voorVerloop = gesprekSleutel(basis);
    const naVerloop = gesprekSleutel({
      ...basis,
      nu: new Date("2026-08-22T10:00:00.000Z"),
      objectRechten: [{
        ...basis.objectRechten[0]!,
        geldigTot: new Date("2026-08-22T09:00:00.000Z"),
      }],
    });
    expect(naVerloop).not.toBe(voorVerloop);
  });
});