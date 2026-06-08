import { Router } from "express";
import { db } from "@workspace/db";
import {
  gebouwenTable,
  verdiepingenTable,
  voorzieningenTable,
  gebruikersTable,
  gebouwToewijzingenTable,
  gebouwPartijenTable,
  tekeningenTable,
} from "@workspace/db";
import { eq, inArray, count, and } from "drizzle-orm";
import { requireRol } from "../middlewares/auth";
import {
  analyseerGebouwVrijeTekst,
  analyseerTekening,
  analyseerPlattegrond,
} from "../services/gebouw-ai";

const router = Router();

const BEHEERDER_ROLLEN = ["beheerder", "hoofdbeheerder"];
const TOEGEWEZEN_ROLLEN = ["monteur", "controleur"];

function kapitaliseerWoorden(waarde: string): string {
  return waarde.replace(
    /(^|\s)(\p{L})/gu,
    (_m, voor: string, letter: string) => voor + letter.toUpperCase(),
  );
}

function isUniekWerknummerFout(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505" &&
    "constraint" in err &&
    (err as { constraint?: string }).constraint === "gebouwen_werknummer_unique"
  );
}

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

function gebouwRij(
  g: typeof gebouwenTable.$inferSelect,
  totaal: number,
  naam: string | null,
  partijen: { type: string; naam: string }[] = [],
) {
  return {
    id: g.id,
    werknummer: g.werknummer,
    naam: g.naam,
    adres: g.adres,
    stad: g.stad,
    postcode: g.postcode,
    omschrijving: g.omschrijving,
    klant_id: g.klantId,
    klant_naam: naam,
    aantal_verdiepingen: g.aantalVerdiepingen,
    hoogte: g.hoogte,
    breedte: g.breedte,
    diepte: g.diepte,
    oppervlakte: g.oppervlakte,
    gebouw_type: g.gebouwType,
    latitude: g.latitude,
    longitude: g.longitude,
    totaal_voorzieningen: totaal,
    partijen,
    aangemaakt_op: g.aangemaaktOp.toISOString(),
  };
}

// GET /gebouwen
router.get("/gebouwen", async (req, res) => {
  try {
    const userId = req.session.userId!;
    const rol = await gebruikerRol(userId);
    const { zoek, partij_type, partij_naam } = req.query;

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

    // Filter op partij (type en/of naam)
    const partijType = typeof partij_type === "string" ? partij_type.trim() : "";
    const partijNaam = typeof partij_naam === "string" ? partij_naam.trim() : "";
    if (partijType || partijNaam) {
      const partijen = await db.select().from(gebouwPartijenTable);
      const naamLc = partijNaam.toLowerCase();
      const matchendeGebouwIds = new Set(
        partijen
          .filter((p) => (!partijType || p.type === partijType) && (!partijNaam || p.naam.toLowerCase() === naamLc))
          .map((p) => p.gebouwId),
      );
      gebouwen = gebouwen.filter((g) => matchendeGebouwIds.has(g.id));
    }

    const allePartijen = await db.select().from(gebouwPartijenTable);
    const partijenPerGebouw = new Map<number, { type: string; naam: string }[]>();
    for (const p of allePartijen) {
      const lijst = partijenPerGebouw.get(p.gebouwId) ?? [];
      lijst.push({ type: p.type, naam: p.naam });
      partijenPerGebouw.set(p.gebouwId, lijst);
    }

    const result = await Promise.all(
      gebouwen.map(async (g) => {
        const [totaal] = await db
          .select({ count: count() })
          .from(voorzieningenTable)
          .where(eq(voorzieningenTable.gebouwId, g.id));
        return gebouwRij(
          g,
          Number(totaal?.count ?? 0),
          await klantNaam(g.klantId),
          partijenPerGebouw.get(g.id) ?? [],
        );
      }),
    );

    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /gebouwen
router.post("/gebouwen", requireRol("beheerder", "hoofdbeheerder"), async (req, res) => {
  try {
    const {
      werknummer,
      naam,
      adres,
      stad,
      postcode,
      omschrijving,
      klant_id,
      aantal_verdiepingen,
      hoogte,
      breedte,
      diepte,
      oppervlakte,
      gebouw_type,
      latitude,
      longitude,
    } = req.body;
    if (!naam || !adres) {
      return res.status(400).json({ error: "naam en adres zijn verplicht" });
    }
    if (typeof werknummer !== "string" || !werknummer.trim()) {
      return res.status(400).json({ error: "werknummer is verplicht" });
    }
    const werknummerWaarde = werknummer.trim();
    const [gebouw] = await db
      .insert(gebouwenTable)
      .values({
        werknummer: werknummerWaarde,
        naam,
        adres: kapitaliseerWoorden(adres),
        stad: typeof stad === "string" ? kapitaliseerWoorden(stad) : stad,
        postcode,
        omschrijving,
        klantId: klant_id,
        aantalVerdiepingen: aantal_verdiepingen,
        hoogte,
        breedte,
        diepte,
        oppervlakte,
        gebouwType: gebouw_type,
        latitude,
        longitude,
      })
      .returning();
    res.status(201).json(gebouwRij(gebouw, 0, await klantNaam(gebouw.klantId)));
  } catch (err) {
    if (isUniekWerknummerFout(err)) {
      return res.status(409).json({ error: "Dit werknummer is al in gebruik" });
    }
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /gebouwen/ai-analyse — alleen beheerder
router.post(
  "/gebouwen/ai-analyse",
  requireRol("beheerder", "hoofdbeheerder"),
  async (req, res) => {
    try {
      const { beschrijving } = req.body ?? {};
      if (!beschrijving || typeof beschrijving !== "string" || !beschrijving.trim()) {
        return res.status(400).json({ error: "beschrijving is verplicht" });
      }
      const resultaat = await analyseerGebouwVrijeTekst(beschrijving);
      res.json(resultaat);
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "AI-analyse mislukte" });
    }
  },
);

// POST /gebouwen/:id/tekeningen/ai-analyse — alleen beheerder
router.post(
  "/gebouwen/:id/tekeningen/ai-analyse",
  requireRol("beheerder", "hoofdbeheerder"),
  async (req, res) => {
    try {
      const gebouwId = parseInt(req.params.id);
      const { bestandsnaam, type } = req.body ?? {};
      if (!bestandsnaam || typeof bestandsnaam !== "string" || !bestandsnaam.trim()) {
        return res.status(400).json({ error: "bestandsnaam is verplicht" });
      }
      const verdiepingen = await db
        .select()
        .from(verdiepingenTable)
        .where(eq(verdiepingenTable.gebouwId, gebouwId));
      const resultaat = await analyseerTekening(
        bestandsnaam,
        typeof type === "string" ? type : null,
        verdiepingen.map((v) => ({ id: v.id, naam: v.naam, niveau: v.niveau })),
      );
      res.json(resultaat);
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "AI-analyse mislukte" });
    }
  },
);

// POST /gebouwen/:id/plattegrond/ai-analyse — alleen beheerder
router.post(
  "/gebouwen/:id/plattegrond/ai-analyse",
  requireRol("beheerder", "hoofdbeheerder"),
  async (req, res) => {
    try {
      const gebouwId = parseInt(req.params.id);
      const { afbeelding } = req.body ?? {};
      if (!afbeelding || typeof afbeelding !== "string" || !afbeelding.startsWith("data:")) {
        return res.status(400).json({ error: "afbeelding is verplicht" });
      }
      const verdiepingen = await db
        .select()
        .from(verdiepingenTable)
        .where(eq(verdiepingenTable.gebouwId, gebouwId));
      const resultaat = await analyseerPlattegrond(
        afbeelding,
        verdiepingen.map((v) => ({ id: v.id, naam: v.naam, niveau: v.niveau })),
      );
      res.json(resultaat);
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "AI-analyse mislukte" });
    }
  },
);

// GET /gebouwen/partij-opties — unieke partijen (type + naam) voor filteropties
router.get("/gebouwen/partij-opties", async (req, res) => {
  try {
    const userId = req.session.userId!;
    const rol = await gebruikerRol(userId);

    let zichtbareGebouwIds: number[] | null = null;
    if (TOEGEWEZEN_ROLLEN.includes(rol)) {
      zichtbareGebouwIds = await toegewezenGebouwIds(userId);
      if (zichtbareGebouwIds.length === 0) {
        return res.json([]);
      }
    }

    const partijen = await db.select().from(gebouwPartijenTable);
    const gezien = new Set<string>();
    const opties: { type: string; naam: string }[] = [];
    for (const p of partijen) {
      if (zichtbareGebouwIds && !zichtbareGebouwIds.includes(p.gebouwId)) continue;
      const sleutel = `${p.type}\u0000${p.naam.toLowerCase()}`;
      if (gezien.has(sleutel)) continue;
      gezien.add(sleutel);
      opties.push({ type: p.type, naam: p.naam });
    }
    opties.sort((a, b) => a.type.localeCompare(b.type) || a.naam.localeCompare(b.naam));

    res.json(opties);
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
      werknummer: gebouw.werknummer,
      naam: gebouw.naam,
      adres: gebouw.adres,
      stad: gebouw.stad,
      postcode: gebouw.postcode,
      omschrijving: gebouw.omschrijving,
      klant_id: gebouw.klantId,
      klant_naam: await klantNaam(gebouw.klantId),
      aantal_verdiepingen: gebouw.aantalVerdiepingen,
      hoogte: gebouw.hoogte,
      breedte: gebouw.breedte,
      diepte: gebouw.diepte,
      oppervlakte: gebouw.oppervlakte,
      gebouw_type: gebouw.gebouwType,
      latitude: gebouw.latitude,
      longitude: gebouw.longitude,
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
router.patch("/gebouwen/:id", requireRol("beheerder", "hoofdbeheerder"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const {
      werknummer,
      naam,
      adres,
      stad,
      postcode,
      omschrijving,
      klant_id,
      aantal_verdiepingen,
      hoogte,
      breedte,
      diepte,
      oppervlakte,
      gebouw_type,
      latitude,
      longitude,
    } = req.body;
    const [gebouw] = await db
      .update(gebouwenTable)
      .set({
        ...(werknummer !== undefined
          ? {
              werknummer:
                typeof werknummer === "string" && werknummer.trim()
                  ? werknummer.trim()
                  : null,
            }
          : {}),
        naam,
        adres: typeof adres === "string" ? kapitaliseerWoorden(adres) : adres,
        stad: typeof stad === "string" ? kapitaliseerWoorden(stad) : stad,
        postcode,
        omschrijving,
        klantId: klant_id,
        aantalVerdiepingen: aantal_verdiepingen,
        hoogte,
        breedte,
        diepte,
        oppervlakte,
        gebouwType: gebouw_type,
        latitude,
        longitude,
        bijgewerktOp: new Date(),
      })
      .where(eq(gebouwenTable.id, id))
      .returning();
    if (!gebouw) return res.status(404).json({ error: "Gebouw niet gevonden" });
    const [totaal] = await db
      .select({ count: count() })
      .from(voorzieningenTable)
      .where(eq(voorzieningenTable.gebouwId, id));
    res.json(gebouwRij(gebouw, Number(totaal?.count ?? 0), await klantNaam(gebouw.klantId)));
  } catch (err) {
    if (isUniekWerknummerFout(err)) {
      return res.status(409).json({ error: "Dit werknummer is al in gebruik" });
    }
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// DELETE /gebouwen/:id
router.delete("/gebouwen/:id", requireRol("beheerder", "hoofdbeheerder"), async (req, res) => {
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
router.post("/gebouwen/:id/verdiepingen", requireRol("beheerder", "hoofdbeheerder"), async (req, res) => {
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
router.patch("/verdiepingen/:id", requireRol("beheerder", "hoofdbeheerder"), async (req, res) => {
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
router.delete("/verdiepingen/:id", requireRol("beheerder", "hoofdbeheerder"), async (req, res) => {
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

// ── PARTIJEN ──────────────────────────────────────────────────────────────

const PARTIJ_TYPES = ["eigenaar", "gebruiker", "opdrachtgever", "aanvrager"];

function partijRij(p: typeof gebouwPartijenTable.$inferSelect) {
  return {
    id: p.id,
    gebouw_id: p.gebouwId,
    type: p.type,
    naam: p.naam,
    organisatie: p.organisatie,
    telefoon: p.telefoon,
    email: p.email,
    adres: p.adres,
    postcode: p.postcode,
    plaats: p.plaats,
    opmerkingen: p.opmerkingen,
    aangemaakt_op: p.aangemaaktOp.toISOString(),
  };
}

// GET /gebouwen/:id/partijen
router.get("/gebouwen/:id/partijen", async (req, res) => {
  try {
    const gebouwId = parseInt(req.params.id);
    const rows = await db
      .select()
      .from(gebouwPartijenTable)
      .where(eq(gebouwPartijenTable.gebouwId, gebouwId));
    res.json(rows.map(partijRij));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /gebouwen/:id/partijen — alleen beheerder
router.post(
  "/gebouwen/:id/partijen",
  requireRol("beheerder", "hoofdbeheerder"),
  async (req, res) => {
    try {
      const gebouwId = parseInt(req.params.id);
      const { type, naam, organisatie, telefoon, email, adres, postcode, plaats, opmerkingen } = req.body ?? {};
      if (!type || !PARTIJ_TYPES.includes(type)) {
        return res.status(400).json({ error: "Ongeldig partijtype" });
      }
      if (!naam || typeof naam !== "string") {
        return res.status(400).json({ error: "naam is verplicht" });
      }
      const [partij] = await db
        .insert(gebouwPartijenTable)
        .values({ gebouwId, type, naam, organisatie, telefoon, email, adres, postcode, plaats, opmerkingen })
        .returning();
      res.status(201).json(partijRij(partij!));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// PATCH /gebouwen/partijen/:partijId — alleen beheerder
router.patch(
  "/gebouwen/partijen/:partijId",
  requireRol("beheerder", "hoofdbeheerder"),
  async (req, res) => {
    try {
      const partijId = parseInt(req.params.partijId);
      const { type, naam, organisatie, telefoon, email, adres, postcode, plaats, opmerkingen } = req.body ?? {};
      if (type !== undefined && !PARTIJ_TYPES.includes(type)) {
        return res.status(400).json({ error: "Ongeldig partijtype" });
      }
      const updates: Record<string, unknown> = { bijgewerktOp: new Date() };
      if (type !== undefined) updates.type = type;
      if (naam !== undefined) updates.naam = naam;
      if (organisatie !== undefined) updates.organisatie = organisatie;
      if (telefoon !== undefined) updates.telefoon = telefoon;
      if (email !== undefined) updates.email = email;
      if (adres !== undefined) updates.adres = adres;
      if (postcode !== undefined) updates.postcode = postcode;
      if (plaats !== undefined) updates.plaats = plaats;
      if (opmerkingen !== undefined) updates.opmerkingen = opmerkingen;

      const [partij] = await db
        .update(gebouwPartijenTable)
        .set(updates)
        .where(eq(gebouwPartijenTable.id, partijId))
        .returning();
      if (!partij) return res.status(404).json({ error: "Partij niet gevonden" });
      res.json(partijRij(partij));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// DELETE /gebouwen/partijen/:partijId — alleen beheerder
router.delete(
  "/gebouwen/partijen/:partijId",
  requireRol("beheerder", "hoofdbeheerder"),
  async (req, res) => {
    try {
      const partijId = parseInt(req.params.partijId);
      await db.delete(gebouwPartijenTable).where(eq(gebouwPartijenTable.id, partijId));
      res.status(204).send();
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// ── TEKENINGEN ────────────────────────────────────────────────────────────

function tekeningRij(t: typeof tekeningenTable.$inferSelect) {
  return {
    id: t.id,
    gebouw_id: t.gebouwId,
    verdieping_id: t.verdiepingId,
    naam: t.naam,
    type: t.type,
    schaal: t.schaal,
    url: t.url,
    aangemaakt_op: t.aangemaaktOp.toISOString(),
  };
}

// GET /gebouwen/:id/tekeningen
router.get("/gebouwen/:id/tekeningen", async (req, res) => {
  try {
    const gebouwId = parseInt(req.params.id);
    const rows = await db
      .select()
      .from(tekeningenTable)
      .where(eq(tekeningenTable.gebouwId, gebouwId));
    res.json(rows.map(tekeningRij));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /gebouwen/:id/tekeningen — alleen beheerder
router.post(
  "/gebouwen/:id/tekeningen",
  requireRol("beheerder", "hoofdbeheerder"),
  async (req, res) => {
    try {
      const gebouwId = parseInt(req.params.id);
      const { naam, type, schaal, url, verdieping_id } = req.body ?? {};
      if (!naam || typeof naam !== "string") {
        return res.status(400).json({ error: "naam is verplicht" });
      }
      if (!type || typeof type !== "string") {
        return res.status(400).json({ error: "type is verplicht" });
      }
      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "url is verplicht" });
      }
      const [tekening] = await db
        .insert(tekeningenTable)
        .values({
          gebouwId,
          naam,
          type,
          schaal: schaal ?? null,
          url,
          verdiepingId: verdieping_id ?? null,
        })
        .returning();
      res.status(201).json(tekeningRij(tekening!));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// PATCH /gebouwen/tekeningen/:tekeningId — alleen beheerder
router.patch(
  "/gebouwen/tekeningen/:tekeningId",
  requireRol("beheerder", "hoofdbeheerder"),
  async (req, res) => {
    try {
      const tekeningId = parseInt(req.params.tekeningId);
      const { naam, type, schaal, verdieping_id } = req.body ?? {};
      const updates: Record<string, unknown> = { bijgewerktOp: new Date() };
      if (naam !== undefined) updates.naam = naam;
      if (type !== undefined) updates.type = type;
      if (schaal !== undefined) updates.schaal = schaal;
      if (verdieping_id !== undefined) updates.verdiepingId = verdieping_id;

      const [tekening] = await db
        .update(tekeningenTable)
        .set(updates)
        .where(eq(tekeningenTable.id, tekeningId))
        .returning();
      if (!tekening) return res.status(404).json({ error: "Tekening niet gevonden" });
      res.json(tekeningRij(tekening));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// DELETE /gebouwen/tekeningen/:tekeningId — alleen beheerder
router.delete(
  "/gebouwen/tekeningen/:tekeningId",
  requireRol("beheerder", "hoofdbeheerder"),
  async (req, res) => {
    try {
      const tekeningId = parseInt(req.params.tekeningId);
      await db.delete(tekeningenTable).where(eq(tekeningenTable.id, tekeningId));
      res.status(204).send();
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

export default router;
