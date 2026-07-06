export type TestCategorie =
  | "infrastructuur"
  | "authenticatie"
  | "autorisatie"
  | "api-beveiliging"
  | "upload-beveiliging"
  | "malware"
  | "ai-beveiliging"
  | "governance"
  | "business-logica"
  | "logging"
  | "email-beveiliging"
  | "mobiel-beveiliging";

export type Ernst = "info" | "laag" | "middel" | "hoog" | "kritiek";
export type TestUitkomst = "geslaagd" | "mislukt" | "waarschuwing" | "overgeslagen";
export type TestUitvoering = "http" | "config" | "db" | "statisch";

export interface HttpTestConfig {
  methode: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  pad: string;
  body?: unknown;
  headers?: Record<string, string>;
  verificatie: {
    verwachteStatussen: number[];
    verbodeneBody?: string[];
    vereisteHeaders?: string[];
    verbodeneHeaders?: string[];
    bodyBevatNiet?: string[];
  };
}

export interface TestResultaat {
  uitkomst: TestUitkomst;
  bericht: string;
  details?: string;
  aanbeveling?: string;
  duurMs?: number;
}

export interface TestScenario {
  id: string;
  categorie: TestCategorie;
  subcategorie: string;
  naam: string;
  beschrijving: string;
  ernst: Ernst;
  uitvoering: TestUitvoering;
  httpConfig?: HttpTestConfig;
  statischeFunctie?: (ctx: TestContext) => TestResultaat;
}

export interface TestContext {
  baseUrl: string;
  authCookie?: string;
  gebruikerId?: number;
}

export interface RunConfig {
  baseUrl: string;
  authCookie?: string;
  categorieFilter?: TestCategorie[];
}

export interface CategoryScore {
  categorie: TestCategorie;
  totaal: number;
  geslaagd: number;
  mislukt: number;
  waarschuwingen: number;
  overgeslagen: number;
  kritiekMislukt: number;
  score: number;
}

export interface ScanSamenvatting {
  categoryScores: CategoryScore[];
  topBevindingen: Array<{
    testId: string;
    naam: string;
    ernst: Ernst;
    bericht: string;
    categorie: TestCategorie;
  }>;
  releaseAdvies: "goedgekeurd" | "afgewezen" | "waarschuwing";
  releaseReden: string;
}

export const CATEGORIE_GEWICHTEN: Record<TestCategorie, number> = {
  "ai-beveiliging": 15,
  "autorisatie": 14,
  "authenticatie": 13,
  "api-beveiliging": 12,
  "governance": 11,
  "upload-beveiliging": 10,
  "malware": 9,
  "business-logica": 8,
  "logging": 7,
  "infrastructuur": 5,
  "email-beveiliging": 4,
  "mobiel-beveiliging": 2,
};

export const ERNST_SCORE_AFTREK: Record<Ernst, number> = {
  info: 0,
  laag: 1,
  middel: 5,
  hoog: 15,
  kritiek: 40,
};
