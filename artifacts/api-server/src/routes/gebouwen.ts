import { Router } from "express";
import { db } from "@workspace/db";
import {
  gebouwenTable,
  verdiepingenTable,
  voorzieningenTable,
  gebruikersTable,
  gebouwToewijzingenTable,
} from "@workspace/db";
import { eq, inArray, count, and } from "drizzle-orm";
import { requireRol } from "../middlewares/auth";

const router = Router();

const BEHEERDER_ROLLEN = ["beheerder", "hoofdbeheerder"];
const TOEGEWEZEN_ROLLEN = ["monteur", "controleur"];

async function klantNaam(klantId: number | null): Promise<string | null> {
  if (!klantId) return null;
  const [k] = await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, klantId));
  return k?.naam ?? null;
}

async function gebruikerRol(userId: number): Promise<string> {
  const [g] = await db.select({ rol: gebruikersTable.rol }).from(gebruikersTable).where(eq(gebruikersTable.id, userId));
  return g?.rol ?? "viewer";
}

async function toegewezenGebouwIds(userId: number): Promise<number[]> {
  const rows = await db
    .select({ gebouwId: gebouwToewijzingenTable.gebouwId })
    .from(gebouwToewijzingenTable)
    .where(eq(gebouwToewijzingenTable.gebruikerId, userId));
  return rows.map((r) => r.gebouwId);
}

function gebouwRij(g: typeof gebouwenTable.$inferSelect, totaal: number, naam: string | null) {
  return {
    id: g.id,
    naam: g.naam,
    adres: g.adres,
    stad: g.stad,
    postcode: g.postcode,
    omschrijving: g.omschrijving,
    bouwjaar: g.bouwjaar,
    klant_id: g.klantId,
    klant_naam: naam,
    totaal_voorzieningen: totaal,
    aangemaakt_op: g.aangemaaktOp.toISOString(),
  };
}

// GET /gebouwen
router.get("/gebouwen", async (req, res) => {
  try {
    const userId = req.session.userId!;
    const rol = await gebruikerRol(userId);
    const { zoek } = req.query;

    let gebouwen = await db.select().from(gebouwenTable);

    // Monteurs en controleurs zien alleen hun toegewezen gebouwen
    if (TOEGEWEZEN_ROLLEN.includes(rol)) {
      const ids = await toegewezenGebouwIds(userId);
      if (ids.length === 0) {
        return res.json([]);
      }
      gebouwen = gebouwen.filter((g) => ids.includes(g.id));
    }

    if (zoek) {
      const q = (zoek as string).toLowerCase();
      gebouwen = gebouwen.filter(
        (g) =>
          g.naam.toLowerCase().includes(q) ||
          g.adres.toLowerCase().includes(q) ||
          (g.stad ?? "").toLowerCase().includes(q),
      );
    }

    const result = await Promise.all(
      gebouwen.map(async (g) => {
        const [totaal] = await db
          .select({ count: count() })
          .from(voorzieningenTable)
          .where(eq(voorzieningenTable.gebouwId, g.id));
        return gebouwRij(g, Number(totaal?.count ?? 0), await klantNaam(g.klantId));
      }),
    );

    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /gebouwen
router.post("/gebouwen", async (req, res) => {
  try {
    const { naam, adres, stad, postcode, omschrijving, bouwjaar, klant_id } = req.body;
    if (!naam || !adres) {
      return res.status(400).json({ error: "naam en adres zijn verplicht" });
    }
    const [gebouw] = await db
      .insert(gebouwenTable)
      .values({ naam, adres, stad, postcode, omschrijving, bouwjaar, klantId: klant_id })
      .returning();
    res.status(201).json(gebouwRij(gebouw, 0, await klantNaam(gebouw.klantId)));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /gebouwen/:id
router.get("/gebouwen/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const userId = req.session.userId!;
    const rol = await gebruikerRol(userId);

    const [gebouw] = await db.select().from(gebouwenTable).where(eq(gebouwenTable.id, id));
    if (!gebouw) return res.status(404).json({ error: "Gebouw niet gevonden" });

    // Toegangscontrole: monteur/controleur mag alleen toegewezen gebouwen zien
    if (TOEGEWEZEN_ROLLEN.includes(rol)) {
      const ids = await toegewezenGebouwIds(userId);
      if (!ids.includes(id)) {
        return res.status(403).json({ error: "Geen toegang tot dit gebouw" });
      }
    }

    const verdiepingen = await db.select().from(verdiepingenTable).where(eq(verdiepingenTable.gebouwId, id));

    const verdiepingenMet = await Promise.all(
      verdiepingen.map(async (v) => {
        const [totaal] = await db
          .select({ count: count() })
          .from(voorzieningenTable)
          .where(eq(voorzieningenTable.verdiepingId, v.id));
        return {
          id: v.id,
          gebouw_id: v.gebouwId,
          naam: v.naam,
          niveau: v.niveau,
          plattegrond_url: v.plattegrondUrl,
          breedte: v.breedte,
          hoogte: v.hoogte,
          totaal_voorzieningen: Number(totaal?.count ?? 0),
        };
      }),
    );

    const alleVoorzieningen = await db
      .select({ status: voorzieningenTable.status })
      .from(voorzieningenTable)
      .where(eq(voorzieningenTable.gebouwId, id));

    const stats = {
      totaal: alleVoorzieningen.length,
      goedgekeurd: alleVoorzieningen.filter((v) => v.status === "goedgekeurd").length,
      afgekeurd: alleVoorzieningen.filter((v) => v.status === "afgekeurd").length,
      in_bewerking: alleVoorzieningen.filter((v) => v.status === "concept" || v.status === "in_uitvoering").length,
      in_onderhoud: alleVoorzieningen.filter((v) => v.status === "in_onderhoud").length,
    };

    res.json({
      id: gebouw.id,
      naam: gebouw.naam,
      adres: gebouw.adres,
      stad: gebouw.stad,
      postcode: gebouw.postcode,
      omschrijving: gebouw.omschrijving,
      bouwjaar: gebouw.bouwjaar,
      klant_id: gebouw.klantId,
      klant_naam: await klantNaam(gebouw.klantId),
      aangemaakt_op: gebouw.aangemaaktOp.toISOString(),
      verdiepingen: verdiepingenMet,
      stats,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /gebouwen/:id
router.patch("/gebouwen/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { naam, adres, stad, postcode, omschrijving, bouwjaar, klant_id } = req.body;
    const [gebouw] = await db
      .update(gebouwenTable)
      .set({ naam, adres, stad, postcode, omschrijving, bouwjaar, klantId: klant_id, bijgewerktOp: new Date() })
      .where(eq(gebouwenTable.id, id))
      .returning();
    if (!gebouw) return res.status(404).json({ error: "Gebouw niet gevonden" });
    const [totaal] = await db
      .select({ count: count() })
      .from(voorzieningenTable)
      .where(eq(voorzieningenTable.gebouwId, id));
    res.json(gebouwRij(gebouw, Number(totaal?.count ?? 0), await klantNaam(gebouw.klantId)));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// DELETE /gebouwen/:id
router.delete("/gebouwen/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(gebouwenTable).where(eq(gebouwenTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /gebouwen/:id/verdiepingen
router.get("/gebouwen/:id/verdiepingen", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const verdiepingen = await db.select().from(verdiepingenTable).where(eq(verdiepingenTable.gebouwId, id));
    const result = await Promise.all(
      verdiepingen.map(async (v) => {
        const [totaal] = await db
          .select({ count: count() })
          .from(voorzieningenTable)
          .where(eq(voorzieningenTable.verdiepingId, v.id));
        return {
          id: v.id,
          gebouw_id: v.gebouwId,
          naam: v.naam,
          niveau: v.niveau,
          plattegrond_url: v.plattegrondUrl,
          breedte: v.breedte,
          hoogte: v.hoogte,
          totaal_voorzieningen: Number(totaal?.count ?? 0),
        };
      }),
    );
    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /gebouwen/:id/verdiepingen
router.post("/gebouwen/:id/verdiepingen", async (req, res) => {
  try {
    const gebouwId = parseInt(req.params.id);
    const { naam, niveau, plattegrond_url, breedte, hoogte } = req.body;
    const [v] = await db
      .insert(verdiepingenTable)
      .values({ gebouwId, naam, niveau: niveau ?? 0, plattegrondUrl: plattegrond_url, breedte, hoogte })
      .returning();
    res.status(201).json({
      id: v.id,
      gebouw_id: v.gebouwId,
      naam: v.naam,
      niveau: v.niveau,
      plattegrond_url: v.plattegrondUrl,
      breedte: v.breedte,
      hoogte: v.hoogte,
      totaal_voorzieningen: 0,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /verdiepingen/:id
router.get("/verdiepingen/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [v] = await db.select().from(verdiepingenTable).where(eq(verdiepingenTable.id, id));
    if (!v) return res.status(404).json({ error: "Verdieping niet gevonden" });
    const [totaal] = await db
      .select({ count: count() })
      .from(voorzieningenTable)
      .where(eq(voorzieningenTable.verdiepingId, id));
    res.json({
      id: v.id,
      gebouw_id: v.gebouwId,
      naam: v.naam,
      niveau: v.niveau,
      plattegrond_url: v.plattegrondUrl,
      breedte: v.breedte,
      hoogte: v.hoogte,
      totaal_voorzieningen: Number(totaal?.count ?? 0),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /verdiepingen/:id
router.patch("/verdiepingen/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { naam, niveau, plattegrond_url, breedte, hoogte } = req.body;
    const [v] = await db
      .update(verdiepingenTable)
      .set({ naam, niveau, plattegrondUrl: plattegrond_url, breedte, hoogte })
      .where(eq(verdiepingenTable.id, id))
      .returning();
    if (!v) return res.status(404).json({ error: "Verdieping niet gevonden" });
    const [totaal] = await db
      .select({ count: count() })
      .from(voorzieningenTable)
      .where(eq(voorzieningenTable.verdiepingId, id));
    res.json({
      id: v.id,
      gebouw_id: v.gebouwId,
      naam: v.naam,
      niveau: v.niveau,
      plattegrond_url: v.plattegrondUrl,
      breedte: v.breedte,
      hoogte: v.hoogte,
      totaal_voorzieningen: Number(totaal?.count ?? 0),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// DELETE /verdiepingen/:id
router.delete("/verdiepingen/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(verdiepingenTable).where(eq(verdiepingenTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── TOEWIJZINGEN ──────────────────────────────────────────────────────────

// GET /gebouwen/:id/toewijzingen
router.get("/gebouwen/:id/toewijzingen", async (req, res) => {
  try {
    const gebouwId = parseInt(req.params.id);
    const rows = await db
      .select({
        id: gebouwToewijzingenTable.id,
        gebouwId: gebouwToewijzingenTable.gebouwId,
        gebruikerId: gebouwToewijzingenTable.gebruikerId,
        naam: gebruikersTable.naam,
        email: gebruikersTable.email,
        rol: gebruikersTable.rol,
        aangemaaktOp: gebouwToewijzingenTable.aangemaaktOp,
      })
      .from(gebouwToewijzingenTable)
      .innerJoin(gebruikersTable, eq(gebouwToewijzingenTable.gebruikerId, gebruikersTable.id))
      .where(eq(gebouwToewijzingenTable.gebouwId, gebouwId));

    res.json(
      rows.map((r) => ({
        id: r.id,
        gebouw_id: r.gebouwId,
        gebruiker_id: r.gebruikerId,
        naam: r.naam,
        email: r.email,
        rol: r.rol,
        aangemaakt_op: r.aangemaaktOp.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /gebouwen/:id/toewijzingen — alleen beheerder
router.post(
  "/gebouwen/:id/toewijzingen",
  requireRol("beheerder", "hoofdbeheerder"),
  async (req, res) => {
    try {
      const gebouwId = parseInt(req.params.id);
      const { gebruiker_id } = req.body ?? {};
      if (!gebruiker_id) {
        return res.status(400).json({ error: "gebruiker_id is verplicht" });
      }

      // Controleer of gebruiker bestaat
      const [gebruiker] = await db
        .select({ id: gebruikersTable.id, naam: gebruikersTable.naam, email: gebruikersTable.email, rol: gebruikersTable.rol })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, Number(gebruiker_id)));
      if (!gebruiker) {
        return res.status(404).json({ error: "Gebruiker niet gevonden" });
      }

      const [toewijzing] = await db
        .insert(gebouwToewijzingenTable)
        .values({
          gebouwId,
          gebruikerId: Number(gebruiker_id),
          aangemaaktDoorId: req.session.userId,
        })
        .onConflictDoNothing()
        .returning();

      if (!toewijzing) {
        // Al toegewezen — retourneer bestaande
        const [bestaand] = await db
          .select({ id: gebouwToewijzingenTable.id, aangemaaktOp: gebouwToewijzingenTable.aangemaaktOp })
          .from(gebouwToewijzingenTable)
          .where(
            and(
              eq(gebouwToewijzingenTable.gebouwId, gebouwId),
              eq(gebouwToewijzingenTable.gebruikerId, Number(gebruiker_id)),
            ),
          );
        return res.status(201).json({
          id: bestaand!.id,
          gebouw_id: gebouwId,
          gebruiker_id: gebruiker.id,
          naam: gebruiker.naam,
          email: gebruiker.email,
          rol: gebruiker.rol,
          aangemaakt_op: bestaand!.aangemaaktOp.toISOString(),
        });
      }

      res.status(201).json({
        id: toewijzing.id,
        gebouw_id: gebouwId,
        gebruiker_id: gebruiker.id,
        naam: gebruiker.naam,
        email: gebruiker.email,
        rol: gebruiker.rol,
        aangemaakt_op: toewijzing.aangemaaktOp.toISOString(),
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// DELETE /gebouwen/:id/toewijzingen/:gebruikerId — alleen beheerder
router.delete(
  "/gebouwen/:id/toewijzingen/:gebruikerId",
  requireRol("beheerder", "hoofdbeheerder"),
  async (req, res) => {
    try {
      const gebouwId = parseInt(req.params.id);
      const gebruikerId = parseInt(req.params.gebruikerId);
      await db
        .delete(gebouwToewijzingenTable)
        .where(
          and(
            eq(gebouwToewijzingenTable.gebouwId, gebouwId),
            eq(gebouwToewijzingenTable.gebruikerId, gebruikerId),
          ),
        );
      res.status(204).send();
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

export default router;
