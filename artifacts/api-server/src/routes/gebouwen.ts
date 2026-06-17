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
  documentenTable,
  documentKoppelingenTable,
  werkgeversTable,
} from "@workspace/db";
import { eq, inArray, count, and, sql, max, ne } from "drizzle-orm";
import { requireBevoegdheid, requireBevoegdheidOfKlant } from "../middlewares/auth";
import { effectieveContext } from "../utils/rol";
import { logActiviteit } from "../lib/activiteit";
import { mapDocument } from "../lib/documenten";
import { logDocumentActie } from "../lib/document-logboek";
import {
  analyseerGebouwVrijeTekst,
  analyseerTekening,
  analyseerPlattegrond,
  haalStreetViewBeeld,
  geocodeAdresNaarCoord,
} from "../services/gebouw-ai";

const router = Router();
const lezenGebouwen = requireBevoegdheid("gebouwen", 1);
const lezenGebouwenOfKlant = requireBevoegdheidOfKlant("gebouwen", 1);

const BEHEERDER_ROLLEN = ["beheerder", "hoofdbeheerder"];

function kapitaliseerWoorden(waarde: string): string {
  return waarde.replace(
    /(^|\s)(\p{L})/gu,
    (_m, voor: string, letter: string) => voor + letter.toUpperCase(),
  );
}

function uniekeConstraintNaam(err: unknown): string | null {
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505" &&
    "constraint" in err
  ) {
    return (err as { constraint?: string }).constraint ?? null;
  }
  return null;
}

function uniekFoutAntwoord(
  err: unknown,
  res: { status: (code: number) => { json: (body: unknown) => unknown } },
): boolean {
  const constraint = uniekeConstraintNaam(err);
  if (constraint === "gebouwen_werknummer_unique") {
    res.status(409).json({ error: "Dit werknummer is al in gebruik" });
    return true;
  }
  if (constraint === "gebouwen_projectnummer_unique") {
    res.status(409).json({ error: "Dit projectnummer is al in gebruik" });
    return true;
  }
  return false;
}

async function klantNaam(klantId: number | null): Promise<string | null> {
  if (!klantId) return null;
  const [k] = await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, klantId));
  return k?.naam ?? null;
}

async function toegewezenGebouwIds(userId: number): Promise<number[]> {
  const rows = await db
    .select({ gebouwId: gebouwToewijzingenTable.gebouwId })
    .from(gebouwToewijzingenTable)
    .where(eq(gebouwToewijzingenTable.gebruikerId, userId));
  return rows.map((r) => r.gebouwId);
}

// Centrale toewijzingsguard: gebruikers die tot hun toegewezen gebouwen beperkt
// zijn (bepaald via de bevoegdheden-matrix) mogen alleen daar bij. Gebruikers met
// gebouwbeheer en de hoofdbeheerder worden hier niet beperkt; rolafdwinging
// gebeurt via requireBevoegdheid. Geeft true als toegestaan.
async function magBijGebouw(req: import("express").Request, gebouwId: number | null): Promise<boolean> {
  const { userId, beperkt } = await effectieveContext(req);
  if (!beperkt) return true;
  if (gebouwId == null) return false;
  const ids = await toegewezenGebouwIds(userId);
  return ids.includes(gebouwId);
}

function gebouwRij(
  g: typeof gebouwenTable.$inferSelect,
  totaal: number,
  naam: string | null,
  partijen: { type: string; naam: string }[] = [],
  laatsteSpotOp: Date | string | null = null,
  werkmaatschappijNaam: string | null = null,
) {
  return {
    id: g.id,
    werknummer: g.werknummer,
    projectnummer: g.projectnummer,
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
    bijgewerkt_op: g.bijgewerktOp ? g.bijgewerktOp.toISOString() : null,
    laatste_spot_op: laatsteSpotOp ? new Date(laatsteSpotOp).toISOString() : null,
    gereed_op: g.gereedOp ? g.gereedOp.toISOString() : null,
    gereed_door: g.gereedDoor ?? null,
    gearchiveerd: g.gearchiveerd,
    gearchiveerd_op: g.gearchiveerdOp ? g.gearchiveerdOp.toISOString() : null,
    werkgever_id: g.werkgeverId ?? null,
    werkmaatschappij_naam: werkmaatschappijNaam,
  };
}

// GET /gebouwen
router.get("/gebouwen", lezenGebouwenOfKlant, async (req, res) => {
  try {
    const { userId, beperkt } = await effectieveContext(req);
    const { zoek, partij_type, partij_naam, inclusief_gearchiveerd } = req.query;

    let gebouwen = await db.select().from(gebouwenTable);

    // Standaard gearchiveerde gebouwen verbergen
    if (inclusief_gearchiveerd !== "true") {
      gebouwen = gebouwen.filter((g) => !g.gearchiveerd);
    }

    // Beperkte gebruikers zien alleen hun toegewezen gebouwen
    if (beperkt) {
      const ids = await toegewezenGebouwIds(userId);
      if (ids.length === 0) {
        return res.json([]);
      }
      gebouwen = gebouwen.filter((g) => ids.includes(g.id));
    }

    if (zoek) {
      const q = (zoek as string).toLowerCase();
      // Opdrachtgever-/eigenaar-namen per gebouw t.b.v. zoeken
      const zoekPartijen = await db.select().from(gebouwPartijenTable);
      const opdrachtgeverPerGebouw = new Map<number, string>();
      for (const p of zoekPartijen) {
        if (p.type === "opdrachtgever" || p.type === "eigenaar") {
          const huidig = opdrachtgeverPerGebouw.get(p.gebouwId) ?? "";
          opdrachtgeverPerGebouw.set(p.gebouwId, `${huidig} ${p.naam}`);
        }
      }
      gebouwen = gebouwen.filter((g) =>
        [
          g.naam,
          g.projectnummer ?? "",
          g.werknummer ?? "",
          g.adres,
          g.stad ?? "",
          opdrachtgeverPerGebouw.get(g.id) ?? "",
        ].some((veld) => veld.toLowerCase().includes(q)),
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

    const alleWerkgevers = await db
      .select({ id: werkgeversTable.id, naam: werkgeversTable.naam })
      .from(werkgeversTable);
    const werkgeverNamen = new Map(alleWerkgevers.map((w) => [w.id, w.naam]));

    const result = await Promise.all(
      gebouwen.map(async (g) => {
        const [stats] = await db
          .select({
            count: count(),
            laatsteSpotOp: sql<Date | null>`max(${voorzieningenTable.aangemaaktOp})`,
          })
          .from(voorzieningenTable)
          .where(eq(voorzieningenTable.gebouwId, g.id));
        return gebouwRij(
          g,
          Number(stats?.count ?? 0),
          await klantNaam(g.klantId),
          partijenPerGebouw.get(g.id) ?? [],
          stats?.laatsteSpotOp ?? null,
          werkgeverNamen.get(g.werkgeverId ?? -1) ?? null,
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
router.post("/gebouwen", requireBevoegdheid("gebouwen", 3), async (req, res) => {
  try {
    const {
      werknummer,
      projectnummer,
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
      werkgever_id,
    } = req.body;
    if (!naam || !adres) {
      return res.status(400).json({ error: "naam en adres zijn verplicht" });
    }
    const werknummerWaarde =
      typeof werknummer === "string" && werknummer.trim() ? werknummer.trim() : null;
    const projectnummerWaarde =
      typeof projectnummer === "string" && projectnummer.trim() ? projectnummer.trim() : null;
    const [gebouw] = await db
      .insert(gebouwenTable)
      .values({
        werknummer: werknummerWaarde,
        projectnummer: projectnummerWaarde,
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
        werkgeverId: werkgever_id ?? null,
      })
      .returning();
    const wgNaam = gebouw.werkgeverId
      ? ((await db.select({ naam: werkgeversTable.naam }).from(werkgeversTable).where(eq(werkgeversTable.id, gebouw.werkgeverId))).at(0)?.naam ?? null)
      : null;
    res.status(201).json(gebouwRij(gebouw, 0, await klantNaam(gebouw.klantId), [], null, wgNaam));
  } catch (err) {
    if (uniekFoutAntwoord(err, res)) {
      return;
    }
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /gebouwen/ai-analyse — alleen beheerder
router.post(
  "/gebouwen/ai-analyse",
  requireBevoegdheid("gebouwen", 3),
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
  requireBevoegdheid("gebouwen", 3),
  async (req, res) => {
    try {
      const gebouwId = parseInt(String(req.params.id));
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
  requireBevoegdheid("gebouwen", 3),
  async (req, res) => {
    try {
      const gebouwId = parseInt(String(req.params.id));
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
router.get("/gebouwen/partij-opties", lezenGebouwen, async (req, res) => {
  try {
    const { userId, beperkt } = await effectieveContext(req);

    let zichtbareGebouwIds: number[] | null = null;
    if (beperkt) {
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

// GET /gebouwen/:id/kaart
router.get("/gebouwen/:id/kaart", lezenGebouwen, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const { userId, beperkt } = await effectieveContext(req);

    const [gebouw] = await db
      .select({
        lat: gebouwenTable.latitude,
        lng: gebouwenTable.longitude,
        adres: gebouwenTable.adres,
        stad: gebouwenTable.stad,
      })
      .from(gebouwenTable)
      .where(eq(gebouwenTable.id, id));

    if (!gebouw) return res.status(404).json({ error: "Gebouw niet gevonden" });

    if (beperkt) {
      const ids = await toegewezenGebouwIds(userId);
      if (!ids.includes(id)) {
        return res.status(403).json({ error: "Geen toegang tot dit gebouw" });
      }
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return res.status(503).json({ error: "Kaartservice niet beschikbaar" });

    let embed_url: string;
    if (gebouw.lat != null && gebouw.lng != null) {
      embed_url = `https://www.google.com/maps/embed/v1/view?key=${apiKey}&center=${gebouw.lat},${gebouw.lng}&zoom=19&maptype=satellite`;
    } else if (gebouw.adres) {
      const q = encodeURIComponent(`${gebouw.adres}${gebouw.stad ? " " + gebouw.stad : ""}`);
      embed_url = `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${q}&maptype=satellite`;
    } else {
      return res.status(404).json({ error: "Geen locatiegegevens beschikbaar" });
    }

    res.json({ embed_url });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /gebouwen/:id/gevelbeeld — Street View gevelbeeld voor het opleverrapport-voorblad.
// Geeft bij ontbrekend beeld bewust { beeld: null } met status 200 terug (geen 4xx/5xx),
// zodat de print-readiness niet deadlockt op react-query retries.
router.get("/gebouwen/:id/gevelbeeld", lezenGebouwen, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const { userId, beperkt } = await effectieveContext(req);

    const [gebouw] = await db
      .select({
        lat: gebouwenTable.latitude,
        lng: gebouwenTable.longitude,
        adres: gebouwenTable.adres,
        postcode: gebouwenTable.postcode,
        stad: gebouwenTable.stad,
      })
      .from(gebouwenTable)
      .where(eq(gebouwenTable.id, id));

    if (!gebouw) return res.status(404).json({ error: "Gebouw niet gevonden" });

    if (beperkt) {
      const ids = await toegewezenGebouwIds(userId);
      if (!ids.includes(id)) {
        return res.status(403).json({ error: "Geen toegang tot dit gebouw" });
      }
    }

    if (!process.env.GOOGLE_MAPS_API_KEY) {
      return res.json({ beeld: null });
    }

    let lat = gebouw.lat;
    let lng = gebouw.lng;

    // Veel gebouwen hebben (nog) geen opgeslagen coördinaten — bv. seed-data of
    // handmatig aangemaakte gebouwen waarbij het automatisch invullen niet is gebruikt.
    // Vul de coördinaten dan op-aanvraag aan via geocoding van het adres en schrijf ze
    // terug, zodat het gevelbeeld (en andere kaartfuncties) werken zonder het invullen
    // opnieuw te hoeven draaien. Best-effort: faalt het terugschrijven, dan tonen we het
    // beeld alsnog op basis van de zojuist gevonden coördinaten.
    if ((lat == null || lng == null) && gebouw.adres) {
      const zoekterm = [gebouw.adres, gebouw.postcode, gebouw.stad]
        .filter(Boolean)
        .join(", ");
      const coord = await geocodeAdresNaarCoord(zoekterm);
      if (coord) {
        lat = coord.lat;
        lng = coord.lng;
        try {
          await db
            .update(gebouwenTable)
            .set({ latitude: coord.lat, longitude: coord.lng })
            .where(eq(gebouwenTable.id, id));
        } catch (err) {
          req.log.warn({ err }, "Coördinaten terugschrijven mislukt");
        }
      }
    }

    if (lat == null || lng == null) {
      return res.json({ beeld: null });
    }

    let beeld: string | null = null;
    try {
      beeld = await haalStreetViewBeeld(lat, lng);
    } catch (err) {
      req.log.warn({ err }, "Gevelbeeld ophalen mislukt");
    }
    res.json({ beeld });
  } catch (err) {
    req.log.error(err);
    res.json({ beeld: null });
  }
});

// GET /gebouwen/:id
router.get("/gebouwen/:id", lezenGebouwenOfKlant, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const { userId, beperkt } = await effectieveContext(req);

    const [gebouw] = await db.select().from(gebouwenTable).where(eq(gebouwenTable.id, id));
    if (!gebouw) return res.status(404).json({ error: "Gebouw niet gevonden" });

    const werkgeverNaamDetail = gebouw.werkgeverId
      ? ((await db.select({ naam: werkgeversTable.naam }).from(werkgeversTable).where(eq(werkgeversTable.id, gebouw.werkgeverId))).at(0)?.naam ?? null)
      : null;

    // Toegangscontrole: beperkte gebruikers mogen alleen toegewezen gebouwen zien
    if (beperkt) {
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
      voorbereid: alleVoorzieningen.filter((v) => v.status === "voorbereid").length,
      goedgekeurd: alleVoorzieningen.filter((v) => v.status === "goedgekeurd").length,
      afgekeurd: alleVoorzieningen.filter((v) => v.status === "afgekeurd").length,
      in_bewerking: alleVoorzieningen.filter((v) => v.status === "concept" || v.status === "in_uitvoering").length,
      in_onderhoud: alleVoorzieningen.filter((v) => v.status === "in_onderhoud").length,
    };

    res.json({
      id: gebouw.id,
      werknummer: gebouw.werknummer,
      projectnummer: gebouw.projectnummer,
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
      bijgewerkt_op: gebouw.bijgewerktOp ? gebouw.bijgewerktOp.toISOString() : null,
      gereed_op: gebouw.gereedOp ? gebouw.gereedOp.toISOString() : null,
      gereed_door: gebouw.gereedDoor ?? null,
      gearchiveerd: gebouw.gearchiveerd,
      gearchiveerd_op: gebouw.gearchiveerdOp ? gebouw.gearchiveerdOp.toISOString() : null,
      werkgever_id: gebouw.werkgeverId ?? null,
      werkmaatschappij_naam: werkgeverNaamDetail,
      verdiepingen: verdiepingenMet,
      stats,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /gebouwen/:id
router.patch("/gebouwen/:id", requireBevoegdheid("gebouwen", 2), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const {
      werknummer,
      projectnummer,
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
      werkgever_id,
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
        ...(projectnummer !== undefined
          ? {
              projectnummer:
                typeof projectnummer === "string" && projectnummer.trim()
                  ? projectnummer.trim()
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
        ...(werkgever_id !== undefined ? { werkgeverId: werkgever_id ?? null } : {}),
        bijgewerktOp: new Date(),
      })
      .where(eq(gebouwenTable.id, id))
      .returning();
    if (!gebouw) return res.status(404).json({ error: "Gebouw niet gevonden" });
    const [totaal] = await db
      .select({ count: count() })
      .from(voorzieningenTable)
      .where(eq(voorzieningenTable.gebouwId, id));
    const patchWgNaam = gebouw.werkgeverId
      ? ((await db.select({ naam: werkgeversTable.naam }).from(werkgeversTable).where(eq(werkgeversTable.id, gebouw.werkgeverId))).at(0)?.naam ?? null)
      : null;
    res.json(gebouwRij(gebouw, Number(totaal?.count ?? 0), await klantNaam(gebouw.klantId), [], null, patchWgNaam));
  } catch (err) {
    if (uniekFoutAntwoord(err, res)) {
      return;
    }
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /gebouwen/:id/gereed
router.patch("/gebouwen/:id/gereed", requireBevoegdheid("gebouwen", 3), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const { gereed_door } = req.body;
    const [gebouw] = await db
      .update(gebouwenTable)
      .set({ gereedOp: new Date(), gereedDoor: gereed_door ?? null, bijgewerktOp: new Date() })
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

// DELETE /gebouwen/:id/gereed — reset gereed-status naar actief
router.delete("/gebouwen/:id/gereed", requireBevoegdheid("gebouwen", 3), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [gebouw] = await db
      .update(gebouwenTable)
      .set({ gereedOp: null, gereedDoor: null, bijgewerktOp: new Date() })
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
router.delete("/gebouwen/:id", requireBevoegdheid("gebouwen", 4), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    await db.delete(gebouwenTable).where(eq(gebouwenTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /gebouwen/:id/verdiepingen
router.get("/gebouwen/:id/verdiepingen", lezenGebouwen, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));

    // Beperkte gebruikers mogen alleen verdiepingen van toegewezen gebouwen zien.
    const { userId, beperkt } = await effectieveContext(req);
    if (beperkt) {
      const ids = await toegewezenGebouwIds(userId);
      if (!ids.includes(id)) {
        res.status(403).json({ error: "Geen toegang tot dit gebouw" });
        return;
      }
    }

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
router.post("/gebouwen/:id/verdiepingen", requireBevoegdheid("gebouwen", 3), async (req, res) => {
  try {
    const gebouwId = parseInt(String(req.params.id));
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
router.get("/verdiepingen/:id", lezenGebouwen, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [v] = await db.select().from(verdiepingenTable).where(eq(verdiepingenTable.id, id));
    if (!v) return res.status(404).json({ error: "Verdieping niet gevonden" });

    // Beperkte gebruikers mogen alleen verdiepingen van toegewezen gebouwen zien.
    const { userId, beperkt } = await effectieveContext(req);
    if (beperkt) {
      const ids = await toegewezenGebouwIds(userId);
      if (!ids.includes(v.gebouwId)) {
        return res.status(403).json({ error: "Geen toegang tot deze verdieping" });
      }
    }
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
      logo_x: v.logoX,
      logo_y: v.logoY,
      logo_breedte: v.logoBreedte,
      totaal_voorzieningen: Number(totaal?.count ?? 0),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /verdiepingen/:id
router.patch("/verdiepingen/:id", requireBevoegdheid("gebouwen", 2), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const { naam, niveau, plattegrond_url, breedte, hoogte, logo_x, logo_y, logo_breedte } = req.body;
    const wijziging: Record<string, unknown> = {};
    if (naam !== undefined) wijziging.naam = naam;
    if (niveau !== undefined) wijziging.niveau = niveau;
    if (plattegrond_url !== undefined) wijziging.plattegrondUrl = plattegrond_url;
    if (breedte !== undefined) wijziging.breedte = breedte;
    if (hoogte !== undefined) wijziging.hoogte = hoogte;
    if (logo_x !== undefined) wijziging.logoX = logo_x;
    if (logo_y !== undefined) wijziging.logoY = logo_y;
    if (logo_breedte !== undefined) wijziging.logoBreedte = logo_breedte;
    const [v] = await db
      .update(verdiepingenTable)
      .set(wijziging)
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
      logo_x: v.logoX,
      logo_y: v.logoY,
      logo_breedte: v.logoBreedte,
      totaal_voorzieningen: Number(totaal?.count ?? 0),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// DELETE /verdiepingen/:id
router.delete("/verdiepingen/:id", requireBevoegdheid("gebouwen", 4), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    await db.delete(verdiepingenTable).where(eq(verdiepingenTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── TOEWIJZINGEN ──────────────────────────────────────────────────────────

// GET /gebouwen/:id/toewijzingen
router.get("/gebouwen/:id/toewijzingen", lezenGebouwen, async (req, res) => {
  try {
    const gebouwId = parseInt(String(req.params.id));
    if (!(await magBijGebouw(req, gebouwId))) {
      res.status(403).json({ error: "Geen toegang tot dit gebouw" });
      return;
    }
    const rows = await db
      .select({
        id: gebouwToewijzingenTable.id,
        gebouwId: gebouwToewijzingenTable.gebouwId,
        gebruikerId: gebouwToewijzingenTable.gebruikerId,
        naam: gebruikersTable.naam,
        rol: gebruikersTable.rol,
        projectRol: gebouwToewijzingenTable.projectRol,
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
        project_rol: r.projectRol ?? null,
        aangemaakt_op: r.aangemaaktOp.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /gebouwen/:id/spots-inzicht — spots per monteur per dag
router.get("/gebouwen/:id/spots-inzicht", lezenGebouwen, async (req, res) => {
  try {
    const gebouwId = parseInt(String(req.params.id));
    if (!(await magBijGebouw(req, gebouwId))) {
      res.status(403).json({ error: "Geen toegang tot dit gebouw" });
      return;
    }

    const rows = await db
      .select({
        makerId: voorzieningenTable.makerMonteurId,
        naam: gebruikersTable.naam,
        aangemaaktOp: voorzieningenTable.aangemaaktOp,
      })
      .from(voorzieningenTable)
      .leftJoin(gebruikersTable, eq(voorzieningenTable.makerMonteurId, gebruikersTable.id))
      .where(
        and(
          eq(voorzieningenTable.gebouwId, gebouwId),
          eq(voorzieningenTable.gearchiveerd, false),
        ),
      );

    type DagMap = Map<string, number>;
    const perMonteur = new Map<
      string,
      { monteur_id: number | null; naam: string; totaal: number; dagen: DagMap }
    >();

    for (const r of rows) {
      const sleutel = r.makerId != null ? String(r.makerId) : "onbekend";
      let item = perMonteur.get(sleutel);
      if (!item) {
        item = {
          monteur_id: r.makerId ?? null,
          naam: r.naam ?? "Onbekend",
          totaal: 0,
          dagen: new Map(),
        };
        perMonteur.set(sleutel, item);
      }
      item.totaal += 1;
      const datum = r.aangemaaktOp.toISOString().slice(0, 10);
      item.dagen.set(datum, (item.dagen.get(datum) ?? 0) + 1);
    }

    const per_monteur = Array.from(perMonteur.values())
      .map((m) => ({
        monteur_id: m.monteur_id,
        naam: m.naam,
        totaal: m.totaal,
        per_dag: Array.from(m.dagen.entries())
          .map(([datum, aantal]) => ({ datum, aantal }))
          .sort((a, b) => b.datum.localeCompare(a.datum)),
      }))
      .sort((a, b) => b.totaal - a.totaal);

    res.json({ totaal: rows.length, per_monteur });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /gebouwen/:id/toewijzingen — alleen beheerder
router.post(
  "/gebouwen/:id/toewijzingen",
  requireBevoegdheid("gebouwen", 3),
  async (req, res) => {
    try {
      const gebouwId = parseInt(String(req.params.id));
      const { gebruiker_id, project_rol } = req.body ?? {};
      if (!gebruiker_id) {
        return res.status(400).json({ error: "gebruiker_id is verplicht" });
      }

      // Controleer of gebruiker bestaat
      const [gebruiker] = await db
        .select({ id: gebruikersTable.id, naam: gebruikersTable.naam, email: gebruikersTable.email, rol: gebruikersTable.rol, functietitels: gebruikersTable.functietitels })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, Number(gebruiker_id)));
      if (!gebruiker) {
        return res.status(404).json({ error: "Gebruiker niet gevonden" });
      }

      // Projectteam-regels: een beheerder wordt gekoppeld mét een projectfunctie
      // uit zijn eigen profiel; monteurs/controleurs uitsluitend op naam (null).
      const isBeheerder =
        gebruiker.rol === "beheerder" || gebruiker.rol === "hoofdbeheerder";
      let projectRol: string | null = null;
      if (isBeheerder) {
        const gekozen = project_rol ? String(project_rol) : "";
        if (!gekozen) {
          return res
            .status(400)
            .json({ error: "Een beheerder vereist een projectfunctie" });
        }
        if (!(gebruiker.functietitels ?? []).includes(gekozen)) {
          return res.status(400).json({
            error: "Projectfunctie hoort niet bij het profiel van deze beheerder",
          });
        }
        projectRol = gekozen;
      }

      const [toewijzing] = await db
        .insert(gebouwToewijzingenTable)
        .values({
          gebouwId,
          gebruikerId: Number(gebruiker_id),
          aangemaaktDoorId: req.session.userId,
          projectRol,
        })
        .onConflictDoNothing()
        .returning();

      if (!toewijzing) {
        // Al toegewezen — retourneer bestaande
        const [bestaand] = await db
          .select({ id: gebouwToewijzingenTable.id, projectRol: gebouwToewijzingenTable.projectRol, aangemaaktOp: gebouwToewijzingenTable.aangemaaktOp })
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
          project_rol: bestaand!.projectRol ?? null,
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
        project_rol: toewijzing.projectRol ?? null,
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
  requireBevoegdheid("gebouwen", 4),
  async (req, res) => {
    try {
      const gebouwId = parseInt(String(req.params.id));
      const gebruikerId = parseInt(String(req.params.gebruikerId));
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

const PARTIJ_TYPES = ["eigenaar", "gebruiker", "opdrachtgever", "aanvrager", "installateur", "aannemer"];

function partijRij(p: typeof gebouwPartijenTable.$inferSelect) {
  return {
    id: p.id,
    gebouw_id: p.gebouwId,
    type: p.type,
    naam: p.naam,
    organisatie: p.organisatie,
    telefoon: p.telefoon,
    email: p.email,
    website: p.website,
    adres: p.adres,
    postcode: p.postcode,
    plaats: p.plaats,
    opmerkingen: p.opmerkingen,
    aangemaakt_op: p.aangemaaktOp.toISOString(),
  };
}

// GET /gebouwen/:id/partijen
router.get("/gebouwen/:id/partijen", lezenGebouwen, async (req, res) => {
  try {
    const gebouwId = parseInt(String(req.params.id));
    if (!(await magBijGebouw(req, gebouwId))) {
      res.status(403).json({ error: "Geen toegang tot dit gebouw" });
      return;
    }
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
  requireBevoegdheid("gebouwen", 3),
  async (req, res) => {
    try {
      const gebouwId = parseInt(String(req.params.id));
      const { type, naam, organisatie, telefoon, email, website, adres, postcode, plaats, opmerkingen } = req.body ?? {};
      if (!type || !PARTIJ_TYPES.includes(type)) {
        return res.status(400).json({ error: "Ongeldig partijtype" });
      }
      if (!naam || typeof naam !== "string") {
        return res.status(400).json({ error: "naam is verplicht" });
      }
      const [partij] = await db
        .insert(gebouwPartijenTable)
        .values({ gebouwId, type, naam, organisatie, telefoon, email, website, adres, postcode, plaats, opmerkingen })
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
  requireBevoegdheid("gebouwen", 2),
  async (req, res) => {
    try {
      const partijId = parseInt(String(req.params.partijId));
      const { type, naam, organisatie, telefoon, email, website, adres, postcode, plaats, opmerkingen } = req.body ?? {};
      if (type !== undefined && !PARTIJ_TYPES.includes(type)) {
        return res.status(400).json({ error: "Ongeldig partijtype" });
      }
      const updates: Record<string, unknown> = { bijgewerktOp: new Date() };
      if (type !== undefined) updates.type = type;
      if (naam !== undefined) updates.naam = naam;
      if (organisatie !== undefined) updates.organisatie = organisatie;
      if (telefoon !== undefined) updates.telefoon = telefoon;
      if (email !== undefined) updates.email = email;
      if (website !== undefined) updates.website = website;
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
  requireBevoegdheid("gebouwen", 4),
  async (req, res) => {
    try {
      const partijId = parseInt(String(req.params.partijId));
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
    zichtbaar_monteur: t.zichtbaarMonteur,
    aangemaakt_op: t.aangemaaktOp.toISOString(),
  };
}

// GET /gebouwen/:id/tekeningen
router.get("/gebouwen/:id/tekeningen", lezenGebouwen, async (req, res) => {
  try {
    const gebouwId = parseInt(String(req.params.id));
    if (!(await magBijGebouw(req, gebouwId))) {
      res.status(403).json({ error: "Geen toegang tot dit gebouw" });
      return;
    }
    const rows = await db
      .select()
      .from(tekeningenTable)
      .where(eq(tekeningenTable.gebouwId, gebouwId));
    // Documenten zijn intern: alleen beheerders zien ze altijd. Voor alle andere
    // rollen zijn documenten enkel zichtbaar als ze expliciet zijn aangevinkt
    // (zichtbaar_monteur). Overige tekeningtypen blijven gewoon zichtbaar.
    const { rol } = await effectieveContext(req);
    const isBeheerder = rol === "beheerder" || rol === "hoofdbeheerder";
    const zichtbaar = isBeheerder
      ? rows
      : rows.filter((t) => t.type !== "document" || t.zichtbaarMonteur);
    res.json(zichtbaar.map(tekeningRij));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /gebouwen/:id/tekeningen — alleen beheerder
router.post(
  "/gebouwen/:id/tekeningen",
  requireBevoegdheid("gebouwen", 3),
  async (req, res) => {
    try {
      const gebouwId = parseInt(String(req.params.id));
      const { naam, type, schaal, url, verdieping_id, zichtbaar_monteur } = req.body ?? {};
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
          zichtbaarMonteur: zichtbaar_monteur === true,
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
  requireBevoegdheid("gebouwen", 2),
  async (req, res) => {
    try {
      const tekeningId = parseInt(String(req.params.tekeningId));
      const { naam, type, schaal, verdieping_id, zichtbaar_monteur } = req.body ?? {};
      const updates: Record<string, unknown> = { bijgewerktOp: new Date() };
      if (naam !== undefined) updates.naam = naam;
      if (type !== undefined) updates.type = type;
      if (schaal !== undefined) updates.schaal = schaal;
      if (verdieping_id !== undefined) updates.verdiepingId = verdieping_id;
      if (zichtbaar_monteur !== undefined) updates.zichtbaarMonteur = zichtbaar_monteur === true;

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
  requireBevoegdheid("gebouwen", 4),
  async (req, res) => {
    try {
      const tekeningId = parseInt(String(req.params.tekeningId));
      await db.delete(tekeningenTable).where(eq(tekeningenTable.id, tekeningId));
      res.status(204).send();
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// PATCH /gebouwen/:id/archief — archiveren of terugplaatsen (alleen beheerder)
router.patch("/gebouwen/:id/archief", requireBevoegdheid("gebouwen", 4), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const gearchiveerd = req.body?.gearchiveerd === true;

    const [gebouw] = await db.select().from(gebouwenTable).where(eq(gebouwenTable.id, id));
    if (!gebouw) return res.status(404).json({ error: "Gebouw niet gevonden" });

    const [bijgewerkt] = await db
      .update(gebouwenTable)
      .set({
        gearchiveerd,
        gearchiveerdOp: gearchiveerd ? new Date() : null,
        bijgewerktOp: new Date(),
      })
      .where(eq(gebouwenTable.id, id))
      .returning();

    await logActiviteit({
      type: gearchiveerd ? "gebouw_gearchiveerd" : "gebouw_teruggeplaatst",
      omschrijving: `Gebouw "${bijgewerkt!.naam}" ${gearchiveerd ? "gearchiveerd" : "teruggeplaatst"}`,
      gebouwId: id,
      gebruikerId: req.session.userId,
    });

    const verdiepingen = await db.select().from(verdiepingenTable).where(eq(verdiepingenTable.gebouwId, id));
    const alleVoorzieningen = await db
      .select({ status: voorzieningenTable.status })
      .from(voorzieningenTable)
      .where(eq(voorzieningenTable.gebouwId, id));
    const stats = {
      totaal: alleVoorzieningen.length,
      voorbereid: alleVoorzieningen.filter((v) => v.status === "voorbereid").length,
      goedgekeurd: alleVoorzieningen.filter((v) => v.status === "goedgekeurd").length,
      afgekeurd: alleVoorzieningen.filter((v) => v.status === "afgekeurd").length,
      in_bewerking: alleVoorzieningen.filter((v) => v.status === "concept" || v.status === "in_uitvoering").length,
      in_onderhoud: alleVoorzieningen.filter((v) => v.status === "in_onderhoud").length,
    };

    res.json({
      id: bijgewerkt!.id,
      werknummer: bijgewerkt!.werknummer,
      projectnummer: bijgewerkt!.projectnummer,
      naam: bijgewerkt!.naam,
      adres: bijgewerkt!.adres,
      stad: bijgewerkt!.stad,
      postcode: bijgewerkt!.postcode,
      omschrijving: bijgewerkt!.omschrijving,
      klant_id: bijgewerkt!.klantId,
      klant_naam: await klantNaam(bijgewerkt!.klantId),
      aantal_verdiepingen: bijgewerkt!.aantalVerdiepingen,
      hoogte: bijgewerkt!.hoogte,
      breedte: bijgewerkt!.breedte,
      diepte: bijgewerkt!.diepte,
      oppervlakte: bijgewerkt!.oppervlakte,
      gebouw_type: bijgewerkt!.gebouwType,
      latitude: bijgewerkt!.latitude,
      longitude: bijgewerkt!.longitude,
      aangemaakt_op: bijgewerkt!.aangemaaktOp.toISOString(),
      bijgewerkt_op: bijgewerkt!.bijgewerktOp ? bijgewerkt!.bijgewerktOp.toISOString() : null,
      gereed_op: bijgewerkt!.gereedOp ? bijgewerkt!.gereedOp.toISOString() : null,
      gereed_door: bijgewerkt!.gereedDoor ?? null,
      gearchiveerd: bijgewerkt!.gearchiveerd,
      gearchiveerd_op: bijgewerkt!.gearchiveerdOp ? bijgewerkt!.gearchiveerdOp.toISOString() : null,
      verdiepingen: verdiepingen.map((v) => ({
        id: v.id,
        gebouw_id: v.gebouwId,
        naam: v.naam,
        niveau: v.niveau,
        plattegrond_url: v.plattegrondUrl,
        breedte: v.breedte,
        hoogte: v.hoogte,
        totaal_voorzieningen: 0,
      })),
      stats,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /gebouwen/:id/opleverrapport — opleverrapport-PDF als document opslaan + koppelen
// Revisiebewust: bestaat er al een opleverrapport gekoppeld aan dit gebouw, dan maken we
// een nieuwe revisie in dezelfde groep (oude actuele -> "vervangen") en verhuizen we de
// gebouwkoppeling naar de nieuwe revisie. Anders nieuw document + koppeling.
router.post(
  "/gebouwen/:id/opleverrapport",
  requireBevoegdheid("bibliotheek", 3),
  async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      if (!Number.isInteger(id)) {
        return res.status(400).json({ error: "Ongeldig gebouw-id" });
      }
      const [gebouw] = await db
        .select()
        .from(gebouwenTable)
        .where(eq(gebouwenTable.id, id));
      if (!gebouw) {
        return res.status(404).json({ error: "Gebouw niet gevonden" });
      }

      const pdfUrl =
        typeof req.body?.pdf_url === "string" ? req.body.pdf_url.trim() : "";
      if (!pdfUrl) {
        return res.status(400).json({ error: "pdf_url is verplicht" });
      }
      const bestandsgrootte = Number.isInteger(req.body?.bestandsgrootte)
        ? (req.body.bestandsgrootte as number)
        : null;
      const bestandsHash =
        typeof req.body?.bestands_hash === "string"
          ? req.body.bestands_hash
          : null;

      const naam = gebouw.projectnummer
        ? `Opleverrapport ${gebouw.projectnummer} - ${gebouw.naam}`
        : `Opleverrapport ${gebouw.naam}`;
      const vandaag = new Date().toISOString().slice(0, 10);
      const { userId } = await effectieveContext(req);

      const doc = await db.transaction(async (tx) => {
        // Bestaand opleverrapport dat aan dit gebouw is gekoppeld?
        const gekoppeld = await tx
          .select({ doc: documentenTable })
          .from(documentKoppelingenTable)
          .innerJoin(
            documentenTable,
            eq(documentKoppelingenTable.documentId, documentenTable.id),
          )
          .where(
            and(
              eq(documentKoppelingenTable.doelType, "gebouw"),
              eq(documentKoppelingenTable.doelId, id),
              eq(documentenTable.documenttype, "opleverrapport"),
              eq(documentenTable.gearchiveerd, false),
            ),
          );
        const bron =
          gekoppeld.find((r) => r.doc.status === "actueel")?.doc ??
          gekoppeld
            .map((r) => r.doc)
            .sort((a, b) => b.revisieNummer - a.revisieNummer)[0];

        if (bron) {
          const [{ maxNum }] = await tx
            .select({ maxNum: max(documentenTable.revisieNummer) })
            .from(documentenTable)
            .where(eq(documentenTable.groepId, bron.groepId));
          const volgend = (maxNum ?? bron.revisieNummer) + 1;
          const [row] = await tx
            .insert(documentenTable)
            .values({
              naam,
              documenttype: "opleverrapport",
              datum: vandaag,
              pdfUrl,
              bestandsHash,
              bestandsgrootte,
              status: "actueel",
              goedkeuringStatus: "goedgekeurd",
              groepId: bron.groepId,
              revisieNummer: volgend,
            })
            .returning();
          // Oude actuele revisie(s) in deze groep markeren als vervangen.
          await tx
            .update(documentenTable)
            .set({ status: "vervangen", bijgewerktOp: new Date() })
            .where(
              and(
                eq(documentenTable.groepId, bron.groepId),
                eq(documentenTable.status, "actueel"),
                ne(documentenTable.id, row.id),
              ),
            );
          // Gebouwkoppeling verhuizen naar de nieuwe revisie: oude koppelingen van
          // documenten uit deze groep aan dit gebouw verwijderen, dan nieuwe koppelen.
          const groepDocs = await tx
            .select({ id: documentenTable.id })
            .from(documentenTable)
            .where(eq(documentenTable.groepId, bron.groepId));
          const groepIds = groepDocs.map((d) => d.id);
          if (groepIds.length > 0) {
            await tx
              .delete(documentKoppelingenTable)
              .where(
                and(
                  eq(documentKoppelingenTable.doelType, "gebouw"),
                  eq(documentKoppelingenTable.doelId, id),
                  inArray(documentKoppelingenTable.documentId, groepIds),
                ),
              );
          }
          await tx
            .insert(documentKoppelingenTable)
            .values({
              documentId: row.id,
              doelType: "gebouw",
              doelId: id,
              aangemaaktDoorId: userId,
            })
            .onConflictDoNothing();
          return row;
        }

        // Geen bestaand opleverrapport: nieuw document + koppeling.
        const [row] = await tx
          .insert(documentenTable)
          .values({
            naam,
            documenttype: "opleverrapport",
            datum: vandaag,
            pdfUrl,
            bestandsHash,
            bestandsgrootte,
            status: "actueel",
            goedkeuringStatus: "goedgekeurd",
          })
          .returning();
        await tx
          .insert(documentKoppelingenTable)
          .values({
            documentId: row.id,
            doelType: "gebouw",
            doelId: id,
            aangemaaktDoorId: userId,
          })
          .onConflictDoNothing();
        return row;
      });

      await logDocumentActie({
        documentId: doc.id,
        documentNaam: doc.naam,
        gebruikerId: userId,
        actie: doc.revisieNummer > 1 ? "revisie" : "geupload",
        detail: `opleverrapport gebouw #${id}`,
      });

      return res.status(201).json(await mapDocument(doc));
    } catch (err) {
      if ((err as { code?: string })?.code === "23505") {
        return res.status(409).json({
          error:
            "Er werd net een andere revisie opgeslagen. Probeer het opnieuw.",
        });
      }
      req.log.error(err);
      return res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

export default router;
