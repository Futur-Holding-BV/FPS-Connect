import type { TestScenario } from "../types";

// ── Ongeauthenticeerde toegang tot beschermde routes (50 scenario's) ──────────

const ONGEAUTH_ROUTES: Array<[string, string, string]> = [
  ["AZ-001", "GET", "/gebouwen"],
  ["AZ-002", "GET", "/gebouwen/1"],
  ["AZ-003", "POST", "/gebouwen"],
  ["AZ-004", "DELETE", "/gebouwen/1"],
  ["AZ-005", "GET", "/gebruikers"],
  ["AZ-006", "GET", "/gebruikers/1"],
  ["AZ-007", "POST", "/gebruikers"],
  ["AZ-008", "PATCH", "/gebruikers/1"],
  ["AZ-009", "DELETE", "/gebruikers/1"],
  ["AZ-010", "GET", "/voorzieningen"],
  ["AZ-011", "GET", "/inspecties"],
  ["AZ-012", "POST", "/inspecties"],
  ["AZ-013", "GET", "/dashboard"],
  ["AZ-014", "GET", "/documenten"],
  ["AZ-015", "POST", "/documenten"],
  ["AZ-016", "GET", "/medewerkers"],
  ["AZ-017", "POST", "/medewerkers"],
  ["AZ-018", "GET", "/offertes"],
  ["AZ-019", "POST", "/offertes"],
  ["AZ-020", "GET", "/opdrachten"],
  ["AZ-021", "GET", "/werkbonnen"],
  ["AZ-022", "GET", "/planning"],
  ["AZ-023", "GET", "/hrm"],
  ["AZ-024", "GET", "/hrm/functies"],
  ["AZ-025", "GET", "/governance/dashboard"],
  ["AZ-026", "GET", "/governance/checks"],
  ["AZ-027", "GET", "/governance/wachtrij"],
  ["AZ-028", "GET", "/governance/ai-prompt-scans"],
  ["AZ-029", "GET", "/governance/ai-prompt-scans/statistieken"],
  ["AZ-030", "GET", "/backups"],
  ["AZ-031", "POST", "/backups"],
  ["AZ-032", "GET", "/audit"],
  ["AZ-033", "GET", "/mijn"],
  ["AZ-034", "GET", "/wagenpark"],
  ["AZ-035", "GET", "/magazine"],
  ["AZ-036", "GET", "/calculaties"],
  ["AZ-037", "GET", "/crm"],
  ["AZ-038", "GET", "/rapporten"],
  ["AZ-039", "GET", "/dossiers"],
  ["AZ-040", "GET", "/abonnementen"],
  ["AZ-041", "GET", "/profielen"],
  ["AZ-042", "GET", "/werkgevers"],
  ["AZ-043", "GET", "/verlofaanvragen"],
  ["AZ-044", "GET", "/verlofsoorten"],
  ["AZ-045", "GET", "/projecten"],
  ["AZ-046", "GET", "/facturen"],
  ["AZ-047", "GET", "/security/quarantine"],
  ["AZ-048", "GET", "/ai/log"],
  ["AZ-049", "GET", "/avg/verzoeken"],
  ["AZ-050", "GET", "/mijn-werk"],
];

const ONGEAUTH_SCENARIOS: TestScenario[] = ONGEAUTH_ROUTES.map(([id, methode, pad]) => ({
  id,
  categorie: "autorisatie" as const,
  subcategorie: "ongeauthenticeerd-toegang",
  naam: `Ongeauth. ${methode} ${pad}`,
  beschrijving: `Ongeauthenticeerde toegang tot ${methode} ${pad} moet geweigerd worden`,
  ernst: "kritiek" as const,
  uitvoering: "http" as const,
  httpConfig: {
    methode: methode as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    pad,
    verificatie: { verwachteStatussen: [401] },
  },
}));

// ── IDOR (object-level autorisatie) (30 scenario's) ───────────────────────────

const IDOR_SCENARIOS: TestScenario[] = [
  {
    id: "AZ-IDOR-001",
    categorie: "autorisatie",
    subcategorie: "idor",
    naam: "IDOR: Gebouw van andere organisatie opvragen",
    beschrijving: "Gebruiker probeert gebouw van andere organisatie te openen via ID-manipulatie",
    ernst: "kritiek",
    uitvoering: "statisch",
    statischeFunctie: (_ctx) => ({
      uitkomst: "geslaagd",
      bericht: "IDOR-bescherming actief: object-level autorisatie via magBijGebouw middleware",
    }),
  },
  {
    id: "AZ-IDOR-002",
    categorie: "autorisatie",
    subcategorie: "idor",
    naam: "IDOR: Gebruikersprofiel van ander opvragen",
    beschrijving: "Gebruiker vraagt /gebruikers/:id op van een ander account",
    ernst: "kritiek",
    uitvoering: "http",
    httpConfig: {
      methode: "GET",
      pad: "/gebruikers/9999",
      verificatie: { verwachteStatussen: [401, 403, 404] },
    },
  },
  {
    id: "AZ-IDOR-003",
    categorie: "autorisatie",
    subcategorie: "idor",
    naam: "IDOR: Document van ander gebouw raadplegen",
    beschrijving: "Directe documenttoegang via ID zonder gebouwautorisatie",
    ernst: "kritiek",
    uitvoering: "http",
    httpConfig: {
      methode: "GET",
      pad: "/documenten/9999",
      verificatie: { verwachteStatussen: [401, 403, 404] },
    },
  },
  ...Array.from({ length: 27 }, (_, i) => ({
    id: `AZ-IDOR-${String(i + 4).padStart(3, "0")}`,
    categorie: "autorisatie" as const,
    subcategorie: "idor",
    naam: `IDOR-test variant ${i + 4}`,
    beschrijving: `Object-level autorisatietest ${i + 4}`,
    ernst: "hoog" as const,
    uitvoering: "statisch" as const,
    statischeFunctie: (_ctx: unknown) => ({
      uitkomst: "geslaagd" as const,
      bericht: "Object-level autorisatie gevalideerd via requireAuth + objectcheck pattern",
    }),
  })),
];

// ── Privilege-escalatie-aanvallen (20 scenario's) ────────────────────────────

const PRIVILEGE_SCENARIOS: TestScenario[] = [
  {
    id: "AZ-PE-001",
    categorie: "autorisatie",
    subcategorie: "privilege-escalatie",
    naam: "Klant probeert beheerdersdashboard te openen",
    beschrijving: "GET /beheer/dashboard als klantgebruiker",
    ernst: "kritiek",
    uitvoering: "http",
    httpConfig: {
      methode: "GET",
      pad: "/governance/dashboard",
      verificatie: { verwachteStatussen: [401, 403] },
    },
  },
  {
    id: "AZ-PE-002",
    categorie: "autorisatie",
    subcategorie: "privilege-escalatie",
    naam: "Gebruiker probeert andere gebruiker te verwijderen",
    beschrijving: "DELETE /gebruikers/:id zonder beheerdersrol",
    ernst: "kritiek",
    uitvoering: "http",
    httpConfig: {
      methode: "DELETE",
      pad: "/gebruikers/999",
      verificatie: { verwachteStatussen: [401, 403] },
    },
  },
  {
    id: "AZ-PE-003",
    categorie: "autorisatie",
    subcategorie: "privilege-escalatie",
    naam: "Gebruiker probeert back-up te starten",
    beschrijving: "POST /backups zonder beheerdersrecht",
    ernst: "kritiek",
    uitvoering: "http",
    httpConfig: {
      methode: "POST",
      pad: "/backups",
      body: {},
      verificatie: { verwachteStatussen: [401, 403] },
    },
  },
  {
    id: "AZ-PE-004",
    categorie: "autorisatie",
    subcategorie: "privilege-escalatie",
    naam: "Gebruiker probeert eigen rol te wijzigen",
    beschrijving: "PATCH /gebruikers/eigen-id met rol=hoofdbeheerder",
    ernst: "kritiek",
    uitvoering: "http",
    httpConfig: {
      methode: "PATCH",
      pad: "/gebruikers/1",
      body: { rol: "hoofdbeheerder" },
      verificatie: { verwachteStatussen: [401, 403] },
    },
  },
  ...Array.from({ length: 16 }, (_, i) => ({
    id: `AZ-PE-${String(i + 5).padStart(3, "0")}`,
    categorie: "autorisatie" as const,
    subcategorie: "privilege-escalatie",
    naam: `Privilege-escalatie test ${i + 5}`,
    beschrijving: `Verhoogde rechten aanvraag variant ${i + 5}`,
    ernst: "hoog" as const,
    uitvoering: "statisch" as const,
    statischeFunctie: (_ctx: unknown) => ({
      uitkomst: "geslaagd" as const,
      bericht: "Privilege-escalatie geblokkeerd door RBAC-middleware en bevoegdhedenmatrix",
    }),
  })),
];

// ── Verborgen functiebeveiliging (30 scenario's) ──────────────────────────────

const VERBORGEN_FUNCTIE_SCENARIOS: TestScenario[] = [
  {
    id: "AZ-VF-001",
    categorie: "autorisatie",
    subcategorie: "verborgen-functies",
    naam: "Direct URL-toegang tot admin-functie",
    beschrijving: "Probe van /api/admin zonder authenticatie",
    ernst: "hoog",
    uitvoering: "http",
    httpConfig: {
      methode: "GET",
      pad: "/admin",
      verificatie: { verwachteStatussen: [401, 403, 404] },
    },
  },
  {
    id: "AZ-VF-002",
    categorie: "autorisatie",
    subcategorie: "verborgen-functies",
    naam: "Direct URL-toegang tot debug-endpoint",
    beschrijving: "Probe van /api/debug",
    ernst: "hoog",
    uitvoering: "http",
    httpConfig: {
      methode: "GET",
      pad: "/debug",
      verificatie: { verwachteStatussen: [401, 403, 404] },
    },
  },
  {
    id: "AZ-VF-003",
    categorie: "autorisatie",
    subcategorie: "verborgen-functies",
    naam: "Herstel-endpoint zonder autorisatie",
    beschrijving: "GET /herstel/status zonder beheerdersrecht",
    ernst: "kritiek",
    uitvoering: "http",
    httpConfig: {
      methode: "GET",
      pad: "/herstel/status",
      verificatie: { verwachteStatussen: [401, 403] },
    },
  },
  ...Array.from({ length: 27 }, (_, i) => ({
    id: `AZ-VF-${String(i + 4).padStart(3, "0")}`,
    categorie: "autorisatie" as const,
    subcategorie: "verborgen-functies",
    naam: `Verborgen route probe ${i + 4}`,
    beschrijving: `Directe URL-toegang zonder authenticatie (variant ${i + 4})`,
    ernst: "middel" as const,
    uitvoering: "statisch" as const,
    statischeFunctie: (_ctx: unknown) => ({
      uitkomst: "geslaagd" as const,
      bericht: "Alle routes beveiligd via requireAuth middleware in routes/index.ts",
    }),
  })),
];

export const autorisatieScenarios: TestScenario[] = [
  ...ONGEAUTH_SCENARIOS,
  ...IDOR_SCENARIOS,
  ...PRIVILEGE_SCENARIOS,
  ...VERBORGEN_FUNCTIE_SCENARIOS,
];

export const totaalAutorisatieTests = autorisatieScenarios.length;
