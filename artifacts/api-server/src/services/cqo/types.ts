export type CqoStatus = "lopend" | "voltooid" | "mislukt";
export type CqoErnst = "info" | "laag" | "gemiddeld" | "hoog" | "kritiek";
export type CqoUrgentie = "laag" | "gemiddeld" | "hoog" | "kritiek";
export type CqoReleaseStatus =
  | "niet_gereed"
  | "verbeteringen_nodig"
  | "gereed_acceptatie"
  | "gereed_productie";

export type CqoCategorie =
  | "functionaliteit"
  | "werkbaarheid"
  | "compleetheid"
  | "logica"
  | "leesbaarheid"
  | "gebruiksvriendelijkheid"
  | "esthetiek"
  | "commercieel"
  | "veiligheid"
  | "privacy"
  | "automatisering"
  | "performance"
  | "mobiel"
  | "rapportages"
  | "integraties";

export const CATEGORIE_GEWICHTEN: Record<CqoCategorie, number> = {
  veiligheid: 0.15,
  privacy: 0.12,
  functionaliteit: 0.12,
  compleetheid: 0.10,
  gebruiksvriendelijkheid: 0.09,
  performance: 0.08,
  leesbaarheid: 0.06,
  esthetiek: 0.06,
  commercieel: 0.06,
  logica: 0.05,
  werkbaarheid: 0.04,
  integraties: 0.03,
  mobiel: 0.02,
  rapportages: 0.01,
  automatisering: 0.01,
};

export interface SpecialistBevinding {
  ernst: CqoErnst;
  titel: string;
  bevinding: string;
  impact?: string;
  urgentie?: CqoUrgentie;
  betrokkenModules?: string[];
  risico?: string;
  oplossing?: string;
  verwachteVerbetering?: string;
  positief?: boolean;
}

export interface SpecialistVerbeterpunt {
  urgentie: CqoUrgentie;
  titel: string;
  probleem: string;
  impact?: string;
  betrokkenModules?: string[];
  risico?: string;
  oplossing: string;
  verwachteVerbetering?: string;
}

export interface SpecialistResultaat {
  specialistId: string;
  specialistNaam: string;
  categorie: CqoCategorie;
  score: number;
  samenvatting: string;
  bevindingen: SpecialistBevinding[];
  verbeterpunten: SpecialistVerbeterpunt[];
}

export interface Specialist {
  id: string;
  naam: string;
  categorie: CqoCategorie;
  systemPrompt: string;
}

export interface CqoCategorieScores {
  functionaliteit?: number;
  werkbaarheid?: number;
  compleetheid?: number;
  logica?: number;
  leesbaarheid?: number;
  gebruiksvriendelijkheid?: number;
  esthetiek?: number;
  commercieel?: number;
  veiligheid?: number;
  privacy?: number;
  automatisering?: number;
  performance?: number;
  mobiel?: number;
  rapportages?: number;
  integraties?: number;
}

export function bepaalReleaseStatus(
  totaalScore: number,
  aantalKritiek: number,
  aantalHoog: number,
  categorieScores: CqoCategorieScores
): { status: CqoReleaseStatus; geblokkeerd: boolean; reden: string | null } {
  const veiligheid = categorieScores.veiligheid ?? 100;
  const privacy = categorieScores.privacy ?? 100;

  const harde_blokkades: string[] = [];
  if (aantalKritiek > 0)
    harde_blokkades.push(`${aantalKritiek} kritieke bevinding(en)`);
  if (veiligheid < 75)
    harde_blokkades.push(`veiligheidsscore te laag (${veiligheid.toFixed(0)}/100)`);
  if (privacy < 75)
    harde_blokkades.push(`privacyscore te laag (${privacy.toFixed(0)}/100)`);

  const geblokkeerd = harde_blokkades.length > 0;
  const reden = geblokkeerd ? harde_blokkades.join("; ") : null;

  let status: CqoReleaseStatus;
  if (geblokkeerd || totaalScore < 65) {
    status = "niet_gereed";
  } else if (totaalScore < 80 || aantalHoog > 3) {
    status = "verbeteringen_nodig";
  } else if (totaalScore < 90 || aantalHoog > 1) {
    status = "gereed_acceptatie";
  } else {
    status = "gereed_productie";
  }

  return { status, geblokkeerd, reden };
}
