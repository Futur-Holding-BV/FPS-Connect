// Fleet-provider interface — provider-agnostische abstractie voor wagenparkdata.
// Traxgo is de eerste implementatie; Webfleet, Geotab en FleetComplete kunnen
// zonder aanpassing van de bedrijfslogica worden toegevoegd.

export interface VoertuigData {
  externalId:       string;
  kenteken?:        string;
  merk?:            string;
  type?:            string;
  kmStand?:         number;
  kmStandDatum?:    Date;
  brandstofProcent?: number;   // 0–100
  laadProcent?:     number;    // 0–100 (elektrisch)
  draaiuren?:       number;
  foutcodes?:       string[];
  laatsGezienOp?:   Date;
}

export interface LocatieData {
  externalId:  string;
  lat:         number;
  lng:         number;
  adres?:      string;
  snelheidKmh?: number;
  tijdstip:    Date;
}

export interface RitData {
  externalRitId:   string;
  externalVoertuigId: string;
  startDatum:      Date;
  eindDatum:       Date;
  kmStart?:        number;
  kmEind?:         number;
  afstandKm?:      number;
  vertrekAdres?:   string;
  bestemmingAdres?: string;
}

export interface SyncResultaat {
  provider:        string;
  aantalVerwerkt:  number;
  aantalFouten:    number;
  fouten:          string[];
}

/**
 * Provider-interface — alle fleet-providers moeten dit implementeren.
 * Methoden mogen null/undefined teruggeven bij onbeschikbare data.
 */
export interface FleetProvider {
  readonly naam: string;

  /** Haal actuele voertuigdata op voor één voertuig. */
  haalVoertuigDataOp(externalId: string): Promise<VoertuigData | null>;

  /** Haal de lijst van alle bij de provider bekende voertuig-IDs op. */
  lijstVoertuigIds(): Promise<string[]>;

  /** Haal actuele locatie op (alleen voor planners/beheerders). */
  haalLocatieOp(externalId: string): Promise<LocatieData | null>;

  /** Haal rithistorie op voor een voertuig in een periode. */
  haalRittenOp(externalId: string, van: Date, tot: Date): Promise<RitData[]>;

  /** Test of de provider bereikbaar is. */
  testVerbinding(): Promise<boolean>;
}
