import { db as _mainDb, workflowTransitieLogTable, gebruikersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logAudit } from "../lib/audit";

type Db = typeof _mainDb;

// ── Publieke types ─────────────────────────────────────────────────────────────

export interface TransitieContext {
  db: Db;
  gebruikerId: number | null;
  gebruikerNaam?: string | null;
  bevoegdheden: Record<string, number>;
  isHoofdbeheerder?: boolean;
  params?: Record<string, unknown>;
}

export type TransitieErrorCode =
  | "NIET_GEVONDEN"
  | "NIET_TOEGESTAAN"
  | "BEVOEGDHEID"
  | "VOORWAARDE";

export interface TransitieError {
  code: TransitieErrorCode;
  bericht: string;
  velden?: string[];
  httpStatus: number;
}

export interface TransitieResultaat<T = unknown> {
  ok: boolean;
  error?: TransitieError;
  entity?: T;
}

export interface TransitieDefinitie<T> {
  van: string | string[];
  naar: string;
  label: string;
  bevoegdheid?: [string, number];
  precheck?: (entity: T, ctx: TransitieContext) => Promise<TransitieError | null>;
  postTransitie?: (vanEntity: T, ctx: TransitieContext) => Promise<void>;
}

export interface WorkflowConfig<T extends { status: string }> {
  id: string;
  naam: string;
  haalEntityOp: (id: number, db: Db) => Promise<T | null>;
  uitvoerenTransitie: (
    id: number,
    nieuweStatus: string,
    vanEntity: T,
    ctx: TransitieContext,
  ) => Promise<T>;
  transities: TransitieDefinitie<T>[];
}

// ── WorkflowService ────────────────────────────────────────────────────────────

export class WorkflowService {
  private readonly configs = new Map<string, WorkflowConfig<any>>();

  registreer<T extends { status: string }>(config: WorkflowConfig<T>): this {
    this.configs.set(config.id, config);
    return this;
  }

  async transiteer<T extends { status: string }>(
    workflowId: string,
    entityId: number,
    naarStatus: string,
    ctx: TransitieContext,
  ): Promise<TransitieResultaat<T>> {
    const config = this.configs.get(workflowId) as WorkflowConfig<T> | undefined;
    if (!config) {
      return fout("NIET_GEVONDEN", `Workflow '${workflowId}' is niet geconfigureerd`, 500);
    }

    const entity = await config.haalEntityOp(entityId, ctx.db);
    if (!entity) return fout("NIET_GEVONDEN", "Entiteit niet gevonden", 404);

    if (entity.status === naarStatus) return { ok: true, entity };

    const transitie = config.transities.find((t) => {
      const van = Array.isArray(t.van) ? t.van : [t.van];
      return van.includes(entity.status) && t.naar === naarStatus;
    });

    if (!transitie) {
      const toegestaan = config.transities
        .filter((t) => (Array.isArray(t.van) ? t.van : [t.van]).includes(entity.status))
        .map((t) => `'${t.naar}'`);
      return fout(
        "NIET_TOEGESTAAN",
        `Status '${entity.status}' mag niet worden gewijzigd naar '${naarStatus}'.${
          toegestaan.length
            ? ` Toegestaan vanuit '${entity.status}': ${toegestaan.join(", ")}`
            : " Geen transitie mogelijk vanuit huidige status."
        }`,
        409,
      );
    }

    if (transitie.bevoegdheid) {
      const [moduleId, minNiveau] = transitie.bevoegdheid;
      const niveau = ctx.bevoegdheden[moduleId] ?? 0;
      if (!ctx.isHoofdbeheerder && niveau < minNiveau) {
        return fout(
          "BEVOEGDHEID",
          "Onvoldoende bevoegdheid voor deze statuswijziging",
          403,
        );
      }
    }

    if (transitie.precheck) {
      const e = await transitie.precheck(entity, ctx);
      if (e) return { ok: false, error: e };
    }

    let updatedEntity!: T;

    await ctx.db.transaction(async (tx) => {
      const txCtx: TransitieContext = { ...ctx, db: tx as unknown as Db };

      updatedEntity = await config.uitvoerenTransitie(
        entityId,
        naarStatus,
        entity,
        txCtx,
      );

      if (transitie.postTransitie) {
        await transitie.postTransitie(entity, txCtx);
      }

      await (tx as unknown as Db).insert(workflowTransitieLogTable).values({
        workflowId: config.id,
        entityId,
        entityType: config.naam,
        vanStatus: entity.status,
        naarStatus,
        gebruikerId: ctx.gebruikerId ?? null,
        gebruikerNaam: ctx.gebruikerNaam ?? null,
        reden:
          typeof ctx.params?.reden === "string" ? ctx.params.reden : null,
        aangemaaktOp: new Date(),
      });
    });

    // Spiegel naar de universele audit trail (buiten de transactie — fire-and-forget)
    logAudit({
      gebruikerId: ctx.gebruikerId,
      gebruikerNaam: ctx.gebruikerNaam ?? null,
      ipAdres: null,
      sessieId: null,
      module: config.id,
      actie: "status_wijzigen",
      entiteit: config.naam,
      entiteitId: entityId,
      entiteitNaam: null,
      oudeWaarde: { status: entity.status } as Record<string, unknown>,
      nieuweWaarde: { status: naarStatus } as Record<string, unknown>,
      workflowStatus: naarStatus,
      gebouwId: null,
      medewerkerId: null,
      documentId: null,
      meta: typeof ctx.params?.reden === "string"
        ? ({ reden: ctx.params.reden } as Record<string, unknown>)
        : null,
    });

    return { ok: true, entity: updatedEntity };
  }

  async toegestaneTransities(
    workflowId: string,
    entityId: number,
    ctx: TransitieContext,
  ): Promise<Array<{ naar: string; label: string }>> {
    const config = this.configs.get(workflowId);
    if (!config) return [];
    const entity = await config.haalEntityOp(entityId, ctx.db);
    if (!entity) return [];
    return config.transities
      .filter((t) => (Array.isArray(t.van) ? t.van : [t.van]).includes(entity.status))
      .map((t) => ({ naar: t.naar, label: t.label }));
  }

  isGeconfigureerd(workflowId: string): boolean {
    return this.configs.has(workflowId);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fout(
  code: TransitieErrorCode,
  bericht: string,
  httpStatus: number,
): TransitieResultaat<never> {
  return { ok: false, error: { code, bericht, httpStatus } };
}

export function voorwaardeFout(
  bericht: string,
  velden?: string[],
): TransitieError {
  return { code: "VOORWAARDE", bericht, velden, httpStatus: 422 };
}

// ── Singleton ──────────────────────────────────────────────────────────────────

export const workflowService = new WorkflowService();

// ── Context helper ─────────────────────────────────────────────────────────────
// Bouwt een TransitieContext op vanuit een Express-request. Haalt de
// bevoegdheden van de ingelogde gebruiker op uit de DB.

export async function maakTransitieContext(
  req: { session: { userId?: number | null } },
  db: Db,
  params?: Record<string, unknown>,
): Promise<TransitieContext> {
  const gebruikerId = req.session?.userId ?? null;
  if (!gebruikerId) {
    return { db, gebruikerId: null, bevoegdheden: {}, isHoofdbeheerder: false, params };
  }
  const [g] = await db
    .select({
      bevoegdheden: gebruikersTable.bevoegdheden,
      rol: gebruikersTable.rol,
      naam: gebruikersTable.naam,
    })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.id, gebruikerId));
  return {
    db,
    gebruikerId,
    gebruikerNaam: g?.naam ?? null,
    bevoegdheden: (g?.bevoegdheden as Record<string, number> | null) ?? {},
    isHoofdbeheerder: g?.rol === "hoofdbeheerder",
    params,
  };
}
