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
  stuurDeclaratieDoorgezetMail,
} from "../services/email";
import { berekenEffectieveBevoegdhedenBatch } from "../lib/effectieve-bevoegdheden";

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

  let doorgezet_naar_naam: string | null = null;
  if (rij.doorgezetNaar) doorgezet_naar_naam = await gebruikerNaam(rij.doorgezetNaar);
  let doorgezet_door_naam: string | null = null;
  if (rij.doorgezetDoor) doorgezet_door_naam = await gebruikerNaam(rij.doorgezetDoor);

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
    doorgezet_naar:       rij.doorgezetNaar,
    doorgezet_naar_naam,
    doorgezet_door:       rij.doorgezetDoor,
    doorgezet_door_naam,
    doorgezet_op:         rij.doorgezetOp?.toISOString() ?? null,
    doorzet_toelichting:  rij.doorzetToelichting,
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
  const kanAlles =
    req.permissies!.isHoofdbeheerder ||
    req.permissies!.heeftModuleRecht("declaraties", 3);

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

// ── GET /declaraties/beoordelaars ─────────────────────────────────────────────
// Actieve gebruikers die declaraties mogen beoordelen (niveau 3 of hoofd-
// beheerder) — voor de doorzet-keuzelijst. Moet vóór /declaraties/:id staan.
router.get("/declaraties/beoordelaars", beoordelen, async (req, res) => {
  const userId = req.session.userId!;
  const alleGebruikers = await db
    .select({
      id: gebruikersTable.id,
      naam: gebruikersTable.naam,
      storedBevoegdheden: gebruikersTable.bevoegdheden,
      rol: gebruikersTable.rol,
    })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.actief, true));
  const effectieveBevoegdheden = await berekenEffectieveBevoegdhedenBatch(
    alleGebruikers.map((g) => ({
      id: g.id,
      rol: g.rol,
      storedBevoegdheden: g.storedBevoegdheden,
    })),
  );

  const beoordelaars = alleGebruikers
    .filter((g) => g.id !== userId)
    .filter(
      (g) =>
        g.rol === "hoofdbeheerder" ||
        heeftNiveau(effectieveBevoegdheden.get(g.id) ?? {}, "declaraties", 3),
    )
    .map((g) => ({ id: g.id, naam: g.naam }))
    .sort((a, b) => a.naam.localeCompare(b.naam, "nl"));

  res.json(beoordelaars);
});

// ── POST /declaraties/:id/doorzetten ─────────────────────────────────────────
// Beoordelaar zet een ingediende declaratie bij twijfel door naar een andere
// beoordelaar; die krijgt een mail en ziet de declaratie gemarkeerd staan.
// De status blijft "ingediend" — goedkeuren/afwijzen verloopt via de normale
// knoppen en blijft voor élke beoordelaar mogelijk (doorzetten is een signaal,
// geen vergrendeling).
router.post("/declaraties/:id/doorzetten", beoordelen, async (req, res) => {
  const id     = Number(req.params["id"]);
  const userId = req.session.userId!;
  const naarId = Number(req.body?.gebruiker_id);
  const toelichting = typeof req.body?.toelichting === "string" ? req.body.toelichting.trim() || null : null;
  // Optimistische vergrendeling: de client stuurt mee naar wie de declaratie
  // volgens zijn scherm nú is doorgezet (null = nog niet doorgezet). Wijkt de
  // werkelijkheid af (collega was net eerder), dan 409 i.p.v. stil overschrijven.
  const verwachtRaw = req.body?.verwacht_doorgezet_naar;
  const verwacht: number | null = verwachtRaw === null || verwachtRaw === undefined ? null : Number(verwachtRaw);
  if (verwacht !== null && (!Number.isInteger(verwacht) || verwacht <= 0)) { res.status(400).json({ bericht: "verwacht_doorgezet_naar is ongeldig" }); return; }

  if (!Number.isInteger(naarId) || naarId <= 0) { res.status(400).json({ bericht: "gebruiker_id is verplicht" }); return; }
  if (naarId === userId) { res.status(422).json({ bericht: "U kunt een declaratie niet aan uzelf doorzetten" }); return; }

  const [huidig] = await db.select().from(declaratiesTable).where(eq(declaratiesTable.id, id)).limit(1);
  if (!huidig) { res.status(404).json({ bericht: "Niet gevonden" }); return; }
  if (huidig.status !== "ingediend") { res.status(422).json({ bericht: "Alleen ingediende declaraties kunnen worden doorgezet" }); return; }

  // Doel moet een actieve beoordelaar zijn (fail-closed)
  const [doel] = await db
    .select({
      id: gebruikersTable.id,
      naam: gebruikersTable.naam,
      email: gebruikersTable.email,
      storedBevoegdheden: gebruikersTable.bevoegdheden,
      rol: gebruikersTable.rol,
      actief: gebruikersTable.actief,
    })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.id, naarId))
    .limit(1);
  const doelEffectief = doel
    ? (
        await berekenEffectieveBevoegdhedenBatch([
          {
            id: doel.id,
            rol: doel.rol,
            storedBevoegdheden: doel.storedBevoegdheden,
          },
        ])
      ).get(doel.id) ?? {}
    : {};
  const doelMagBeoordelen =
    doel?.actief &&
    (doel.rol === "hoofdbeheerder" || heeftNiveau(doelEffectief, "declaraties", 3));
  if (!doel || !doelMagBeoordelen) { res.status(422).json({ bericht: "Gekozen gebruiker kan geen declaraties beoordelen" }); return; }

  const [bijgewerkt] = await db
    .update(declaratiesTable)
    .set({
      doorgezetNaar:      naarId,
      doorgezetDoor:      userId,
      doorgezetOp:        new Date(),
      doorzetToelichting: toelichting,
      bijgewerktOp:       new Date(),
    })
    .where(and(
      eq(declaratiesTable.id, id),
      eq(declaratiesTable.status, "ingediend"),
      sql`${declaratiesTable.doorgezetNaar} IS NOT DISTINCT FROM ${verwacht}`,
    ))
    .returning();
  if (!bijgewerkt) { res.status(409).json({ bericht: "Deze declaratie is intussen al door een collega doorgezet of gewijzigd. Ververs de pagina en probeer opnieuw." }); return; }

  try {
    const verrijkt = await enrichDeclaratie(bijgewerkt);
    const basis = publiekeAppUrl();
    await stuurDeclaratieDoorgezetMail({
      naarEmail:         doel.email,
      naarNaam:          doel.naam,
      declaratieId:      id,
      medewerkernaam:    verrijkt.medewerker_naam,
      doorgezetDoorNaam: await gebruikerNaam(userId),
      toelichting,
      categorie:         huidig.categorie,
      bedragCents:       huidig.bedragTotaalCents,
      dashboardUrl:      basis ? `${basis}/declaraties/${id}` : null,
    });
    res.json(verrijkt);
    return;
  } catch {
    // mail-fouten blokkeren de flow niet
  }
  res.json(await enrichDeclaratie(bijgewerkt));
});

// ── GET /declaraties/:id ──────────────────────────────────────────────────────
router.get("/declaraties/:id", ...eigenGegevens, async (req, res) => {
  const id     = Number(req.params["id"]);
  const userId = req.session.userId!;
  const kanAlles =
    req.permissies!.isHoofdbeheerder ||
    req.permissies!.heeftModuleRecht("declaraties", 3);

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
      .select({
        id: gebruikersTable.id,
        email: gebruikersTable.email,
        naam: gebruikersTable.naam,
        storedBevoegdheden: gebruikersTable.bevoegdheden,
        rol: gebruikersTable.rol,
      })
      .from(gebruikersTable)
      .where(eq(gebruikersTable.actief, true));
    const effectieveBevoegdheden = await berekenEffectieveBevoegdhedenBatch(
      alleGebruikers.map((g) => ({
        id: g.id,
        rol: g.rol,
        storedBevoegdheden: g.storedBevoegdheden,
      })),
    );

    for (const b of alleGebruikers) {
      if (b.id === userId) continue;
      const magBeoordelen =
        b.rol === "hoofdbeheerder" ||
        heeftNiveau(effectieveBevoegdheden.get(b.id) ?? {}, "declaraties", 3);
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
