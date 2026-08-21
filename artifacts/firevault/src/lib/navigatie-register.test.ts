import { describe, expect, it } from "vitest";
import {
  resolveerNavigatieRoute,
  isVeiligInternNavigatiepad,
  vervangQueryWaarde,
  CALCULATIE_OVERZICHT_PAD,
  OFFERTE_OVERZICHT_PAD,
  type NavigatieResolver,
} from "./navigatie-register";

const r = resolveerNavigatieRoute;

describe("resolveerNavigatieRoute — kern-resolvers", () => {
  // [pad, resolver, verwachte id, verwacht terugPad, verwacht huidigeLabel?]
  const kern: Array<[string, NavigatieResolver, string, string, string?]> = [
    ["/gebouwen/42", "gebouw", "42", "/gebouwen/42?tab=project"],
    ["/modules/calculatie/7", "calculatie", "7", "/modules/calculatie"],
    ["/offertes/99", "offerte", "99", "/offertes"],
    ["/opdrachten/12", "opdracht", "12", "/offertes"],
    ["/voorzieningen/abc", "voorziening", "abc", "/voorzieningen"],
    ["/voorzieningen/abc/qr", "voorziening", "abc", "/voorzieningen", "QR-code"],
    ["/inspecties/3", "inspectie", "3", "/inspecties"],
    ["/opname/5", "opname", "5", "/opname"],
  ];
  for (const [pad, resolver, id, terugPad, huidigeLabel] of kern) {
    it(`herleidt ${pad} naar ${resolver}`, () => {
      const m = r(pad);
      expect(m.resolver).toBe(resolver);
      expect(m.params).toEqual({ id });
      expect(m.terugPad).toBe(terugPad);
      if (huidigeLabel) expect(m.huidigeLabel).toBe(huidigeLabel);
    });
  }

  it("opdracht valt op de offerte-module terug", () => {
    expect(r("/opdrachten/12").modulePad).toBe("/offertes");
  });
});

describe("resolveerNavigatieRoute — statisch kind vóór dynamisch id", () => {
  it("laat calculatie statische kinderen NIET als detail matchen", () => {
    for (const kind of ["nieuw", "import", "leveranciers", "eenheidsprijzen"]) {
      const m = r(`/modules/calculatie/${kind}`);
      expect(m.resolver).toBe("generiek");
      expect(m.modulePad).toBe(CALCULATIE_OVERZICHT_PAD);
    }
  });

  it("laat /voorzieningen/nieuw NIET als detail matchen", () => {
    const m = r("/voorzieningen/nieuw");
    expect(m.resolver).toBe("generiek");
    expect(m.modulePad).toBe("/voorzieningen");
  });

  it("laat /offertes/:id/print NIET als offerte-detail matchen", () => {
    const m = r("/offertes/99/print");
    expect(m.resolver).not.toBe("offerte");
    expect(m.modulePad).toBe("/offertes");
  });

  it("laat /opname (overzicht) NIET als opname-detail matchen", () => {
    const m = r("/opname");
    expect(m.resolver).toBe("generiek");
    expect(m.modulePad).toBe("/opname");
  });
});

describe("resolveerNavigatieRoute — dashboard & onbekende terugval", () => {
  it("herkent het dashboard", () => {
    const m = r("/");
    expect(m.resolver).toBe("generiek");
    expect(m.sleutel).toBe("dashboard");
    expect(m.terugPad).toBe("/");
  });

  it("valt volstrekt onbekende paden terug op het dashboard", () => {
    const m = r("/iets-heel-onbekends/xyz");
    expect(m.terugPad).toBe("/");
    expect(m.moduleLabel).toBe("Dashboard");
  });

  it("terugPad is altijd een veilig intern pad (geen geschiedenis)", () => {
    expect(isVeiligInternNavigatiepad(r("/losstaand").terugPad)).toBe(true);
  });
});

describe("resolveerNavigatieRoute — module-specifieke generieke terugval", () => {
  // Minstens 20 representatieve route-families uit connect-routes.tsx.
  const gevallen: Array<[string, string]> = [
    ["/magazijn/artikelen/8/label", "/magazijn"],
    ["/magazijn/tellingen/2/print", "/magazijn"],
    ["/onderhoud/contracten/4", "/onderhoud"],
    ["/onderhoud/werkbonnen/9", "/onderhoud"],
    ["/facturen/betaalbatch", "/facturen"],
    ["/facturen/12", "/facturen"],
    ["/salarisarchief/batch/3", "/salarisarchief"],
    ["/declaraties/7", "/declaraties"],
    ["/personeel/werving/5", "/personeel/werving"],
    ["/personeel/verlof", "/personeel"],
    ["/gereedschappen/3", "/gereedschappen"],
    ["/wagenpark/2/bewerken", "/wagenpark"],
    ["/crm/organisaties", "/crm"],
    ["/crm/88", "/crm"],
    ["/leveranciers/6", "/leveranciers"],
    ["/uitvoering/44", "/uitvoering"],
    ["/regie/2", "/regie"],
    ["/veiligheid/toolboxen", "/"],
    ["/snagstream/7", "/snagstream"],
    ["/organisatie/autopark", "/"],
    ["/directie/kompas", "/"],
    ["/mijn/privacy", "/"],
    ["/beheer/audit", "/"],
    ["/gebruikers", "/gebruikers"],
    ["/modules/planning/medewerkers", "/modules/planning"],
  ];
  for (const [pad, modulePad] of gevallen) {
    it(`herleidt ${pad} generiek naar ${modulePad}`, () => {
      const m = r(pad);
      expect(m.resolver).toBe("generiek");
      expect(m.modulePad).toBe(modulePad);
      expect(isVeiligInternNavigatiepad(m.terugPad)).toBe(true);
    });
  }

  it("kiest het meest-specifieke prefix (calculatie boven modules)", () => {
    expect(r("/modules/calculatie/leveranciers").modulePad).toBe(CALCULATIE_OVERZICHT_PAD);
  });
});

describe("resolveerNavigatieRoute — module-overzicht geen zelf-terugval", () => {
  // Overzichtspaden (pad === modulePad) moeten NIET naar zichzelf terugwijzen.
  const overzichten = ["/voorzieningen", "/inspecties", "/opname", "/offertes", "/gebruikers", "/magazijn", "/onderhoud", "/facturen"];
  for (const pad of overzichten) {
    it(`${pad} verwijst terug naar het dashboard, niet naar zichzelf`, () => {
      const m = r(pad);
      expect(m.modulePad).toBe(pad);
      expect(m.terugPad).not.toBe(pad);
      expect(m.terugPad).toBe("/");
      expect(m.terugLabel).toBe("Dashboard");
    });
  }

  it("diepere generieke route keert terug naar het module-overzicht", () => {
    const m = r("/magazijn/artikelen/8/label");
    expect(m.modulePad).toBe("/magazijn");
    expect(m.terugPad).toBe("/magazijn");
    expect(m.terugLabel).toBe("Magazijn");
  });
});

describe("resolveerNavigatieRoute — generieke huidigeLabel", () => {
  it("gebruikt een bekend Nederlands label voor geregistreerde statische routes", () => {
    const bekend: Array<[string, string]> = [
      ["/modules/calculatie/nieuw", "Nieuwe calculatie"],
      ["/modules/calculatie/leveranciers", "Leveranciers"],
      ["/personeel/verlof", "Verlof"],
      ["/facturen/betaalbatch", "Betaalbatch"],
      ["/crm/organisaties", "Organisaties"],
      ["/beheer/audit", "Audit trail"],
    ];
    for (const [pad, label] of bekend) expect(r(pad).huidigeLabel).toBe(label);
  });

  it("valt terug op een title-cased laatste segment (koppeltekens → spaties)", () => {
    expect(r("/facturen/klaar-voor-export").huidigeLabel).toBe("Klaar voor export");
    expect(r("/beheer/pwa-test").huidigeLabel).toBe("Pwa test");
  });

  it("herhaalt het moduleLabel niet klakkeloos op diepe routes", () => {
    const m = r("/wagenpark/2/bewerken");
    expect(m.moduleLabel).toBe("Wagenpark");
    expect(m.huidigeLabel).toBe("Bewerken");
    expect(m.huidigeLabel).not.toBe(m.moduleLabel);
  });
});

describe("resolveerNavigatieRoute — gebouw-tab-hiërarchie", () => {
  // [pad, tab, huidigeLabel, terugLabel, terugPad]
  const hierarchie: Array<[string, string | null, string, string, string]> = [
    ["/gebouwen/42", null, "Project", "Gebouw", "/gebouwen/42?tab=project"],
    ["/gebouwen/42?tab=dashboard", "dashboard", "Project", "Gebouw", "/gebouwen/42?tab=project"],
    ["/gebouwen/42?tab=project", "project", "Gebouw", "Gebouwen", "/gebouwen"],
    ["/gebouwen/42?tab=uitvoering", "uitvoering", "Uitvoering", "Project", "/gebouwen/42"],
    ["/gebouwen/42?tab=beheer", "beheer", "Beheer", "Project", "/gebouwen/42"],
    ["/gebouwen/42?tab=documenten", "documenten", "Documenten", "Project", "/gebouwen/42"],
    ["/gebouwen/42?tab=rapporten", "rapporten", "Rapporten", "Project", "/gebouwen/42"],
    ["/gebouwen/42?tab=plattegrond", "plattegrond", "Plattegrond", "Project", "/gebouwen/42"],
  ];
  for (const [pad, tab, huidigeLabel, terugLabel, terugPad] of hierarchie) {
    it(`${pad} → ${huidigeLabel} (terug ${terugLabel})`, () => {
      const m = r(pad);
      expect(m.tab).toBe(tab);
      expect(m.huidigeLabel).toBe(huidigeLabel);
      expect(m.terugLabel).toBe(terugLabel);
      expect(m.terugPad).toBe(terugPad);
    });
  }

  it("plattegrond-verdieping-route valt onder het gebouw-project", () => {
    const m = r("/gebouwen/42/plattegrond/3");
    expect(m.resolver).toBe("gebouw");
    expect(m.huidigeLabel).toBe("Plattegrond");
    expect(m.terugPad).toBe("/gebouwen/42");
  });
});

describe("isVeiligInternNavigatiepad", () => {
  const veilig = ["/gebouwen/42", "/gebouwen/42?tab=project", "/offertes?filter=open#top"];
  const onveilig = [
    "",
    "gebouwen",
    "//evil.example.com",
    "http://x.nl",
    "javascript:alert(1)",
    "/pad:met-schema",
    "/api",
    "/api/gebouwen",
    "/auth",
    "/auth/login",
    "/pad\\naar",
    "/pad\u0000",
    "/pad\u007f",
  ];
  for (const p of veilig) it(`accepteert ${JSON.stringify(p)}`, () => expect(isVeiligInternNavigatiepad(p)).toBe(true));
  for (const p of onveilig) it(`verwerpt ${JSON.stringify(p)}`, () => expect(isVeiligInternNavigatiepad(p)).toBe(false));
});

describe("vervangQueryWaarde", () => {
  // [locatie, sleutel, waarde, verwacht]
  const gevallen: Array<[string, string, string | null, string]> = [
    ["/gebouwen/42", "tab", "beheer", "/gebouwen/42?tab=beheer"],
    ["/gebouwen/42?tab=project&x=1", "tab", "beheer", "/gebouwen/42?tab=beheer&x=1"],
    ["/lijst?a=1&b=2#sectie", "b", "9", "/lijst?a=1&b=9#sectie"],
    ["/lijst?a=1&tab=x&b=2", "tab", null, "/lijst?a=1&b=2"],
    ["/lijst?tab=x", "tab", null, "/lijst"],
    ["/lijst?tab=x#top", "tab", null, "/lijst#top"],
    ["/pad?x=1", "y", "2", "/pad?x=1&y=2"],
  ];
  for (const [loc, sleutel, waarde, verwacht] of gevallen) {
    it(`${loc} [${sleutel}=${waarde}] → ${verwacht}`, () => {
      const uit = vervangQueryWaarde(loc, sleutel, waarde);
      expect(uit).toBe(verwacht);
      expect(uit.startsWith("/")).toBe(true);
    });
  }
});

describe("mutatie-bewaking — canonieke calculatie/offerte-paden", () => {
  // Faalt bewust als iemand de canonieke route pluraliseert.
  it("houdt de calculatie-canoniek op enkelvoud /modules/calculatie", () => {
    expect(CALCULATIE_OVERZICHT_PAD).toBe("/modules/calculatie");
    const m = r("/modules/calculatie/7");
    expect(m.modulePad).toBe("/modules/calculatie");
    expect(m.modulePad).not.toBe("/modules/calculaties");
  });

  it("houdt de offerte-canoniek op /offertes en offerte-detail intact", () => {
    expect(OFFERTE_OVERZICHT_PAD).toBe("/offertes");
    const m = r("/offertes/99");
    const resolver: NavigatieResolver = m.resolver;
    expect(resolver).toBe("offerte");
    expect(m.modulePad).toBe("/offertes");
    expect(m.modulePad).not.toBe("/offertess");
  });
});
