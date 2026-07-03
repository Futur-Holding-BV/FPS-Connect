import { Router } from "express";
import { db } from "@workspace/db";
import {
  voorzieningenTable,
  fotosTable,
  gebouwenTable,
  verdiepingenTable,
  gebruikersTable,
  inspectiesTable,
  onderhoudTable,
  scheidingenTable,
  clustersTable,
  spotAiVoorstellenTable,
  spotDossiersTable,
  activiteitenTable,
  type SpotAiVoorstelSnapshot,
  type SpotAiGekozen,
} from "@workspace/db";
import { eq, and, ilike, sql, inArray } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { heeftNiveau } from "@workspace/permissies";
import { effectieveContext, toegewezenGebouwIds } from "../utils/rol";
import { getLabelsVoorVoorziening, syncVoorzieningLabels } from "../lib/classificatie";
import { logActiviteit } from "../lib/activiteit";
import { analyseerSpot } from "../services/spot-ai";

const router = Router();
const lezenVoorzieningen = requireBevoegdheid("voorzieningen", 1);

// Geeft de gebouwId van een verdieping terug, of null als die niet bestaat.
async function gebouwIdVanVerdieping(verdiepingId: number): Promise<number | null> {
  const [v] = await db
    .select({ gebouwId: verdiepingenTable.gebouwId })
    .from(verdiepingenTable)
    .where(eq(verdiepingenTable.id, verdiepingId));
  return v?.gebouwId ?? null;
}

// Geeft de gebouwId van een voorziening terug, of null als die niet bestaat.
async function gebouwIdVanVoorziening(voorzieningId: number): Promise<number | null> {
  const [v] = await db
    .select({ gebouwId: voorzieningenTable.gebouwId })
    .from(voorzieningenTable)
    .where(eq(voorzieningenTable.id, voorzieningId));
  return v?.gebouwId ?? null;
}

// Geeft de gebouwId van een scheiding terug (via verdieping), of null.
async function gebouwIdVanScheiding(scheidingId: number): Promise<number | null> {
  const [s] = await db
    .select({ verdiepingId: scheidingenTable.verdiepingId })
    .from(scheidingenTable)
    .where(eq(scheidingenTable.id, scheidingId));
  if (!s?.verdiepingId) return null;
  return gebouwIdVanVerdieping(s.verdiepingId);
}

// Afkorting uit de gebouwnaam: eerste letter van elk woord (max 3), anders eerste 3 letters.
function gebouwAfkorting(naam: string): string {
  const woorden = (naam ?? "").trim().split(/\s+/).filter(Boolean);
  let afk = "";
  if (woorden.length >= 2) {
    afk = woorden.map((w) => w[0]).join("");
  } else if (woorden.length === 1) {
    afk = woorden[0];
  }
  afk = afk.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 3);
  return afk || "GEB";
}

// Volgend uniek spotnummer voor een gebouw: <afkorting>-<volgnummer>.
async function volgendSpotnummer(gebouwId: number): Promise<string> {
  const gebouw = await db
    .select({ naam: gebouwenTable.naam })
    .from(gebouwenTable)
    .where(eq(gebouwenTable.id, gebouwId))
    .then((r) => r[0]);
  const afk = gebouwAfkorting(gebouw?.naam ?? "");
  const prefix = `${afk}-`;

  const bestaande = await db
    .select({ objectnummer: voorzieningenTable.objectnummer })
    .from(voorzieningenTable)
    .where(eq(voorzieningenTable.gebouwId, gebouwId));

  let hoogste = 0;
  for (const r of bestaande) {
    if (!r.objectnummer?.startsWith(prefix)) continue;
    const m = r.objectnummer.match(/(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > hoogste) hoogste = n;
    }
  }

  let n = hoogste + 1;
  // Garandeer globale uniciteit (objectnummer is uniek over alle gebouwen).
  while (true) {
    const kandidaat = `${prefix}${n}`;
    const bestaat = await db
      .select({ id: voorzieningenTable.id })
      .from(voorzieningenTable)
      .where(eq(voorzieningenTable.objectnummer, kandidaat))
      .then((r) => r[0]);
    if (!bestaat) return kandidaat;
    n++;
  }
}

async function mapVoorziening(v: typeof voorzieningenTable.$inferSelect) {
  const gebouw = v.gebouwId
    ? await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, v.gebouwId)).then((r) => r[0])
    : null;
  const verdieping = v.verdiepingId
    ? await db.select({ naam: verdiepingenTable.naam }).from(verdiepingenTable).where(eq(verdiepingenTable.id, v.verdiepingId)).then((r) => r[0])
    : null;
  const monteur = v.monteurId
    ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, v.monteurId)).then((r) => r[0])
    : null;
  const controleur = v.controleurId
    ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, v.controleurId)).then((r) => r[0])
    : null;
  const maker = v.makerMonteurId
    ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, v.makerMonteurId)).then((r) => r[0])
    : null;
  const cluster = v.clusterId
    ? await db.select({ naam: clustersTable.naam }).from(clustersTable).where(eq(clustersTable.id, v.clusterId)).then((r) => r[0])
    : null;

  return {
    id: v.id,
    objectnummer: v.objectnummer,
    qr_code: v.qrCode,
    type: v.type,
    status: v.status,
    classificatie: v.classificatie,
    gebouw_id: v.gebouwId,
    gebouw_naam: gebouw?.naam ?? null,
    verdieping_id: v.verdiepingId,
    verdieping_naam: verdieping?.naam ?? null,
    ruimte: v.ruimte,
    huisnummer: v.huisnummer,
    locatie_omschrijving: v.locatieOmschrijving,
    locatie_x: v.locatieX,
    locatie_y: v.locatieY,
    materialen: v.materialen,
    opmerkingen: v.opmerkingen,
    monteur_id: v.monteurId,
    monteur_naam: monteur?.naam ?? null,
    controleur_id: v.controleurId,
    controleur_naam: controleur?.naam ?? null,
    installatie_datum: v.installatieDatum,
    volgende_inspectie: v.volgendeInspectie,
    wbdbo: v.wbdbo,
    wrd: v.wrd,
    wand_of_plafond: v.wandOfPlafond,
    cluster_id: v.clusterId,
    cluster_naam: cluster?.naam ?? null,
    maker_monteur_id: v.makerMonteurId,
    maker_monteur_naam: maker?.naam ?? null,
    gearchiveerd: v.gearchiveerd,
    gearchiveerd_op: v.gearchiveerdOp ? v.gearchiveerdOp.toISOString() : null,
    aangemaakt_op: v.aangemaaktOp.toISOString(),
    bijgewerkt_op: v.bijgewerktOp.toISOString(),
    parent_spot_id: v.parentSpotId ?? null,
    heeft_onderdelen: (await db.select({ id: voorzieningenTable.id }).from(voorzieningenTable).where(eq(voorzieningenTable.parentSpotId, v.id))).length > 0,
  };
}

// GET /voorzieningen
router.get("/voorzieningen", lezenVoorzieningen, async (req, res) => {
  try {
    const { gebouw_id, verdieping_id, type, status, gearchiveerd, classificatie, zoek, aangemaakt_van, aangemaakt_tot, pagina, per_pagina } = req.query;
    let all = await db.select().from(voorzieningenTable);

    // Beperkte gebruikers zien alleen voorzieningen in hun toegewezen gebouwen.
    // effectieveContext zodat impersonatie (bekijken als) correct doorwerkt.
    const { userId: effectiefUserId, beperkt } = await effectieveContext(req);
    if (beperkt) {
      const ids = await toegewezenGebouwIds(effectiefUserId);
      all = all.filter((v) => ids.includes(v.gebouwId));
    }

    // Standaard alleen actieve voorzieningen; gearchiveerde alleen op verzoek.
    if (gearchiveerd === "true") all = all.filter((v) => v.gearchiveerd);
    else all = all.filter((v) => !v.gearchiveerd);

    if (gebouw_id) all = all.filter((v) => v.gebouwId === parseInt(gebouw_id as string));
    if (verdieping_id) all = all.filter((v) => v.verdiepingId === parseInt(verdieping_id as string));
    if (type) all = all.filter((v) => v.type === type);
    if (status) all = all.filter((v) => v.status === status);
    if (classificatie) all = all.filter((v) => v.classificatie === classificatie);
    if (aangemaakt_van) {
      const van = new Date(`${aangemaakt_van as string}T00:00:00`);
      all = all.filter((v) => new Date(v.aangemaaktOp) >= van);
    }
    if (aangemaakt_tot) {
      const tot = new Date(`${aangemaakt_tot as string}T23:59:59.999`);
      all = all.filter((v) => new Date(v.aangemaaktOp) <= tot);
    }
    if (zoek) {
      const z = (zoek as string).toLowerCase();
      all = all.filter(
        (v) =>
          v.objectnummer.toLowerCase().includes(z) ||
          (v.ruimte ?? "").toLowerCase().includes(z) ||
          (v.materialen ?? "").toLowerCase().includes(z)
      );
    }

    const totaal = all.length;
    const p = parseInt((pagina as string) ?? "1");
    const pp = parseInt((per_pagina as string) ?? "50");
    const paged = all.slice((p - 1) * pp, p * pp);

    const items = await Promise.all(paged.map(mapVoorziening));

    res.json({ items, totaal, pagina: p, per_pagina: pp });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /gebouwen/:id/volgend-spotnummer
router.get("/gebouwen/:id/volgend-spotnummer", lezenVoorzieningen, async (req, res) => {
  try {
    const gebouwId = Number(req.params.id);
    const gebouw = await db
      .select({ id: gebouwenTable.id })
      .from(gebouwenTable)
      .where(eq(gebouwenTable.id, gebouwId))
      .then((r) => r[0]);
    if (!gebouw) {
      return res.status(404).json({ error: "Gebouw niet gevonden" });
    }
    if (!(req.permissies!.magBijGebouw(gebouwId))) {
      return res.status(403).json({ error: "Geen toegang tot dit gebouw" });
    }
    const spotnummer = await volgendSpotnummer(gebouwId);
    return res.json({ spotnummer });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /voorzieningen
router.post("/voorzieningen", requireBevoegdheid("voorzieningen", 3), async (req, res) => {
  try {
    const {
      objectnummer, qr_code, type, status, classificatie, gebouw_id,
      verdieping_id, ruimte, huisnummer, locatie_omschrijving, locatie_x, locatie_y,
      materialen, opmerkingen, monteur_id, controleur_id,
      installatie_datum, volgende_inspectie,
      wbdbo, wrd, wand_of_plafond, cluster_id, label_ids, parent_spot_id,
    } = req.body;

    // De aanmaker (maker) wordt altijd afgeleid uit de ingelogde sessie,
    // nooit vanuit de request body — voorkomt vervalsen van de creator-attributie.
    const maker_monteur_id = req.session.userId;

    if (!type || !gebouw_id) {
      return res.status(400).json({ error: "type en gebouw_id zijn verplicht" });
    }

    if (!(req.permissies!.magBijGebouw(Number(gebouw_id)))) {
      return res.status(403).json({ error: "Geen toegang tot dit gebouw" });
    }

    // Integriteit: een meegestuurde verdieping moet bij hetzelfde gebouw horen,
    // anders kan een voorziening cross-gebouw aan een vreemde verdieping hangen.
    if (verdieping_id != null) {
      const verdiepingGebouwId = await gebouwIdVanVerdieping(Number(verdieping_id));
      if (verdiepingGebouwId !== Number(gebouw_id)) {
        return res.status(400).json({ error: "verdieping_id hoort niet bij dit gebouw" });
      }
    }

    // Een door de client meegestuurd nummer kan verouderd zijn (gebruiker had
    // een ouder voorgesteld spotnummer in beeld). Bij een uniciteitsbotsing
    // genereren we daarom een vers spotnummer en proberen we opnieuw.
    let nummer =
      objectnummer && String(objectnummer).trim()
        ? String(objectnummer).trim()
        : await volgendSpotnummer(Number(gebouw_id));

    let v: typeof voorzieningenTable.$inferSelect | undefined;
    for (let poging = 0; poging < 5; poging++) {
      try {
        [v] = await db
          .insert(voorzieningenTable)
          .values({
            objectnummer: nummer, qrCode: qr_code, type, status: status ?? "concept",
            classificatie: classificatie ?? "60", gebouwId: gebouw_id,
            verdiepingId: verdieping_id, ruimte, huisnummer, locatieOmschrijving: locatie_omschrijving,
            locatieX: locatie_x, locatieY: locatie_y, materialen, opmerkingen,
            monteurId: monteur_id, controleurId: controleur_id,
            installatieDatum: installatie_datum, volgendeInspectie: volgende_inspectie,
            wbdbo, wrd, wandOfPlafond: wand_of_plafond,
            clusterId: cluster_id != null ? Number(cluster_id) : null,
            makerMonteurId: maker_monteur_id,
            parentSpotId: parent_spot_id != null ? Number(parent_spot_id) : null,
          })
          .returning();
        break;
      } catch (insertErr) {
        const code = (insertErr as { code?: string })?.code;
        if (code === "23505" && poging < 4) {
          // Uniciteitsbotsing op objectnummer: genereer een vers spotnummer.
          nummer = await volgendSpotnummer(Number(gebouw_id));
          continue;
        }
        throw insertErr;
      }
    }

    if (!v) {
      return res.status(409).json({ error: "Kon geen uniek spotnummer toekennen" });
    }

    if (Array.isArray(label_ids)) {
      await syncVoorzieningLabels(v.id, label_ids.map((n: unknown) => Number(n)));
    }

    await logActiviteit({
      type: "voorziening_aangemaakt",
      omschrijving: `Voorziening ${nummer} aangemaakt`,
      gebouwId: gebouw_id,
      voorzieningId: v.id,
      voorzieningNummer: nummer,
      gebruikerId: req.session.userId,
    });

    res.status(201).json(await mapVoorziening(v));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /voorzieningen/ai-spotvoorstel — AI-voorstel o.b.v. foto vóór/ná, vóórdat
// de spot bestaat. Geeft een voorstel terug (wand/plafond, applicatie,
// toepassing-suggesties, gekoppeld document); de monteur bevestigt of past aan.
router.post("/voorzieningen/ai-spotvoorstel", requireBevoegdheid("voorzieningen", 2), async (req, res) => {
  try {
    const { gebouw_id, foto_voor_url, foto_na_url } = req.body ?? {};
    if (!gebouw_id || !foto_na_url) {
      return res.status(400).json({ error: "gebouw_id en foto_na_url zijn verplicht" });
    }
    if (!(req.permissies!.magBijGebouw(Number(gebouw_id)))) {
      return res.status(403).json({ error: "Geen toegang tot dit gebouw" });
    }
    const voorstel = await analyseerSpot({
      gebouwId: Number(gebouw_id),
      fotoVoorObjectPath: foto_voor_url ? String(foto_voor_url) : null,
      fotoNaObjectPath: String(foto_na_url),
      logCtx: { gebruikerId: req.session.userId ?? null },
    });
    return res.json(voorstel);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /voorzieningen/:id
router.get("/voorzieningen/:id", lezenVoorzieningen, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [v] = await db.select().from(voorzieningenTable).where(eq(voorzieningenTable.id, id));
    if (!v) return res.status(404).json({ error: "Voorziening niet gevonden" });
    if (!(req.permissies!.magBijGebouw(v.gebouwId))) {
      return res.status(403).json({ error: "Geen toegang tot deze voorziening" });
    }

    const fotos = await db.select().from(fotosTable).where(eq(fotosTable.voorzieningId, id));
    const inspecties = await db.select().from(inspectiesTable).where(eq(inspectiesTable.voorzieningId, id));
    const onderhoud = await db.select().from(onderhoudTable).where(eq(onderhoudTable.voorzieningId, id));

    const base = await mapVoorziening(v);
    const labels = await getLabelsVoorVoorziening(id);

    res.json({
      ...base,
      labels,
      fotos: fotos.map((f) => ({
        id: f.id,
        voorziening_id: f.voorzieningId,
        fase: f.fase,
        url: f.url,
        beschrijving: f.beschrijving,
        aangemaakt_op: f.aangemaaktOp.toISOString(),
      })),
      inspecties: inspecties.map((i) => ({
        id: i.id,
        voorziening_id: i.voorzieningId,
        gebouw_id: i.gebouwId,
        type: i.type,
        status: i.status,
        geplande_datum: i.geplandeDatum,
        uitgevoerd_datum: i.uitgevoerdDatum,
        bevindingen: i.bevindingen,
        aanbevelingen: i.aanbevelingen,
        aangemaakt_op: i.aangemaaktOp.toISOString(),
      })),
      onderhoud: onderhoud.map((o) => ({
        id: o.id,
        titel: o.titel,
        prioriteit: o.prioriteit,
        status: o.status,
        deadline: o.deadline,
        aangemaakt_op: o.aangemaaktOp.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /voorzieningen/:id
router.patch("/voorzieningen/:id", requireBevoegdheid("voorzieningen", 2), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (!(req.permissies!.magBijGebouw(await gebouwIdVanVoorziening(id)))) {
      return res.status(403).json({ error: "Geen toegang tot deze voorziening" });
    }
    const {
      objectnummer, qr_code, type, status, classificatie,
      verdieping_id, ruimte, huisnummer, locatie_omschrijving, locatie_x, locatie_y,
      materialen, opmerkingen, monteur_id, controleur_id,
      installatie_datum, volgende_inspectie,
      wbdbo, wrd, wand_of_plafond, cluster_id, maker_monteur_id, label_ids, parent_spot_id,
    } = req.body;

    // Integriteit: een meegestuurde verdieping moet bij het gebouw van deze
    // voorziening horen (geen cross-gebouw koppeling via verdieping_id).
    if (verdieping_id != null) {
      const huidigGebouwId = await gebouwIdVanVoorziening(id);
      const verdiepingGebouwId = await gebouwIdVanVerdieping(Number(verdieping_id));
      if (verdiepingGebouwId !== huidigGebouwId) {
        return res.status(400).json({ error: "verdieping_id hoort niet bij dit gebouw" });
      }
    }

    const [v] = await db
      .update(voorzieningenTable)
      .set({
        objectnummer, qrCode: qr_code, type, status, classificatie,
        verdiepingId: verdieping_id, ruimte, huisnummer, locatieOmschrijving: locatie_omschrijving,
        locatieX: locatie_x, locatieY: locatie_y, materialen, opmerkingen,
        monteurId: monteur_id, controleurId: controleur_id,
        installatieDatum: installatie_datum, volgendeInspectie: volgende_inspectie,
        wbdbo, wrd, wandOfPlafond: wand_of_plafond,
        // undefined = niet wijzigen; null = ontkoppelen; getal = koppelen aan cluster.
        clusterId: cluster_id === undefined ? undefined : cluster_id === null ? null : Number(cluster_id),
        makerMonteurId: maker_monteur_id,
        parentSpotId: parent_spot_id === undefined ? undefined : parent_spot_id === null ? null : Number(parent_spot_id),
        bijgewerktOp: new Date(),
      })
      .where(eq(voorzieningenTable.id, id))
      .returning();

    if (!v) return res.status(404).json({ error: "Voorziening niet gevonden" });

    if (Array.isArray(label_ids)) {
      await syncVoorzieningLabels(v.id, label_ids.map((n: unknown) => Number(n)));
    }

    res.json(await mapVoorziening(v));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// DELETE /voorzieningen/:id
router.delete("/voorzieningen/:id", requireBevoegdheid("voorzieningen", 4), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    await db.delete(voorzieningenTable).where(eq(voorzieningenTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /voorzieningen/:id/fotos
router.get("/voorzieningen/:id/fotos", lezenVoorzieningen, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (!(req.permissies!.magBijGebouw(await gebouwIdVanVoorziening(id)))) {
      res.status(403).json({ error: "Geen toegang tot deze voorziening" });
      return;
    }
    const fotos = await db.select().from(fotosTable).where(eq(fotosTable.voorzieningId, id));
    res.json(
      fotos.map((f) => ({
        id: f.id,
        voorziening_id: f.voorzieningId,
        fase: f.fase,
        url: f.url,
        beschrijving: f.beschrijving,
        aangemaakt_op: f.aangemaaktOp.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /voorzieningen/:id/fotos
router.post("/voorzieningen/:id/fotos", requireBevoegdheid("voorzieningen", 3), async (req, res) => {
  try {
    const voorzieningId = parseInt(String(req.params.id));
    if (!(req.permissies!.magBijGebouw(await gebouwIdVanVoorziening(voorzieningId)))) {
      res.status(403).json({ error: "Geen toegang tot deze voorziening" });
      return;
    }
    const { fase, url, beschrijving } = req.body;
    const [f] = await db
      .insert(fotosTable)
      .values({ voorzieningId, fase, url, beschrijving })
      .returning();
    res.status(201).json({
      id: f.id,
      voorziening_id: f.voorzieningId,
      fase: f.fase,
      url: f.url,
      beschrijving: f.beschrijving,
      aangemaakt_op: f.aangemaaktOp.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// DELETE /voorzieningen/:id/fotos/:fotoId
router.delete("/voorzieningen/:id/fotos/:fotoId", requireBevoegdheid("voorzieningen", 3), async (req, res) => {
  try {
    const fotoId = parseInt(String(req.params.fotoId));
    const voorzieningId = parseInt(String(req.params.id));
    if (!(req.permissies!.magBijGebouw(await gebouwIdVanVoorziening(voorzieningId)))) {
      res.status(403).json({ error: "Geen toegang tot deze voorziening" });
      return;
    }
    // Koppel het foto-ID expliciet aan de voorziening: een gegokt fotoId uit
    // een andere (niet-toegankelijke) voorziening mag niet verwijderd worden.
    const verwijderd = await db
      .delete(fotosTable)
      .where(and(eq(fotosTable.id, fotoId), eq(fotosTable.voorzieningId, voorzieningId)))
      .returning();
    if (verwijderd.length === 0) {
      res.status(404).json({ error: "Foto niet gevonden" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /voorzieningen/:id/status
router.patch("/voorzieningen/:id/status", requireBevoegdheid("voorzieningen", 2), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (!(req.permissies!.magBijGebouw(await gebouwIdVanVoorziening(id)))) {
      return res.status(403).json({ error: "Geen toegang tot deze voorziening" });
    }
    const { status, opmerkingen } = req.body;
    const [v] = await db
      .update(voorzieningenTable)
      .set({ status, opmerkingen, bijgewerktOp: new Date() })
      .where(eq(voorzieningenTable.id, id))
      .returning();
    if (!v) return res.status(404).json({ error: "Voorziening niet gevonden" });

    await logActiviteit({
      type: "status_gewijzigd",
      omschrijving: `Status van ${v.objectnummer} gewijzigd naar ${status}`,
      gebouwId: v.gebouwId,
      voorzieningId: v.id,
      voorzieningNummer: v.objectnummer,
      gebruikerId: req.session.userId,
    });

    res.json(await mapVoorziening(v));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /voorzieningen/:id/archief
router.patch("/voorzieningen/:id/archief", requireBevoegdheid("voorzieningen", 3), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (!(req.permissies!.magBijGebouw(await gebouwIdVanVoorziening(id)))) {
      return res.status(403).json({ error: "Geen toegang tot deze voorziening" });
    }
    const gearchiveerd = req.body?.gearchiveerd === true;

    // Terug plaatsen (de-archiveren) vereist volledig beheer (niveau 4).
    if (!gearchiveerd) {
      const userId = req.session.userId;
      const [g] = await db
        .select({ rol: gebruikersTable.rol, bevoegdheden: gebruikersTable.bevoegdheden })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, userId!));
      if (!g) {
        return res.status(403).json({ error: "Geen toegang" });
      }
      if (g.rol !== "hoofdbeheerder") {
        const bev = (g.bevoegdheden as Record<string, number> | null) ?? {};
        if (!heeftNiveau(bev, "voorzieningen", 4)) {
          return res.status(403).json({ error: "Geen toegang" });
        }
      }
    }

    const [v] = await db
      .update(voorzieningenTable)
      .set({
        gearchiveerd,
        gearchiveerdOp: gearchiveerd ? new Date() : null,
        bijgewerktOp: new Date(),
      })
      .where(eq(voorzieningenTable.id, id))
      .returning();
    if (!v) return res.status(404).json({ error: "Voorziening niet gevonden" });

    await logActiviteit({
      type: gearchiveerd ? "voorziening_gearchiveerd" : "voorziening_teruggeplaatst",
      omschrijving: gearchiveerd
        ? `Voorziening ${v.objectnummer} gearchiveerd`
        : `Voorziening ${v.objectnummer} terug geplaatst`,
      gebouwId: v.gebouwId,
      voorzieningId: v.id,
      voorzieningNummer: v.objectnummer,
      gebruikerId: req.session.userId,
    });

    res.json(await mapVoorziening(v));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /verdiepingen/:id/voorzieningen
router.get("/verdiepingen/:id/voorzieningen", lezenVoorzieningen, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));

    // Beperkte gebruikers mogen alleen verdiepingen van toegewezen gebouwen zien.
    // effectieveContext zodat impersonatie (bekijken als) correct doorwerkt.
    const { userId: effectiefUserId, beperkt } = await effectieveContext(req);
    if (beperkt) {
      const gebouwId = await gebouwIdVanVerdieping(id);
      const ids = await toegewezenGebouwIds(effectiefUserId);
      if (gebouwId == null || !ids.includes(gebouwId)) {
        res.status(403).json({ error: "Geen toegang tot deze verdieping" });
        return;
      }
    }

    const voorzieningen = (
      await db
        .select()
        .from(voorzieningenTable)
        .where(eq(voorzieningenTable.verdiepingId, id))
    ).filter((v) => !v.gearchiveerd);

    const clusterIds = Array.from(
      new Set(voorzieningen.map((v) => v.clusterId).filter((x): x is number => x != null)),
    );
    const clusterNamen = new Map<number, string>();
    if (clusterIds.length > 0) {
      const cs = await db
        .select({ id: clustersTable.id, naam: clustersTable.naam })
        .from(clustersTable)
        .where(inArray(clustersTable.id, clusterIds));
      for (const c of cs) clusterNamen.set(c.id, c.naam);
    }

    res.json(
      voorzieningen.map((v) => ({
        id: v.id,
        objectnummer: v.objectnummer,
        type: v.type,
        status: v.status,
        classificatie: v.classificatie,
        ruimte: v.ruimte,
        locatie_x: v.locatieX,
        locatie_y: v.locatieY,
        locatie_omschrijving: v.locatieOmschrijving,
        wbdbo: v.wbdbo,
        wrd: v.wrd,
        wand_of_plafond: v.wandOfPlafond,
        cluster_id: v.clusterId,
        cluster_naam: v.clusterId != null ? clusterNamen.get(v.clusterId) ?? null : null,
        gearchiveerd: v.gearchiveerd,
      }))
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── SCHEIDINGEN (brand-/rookscheidingen op de plattegrond) ─────────────────

const SCHEIDING_TYPES = ["brand", "rook"];

function scheidingRij(s: typeof scheidingenTable.$inferSelect) {
  return {
    id: s.id,
    verdieping_id: s.verdiepingId,
    type: s.type,
    waarde: s.waarde,
    kleur: s.kleur,
    punten: s.punten,
    aangemaakt_op: s.aangemaaktOp.toISOString(),
  };
}

// GET /verdiepingen/:id/scheidingen
router.get("/verdiepingen/:id/scheidingen", lezenVoorzieningen, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));

    // Beperkte gebruikers mogen alleen verdiepingen van toegewezen gebouwen zien.
    // effectieveContext zodat impersonatie (bekijken als) correct doorwerkt.
    const { userId: effectiefUserId, beperkt } = await effectieveContext(req);
    if (beperkt) {
      const gebouwId = await gebouwIdVanVerdieping(id);
      const ids = await toegewezenGebouwIds(effectiefUserId);
      if (gebouwId == null || !ids.includes(gebouwId)) {
        res.status(403).json({ error: "Geen toegang tot deze verdieping" });
        return;
      }
    }

    const rows = await db
      .select()
      .from(scheidingenTable)
      .where(eq(scheidingenTable.verdiepingId, id));
    res.json(rows.map(scheidingRij));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /verdiepingen/:id/scheidingen
router.post("/verdiepingen/:id/scheidingen", requireBevoegdheid("voorzieningen", 3), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (!(req.permissies!.magBijGebouw(await gebouwIdVanVerdieping(id)))) {
      return res.status(403).json({ error: "Geen toegang tot deze verdieping" });
    }
    const { type, waarde, kleur, punten } = req.body ?? {};
    if (!type || !SCHEIDING_TYPES.includes(type)) {
      return res.status(400).json({ error: "Ongeldig scheidingstype" });
    }
    if (!punten || typeof punten !== "string") {
      return res.status(400).json({ error: "punten is verplicht" });
    }
    const [scheiding] = await db
      .insert(scheidingenTable)
      .values({ verdiepingId: id, type, waarde: waarde ?? null, kleur: kleur ?? null, punten })
      .returning();
    return res.status(201).json(scheidingRij(scheiding!));
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /verdiepingen/scheidingen/:scheidingId
router.patch("/verdiepingen/scheidingen/:scheidingId", requireBevoegdheid("voorzieningen", 2), async (req, res) => {
  try {
    const scheidingId = parseInt(String(req.params.scheidingId));
    if (!(req.permissies!.magBijGebouw(await gebouwIdVanScheiding(scheidingId)))) {
      return res.status(403).json({ error: "Geen toegang tot deze scheiding" });
    }
    const { type, waarde, kleur, punten } = req.body ?? {};
    if (type !== undefined && !SCHEIDING_TYPES.includes(type)) {
      return res.status(400).json({ error: "Ongeldig scheidingstype" });
    }
    const updates: Record<string, unknown> = { bijgewerktOp: new Date() };
    if (type !== undefined) updates.type = type;
    if (waarde !== undefined) updates.waarde = waarde;
    if (kleur !== undefined) updates.kleur = kleur;
    if (punten !== undefined) updates.punten = punten;

    const [scheiding] = await db
      .update(scheidingenTable)
      .set(updates)
      .where(eq(scheidingenTable.id, scheidingId))
      .returning();
    if (!scheiding) return res.status(404).json({ error: "Scheiding niet gevonden" });
    return res.json(scheidingRij(scheiding));
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// DELETE /verdiepingen/scheidingen/:scheidingId
router.delete("/verdiepingen/scheidingen/:scheidingId", requireBevoegdheid("voorzieningen", 3), async (req, res) => {
  try {
    const scheidingId = parseInt(String(req.params.scheidingId));
    if (!(req.permissies!.magBijGebouw(await gebouwIdVanScheiding(scheidingId)))) {
      res.status(403).json({ error: "Geen toegang tot deze scheiding" });
      return;
    }
    await db.delete(scheidingenTable).where(eq(scheidingenTable.id, scheidingId));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── CLUSTERS (logische groepering van spots, bv. schacht of strook) ─────────

// Geeft de gebouwId van een cluster terug, of null als die niet bestaat.
async function gebouwIdVanCluster(clusterId: number): Promise<number | null> {
  const [c] = await db
    .select({ gebouwId: clustersTable.gebouwId })
    .from(clustersTable)
    .where(eq(clustersTable.id, clusterId));
  return c?.gebouwId ?? null;
}

async function clusterRij(c: typeof clustersTable.$inferSelect) {
  // Spots van dit cluster ophalen (alleen niet-gearchiveerde) om naast het totaal
  // ook het aantal "voorbereid" en de (eventueel uniforme) toegewezen monteur te
  // bepalen. De cluster-monteur wordt afgeleid: als alle spots dezelfde monteur
  // hebben tonen we die, anders "niet toegewezen".
  const spots = await db
    .select({ status: voorzieningenTable.status, monteurId: voorzieningenTable.monteurId })
    .from(voorzieningenTable)
    .where(and(eq(voorzieningenTable.clusterId, c.id), eq(voorzieningenTable.gearchiveerd, false)));
  const voorbereidAantal = spots.filter((s) => s.status === "voorbereid").length;
  const monteurIds = Array.from(new Set(spots.map((s) => s.monteurId ?? null)));
  const monteurId = spots.length > 0 && monteurIds.length === 1 ? monteurIds[0] : null;
  let monteurNaam: string | null = null;
  if (monteurId != null) {
    const [m] = await db
      .select({ naam: gebruikersTable.naam })
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, monteurId));
    monteurNaam = m?.naam ?? null;
  }
  return {
    id: c.id,
    gebouw_id: c.gebouwId,
    verdieping_id: c.verdiepingId,
    naam: c.naam,
    type: c.type,
    kleur: c.kleur,
    voorziening_aantal: spots.length,
    voorbereid_aantal: voorbereidAantal,
    monteur_id: monteurId,
    monteur_naam: monteurNaam,
    aangemaakt_op: c.aangemaaktOp.toISOString(),
    bijgewerkt_op: c.bijgewerktOp.toISOString(),
  };
}

// GET /gebouwen/:id/clusters
router.get("/gebouwen/:id/clusters", lezenVoorzieningen, async (req, res) => {
  try {
    const gebouwId = parseInt(String(req.params.id));
    // Beperkte gebruikers mogen alleen clusters van toegewezen gebouwen zien;
    // effectieveContext zodat impersonatie (bekijken als) correct doorwerkt.
    const { userId: effectiefUserId, beperkt } = await effectieveContext(req);
    if (beperkt) {
      const ids = await toegewezenGebouwIds(effectiefUserId);
      if (!ids.includes(gebouwId)) {
        return res.status(403).json({ error: "Geen toegang tot dit gebouw" });
      }
    }
    const rows = await db
      .select()
      .from(clustersTable)
      .where(eq(clustersTable.gebouwId, gebouwId));
    return res.json(await Promise.all(rows.map(clusterRij)));
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /gebouwen/:id/clusters
router.post("/gebouwen/:id/clusters", requireBevoegdheid("voorzieningen", 2), async (req, res) => {
  try {
    const gebouwId = parseInt(String(req.params.id));
    if (!(req.permissies!.magBijGebouw(gebouwId))) {
      return res.status(403).json({ error: "Geen toegang tot dit gebouw" });
    }
    const { naam, verdieping_id, type, kleur } = req.body ?? {};
    if (!naam || !String(naam).trim()) {
      return res.status(400).json({ error: "naam is verplicht" });
    }
    // Integriteit: een meegestuurde verdieping moet bij dit gebouw horen.
    if (verdieping_id != null) {
      const verdiepingGebouwId = await gebouwIdVanVerdieping(Number(verdieping_id));
      if (verdiepingGebouwId !== gebouwId) {
        return res.status(400).json({ error: "verdieping_id hoort niet bij dit gebouw" });
      }
    }
    const [cluster] = await db
      .insert(clustersTable)
      .values({
        gebouwId,
        verdiepingId: verdieping_id != null ? Number(verdieping_id) : null,
        naam: String(naam).trim(),
        type: type ?? null,
        kleur: kleur ?? null,
      })
      .returning();
    return res.status(201).json(await clusterRij(cluster!));
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /clusters/:clusterId
router.patch("/clusters/:clusterId", requireBevoegdheid("voorzieningen", 2), async (req, res) => {
  try {
    const clusterId = parseInt(String(req.params.clusterId));
    const gebouwId = await gebouwIdVanCluster(clusterId);
    if (gebouwId == null) return res.status(404).json({ error: "Cluster niet gevonden" });
    if (!(req.permissies!.magBijGebouw(gebouwId))) {
      return res.status(403).json({ error: "Geen toegang tot dit cluster" });
    }
    const { naam, verdieping_id, type, kleur } = req.body ?? {};
    if (verdieping_id != null) {
      const verdiepingGebouwId = await gebouwIdVanVerdieping(Number(verdieping_id));
      if (verdiepingGebouwId !== gebouwId) {
        return res.status(400).json({ error: "verdieping_id hoort niet bij dit gebouw" });
      }
    }
    const updates: Record<string, unknown> = { bijgewerktOp: new Date() };
    if (naam !== undefined) updates.naam = String(naam).trim();
    if (verdieping_id !== undefined) updates.verdiepingId = verdieping_id === null ? null : Number(verdieping_id);
    if (type !== undefined) updates.type = type;
    if (kleur !== undefined) updates.kleur = kleur;

    const [cluster] = await db
      .update(clustersTable)
      .set(updates)
      .where(eq(clustersTable.id, clusterId))
      .returning();
    if (!cluster) return res.status(404).json({ error: "Cluster niet gevonden" });
    return res.json(await clusterRij(cluster));
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// DELETE /clusters/:clusterId — koppelingen (voorzieningen.cluster_id) worden via
// de FK ON DELETE SET NULL automatisch losgemaakt; spots blijven bestaan.
router.delete("/clusters/:clusterId", requireBevoegdheid("voorzieningen", 2), async (req, res) => {
  try {
    const clusterId = parseInt(String(req.params.clusterId));
    const gebouwId = await gebouwIdVanCluster(clusterId);
    if (gebouwId == null) return res.status(404).json({ error: "Cluster niet gevonden" });
    if (!(req.permissies!.magBijGebouw(gebouwId))) {
      return res.status(403).json({ error: "Geen toegang tot dit cluster" });
    }
    await db.delete(clustersTable).where(eq(clustersTable.id, clusterId));
    return res.status(204).send();
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /clusters/:clusterId/monteur — wijst in één handeling dezelfde monteur
// (of geen, bij null) toe aan alle spots van dit cluster. Bedoeld voor het
// groepsgewijs toewijzen van voorbereide spots aan een uitvoerend monteur.
router.post("/clusters/:clusterId/monteur", requireBevoegdheid("voorzieningen", 2), async (req, res) => {
  try {
    const clusterId = parseInt(String(req.params.clusterId));
    const gebouwId = await gebouwIdVanCluster(clusterId);
    if (gebouwId == null) return res.status(404).json({ error: "Cluster niet gevonden" });
    if (!(req.permissies!.magBijGebouw(gebouwId))) {
      return res.status(403).json({ error: "Geen toegang tot dit cluster" });
    }
    const { monteur_id } = req.body ?? {};
    const monteurId = monteur_id == null ? null : Number(monteur_id);

    const bijgewerkt = await db
      .update(voorzieningenTable)
      .set({ monteurId, bijgewerktOp: new Date() })
      .where(eq(voorzieningenTable.clusterId, clusterId))
      .returning({ id: voorzieningenTable.id });

    return res.json({ aantal: bijgewerkt.length });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── AI-SPOTVOORSTELLEN (leerset + beheerder-review) ─────────────────────────

async function mapSpotAiVoorstel(r: typeof spotAiVoorstellenTable.$inferSelect) {
  const bevestiger = r.beheerderBevestigdDoorId
    ? await db
        .select({ naam: gebruikersTable.naam })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, r.beheerderBevestigdDoorId))
        .then((x) => x[0])
    : null;
  return {
    id: r.id,
    voorziening_id: r.voorzieningId,
    gebouw_id: r.gebouwId,
    foto_voor_url: r.fotoVoorUrl,
    foto_na_url: r.fotoNaUrl,
    voorstel: r.voorstel,
    gekozen: r.gekozen,
    afwijking_toepassing: r.afwijkingToepassing,
    beheerder_bevestigd_door_id: r.beheerderBevestigdDoorId,
    beheerder_bevestigd_door_naam: bevestiger?.naam ?? null,
    beheerder_bevestigd_op: r.beheerderBevestigdOp ? r.beheerderBevestigdOp.toISOString() : null,
    herkomst: r.herkomst,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
  };
}

// GET /voorzieningen/:id/ai-voorstel — het opgeslagen AI-voorstel + gekozen waarden.
router.get("/voorzieningen/:id/ai-voorstel", lezenVoorzieningen, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (!(req.permissies!.magBijGebouw(await gebouwIdVanVoorziening(id)))) {
      return res.status(403).json({ error: "Geen toegang tot deze voorziening" });
    }
    const rijen = await db
      .select()
      .from(spotAiVoorstellenTable)
      .where(eq(spotAiVoorstellenTable.voorzieningId, id));
    if (rijen.length === 0) {
      return res.status(404).json({ error: "Geen AI-voorstel voor deze spot" });
    }
    // Het meest recente voorstel telt (een spot kan opnieuw geanalyseerd zijn).
    const laatste = [...rijen].sort((a, b) => b.id - a.id)[0];
    return res.json(await mapSpotAiVoorstel(laatste));
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /voorzieningen/:id/ai-voorstel — bewaart voorstel + gekozen waarden als
// leerset-rij. Berekent de afwijking (koos de monteur een andere toepassing dan
// de AI's eerste suggestie?) en markeert de spot eventueel voor beheerder-controle.
router.post("/voorzieningen/:id/ai-voorstel", requireBevoegdheid("voorzieningen", 3), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [v] = await db.select().from(voorzieningenTable).where(eq(voorzieningenTable.id, id));
    if (!v) return res.status(404).json({ error: "Voorziening niet gevonden" });
    if (!(req.permissies!.magBijGebouw(v.gebouwId))) {
      return res.status(403).json({ error: "Geen toegang tot deze voorziening" });
    }

    const { foto_voor_url, foto_na_url, voorstel, gekozen, meerdere_doorvoeren_doorgang } = req.body ?? {};
    const gekozenWaarden = (gekozen ?? {}) as SpotAiGekozen;
    const gekozenLabelIds = Array.isArray(gekozenWaarden.label_ids)
      ? gekozenWaarden.label_ids.map((n) => Number(n))
      : [];

    // Afwijking: de AI had een eerste toepassing-suggestie, maar die zit niet bij
    // de uiteindelijk gekozen toepassingen. Geen suggestie => geen afwijking.
    // Alleen een suggestie met score > 0 telt mee: een score-0 "hint" wordt mobiel
    // niet voorinvuld, dus mag ook geen valse beheerder-controle veroorzaken.
    const topSugg =
      voorstel && Array.isArray(voorstel.toepassing_suggesties) && voorstel.toepassing_suggesties.length > 0
        ? voorstel.toepassing_suggesties[0]
        : null;
    const topSuggestie =
      topSugg && Number(topSugg.score) > 0 ? Number(topSugg.label_id) : null;
    const afwijking =
      topSuggestie != null && gekozenLabelIds.length > 0 && !gekozenLabelIds.includes(topSuggestie);

    // Meerdere-doorvoeren-doorgang: de monteur heeft bewust gekozen om door te gaan
    // ondanks de AI-waarschuwing. De spot krijgt een controlevlag zodat de projectleider
    // deze kan beoordelen en goedkeuren.
    const meerdereDoorvoeren = voorstel?.meerdere_doorvoeren === true;
    const doorgang = meerdere_doorvoeren_doorgang === true;
    const aiTeControleren = afwijking || (meerdereDoorvoeren && doorgang);

    const [rij] = await db
      .insert(spotAiVoorstellenTable)
      .values({
        voorzieningId: id,
        gebouwId: v.gebouwId,
        fotoVoorUrl: foto_voor_url ?? null,
        fotoNaUrl: foto_na_url ?? null,
        voorstel: (voorstel ?? null) as SpotAiVoorstelSnapshot | null,
        gekozen: gekozenWaarden,
        afwijkingToepassing: afwijking,
      })
      .returning();

    await db
      .update(voorzieningenTable)
      .set({ aiVoorstelId: rij.id, aiTeControleren, bijgewerktOp: new Date() })
      .where(eq(voorzieningenTable.id, id));

    return res.status(201).json(await mapSpotAiVoorstel(rij));
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /voorzieningen/:id/ai-controle — beheerder bevestigt de afwijkende
// toepassingskeuze en legt vast of die gebouwspecifiek of generiek is (leerset).
// Niveau 4 (volledig beheer): bewust hoger dan aanmaken/wijzigen (niveau 3) zodat
// de monteur die de spot maakt zijn eigen afwijking niet zelf kan bevestigen.
router.post("/voorzieningen/:id/ai-controle", requireBevoegdheid("voorzieningen", 4), async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [v] = await db.select().from(voorzieningenTable).where(eq(voorzieningenTable.id, id));
    if (!v) return res.status(404).json({ error: "Voorziening niet gevonden" });
    if (!(req.permissies!.magBijGebouw(v.gebouwId))) {
      return res.status(403).json({ error: "Geen toegang tot deze voorziening" });
    }

    const herkomst = String(req.body?.herkomst ?? "");
    if (herkomst !== "gebouwspecifiek" && herkomst !== "generiek") {
      return res.status(400).json({ error: "herkomst moet 'gebouwspecifiek' of 'generiek' zijn" });
    }
    if (v.aiVoorstelId == null) {
      return res.status(404).json({ error: "Geen AI-voorstel voor deze spot" });
    }

    const [rij] = await db
      .update(spotAiVoorstellenTable)
      .set({
        herkomst,
        beheerderBevestigdDoorId: req.session.userId,
        beheerderBevestigdOp: new Date(),
        bijgewerktOp: new Date(),
      })
      .where(eq(spotAiVoorstellenTable.id, v.aiVoorstelId))
      .returning();
    if (!rij) return res.status(404).json({ error: "AI-voorstel niet gevonden" });

    await db
      .update(voorzieningenTable)
      .set({ aiTeControleren: false, bijgewerktOp: new Date() })
      .where(eq(voorzieningenTable.id, id));

    await logActiviteit({
      type: "ai_voorstel_bevestigd",
      omschrijving: `AI-toepassingskeuze van ${v.objectnummer} bevestigd (${herkomst})`,
      gebouwId: v.gebouwId,
      voorzieningId: v.id,
      voorzieningNummer: v.objectnummer,
      gebruikerId: req.session.userId,
    });

    return res.json(await mapSpotAiVoorstel(rij));
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /voorzieningen/:id/onderdelen
router.get("/voorzieningen/:id/onderdelen", lezenVoorzieningen, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (!(req.permissies!.magBijGebouw(await gebouwIdVanVoorziening(id)))) {
      return res.status(403).json({ error: "Geen toegang tot deze voorziening" });
    }
    const rows = await db
      .select()
      .from(voorzieningenTable)
      .where(eq(voorzieningenTable.parentSpotId, id));
    const items = await Promise.all(rows.map(mapVoorziening));
    return res.json(items);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /voorzieningen/:id/tijdlijn
router.get("/voorzieningen/:id/tijdlijn", lezenVoorzieningen, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (!(req.permissies!.magBijGebouw(await gebouwIdVanVoorziening(id)))) {
      return res.status(403).json({ error: "Geen toegang tot deze voorziening" });
    }
    const rows = await db
      .select()
      .from(activiteitenTable)
      .where(eq(activiteitenTable.voorzieningId, id))
      .orderBy(sql`${activiteitenTable.tijdstip} DESC`)
      .limit(100);
    return res.json(
      rows.map((r) => ({
        id: r.id,
        type: r.type,
        omschrijving: r.omschrijving,
        tijdstip: r.tijdstip?.toISOString(),
        gebruiker_naam: r.gebruikerNaam ?? null,
        gebruiker_id: r.gebruikerId ?? null,
      }))
    );
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /voorzieningen/:id/dossiers
router.get("/voorzieningen/:id/dossiers", lezenVoorzieningen, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (!(req.permissies!.magBijGebouw(await gebouwIdVanVoorziening(id)))) {
      return res.status(403).json({ error: "Geen toegang tot deze voorziening" });
    }
    const rows = await db
      .select()
      .from(spotDossiersTable)
      .where(eq(spotDossiersTable.voorzieningId, id));
    return res.json(
      rows.map((r) => ({
        id: r.id,
        voorziening_id: r.voorzieningId,
        type: r.type,
        status: r.status,
        data: r.data,
        aangemaakt_op: r.aangemaaktOp?.toISOString(),
        bijgewerkt_op: r.bijgewerktOp?.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /voorzieningen/:id/dossiers/:type
router.patch(
  "/voorzieningen/:id/dossiers/:type",
  requireBevoegdheid("voorzieningen", 2),
  async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      const type = String(req.params.type);
      if (!(req.permissies!.magBijGebouw(await gebouwIdVanVoorziening(id)))) {
        return res.status(403).json({ error: "Geen toegang tot deze voorziening" });
      }
      const { status, data } = req.body as { status?: string; data?: Record<string, unknown> };

      const bestaande = await db
        .select()
        .from(spotDossiersTable)
        .where(and(eq(spotDossiersTable.voorzieningId, id), eq(spotDossiersTable.type, type)));

      let row;
      if (bestaande.length > 0) {
        const statusUpdate = status !== undefined ? { status } : {};
        const dataUpdate = data !== undefined ? { data: data as typeof spotDossiersTable.$inferInsert["data"] } : {};
        [row] = await db
          .update(spotDossiersTable)
          .set({ ...statusUpdate, ...dataUpdate, bijgewerktOp: new Date() })
          .where(and(eq(spotDossiersTable.voorzieningId, id), eq(spotDossiersTable.type, type)))
          .returning();
      } else {
        [row] = await db
          .insert(spotDossiersTable)
          .values({
            voorzieningId: id,
            type,
            status: status ?? "concept",
            data: data ?? {},
          })
          .returning();
      }

      if (!row) return res.status(500).json({ error: "Opslaan mislukt" });
      return res.json({
        id: row.id,
        voorziening_id: row.voorzieningId,
        type: row.type,
        status: row.status,
        data: row.data,
        aangemaakt_op: row.aangemaaktOp?.toISOString(),
        bijgewerkt_op: row.bijgewerktOp?.toISOString(),
      });
    } catch (err) {
      req.log.error(err);
      return res.status(500).json({ error: "Interne serverfout" });
    }
  }
);

export default router;
