// Gedeeld bevoegdheden-model voor FPS Brandpreventie.
//
// Dit is de enige bron voor de modulelijst, de niveaus en de standaardprofielen
// (presets). Web (firevault) en server (api-server) importeren dit zodat de
// matrix nooit uiteenloopt. Een nieuwe module (bv. HRM, Calculaties, Offerte)
// toevoegen is één regel in MODULES; de module verschijnt dan automatisch in de
// bevoegdheden-matrix en in de admin-UI.

export const MODULES = [
  {
    id: "gebouwen",
    label: "Gebouwen",
    omschrijving: "Gebouwen, verdiepingen, plattegronden en projectdossiers",
  },
  {
    id: "voorzieningen",
    label: "Spots",
    omschrijving: "Brandpreventieve voorzieningen (spots), foto's en scheidingen",
  },
  {
    id: "inspecties",
    label: "Inspecties",
    omschrijving: "Oplever-, periodieke, jaarlijkse en herstelinspecties",
  },
  {
    id: "onderhoud",
    label: "Onderhoud",
    omschrijving: "Werkorders en onderhoudstaken",
  },
  {
    id: "rapportages",
    label: "Rapportages",
    omschrijving: "Opleverrapporten, exports en overzichten",
  },
  {
    id: "bibliotheek",
    label: "Bibliotheek",
    omschrijving: "Applicaties, toepassingen, testrapporten en documenten",
  },
  {
    id: "gebruikers",
    label: "Gebruikers",
    omschrijving: "Gebruikersbeheer, uitnodigingen en bevoegdheden",
  },
  {
    id: "crm",
    label: "CRM",
    omschrijving: "Relatiebeheer en commerciele opvolging",
  },
  {
    id: "abonnementen",
    label: "Abonnementen",
    omschrijving: "Abonnementen en pakketten",
  },
  {
    id: "personeel",
    label: "Personeel (HRM)",
    omschrijving: "Medewerkers, functiehuis, opleidingen, certificaten en bekwaamheidsmatrix",
  },
  {
    id: "dossiers",
    label: "Dossiers",
    omschrijving: "Project- en gebouwdossiers, documentstatussen en archivering",
  },
  {
    id: "offertes",
    label: "Offertes",
    omschrijving: "Offertestructuur, begroting en uitgangspunten (Offerte Intelligence)",
  },
  {
    id: "systeem",
    label: "Systeembeheer",
    omschrijving: "Systeeminstellingen, beveiliging en logboeken",
  },
  {
    id: "planning",
    label: "Planning",
    omschrijving: "Planningsitems, werkagenda's en afwezigheid",
  },
  {
    id: "calculaties",
    label: "Calculaties",
    omschrijving: "Kostenberekeningen, tarieven en normtijden",
  },
  {
    id: "toolbox",
    label: "Toolbox",
    omschrijving: "Toolboxberichten en leesbevestigingen",
  },
  {
    id: "gereedschappen",
    label: "Gereedschappen",
    omschrijving: "Machines, gereedschappen, bruikleenovereenkomsten en meldingen",
  },
  {
    id: "financieel",
    label: "Financieel & Facturatie",
    omschrijving: "Factuurverwerking, accordering en AccountView-export",
  },
  {
    id: "financieel_vertrouwelijk",
    label: "Financieel vertrouwelijk (jaarstukken)",
    omschrijving: "Vertrouwelijke jaarrekeningen, kerncijfers en het meerjarenoverzicht voor directie",
  },
  {
    id: "salarisarchief",
    label: "Salarisarchief & SEPA",
    omschrijving: "Loonstroken, jaaropgaven, SEPA-betaalbestanden en salarisdocumentbeheer",
  },
  {
    id: "salaris_mutaties",
    label: "Salarismutaties",
    omschrijving: "Salarismutaties per loonperiode verzamelen, controleren en accorderen",
  },
  {
    id: "scab_mail",
    label: "SCAB Salarismail",
    omschrijving: "AI-conceptmails aan SCAB voor FPS Bouw en Renovatie salarisverwerking",
  },
  {
    id: "boekhouder_portaal",
    label: "Boekhouderportaal",
    omschrijving: "Externe boekhouder: upload/download documenten, mutatieoverzicht, SEPA, jaarrekening",
  },
  {
    id: "wagenpark",
    label: "Wagenpark",
    omschrijving: "Voertuigbeheer, onderhoud, APK, kosten, ritten en Traxgo-koppeling",
  },
  {
    id: "organisatie",
    label: "Organisatie",
    omschrijving: "Bedrijfsgegevens, verzekeringen, jaarverslagen en bedrijfsdocumenten",
  },
  {
    id: "magazijn",
    label: "Magazijn",
    omschrijving: "Voorraadbeheer, locaties, mutaties, reserveringen, uitgiftes en retouren",
  },
  {
    id: "goedkeuring",
    label: "Goedkeuringsbeleid",
    omschrijving:
      "Governance & Approval Engine: financiële grenzen, vier-ogen-regels en goedkeurings-/afwijzingsacties voor offertes, facturen, inkoop en overige documenten. Niveau 1 = tijdlijn en beleid inzien, niveau 3 = zelf goedkeuren/afwijzen, niveau 4 = beleidsregels beheren",
  },
  {
    id: "declaraties",
    label: "Declaraties",
    omschrijving:
      "Onkostendeclaraties: indienen, beoordelen (directeur/hoofdbeheerder) en verwerken (administratie/Hoekwoning). Niveau 1 = eigen inzien, niveau 2 = aanmaken en indienen, niveau 3 = beoordelen en goedkeuren/afwijzen, niveau 4 = verwerken en beleid beheren",
  },
] as const;

export type ModuleId = (typeof MODULES)[number]["id"];

export const MODULE_IDS: ModuleId[] = MODULES.map((m) => m.id);

export type ModuleMeta = (typeof MODULES)[number];

export const NIVEAUS = [
  { waarde: 0, label: "Geen toegang", kort: "Geen", omschrijving: "Module is niet zichtbaar" },
  { waarde: 1, label: "Lezen", kort: "Lezen", omschrijving: "Inzien, niets wijzigen" },
  { waarde: 2, label: "Wijzigen", kort: "Wijzigen", omschrijving: "Bestaande gegevens bewerken" },
  { waarde: 3, label: "Aanmaken en wijzigen", kort: "Aanmaken", omschrijving: "Nieuw aanmaken en bestaande bewerken" },
  { waarde: 4, label: "Volledig beheer", kort: "Beheer", omschrijving: "Aanmaken, bewerken en verwijderen" },
] as const;

export type Niveau = 0 | 1 | 2 | 3 | 4;
export const MAX_NIVEAU = 4;

// Een bevoegdheden-matrix: module-id -> niveau. Bewust een open map (string keys)
// zodat onbekende/nieuwe modules nooit een runtime- of contractfout geven.
export type Bevoegdheden = Record<string, number>;

export function niveauVan(
  bevoegdheden: Bevoegdheden | null | undefined,
  module: ModuleId,
): number {
  const n = bevoegdheden?.[module];
  return typeof n === "number" && n > 0 ? n : 0;
}

export function heeftNiveau(
  bevoegdheden: Bevoegdheden | null | undefined,
  module: ModuleId,
  minNiveau: number,
): boolean {
  return niveauVan(bevoegdheden, module) >= minNiveau;
}

// Heeft de gebruiker ergens minstens leesrecht? Zo niet -> "geen toegang".
export function heeftEnigeToegang(
  bevoegdheden: Bevoegdheden | null | undefined,
): boolean {
  if (!bevoegdheden) return false;
  return MODULE_IDS.some((m) => niveauVan(bevoegdheden, m) >= 1);
}

// Diepe gelijkheid van twee bevoegdheden-matrices, waarbij niveau 0 en een
// ontbrekende sleutel als gelijk gelden (beide = geen toegang). Gedeeld door de
// profielen- en gebruikers-routes voor preset-vergelijking en herkomstdetectie.
export function bevoegdhedenGelijk(
  a: Bevoegdheden | null | undefined,
  b: Bevoegdheden | null | undefined,
): boolean {
  const aa = a ?? {};
  const bb = b ?? {};
  const sleutels = new Set([...Object.keys(aa), ...Object.keys(bb)]);
  for (const s of sleutels) {
    if ((aa[s] ?? 0) !== (bb[s] ?? 0)) return false;
  }
  return true;
}

// ── Basisrollen ──────────────────────────────────────────────────────────
// hoofdbeheerder: omzeilt de matrix volledig.
// gebruiker: toegang volledig bepaald door de matrix.
// klant: vast eigen portaal, geen matrix-toegang tot de interne modules.
export const BASISROLLEN = ["hoofdbeheerder", "gebruiker", "klant"] as const;
export type Basisrol = (typeof BASISROLLEN)[number];

function matrix(waarden: Partial<Record<ModuleId, Niveau>>): Bevoegdheden {
  const out: Bevoegdheden = {};
  for (const m of MODULE_IDS) out[m] = waarden[m] ?? 0;
  return out;
}

export const VOLLEDIGE_BEVOEGDHEDEN: Bevoegdheden = matrix(
  MODULE_IDS.reduce<Partial<Record<ModuleId, Niveau>>>((acc, m) => {
    acc[m] = MAX_NIVEAU;
    return acc;
  }, {}),
);

// Klant heeft geen toegang tot de interne modules (eigen portaal).
export const KLANT_BEVOEGDHEDEN: Bevoegdheden = matrix({});

// ── Standaardprofielen (presets) ───────────────────────────────────────────
// Een preset vult de matrix als startpunt; per gebruiker volledig overschrijfbaar.
// De functietitel en de feitelijke bevoegdheden staan los van elkaar.
export interface Preset {
  naam: string;
  groep: string;
  bevoegdheden: Bevoegdheden;
}

export const PRESETS: Preset[] = [
  {
    naam: "Monteur",
    groep: "Uitvoering",
    bevoegdheden: matrix({
      gebouwen: 1, voorzieningen: 3, inspecties: 3, onderhoud: 3,
      rapportages: 1, bibliotheek: 1, planning: 1, toolbox: 1, declaraties: 2,
    }),
  },
  {
    naam: "Timmerman",
    groep: "Uitvoering",
    bevoegdheden: matrix({
      gebouwen: 1, voorzieningen: 3, inspecties: 2, onderhoud: 3,
      rapportages: 1, bibliotheek: 1, declaraties: 2,
    }),
  },
  {
    naam: "Uitvoerder",
    groep: "Uitvoering",
    bevoegdheden: matrix({
      gebouwen: 2, voorzieningen: 3, inspecties: 3, onderhoud: 3,
      rapportages: 2, bibliotheek: 1, planning: 2, toolbox: 1, declaraties: 2,
    }),
  },
  {
    naam: "Onderhoudsmonteur",
    groep: "Uitvoering",
    bevoegdheden: matrix({
      gebouwen: 1, voorzieningen: 2, inspecties: 2, onderhoud: 4,
      rapportages: 1, bibliotheek: 1, planning: 1, toolbox: 1, declaraties: 2,
    }),
  },
  {
    naam: "Controleur",
    groep: "Uitvoering",
    bevoegdheden: matrix({
      gebouwen: 1, voorzieningen: 1, inspecties: 3, onderhoud: 3,
      rapportages: 1, bibliotheek: 1,
    }),
  },
  {
    naam: "Externe inhuur",
    groep: "Uitvoering",
    bevoegdheden: matrix({
      gebouwen: 1, voorzieningen: 2, inspecties: 1, onderhoud: 2,
      rapportages: 1, bibliotheek: 1, toolbox: 1,
    }),
  },
  {
    naam: "Projectleider",
    groep: "Projecten",
    bevoegdheden: matrix({
      gebouwen: 4, voorzieningen: 4, inspecties: 4, onderhoud: 4,
      rapportages: 4, bibliotheek: 3, crm: 3,
      planning: 3, toolbox: 3, calculaties: 1,
      financieel: 2, goedkeuring: 3, declaraties: 3,
    }),
  },
  {
    naam: "Werkvoorbereider",
    groep: "Projecten",
    bevoegdheden: matrix({
      gebouwen: 3, voorzieningen: 3, inspecties: 2, onderhoud: 3,
      rapportages: 2, bibliotheek: 3, crm: 1,
      financieel: 3,
    }),
  },
  {
    naam: "Project-admin",
    groep: "Projecten",
    bevoegdheden: matrix({
      gebouwen: 2, voorzieningen: 2, inspecties: 2, onderhoud: 2,
      rapportages: 3, bibliotheek: 2, crm: 2,
    }),
  },
  {
    naam: "Planner",
    groep: "Projecten",
    bevoegdheden: matrix({
      planning: 4, toolbox: 2, gebouwen: 2,
      voorzieningen: 1, onderhoud: 1, personeel: 1,
    }),
  },
  {
    naam: "Commercieel",
    groep: "Commercieel",
    bevoegdheden: matrix({
      gebouwen: 1, voorzieningen: 1, rapportages: 1, bibliotheek: 1,
      crm: 4, abonnementen: 4, offertes: 3,
    }),
  },
  {
    naam: "Calculatie",
    groep: "Commercieel",
    bevoegdheden: matrix({
      gebouwen: 1, voorzieningen: 1, rapportages: 1, bibliotheek: 2,
      offertes: 4, dossiers: 2, crm: 1, calculaties: 4,
    }),
  },
  {
    naam: "HRM-adviseur",
    groep: "HRM & Personeel",
    bevoegdheden: matrix({
      personeel: 4, dossiers: 1, rapportages: 1, salarisarchief: 3,
    }),
  },
  {
    naam: "Directie",
    groep: "Financieel & Directie",
    bevoegdheden: matrix({
      gebouwen: 2, voorzieningen: 2, inspecties: 2, onderhoud: 2,
      rapportages: 4, bibliotheek: 2, crm: 4, abonnementen: 4,
      personeel: 2, dossiers: 2, offertes: 2, calculaties: 1, planning: 2,
      financieel: 4, financieel_vertrouwelijk: 4, salarisarchief: 1,
      goedkeuring: 4, declaraties: 4,
    }),
  },
  {
    naam: "Administratie",
    groep: "Financieel & Directie",
    bevoegdheden: matrix({
      gebouwen: 2, inspecties: 1, onderhoud: 2, rapportages: 3,
      crm: 2, personeel: 2, dossiers: 3, offertes: 1, planning: 1,
      financieel: 4, financieel_vertrouwelijk: 2, salarisarchief: 2,
      goedkeuring: 3, declaraties: 4,
    }),
  },
  {
    naam: "Externe boekhouder",
    groep: "Financieel & Directie",
    bevoegdheden: matrix({
      rapportages: 1,
      financieel: 4,
      financieel_vertrouwelijk: 2,
      salarisarchief: 2,
      salaris_mutaties: 1,
      boekhouder_portaal: 4,
    }),
  },
  {
    naam: "Wagenparkbeheerder",
    groep: "Operationeel",
    bevoegdheden: matrix({
      wagenpark: 4,
      gereedschappen: 1,
      planning: 1,
    }),
  },
  {
    naam: "Magazijnbeheerder",
    groep: "Operationeel",
    bevoegdheden: matrix({
      magazijn: 4,
      offertes: 1,
    }),
  },
];

// ── Meerdere rollen per gebruiker (P2) ────────────────────────────────────
// Combineert de matrices van meerdere gekoppelde rollen (profielen) tot één
// effectieve matrix: per module geldt het hoogste niveau (unie van rollen).
// - Lege invoer (geen rollen) geeft een lege matrix, zodat de bestaande
//   legacy-fallback (bevoegdhedenVoorLegacyRol) en "geen toegang"-logica
//   ongewijzigd blijven werken.
// - Onbekende module-sleutels blijven behouden (open map, zie Bevoegdheden).
// - Ongeldige waarden (niet-numeriek of <= 0) tellen als 0, conform niveauVan.
export function combineerBevoegdheden(
  matrices: ReadonlyArray<Bevoegdheden | null | undefined>,
): Bevoegdheden {
  const aanwezig = matrices.filter((m): m is Bevoegdheden => m != null);
  if (aanwezig.length === 0) return {};
  const out: Bevoegdheden = {};
  for (const m of MODULE_IDS) out[m] = 0;
  for (const mtx of aanwezig) {
    for (const [sleutel, waarde] of Object.entries(mtx)) {
      const niveau = typeof waarde === "number" && waarde > 0 ? waarde : 0;
      if (niveau > (out[sleutel] ?? 0)) out[sleutel] = niveau;
    }
  }
  return out;
}

export const GROEP_OPTIES = [
  "Uitvoering",
  "Projecten",
  "Commercieel",
  "HRM & Personeel",
  "Financieel & Directie",
  "Operationeel",
] as const;

export type ProfielGroep = (typeof GROEP_OPTIES)[number];

// ── Re-exports centrale rechtenstructuur ──────────────────────────────────
export type { ObjectType, ObjectRecht, PermissieContext } from "./types";
export { PermissieEngine } from "./engine";

// ── Migratie / fallback ────────────────────────────────────────────────────
// Zet een oude systeemrol om naar een matrix. Gebruikt voor de backfill en als
// veilige fallback in de middleware zolang nog niet alle accounts zijn omgezet.
export function bevoegdhedenVoorLegacyRol(
  rol: string | null | undefined,
): Bevoegdheden {
  switch (rol) {
    case "hoofdbeheerder":
    case "beheerder":
      return { ...VOLLEDIGE_BEVOEGDHEDEN };
    case "monteur":
      return matrix({
        gebouwen: 1, voorzieningen: 3, inspecties: 3, onderhoud: 3,
        rapportages: 1, bibliotheek: 1,
      });
    case "controleur":
      return matrix({
        gebouwen: 1, voorzieningen: 1, inspecties: 3, onderhoud: 3,
        rapportages: 1, bibliotheek: 1,
      });
    default:
      // klant, onbekend -> geen toegang (rol "gebruiker" gebruikt DB-matrix, geen fallback)
      return {};
  }
}
