export interface WerkmaatschappijInfo {
  id?: string;
  naam: string;
  logoUrl: string;
  primaireKleur?: string;
  adres: string;
  postcodeWoonplaats: string;
  telefoon: string;
  email: string;
  website: string;
  kvk: string;
  briefpapierUrl?: string;
}

export interface DocumentMeta {
  titel: string;
  ondertitel?: string;
  projectNaam: string;
  projectNummer: string;
  klantNaam: string;
  klantLogoUrl?: string;
  heroImageUrl?: string;
  auteur: string;
  datum: string;
  versie: string;
  kenmerk?: string;
  paginaNummer?: number;
  totaalPaginas?: number;
}

export interface BaseDocumentProps {
  meta: DocumentMeta;
  mij: WerkmaatschappijInfo;
  children?: React.ReactNode;
}
