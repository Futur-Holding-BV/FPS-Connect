// Governance & Approval Engine — service-laag.
//
// Generieke goedkeuringsmotor voor élk documenttype. Bewust geen gebruik van de
// bestaande `WorkflowService` (workflow-engine.ts): die gaat uit van precies één
// statusveld per entiteit, terwijl deze motor N-van-M-goedkeuringen en
// drempel-gedreven goedkeurder-toewijzing nodig heeft. Wel hergebruik van
// dezelfde onderliggende tabellen: `workflow_transitie_log` voor de tijdlijn op
// het onderliggende document, en `audit_log` (via `logAudit`) voor het
// auditspoor — geen nieuwe logtabel.
import {
  db as _mainDb,
  goedkeuringBeleidsregelsTable,
  goedkeuringAanvragenTable,
  goedkeuringStappenTable,
  workflowTransitieLogTable,
  gebruikersTable,
  facturenTable,
  type GoedkeuringBeleidsregel,
  type GoedkeuringAanvraag,
} from "@workspace/db";
import { and, eq, or, isNull, desc } from "drizzle-orm";
import { heeftNiveau, MODULE_IDS, type ModuleId } from "@workspace/permissies";
import { logAudit } from "../lib/audit";
import { workflowService } from "./workflow-engine";
import { logger } from "../lib/logger";
import {
  stuurGoedkeuringIndienenMail,
  stuurGoedkeuringGoedgekeurdMail,
  stuurGoedkeuringAfgewezenMail,
} from "./email";

type Db = typeof _mainDb;

// Koppelt een object_type in de generieke goedkeuringsmotor aan de
// bijbehorende WorkflowService-config, zodat het onderliggende document
// automatisch de juiste status krijgt zodra een aanvraag volledig is
// goedgekeurd. Puur data-gedreven: nieuwe documenttypes hoeven alleen hier
// (en in hun eigen workflow-config met een precheck) geregistreerd te worden
// — géén aparte goedkeuringslogica per documenttype.
const OBJECT_WORKFLOW_ACTIE: Record<string, { workflowId: string; naarStatus: string }> = {
  inkoopbon: { workflowId: "inkoopbon", naarStatus: "goedgekeurd" },
  verlofaanvraag: { workflowId: "verlofaanvraag", naarStatus: "goedgekeurd" },
};

// Directe DB-statusovergang na goedkeuring voor entiteiten die géén WorkflowService
// gebruiken (zoals facturen). Na goedkeuring wordt het onderliggende document direct
// bijgewerkt in de database zonder tussenkomst van de workflowmotor.
//
// Financiële documenttypes die op de facturenTable leven:
//   - verkoop_factuur / inkoop_factuur  — reguliere facturen (type "verkoop"/"inkoop")
//   - creditnota                        — creditnota's die als factuur geregistreerd zijn
//   - prijsafwijking                    — marge-/prijsafwijkingen, altijd directiegoedkeuring
//     (bovengrens in de beleidsregel bepaalt wanneer goedkeuring vereist is)
const OBJECT_DIRECTE_ACTIE: Record<string, { naarStatus: string; setGeaccordeerd: boolean }> = {
  verkoop_factuur: { naarStatus: "klaar_voor_accountview", setGeaccordeerd: true },
  inkoop_factuur: { naarStatus: "klaar_voor_accountview", setGeaccordeerd: true },
  creditnota: { naarStatus: "klaar_voor_accountview", setGeaccordeerd: true },
  prijsafwijking: { naarStatus: "klaar_voor_accountview", setGeaccordeerd: true },
};

// Zet, ná volledige goedkeuring, het onderliggende document automatisch door
// via de bestaande WorkflowService (voor inkoopbonnen e.d.) of via een directe
// DB-update (voor facturen e.d.). `viaGoedkeuring: true` laat de workflow-config
// weten dat de bevoegdheids-/beleidscheck al is afgehandeld door de motor zelf.
async function pasObjectStatusToe(
  db: Db,
  aanvraag: GoedkeuringAanvraag,
  actor: GoedkeuringActor,
): Promise<void> {
  // WorkflowService-pad (inkoopbon en gelijkaardige entiteiten)
  const actie = OBJECT_WORKFLOW_ACTIE[aanvraag.objectType];
  if (actie && workflowService.isGeconfigureerd(actie.workflowId)) {
    try {
      const resultaat = await workflowService.transiteer(
        actie.workflowId,
        aanvraag.objectId,
        actie.naarStatus,
        {
          db,
          gebruikerId: actor.gebruikerId,
          gebruikerNaam: actor.gebruikerNaam,
          bevoegdheden: actor.bevoegdheden,
          isHoofdbeheerder: actor.isHoofdbeheerder,
          params: { viaGoedkeuring: true },
        },
      );
      if (!resultaat.ok) {
        logger.warn(
          { aanvraagId: aanvraag.id, objectType: aanvraag.objectType, error: resultaat.error },
          "Automatische statusovergang na goedkeuring is niet gelukt",
        );
      }
    } catch (err) {
      logger.error(
        { err, aanvraagId: aanvraag.id, objectType: aanvraag.objectType },
        "Kon onderliggend document niet automatisch bijwerken na goedkeuring",
      );
    }
  }

  // Directe DB-pad (facturen en andere entiteiten zonder WorkflowService)
  const directeActie = OBJECT_DIRECTE_ACTIE[aanvraag.objectType];
  if (directeActie) {
    try {
      const nu = new Date();
      await db.update(facturenTable)
        .set({
          status: directeActie.naarStatus,
          bijgewerktOp: nu,
          ...(directeActie.setGeaccordeerd
            ? { geaccordeerd: true, geaccordeerdOp: nu, geaccordeerdDoor: actor.gebruikerId }
            : {}),
        })
        .where(eq(facturenTable.id, aanvraag.objectId));
    } catch (err) {
      logger.error(
        { err, aanvraagId: aanvraag.id, objectType: aanvraag.objectType },
        "Kon factuur niet automatisch bijwerken na goedkeuring (directe DB-update)",
      );
    }
  }
}

// Bouwt een GoedkeuringActor op vanuit een Express-request (dezelfde aanpak
// als maakTransitieContext in workflow-engine.ts).
export async function maakGoedkeuringActor(
  req: { session: { userId?: number | null } },
  db: Db,
): Promise<GoedkeuringActor | null> {
  const gebruikerId = req.session?.userId ?? null;
  if (!gebruikerId) return null;
  const [g] = await db
    .select({
      bevoegdheden: gebruikersTable.bevoegdheden,
      rol: gebruikersTable.rol,
      naam: gebruikersTable.naam,
    })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.id, gebruikerId));
  if (!g) return null;
  return {
    gebruikerId,
    gebruikerNaam: g.naam ?? null,
    bevoegdheden: (g.bevoegdheden as Record<string, number> | null) ?? {},
    isHoofdbeheerder: g.rol === "hoofdbeheerder",
  };
}

// ── Publieke types ─────────────────────────────────────────────────────────

export interface GoedkeuringActor {
  gebruikerId: number;
  gebruikerNaam: string | null;
  bevoegdheden: Record<string, number>;
  isHoofdbeheerder: boolean;
}

export type GoedkeuringErrorCode =
  | "GEEN_BELEID"
  | "NIET_GEVONDEN"
  | "NIET_TOEGESTAAN"
  | "VIER_OGEN"
  | "AL_AFGEHANDELD"
  | "ONGELDIGE_STATUS";

export interface GoedkeuringError {
  code: GoedkeuringErrorCode;
  bericht: string;
  httpStatus: number;
}

export interface GoedkeuringResultaat<T = GoedkeuringAanvraag> {
  ok: boolean;
  error?: GoedkeuringError;
  aanvraag?: T;
}

// Bevroren beleidsvorm — precies wat op indien-moment gold. Latere wijzigingen
// aan de levende beleidsregel raken lopende/afgehandelde aanvragen nooit.
export interface BeleidSnapshot {
  beleidsregelId: number | null;
  naam: string | null;
  goedkeurderGebruikerId: number | null;
  goedkeurderModule: string | null;
  goedkeurderMinNiveau: number | null;
  vervangerGebruikerId: number | null;
  aantalGoedkeuringenVereist: number;
  vierOgenVerplicht: boolean;
  reactietermijnUren: number | null;
}

function fout(
  code: GoedkeuringErrorCode,
  bericht: string,
  httpStatus: number,
): GoedkeuringResultaat<never> {
  return { ok: false, error: { code, bericht, httpStatus } };
}

function naarSnapshot(regel: GoedkeuringBeleidsregel | null): BeleidSnapshot {
  if (!regel) {
    return {
      beleidsregelId: null,
      naam: null,
      goedkeurderGebruikerId: null,
      goedkeurderModule: null,
      goedkeurderMinNiveau: null,
      vervangerGebruikerId: null,
      aantalGoedkeuringenVereist: 1,
      vierOgenVerplicht: true,
      reactietermijnUren: null,
    };
  }
  return {
    beleidsregelId: regel.id,
    naam: regel.naam,
    goedkeurderGebruikerId: regel.goedkeurderGebruikerId,
    goedkeurderModule: regel.goedkeurderModule,
    goedkeurderMinNiveau: regel.goedkeurderMinNiveau,
    vervangerGebruikerId: regel.vervangerGebruikerId,
    aantalGoedkeuringenVereist: regel.aantalGoedkeuringenVereist,
    vierOgenVerplicht: regel.vierOgenVerplicht,
    reactietermijnUren: regel.reactietermijnUren,
  };
}

// ── Beleidsregel-matching ────────────────────────────────────────────────────
// Kiest, bij meerdere kandidaten, eerst de regel met een specifieke
// werkmaatschappijId (boven een generieke null-regel), en bij gelijke
// specificiteit de smalste bandbreedte (meest precieze grens).
export async function vindPassendeBeleidsregel(
  db: Db,
  documentType: string,
  bedrag: number | null,
  werkmaatschappijId: number | null,
): Promise<GoedkeuringBeleidsregel | null> {
  const kandidaten = await db
    .select()
    .from(goedkeuringBeleidsregelsTable)
    .where(
      and(
        eq(goedkeuringBeleidsregelsTable.documentType, documentType),
        eq(goedkeuringBeleidsregelsTable.actief, true),
        or(
          isNull(goedkeuringBeleidsregelsTable.werkmaatschappijId),
          werkmaatschappijId != null
            ? eq(goedkeuringBeleidsregelsTable.werkmaatschappijId, werkmaatschappijId)
            : isNull(goedkeuringBeleidsregelsTable.werkmaatschappijId),
        ),
      ),
    );

  const passend = kandidaten.filter((r) => {
    const bovenOndergrens = r.ondergrens == null || bedrag == null || bedrag >= r.ondergrens;
    const onderBovengrens = r.bovengrens == null || bedrag == null || bedrag < r.bovengrens;
    return bovenOndergrens && onderBovengrens;
  });

  if (passend.length === 0) return null;

  passend.sort((a, b) => {
    const specifiekA = a.werkmaatschappijId != null ? 0 : 1;
    const specifiekB = b.werkmaatschappijId != null ? 0 : 1;
    if (specifiekA !== specifiekB) return specifiekA - specifiekB;
    const breedteA = (a.bovengrens ?? Infinity) - (a.ondergrens ?? -Infinity);
    const breedteB = (b.bovengrens ?? Infinity) - (b.ondergrens ?? -Infinity);
    return breedteA - breedteB;
  });

  return passend[0] ?? null;
}

// ── Tijdlijn + audit helpers ─────────────────────────────────────────────────

async function logTijdlijn(
  db: Db,
  params: {
    objectType: string;
    objectId: number;
    vanStatus: string;
    naarStatus: string;
    gebruikerId: number | null;
    gebruikerNaam: string | null;
    reden?: string | null;
  },
): Promise<void> {
  await db.insert(workflowTransitieLogTable).values({
    workflowId: "goedkeuring",
    entityId: params.objectId,
    entityType: params.objectType,
    vanStatus: params.vanStatus,
    naarStatus: params.naarStatus,
    gebruikerId: params.gebruikerId,
    gebruikerNaam: params.gebruikerNaam,
    reden: params.reden ?? null,
    aangemaaktOp: new Date(),
  });
}

function logGoedkeuringAudit(params: {
  actor: GoedkeuringActor;
  actie: string;
  documentType: string;
  objectId: number;
  meta?: Record<string, unknown>;
}): void {
  logAudit({
    gebruikerId: params.actor.gebruikerId,
    gebruikerNaam: params.actor.gebruikerNaam,
    ipAdres: null,
    sessieId: null,
    module: "goedkeuring",
    actie: params.actie,
    entiteit: params.documentType,
    entiteitId: params.objectId,
    entiteitNaam: null,
    oudeWaarde: null,
    nieuweWaarde: null,
    workflowStatus: null,
    gebouwId: null,
    medewerkerId: null,
    documentId: null,
    meta: (params.meta as Record<string, unknown>) ?? null,
  });
}

// ── Autorisatie ──────────────────────────────────────────────────────────────
// Vier-ogen geldt onvoorwaardelijk — ook voor de hoofdbeheerder. De indiener
// van een aanvraag mag deze nooit zelf goedkeuren, ongeacht rechten.
export function magGoedkeuren(
  actor: GoedkeuringActor,
  aanvraag: Pick<GoedkeuringAanvraag, "ingediendDoorId">,
  snapshot: BeleidSnapshot,
): boolean {
  if (snapshot.vierOgenVerplicht && aanvraag.ingediendDoorId === actor.gebruikerId) {
    return false;
  }
  if (!heeftNiveau(actor.bevoegdheden, "goedkeuring", 3) && !actor.isHoofdbeheerder) {
    return false;
  }
  if (snapshot.goedkeurderGebruikerId != null) {
    return (
      actor.gebruikerId === snapshot.goedkeurderGebruikerId ||
      actor.gebruikerId === snapshot.vervangerGebruikerId ||
      actor.isHoofdbeheerder
    );
  }
  if (snapshot.goedkeurderModule && snapshot.goedkeurderMinNiveau != null) {
    const moduleId = snapshot.goedkeurderModule as ModuleId;
    return (
      actor.isHoofdbeheerder ||
      (MODULE_IDS.includes(moduleId) &&
        heeftNiveau(actor.bevoegdheden, moduleId, snapshot.goedkeurderMinNiveau))
    );
  }
  // Beleidsregel wijst geen concrete goedkeurder aan — fail-closed, alleen de
  // hoofdbeheerder kan dit repareren via het beleidsscherm.
  return actor.isHoofdbeheerder;
}

// ── Kernacties ───────────────────────────────────────────────────────────────

export async function haalGoedgekeurdeAanvraag(
  db: Db,
  objectType: string,
  objectId: number,
): Promise<GoedkeuringAanvraag | null> {
  const [rij] = await db
    .select()
    .from(goedkeuringAanvragenTable)
    .where(
      and(
        eq(goedkeuringAanvragenTable.objectType, objectType),
        eq(goedkeuringAanvragenTable.objectId, objectId),
        eq(goedkeuringAanvragenTable.status, "goedgekeurd"),
      ),
    )
    .orderBy(desc(goedkeuringAanvragenTable.aangemaaktOp))
    .limit(1);
  return rij ?? null;
}

export async function vervangGoedgekeurdeAanvraag(
  db: Db,
  objectType: string,
  objectId: number,
  actor: GoedkeuringActor,
  reden?: string | null,
): Promise<void> {
  const aanvraag = await haalGoedgekeurdeAanvraag(db, objectType, objectId);
  if (!aanvraag) return;
  const nu = new Date();
  await db
    .update(goedkeuringAanvragenTable)
    .set({ status: "vervangen", afgehandeldOp: nu, bijgewerktOp: nu })
    .where(eq(goedkeuringAanvragenTable.id, aanvraag.id));
  await logTijdlijn(db, {
    objectType,
    objectId,
    vanStatus: "goedgekeurd",
    naarStatus: "vervangen",
    gebruikerId: actor.gebruikerId,
    gebruikerNaam: actor.gebruikerNaam,
    reden: reden ?? "Materiële wijziging na goedkeuring",
  });
  logGoedkeuringAudit({
    actor,
    actie: "aanvraag_vervangen",
    documentType: aanvraag.documentType,
    objectId,
    meta: { aanvraagId: aanvraag.id, reden },
  });
}

export interface VereistGoedkeuring {
  vereist: boolean;
  beleidsregel: GoedkeuringBeleidsregel | null;
}

// Bepaalt of een document op dit moment een goedkeuringsaanvraag nodig heeft.
// Geen passende beleidsregel = geen governance geconfigureerd voor dit
// documenttype/bedrag -> bewust NIET blokkerend (anders zit een team vast
// zodra deze module actief wordt, terwijl er nog geen beleid is ingericht).
export async function checkVereistGoedkeuring(
  db: Db,
  documentType: string,
  bedrag: number | null,
  werkmaatschappijId: number | null,
): Promise<VereistGoedkeuring> {
  const regel = await vindPassendeBeleidsregel(db, documentType, bedrag, werkmaatschappijId);
  return { vereist: regel != null, beleidsregel: regel };
}

export async function haalOpenAanvraag(
  db: Db,
  objectType: string,
  objectId: number,
): Promise<GoedkeuringAanvraag | null> {
  const [rij] = await db
    .select()
    .from(goedkeuringAanvragenTable)
    .where(
      and(
        eq(goedkeuringAanvragenTable.objectType, objectType),
        eq(goedkeuringAanvragenTable.objectId, objectId),
        eq(goedkeuringAanvragenTable.status, "ingediend"),
      ),
    )
    .orderBy(desc(goedkeuringAanvragenTable.aangemaaktOp))
    .limit(1);
  return rij ?? null;
}

export async function haalLaatsteAanvraag(
  db: Db,
  objectType: string,
  objectId: number,
): Promise<GoedkeuringAanvraag | null> {
  const [rij] = await db
    .select()
    .from(goedkeuringAanvragenTable)
    .where(
      and(
        eq(goedkeuringAanvragenTable.objectType, objectType),
        eq(goedkeuringAanvragenTable.objectId, objectId),
      ),
    )
    .orderBy(desc(goedkeuringAanvragenTable.aangemaaktOp))
    .limit(1);
  return rij ?? null;
}

// Dient een goedkeuringsaanvraag in. Idempotent: een reeds openstaande
// aanvraag voor hetzelfde object wordt teruggegeven i.p.v. gedupliceerd.
export async function dienIn(
  db: Db,
  params: {
    objectType: string;
    objectId: number;
    documentType: string;
    omschrijving?: string | null;
    bedrag: number | null;
    werkmaatschappijId: number | null;
    actor: GoedkeuringActor;
  },
): Promise<GoedkeuringResultaat> {
  const bestaand = await haalOpenAanvraag(db, params.objectType, params.objectId);
  if (bestaand) return { ok: true, aanvraag: bestaand };

  const regel = await vindPassendeBeleidsregel(
    db,
    params.documentType,
    params.bedrag,
    params.werkmaatschappijId,
  );
  if (!regel) {
    return fout(
      "GEEN_BELEID",
      `Geen goedkeuringsbeleid geconfigureerd voor documenttype '${params.documentType}'.`,
      422,
    );
  }
  const snapshot = naarSnapshot(regel);

  const nu = new Date();
  const [aanvraag] = await db
    .insert(goedkeuringAanvragenTable)
    .values({
      objectType: params.objectType,
      objectId: params.objectId,
      documentType: params.documentType,
      omschrijving: params.omschrijving ?? null,
      bedrag: params.bedrag,
      werkmaatschappijId: params.werkmaatschappijId,
      status: "ingediend",
      beleidsregelId: regel.id,
      beleidSnapshot: snapshot,
      vereisteGoedkeuringen: regel.aantalGoedkeuringenVereist,
      ontvangenGoedkeuringen: 0,
      ingediendDoorId: params.actor.gebruikerId,
      ingediendOp: nu,
      bijgewerktOp: nu,
    })
    .returning();

  await logTijdlijn(db, {
    objectType: params.objectType,
    objectId: params.objectId,
    vanStatus: "geen_aanvraag",
    naarStatus: "ingediend",
    gebruikerId: params.actor.gebruikerId,
    gebruikerNaam: params.actor.gebruikerNaam,
  });
  logGoedkeuringAudit({
    actor: params.actor,
    actie: "aanvraag_ingediend",
    documentType: params.documentType,
    objectId: params.objectId,
    meta: { aanvraagId: aanvraag!.id, bedrag: params.bedrag, beleidsregelId: regel.id },
  });

  // Stuur direct een notificatie naar de aangewezen goedkeurder.
  // Fouten worden geslikt — de aanvraag is al opgeslagen.
  try {
    let ontvangerGebruikerId: number | null = regel.goedkeurderGebruikerId ?? null;
    if (!ontvangerGebruikerId && regel.vervangerGebruikerId) {
      ontvangerGebruikerId = regel.vervangerGebruikerId;
    }
    // Fallback: stuur naar de hoofdbeheerder als er geen specifieke goedkeurder is
    if (!ontvangerGebruikerId) {
      const [hb] = await db
        .select({ id: gebruikersTable.id })
        .from(gebruikersTable)
        .where(and(eq(gebruikersTable.rol, "hoofdbeheerder"), eq(gebruikersTable.actief, true)))
        .limit(1);
      ontvangerGebruikerId = hb?.id ?? null;
    }
    if (ontvangerGebruikerId) {
      const [ontvanger] = await db
        .select({ naam: gebruikersTable.naam, email: gebruikersTable.email })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, ontvangerGebruikerId));
      if (ontvanger?.email) {
        await stuurGoedkeuringIndienenMail({
          naarEmail: ontvanger.email,
          naarNaam: ontvanger.naam,
          aanvraagId: aanvraag!.id,
          documentType: params.documentType,
          omschrijving: params.omschrijving,
          ingediendDoorNaam: params.actor.gebruikerNaam,
          bedrag: params.bedrag,
        });
      }
    }
  } catch (err) {
    logger.warn({ err, aanvraagId: aanvraag!.id }, "Goedkeuring indiening-notificatie niet verstuurd");
  }

  return { ok: true, aanvraag };
}

async function haalAanvraagOfFout(
  db: Db,
  aanvraagId: number,
): Promise<GoedkeuringAanvraag | GoedkeuringResultaat<never>> {
  const [aanvraag] = await db
    .select()
    .from(goedkeuringAanvragenTable)
    .where(eq(goedkeuringAanvragenTable.id, aanvraagId));
  if (!aanvraag) return fout("NIET_GEVONDEN", "Goedkeuringsaanvraag niet gevonden", 404);
  return aanvraag;
}

export async function goedkeuren(
  db: Db,
  aanvraagId: number,
  actor: GoedkeuringActor,
  reden?: string | null,
): Promise<GoedkeuringResultaat> {
  const aanvraagOfFout = await haalAanvraagOfFout(db, aanvraagId);
  if ("ok" in aanvraagOfFout) return aanvraagOfFout;
  const aanvraag = aanvraagOfFout;

  if (aanvraag.status !== "ingediend") {
    return fout("AL_AFGEHANDELD", `Aanvraag heeft al status '${aanvraag.status}'`, 409);
  }
  const snapshot = (aanvraag.beleidSnapshot as BeleidSnapshot | null) ?? naarSnapshot(null);
  if (!magGoedkeuren(actor, aanvraag, snapshot)) {
    const vierOgen = snapshot.vierOgenVerplicht && aanvraag.ingediendDoorId === actor.gebruikerId;
    return fout(
      vierOgen ? "VIER_OGEN" : "NIET_TOEGESTAAN",
      vierOgen
        ? "Vier-ogen-principe: je kunt je eigen aanvraag niet goedkeuren."
        : "Je bent niet aangewezen als goedkeurder voor deze aanvraag.",
      403,
    );
  }

  const ontvangen = aanvraag.ontvangenGoedkeuringen + 1;
  const compleet = ontvangen >= aanvraag.vereisteGoedkeuringen;
  const nu = new Date();

  await db.insert(goedkeuringStappenTable).values({
    aanvraagId,
    actie: "goedgekeurd",
    gebruikerId: actor.gebruikerId,
    gebruikerNaam: actor.gebruikerNaam,
    reden: reden ?? null,
  });

  const [bijgewerkt] = await db
    .update(goedkeuringAanvragenTable)
    .set({
      ontvangenGoedkeuringen: ontvangen,
      status: compleet ? "goedgekeurd" : "ingediend",
      afgehandeldOp: compleet ? nu : null,
      bijgewerktOp: nu,
    })
    .where(eq(goedkeuringAanvragenTable.id, aanvraagId))
    .returning();

  await logTijdlijn(db, {
    objectType: aanvraag.objectType,
    objectId: aanvraag.objectId,
    vanStatus: "ingediend",
    naarStatus: compleet ? "goedgekeurd" : `ingediend (${ontvangen}/${aanvraag.vereisteGoedkeuringen})`,
    gebruikerId: actor.gebruikerId,
    gebruikerNaam: actor.gebruikerNaam,
    reden,
  });
  logGoedkeuringAudit({
    actor,
    actie: compleet ? "aanvraag_goedgekeurd" : "aanvraag_deels_goedgekeurd",
    documentType: aanvraag.documentType,
    objectId: aanvraag.objectId,
    meta: { aanvraagId, ontvangen, vereist: aanvraag.vereisteGoedkeuringen },
  });

  if (compleet) {
    await pasObjectStatusToe(db, bijgewerkt!, actor);

    // Stuur de indiener een bevestiging dat zijn aanvraag goedgekeurd is.
    // Fouten worden geslikt — de aanvraag is al afgehandeld.
    try {
      if (aanvraag.ingediendDoorId) {
        const [indiener] = await db
          .select({ naam: gebruikersTable.naam, email: gebruikersTable.email })
          .from(gebruikersTable)
          .where(eq(gebruikersTable.id, aanvraag.ingediendDoorId));
        if (indiener?.email) {
          await stuurGoedkeuringGoedgekeurdMail({
            naarEmail: indiener.email,
            naarNaam: indiener.naam,
            aanvraagId,
            documentType: aanvraag.documentType,
            omschrijving: aanvraag.omschrijving,
            goedgekeurdDoorNaam: actor.gebruikerNaam,
            bedrag: aanvraag.bedrag,
          });
        }
      }
    } catch (err) {
      logger.warn({ err, aanvraagId }, "Goedkeuring goedgekeurd-notificatie niet verstuurd");
    }
  }

  return { ok: true, aanvraag: bijgewerkt };
}

export async function afwijzen(
  db: Db,
  aanvraagId: number,
  actor: GoedkeuringActor,
  reden: string,
): Promise<GoedkeuringResultaat> {
  const aanvraagOfFout = await haalAanvraagOfFout(db, aanvraagId);
  if ("ok" in aanvraagOfFout) return aanvraagOfFout;
  const aanvraag = aanvraagOfFout;

  if (aanvraag.status !== "ingediend") {
    return fout("AL_AFGEHANDELD", `Aanvraag heeft al status '${aanvraag.status}'`, 409);
  }
  const snapshot = (aanvraag.beleidSnapshot as BeleidSnapshot | null) ?? naarSnapshot(null);
  if (!magGoedkeuren(actor, aanvraag, snapshot)) {
    const vierOgen = snapshot.vierOgenVerplicht && aanvraag.ingediendDoorId === actor.gebruikerId;
    return fout(
      vierOgen ? "VIER_OGEN" : "NIET_TOEGESTAAN",
      vierOgen
        ? "Vier-ogen-principe: je kunt je eigen aanvraag niet afwijzen."
        : "Je bent niet aangewezen als goedkeurder voor deze aanvraag.",
      403,
    );
  }

  const nu = new Date();
  await db.insert(goedkeuringStappenTable).values({
    aanvraagId,
    actie: "afgewezen",
    gebruikerId: actor.gebruikerId,
    gebruikerNaam: actor.gebruikerNaam,
    reden,
  });

  const [bijgewerkt] = await db
    .update(goedkeuringAanvragenTable)
    .set({ status: "afgewezen", afwijzingReden: reden, afgehandeldOp: nu, bijgewerktOp: nu })
    .where(eq(goedkeuringAanvragenTable.id, aanvraagId))
    .returning();

  await logTijdlijn(db, {
    objectType: aanvraag.objectType,
    objectId: aanvraag.objectId,
    vanStatus: "ingediend",
    naarStatus: "afgewezen",
    gebruikerId: actor.gebruikerId,
    gebruikerNaam: actor.gebruikerNaam,
    reden,
  });
  logGoedkeuringAudit({
    actor,
    actie: "aanvraag_afgewezen",
    documentType: aanvraag.documentType,
    objectId: aanvraag.objectId,
    meta: { aanvraagId, reden },
  });

  // Stuur de indiener een bericht dat zijn aanvraag afgewezen is, inclusief de reden.
  // Fouten worden geslikt — de aanvraag is al afgehandeld.
  try {
    if (aanvraag.ingediendDoorId) {
      const [indiener] = await db
        .select({ naam: gebruikersTable.naam, email: gebruikersTable.email })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, aanvraag.ingediendDoorId));
      if (indiener?.email) {
        await stuurGoedkeuringAfgewezenMail({
          naarEmail: indiener.email,
          naarNaam: indiener.naam,
          aanvraagId,
          documentType: aanvraag.documentType,
          omschrijving: aanvraag.omschrijving,
          afgewezenDoorNaam: actor.gebruikerNaam,
          reden,
          bedrag: aanvraag.bedrag,
        });
      }
    }
  } catch (err) {
    logger.warn({ err, aanvraagId }, "Goedkeuring afgewezen-notificatie niet verstuurd");
  }

  return { ok: true, aanvraag: bijgewerkt };
}

export async function intrekken(
  db: Db,
  aanvraagId: number,
  actor: GoedkeuringActor,
): Promise<GoedkeuringResultaat> {
  const aanvraagOfFout = await haalAanvraagOfFout(db, aanvraagId);
  if ("ok" in aanvraagOfFout) return aanvraagOfFout;
  const aanvraag = aanvraagOfFout;

  if (aanvraag.status !== "ingediend") {
    return fout("ONGELDIGE_STATUS", `Aanvraag met status '${aanvraag.status}' kan niet worden ingetrokken`, 409);
  }
  if (aanvraag.ingediendDoorId !== actor.gebruikerId && !actor.isHoofdbeheerder) {
    return fout("NIET_TOEGESTAAN", "Alleen de indiener of de hoofdbeheerder kan deze aanvraag intrekken.", 403);
  }

  const nu = new Date();
  const [bijgewerkt] = await db
    .update(goedkeuringAanvragenTable)
    .set({ status: "ingetrokken", afgehandeldOp: nu, bijgewerktOp: nu })
    .where(eq(goedkeuringAanvragenTable.id, aanvraagId))
    .returning();

  await logTijdlijn(db, {
    objectType: aanvraag.objectType,
    objectId: aanvraag.objectId,
    vanStatus: "ingediend",
    naarStatus: "ingetrokken",
    gebruikerId: actor.gebruikerId,
    gebruikerNaam: actor.gebruikerNaam,
  });
  logGoedkeuringAudit({
    actor,
    actie: "aanvraag_ingetrokken",
    documentType: aanvraag.documentType,
    objectId: aanvraag.objectId,
    meta: { aanvraagId },
  });

  return { ok: true, aanvraag: bijgewerkt };
}
