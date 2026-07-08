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
  // Onderstaande velden zijn optioneel en worden alleen door DocumentVoet
  // geconsumeerd (voettekst-regel + marge-onder/-links/-rechts). koptekst_positie
  // en marge_boven zijn bewust NIET opgenomen: er is geen gedeelde koptekst-
  // component om op toe te passen (elke Familie-pagina heeft een eigen kop) —
  // die velden worden wel opgeslagen op de werkgever, maar nog niet visueel
  // toegepast (zie docs/roadmap/document-design-system.md).
  voettekst?: string;
  iban?: string;
  voettekstPositie?: "links" | "midden" | "rechts";
  margeOnder?: number;
  margeLinks?: number;
  margeRechts?: number;
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
