/**
 * AI Decision Engine (Fase 0 — passthrough + human-in-the-loop)
 *
 * De Decision Engine is de centrale orkestratielaag boven de bestaande AI-poort
 * (`aiGateway`). Zij:
 *   1. zoekt de taak op in het taakregister;
 *   2. kiest via de modelrouter het juiste modelslot;
 *   3. bouwt via de Prompt Builder de prompt (systemprompt + guardrails +
 *      context + outputschema-instructie);
 *   4. roept UITSLUITEND `aiGateway.chat()` aan — governance blijft dus de
 *      eerste poort en wordt nooit omzeild;
 *   5. normaliseert de uitvoer en valideert die zacht tegen het Zod-outputschema
 *      (Fase 0: aangeboden, nog niet afgedwongen — bij twijfel controleNodig=true);
 *   6. beslist op basis van `requiresHumanApproval`:
 *        - false  -> passthrough: het AI-voorstel gaat direct terug. Dit is
 *                    functioneel identiek aan een directe gateway-aanroep, dus
 *                    ZONDER gedragswijziging.
 *        - true   -> human-in-the-loop: het voorstel wordt bewaard met een
 *                    eenmalig, tijdgebonden token en de status
 *                    `wacht_op_gebruiker`. Een tweede aanroep (`beoordeel`)
 *                    zet de status op `akkoord` of `afgewezen`.
 *
 * Zie docs/architectuur/ai-platform/README.md §4.2 en §5.2.
 *
 * De persistente opslag is achter een interface (`BeslissingStore`) geplaatst
 * zodat de engine zuiver te testen is met een in-memory implementatie.
 */

import crypto from "node:crypto";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { aiBeslissingenTable } from "@workspace/db/schema";
import { logger } from "./logger";
import { aiGateway, type ChatResultaat, type LogContext } from "./aiGateway";
import { AiProcessStatus, type AiProcessResult } from "./aiOrchestrator";
import { kiesSlot } from "./aiModelRouter";
import { bouwPrompt } from "./aiPromptBuilder";
import { vindTaak, type AiTaak } from "./aiTaakregister";

/** Standaard geldigheidsduur van een wachtend voorstel: 24 uur. */
const TOKEN_GELDIGHEID_MS = 24 * 60 * 60 * 1000;

/**
 * Engine-resultaat: het stabiele orchestrator-contract (`AiProcessResult`)
 * verrijkt met twee optionele, niet-brekende signaleringsvelden. De basis-
 * interface blijft ongewijzigd zodat toekomstige orchestratie er transparant
 * op kan bouwen.
 */
export interface AiEngineResultaat extends AiProcessResult {
  /** Zelfgerapporteerde betrouwbaarheid uit de AI-uitvoer, indien aanwezig. */
  betrouwbaarheid?: string | null;
  /** Vlag dat menselijke controle wenselijk is (bijv. schema-mismatch). */
  controleNodig?: boolean;
}

/** Invoer voor het uitvoeren van een taak. */
export interface AiTaakInvoer {
  /** De concrete gebruikersprompt/vraag voor deze aanroep. */
  invoer: string;
  /** Optionele reeds samengestelde contextbundel. */
  contextBundel?: string | null;
  /** Optionele businesscontext die naar het gateway-log gaat. */
  logContext?: Partial<LogContext>;
}

/** Eén opgeslagen (wachtende of afgehandelde) beslissing. */
export interface BeslissingRij {
  token: string;
  taaknaam: string;
  module: string;
  procesNaam: string | null;
  aanvragerId: number | null;
  status: string;
  voorstel: string | null;
  betrouwbaarheid: string | null;
  controleNodig: boolean;
  modelSlot: string | null;
  promptNaam: string | null;
  promptVersie: string | null;
  beslistDoorId: number | null;
  beslistOp: Date | null;
  opmerking: string | null;
  verlooptOp: Date | null;
  aangemaaktOp: Date | null;
}

/** Persistente opslag voor wachtende beslissingen (DI voor testbaarheid). */
export interface BeslissingStore {
  bewaar(rij: {
    token: string;
    taaknaam: string;
    module: string;
    procesNaam: string;
    aanvragerId: number | null;
    voorstel: string;
    betrouwbaarheid: string | null;
    controleNodig: boolean;
    modelSlot: string;
    promptNaam: string;
    promptVersie: string;
    contextJson: Record<string, unknown> | null;
    verlooptOp: Date;
  }): Promise<BeslissingRij>;
  haalOpViaToken(token: string): Promise<BeslissingRij | null>;
  werkStatusBij(
    token: string,
    patch: { status: string; beslistDoorId: number; beslistOp: Date; opmerking: string | null },
  ): Promise<BeslissingRij | null>;
  lijst(): Promise<BeslissingRij[]>;
}

// ── DB-gebaseerde store ───────────────────────────────────────────────────────

type DbRij = typeof aiBeslissingenTable.$inferSelect;

function naarRij(r: DbRij): BeslissingRij {
  return {
    token: r.token,
    taaknaam: r.taaknaam,
    module: r.module,
    procesNaam: r.procesNaam,
    aanvragerId: r.aanvragerId,
    status: r.status,
    voorstel: r.voorstel,
    betrouwbaarheid: r.betrouwbaarheid,
    controleNodig: r.controleNodig,
    modelSlot: r.modelSlot,
    promptNaam: r.promptNaam,
    promptVersie: r.promptVersie,
    beslistDoorId: r.beslistDoorId,
    beslistOp: r.beslistOp,
    opmerking: r.opmerking,
    verlooptOp: r.verlooptOp,
    aangemaaktOp: r.aangemaaktOp,
  };
}

export const dbBeslissingStore: BeslissingStore = {
  async bewaar(rij) {
    const [r] = await db
      .insert(aiBeslissingenTable)
      .values({
        token: rij.token,
        taaknaam: rij.taaknaam,
        module: rij.module,
        procesNaam: rij.procesNaam,
        aanvragerId: rij.aanvragerId,
        status: AiProcessStatus.wacht_op_gebruiker,
        voorstel: rij.voorstel,
        betrouwbaarheid: rij.betrouwbaarheid,
        controleNodig: rij.controleNodig,
        modelSlot: rij.modelSlot,
        promptNaam: rij.promptNaam,
        promptVersie: rij.promptVersie,
        contextJson: rij.contextJson,
        verlooptOp: rij.verlooptOp,
      })
      .returning();
    return naarRij(r);
  },
  async haalOpViaToken(token) {
    const [r] = await db
      .select()
      .from(aiBeslissingenTable)
      .where(eq(aiBeslissingenTable.token, token))
      .limit(1);
    return r ? naarRij(r) : null;
  },
  async werkStatusBij(token, patch) {
    const [r] = await db
      .update(aiBeslissingenTable)
      .set({
        status: patch.status,
        beslistDoorId: patch.beslistDoorId,
        beslistOp: patch.beslistOp,
        opmerking: patch.opmerking,
        bijgewerktOp: new Date(),
      })
      .where(eq(aiBeslissingenTable.token, token))
      .returning();
    return r ? naarRij(r) : null;
  },
  async lijst() {
    const rijen = await db
      .select()
      .from(aiBeslissingenTable)
      .orderBy(desc(aiBeslissingenTable.aangemaaktOp))
      .limit(200);
    return rijen.map(naarRij);
  },
};

// ── De engine ─────────────────────────────────────────────────────────────────

export interface DecisionEngineDeps {
  store: BeslissingStore;
  gateway: Pick<typeof aiGateway, "chat">;
}

export class AiDecisionEngine {
  constructor(private readonly deps: DecisionEngineDeps) {}

  /**
   * Voer een geregistreerde taak uit.
   *
   * Passthrough (requiresHumanApproval=false): het voorstel gaat direct terug.
   * Human-in-the-loop (true): het voorstel wordt bewaard en er komt een token
   * terug; de aanroeper moet later `beoordeel()` aanroepen.
   */
  async verwerk(
    taaknaam: string,
    invoer: AiTaakInvoer,
    aanvragerId: number | null,
  ): Promise<AiEngineResultaat> {
    const taak = vindTaak(taaknaam);
    if (!taak) {
      return {
        status: AiProcessStatus.fout,
        resultaat: null,
        foutmelding: `Onbekende AI-taak: ${taaknaam}.`,
      };
    }

    const { slot, reden } = kiesSlot(taak.modelprofiel);
    const bundel = bouwPrompt({
      prompt: taak.prompt,
      contextBundel: invoer.contextBundel ?? null,
      outputSchemaBeschrijving: taak.outputSchemaBeschrijving ?? null,
      guardrails: taak.guardrails,
    });

    const logCtx: LogContext = {
      module: taak.module,
      functie: taaknaam,
      gebruikerId: aanvragerId,
      promptNaam: bundel.promptNaam,
      promptVersie: bundel.promptVersie,
      ...(invoer.logContext ?? {}),
    };

    const resultaat: ChatResultaat = await this.deps.gateway.chat(
      slot,
      {
        messages: [
          { role: "system", content: bundel.systemPrompt },
          { role: "user", content: invoer.invoer },
        ],
      },
      undefined,
      logCtx,
    );

    if (!resultaat.ok) {
      return { status: AiProcessStatus.fout, resultaat: null, foutmelding: resultaat.fout };
    }

    const { betrouwbaarheid, controleNodig } = this.beoordeelUitvoer(taak, resultaat.inhoud);

    logger.info(
      { taaknaam, slot, slotReden: reden, controleNodig, requiresHumanApproval: taak.requiresHumanApproval },
      "AI Decision Engine: taak verwerkt",
    );

    // Passthrough: geen goedkeuring vereist -> voorstel direct terug.
    if (!taak.requiresHumanApproval) {
      return {
        status: AiProcessStatus.voorstel,
        resultaat: resultaat.inhoud,
        betrouwbaarheid,
        controleNodig,
      };
    }

    // Human-in-the-loop: bewaar het voorstel en geef een token terug.
    const token = crypto.randomUUID();
    await this.deps.store.bewaar({
      token,
      taaknaam,
      module: taak.module,
      procesNaam: taak.procesNaam,
      aanvragerId,
      voorstel: resultaat.inhoud,
      betrouwbaarheid,
      controleNodig,
      modelSlot: slot,
      promptNaam: bundel.promptNaam,
      promptVersie: bundel.promptVersie,
      contextJson: (invoer.logContext ?? null) as Record<string, unknown> | null,
      verlooptOp: new Date(Date.now() + TOKEN_GELDIGHEID_MS),
    });

    return {
      status: AiProcessStatus.wacht_op_gebruiker,
      resultaat: null,
      humanApprovalToken: token,
      betrouwbaarheid,
      controleNodig,
    };
  }

  /**
   * Beoordeel een wachtend voorstel.
   *
   * akkoord=true  -> status `akkoord`, het voorstel wordt vrijgegeven (resultaat).
   * akkoord=false -> status `afgewezen`, geen resultaat.
   *
   * Fase 0 voert zelf geen downstream-verwerking uit (dat is per-feature Fase 4);
   * bij akkoord is de terminale status daarom `akkoord` met het vrijgegeven
   * voorstel, niet `uitgevoerd`.
   */
  async beoordeel(
    token: string,
    beoordelaarId: number,
    akkoord: boolean,
    opmerking?: string | null,
  ): Promise<AiEngineResultaat> {
    const bestaand = await this.deps.store.haalOpViaToken(token);
    if (!bestaand) {
      return { status: AiProcessStatus.fout, resultaat: null, foutmelding: "Onbekend beslissingstoken." };
    }
    if (bestaand.status !== AiProcessStatus.wacht_op_gebruiker) {
      return {
        status: AiProcessStatus.fout,
        resultaat: null,
        foutmelding: `Deze beslissing is al afgehandeld (status: ${bestaand.status}).`,
      };
    }
    if (bestaand.verlooptOp && bestaand.verlooptOp.getTime() < Date.now()) {
      return { status: AiProcessStatus.fout, resultaat: null, foutmelding: "Dit beslissingstoken is verlopen." };
    }

    const nieuweStatus = akkoord ? AiProcessStatus.akkoord : AiProcessStatus.afgewezen;
    const bijgewerkt = await this.deps.store.werkStatusBij(token, {
      status: nieuweStatus,
      beslistDoorId: beoordelaarId,
      beslistOp: new Date(),
      opmerking: opmerking ?? null,
    });

    // Fail-closed: als de statusupdate onverwacht niets teruggeeft (race of
    // store-anomalie) is de terminale status niet betrouwbaar vastgelegd. Geef
    // dan een fout in plaats van een mogelijk stale voorstel vrij te geven.
    if (!bijgewerkt) {
      logger.error(
        { token, beoordelaarId, akkoord, taaknaam: bestaand.taaknaam },
        "AI Decision Engine: statusupdate gaf geen rij terug (fail-closed)",
      );
      return {
        status: AiProcessStatus.fout,
        resultaat: null,
        foutmelding: "Beslissing kon niet worden vastgelegd; probeer opnieuw.",
      };
    }

    logger.info(
      { token, beoordelaarId, akkoord, taaknaam: bestaand.taaknaam },
      "AI Decision Engine: voorstel beoordeeld",
    );

    if (akkoord) {
      return {
        status: AiProcessStatus.akkoord,
        resultaat: bijgewerkt.voorstel ?? null,
        betrouwbaarheid: bestaand.betrouwbaarheid,
        controleNodig: bestaand.controleNodig,
      };
    }
    return { status: AiProcessStatus.afgewezen, resultaat: null };
  }

  /**
   * Zachte outputvalidatie (Fase 0). Valideert tegen het Zod-outputschema als de
   * taak er een heeft, maar dwingt niets af: bij een schema-mismatch of ontbrekend
   * betrouwbaarheidsveld wordt alleen `controleNodig` op true gezet.
   */
  private beoordeelUitvoer(
    taak: AiTaak,
    inhoud: string,
  ): { betrouwbaarheid: string | null; controleNodig: boolean } {
    if (!taak.outputSchema) {
      return { betrouwbaarheid: null, controleNodig: false };
    }
    try {
      const geparsed: unknown = JSON.parse(inhoud);
      const uitkomst = taak.outputSchema.safeParse(geparsed);
      const betrouwbaarheid =
        geparsed && typeof geparsed === "object" && "betrouwbaarheid" in geparsed
          ? String((geparsed as Record<string, unknown>).betrouwbaarheid)
          : null;
      return { betrouwbaarheid, controleNodig: !uitkomst.success };
    } catch {
      // Geen geldige JSON terwijl een schema verwacht werd -> menselijke controle.
      return { betrouwbaarheid: null, controleNodig: true };
    }
  }
}

/** Standaard-engine met DB-store en de echte gateway. */
export const aiDecisionEngine = new AiDecisionEngine({
  store: dbBeslissingStore,
  gateway: aiGateway,
});
