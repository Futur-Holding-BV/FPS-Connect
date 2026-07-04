import { Router } from "express";
import { db, leveranciersTable, artikelenTable } from "@workspace/db";
import { eq, ilike, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import { requireBevoegdheid } from "../middlewares/auth";

const router = Router();

const lezen    = requireBevoegdheid("magazijn", 1);
const schrijven = requireBevoegdheid("magazijn", 2);
const aanmaken = requireBevoegdheid("magazijn", 3);
const beheer   = requireBevoegdheid("magazijn", 4);

// ── GET /leveranciers ──────────────────────────────────────────────────────────
router.get("/leveranciers", lezen, async (req, res): Promise<void> => {
  try {
    const { zoek, actief, categorie } = req.query as Record<string, string | undefined>;

    const zoekCond = zoek ? ilike(leveranciersTable.naam, `%${zoek}%`) : undefined;
    const actiefCond = actief !== undefined ? eq(leveranciersTable.actief, actief === "true") : undefined;
    const categorieCond = categorie ? eq(leveranciersTable.categorie, categorie) : undefined;
    const actieveConds = [zoekCond, actiefCond, categorieCond].filter(Boolean) as Parameters<typeof and>;

    const rijen = await db
      .select()
      .from(leveranciersTable)
      .where(actieveConds.length > 0 ? and(...actieveConds) : undefined)
      .orderBy(leveranciersTable.naam);

    res.json(rijen.map(mapLeverancier));
  } catch (err) {
    req.log.error({ err }, "leveranciers ophalen mislukt");
    res.status(500).json({ error: "Fout bij ophalen leveranciers" });
  }
});

// ── POST /leveranciers ─────────────────────────────────────────────────────────
router.post("/leveranciers", aanmaken, async (req, res): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const naam = String(body.naam ?? "").trim();
    if (!naam) return void res.status(422).json({ error: "Naam is verplicht" });

    const [nieuw] = await db
      .insert(leveranciersTable)
      .values(maakLeverancierValues(body, "handmatig"))
      .returning();

    res.status(201).json(mapLeverancier(nieuw));
  } catch (err) {
    req.log.error({ err }, "leverancier aanmaken mislukt");
    res.status(500).json({ error: "Fout bij aanmaken leverancier" });
  }
});

// ── GET /leveranciers/:id ──────────────────────────────────────────────────────
router.get("/leveranciers/:id", lezen, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [rij] = await db.select().from(leveranciersTable).where(eq(leveranciersTable.id, id)).limit(1);
    if (!rij) return void res.status(404).json({ error: "Leverancier niet gevonden" });
    res.json(mapLeverancier(rij));
  } catch (err) {
    req.log.error({ err }, "leverancier ophalen mislukt");
    res.status(500).json({ error: "Fout bij ophalen leverancier" });
  }
});

// ── PATCH /leveranciers/:id ────────────────────────────────────────────────────
router.patch("/leveranciers/:id", schrijven, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const body = req.body as Record<string, unknown>;

    const [bijgewerkt] = await db
      .update(leveranciersTable)
      .set({ ...maakLeverancierValues(body), bijgewerktOp: new Date() })
      .where(eq(leveranciersTable.id, id))
      .returning();

    if (!bijgewerkt) return void res.status(404).json({ error: "Leverancier niet gevonden" });
    res.json(mapLeverancier(bijgewerkt));
  } catch (err) {
    req.log.error({ err }, "leverancier bijwerken mislukt");
    res.status(500).json({ error: "Fout bij bijwerken leverancier" });
  }
});

// ── DELETE /leveranciers/:id ───────────────────────────────────────────────────
router.delete("/leveranciers/:id", beheer, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    await db.delete(leveranciersTable).where(eq(leveranciersTable.id, id));
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "leverancier verwijderen mislukt");
    res.status(500).json({ error: "Fout bij verwijderen leverancier" });
  }
});

// ── GET /leveranciers/:id/artikelen ───────────────────────────────────────────
router.get("/leveranciers/:id/artikelen", lezen, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const rijen = await db
      .select()
      .from(artikelenTable)
      .where(eq(artikelenTable.leverancierId, id))
      .orderBy(artikelenTable.naam);

    res.json(rijen.map(mapArtikel));
  } catch (err) {
    req.log.error({ err }, "leverancier artikelen ophalen mislukt");
    res.status(500).json({ error: "Fout bij ophalen artikelen" });
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

function maakLeverancierValues(body: Record<string, unknown>, bron?: string) {
  return {
    naam: String(body.naam ?? "").trim() || "Onbekend",
    code: str(body.code),
    adres: str(body.adres),
    huisnummer: str(body.huisnummer),
    postcode: str(body.postcode),
    stad: str(body.stad),
    provincie: str(body.provincie),
    land: str(body.land) ?? "Nederland",
    contactpersoon: str(body.contactpersoon),
    contactFunctie: str(body.contact_functie),
    contactEmail: str(body.contact_email),
    contactTelefoon: str(body.contact_telefoon),
    contactMobiel: str(body.contact_mobiel),
    email: str(body.email),
    telefoon: str(body.telefoon),
    website: str(body.website),
    kvkNummer: str(body.kvk_nummer),
    btwNummer: str(body.btw_nummer),
    iban: str(body.iban),
    bic: str(body.bic),
    bankNaam: str(body.bank_naam),
    tNamVan: str(body.t_nam_van),
    betalingstermijnDagen: typeof body.betalingstermijn_dagen === "number"
      ? body.betalingstermijn_dagen
      : (num(body.betalingstermijn_dagen) ?? 30),
    kortingspercentage: num(body.kortingspercentage) !== null ? Math.round(num(body.kortingspercentage)!) : null,
    categorie: str(body.categorie),
    productcategorieen: str(body.productcategorieen),
    notities: str(body.notities),
    actief: body.actief !== undefined ? Boolean(body.actief) : true,
    grootboekrekening: str(body.grootboekrekening),
    kostenplaats: str(body.kostenplaats),
    btwCodeDefault: str(body.btw_code_default),
    relatiecode: str(body.relatiecode),
    ...(bron ? { bron } : {}),
  };
}

type LeverancierRij = typeof leveranciersTable.$inferSelect;

function mapLeverancier(r: LeverancierRij) {
  return {
    id: r.id,
    code: r.code,
    naam: r.naam,
    adres: r.adres,
    huisnummer: r.huisnummer,
    postcode: r.postcode,
    stad: r.stad,
    provincie: r.provincie,
    land: r.land,
    contactpersoon: r.contactpersoon,
    contact_functie: r.contactFunctie,
    contact_email: r.contactEmail,
    contact_telefoon: r.contactTelefoon,
    contact_mobiel: r.contactMobiel,
    email: r.email,
    telefoon: r.telefoon,
    website: r.website,
    kvk_nummer: r.kvkNummer,
    btw_nummer: r.btwNummer,
    iban: r.iban,
    bic: r.bic,
    bank_naam: r.bankNaam,
    t_nam_van: r.tNamVan,
    betalingstermijn_dagen: r.betalingstermijnDagen,
    kortingspercentage: r.kortingspercentage,
    categorie: r.categorie,
    productcategorieen: r.productcategorieen,
    notities: r.notities,
    actief: r.actief,
    bron: r.bron,
    grootboekrekening: r.grootboekrekening ?? null,
    kostenplaats: r.kostenplaats ?? null,
    btw_code_default: r.btwCodeDefault ?? null,
    relatiecode: r.relatiecode ?? null,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
  };
}

function mapArtikel(r: { id: number; code: string | null; naam: string; omschrijving: string | null; eenheid: string; categorie: string | null; inkoopprijs: number | null; verkoopprijs: number | null; btwPercentage: number; leverancierId: number | null; notities: string | null; actief: boolean; bron: string; aangemaaktOp: Date; bijgewerktOp: Date }) {
  return {
    id: r.id,
    code: r.code,
    naam: r.naam,
    omschrijving: r.omschrijving,
    eenheid: r.eenheid,
    categorie: r.categorie,
    inkoopprijs: r.inkoopprijs,
    verkoopprijs: r.verkoopprijs,
    btw_percentage: r.btwPercentage,
    leverancier_id: r.leverancierId,
    leverancier_naam: null,
    notities: r.notities,
    actief: r.actief,
    bron: r.bron,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
  };
}

logger.info("leveranciers router geladen");

export default router;
