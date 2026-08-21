import { db, gebruikersTable, objectRechtenTable, gebouwToewijzingenTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  PermissieEngine,
  type Bevoegdheden,
  type AutorisatieSnapshot,
  type ObjectRecht,
  type PermissieContext,
} from "@workspace/permissies";
import { berekenEffectieveBevoegdhedenBatch } from "./effectieve-bevoegdheden";

/**
 * PermissieService — request-scoped autorisatieservice.
 *
 * Laadt alle rechten van een gebruiker in één DB-ronde (module-rechten,
 * object-rechten en gebouwtoewijzingen) en delegeert evaluatie aan de pure
 * PermissieEngine.
 *
 * Gebruik:
 *   Via laadPermissies()-middleware: req.permissies is automatisch beschikbaar.
 *   Daarna: req.permissies.heeftModuleRecht("gebouwen", 2)
 *           req.permissies.magBijGebouw(gebouwId)
 *           req.permissies.heeftObjectRecht("project", projectId, 1)
 */
export class PermissieService {
  private engine: PermissieEngine | null = null;

  constructor(private readonly gebruikerId: number) {}

  async laad(): Promise<void> {
    const [gebruikerRows, objectRechtenRows, toewijzingRows] = await Promise.all([
      db
        .select({ rol: gebruikersTable.rol, bevoegdheden: gebruikersTable.bevoegdheden })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, this.gebruikerId)),
      db
        .select()
        .from(objectRechtenTable)
        .where(eq(objectRechtenTable.gebruikerId, this.gebruikerId)),
      db
        .select({ gebouwId: gebouwToewijzingenTable.gebouwId })
        .from(gebouwToewijzingenTable)
        .where(eq(gebouwToewijzingenTable.gebruikerId, this.gebruikerId)),
    ]);

    const gebruiker = gebruikerRows[0];
    if (!gebruiker) throw new Error(`Gebruiker ${this.gebruikerId} niet gevonden`);

    const kaart = await berekenEffectieveBevoegdhedenBatch([
      { id: this.gebruikerId, rol: gebruiker.rol, storedBevoegdheden: gebruiker.bevoegdheden },
    ]);
    const effectief: Bevoegdheden = kaart.get(this.gebruikerId) ?? {};

    const objectRechten: ObjectRecht[] = objectRechtenRows.map((r) => ({
      id: r.id,
      objectType: r.objectType,
      objectId: r.objectId,
      moduleId: r.moduleId,
      niveau: r.niveau,
      geldigVan: r.geldigVan,
      geldigTot: r.geldigTot,
      werkmaatschappijId: r.werkmaatschappijId,
    }));

    const ctx: PermissieContext = {
      userId: this.gebruikerId,
      rol: gebruiker.rol,
      bevoegdheden: effectief,
      objectRechten,
      toegewezenGebouwIds: toewijzingRows.map((r) => r.gebouwId),
      nu: new Date(),
    };

    this.engine = new PermissieEngine(ctx);
  }

  private get e(): PermissieEngine {
    if (!this.engine) throw new Error("PermissieService.laad() is nog niet aangeroepen");
    return this.engine;
  }

  get isHoofdbeheerder(): boolean {
    return this.e.isHoofdbeheerder;
  }
  get userId(): number {
    return this.gebruikerId;
  }
  get toegestaneGebouwIds(): number[] | null {
    return this.e.toegestaneGebouwIds;
  }
  get autorisatieSnapshot(): AutorisatieSnapshot {
    return this.e.autorisatieSnapshot;
  }

  heeftModuleRecht(module: string, minNiveau: number): boolean {
    return this.e.heeftModuleRecht(module, minNiveau);
  }

  heeftObjectRecht(objectType: string, objectId: number, minNiveau = 1): boolean {
    return this.e.heeftObjectRecht(objectType, objectId, minNiveau);
  }

  heeftToegang(objectType: string, objectId: number, module: string, minNiveau = 1): boolean {
    return this.e.heeftToegang(objectType, objectId, module, minNiveau);
  }

  magBijGebouw(gebouwId: number | null): boolean {
    return this.e.magBijGebouw(gebouwId);
  }
}
