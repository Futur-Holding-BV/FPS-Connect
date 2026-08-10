// WERVING_01 — unit tests voor de server-side hardening van AI-uitvoer.
// Adversarieel: gesimuleerde AI-JSON met beschermde kenmerken en oordelen in
// ÁLLE uitvoervelden mag nooit door de hardening heen komen (prompt is geen
// waarborg; dit is de deterministische controle vóór persistentie).
import { describe, it, expect } from "vitest";
import { hardenToetsing, hardenVragen, vindVerbodenInhoud, naamTokens, verwijderKandidaatMetCv } from "./wervingVoorbereiding";

describe("vindVerbodenInhoud", () => {
  it("herkent beschermde kenmerken", () => {
    expect(vindVerbodenInhoud("Kandidaat is geboren op 12-03-1985")).toBeTruthy();
    expect(vindVerbodenInhoud("gezien de leeftijd van de kandidaat")).toBeTruthy();
    expect(vindVerbodenInhoud("Nederlandse nationaliteit")).toBeTruthy();
    expect(vindVerbodenInhoud("op de pasfoto oogt de kandidaat verzorgd")).toBeTruthy();
    expect(vindVerbodenInhoud("woont dichtbij; woonplaats Voorbeeldstad")).toBeTruthy();
    expect(vindVerbodenInhoud("burgerlijke staat: gehuwd")).toBeTruthy();
    expect(vindVerbodenInhoud("gezien eerdere ziekte mogelijk minder belastbaar")).toBeTruthy();
    expect(vindVerbodenInhoud("de kandidaat is een vrouw")).toBeTruthy();
  });

  it("herkent oordelen en scores", () => {
    expect(vindVerbodenInhoud("match: 85%")).toBeTruthy();
    expect(vindVerbodenInhoud("score 7 van 10")).toBeTruthy();
    expect(vindVerbodenInhoud("de kandidaat is geschikt voor deze functie")).toBeTruthy();
    expect(vindVerbodenInhoud("hoge ranking ten opzichte van anderen")).toBeTruthy();
  });

  it("herkent leeftijdsvarianten", () => {
    expect(vindVerbodenInhoud("de 35-jarige heeft ruime ervaring")).toBeTruthy();
    expect(vindVerbodenInhoud("een 35 jarige monteur")).toBeTruthy();
    expect(vindVerbodenInhoud("de kandidaat is 42 jaar")).toBeTruthy();
    expect(vindVerbodenInhoud("kandidaat is 28 jaar oud")).toBeTruthy();
    // Maar duur-van-ervaring blijft legitiem vakjargon:
    expect(vindVerbodenInhoud("8 jaar ervaring als monteur")).toBeNull();
    expect(vindVerbodenInhoud("werkte 8 jaar bij BrandSafe BV")).toBeNull();
  });

  it("herkent de kandidaatnaam via naam-tokens (incl. accenten, zonder tussenvoegsels)", () => {
    const tokens = naamTokens("José van den Bërg-Jansen");
    expect(tokens).toEqual(expect.arrayContaining(["jose", "berg", "jansen"]));
    expect(tokens).not.toContain("van");
    expect(vindVerbodenInhoud("Volgens José is dat gelukt", tokens)).toBe("kandidaatnaam");
    expect(vindVerbodenInhoud("mevrouw Berg-Jansen noemt VCA", tokens)).toBe("kandidaatnaam");
    expect(vindVerbodenInhoud("de kandidaat noemt VCA Basis", tokens)).toBeNull();
  });

  it("laat legitiem vakjargon door", () => {
    expect(vindVerbodenInhoud("registreren van uitgevoerd werk met foto's in de app")).toBeNull();
    expect(vindVerbodenInhoud("periode 2017-2019 niet toegelicht")).toBeNull();
    expect(vindVerbodenInhoud("aanbrengen van brandwerende doorvoeringen")).toBeNull();
    expect(vindVerbodenInhoud(null)).toBeNull();
  });
});

describe("hardenToetsing — adversariële AI-uitvoer", () => {
  it("laat een schoon item door", () => {
    const items = hardenToetsing([
      { categorie: "taken", eis: "Doorvoeringen aanbrengen", stand: "aantoonbaar_aanwezig", vindplaats: "Werkervaring: BrandSafe BV", toelichting: "8 jaar ervaring genoemd" },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].stand).toBe("aantoonbaar_aanwezig");
  });

  it("verwerpt een item met verboden inhoud in de eis", () => {
    const items = hardenToetsing([
      { categorie: "competenties", eis: "Jonger dan 30, geboren na 1996", stand: "aantoonbaar_aanwezig", vindplaats: "cv" },
    ]);
    expect(items).toHaveLength(0);
  });

  it("valt fail-closed terug bij verboden inhoud in de vindplaats", () => {
    const items = hardenToetsing([
      { categorie: "taken", eis: "Zelfstandig werken", stand: "aantoonbaar_aanwezig", vindplaats: "Persoonlijke gegevens: geboortedatum 12-03-1985" },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].stand).toBe("niet_genoemd");
    expect(items[0].vindplaats).toBeNull();
  });

  it("schrapt een toelichting met verboden inhoud maar houdt het item", () => {
    const items = hardenToetsing([
      { categorie: "taken", eis: "Zelfstandig werken", stand: "onduidelijk", vindplaats: "Werkervaring", toelichting: "de kandidaat woont ver weg dus reistijd is een risico" },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].toelichting).toBeNull();
  });

  it("dwingt fail-closed af bij aanwezig zonder vindplaats", () => {
    const items = hardenToetsing([
      { categorie: "taken", eis: "VCA Basis", stand: "aantoonbaar_aanwezig" },
    ]);
    expect(items[0].stand).toBe("niet_genoemd");
  });

  it("filtert de kandidaatnaam uit elk toetsingveld", () => {
    const tokens = naamTokens("Pieter de Groot");
    const items = hardenToetsing(
      [
        { categorie: "taken", eis: "Ervaring van Pieter met doorvoeringen", stand: "niet_genoemd" },
        { categorie: "taken", eis: "Zelfstandig werken", stand: "aantoonbaar_aanwezig", vindplaats: "Pieter schrijft: 8 jaar bij BrandSafe" },
        { categorie: "taken", eis: "VCA Basis", stand: "onduidelijk", vindplaats: "Certificaten", toelichting: "De Groot noemt geen geldigheidsdatum" },
      ],
      tokens,
    );
    expect(items).toHaveLength(2); // eis met naam vervalt
    expect(items[0].stand).toBe("niet_genoemd"); // vindplaats met naam → fail-closed
    expect(items[0].vindplaats).toBeNull();
    expect(items[1].toelichting).toBeNull(); // toelichting met achternaam vervalt
  });

  it("verwerpt scores/oordelen in de toelichting", () => {
    const items = hardenToetsing([
      { categorie: "taken", eis: "VCA Basis", stand: "onduidelijk", toelichting: "match 90%, zeer geschikt" },
    ]);
    expect(items[0].toelichting).toBeNull();
  });
});

describe("hardenVragen — adversariële AI-uitvoer", () => {
  it("verwerpt vragen met beschermde kenmerken", () => {
    const vragen = hardenVragen([
      { vraag: "Hoe combineert u dit werk met uw leeftijd?" },
      { vraag: "Waarom bent u als vrouw geïnteresseerd in dit vak?" },
      { vraag: "Kunt u toelichten wat u deed tussen 2017 en 2019?" },
    ]);
    expect(vragen).toHaveLength(1);
    expect(vragen[0].vraag).toContain("2017 en 2019");
  });

  it("filtert de kandidaatnaam uit vragen en aanleidingen", () => {
    const tokens = naamTokens("Ayşe Yılmaz");
    const vragen = hardenVragen(
      [
        { vraag: "Kunt u toelichten hoe Ayse de renovatie aanpakte?" },
        { vraag: "Beschrijf uw rol in het renovatieproject.", aanleiding: "Yilmaz noemt een renovatieproject zonder rolomschrijving" },
      ],
      tokens,
    );
    expect(vragen).toHaveLength(1);
    expect(vragen[0].aanleiding).toBeNull();
  });

  it("schrapt een aanleiding met verboden inhoud maar houdt de vraag", () => {
    const vragen = hardenVragen([
      { vraag: "Beschrijf uw ervaring met registratie van uitgevoerd werk.", aanleiding: "kandidaat is geboren in 1998 en dus onervaren" },
    ]);
    expect(vragen).toHaveLength(1);
    expect(vragen[0].aanleiding).toBeNull();
  });

  it("verwerpt vragen met een geschiktheidsoordeel", () => {
    const vragen = hardenVragen([
      { vraag: "U scoort laag op ervaring; waarom zou u toch geschikt zijn?" },
    ]);
    expect(vragen).toHaveLength(0);
  });
});

describe("verwijderKandidaatMetCv — AVG-atomair verwijderen", () => {
  it("verwijdert eerst het bestand en dan de rij", async () => {
    const volgorde: string[] = [];
    await verwijderKandidaatMetCv({
      cvObjectPath: "/objects/werving/kandidaat-1/cv.pdf",
      verwijderBestand: async () => { volgorde.push("bestand"); },
      verwijderRij: async () => { volgorde.push("rij"); },
    });
    expect(volgorde).toEqual(["bestand", "rij"]);
  });

  it("laat de rij staan als het cv-bestand niet verwijderd kan worden", async () => {
    let rijVerwijderd = false;
    await expect(
      verwijderKandidaatMetCv({
        cvObjectPath: "/objects/werving/kandidaat-1/cv.pdf",
        verwijderBestand: async () => { throw new Error("opslag onbereikbaar"); },
        verwijderRij: async () => { rijVerwijderd = true; },
      }),
    ).rejects.toThrow("opslag onbereikbaar");
    expect(rijVerwijderd).toBe(false);
  });

  it("verwijdert de rij direct als er geen cv is", async () => {
    let rijVerwijderd = false;
    await verwijderKandidaatMetCv({
      cvObjectPath: null,
      verwijderBestand: async () => { throw new Error("mag niet aangeroepen worden"); },
      verwijderRij: async () => { rijVerwijderd = true; },
    });
    expect(rijVerwijderd).toBe(true);
  });
});
