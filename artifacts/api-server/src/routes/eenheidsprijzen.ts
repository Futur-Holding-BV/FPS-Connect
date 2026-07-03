import { Router } from "express";
import { db, eenheidsprijzenTable } from "@workspace/db";
import { eq, ilike, and, or, desc } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";

const router = Router();

const lezen = requireBevoegdheid("calculaties", 1);
const schrijven = requireBevoegdheid("calculaties", 2);
const verwijderen = requireBevoegdheid("calculaties", 4);

function parseId(v: unknown): number {
  return parseInt(String(v), 10);
}

function mapRij(r: typeof eenheidsprijzenTable.$inferSelect) {
  return {
    id: r.id,
    code: r.code,
    omschrijving: r.omschrijving,
    categorie: r.categorie,
    eenheid: r.eenheid,
    materiaalcomponent: r.materiaalcomponent,
    arbeidscomponent: r.arbeidscomponent,
    normtijd: r.normtijd,
    kostprijs: r.kostprijs,
    verkoopprijs: r.verkoopprijs,
    marge: r.marge,
    btw_code: r.btwCode ?? null,
    geldig_vanaf: r.geldigVanaf ?? null,
    actief: r.actief,
    opmerkingen: r.opmerkingen ?? null,
    inclusies: r.inclusies ?? null,
    exclusies: r.exclusies ?? null,
    prijsbasis_opmerking: r.prijsbasisOpmerking ?? null,
    gem_werkelijk_uren: r.gemWerkelijkUren ?? null,
    gem_werkelijk_materiaal: r.gemWerkelijkMateriaal ?? null,
    aantal_keer_gebruikt: r.aantalKeerGebruikt,
    afwijking_normtijd: r.afwijkingNormtijd ?? null,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
  };
}

router.get("/eenheidsprijzen", lezen, async (req, res) => {
  try {
    const { zoek, categorie, actief } = req.query as Record<string, string>;

    const filters = [];
    if (zoek) {
      filters.push(
        or(
          ilike(eenheidsprijzenTable.code, `%${zoek}%`),
          ilike(eenheidsprijzenTable.omschrijving, `%${zoek}%`),
        ),
      );
    }
    if (categorie && categorie !== "__alle__") {
      filters.push(eq(eenheidsprijzenTable.categorie, categorie));
    }
    if (actief !== undefined) {
      filters.push(eq(eenheidsprijzenTable.actief, actief !== "false"));
    }

    const rijen =
      filters.length > 0
        ? await db
            .select()
            .from(eenheidsprijzenTable)
            .where(and(...filters))
            .orderBy(eenheidsprijzenTable.categorie, eenheidsprijzenTable.code)
        : await db
            .select()
            .from(eenheidsprijzenTable)
            .orderBy(eenheidsprijzenTable.categorie, eenheidsprijzenTable.code);

    res.json(rijen.map(mapRij));
  } catch (err) {
    req.log.error({ err }, "eenheidsprijzen ophalen mislukt");
    res.status(500).json({ error: "Fout bij ophalen" });
  }
});

router.post("/eenheidsprijzen", schrijven, async (req, res) => {
  try {
    const body = req.body as {
      code: string;
      omschrijving: string;
      categorie: string;
      eenheid: string;
      materiaalcomponent?: number;
      arbeidscomponent?: number;
      normtijd?: number;
      kostprijs?: number;
      verkoopprijs?: number;
      marge?: number;
      btw_code?: string;
      geldig_vanaf?: string;
      actief?: boolean;
      opmerkingen?: string;
      inclusies?: string;
      exclusies?: string;
      prijsbasis_opmerking?: string;
    };

    if (!body.code || !body.omschrijving || !body.categorie || !body.eenheid) {
      return void res.status(400).json({ error: "Code, omschrijving, categorie en eenheid zijn verplicht" });
    }
    if (!body.kostprijs && !body.verkoopprijs) {
      return void res.status(400).json({ error: "Kostprijs of verkoopprijs is verplicht" });
    }

    const [rij] = await db
      .insert(eenheidsprijzenTable)
      .values({
        code: body.code.trim(),
        omschrijving: body.omschrijving.trim(),
        categorie: body.categorie,
        eenheid: body.eenheid,
        materiaalcomponent: body.materiaalcomponent ?? 0,
        arbeidscomponent: body.arbeidscomponent ?? 0,
        normtijd: body.normtijd ?? 0,
        kostprijs: body.kostprijs ?? 0,
        verkoopprijs: body.verkoopprijs ?? 0,
        marge: body.marge ?? 0,
        btwCode: body.btw_code ?? null,
        geldigVanaf: body.geldig_vanaf ?? null,
        actief: body.actief ?? true,
        opmerkingen: body.opmerkingen ?? null,
        inclusies: body.inclusies ?? null,
        exclusies: body.exclusies ?? null,
        prijsbasisOpmerking: body.prijsbasis_opmerking ?? null,
      })
      .returning();

    if (!rij) return void res.status(500).json({ error: "Aanmaken mislukt" });
    res.status(201).json(mapRij(rij));
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("unique")) {
      return void res.status(409).json({ error: "Code bestaat al" });
    }
    req.log.error({ err }, "eenheidsprijs aanmaken mislukt");
    res.status(500).json({ error: "Fout bij aanmaken" });
  }
});

router.get("/eenheidsprijzen/template", lezen, (_req, res) => {
  res.json({ redirect: "/api/import/template/eenheidsprijzen" });
});

router.get("/eenheidsprijzen/:id", lezen, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const [rij] = await db.select().from(eenheidsprijzenTable).where(eq(eenheidsprijzenTable.id, id));
    if (!rij) return void res.status(404).json({ error: "Niet gevonden" });
    res.json(mapRij(rij));
  } catch (err) {
    req.log.error({ err }, "eenheidsprijs ophalen mislukt");
    res.status(500).json({ error: "Fout bij ophalen" });
  }
});

router.patch("/eenheidsprijzen/:id", schrijven, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const body = req.body as Partial<{
      code: string;
      omschrijving: string;
      categorie: string;
      eenheid: string;
      materiaalcomponent: number;
      arbeidscomponent: number;
      normtijd: number;
      kostprijs: number;
      verkoopprijs: number;
      marge: number;
      btw_code: string | null;
      geldig_vanaf: string | null;
      actief: boolean;
      opmerkingen: string | null;
      inclusies: string | null;
      exclusies: string | null;
      prijsbasis_opmerking: string | null;
    }>;

    const updates: Partial<typeof eenheidsprijzenTable.$inferInsert> = {
      bijgewerktOp: new Date(),
    };
    if (body.code !== undefined) updates.code = body.code;
    if (body.omschrijving !== undefined) updates.omschrijving = body.omschrijving;
    if (body.categorie !== undefined) updates.categorie = body.categorie;
    if (body.eenheid !== undefined) updates.eenheid = body.eenheid;
    if (body.materiaalcomponent !== undefined) updates.materiaalcomponent = body.materiaalcomponent;
    if (body.arbeidscomponent !== undefined) updates.arbeidscomponent = body.arbeidscomponent;
    if (body.normtijd !== undefined) updates.normtijd = body.normtijd;
    if (body.kostprijs !== undefined) updates.kostprijs = body.kostprijs;
    if (body.verkoopprijs !== undefined) updates.verkoopprijs = body.verkoopprijs;
    if (body.marge !== undefined) updates.marge = body.marge;
    if (body.btw_code !== undefined) updates.btwCode = body.btw_code;
    if (body.geldig_vanaf !== undefined) updates.geldigVanaf = body.geldig_vanaf;
    if (body.actief !== undefined) updates.actief = body.actief;
    if (body.opmerkingen !== undefined) updates.opmerkingen = body.opmerkingen;
    if (body.inclusies !== undefined) updates.inclusies = body.inclusies;
    if (body.exclusies !== undefined) updates.exclusies = body.exclusies;
    if (body.prijsbasis_opmerking !== undefined) updates.prijsbasisOpmerking = body.prijsbasis_opmerking;

    const [rij] = await db
      .update(eenheidsprijzenTable)
      .set(updates)
      .where(eq(eenheidsprijzenTable.id, id))
      .returning();

    if (!rij) return void res.status(404).json({ error: "Niet gevonden" });
    res.json(mapRij(rij));
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("unique")) {
      return void res.status(409).json({ error: "Code bestaat al" });
    }
    req.log.error({ err }, "eenheidsprijs bijwerken mislukt");
    res.status(500).json({ error: "Fout bij bijwerken" });
  }
});

router.delete("/eenheidsprijzen/:id", verwijderen, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const [rij] = await db
      .update(eenheidsprijzenTable)
      .set({ actief: false, bijgewerktOp: new Date() })
      .where(eq(eenheidsprijzenTable.id, id))
      .returning();
    if (!rij) return void res.status(404).json({ error: "Niet gevonden" });
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "eenheidsprijs deactiveren mislukt");
    res.status(500).json({ error: "Fout bij deactiveren" });
  }
});

export default router;
