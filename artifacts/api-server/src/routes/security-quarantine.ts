import { Router, type Request, type Response } from "express";
import { db, securityIntakeScansTable } from "@workspace/db";
import { eq, desc, and, gte, lte, or, ilike, count, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

function alleenBeheerder(
  req: Parameters<typeof requireAuth>[0],
  res: Parameters<typeof requireAuth>[1],
  next: Parameters<typeof requireAuth>[2],
) {
  requireAuth(req, res, () => {
    const rol = req.session?.rol;
    if (rol !== "hoofdbeheerder" && rol !== "gebruiker") {
      res.status(403).json({ error: "Alleen beheerders kunnen quarantaine-items beoordelen" });
      return;
    }
    next();
  });
}

function alleenHoofdbeheerder(
  req: Parameters<typeof requireAuth>[0],
  res: Parameters<typeof requireAuth>[1],
  next: Parameters<typeof requireAuth>[2],
) {
  requireAuth(req, res, () => {
    if (req.session?.rol !== "hoofdbeheerder") {
      res.status(403).json({ error: "Alleen hoofdbeheerders hebben toegang" });
      return;
    }
    next();
  });
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

router.get("/security/dashboard", alleenBeheerder, async (_req, res) => {
  try {
    const nu = new Date();
    const vandaagStart = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
    const morgen = new Date(vandaagStart);
    morgen.setDate(morgen.getDate() + 1);

    const [totalen, quarantaineTotaal, geblokkeerdTotaal] = await Promise.all([
      db
        .select({
          niveau: securityIntakeScansTable.risicoNiveau,
          aantal: count(),
        })
        .from(securityIntakeScansTable)
        .where(
          and(
            gte(securityIntakeScansTable.aangemaaktOp, vandaagStart),
            lte(securityIntakeScansTable.aangemaaktOp, morgen),
          ),
        )
        .groupBy(securityIntakeScansTable.risicoNiveau),
      db
        .select({ aantal: count() })
        .from(securityIntakeScansTable)
        .where(
          and(
            eq(securityIntakeScansTable.inQuarantaine, true),
            sql`${securityIntakeScansTable.beoordeeldDoorId} IS NULL`,
          ),
        ),
      db
        .select({ aantal: count() })
        .from(securityIntakeScansTable)
        .where(eq(securityIntakeScansTable.actie, "geblokkeerd")),
    ]);

    const stats: Record<string, number> = {};
    for (const rij of totalen) stats[rij.niveau] = Number(rij.aantal);

    const recente = await db
      .select()
      .from(securityIntakeScansTable)
      .orderBy(desc(securityIntakeScansTable.aangemaaktOp))
      .limit(20);

    res.json({
      vandaag: stats,
      quarantainePending: Number(quarantaineTotaal[0]?.aantal ?? 0),
      totaalGeblokkeerd: Number(geblokkeerdTotaal[0]?.aantal ?? 0),
      recente,
    });
  } catch (err) {
    res.status(500).json({ error: "Fout bij ophalen dashboard" });
  }
});

// ── Scanlog (audit) ────────────────────────────────────────────────────────────

router.get("/security/scans", alleenBeheerder, async (req, res) => {
  try {
    const pagina = Math.max(1, parseInt(String(Array.isArray(req.query.pagina) ? req.query.pagina[0] : req.query.pagina ?? "1"), 10));
    const perPagina = 50;
    const offset = (pagina - 1) * perPagina;
    const niveau = String(Array.isArray(req.query.niveau) ? req.query.niveau[0] : req.query.niveau ?? "");
    const zoek = String(Array.isArray(req.query.zoek) ? req.query.zoek[0] : req.query.zoek ?? "").trim();
    const bronFilter = String(Array.isArray(req.query.bron) ? req.query.bron[0] : req.query.bron ?? "");
    const vanRaw = Array.isArray(req.query.van) ? req.query.van[0] : req.query.van;
    const totRaw = Array.isArray(req.query.tot) ? req.query.tot[0] : req.query.tot;
    const van = vanRaw ? new Date(String(vanRaw)) : null;
    const tot = totRaw ? new Date(String(totRaw)) : null;

    const filters = [];
    if (niveau) filters.push(eq(securityIntakeScansTable.risicoNiveau, niveau));
    if (zoek) {
      filters.push(
        or(
          ilike(securityIntakeScansTable.bestandsnaam, `%${zoek}%`),
          ilike(securityIntakeScansTable.gebruikerNaam, `%${zoek}%`),
          ilike(securityIntakeScansTable.blokkeerReden, `%${zoek}%`),
        ),
      );
    }
    if (bronFilter) filters.push(eq(securityIntakeScansTable.uploadBron, bronFilter));
    if (van) filters.push(gte(securityIntakeScansTable.aangemaaktOp, van));
    if (tot) filters.push(lte(securityIntakeScansTable.aangemaaktOp, tot));

    const where = filters.length > 0 ? and(...filters) : undefined;

    const [rijen, totaalRijen] = await Promise.all([
      db
        .select()
        .from(securityIntakeScansTable)
        .where(where)
        .orderBy(desc(securityIntakeScansTable.aangemaaktOp))
        .limit(perPagina)
        .offset(offset),
      db
        .select({ aantal: count() })
        .from(securityIntakeScansTable)
        .where(where),
    ]);

    res.json({
      scans: rijen,
      totaal: Number(totaalRijen[0]?.aantal ?? 0),
      pagina,
      perPagina,
    });
  } catch {
    res.status(500).json({ error: "Fout bij ophalen scans" });
  }
});

// ── Quarantaine-overzicht ─────────────────────────────────────────────────────

router.get("/security/quarantaine", alleenBeheerder, async (req, res) => {
  try {
    const status = String(req.query.status ?? "pending");
    let where;
    if (status === "pending") {
      where = and(
        eq(securityIntakeScansTable.inQuarantaine, true),
        sql`${securityIntakeScansTable.beoordeeldDoorId} IS NULL`,
      );
    } else if (status === "vrijgegeven") {
      where = and(
        eq(securityIntakeScansTable.inQuarantaine, true),
        eq(securityIntakeScansTable.actie, "toegestaan"),
        sql`${securityIntakeScansTable.beoordeeldDoorId} IS NOT NULL`,
      );
    } else if (status === "geweigerd") {
      where = and(
        eq(securityIntakeScansTable.actie, "geblokkeerd"),
        sql`${securityIntakeScansTable.beoordeeldDoorId} IS NOT NULL`,
      );
    } else {
      where = eq(securityIntakeScansTable.inQuarantaine, true);
    }

    const rijen = await db
      .select()
      .from(securityIntakeScansTable)
      .where(where)
      .orderBy(desc(securityIntakeScansTable.aangemaaktOp))
      .limit(100);

    res.json({ items: rijen });
  } catch {
    res.status(500).json({ error: "Fout bij ophalen quarantaine" });
  }
});

// ── Scan-detail ───────────────────────────────────────────────────────────────

router.get("/security/scans/:id", alleenBeheerder, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const [rij] = await db
      .select()
      .from(securityIntakeScansTable)
      .where(eq(securityIntakeScansTable.id, id));
    if (!rij) return void res.status(404).json({ error: "Scan niet gevonden" });
    res.json(rij);
  } catch {
    res.status(500).json({ error: "Fout bij ophalen scan" });
  }
});

// ── Vrijgeven uit quarantaine ─────────────────────────────────────────────────

router.post("/security/quarantaine/:id/vrijgeven", alleenBeheerder, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const opmerking = String(req.body?.opmerking ?? "").trim();
    const gebruikerId = req.session.userId!;
    const gebruikerNaam = String(gebruikerId);

    const [bestaand] = await db
      .select({ id: securityIntakeScansTable.id, actie: securityIntakeScansTable.actie })
      .from(securityIntakeScansTable)
      .where(eq(securityIntakeScansTable.id, id));

    if (!bestaand) {
      res.status(404).json({ error: "Quarantaine-item niet gevonden" });
      return;
    }

    await db
      .update(securityIntakeScansTable)
      .set({
        actie: "toegestaan",
        risicoNiveau: "groen",
        beoordeeldDoorId: gebruikerId,
        beoordeeldDoorNaam: gebruikerNaam,
        beoordelingOpmerking: opmerking || null,
        beoordeeldOp: new Date(),
        bijgewerktOp: new Date(),
      })
      .where(eq(securityIntakeScansTable.id, id));

    res.json({ bericht: "Item vrijgegeven" });
  } catch {
    res.status(500).json({ error: "Fout bij vrijgeven" });
  }
});

// ── Weigeren (definitief blokkeren) ──────────────────────────────────────────

router.post("/security/quarantaine/:id/weigeren", alleenHoofdbeheerder, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const opmerking = String(req.body?.opmerking ?? "").trim();
    const gebruikerId = req.session.userId!;
    const gebruikerNaam = String(gebruikerId);

    const [bestaand] = await db
      .select({ id: securityIntakeScansTable.id })
      .from(securityIntakeScansTable)
      .where(eq(securityIntakeScansTable.id, id));

    if (!bestaand) {
      res.status(404).json({ error: "Item niet gevonden" });
      return;
    }

    await db
      .update(securityIntakeScansTable)
      .set({
        actie: "geblokkeerd",
        risicoNiveau: "geblokkeerd",
        inQuarantaine: false,
        beoordeeldDoorId: gebruikerId,
        beoordeeldDoorNaam: gebruikerNaam,
        beoordelingOpmerking: opmerking || null,
        beoordeeldOp: new Date(),
        bijgewerktOp: new Date(),
      })
      .where(eq(securityIntakeScansTable.id, id));

    res.json({ bericht: "Item definitief geweigerd" });
  } catch {
    res.status(500).json({ error: "Fout bij weigeren" });
  }
});

// ── Statistieken ──────────────────────────────────────────────────────────────

router.get("/security/statistieken", alleenHoofdbeheerder, async (_req, res) => {
  try {
    const dertigDagenGeleden = new Date();
    dertigDagenGeleden.setDate(dertigDagenGeleden.getDate() - 30);

    const [perNiveau, perBron, perActie, totaalClamav] = await Promise.all([
      db
        .select({ niveau: securityIntakeScansTable.risicoNiveau, aantal: count() })
        .from(securityIntakeScansTable)
        .where(gte(securityIntakeScansTable.aangemaaktOp, dertigDagenGeleden))
        .groupBy(securityIntakeScansTable.risicoNiveau),
      db
        .select({ bron: securityIntakeScansTable.uploadBron, aantal: count() })
        .from(securityIntakeScansTable)
        .where(gte(securityIntakeScansTable.aangemaaktOp, dertigDagenGeleden))
        .groupBy(securityIntakeScansTable.uploadBron),
      db
        .select({ actie: securityIntakeScansTable.actie, aantal: count() })
        .from(securityIntakeScansTable)
        .where(gte(securityIntakeScansTable.aangemaaktOp, dertigDagenGeleden))
        .groupBy(securityIntakeScansTable.actie),
      db
        .select({ aantal: count() })
        .from(securityIntakeScansTable)
        .where(
          and(
            gte(securityIntakeScansTable.aangemaaktOp, dertigDagenGeleden),
            eq(securityIntakeScansTable.clamavStatus, "groen"),
          ),
        ),
    ]);

    res.json({ perNiveau, perBron, perActie, clamavGescand: Number(totaalClamav[0]?.aantal ?? 0) });
  } catch {
    res.status(500).json({ error: "Fout bij ophalen statistieken" });
  }
});

export default router;
