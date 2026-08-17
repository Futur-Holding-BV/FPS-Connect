// SOCIAL_01 — kalender, berichten, goedkeuren en koppelingen.
//
// Rechten (zelfde grens als MARKETING_01, getoetst tegen de bestaande
// backendroutes in marketing.ts):
//   - social niveau 3 = kalender en berichten bekijken, opstellen en klaarzetten
//   - social niveau 4 = plannen, plaatsen en koppelingen beheren
//
// Fail-closed (deel A): een bericht dat niet aan de kanaaleisen voldoet is
// niet te plannen — het plannen-endpoint valideert álle kanalen en weigert
// met 422 en de redenen; geen mislukte poging achteraf.
import { Router, type Request } from "express";
import { db } from "@workspace/db";
import {
  socialBerichtenTable,
  socialBerichtKanalenTable,
  socialKoppelingenTable,
  werkgeversTable,
  gebruikersTable,
  marketingCampagnesTable,
  SOCIAL_KANALEN,
  KOPPELING_MODI,
  type SocialKanaal,
  type SocialBericht,
  type SocialBerichtKanaal,
  type SocialKoppeling,
} from "@workspace/db";
import { eq, and, desc, gte, lte, isNotNull, inArray } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { heeftNiveau } from "@workspace/permissies";
import { KANAAL_EISEN, valideerTegenKanaal } from "../lib/socialKanalen";
import { telBerichtenOpDag } from "../services/socialService";

const router = Router();
const opstellen = requireBevoegdheid("social", 3);
const plannen = requireBevoegdheid("social", 4);

/**
 * Campagne-koppelingen zijn Marketing-terrein: het meesturen of wijzigen van
 * een niet-lege campagne_id vereist marketing niveau 3, ook al is de route
 * zelf social-gegate. Server-side afgedwongen — de UI-gate alleen is geen
 * autorisatie. Retourneert null bij toegang, anders een foutmelding.
 */
async function controleerCampagneKoppeling(
  req: Request,
  campagneIdRuw: unknown,
): Promise<{ status: number; error: string } | null> {
  if (campagneIdRuw === undefined || campagneIdRuw === null || campagneIdRuw === "") return null;
  const campagneId = Number(campagneIdRuw);
  if (!Number.isInteger(campagneId) || campagneId <= 0) {
    return { status: 400, error: "campagne_id is ongeldig" };
  }
  const bevoegdheidFout = await controleerMarketingBevoegdheid(req);
  if (bevoegdheidFout) return bevoegdheidFout;
  const [campagne] = await db
    .select({ id: marketingCampagnesTable.id })
    .from(marketingCampagnesTable)
    .where(eq(marketingCampagnesTable.id, campagneId));
  if (!campagne) return { status: 404, error: "Campagne niet gevonden" };
  return null;
}

/** Marketing niveau 3 vereist (hoofdbeheerder mag altijd). */
async function controleerMarketingBevoegdheid(
  req: Request,
): Promise<{ status: number; error: string } | null> {
  const userId = req.session.userId;
  if (!userId) return { status: 401, error: "Niet ingelogd" };
  let mag = false;
  if (req.permissies) {
    mag = req.permissies.isHoofdbeheerder || req.permissies.heeftModuleRecht("marketing", 3);
  } else {
    const [g] = await db
      .select({ rol: gebruikersTable.rol, bevoegdheden: gebruikersTable.bevoegdheden })
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, userId));
    if (!g) return { status: 403, error: "Geen toegang" };
    mag = g.rol === "hoofdbeheerder"
      || heeftNiveau((g.bevoegdheden as Record<string, number> | null) ?? {}, "marketing", 3);
  }
  if (!mag) {
    return { status: 403, error: "Campagne koppelen vereist marketing-bevoegdheid (niveau 3)" };
  }
  return null;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function mapKanaalRij(k: SocialBerichtKanaal) {
  return {
    id: k.id,
    kanaal: k.kanaal,
    tekst_override: k.tekstOverride,
    plaatsing_status: k.plaatsingStatus,
    extern_id: k.externId,
    geplaatst_op: iso(k.geplaatstOp),
    concept_klaargezet_op: iso(k.conceptKlaargezetOp),
    pogingen: k.pogingen,
    laatste_fout: k.laatsteFout,
    cijfers: (k.cijfers as Record<string, number> | null) ?? null,
    cijfers_opgehaald_op: iso(k.cijfersOpgehaaldOp),
  };
}

function mapBericht(b: SocialBericht, kanalen: SocialBerichtKanaal[], werkgeverNaam?: string | null) {
  return {
    id: b.id,
    werkgever_id: b.werkgeverId,
    werkgever_naam: werkgeverNaam ?? null,
    status: b.status,
    tekst: b.tekst,
    media_pad: b.mediaPad,
    media_type: b.mediaType,
    gepland_op: iso(b.geplandOp),
    campagne_id: b.campagneId,
    crm_klant_id: b.crmKlantId,
    gebouw_id: b.gebouwId,
    geplaatst_op: iso(b.geplaatstOp),
    kanalen: kanalen.map(mapKanaalRij),
  };
}

// Tokens zijn geheimen: de mapper geeft ze NOOIT terug, alleen of ze er zijn.
function mapKoppeling(k: SocialKoppeling, werkgeverNaam?: string | null) {
  return {
    id: k.id,
    werkgever_id: k.werkgeverId,
    werkgever_naam: werkgeverNaam ?? null,
    kanaal: k.kanaal,
    account_naam: k.accountNaam,
    modus: k.modus,
    status: k.status,
    heeft_toegang: !!k.accessToken,
    verloopt_op: iso(k.verlooptOp),
    laatst_vernieuwd_op: iso(k.laatstVernieuwdOp),
    laatste_fout: k.laatsteFout,
  };
}

function parseKanalen(v: unknown): SocialKanaal[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const uniek = [...new Set(v.map(String))];
  return uniek.every((k) => (SOCIAL_KANALEN as readonly string[]).includes(k)) ? (uniek as SocialKanaal[]) : null;
}

// ── Kanaaleisen (deel A: de opsteller toont wat het kanaal toestaat) ─────────
router.get("/social/kanaaleisen", opstellen, (_req, res) => {
  res.json(Object.values(KANAAL_EISEN).map((e) => ({
    kanaal: e.kanaal, naam: e.naam, tekst_max: e.tekstMax,
    beeld: e.beeld, video: e.video, media_verplicht: e.mediaVerplicht,
    video_max_seconden: e.videoMaxSeconden,
    beeld_bestandstypen: e.beeldBestandstypen, video_bestandstypen: e.videoBestandstypen,
    beeld_verhouding: e.beeldVerhouding, max_per_dag: e.maxPerDag,
  })));
});

// ── Berichten & kalender ─────────────────────────────────────────────────────
router.get("/social/berichten", opstellen, async (req, res) => {
  const van = typeof req.query.van === "string" ? new Date(req.query.van) : null;
  const tot = typeof req.query.tot === "string" ? new Date(req.query.tot) : null;
  const werkgeverId = req.query.werkgever_id ? Number(req.query.werkgever_id) : null;
  const voorwaarden = [
    ...(werkgeverId ? [eq(socialBerichtenTable.werkgeverId, werkgeverId)] : []),
    ...(van && !isNaN(van.getTime()) ? [gte(socialBerichtenTable.geplandOp, van)] : []),
    ...(tot && !isNaN(tot.getTime()) ? [lte(socialBerichtenTable.geplandOp, tot)] : []),
  ];
  const berichten = await db
    .select({ b: socialBerichtenTable, werkgeverNaam: werkgeversTable.naam })
    .from(socialBerichtenTable)
    .innerJoin(werkgeversTable, eq(socialBerichtenTable.werkgeverId, werkgeversTable.id))
    .where(voorwaarden.length ? and(...voorwaarden) : undefined)
    .orderBy(desc(socialBerichtenTable.aangemaaktOp))
    .limit(500);
  const ids = berichten.map((r) => r.b.id);
  const kanaalRijen = ids.length
    ? await db.select().from(socialBerichtKanalenTable).where(inArray(socialBerichtKanalenTable.berichtId, ids))
    : [];
  res.json(berichten.map(({ b, werkgeverNaam }) =>
    mapBericht(b, kanaalRijen.filter((k) => k.berichtId === b.id), werkgeverNaam)));
});

router.get("/social/berichten/:id", opstellen, async (req, res) => {
  const id = Number(req.params.id);
  const rij = (await db
    .select({ b: socialBerichtenTable, werkgeverNaam: werkgeversTable.naam })
    .from(socialBerichtenTable)
    .innerJoin(werkgeversTable, eq(socialBerichtenTable.werkgeverId, werkgeversTable.id))
    .where(eq(socialBerichtenTable.id, id)))[0];
  if (!rij) return void res.status(404).json({ error: "Bericht niet gevonden" });
  const kanalen = await db.select().from(socialBerichtKanalenTable).where(eq(socialBerichtKanalenTable.berichtId, id));
  res.json(mapBericht(rij.b, kanalen, rij.werkgeverNaam));
});

router.post("/social/berichten", opstellen, async (req, res) => {
  const { werkgever_id, tekst, kanalen, media_pad, media_type, gepland_op, campagne_id, crm_klant_id, gebouw_id, kanaal_teksten } = req.body ?? {};
  const werkgeverId = Number(werkgever_id);
  if (!werkgeverId) return void res.status(400).json({ error: "werkgever_id is verplicht" });
  const gekozen = parseKanalen(kanalen);
  if (!gekozen) return void res.status(400).json({ error: "Kies minstens één geldig kanaal" });
  const campagneFout = await controleerCampagneKoppeling(req, campagne_id);
  if (campagneFout) return void res.status(campagneFout.status).json({ error: campagneFout.error });
  if (media_type != null && !["beeld", "video"].includes(String(media_type))) {
    return void res.status(400).json({ error: "media_type moet 'beeld' of 'video' zijn" });
  }
  if (!!media_pad !== !!media_type) {
    return void res.status(400).json({ error: "media_pad en media_type horen samen" });
  }
  const werkgever = (await db.select().from(werkgeversTable).where(eq(werkgeversTable.id, werkgeverId)))[0];
  if (!werkgever) return void res.status(404).json({ error: "Werkmaatschappij niet gevonden" });

  const overrides = (kanaal_teksten && typeof kanaal_teksten === "object") ? kanaal_teksten as Record<string, unknown> : {};
  const bericht = (await db.insert(socialBerichtenTable).values({
    werkgeverId,
    tekst: typeof tekst === "string" ? tekst : "",
    mediaPad: typeof media_pad === "string" && media_pad ? media_pad : null,
    mediaType: typeof media_type === "string" && media_type ? media_type : null,
    geplandOp: typeof gepland_op === "string" && gepland_op ? new Date(gepland_op) : null,
    campagneId: campagne_id ? Number(campagne_id) : null,
    crmKlantId: crm_klant_id ? Number(crm_klant_id) : null,
    gebouwId: gebouw_id ? Number(gebouw_id) : null,
    makerId: req.session.userId ?? null,
  }).returning())[0];
  const kanaalRijen = await db.insert(socialBerichtKanalenTable).values(gekozen.map((k) => ({
    berichtId: bericht.id,
    kanaal: k,
    tekstOverride: typeof overrides[k] === "string" && (overrides[k] as string).trim() !== "" ? String(overrides[k]) : null,
  }))).returning();
  res.status(201).json(mapBericht(bericht, kanaalRijen, werkgever.naam));
});

router.patch("/social/berichten/:id", opstellen, async (req, res) => {
  const id = Number(req.params.id);
  const bestaand = (await db.select().from(socialBerichtenTable).where(eq(socialBerichtenTable.id, id)))[0];
  if (!bestaand) return void res.status(404).json({ error: "Bericht niet gevonden" });
  // Bewerken kan alleen vóór plannen; een gepland/geplaatst bericht eerst terughalen.
  if (!["concept", "klaar"].includes(bestaand.status)) {
    return void res.status(409).json({ error: `Bericht met status '${bestaand.status}' is niet te bewerken — haal het eerst terug` });
  }
  const { tekst, kanalen, media_pad, media_type, gepland_op, campagne_id, crm_klant_id, gebouw_id, kanaal_teksten } = req.body ?? {};
  // Ook het wijzigen/ontkoppelen van de campagne-koppeling is Marketing-terrein.
  if (campagne_id !== undefined) {
    const isOntkoppelen = campagne_id === null || campagne_id === "";
    if (isOntkoppelen) {
      // Ontkoppelen van een bestaande koppeling vereist dezelfde bevoegdheid;
      // was er niets gekoppeld, dan is het een no-op.
      if (bestaand.campagneId != null) {
        const fout = await controleerMarketingBevoegdheid(req);
        if (fout) return void res.status(fout.status).json({ error: fout.error });
      }
    } else {
      const campagneFout = await controleerCampagneKoppeling(req, campagne_id);
      if (campagneFout) return void res.status(campagneFout.status).json({ error: campagneFout.error });
    }
  }
  if (media_type !== undefined && media_type !== null && !["beeld", "video"].includes(String(media_type))) {
    return void res.status(400).json({ error: "media_type moet 'beeld' of 'video' zijn" });
  }
  const update: Partial<typeof socialBerichtenTable.$inferInsert> = { bijgewerktOp: new Date() };
  if (typeof tekst === "string") update.tekst = tekst;
  if (media_pad !== undefined) update.mediaPad = media_pad || null;
  if (media_type !== undefined) update.mediaType = media_type || null;
  if (gepland_op !== undefined) update.geplandOp = gepland_op ? new Date(gepland_op) : null;
  if (campagne_id !== undefined) update.campagneId = campagne_id ? Number(campagne_id) : null;
  if (crm_klant_id !== undefined) update.crmKlantId = crm_klant_id ? Number(crm_klant_id) : null;
  if (gebouw_id !== undefined) update.gebouwId = gebouw_id ? Number(gebouw_id) : null;
  const bericht = (await db.update(socialBerichtenTable).set(update).where(eq(socialBerichtenTable.id, id)).returning())[0];

  if (kanalen !== undefined) {
    const gekozen = parseKanalen(kanalen);
    if (!gekozen) return void res.status(400).json({ error: "Kies minstens één geldig kanaal" });
    await db.delete(socialBerichtKanalenTable).where(eq(socialBerichtKanalenTable.berichtId, id));
    const overrides = (kanaal_teksten && typeof kanaal_teksten === "object") ? kanaal_teksten as Record<string, unknown> : {};
    await db.insert(socialBerichtKanalenTable).values(gekozen.map((k) => ({
      berichtId: id, kanaal: k,
      tekstOverride: typeof overrides[k] === "string" && (overrides[k] as string).trim() !== "" ? String(overrides[k]) : null,
    })));
  } else if (kanaal_teksten && typeof kanaal_teksten === "object") {
    for (const [k, v] of Object.entries(kanaal_teksten as Record<string, unknown>)) {
      if (!(SOCIAL_KANALEN as readonly string[]).includes(k)) continue;
      await db.update(socialBerichtKanalenTable)
        .set({ tekstOverride: typeof v === "string" && v.trim() !== "" ? v : null, bijgewerktOp: new Date() })
        .where(and(eq(socialBerichtKanalenTable.berichtId, id), eq(socialBerichtKanalenTable.kanaal, k)));
    }
  }
  const kanaalRijen = await db.select().from(socialBerichtKanalenTable).where(eq(socialBerichtKanalenTable.berichtId, id));
  res.json(mapBericht(bericht, kanaalRijen));
});

router.delete("/social/berichten/:id", opstellen, async (req, res) => {
  const id = Number(req.params.id);
  const bestaand = (await db.select().from(socialBerichtenTable).where(eq(socialBerichtenTable.id, id)))[0];
  if (!bestaand) return void res.status(404).json({ error: "Bericht niet gevonden" });
  if (!["concept", "klaar"].includes(bestaand.status)) {
    return void res.status(409).json({ error: "Alleen concept- of klaar-berichten zijn te verwijderen" });
  }
  await db.delete(socialBerichtenTable).where(eq(socialBerichtenTable.id, id));
  res.json({ ok: true });
});

// ── Statusmachine (deel B): concept → klaar → gepland → geplaatst ───────────
router.post("/social/berichten/:id/klaar", opstellen, async (req, res) => {
  const id = Number(req.params.id);
  const rijen = await db.update(socialBerichtenTable)
    .set({ status: "klaar", klaarOp: new Date(), bijgewerktOp: new Date() })
    .where(and(eq(socialBerichtenTable.id, id), eq(socialBerichtenTable.status, "concept")))
    .returning();
  if (rijen.length === 0) return void res.status(409).json({ error: "Alleen een concept kan op 'klaar' gezet worden" });
  res.json({ ok: true, status: "klaar" });
});

router.post("/social/berichten/:id/terug-naar-concept", opstellen, async (req, res) => {
  const id = Number(req.params.id);
  const rijen = await db.update(socialBerichtenTable)
    .set({ status: "concept", klaarOp: null, bijgewerktOp: new Date() })
    .where(and(eq(socialBerichtenTable.id, id), eq(socialBerichtenTable.status, "klaar")))
    .returning();
  if (rijen.length === 0) return void res.status(409).json({ error: "Alleen een 'klaar'-bericht kan terug naar concept" });
  res.json({ ok: true, status: "concept" });
});

router.post("/social/berichten/:id/plannen", plannen, async (req, res) => {
  const id = Number(req.params.id);
  const geplandOpRuw = req.body?.gepland_op;
  const geplandOp = typeof geplandOpRuw === "string" ? new Date(geplandOpRuw) : null;
  if (!geplandOp || isNaN(geplandOp.getTime())) return void res.status(400).json({ error: "gepland_op (datum+tijd) is verplicht" });

  const bericht = (await db.select().from(socialBerichtenTable).where(eq(socialBerichtenTable.id, id)))[0];
  if (!bericht) return void res.status(404).json({ error: "Bericht niet gevonden" });
  if (bericht.status !== "klaar") return void res.status(409).json({ error: `Alleen een 'klaar'-bericht is te plannen (nu: ${bericht.status})` });

  const kanaalRijen = await db.select().from(socialBerichtKanalenTable).where(eq(socialBerichtKanalenTable.berichtId, id));
  if (kanaalRijen.length === 0) return void res.status(422).json({ error: "Bericht heeft geen kanalen" });

  // Fail-closed: alle kanaaleisen toetsen; past het niet, dan niet te plannen.
  const fouten: string[] = [];
  for (const rij of kanaalRijen) {
    fouten.push(...valideerTegenKanaal({
      kanaal: rij.kanaal as SocialKanaal,
      tekst: rij.tekstOverride ?? bericht.tekst,
      mediaPad: bericht.mediaPad,
      mediaType: (bericht.mediaType as "beeld" | "video" | null),
    }));
    const eisen = KANAAL_EISEN[rij.kanaal as SocialKanaal];
    if (eisen.maxPerDag != null) {
      const aantal = await telBerichtenOpDag(bericht.werkgeverId, rij.kanaal as SocialKanaal, geplandOp, id);
      if (aantal >= eisen.maxPerDag) fouten.push(`${eisen.naam}: daglimiet van ${eisen.maxPerDag} berichten voor deze dag is bereikt`);
    }
  }
  if (fouten.length > 0) return void res.status(422).json({ error: "Bericht voldoet niet aan de kanaaleisen", redenen: fouten });

  await db.update(socialBerichtKanalenTable)
    .set({ plaatsingStatus: "wachtend", pogingen: 0, laatsteFout: null, taakGemaakt: false, bijgewerktOp: new Date() })
    .where(eq(socialBerichtKanalenTable.berichtId, id));
  const rijen = await db.update(socialBerichtenTable)
    .set({ status: "gepland", geplandOp, plannerId: req.session.userId ?? null, bijgewerktOp: new Date() })
    .where(and(eq(socialBerichtenTable.id, id), eq(socialBerichtenTable.status, "klaar")))
    .returning();
  if (rijen.length === 0) return void res.status(409).json({ error: "Bericht is intussen gewijzigd" });
  res.json({ ok: true, status: "gepland", gepland_op: geplandOp.toISOString() });
});

router.post("/social/berichten/:id/terug-naar-klaar", plannen, async (req, res) => {
  const id = Number(req.params.id);
  // Alleen zolang nog niets geplaatst/klaargezet is.
  const kanaalRijen = await db.select().from(socialBerichtKanalenTable).where(eq(socialBerichtKanalenTable.berichtId, id));
  if (kanaalRijen.some((k) => k.plaatsingStatus !== "wachtend")) {
    return void res.status(409).json({ error: "Er is al (deels) geplaatst of klaargezet — terughalen kan niet meer" });
  }
  const rijen = await db.update(socialBerichtenTable)
    .set({ status: "klaar", geplandOp: null, plannerId: null, bijgewerktOp: new Date() })
    .where(and(eq(socialBerichtenTable.id, id), eq(socialBerichtenTable.status, "gepland")))
    .returning();
  if (rijen.length === 0) return void res.status(409).json({ error: "Alleen een gepland bericht is terug te halen" });
  res.json({ ok: true, status: "klaar" });
});

// ── Koppelingen (deel E) — social 4 ──────────────────────────────────────────
router.get("/social/koppelingen", plannen, async (_req, res) => {
  const rijen = await db
    .select({ k: socialKoppelingenTable, werkgeverNaam: werkgeversTable.naam })
    .from(socialKoppelingenTable)
    .innerJoin(werkgeversTable, eq(socialKoppelingenTable.werkgeverId, werkgeversTable.id))
    .orderBy(werkgeversTable.naam, socialKoppelingenTable.kanaal);
  res.json(rijen.map(({ k, werkgeverNaam }) => mapKoppeling(k, werkgeverNaam)));
});

router.post("/social/koppelingen", plannen, async (req, res) => {
  const { werkgever_id, kanaal, account_naam, modus, verloopt_op } = req.body ?? {};
  const werkgeverId = Number(werkgever_id);
  if (!werkgeverId) return void res.status(400).json({ error: "werkgever_id is verplicht" });
  if (!(SOCIAL_KANALEN as readonly string[]).includes(String(kanaal))) return void res.status(400).json({ error: "Ongeldig kanaal" });
  if (!(KOPPELING_MODI as readonly string[]).includes(String(modus))) return void res.status(400).json({ error: "modus moet 'publiceren' of 'klaarzetten' zijn" });
  if (typeof account_naam !== "string" || !account_naam.trim()) return void res.status(400).json({ error: "account_naam is verplicht" });
  try {
    const rij = (await db.insert(socialKoppelingenTable).values({
      werkgeverId,
      kanaal: String(kanaal),
      accountNaam: account_naam.trim(),
      modus: String(modus),
      verlooptOp: typeof verloopt_op === "string" && verloopt_op ? new Date(verloopt_op) : null,
      aangemaaktDoorId: req.session.userId ?? null,
    }).returning())[0];
    res.status(201).json(mapKoppeling(rij));
  } catch {
    res.status(409).json({ error: "Voor deze werkmaatschappij bestaat al een koppeling voor dit kanaal" });
  }
});

router.patch("/social/koppelingen/:id", plannen, async (req, res) => {
  const id = Number(req.params.id);
  const bestaand = (await db.select().from(socialKoppelingenTable).where(eq(socialKoppelingenTable.id, id)))[0];
  if (!bestaand) return void res.status(404).json({ error: "Koppeling niet gevonden" });
  const { account_naam, modus, status, verloopt_op } = req.body ?? {};
  const update: Partial<typeof socialKoppelingenTable.$inferInsert> = { bijgewerktOp: new Date() };
  if (account_naam !== undefined) {
    if (typeof account_naam !== "string" || !account_naam.trim()) return void res.status(400).json({ error: "account_naam mag niet leeg zijn" });
    update.accountNaam = account_naam.trim();
  }
  if (modus !== undefined) {
    if (!(KOPPELING_MODI as readonly string[]).includes(String(modus))) return void res.status(400).json({ error: "Ongeldige modus" });
    update.modus = String(modus);
  }
  if (status !== undefined) {
    if (!["actief", "ingetrokken"].includes(String(status))) return void res.status(400).json({ error: "status kan alleen 'actief' of 'ingetrokken' worden gezet" });
    update.status = String(status);
    if (status === "actief") update.laatsteFout = null;
  }
  if (verloopt_op !== undefined) {
    update.verlooptOp = verloopt_op ? new Date(String(verloopt_op)) : null;
    update.verloopTaakOp = null;
  }
  const rij = (await db.update(socialKoppelingenTable).set(update).where(eq(socialKoppelingenTable.id, id)).returning())[0];
  res.json(mapKoppeling(rij));
});

router.delete("/social/koppelingen/:id", plannen, async (req, res) => {
  const id = Number(req.params.id);
  const rijen = await db.delete(socialKoppelingenTable).where(eq(socialKoppelingenTable.id, id)).returning({ id: socialKoppelingenTable.id });
  if (rijen.length === 0) return void res.status(404).json({ error: "Koppeling niet gevonden" });
  res.json({ ok: true });
});

export default router;
