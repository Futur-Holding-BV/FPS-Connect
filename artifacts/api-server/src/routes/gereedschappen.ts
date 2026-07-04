import { Router } from "express";
import { db } from "@workspace/db";
import {
  gereedschappenTable,
  bruikleenOvereenkomstenTable,
  gereedschapMeldingenTable,
  medewerkersTable,
} from "@workspace/db/schema";
import { eq, ilike, or, and, desc } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { ObjectStorageService } from "../lib/objectStorage";
import { aiGateway, heeftGateway } from "../lib/aiGateway";
import { logger } from "../lib/logger";

const router = Router();

const lezen     = requireBevoegdheid("gereedschappen", 1);
const schrijven = requireBevoegdheid("gereedschappen", 2);

// ── Helpers ───────────────────────────────────────────────────────────────────

function volgNummer(id: number): string {
  return `GS-${id.toString().padStart(4, "0")}`;
}

function mapGereedschap(
  g: typeof gereedschappenTable.$inferSelect,
  huidigNaam?: string | null
) {
  return {
    id: g.id,
    volgnummer: g.volgnummer,
    gegraveerd_nummer: g.gegraveerdNummer ?? null,
    omschrijving: g.omschrijving,
    merk: g.merk ?? null,
    type: g.type ?? null,
    serienummer: g.serienummer ?? null,
    categorie: g.categorie,
    aandrijving: g.aandrijving,
    met_snoer: g.metSnoer,
    accu_inbegrepen: g.accuInbegrepen,
    lader_inbegrepen: g.laderInbegrepen,
    koffer_inbegrepen: g.kofferInbegrepen,
    aankoopdatum: g.aankoopdatum ?? null,
    aankoopprijs: g.aankoopprijs ?? null,
    leverancier: g.leverancier ?? null,
    garantietermijn: g.garantietermijn ?? null,
    status: g.status,
    huidige_medewerker_id: g.huidigeMedewerkerId ?? null,
    huidige_medewerker_naam: huidigNaam ?? null,
    locatie: g.locatie ?? null,
    keuringsplichtig: g.keuringsplichtig,
    laatste_keuring: g.laatsteKeuring ?? null,
    volgende_keuring: g.volgendeKeuring ?? null,
    opmerkingen: g.opmerkingen ?? null,
    foto_url: g.fotoUrl ?? null,
    aangemaakt_op: g.aangemaaktOp.toISOString(),
    bijgewerkt_op: g.bijgewerktOp.toISOString(),
  };
}

function mapBruikleen(
  b: typeof bruikleenOvereenkomstenTable.$inferSelect,
  extra?: {
    gereedschapOmschrijving?: string | null;
    gereedschapVolgnummer?: string | null;
    medewerkerNaam?: string | null;
    uitgeverNaam?: string | null;
  }
) {
  return {
    id: b.id,
    gereedschap_id: b.gereedschapId,
    gereedschap_omschrijving: extra?.gereedschapOmschrijving ?? null,
    gereedschap_volgnummer: extra?.gereedschapVolgnummer ?? null,
    medewerker_id: b.medewerkerId,
    medewerker_naam: extra?.medewerkerNaam ?? null,
    uitgegever_door_id: b.uitgegeverDoorId ?? null,
    uitgever_naam: extra?.uitgeverNaam ?? null,
    datum_uitgifte: b.datumUitgifte,
    datum_inname: b.datumInname ?? null,
    staat_bij_uitgifte: b.staatBijUitgifte ?? null,
    staat_bij_inname: b.staatBijInname ?? null,
    accessoires: b.accessoires ?? null,
    bruikleen_voorwaarden: b.bruikleenVoorwaarden ?? null,
    handtekening_medewerker_url: b.handtekeningMedewerkerUrl ?? null,
    handtekening_uitgever_url: b.handtekeningUitgeverUrl ?? null,
    definitief: b.definitief,
    definitief_op: b.definitiefOp?.toISOString() ?? null,
    pdf_url: b.pdfUrl ?? null,
    opmerkingen: b.opmerkingen ?? null,
    aangemaakt_op: b.aangemaaktOp.toISOString(),
    bijgewerkt_op: b.bijgewerktOp.toISOString(),
  };
}

function mapMelding(
  m: typeof gereedschapMeldingenTable.$inferSelect,
  gemeldNaam?: string | null
) {
  return {
    id: m.id,
    gereedschap_id: m.gereedschapId,
    gemeld_door_medewerker_id: m.gemeldDoorMedewerkerId ?? null,
    gemeld_door_naam: gemeldNaam ?? null,
    soort_melding: m.soortMelding,
    omschrijving: m.omschrijving,
    urgentie: m.urgentie,
    kan_nog_veilig_gebruikt_worden: m.kanNogVeiligGebruiktWorden ?? null,
    datum_melding: m.datumMelding,
    status: m.status,
    opmerkingen: m.opmerkingen ?? null,
    aangemaakt_op: m.aangemaaktOp.toISOString(),
    bijgewerkt_op: m.bijgewerktOp.toISOString(),
  };
}

// ── GET /gereedschappen ───────────────────────────────────────────────────────
router.get("/gereedschappen", lezen, async (req, res): Promise<void> => {
  const { status, zoek, categorie, medewerker_id } = req.query as Record<string, string>;

  const filters = [];
  if (status) filters.push(eq(gereedschappenTable.status, status));
  if (categorie) filters.push(eq(gereedschappenTable.categorie, categorie));
  if (medewerker_id) filters.push(eq(gereedschappenTable.huidigeMedewerkerId, parseInt(medewerker_id)));
  if (zoek) {
    filters.push(
      or(
        ilike(gereedschappenTable.omschrijving, `%${zoek}%`),
        ilike(gereedschappenTable.volgnummer, `%${zoek}%`),
        ilike(gereedschappenTable.gegraveerdNummer, `%${zoek}%`),
        ilike(gereedschappenTable.merk, `%${zoek}%`)
      )!
    );
  }

  const rijen = await db
    .select({
      g: gereedschappenTable,
      medewerkerNaam: medewerkersTable.naam,
    })
    .from(gereedschappenTable)
    .leftJoin(medewerkersTable, eq(gereedschappenTable.huidigeMedewerkerId, medewerkersTable.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(gereedschappenTable.id));

  res.json(rijen.map((r) => mapGereedschap(r.g, r.medewerkerNaam)));
});

// ── POST /gereedschappen ──────────────────────────────────────────────────────
router.post("/gereedschappen", schrijven, async (req, res): Promise<void> => {
  const {
    gegraveerd_nummer, omschrijving, merk, type, serienummer,
    categorie, aandrijving, met_snoer, accu_inbegrepen, lader_inbegrepen,
    koffer_inbegrepen, aankoopdatum, aankoopprijs, leverancier,
    garantietermijn, status, huidige_medewerker_id, locatie,
    keuringsplichtig, laatste_keuring, volgende_keuring, opmerkingen,
  } = req.body;

  if (!omschrijving || !categorie || !aandrijving) {
    res.status(400).json({ error: "omschrijving, categorie en aandrijving zijn verplicht" });
    return;
  }

  const [aangemaakt] = await db
    .insert(gereedschappenTable)
    .values({
      volgnummer: "GS-TEMP",
      gegraveerdNummer: gegraveerd_nummer ?? null,
      omschrijving,
      merk: merk ?? null,
      type: type ?? null,
      serienummer: serienummer ?? null,
      categorie: categorie ?? "overig",
      aandrijving: aandrijving ?? "handgereedschap",
      metSnoer: met_snoer ?? false,
      accuInbegrepen: accu_inbegrepen ?? false,
      laderInbegrepen: lader_inbegrepen ?? false,
      kofferInbegrepen: koffer_inbegrepen ?? false,
      aankoopdatum: aankoopdatum ?? null,
      aankoopprijs: aankoopprijs ?? null,
      leverancier: leverancier ?? null,
      garantietermijn: garantietermijn ?? null,
      status: status ?? "Beschikbaar",
      huidigeMedewerkerId: huidige_medewerker_id ?? null,
      locatie: locatie ?? null,
      keuringsplichtig: keuringsplichtig ?? false,
      laatsteKeuring: laatste_keuring ?? null,
      volgendeKeuring: volgende_keuring ?? null,
      opmerkingen: opmerkingen ?? null,
      aangemaaktDoorId: req.session.userId ?? null,
    })
    .returning();

  const bijgewerkt = await db
    .update(gereedschappenTable)
    .set({ volgnummer: volgNummer(aangemaakt.id), bijgewerktOp: new Date() })
    .where(eq(gereedschappenTable.id, aangemaakt.id))
    .returning();

  res.status(201).json(mapGereedschap(bijgewerkt[0]));
});

// ── GET /gereedschappen/:id ───────────────────────────────────────────────────
router.get("/gereedschappen/:id", lezen, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  const rijen = await db
    .select({ g: gereedschappenTable, medewerkerNaam: medewerkersTable.naam })
    .from(gereedschappenTable)
    .leftJoin(medewerkersTable, eq(gereedschappenTable.huidigeMedewerkerId, medewerkersTable.id))
    .where(eq(gereedschappenTable.id, id));

  if (!rijen[0]) { res.status(404).json({ error: "Niet gevonden" }); return; }
  res.json(mapGereedschap(rijen[0].g, rijen[0].medewerkerNaam));
});

// ── PATCH /gereedschappen/:id ─────────────────────────────────────────────────
router.patch("/gereedschappen/:id", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  const {
    gegraveerd_nummer, omschrijving, merk, type, serienummer,
    categorie, aandrijving, met_snoer, accu_inbegrepen, lader_inbegrepen,
    koffer_inbegrepen, aankoopdatum, aankoopprijs, leverancier,
    garantietermijn, status, huidige_medewerker_id, locatie,
    keuringsplichtig, laatste_keuring, volgende_keuring, opmerkingen, foto_url,
  } = req.body;

  const [bijgewerkt] = await db
    .update(gereedschappenTable)
    .set({
      ...(gegraveerd_nummer !== undefined && { gegraveerdNummer: gegraveerd_nummer }),
      ...(omschrijving !== undefined && { omschrijving }),
      ...(merk !== undefined && { merk }),
      ...(type !== undefined && { type }),
      ...(serienummer !== undefined && { serienummer }),
      ...(categorie !== undefined && { categorie }),
      ...(aandrijving !== undefined && { aandrijving }),
      ...(met_snoer !== undefined && { metSnoer: met_snoer }),
      ...(accu_inbegrepen !== undefined && { accuInbegrepen: accu_inbegrepen }),
      ...(lader_inbegrepen !== undefined && { laderInbegrepen: lader_inbegrepen }),
      ...(koffer_inbegrepen !== undefined && { kofferInbegrepen: koffer_inbegrepen }),
      ...(aankoopdatum !== undefined && { aankoopdatum }),
      ...(aankoopprijs !== undefined && { aankoopprijs }),
      ...(leverancier !== undefined && { leverancier }),
      ...(garantietermijn !== undefined && { garantietermijn }),
      ...(status !== undefined && { status }),
      ...(huidige_medewerker_id !== undefined && { huidigeMedewerkerId: huidige_medewerker_id }),
      ...(locatie !== undefined && { locatie }),
      ...(keuringsplichtig !== undefined && { keuringsplichtig }),
      ...(laatste_keuring !== undefined && { laatsteKeuring: laatste_keuring }),
      ...(volgende_keuring !== undefined && { volgendeKeuring: volgende_keuring }),
      ...(opmerkingen !== undefined && { opmerkingen }),
      ...(foto_url !== undefined && { fotoUrl: foto_url }),
      bijgewerktOp: new Date(),
    })
    .where(eq(gereedschappenTable.id, id))
    .returning();

  if (!bijgewerkt) { res.status(404).json({ error: "Niet gevonden" }); return; }

  const rijen = await db
    .select({ g: gereedschappenTable, medewerkerNaam: medewerkersTable.naam })
    .from(gereedschappenTable)
    .leftJoin(medewerkersTable, eq(gereedschappenTable.huidigeMedewerkerId, medewerkersTable.id))
    .where(eq(gereedschappenTable.id, id));

  res.json(mapGereedschap(rijen[0].g, rijen[0].medewerkerNaam));
});

// ── DELETE /gereedschappen/:id ────────────────────────────────────────────────
router.delete("/gereedschappen/:id", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  await db
    .update(gereedschappenTable)
    .set({ status: "Afgeschreven", bijgewerktOp: new Date() })
    .where(eq(gereedschappenTable.id, id));
  res.status(204).end();
});

// ── GET /gereedschappen/:id/bruikleen ─────────────────────────────────────────
router.get("/gereedschappen/:id/bruikleen", lezen, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  const rijen = await db
    .select({
      b: bruikleenOvereenkomstenTable,
      medewerkerNaam: medewerkersTable.naam,
      gereedschapOmschrijving: gereedschappenTable.omschrijving,
      gereedschapVolgnummer: gereedschappenTable.volgnummer,
    })
    .from(bruikleenOvereenkomstenTable)
    .leftJoin(medewerkersTable, eq(bruikleenOvereenkomstenTable.medewerkerId, medewerkersTable.id))
    .leftJoin(gereedschappenTable, eq(bruikleenOvereenkomstenTable.gereedschapId, gereedschappenTable.id))
    .where(eq(bruikleenOvereenkomstenTable.gereedschapId, id))
    .orderBy(desc(bruikleenOvereenkomstenTable.id));

  res.json(rijen.map((r) => mapBruikleen(r.b, {
    gereedschapOmschrijving: r.gereedschapOmschrijving,
    gereedschapVolgnummer: r.gereedschapVolgnummer,
    medewerkerNaam: r.medewerkerNaam,
  })));
});

// ── GET /gereedschappen/:id/meldingen ─────────────────────────────────────────
router.get("/gereedschappen/:id/meldingen", lezen, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  const rijen = await db
    .select({
      m: gereedschapMeldingenTable,
      medewerkerNaam: medewerkersTable.naam,
    })
    .from(gereedschapMeldingenTable)
    .leftJoin(medewerkersTable, eq(gereedschapMeldingenTable.gemeldDoorMedewerkerId, medewerkersTable.id))
    .where(eq(gereedschapMeldingenTable.gereedschapId, id))
    .orderBy(desc(gereedschapMeldingenTable.id));

  res.json(rijen.map((r) => mapMelding(r.m, r.medewerkerNaam)));
});

// ── POST /gereedschappen/:id/meldingen ────────────────────────────────────────
router.post("/gereedschappen/:id/meldingen", lezen, async (req, res): Promise<void> => {
  const gereedschapId = parseInt(req.params.id as string);
  const { soort_melding, omschrijving, urgentie, kan_nog_veilig_gebruikt_worden, datum_melding, opmerkingen } = req.body;

  if (!soort_melding || !omschrijving || !datum_melding) {
    res.status(400).json({ error: "soort_melding, omschrijving en datum_melding zijn verplicht" });
    return;
  }

  const [aangemaakt] = await db
    .insert(gereedschapMeldingenTable)
    .values({
      gereedschapId,
      gemeldDoorGebruikerId: req.session.userId ?? null,
      soortMelding: soort_melding,
      omschrijving,
      urgentie: urgentie ?? "normaal",
      kanNogVeiligGebruiktWorden: kan_nog_veilig_gebruikt_worden ?? null,
      datumMelding: datum_melding,
      opmerkingen: opmerkingen ?? null,
      status: "nieuw",
    })
    .returning();

  await db
    .update(gereedschappenTable)
    .set({ status: soort_melding === "vermissing" ? "Vermist" : "Defect gemeld", bijgewerktOp: new Date() })
    .where(eq(gereedschappenTable.id, gereedschapId));

  res.status(201).json(mapMelding(aangemaakt));
});

// ── POST /bruikleen ───────────────────────────────────────────────────────────
router.post("/bruikleen", schrijven, async (req, res): Promise<void> => {
  const { gereedschap_id, medewerker_id, datum_uitgifte, staat_bij_uitgifte, accessoires, bruikleen_voorwaarden, opmerkingen } = req.body;

  if (!gereedschap_id || !medewerker_id || !datum_uitgifte) {
    res.status(400).json({ error: "gereedschap_id, medewerker_id en datum_uitgifte zijn verplicht" });
    return;
  }

  const [aangemaakt] = await db
    .insert(bruikleenOvereenkomstenTable)
    .values({
      gereedschapId: gereedschap_id,
      medewerkerId: medewerker_id,
      uitgegeverDoorId: req.session.userId ?? null,
      datumUitgifte: datum_uitgifte,
      staatBijUitgifte: staat_bij_uitgifte ?? null,
      accessoires: accessoires ?? null,
      bruikleenVoorwaarden: bruikleen_voorwaarden ?? null,
      opmerkingen: opmerkingen ?? null,
    })
    .returning();

  await db
    .update(gereedschappenTable)
    .set({ status: "In bruikleen", huidigeMedewerkerId: medewerker_id, bijgewerktOp: new Date() })
    .where(eq(gereedschappenTable.id, gereedschap_id));

  const medewerker = await db
    .select({ naam: medewerkersTable.naam })
    .from(medewerkersTable)
    .where(eq(medewerkersTable.id, medewerker_id))
    .limit(1);

  const gereedschap = await db
    .select({ omschrijving: gereedschappenTable.omschrijving, volgnummer: gereedschappenTable.volgnummer })
    .from(gereedschappenTable)
    .where(eq(gereedschappenTable.id, gereedschap_id))
    .limit(1);

  res.status(201).json(mapBruikleen(aangemaakt, {
    medewerkerNaam: medewerker[0]?.naam,
    gereedschapOmschrijving: gereedschap[0]?.omschrijving,
    gereedschapVolgnummer: gereedschap[0]?.volgnummer,
  }));
});

// ── GET /bruikleen/:id ────────────────────────────────────────────────────────
router.get("/bruikleen/:id", lezen, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  const rijen = await db
    .select({
      b: bruikleenOvereenkomstenTable,
      medewerkerNaam: medewerkersTable.naam,
      gereedschapOmschrijving: gereedschappenTable.omschrijving,
      gereedschapVolgnummer: gereedschappenTable.volgnummer,
    })
    .from(bruikleenOvereenkomstenTable)
    .leftJoin(medewerkersTable, eq(bruikleenOvereenkomstenTable.medewerkerId, medewerkersTable.id))
    .leftJoin(gereedschappenTable, eq(bruikleenOvereenkomstenTable.gereedschapId, gereedschappenTable.id))
    .where(eq(bruikleenOvereenkomstenTable.id, id));

  if (!rijen[0]) { res.status(404).json({ error: "Niet gevonden" }); return; }
  res.json(mapBruikleen(rijen[0].b, {
    medewerkerNaam: rijen[0].medewerkerNaam,
    gereedschapOmschrijving: rijen[0].gereedschapOmschrijving,
    gereedschapVolgnummer: rijen[0].gereedschapVolgnummer,
  }));
});

// ── PATCH /bruikleen/:id/retourgave ───────────────────────────────────────────
router.patch("/bruikleen/:id/retourgave", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  const { datum_inname, staat_bij_inname, opmerkingen } = req.body;

  if (!datum_inname) {
    res.status(400).json({ error: "datum_inname is verplicht" });
    return;
  }

  const bestaand = await db
    .select()
    .from(bruikleenOvereenkomstenTable)
    .where(eq(bruikleenOvereenkomstenTable.id, id))
    .limit(1);

  if (!bestaand[0]) { res.status(404).json({ error: "Niet gevonden" }); return; }

  const [bijgewerkt] = await db
    .update(bruikleenOvereenkomstenTable)
    .set({
      datumInname: datum_inname,
      staatBijInname: staat_bij_inname ?? null,
      opmerkingen: opmerkingen ?? bestaand[0].opmerkingen,
      bijgewerktOp: new Date(),
    })
    .where(eq(bruikleenOvereenkomstenTable.id, id))
    .returning();

  await db
    .update(gereedschappenTable)
    .set({ status: "Beschikbaar", huidigeMedewerkerId: null, bijgewerktOp: new Date() })
    .where(eq(gereedschappenTable.id, bestaand[0].gereedschapId));

  res.json(mapBruikleen(bijgewerkt));
});

// ── PATCH /bruikleen/:id/ondertekening ────────────────────────────────────────
router.patch("/bruikleen/:id/ondertekening", lezen, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  const { rol, handtekening_url } = req.body;

  if (!rol || !handtekening_url) {
    res.status(400).json({ error: "rol en handtekening_url zijn verplicht" });
    return;
  }

  const bestaand = await db
    .select()
    .from(bruikleenOvereenkomstenTable)
    .where(eq(bruikleenOvereenkomstenTable.id, id))
    .limit(1);

  if (!bestaand[0]) { res.status(404).json({ error: "Niet gevonden" }); return; }
  if (bestaand[0].definitief) { res.status(409).json({ error: "Overeenkomst is al definitief ondertekend" }); return; }

  const update: Record<string, unknown> = { bijgewerktOp: new Date() };
  if (rol === "medewerker") update.handtekeningMedewerkerUrl = handtekening_url;
  else if (rol === "uitgever") update.handtekeningUitgeverUrl = handtekening_url;
  else { res.status(400).json({ error: "rol moet medewerker of uitgever zijn" }); return; }

  if (
    (rol === "medewerker" && bestaand[0].handtekeningUitgeverUrl) ||
    (rol === "uitgever" && bestaand[0].handtekeningMedewerkerUrl)
  ) {
    update.definitief = true;
    update.definitiefOp = new Date();
  }

  const [bijgewerkt] = await db
    .update(bruikleenOvereenkomstenTable)
    .set(update)
    .where(eq(bruikleenOvereenkomstenTable.id, id))
    .returning();

  res.json(mapBruikleen(bijgewerkt));
});

// ── POST /gereedschappen/upload-url ──────────────────────────────────────────
router.post("/gereedschappen/upload-url", schrijven, async (_req, res) => {
  try {
    const storage = new ObjectStorageService();
    const { uploadURL, objectPath } = await storage.getObjectEntityUploadURL(null, "algemeen");
    return void res.json({ upload_url: uploadURL, object_path: objectPath });
  } catch (err) {
    logger.error({ err }, "gereedschap upload-url fout");
    return void res.status(500).json({ error: "Kon upload-URL niet genereren" });
  }
});

// ── POST /gereedschappen/:id/ai-analyse ───────────────────────────────────────
// Analyseert een foto van het gereedschap met GPT-4o vision en stelt
// velden voor. Alleen een suggestie; de magazijnbeheerder bevestigt zelf.
router.post("/gereedschappen/:id/ai-analyse", schrijven, async (req, res): Promise<void> => {
  const { foto_url } = req.body as { foto_url?: string };
  if (!foto_url) {
    return void res.status(400).json({ error: "foto_url is verplicht" });
  }
  if (!heeftGateway()) {
    return void res.status(503).json({ error: "AI niet beschikbaar" });
  }

  try {
    const storage = new ObjectStorageService();
    const storageFile = await storage.getObjectEntityFile(foto_url);
    const resp = await storage.downloadObject(storageFile);
    const buffer = Buffer.from(await resp.arrayBuffer());

    const sharp = (await import("sharp")).default;
    const fotoBase64 = (
      await sharp(buffer)
        .resize({ width: 1024, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer()
    ).toString("base64");

    const gereedschapChatResultaat = await aiGateway.chat("default", {
      max_tokens: 1000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Je bent een ervaren magazijnbeheerder bij FPS Brandpreventie, een brandpreventie-installatiebedrijf.
Je analyseert een foto van een stuk gereedschap of machine en vult de registratiegegevens zo nauwkeurig mogelijk in.

Geef uitsluitend geldige JSON in dit formaat:
{
  "omschrijving": "<bondige Nederlandse naam, bijv. 'Klopboormachine'>",
  "merk": "<merknaam of null>",
  "type": "<type/modelnummer of null>",
  "categorie": "<categorie in het Nederlands, bijv. 'boormachine', 'slijptol', 'zaag', 'meting', 'hand' etc.>",
  "aandrijving": "<een van: handgereedschap | elektrisch | accu | machine | overig>",
  "met_snoer": <true of false>,
  "accu_inbegrepen": <true als accu zichtbaar is, anders false>,
  "lader_inbegrepen": <true als lader zichtbaar is, anders false>,
  "koffer_inbegrepen": <true als koffer/tas zichtbaar is, anders false>,
  "keuringsplichtig": <true voor zware machines/heftruck/elektrisch gereedschap boven 1kW, anders false>,
  "staat_indicatie": "<korte beoordeling van de zichtbare staat: nieuw, goed, lichte slijtage, zware slijtage, beschadigd — of null>"
}

Wees conservatief: als je iets niet zeker weet, gebruik null of false.`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyseer dit gereedschap en vul de registratiegegevens in." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${fotoBase64}`, detail: "high" } },
          ],
        },
      ],
    });

    const rawText = gereedschapChatResultaat.ok ? gereedschapChatResultaat.inhoud : "{}";
    let voorstel: Record<string, unknown> = {};
    try {
      voorstel = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      return void res.status(500).json({ error: "AI-antwoord kon niet worden verwerkt" });
    }

    return void res.json({
      omschrijving: typeof voorstel.omschrijving === "string" ? voorstel.omschrijving : "",
      merk: typeof voorstel.merk === "string" ? voorstel.merk : null,
      type: typeof voorstel.type === "string" ? voorstel.type : null,
      categorie: typeof voorstel.categorie === "string" ? voorstel.categorie : "overig",
      aandrijving: typeof voorstel.aandrijving === "string" ? voorstel.aandrijving : "handgereedschap",
      met_snoer: voorstel.met_snoer === true,
      accu_inbegrepen: voorstel.accu_inbegrepen === true,
      lader_inbegrepen: voorstel.lader_inbegrepen === true,
      koffer_inbegrepen: voorstel.koffer_inbegrepen === true,
      keuringsplichtig: voorstel.keuringsplichtig === true,
      staat_indicatie: typeof voorstel.staat_indicatie === "string" ? voorstel.staat_indicatie : null,
    });
  } catch (err) {
    logger.error({ err }, "gereedschap ai-analyse fout");
    return void res.status(500).json({ error: "AI-analyse mislukt" });
  }
});

// ── GET /mijn-gereedschappen ──────────────────────────────────────────────────
router.get("/mijn-gereedschappen", async (req, res): Promise<void> => {
  const userId = req.session.userId;
  if (!userId) { res.status(401).json({ error: "Niet ingelogd" }); return; }

  const medewerker = await db
    .select({ id: medewerkersTable.id })
    .from(medewerkersTable)
    .where(eq(medewerkersTable.gebruikerId, userId))
    .limit(1);

  if (!medewerker[0]) { res.status(404).json({ error: "Geen medewerker gekoppeld aan dit account" }); return; }

  const rijen = await db
    .select({ g: gereedschappenTable, medewerkerNaam: medewerkersTable.naam })
    .from(gereedschappenTable)
    .leftJoin(medewerkersTable, eq(gereedschappenTable.huidigeMedewerkerId, medewerkersTable.id))
    .where(eq(gereedschappenTable.huidigeMedewerkerId, medewerker[0].id))
    .orderBy(desc(gereedschappenTable.id));

  res.json(rijen.map((r) => mapGereedschap(r.g, r.medewerkerNaam)));
});

export default router;
