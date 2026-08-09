// Planning-module routes — /api/modules/planning/*
// Uitvoeringsplanner: alleen uitvoerend personeel (monteurs, timmermannen, zzp, uitzendkrachten)
import { Router } from "express";
import {
  db,
  planningItemsTable,
  planningAfwezigheidTable,
  bedrijfssluitingenTable,
  collectieveVrijeDagenTable,
  feestdagenTable,
  medewerkersTable,
  gebouwenTable,
  gebruikersTable,
  functiesTable,
  projectBegrotingenTable,
  planningMeerwerkTable,
  urenRegistratiesTable,
} from "@workspace/db";
import { eq, and, gte, lte, desc, asc, inArray, sql, isNull, or, type SQL } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { aiGateway, heeftGateway } from "../lib/aiGateway";
import { PLANNING_REISTIJD_PROMPT } from "../lib/aiPrompts";

const router = Router();
const iso = (d: Date) => d.toISOString();

const lezenPlanning    = requireBevoegdheid("planning", 1);
const schrijvenPlanning = requireBevoegdheid("planning", 2);
const aanmakenPlanning  = requireBevoegdheid("planning", 3);

function parseId(v: unknown): number {
  return parseInt(String(v), 10);
}

function mapItem(item: typeof planningItemsTable.$inferSelect, medewerkNaam: string | null, gebouwNaam: string | null) {
  return {
    id: item.id,
    titel: item.titel,
    omschrijving: item.omschrijving ?? null,
    medewerker_id: item.medewerkerId ?? null,
    medewerker_naam: medewerkNaam ?? null,
    gebouw_id: item.gebouwId ?? null,
    gebouw_naam: gebouwNaam ?? null,
    project_id: item.projectId ?? null,
    project_naam: item.projectNaam ?? null,
    datum_start: item.datumStart,
    datum_eind: item.datumEind,
    tijd_start: item.tijdStart ?? null,
    tijd_eind: item.tijdEind ?? null,
    uren: item.uren,
    status: item.status,
    type: item.type,
    opdracht_type: item.opdrachtType ?? null,
    locaties: item.locaties ?? null,
    werknummer: item.werknummer ?? null,
    dag_notities: item.dagNotities ?? null,
    notities: item.notities ?? null,
    op_gesloten_dag: item.opGeslotenDag,
    aangemaakt_op: iso(item.aangemaaktOp),
  };
}

// ── Helper: check of een datum een gesloten dag is ────────────────────────
async function isGeslotenDag(datum: string): Promise<{ gesloten: boolean; naam: string; bron: string }> {
  const jaar = parseInt(datum.slice(0, 4), 10);

  const [feestdag, sluiting] = await Promise.all([
    db.select({ naam: feestdagenTable.naam })
      .from(feestdagenTable)
      .where(and(eq(feestdagenTable.jaar, jaar), eq(feestdagenTable.datum, datum)))
      .limit(1),
    db.select({ naam: bedrijfssluitingenTable.naam })
      .from(bedrijfssluitingenTable)
      .where(and(
        lte(bedrijfssluitingenTable.datumStart, datum),
        gte(bedrijfssluitingenTable.datumEind, datum),
      ))
      .limit(1),
  ]);

  if (feestdag[0]) return { gesloten: true, naam: feestdag[0].naam, bron: "feestdag" };
  if (sluiting[0]) return { gesloten: true, naam: sluiting[0].naam, bron: "bedrijfssluiting" };
  return { gesloten: false, naam: "", bron: "" };
}

// ── Medewerkers voor planning ─────────────────────────────────────────────
// Standaard: alle actieve medewerkers. Optioneel filter: ?alleen_uitvoerend=true.

router.get("/modules/planning/medewerkers", lezenPlanning, async (req, res): Promise<void> => {
  try {
    const wmFilter = typeof req.query.werkmaatschappij === "string" ? req.query.werkmaatschappij : undefined;
    const dvFilter = typeof req.query.dienstverband    === "string" ? req.query.dienstverband    : undefined;
    const alleenUitvoerend = req.query.alleen_uitvoerend === "true";

    const conditions: SQL[] = [eq(medewerkersTable.actief, true)];
    if (alleenUitvoerend) {
      // Uitvoerende medewerkers = functie.uitvoerend = true,
      // PLUS altijd: zzp / uitzend / inhuur / onderaannemer (zijn in deze branche veldwerkers)
      conditions.push(
        or(
          eq(functiesTable.uitvoerend, true),
          inArray(medewerkersTable.dienstverband, ["zzp", "uitzend", "inhuur", "onderaannemer"]),
        )!,
      );
    }
    if (wmFilter) conditions.push(eq(medewerkersTable.werkmaatschappij, wmFilter));
    if (dvFilter) conditions.push(eq(medewerkersTable.dienstverband, dvFilter));

    const rows = await db
      .select({
        id: medewerkersTable.id,
        naam: medewerkersTable.naam,
        email: medewerkersTable.email,
        telefoon: medewerkersTable.telefoon,
        contracturenPerWeek: medewerkersTable.contracturenPerWeek,
        dienstverband: medewerkersTable.dienstverband,
        werkmaatschappij: medewerkersTable.werkmaatschappij,
        bedrijfUitzendbureau: medewerkersTable.bedrijfUitzendbureau,
        uitDienstPer: medewerkersTable.uitDienstPer,
        actief: medewerkersTable.actief,
        functieNaam: functiesTable.naam,
        functieUitvoerend: functiesTable.uitvoerend,
      })
      .from(medewerkersTable)
      .leftJoin(functiesTable, eq(medewerkersTable.functieId, functiesTable.id))
      .where(and(...conditions))
      .orderBy(asc(medewerkersTable.naam));

    res.json(rows.map((r) => ({
      id: r.id,
      naam: r.naam,
      email: r.email,
      telefoon: r.telefoon,
      contracturen_per_week: r.contracturenPerWeek,
      dienstverband: r.dienstverband ?? null,
      werkmaatschappij: r.werkmaatschappij ?? null,
      bedrijf_uitzendbureau: r.bedrijfUitzendbureau ?? null,
      uit_dienst_per: r.uitDienstPer ?? null,
      actief: r.actief,
      functie: r.functieNaam ?? null,
      functie_uitvoerend: r.functieUitvoerend ?? true,
    })));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Diagnose: waarom zijn er geen medewerkers zichtbaar in de planning ──────
router.get("/modules/planning/diagnose", lezenPlanning, async (req, res): Promise<void> => {
  try {
    const [[totaalRij], [zichtbaarRij], [zonderFunctieRij], [geenUitvoerendeRolRij], [nietActiefRij]] =
      await Promise.all([
        db.select({ count: sql<number>`cast(count(*) as int)` }).from(medewerkersTable),
        db.select({ count: sql<number>`cast(count(*) as int)` })
          .from(medewerkersTable)
          .innerJoin(functiesTable, eq(medewerkersTable.functieId, functiesTable.id))
          .where(and(eq(medewerkersTable.actief, true), eq(functiesTable.uitvoerend, true))),
        db.select({ count: sql<number>`cast(count(*) as int)` })
          .from(medewerkersTable)
          .where(and(eq(medewerkersTable.actief, true), isNull(medewerkersTable.functieId))),
        db.select({ count: sql<number>`cast(count(*) as int)` })
          .from(medewerkersTable)
          .innerJoin(functiesTable, eq(medewerkersTable.functieId, functiesTable.id))
          .where(and(eq(medewerkersTable.actief, true), eq(functiesTable.uitvoerend, false))),
        db.select({ count: sql<number>`cast(count(*) as int)` })
          .from(medewerkersTable)
          .where(eq(medewerkersTable.actief, false)),
      ]);

    const totaal           = totaalRij?.count           ?? 0;
    const zichtbaar        = zichtbaarRij?.count        ?? 0;
    const zonderFunctie    = zonderFunctieRij?.count    ?? 0;
    const geenUitvoerend   = geenUitvoerendeRolRij?.count ?? 0;
    const nietActief       = nietActiefRij?.count       ?? 0;

    const oorzaken: { reden: string; aantal: number; omschrijving: string }[] = [];
    if (zonderFunctie  > 0) oorzaken.push({ reden: "geen_functie_gekoppeld", aantal: zonderFunctie,  omschrijving: "Medewerkers zonder functie in het functiehuis" });
    if (geenUitvoerend > 0) oorzaken.push({ reden: "geen_uitvoerende_rol",   aantal: geenUitvoerend, omschrijving: "Medewerkers met een kantoor- of niet-uitvoerende functie" });
    if (nietActief     > 0) oorzaken.push({ reden: "niet_actief",            aantal: nietActief,     omschrijving: "Medewerkers die als inactief zijn gemarkeerd" });

    res.json({ totaal_in_hrm: totaal, zichtbaar_in_planning: zichtbaar, oorzaken });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Planning items ─────────────────────────────────────────────────────────

router.get("/modules/planning/items", lezenPlanning, async (req, res): Promise<void> => {
  try {
    const { van, tot, medewerker_id, gebouw_id, status, opdracht_type } =
      req.query as Record<string, string>;

    const rows = await db
      .select({
        item: planningItemsTable,
        medewerkNaam: medewerkersTable.naam,
        gebouwNaam: gebouwenTable.naam,
      })
      .from(planningItemsTable)
      .leftJoin(medewerkersTable, eq(planningItemsTable.medewerkerId, medewerkersTable.id))
      .leftJoin(gebouwenTable, eq(planningItemsTable.gebouwId, gebouwenTable.id))
      .orderBy(asc(planningItemsTable.datumStart), asc(planningItemsTable.tijdStart), asc(planningItemsTable.id));

    let resultaten = rows;
    if (van)          resultaten = resultaten.filter((r) => r.item.datumStart >= van);
    if (tot)          resultaten = resultaten.filter((r) => r.item.datumEind  <= tot);
    if (medewerker_id) {
      const mid = parseInt(medewerker_id, 10);
      resultaten = resultaten.filter((r) => r.item.medewerkerId === mid);
    }
    if (gebouw_id) {
      const gid = parseInt(gebouw_id, 10);
      resultaten = resultaten.filter((r) => r.item.gebouwId === gid);
    }
    if (status)       resultaten = resultaten.filter((r) => r.item.status === status);
    if (opdracht_type) resultaten = resultaten.filter((r) => r.item.opdrachtType === opdracht_type);

    res.json(resultaten.map(({ item, medewerkNaam, gebouwNaam }) =>
      mapItem(item, medewerkNaam ?? null, gebouwNaam ?? null)
    ));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.post("/modules/planning/items", aanmakenPlanning, async (req, res): Promise<void> => {
  try {
    const {
      titel, omschrijving, medewerker_id, gebouw_id, project_id, project_naam,
      datum_start, datum_eind, tijd_start, tijd_eind, uren,
      status = "concept", type = "uitvoering", notities,
      werknummer, dag_notities, opdracht_type, locaties,
      override_bevestigd,
    } = req.body as Record<string, unknown>;

    if (!datum_start || !datum_eind) {
      return void res.status(400).json({ error: "datum_start en datum_eind zijn verplicht" });
    }

    // Controleer of de datum een feestdag of bedrijfssluiting is.
    // Als override_bevestigd niet true is, weigeren we de aanmaak met 409.
    const datumStr = String(datum_start);
    const geslotenInfo = await isGeslotenDag(datumStr);
    const isOverride = override_bevestigd === true;

    if (geslotenInfo.gesloten && !isOverride) {
      return void res.status(409).json({
        error: "gesloten_dag",
        naam: geslotenInfo.naam,
        bron: geslotenInfo.bron,
        bericht: `${datumStr} is een gesloten dag (${geslotenInfo.naam}). Voer de override-code in om toch in te plannen.`,
      });
    }

    const titelStr = titel
      ? String(titel)
      : (project_naam ? String(project_naam) : "Werk");

    const [row] = await db.insert(planningItemsTable).values({
      titel: titelStr,
      omschrijving:   omschrijving  ? String(omschrijving)  : null,
      medewerkerId:   medewerker_id ? Number(medewerker_id) : null,
      gebouwId:       gebouw_id     ? Number(gebouw_id)     : null,
      projectId:      project_id    ? Number(project_id)    : null,
      projectNaam:    project_naam  ? String(project_naam)  : null,
      datumStart:     datumStr,
      datumEind:      String(datum_eind),
      tijdStart:      tijd_start    ? String(tijd_start)    : null,
      tijdEind:       tijd_eind     ? String(tijd_eind)     : null,
      uren:           uren !== undefined ? Number(uren) : 8,
      status:         String(status),
      type:           String(type),
      opdrachtType:   opdracht_type ? String(opdracht_type) : null,
      locaties:       locaties      ? String(locaties)      : null,
      werknummer:     werknummer    ? String(werknummer)    : null,
      dagNotities:    dag_notities  ? String(dag_notities)  : null,
      notities:       notities      ? String(notities)      : null,
      opGeslotenDag:  geslotenInfo.gesloten && isOverride,
      aangemaaktDoorId: (req as any).session?.gebruikerId ?? null,
    }).returning();

    const gebouw = row.gebouwId
      ? await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, row.gebouwId)).limit(1)
      : [];

    res.status(201).json(mapItem(row, null, gebouw[0]?.naam ?? null));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.get("/modules/planning/items/:id", lezenPlanning, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    const [row] = await db
      .select({ item: planningItemsTable, medewerkNaam: medewerkersTable.naam, gebouwNaam: gebouwenTable.naam })
      .from(planningItemsTable)
      .leftJoin(medewerkersTable, eq(planningItemsTable.medewerkerId, medewerkersTable.id))
      .leftJoin(gebouwenTable,    eq(planningItemsTable.gebouwId,     gebouwenTable.id))
      .where(eq(planningItemsTable.id, id));

    if (!row) return void res.status(404).json({ error: "Niet gevonden" });
    res.json(mapItem(row.item, row.medewerkNaam ?? null, row.gebouwNaam ?? null));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.patch("/modules/planning/items/:id", schrijvenPlanning, async (req, res): Promise<void> => {
  try {
    const id   = parseId(req.params["id"]);
    const body = req.body as Record<string, unknown>;

    const update: Partial<typeof planningItemsTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (body.titel         !== undefined) update.titel        = String(body.titel);
    if (body.omschrijving  !== undefined) update.omschrijving = body.omschrijving  ? String(body.omschrijving)  : null;
    if (body.medewerker_id !== undefined) update.medewerkerId = body.medewerker_id ? Number(body.medewerker_id) : null;
    if (body.gebouw_id     !== undefined) update.gebouwId     = body.gebouw_id     ? Number(body.gebouw_id)     : null;
    if (body.project_id    !== undefined) update.projectId    = body.project_id    ? Number(body.project_id)    : null;
    if (body.project_naam  !== undefined) update.projectNaam  = body.project_naam  ? String(body.project_naam)  : null;
    if (body.datum_start   !== undefined) update.datumStart   = String(body.datum_start);
    if (body.datum_eind    !== undefined) update.datumEind    = String(body.datum_eind);
    if (body.tijd_start    !== undefined) update.tijdStart    = body.tijd_start    ? String(body.tijd_start)    : null;
    if (body.tijd_eind     !== undefined) update.tijdEind     = body.tijd_eind     ? String(body.tijd_eind)     : null;
    if (body.uren          !== undefined) update.uren         = Number(body.uren);
    if (body.status        !== undefined) update.status       = String(body.status);
    if (body.type          !== undefined) update.type         = String(body.type);
    if (body.opdracht_type !== undefined) update.opdrachtType = body.opdracht_type ? String(body.opdracht_type) : null;
    if (body.locaties      !== undefined) update.locaties     = body.locaties      ? String(body.locaties)      : null;
    if (body.werknummer    !== undefined) update.werknummer   = body.werknummer    ? String(body.werknummer)    : null;
    if (body.dag_notities  !== undefined) update.dagNotities  = body.dag_notities  ? String(body.dag_notities)  : null;
    if (body.notities      !== undefined) update.notities     = body.notities      ? String(body.notities)      : null;

    const [row] = await db.update(planningItemsTable).set(update).where(eq(planningItemsTable.id, id)).returning();
    if (!row) return void res.status(404).json({ error: "Niet gevonden" });

    const gebouw = row.gebouwId
      ? await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, row.gebouwId)).limit(1)
      : [];

    res.json(mapItem(row, null, gebouw[0]?.naam ?? null));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.delete("/modules/planning/items/:id", aanmakenPlanning, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    await db.delete(planningItemsTable).where(eq(planningItemsTable.id, id));
    res.status(204).end();
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Afwezigheid ────────────────────────────────────────────────────────────

router.get("/modules/planning/afwezigheid", lezenPlanning, async (req, res): Promise<void> => {
  try {
    const { medewerker_id, van, tot } = req.query as Record<string, string>;

    const rows = await db
      .select({ af: planningAfwezigheidTable, medewerkNaam: medewerkersTable.naam })
      .from(planningAfwezigheidTable)
      .leftJoin(medewerkersTable, eq(planningAfwezigheidTable.medewerkerId, medewerkersTable.id))
      .orderBy(desc(planningAfwezigheidTable.datumStart));

    let resultaten = rows;
    if (medewerker_id) {
      const mid = parseInt(medewerker_id, 10);
      resultaten = resultaten.filter((r) => r.af.medewerkerId === mid);
    }
    if (van) resultaten = resultaten.filter((r) => r.af.datumEind   >= van);
    if (tot) resultaten = resultaten.filter((r) => r.af.datumStart  <= tot);

    res.json(resultaten.map(({ af, medewerkNaam }) => ({
      id: af.id,
      medewerker_id: af.medewerkerId,
      medewerker_naam: medewerkNaam ?? null,
      type: af.type,
      datum_start: af.datumStart,
      datum_eind: af.datumEind,
      omschrijving: af.omschrijving ?? null,
      status: af.status,
      aangemaakt_op: iso(af.aangemaaktOp),
    })));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.post("/modules/planning/afwezigheid", schrijvenPlanning, async (req, res): Promise<void> => {
  try {
    const { medewerker_id, type = "vakantie", datum_start, datum_eind, omschrijving, status = "aangevraagd" } =
      req.body as Record<string, unknown>;

    if (!medewerker_id || !datum_start || !datum_eind) {
      return void res.status(400).json({ error: "medewerker_id, datum_start en datum_eind zijn verplicht" });
    }

    const [row] = await db.insert(planningAfwezigheidTable).values({
      medewerkerId: Number(medewerker_id),
      type: String(type),
      datumStart: String(datum_start),
      datumEind: String(datum_eind),
      omschrijving: omschrijving ? String(omschrijving) : null,
      status: String(status),
      aangemaaktDoorId: (req as any).session?.gebruikerId ?? null,
    }).returning();

    res.status(201).json({
      id: row.id, medewerker_id: row.medewerkerId, medewerker_naam: null,
      type: row.type, datum_start: row.datumStart, datum_eind: row.datumEind,
      omschrijving: row.omschrijving ?? null, status: row.status, aangemaakt_op: iso(row.aangemaaktOp),
    });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.patch("/modules/planning/afwezigheid/:id", schrijvenPlanning, async (req, res): Promise<void> => {
  try {
    const id   = parseId(req.params["id"]);
    const body = req.body as Record<string, unknown>;
    const update: Partial<typeof planningAfwezigheidTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (body.type        !== undefined) update.type        = String(body.type);
    if (body.datum_start !== undefined) update.datumStart  = String(body.datum_start);
    if (body.datum_eind  !== undefined) update.datumEind   = String(body.datum_eind);
    if (body.omschrijving !== undefined) update.omschrijving = body.omschrijving ? String(body.omschrijving) : null;
    if (body.status      !== undefined) update.status      = String(body.status);

    const [row] = await db.update(planningAfwezigheidTable).set(update).where(eq(planningAfwezigheidTable.id, id)).returning();
    if (!row) return void res.status(404).json({ error: "Niet gevonden" });

    res.json({ id: row.id, medewerker_id: row.medewerkerId, medewerker_naam: null,
      type: row.type, datum_start: row.datumStart, datum_eind: row.datumEind,
      omschrijving: row.omschrijving ?? null, status: row.status, aangemaakt_op: iso(row.aangemaaktOp) });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.delete("/modules/planning/afwezigheid/:id", schrijvenPlanning, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    await db.delete(planningAfwezigheidTable).where(eq(planningAfwezigheidTable.id, id));
    res.status(204).end();
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Gesloten dagen (feestdagen + bedrijfssluitingen samengevoegd) ─────────

router.get("/modules/planning/gesloten-dagen", lezenPlanning, async (req, res): Promise<void> => {
  try {
    const van = String(req.query.van ?? "");
    const tot = String(req.query.tot ?? "");
    if (!van || !tot) return void res.status(400).json({ error: "van en tot zijn verplicht" });

    const jaarVan = parseInt(van.slice(0, 4), 10);
    const jaarTot = parseInt(tot.slice(0, 4), 10);
    const jaren = Array.from({ length: jaarTot - jaarVan + 1 }, (_, i) => jaarVan + i);

    const [feestdagen, sluitingen, collectieveDagen] = await Promise.all([
      db.select({ datum: feestdagenTable.datum, naam: feestdagenTable.naam })
        .from(feestdagenTable)
        .where(and(
          inArray(feestdagenTable.jaar, jaren),
          gte(feestdagenTable.datum, van),
          lte(feestdagenTable.datum, tot),
        )),
      db.select({
        id: bedrijfssluitingenTable.id,
        naam: bedrijfssluitingenTable.naam,
        type: bedrijfssluitingenTable.type,
        datumStart: bedrijfssluitingenTable.datumStart,
        datumEind: bedrijfssluitingenTable.datumEind,
      })
        .from(bedrijfssluitingenTable)
        .where(and(
          lte(bedrijfssluitingenTable.datumStart, tot),
          gte(bedrijfssluitingenTable.datumEind, van),
        )),
      // KALENDER_01 §4: collectieve vrije dagen zijn niet inplanbaar.
      db.select({ datum: collectieveVrijeDagenTable.datum, naam: collectieveVrijeDagenTable.naam })
        .from(collectieveVrijeDagenTable)
        .where(and(
          gte(collectieveVrijeDagenTable.datum, van),
          lte(collectieveVrijeDagenTable.datum, tot),
        )),
    ]);

    const resultaten: { datum: string; naam: string; type: string | null; bron: string; sluiting_id: number | null }[] = [];

    for (const f of feestdagen) {
      resultaten.push({ datum: f.datum, naam: f.naam, type: "feestdag", bron: "feestdag", sluiting_id: null });
    }

    for (const c of collectieveDagen) {
      resultaten.push({ datum: c.datum, naam: c.naam, type: "collectief", bron: "collectieve_vrije_dag", sluiting_id: null });
    }

    // Vouw bedrijfssluitingen uit per dag
    for (const s of sluitingen) {
      let cursor = new Date(s.datumStart + "T00:00:00");
      const eindDatum = new Date(s.datumEind + "T00:00:00");
      while (cursor <= eindDatum) {
        const dagStr = cursor.toISOString().slice(0, 10);
        if (dagStr >= van && dagStr <= tot) {
          resultaten.push({ datum: dagStr, naam: s.naam, type: s.type, bron: "bedrijfssluiting", sluiting_id: s.id });
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    resultaten.sort((a, b) => a.datum.localeCompare(b.datum));
    res.json(resultaten);
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Bedrijfssluitingen CRUD ───────────────────────────────────────────────

function mapSluiting(s: typeof bedrijfssluitingenTable.$inferSelect) {
  return {
    id: s.id,
    naam: s.naam,
    datum_start: s.datumStart,
    datum_eind: s.datumEind,
    type: s.type,
    omschrijving: s.omschrijving ?? null,
    aangemaakt_op: iso(s.aangemaaktOp),
    bijgewerkt_op: iso(s.bijgewerktOp),
  };
}

router.get("/modules/planning/bedrijfssluitingen", lezenPlanning, async (req, res): Promise<void> => {
  try {
    const jaar = req.query.jaar ? parseInt(String(req.query.jaar), 10) : undefined;
    let rows = await db.select().from(bedrijfssluitingenTable).orderBy(asc(bedrijfssluitingenTable.datumStart));
    if (jaar) {
      rows = rows.filter((r) => r.datumStart.startsWith(String(jaar)) || r.datumEind.startsWith(String(jaar)));
    }
    res.json(rows.map(mapSluiting));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.post("/modules/planning/bedrijfssluitingen", schrijvenPlanning, async (req, res): Promise<void> => {
  try {
    const { naam, datum_start, datum_eind, type = "bedrijfssluiting", omschrijving } = req.body as Record<string, unknown>;
    if (!naam || !datum_start || !datum_eind) {
      return void res.status(400).json({ error: "naam, datum_start en datum_eind zijn verplicht" });
    }
    const [row] = await db.insert(bedrijfssluitingenTable).values({
      naam: String(naam),
      datumStart: String(datum_start),
      datumEind: String(datum_eind),
      type: String(type),
      omschrijving: omschrijving ? String(omschrijving) : null,
      aangemaaktDoorId: (req as any).session?.gebruikerId ?? null,
    }).returning();
    res.status(201).json(mapSluiting(row));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.patch("/modules/planning/bedrijfssluitingen/:id", schrijvenPlanning, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    const body = req.body as Record<string, unknown>;
    const update: Partial<typeof bedrijfssluitingenTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (body.naam        !== undefined) update.naam        = String(body.naam);
    if (body.datum_start !== undefined) update.datumStart  = String(body.datum_start);
    if (body.datum_eind  !== undefined) update.datumEind   = String(body.datum_eind);
    if (body.type        !== undefined) update.type        = String(body.type);
    if (body.omschrijving !== undefined) update.omschrijving = body.omschrijving ? String(body.omschrijving) : null;
    const [row] = await db.update(bedrijfssluitingenTable).set(update).where(eq(bedrijfssluitingenTable.id, id)).returning();
    if (!row) return void res.status(404).json({ error: "Niet gevonden" });
    res.json(mapSluiting(row));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.delete("/modules/planning/bedrijfssluitingen/:id", schrijvenPlanning, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    await db.delete(bedrijfssluitingenTable).where(eq(bedrijfssluitingenTable.id, id));
    res.status(204).end();
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Projectbegrotingen ─────────────────────────────────────────────────────

function mapBegroting(b: typeof projectBegrotingenTable.$inferSelect, gebouwNaam: string | null) {
  return {
    id: b.id,
    gebouw_id: b.gebouwId ?? null,
    gebouw_naam: gebouwNaam,
    werknummer: b.werknummer ?? null,
    hoofd_uren_begroot: b.hoofdUrenBegroot,
    meerwerk_uren_begroot: b.meerwerkUrenBegroot,
    omschrijving: b.omschrijving ?? null,
    aangemaakt_op: iso(b.aangemaaktOp),
  };
}

router.get("/modules/planning/begrotingen", lezenPlanning, async (req, res): Promise<void> => {
  try {
    const gebouwFilter = req.query.gebouw_id ? Number(req.query.gebouw_id) : undefined;

    const rows = await db
      .select({ b: projectBegrotingenTable, gebouwNaam: gebouwenTable.naam })
      .from(projectBegrotingenTable)
      .leftJoin(gebouwenTable, eq(projectBegrotingenTable.gebouwId, gebouwenTable.id))
      .orderBy(asc(projectBegrotingenTable.id));

    const resultaten = gebouwFilter
      ? rows.filter((r) => r.b.gebouwId === gebouwFilter)
      : rows;

    res.json(resultaten.map(({ b, gebouwNaam }) => mapBegroting(b, gebouwNaam ?? null)));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.post("/modules/planning/begrotingen", aanmakenPlanning, async (req, res): Promise<void> => {
  try {
    const { gebouw_id, werknummer, hoofd_uren_begroot = 0, meerwerk_uren_begroot = 0, omschrijving } =
      req.body as Record<string, unknown>;

    const [row] = await db.insert(projectBegrotingenTable).values({
      gebouwId: gebouw_id ? Number(gebouw_id) : null,
      werknummer: werknummer ? String(werknummer) : null,
      hoofdUrenBegroot: Number(hoofd_uren_begroot),
      meerwerkUrenBegroot: Number(meerwerk_uren_begroot),
      omschrijving: omschrijving ? String(omschrijving) : null,
      aangemaaktDoorId: (req as any).session?.gebruikerId ?? null,
    }).returning();

    const gebouw = row.gebouwId
      ? await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, row.gebouwId)).limit(1)
      : [];

    res.status(201).json(mapBegroting(row, gebouw[0]?.naam ?? null));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.patch("/modules/planning/begrotingen/:id", schrijvenPlanning, async (req, res): Promise<void> => {
  try {
    const id   = parseId(req.params["id"]);
    const body = req.body as Record<string, unknown>;
    const update: Partial<typeof projectBegrotingenTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (body.gebouw_id            !== undefined) update.gebouwId          = body.gebouw_id ? Number(body.gebouw_id) : null;
    if (body.werknummer           !== undefined) update.werknummer        = body.werknummer ? String(body.werknummer) : null;
    if (body.hoofd_uren_begroot   !== undefined) update.hoofdUrenBegroot  = Number(body.hoofd_uren_begroot);
    if (body.meerwerk_uren_begroot !== undefined) update.meerwerkUrenBegroot = Number(body.meerwerk_uren_begroot);
    if (body.omschrijving         !== undefined) update.omschrijving      = body.omschrijving ? String(body.omschrijving) : null;

    const [row] = await db.update(projectBegrotingenTable).set(update).where(eq(projectBegrotingenTable.id, id)).returning();
    if (!row) return void res.status(404).json({ error: "Niet gevonden" });

    const gebouw = row.gebouwId
      ? await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, row.gebouwId)).limit(1)
      : [];

    res.json(mapBegroting(row, gebouw[0]?.naam ?? null));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.delete("/modules/planning/begrotingen/:id", aanmakenPlanning, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    await db.delete(projectBegrotingenTable).where(eq(projectBegrotingenTable.id, id));
    res.status(204).end();
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Meerwerk ───────────────────────────────────────────────────────────────

function mapMeerwerk(m: typeof planningMeerwerkTable.$inferSelect) {
  return {
    id: m.id,
    planning_item_id: m.planningItemId,
    meerwerk_nummer: m.meerwerkNummer ?? null,
    omschrijving: m.omschrijving ?? null,
    status: m.status,
    aangemaakt_op: iso(m.aangemaaktOp),
  };
}

router.get("/modules/planning/meerwerk", lezenPlanning, async (req, res): Promise<void> => {
  try {
    const planningItemFilter = req.query.planning_item_id ? Number(req.query.planning_item_id) : undefined;

    const rows = await db
      .select()
      .from(planningMeerwerkTable)
      .orderBy(asc(planningMeerwerkTable.id));

    const resultaten = planningItemFilter
      ? rows.filter((r) => r.planningItemId === planningItemFilter)
      : rows;

    res.json(resultaten.map(mapMeerwerk));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.post("/modules/planning/meerwerk", aanmakenPlanning, async (req, res): Promise<void> => {
  try {
    const { planning_item_id, meerwerk_nummer, omschrijving, status = "concept" } =
      req.body as Record<string, unknown>;

    if (!planning_item_id) {
      return void res.status(400).json({ error: "planning_item_id is verplicht" });
    }

    const [row] = await db.insert(planningMeerwerkTable).values({
      planningItemId: Number(planning_item_id),
      meerwerkNummer: meerwerk_nummer ? String(meerwerk_nummer) : null,
      omschrijving:   omschrijving    ? String(omschrijving)    : null,
      status:         String(status),
    }).returning();

    res.status(201).json(mapMeerwerk(row));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.patch("/modules/planning/meerwerk/:id", schrijvenPlanning, async (req, res): Promise<void> => {
  try {
    const id   = parseId(req.params["id"]);
    const body = req.body as Record<string, unknown>;
    const update: Partial<typeof planningMeerwerkTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (body.meerwerk_nummer !== undefined) update.meerwerkNummer = body.meerwerk_nummer ? String(body.meerwerk_nummer) : null;
    if (body.omschrijving   !== undefined) update.omschrijving   = body.omschrijving    ? String(body.omschrijving)    : null;
    if (body.status         !== undefined) update.status         = String(body.status);

    const [row] = await db.update(planningMeerwerkTable).set(update).where(eq(planningMeerwerkTable.id, id)).returning();
    if (!row) return void res.status(404).json({ error: "Niet gevonden" });

    res.json(mapMeerwerk(row));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.delete("/modules/planning/meerwerk/:id", aanmakenPlanning, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    await db.delete(planningMeerwerkTable).where(eq(planningMeerwerkTable.id, id));
    res.status(204).end();
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Nacalculatie ───────────────────────────────────────────────────────────
// Geaggregeerde view: begroot (project_begrotingen) + gepland (planning_items)
// + werkelijk (uren_registraties via planning_item_id of gebouw_id).

router.get("/modules/planning/nacalculatie", lezenPlanning, async (req, res): Promise<void> => {
  try {
    const { van, tot, gebouw_id } = req.query as Record<string, string>;

    // 1. Begrotingen per gebouw
    const begrotingen = await db
      .select({ b: projectBegrotingenTable, gebouwNaam: gebouwenTable.naam })
      .from(projectBegrotingenTable)
      .leftJoin(gebouwenTable, eq(projectBegrotingenTable.gebouwId, gebouwenTable.id));

    // 2. Geplande uren per gebouw per opdracht_type (in datumbereik)
    const allItems = await db
      .select({ item: planningItemsTable, gebouwNaam: gebouwenTable.naam })
      .from(planningItemsTable)
      .leftJoin(gebouwenTable, eq(planningItemsTable.gebouwId, gebouwenTable.id))
      .where(planningItemsTable.gebouwId !== null ? undefined : undefined);

    const gefilterdItems = allItems.filter((r) => {
      if (!r.item.gebouwId) return false;
      if (van && r.item.datumStart < van) return false;
      if (tot && r.item.datumEind  > tot) return false;
      if (gebouw_id && r.item.gebouwId !== parseInt(gebouw_id, 10)) return false;
      return true;
    });

    // 3. Werkelijke uren per gebouw (via planning_item_id → gebouw_id)
    const itemIds = gefilterdItems.map((r) => r.item.id);
    const werkelijk: Record<number, number> = {};

    if (itemIds.length > 0) {
      const urenRows = await db
        .select({ planningItemId: urenRegistratiesTable.planningItemId, netto: urenRegistratiesTable.nettoUren })
        .from(urenRegistratiesTable)
        .where(inArray(urenRegistratiesTable.planningItemId, itemIds));

      for (const ur of urenRows) {
        const gid = gefilterdItems.find((r) => r.item.id === ur.planningItemId)?.item.gebouwId;
        if (gid && ur.netto) werkelijk[gid] = (werkelijk[gid] ?? 0) + ur.netto;
      }
    }

    // Aggregeer per gebouw
    const gebouwen: Record<number, {
      gebouw_id: number;
      gebouw_naam: string | null;
      werknummer: string | null;
      hoofd_uren_begroot: number;
      meerwerk_uren_begroot: number;
      hoofd_uren_gepland: number;
      meerwerk_uren_gepland: number;
      totaal_uren_werkelijk: number;
    }> = {};

    // Stel records in vanuit begrotingen
    for (const { b, gebouwNaam } of begrotingen) {
      if (!b.gebouwId) continue;
      if (gebouw_id && b.gebouwId !== parseInt(gebouw_id, 10)) continue;
      gebouwen[b.gebouwId] = {
        gebouw_id: b.gebouwId,
        gebouw_naam: gebouwNaam ?? null,
        werknummer: b.werknummer ?? null,
        hoofd_uren_begroot: b.hoofdUrenBegroot,
        meerwerk_uren_begroot: b.meerwerkUrenBegroot,
        hoofd_uren_gepland: 0,
        meerwerk_uren_gepland: 0,
        totaal_uren_werkelijk: 0,
      };
    }

    // Voeg geplande uren toe (ook voor gebouwen zonder begroting)
    for (const { item, gebouwNaam } of gefilterdItems) {
      const gid = item.gebouwId!;
      if (!gebouwen[gid]) {
        gebouwen[gid] = {
          gebouw_id: gid,
          gebouw_naam: gebouwNaam ?? null,
          werknummer: null,
          hoofd_uren_begroot: 0,
          meerwerk_uren_begroot: 0,
          hoofd_uren_gepland: 0,
          meerwerk_uren_gepland: 0,
          totaal_uren_werkelijk: 0,
        };
      }
      if (item.opdrachtType === "meerwerk") {
        gebouwen[gid].meerwerk_uren_gepland += item.uren;
      } else {
        gebouwen[gid].hoofd_uren_gepland += item.uren;
      }
    }

    // Voeg werkelijke uren toe
    for (const [gidStr, uren] of Object.entries(werkelijk)) {
      const gid = parseInt(gidStr, 10);
      if (gebouwen[gid]) gebouwen[gid].totaal_uren_werkelijk = uren;
    }

    res.json(Object.values(gebouwen));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── AI Reistijd schatting ─────────────────────────────────────────────────

router.post("/modules/planning/reistijd-schatting", lezenPlanning, async (req, res): Promise<void> => {
  const { locatie_a, locatie_b } = req.body as { locatie_a?: string; locatie_b?: string };
  if (!locatie_a || !locatie_b) {
    return void res.status(422).json({ error: "locatie_a en locatie_b zijn verplicht" });
  }
  if (!heeftGateway()) {
    return void res.json({ minuten: 30, beschrijving: "Standaard schatting (AI niet beschikbaar)", onzeker: true });
  }
  try {
    const planningAiResultaat = await aiGateway.chat("fast", {
      messages: [
        {
          role: "system",
          content: PLANNING_REISTIJD_PROMPT.tekst,
        },
        {
          role: "user",
          content: `Schat de reistijd per auto van "${locatie_a}" naar "${locatie_b}" in Nederland.`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 200,
    }, undefined, {
      module: "planning",
      functie: "reistijd-schatting",
      gebruikerId: (req as { session?: { userId?: number } }).session?.userId ?? null,
      // planning_item_id is niet beschikbaar: reistijd-schatting is een algemeen
      // hulpmiddel op basis van twee locatiestrings, niet gekoppeld aan een specifiek
      // planningsitem. De aanroepende UI kan in de toekomst een optionele
      // planning_item_id meesturen via req.body als dat gewenst is.
    });
    const raw = JSON.parse(planningAiResultaat.ok ? planningAiResultaat.inhoud : "{}") as { minuten?: unknown; beschrijving?: unknown; onzeker?: unknown };
    return void res.json({
      minuten: typeof raw.minuten === "number" ? Math.max(5, Math.round(raw.minuten)) : 30,
      beschrijving: typeof raw.beschrijving === "string" ? raw.beschrijving : "Schatting op basis van locatie",
      onzeker: raw.onzeker === true,
    });
  } catch (e) {
    req.log.error(e);
    return void res.json({ minuten: 30, beschrijving: "Schatting niet beschikbaar", onzeker: true });
  }
});

export default router;
