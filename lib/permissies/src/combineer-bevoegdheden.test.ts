// Unit tests voor combineerBevoegdheden — P2 increment 1.
//
// Bewijst: (1) effectieve rechten = per-module MAX over meerdere rollen,
// (2) regressie: één rol geeft identieke effectieve rechten,
// (3) regressie: geen rollen (lege invoer) geeft een lege matrix zodat de
//     bestaande legacy-fallback (bevoegdhedenVoorLegacyRol) ongewijzigd werkt.

import { describe, it, expect } from "vitest";
import {
  combineerBevoegdheden,
  bevoegdhedenGelijk,
  bevoegdhedenVoorLegacyRol,
  heeftEnigeToegang,
  heeftNiveau,
  niveauVan,
  MODULE_IDS,
  MAX_NIVEAU,
  PRESETS,
  VOLLEDIGE_BEVOEGDHEDEN,
  type Bevoegdheden,
} from "./index";

function preset(naam: string): Bevoegdheden {
  const p = PRESETS.find((p) => p.naam === naam);
  if (!p) throw new Error(`Preset niet gevonden: ${naam}`);
  return p.bevoegdheden;
}

describe("combineerBevoegdheden — per-module MAX over meerdere rollen", () => {
  it("neemt per module het hoogste niveau over alle rollen", () => {
    const a: Bevoegdheden = { gebouwen: 1, voorzieningen: 3, rapportages: 0 };
    const b: Bevoegdheden = { gebouwen: 4, voorzieningen: 2, crm: 2 };
    const c: Bevoegdheden = { rapportages: 1, crm: 4 };

    const effectief = combineerBevoegdheden([a, b, c]);

    expect(effectief.gebouwen).toBe(4); // max(1, 4)
    expect(effectief.voorzieningen).toBe(3); // max(3, 2)
    expect(effectief.rapportages).toBe(1); // max(0, 1)
    expect(effectief.crm).toBe(4); // max(2, 4)
    expect(effectief.personeel).toBe(0); // in geen enkele rol
  });

  it("combineert echte presets (Project-admin + Commercieel + Monteur)", () => {
    const projectAdmin = preset("Project-admin");
    const commercieel = preset("Commercieel");
    const monteur = preset("Monteur");

    const effectief = combineerBevoegdheden([projectAdmin, commercieel, monteur]);

    for (const m of MODULE_IDS) {
      const verwacht = Math.max(
        niveauVan(projectAdmin, m),
        niveauVan(commercieel, m),
        niveauVan(monteur, m),
      );
      expect(effectief[m], `module ${m}`).toBe(verwacht);
    }

    // Steekproef op concrete waarden:
    expect(effectief.voorzieningen).toBe(3); // Monteur 3 > Project-admin 2 > Commercieel 1
    expect(effectief.crm).toBe(4); // Commercieel 4 > Project-admin 2
    expect(effectief.rapportages).toBe(3); // Project-admin 3
    expect(effectief.abonnementen).toBe(4); // alleen Commercieel
    expect(effectief.systeem).toBe(0); // geen van de rollen
  });

  it("volgt de matrix()-conventie: alle bekende modules aanwezig in het resultaat", () => {
    const effectief = combineerBevoegdheden([{ gebouwen: 2 }]);
    for (const m of MODULE_IDS) {
      expect(typeof effectief[m], `module ${m}`).toBe("number");
    }
  });

  it("kan een niveau nooit verlagen: resultaat >= elk individueel niveau", () => {
    const rollen = [preset("Directie"), preset("HRM-adviseur"), preset("Planner")];
    const effectief = combineerBevoegdheden(rollen);
    for (const rol of rollen) {
      for (const m of MODULE_IDS) {
        expect(effectief[m]).toBeGreaterThanOrEqual(niveauVan(rol, m));
      }
    }
  });

  it("overschrijdt nooit MAX_NIVEAU bij geldige presets", () => {
    const effectief = combineerBevoegdheden(PRESETS.map((p) => p.bevoegdheden));
    for (const m of MODULE_IDS) {
      expect(effectief[m]).toBeLessThanOrEqual(MAX_NIVEAU);
    }
  });

  it("behoudt onbekende module-sleutels (open map) met max-combinatie", () => {
    const a: Bevoegdheden = { toekomstige_module: 2 };
    const b: Bevoegdheden = { toekomstige_module: 3, gebouwen: 1 };
    const effectief = combineerBevoegdheden([a, b]);
    expect(effectief.toekomstige_module).toBe(3);
    expect(effectief.gebouwen).toBe(1);
  });

  it("behandelt ongeldige waarden (negatief) als 0, conform niveauVan", () => {
    const a: Bevoegdheden = { gebouwen: -5 };
    const b: Bevoegdheden = { gebouwen: 0 };
    const effectief = combineerBevoegdheden([a, b]);
    expect(effectief.gebouwen).toBe(0);
  });

  it("negeert null/undefined tussen de matrices", () => {
    const a: Bevoegdheden = { gebouwen: 2 };
    const effectief = combineerBevoegdheden([null, a, undefined]);
    expect(effectief.gebouwen).toBe(2);
    expect(heeftEnigeToegang(effectief)).toBe(true);
  });

  it("werkt samen met heeftNiveau voor autorisatiebeslissingen", () => {
    const effectief = combineerBevoegdheden([preset("Monteur"), preset("Planner")]);
    expect(heeftNiveau(effectief, "planning", 4)).toBe(true); // via Planner
    expect(heeftNiveau(effectief, "voorzieningen", 3)).toBe(true); // via Monteur
    expect(heeftNiveau(effectief, "systeem", 1)).toBe(false); // via geen van beide
  });
});

describe("regressie — één rol (single-role gebruikers)", () => {
  it("geeft voor elke preset exact dezelfde effectieve rechten als de preset zelf", () => {
    for (const p of PRESETS) {
      const effectief = combineerBevoegdheden([p.bevoegdheden]);
      expect(bevoegdhedenGelijk(effectief, p.bevoegdheden), `preset ${p.naam}`).toBe(true);
      for (const m of MODULE_IDS) {
        expect(niveauVan(effectief, m), `preset ${p.naam}, module ${m}`).toBe(
          niveauVan(p.bevoegdheden, m),
        );
      }
    }
  });

  it("is idempotent: dezelfde rol twee keer verandert niets", () => {
    const m = preset("Werkvoorbereider");
    expect(bevoegdhedenGelijk(combineerBevoegdheden([m, m]), m)).toBe(true);
  });

  it("muteert de invoermatrices niet", () => {
    const a: Bevoegdheden = { gebouwen: 1 };
    const b: Bevoegdheden = { gebouwen: 3 };
    const kopieA = { ...a };
    const kopieB = { ...b };
    combineerBevoegdheden([a, b]);
    expect(a).toEqual(kopieA);
    expect(b).toEqual(kopieB);
  });
});

describe("regressie — geen rollen / legacy fallback", () => {
  it("geeft een lege matrix bij lege invoer (geen rollen gekoppeld)", () => {
    const effectief = combineerBevoegdheden([]);
    expect(effectief).toEqual({});
    expect(heeftEnigeToegang(effectief)).toBe(false);
  });

  it("geeft een lege matrix wanneer alle entries null/undefined zijn", () => {
    expect(combineerBevoegdheden([null, undefined])).toEqual({});
  });

  it("legacy fallback blijft ongewijzigd: hoofdbeheerder/beheerder -> volledig", () => {
    expect(
      bevoegdhedenGelijk(bevoegdhedenVoorLegacyRol("hoofdbeheerder"), VOLLEDIGE_BEVOEGDHEDEN),
    ).toBe(true);
    expect(
      bevoegdhedenGelijk(bevoegdhedenVoorLegacyRol("beheerder"), VOLLEDIGE_BEVOEGDHEDEN),
    ).toBe(true);
  });

  it("legacy fallback blijft ongewijzigd: monteur- en controleur-matrix", () => {
    const monteur = bevoegdhedenVoorLegacyRol("monteur");
    expect(niveauVan(monteur, "gebouwen")).toBe(1);
    expect(niveauVan(monteur, "voorzieningen")).toBe(3);
    expect(niveauVan(monteur, "inspecties")).toBe(3);
    expect(niveauVan(monteur, "onderhoud")).toBe(3);
    expect(niveauVan(monteur, "rapportages")).toBe(1);
    expect(niveauVan(monteur, "bibliotheek")).toBe(1);
    expect(niveauVan(monteur, "systeem")).toBe(0);

    const controleur = bevoegdhedenVoorLegacyRol("controleur");
    expect(niveauVan(controleur, "voorzieningen")).toBe(1);
    expect(niveauVan(controleur, "inspecties")).toBe(3);
  });

  it("legacy fallback blijft ongewijzigd: onbekend -> geen toegang", () => {
    expect(bevoegdhedenVoorLegacyRol(null)).toEqual({});
    expect(bevoegdhedenVoorLegacyRol(undefined)).toEqual({});
    expect(bevoegdhedenVoorLegacyRol("gebruiker")).toEqual({});
  });

  it("één legacy-rol als enige rol geeft identieke effectieve rechten", () => {
    const legacy = bevoegdhedenVoorLegacyRol("monteur");
    expect(bevoegdhedenGelijk(combineerBevoegdheden([legacy]), legacy)).toBe(true);
  });
});
