import { describe, it, expect } from "vitest";
import {
  kiesUniekeHerkomstPreset,
  magAutomatischKoppelen,
  type HerkomstProfiel,
} from "./herkomst";

const projectleider: HerkomstProfiel = {
  id: 1,
  bevoegdheden: { gebouwen: 4, voorzieningen: 4 },
};
const monteur: HerkomstProfiel = {
  id: 2,
  bevoegdheden: { gebouwen: 1, voorzieningen: 3 },
};

describe("kiesUniekeHerkomstPreset", () => {
  it("koppelt niet bij een lege (rechtloze) matrix", () => {
    expect(kiesUniekeHerkomstPreset({}, [projectleider, monteur])).toBeNull();
    expect(kiesUniekeHerkomstPreset(null, [projectleider])).toBeNull();
    expect(
      kiesUniekeHerkomstPreset({ gebouwen: 0, voorzieningen: 0 }, [projectleider]),
    ).toBeNull();
  });

  it("koppelt niet wanneer geen enkel profiel overeenkomt (0 matches)", () => {
    expect(
      kiesUniekeHerkomstPreset({ gebouwen: 2, voorzieningen: 2 }, [
        projectleider,
        monteur,
      ]),
    ).toBeNull();
  });

  it("koppelt bij exact één match", () => {
    expect(
      kiesUniekeHerkomstPreset({ gebouwen: 1, voorzieningen: 3 }, [
        projectleider,
        monteur,
      ]),
    ).toBe(2);
  });

  it("matcht ook wanneer niveau 0 ontbreekt in de bron-matrix", () => {
    expect(
      kiesUniekeHerkomstPreset({ gebouwen: 1, voorzieningen: 3, crm: 0 }, [
        monteur,
      ]),
    ).toBe(2);
  });

  it("koppelt niet bij meerdere identieke profielen (>1 match)", () => {
    const monteurDuplicaat: HerkomstProfiel = {
      id: 3,
      bevoegdheden: { gebouwen: 1, voorzieningen: 3 },
    };
    expect(
      kiesUniekeHerkomstPreset({ gebouwen: 1, voorzieningen: 3 }, [
        monteur,
        monteurDuplicaat,
      ]),
    ).toBeNull();
  });

  it("koppelt niet wanneer er geen profielen zijn", () => {
    expect(
      kiesUniekeHerkomstPreset({ gebouwen: 1, voorzieningen: 3 }, []),
    ).toBeNull();
  });
});

describe("magAutomatischKoppelen (PATCH-voorwaarde)", () => {
  it("koppelt automatisch wanneer bevoegdheden wijzigen en er nog geen herkomst is", () => {
    expect(magAutomatischKoppelen(true, null)).toBe(true);
    expect(magAutomatischKoppelen(true, undefined)).toBe(true);
  });

  it("laat een bestaande herkomst ongemoeid", () => {
    expect(magAutomatischKoppelen(true, 5)).toBe(false);
  });

  it("koppelt niet wanneer de bevoegdheden niet wijzigen", () => {
    expect(magAutomatischKoppelen(false, null)).toBe(false);
    expect(magAutomatischKoppelen(false, 5)).toBe(false);
  });
});
