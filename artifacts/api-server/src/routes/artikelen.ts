import { Router } from "express";
import { db, artikelenTable, leveranciersTable } from "@workspace/db";
import { eq, ilike, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import { requireBevoegdheid } from "../middlewares/auth";
import type { SQL } from "drizzle-orm";

type ArtikelRij = typeof artikelenTable.$inferSelect;

const router = Router();

const lezen    = requireBevoegdheid("magazijn", 1);
const schrijven = requireBevoegdheid("magazijn", 2);
const aanmaken = requireBevoegdheid("magazijn", 3);
const beheer   = requireBevoegdheid("magazijn", 4);

// ── GET /artikelen ─────────────────────────────────────────────────────────────
router.get("/artikelen", lezen, async (req, res) => {
  try {
    const { zoek, leverancier_id, categorie, actief, barcode } = req.query as Record<string, string | undefined>;

    const zoekCond = zoek ? ilike(artikelenTable.naam, `%${zoek}%`) : undefined;
    const leverancierCond = leverancier_id ? eq(artikelenTable.leverancierId, Number(leverancier_id)) : undefined;
    const categorieCond = categorie ? eq(artikelenTable.categorie, categorie) : undefined;
    const actiefCond = actief !== undefined ? eq(artikelenTable.actief, actief === "true") : undefined;
    const barcodeCond = barcode ? eq(artikelenTable.barcode, barcode) : undefined;
    const actieveConds = [zoekCond, leverancierCond, categorieCond, actiefCond, barcodeCond].filter(Boolean) as SQL[];

    const rijen = await db
      .select({
        artikel: artikelenTable,
        leverancier_naam: leveranciersTable.naam,
      })
      .from(artikelenTable)
      .leftJoin(leveranciersTable, eq(artikelenTable.leverancierId, leveranciersTable.id))
      .where(actieveConds.length > 0 ? and(...(actieveConds as [SQL, ...SQL[]])) : undefined)
      .orderBy(artikelenTable.naam);

    res.json(
      rijen.map((r) => mapArtikel(r.artikel, r.leverancier_naam ?? null)),
    );
  } catch (err) {
    req.log.error({ err }, "artikelen ophalen mislukt");
    res.status(500).json({ error: "Fout bij ophalen artikelen" });
  }
});

// ── POST /artikelen ────────────────────────────────────────────────────────────
router.post("/artikelen", aanmaken, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const naam = String(body.naam ?? "").trim();
    if (!naam) return res.status(422).json({ error: "Naam is verplicht" });

    const [nieuw] = await db
      .insert(artikelenTable)
      .values(maakArtikelValues(body, "handmatig"))
      .returning();

    res.status(201).json(mapArtikel(nieuw, null));
  } catch (err) {
    req.log.error({ err }, "artikel aanmaken mislukt");
    res.status(500).json({ error: "Fout bij aanmaken artikel" });
  }
});

// ── GET /artikelen/:id ─────────────────────────────────────────────────────────
router.get("/artikelen/:id", lezen, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [rij] = await db
      .select({ artikel: artikelenTable, leverancier_naam: leveranciersTable.naam })
      .from(artikelenTable)
      .leftJoin(leveranciersTable, eq(artikelenTable.leverancierId, leveranciersTable.id))
      .where(eq(artikelenTable.id, id))
      .limit(1);

    if (!rij) return res.status(404).json({ error: "Artikel niet gevonden" });
    res.json(mapArtikel(rij.artikel, rij.leverancier_naam));
  } catch (err) {
    req.log.error({ err }, "artikel ophalen mislukt");
    res.status(500).json({ error: "Fout bij ophalen artikel" });
  }
});

// ── PATCH /artikelen/:id ───────────────────────────────────────────────────────
router.patch("/artikelen/:id", schrijven, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body as Record<string, unknown>;

    const [bijgewerkt] = await db
      .update(artikelenTable)
      .set({ ...maakArtikelValues(body), bijgewerktOp: new Date() })
      .where(eq(artikelenTable.id, id))
      .returning();

    if (!bijgewerkt) return res.status(404).json({ error: "Artikel niet gevonden" });
    res.json(mapArtikel(bijgewerkt, null));
  } catch (err) {
    req.log.error({ err }, "artikel bijwerken mislukt");
    res.status(500).json({ error: "Fout bij bijwerken artikel" });
  }
});

// ── DELETE /artikelen/:id ──────────────────────────────────────────────────────
router.delete("/artikelen/:id", beheer, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(artikelenTable).where(eq(artikelenTable.id, id));
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "artikel verwijderen mislukt");
    res.status(500).json({ error: "Fout bij verwijderen artikel" });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function str(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  return String(v);
}

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function maakArtikelValues(body: Record<string, unknown>, bron?: string) {
  return {
    code: str(body.code),
    naam: String(body.naam ?? "").trim() || "Onbekend",
    omschrijving: str(body.omschrijving),
    eenheid: str(body.eenheid) ?? "st",
    categorie: str(body.categorie),
    inkoopprijs: num(body.inkoopprijs),
    verkoopprijs: num(body.verkoopprijs),
    btwPercentage: num(body.btw_percentage) !== null ? Math.round(num(body.btw_percentage)!) : 21,
    leverancierId: body.leverancier_id ? Number(body.leverancier_id) : null,
    notities: str(body.notities),
    actief: body.actief !== undefined ? Boolean(body.actief) : true,
    ...(bron ? { bron } : {}),
  };
}

function mapArtikel(r: ArtikelRij, leverancierNaam: string | null) {
  return {
    id: r.id,
    code: r.code,
    naam: r.naam,
    omschrijving: r.omschrijving,
    eenheid: r.eenheid,
    categorie: r.categorie,
    barcode: r.barcode ?? null,
    inkoopprijs: r.inkoopprijs,
    verkoopprijs: r.verkoopprijs,
    btw_percentage: r.btwPercentage,
    leverancier_id: r.leverancierId,
    leverancier_naam: leverancierNaam,
    notities: r.notities,
    actief: r.actief,
    bron: r.bron,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
  };
}

logger.info("artikelen router geladen");

export default router;
