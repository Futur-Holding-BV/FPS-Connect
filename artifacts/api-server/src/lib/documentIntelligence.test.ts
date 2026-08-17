import { describe, it, expect } from "vitest";
import { _test, CATEGORIE_MODULE } from "./documentIntelligence";

const { heuristischClassificeerInhoud, herkenJaarUitTekst, herkenJaarUitBestandsnaam, bepaalOpslaglocatie, berekenVertrouwen, herkenFinancieleStatus } = _test;

// Regressietests voor de gedeelde Document Intelligence-engine (heuristisch pad,
// geen AI/DB-netwerkcall nodig). Dekt de 8 kern-documenttypes die zowel Inbox
// als Slim Upload via classificeerDocument() moeten kunnen herkennen.

describe("heuristischClassificeerInhoud — 8 documenttypes", () => {
  it("herkent een jaarrekening op inhoud", () => {
    const r = heuristischClassificeerInhoud(
      "bijlage.pdf",
      "application/pdf",
      "Dit document betreft de jaarrekening over boekjaar 2025, inclusief balans per 31 december 2025 en de winst-en-verliesrekening.",
    );
    expect(r.categorie).toBe("jaarrekening");
  });

  it("herkent een geconsolideerde jaarrekening als jaarrekening (subtype wordt elders bepaald)", () => {
    const r = heuristischClassificeerInhoud(
      "groep.pdf",
      "application/pdf",
      "De geconsolideerde jaarrekening van de groepsmaatschappijen over 2024, opgesteld door de accountant.",
    );
    expect(r.categorie).toBe("jaarrekening");
  });

  it("herkent een factuur op inhoud", () => {
    const r = heuristischClassificeerInhoud(
      "doc.pdf",
      "application/pdf",
      "Factuur nummer 2026-0456. Betalingstermijn 30 dagen. Het btw-bedrag is apart gespecificeerd op deze rekening.",
    );
    expect(r.categorie).toBe("factuur");
  });

  it("herkent een offerte op inhoud", () => {
    const r = heuristischClassificeerInhoud(
      "doc.pdf",
      "application/pdf",
      "Hierbij ontvangt u onze offerte voor de brandwerende doorvoeringen. Deze aanbieding is geldig tot 1 augustus 2026.",
    );
    expect(r.categorie).toBe("offerte");
  });

  it("herkent een testrapport op inhoud", () => {
    const r = heuristischClassificeerInhoud(
      "doc.pdf",
      "application/pdf",
      "Dit testrapport beschrijft de resultaten van de brandproef conform de geldende testnorm.",
    );
    expect(r.categorie).toBe("testrapport");
  });

  it("herkent een certificaat op inhoud", () => {
    const r = heuristischClassificeerInhoud(
      "doc.pdf",
      "application/pdf",
      "Dit KOMO-certificaat is afgegeven op basis van BRL 5000 en bevestigt de kwaliteit van het product.",
    );
    expect(r.categorie).toBe("certificaat");
  });

  it("herkent een ETA op inhoud", () => {
    const r = heuristischClassificeerInhoud(
      "doc.pdf",
      "application/pdf",
      "Deze European Technical Assessment (ETA) is opgesteld conform de EOTA-richtlijnen voor het product.",
    );
    expect(r.categorie).toBe("eta");
  });

  it("herkent een DOP op inhoud", () => {
    const r = heuristischClassificeerInhoud(
      "doc.pdf",
      "application/pdf",
      "Deze prestatieverklaring (declaration of performance) hoort bij het brandwerende product.",
    );
    expect(r.categorie).toBe("dop");
  });

  it("herkent een personeelsdocument op inhoud", () => {
    const r = heuristischClassificeerInhoud(
      "doc.pdf",
      "application/pdf",
      "Bijgevoegd de arbeidsovereenkomst behorend bij het loonstrook-dossier van de nieuwe medewerker.",
    );
    expect(r.categorie).toBe("personeelsdocument");
  });

  it("herkent een verzekeringspolis op inhoud", () => {
    const r = heuristischClassificeerInhoud(
      "doc.pdf",
      "application/pdf",
      "Deze verzekeringspolis met polisnummer 123456 beschrijft de dekking en premie voor het lopende jaar.",
    );
    expect(r.categorie).toBe("verzekering");
  });

  it("herkent een snagstream/opleverrapport op inhoud", () => {
    const r = heuristischClassificeerInhoud(
      "doc.pdf",
      "application/pdf",
      "Dit opleverrapport bevat de bevindingen van de inspectie en is gegenereerd door Snagstream.",
    );
    expect(r.categorie).toBe("snagstream");
  });

  it("herkent een contract op inhoud", () => {
    const r = heuristischClassificeerInhoud(
      "doc.pdf",
      "application/pdf",
      "Deze overeenkomst / contract regelt de onderhoudsafspraken en het bijbehorende SLA tussen partijen.",
    );
    expect(r.categorie).toBe("contract");
  });

  it("valt terug op bestandsnaam-heuristiek bij te korte tekst", () => {
    const r = heuristischClassificeerInhoud("mijn-factuur-2026.pdf", "application/pdf", "kort");
    expect(r.categorie).toBe("factuur");
    expect(r.vertrouwen).toBe("laag");
  });

  it("valt terug op algemeen zonder signalen", () => {
    const r = heuristischClassificeerInhoud("bestand123.pdf", "application/pdf", null);
    expect(r.categorie).toBe("algemeen");
  });

  it("classificeert een onherkenbare afbeelding als tekening", () => {
    const r = heuristischClassificeerInhoud("foto.jpg", "image/jpeg", null);
    expect(r.categorie).toBe("tekening");
  });
});

describe("bepaalOpslaglocatie — jaarrekening naar Financieel (vertrouwelijk, niet meer Archief)", () => {
  it("stuurt een gewone jaarrekening naar Financieel → Jaarrekeningen → jaar", () => {
    const loc = bepaalOpslaglocatie("jaarrekening", CATEGORIE_MODULE.jaarrekening, 2025, null, "FPS Brandpreventie BV");
    expect(CATEGORIE_MODULE.jaarrekening).toBe("Financieel");
    expect(loc).toBe("Financieel → Jaarrekeningen → 2025");
  });

  it("stuurt een geconsolideerde jaarrekening naar het geconsolideerde subpad", () => {
    const loc = bepaalOpslaglocatie("jaarrekening", CATEGORIE_MODULE.jaarrekening, 2024, "geconsolideerd", "FPS Groep");
    expect(loc).toBe("Financieel → Geconsolideerde jaarrekeningen → 2024");
  });

  it("stuurt jaarrekeningen nooit meer naar het algemene Archief", () => {
    const loc = bepaalOpslaglocatie("jaarrekening", CATEGORIE_MODULE.jaarrekening, 2023, "geconsolideerd", "FPS Groep");
    expect(loc.startsWith("Archief")).toBe(false);
  });

  it("valt terug op 'jaar onbekend' als er geen jaar herkend is", () => {
    const loc = bepaalOpslaglocatie("jaarrekening", CATEGORIE_MODULE.jaarrekening, null, null, null);
    expect(loc).toBe("Financieel → Jaarrekeningen → jaar onbekend");
  });

  it("plaatst verzekeringen bij Financieel per jaar", () => {
    const loc = bepaalOpslaglocatie("verzekering", CATEGORIE_MODULE.verzekering, 2026, null, "Achmea");
    expect(loc).toBe("Financieel → Verzekeringen → 2026");
  });

  it("groepeert overige categorieën op organisatie indien bekend", () => {
    const loc = bepaalOpslaglocatie("factuur", CATEGORIE_MODULE.factuur, 2026, null, "Leverancier BV");
    expect(loc).toBe("Financieel → Leverancier BV");
  });
});

describe("herkenFinancieleStatus — definitief / concept / onbekend", () => {
  it("herkent een vastgestelde/gedeponeerde jaarrekening als definitief", () => {
    expect(herkenFinancieleStatus("De vastgestelde jaarrekening is gedeponeerd bij de Kamer van Koophandel.", {})).toBe("definitief");
  });

  it("herkent een accountants-/controleverklaring als definitief", () => {
    expect(herkenFinancieleStatus("Bij deze jaarrekening is een controleverklaring van de onafhankelijke accountant afgegeven.", {})).toBe("definitief");
  });

  it("herkent een concept-jaarrekening als concept", () => {
    expect(herkenFinancieleStatus("Concept-jaarrekening 2023 — nog niet vastgesteld door de algemene vergadering.", {})).toBe("concept");
  });

  it("geeft onbekend zonder duidelijke status-aanwijzing", () => {
    expect(herkenFinancieleStatus("Balans per 31 december en winst-en-verliesrekening over het boekjaar.", {})).toBe("onbekend");
  });

  it("laat een AI-hint uit gevonden gegevens voorgaan", () => {
    expect(herkenFinancieleStatus("", { status: "concept" })).toBe("concept");
    expect(herkenFinancieleStatus("", { status: "definitief" })).toBe("definitief");
  });
});

describe("herkenJaarUitTekst / herkenJaarUitBestandsnaam", () => {
  it("herkent een viercijferig jaar in de tekst", () => {
    expect(herkenJaarUitTekst("Boekjaar 2025 afgesloten op 31 december 2025.")).toBe(2025);
  });

  it("geeft null als er geen plausibel jaar in de tekst staat", () => {
    expect(herkenJaarUitTekst("Geen jaartal hier, alleen tekst.")).toBeNull();
  });

  it("herkent een jaar in de bestandsnaam als laatste redmiddel", () => {
    expect(herkenJaarUitBestandsnaam("jaarrekening-2023-definitief.pdf")).toBe(2023);
  });
});

describe("berekenVertrouwen", () => {
  it("geeft 'laag' zonder enig signaal", () => {
    const r = berekenVertrouwen({
      aiBeschikbaar: false,
      aiVertrouwen: null,
      tekstGevonden: false,
      visionGebruikt: false,
      organisatieGevonden: false,
      jaarGevonden: false,
      jaarUitBestandsnaam: false,
    });
    expect(r.label).toBe("laag");
  });

  it("geeft 'hoog' met tekst, AI hoog vertrouwen, organisatie en jaar", () => {
    const r = berekenVertrouwen({
      aiBeschikbaar: true,
      aiVertrouwen: "hoog",
      tekstGevonden: true,
      visionGebruikt: false,
      organisatieGevonden: true,
      jaarGevonden: true,
      jaarUitBestandsnaam: false,
    });
    expect(r.label).toBe("hoog");
  });

  it("telt een jaar uit de bestandsnaam niet mee als extra signaal", () => {
    const zonder = berekenVertrouwen({
      aiBeschikbaar: false,
      aiVertrouwen: null,
      tekstGevonden: true,
      visionGebruikt: false,
      organisatieGevonden: false,
      jaarGevonden: true,
      jaarUitBestandsnaam: true,
    });
    const met = berekenVertrouwen({
      aiBeschikbaar: false,
      aiVertrouwen: null,
      tekstGevonden: true,
      visionGebruikt: false,
      organisatieGevonden: false,
      jaarGevonden: true,
      jaarUitBestandsnaam: false,
    });
    expect(met.score).toBeGreaterThan(zonder.score);
  });
});

describe("bevatGeconsolideerd — typo-tolerante detectie", () => {
  const { bevatGeconsolideerd } = _test;

  it("herkent de correcte spelling", () => {
    expect(bevatGeconsolideerd("De geconsolideerde jaarrekening over 2023")).toBe(true);
  });

  it("herkent de typo met drie e's uit de bestandsnaam (productie-incident)", () => {
    expect(bevatGeconsolideerd("FPS 2023 Geconsolideeerd-def.pdf")).toBe(true);
  });

  it("herkent een dubbele l-typo", () => {
    expect(bevatGeconsolideerd("geconsollideerde cijfers")).toBe(true);
  });

  it("herkent het losse woord zonder 'jaarrekening' erachter", () => {
    expect(bevatGeconsolideerd("Dit betreft geconsolideerd 2024")).toBe(true);
  });

  it("matcht niet op een enkelvoudige jaarrekening", () => {
    expect(bevatGeconsolideerd("Enkelvoudige jaarrekening FPS Holding 2023")).toBe(false);
  });

  it("matcht niet op lege invoer", () => {
    expect(bevatGeconsolideerd("")).toBe(false);
  });
});

describe("extraheerTekst — e-mailbestanden (.eml) écht parsen", () => {
  const eml = Buffer.from([
    "From: \"Arjen Gort\" <a.gort@voorbeeld.nl>",
    "To: rene@fpsbouw.nl",
    "Subject: De Aak 71 : plafonds brandwerend maken",
    "Date: Wed, 12 Aug 2026 13:09:23 +0200",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Kun jij mij een kostenopgave doen voor De Aak 71 in Borne?",
    "",
  ].join("\r\n"));

  it("haalt onderwerp en inhoud uit een .eml (ook bij generiek MIME-type)", async () => {
    const { extraheerTekst } = await import("./documentIntelligence");
    const r = await extraheerTekst(eml, "application/octet-stream", "aanvraag.eml");
    expect(r.bron).toBe("email");
    expect(r.tekst).toContain("Onderwerp: De Aak 71 : plafonds brandwerend maken");
    expect(r.tekst).toContain("kostenopgave");
  });

  it("herkent message/rfc822 als e-mail en geeft geen rauwe headers terug", async () => {
    const { extraheerTekst } = await import("./documentIntelligence");
    const r = await extraheerTekst(eml, "message/rfc822", "bericht");
    expect(r.bron).toBe("email");
    expect(r.tekst?.startsWith("Onderwerp:")).toBe(true);
  });
});
