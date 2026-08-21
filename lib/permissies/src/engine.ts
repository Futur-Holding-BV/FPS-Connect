import type { AutorisatieSnapshot, PermissieContext } from "./types";

// Inline om circulaire import met index.ts te vermijden.
function heeftNiveauIntern(
  bev: Record<string, number>,
  module: string,
  minNiveau: number,
): boolean {
  return (bev[module] ?? 0) >= minNiveau;
}

const VELD_UITVOERING_MODULES = ["voorzieningen", "onderhoud", "inspecties"] as const;
const VELD_UITVOERING_NIVEAU = 2;

/**
 * PermissieEngine — pure evaluatielaag zonder DB-toegang.
 * Geschikt voor unit-tests en hergebruik in firevault (toekomstig).
 *
 * Ondersteunde dimensies (actief):
 *   1. Module-rechten       — bevoegdheden-matrix per module (0–4)
 *   2. Object-rechten       — per objectType + objectId
 *   3. Tijdelijke rechten   — geldigVan / geldigTot op ObjectRecht
 *   4. Gebouw-scope         — toewijzingen + matrix-bypass
 *
 * Architectuur klaargezet voor (implementatie volgt later):
 *   5. Workflow-rechten     — statusgebonden toegangsregels
 *   6. Eigenaar-rechten     — maker/eigenaar heeft automatisch toegang
 *   7. Werkmaatschappij-scope — multi-tenant filtering
 */
export class PermissieEngine {
  constructor(private readonly ctx: PermissieContext) {}

  get isHoofdbeheerder(): boolean {
    return this.ctx.rol === "hoofdbeheerder";
  }

  get userId(): number {
    return this.ctx.userId;
  }

  // ── Dimensie 1: Module-rechten ──────────────────────────────────────────

  heeftModuleRecht(module: string, minNiveau: number): boolean {
    if (this.isHoofdbeheerder) return true;
    return heeftNiveauIntern(this.ctx.bevoegdheden, module, minNiveau);
  }

  // ── Dimensie 2 + 3: Object-rechten (incl. tijdgebonden) ─────────────────

  /**
   * Geeft true als de gebruiker een actief object-recht heeft op het
   * opgegeven object met minimaal het gevraagde niveau.
   * Tijdgebonden rechten worden geëvalueerd tegen ctx.nu.
   */
  heeftObjectRecht(
    objectType: string,
    objectId: number,
    minNiveau = 1,
  ): boolean {
    if (this.isHoofdbeheerder) return true;
    const nu = this.ctx.nu;
    return this.ctx.objectRechten.some(
      (r) =>
        r.objectType === objectType &&
        r.objectId === objectId &&
        r.niveau >= minNiveau &&
        (r.geldigVan === null || r.geldigVan <= nu) &&
        (r.geldigTot === null || r.geldigTot > nu),
    );
  }

  /**
   * Gecombineerde check: module-recht OF object-recht.
   * Voor endpoints die via brede module-toegang én via expliciete object-grants bereikbaar zijn.
   */
  heeftToegang(
    objectType: string,
    objectId: number,
    module: string,
    minNiveau = 1,
  ): boolean {
    return (
      this.heeftModuleRecht(module, minNiveau) ||
      this.heeftObjectRecht(objectType, objectId, minNiveau)
    );
  }

  // ── Dimensie 4: Gebouw-scope ────────────────────────────────────────────

  /**
   * Of deze gebruiker breder mag kijken dan alleen zijn toegewezen gebouwen.
   * Spiegelt de isBeperkt()-logica uit utils/rol.ts.
   */
  private isBeperkt(): boolean {
    const { rol, bevoegdheden } = this.ctx;
    if (rol === "hoofdbeheerder") return false;
    const gebouwNiveau = bevoegdheden["gebouwen"] ?? 0;
    if (gebouwNiveau < 1) return true;
    if (gebouwNiveau >= 2) return false;
    // Niveau 1: veld-uitvoerders (schrijftoegang op spots/onderhoud/inspecties) zijn beperkt;
    // kantoorpersoneel met alleen leesrecht niet.
    return VELD_UITVOERING_MODULES.some(
      (m) => (bevoegdheden[m] ?? 0) >= VELD_UITVOERING_NIVEAU,
    );
  }

  /**
   * Centrale gebouw-toegangscheck — vervangt de gedupliceeerde magBijGebouw()
   * helpers in de afzonderlijke route-bestanden.
   *
   * Toegang als ten minste één van de volgende geldt:
   *   A. Hoofdbeheerder (omzeilt alles)
   *   B. Gebruiker is NIET beperkt (brede matrix-toegang)
   *   C. Gebouw staat in de toewijzingenlijst van de gebruiker
   *   D. Gebruiker heeft een expliciet object-recht op dit gebouw
   */
  magBijGebouw(gebouwId: number | null): boolean {
    if (gebouwId == null) return false;
    if (this.isHoofdbeheerder) return true;
    if (!this.isBeperkt()) return true;
    if (this.ctx.toegewezenGebouwIds.includes(gebouwId)) return true;
    return this.heeftObjectRecht("gebouw", gebouwId, 1);
  }

  /**
   * SQL-scope voor leesqueries op gebouwgebonden gegevens.
   *
   * `null` betekent brede toegang. Een array betekent dat de query vóór het
   * lezen met deze gebouw-id's begrensd moet worden. Actieve objectrechten
   * tellen mee, zodat dit exact dezelfde beslissing gebruikt als
   * magBijGebouw().
   */
  get toegestaneGebouwIds(): number[] | null {
    if (this.isHoofdbeheerder || !this.isBeperkt()) return null;
    const nu = this.ctx.nu;
    const objectGebouwIds = this.ctx.objectRechten
      .filter(
        (r) =>
          r.objectType === "gebouw" &&
          r.niveau >= 1 &&
          (r.geldigVan === null || r.geldigVan <= nu) &&
          (r.geldigTot === null || r.geldigTot > nu),
      )
      .map((r) => r.objectId);
    return [...new Set([...this.ctx.toegewezenGebouwIds, ...objectGebouwIds])];
  }

  /**
   * Canonieke momentopname van iedere autorisatiedimensie die een gegevensquery
   * kan begrenzen. Alleen momenteel actieve objectrechten tellen mee: zodra een
   * tijdgebonden recht ingaat of verloopt, verandert de snapshot automatisch.
   */
  get autorisatieSnapshot(): AutorisatieSnapshot {
    const nu = this.ctx.nu;
    const actieveObjectRechten = this.ctx.objectRechten
      .filter(
        (recht) =>
          recht.niveau > 0 &&
          (recht.geldigVan === null || recht.geldigVan <= nu) &&
          (recht.geldigTot === null || recht.geldigTot > nu),
      )
      .map((recht) => ({
        id: recht.id,
        objectType: recht.objectType,
        objectId: recht.objectId,
        moduleId: recht.moduleId,
        niveau: recht.niveau,
        geldigVan: recht.geldigVan?.toISOString() ?? null,
        geldigTot: recht.geldigTot?.toISOString() ?? null,
        werkmaatschappijId: recht.werkmaatschappijId,
      }))
      .sort((a, b) =>
        a.objectType.localeCompare(b.objectType) ||
        a.objectId - b.objectId ||
        (a.moduleId ?? "").localeCompare(b.moduleId ?? "") ||
        a.niveau - b.niveau ||
        a.id - b.id,
      );

    return {
      userId: this.ctx.userId,
      rol: this.ctx.rol.trim().toLowerCase(),
      bevoegdheden: Object.entries(this.ctx.bevoegdheden)
        .map(([moduleId, niveau]) => [moduleId, niveau] as [string, number])
        .sort(([a], [b]) => a.localeCompare(b)),
      actieveObjectRechten,
      toegewezenGebouwIds: [...new Set(this.ctx.toegewezenGebouwIds)].sort((a, b) => a - b),
      werkmaatschappijId: this.ctx.werkmaatschappijId ?? null,
    };
  }

  // ── Stubs voor toekomstige dimensies ───────────────────────────────────

  /**
   * TOEKOMSTIG — Dimensie 5: Workflow-rechten.
   * Controleert of de workflowStatus een actie toelaat voor dit module-niveau.
   * Vereist: workflow_rechten-tabel gevuld met regels.
   */
  // heeftWorkflowRecht(module: string, workflowStatus: string, minNiveau: number): boolean

  /**
   * TOEKOMSTIG — Dimensie 6: Eigenaar-rechten.
   * Maker/eigenaar van een object krijgt automatisch minimaal leesrecht.
   */
  // isEigenaarVan(objectType: string, objectId: number): boolean

  /**
   * TOEKOMSTIG — Dimensie 7: Werkmaatschappij-scope.
   * Recht is alleen geldig binnen een specifieke werkmaatschappij.
   */
  // heeftWerkmaatschappijToegang(werkmaatschappijId: number): boolean
}
