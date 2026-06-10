import { Router } from "express";
import { db } from "@workspace/db";
import {
  voorzieningenTable,
  fotosTable,
  gebouwenTable,
  verdiepingenTable,
  gebruikersTable,
  gebouwToewijzingenTable,
  inspectiesTable,
  onderhoudTable,
  activiteitenTable,
  scheidingenTable,
} from "@workspace/db";
import { eq, and, ilike, sql } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { heeftNiveau, bevoegdhedenVoorLegacyRol } from "@workspace/permissies";
import { effectieveContext } from "../utils/rol";
import { getLabelsVoorVoorziening, syncVoorzieningLabels } from "../lib/classificatie";

const router = Router();

// Rollen die uitsluitend hun toegewezen gebouwen mogen zien.
const TOEGEWEZEN_ROLLEN = ["monteur", "controleur"];

async function gebruikerRol(userId: number): Promise<string> {
  const [g] = await db
    .select({ rol: gebruikersTable.rol })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.id, userId));
  return g?.rol ?? "";
}

async function toegewezenGebouwIds(userId: number): Promise<number[]> {
  const rows = await db
    .select({ gebouwId: gebouwToewijzingenTable.gebouwId })
    .from(gebouwToewijzingenTable)
    .where(eq(gebouwToewijzingenTable.gebruikerId, userId));
  return rows.map((r) => r.gebouwId);
}

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

// Centrale toewijzingsguard: monteur/controleur mogen alleen bij hun toegewezen
// gebouwen. Andere rollen (beheerder/hoofdbeheerder/klant) worden hier niet
// beperkt; rolafdwinging gebeurt via requireRol. Geeft true als toegestaan.
async function magBijGebouw(userId: number, gebouwId: number | null): Promise<boolean> {
  const rol = await gebruikerRol(userId);
  if (!TOEGEWEZEN_ROLLEN.includes(rol)) return true;
  if (gebouwId == null) return false;
  const ids = await toegewezenGebouwIds(userId);
  return ids.includes(gebouwId);
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
    maker_monteur_id: v.makerMonteurId,
    maker_monteur_naam: maker?.naam ?? null,
    gearchiveerd: v.gearchiveerd,
    gearchiveerd_op: v.gearchiveerdOp ? v.gearchiveerdOp.toISOString() : null,
    aangemaakt_op: v.aangemaaktOp.toISOString(),
    bijgewerkt_op: v.bijgewerktOp.toISOString(),
  };
}

// GET /voorzieningen
router.get("/voorzieningen", async (req, res) => {
  try {
    const { gebouw_id, verdieping_id, type, status, gearchiveerd, classificatie, zoek, pagina, per_pagina } = req.query;
    let all = await db.select().from(voorzieningenTable);

    // Monteurs en controleurs zien alleen voorzieningen in hun toegewezen gebouwen.
    // effectieveContext zodat impersonatie (bekijken als) correct doorwerkt.
    const { userId: effectiefUserId, rol: effectiefRol } = await effectieveContext(req);
    if (TOEGEWEZEN_ROLLEN.includes(effectiefRol)) {
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
router.get("/gebouwen/:id/volgend-spotnummer", async (req, res) => {
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
    if (!(await magBijGebouw(req.session.userId!, gebouwId))) {
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
      wbdbo, wrd, wand_of_plafond, label_ids,
    } = req.body;

    // De aanmaker (maker) wordt altijd afgeleid uit de ingelogde sessie,
    // nooit vanuit de request body — voorkomt vervalsen van de creator-attributie.
    const maker_monteur_id = req.session.userId;

    if (!type || !gebouw_id) {
      return res.status(400).json({ error: "type en gebouw_id zijn verplicht" });
    }

    if (!(await magBijGebouw(req.session.userId!, Number(gebouw_id)))) {
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
            wbdbo, wrd, wandOfPlafond: wand_of_plafond, makerMonteurId: maker_monteur_id,
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

    await db.insert(activiteitenTable).values({
      type: "voorziening_aangemaakt",
      omschrijving: `Voorziening ${nummer} aangemaakt`,
      gebouwId: gebouw_id,
      voorzieningId: v.id,
      voorzieningNummer: nummer,
    });

    res.status(201).json(await mapVoorziening(v));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /voorzieningen/:id
router.get("/voorzieningen/:id", async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [v] = await db.select().from(voorzieningenTable).where(eq(voorzieningenTable.id, id));
    if (!v) return res.status(404).json({ error: "Voorziening niet gevonden" });
    if (!(await magBijGebouw(req.session.userId!, v.gebouwId))) {
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
    if (!(await magBijGebouw(req.session.userId!, await gebouwIdVanVoorziening(id)))) {
      return res.status(403).json({ error: "Geen toegang tot deze voorziening" });
    }
    const {
      objectnummer, qr_code, type, status, classificatie,
      verdieping_id, ruimte, huisnummer, locatie_omschrijving, locatie_x, locatie_y,
      materialen, opmerkingen, monteur_id, controleur_id,
      installatie_datum, volgende_inspectie,
      wbdbo, wrd, wand_of_plafond, maker_monteur_id, label_ids,
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
        wbdbo, wrd, wandOfPlafond: wand_of_plafond, makerMonteurId: maker_monteur_id,
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
router.get("/voorzieningen/:id/fotos", async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (!(await magBijGebouw(req.session.userId!, await gebouwIdVanVoorziening(id)))) {
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
    if (!(await magBijGebouw(req.session.userId!, await gebouwIdVanVoorziening(voorzieningId)))) {
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
    if (!(await magBijGebouw(req.session.userId!, await gebouwIdVanVoorziening(voorzieningId)))) {
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
    if (!(await magBijGebouw(req.session.userId!, await gebouwIdVanVoorziening(id)))) {
      return res.status(403).json({ error: "Geen toegang tot deze voorziening" });
    }
    const { status, opmerkingen } = req.body;
    const [v] = await db
      .update(voorzieningenTable)
      .set({ status, opmerkingen, bijgewerktOp: new Date() })
      .where(eq(voorzieningenTable.id, id))
      .returning();
    if (!v) return res.status(404).json({ error: "Voorziening niet gevonden" });

    await db.insert(activiteitenTable).values({
      type: "status_gewijzigd",
      omschrijving: `Status van ${v.objectnummer} gewijzigd naar ${status}`,
      gebouwId: v.gebouwId,
      voorzieningId: v.id,
      voorzieningNummer: v.objectnummer,
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
    if (!(await magBijGebouw(req.session.userId!, await gebouwIdVanVoorziening(id)))) {
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
        const bev: Record<string, number> =
          g.bevoegdheden && Object.keys(g.bevoegdheden as Record<string, number>).length > 0
            ? (g.bevoegdheden as Record<string, number>)
            : bevoegdhedenVoorLegacyRol(g.rol);
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

    await db.insert(activiteitenTable).values({
      type: gearchiveerd ? "voorziening_gearchiveerd" : "voorziening_teruggeplaatst",
      omschrijving: gearchiveerd
        ? `Voorziening ${v.objectnummer} gearchiveerd`
        : `Voorziening ${v.objectnummer} terug geplaatst`,
      gebouwId: v.gebouwId,
      voorzieningId: v.id,
      voorzieningNummer: v.objectnummer,
    });

    res.json(await mapVoorziening(v));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /verdiepingen/:id/voorzieningen
router.get("/verdiepingen/:id/voorzieningen", async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));

    // Monteur/controleur mag alleen verdiepingen van toegewezen gebouwen zien.
    // effectieveContext zodat impersonatie (bekijken als) correct doorwerkt.
    const { userId: effectiefUserId, rol: effectiefRol } = await effectieveContext(req);
    if (TOEGEWEZEN_ROLLEN.includes(effectiefRol)) {
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
router.get("/verdiepingen/:id/scheidingen", async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));

    // Monteur/controleur mag alleen verdiepingen van toegewezen gebouwen zien.
    // effectieveContext zodat impersonatie (bekijken als) correct doorwerkt.
    const { userId: effectiefUserId, rol: effectiefRol } = await effectieveContext(req);
    if (TOEGEWEZEN_ROLLEN.includes(effectiefRol)) {
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
    if (!(await magBijGebouw(req.session.userId!, await gebouwIdVanVerdieping(id)))) {
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
    if (!(await magBijGebouw(req.session.userId!, await gebouwIdVanScheiding(scheidingId)))) {
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
    if (!(await magBijGebouw(req.session.userId!, await gebouwIdVanScheiding(scheidingId)))) {
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

export default router;
