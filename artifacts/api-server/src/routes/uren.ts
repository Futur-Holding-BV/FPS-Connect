import { Router } from "express";
import { db } from "@workspace/db";
import {
  urenRegistratiesTable,
  weekStatenTable,
  medewerkersTable,
  gebouwenTable,
  gebruikersTable,
  planningItemsTable,
  verlofAanvragenTable,
  verlofsoortenTable,
} from "@workspace/db/schema";
import { eq, and, gte, lte, desc, sql, inArray } from "drizzle-orm";
import { requireAuth, requireBevoegdheid } from "../middlewares/auth";
import { medewerkerIdVoorGebruiker, medewerkerVoorId } from "../services/medewerker-lookup";
import {
  overwerkSlotenTable,
  projectenTable,
  indirecteWerkzaamhedenTable,
  werkbegrotingRegelsTable,
  projectBegrotingenTable,
  modCalcNormtijdenTable,
  opdrachtenTable,
} from "@workspace/db/schema";
import { vindGebruikersMetFunctietitel, meldAanWerkvoorbereiderMetCcProjectleider } from "../lib/bouwMeldingen";

import { berekenAdvVoorMedewerker, overwerkGrens } from "../lib/caoInstellingen";
import { meldWerkbakItem } from "../lib/werkbakService";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoWeekNummer(datum: Date): number {
  const d = new Date(Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()));
  const dag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dag);
  const jaarStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - jaarStart.getTime()) / 86400000 + 1) / 7);
}

function weekGrenzen(jaar: number, week: number): { van: string; tot: string } {
  const jan4 = new Date(Date.UTC(jaar, 0, 4));
  const dag = jan4.getUTCDay() || 7;
  const maandag = new Date(jan4);
  maandag.setUTCDate(jan4.getUTCDate() - dag + 1 + (week - 1) * 7);
  const zondag = new Date(maandag);
  zondag.setUTCDate(maandag.getUTCDate() + 6);
  return {
    van: maandag.toISOString().slice(0, 10),
    tot: zondag.toISOString().slice(0, 10),
  };
}

function berekenNettoUren(begin: string, eind: string, pauzeMin: number): number {
  const [bH, bM] = begin.split(":").map(Number);
  const [eH, eM] = eind.split(":").map(Number);
  const totMin = (eH * 60 + eM) - (bH * 60 + bM);
  return Math.max(0, Math.round(((totMin - pauzeMin) / 60) * 10) / 10);
}

// UREN_01 §3: ADV = min(max, max(0, gewerkt − drempel)) uit de CAO-instelling
// (lib/caoInstellingen.ts) — geen vrije-tekstmatch en geen factor in de code.
function berekenAdv(medewerker: { cao: string | null; dienstverband: string }, gewerktUren: number): number {
  return berekenAdvVoorMedewerker(medewerker, gewerktUren).adv_uren;
}

// ── UREN_01 §4: overwerkslot-toets ───────────────────────────────────────────
// Weektotaal boven de grens (CAO-drempel + ADV, doorgaans 40) is alleen
// toegestaan voor zover de uren bóven de grens geschreven zijn op een project
// waarvan het slot op de DATUM VAN DE URENREGEL open stond (niet het moment
// van invoeren). Niets wordt stil geweigerd of afgekapt: de toets geeft een
// duidelijke melding terug plus de mogelijkheid toestemming te vragen.
interface OverwerkToets {
  toegestaan: boolean;
  boven_uren: number;          // deel van deze regel boven de weekgrens
  grens: number;
  slot_id: number | null;      // gebruikt slot bij acceptatie
  weigering: string | null;
}

async function toetsOverwerkSlot(opts: {
  medewerkerId: number;
  datum: string;
  nettoUren: number;
  projectId: number | null;
  cao: string | null;
  negeerRegistratieId?: number; // bij PATCH: eigen rij niet dubbel tellen
}): Promise<OverwerkToets> {
  const grens = overwerkGrens(opts.cao);
  const d = new Date(opts.datum + "T00:00:00Z");
  const { jaar, week } = isoJaarWeek(d);
  const grenzen = weekGrenzen(jaar, week);

  const rows = await db
    .select({ id: urenRegistratiesTable.id, nettoUren: urenRegistratiesTable.nettoUren })
    .from(urenRegistratiesTable)
    .where(and(
      eq(urenRegistratiesTable.medewerkerId, opts.medewerkerId),
      gte(urenRegistratiesTable.datum, grenzen.van),
      lte(urenRegistratiesTable.datum, grenzen.tot),
    ));
  const overig = rows
    .filter((r) => r.id !== opts.negeerRegistratieId)
    .reduce((acc, r) => acc + r.nettoUren, 0);
  const nieuwTotaal = overig + opts.nettoUren;
  const boven = Math.round((nieuwTotaal - grens) * 100) / 100;
  if (boven <= 0) return { toegestaan: true, boven_uren: 0, grens, slot_id: null, weigering: null };

  const bovenVanRegel = Math.min(opts.nettoUren, boven);
  if (!opts.projectId) {
    return {
      toegestaan: false, boven_uren: bovenVanRegel, grens, slot_id: null,
      weigering: `U komt hiermee ${bovenVanRegel} uur boven de ${grens} uur per week uit. Overwerk kan alleen op een project met een open overwerkslot; deze regel is niet aan een project gekoppeld.`,
    };
  }

  // Slot moet open zijn op de datum van de urenregel én binnen het plafond blijven.
  const sloten = await db
    .select()
    .from(overwerkSlotenTable)
    .where(and(
      eq(overwerkSlotenTable.projectId, opts.projectId),
      eq(overwerkSlotenTable.status, "open"),
    ));
  const slot = sloten.find((s) =>
    s.geldigVan != null && s.geldigTot != null &&
    opts.datum >= s.geldigVan && opts.datum <= s.geldigTot &&
    (s.urenPlafond == null || s.verbruikteUren + bovenVanRegel <= s.urenPlafond + 1e-9)
  );
  if (!slot) {
    const plafondVol = sloten.some((s) =>
      s.geldigVan != null && s.geldigTot != null &&
      opts.datum >= s.geldigVan && opts.datum <= s.geldigTot);
    return {
      toegestaan: false, boven_uren: bovenVanRegel, grens, slot_id: null,
      weigering: plafondVol
        ? `U komt hiermee ${bovenVanRegel} uur boven de ${grens} uur per week uit. Het overwerkslot op dit project heeft onvoldoende ruimte binnen het urenplafond.`
        : `U komt hiermee ${bovenVanRegel} uur boven de ${grens} uur per week uit en het overwerkslot van dit project staat op ${opts.datum} niet open.`,
    };
  }
  return { toegestaan: true, boven_uren: bovenVanRegel, grens, slot_id: slot.id, weigering: null };
}

// Boek slotverbruik ATOMAIR: één conditionele UPDATE die alleen slaagt als het
// plafond het nog toelaat (voorkomt races tussen gelijktijdige invoer), en het
// slot in dezelfde statement sluit zodra het plafond is bereikt.
async function boekSlotVerbruik(slotId: number, uren: number): Promise<boolean> {
  const rijen = await db.execute(sql`
    UPDATE overwerk_sloten
    SET verbruikte_uren = round((verbruikte_uren + ${uren})::numeric, 2),
        status = CASE WHEN uren_plafond IS NOT NULL AND verbruikte_uren + ${uren} >= uren_plafond - 1e-9 THEN 'gesloten' ELSE status END,
        gesloten_op = CASE WHEN uren_plafond IS NOT NULL AND verbruikte_uren + ${uren} >= uren_plafond - 1e-9 THEN now() ELSE gesloten_op END,
        bijgewerkt_op = now()
    WHERE id = ${slotId} AND status = 'open'
      AND (uren_plafond IS NULL OR verbruikte_uren + ${uren} <= uren_plafond + 1e-9)
    RETURNING id`);
  const n = Array.isArray(rijen) ? rijen.length : ((rijen as { rows?: unknown[] }).rows?.length ?? 0);
  return n > 0;
}

function mapUren(
  u: typeof urenRegistratiesTable.$inferSelect,
  extra?: {
    medewerkerNaam?: string | null;
    gebouwNaam?: string | null;
    goedgekeurdDoorNaam?: string | null;
  }
) {
  return {
    id: u.id,
    datum: u.datum,
    medewerker_id: u.medewerkerId,
    medewerker_naam: extra?.medewerkerNaam ?? null,
    gebouw_id: u.gebouwId ?? null,
    gebouw_naam: extra?.gebouwNaam ?? null,
    project_id: u.projectId ?? null,
    project_naam: u.projectNaam ?? null,
    werkzaamheden: u.werkzaamheden ?? null,
    werkzaamheid_categorie: u.werkzaamheidCategorie ?? null,
    ruimte: u.ruimte ?? null,
    object_omschrijving: u.objectOmschrijving ?? null,
    begin_tijd: u.beginTijd,
    eind_tijd: u.eindTijd,
    pauze_minuten: u.pauzeMinuten,
    netto_uren: u.nettoUren,
    opmerkingen: u.opmerkingen ?? null,
    status: u.status,
    planning_item_id: u.planningItemId ?? null,
    opdracht_id: u.opdrachtId ?? null,
    normtijd_id: u.normtijdId ?? null,
    indirecte_werkzaamheid_id: u.indirecteWerkzaamheidId ?? null,
    niet_in_begroting: u.nietInBegroting,
    niet_in_begroting_omschrijving: u.nietInBegrotingOmschrijving ?? null,
    ingediend_op: u.ingediendOp?.toISOString() ?? null,
    goedgekeurd_door_id: u.goedgekeurdDoorId ?? null,
    goedgekeurd_door_naam: extra?.goedgekeurdDoorNaam ?? null,
    goedgekeurd_op: u.goedgekeurdOp?.toISOString() ?? null,
    afgewezen: u.afgewezen,
    afwijzing_reden: u.afwijzingReden ?? null,
    aangemaakt_op: u.aangemaaktOp.toISOString(),
    bijgewerkt_op: u.bijgewerktOp.toISOString(),
  };
}

function mapWeekStaat(
  w: typeof weekStatenTable.$inferSelect,
  extra?: {
    medewerkerNaam?: string | null;
    goedgekeurdDoorNaam?: string | null;
    vergrendeldDoorNaam?: string | null;
  }
) {
  return {
    id: w.id,
    medewerker_id: w.medewerkerId,
    medewerker_naam: extra?.medewerkerNaam ?? null,
    jaar: w.jaar,
    week_nummer: w.weekNummer,
    status: w.status,
    totaal_uren: w.totaalUren ?? null,
    adv_uren: w.advUren ?? null,
    notities: w.notities ?? null,
    afwijzing_reden: w.afwijzingReden ?? null,
    ingediend_op: w.ingediendOp?.toISOString() ?? null,
    goedgekeurd_door_id: w.goedgekeurdDoorId ?? null,
    goedgekeurd_door_naam: extra?.goedgekeurdDoorNaam ?? null,
    goedgekeurd_op: w.goedgekeurdOp?.toISOString() ?? null,
    document_id: w.documentId ?? null,
    vergrendeld: w.vergrendeld,
    vergrendeld_op: w.vergrendeldOp?.toISOString() ?? null,
    vergrendeld_door_naam: extra?.vergrendeldDoorNaam ?? null,
    aangemaakt_op: w.aangemaaktOp.toISOString(),
    bijgewerkt_op: w.bijgewerktOp.toISOString(),
  };
}

// ISO-jaar hoort bij het ISO-weeknummer (rond nieuwjaar wijkt het af van het kalenderjaar).
function isoJaarWeek(datum: Date): { jaar: number; week: number } {
  const d = new Date(Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth(), datum.getUTCDate()));
  const dag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dag);
  return { jaar: d.getUTCFullYear(), week: isoWeekNummer(datum) };
}

async function isWeekVergrendeld(medId: number, datum: string): Promise<boolean> {
  const d = new Date(datum + "T00:00:00Z");
  const { jaar, week } = isoJaarWeek(d);
  const [ws] = await db
    .select({ vergrendeld: weekStatenTable.vergrendeld })
    .from(weekStatenTable)
    .where(
      and(
        eq(weekStatenTable.medewerkerId, medId),
        eq(weekStatenTable.jaar, jaar),
        eq(weekStatenTable.weekNummer, week)
      )
    )
    .limit(1);
  return ws?.vergrendeld ?? false;
}

async function medewerkerId(gebruikerId: number): Promise<number | null> {
  return medewerkerIdVoorGebruiker(gebruikerId, db);
}

// Goedgekeurd verlof (incl. tijd-voor-tijd) dat overlapt met een weekbereik —
// zodat opgenomen verlof in de weekstaat zichtbaar is zonder dubbele uren-invoer.
async function verlofVoorWeek(medId: number, van: string, tot: string) {
  const rows = await db
    .select({
      a: verlofAanvragenTable,
      verlofsoortNaam: verlofsoortenTable.naam,
      hoofdcategorie: verlofsoortenTable.hoofdcategorie,
      isTijdVoorTijd: verlofsoortenTable.isTijdVoorTijd,
    })
    .from(verlofAanvragenTable)
    .leftJoin(verlofsoortenTable, eq(verlofAanvragenTable.verlofsoortId, verlofsoortenTable.id))
    .where(
      and(
        eq(verlofAanvragenTable.medewerkerId, medId),
        eq(verlofAanvragenTable.status, "goedgekeurd"),
        lte(verlofAanvragenTable.startDatum, tot),
        gte(verlofAanvragenTable.eindDatum, van),
      ),
    )
    .orderBy(verlofAanvragenTable.startDatum);

  return rows.map((r) => ({
    id: r.a.id,
    verlofsoort_id: r.a.verlofsoortId,
    verlofsoort_naam: r.verlofsoortNaam ?? null,
    hoofdcategorie: r.hoofdcategorie ?? null,
    is_tijd_voor_tijd: r.isTijdVoorTijd ?? false,
    start_datum: r.a.startDatum,
    eind_datum: r.a.eindDatum,
    aantal_uren: r.a.aantalUren,
    reden: r.a.reden ?? null,
    status: r.a.status,
  }));
}

// ── GET /uren ─────────────────────────────────────────────────────────────────
router.get("/uren", requireAuth, async (req, res): Promise<void> => {
  const {
    medewerker_id,
    datum_van,
    datum_tot,
    week,
    jaar,
    status,
    gebouw_id,
  } = req.query as Record<string, string | undefined>;

  const userId = req.session.userId!;

  const isManager = req.permissies!.heeftModuleRecht("personeel", 1);

  let eigenMedewerkerId: number | null = null;
  if (!isManager) {
    eigenMedewerkerId = await medewerkerId(userId);
    if (!eigenMedewerkerId) return void res.json([]);
  }

  const filters = [];

  if (eigenMedewerkerId) {
    filters.push(eq(urenRegistratiesTable.medewerkerId, eigenMedewerkerId));
  } else if (medewerker_id) {
    filters.push(eq(urenRegistratiesTable.medewerkerId, Number(medewerker_id)));
  }

  if (datum_van) filters.push(gte(urenRegistratiesTable.datum, datum_van));
  if (datum_tot) filters.push(lte(urenRegistratiesTable.datum, datum_tot));

  if (week && jaar) {
    const { van, tot } = weekGrenzen(Number(jaar), Number(week));
    filters.push(gte(urenRegistratiesTable.datum, van));
    filters.push(lte(urenRegistratiesTable.datum, tot));
  }

  if (status) filters.push(eq(urenRegistratiesTable.status, status));
  if (gebouw_id) filters.push(eq(urenRegistratiesTable.gebouwId, Number(gebouw_id)));

  const rows = await db
    .select({
      uren: urenRegistratiesTable,
      medewerkerNaam: medewerkersTable.naam,
      gebouwNaam: gebouwenTable.naam,
    })
    .from(urenRegistratiesTable)
    .leftJoin(medewerkersTable, eq(urenRegistratiesTable.medewerkerId, medewerkersTable.id))
    .leftJoin(gebouwenTable, eq(urenRegistratiesTable.gebouwId, gebouwenTable.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(urenRegistratiesTable.datum), desc(urenRegistratiesTable.beginTijd));

  res.json(rows.map((r) => mapUren(r.uren, { medewerkerNaam: r.medewerkerNaam, gebouwNaam: r.gebouwNaam })));
});

// ── GET /uren/mijn-week ───────────────────────────────────────────────────────
router.get("/uren/mijn-week", requireAuth, async (req, res): Promise<void> => {
  const { jaar, week } = req.query as Record<string, string | undefined>;
  const userId = req.session.userId!;

  const mid = await medewerkerId(userId);
  if (!mid) {
    return void res.json({
      medewerker_id: null, jaar: 0, week_nummer: 0,
      datum_van: "", datum_tot: "", uren: [], planning_items: [],
      totaal_uren: 0, adv_uren: 0,
    });
  }

  const nu = new Date();
  const targetJaar = jaar ? Number(jaar) : isoJaarWeek(new Date(Date.UTC(nu.getFullYear(), nu.getMonth(), nu.getDate()))).jaar;
  const targetWeek = week ? Number(week) : isoWeekNummer(nu);

  const { van, tot } = weekGrenzen(targetJaar, targetWeek);

  const rows = await db
    .select({
      uren: urenRegistratiesTable,
      gebouwNaam: gebouwenTable.naam,
    })
    .from(urenRegistratiesTable)
    .leftJoin(gebouwenTable, eq(urenRegistratiesTable.gebouwId, gebouwenTable.id))
    .where(
      and(
        eq(urenRegistratiesTable.medewerkerId, mid),
        gte(urenRegistratiesTable.datum, van),
        lte(urenRegistratiesTable.datum, tot)
      )
    )
    .orderBy(urenRegistratiesTable.datum, urenRegistratiesTable.beginTijd);

  const planningItemsRows = await db
    .select({
      item: planningItemsTable,
      gebouwNaam: gebouwenTable.naam,
    })
    .from(planningItemsTable)
    .leftJoin(gebouwenTable, eq(planningItemsTable.gebouwId, gebouwenTable.id))
    .where(
      and(
        eq(planningItemsTable.medewerkerId, mid),
        gte(planningItemsTable.datumStart, van),
        lte(planningItemsTable.datumStart, tot)
      )
    );

  const [medewerker] = await db
    .select({ cao: medewerkersTable.cao, dienstverband: medewerkersTable.dienstverband })
    .from(medewerkersTable)
    .where(eq(medewerkersTable.id, mid))
    .limit(1);

  const totaalUren = rows.reduce((acc, r) => acc + r.uren.nettoUren, 0);
  const advUitkomst = medewerker
    ? berekenAdvVoorMedewerker(medewerker, totaalUren)
    : { adv_uren: 0, adv_reden: "geen medewerkersprofiel" };
  const advUren = advUitkomst.adv_uren;
  const verlof = await verlofVoorWeek(mid, van, tot);

  res.json({
    medewerker_id: mid,
    jaar: targetJaar,
    week_nummer: targetWeek,
    datum_van: van,
    datum_tot: tot,
    uren: rows.map((r) => mapUren(r.uren, { gebouwNaam: r.gebouwNaam })),
    planning_items: planningItemsRows.map((p) => ({
      id: p.item.id,
      datum: p.item.datumStart,
      gebouw_id: p.item.gebouwId ?? null,
      gebouw_naam: p.gebouwNaam ?? null,
      omschrijving: p.item.omschrijving ?? null,
      begin_tijd: p.item.tijdStart ?? null,
      eind_tijd: p.item.tijdEind ?? null,
    })),
    verlof,
    totaal_uren: Math.round(totaalUren * 100) / 100,
    adv_uren: advUren,
    adv_reden: advUitkomst.adv_reden,
    overwerk_grens: overwerkGrens(medewerker?.cao ?? null),
  });
});

// ── POST /uren/tijd-voor-tijd-aanvraag ─────────────────────────────────────────
// Tijd-voor-tijd rechtstreeks vanuit de uren-module aanvragen, zonder dubbele
// invoer: dit maakt een verlofaanvraag tegen de isTijdVoorTijd-verlofsoort van
// de werkgever (fallback: eerste actieve isTijdVoorTijd-verlofsoort zonder
// werkgeverkoppeling). Geen aparte urenregel — de aanvraag verschijnt via
// verlofVoorWeek() in de weekstaat zodra deze is goedgekeurd.
router.post("/uren/tijd-voor-tijd-aanvraag", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const { start_datum, eind_datum, aantal_uren, reden } = req.body;

  if (!start_datum || !eind_datum || aantal_uren == null) {
    return void res.status(400).json({ error: "start_datum, eind_datum en aantal_uren zijn verplicht" });
  }

  const mid = await medewerkerId(userId);
  if (!mid) return void res.status(400).json({ error: "Geen medewerkersprofiel gekoppeld aan dit account" });

  const medewerker = await medewerkerVoorId(mid, db);
  const werkgeverId = medewerker?.werkgeverId ?? null;

  const kandidaten = await db
    .select()
    .from(verlofsoortenTable)
    .where(and(eq(verlofsoortenTable.isTijdVoorTijd, true), eq(verlofsoortenTable.actief, true)));

  const verlofsoort =
    (werkgeverId != null ? kandidaten.find((v) => v.werkgeverId === werkgeverId) : undefined) ??
    kandidaten.find((v) => v.werkgeverId == null) ??
    kandidaten[0];

  if (!verlofsoort) {
    return void res.status(409).json({
      error: "Geen tijd-voor-tijd verlofsoort geconfigureerd. Vraag een beheerder deze aan te maken bij Verlofsoorten.",
    });
  }

  const [a] = await db
    .insert(verlofAanvragenTable)
    .values({
      medewerkerId: mid,
      verlofsoortId: verlofsoort.id,
      startDatum: start_datum,
      eindDatum: eind_datum,
      aantalUren: aantal_uren,
      status: "aangevraagd",
      reden: reden ?? null,
    })
    .returning();

  res.status(201).json({
    id: a.id,
    medewerker_id: a.medewerkerId,
    verlofsoort_id: a.verlofsoortId,
    verlofsoort_naam: verlofsoort.naam,
    start_datum: a.startDatum,
    eind_datum: a.eindDatum,
    aantal_uren: a.aantalUren,
    status: a.status,
    reden: a.reden,
  });
});


// ── UREN_01 §6b: uurcode op de urenregel ─────────────────────────────────────
// Uren op een OPDRACHT vereisen precies één van: een uurcode uit de
// werkbegroting van die opdracht, een actieve indirecte werkzaamheid, of de
// expliciete keuze "staat niet in de begroting" (met korte omschrijving —
// informatie, geen fout: dat wordt een signaal naar de werkvoorbereider).
// Uren zonder opdracht (kantoor, magazijn) kennen geen verplichting; een
// indirecte werkzaamheid mag daar wél gekozen worden.
type UurcodeInvoer = {
  opdrachtId: number | null;
  normtijdId: number | null;
  indirecteId: number | null;
  nietInBegroting: boolean;
  nietInBegrotingOmschrijving: string | null;
};

async function bepaalOpdrachtId(body: Record<string, unknown>, planningItemId: number | null): Promise<number | null> {
  if (body["opdracht_id"] !== undefined) {
    return body["opdracht_id"] ? Number(body["opdracht_id"]) : null;
  }
  if (planningItemId != null) {
    const [pi] = await db.select({ opdrachtId: planningItemsTable.opdrachtId })
      .from(planningItemsTable).where(eq(planningItemsTable.id, planningItemId)).limit(1);
    return pi?.opdrachtId ?? null;
  }
  return null;
}

async function toetsUurcode(inv: UurcodeInvoer): Promise<{ ok: true } | { ok: false; fout: string }> {
  const gekozen = [inv.normtijdId != null, inv.indirecteId != null, inv.nietInBegroting].filter(Boolean).length;
  if (gekozen > 1) {
    return { ok: false, fout: "Kies één werksoort: een uurcode uit de begroting, een indirecte werkzaamheid, óf 'staat niet in de begroting'" };
  }
  if (inv.indirecteId != null) {
    const [iw] = await db.select().from(indirecteWerkzaamhedenTable)
      .where(eq(indirecteWerkzaamhedenTable.id, inv.indirecteId)).limit(1);
    if (!iw) return { ok: false, fout: "Onbekende indirecte werkzaamheid" };
    if (!iw.actief) return { ok: false, fout: `Indirecte werkzaamheid '${iw.naam}' is inactief en kan niet meer gekozen worden` };
  }
  if (inv.opdrachtId == null) return { ok: true };
  if (gekozen === 0) {
    return { ok: false, fout: "Uren op een opdracht vereisen een werksoort: kies een uurcode uit de werkbegroting, een indirecte werkzaamheid, of 'staat niet in de begroting'" };
  }
  if (inv.nietInBegroting && !(inv.nietInBegrotingOmschrijving ?? "").trim()) {
    return { ok: false, fout: "Geef een korte omschrijving van de werkzaamheid die niet in de begroting staat" };
  }
  if (inv.normtijdId != null) {
    const rijen = await db.select({ id: werkbegrotingRegelsTable.id })
      .from(werkbegrotingRegelsTable)
      .innerJoin(projectBegrotingenTable, eq(werkbegrotingRegelsTable.begrotingId, projectBegrotingenTable.id))
      .where(and(
        eq(projectBegrotingenTable.opdrachtId, inv.opdrachtId),
        eq(werkbegrotingRegelsTable.normtijdId, inv.normtijdId)
      )).limit(1);
    if (rijen.length === 0) {
      return { ok: false, fout: "Deze uurcode komt niet voor in de werkbegroting van deze opdracht" };
    }
  }
  return { ok: true };
}

// Signaal naar de werkvoorbereider wanneer werk niet op een begrotingscode past
// — dat betekent meestal meerwerk of een begroting die niet klopt.
async function meldNietInBegroting(regelId: number, opdrachtId: number, medewerkerNaam: string | null, omschrijving: string): Promise<void> {
  const [opdracht] = await db.select({ titel: opdrachtenTable.titel })
    .from(opdrachtenTable).where(eq(opdrachtenTable.id, opdrachtId)).limit(1);
  await meldAanWerkvoorbereiderMetCcProjectleider({
    bron: "uren_niet_in_begroting",
    titel: `Uren buiten de begroting op ${opdracht?.titel ?? `opdracht #${opdrachtId}`}`,
    omschrijving: `${medewerkerNaam ?? "Een medewerker"} schreef uren op werk dat niet op een begrotingscode past: "${omschrijving}". Meestal meerwerk of een begroting die niet klopt.`,
    actiePad: `/opdrachten/${opdrachtId}`,
    herkomstType: "uren_registratie",
    herkomstId: regelId,
    dedupBasis: `uren-niet-in-begroting:${regelId}`,
  });
}

// ── POST /uren ────────────────────────────────────────────────────────────────
router.post("/uren", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  const {
    datum,
    medewerker_id: inputMedId,
    gebouw_id,
    project_id,
    project_naam,
    werkzaamheden,
    werkzaamheid_categorie,
    ruimte,
    object_omschrijving,
    begin_tijd,
    eind_tijd,
    pauze_minuten = 30,
    opmerkingen,
    planning_item_id,
    normtijd_id,
    indirecte_werkzaamheid_id,
    niet_in_begroting,
    niet_in_begroting_omschrijving,
  } = req.body;

  if (!datum || !begin_tijd || !eind_tijd) {
    return void res.status(400).json({ error: "datum, begin_tijd en eind_tijd zijn verplicht" });
  }

  // UREN_01 §6b: uurcode verplicht bij uren op een opdracht.
  const uurcodeOpdrachtId = await bepaalOpdrachtId(req.body, planning_item_id ? Number(planning_item_id) : null);
  const uurcodeInvoer: UurcodeInvoer = {
    opdrachtId: uurcodeOpdrachtId,
    normtijdId: normtijd_id ? Number(normtijd_id) : null,
    indirecteId: indirecte_werkzaamheid_id ? Number(indirecte_werkzaamheid_id) : null,
    nietInBegroting: niet_in_begroting === true,
    nietInBegrotingOmschrijving: niet_in_begroting_omschrijving ?? null,
  };
  const uurcodeToets = await toetsUurcode(uurcodeInvoer);
  if (!uurcodeToets.ok) {
    return void res.status(400).json({ code: "UURCODE_VEREIST", error: uurcodeToets.fout });
  }

  const isManager = req.permissies!.heeftModuleRecht("personeel", 2);
  let mid: number;

  if (inputMedId && isManager) {
    mid = Number(inputMedId);
  } else {
    const eigenId = await medewerkerId(userId);
    if (!eigenId) return void res.status(400).json({ error: "Geen medewerkersprofiel gekoppeld aan dit account" });
    mid = eigenId;
  }

  const nettoUren = berekenNettoUren(begin_tijd, eind_tijd, Number(pauze_minuten));

  if (!isManager && await isWeekVergrendeld(mid, datum)) {
    return void res.status(409).json({ error: "Deze week is vergrendeld door HRM en kan niet worden gewijzigd" });
  }

  // UREN_01 §4: boven de weekgrens alleen op een project met open slot.
  const medewerkerCao = await medewerkerVoorId(mid, db);
  const toets = await toetsOverwerkSlot({
    medewerkerId: mid,
    datum,
    nettoUren,
    projectId: project_id ? Number(project_id) : null,
    cao: medewerkerCao?.cao ?? null,
  });
  if (!toets.toegestaan) {
    return void res.status(422).json({
      code: "OVERWERK_SLOT_DICHT",
      error: toets.weigering,
      boven_uren: toets.boven_uren,
      grens: toets.grens,
      project_id: project_id ? Number(project_id) : null,
    });
  }

  if (toets.slot_id != null && toets.boven_uren > 0) {
    const geboekt = await boekSlotVerbruik(toets.slot_id, toets.boven_uren);
    if (!geboekt) {
      return void res.status(422).json({
        code: "OVERWERK_SLOT_DICHT",
        error: `Het overwerkslot heeft geen ruimte meer binnen het urenplafond (gelijktijdige invoer).`,
        boven_uren: toets.boven_uren,
        grens: toets.grens,
        project_id: project_id ? Number(project_id) : null,
      });
    }
  }

  const [rij] = await db
    .insert(urenRegistratiesTable)
    .values({
      datum,
      medewerkerId: mid,
      gebouwId: gebouw_id ? Number(gebouw_id) : null,
      projectId: project_id ? Number(project_id) : null,
      projectNaam: project_naam ?? null,
      werkzaamheden: werkzaamheden ?? null,
      werkzaamheidCategorie: werkzaamheid_categorie ?? null,
      ruimte: ruimte ?? null,
      objectOmschrijving: object_omschrijving ?? null,
      beginTijd: begin_tijd,
      eindTijd: eind_tijd,
      pauzeMinuten: Number(pauze_minuten),
      nettoUren,
      opmerkingen: opmerkingen ?? null,
      planningItemId: planning_item_id ? Number(planning_item_id) : null,
      opdrachtId: uurcodeOpdrachtId,
      normtijdId: uurcodeInvoer.normtijdId,
      indirecteWerkzaamheidId: uurcodeInvoer.indirecteId,
      nietInBegroting: uurcodeInvoer.nietInBegroting,
      nietInBegrotingOmschrijving: uurcodeInvoer.nietInBegroting ? (niet_in_begroting_omschrijving ?? "").trim() : null,
      aangemaaktDoorId: userId,
      bijgewerktOp: new Date(),
    })
    .returning();

  // §6b: "staat niet in de begroting" is informatie, geen fout → signaal WVB.
  if (uurcodeInvoer.nietInBegroting && uurcodeOpdrachtId != null) {
    const naamRij = await medewerkerVoorId(mid, db);
    await meldNietInBegroting(rij.id, uurcodeOpdrachtId, naamRij?.naam ?? null, (niet_in_begroting_omschrijving ?? "").trim());
  }

  // UREN_01 §5: geaccepteerd overwerk levert een VOORSTEL voor tijd-voor-tijd
  // op — getoond aan de medewerker, nooit stilzwijgend aangemaakt.
  res.status(201).json({
    ...mapUren(rij),
    overwerk: toets.boven_uren > 0 ? {
      boven_uren: toets.boven_uren,
      grens: toets.grens,
      slot_id: toets.slot_id,
      tvt_voorstel: {
        start_datum: datum,
        eind_datum: datum,
        aantal_uren: toets.boven_uren,
        reden: `Overwerk ${datum}${project_naam ? ` op ${project_naam}` : ""} (tijd voor tijd)`,
      },
    } : null,
  });
});

// ── GET /uren/:id ─────────────────────────────────────────────────────────────
router.get("/uren/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const userId = req.session.userId!;


  const [row] = await db
    .select({
      uren: urenRegistratiesTable,
      medewerkerNaam: medewerkersTable.naam,
      gebouwNaam: gebouwenTable.naam,
    })
    .from(urenRegistratiesTable)
    .leftJoin(medewerkersTable, eq(urenRegistratiesTable.medewerkerId, medewerkersTable.id))
    .leftJoin(gebouwenTable, eq(urenRegistratiesTable.gebouwId, gebouwenTable.id))
    .where(eq(urenRegistratiesTable.id, id))
    .limit(1);

  if (!row) return void res.status(404).json({ error: "Niet gevonden" });

  const eigenId = await medewerkerId(userId);
  const isManager = req.permissies!.heeftModuleRecht("personeel", 1);
  if (!isManager && row.uren.medewerkerId !== eigenId) {
    return void res.status(403).json({ error: "Geen toegang" });
  }

  res.json(mapUren(row.uren, { medewerkerNaam: row.medewerkerNaam, gebouwNaam: row.gebouwNaam }));
});

// ── PATCH /uren/:id ───────────────────────────────────────────────────────────
router.patch("/uren/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const userId = req.session.userId!;


  const [bestaand] = await db
    .select()
    .from(urenRegistratiesTable)
    .where(eq(urenRegistratiesTable.id, id))
    .limit(1);

  if (!bestaand) return void res.status(404).json({ error: "Niet gevonden" });

  const eigenId = await medewerkerId(userId);
  const isManager = req.permissies!.heeftModuleRecht("personeel", 2);
  if (!isManager && bestaand.medewerkerId !== eigenId) {
    return void res.status(403).json({ error: "Geen toegang" });
  }

  if (bestaand.status === "goedgekeurd" && !isManager) {
    return void res.status(409).json({ error: "Goedgekeurde uren kunnen niet worden gewijzigd" });
  }

  if (!isManager && await isWeekVergrendeld(bestaand.medewerkerId, bestaand.datum)) {
    return void res.status(409).json({ error: "Deze week is vergrendeld door HRM en kan niet worden gewijzigd" });
  }

  const {
    datum,
    gebouw_id,
    project_id,
    project_naam,
    werkzaamheden,
    werkzaamheid_categorie,
    ruimte,
    object_omschrijving,
    begin_tijd,
    eind_tijd,
    pauze_minuten,
    opmerkingen,
    normtijd_id,
    indirecte_werkzaamheid_id,
    niet_in_begroting,
    niet_in_begroting_omschrijving,
  } = req.body;

  // UREN_01 §6b: ook een wijziging moet de uurcode-eis blijven halen.
  const patchOpdrachtId = req.body["opdracht_id"] !== undefined || req.body["planning_item_id"] !== undefined
    ? await bepaalOpdrachtId(req.body, req.body["planning_item_id"] !== undefined
        ? (req.body["planning_item_id"] ? Number(req.body["planning_item_id"]) : null)
        : bestaand.planningItemId)
    : bestaand.opdrachtId;
  const patchUurcode: UurcodeInvoer = {
    opdrachtId: patchOpdrachtId,
    normtijdId: normtijd_id !== undefined ? (normtijd_id ? Number(normtijd_id) : null) : bestaand.normtijdId,
    indirecteId: indirecte_werkzaamheid_id !== undefined ? (indirecte_werkzaamheid_id ? Number(indirecte_werkzaamheid_id) : null) : bestaand.indirecteWerkzaamheidId,
    nietInBegroting: niet_in_begroting !== undefined ? niet_in_begroting === true : bestaand.nietInBegroting,
    nietInBegrotingOmschrijving: niet_in_begroting_omschrijving !== undefined ? (niet_in_begroting_omschrijving ?? null) : bestaand.nietInBegrotingOmschrijving,
  };
  const patchUurcodeToets = await toetsUurcode(patchUurcode);
  if (!patchUurcodeToets.ok) {
    return void res.status(400).json({ code: "UURCODE_VEREIST", error: patchUurcodeToets.fout });
  }

  const nieuwBegin = begin_tijd ?? bestaand.beginTijd;
  const nieuwEind = eind_tijd ?? bestaand.eindTijd;
  const nieuwPauze = pauze_minuten !== undefined ? Number(pauze_minuten) : bestaand.pauzeMinuten;
  const nettoUren = berekenNettoUren(nieuwBegin, nieuwEind, nieuwPauze);

  // UREN_01 §4: ook een wijziging mag niet ongetoetst boven de weekgrens uitkomen.
  const patchProjectId = project_id !== undefined
    ? (project_id ? Number(project_id) : null)
    : bestaand.projectId;
  const patchMedewerker = await medewerkerVoorId(bestaand.medewerkerId, db);
  const patchToets = await toetsOverwerkSlot({
    medewerkerId: bestaand.medewerkerId,
    datum: datum ?? bestaand.datum,
    nettoUren,
    projectId: patchProjectId,
    cao: patchMedewerker?.cao ?? null,
    negeerRegistratieId: bestaand.id,
  });
  if (!patchToets.toegestaan) {
    return void res.status(422).json({
      code: "OVERWERK_SLOT_DICHT",
      error: patchToets.weigering,
      boven_uren: patchToets.boven_uren,
      grens: patchToets.grens,
      project_id: patchProjectId,
    });
  }
  // Bij een wijziging wordt alleen de TOENAME van het boven-grensdeel op het
  // slot bijgeboekt: het oude boven-deel van deze regel is bij de eerdere
  // POST/PATCH al verbruikt. Ongewijzigd opslaan boekt zo niets dubbel.
  // Afname wordt bewust niet teruggegeven (conservatief: plafond kan hooguit
  // strenger uitvallen, nooit stilzwijgend ruimer).
  const oudeToets = await toetsOverwerkSlot({
    medewerkerId: bestaand.medewerkerId,
    datum: bestaand.datum,
    nettoUren: bestaand.nettoUren,
    projectId: bestaand.projectId,
    cao: patchMedewerker?.cao ?? null,
    negeerRegistratieId: bestaand.id,
  });
  const bovenDelta = patchToets.boven_uren - (oudeToets.toegestaan ? oudeToets.boven_uren : 0);
  if (patchToets.slot_id != null && bovenDelta > 0) {
    const geboekt = await boekSlotVerbruik(patchToets.slot_id, bovenDelta);
    if (!geboekt) {
      return void res.status(422).json({
        code: "OVERWERK_SLOT_DICHT",
        error: "Het overwerkslot heeft geen ruimte meer binnen het urenplafond.",
        boven_uren: patchToets.boven_uren,
        grens: patchToets.grens,
        project_id: patchProjectId,
      });
    }
  }

  const [rij] = await db
    .update(urenRegistratiesTable)
    .set({
      datum: datum ?? bestaand.datum,
      gebouwId: gebouw_id !== undefined ? (gebouw_id ? Number(gebouw_id) : null) : bestaand.gebouwId,
      projectId: project_id !== undefined ? (project_id ? Number(project_id) : null) : bestaand.projectId,
      projectNaam: project_naam !== undefined ? project_naam : bestaand.projectNaam,
      werkzaamheden: werkzaamheden !== undefined ? werkzaamheden : bestaand.werkzaamheden,
      werkzaamheidCategorie: werkzaamheid_categorie !== undefined ? werkzaamheid_categorie : bestaand.werkzaamheidCategorie,
      ruimte: ruimte !== undefined ? ruimte : bestaand.ruimte,
      objectOmschrijving: object_omschrijving !== undefined ? object_omschrijving : bestaand.objectOmschrijving,
      beginTijd: nieuwBegin,
      eindTijd: nieuwEind,
      pauzeMinuten: nieuwPauze,
      nettoUren,
      opmerkingen: opmerkingen !== undefined ? opmerkingen : bestaand.opmerkingen,
      opdrachtId: patchOpdrachtId,
      normtijdId: patchUurcode.normtijdId,
      indirecteWerkzaamheidId: patchUurcode.indirecteId,
      nietInBegroting: patchUurcode.nietInBegroting,
      nietInBegrotingOmschrijving: patchUurcode.nietInBegroting ? patchUurcode.nietInBegrotingOmschrijving : null,
      bijgewerktOp: new Date(),
    })
    .where(eq(urenRegistratiesTable.id, id))
    .returning();

  // §6b: alleen melden wanneer de keuze "niet in begroting" NIEUW is.
  if (patchUurcode.nietInBegroting && !bestaand.nietInBegroting && patchOpdrachtId != null) {
    const naamRij = await medewerkerVoorId(bestaand.medewerkerId, db);
    await meldNietInBegroting(rij.id, patchOpdrachtId, naamRij?.naam ?? null, (patchUurcode.nietInBegrotingOmschrijving ?? "").trim());
  }

  res.json(mapUren(rij));
});

// ── DELETE /uren/:id ──────────────────────────────────────────────────────────
router.delete("/uren/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const userId = req.session.userId!;


  const [bestaand] = await db
    .select()
    .from(urenRegistratiesTable)
    .where(eq(urenRegistratiesTable.id, id))
    .limit(1);

  if (!bestaand) return void res.status(404).json({ error: "Niet gevonden" });

  const eigenId = await medewerkerId(userId);
  const isManager = req.permissies!.heeftModuleRecht("personeel", 2);
  if (!isManager && bestaand.medewerkerId !== eigenId) {
    return void res.status(403).json({ error: "Geen toegang" });
  }

  if (bestaand.status === "goedgekeurd" && !isManager) {
    return void res.status(409).json({ error: "Goedgekeurde uren kunnen niet worden verwijderd" });
  }

  if (!isManager && await isWeekVergrendeld(bestaand.medewerkerId, bestaand.datum)) {
    return void res.status(409).json({ error: "Deze week is vergrendeld door HRM en kan niet worden gewijzigd" });
  }

  await db.delete(urenRegistratiesTable).where(eq(urenRegistratiesTable.id, id));
  res.status(204).end();
});

// ── GET /weekstaten ───────────────────────────────────────────────────────────
router.get("/weekstaten", requireAuth, async (req, res): Promise<void> => {
  const { medewerker_id, jaar, week, status } = req.query as Record<string, string | undefined>;
  const userId = req.session.userId!;

  const isManager = req.permissies!.heeftModuleRecht("personeel", 1);

  let eigenId: number | null = null;
  if (!isManager) {
    eigenId = await medewerkerId(userId);
    if (!eigenId) return void res.json([]);
  }

  const filters = [];
  if (eigenId) filters.push(eq(weekStatenTable.medewerkerId, eigenId));
  else if (medewerker_id) filters.push(eq(weekStatenTable.medewerkerId, Number(medewerker_id)));
  if (jaar) filters.push(eq(weekStatenTable.jaar, Number(jaar)));
  if (week) filters.push(eq(weekStatenTable.weekNummer, Number(week)));
  if (status) filters.push(eq(weekStatenTable.status, status));

  const rows = await db
    .select({
      ws: weekStatenTable,
      medewerkerNaam: medewerkersTable.naam,
    })
    .from(weekStatenTable)
    .leftJoin(medewerkersTable, eq(weekStatenTable.medewerkerId, medewerkersTable.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(weekStatenTable.jaar), desc(weekStatenTable.weekNummer));

  res.json(rows.map((r) => mapWeekStaat(r.ws, { medewerkerNaam: r.medewerkerNaam })));
});

// ── POST /weekstaten ──────────────────────────────────────────────────────────
router.post("/weekstaten", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  const { medewerker_id: inputMedId, jaar, week_nummer, notities } = req.body;

  if (!jaar || !week_nummer) {
    return void res.status(400).json({ error: "jaar en week_nummer zijn verplicht" });
  }

  const isManager = req.permissies!.heeftModuleRecht("personeel", 2);
  let mid: number;
  if (inputMedId && isManager) {
    mid = Number(inputMedId);
  } else {
    const eigenId = await medewerkerId(userId);
    if (!eigenId) return void res.status(400).json({ error: "Geen medewerkersprofiel gekoppeld" });
    mid = eigenId;
  }

  const [bestaand] = await db
    .select()
    .from(weekStatenTable)
    .where(
      and(
        eq(weekStatenTable.medewerkerId, mid),
        eq(weekStatenTable.jaar, Number(jaar)),
        eq(weekStatenTable.weekNummer, Number(week_nummer))
      )
    )
    .limit(1);

  if (bestaand) return void res.status(409).json({ error: "Weekstaat bestaat al voor deze week" });

  const { van, tot } = weekGrenzen(Number(jaar), Number(week_nummer));
  const urenRows = await db
    .select({ nettoUren: urenRegistratiesTable.nettoUren })
    .from(urenRegistratiesTable)
    .where(
      and(
        eq(urenRegistratiesTable.medewerkerId, mid),
        gte(urenRegistratiesTable.datum, van),
        lte(urenRegistratiesTable.datum, tot)
      )
    );

  const [medewerker] = await db
    .select({ cao: medewerkersTable.cao, dienstverband: medewerkersTable.dienstverband })
    .from(medewerkersTable)
    .where(eq(medewerkersTable.id, mid))
    .limit(1);

  const totaalUren = urenRows.reduce((acc, r) => acc + r.nettoUren, 0);
  const advUren = medewerker ? berekenAdv(medewerker, totaalUren) : 0;

  const [rij] = await db
    .insert(weekStatenTable)
    .values({
      medewerkerId: mid,
      jaar: Number(jaar),
      weekNummer: Number(week_nummer),
      totaalUren: Math.round(totaalUren * 100) / 100,
      advUren,
      notities: notities ?? null,
      aangemaaktDoorId: userId,
      bijgewerktOp: new Date(),
    })
    .returning();

  res.status(201).json(mapWeekStaat(rij));
});

// ── GET /weekstaten/:id ───────────────────────────────────────────────────────
router.get("/weekstaten/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const userId = req.session.userId!;


  const [row] = await db
    .select({
      ws: weekStatenTable,
      medewerkerNaam: medewerkersTable.naam,
      medewerkerBsn: sql<string | null>`${medewerkersTable}.bsn`,
      medewerkerGeboortedatum: medewerkersTable.geboortedatum,
      goedgekeurdDoorNaam: gebruikersTable.naam,
    })
    .from(weekStatenTable)
    .leftJoin(medewerkersTable, eq(weekStatenTable.medewerkerId, medewerkersTable.id))
    .leftJoin(gebruikersTable, eq(weekStatenTable.goedgekeurdDoorId, gebruikersTable.id))
    .where(eq(weekStatenTable.id, id))
    .limit(1);

  if (!row) return void res.status(404).json({ error: "Niet gevonden" });

  const eigenId = await medewerkerId(userId);
  const isManager = req.permissies!.heeftModuleRecht("personeel", 1);
  if (!isManager && row.ws.medewerkerId !== eigenId) {
    return void res.status(403).json({ error: "Geen toegang" });
  }

  const { van, tot } = weekGrenzen(row.ws.jaar, row.ws.weekNummer);
  const urenRows = await db
    .select({
      uren: urenRegistratiesTable,
      gebouwNaam: gebouwenTable.naam,
    })
    .from(urenRegistratiesTable)
    .leftJoin(gebouwenTable, eq(urenRegistratiesTable.gebouwId, gebouwenTable.id))
    .where(
      and(
        eq(urenRegistratiesTable.medewerkerId, row.ws.medewerkerId),
        gte(urenRegistratiesTable.datum, van),
        lte(urenRegistratiesTable.datum, tot)
      )
    )
    .orderBy(urenRegistratiesTable.datum, urenRegistratiesTable.beginTijd);

  const verlof = await verlofVoorWeek(row.ws.medewerkerId, van, tot);

  res.json({
    ...mapWeekStaat(row.ws, {
      medewerkerNaam: row.medewerkerNaam,
      goedgekeurdDoorNaam: row.goedgekeurdDoorNaam,
    }),
    medewerker_bsn: row.medewerkerBsn,
    medewerker_geboortedatum: row.medewerkerGeboortedatum,
    datum_van: van,
    datum_tot: tot,
    uren: urenRows.map((r) => mapUren(r.uren, { gebouwNaam: r.gebouwNaam })),
    verlof,
  });
});

// ── PATCH /weekstaten/:id ─────────────────────────────────────────────────────
router.patch("/weekstaten/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { notities } = req.body;

  const [rij] = await db
    .update(weekStatenTable)
    .set({ notities: notities ?? null, bijgewerktOp: new Date() })
    .where(eq(weekStatenTable.id, id))
    .returning();

  if (!rij) return void res.status(404).json({ error: "Niet gevonden" });
  res.json(mapWeekStaat(rij));
});

// ── POST /weekstaten/:id/indienen ─────────────────────────────────────────────
router.post("/weekstaten/:id/indienen", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const userId = req.session.userId!;


  const [bestaand] = await db.select().from(weekStatenTable).where(eq(weekStatenTable.id, id)).limit(1);
  if (!bestaand) return void res.status(404).json({ error: "Niet gevonden" });

  const eigenId = await medewerkerId(userId);
  const isManager = req.permissies!.heeftModuleRecht("personeel", 2);
  if (!isManager && bestaand.medewerkerId !== eigenId) {
    return void res.status(403).json({ error: "Geen toegang" });
  }

  if (bestaand.status !== "concept" && bestaand.status !== "afgewezen") {
    return void res.status(409).json({ error: "Weekstaat is al ingediend of goedgekeurd" });
  }

  const { van, tot } = weekGrenzen(bestaand.jaar, bestaand.weekNummer);
  const urenRows = await db
    .select({ nettoUren: urenRegistratiesTable.nettoUren })
    .from(urenRegistratiesTable)
    .where(
      and(
        eq(urenRegistratiesTable.medewerkerId, bestaand.medewerkerId),
        gte(urenRegistratiesTable.datum, van),
        lte(urenRegistratiesTable.datum, tot)
      )
    );

  const [medewerker] = await db
    .select({ cao: medewerkersTable.cao, dienstverband: medewerkersTable.dienstverband })
    .from(medewerkersTable)
    .where(eq(medewerkersTable.id, bestaand.medewerkerId))
    .limit(1);

  const totaalUren = urenRows.reduce((acc, r) => acc + r.nettoUren, 0);
  const advUren = medewerker ? berekenAdv(medewerker, totaalUren) : 0;

  await db
    .update(urenRegistratiesTable)
    .set({ status: "ingediend", ingediendOp: new Date(), bijgewerktOp: new Date() })
    .where(
      and(
        eq(urenRegistratiesTable.medewerkerId, bestaand.medewerkerId),
        gte(urenRegistratiesTable.datum, van),
        lte(urenRegistratiesTable.datum, tot),
        eq(urenRegistratiesTable.status, "concept")
      )
    );

  const [rij] = await db
    .update(weekStatenTable)
    .set({
      status: "ingediend",
      totaalUren: Math.round(totaalUren * 100) / 100,
      advUren,
      ingediendOp: new Date(),
      afwijzingReden: null,
      bijgewerktOp: new Date(),
    })
    .where(eq(weekStatenTable.id, id))
    .returning();

  res.json(mapWeekStaat(rij));
});

// ── POST /weekstaten/:id/goedkeuren ───────────────────────────────────────────
router.post("/weekstaten/:id/goedkeuren", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const userId = req.session.userId!;


  const isManager = req.permissies!.heeftModuleRecht("personeel", 2);
  if (!isManager) return void res.status(403).json({ error: "Geen bevoegdheid" });

  const [bestaand] = await db.select().from(weekStatenTable).where(eq(weekStatenTable.id, id)).limit(1);
  if (!bestaand) return void res.status(404).json({ error: "Niet gevonden" });

  if (bestaand.status !== "ingediend") {
    return void res.status(409).json({ error: "Weekstaat is niet ingediend" });
  }

  const { van, tot } = weekGrenzen(bestaand.jaar, bestaand.weekNummer);

  await db
    .update(urenRegistratiesTable)
    .set({ status: "goedgekeurd", goedgekeurdDoorId: userId, goedgekeurdOp: new Date(), bijgewerktOp: new Date() })
    .where(
      and(
        eq(urenRegistratiesTable.medewerkerId, bestaand.medewerkerId),
        gte(urenRegistratiesTable.datum, van),
        lte(urenRegistratiesTable.datum, tot),
        eq(urenRegistratiesTable.status, "ingediend")
      )
    );

  const [rij] = await db
    .update(weekStatenTable)
    .set({
      status: "goedgekeurd",
      goedgekeurdDoorId: userId,
      goedgekeurdOp: new Date(),
      bijgewerktOp: new Date(),
    })
    .where(eq(weekStatenTable.id, id))
    .returning();

  res.json(mapWeekStaat(rij));
});

// ── POST /weekstaten/:id/afwijzen ─────────────────────────────────────────────
router.post("/weekstaten/:id/afwijzen", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const userId = req.session.userId!;

  const { reden } = req.body;

  const isManager = req.permissies!.heeftModuleRecht("personeel", 2);
  if (!isManager) return void res.status(403).json({ error: "Geen bevoegdheid" });

  if (!reden) return void res.status(400).json({ error: "reden is verplicht" });

  const [bestaand] = await db.select().from(weekStatenTable).where(eq(weekStatenTable.id, id)).limit(1);
  if (!bestaand) return void res.status(404).json({ error: "Niet gevonden" });

  if (bestaand.status !== "ingediend") {
    return void res.status(409).json({ error: "Weekstaat is niet ingediend" });
  }

  const { van, tot } = weekGrenzen(bestaand.jaar, bestaand.weekNummer);

  await db
    .update(urenRegistratiesTable)
    .set({ status: "afgewezen", afgewezen: true, afwijzingReden: reden, bijgewerktOp: new Date() })
    .where(
      and(
        eq(urenRegistratiesTable.medewerkerId, bestaand.medewerkerId),
        gte(urenRegistratiesTable.datum, van),
        lte(urenRegistratiesTable.datum, tot),
        eq(urenRegistratiesTable.status, "ingediend")
      )
    );

  const [rij] = await db
    .update(weekStatenTable)
    .set({
      status: "afgewezen",
      afwijzingReden: reden,
      bijgewerktOp: new Date(),
    })
    .where(eq(weekStatenTable.id, id))
    .returning();

  res.json(mapWeekStaat(rij));
});

// ── POST /weekstaten/:id/vergrendelen ─────────────────────────────────────────
router.post("/weekstaten/:id/vergrendelen", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const userId = req.session.userId!;


  const isManager = req.permissies!.heeftModuleRecht("personeel", 2);
  if (!isManager) return void res.status(403).json({ error: "Geen bevoegdheid" });

  const [bestaand] = await db.select().from(weekStatenTable).where(eq(weekStatenTable.id, id)).limit(1);
  if (!bestaand) return void res.status(404).json({ error: "Niet gevonden" });

  const vergrendeldDoor = await db
    .select({ naam: gebruikersTable.naam })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.id, userId))
    .limit(1);

  const [rij] = await db
    .update(weekStatenTable)
    .set({ vergrendeld: true, vergrendeldOp: new Date(), vergrendeldDoorId: userId, bijgewerktOp: new Date() })
    .where(eq(weekStatenTable.id, id))
    .returning();

  res.json(mapWeekStaat(rij, { vergrendeldDoorNaam: vergrendeldDoor[0]?.naam ?? null }));
});

// ── POST /weekstaten/:id/ontgrendelen ─────────────────────────────────────────
router.post("/weekstaten/:id/ontgrendelen", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const userId = req.session.userId!;


  const isManager = req.permissies!.heeftModuleRecht("personeel", 2);
  if (!isManager) return void res.status(403).json({ error: "Geen bevoegdheid" });

  const [bestaand] = await db.select().from(weekStatenTable).where(eq(weekStatenTable.id, id)).limit(1);
  if (!bestaand) return void res.status(404).json({ error: "Niet gevonden" });

  const [rij] = await db
    .update(weekStatenTable)
    .set({ vergrendeld: false, vergrendeldOp: null, vergrendeldDoorId: null, bijgewerktOp: new Date() })
    .where(eq(weekStatenTable.id, id))
    .returning();

  res.json(mapWeekStaat(rij));
});


// ═══════════════════════════════════════════════════════════════════════════
// UREN_01 §4 — Overwerkslot per project
// Openzetten mag alleen door de projectleider en René (hoofdbeheerder) —
// besloten door René, 9 aug 2026. Altijd met einde; plafond optioneel.
// ═══════════════════════════════════════════════════════════════════════════

async function isProjectleiderOfHoofdbeheerder(req: import("express").Request): Promise<boolean> {
  if (req.permissies?.isHoofdbeheerder) return true;
  const userId = req.session.userId!;
  const [rij] = await db
    .select({ id: gebruikersTable.id })
    .from(gebruikersTable)
    .where(sql`${gebruikersTable.id} = ${userId} AND ${sql.raw("functietitels")} @> ARRAY['Projectleider']::text[]`);
  return !!rij;
}

function mapSlot(s: typeof overwerkSlotenTable.$inferSelect, extra?: { geopendDoorNaam?: string | null }) {
  return {
    id: s.id,
    project_id: s.projectId,
    status: s.status,
    geldig_van: s.geldigVan,
    geldig_tot: s.geldigTot,
    uren_plafond: s.urenPlafond,
    verbruikte_uren: s.verbruikteUren,
    reden: s.reden,
    motivatie_aanvraag: s.motivatieAanvraag,
    geopend_door_id: s.geopendDoorId,
    geopend_door_naam: extra?.geopendDoorNaam ?? null,
    geopend_op: s.geopendOp?.toISOString() ?? null,
    gesloten_op: s.geslotenOp?.toISOString() ?? null,
    aangevraagd_op: s.aangevraagdOp?.toISOString() ?? null,
  };
}

// Huidige en recente sloten van een project — leesbaar voor iedere ingelogde
// urenschrijver zodat de app kan tonen of het slot openstaat.
router.get("/projecten/:id/overwerkslot", requireAuth, async (req, res): Promise<void> => {
  const projectId = Number(req.params.id);
  const rows = await db
    .select({ slot: overwerkSlotenTable, geopendDoorNaam: gebruikersTable.naam })
    .from(overwerkSlotenTable)
    .leftJoin(gebruikersTable, eq(overwerkSlotenTable.geopendDoorId, gebruikersTable.id))
    .where(eq(overwerkSlotenTable.projectId, projectId))
    .orderBy(desc(overwerkSlotenTable.id));
  const vandaag = new Date().toISOString().slice(0, 10);
  const open = rows.find((r) =>
    r.slot.status === "open" && r.slot.geldigVan != null && r.slot.geldigTot != null &&
    vandaag >= r.slot.geldigVan && vandaag <= r.slot.geldigTot);
  res.json({
    open_slot: open ? mapSlot(open.slot, { geopendDoorNaam: open.geopendDoorNaam }) : null,
    sloten: rows.slice(0, 20).map((r) => mapSlot(r.slot, { geopendDoorNaam: r.geopendDoorNaam })),
  });
});

// Openzetten: einde verplicht (default: zondag van de lopende week bepaalt de
// client), reden verplicht (één regel), plafond optioneel. Wie/wanneer/waarom
// wordt vastgelegd. Achteraf openzetten mag, maar is daardoor zichtbaar.
router.post("/projecten/:id/overwerkslot/openen", requireAuth, async (req, res): Promise<void> => {
  if (!(await isProjectleiderOfHoofdbeheerder(req))) {
    return void res.status(403).json({ error: "Alleen de projectleider of de hoofdbeheerder kan het overwerkslot openzetten" });
  }
  const projectId = Number(req.params.id);
  const { geldig_van, geldig_tot, uren_plafond, reden, aanvraag_id } = req.body ?? {};
  if (!geldig_tot) return void res.status(400).json({ error: "Een slot zonder einddatum bestaat niet: geldig_tot is verplicht" });
  if (!reden || !String(reden).trim()) return void res.status(400).json({ error: "Een reden (één regel) is verplicht bij het openzetten" });

  const [project] = await db.select({ id: projectenTable.id }).from(projectenTable).where(eq(projectenTable.id, projectId)).limit(1);
  if (!project) return void res.status(404).json({ error: "Project niet gevonden" });

  const vandaag = new Date().toISOString().slice(0, 10);
  const van = typeof geldig_van === "string" && geldig_van ? geldig_van : vandaag;
  if (String(geldig_tot) < van) return void res.status(400).json({ error: "geldig_tot ligt vóór geldig_van" });

  const userId = req.session.userId!;
  if (aanvraag_id) {
    // Toestemming-aanvraag omzetten naar een open slot.
    const [aanvraag] = await db.select().from(overwerkSlotenTable)
      .where(and(eq(overwerkSlotenTable.id, Number(aanvraag_id)), eq(overwerkSlotenTable.projectId, projectId))).limit(1);
    if (!aanvraag || aanvraag.status !== "aangevraagd") {
      return void res.status(409).json({ error: "Aanvraag niet gevonden of al behandeld" });
    }
    const [rij] = await db.update(overwerkSlotenTable)
      .set({ status: "open", geldigVan: van, geldigTot: String(geldig_tot),
             urenPlafond: uren_plafond != null ? Number(uren_plafond) : null,
             reden: String(reden).trim(), geopendDoorId: userId, geopendOp: new Date(), bijgewerktOp: new Date() })
      .where(eq(overwerkSlotenTable.id, aanvraag.id)).returning();
    return void res.status(200).json(mapSlot(rij));
  }

  const [rij] = await db.insert(overwerkSlotenTable).values({
    projectId, status: "open", geldigVan: van, geldigTot: String(geldig_tot),
    urenPlafond: uren_plafond != null ? Number(uren_plafond) : null,
    reden: String(reden).trim(), geopendDoorId: userId, geopendOp: new Date(), bijgewerktOp: new Date(),
  }).returning();
  res.status(201).json(mapSlot(rij));
});

router.post("/projecten/:id/overwerkslot/sluiten", requireAuth, async (req, res): Promise<void> => {
  if (!(await isProjectleiderOfHoofdbeheerder(req))) {
    return void res.status(403).json({ error: "Alleen de projectleider of de hoofdbeheerder kan het overwerkslot sluiten" });
  }
  const projectId = Number(req.params.id);
  const userId = req.session.userId!;
  const rijen = await db.update(overwerkSlotenTable)
    .set({ status: "gesloten", geslotenDoorId: userId, geslotenOp: new Date(), bijgewerktOp: new Date() })
    .where(and(eq(overwerkSlotenTable.projectId, projectId), eq(overwerkSlotenTable.status, "open")))
    .returning();
  res.json({ gesloten: rijen.length });
});

// UREN_01 §4.3 — de monteur die boven de grens uitkomt vraagt met één
// handeling toestemming; de vraag landt bij de projectleider en bij René.
router.post("/projecten/:id/overwerk-toestemming", requireAuth, async (req, res): Promise<void> => {
  const projectId = Number(req.params.id);
  const userId = req.session.userId!;
  const { datum, uren, toelichting } = req.body ?? {};
  if (!datum || uren == null) return void res.status(400).json({ error: "datum en uren zijn verplicht" });

  const [project] = await db.select({ id: projectenTable.id, titel: projectenTable.naam })
    .from(projectenTable).where(eq(projectenTable.id, projectId)).limit(1);
  if (!project) return void res.status(404).json({ error: "Project niet gevonden" });

  const [aanvraag] = await db.insert(overwerkSlotenTable).values({
    projectId, status: "aangevraagd",
    aangevraagdDoorId: userId, aangevraagdOp: new Date(),
    motivatieAanvraag: `${uren} uur overwerk op ${datum}${toelichting ? ` — ${String(toelichting).trim()}` : ""}`,
    bijgewerktOp: new Date(),
  }).returning();

  const [naamRij] = await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, userId)).limit(1);
  const titel = `Overwerk-toestemming gevraagd: ${naamRij?.naam ?? "medewerker"} — ${project.titel ?? `project ${projectId}`}`;
  const omschrijving = `${naamRij?.naam ?? "Een medewerker"} vraagt toestemming voor ${uren} uur boven de weekgrens op ${datum}.${toelichting ? ` Toelichting: ${String(toelichting).trim()}` : ""} Zet het overwerkslot open (altijd met einddatum) of wijs de vraag af.`;

  // Doen-item bij elke projectleider; René (hoofdbeheerder) krijgt hem ook als doen-item.
  const plIds = await vindGebruikersMetFunctietitel("Projectleider");
  let geplaatst = 0;
  for (const plId of plIds) {
    if (await meldWerkbakItem({
      soort: "doen", bron: "overwerk_toestemming", titel, omschrijving,
      gebruikerId: plId, gewicht: 55, actiePad: `/projecten`,
      herkomstType: "overwerk_slot", herkomstId: aanvraag.id,
      dedupSleutel: `overwerk_toestemming:${aanvraag.id}:pl:${plId}`,
    })) geplaatst++;
  }
  if (await meldWerkbakItem({
    soort: "doen", bron: "overwerk_toestemming", titel, omschrijving,
    alleenHoofdbeheerder: true, gewicht: 55, actiePad: `/projecten`,
    herkomstType: "overwerk_slot", herkomstId: aanvraag.id,
    dedupSleutel: `overwerk_toestemming:${aanvraag.id}:hb`,
  })) geplaatst++;

  res.status(201).json({ id: aanvraag.id, status: aanvraag.status, meldingen_geplaatst: geplaatst });
});


// ── UREN_01 §6b: uurcodes & indirecte werkzaamheden ──────────────────────────

// Keuzelijst voor uren op een opdracht: de uurcodes uit de werkbegroting van
// DIE opdracht (niet de hele normtijdenlijst) + de actieve indirecte
// werkzaamheden als aparte groep.
router.get("/opdrachten/:id/uurcodes", requireBevoegdheid("projecten", 1), async (req, res): Promise<void> => {
  const opdrachtId = Number(req.params.id);
  if (!Number.isFinite(opdrachtId)) return void res.status(400).json({ error: "Ongeldige opdracht-id" });
  const begrotingsCodes = await db
    .selectDistinct({
      normtijd_id: werkbegrotingRegelsTable.normtijdId,
      code: modCalcNormtijdenTable.code,
      omschrijving: modCalcNormtijdenTable.omschrijving,
      eenheid: modCalcNormtijdenTable.eenheid,
    })
    .from(werkbegrotingRegelsTable)
    .innerJoin(projectBegrotingenTable, eq(werkbegrotingRegelsTable.begrotingId, projectBegrotingenTable.id))
    .innerJoin(modCalcNormtijdenTable, eq(werkbegrotingRegelsTable.normtijdId, modCalcNormtijdenTable.id))
    .where(eq(projectBegrotingenTable.opdrachtId, opdrachtId));
  const indirect = await db.select().from(indirecteWerkzaamhedenTable)
    .where(eq(indirecteWerkzaamhedenTable.actief, true))
    .orderBy(indirecteWerkzaamhedenTable.volgorde, indirecteWerkzaamhedenTable.naam);
  res.json({
    begroting: begrotingsCodes
      .filter((c) => c.normtijd_id != null)
      .sort((a, b) => (a.code ?? "").localeCompare(b.code ?? "")),
    indirect: indirect.map((i) => ({ id: i.id, naam: i.naam })),
  });
});

// Begroot tegenover geschreven per uurcode — nacalculatie op werksoort.
router.get("/opdrachten/:id/uren-per-uurcode", requireBevoegdheid("projecten", 1), async (req, res): Promise<void> => {
  const opdrachtId = Number(req.params.id);
  if (!Number.isFinite(opdrachtId)) return void res.status(400).json({ error: "Ongeldige opdracht-id" });

  // Begroot: hoeveelheid × uren_per_eenheid per uurcode uit de werkbegroting.
  const begroot = await db
    .select({
      normtijd_id: werkbegrotingRegelsTable.normtijdId,
      code: modCalcNormtijdenTable.code,
      omschrijving: modCalcNormtijdenTable.omschrijving,
      uren: sql<number>`coalesce(sum(${werkbegrotingRegelsTable.hoeveelheid} * ${modCalcNormtijdenTable.urenPerEenheid}), 0)`,
    })
    .from(werkbegrotingRegelsTable)
    .innerJoin(projectBegrotingenTable, eq(werkbegrotingRegelsTable.begrotingId, projectBegrotingenTable.id))
    .innerJoin(modCalcNormtijdenTable, eq(werkbegrotingRegelsTable.normtijdId, modCalcNormtijdenTable.id))
    .where(eq(projectBegrotingenTable.opdrachtId, opdrachtId))
    .groupBy(werkbegrotingRegelsTable.normtijdId, modCalcNormtijdenTable.code, modCalcNormtijdenTable.omschrijving);

  // Geschreven: netto-uren per uurcode op deze opdracht.
  const geschreven = await db
    .select({
      normtijd_id: urenRegistratiesTable.normtijdId,
      uren: sql<number>`coalesce(sum(${urenRegistratiesTable.nettoUren}), 0)`,
    })
    .from(urenRegistratiesTable)
    .where(eq(urenRegistratiesTable.opdrachtId, opdrachtId))
    .groupBy(urenRegistratiesTable.normtijdId);
  const geschrevenPerCode = new Map(geschreven.map((g) => [g.normtijd_id, Number(g.uren)]));

  const codes = begroot.map((b) => ({
    normtijd_id: b.normtijd_id,
    code: b.code,
    omschrijving: b.omschrijving,
    begroot_uren: Math.round(Number(b.uren) * 100) / 100,
    geschreven_uren: Math.round((geschrevenPerCode.get(b.normtijd_id) ?? 0) * 100) / 100,
  }));
  // Geschreven op een code die niet (meer) begroot is, blijft zichtbaar —
  // namen in één set-query (geen query per code).
  const wezenIds = [...geschrevenPerCode.keys()].filter(
    (nid): nid is number => nid != null && !codes.some((c) => c.normtijd_id === nid),
  );
  if (wezenIds.length) {
    const wezen = await db.select().from(modCalcNormtijdenTable).where(inArray(modCalcNormtijdenTable.id, wezenIds));
    for (const nid of wezenIds) {
      const nt = wezen.find((w) => w.id === nid);
      codes.push({ normtijd_id: nid, code: nt?.code ?? "?", omschrijving: nt?.omschrijving ?? "Onbekende uurcode", begroot_uren: 0, geschreven_uren: Math.round((geschrevenPerCode.get(nid) ?? 0) * 100) / 100 });
    }
  }

  // Indirect + niet-in-begroting apart — dat is juist de informatie.
  const indirectGeschreven = await db
    .select({
      id: indirecteWerkzaamhedenTable.id,
      naam: indirecteWerkzaamhedenTable.naam,
      uren: sql<number>`coalesce(sum(${urenRegistratiesTable.nettoUren}), 0)`,
    })
    .from(urenRegistratiesTable)
    .innerJoin(indirecteWerkzaamhedenTable, eq(urenRegistratiesTable.indirecteWerkzaamheidId, indirecteWerkzaamhedenTable.id))
    .where(eq(urenRegistratiesTable.opdrachtId, opdrachtId))
    .groupBy(indirecteWerkzaamhedenTable.id, indirecteWerkzaamhedenTable.naam);

  const [nietInBegroting] = await db
    .select({ uren: sql<number>`coalesce(sum(${urenRegistratiesTable.nettoUren}), 0)` })
    .from(urenRegistratiesTable)
    .where(and(eq(urenRegistratiesTable.opdrachtId, opdrachtId), eq(urenRegistratiesTable.nietInBegroting, true)));

  res.json({
    codes: codes.sort((a, b) => (a.code ?? "").localeCompare(b.code ?? "")),
    indirect: indirectGeschreven.map((i) => ({ id: i.id, naam: i.naam, geschreven_uren: Math.round(Number(i.uren) * 100) / 100 })),
    niet_in_begroting_uren: Math.round(Number(nietInBegroting?.uren ?? 0) * 100) / 100,
  });
});

// Beheer van indirecte werkzaamheden — in een scherm, niet in code (§6b.3).
const mapIndirect = (i: typeof indirecteWerkzaamhedenTable.$inferSelect) => ({
  id: i.id, naam: i.naam, actief: i.actief, volgorde: i.volgorde,
});

router.get("/indirecte-werkzaamheden", requireAuth, async (_req, res): Promise<void> => {
  const rijen = await db.select().from(indirecteWerkzaamhedenTable)
    .orderBy(indirecteWerkzaamhedenTable.volgorde, indirecteWerkzaamhedenTable.naam);
  res.json(rijen.map(mapIndirect));
});

router.post("/indirecte-werkzaamheden", requireBevoegdheid("projecten", 3), async (req, res): Promise<void> => {
  const { naam, volgorde } = req.body;
  if (!naam || !String(naam).trim()) return void res.status(400).json({ error: "naam is verplicht" });
  const [rij] = await db.insert(indirecteWerkzaamhedenTable)
    .values({ naam: String(naam).trim(), volgorde: volgorde != null ? Number(volgorde) : 0, bijgewerktOp: new Date() })
    .returning();
  res.status(201).json(mapIndirect(rij));
});

router.patch("/indirecte-werkzaamheden/:id", requireBevoegdheid("projecten", 3), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [bestaand] = await db.select().from(indirecteWerkzaamhedenTable).where(eq(indirecteWerkzaamhedenTable.id, id)).limit(1);
  if (!bestaand) return void res.status(404).json({ error: "Niet gevonden" });
  const { naam, actief, volgorde } = req.body;
  const [rij] = await db.update(indirecteWerkzaamhedenTable)
    .set({
      naam: naam !== undefined ? String(naam).trim() : bestaand.naam,
      actief: actief !== undefined ? actief === true : bestaand.actief,
      volgorde: volgorde !== undefined ? Number(volgorde) : bestaand.volgorde,
      bijgewerktOp: new Date(),
    })
    .where(eq(indirecteWerkzaamhedenTable.id, id))
    .returning();
  res.json(mapIndirect(rij));
});

// Verwijderen mag alleen als de code nooit gebruikt is; anders inactief zetten.
router.delete("/indirecte-werkzaamheden/:id", requireBevoegdheid("projecten", 3), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [gebruikt] = await db.select({ id: urenRegistratiesTable.id })
    .from(urenRegistratiesTable)
    .where(eq(urenRegistratiesTable.indirecteWerkzaamheidId, id)).limit(1);
  if (gebruikt) {
    return void res.status(409).json({ error: "Deze werkzaamheid is al gebruikt op urenregels en kan niet worden verwijderd; zet haar op inactief" });
  }
  await db.delete(indirecteWerkzaamhedenTable).where(eq(indirecteWerkzaamhedenTable.id, id));
  res.status(204).end();
});

export default router;
