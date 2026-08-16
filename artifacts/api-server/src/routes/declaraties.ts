import { Router } from "express";
import {
  db,
  declaratiesTable,
  declaratieBeleidTable,
  gebruikersTable,
  medewerkersTable,
  salarisMutatiesTable,
} from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAuth, requireBevoegdheid } from "../middlewares/auth";
import { publiekeAppUrl } from "../lib/publiekeUrl";
import { heeftNiveau } from "@workspace/permissies";
import {
  stuurDeclaratieIngediendMail,
  stuurDeclaratieAfgewezenMail,
} from "../services/email";

const router = Router();

const lezen       = requireBevoegdheid("declaraties", 1);
const beoordelen  = requireBevoegdheid("declaraties", 3);
const beheerder   = requireBevoegdheid("declaraties", 4);

// Basisrecht (APP_01 §4): eigen declaraties zijn geen HRM-recht. Elke
// ingelogde medewerker (geen klant) mag zijn eigen declaraties inzien,
// aanmaken, wijzigen en indienen; de module `declaraties` gaat uitsluitend
// over het zien (niveau 3) en beoordelen/verwerken van ANDERMANS declaraties.
// Eigendom wordt in elke handler afgedwongen via de medewerker-koppeling.
const eigenGegevens = [requireAuth] as const;

// ── Helper: medewerker_id voor sessie-gebruiker ───────────────────────────────
async function medewerkerId(gebruikerId: number): Promise<number | null> {
  const [m] = await db
    .select({ id: medewerkersTable.id })
    .from(medewerkersTable)
    .where(eq(medewerkersTable.gebruikerId, gebruikerId))
    .limit(1);
  return m?.id ?? null;
}

// ── Helper: gebruikersnaam opzoeken ──────────────────────────────────────────
async function gebruikerNaam(id: number): Promise<string> {
  const [g] = await db
    .select({ naam: gebruikersTable.naam })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.id, id))
    .limit(1);
  return g?.naam ?? "Onbekend";
}

// ── Helper: bevoegdheden opzoeken ─────────────────────────────────────────────
async function gebruikerBevoegdheden(id: number): Promise<Record<string, number>> {
  const [g] = await db
    .select({ bevoegdheden: gebruikersTable.bevoegdheden, rol: gebruikersTable.rol })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.id, id))
    .limit(1);
  if (!g) return {};
  if (g.rol === "hoofdbeheerder") return Object.fromEntries(Object.keys({} as Record<string,number>).map(k => [k, 4]));
  return (g.bevoegdheden as Record<string, number> | null) ?? {};
}

// ── Helper: declaratie met namen ophalen ──────────────────────────────────────
async function enrichDeclaratie(rij: typeof declaratiesTable.$inferSelect) {
  const [mw] = await db
    .select({ naam: gebruikersTable.naam })
    .from(medewerkersTable)
    .innerJoin(gebruikersTable, eq(medewerkersTable.gebruikerId, gebruikersTable.id))
    .where(eq(medewerkersTable.id, rij.medewerkerId))
    .limit(1);

  let beoordeeld_door_naam: string | null = null;
  if (rij.beoordeeldDoor) {
    beoordeeld_door_naam = await gebruikerNaam(rij.beoordeeldDoor);
  }

  return {
    id:                   rij.id,
    medewerker_id:        rij.medewerkerId,
    medewerker_naam:      mw?.naam ?? "Onbekend",
    categorie:            rij.categorie,
    omschrijving:         rij.omschrijving,
    bedrag_totaal_cents:  rij.bedragTotaalCents,
    datum:                rij.datum,
    status:               rij.status,
    ingediend_op:         rij.ingediendOp?.toISOString() ?? null,
    beoordeeld_op:        rij.beoordeeldOp?.toISOString() ?? null,
    beoordeeld_door:      rij.beoordeeldDoor,
    beoordeeld_door_naam,
    afwijzingsreden:      rij.afwijzingsreden,
    verwerking_op:        rij.verwerkingOp?.toISOString() ?? null,
    verwerkt_door:        rij.verwerktDoor,
    bijlage_pad:          rij.bijlagePad,
    aangemaakt_op:        rij.aangemeldOp.toISOString(),
    bijgewerkt_op:        rij.bijgewerktOp.toISOString(),
  };
}

// ── GET /declaraties ──────────────────────────────────────────────────────────
router.get("/declaraties", lezen, async (req, res) => {
  const userId = req.session.userId!;
  const bev    = await gebruikerBevoegdheden(userId);
  const [g]    = await db.select({ rol: gebruikersTable.rol }).from(gebruikersTable).where(eq(gebruikersTable.id, userId)).limit(1);
  const kanAlles = g?.rol === "hoofdbeheerder" || heeftNiveau(bev, "declaraties", 3);

  let rijen: (typeof declaratiesTable.$inferSelect)[];

  if (kanAlles) {
    rijen = await db
      .select()
      .from(declaratiesTable)
      .orderBy(desc(declaratiesTable.aangemeldOp));
  } else {
    const mid = await medewerkerId(userId);
    if (!mid) { res.json([]); return; }
    rijen = await db
      .select()
      .from(declaratiesTable)
      .where(eq(declaratiesTable.medewerkerId, mid))
      .orderBy(desc(declaratiesTable.aangemeldOp));
  }

  res.json(await Promise.all(rijen.map(enrichDeclaratie)));
});

// ── GET /mijn/declaraties ─────────────────────────────────────────────────────
router.get("/mijn/declaraties", ...eigenGegevens, async (req, res) => {
  const userId = req.session.userId!;
  const mid = await medewerkerId(userId);
  if (!mid) { res.json([]); return; }

  const rijen = await db
    .select()
    .from(declaratiesTable)
    .where(eq(declaratiesTable.medewerkerId, mid))
    .orderBy(desc(declaratiesTable.aangemeldOp));

  res.json(await Promise.all(rijen.map(enrichDeclaratie)));
});

// ── POST /declaraties ─────────────────────────────────────────────────────────
router.post("/declaraties", ...eigenGegevens, async (req, res) => {
  const userId = req.session.userId!;
  const mid = await medewerkerId(userId);
  if (!mid) { res.status(403).json({ bericht: "U heeft geen medewerkersprofiel" }); return; }

  const { categorie, omschrijving, bedrag_totaal_cents, datum, bijlage_pad } = req.body as {
    categorie: string;
    omschrijving: string;
    bedrag_totaal_cents: number;
    datum: string;
    bijlage_pad?: string;
  };

  const [rij] = await db
    .insert(declaratiesTable)
    .values({
      medewerkerId:      mid,
      categorie,
      omschrijving,
      bedragTotaalCents: bedrag_totaal_cents,
      datum,
      bijlagePad:        bijlage_pad ?? null,
      status:            "concept",
    })
    .returning();

  res.status(201).json(await enrichDeclaratie(rij));
});

// ── GET /declaraties/:id ──────────────────────────────────────────────────────
router.get("/declaraties/:id", ...eigenGegevens, async (req, res) => {
  const id     = Number(req.params["id"]);
  const userId = req.session.userId!;
  const bev    = await gebruikerBevoegdheden(userId);
  const [g]    = await db.select({ rol: gebruikersTable.rol }).from(gebruikersTable).where(eq(gebruikersTable.id, userId)).limit(1);
  const kanAlles = g?.rol === "hoofdbeheerder" || heeftNiveau(bev, "declaraties", 3);

  const [rij] = await db
    .select()
    .from(declaratiesTable)
    .where(eq(declaratiesTable.id, id))
    .limit(1);

  if (!rij) { res.status(404).json({ bericht: "Niet gevonden" }); return; }

  if (!kanAlles) {
    const mid = await medewerkerId(userId);
    if (rij.medewerkerId !== mid) { res.status(403).json({ bericht: "Geen toegang" }); return; }
  }

  res.json(await enrichDeclaratie(rij));
});

// ── PATCH /declaraties/:id ────────────────────────────────────────────────────
router.patch("/declaraties/:id", ...eigenGegevens, async (req, res) => {
  const id     = Number(req.params["id"]);
  const userId = req.session.userId!;
  const mid    = await medewerkerId(userId);

  const [huidig] = await db
    .select()
    .from(declaratiesTable)
    .where(eq(declaratiesTable.id, id))
    .limit(1);

  if (!huidig) { res.status(404).json({ bericht: "Niet gevonden" }); return; }
  if (huidig.medewerkerId !== mid) { res.status(403).json({ bericht: "Geen toegang" }); return; }
  if (huidig.status !== "concept") { res.status(422).json({ bericht: "Alleen concepten kunnen worden bewerkt" }); return; }

  const { categorie, omschrijving, bedrag_totaal_cents, datum, bijlage_pad } = req.body as {
    categorie?: string;
    omschrijving?: string;
    bedrag_totaal_cents?: number;
    datum?: string;
    bijlage_pad?: string;
  };

  const [bijgewerkt] = await db
    .update(declaratiesTable)
    .set({
      ...(categorie           !== undefined && { categorie }),
      ...(omschrijving        !== undefined && { omschrijving }),
      ...(bedrag_totaal_cents !== undefined && { bedragTotaalCents: bedrag_totaal_cents }),
      ...(datum               !== undefined && { datum }),
      ...(bijlage_pad         !== undefined && { bijlagePad: bijlage_pad }),
      bijgewerktOp: new Date(),
    })
    .where(eq(declaratiesTable.id, id))
    .returning();

  res.json(await enrichDeclaratie(bijgewerkt));
});

// ── DELETE /declaraties/:id ───────────────────────────────────────────────────
router.delete("/declaraties/:id", ...eigenGegevens, async (req, res) => {
  const id     = Number(req.params["id"]);
  const userId = req.session.userId!;
  const mid    = await medewerkerId(userId);

  const [huidig] = await db
    .select()
    .from(declaratiesTable)
    .where(eq(declaratiesTable.id, id))
    .limit(1);

  if (!huidig) { res.status(404).json({ bericht: "Niet gevonden" }); return; }
  if (huidig.medewerkerId !== mid) { res.status(403).json({ bericht: "Geen toegang" }); return; }
  if (huidig.status !== "concept") { res.status(422).json({ bericht: "Alleen concepten kunnen worden verwijderd" }); return; }

  await db.delete(declaratiesTable).where(eq(declaratiesTable.id, id));
  res.status(204).end();
});

// ── POST /declaraties/:id/indienen ────────────────────────────────────────────
router.post("/declaraties/:id/indienen", ...eigenGegevens, async (req, res) => {
  const id     = Number(req.params["id"]);
  const userId = req.session.userId!;
  const mid    = await medewerkerId(userId);

  const [huidig] = await db
    .select()
    .from(declaratiesTable)
    .where(eq(declaratiesTable.id, id))
    .limit(1);

  if (!huidig) { res.status(404).json({ bericht: "Niet gevonden" }); return; }
  if (huidig.medewerkerId !== mid) { res.status(403).json({ bericht: "Geen toegang" }); return; }
  if (huidig.status !== "concept") { res.status(422).json({ bericht: "Declaratie is al ingediend of verwerkt" }); return; }

  const [bijgewerkt] = await db
    .update(declaratiesTable)
    .set({ status: "ingediend", ingediendOp: new Date(), bijgewerktOp: new Date() })
    .where(eq(declaratiesTable.id, id))
    .returning();

  // Mail sturen naar alle gebruikers met declaraties-niveau 3 of 4
  try {
    const mijnNaam = await gebruikerNaam(userId);
    const basis = publiekeAppUrl();
    const appUrl = basis ? `${basis}/declaraties/${id}` : null;

    const alleGebruikers = await db
      .select({ id: gebruikersTable.id, email: gebruikersTable.email, naam: gebruikersTable.naam, bevoegdheden: gebruikersTable.bevoegdheden, rol: gebruikersTable.rol })
      .from(gebruikersTable)
      .where(eq(gebruikersTable.actief, true));

    for (const b of alleGebruikers) {
      if (b.id === userId) continue;
      const bev = (b.bevoegdheden as Record<string, number> | null) ?? {};
      const magBeoordelen = b.rol === "hoofdbeheerder" || heeftNiveau(bev, "declaraties", 3);
      if (!magBeoordelen) continue;
      await stuurDeclaratieIngediendMail({
        naarEmail:      b.email,
        naarNaam:       b.naam,
        declaratieId:   id,
        medewerkernaam: mijnNaam,
        categorie:      huidig.categorie,
        bedragCents:    huidig.bedragTotaalCents,
        dashboardUrl:   appUrl,
      });
    }
  } catch {
    // mail-fouten blokkeren de flow niet
  }

  res.json(await enrichDeclaratie(bijgewerkt));
});

// ── POST /declaraties/:id/goedkeuren ─────────────────────────────────────────
router.post("/declaraties/:id/goedkeuren", beoordelen, async (req, res) => {
  const id     = Number(req.params["id"]);
  const userId = req.session.userId!;

  const [huidig] = await db
    .select()
    .from(declaratiesTable)
    .where(eq(declaratiesTable.id, id))
    .limit(1);

  if (!huidig) { res.status(404).json({ bericht: "Niet gevonden" }); return; }
  if (huidig.status !== "ingediend") { res.status(422).json({ bericht: "Alleen ingediende declaraties kunnen worden goedgekeurd" }); return; }

  const [bijgewerkt] = await db
    .update(declaratiesTable)
    .set({
      status:         "goedgekeurd",
      beoordeeldOp:   new Date(),
      beoordeeldDoor: userId,
      bijgewerktOp:   new Date(),
    })
    .where(eq(declaratiesTable.id, id))
    .returning();

  // Automatische stap richting loonverwerking: goedgekeurde declaratie wordt
  // een salarismutatie (bron "declaratie") voor de lopende loonperiode. De
  // partiële unieke index op declaratie_id maakt dit race-veilig; een fout
  // hier blokkeert de goedkeuring niet (mutatie kan handmatig alsnog).
  try {
    const [mw] = await db
      .select({
        naam:             medewerkersTable.naam,
        werkmaatschappij: medewerkersTable.werkmaatschappij,
        werkgeverId:      medewerkersTable.werkgeverId,
      })
      .from(medewerkersTable)
      .where(eq(medewerkersTable.id, huidig.medewerkerId))
      .limit(1);
    if (mw) {
      const nu = new Date();
      const bedrag = (huidig.bedragTotaalCents / 100).toFixed(2).replace(".", ",");
      const beoordelaar = await gebruikerNaam(userId);
      await db
        .insert(salarisMutatiesTable)
        .values({
          medewerkerId:      huidig.medewerkerId,
          medewerkerNaam:    mw.naam,
          werkmaatschappij:  mw.werkmaatschappij,
          werkgeverId:       mw.werkgeverId,
          periodeJaar:       nu.getFullYear(),
          periodeMaand:      nu.getMonth() + 1,
          type:              "declaratie",
          omschrijving:      `Declaratie #${id} — ${huidig.categorie} — € ${bedrag} (${huidig.omschrijving})`,
          ingangsdatum:      huidig.datum,
          bron:              "declaratie",
          declaratieId:      id,
          aangemaaktDoorId:  userId,
          aangemaaktDoorNaam: beoordelaar,
        })
        .onConflictDoNothing({
          target: [salarisMutatiesTable.declaratieId],
          where: sql`declaratie_id IS NOT NULL`,
        });
    } else {
      req.log.warn({ declaratieId: id }, "Geen medewerker gevonden; salarismutatie niet automatisch aangemaakt");
    }
  } catch (err) {
    req.log.error({ err, declaratieId: id }, "Automatische salarismutatie uit declaratie mislukt");
  }

  res.json(await enrichDeclaratie(bijgewerkt));
});

// ── POST /declaraties/:id/afwijzen ────────────────────────────────────────────
router.post("/declaraties/:id/afwijzen", beoordelen, async (req, res) => {
  const id     = Number(req.params["id"]);
  const userId = req.session.userId!;
  const { afwijzingsreden } = req.body as { afwijzingsreden: string };

  if (!afwijzingsreden?.trim()) {
    res.status(422).json({ bericht: "Afwijzingsreden is verplicht" });
    return;
  }

  const [huidig] = await db
    .select()
    .from(declaratiesTable)
    .where(and(eq(declaratiesTable.id, id)))
    .limit(1);

  if (!huidig) { res.status(404).json({ bericht: "Niet gevonden" }); return; }
  if (!["ingediend", "goedgekeurd"].includes(huidig.status)) {
    res.status(422).json({ bericht: "Declaratie kan niet worden afgewezen in huidige status" });
    return;
  }

  const [bijgewerkt] = await db
    .update(declaratiesTable)
    .set({
      status:          "afgekeurd",
      afwijzingsreden: afwijzingsreden.trim(),
      beoordeeldOp:    new Date(),
      beoordeeldDoor:  userId,
      bijgewerktOp:    new Date(),
    })
    .where(eq(declaratiesTable.id, id))
    .returning();

  // Alsnog afwijzen ná goedkeuring: de automatisch aangemaakte salarismutatie
  // mag niet blijven staan zolang die nog concept is (geaccordeerde mutaties
  // laten we bewust staan — die zijn al onderdeel van de loonaanlevering).
  if (huidig.status === "goedgekeurd") {
    try {
      const verwijderd = await db
        .delete(salarisMutatiesTable)
        .where(and(
          eq(salarisMutatiesTable.declaratieId, id),
          eq(salarisMutatiesTable.status, "concept"),
        ))
        .returning({ id: salarisMutatiesTable.id });
      if (verwijderd.length > 0) {
        req.log.info({ declaratieId: id, mutatieId: verwijderd[0]!.id }, "Concept-salarismutatie verwijderd na alsnog afwijzen declaratie");
      }
    } catch (err) {
      req.log.error({ err, declaratieId: id }, "Opruimen salarismutatie na afwijzen mislukt");
    }
  }

  // Mail naar medewerker
  try {
    const [mw] = await db
      .select({ email: gebruikersTable.email, naam: gebruikersTable.naam })
      .from(medewerkersTable)
      .innerJoin(gebruikersTable, eq(medewerkersTable.gebruikerId, gebruikersTable.id))
      .where(eq(medewerkersTable.id, huidig.medewerkerId))
      .limit(1);

    if (mw) {
      const beoordelaarsNaam = await gebruikerNaam(userId);
      const basis = publiekeAppUrl();
      const appUrl = basis ? `${basis}/declaraties/${id}` : null;
      await stuurDeclaratieAfgewezenMail({
        naarEmail:          mw.email,
        naarNaam:           mw.naam,
        declaratieId:       id,
        afwijzingsreden:    afwijzingsreden.trim(),
        beoordeeldDoorNaam: beoordelaarsNaam,
        bedragCents:        huidig.bedragTotaalCents,
        dashboardUrl:       appUrl,
      });
    }
  } catch {
    // stille fout
  }

  res.json(await enrichDeclaratie(bijgewerkt));
});

// ── POST /declaraties/:id/verwerken ───────────────────────────────────────────
router.post("/declaraties/:id/verwerken", beheerder, async (req, res) => {
  const id     = Number(req.params["id"]);
  const userId = req.session.userId!;

  const [huidig] = await db
    .select()
    .from(declaratiesTable)
    .where(eq(declaratiesTable.id, id))
    .limit(1);

  if (!huidig) { res.status(404).json({ bericht: "Niet gevonden" }); return; }
  if (huidig.status !== "goedgekeurd") { res.status(422).json({ bericht: "Alleen goedgekeurde declaraties kunnen worden verwerkt" }); return; }

  const [bijgewerkt] = await db
    .update(declaratiesTable)
    .set({
      status:       "verwerkt",
      verwerkingOp: new Date(),
      verwerktDoor: userId,
      bijgewerktOp: new Date(),
    })
    .where(eq(declaratiesTable.id, id))
    .returning();

  res.json(await enrichDeclaratie(bijgewerkt));
});

// ── GET /declaratiebeleid ─────────────────────────────────────────────────────
router.get("/declaratiebeleid", ...eigenGegevens, async (_req, res) => {
  const [rij] = await db
    .select()
    .from(declaratieBeleidTable)
    .limit(1);

  if (!rij) {
    res.json({ id: 0, inhoud: "", bijgewerkt_op: new Date().toISOString(), bijgewerkt_door: null });
    return;
  }

  res.json({
    id:              rij.id,
    inhoud:          rij.inhoud,
    bijgewerkt_op:   rij.bijgewerktOp.toISOString(),
    bijgewerkt_door: rij.bijgewerktDoor,
  });
});

// ── PATCH /declaratiebeleid ───────────────────────────────────────────────────
router.patch("/declaratiebeleid", beheerder, async (req, res) => {
  const userId = req.session.userId!;
  const { inhoud } = req.body as { inhoud: string };

  const [bestaand] = await db.select().from(declaratieBeleidTable).limit(1);

  if (bestaand) {
    const [bijgewerkt] = await db
      .update(declaratieBeleidTable)
      .set({ inhoud, bijgewerktOp: new Date(), bijgewerktDoor: userId })
      .where(eq(declaratieBeleidTable.id, bestaand.id))
      .returning();
    res.json({
      id:              bijgewerkt.id,
      inhoud:          bijgewerkt.inhoud,
      bijgewerkt_op:   bijgewerkt.bijgewerktOp.toISOString(),
      bijgewerkt_door: bijgewerkt.bijgewerktDoor,
    });
  } else {
    const [nieuw] = await db
      .insert(declaratieBeleidTable)
      .values({ inhoud, bijgewerktOp: new Date(), bijgewerktDoor: userId })
      .returning();
    res.json({
      id:              nieuw.id,
      inhoud:          nieuw.inhoud,
      bijgewerkt_op:   nieuw.bijgewerktOp.toISOString(),
      bijgewerkt_door: nieuw.bijgewerktDoor,
    });
  }
});

export default router;
