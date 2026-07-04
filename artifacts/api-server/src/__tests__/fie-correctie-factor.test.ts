import { describe, it, expect } from "vitest";
import { valideerCorrectieFactor } from "../routes/fie";

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
