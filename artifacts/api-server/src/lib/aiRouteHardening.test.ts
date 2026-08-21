import { describe, expect, it } from "vitest";
import {
  INVUL_MODULE_PER_FORMULIER,
  moduleVoorCorrectieVeld,
  saneerInvulVelden,
} from "../routes/ai";

describe("AI invullen — gesloten veld- en modulecontract", () => {
  it("heeft voor ieder toegestaan formulier een expliciete modulepoort", () => {
    expect(INVUL_MODULE_PER_FORMULIER).toEqual({
      crm_organisatie: "crm",
      crm_contactpersoon: "crm",
      gebouw: "gebouwen",
      leverancier: "inkoop",
      werkmaatschappij: "organisatie",
      concurrent: "crm",
      wagenpark_voertuig: "wagenpark",
      medewerker: "personeel",
      magazijn_artikel: "magazijn",
    });
  });

  it("laat alleen geregistreerde velden en veilige primitieve waarden door", () => {
    const lang = "x".repeat(1200);
    expect(saneerInvulVelden("gebouw", {
      gebouw_type: "Kantoorgebouw",
      bouwjaar: 1999,
      beveiligd: true,
      verborgen_geheim: "mag niet door",
      stad: lang,
      postcode: { genest: "nee" },
    })).toEqual({
      gebouw_type: "Kantoorgebouw",
      bouwjaar: "1999",
      stad: "x".repeat(1000),
    });
  });

  it("weigert onbekende formulieren en niet-object output", () => {
    expect(saneerInvulVelden("onbekend", { naam: "x" })).toEqual({});
    expect(saneerInvulVelden("gebouw", ["adres"])).toEqual({});
  });
});

describe("AI veldcorrectie — prefix bepaalt de vereiste module", () => {
  it("koppelt bekende prefixen conservatief aan de schermmodule", () => {
    expect(moduleVoorCorrectieVeld("formulier.gebouw.adres")).toBe("gebouwen");
    expect(moduleVoorCorrectieVeld("formulier.leverancier.naam")).toBe("inkoop");
    expect(moduleVoorCorrectieVeld("projectsamenvatting.tekst")).toBe("projecten");
    expect(moduleVoorCorrectieVeld("financieel_contract.bedrag")).toBe("financieel");
  });

  it("weigert onbekende prefixen en vrije/geneste veldnamen", () => {
    expect(moduleVoorCorrectieVeld("onbekend.veld")).toBeNull();
    expect(moduleVoorCorrectieVeld("formulier.gebouw.adres.extra")).toBeNull();
    expect(moduleVoorCorrectieVeld("spot.")).toBeNull();
  });
});