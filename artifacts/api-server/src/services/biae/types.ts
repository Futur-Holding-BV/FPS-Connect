// Business Intelligence & Automation Engine (BIAE) — getypeerde event-contracten.
//
// Eén centrale, in-process event-verwerkingslaag voor heel Connect. Elk domein
// publiceert getypeerde events op de bus; capabilities (dunne adapters rond de
// bestaande engines) abonneren zich op de voor hen relevante event-types.
//
// De kern (index.ts) heeft GEEN database-afhankelijkheid: capabilities mogen wel
// naar de DB schrijven. Events zijn een discriminated union per domein-categorie
// zodat een abonnee compile-time zekerheid heeft over de payload-vorm.

// ── Event-categorieën ──────────────────────────────────────────────────────────

export type BiaeEventCategorie =
  | "spot"
  | "offerte"
  | "gebruiker"
  | "document"
  | "hrm"
  | "financieel"
  | "systeem"
  | "governance"
  | "workflow";

// Gemeenschappelijke velden op elk event. De kern vult deze automatisch aan
// (id, tijdstip) wanneer een event zonder die velden wordt gepubliceerd.
export interface BiaeEventBasis {
  categorie: BiaeEventCategorie;
  type: string;
  // Wie/vanuit welke context het event ontstond (optioneel — jobs hebben geen sessie).
  gebruikerId?: number | null;
  gebruikerNaam?: string | null;
  // Vrije payload per event-type; de discriminated union hieronder verfijnt dit.
  payload?: Record<string, unknown>;
}

// ── Discriminated union per categorie ──────────────────────────────────────────

export interface SpotEvent extends BiaeEventBasis {
  categorie: "spot";
  type: "spot_aangemaakt" | "spot_bijgewerkt" | "spot_gearchiveerd" | "spot_verwijderd";
  payload: {
    spotId: number;
    gebouwId?: number | null;
    gebouwNaam?: string | null;
    objectnummer?: string | null;
    objectType?: string | null;
    status?: string | null;
  };
}

export interface OfferteEvent extends BiaeEventBasis {
  categorie: "offerte";
  type: "offerte_ingediend" | "offerte_status_gewijzigd";
  payload: {
    offerteId: number;
    vanStatus?: string | null;
    naarStatus?: string | null;
    bedrag?: number | null;
  };
}

export interface GebruikerEvent extends BiaeEventBasis {
  categorie: "gebruiker";
  type: "gebruiker_aangemaakt" | "gebruiker_gearchiveerd" | "gebruiker_ingelogd";
  payload: {
    doelGebruikerId: number;
    doelGebruikerNaam?: string | null;
  };
}

export interface DocumentEvent extends BiaeEventBasis {
  categorie: "document";
  type: "document_aangemaakt" | "document_gearchiveerd" | "document_status_gewijzigd";
  payload: {
    documentId: number;
    documentType?: string | null;
    naarStatus?: string | null;
  };
}

export interface HrmEvent extends BiaeEventBasis {
  categorie: "hrm";
  type: "verlof_ingediend" | "verlof_status_gewijzigd" | "certificaat_bijgewerkt";
  payload: {
    entiteitId: number;
    subtype?: string | null;
    naarStatus?: string | null;
  };
}

export interface FinancieelEvent extends BiaeEventBasis {
  categorie: "financieel";
  type: "factuur_ontvangen" | "inkoopbon_status_gewijzigd" | "nacalculatie_afwijking";
  payload: {
    entiteitId: number;
    bedrag?: number | null;
    naarStatus?: string | null;
    afwijkingPct?: number | null;
  };
}

export interface GovernanceEvent extends BiaeEventBasis {
  categorie: "governance";
  type: "goedkeuring_ingediend" | "goedkeuring_afgehandeld" | "escalatie_verstuurd";
  payload: {
    aanvraagId?: number;
    objectType?: string | null;
    objectId?: number | null;
    escalatieType?: string | null;
    naarStatus?: string | null;
  };
}

export interface WorkflowEvent extends BiaeEventBasis {
  categorie: "workflow";
  type: "workflow_transitie";
  payload: {
    workflowId: string;
    entityType: string;
    entityId: number;
    vanStatus: string;
    naarStatus: string;
  };
}

export interface SysteemEvent extends BiaeEventBasis {
  categorie: "systeem";
  type:
    | "deadline_verstreken"
    | "compliance_signaal"
    | "kpi_bijgewerkt"
    | "job_uitgevoerd";
  payload: Record<string, unknown>;
}

// Alle events die op de bus kunnen verschijnen.
export type BiaeEvent =
  | SpotEvent
  | OfferteEvent
  | GebruikerEvent
  | DocumentEvent
  | HrmEvent
  | FinancieelEvent
  | GovernanceEvent
  | WorkflowEvent
  | SysteemEvent;

// Event zoals opgeslagen in de interne log (met kern-toegevoegde metadata).
export interface BiaeGelogdEvent {
  id: number;
  categorie: BiaeEventCategorie;
  type: string;
  gebruikerId: number | null;
  gebruikerNaam: string | null;
  payload: Record<string, unknown>;
  tijdstip: string; // ISO 8601
}

// ── Capabilities ───────────────────────────────────────────────────────────────

// Een capability is een dunne adapter rond een bestaande engine. Ze abonneert
// zich op categorieën/types en verwerkt matchende events. `verwerk` mag async
// zijn; fouten worden door de kern opgevangen en gelogd (nooit propageren naar
// de publicerende route).
export interface BiaeCapability {
  naam: string;
  omschrijving: string;
  // Categorieën waarop deze capability reageert. Leeg = geen event-abonnement
  // (bijv. een capability die alleen synchrone helpers aanbiedt zoals impact).
  categorieen: BiaeEventCategorie[];
  // Optioneel: alleen deze specifieke event-types binnen de categorieën.
  types?: string[];
  verwerk?: (event: BiaeGelogdEvent) => void | Promise<void>;
}

export interface BiaeCapabilityStatus {
  naam: string;
  omschrijving: string;
  categorieen: BiaeEventCategorie[];
  types: string[];
  verwerkteEvents: number;
  laatsteFout: string | null;
  laatstActiefOp: string | null;
}
