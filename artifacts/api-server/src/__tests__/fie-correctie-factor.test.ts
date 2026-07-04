import { describe, it, expect } from "vitest";
import { valideerCorrectieFactor, verwerkOpmerkingen, verwerkOpmerkingenBegroting, bouwLeermomentUpdateVelden, verwerkOmschrijvingAkPost } from "../routes/fie";

// ── valideerCorrectieFactor — grenswaarden en randgevallen ────────────────────
//
// Dekt alle door de taakbeschrijving vereiste cases:
//   • 0,5 en 3,0 zijn geldige grenzen (accepteren)
//   • 0,49 en 3,01 vallen net buiten het bereik (afwijzen)
//   • 0 is beneden het minimum (afwijzen)
//   • ontbrekende waarde (undefined) wordt bewust NIET gevalideerd via deze
//     functie — de caller slaat de update over als correctie_factor undefined is;
//     dit gedrag zit in de route-handler en hoeft hier niet getest te worden.

describe("valideerCorrectieFactor", () => {
  describe("grenswaarden — moeten worden geaccepteerd", () => {
    it("accepteert 0.5 (ondergrens)", () => {
      const result = valideerCorrectieFactor(0.5);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.waarde).toBe(0.5);
    });

    it("accepteert 3.0 (bovengrens)", () => {
      const result = valideerCorrectieFactor(3.0);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.waarde).toBe(3.0);
    });

    it("accepteert een waarde in het midden (bijv. 1.5)", () => {
      const result = valideerCorrectieFactor(1.5);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.waarde).toBe(1.5);
    });
  });

  describe("buiten bereik — moeten worden afgewezen met foutmelding", () => {
    it("wijst 0.49 af (net onder ondergrens)", () => {
      const result = valideerCorrectieFactor(0.49);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.fout).toMatch(/0,5.*3,0|tussen/);
    });

    it("wijst 3.01 af (net boven bovengrens)", () => {
      const result = valideerCorrectieFactor(3.01);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.fout).toMatch(/0,5.*3,0|tussen/);
    });

    it("wijst 0 af (ver onder ondergrens)", () => {
      const result = valideerCorrectieFactor(0);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.fout).toBeTruthy();
    });

    it("wijst negatieve waarden af", () => {
      const result = valideerCorrectieFactor(-1);
      expect(result.ok).toBe(false);
    });

    it("wijst Infinity af", () => {
      const result = valideerCorrectieFactor(Infinity);
      expect(result.ok).toBe(false);
    });

    it("wijst NaN af (bijv. bij tekst-invoer)", () => {
      const result = valideerCorrectieFactor("geen getal");
      expect(result.ok).toBe(false);
    });
  });

  describe("afronding — waarde wordt op 2 decimalen afgerond", () => {
    it("rondt 1.555 af naar 1.56", () => {
      const result = valideerCorrectieFactor(1.555);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.waarde).toBe(1.56);
    });
  });

  describe("string-numerieke invoer — geldige omzetting", () => {
    it("accepteert '0.5' als string (geldige grens)", () => {
      const result = valideerCorrectieFactor("0.5");
      expect(result.ok).toBe(true);
    });

    it("accepteert '3.0' als string (geldige grens)", () => {
      const result = valideerCorrectieFactor("3.0");
      expect(result.ok).toBe(true);
    });

    it("wijst '0.49' als string af", () => {
      const result = valideerCorrectieFactor("0.49");
      expect(result.ok).toBe(false);
    });
  });
});

// ── verwerkOpmerkingen — opmerkingen-truncatie en null-verwerking ─────────────
//
// Legt het bewuste gedrag vast: opmerkingen worden stilzwijgend afgekapt op
// 1000 tekens (geen 400-fout). Dit is gedocumenteerd zodat een toekomstige
// refactor dit gedrag niet onopgemerkt kan wijzigen.
//
// Wanneer het veld ontbreekt (undefined), roept de PATCH-handler deze functie
// niet aan — het veld blijft ongewijzigd. Dat gedrag zit in de route-handler
// en wordt hier niet getest.

describe("verwerkOpmerkingen", () => {
  it("kapt tekst van meer dan 1000 tekens stilzwijgend af op precies 1000 (geen fout)", () => {
    const lang = "x".repeat(1500);
    const resultaat = verwerkOpmerkingen(lang);
    expect(resultaat).toHaveLength(1000);
    expect(resultaat).toBe("x".repeat(1000));
  });

  it("bewaart tekst van precies 1000 tekens ongewijzigd", () => {
    const precies = "a".repeat(1000);
    expect(verwerkOpmerkingen(precies)).toBe(precies);
  });

  it("bewaart tekst korter dan 1000 tekens ongewijzigd", () => {
    expect(verwerkOpmerkingen("Korte opmerking")).toBe("Korte opmerking");
  });

  it("slaat null op als null", () => {
    expect(verwerkOpmerkingen(null)).toBeNull();
  });
});

// ── bouwLeermomentUpdateVelden — PATCH body verwerking (route-niveau) ─────────
//
// Test de drie vereiste gedragingen van de PATCH /fie/leermomenten/:id handler
// zonder dat een databaseverbinding nodig is:
//
//   1. opmerkingen ontbreekt → het veld zit NIET in het update-object
//      (de bestaande DB-waarde blijft ongewijzigd)
//   2. opmerkingen >1000 tekens → geen fout (geen 400), waarde afgekapt op 1000
//   3. opmerkingen=null → null opgeslagen

describe("bouwLeermomentUpdateVelden", () => {
  it("opmerkingen ontbreekt in body → update-object bevat geen opmerkingen-sleutel (geen wijziging)", () => {
    const result = bouwLeermomentUpdateVelden({ correctie_factor: 1.5 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect("opmerkingen" in result.velden).toBe(false);
    }
  });

  it("opmerkingen >1000 tekens → geen fout, velden.opmerkingen afgekapt op precies 1000", () => {
    const result = bouwLeermomentUpdateVelden({ opmerkingen: "x".repeat(1500) });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.velden.opmerkingen).toHaveLength(1000);
      expect(result.velden.opmerkingen).toBe("x".repeat(1000));
    }
  });

  it("opmerkingen=null → velden.opmerkingen is null", () => {
    const result = bouwLeermomentUpdateVelden({ opmerkingen: null });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.velden.opmerkingen).toBeNull();
    }
  });

  it("ongeldige correctie_factor → fout teruggegeven, geen update", () => {
    const result = bouwLeermomentUpdateVelden({ correctie_factor: 0.1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fout).toMatch(/0,5.*3,0|tussen/);
  });
});

// ── verwerkOpmerkingenBegroting — begroting-truncatie en null-verwerking ──────
//
// Legt het bewuste gedrag vast: opmerkingen worden stilzwijgend afgekapt op
// 2000 tekens (geen 400-fout). Dit is gedocumenteerd zodat een toekomstige
// refactor dit gedrag niet onopgemerkt kan wijzigen.
//
// Wanneer het veld ontbreekt (undefined), roept de PATCH-handler deze functie
// niet aan — het veld blijft ongewijzigd. Dat gedrag zit in de route-handler
// en wordt hier niet getest.

describe("verwerkOpmerkingenBegroting", () => {
  it("kapt tekst van meer dan 2000 tekens stilzwijgend af op precies 2000 (geen fout)", () => {
    const lang = "x".repeat(2500);
    const resultaat = verwerkOpmerkingenBegroting(lang);
    expect(resultaat).toHaveLength(2000);
    expect(resultaat).toBe("x".repeat(2000));
  });

  it("bewaart tekst van precies 2000 tekens ongewijzigd", () => {
    const precies = "a".repeat(2000);
    expect(verwerkOpmerkingenBegroting(precies)).toBe(precies);
  });

  it("bewaart tekst korter dan 2000 tekens ongewijzigd", () => {
    expect(verwerkOpmerkingenBegroting("Korte begroting-opmerking")).toBe("Korte begroting-opmerking");
  });

  it("slaat null op als null", () => {
    expect(verwerkOpmerkingenBegroting(null)).toBeNull();
  });

  it("knipt NIET op 1000 tekens — begroting heeft hogere limiet (2000)", () => {
    const duizend = "y".repeat(1000);
    const resultaat = verwerkOpmerkingenBegroting(duizend);
    expect(resultaat).toHaveLength(1000);
  });

  it("knipt tekst van exact 2001 tekens af op 2000", () => {
    const inp = "z".repeat(2001);
    const resultaat = verwerkOpmerkingenBegroting(inp);
    expect(resultaat).toHaveLength(2000);
  });
});

// ── verwerkOmschrijvingAkPost — omschrijving-truncatie en null-verwerking ─────
//
// Legt het bewuste gedrag vast: omschrijving wordt stilzwijgend afgekapt op
// 500 tekens (geen 400-fout). Dit is gedocumenteerd zodat een toekomstige
// refactor dit gedrag niet onopgemerkt kan wijzigen.
//
// null/undefined → null (de POST-handler valideert verplichtheid zelf).

describe("verwerkOmschrijvingAkPost", () => {
  it("kapt tekst van meer dan 500 tekens stilzwijgend af op precies 500 (geen fout)", () => {
    const lang = "x".repeat(750);
    const resultaat = verwerkOmschrijvingAkPost(lang);
    expect(resultaat).toHaveLength(500);
    expect(resultaat).toBe("x".repeat(500));
  });

  it("bewaart tekst van precies 500 tekens ongewijzigd", () => {
    const precies = "a".repeat(500);
    expect(verwerkOmschrijvingAkPost(precies)).toBe(precies);
  });

  it("bewaart tekst korter dan 500 tekens ongewijzigd", () => {
    expect(verwerkOmschrijvingAkPost("Dakdoorvoering brandklasse A1")).toBe(
      "Dakdoorvoering brandklasse A1",
    );
  });

  it("geeft null terug bij null-invoer", () => {
    expect(verwerkOmschrijvingAkPost(null)).toBeNull();
  });

  it("geeft null terug bij undefined-invoer", () => {
    expect(verwerkOmschrijvingAkPost(undefined)).toBeNull();
  });

  it("knipt tekst van exact 501 tekens af op 500", () => {
    const inp = "b".repeat(501);
    const resultaat = verwerkOmschrijvingAkPost(inp);
    expect(resultaat).toHaveLength(500);
  });

  it("knipt NIET op 1000 of 2000 tekens — AK-post heeft lagere limiet (500)", () => {
    const zeshonderd = "c".repeat(600);
    const resultaat = verwerkOmschrijvingAkPost(zeshonderd);
    expect(resultaat).toHaveLength(500);
  });
});
