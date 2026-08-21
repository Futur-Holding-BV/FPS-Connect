/**
 * gebouwProcessStatus — server-side bouwprocesvoortgang voor één gebouw.
 *
 * Architectuur:
 *   1. Laad alle benodigde data via loadGebouwProcessData() (DB-laag).
 *   2. Leid de fasen af via berekenProcessStatus() (pure functie, testbaar).
 *   3. Publicatiegereedheid via berekenPublicatieReadiness() (eveneens puur).
 *   4. Preview-samenstelling via stelPublicatiePreviewSamen() (puur + geëxporteerd).
 *
 * Geordende fasen:
 *   concept → intern_akkoord → offerte → opdracht → uitvoering → oplevering
 */

import { eq, and, ne, inArray } from "drizzle-orm";
import {
  db,
  modCalcHeadersTable,
  offertesTable,
  offerteHandtekeningenTable,
  opdrachtenTable,
  opleverrapportenTable,
  gebouwPartijenTable,
} from "@workspace/db";

// ── Types ─────────────────────────────────────────────────────────────────────

export type Toestand = "afgerond" | "actief" | "toekomstig";

export interface ProcessFase {
  sleutel: string;
  label: string;
  toestand: Toestand;
  blocker_code: string | null;
  blocker_message: string | null;
  action_path: string | null;
  action_label: string | null;
}

export interface ProcessStatus {
  /** Gesorteerde fasen. */
  fasen: ProcessFase[];
  /**
   * Sleutel van de actieve fase (de vroegste niet-afgeronde stap).
   * null als alle fasen zijn afgerond.
   */
  huidige_stap: string | null;
  /** true als alle 6 fasen zijn afgerond. */
  all_afgerond: boolean;
}

export type PublicatieBlocker = {
  code: string;
  message: string;
  action_path: string | null;
  action_label: string | null;
};

export interface PublicatieReadiness {
  mag_publiceren: boolean;
  blocker: PublicatieBlocker | null;
}

export interface PublicatieContentItem {
  type: string;
  label: string;
  /** Interne bron-ID (rapport-id, document-id, …). Null voor generieke rijen. */
  bron_id: number | null;
}

export interface PublicatiePreview {
  mag_publiceren: boolean;
  blocker: PublicatieBlocker | null;
  bestemming: string;
  opdrachtgever: string | null;
  ontvangers: Array<{ naam: string; email: string | null; organisatie: string | null }>;
  content_items: PublicatieContentItem[];
  gevolg_tekst: string;
  intrekking_gevolg_tekst: string;
  process_status: ProcessStatus;
}

// ── Data-shape die vanuit de DB wordt geladen ─────────────────────────────────

export interface GebouwRapportData {
  id: number;
  status: string;        // concept | definitief | vervangen | gearchiveerd
  rapportType: string;
  titel: string | null;
  bevrorenOp: Date | null;
  bevrorenDocumentRevisies: unknown | null; // Record<string, {revisie_nummer: number|null; naam: string}>
  bijlagenIds: unknown;  // number[] stored as jsonb
  tekeningIds: unknown;  // number[] stored as jsonb
  vervangenDoorId: number | null;
  vervangenDoorRapportId: number | null;
}

export interface GebouwProcessData {
  gebouwId: number;
  // Calculaties gekoppeld aan het gebouw (niet verloren)
  calculaties: Array<{
    id: number;
    status: string; // concept | intern_akkoord | aangeboden | gewonnen | verloren | …
  }>;
  // Offertes gekoppeld aan het gebouw, met handtekening-aanwezigheid
  offertes: Array<{
    id: number;
    status: string;        // concept | verzonden | geaccepteerd | ondertekend | …
    portaalStatus: string; // concept | verzonden | geaccepteerd | ondertekend | …
    heeftHandtekening: boolean; // aantoonbaar via offerte_handtekeningen
  }>;
  // Opdrachten gekoppeld aan het gebouw
  opdrachten: Array<{
    id: number;
    offerteId: number | null;
    status: string; // actief | afgerond | gepauzeerd | geannuleerd
  }>;
  // Opleverrapporten voor het gebouw (alle statussen, filtering is puur)
  rapporten: GebouwRapportData[];
  // Partijen voor preview (opdrachtgever-info en ontvangers)
  partijen: Array<{
    type: string;
    naam: string;
    organisatie: string | null;
    email: string | null;
  }>;
}

// ── DB-laag ───────────────────────────────────────────────────────────────────

export async function loadGebouwProcessData(
  gebouwId: number,
  database: Pick<typeof db, "select"> = db,
): Promise<GebouwProcessData> {
  // 1. Calculaties: gebouwgekoppeld, niet verloren
  const calculaties = await database
    .select({ id: modCalcHeadersTable.id, status: modCalcHeadersTable.status })
    .from(modCalcHeadersTable)
    .where(
      and(
        eq(modCalcHeadersTable.gebouwId, gebouwId),
        ne(modCalcHeadersTable.status, "verloren"),
      ),
    );

  // 2. Offertes gekoppeld aan dit gebouw (alle statussen)
  const offertesRij = await database
    .select({
      id: offertesTable.id,
      status: offertesTable.status,
      portaalStatus: offertesTable.portaalStatus,
    })
    .from(offertesTable)
    .where(eq(offertesTable.gebouwId, gebouwId));

  // 3. Handtekeningen voor die offertes (bewijs-set)
  let handtekeningOfferteIds = new Set<number>();
  if (offertesRij.length > 0) {
    const ids = offertesRij.map((o) => o.id);
    const hk = await database
      .select({ offerteId: offerteHandtekeningenTable.offerteId })
      .from(offerteHandtekeningenTable)
      .where(inArray(offerteHandtekeningenTable.offerteId, ids));
    handtekeningOfferteIds = new Set(hk.map((h) => h.offerteId));
  }

  const offertes = offertesRij.map((o) => ({
    id: o.id,
    status: o.status,
    portaalStatus: o.portaalStatus,
    heeftHandtekening: handtekeningOfferteIds.has(o.id),
  }));

  // 4. Opdrachten gekoppeld aan dit gebouw (alle statussen, filtering is puur)
  const opdrachtenRij = await database
    .select({
      id: opdrachtenTable.id,
      offerteId: opdrachtenTable.offerteId,
      status: opdrachtenTable.status,
    })
    .from(opdrachtenTable)
    .where(eq(opdrachtenTable.gebouwId, gebouwId));

  // 5. Opleverrapporten — alle, filtering is puur
  const rapportenRij = await database
    .select({
      id: opleverrapportenTable.id,
      status: opleverrapportenTable.status,
      rapportType: opleverrapportenTable.rapportType,
      titel: opleverrapportenTable.titel,
      bevrorenOp: opleverrapportenTable.bevrorenOp,
      bevrorenDocumentRevisies: opleverrapportenTable.bevrorenDocumentRevisies,
      bijlagenIds: opleverrapportenTable.bijlagenIds,
      tekeningIds: opleverrapportenTable.tekeningIds,
      vervangenDoorId: opleverrapportenTable.vervangenDoorId,
      vervangenDoorRapportId: opleverrapportenTable.vervangenDoorRapportId,
    })
    .from(opleverrapportenTable)
    .where(eq(opleverrapportenTable.gebouwId, gebouwId));

  // 6. Partijen (voor preview)
  const partijen = await database
    .select({
      type: gebouwPartijenTable.type,
      naam: gebouwPartijenTable.naam,
      organisatie: gebouwPartijenTable.organisatie,
      email: gebouwPartijenTable.email,
    })
    .from(gebouwPartijenTable)
    .where(eq(gebouwPartijenTable.gebouwId, gebouwId));

  return {
    gebouwId,
    calculaties,
    offertes,
    opdrachten: opdrachtenRij,
    rapporten: rapportenRij,
    partijen,
  };
}

// ── Predicaten (pure) ─────────────────────────────────────────────────────────

/**
 * Concept: compleet als er een niet-verloren gebouw-gekoppelde calculatie bestaat.
 * (Verloren zijn al gefilterd bij het laden.)
 */
export function conceptAfgerond(data: Pick<GebouwProcessData, "calculaties">): boolean {
  return data.calculaties.length > 0;
}

/**
 * Intern akkoord: calculatie-status is intern_akkoord, aangeboden of gewonnen.
 */
export function internAkkoordAfgerond(data: Pick<GebouwProcessData, "calculaties">): boolean {
  return data.calculaties.some((c) =>
    ["intern_akkoord", "aangeboden", "gewonnen"].includes(c.status),
  );
}

/**
 * Offerte: gebouw-gekoppelde offerte met onweerlegbaar handtekening-bewijs EN
 * ondertekende status (status === "ondertekend" of portaalStatus === "ondertekend").
 * Louter geaccepteerd is onvoldoende.
 */
export function offerteAfgerond(data: Pick<GebouwProcessData, "offertes">): boolean {
  return data.offertes.some(isOndertekendeOfferte);
}

/**
 * Predikaat: is deze offerte een bewezen ondertekende offerte?
 * Bewijs = handtekening-rij aanwezig (heeftHandtekening) EN status-signaal.
 */
function isOndertekendeOfferte(o: GebouwProcessData["offertes"][number]): boolean {
  return (
    o.heeftHandtekening &&
    (o.status === "ondertekend" || o.portaalStatus === "ondertekend")
  );
}

/**
 * Set van ID's van alle bewezen ondertekende offertes voor dit gebouw.
 * Set-semantiek: opdrachtAfgerond/actueleOpdracht accepteert ELKE opdracht
 * die gekoppeld is aan ENIGE ondertekende offerte — niet slechts de eerste.
 */
export function ondertekendeOfferteIds(
  data: Pick<GebouwProcessData, "offertes">,
): Set<number> {
  return new Set(
    data.offertes.filter(isOndertekendeOfferte).map((o) => o.id),
  );
}

/**
 * Opdracht: niet-geannuleerde opdracht voor ENIGE bewezen ondertekende offerte.
 */
export function opdrachtAfgerond(
  data: Pick<GebouwProcessData, "offertes" | "opdrachten">,
): boolean {
  const sigIds = ondertekendeOfferteIds(data);
  if (sigIds.size === 0) return false;
  return data.opdrachten.some(
    (o) => o.offerteId !== null && sigIds.has(o.offerteId) && o.status !== "geannuleerd",
  );
}

/**
 * Geeft de meest-gevorderde niet-geannuleerde opdracht voor ENIGE ondertekende
 * offerte. Prioriteit: afgerond > actief > gepauzeerd (overige).
 * Deterministische keuze: laagste id bij gelijke status.
 */
export function actueleOpdracht(
  data: Pick<GebouwProcessData, "offertes" | "opdrachten">,
): { id: number; status: string; offerteId: number | null } | null {
  const sigIds = ondertekendeOfferteIds(data);
  if (sigIds.size === 0) return null;

  const kandidaten = data.opdrachten.filter(
    (o) => o.offerteId !== null && sigIds.has(o.offerteId) && o.status !== "geannuleerd",
  );
  if (kandidaten.length === 0) return null;

  // Meest-gevorderde status: afgerond > actief > rest
  const prioriteit = (s: string): number => {
    if (s === "afgerond") return 0;
    if (s === "actief") return 1;
    return 2;
  };

  kandidaten.sort((a, b) => {
    const p = prioriteit(a.status) - prioriteit(b.status);
    if (p !== 0) return p;
    return a.id - b.id; // deterministisch: laagste id wint
  });

  return kandidaten[0] ?? null;
}

/**
 * Uitvoering: de meest-gevorderde actuele opdracht heeft status "afgerond".
 */
export function uitvoeringAfgerond(
  data: Pick<GebouwProcessData, "offertes" | "opdrachten">,
): boolean {
  const opdracht = actueleOpdracht(data);
  return opdracht?.status === "afgerond";
}

/**
 * Stel vast welke rapporten voldoen aan de huidig-definitief-bevroren-criteria:
 *   status === "definitief", bevrorenOp !== null, niet vervangen.
 *
 * Geëxporteerd zodat tests en berekenProcessStatus de telsemaniek kunnen inspecteren.
 */
export function huidigeDefinitiefBevrorenRapporten(
  data: Pick<GebouwProcessData, "rapporten">,
): GebouwRapportData[] {
  return data.rapporten.filter(isHuidigeDefinitiefBevrorenRapport);
}

function isHuidigeDefinitiefBevrorenRapport(r: GebouwRapportData): boolean {
  return (
    r.status === "definitief" &&
    r.bevrorenOp !== null &&
    r.vervangenDoorId === null &&
    r.vervangenDoorRapportId === null
  );
}

/**
 * Oplevering: PRECIES ÉÉN huidig definitief bevroren rapport.
 *
 * - 0 matches → niet afgerond (generieke ontbrekend-rapport-blocker).
 * - 1 match   → afgerond.
 * - >1 matches → NIET afgerond (tegenstrijdige data, speciale blocker in
 *                berekenProcessStatus / berekenPublicatieReadiness).
 */
export function opleveringAfgerond(data: Pick<GebouwProcessData, "rapporten">): boolean {
  return huidigeDefinitiefBevrorenRapporten(data).length === 1;
}

/**
 * Geeft het ENIGE huidig definitief bevroren rapport terug.
 * Geeft null als er 0 of >1 matches zijn — fail closed bij ambiguïteit.
 */
export function huidigeDefinitiefBevrorenRapport(
  data: Pick<GebouwProcessData, "rapporten">,
): GebouwRapportData | null {
  const matches = huidigeDefinitiefBevrorenRapporten(data);
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

// ── Fase-derivatie (puur) ─────────────────────────────────────────────────────

const ALLE_FASEN = ["concept", "intern_akkoord", "offerte", "opdracht", "uitvoering", "oplevering"] as const;
type FaseSleutel = (typeof ALLE_FASEN)[number];
// Mutable kopie voor iteratie zodat TS de tuple-indexering niet blokkeert
const FASE_SLEUTELS: FaseSleutel[] = [...ALLE_FASEN];

const FASE_LABELS: Record<FaseSleutel, string> = {
  concept: "Concept",
  intern_akkoord: "Intern akkoord",
  offerte: "Offerte",
  opdracht: "Opdracht",
  uitvoering: "Uitvoering",
  oplevering: "Oplevering",
};

// Blocker-codes voor elke fase (wat ontbreekt — de reden dat de fase niet bereikt kan worden)
const BLOCKER_CODES: Record<FaseSleutel, string> = {
  concept: "geen_calculatie",
  intern_akkoord: "calculatie_niet_akkoord",
  offerte: "geen_ondertekende_offerte",
  opdracht: "geen_opdracht",
  uitvoering: "opdracht_niet_afgerond",
  oplevering: "geen_definitief_rapport",
};

const BLOCKER_MESSAGES: Record<FaseSleutel, string> = {
  concept: "Er is nog geen calculatie aangemaakt voor dit gebouw.",
  intern_akkoord: "De calculatie heeft nog geen intern akkoord (status intern_akkoord, aangeboden of gewonnen).",
  offerte: "Er is nog geen ondertekende offerte met handtekening-bewijs voor dit gebouw.",
  opdracht: "Er is nog geen opdracht aangemaakt voor de ondertekende offerte.",
  uitvoering: "De opdracht is nog niet afgerond.",
  oplevering: "Er is nog geen definitief, bevroren opleverrapport voor dit gebouw.",
};

const ACTION_LABELS: Record<FaseSleutel, string> = {
  concept: "Calculatie aanmaken",
  intern_akkoord: "Calculatie naar intern akkoord",
  offerte: "Offerte ondertekenen",
  opdracht: "Opdracht aanmaken",
  uitvoering: "Opdracht afronden",
  oplevering: "Opleverrapport definitief maken",
};

/**
 * Stabiele blocker voor de tegenstrijdige situatie waarbij >1 rapport tegelijk
 * voldoet aan huidig-definitief-bevroren. Geëxporteerd zodat tests en route-code
 * exact dezelfde constanten gebruiken.
 */
export const MEERDERE_RAPPORTEN_BLOCKER = {
  code: "meerdere_definitieve_rapporten",
  message:
    "Er zijn meerdere huidige definitieve bevroren opleverrapporten. " +
    "Stel één rapport in als het gezaghebbende/actuele rapport voordat u kunt publiceren.",
  action_path_suffix: "?tab=rapporten",
  action_label: "Opleverrapporten controleren",
} as const;

/**
 * Bouw gebouw-specifieke deeplink op basis van de fase en het gebouw-id.
 * Alle links resolven naar bestaande tabs op de gebouwpagina.
 */
export function actionPathVoorFase(sleutel: FaseSleutel, gebouwId: number): string {
  switch (sleutel) {
    case "concept":
    case "intern_akkoord":
      return `/gebouwen/${gebouwId}?tab=calculaties`;
    case "offerte":
      return `/gebouwen/${gebouwId}?tab=offertes`;
    case "opdracht":
      return `/gebouwen/${gebouwId}?tab=offertes`;
    case "uitvoering":
      return `/gebouwen/${gebouwId}?tab=opdrachten`;
    case "oplevering":
      return `/gebouwen/${gebouwId}?tab=rapporten`;
  }
}

/**
 * Berekenprocesstatus — puur, geen DB-calls.
 *
 * Algoritme:
 *  - Evalueer elke fase in volgorde.
 *  - De eerste niet-afgeronde fase is "actief".
 *  - Daarna zijn alle fasen "toekomstig".
 *  - Actieve en toekomstige fasen krijgen de blocker van de onmiddellijk
 *    ontbrekende voorwaarde (= de huidige actieve fase).
 */
export function berekenProcessStatus(data: GebouwProcessData): ProcessStatus {
  // Tel huidig-definitief-bevroren rapporten vóór de fase-evaluatie zodat we de
  // tegenstrijdige ">1 rapporten"-situatie kunnen onderscheiden van "0 rapporten".
  const aantalHuidigeRapporten = huidigeDefinitiefBevrorenRapporten(data).length;
  const heeftMeerdereRapporten = aantalHuidigeRapporten > 1;

  const afgerond: Record<FaseSleutel, boolean> = {
    concept: conceptAfgerond(data),
    intern_akkoord: internAkkoordAfgerond(data),
    offerte: offerteAfgerond(data),
    opdracht: opdrachtAfgerond(data),
    uitvoering: uitvoeringAfgerond(data),
    // opleveringAfgerond eist precies 1 match; bij >1 is dit ook false.
    oplevering: opleveringAfgerond(data),
  };

  // Vind de eerste niet-afgeronde fase — dat is de "actief"-fase
  let actieveIndex = FASE_SLEUTELS.length; // standaard: alles afgerond
  for (let i = 0; i < FASE_SLEUTELS.length; i++) {
    if (!afgerond[FASE_SLEUTELS[i]]) {
      actieveIndex = i;
      break;
    }
  }

  const allAfgerond = actieveIndex === FASE_SLEUTELS.length;
  // De blocker die toekomstige fasen krijgen = de actieve fase (ontbrekende stap)
  const actieveFase: FaseSleutel | null =
    actieveIndex < FASE_SLEUTELS.length ? FASE_SLEUTELS[actieveIndex] : null;

  // Bepaal de blocker-velden voor de actieve fase.
  // Speciaal geval: als oplevering actief is EN er >1 rapporten zijn, gebruik dan
  // de meerdere_definitieve_rapporten-blocker i.p.v. de generieke missende-rapport-blocker.
  const actieveFaseIsOplevering = actieveFase === "oplevering";
  const gebruikMeerdereRapportenBlocker = actieveFaseIsOplevering && heeftMeerdereRapporten;

  function actiefActionPath(): string {
    if (gebruikMeerdereRapportenBlocker) {
      return `/gebouwen/${data.gebouwId}${MEERDERE_RAPPORTEN_BLOCKER.action_path_suffix}`;
    }
    return actieveFase ? actionPathVoorFase(actieveFase, data.gebouwId) : `/gebouwen/${data.gebouwId}`;
  }

  function actiefActionLabel(): string {
    if (gebruikMeerdereRapportenBlocker) {
      return MEERDERE_RAPPORTEN_BLOCKER.action_label;
    }
    return actieveFase ? ACTION_LABELS[actieveFase] : "";
  }

  // De toekomstige fasen lenen dezelfde blocker-velden als de actieve fase.
  const toekomstigBlockerCode = gebruikMeerdereRapportenBlocker
    ? MEERDERE_RAPPORTEN_BLOCKER.code
    : actieveFase
      ? BLOCKER_CODES[actieveFase]
      : null;

  const toekomstigBlockerMessage = gebruikMeerdereRapportenBlocker
    ? MEERDERE_RAPPORTEN_BLOCKER.message
    : actieveFase
      ? BLOCKER_MESSAGES[actieveFase]
      : null;

  const toekomstigActionPath = actieveFase ? actiefActionPath() : null;
  const toekomstigActionLabel = actieveFase ? actiefActionLabel() : null;

  const fasen: ProcessFase[] = FASE_SLEUTELS.map((sleutel, i) => {
    if (i < actieveIndex) {
      // Afgerond
      return {
        sleutel,
        label: FASE_LABELS[sleutel],
        toestand: "afgerond",
        blocker_code: null,
        blocker_message: null,
        action_path: null,
        action_label: null,
      };
    }
    if (i === actieveIndex) {
      // Actief — geen blocker_code (zelf de stap om te doen), wél action
      return {
        sleutel,
        label: FASE_LABELS[sleutel],
        toestand: "actief",
        blocker_code: null,
        blocker_message: null,
        action_path: actiefActionPath(),
        action_label: actiefActionLabel(),
      };
    }
    // Toekomstig — geblokkeerd door de actieve fase
    return {
      sleutel,
      label: FASE_LABELS[sleutel],
      toestand: "toekomstig",
      blocker_code: toekomstigBlockerCode,
      blocker_message: toekomstigBlockerMessage,
      action_path: toekomstigActionPath,
      action_label: toekomstigActionLabel,
    };
  });

  return {
    fasen,
    huidige_stap: actieveFase,
    all_afgerond: allAfgerond,
  };
}

/**
 * Publicatiegereedheid — STRIKT FAIL-CLOSED over de volledige geordende keten.
 *
 * In plaats van alleen opdracht + rapport te controleren, leiden we de volledige
 * processtatus af en staan we publicatie UITSLUITEND toe wanneer alle 6 fasen
 * zijn afgerond (all_afgerond === true). De blocker is de VROEGSTE ontbrekende
 * fase — teruggegeven met exact dezelfde code/message/action_path als die fase
 * in de processtatus gebruikt. Zo blokkeert tegenstrijdige data (bv. ondertekende
 * offerte + afgeronde opdracht + definitief rapport, maar geen niet-verloren
 * calculatie) correct op de vroegste ontbrekende voorwaarde (geen_calculatie),
 * en niet pas op opdracht/rapport.
 *
 * Dit garandeert UI/server-pariteit: de publicatieknop en de server hanteren
 * exact dezelfde fase-condities, codes en deeplinks.
 */
export function berekenPublicatieReadiness(data: GebouwProcessData): PublicatieReadiness {
  const status = berekenProcessStatus(data);

  if (status.all_afgerond) {
    return { mag_publiceren: true, blocker: null };
  }

  // De vroegste niet-afgeronde fase is de actieve fase (huidige_stap).
  const actieveFase = status.huidige_stap as FaseSleutel | null;
  if (actieveFase === null) {
    // Defensief: zou niet moeten voorkomen (all_afgerond dekt dit), fail closed.
    return {
      mag_publiceren: false,
      blocker: {
        code: "onbekend",
        message: "Publicatie is niet toegestaan; de processtatus kon niet worden bepaald.",
        action_path: `/gebouwen/${data.gebouwId}`,
        action_label: null,
      },
    };
  }

  // Speciaal geval: oplevering actief én >1 huidige rapporten → tegenstrijdigheids-blocker.
  // Dit moet EXACT dezelfde code/message/action produceren als berekenProcessStatus.
  if (
    actieveFase === "oplevering" &&
    huidigeDefinitiefBevrorenRapporten(data).length > 1
  ) {
    return {
      mag_publiceren: false,
      blocker: {
        code: MEERDERE_RAPPORTEN_BLOCKER.code,
        message: MEERDERE_RAPPORTEN_BLOCKER.message,
        action_path: `/gebouwen/${data.gebouwId}${MEERDERE_RAPPORTEN_BLOCKER.action_path_suffix}`,
        action_label: MEERDERE_RAPPORTEN_BLOCKER.action_label,
      },
    };
  }

  // Gebruik EXACT dezelfde fase-conditie/code/message/action als de processtatus.
  return {
    mag_publiceren: false,
    blocker: {
      code: BLOCKER_CODES[actieveFase],
      message: BLOCKER_MESSAGES[actieveFase],
      action_path: actionPathVoorFase(actieveFase, data.gebouwId),
      action_label: ACTION_LABELS[actieveFase],
    },
  };
}

// ── Preview-samenstelling (puur, geëxporteerd) ────────────────────────────────

/**
 * Stel de publicatiepreview samen op basis van geladen procesdata.
 * Puur: geen DB-calls, gedeeld door route en tests.
 *
 * Content items:
 *   - altijd: gebouw_data
 *   - als er een geldig rapport is: het rapport zelf
 *   - per bevroren bijlage-id: één item (label uit bevrorenDocumentRevisies als beschikbaar)
 *   - per bevroren tekening-id: één item
 *   - GEEN lege placeholder-rijen als bijlagenIds/tekeningIds leeg zijn
 */
export function stelPublicatiePreviewSamen(data: GebouwProcessData): PublicatiePreview {
  const processStatus = berekenProcessStatus(data);
  const readiness = berekenPublicatieReadiness(data);

  // Opdrachtgever uit partijen
  const opdrachtgeverPartij = data.partijen.find((p) => p.type === "opdrachtgever");
  const opdrachtgever = opdrachtgeverPartij
    ? (opdrachtgeverPartij.organisatie ?? opdrachtgeverPartij.naam)
    : null;

  // Ontvangers: partijen met e-mailadres (bewijs aanwezig in DB)
  const ontvangers = data.partijen
    .filter((p) => p.email != null)
    .map((p) => ({
      naam: p.naam,
      email: p.email ?? null,
      organisatie: p.organisatie ?? null,
    }));

  // Content items
  const contentItems: PublicatieContentItem[] = [
    { type: "gebouw_data", label: "Gebouwgegevens", bron_id: null },
  ];

  const rapport = huidigeDefinitiefBevrorenRapport(data);
  if (rapport) {
    // Rapport zelf
    const rapportLabel = rapport.titel
      ? `${rapport.titel} (definitief)`
      : "Definitief opleverrapport";
    contentItems.push({
      type: "opleverrapport",
      label: rapportLabel,
      bron_id: rapport.id,
    });

    // Bevroren bijlagen: één item per werkelijk bijlage-id
    const bevrorenRevisies = rapport.bevrorenDocumentRevisies as
      | Record<string, { revisie_nummer: number | null; naam: string }>
      | null
      | undefined;

    const bijlagenIds = Array.isArray(rapport.bijlagenIds)
      ? (rapport.bijlagenIds as number[])
      : [];

    for (const docId of bijlagenIds) {
      const revisie = bevrorenRevisies?.[String(docId)];
      const label = revisie?.naam
        ? `Bijlage: ${revisie.naam}`
        : `Bijlage (document ${docId})`;
      contentItems.push({ type: "bijlage", label, bron_id: docId });
    }

    // Bevroren tekeningen: één item per werkelijk tekening-id
    const tekeningIds = Array.isArray(rapport.tekeningIds)
      ? (rapport.tekeningIds as number[])
      : [];

    for (const tekId of tekeningIds) {
      const revisie = bevrorenRevisies?.[String(tekId)];
      const label = revisie?.naam
        ? `Tekening: ${revisie.naam}`
        : `Tekening (document ${tekId})`;
      contentItems.push({ type: "tekening", label, bron_id: tekId });
    }
  }

  const gevolg_tekst =
    "Na publicatie is het gebouwdossier zichtbaar voor FPS One-gebruikers met toegang tot dit gebouw. " +
    "De gepubliceerde informatie wordt gedeeld conform het geldende autorisatiemodel.";
  const intrekking_gevolg_tekst =
    "Na intrekking is het gebouwdossier niet meer zichtbaar in FPS One. " +
    "Bestaande documenten worden niet verwijderd; de publicatie-intentie vervalt.";

  return {
    mag_publiceren: readiness.mag_publiceren,
    blocker: readiness.blocker ?? null,
    bestemming: "FPS One",
    opdrachtgever,
    ontvangers,
    content_items: contentItems,
    gevolg_tekst,
    intrekking_gevolg_tekst,
    process_status: processStatus,
  };
}
