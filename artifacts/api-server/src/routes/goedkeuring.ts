import { Router } from "express";
import {
  db,
  goedkeuringBeleidsregelsTable,
  goedkeuringAanvragenTable,
  goedkeuringStappenTable,
  goedkeuringEscalatiesTable,
  gebruikersTable,
  facturenTable,
  inspectiesTable,
  opleverrapportenTable,
  arbeidsovereenkomstenTable,
  weekStatenTable,
  projectenTable,
  dossiersTable,
  medewerkerOpleidingenTable,
  insertGoedkeuringBeleidsregelSchema,
  type GoedkeuringBeleidsregel,
  type GoedkeuringAanvraag,
  type GoedkeuringStap,
  type GoedkeuringEscalatie,
} from "@workspace/db";
import { and, eq, desc, inArray, or, sql } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { heeftNiveau } from "@workspace/permissies";
import { logAudit } from "../lib/audit";
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
import { verwerkOpenAanvragen } from "../lib/goedkeuringBewaking";

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
      const gebruikerNaam = (req.session as unknown as Record<string, unknown>)?.naam as string | null ?? null;
      const nu = new Date();
      const [regel] = await db
        .insert(goedkeuringBeleidsregelsTable)
        .values({ ...parsed.data, aangemaaktDoorId: gebruikerId, aangemaaktOp: nu, bijgewerktOp: nu })
        .returning();
      logAudit({
        gebruikerId,
        gebruikerNaam,
        module: "goedkeuring",
        actie: "aanmaken",
        entiteit: "beleidsregel",
        entiteitId: regel!.id,
        entiteitNaam: regel!.naam,
        nieuweWaarde: serialiseerBeleidsregel(regel!) as unknown as Record<string, unknown>,
      });
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
      const [oudeRegel] = await db
        .select()
        .from(goedkeuringBeleidsregelsTable)
        .where(eq(goedkeuringBeleidsregelsTable.id, id));
      if (!oudeRegel) {
        res.status(404).json({ error: "Beleidsregel niet gevonden" });
        return;
      }
      const parsed = insertGoedkeuringBeleidsregelSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Ongeldige invoer" });
        return;
      }
      const gebruikerId = req.session?.userId ?? null;
      const gebruikerNaam = (req.session as unknown as Record<string, unknown>)?.naam as string | null ?? null;
      const [regel] = await db
        .update(goedkeuringBeleidsregelsTable)
        .set({ ...parsed.data, bijgewerktOp: new Date() })
        .where(eq(goedkeuringBeleidsregelsTable.id, id))
        .returning();
      logAudit({
        gebruikerId,
        gebruikerNaam,
        module: "goedkeuring",
        actie: "wijzigen",
        entiteit: "beleidsregel",
        entiteitId: id,
        entiteitNaam: regel!.naam,
        oudeWaarde: serialiseerBeleidsregel(oudeRegel) as unknown as Record<string, unknown>,
        nieuweWaarde: serialiseerBeleidsregel(regel!) as unknown as Record<string, unknown>,
      });
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
      const [oudeRegel] = await db
        .select()
        .from(goedkeuringBeleidsregelsTable)
        .where(eq(goedkeuringBeleidsregelsTable.id, id));
      if (!oudeRegel) {
        res.status(404).json({ error: "Beleidsregel niet gevonden" });
        return;
      }
      const gebruikerId = req.session?.userId ?? null;
      const gebruikerNaam = (req.session as unknown as Record<string, unknown>)?.naam as string | null ?? null;
      await db.delete(goedkeuringBeleidsregelsTable).where(eq(goedkeuringBeleidsregelsTable.id, id));
      logAudit({
        gebruikerId,
        gebruikerNaam,
        module: "goedkeuring",
        actie: "verwijderen",
        entiteit: "beleidsregel",
        entiteitId: id,
        entiteitNaam: oudeRegel.naam,
        oudeWaarde: serialiseerBeleidsregel(oudeRegel) as unknown as Record<string, unknown>,
      });
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
      const vensterRaw = typeof req.query.venster === "string" ? parseInt(req.query.venster, 10) : NaN;
      const vensterDagen = Number.isFinite(vensterRaw) && vensterRaw >= 0 ? vensterRaw : 7;
      const alleenMijnActies = req.query.alleen_mijn_acties === "true";

      const whereCondities = [];
      if (statusFilter) {
        whereCondities.push(eq(goedkeuringAanvragenTable.status, statusFilter));
      } else {
        // Standaard: alle ingediende aanvragen + afgehandelde binnen het venster.
        // vensterDagen=0 betekent geen datumbeperking (toon alles).
        const afgehandeldConditie =
          vensterDagen === 0
            ? sql`${goedkeuringAanvragenTable.status} IN ('goedgekeurd', 'afgewezen')`
            : and(
                sql`${goedkeuringAanvragenTable.status} IN ('goedgekeurd', 'afgewezen')`,
                sql`${goedkeuringAanvragenTable.afgehandeldOp} > now() - (${vensterDagen} || ' days')::interval`,
              );
        whereCondities.push(
          or(
            eq(goedkeuringAanvragenTable.status, "ingediend"),
            afgehandeldConditie,
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

      // Verrijken met afhandelaar (laatste goedgekeurd/afgewezen stap) in één query
      const aanvraagIds = aanvragen.map((r) => r.aanvraag.id);
      const afhandelaarMap = new Map<number, string | null>();
      if (aanvraagIds.length > 0) {
        const afhandelStappen = await db
          .select({
            aanvraagId: goedkeuringStappenTable.aanvraagId,
            gebruikerNaam: goedkeuringStappenTable.gebruikerNaam,
          })
          .from(goedkeuringStappenTable)
          .where(
            and(
              inArray(goedkeuringStappenTable.aanvraagId, aanvraagIds),
              sql`${goedkeuringStappenTable.actie} IN ('goedgekeurd', 'afgewezen')`,
            ),
          )
          .orderBy(desc(goedkeuringStappenTable.aangemaaktOp), desc(goedkeuringStappenTable.id));
        // Eerste treffer per aanvraag is de meest recente afhandelstap
        for (const stap of afhandelStappen) {
          if (!afhandelaarMap.has(stap.aanvraagId)) {
            afhandelaarMap.set(stap.aanvraagId, stap.gebruikerNaam ?? null);
          }
        }
      }

      // Verrijken met escalaties in één query
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
            afgehandeld_door_naam: afhandelaarMap.get(aanvraag.id) ?? null,
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
        .filter((item) => !alleenVerlopen || item.is_verlopen)
        .filter((item) => !alleenMijnActies || item.mag_goedkeuren);

      res.json(resultaat);
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// ── CSV-export dashboard ────────────────────────────────────────────────────

router.get(
  "/goedkeuring/dashboard/export.csv",
  requireBevoegdheid("goedkeuring", 1),
  async (req, res): Promise<void> => {
    try {
      const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;
      const documentTypeFilter = typeof req.query.document_type === "string" ? req.query.document_type : undefined;
      const alleenVerlopen = req.query.alleen_verlopen === "true";
      const vensterRaw = typeof req.query.venster === "string" ? parseInt(req.query.venster, 10) : NaN;
      // Bij export: standaard 0 (volledig archief) tenzij expliciet opgegeven
      const vensterDagen = Number.isFinite(vensterRaw) && vensterRaw >= 0 ? vensterRaw : 0;
      const alleenMijnActies = req.query.alleen_mijn_acties === "true";

      const whereCondities = [];
      if (statusFilter) {
        whereCondities.push(eq(goedkeuringAanvragenTable.status, statusFilter));
      } else {
        const afgehandeldConditie =
          vensterDagen === 0
            ? sql`${goedkeuringAanvragenTable.status} IN ('goedgekeurd', 'afgewezen')`
            : and(
                sql`${goedkeuringAanvragenTable.status} IN ('goedgekeurd', 'afgewezen')`,
                sql`${goedkeuringAanvragenTable.afgehandeldOp} > now() - (${vensterDagen} || ' days')::interval`,
              );
        whereCondities.push(
          or(
            eq(goedkeuringAanvragenTable.status, "ingediend"),
            afgehandeldConditie,
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

      // Verrijken met afhandelaar (laatste goedgekeurd/afgewezen stap) in één query
      const csvAanvraagIds = aanvragen.map((r) => r.aanvraag.id);
      const csvAfhandelaarMap = new Map<number, string | null>();
      if (csvAanvraagIds.length > 0) {
        const afhandelStappen = await db
          .select({
            aanvraagId: goedkeuringStappenTable.aanvraagId,
            gebruikerNaam: goedkeuringStappenTable.gebruikerNaam,
          })
          .from(goedkeuringStappenTable)
          .where(
            and(
              inArray(goedkeuringStappenTable.aanvraagId, csvAanvraagIds),
              sql`${goedkeuringStappenTable.actie} IN ('goedgekeurd', 'afgewezen')`,
            ),
          )
          .orderBy(desc(goedkeuringStappenTable.aangemaaktOp), desc(goedkeuringStappenTable.id));
        for (const stap of afhandelStappen) {
          if (!csvAfhandelaarMap.has(stap.aanvraagId)) {
            csvAfhandelaarMap.set(stap.aanvraagId, stap.gebruikerNaam ?? null);
          }
        }
      }

      const actor = await maakGoedkeuringActor(req, db);

      const nu = Date.now();
      const STATUS_LABELS: Record<string, string> = {
        concept: "Concept",
        ingediend: "Ingediend",
        goedgekeurd: "Goedgekeurd",
        afgewezen: "Afgewezen",
        ingetrokken: "Ingetrokken",
        vervangen: "Vervangen",
      };

      const escapeCell = (val: string | number | null | undefined): string => {
        if (val == null) return "";
        let s = String(val);
        if (s.length > 0 && "=+-@\t\r".includes(s[0]!)) {
          s = `'${s}`;
        }
        if (s.includes(",") || s.includes('"') || s.includes("\n")) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };

      const header = ["#", "Documenttype", "Omschrijving", "Bedrag", "Ingediend door", "Ingediend op", "Afgehandeld op", "Afgehandeld door", "Status", "Reden afwijzing"].join(",");

      const rijen = aanvragen
        .map(({ aanvraag, beleid }) => {
          const reactietermijnUren = beleid?.reactietermijnUren ?? null;
          const deadlineOp =
            aanvraag.ingediendOp && reactietermijnUren
              ? new Date(aanvraag.ingediendOp.getTime() + reactietermijnUren * 3_600_000)
              : null;
          const isVerlopen =
            aanvraag.status === "ingediend" && deadlineOp != null && nu > deadlineOp.getTime();

          const snapshot = (aanvraag.beleidSnapshot as BeleidSnapshot | null) ?? null;
          const magGoedkeurenWaarde =
            Boolean(actor) && aanvraag.status === "ingediend" && snapshot != null
              ? magGoedkeuren(actor as GoedkeuringActor, aanvraag, snapshot)
              : false;

          return { aanvraag, isVerlopen, magGoedkeurenWaarde };
        })
        .filter(({ isVerlopen }) => !alleenVerlopen || isVerlopen)
        .filter(({ magGoedkeurenWaarde }) => !alleenMijnActies || magGoedkeurenWaarde)
        .map(({ aanvraag }) => {
          const ingediendDatum = aanvraag.ingediendOp
            ? aanvraag.ingediendOp.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" })
            : null;
          const afgehandeldDatum = aanvraag.afgehandeldOp
            ? aanvraag.afgehandeldOp.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" })
            : null;
          const bedrag = aanvraag.bedrag != null
            ? aanvraag.bedrag.toFixed(2).replace(".", ",")
            : null;
          return [
            escapeCell(aanvraag.id),
            escapeCell(aanvraag.documentType),
            escapeCell(aanvraag.omschrijving),
            escapeCell(bedrag),
            escapeCell(indienerMap.get(aanvraag.ingediendDoorId ?? -1) ?? null),
            escapeCell(ingediendDatum),
            escapeCell(afgehandeldDatum),
            escapeCell(csvAfhandelaarMap.get(aanvraag.id) ?? null),
            escapeCell(STATUS_LABELS[aanvraag.status] ?? aanvraag.status),
            escapeCell(aanvraag.afwijzingReden),
          ].join(",");
        });

      const datumStempel = new Date().toISOString().slice(0, 10);
      const bestandsnaam = `goedkeuringen-${datumStempel}.csv`;

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${bestandsnaam}"`);
      // BOM zodat Excel UTF-8 herkent
      res.send("\uFEFF" + [header, ...rijen].join("\r\n"));
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
        // (a) Bevoegdheidscheck financieel:1 — via centrale PermissieService
        if (!req.permissies!.isHoofdbeheerder && !req.permissies!.heeftModuleRecht("financieel", 1)) {
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

      // Object-level autorisatie voor algemene inkoop (NP_INKOOP_01):
      // zelfde toegangspredicaat als de algemene-inkooproutes (financieel:2 óf
      // offertes:1), en bedrag + documentType worden server-side uit het record
      // afgeleid — client-input wordt genegeerd zodat niemand met een verzonnen
      // (lager) bedrag een zwakker beleid kan activeren.
      let effectiefBedrag = bedrag;
      if (objectType === "algemene_inkoop") {
        const p = req.permissies!;
        if (!p.isHoofdbeheerder && !p.heeftModuleRecht("financieel", 2) && !p.heeftModuleRecht("offertes", 1)) {
          res.status(403).json({ error: "Toegang tot algemene inkoop vereist voor dit type goedkeuringsaanvraag" });
          return;
        }
        const { algemeneInkopenTable } = await import("@workspace/db");
        const [inkoop] = await db.select().from(algemeneInkopenTable)
          .where(eq(algemeneInkopenTable.id, objectId)).limit(1);
        if (!inkoop) { res.status(404).json({ error: "Algemene inkoop niet gevonden" }); return; }
        effectiefDocumentType = "algemene_inkoop";
        effectiefBedrag = (inkoop.soort === "direct_betaald" ? inkoop.bedrag : inkoop.verwachtBedrag) ?? null;
      }

      // Object-bestaan validatie voor niet-financiële types:
      // Controleer dat het objectId daadwerkelijk bestaat in de juiste tabel
      // voordat een aanvraag wordt aangemaakt. Vereist geen extra bevoegdheden
      // bovenop goedkeuring:1 — de module-toegang regelt de zichtbaarheid van
      // het onderliggende document.
      const NIET_FINANCIELE_OBJECT_CHECKS: Record<string, () => Promise<boolean>> = {
        inspectie: async () => {
          const [r] = await db.select({ id: inspectiesTable.id }).from(inspectiesTable)
            .where(eq(inspectiesTable.id, objectId)).limit(1);
          return Boolean(r);
        },
        opleverrapport: async () => {
          const [r] = await db.select({ id: opleverrapportenTable.id }).from(opleverrapportenTable)
            .where(eq(opleverrapportenTable.id, objectId)).limit(1);
          return Boolean(r);
        },
        arbeidsovereenkomst: async () => {
          const [r] = await db.select({ id: arbeidsovereenkomstenTable.id }).from(arbeidsovereenkomstenTable)
            .where(eq(arbeidsovereenkomstenTable.id, objectId)).limit(1);
          return Boolean(r);
        },
        weekstaat: async () => {
          const [r] = await db.select({ id: weekStatenTable.id }).from(weekStatenTable)
            .where(eq(weekStatenTable.id, objectId)).limit(1);
          return Boolean(r);
        },
        project: async () => {
          const [r] = await db.select({ id: projectenTable.id }).from(projectenTable)
            .where(eq(projectenTable.id, objectId)).limit(1);
          return Boolean(r);
        },
        dossier: async () => {
          const [r] = await db.select({ id: dossiersTable.id }).from(dossiersTable)
            .where(eq(dossiersTable.id, objectId)).limit(1);
          return Boolean(r);
        },
        medewerker_opleiding: async () => {
          const [r] = await db.select({ id: medewerkerOpleidingenTable.id }).from(medewerkerOpleidingenTable)
            .where(eq(medewerkerOpleidingenTable.id, objectId)).limit(1);
          return Boolean(r);
        },
        hrm_besluit: async () => true,  // besluit-validatie loopt via eigen routes
        verlofaanvraag: async () => true, // reeds geregistreerd in OBJECT_WORKFLOW_ACTIE
        inkoopbon: async () => true,      // reeds geregistreerd in OBJECT_WORKFLOW_ACTIE
        // algemene_inkoop: volledig afgehandeld in het aparte blok hierboven
        // (recht-check + server-side bedrag/documentType-afleiding).
      };
      const objectCheck = NIET_FINANCIELE_OBJECT_CHECKS[objectType];
      if (!FINANCIELE_TYPES.has(objectType) && objectCheck) {
        const bestaat = await objectCheck();
        if (!bestaat) {
          res.status(404).json({ error: `${objectType} niet gevonden` });
          return;
        }
      }

      const resultaat = await dienIn(db, {
        objectType,
        objectId,
        documentType: effectiefDocumentType,
        omschrijving,
        bedrag: effectiefBedrag,
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

// ── Handmatige bewaking uitvoeren (niveau 4 — admin/testgebruik) ─────────────
// Triggert de deterministische escalatie-/herinneringsbewaking direct,
// zonder te wachten op de uurlijkse automatische run. Nuttig voor testen,
// demonstraties en urgente situaties waar niet gewacht kan worden.

router.post(
  "/goedkeuring/bewaking/uitvoeren",
  requireBevoegdheid("goedkeuring", 4),
  async (req, res): Promise<void> => {
    try {
      const verwerkt = await verwerkOpenAanvragen();
      req.log.info({ verwerkt }, "Goedkeuring-bewaking handmatig uitgevoerd");
      res.json({
        verwerkt,
        bericht: verwerkt === 0
          ? "Geen openstaande aanvragen met verlopen termijnen gevonden."
          : `${verwerkt} aanvra${verwerkt === 1 ? "ag" : "gen"} verwerkt — herinneringen en/of escalaties verstuurd.`,
        uitgevoerd_op: new Date().toISOString(),
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout bij bewaking" });
    }
  },
);

export default router;
