// Magazijn- en Voorraadbeheer (Fase 1 — Kern)
// Routes: locaties, artikelen-magazijn, voorraad, mutaties, reserveringen, uitgiftes, retouren, dashboard
import { Router } from "express";
import {
  db,
  magazijnLocatiesTable,
  voorraadTable,
  voorraadMutatiesTable,
  reserveringenTable,
  artikelenTable,
  leveranciersTable,
  opdrachtenTable,
  magazijnStellingscansTable,
} from "@workspace/db";
import { eq, and, asc, desc, ilike, lt, lte, sql } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { verstuurMail, MailFout } from "../services/email";
import { ObjectStorageService } from "../lib/objectStorage";
import { maakOpenAiClient, heeftOpenAi } from "../lib/openai";

const router = Router();

const lezen    = requireBevoegdheid("magazijn", 1);
const schrijven = requireBevoegdheid("magazijn", 2);
const aanmaken = requireBevoegdheid("magazijn", 3);
const beheer   = requireBevoegdheid("magazijn", 4);

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

// Transaction-aware executor type (drizzle tx or plain db)
type DbExec = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

// ── Helpers ────────────────────────────────────────────────────────────────────

function str(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  return String(v);
}

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function mapLocatie(r: typeof magazijnLocatiesTable.$inferSelect) {
  return {
    id: r.id,
    naam: r.naam,
    type: r.type,
    parent_id: r.parentId ?? null,
    omschrijving: r.omschrijving ?? null,
    actief: r.actief,
    aangemaakt_op: iso(r.aangemaaktOp)!,
    bijgewerkt_op: iso(r.bijgewerktOp)!,
  };
}

function mapVoorraad(r: typeof voorraadTable.$inferSelect, artikelNaam?: string | null) {
  return {
    id: r.id,
    artikel_id: r.artikelId,
    artikel_naam: artikelNaam ?? null,
    locatie_id: r.locatieId ?? null,
    hoeveelheid: r.hoeveelheid,
    gereserveerd: r.gereserveerd,
    besteld: r.besteld,
    vrij: Math.max(0, r.hoeveelheid - r.gereserveerd),
    bijgewerkt_op: iso(r.bijgewerktOp)!,
  };
}

function mapMutatie(r: typeof voorraadMutatiesTable.$inferSelect, extra?: { artikel_naam?: string | null; gebruiker_naam?: string | null }) {
  return {
    id: r.id,
    artikel_id: r.artikelId,
    artikel_naam: extra?.artikel_naam ?? null,
    locatie_id: r.locatieId ?? null,
    type: r.type,
    hoeveelheid: r.hoeveelheid,
    delta: r.delta,
    referentie_type: r.referentieType ?? null,
    referentie_id: r.referentieId ?? null,
    gebruiker_id: r.gebruikerId ?? null,
    gebruiker_naam: extra?.gebruiker_naam ?? null,
    omschrijving: r.omschrijving ?? null,
    aangemaakt_op: iso(r.aangemaaktOp)!,
  };
}

function mapReservering(r: typeof reserveringenTable.$inferSelect, extra?: { artikel_naam?: string | null; opdracht_titel?: string | null }) {
  return {
    id: r.id,
    artikel_id: r.artikelId,
    artikel_naam: extra?.artikel_naam ?? null,
    opdracht_id: r.opdrachtId ?? null,
    opdracht_titel: extra?.opdracht_titel ?? null,
    hoeveelheid: r.hoeveelheid,
    gereserveerd_op: iso(r.gereserveerdOp)!,
    status: r.status,
    omschrijving: r.omschrijving ?? null,
    aangemaakt_door_id: r.aangemaaktDoorId ?? null,
    bijgewerkt_op: iso(r.bijgewerktOp)!,
  };
}

function mapArtikelMagazijn(r: typeof artikelenTable.$inferSelect, leverancierNaam?: string | null) {
  return {
    id: r.id,
    code: r.code ?? null,
    naam: r.naam,
    omschrijving: r.omschrijving ?? null,
    eenheid: r.eenheid,
    categorie: r.categorie ?? null,
    merk: (r as Record<string, unknown>).merk as string | null ?? null,
    leverancier_id: r.leverancierId ?? null,
    leverancier_naam: leverancierNaam ?? null,
    leveranciers_artikel_nr: (r as Record<string, unknown>).leveranciersArtikelNr as string | null ?? null,
    inkoopprijs: r.inkoopprijs ?? null,
    verkoopprijs: r.verkoopprijs ?? null,
    gemiddeld_inkoopprijs: (r as Record<string, unknown>).gemiddeldInkoopprijs as number | null ?? null,
    laatste_inkoopprijs: (r as Record<string, unknown>).laatsteInkoopprijs as number | null ?? null,
    btw_percentage: r.btwPercentage,
    minimum_voorraad: (r as Record<string, unknown>).minimumVoorraad as number | null ?? null,
    gewenste_voorraad: (r as Record<string, unknown>).gewensteVoorraad as number | null ?? null,
    barcode: (r as Record<string, unknown>).barcode as string | null ?? null,
    locatie_id: (r as Record<string, unknown>).locatieId as number | null ?? null,
    notities: r.notities ?? null,
    actief: r.actief,
    bron: r.bron,
    aangemaakt_op: iso(r.aangemaaktOp)!,
    bijgewerkt_op: iso(r.bijgewerktOp)!,
  };
}

// ── Voorraad bijwerken (intern hulpfunctie) ────────────────────────────────────
// Accepts a Drizzle transaction executor (tx) or plain db for non-transactional use.
// For negative deltas (uitgifte/correctie), call AFTER validating available stock at the
// call site. hoeveelheid never drops below 0 (GREATEST guard).

async function bijwerkenVoorraad(
  exec: DbExec,
  artikelId: number,
  locatieId: number | null,
  delta: number,
  type: string,
  gebruikerId: number | undefined,
  referentieType: string | null,
  referentieId: number | null,
  omschrijving: string | null,
) {
  const whereExpr = locatieId != null
    ? and(eq(voorraadTable.artikelId, artikelId), eq(voorraadTable.locatieId, locatieId))
    : and(eq(voorraadTable.artikelId, artikelId), sql`${voorraadTable.locatieId} IS NULL`);

  const bestaand = await exec.select().from(voorraadTable).where(whereExpr).limit(1);

  // Bereken de werkelijk toe te passen delta (hoeveelheid nooit < 0)
  let actualDelta: number;
  if (bestaand.length > 0) {
    actualDelta = delta < 0
      ? Math.max(delta, -bestaand[0].hoeveelheid) // kan niet verder dan 0 zakken
      : delta;
    await exec.update(voorraadTable)
      .set({
        hoeveelheid: sql`GREATEST(0, ${voorraadTable.hoeveelheid} + ${delta})`,
        bijgewerktOp: new Date(),
      })
      .where(eq(voorraadTable.id, bestaand[0].id));
  } else {
    actualDelta = Math.max(0, delta); // nieuwe rij start altijd op max(0, delta)
    await exec.insert(voorraadTable).values({
      artikelId,
      locatieId,
      hoeveelheid: actualDelta,
      gereserveerd: 0,
      besteld: 0,
    });
  }

  // Mutatie logt de werkelijk toegepaste delta (niet de aangevraagde)
  await exec.insert(voorraadMutatiesTable).values({
    artikelId,
    locatieId,
    type,
    hoeveelheid: Math.abs(actualDelta),
    delta: actualDelta,
    referentieType,
    referentieId,
    gebruikerId: gebruikerId ?? null,
    omschrijving,
  });
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════

// ── Signalering: kritieke artikelen teller (voor sidebar-badge) ──────────────

router.get("/magazijn/signalering", lezen, async (req, res) => {
  try {
    const voorraad = await db.select({
      artikel_id: voorraadTable.artikelId,
      hoeveelheid: voorraadTable.hoeveelheid,
    }).from(voorraadTable);

    const artikelen = await db.select({
      id: artikelenTable.id,
      minimum_voorraad: sql<number | null>`${artikelenTable}.minimum_voorraad`,
    }).from(artikelenTable).where(eq(artikelenTable.actief, true));

    const voorraadMap = new Map<number, number>();
    for (const v of voorraad) {
      voorraadMap.set(v.artikel_id, (voorraadMap.get(v.artikel_id) ?? 0) + (v.hoeveelheid ?? 0));
    }

    let kritiekAantal = 0;
    for (const artikel of artikelen) {
      const minVoorraad = (artikel as Record<string, unknown>).minimum_voorraad as number | null;
      if (minVoorraad == null) continue;
      const hoeveelheid = voorraadMap.get(artikel.id) ?? 0;
      if (hoeveelheid < minVoorraad) kritiekAantal++;
    }

    res.json({ kritiek_aantal: kritiekAantal });
  } catch (err) {
    logger.error({ err }, "magazijn signalering fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

router.get("/magazijn/dashboard", lezen, async (req, res) => {
  try {
    const voorraad = await db.select({
      artikel_id: voorraadTable.artikelId,
      hoeveelheid: voorraadTable.hoeveelheid,
      gereserveerd: voorraadTable.gereserveerd,
      besteld: voorraadTable.besteld,
    }).from(voorraadTable);

    const artikelen = await db.select({
      id: artikelenTable.id,
      naam: artikelenTable.naam,
      eenheid: artikelenTable.eenheid,
      minimum_voorraad: sql<number | null>`${artikelenTable}.minimum_voorraad`,
      inkoopprijs: artikelenTable.inkoopprijs,
    }).from(artikelenTable).where(eq(artikelenTable.actief, true));

    const voorraadMap = new Map<number, { hoeveelheid: number; gereserveerd: number; besteld: number }>();
    for (const v of voorraad) {
      const existing = voorraadMap.get(v.artikel_id) ?? { hoeveelheid: 0, gereserveerd: 0, besteld: 0 };
      voorraadMap.set(v.artikel_id, {
        hoeveelheid: existing.hoeveelheid + (v.hoeveelheid ?? 0),
        gereserveerd: existing.gereserveerd + (v.gereserveerd ?? 0),
        besteld: existing.besteld + (v.besteld ?? 0),
      });
    }

    let totaalWaarde = 0;
    let onderMinimum = 0;
    let totaalGereserveerd = 0;
    let totaalBesteld = 0;
    const kritiek: Array<{ id: number; naam: string; eenheid: string; hoeveelheid: number; minimum_voorraad: number }> = [];

    for (const artikel of artikelen) {
      const v = voorraadMap.get(artikel.id) ?? { hoeveelheid: 0, gereserveerd: 0, besteld: 0 };
      if (artikel.inkoopprijs) {
        totaalWaarde += v.hoeveelheid * artikel.inkoopprijs;
      }
      totaalGereserveerd += v.gereserveerd;
      totaalBesteld += v.besteld;
      const minVoorraad = (artikel as Record<string, unknown>).minimum_voorraad as number | null;
      if (minVoorraad != null && v.hoeveelheid < minVoorraad) {
        onderMinimum++;
        kritiek.push({
          id: artikel.id,
          naam: artikel.naam,
          eenheid: artikel.eenheid,
          hoeveelheid: v.hoeveelheid,
          minimum_voorraad: minVoorraad,
        });
      }
    }

    // Meest verbruikte (laatste 30 dagen)
    const dertigDagenGeleden = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const verbruik = await db.select({
      artikel_id: voorraadMutatiesTable.artikelId,
      totaal: sql<number>`SUM(ABS(${voorraadMutatiesTable.delta}))`,
    })
      .from(voorraadMutatiesTable)
      .where(
        and(
          eq(voorraadMutatiesTable.type, "uitgifte"),
          sql`${voorraadMutatiesTable.aangemaaktOp} >= ${dertigDagenGeleden}`,
        ),
      )
      .groupBy(voorraadMutatiesTable.artikelId)
      .orderBy(desc(sql<number>`SUM(ABS(${voorraadMutatiesTable.delta}))`))
      .limit(5);

    const verbruikMet = await Promise.all(verbruik.map(async (v) => {
      const [a] = await db.select({ naam: artikelenTable.naam, eenheid: artikelenTable.eenheid })
        .from(artikelenTable).where(eq(artikelenTable.id, v.artikel_id)).limit(1);
      return { artikel_id: v.artikel_id, naam: a?.naam ?? "—", eenheid: a?.eenheid ?? "st", totaal: v.totaal };
    }));

    res.json({
      totaal_waarde: Math.round(totaalWaarde * 100) / 100,
      artikelen_onder_minimum: onderMinimum,
      totaal_gereserveerd: totaalGereserveerd,
      totaal_besteld: totaalBesteld,
      kritieke_artikelen: kritiek.slice(0, 10),
      meest_verbruikt: verbruikMet,
    });
  } catch (err) {
    logger.error({ err }, "magazijn dashboard fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ═══════════════════════════════════════════════════════════
// LOCATIES
// ═══════════════════════════════════════════════════════════

router.get("/magazijn/locaties", lezen, async (req, res) => {
  try {
    const rijen = await db.select().from(magazijnLocatiesTable).orderBy(asc(magazijnLocatiesTable.naam));
    res.json(rijen.map(mapLocatie));
  } catch (err) {
    logger.error({ err }, "magazijn locaties fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

router.post("/magazijn/locaties", aanmaken, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const naam = String(body.naam ?? "").trim();
    if (!naam) { res.status(422).json({ error: "Naam is verplicht" }); return; }

    const [nieuw] = await db.insert(magazijnLocatiesTable).values({
      naam,
      type: str(body.type) ?? "rek",
      parentId: body.parent_id ? Number(body.parent_id) : null,
      omschrijving: str(body.omschrijving),
      actief: body.actief !== false,
    }).returning();

    res.status(201).json(mapLocatie(nieuw));
  } catch (err) {
    logger.error({ err }, "magazijn locatie aanmaken fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

router.get("/magazijn/locaties/:id", lezen, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [rij] = await db.select().from(magazijnLocatiesTable).where(eq(magazijnLocatiesTable.id, id)).limit(1);
    if (!rij) { res.status(404).json({ error: "Locatie niet gevonden" }); return; }
    res.json(mapLocatie(rij));
  } catch (err) {
    logger.error({ err }, "magazijn locatie ophalen fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

router.patch("/magazijn/locaties/:id", schrijven, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body as Record<string, unknown>;

    const updates: Record<string, unknown> = { bijgewerktOp: new Date() };
    if (typeof body.naam === "string") updates.naam = body.naam.trim();
    if (body.type !== undefined) updates.type = str(body.type) ?? "rek";
    if (body.parent_id !== undefined) updates.parentId = body.parent_id ? Number(body.parent_id) : null;
    if (body.omschrijving !== undefined) updates.omschrijving = str(body.omschrijving);
    if (body.actief !== undefined) updates.actief = Boolean(body.actief);

    const [bijgewerkt] = await db.update(magazijnLocatiesTable)
      .set(updates as Partial<typeof magazijnLocatiesTable.$inferInsert>)
      .where(eq(magazijnLocatiesTable.id, id))
      .returning();

    if (!bijgewerkt) { res.status(404).json({ error: "Locatie niet gevonden" }); return; }
    res.json(mapLocatie(bijgewerkt));
  } catch (err) {
    logger.error({ err }, "magazijn locatie bijwerken fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

router.delete("/magazijn/locaties/:id", beheer, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.transaction(async (tx) => {
      // Ontkoppel artikelen die deze locatie als standaard locatie hadden
      await tx.update(artikelenTable)
        .set({ bijgewerktOp: new Date() })
        .where(sql`${artikelenTable}.locatie_id = ${id}`);
      await tx.delete(magazijnLocatiesTable).where(eq(magazijnLocatiesTable.id, id));
    });
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "magazijn locatie verwijderen fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ═══════════════════════════════════════════════════════════
// ARTIKELEN — magazijn-aanvullende velden (GET detail + PATCH)
// ═══════════════════════════════════════════════════════════

router.get("/magazijn/artikelen/:id", lezen, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [rij] = await db.select({
      artikel: artikelenTable,
      leverancier_naam: leveranciersTable.naam,
    })
      .from(artikelenTable)
      .leftJoin(leveranciersTable, eq(artikelenTable.leverancierId, leveranciersTable.id))
      .where(eq(artikelenTable.id, id))
      .limit(1);
    if (!rij) { res.status(404).json({ error: "Artikel niet gevonden" }); return; }
    res.json(mapArtikelMagazijn(rij.artikel, rij.leverancier_naam));
  } catch (err) {
    logger.error({ err }, "magazijn artikel detail fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

router.patch("/magazijn/artikelen/:id", schrijven, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body as Record<string, unknown>;

    const updates: Record<string, unknown> = { bijgewerktOp: new Date() };
    if (body.minimum_voorraad !== undefined) updates.minimumVoorraad = num(body.minimum_voorraad);
    if (body.gewenste_voorraad !== undefined) updates.gewensteVoorraad = num(body.gewenste_voorraad);
    if (body.barcode !== undefined) updates.barcode = str(body.barcode);
    if (body.locatie_id !== undefined) updates.locatieId = body.locatie_id ? Number(body.locatie_id) : null;
    if (body.merk !== undefined) updates.merk = str(body.merk);
    if (body.leveranciers_artikel_nr !== undefined) updates.leveranciersArtikelNr = str(body.leveranciers_artikel_nr);
    if (body.gemiddeld_inkoopprijs !== undefined) updates.gemiddeldInkoopprijs = num(body.gemiddeld_inkoopprijs);

    const [bijgewerkt] = await db.update(artikelenTable)
      .set(updates as Partial<typeof artikelenTable.$inferInsert>)
      .where(eq(artikelenTable.id, id))
      .returning();

    if (!bijgewerkt) { res.status(404).json({ error: "Artikel niet gevonden" }); return; }

    const [levNaam] = await db.select({ naam: leveranciersTable.naam }).from(leveranciersTable)
      .where(bijgewerkt.leverancierId != null ? eq(leveranciersTable.id, bijgewerkt.leverancierId) : sql`false`).limit(1);

    res.json(mapArtikelMagazijn(bijgewerkt, levNaam?.naam ?? null));
  } catch (err) {
    logger.error({ err }, "magazijn artikel bijwerken fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ═══════════════════════════════════════════════════════════
// VOORRAAD
// ═══════════════════════════════════════════════════════════

router.get("/magazijn/voorraad", lezen, async (req, res) => {
  try {
    const { artikel_id, locatie_id } = req.query as Record<string, string | undefined>;

    const conds = [];
    if (artikel_id) conds.push(eq(voorraadTable.artikelId, Number(artikel_id)));
    if (locatie_id) conds.push(eq(voorraadTable.locatieId, Number(locatie_id)));

    const rijen = await db.select({
      voorraad: voorraadTable,
      artikel_naam: artikelenTable.naam,
    })
      .from(voorraadTable)
      .leftJoin(artikelenTable, eq(voorraadTable.artikelId, artikelenTable.id))
      .where(conds.length > 0 ? and(...(conds as [typeof conds[0], ...typeof conds])) : undefined)
      .orderBy(asc(artikelenTable.naam));

    res.json(rijen.map(r => mapVoorraad(r.voorraad, r.artikel_naam)));
  } catch (err) {
    logger.error({ err }, "magazijn voorraad ophalen fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// Samengevoegd voorraad per artikel (over alle locaties)
router.get("/magazijn/voorraad/totaal", lezen, async (req, res) => {
  try {
    const rijen = await db.select({
      artikel_id: voorraadTable.artikelId,
      artikel_naam: artikelenTable.naam,
      eenheid: artikelenTable.eenheid,
      minimum_voorraad: sql<number | null>`${artikelenTable}.minimum_voorraad`,
      gewenste_voorraad: sql<number | null>`${artikelenTable}.gewenste_voorraad`,
      hoeveelheid: sql<number>`SUM(${voorraadTable.hoeveelheid})`,
      gereserveerd: sql<number>`SUM(${voorraadTable.gereserveerd})`,
      besteld: sql<number>`SUM(${voorraadTable.besteld})`,
    })
      .from(voorraadTable)
      .leftJoin(artikelenTable, eq(voorraadTable.artikelId, artikelenTable.id))
      .groupBy(
        voorraadTable.artikelId,
        artikelenTable.naam,
        artikelenTable.eenheid,
        sql`${artikelenTable}.minimum_voorraad`,
        sql`${artikelenTable}.gewenste_voorraad`,
      )
      .orderBy(asc(artikelenTable.naam));

    res.json(rijen.map(r => ({
      artikel_id: r.artikel_id,
      artikel_naam: r.artikel_naam ?? null,
      eenheid: r.eenheid ?? "st",
      minimum_voorraad: r.minimum_voorraad ?? null,
      gewenste_voorraad: r.gewenste_voorraad ?? null,
      hoeveelheid: r.hoeveelheid ?? 0,
      gereserveerd: r.gereserveerd ?? 0,
      besteld: r.besteld ?? 0,
      vrij: Math.max(0, (r.hoeveelheid ?? 0) - (r.gereserveerd ?? 0)),
      onder_minimum: r.minimum_voorraad != null && (r.hoeveelheid ?? 0) < r.minimum_voorraad,
    })));
  } catch (err) {
    logger.error({ err }, "magazijn voorraad totaal fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// POST: handmatige correctie/inkoop
router.post("/magazijn/voorraad/correctie", aanmaken, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const artikelId = Number(body.artikel_id);
    const delta = num(body.delta);
    if (!artikelId || delta == null) { res.status(422).json({ error: "artikel_id en delta zijn verplicht" }); return; }

    const locatieId = body.locatie_id ? Number(body.locatie_id) : null;
    const type = str(body.type) ?? "correctie";
    const userId = req.session?.userId as number | undefined;

    await bijwerkenVoorraad(db, artikelId, locatieId, delta, type, userId, null, null, str(body.omschrijving));

    res.status(201).json({ ok: true });
  } catch (err) {
    logger.error({ err }, "magazijn voorraad correctie fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ═══════════════════════════════════════════════════════════
// MUTATIES
// ═══════════════════════════════════════════════════════════

router.get("/magazijn/mutaties", lezen, async (req, res) => {
  try {
    const { artikel_id, type, limit: limitQ } = req.query as Record<string, string | undefined>;
    const maxItems = Math.min(Number(limitQ ?? 100), 500);

    const conds = [];
    if (artikel_id) conds.push(eq(voorraadMutatiesTable.artikelId, Number(artikel_id)));
    if (type) conds.push(eq(voorraadMutatiesTable.type, type));

    const rijen = await db.select({
      mutatie: voorraadMutatiesTable,
      artikel_naam: artikelenTable.naam,
    })
      .from(voorraadMutatiesTable)
      .leftJoin(artikelenTable, eq(voorraadMutatiesTable.artikelId, artikelenTable.id))
      .where(conds.length > 0 ? and(...(conds as [typeof conds[0], ...typeof conds])) : undefined)
      .orderBy(desc(voorraadMutatiesTable.aangemaaktOp))
      .limit(maxItems);

    res.json(rijen.map(r => mapMutatie(r.mutatie, { artikel_naam: r.artikel_naam })));
  } catch (err) {
    logger.error({ err }, "magazijn mutaties fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ═══════════════════════════════════════════════════════════
// RESERVERINGEN
// ═══════════════════════════════════════════════════════════

router.get("/magazijn/reserveringen", lezen, async (req, res) => {
  try {
    const { artikel_id, opdracht_id, status } = req.query as Record<string, string | undefined>;

    const conds = [];
    if (artikel_id) conds.push(eq(reserveringenTable.artikelId, Number(artikel_id)));
    if (opdracht_id) conds.push(eq(reserveringenTable.opdrachtId, Number(opdracht_id)));
    if (status) conds.push(eq(reserveringenTable.status, status));

    const rijen = await db.select({
      reservering: reserveringenTable,
      artikel_naam: artikelenTable.naam,
      opdracht_titel: opdrachtenTable.titel,
    })
      .from(reserveringenTable)
      .leftJoin(artikelenTable, eq(reserveringenTable.artikelId, artikelenTable.id))
      .leftJoin(opdrachtenTable, eq(reserveringenTable.opdrachtId, opdrachtenTable.id))
      .where(conds.length > 0 ? and(...(conds as [typeof conds[0], ...typeof conds])) : undefined)
      .orderBy(desc(reserveringenTable.gereserveerdOp));

    res.json(rijen.map(r => mapReservering(r.reservering, { artikel_naam: r.artikel_naam, opdracht_titel: r.opdracht_titel })));
  } catch (err) {
    logger.error({ err }, "magazijn reserveringen fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

router.post("/magazijn/reserveringen", aanmaken, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const artikelId = Number(body.artikel_id);
    const hoeveelheid = num(body.hoeveelheid);
    if (!artikelId || !hoeveelheid || hoeveelheid <= 0) {
      res.status(422).json({ error: "artikel_id en hoeveelheid zijn verplicht" }); return;
    }

    const userId = req.session?.userId as number | undefined;

    // Controleer vrije voorraad vóór de transactie (snelle pre-check)
    const voorraadRijen = await db.select().from(voorraadTable)
      .where(eq(voorraadTable.artikelId, artikelId));
    const totaalVrij = voorraadRijen.reduce((s, v) => s + Math.max(0, v.hoeveelheid - v.gereserveerd), 0);

    if (totaalVrij < hoeveelheid) {
      res.status(409).json({ error: `Onvoldoende vrije voorraad (${totaalVrij} beschikbaar, ${hoeveelheid} gevraagd)` }); return;
    }

    // Alle mutaties binnen één transactie voor atomiciteit
    const res_ = await db.transaction(async (tx) => {
      const [reservering] = await tx.insert(reserveringenTable).values({
        artikelId,
        opdrachtId: body.opdracht_id ? Number(body.opdracht_id) : null,
        hoeveelheid,
        status: "open",
        omschrijving: str(body.omschrijving),
        aangemaaktDoorId: userId ?? null,
      }).returning();

      // Reserveer per voorraad-rij (FIFO over locaties)
      let resterend = hoeveelheid;
      for (const v of voorraadRijen) {
        const vrij = Math.max(0, v.hoeveelheid - v.gereserveerd);
        if (vrij <= 0 || resterend <= 0) continue;
        const te = Math.min(vrij, resterend);
        await tx.update(voorraadTable)
          .set({ gereserveerd: sql`${voorraadTable.gereserveerd} + ${te}`, bijgewerktOp: new Date() })
          .where(eq(voorraadTable.id, v.id));
        await tx.insert(voorraadMutatiesTable).values({
          artikelId,
          locatieId: v.locatieId,
          type: "reservering",
          hoeveelheid: te,
          delta: 0,
          referentieType: "reservering",
          referentieId: reservering.id,
          gebruikerId: userId ?? null,
          omschrijving: str(body.omschrijving),
        });
        resterend -= te;
      }

      return reservering;
    });

    const [artikel] = await db.select({ naam: artikelenTable.naam }).from(artikelenTable).where(eq(artikelenTable.id, artikelId)).limit(1);
    res.status(201).json(mapReservering(res_, { artikel_naam: artikel?.naam ?? null }));
  } catch (err) {
    logger.error({ err }, "magazijn reservering aanmaken fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

router.patch("/magazijn/reserveringen/:id/annuleer", schrijven, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [reservering] = await db.select().from(reserveringenTable).where(eq(reserveringenTable.id, id)).limit(1);
    if (!reservering) { res.status(404).json({ error: "Reservering niet gevonden" }); return; }
    if (reservering.status === "geannuleerd") { res.status(409).json({ error: "Al geannuleerd" }); return; }

    const userId = req.session?.userId as number | undefined;

    // Haal de oorspronkelijke reserverings-mutaties op (één per betrokken voorraad-rij)
    // zodat we exact per rij vrijgeven en niet een blind per-artikel update doen.
    const resMutaties = await db.select().from(voorraadMutatiesTable)
      .where(and(
        eq(voorraadMutatiesTable.referentieType, "reservering"),
        eq(voorraadMutatiesTable.referentieId, id),
        eq(voorraadMutatiesTable.type, "reservering"),
      ));

    const bijgewerkt = await db.transaction(async (tx) => {
      // Vrijgave per betrokken voorraad-rij
      for (const m of resMutaties) {
        const whereExpr = m.locatieId != null
          ? and(eq(voorraadTable.artikelId, reservering.artikelId), eq(voorraadTable.locatieId, m.locatieId))
          : and(eq(voorraadTable.artikelId, reservering.artikelId), sql`${voorraadTable.locatieId} IS NULL`);
        await tx.update(voorraadTable)
          .set({ gereserveerd: sql`GREATEST(0, ${voorraadTable.gereserveerd} - ${m.hoeveelheid})`, bijgewerktOp: new Date() })
          .where(whereExpr);
        await tx.insert(voorraadMutatiesTable).values({
          artikelId: reservering.artikelId,
          locatieId: m.locatieId,
          type: "vrijgave",
          hoeveelheid: m.hoeveelheid,
          delta: 0,
          referentieType: "reservering",
          referentieId: id,
          gebruikerId: userId ?? null,
          omschrijving: "Reservering geannuleerd",
        });
      }

      // Fallback: als er geen mutatie-rijen zijn (legacy/manueel), gebruik totaal
      if (resMutaties.length === 0) {
        await tx.update(voorraadTable)
          .set({ gereserveerd: sql`GREATEST(0, ${voorraadTable.gereserveerd} - ${reservering.hoeveelheid})`, bijgewerktOp: new Date() })
          .where(eq(voorraadTable.artikelId, reservering.artikelId));
      }

      const [r] = await tx.update(reserveringenTable)
        .set({ status: "geannuleerd", bijgewerktOp: new Date() })
        .where(eq(reserveringenTable.id, id))
        .returning();
      return r;
    });

    res.json(mapReservering(bijgewerkt));
  } catch (err) {
    logger.error({ err }, "magazijn reservering annuleer fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ═══════════════════════════════════════════════════════════
// UITGIFTES
// ═══════════════════════════════════════════════════════════

router.post("/magazijn/uitgiftes", aanmaken, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const opdrachtId = body.opdracht_id ? Number(body.opdracht_id) : null;
    const regels = (body.regels ?? []) as Array<{ artikel_id: number; hoeveelheid: number; locatie_id?: number | null; reservering_id?: number | null }>;

    if (!regels.length) { res.status(422).json({ error: "Minimaal één artikel is verplicht" }); return; }

    const userId = req.session?.userId as number | undefined;

    // Pre-validatie: controleer per regel of er voldoende (vrije) voorraad is.
    // Bij een gekoppelde reservering telt de gereserveerde hoeveelheid mee als beschikbaar.
    for (const regel of regels) {
      const artikelId = Number(regel.artikel_id);
      const hoeveelheid = Number(regel.hoeveelheid);
      const locatieId = regel.locatie_id ? Number(regel.locatie_id) : null;

      const voorraadRijen = await db.select().from(voorraadTable)
        .where(eq(voorraadTable.artikelId, artikelId));

      if (regel.reservering_id) {
        // Uitgifte via reservering: totale hoeveelheid (incl. gereserveerd) moet volstaan
        const totaal = voorraadRijen.reduce((s, v) => s + (v.hoeveelheid ?? 0), 0);
        if (totaal < hoeveelheid) {
          res.status(409).json({
            error: `Onvoldoende voorraad voor artikel ${artikelId}: ${totaal} aanwezig, ${hoeveelheid} gevraagd`,
          }); return;
        }
      } else {
        // Directe uitgifte: alleen vrije voorraad op de gevraagde locatie
        const beschikbaar = locatieId != null
          ? voorraadRijen.filter(v => v.locatieId === locatieId).reduce((s, v) => s + Math.max(0, v.hoeveelheid - v.gereserveerd), 0)
          : voorraadRijen.reduce((s, v) => s + Math.max(0, v.hoeveelheid - v.gereserveerd), 0);
        if (beschikbaar < hoeveelheid) {
          res.status(409).json({
            error: `Onvoldoende vrije voorraad voor artikel ${artikelId}: ${beschikbaar} vrij, ${hoeveelheid} gevraagd`,
          }); return;
        }
      }
    }

    // Voer alle mutaties atomisch uit
    await db.transaction(async (tx) => {
      for (const regel of regels) {
        const artikelId = Number(regel.artikel_id);
        const hoeveelheid = Number(regel.hoeveelheid);
        const locatieId = regel.locatie_id ? Number(regel.locatie_id) : null;

        if (regel.reservering_id) {
          const resId = Number(regel.reservering_id);

          // Haal de originele reserverings-mutaties op voor per-rij vrijgave
          const resMutaties = await tx.select().from(voorraadMutatiesTable)
            .where(and(
              eq(voorraadMutatiesTable.referentieType, "reservering"),
              eq(voorraadMutatiesTable.referentieId, resId),
              eq(voorraadMutatiesTable.type, "reservering"),
            ));

          let resterendUitgifte = hoeveelheid;

          if (resMutaties.length > 0) {
            for (const m of resMutaties) {
              if (resterendUitgifte <= 0) break;
              const teNemen = Math.min(m.hoeveelheid, resterendUitgifte);
              const whereExpr = m.locatieId != null
                ? and(eq(voorraadTable.artikelId, artikelId), eq(voorraadTable.locatieId, m.locatieId))
                : and(eq(voorraadTable.artikelId, artikelId), sql`${voorraadTable.locatieId} IS NULL`);

              // Verlaag hoeveelheid én gereserveerd samen op de juiste rij
              await tx.update(voorraadTable)
                .set({
                  hoeveelheid: sql`GREATEST(0, ${voorraadTable.hoeveelheid} - ${teNemen})`,
                  gereserveerd: sql`GREATEST(0, ${voorraadTable.gereserveerd} - ${teNemen})`,
                  bijgewerktOp: new Date(),
                })
                .where(whereExpr);

              await tx.insert(voorraadMutatiesTable).values({
                artikelId,
                locatieId: m.locatieId,
                type: "uitgifte",
                hoeveelheid: teNemen,
                delta: -teNemen,
                referentieType: opdrachtId ? "opdracht" : "reservering",
                referentieId: opdrachtId ?? resId,
                gebruikerId: userId ?? null,
                omschrijving: str(body.omschrijving),
              });
              resterendUitgifte -= teNemen;
            }

            // Valideer dat alles geleverd kon worden; anders transactie terugdraaien
            if (resterendUitgifte > 0) {
              throw new Error(
                `Uitgifte onvolledig: ${hoeveelheid - resterendUitgifte} van ${hoeveelheid} leverbaar voor artikel ${artikelId}`,
              );
            }
          } else {
            // Fallback: geen mutatie-rijen beschikbaar (legacy) → neem via bijwerkenVoorraad
            await bijwerkenVoorraad(tx, artikelId, locatieId, -hoeveelheid, "uitgifte", userId,
              opdrachtId ? "opdracht" : "reservering", opdrachtId ?? resId, str(body.omschrijving));
            await tx.update(voorraadTable)
              .set({ gereserveerd: sql`GREATEST(0, ${voorraadTable.gereserveerd} - ${hoeveelheid})`, bijgewerktOp: new Date() })
              .where(eq(voorraadTable.artikelId, artikelId));
          }

          // Markeer reservering als volledig NADAT alle mutaties geslaagd zijn
          const uitgegevenHoeveelheid = hoeveelheid - resterendUitgifte;
          const nieuweStatus = uitgegevenHoeveelheid >= hoeveelheid ? "volledig" : "gedeeltelijk";
          await tx.update(reserveringenTable)
            .set({ status: nieuweStatus, bijgewerktOp: new Date() })
            .where(eq(reserveringenTable.id, resId));
        } else {
          // Directe uitgifte zonder reservering
          await bijwerkenVoorraad(tx, artikelId, locatieId, -hoeveelheid, "uitgifte", userId,
            opdrachtId ? "opdracht" : null, opdrachtId, str(body.omschrijving));
        }
      }
    });

    res.status(201).json({ ok: true, opdracht_id: opdrachtId, regels: regels.map(r => ({ artikel_id: r.artikel_id, hoeveelheid: r.hoeveelheid })) });
  } catch (err) {
    logger.error({ err }, "magazijn uitgifte fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ═══════════════════════════════════════════════════════════
// RETOUREN
// ═══════════════════════════════════════════════════════════

router.post("/magazijn/retouren", aanmaken, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const opdrachtId = body.opdracht_id ? Number(body.opdracht_id) : null;
    const regels = (body.regels ?? []) as Array<{ artikel_id: number; hoeveelheid: number; locatie_id?: number | null; conditie: "goed" | "defect" | "afval" }>;

    if (!regels.length) { res.status(422).json({ error: "Minimaal één artikel is verplicht" }); return; }

    const userId = req.session?.userId as number | undefined;

    await db.transaction(async (tx) => {
      for (const regel of regels) {
        const artikelId = Number(regel.artikel_id);
        const hoeveelheid = Number(regel.hoeveelheid);
        const locatieId = regel.locatie_id ? Number(regel.locatie_id) : null;
        const conditie = regel.conditie ?? "goed";

        if (conditie === "goed") {
          // Goede retour: voorraad omhoog
          await bijwerkenVoorraad(tx, artikelId, locatieId, hoeveelheid, "retour", userId,
            opdrachtId ? "opdracht" : null, opdrachtId,
            `Retour (${conditie}) van ${opdrachtId ? `opdracht ${opdrachtId}` : "onbekend"}`);
        } else {
          // Defect/afval: enkel loggen (geen voorraadwijziging)
          await tx.insert(voorraadMutatiesTable).values({
            artikelId,
            locatieId,
            type: "retour",
            hoeveelheid,
            delta: 0,
            referentieType: opdrachtId ? "opdracht" : null,
            referentieId: opdrachtId,
            gebruikerId: userId ?? null,
            omschrijving: `Retour (${conditie}) — niet teruggeplaatst`,
          });
        }
      }
    });

    res.status(201).json({ ok: true, opdracht_id: opdrachtId });
  } catch (err) {
    logger.error({ err }, "magazijn retour fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── VERPLAATSINGEN ──────────────────────────────────────────────────────────
router.post("/magazijn/verplaatsingen", aanmaken, async (req, res) => {
  try {
    const body = req.body as {
      artikel_id: number;
      hoeveelheid: number;
      van_locatie_id?: number | null;
      naar_locatie_id: number;
      omschrijving?: string;
    };
    const artikelId = Number(body.artikel_id);
    const hoeveelheid = Number(body.hoeveelheid);
    const vanLocatieId = body.van_locatie_id ? Number(body.van_locatie_id) : null;
    const naarLocatieId = Number(body.naar_locatie_id);
    const userId = (req.session as { gebruikerId?: number }).gebruikerId ?? null;

    if (!artikelId || !hoeveelheid || hoeveelheid <= 0 || !naarLocatieId) {
      return res.status(400).json({ error: "Ongeldige invoer: artikel_id, hoeveelheid (>0) en naar_locatie_id zijn verplicht" });
    }

    if (vanLocatieId === naarLocatieId) {
      return res.status(400).json({ error: "Van- en naar-locatie zijn gelijk" });
    }

    const omschrijving = String(body.omschrijving ?? "Verplaatsing");

    await db.transaction(async (tx) => {
      // Afname van-locatie
      const voorraadVan = vanLocatieId != null
        ? await tx.select().from(voorraadTable)
            .where(and(eq(voorraadTable.artikelId, artikelId), eq(voorraadTable.locatieId, vanLocatieId)))
        : await tx.select().from(voorraadTable)
            .where(and(eq(voorraadTable.artikelId, artikelId), sql`${voorraadTable.locatieId} IS NULL`));

      const beschikbaar = voorraadVan.reduce((s, v) => s + Math.max(0, v.hoeveelheid - v.gereserveerd), 0);
      if (beschikbaar < hoeveelheid) {
        throw new Error(`Onvoldoende vrije voorraad op de bronlocatie (beschikbaar: ${beschikbaar})`);
      }

      // Afname van bronlocatie
      if (vanLocatieId != null) {
        const rij = voorraadVan[0];
        if (rij) {
          const nieuweHoeveelheid = rij.hoeveelheid - hoeveelheid;
          await tx.update(voorraadTable).set({ hoeveelheid: nieuweHoeveelheid, bijgewerktOp: new Date() })
            .where(eq(voorraadTable.id, rij.id));
        }
      } else {
        const rij = voorraadVan[0];
        if (rij) {
          const nieuweHoeveelheid = rij.hoeveelheid - hoeveelheid;
          await tx.update(voorraadTable).set({ hoeveelheid: nieuweHoeveelheid, bijgewerktOp: new Date() })
            .where(eq(voorraadTable.id, rij.id));
        }
      }

      // Mutatie van-locatie
      await tx.insert(voorraadMutatiesTable).values({
        artikelId,
        locatieId: vanLocatieId,
        type: "verplaatsing",
        hoeveelheid: 0,
        delta: -hoeveelheid,
        referentieType: null,
        referentieId: null,
        gebruikerId: userId,
        omschrijving,
        aangemaaktOp: new Date(),
      });

      // Toevoeging naar-locatie
      const voorraadNaar = await tx.select().from(voorraadTable)
        .where(and(eq(voorraadTable.artikelId, artikelId), eq(voorraadTable.locatieId, naarLocatieId)));

      if (voorraadNaar.length > 0) {
        await tx.update(voorraadTable).set({
          hoeveelheid: voorraadNaar[0].hoeveelheid + hoeveelheid,
          bijgewerktOp: new Date(),
        }).where(eq(voorraadTable.id, voorraadNaar[0].id));
      } else {
        await tx.insert(voorraadTable).values({
          artikelId,
          locatieId: naarLocatieId,
          hoeveelheid,
          gereserveerd: 0,
          besteld: 0,
          bijgewerktOp: new Date(),
        });
      }

      // Mutatie naar-locatie
      await tx.insert(voorraadMutatiesTable).values({
        artikelId,
        locatieId: naarLocatieId,
        type: "verplaatsing",
        hoeveelheid: 0,
        delta: hoeveelheid,
        referentieType: null,
        referentieId: null,
        gebruikerId: userId,
        omschrijving,
        aangemaaktOp: new Date(),
      });
    });

    return res.status(201).json({ ok: true });
  } catch (err: unknown) {
    logger.error({ err }, "magazijn verplaatsing fout");
    const msg = err instanceof Error ? err.message : "Serverfout";
    return res.status(400).json({ error: msg });
  }
});

// ── BESTELBONNEN ──────────────────────────────────────────────────────────────
router.post("/magazijn/bestelbonnen", aanmaken, async (req, res) => {
  try {
    const body = req.body as {
      leverancier_id?: number | null;
      notities?: string;
      verstuur_email?: boolean;
      regels: Array<{ artikel_id: number; hoeveelheid: number }>;
    };
    const regels = body.regels ?? [];
    const userId = (req.session as { gebruikerId?: number }).gebruikerId ?? null;

    const artikelIds = [...new Set(regels.map(r => Number(r.artikel_id)))];
    const artikelen = artikelIds.length > 0
      ? await db.select().from(artikelenTable).where(sql`${artikelenTable.id} = ANY(ARRAY[${sql.join(artikelIds.map(id => sql`${id}`), sql`, `)}]::int[])`)
      : [];

    let leverancier: { id: number; naam: string; email: string | null } | null = null;
    if (body.leverancier_id) {
      const [lev] = await db.select({
        id: leveranciersTable.id,
        naam: leveranciersTable.naam,
        email: leveranciersTable.email,
      }).from(leveranciersTable).where(eq(leveranciersTable.id, body.leverancier_id));
      leverancier = lev ?? null;
    }

    const datumStr = new Date().toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" });

    if (body.verstuur_email) {
      const naarEmail = leverancier?.email ?? process.env.MAIL_FROM ?? null;
      if (!naarEmail) {
        return res.status(400).json({ error: "Geen e-mailadres beschikbaar voor de leverancier" });
      }

      const regelsHtml = regels.map(r => {
        const art = artikelen.find(a => a.id === Number(r.artikel_id));
        return `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${art?.naam ?? `Artikel ${r.artikel_id}`}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;color:#6b7280">${art?.code ?? "—"}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${r.hoeveelheid}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${art?.eenheid ?? ""}</td>
        </tr>`;
      }).join("");

      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#F23B0D;padding:20px 24px;border-radius:8px 8px 0 0">
            <h1 style="color:#fff;margin:0;font-size:20px">Bestelbon FPS Brandpreventie</h1>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
            <p style="color:#374151;margin:0 0 16px"><strong>Datum:</strong> ${datumStr}</p>
            ${leverancier ? `<p style="color:#374151;margin:0 0 16px"><strong>Leverancier:</strong> ${leverancier.naam}</p>` : ""}
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
              <thead>
                <tr style="background:#f9fafb">
                  <th style="padding:8px 10px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase">Artikel</th>
                  <th style="padding:8px 10px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase">Code</th>
                  <th style="padding:8px 10px;text-align:right;font-size:12px;color:#6b7280;text-transform:uppercase">Aantal</th>
                  <th style="padding:8px 10px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase">Eenheid</th>
                </tr>
              </thead>
              <tbody>${regelsHtml}</tbody>
            </table>
            ${body.notities ? `<p style="color:#374151;background:#f9fafb;padding:12px;border-radius:6px"><strong>Opmerkingen:</strong> ${body.notities}</p>` : ""}
          </div>
        </div>`;

      await verstuurMail({
        naarEmail,
        naarNaam: leverancier?.naam ?? undefined,
        onderwerp: `Bestelbon FPS Brandpreventie — ${datumStr}`,
        html,
        soort: "magazijn_bestelbon",
        verstuurdDoorId: userId,
      });

      return res.json({ email_verstuurd: true, bericht: `Bestelbon verstuurd naar ${naarEmail}` });
    }

    return res.json({ email_verstuurd: false, bericht: "Bestelbon aangemaakt (geen e-mail verstuurd)" });
  } catch (err: unknown) {
    logger.error({ err }, "magazijn bestelbon fout");
    if (err instanceof MailFout) {
      return res.status(503).json({ error: "E-mail kon niet worden verstuurd. Controleer de mailconfiguratie." });
    }
    return res.status(500).json({ error: "Fout bij verwerken bestelbon" });
  }
});

// ═══════════════════════════════════════════════════════════
// Stellingscans — AI-gestuurde voorraadcontrole via foto
// ═══════════════════════════════════════════════════════════

type StellingsscanSuggestie = {
  artikel_id: number;
  code: string | null;
  naam: string;
  eenheid: string | null;
  huidige_voorraad: number | null;
  minimum_voorraad: number | null;
  advies_hoeveelheid: number;
  reden: string;
  prioriteit: string;
};

function mapStellingsscan(row: typeof magazijnStellingscansTable.$inferSelect) {
  return {
    id: row.id,
    scan_type: row.scanType,
    foto_pad: row.fotoPad,
    locatie_id: row.locatieId,
    status: row.status,
    aangemaakt_op: row.aangemaaktOp?.toISOString() ?? new Date().toISOString(),
    goedgekeurd_op: row.goedgekeurdOp?.toISOString() ?? null,
    retour_project_id: row.retourProjectId ?? null,
    retour_omschrijving: row.retourOmschrijving ?? null,
    ai_suggesties: (row.aiSuggesties as StellingsscanSuggestie[]) ?? [],
  };
}

// Upload-URL ophalen voor stellingfoto
router.post("/magazijn/stellingscans/upload-url", schrijven, async (_req, res) => {
  try {
    const storage = new ObjectStorageService();
    const { uploadURL, objectPath } = await storage.getObjectEntityUploadURL(null, "algemeen");
    return res.json({ upload_url: uploadURL, object_path: objectPath });
  } catch (err) {
    logger.error({ err }, "magazijn stellingsscan upload-url fout");
    return res.status(500).json({ error: "Kon upload-URL niet genereren" });
  }
});

// Stellingfoto registreren + synchrone AI-analyse
router.post("/magazijn/stellingscans", schrijven, async (req, res) => {
  try {
    const {
      foto_pad,
      locatie_id,
      scan_type,
      retour_project_id,
      retour_omschrijving,
    } = req.body as {
      foto_pad?: string;
      locatie_id?: number;
      scan_type?: string;
      retour_project_id?: number;
      retour_omschrijving?: string;
    };
    if (!foto_pad) return res.status(400).json({ error: "foto_pad is verplicht" });

    const isRetour = scan_type === "retour";
    const userId = (req.session as { userId?: number }).userId ?? null;

    // Scan aanmaken met status "analyseren"
    const [scan] = await db
      .insert(magazijnStellingscansTable)
      .values({
        scanType: isRetour ? "retour" : "voorraadcontrole",
        fotoPad: foto_pad,
        locatieId: locatie_id ?? null,
        aangemaaaktDoorId: userId,
        status: "analyseren",
        retourProjectId: retour_project_id ?? null,
        retourOmschrijving: retour_omschrijving ?? null,
      })
      .returning();

    // Artikelcatalogus met huidige voorraad ophalen
    const artikelen = await db
      .select({
        id: artikelenTable.id,
        code: artikelenTable.code,
        naam: artikelenTable.naam,
        eenheid: artikelenTable.eenheid,
        minimumVoorraad: artikelenTable.minimumVoorraad,
      })
      .from(artikelenTable)
      .orderBy(asc(artikelenTable.naam));

    const voorraadRijen = await db
      .select({
        artikelId: voorraadTable.artikelId,
        totaal: sql<number>`SUM(${voorraadTable.hoeveelheid})`.mapWith(Number),
      })
      .from(voorraadTable)
      .groupBy(voorraadTable.artikelId);

    const voorraadMap = new Map(voorraadRijen.map((v) => [v.artikelId, v.totaal]));

    // AI Vision analyse (optioneel — vereist OpenAI)
    let aiSuggesties: StellingsscanSuggestie[] = [];

    if (heeftOpenAi()) {
      try {
        const storage = new ObjectStorageService();
        const resp = await storage.downloadObject(foto_pad);
        const buffer = Buffer.from(await resp.arrayBuffer());

        const sharp = (await import("sharp")).default;
        const fotoBase64 = (
          await sharp(buffer)
            .resize({ width: 1024, withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer()
        ).toString("base64");

        const artikelContext = artikelen
          .slice(0, 200)
          .map((a) => {
            const huidig = voorraadMap.get(a.id) ?? 0;
            return `${a.code ?? a.id} | ${a.naam} | ${a.eenheid ?? "st"} | huidig: ${huidig}`;
          })
          .join("\n");

        const openai = maakOpenAiClient();

        let systemPrompt: string;
        let userText: string;

        if (isRetour) {
          // Locaties ophalen voor retour-plaatsadvies
          const locaties = await db
            .select({ id: magazijnLocatiesTable.id, naam: magazijnLocatiesTable.naam, type: magazijnLocatiesTable.type })
            .from(magazijnLocatiesTable)
            .where(eq(magazijnLocatiesTable.actief, true))
            .orderBy(asc(magazijnLocatiesTable.naam));

          const locatieContext = locaties
            .map((l) => `${l.id} | ${l.naam} | ${l.type}`)
            .join("\n");

          systemPrompt = `Je bent een ervaren magazijnbeheerder bij FPS Brandpreventie, een brandpreventie-installatiebedrijf.
Je analyseert een foto van geretourneerde artikelen vanuit een project en adviseert waar ze opgeborgen moeten worden.

Beschikbare artikelen in het systeem (CODE | NAAM | EENHEID | HUIDIGE VOORRAAD):
${artikelContext}

Beschikbare magazijnlocaties (ID | NAAM | TYPE):
${locatieContext}

INSTRUCTIES:
1. Identificeer de zichtbare geretourneerde artikelen op de foto (verpakking, label, kleur, code).
2. Koppel elk artikel aan de juiste artikel_id uit de lijst.
3. Schat de hoeveelheid van elk artikel op de foto.
4. Stel de meest logische magazijnlocatie voor op basis van het type artikel en de beschikbare locaties.
5. Geef een korte toelichting waarom die locatie het meest geschikt is.
6. Als een artikel niet herkend wordt, sla het over.

Geef uitsluitend geldige JSON in dit formaat:
{
  "suggesties": [
    {
      "artikel_id": <integer uit de artikelenlijst>,
      "code": "<artikelcode of null>",
      "naam": "<artikelnaam>",
      "eenheid": "<eenheid>",
      "huidige_voorraad": <huidige voorraad in systeem of null>,
      "minimum_voorraad": null,
      "advies_hoeveelheid": <geschatte retourhoeveelheid>,
      "reden": "<waarom deze locatie>",
      "prioriteit": "middel",
      "aanbevolen_locatie_id": <integer uit de locatielijst of null>,
      "aanbevolen_locatie_naam": "<locatienaam of null>"
    }
  ]
}`;
          userText = "Analyseer deze foto van geretourneerde artikelen en stel per artikel een opberglocatie voor in het magazijn.";
        } else {
          systemPrompt = `Je bent een ervaren magazijnbeheerder bij FPS Brandpreventie, een brandpreventie-installatiebedrijf.
Je analyseert een foto van een magazijnstelling en bepaalt welke artikelen bijbesteld moeten worden.

Beschikbare artikelen (CODE | NAAM | EENHEID | HUIDIG | MINIMUM):
${artikelContext}

INSTRUCTIES:
1. Identificeer zichtbare artikelen op de foto aan de hand van verpakking, label, kleur of code.
2. Vergelijk zichtbare hoeveelheid met de minimumvoorraad uit de lijst.
3. Geef alleen besteladviezen voor artikelen die (bijna) leeg zijn of onder minimum dreigen te komen.
4. Bereken advies_hoeveelheid als minimaal (minimum_voorraad * 2) of inschatting bij onbekend minimum.
5. Als geen artikelen herkend worden, geef een lege suggesties-array.

Geef uitsluitend geldige JSON in dit formaat:
{
  "suggesties": [
    {
      "artikel_id": <integer uit de lijst>,
      "code": "<artikelcode of null>",
      "naam": "<artikelnaam>",
      "eenheid": "<eenheid>",
      "huidige_voorraad": <geschatte zichtbare hoeveelheid of null>,
      "minimum_voorraad": <minimum uit de lijst of null>,
      "advies_hoeveelheid": <aanbevolen bestelquantum>,
      "reden": "<korte Nederlandse toelichting>",
      "prioriteit": "hoog",
      "aanbevolen_locatie_id": null,
      "aanbevolen_locatie_naam": null
    }
  ]
}
Prioriteit: "hoog" = leeg of <50% minimum, "middel" = 50-100% minimum, "laag" = licht onder minimum.`;
          userText = "Analyseer deze stellingfoto en geef besteladviezen voor artikelen die bijbesteld moeten worden.";
        }

        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          max_tokens: 3000,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: userText },
                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${fotoBase64}`, detail: "high" } },
              ],
            },
          ],
        });

        const rawText = completion.choices[0]?.message?.content ?? "{}";
        try {
          const parsed = JSON.parse(rawText) as { suggesties?: unknown };
          if (Array.isArray(parsed.suggesties)) {
            aiSuggesties = parsed.suggesties as StellingsscanSuggestie[];
          }
        } catch {
          // parse fout — lege suggesties bewaren
        }
      } catch (err) {
        logger.warn({ err }, "magazijn stellingsscan AI-analyse fout");
      }
    }

    // Scan bijwerken met resultaten
    const [updated] = await db
      .update(magazijnStellingscansTable)
      .set({ status: "gereed", aiSuggesties })
      .where(eq(magazijnStellingscansTable.id, scan.id))
      .returning();

    return res.status(201).json(mapStellingsscan(updated));
  } catch (err) {
    logger.error({ err }, "magazijn stellingsscan aanmaken fout");
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// Lijst van stellingscans (meest recent eerst)
router.get("/magazijn/stellingscans", lezen, async (_req, res) => {
  try {
    const rijen = await db
      .select()
      .from(magazijnStellingscansTable)
      .orderBy(desc(magazijnStellingscansTable.aangemaaktOp));
    return res.json(rijen.map(mapStellingsscan));
  } catch (err) {
    logger.error({ err }, "magazijn stellingscans ophalen fout");
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// Enkele stellingsscan ophalen
router.get("/magazijn/stellingscans/:id", lezen, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [row] = await db
      .select()
      .from(magazijnStellingscansTable)
      .where(eq(magazijnStellingscansTable.id, id));
    if (!row) return res.status(404).json({ error: "Scan niet gevonden" });
    return res.json(mapStellingsscan(row));
  } catch (err) {
    logger.error({ err }, "magazijn stellingsscan ophalen fout");
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// Goedkeuren: voorraad bijwerken + log mutaties + markeer goedgekeurd
// - voorraadcontrole: update voorraad.besteld (bestelvoorstel)
// - retour: update voorraad.hoeveelheid op de aanbevolen locatie (retour)
router.post("/magazijn/stellingscans/:id/goedkeuren", schrijven, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const userId = (req.session as { userId?: number }).userId ?? null;

    const [scan] = await db
      .select()
      .from(magazijnStellingscansTable)
      .where(eq(magazijnStellingscansTable.id, id));
    if (!scan) return res.status(404).json({ error: "Scan niet gevonden" });
    if (scan.status === "goedgekeurd") {
      return res.status(409).json({ error: "Scan is al goedgekeurd" });
    }

    const { artikelen } = req.body as {
      artikelen: Array<{ artikel_id: number; hoeveelheid: number; locatie_id?: number }>;
    };
    if (!Array.isArray(artikelen) || artikelen.length === 0) {
      return res.status(400).json({ error: "Geen artikelen opgegeven" });
    }

    const isRetour = scan.scanType === "retour";

    for (const item of artikelen) {
      if (!item.artikel_id || item.hoeveelheid <= 0) continue;

      if (isRetour) {
        // Retour: hoeveelheid toevoegen aan voorraad op de aanbevolen locatie
        const doelLocatieId = item.locatie_id ?? null;

        const bestaandQuery = db
          .select()
          .from(voorraadTable)
          .where(eq(voorraadTable.artikelId, item.artikel_id));

        const [bestaand] = doelLocatieId
          ? await bestaandQuery.where(eq(voorraadTable.locatieId, doelLocatieId)).limit(1)
          : await bestaandQuery.limit(1);

        if (bestaand) {
          await db
            .update(voorraadTable)
            .set({
              hoeveelheid: sql`${voorraadTable.hoeveelheid} + ${item.hoeveelheid}`,
              bijgewerktOp: new Date(),
            })
            .where(eq(voorraadTable.id, bestaand.id));
          await db.insert(voorraadMutatiesTable).values({
            artikelId: item.artikel_id,
            locatieId: bestaand.locatieId ?? null,
            type: "retour",
            hoeveelheid: item.hoeveelheid,
            delta: item.hoeveelheid,
            omschrijving: `Retourscan #${id} goedgekeurd${scan.retourProjectId ? ` — project #${scan.retourProjectId}` : ""}`,
            gebruikerId: userId,
          });
        } else {
          // Geen bestaand voorraadrecord op die locatie — aanmaken
          await db.insert(voorraadTable).values({
            artikelId: item.artikel_id,
            locatieId: doelLocatieId,
            hoeveelheid: item.hoeveelheid,
            gereserveerd: 0,
            besteld: 0,
          });
          await db.insert(voorraadMutatiesTable).values({
            artikelId: item.artikel_id,
            locatieId: doelLocatieId,
            type: "retour",
            hoeveelheid: item.hoeveelheid,
            delta: item.hoeveelheid,
            omschrijving: `Retourscan #${id} goedgekeurd${scan.retourProjectId ? ` — project #${scan.retourProjectId}` : ""}`,
            gebruikerId: userId,
          });
        }
      } else {
        // Voorraadcontrole: besteld ophogen (bestelvoorstel)
        const [bestaand] = await db
          .select()
          .from(voorraadTable)
          .where(eq(voorraadTable.artikelId, item.artikel_id))
          .limit(1);

        if (bestaand) {
          await db
            .update(voorraadTable)
            .set({ besteld: sql`${voorraadTable.besteld} + ${item.hoeveelheid}` })
            .where(eq(voorraadTable.id, bestaand.id));
          await db.insert(voorraadMutatiesTable).values({
            artikelId: item.artikel_id,
            locatieId: bestaand.locatieId ?? null,
            type: "bestelvoorstel",
            hoeveelheid: item.hoeveelheid,
            delta: item.hoeveelheid,
            omschrijving: `Stellingsscan #${id} goedgekeurd`,
            gebruikerId: userId,
          });
        } else {
          await db.insert(voorraadTable).values({
            artikelId: item.artikel_id,
            hoeveelheid: 0,
            gereserveerd: 0,
            besteld: item.hoeveelheid,
          });
          await db.insert(voorraadMutatiesTable).values({
            artikelId: item.artikel_id,
            locatieId: null,
            type: "bestelvoorstel",
            hoeveelheid: item.hoeveelheid,
            delta: item.hoeveelheid,
            omschrijving: `Stellingsscan #${id} goedgekeurd`,
            gebruikerId: userId,
          });
        }
      }
    }

    const [updated] = await db
      .update(magazijnStellingscansTable)
      .set({ status: "goedgekeurd", goedgekeurdOp: new Date(), goedgekeurdDoorId: userId })
      .where(eq(magazijnStellingscansTable.id, id))
      .returning();

    return res.json(mapStellingsscan(updated));
  } catch (err) {
    logger.error({ err }, "magazijn stellingsscan goedkeuren fout");
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

logger.info("magazijn router geladen");

export default router;
