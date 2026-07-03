/**
 * AI Process Orchestrator — TypeScript-interfaces en contractdefinities.
 *
 * Dit bestand bevat uitsluitend interfaces, types en documentatie.
 * Er is geen implementatie; de daadwerkelijke Orchestrator wordt in een
 * latere fase gebouwd. De interfaces zijn bedoeld als stabiele fundering
 * zodat toekomstige implementatie geen breaking changes in de gateway of
 * bestaande modules vereist.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VERANTWOORDELIJKHEIDSGRENS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * GATEWAY (aiGateway.ts) — stateless uitvoerder:
 *   1. Provider-aanroep (via OpenAI-client)
 *   2. Timeout/retry/foutafhandeling
 *   3. Logging naar ai_aanroepen (inclusief context_json)
 *   4. Kostenberekening
 *
 *   De gateway neemt nooit beslissingen over wánneer AI mag worden ingezet,
 *   wie akkoord moet geven, of wat er met het resultaat gebeurt. Dit garandeert
 *   dat de Orchestrator transparant vóór de gateway kan worden geplaatst
 *   zonder de gateway te hoeven aanpassen.
 *
 * ORCHESTRATOR (dit bestand / toekomstige implementatie) — beslisser:
 *   1. Wanneer mag een AI-aanroep worden gestart (bevoegdheid, workflowstatus)
 *   2. Wie moet akkoord geven (requiresHumanApproval, RBAC)
 *   3. Welke volgorde in meerstaps-flows
 *   4. Wat er met het resultaat gebeurt (opslaan, notificeren, audit)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PASSTHROUGH-CONTRACT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * De Orchestrator kan op twee manieren worden ingezet:
 *
 * 1. PASSTHROUGH — wanneer `requiresHumanApproval === false` en er geen
 *    actieve orchestratie-logica voor de betreffende module is:
 *    → De Orchestrator roept `aiGateway.chat()` direct aan.
 *    → Bestaande modules blijven ongewijzigd; zij merken geen verschil.
 *
 * 2. ACTIEVE ORCHESTRATIE — wanneer `requiresHumanApproval === true` of
 *    een meerstaps-flow actief is:
 *    → De Orchestrator coördineert, onderbreekt, vraagt akkoord, en roept
 *      de gateway aan als onderdeel van het gecoördineerde proces.
 *    → Modules roepen de Orchestrator aan alsof het de gateway is — zij
 *      hoeven de orchestratie-logica niet te kennen of te beheren.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * KOPPELING AAN BESTAANDE SYSTEMEN (toekomstige implementatie)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WORKFLOW ENGINE (services/workflow-engine.ts):
 *   De Orchestrator leest de workflowstatus van een entiteit via
 *   `workflowService.toegestaneTransities()` om te bepalen of een AI-aanroep
 *   toegestaan is in de huidige workflowfase. Bij AI-aanroepen met
 *   `requiresHumanApproval === true` wordt na goedkeuring een transitie
 *   gestart via `workflowService.transiteer()`.
 *
 * RBAC / BEVOEGDHEDEN (middlewares/auth.ts `requireBevoegdheid`):
 *   De Orchestrator verifieert vóór iedere aanroep of de aanvragende gebruiker
 *   de vereiste bevoegdheid heeft voor de betreffende module. Dit is een
 *   aanvullende laag bovenop de HTTP-middleware — de Orchestrator kan
 *   module-specifieke bevoegdheidsniveaus afdwingen (bijv. "alleen schrijven
 *   mag AI starten") zonder de gateway of de route-handler te wijzigen.
 *
 * AUDIT TRAIL (routes/audit.ts, lib/audit.ts `logAudit`):
 *   Iedere Orchestrator-beslissing (start, wacht_op_gebruiker, akkoord,
 *   afgewezen, uitgevoerd, fout) wordt gelogd via `logAudit()`. Hiermee
 *   is de volledige levenscyclus van een AI-proces aantoonbaar en juridisch
 *   controleerbaar. De gateway logt de ruwe aanroep in ai_aanroepen; de
 *   Orchestrator logt de beslissing in de audit trail.
 *
 * DOCUMENTEN-INBOX / DMS:
 *   Bij AI-processen die documenten genereren (bijv. opleverrapport, offerte-
 *   sectie) kan de Orchestrator het gegenereerde document direct in de
 *   DMS-inbox plaatsen en een goedkeuringsflow starten. De bestaande
 *   document-goedkeuringsflow (POST /documenten/:id/goedkeuring) kan als
 *   akkoord-mechanisme worden hergebruikt.
 *
 * AI-AANROEPEN LOGBOEK (ai_aanroepen, context_json):
 *   De `context_json`-kolom op ai_aanroepen bevat de flat businesscontext-
 *   velden (gebouw_id, offerte_id, etc.) en de `contextBronnen`-lijst.
 *   De Orchestrator kan hiermee AI-aanroepen filteren per entiteit, module
 *   of workflowfase voor rapportage en kostentoewijzing.
 *
 * CONTEXTBRONNEN SAMENSTELLEN (contextBronnen in LogContext):
 *   Vóór een gateway-aanroep stelt de Orchestrator een `contextBronnen`-lijst
 *   samen door meerdere onafhankelijke bronnen op te halen en te bundelen:
 *   - "document": relevante PDF-tekst uit de bibliotheek
 *   - "rag": opgehaalde fragmenten uit een kennisbase
 *   - "auditlog": recente audittrailregels voor de entiteit
 *   - "workflow": huidige workflowstatus en transitieparameters
 *   - "gebruikersinput": aanvullende input die de gebruiker heeft bevestigd
 *   De bundel wordt als `contextBronnen` op de LogContext meegegeven en
 *   opgeslagen in context_json — modules hoeven dit niet te beheren.
 */

import type { AiContextBron } from "./aiGateway";

// ── Processtatussen ───────────────────────────────────────────────────────────

/**
 * Levenscyclusstatus van een AI-proces dat via de Orchestrator loopt.
 *
 * - voorstel:           AI heeft een voorstel gegenereerd; wacht op beoordeling.
 * - wacht_op_gebruiker: Goedkeuring vereist; een mens moet expliciet akkoord geven.
 * - akkoord:            Goedkeuring ontvangen; het resultaat mag worden verwerkt.
 * - afgewezen:          Goedkeuring geweigerd; het resultaat wordt niet verwerkt.
 * - uitgevoerd:         Het AI-resultaat is verwerkt en opgeslagen.
 * - fout:               Technische fout tijdens de aanroep of verwerking.
 */
export enum AiProcessStatus {
  voorstel           = "voorstel",
  wacht_op_gebruiker = "wacht_op_gebruiker",
  akkoord            = "akkoord",
  afgewezen          = "afgewezen",
  uitgevoerd         = "uitgevoerd",
  fout               = "fout",
}

// ── AiProcessRequest ──────────────────────────────────────────────────────────

/**
 * Verzoek aan de Orchestrator om een AI-proces te starten.
 *
 * PASSTHROUGH-CONTRACT:
 *   Wanneer `requiresHumanApproval === false` en er geen actieve orchestratie-
 *   logica voor de betreffende module is, roept de Orchestrator
 *   `aiGateway.chat()` direct aan (passthrough). Modules blijven ongewijzigd;
 *   zij merken geen verschil tussen Orchestrator en directe gateway-aanroep.
 *   De gateway is en blijft stateless: zij neemt geen procesbeslissingen.
 *
 * MENSELIJKE GOEDKEURING:
 *   Wanneer `requiresHumanApproval === true`, pauzeert de Orchestrator het
 *   proces na het genereren van het voorstel. De status wordt
 *   `wacht_op_gebruiker` en een `humanApprovalToken` wordt teruggegeven.
 *   De Orchestrator hervat het proces pas nadat de mens akkoord heeft gegeven
 *   via het goedkeuringsmechanisme (bijv. DMS-goedkeuringsflow of een
 *   dedicated endpoint).
 *
 * PRINCIPE (hard):
 *   AI neemt NOOIT zelfstandig definitieve besluiten. `requiresHumanApproval`
 *   is verplicht en mag alleen `false` zijn bij processen waarvan de output
 *   uitsluitend een voorstel is dat een mens later beoordeelt (bijv.
 *   tekstgeneratie als concept, suggesties die de gebruiker nog bevestigt).
 */
export interface AiProcessRequest {
  /**
   * Verplicht: geeft aan of een mens expliciet akkoord moet geven vóór het
   * resultaat wordt verwerkt. Mag alleen `false` zijn als de output een
   * voorstel is dat de gebruiker zelf nog beoordeelt en bevestigt.
   * AI neemt nooit zelfstandig definitieve besluiten.
   */
  requiresHumanApproval: boolean;

  /** Module die het verzoek indient (bijv. "offerte", "spots", "hrm"). */
  module: string;

  /** Naam van het AI-proces (bijv. "offerte-sectie-genereren", "spot-analyse"). */
  procesNaam: string;

  /** Gebruiker-id van de aanvragende gebruiker (verplicht voor audit). */
  gebruikerId: number | null;

  /**
   * Contextbronnen samengesteld door de Orchestrator vóór de gateway-aanroep.
   * Modules hoeven dit veld niet te vullen; de Orchestrator stelt de lijst
   * samen uit meerdere onafhankelijke bronnen (documenten, workflow, RAG, etc.)
   * en geeft de bundel door aan de gateway.
   *
   * @see AiContextBron voor de mogelijke bronsoorten.
   */
  contextBronnen?: AiContextBron[];

  /** Vrije metadata voor het specifieke proces (bijv. entiteitIds, parameters). */
  meta?: Record<string, unknown>;
}

// ── AiProcessResult ───────────────────────────────────────────────────────────

/**
 * Resultaat van een AI-proces dat via de Orchestrator is verwerkt.
 *
 * VERANTWOORDELIJKHEIDSGRENS:
 *   De gateway levert de ruwe AI-output (tekst, JSON). De Orchestrator
 *   bepaalt wat ermee gebeurt: opslaan, notificeren, in een workflow plaatsen,
 *   of wachten op goedkeuring. Modules ontvangen het `AiProcessResult` en
 *   kunnen op basis van de `status` bepalen welke vervolgactie nodig is.
 *
 * GOEDKEURINGSTOKEN:
 *   Wanneer `status === "wacht_op_gebruiker"` bevat het resultaat een
 *   `humanApprovalToken` dat de gebruiker kan gebruiken om het proces goed te
 *   keuren of af te wijzen. Het token is tijdgebonden en eenmalig.
 */
export interface AiProcessResult {
  /** Huidige status van het AI-proces. */
  status: AiProcessStatus;

  /**
   * Ruwe AI-output (tekst of geserialiseerde JSON).
   * Aanwezig bij status `voorstel` of `akkoord`.
   * Afwezig (null) bij `wacht_op_gebruiker`, `afgewezen` of `fout`.
   */
  resultaat: string | null;

  /**
   * Token voor de goedkeuringsflow. Aanwezig bij `wacht_op_gebruiker`.
   * De Orchestrator genereert dit token; het bijbehorende endpoint verifieert
   * en verwerkt de goedkeuring of afwijzing.
   */
  humanApprovalToken?: string;

  /** Foutmelding bij status `fout`. */
  foutmelding?: string;

  /** Correlatie-id van de bijbehorende ai_aanroepen-rij voor audit. */
  aanroepId?: number;
}
