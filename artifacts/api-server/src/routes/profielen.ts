import { Router } from "express";
import { db, profielenTable, gebruikersTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { MODULE_IDS, MAX_NIVEAU, bevoegdhedenGelijk, PRESETS } from "@workspace/permissies";
import { requireBevoegdheid, requireRol } from "../middlewares/auth";

const router = Router();

const GELDIGE_MODULES = new Set<string>(MODULE_IDS);

// Valideer een bevoegdheden-payload: alleen bekende module-sleutels en gehele
// niveaus 0..MAX_NIVEAU. Retourneert een foutmelding bij ongeldige invoer, of
// null wanneer de payload geldig is.
function valideerBevoegdheden(invoer: unknown): {
  bevoegdheden: Record<string, number>;
  fout: string | null;
} {
  if (invoer == null) {
    return { bevoegdheden: {}, fout: null };
  }
  if (typeof invoer !== "object" || Array.isArray(invoer)) {
    return { bevoegdheden: {}, fout: "Bevoegdheden moet een object zijn" };
  }
  const bevoegdheden: Record<string, number> = {};
  for (const [sleutel, waarde] of Object.entries(invoer as Record<string, unknown>)) {
    if (!GELDIGE_MODULES.has(sleutel)) {
      return { bevoegdheden: {}, fout: `Onbekende module: ${sleutel}` };
    }
    if (
      typeof waarde !== "number" ||
      !Number.isInteger(waarde) ||
      waarde < 0 ||
      waarde > MAX_NIVEAU
    ) {
      return {
        bevoegdheden: {},
        fout: `Ongeldig niveau voor module ${sleutel}: niveau moet een geheel getal 0 t/m ${MAX_NIVEAU} zijn`,
      };
    }
    bevoegdheden[sleutel] = waarde;
  }
  return { bevoegdheden, fout: null };
}

type GekoppeldeGebruiker = {
  id: number;
  naam: string;
  rol: string | null;
  gelijk: boolean;
};

function serialiseer(
  p: typeof profielenTable.$inferSelect,
  gebruikers: GekoppeldeGebruiker[] = [],
) {
  return {
    id: p.id,
    naam: p.naam,
    bevoegdheden: (p.bevoegdheden as Record<string, number>) ?? {},
    systeem: p.systeem,
    aangemaakt_op: p.aangemaaktOp.toISOString(),
    gebruiker_aantal: gebruikers.length,
    gebruikers,
  };
}

router.get("/profielen", requireBevoegdheid("gebruikers", 1), async (req, res): Promise<void> => {
  try {
    const [profielen, gebruikers] = await Promise.all([
      db.select().from(profielenTable).orderBy(asc(profielenTable.id)),
      db
        .select({
          id: gebruikersTable.id,
          naam: gebruikersTable.naam,
          rol: gebruikersTable.rol,
          bevoegdheden: gebruikersTable.bevoegdheden,
          herkomstProfielId: gebruikersTable.herkomstProfielId,
        })
        .from(gebruikersTable)
        .orderBy(asc(gebruikersTable.naam)),
    ]);

    const perProfiel = new Map<number, GekoppeldeGebruiker[]>();
    for (const g of gebruikers) {
      if (g.herkomstProfielId == null) continue;
      const lijst = perProfiel.get(g.herkomstProfielId) ?? [];
      lijst.push({ id: g.id, naam: g.naam, rol: g.rol, gelijk: false });
      perProfiel.set(g.herkomstProfielId, lijst);
    }

    const result = profielen.map((p) => {
      const lijst = perProfiel.get(p.id) ?? [];
      const presetBev = (p.bevoegdheden as Record<string, number>) ?? {};
      const idx = new Map(
        gebruikers.map((g) => [
          g.id,
          (g.bevoegdheden as Record<string, number> | null) ?? {},
        ]),
      );
      const verrijkt = lijst.map((g) => ({
        ...g,
        gelijk: bevoegdhedenGelijk(presetBev, idx.get(g.id) ?? {}),
      }));
      return serialiseer(p, verrijkt);
    });
    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/profielen", requireRol("hoofdbeheerder"), async (req, res): Promise<void> => {
  try {
    const naam = String(req.body?.naam ?? "").trim();
    if (!naam) {
      res.status(400).json({ error: "Naam is verplicht" });
      return;
    }
    const { bevoegdheden, fout } = valideerBevoegdheden(req.body?.bevoegdheden);
    if (fout) {
      res.status(400).json({ error: fout });
      return;
    }
    const [bestaand] = await db
      .select({ id: profielenTable.id })
      .from(profielenTable)
      .where(eq(profielenTable.naam, naam));
    if (bestaand) {
      res.status(409).json({ error: "Er bestaat al een profiel met deze naam" });
      return;
    }
    const [nieuw] = await db
      .insert(profielenTable)
      .values({ naam, bevoegdheden, systeem: false })
      .returning();
    res.status(201).json(serialiseer(nieuw));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /profielen/aanvullen — vul in alle profielen de ontbrekende
// module-sleutels aan op niveau 0 (Geen toegang). Effectieve toegang verandert
// niet (0 == ontbrekend); de sleutel wordt alleen expliciet vastgelegd zodat
// nieuwe modules niet stil ontbreken. Moet vóór /profielen/:id staan zodat
// "aanvullen" niet als id wordt geïnterpreteerd.
// POST /profielen/synchroniseer-standaard — maakt ontbrekende systeem-presets aan vanuit PRESETS
// en werkt bestaande systeem-presets bij als hun bevoegdheden afwijken van de definitie.
// Moet vóór /profielen/:id staan zodat "synchroniseer-standaard" niet als id wordt geïnterpreteerd.
router.post("/profielen/synchroniseer-standaard", requireRol("hoofdbeheerder"), async (req, res): Promise<void> => {
  try {
    const bestaand = await db.select().from(profielenTable).where(eq(profielenTable.systeem, true));
    const bestaandMap = new Map(bestaand.map((p) => [p.naam, p]));
    let aangemaakt = 0;
    let bijgewerkt = 0;
    for (const preset of PRESETS) {
      const bestaandeProfiel = bestaandMap.get(preset.naam);
      if (!bestaandeProfiel) {
        await db.insert(profielenTable).values({
          naam: preset.naam,
          bevoegdheden: preset.bevoegdheden,
          systeem: true,
        });
        aangemaakt++;
      } else {
        // Update bevoegdheden als ze afwijken van de huidige PRESETS-definitie
        const huidig = (bestaandeProfiel.bevoegdheden as Record<string, number>) ?? {};
        const gewenst = preset.bevoegdheden as Record<string, number>;
        const isGelijk = JSON.stringify(
          Object.fromEntries(Object.entries(huidig).sort()),
        ) === JSON.stringify(Object.fromEntries(Object.entries(gewenst).sort()));
        if (!isGelijk) {
          await db
            .update(profielenTable)
            .set({ bevoegdheden: preset.bevoegdheden })
            .where(eq(profielenTable.id, bestaandeProfiel.id));
          bijgewerkt++;
        }
      }
    }
    res.json({ aangemaakt, bijgewerkt });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/profielen/aanvullen", requireRol("hoofdbeheerder"), async (req, res): Promise<void> => {
  try {
    const profielen = await db.select().from(profielenTable);
    let profielenAangevuld = 0;
    let sleutelsToegevoegd = 0;
    for (const p of profielen) {
      const huidig = (p.bevoegdheden as Record<string, number>) ?? {};
      const aangevuld: Record<string, number> = { ...huidig };
      let toegevoegd = 0;
      for (const m of MODULE_IDS) {
        if (!(m in aangevuld)) {
          aangevuld[m] = 0;
          toegevoegd++;
        }
      }
      if (toegevoegd > 0) {
        await db
          .update(profielenTable)
          .set({ bevoegdheden: aangevuld })
          .where(eq(profielenTable.id, p.id));
        profielenAangevuld++;
        sleutelsToegevoegd += toegevoegd;
      }
    }
    res.json({
      profielen_aangevuld: profielenAangevuld,
      sleutels_toegevoegd: sleutelsToegevoegd,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/profielen/:id", requireRol("hoofdbeheerder"), async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ongeldig id" });
      return;
    }
    const [profiel] = await db
      .select()
      .from(profielenTable)
      .where(eq(profielenTable.id, id));
    if (!profiel) {
      res.status(404).json({ error: "Profiel niet gevonden" });
      return;
    }
    const naam = String(req.body?.naam ?? "").trim();
    if (!naam) {
      res.status(400).json({ error: "Naam is verplicht" });
      return;
    }
    const { bevoegdheden, fout } = valideerBevoegdheden(req.body?.bevoegdheden);
    if (fout) {
      res.status(400).json({ error: fout });
      return;
    }
    const [naamConflict] = await db
      .select({ id: profielenTable.id })
      .from(profielenTable)
      .where(eq(profielenTable.naam, naam));
    if (naamConflict && naamConflict.id !== id) {
      res.status(409).json({ error: "Er bestaat al een profiel met deze naam" });
      return;
    }
    const [bijgewerkt] = await db
      .update(profielenTable)
      .set({ naam, bevoegdheden })
      .where(eq(profielenTable.id, id))
      .returning();
    res.json(serialiseer(bijgewerkt));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/profielen/:id", requireRol("hoofdbeheerder"), async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ongeldig id" });
      return;
    }
    const [profiel] = await db
      .select()
      .from(profielenTable)
      .where(eq(profielenTable.id, id));
    if (!profiel) {
      res.status(404).json({ error: "Profiel niet gevonden" });
      return;
    }
    if (profiel.systeem) {
      res.status(403).json({ error: "Systeemprofielen kunnen niet worden verwijderd" });
      return;
    }
    await db.delete(profielenTable).where(eq(profielenTable.id, id));
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /profielen/:id/toepassen — preset opnieuw doorvoeren op alle gekoppelde
// gebruikers (herkomstProfielId = id). Overschrijft hun bevoegdheden met de
// huidige preset-waarden.
router.post("/profielen/:id/toepassen", requireRol("hoofdbeheerder"), async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ongeldig id" });
      return;
    }
    const [profiel] = await db
      .select()
      .from(profielenTable)
      .where(eq(profielenTable.id, id));
    if (!profiel) {
      res.status(404).json({ error: "Profiel niet gevonden" });
      return;
    }
    const bevoegdheden = (profiel.bevoegdheden as Record<string, number>) ?? {};
    const bijgewerkt = await db
      .update(gebruikersTable)
      .set({ bevoegdheden })
      .where(eq(gebruikersTable.herkomstProfielId, id))
      .returning({ id: gebruikersTable.id });
    res.json({ bijgewerkt: bijgewerkt.length });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
