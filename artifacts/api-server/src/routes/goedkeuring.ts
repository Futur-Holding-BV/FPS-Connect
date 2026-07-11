import { Router } from "express";
import {
  db,
  goedkeuringBeleidsregelsTable,
  goedkeuringAanvragenTable,
  goedkeuringStappenTable,
  goedkeuringEscalatiesTable,
  gebruikersTable,
  facturenTable,
  insertGoedkeuringBeleidsregelSchema,
  type GoedkeuringBeleidsregel,
  type GoedkeuringAanvraag,
  type GoedkeuringStap,
  type GoedkeuringEscalatie,
} from "@workspace/db";
import { and, eq, desc, inArray, or, sql } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { heeftNiveau } from "@workspace/permissies";
import {
  maakGoedkeuringActor,
  magGoedkeuren,
  goedkeuren,
  afwijzen,
  intrekken,
  dienIn,
  type BeleidSnapshot,
  type GoedkeuringActor,
} from "../services/goedkeuring-engine";

const router = Router();

// ── Serialisatie (snake_case, conform OpenAPI) ──────────────────────────────

function serialiseerBeleidsregel(r: GoedkeuringBeleidsregel) {
  return {
    id: r.id,
    naam: r.naam,
    document_type: r.documentType,
    werkmaatschappij_id: r.werkmaatschappijId,
    ondergrens: r.ondergrens,
    bovengrens: r.bovengrens,
    goedkeurder_gebruiker_id: r.goedkeurderGebruikerId,
    goedkeurder_module: r.goedkeurderModule,
    goedkeurder_min_niveau: r.goedkeurderMinNiveau,
    aantal_goedkeuringen_vereist: r.aantalGoedkeuringenVereist,
    vier_ogen_verplicht: r.vierOgenVerplicht,
    vervanger_gebruiker_id: r.vervangerGebruikerId,
    reactietermijn_uren: r.reactietermijnUren,
    herinnering_uren: r.herinneringUren,
    escalatie_stap_1_uren: r.escalatieStap1Uren,
    escalatie_stap_1_gebruiker_id: r.escalatieStap1GebruikerId,
    escalatie_stap_2_uren: r.escalatieStap2Uren,
    escalatie_stap_2_gebruiker_id: r.escalatieStap2GebruikerId,
    max_doorlooptijd_uren: r.maxDoorlooptijdUren,
    actief: r.actief,
    aangemaakt_door_id: r.aangemaaktDoorId,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
  };
}

function serialiseerEscalatie(e: GoedkeuringEscalatie) {
  return {
    id: e.id,
    aanvraag_id: e.aanvraagId,
    type: e.type,
    naar_gebruiker_id: e.naarGebruikerId,
    naar_gebruiker_naam: e.naarGebruikerNaam,
    bericht: e.bericht,
    aangemaakt_op: e.aangemaaktOp.toISOString(),
  };
}

function serialiseerStap(s: GoedkeuringStap) {
  return {
    id: s.id,
    aanvraag_id: s.aanvraagId,
    actie: s.actie,
    gebruiker_id: s.gebruikerId,
    gebruiker_naam: s.gebruikerNaam,
    reden: s.reden,
    aangemaakt_op: s.aangemaaktOp.toISOString(),
  };
}

function serialiseerAanvraag(
  a: GoedkeuringAanvraag,
  opts: {
    actor?: GoedkeuringActor | null;
    stappen?: GoedkeuringStap[];
    ingediendDoorNaam?: string | null;
  } = {},
) {
  const snapshot = (a.beleidSnapshot as BeleidSnapshot | null) ?? null;
  const magGoedkeurenWaarde =
    Boolean(opts.actor) && a.status === "ingediend" && snapshot != null
      ? magGoedkeuren(opts.actor as GoedkeuringActor, a, snapshot)
      : false;
  return {
    id: a.id,
    object_type: a.objectType,
    object_id: a.objectId,
    document_type: a.documentType,
    omschrijving: a.omschrijving,
    bedrag: a.bedrag,
    werkmaatschappij_id: a.werkmaatschappijId,
    status: a.status,
    beleidsregel_id: a.beleidsregelId,
    beleid_snapshot: a.beleidSnapshot,
    vereiste_goedkeuringen: a.vereisteGoedkeuringen,
    ontvangen_goedkeuringen: a.ontvangenGoedkeuringen,
    ingediend_door_id: a.ingediendDoorId,
    ingediend_door_naam: opts.ingediendDoorNaam ?? null,
    ingediend_op: a.ingediendOp ? a.ingediendOp.toISOString() : null,
    afgehandeld_op: a.afgehandeldOp ? a.afgehandeldOp.toISOString() : null,
    afwijzing_reden: a.afwijzingReden,
    vervangen_door_id: a.vervangenDoorId,
    mag_goedkeuren: magGoedkeurenWaarde,
    stappen: (opts.stappen ?? []).map(serialiseerStap),
    aangemaakt_op: a.aangemaaktOp.toISOString(),
    bijgewerkt_op: a.bijgewerktOp.toISOString(),
  };
}

// Verrijkt een lijst aanvragen met ingediend_door_naam in één query, zodat de
// lijstweergave (zonder stappen) geen N+1 oplevert.
async function verrijkMetIndienerNaam(
  aanvragen: GoedkeuringAanvraag[],
): Promise<Map<number, string | null>> {
  const ids = [...new Set(aanvragen.map((a) => a.ingediendDoorId).filter((id): id is number => id != null))];
  if (ids.length === 0) return new Map();
  const gebruikers = await db
    .select({ id: gebruikersTable.id, naam: gebruikersTable.naam })
    .from(gebruikersTable)
    .where(inArray(gebruikersTable.id, ids));
  return new Map(gebruikers.map((g) => [g.id, g.naam]));
}

// ── Beleidsregels (beleidsbeheer, niveau 4) ─────────────────────────────────

router.get(
  "/goedkeuring/beleidsregels",
  requireBevoegdheid("goedkeuring", 4),
  async (req, res): Promise<void> => {
    try {
      const documentType = typeof req.query.document_type === "string" ? req.query.document_type : undefined;
      const where = documentType ? [eq(goedkeuringBeleidsregelsTable.documentType, documentType)] : [];
      const regels = await db
        .select()
        .from(goedkeuringBeleidsregelsTable)
        .where(and(...(where.length ? where : [sql`true`])))
        .orderBy(desc(goedkeuringBeleidsregelsTable.aangemaaktOp));
      res.json(regels.map(serialiseerBeleidsregel));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

router.post(
  "/goedkeuring/beleidsregels",
  requireBevoegdheid("goedkeuring", 4),
  async (req, res): Promise<void> => {
    try {
      const parsed = insertGoedkeuringBeleidsregelSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Ongeldige invoer" });
        return;
      }
      const gebruikerId = req.session?.userId ?? null;
      const nu = new Date();
      const [regel] = await db
        .insert(goedkeuringBeleidsregelsTable)
        .values({ ...parsed.data, aangemaaktDoorId: gebruikerId, aangemaaktOp: nu, bijgewerktOp: nu })
        .returning();
      res.status(201).json(serialiseerBeleidsregel(regel!));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

router.patch(
  "/goedkeuring/beleidsregels/:id",
  requireBevoegdheid("goedkeuring", 4),
  async (req, res): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: "Ongeldig id" });
        return;
      }
      const [bestaand] = await db
        .select({ id: goedkeuringBeleidsregelsTable.id })
        .from(goedkeuringBeleidsregelsTable)
        .where(eq(goedkeuringBeleidsregelsTable.id, id));
      if (!bestaand) {
        res.status(404).json({ error: "Beleidsregel niet gevonden" });
        return;
      }
      const parsed = insertGoedkeuringBeleidsregelSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Ongeldige invoer" });
        return;
      }
      const [regel] = await db
        .update(goedkeuringBeleidsregelsTable)
        .set({ ...parsed.data, bijgewerktOp: new Date() })
        .where(eq(goedkeuringBeleidsregelsTable.id, id))
        .returning();
      res.json(serialiseerBeleidsregel(regel!));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

router.delete(
  "/goedkeuring/beleidsregels/:id",
  requireBevoegdheid("goedkeuring", 4),
  async (req, res): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: "Ongeldig id" });
        return;
      }
      const [bestaand] = await db
        .select({ id: goedkeuringBeleidsregelsTable.id })
        .from(goedkeuringBeleidsregelsTable)
        .where(eq(goedkeuringBeleidsregelsTable.id, id));
      if (!bestaand) {
        res.status(404).json({ error: "Beleidsregel niet gevonden" });
        return;
      }
      await db.delete(goedkeuringBeleidsregelsTable).where(eq(goedkeuringBeleidsregelsTable.id, id));
      res.status(204).end();
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// ── Dashboard (niveau 1, open + verlopen + afgewezen + escalatiestatus) ─────

router.get(
  "/goedkeuring/dashboard",
  requireBevoegdheid("goedkeuring", 1),
  async (req, res): Promise<void> => {
    try {
      const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;
      const documentTypeFilter = typeof req.query.document_type === "string" ? req.query.document_type : undefined;
      const alleenVerlopen = req.query.alleen_verlopen === "true";

      const whereCondities = [];
      if (statusFilter) {
        whereCondities.push(eq(goedkeuringAanvragenTable.status, statusFilter));
      } else {
        // Standaard: alle ingediende aanvragen + recent (7d) afgehandelde
        whereCondities.push(
          or(
            eq(goedkeuringAanvragenTable.status, "ingediend"),
            and(
              sql`${goedkeuringAanvragenTable.status} IN ('goedgekeurd', 'afgewezen')`,
              sql`${goedkeuringAanvragenTable.afgehandeldOp} > now() - interval '7 days'`,
            ),
          ),
        );
      }
      if (documentTypeFilter) {
        whereCondities.push(eq(goedkeuringAanvragenTable.documentType, documentTypeFilter));
      }

      const aanvragen = await db
        .select({
          aanvraag: goedkeuringAanvragenTable,
          beleid: {
            reactietermijnUren: goedkeuringBeleidsregelsTable.reactietermijnUren,
          },
        })
        .from(goedkeuringAanvragenTable)
        .leftJoin(
          goedkeuringBeleidsregelsTable,
          eq(goedkeuringAanvragenTable.beleidsregelId, goedkeuringBeleidsregelsTable.id),
        )
        .where(and(...(whereCondities.length ? whereCondities : [sql`true`])))
        .orderBy(desc(goedkeuringAanvragenTable.ingediendOp));

      // Verrijken met ingediend_door_naam in één query
      const indienerIds = [
        ...new Set(
          aanvragen
            .map((r) => r.aanvraag.ingediendDoorId)
            .filter((id): id is number => id != null),
        ),
      ];
      const indienerMap = indienerIds.length > 0
        ? new Map(
            (await db
              .select({ id: gebruikersTable.id, naam: gebruikersTable.naam })
              .from(gebruikersTable)
              .where(inArray(gebruikersTable.id, indienerIds)))
              .map((g) => [g.id, g.naam]),
          )
        : new Map<number, string | null>();

      // Verrijken met escalaties in één query
      const aanvraagIds = aanvragen.map((r) => r.aanvraag.id);
      const escalatieMap = new Map<number, GoedkeuringEscalatie[]>();
      if (aanvraagIds.length > 0) {
        const escalaties = await db
          .select()
          .from(goedkeuringEscalatiesTable)
          .where(inArray(goedkeuringEscalatiesTable.aanvraagId, aanvraagIds))
          .orderBy(goedkeuringEscalatiesTable.aangemaaktOp);
        for (const e of escalaties) {
          if (!escalatieMap.has(e.aanvraagId)) escalatieMap.set(e.aanvraagId, []);
          escalatieMap.get(e.aanvraagId)!.push(e);
        }
      }

      // Actor (voor mag_goedkeuren vlag)
      const actor = await maakGoedkeuringActor(req, db);

      const nu = Date.now();
      const resultaat = aanvragen
        .map(({ aanvraag, beleid }) => {
          const reactietermijnUren = beleid?.reactietermijnUren ?? null;
          const deadlineOp =
            aanvraag.ingediendOp && reactietermijnUren
              ? new Date(aanvraag.ingediendOp.getTime() + reactietermijnUren * 3_600_000)
              : null;
          const isVerlopen =
            aanvraag.status === "ingediend" &&
            deadlineOp != null &&
            nu > deadlineOp.getTime();

          const snapshot = (aanvraag.beleidSnapshot as BeleidSnapshot | null) ?? null;
          const magGoedkeurenWaarde =
            Boolean(actor) && aanvraag.status === "ingediend" && snapshot != null
              ? magGoedkeuren(actor as GoedkeuringActor, aanvraag, snapshot)
              : false;

          return {
            id: aanvraag.id,
            object_type: aanvraag.objectType,
            object_id: aanvraag.objectId,
            document_type: aanvraag.documentType,
            omschrijving: aanvraag.omschrijving,
            bedrag: aanvraag.bedrag,
            status: aanvraag.status,
            vereiste_goedkeuringen: aanvraag.vereisteGoedkeuringen,
            ontvangen_goedkeuringen: aanvraag.ontvangenGoedkeuringen,
            ingediend_door_naam: indienerMap.get(aanvraag.ingediendDoorId ?? -1) ?? null,
            ingediend_op: aanvraag.ingediendOp?.toISOString() ?? null,
            afgehandeld_op: aanvraag.afgehandeldOp?.toISOString() ?? null,
            afwijzing_reden: aanvraag.afwijzingReden,
            mag_goedkeuren: magGoedkeurenWaarde,
            reactietermijn_uren: reactietermijnUren,
            deadline_op: deadlineOp?.toISOString() ?? null,
            is_verlopen: isVerlopen,
            escalaties: (escalatieMap.get(aanvraag.id) ?? []).map(serialiseerEscalatie),
            aangemaakt_op: aanvraag.aangemaaktOp.toISOString(),
            bijgewerkt_op: aanvraag.bijgewerktOp.toISOString(),
          };
        })
        .filter((item) => !alleenVerlopen || item.is_verlopen);

      res.json(resultaat);
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// ── Aanvragen (lezen: niveau 1, acties: niveau 3) ───────────────────────────

router.get(
  "/goedkeuring/aanvragen",
  requireBevoegdheid("goedkeuring", 1),
  async (req, res): Promise<void> => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const objectType = typeof req.query.object_type === "string" ? req.query.object_type : undefined;
      const alleenMijnActies = req.query.alleen_mijn_acties === "true";

      const where = [];
      if (status) where.push(eq(goedkeuringAanvragenTable.status, status));
      if (objectType) where.push(eq(goedkeuringAanvragenTable.objectType, objectType));

      const aanvragen = await db
        .select()
        .from(goedkeuringAanvragenTable)
        .where(and(...(where.length ? where : [sql`true`])))
        .orderBy(desc(goedkeuringAanvragenTable.aangemaaktOp));

      const actor = await maakGoedkeuringActor(req, db);
      const namenPerId = await verrijkMetIndienerNaam(aanvragen);

      let result = aanvragen.map((a) =>
        serialiseerAanvraag(a, {
          actor,
          ingediendDoorNaam: a.ingediendDoorId != null ? namenPerId.get(a.ingediendDoorId) ?? null : null,
        }),
      );
      if (alleenMijnActies) {
        result = result.filter((a) => a.mag_goedkeuren);
      }
      res.json(result);
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

router.post(
  "/goedkeuring/aanvragen",
  requireBevoegdheid("goedkeuring", 1),
  async (req, res): Promise<void> => {
    try {
      const body = req.body as Record<string, unknown>;
      const objectType = typeof body.object_type === "string" ? body.object_type.trim() : "";
      const objectId = Number(body.object_id);
      const documentType = typeof body.document_type === "string" ? body.document_type.trim() : "";
      if (!objectType || !Number.isInteger(objectId) || !documentType) {
        res.status(400).json({ error: "object_type, object_id en document_type zijn verplicht" });
        return;
      }
      const actor = await maakGoedkeuringActor(req, db);
      if (!actor) {
        res.status(401).json({ error: "Niet ingelogd" });
        return;
      }
      const bedragRuw = body.bedrag;
      const bedrag =
        typeof bedragRuw === "number"
          ? bedragRuw
          : typeof bedragRuw === "string" && bedragRuw.trim() !== "" && Number.isFinite(Number(bedragRuw))
            ? Number(bedragRuw)
            : null;
      const werkmaatschappijRuw = body.werkmaatschappij_id;
      const werkmaatschappijId =
        typeof werkmaatschappijRuw === "number"
          ? werkmaatschappijRuw
          : typeof werkmaatschappijRuw === "string" && Number.isInteger(Number(werkmaatschappijRuw))
            ? Number(werkmaatschappijRuw)
            : null;
      const omschrijving = typeof body.omschrijving === "string" ? body.omschrijving : null;

      // Object-level autorisatie voor financiële types:
      // (a) De indiener moet minimaal financieel:1 hebben — dezelfde drempel
      //     als de factuur-detail/mutatieroutes — niet alleen goedkeuring:1.
      // (b) Het object moet bestaan in de facturentabel.
      // (c) Zowel objectType als documentType worden server-side afgeleid uit
      //     factuur.type + factuur.subtype — client-input wordt genegeerd.
      //     Dit voorkomt dat een indiener een zwakker beleid kan activeren door
      //     een ander document_type mee te sturen dan het werkelijke factuurtype.
      const FINANCIELE_TYPES = new Set(["inkoop_factuur", "verkoop_factuur", "creditnota", "prijsafwijking"]);
      let effectiefDocumentType = documentType;
      if (FINANCIELE_TYPES.has(objectType)) {
        // (a) Bevoegdheidscheck financieel:1
        const userId = req.session?.userId as number | undefined;
        if (!userId) { res.status(401).json({ error: "Niet ingelogd" }); return; }
        const [gebruiker] = await db
          .select({ rol: gebruikersTable.rol, bevoegdheden: gebruikersTable.bevoegdheden })
          .from(gebruikersTable)
          .where(eq(gebruikersTable.id, userId))
          .limit(1);
        if (!gebruiker) { res.status(403).json({ error: "Geen toegang" }); return; }
        const isHoofdbeheerder = gebruiker.rol === "hoofdbeheerder";
        const bev = (gebruiker.bevoegdheden as Record<string, number> | null) ?? {};
        if (!isHoofdbeheerder && !heeftNiveau(bev, "financieel", 1)) {
          res.status(403).json({ error: "Financieel module-toegang vereist voor dit type goedkeuringsaanvraag" });
          return;
        }
        // (b) Object-bestaan
        const [factuur] = await db
          .select({ id: facturenTable.id, type: facturenTable.type, subtype: facturenTable.subtype })
          .from(facturenTable)
          .where(eq(facturenTable.id, objectId))
          .limit(1);
        if (!factuur) { res.status(404).json({ error: "Factuur niet gevonden" }); return; }
        // (c) ObjectType-consistentie: client-opgegeven objectType moet matchen
        const afgeleidType = factuur.subtype === "creditnota" ? "creditnota"
          : factuur.subtype === "prijsafwijking" ? "prijsafwijking"
          : factuur.type === "verkoop" ? "verkoop_factuur" : "inkoop_factuur";
        if (objectType !== afgeleidType) {
          res.status(422).json({
            error: `ObjectType '${objectType}' komt niet overeen met het werkelijke factuurtype '${afgeleidType}'`,
          });
          return;
        }
        // (c) documentType server-side overschrijven — client-input wordt genegeerd
        // zodat een aanvaller niet via document_type een zwakker beleid kan activeren.
        effectiefDocumentType = afgeleidType;
      }

      const resultaat = await dienIn(db, {
        objectType,
        objectId,
        documentType: effectiefDocumentType,
        omschrijving,
        bedrag,
        werkmaatschappijId,
        actor,
      });
      if (!resultaat.ok) {
        res.status(resultaat.error!.httpStatus).json({ error: resultaat.error!.bericht });
        return;
      }
      res.status(201).json(serialiseerAanvraag(resultaat.aanvraag!, { actor }));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

router.get(
  "/goedkeuring/aanvragen/:id",
  requireBevoegdheid("goedkeuring", 1),
  async (req, res): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: "Ongeldig id" });
        return;
      }
      const [aanvraag] = await db
        .select()
        .from(goedkeuringAanvragenTable)
        .where(eq(goedkeuringAanvragenTable.id, id));
      if (!aanvraag) {
        res.status(404).json({ error: "Aanvraag niet gevonden" });
        return;
      }
      const [stappen, actor] = await Promise.all([
        db
          .select()
          .from(goedkeuringStappenTable)
          .where(eq(goedkeuringStappenTable.aanvraagId, id))
          .orderBy(desc(goedkeuringStappenTable.aangemaaktOp)),
        maakGoedkeuringActor(req, db),
      ]);
      let ingediendDoorNaam: string | null = null;
      if (aanvraag.ingediendDoorId != null) {
        const [indiener] = await db
          .select({ naam: gebruikersTable.naam })
          .from(gebruikersTable)
          .where(eq(gebruikersTable.id, aanvraag.ingediendDoorId));
        ingediendDoorNaam = indiener?.naam ?? null;
      }
      res.json(serialiseerAanvraag(aanvraag, { actor, stappen, ingediendDoorNaam }));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

router.get(
  "/goedkeuring/object/:object_type/:object_id",
  requireBevoegdheid("goedkeuring", 1),
  async (req, res): Promise<void> => {
    try {
      const objectType = String(req.params.object_type);
      const objectId = Number(req.params.object_id);
      if (!Number.isInteger(objectId)) {
        res.status(400).json({ error: "Ongeldig object_id" });
        return;
      }
      const [aanvraag] = await db
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
      if (!aanvraag) {
        res.json(null);
        return;
      }
      const [stappen, actor] = await Promise.all([
        db
          .select()
          .from(goedkeuringStappenTable)
          .where(eq(goedkeuringStappenTable.aanvraagId, aanvraag.id))
          .orderBy(desc(goedkeuringStappenTable.aangemaaktOp)),
        maakGoedkeuringActor(req, db),
      ]);
      let ingediendDoorNaam: string | null = null;
      if (aanvraag.ingediendDoorId != null) {
        const [indiener] = await db
          .select({ naam: gebruikersTable.naam })
          .from(gebruikersTable)
          .where(eq(gebruikersTable.id, aanvraag.ingediendDoorId));
        ingediendDoorNaam = indiener?.naam ?? null;
      }
      res.json(serialiseerAanvraag(aanvraag, { actor, stappen, ingediendDoorNaam }));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

router.post(
  "/goedkeuring/aanvragen/:id/goedkeuren",
  requireBevoegdheid("goedkeuring", 3),
  async (req, res): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: "Ongeldig id" });
        return;
      }
      const actor = await maakGoedkeuringActor(req, db);
      if (!actor) {
        res.status(401).json({ error: "Niet ingelogd" });
        return;
      }
      const reden = typeof req.body?.reden === "string" ? req.body.reden : null;
      const resultaat = await goedkeuren(db, id, actor, reden);
      if (!resultaat.ok) {
        res.status(resultaat.error!.httpStatus).json({ error: resultaat.error!.bericht });
        return;
      }
      res.json(serialiseerAanvraag(resultaat.aanvraag!, { actor }));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

router.post(
  "/goedkeuring/aanvragen/:id/afwijzen",
  requireBevoegdheid("goedkeuring", 3),
  async (req, res): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: "Ongeldig id" });
        return;
      }
      const reden = typeof req.body?.reden === "string" ? req.body.reden.trim() : "";
      if (!reden) {
        res.status(400).json({ error: "Reden is verplicht bij afwijzen" });
        return;
      }
      const actor = await maakGoedkeuringActor(req, db);
      if (!actor) {
        res.status(401).json({ error: "Niet ingelogd" });
        return;
      }
      const resultaat = await afwijzen(db, id, actor, reden);
      if (!resultaat.ok) {
        res.status(resultaat.error!.httpStatus).json({ error: resultaat.error!.bericht });
        return;
      }
      res.json(serialiseerAanvraag(resultaat.aanvraag!, { actor }));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

router.post(
  "/goedkeuring/aanvragen/:id/intrekken",
  requireBevoegdheid("goedkeuring", 1),
  async (req, res): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: "Ongeldig id" });
        return;
      }
      const actor = await maakGoedkeuringActor(req, db);
      if (!actor) {
        res.status(401).json({ error: "Niet ingelogd" });
        return;
      }
      const resultaat = await intrekken(db, id, actor);
      if (!resultaat.ok) {
        res.status(resultaat.error!.httpStatus).json({ error: resultaat.error!.bericht });
        return;
      }
      res.json(serialiseerAanvraag(resultaat.aanvraag!, { actor }));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

export default router;
