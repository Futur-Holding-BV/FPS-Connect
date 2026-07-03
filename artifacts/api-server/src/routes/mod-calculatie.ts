// Module Calculatie routes — /api/modules/calculaties/*
// V2.1: ABK, uitgebreide regelkolommen (MU, arbeid, onderaanneming), staartkosten, 3 weergaven.
import { Router } from "express";
import {
  db,
  modCalcHeadersTable,
  modCalcRegelsTable,
  modCalcTarievenTable,
  modCalcNormtijdenTable,
  modCalcLeveranciersTable,
  modCalcArtekelenTable,
  modCalcVersiesTable,
  modCalcInkoopItemsTable,
  gebouwenTable,
  gebruikersTable,
  voorzieningenTable,
  voorzieningLabelsTable,
  labelsTable,
  opnamesTable,
  opnameItemsTable,
  offertesTable,
  offerteRegelsTable,
} from "@workspace/db";
import { eq, desc, asc, ilike, or, count, sql, and } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { aiGateway, heeftGateway } from "../lib/aiGateway";

const router = Router();
const iso = (d: Date) => d.toISOString();

const lezenCalc = requireBevoegdheid("calculaties", 1);
const schrijvenCalc = requireBevoegdheid("calculaties", 2);
const aanmakenCalc = requireBevoegdheid("calculaties", 3);
const verwijderenCalc = requireBevoegdheid("calculaties", 4);

function parseId(v: unknown): number {
  return parseInt(String(v), 10);
}

type RegelCalcInput = {
  hoeveelheid: number;
  tarief: number;
  muPerEenheid: number;
  arbeidsTarief: number;
  onderaannemingBedrag: number;
  isStaartkosten: boolean;
  isBouwplaatskosten: boolean;
  totaal: number;
};

function berekenTotalen(
  regels: RegelCalcInput[],
  header: {
    opslagMateriaal: number;
    opslagArbeid: number;
    opslagAk: number;
    opslagAbk: number;
    opslagRisico: number;
    opslagWinst: number;
    korting: number;
    akIsVast?: boolean;
    abkIsVast?: boolean;
    risicoIsVast?: boolean;
    winstIsVast?: boolean;
  },
) {
  const rnd = (n: number) => Math.round(n * 100) / 100;

  const directe    = regels.filter(r => !r.isStaartkosten && !r.isBouwplaatskosten);
  const bouwplaats = regels.filter(r => r.isBouwplaatskosten);
  const staart     = regels.filter(r => r.isStaartkosten);

  const matSubtotaal        = rnd(directe.reduce((s, r) => s + r.hoeveelheid * r.tarief, 0));
  const arbSubtotaal        = rnd(directe.reduce((s, r) => s + r.hoeveelheid * r.muPerEenheid * r.arbeidsTarief, 0));
  const oaSubtotaal         = rnd(directe.reduce((s, r) => s + r.onderaannemingBedrag, 0));
  const bouwplaatsSubtotaal = rnd(bouwplaats.reduce((s, r) => s + r.totaal, 0));
  const staartSubtotaal     = rnd(staart.reduce((s, r) => s + r.totaal, 0));

  const matOpslagBedrag = rnd(matSubtotaal * header.opslagMateriaal / 100);
  const arbOpslagBedrag = rnd(arbSubtotaal * header.opslagArbeid / 100);

  const subtotaal = rnd(
    matSubtotaal + matOpslagBedrag +
    arbSubtotaal + arbOpslagBedrag +
    oaSubtotaal + bouwplaatsSubtotaal + staartSubtotaal,
  );

  const akBedrag     = header.akIsVast     ? rnd(header.opslagAk)      : rnd(subtotaal * header.opslagAk / 100);
  const abkBedrag    = header.abkIsVast    ? rnd(header.opslagAbk)     : rnd(subtotaal * header.opslagAbk / 100);
  const risicoBedrag = header.risicoIsVast ? rnd(header.opslagRisico)  : rnd(subtotaal * header.opslagRisico / 100);
  const basisWinst   = rnd(subtotaal + akBedrag + abkBedrag + risicoBedrag);
  const winstBedrag  = header.winstIsVast  ? rnd(header.opslagWinst)   : rnd(basisWinst * header.opslagWinst / 100);

  const aanneemsom    = rnd(basisWinst + winstBedrag);
  const kortingBedrag = rnd(aanneemsom * header.korting / 100);

  return {
    subtotaal,
    totaal_na_opslagen: rnd(aanneemsom - kortingBedrag),
  };
}

function mapHeader(
  h: typeof modCalcHeadersTable.$inferSelect,
  extra?: {
    gebouwNaam?: string | null;
    aangemaaktDoorNaam?: string | null;
    subtotaal?: number;
    totaalNaOpslagen?: number;
  },
) {
  return {
    id: h.id,
    naam: h.naam,
    referentie: h.referentie,
    klant_naam: h.klantNaam,
    gebouw_id: h.gebouwId,
    gebouw_naam: extra?.gebouwNaam ?? null,
    project_naam: h.projectNaam,
    status: h.status,
    omschrijving: h.omschrijving,
    opmerkingen: h.opmerkingen,
    opslag_materiaal: h.opslagMateriaal ?? 0,
    opslag_arbeid: h.opslagArbeid ?? 0,
    opslag_ak: h.opslagAk,
    opslag_abk: h.opslagAbk ?? 10,
    opslag_risico: h.opslagRisico,
    opslag_winst: h.opslagWinst,
    korting: h.korting,
    ak_is_vast: h.akIsVast ?? false,
    abk_is_vast: h.abkIsVast ?? false,
    risico_is_vast: h.risicoIsVast ?? false,
    winst_is_vast: h.winstIsVast ?? false,
    subtotaal: extra?.subtotaal ?? 0,
    totaal_na_opslagen: extra?.totaalNaOpslagen ?? 0,
    aangemaakt_door_naam: extra?.aangemaaktDoorNaam ?? null,
    aangemaakt_op: iso(h.aangemaaktOp),
    bijgewerkt_op: iso(h.bijgewerktOp),
  };
}

function mapRegel(r: typeof modCalcRegelsTable.$inferSelect, normtijdCode?: string | null) {
  const hv = r.hoeveelheid ?? 0;
  const t  = r.tarief ?? 0;
  const mu = (r as any).muPerEenheid ?? 0;
  const at = (r as any).arbeidsTarief ?? 0;
  const ob = (r as any).onderaannemingBedrag ?? 0;
  const materiaalTotaal = Math.round(hv * t * 100) / 100;
  const muTotaal        = Math.round(hv * mu * 100) / 100;
  const arbeidsloon     = Math.round(muTotaal * at * 100) / 100;
  return {
    id: r.id,
    calculatie_id: r.calculatieId,
    categorie: r.categorie,
    omschrijving: r.omschrijving,
    normtijd_id: r.normtijdId,
    normtijd_code: normtijdCode ?? null,
    eenheid: r.eenheid,
    hoeveelheid: hv,
    tarief: t,
    totaal: r.totaal,
    volgorde: r.volgorde,
    opmerkingen: r.opmerkingen,
    regelnummer: (r as any).regelnummer ?? null,
    mu_per_eenheid: mu,
    arbeids_tarief: at,
    onderaanneming_bedrag: ob,
    is_staartkosten: r.isStaartkosten ?? false,
    is_bouwplaatskosten: r.isBouwplaatskosten ?? false,
    hoofdstuk: r.hoofdstuk ?? "Overige werkzaamheden",
    klanttekst: (r as any).klanttekst ?? null,
    btw_tarief: (r as any).btwTarief ?? "21",
    materiaal_totaal: materiaalTotaal,
    mu_totaal: muTotaal,
    arbeidsloon,
    wand_plafond: (r as any).wandPlafond ?? null,
    toepassing_tekst: (r as any).toepassingTekst ?? null,
  };
}

function berekenRegelTotaal(body: Record<string, unknown>, existing?: {
  hoeveelheid: number; tarief: number; muPerEenheid?: number; arbeidsTarief?: number; onderaannemingBedrag?: number;
}) {
  const hv = body.hoeveelheid !== undefined ? Number(body.hoeveelheid) : (existing?.hoeveelheid ?? 0);
  const t  = body.tarief !== undefined ? Number(body.tarief) : (existing?.tarief ?? 0);
  const mu = body.mu_per_eenheid !== undefined ? Number(body.mu_per_eenheid) : ((existing as any)?.muPerEenheid ?? 0);
  const at = body.arbeids_tarief !== undefined ? Number(body.arbeids_tarief) : ((existing as any)?.arbeidsTarief ?? 0);
  const ob = body.onderaanneming_bedrag !== undefined ? Number(body.onderaanneming_bedrag) : ((existing as any)?.onderaannemingBedrag ?? 0);
  const materiaalDeel = Math.round(hv * t * 100) / 100;
  const muTotaal      = Math.round(hv * mu * 100) / 100;
  const arbeidsloon   = Math.round(muTotaal * at * 100) / 100;
  const totaal = Math.round((materiaalDeel + arbeidsloon + ob) * 100) / 100;
  return { hv, t, mu, at, ob, totaal };
}

// ── Tarieven ───────────────────────────────────────────────────────────────

router.get("/modules/calculaties/tarieven", lezenCalc, async (req, res) => {
  try {
    const rows = await db.select().from(modCalcTarievenTable)
      .where(eq(modCalcTarievenTable.actief, true))
      .orderBy(asc(modCalcTarievenTable.categorie), asc(modCalcTarievenTable.naam));
    res.json(rows.map((r) => ({
      id: r.id, naam: r.naam, tarief: r.tarief, eenheid: r.eenheid,
      categorie: r.categorie, actief: r.actief,
    })));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.post("/modules/calculaties/tarieven", schrijvenCalc, async (req, res) => {
  try {
    const { naam, tarief, eenheid = "uur", categorie = "arbeid" } = req.body as Record<string, unknown>;
    if (!naam) return res.status(400).json({ error: "naam is verplicht" });
    const [row] = await db.insert(modCalcTarievenTable).values({
      naam: String(naam), tarief: Number(tarief ?? 0), eenheid: String(eenheid), categorie: String(categorie),
    }).returning();
    res.status(201).json({ id: row.id, naam: row.naam, tarief: row.tarief, eenheid: row.eenheid, categorie: row.categorie, actief: row.actief });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.patch("/modules/calculaties/tarieven/:id", schrijvenCalc, async (req, res) => {
  try {
    const id = parseId(req.params["id"]);
    const body = req.body as Record<string, unknown>;
    const update: Partial<typeof modCalcTarievenTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (body.naam !== undefined) update.naam = String(body.naam);
    if (body.tarief !== undefined) update.tarief = Number(body.tarief);
    if (body.eenheid !== undefined) update.eenheid = String(body.eenheid);
    if (body.categorie !== undefined) update.categorie = String(body.categorie);
    if (body.actief !== undefined) update.actief = Boolean(body.actief);
    const [row] = await db.update(modCalcTarievenTable).set(update).where(eq(modCalcTarievenTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Niet gevonden" });
    res.json({ id: row.id, naam: row.naam, tarief: row.tarief, eenheid: row.eenheid, categorie: row.categorie, actief: row.actief });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.delete("/modules/calculaties/tarieven/:id", verwijderenCalc, async (req, res) => {
  try {
    const id = parseId(req.params["id"]);
    await db.delete(modCalcTarievenTable).where(eq(modCalcTarievenTable.id, id));
    res.status(204).end();
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Normtijden ─────────────────────────────────────────────────────────────

router.get("/modules/calculaties/normtijden", lezenCalc, async (req, res) => {
  try {
    const rows = await db.select().from(modCalcNormtijdenTable)
      .where(eq(modCalcNormtijdenTable.actief, true))
      .orderBy(asc(modCalcNormtijdenTable.categorie), asc(modCalcNormtijdenTable.code));
    res.json(rows.map((r) => ({
      id: r.id, code: r.code, omschrijving: r.omschrijving, categorie: r.categorie,
      eenheid: r.eenheid, uren_per_eenheid: r.urenPerEenheid, actief: r.actief,
    })));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.post("/modules/calculaties/normtijden", schrijvenCalc, async (req, res) => {
  try {
    const { code, omschrijving, categorie = "brandwerende afdichting", eenheid = "st", uren_per_eenheid = 0 } =
      req.body as Record<string, unknown>;
    if (!code || !omschrijving) return res.status(400).json({ error: "code en omschrijving zijn verplicht" });
    const [row] = await db.insert(modCalcNormtijdenTable).values({
      code: String(code), omschrijving: String(omschrijving), categorie: String(categorie),
      eenheid: String(eenheid), urenPerEenheid: Number(uren_per_eenheid),
    }).returning();
    res.status(201).json({ id: row.id, code: row.code, omschrijving: row.omschrijving,
      categorie: row.categorie, eenheid: row.eenheid, uren_per_eenheid: row.urenPerEenheid, actief: row.actief });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Calculatie headers ─────────────────────────────────────────────────────

router.get("/modules/calculaties", lezenCalc, async (req, res) => {
  try {
    const { status, zoek } = req.query as Record<string, string>;

    const rows = await db
      .select({
        header: modCalcHeadersTable,
        gebouwNaam: gebouwenTable.naam,
        makerNaam: gebruikersTable.naam,
      })
      .from(modCalcHeadersTable)
      .leftJoin(gebouwenTable, eq(modCalcHeadersTable.gebouwId, gebouwenTable.id))
      .leftJoin(gebruikersTable, eq(modCalcHeadersTable.aangemaaktDoorId, gebruikersTable.id))
      .orderBy(desc(modCalcHeadersTable.aangemaaktOp));

    const allRegels = await db.select({
      cid: modCalcRegelsTable.calculatieId,
      totaal: modCalcRegelsTable.totaal,
      hoeveelheid: modCalcRegelsTable.hoeveelheid,
      tarief: modCalcRegelsTable.tarief,
      muPerEenheid: modCalcRegelsTable.muPerEenheid,
      arbeidsTarief: modCalcRegelsTable.arbeidsTarief,
      onderaannemingBedrag: modCalcRegelsTable.onderaannemingBedrag,
      isStaartkosten: modCalcRegelsTable.isStaartkosten,
      isBouwplaatskosten: modCalcRegelsTable.isBouwplaatskosten,
    }).from(modCalcRegelsTable);

    const regelsByCalc = new Map<number, RegelCalcInput[]>();
    for (const r of allRegels) {
      if (!regelsByCalc.has(r.cid)) regelsByCalc.set(r.cid, []);
      regelsByCalc.get(r.cid)!.push({
        hoeveelheid: r.hoeveelheid,
        tarief: r.tarief,
        muPerEenheid: r.muPerEenheid,
        arbeidsTarief: r.arbeidsTarief,
        onderaannemingBedrag: r.onderaannemingBedrag,
        isStaartkosten: r.isStaartkosten,
        isBouwplaatskosten: r.isBouwplaatskosten,
        totaal: r.totaal,
      });
    }

    let resultaten = rows;
    if (status) resultaten = resultaten.filter((r) => r.header.status === status);
    if (zoek) {
      const q = zoek.toLowerCase();
      resultaten = resultaten.filter((r) =>
        r.header.naam.toLowerCase().includes(q) ||
        (r.header.klantNaam ?? "").toLowerCase().includes(q) ||
        (r.header.projectNaam ?? "").toLowerCase().includes(q)
      );
    }

    res.json(resultaten.map(({ header, gebouwNaam, makerNaam }) => {
      const calcRegels = regelsByCalc.get(header.id) ?? [];
      const { subtotaal, totaal_na_opslagen } = berekenTotalen(calcRegels, {
        opslagMateriaal: header.opslagMateriaal ?? 0,
        opslagArbeid: header.opslagArbeid ?? 0,
        opslagAk: header.opslagAk,
        opslagAbk: header.opslagAbk ?? 10,
        opslagRisico: header.opslagRisico,
        opslagWinst: header.opslagWinst,
        korting: header.korting,
        akIsVast: header.akIsVast ?? false,
        abkIsVast: header.abkIsVast ?? false,
        risicoIsVast: header.risicoIsVast ?? false,
        winstIsVast: header.winstIsVast ?? false,
      });
      return mapHeader(header, { gebouwNaam: gebouwNaam ?? null, aangemaaktDoorNaam: makerNaam ?? null, subtotaal, totaalNaOpslagen: totaal_na_opslagen });
    }));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.post("/modules/calculaties", aanmakenCalc, async (req, res) => {
  try {
    const {
      naam, referentie, klant_naam, gebouw_id, project_naam, status = "concept",
      omschrijving, opmerkingen,
      opslag_materiaal = 0, opslag_arbeid = 0,
      opslag_ak = 15, opslag_risico = 5, opslag_winst = 10, korting = 0,
    } = req.body as Record<string, unknown>;

    if (!naam) return res.status(400).json({ error: "naam is verplicht" });

    const [row] = await db.insert(modCalcHeadersTable).values({
      naam: String(naam),
      referentie: referentie ? String(referentie) : null,
      klantNaam: klant_naam ? String(klant_naam) : null,
      gebouwId: gebouw_id ? Number(gebouw_id) : null,
      projectNaam: project_naam ? String(project_naam) : null,
      status: String(status),
      omschrijving: omschrijving ? String(omschrijving) : null,
      opmerkingen: opmerkingen ? String(opmerkingen) : null,
      opslagMateriaal: Number(opslag_materiaal),
      opslagArbeid: Number(opslag_arbeid),
      opslagAk: Number(opslag_ak),
      opslagRisico: Number(opslag_risico),
      opslagWinst: Number(opslag_winst),
      korting: Number(korting),
      aangemaaktDoorId: req.session.userId ?? null,
    } as typeof modCalcHeadersTable.$inferInsert).returning();

    // Auto-genereer referentie als nog niet opgegeven
    let finalRow = row;
    if (!row.referentie) {
      const jaar = new Date().getFullYear();
      const refCode = `CALC-${jaar}-${String(row.id).padStart(4, "0")}`;
      const [updated] = await db
        .update(modCalcHeadersTable)
        .set({ referentie: refCode })
        .where(eq(modCalcHeadersTable.id, row.id))
        .returning();
      finalRow = updated;
    }

    res.status(201).json(mapHeader(finalRow, { subtotaal: 0, totaalNaOpslagen: 0 }));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Leveranciers ──────────────────────────────────────────────────────────
router.get("/modules/calculaties/leveranciers", lezenCalc, async (req, res) => {
  try {
    const rows = await db.select().from(modCalcLeveranciersTable).orderBy(asc(modCalcLeveranciersTable.naam));
    res.json(rows.map((r) => ({
      id: r.id, naam: r.naam, contactpersoon: r.contactpersoon, email: r.email,
      telefoon: r.telefoon, website: r.website, notities: r.notities, actief: r.actief,
    })));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.post("/modules/calculaties/leveranciers", schrijvenCalc, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    if (!body.naam) return res.status(400).json({ error: "naam is verplicht" });
    const [row] = await db.insert(modCalcLeveranciersTable).values({
      naam: String(body.naam),
      contactpersoon: body.contactpersoon ? String(body.contactpersoon) : null,
      email: body.email ? String(body.email) : null,
      telefoon: body.telefoon ? String(body.telefoon) : null,
      website: body.website ? String(body.website) : null,
      notities: body.notities ? String(body.notities) : null,
    }).returning();
    res.status(201).json({ id: row.id, naam: row.naam, contactpersoon: row.contactpersoon, email: row.email, telefoon: row.telefoon, website: row.website, notities: row.notities, actief: row.actief });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.patch("/modules/calculaties/leveranciers/:id", schrijvenCalc, async (req, res) => {
  try {
    const id = parseId(req.params["id"]);
    const body = req.body as Record<string, unknown>;
    const update: Partial<typeof modCalcLeveranciersTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (body.naam !== undefined) update.naam = String(body.naam);
    if (body.contactpersoon !== undefined) update.contactpersoon = body.contactpersoon ? String(body.contactpersoon) : null;
    if (body.email !== undefined) update.email = body.email ? String(body.email) : null;
    if (body.telefoon !== undefined) update.telefoon = body.telefoon ? String(body.telefoon) : null;
    if (body.website !== undefined) update.website = body.website ? String(body.website) : null;
    if (body.notities !== undefined) update.notities = body.notities ? String(body.notities) : null;
    if (body.actief !== undefined) update.actief = Boolean(body.actief);
    const [row] = await db.update(modCalcLeveranciersTable).set(update).where(eq(modCalcLeveranciersTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Niet gevonden" });
    res.json({ id: row.id, naam: row.naam, contactpersoon: row.contactpersoon, email: row.email, telefoon: row.telefoon, website: row.website, notities: row.notities, actief: row.actief });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.delete("/modules/calculaties/leveranciers/:id", verwijderenCalc, async (req, res) => {
  try {
    const id = parseId(req.params["id"]);
    await db.delete(modCalcLeveranciersTable).where(eq(modCalcLeveranciersTable.id, id));
    res.status(204).end();
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Artikelen ─────────────────────────────────────────────────────────────
router.get("/modules/calculaties/artikelen", lezenCalc, async (req, res) => {
  try {
    const zoek = typeof req.query["zoek"] === "string" ? req.query["zoek"].trim() : "";
    const leverancierId = typeof req.query["leverancier_id"] === "string" ? parseInt(req.query["leverancier_id"], 10) : null;

    let query = db.select({
      id: modCalcArtekelenTable.id,
      leverancier_id: modCalcArtekelenTable.leverancierId,
      leverancier_naam: modCalcLeveranciersTable.naam,
      artikelcode: modCalcArtekelenTable.artikelcode,
      omschrijving: modCalcArtekelenTable.omschrijving,
      eenheid: modCalcArtekelenTable.eenheid,
      inkoopprijs: modCalcArtekelenTable.inkoopprijs,
      verkoopprijs: modCalcArtekelenTable.verkoopprijs,
      categorie: modCalcArtekelenTable.categorie,
      actief: modCalcArtekelenTable.actief,
    }).from(modCalcArtekelenTable)
      .leftJoin(modCalcLeveranciersTable, eq(modCalcArtekelenTable.leverancierId, modCalcLeveranciersTable.id))
      .$dynamic();

    const filters = [eq(modCalcArtekelenTable.actief, true)];
    if (zoek) filters.push(ilike(modCalcArtekelenTable.omschrijving, `%${zoek}%`));
    if (leverancierId && !isNaN(leverancierId)) filters.push(eq(modCalcArtekelenTable.leverancierId, leverancierId));
    if (filters.length > 0) {
      query = query.where(filters.length === 1 ? filters[0]! : sql`${filters[0]} AND ${filters[1]}`) as typeof query;
    }

    const rows = await query.orderBy(asc(modCalcArtekelenTable.omschrijving)).limit(200);
    res.json(rows);
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.post("/modules/calculaties/artikelen", schrijvenCalc, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    if (!body.omschrijving) return res.status(400).json({ error: "omschrijving is verplicht" });
    const [row] = await db.insert(modCalcArtekelenTable).values({
      leverancierId: body.leverancier_id ? Number(body.leverancier_id) : null,
      artikelcode: body.artikelcode ? String(body.artikelcode) : null,
      omschrijving: String(body.omschrijving),
      eenheid: body.eenheid ? String(body.eenheid) : "st",
      inkoopprijs: Number(body.inkoopprijs ?? 0),
      verkoopprijs: Number(body.verkoopprijs ?? 0),
      categorie: body.categorie ? String(body.categorie) : "materiaal",
    }).returning();
    res.status(201).json({ id: row.id, leverancier_id: row.leverancierId, artikelcode: row.artikelcode, omschrijving: row.omschrijving, eenheid: row.eenheid, inkoopprijs: row.inkoopprijs, verkoopprijs: row.verkoopprijs, categorie: row.categorie, actief: row.actief });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.patch("/modules/calculaties/artikelen/:id", schrijvenCalc, async (req, res) => {
  try {
    const id = parseId(req.params["id"]);
    const body = req.body as Record<string, unknown>;
    const update: Partial<typeof modCalcArtekelenTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (body.leverancier_id !== undefined) update.leverancierId = body.leverancier_id ? Number(body.leverancier_id) : null;
    if (body.artikelcode !== undefined) update.artikelcode = body.artikelcode ? String(body.artikelcode) : null;
    if (body.omschrijving !== undefined) update.omschrijving = String(body.omschrijving);
    if (body.eenheid !== undefined) update.eenheid = String(body.eenheid);
    if (body.inkoopprijs !== undefined) update.inkoopprijs = Number(body.inkoopprijs);
    if (body.verkoopprijs !== undefined) update.verkoopprijs = Number(body.verkoopprijs);
    if (body.categorie !== undefined) update.categorie = String(body.categorie);
    if (body.actief !== undefined) update.actief = Boolean(body.actief);
    const [row] = await db.update(modCalcArtekelenTable).set(update).where(eq(modCalcArtekelenTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Niet gevonden" });
    res.json({ id: row.id, leverancier_id: row.leverancierId, artikelcode: row.artikelcode, omschrijving: row.omschrijving, eenheid: row.eenheid, inkoopprijs: row.inkoopprijs, verkoopprijs: row.verkoopprijs, categorie: row.categorie, actief: row.actief });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.delete("/modules/calculaties/artikelen/:id", verwijderenCalc, async (req, res) => {
  try {
    const id = parseId(req.params["id"]);
    await db.delete(modCalcArtekelenTable).where(eq(modCalcArtekelenTable.id, id));
    res.status(204).end();
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── CSV import artikelen ───────────────────────────────────────────────────
// Verwacht CSV: artikelcode;omschrijving;eenheid;inkoopprijs;verkoopprijs;categorie;leverancier_naam
router.post("/modules/calculaties/artikelen/import-csv", schrijvenCalc, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const csv = typeof body.csv === "string" ? body.csv : "";
    if (!csv.trim()) return res.status(400).json({ error: "Geen CSV-data ontvangen" });

    const regels = csv.split(/\r?\n/).map((r) => r.trim()).filter((r) => r && !r.startsWith("artikelcode"));
    let aangemaakt = 0;
    let fouten: string[] = [];

    for (const regel of regels) {
      const delen = regel.split(";");
      const [artikelcode, omschrijving, eenheid, inkoopRaw, verkoopRaw, categorie, leverancierNaam] = delen;
      if (!omschrijving?.trim()) { fouten.push(`Lege omschrijving op rij: ${regel}`); continue; }

      let leverancierId: number | null = null;
      if (leverancierNaam?.trim()) {
        const [bestaande] = await db.select({ id: modCalcLeveranciersTable.id }).from(modCalcLeveranciersTable)
          .where(ilike(modCalcLeveranciersTable.naam, leverancierNaam.trim())).limit(1);
        if (bestaande) {
          leverancierId = bestaande.id;
        } else {
          const [nieuw] = await db.insert(modCalcLeveranciersTable).values({ naam: leverancierNaam.trim() }).returning();
          leverancierId = nieuw.id;
        }
      }

      await db.insert(modCalcArtekelenTable).values({
        artikelcode: artikelcode?.trim() || null,
        omschrijving: omschrijving.trim(),
        eenheid: eenheid?.trim() || "st",
        inkoopprijs: parseFloat((inkoopRaw ?? "0").replace(",", ".")) || 0,
        verkoopprijs: parseFloat((verkoopRaw ?? "0").replace(",", ".")) || 0,
        categorie: categorie?.trim() || "materiaal",
        leverancierId,
      });
      aangemaakt++;
    }

    res.json({ aangemaakt, fouten });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Import mislukt" });
  }
});

// ── Calculatie detail ──────────────────────────────────────────────────────
router.get("/modules/calculaties/:id", lezenCalc, async (req, res) => {
  try {
    const id = parseId(req.params["id"]);

    const [headerRow] = await db
      .select({
        header: modCalcHeadersTable,
        gebouwNaam: gebouwenTable.naam,
        makerNaam: gebruikersTable.naam,
      })
      .from(modCalcHeadersTable)
      .leftJoin(gebouwenTable, eq(modCalcHeadersTable.gebouwId, gebouwenTable.id))
      .leftJoin(gebruikersTable, eq(modCalcHeadersTable.aangemaaktDoorId, gebruikersTable.id))
      .where(eq(modCalcHeadersTable.id, id));

    if (!headerRow) return res.status(404).json({ error: "Niet gevonden" });

    const regelRows = await db
      .select({ regel: modCalcRegelsTable, normCode: modCalcNormtijdenTable.code })
      .from(modCalcRegelsTable)
      .leftJoin(modCalcNormtijdenTable, eq(modCalcRegelsTable.normtijdId, modCalcNormtijdenTable.id))
      .where(eq(modCalcRegelsTable.calculatieId, id))
      .orderBy(asc(modCalcRegelsTable.volgorde), asc(modCalcRegelsTable.id));

    const regels = regelRows.map(({ regel, normCode }) => mapRegel(regel, normCode));
    const calcRegels: RegelCalcInput[] = regelRows.map(({ regel: r }) => ({
      hoeveelheid: r.hoeveelheid,
      tarief: r.tarief,
      muPerEenheid: r.muPerEenheid,
      arbeidsTarief: r.arbeidsTarief,
      onderaannemingBedrag: r.onderaannemingBedrag,
      isStaartkosten: r.isStaartkosten,
      isBouwplaatskosten: r.isBouwplaatskosten,
      totaal: r.totaal,
    }));
    const { subtotaal, totaal_na_opslagen } = berekenTotalen(calcRegels, {
      opslagMateriaal: headerRow.header.opslagMateriaal ?? 0,
      opslagArbeid: headerRow.header.opslagArbeid ?? 0,
      opslagAk: headerRow.header.opslagAk,
      opslagAbk: headerRow.header.opslagAbk ?? 10,
      opslagRisico: headerRow.header.opslagRisico,
      opslagWinst: headerRow.header.opslagWinst,
      korting: headerRow.header.korting,
      akIsVast: headerRow.header.akIsVast ?? false,
      abkIsVast: headerRow.header.abkIsVast ?? false,
      risicoIsVast: headerRow.header.risicoIsVast ?? false,
      winstIsVast: headerRow.header.winstIsVast ?? false,
    });

    res.json({
      ...mapHeader(headerRow.header, {
        gebouwNaam: headerRow.gebouwNaam ?? null,
        aangemaaktDoorNaam: headerRow.makerNaam ?? null,
        subtotaal,
        totaalNaOpslagen: totaal_na_opslagen,
      }),
      regels,
    });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.patch("/modules/calculaties/:id", schrijvenCalc, async (req, res) => {
  try {
    const id = parseId(req.params["id"]);
    const body = req.body as Record<string, unknown>;
    const update: Partial<typeof modCalcHeadersTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (body.naam !== undefined) update.naam = String(body.naam);
    if (body.referentie !== undefined) update.referentie = body.referentie ? String(body.referentie) : null;
    if (body.klant_naam !== undefined) update.klantNaam = body.klant_naam ? String(body.klant_naam) : null;
    if (body.gebouw_id !== undefined) update.gebouwId = body.gebouw_id ? Number(body.gebouw_id) : null;
    if (body.project_naam !== undefined) update.projectNaam = body.project_naam ? String(body.project_naam) : null;
    if (body.status !== undefined) update.status = String(body.status);
    if (body.omschrijving !== undefined) update.omschrijving = body.omschrijving ? String(body.omschrijving) : null;
    if (body.opmerkingen !== undefined) update.opmerkingen = body.opmerkingen ? String(body.opmerkingen) : null;
    if (body.opslag_materiaal !== undefined) update.opslagMateriaal = Number(body.opslag_materiaal);
    if (body.opslag_arbeid !== undefined) update.opslagArbeid = Number(body.opslag_arbeid);
    if (body.opslag_ak !== undefined) update.opslagAk = Number(body.opslag_ak);
    if (body.opslag_abk !== undefined) update.opslagAbk = Number(body.opslag_abk);
    if (body.opslag_risico !== undefined) update.opslagRisico = Number(body.opslag_risico);
    if (body.opslag_winst !== undefined) update.opslagWinst = Number(body.opslag_winst);
    if (body.korting !== undefined) update.korting = Number(body.korting);
    if (body.ak_is_vast !== undefined) update.akIsVast = Boolean(body.ak_is_vast);
    if (body.abk_is_vast !== undefined) update.abkIsVast = Boolean(body.abk_is_vast);
    if (body.risico_is_vast !== undefined) update.risicoIsVast = Boolean(body.risico_is_vast);
    if (body.winst_is_vast !== undefined) update.winstIsVast = Boolean(body.winst_is_vast);
    const [row] = await db.update(modCalcHeadersTable).set(update).where(eq(modCalcHeadersTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Niet gevonden" });
    res.json(mapHeader(row));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.delete("/modules/calculaties/:id", verwijderenCalc, async (req, res) => {
  try {
    const id = parseId(req.params["id"]);
    await db.delete(modCalcHeadersTable).where(eq(modCalcHeadersTable.id, id));
    res.status(204).end();
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.post("/modules/calculaties/:id/dupliceer", aanmakenCalc, async (req, res) => {
  try {
    const id = parseId(req.params["id"]);
    const [original] = await db.select().from(modCalcHeadersTable).where(eq(modCalcHeadersTable.id, id));
    if (!original) return res.status(404).json({ error: "Niet gevonden" });

    const [kopie] = await db.insert(modCalcHeadersTable).values({
      naam: `${original.naam} (kopie)`,
      referentie: original.referentie,
      klantNaam: original.klantNaam,
      gebouwId: original.gebouwId,
      projectNaam: original.projectNaam,
      status: "concept",
      omschrijving: original.omschrijving,
      opmerkingen: original.opmerkingen,
      opslagMateriaal: original.opslagMateriaal ?? 0,
      opslagArbeid: original.opslagArbeid ?? 0,
      opslagAk: original.opslagAk,
      opslagAbk: original.opslagAbk ?? 10,
      opslagRisico: original.opslagRisico,
      opslagWinst: original.opslagWinst,
      korting: original.korting,
      akIsVast: original.akIsVast ?? false,
      abkIsVast: original.abkIsVast ?? false,
      risicoIsVast: original.risicoIsVast ?? false,
      winstIsVast: original.winstIsVast ?? false,
      aangemaaktDoorId: req.session.userId ?? null,
    } as typeof modCalcHeadersTable.$inferInsert).returning();

    const origRegels = await db.select().from(modCalcRegelsTable)
      .where(eq(modCalcRegelsTable.calculatieId, id))
      .orderBy(asc(modCalcRegelsTable.volgorde));

    if (origRegels.length > 0) {
      await db.insert(modCalcRegelsTable).values(
        origRegels.map((r) => ({
          calculatieId: kopie.id,
          categorie: r.categorie,
          omschrijving: r.omschrijving,
          normtijdId: r.normtijdId,
          eenheid: r.eenheid,
          hoeveelheid: r.hoeveelheid,
          tarief: r.tarief,
          totaal: r.totaal,
          volgorde: r.volgorde,
          opmerkingen: r.opmerkingen,
          regelnummer: (r as any).regelnummer ?? null,
          muPerEenheid: (r as any).muPerEenheid ?? 0,
          arbeidsTarief: (r as any).arbeidsTarief ?? 0,
          onderaannemingBedrag: (r as any).onderaannemingBedrag ?? 0,
          isStaartkosten: r.isStaartkosten ?? false,
          isBouwplaatskosten: r.isBouwplaatskosten ?? false,
        } as typeof modCalcRegelsTable.$inferInsert))
      );
    }

    res.status(201).json(mapHeader(kopie));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Calculatie regels ──────────────────────────────────────────────────────

router.get("/modules/calculaties/:id/regels", lezenCalc, async (req, res) => {
  try {
    const id = parseId(req.params["id"]);
    const rows = await db
      .select({ regel: modCalcRegelsTable, normCode: modCalcNormtijdenTable.code })
      .from(modCalcRegelsTable)
      .leftJoin(modCalcNormtijdenTable, eq(modCalcRegelsTable.normtijdId, modCalcNormtijdenTable.id))
      .where(eq(modCalcRegelsTable.calculatieId, id))
      .orderBy(asc(modCalcRegelsTable.volgorde), asc(modCalcRegelsTable.id));
    res.json(rows.map(({ regel, normCode }) => mapRegel(regel, normCode)));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.post("/modules/calculaties/:id/regels", schrijvenCalc, async (req, res) => {
  try {
    const id = parseId(req.params["id"]);
    const [header] = await db.select().from(modCalcHeadersTable).where(eq(modCalcHeadersTable.id, id));
    if (!header) return res.status(404).json({ error: "Calculatie niet gevonden" });

    const body = req.body as Record<string, unknown>;
    const { categorie = "arbeid", omschrijving, normtijd_id, eenheid = "st", volgorde = 0, opmerkingen,
      regelnummer, is_staartkosten = false, is_bouwplaatskosten = false,
      hoofdstuk = "Overige werkzaamheden", klanttekst, btw_tarief = "21",
      wand_plafond, toepassing_tekst } = body;
    if (!omschrijving) return res.status(400).json({ error: "omschrijving is verplicht" });

    const { hv, t, mu, at, ob, totaal } = berekenRegelTotaal(body);

    const [row] = await db.insert(modCalcRegelsTable).values({
      calculatieId: id,
      categorie: String(categorie),
      omschrijving: String(omschrijving),
      normtijdId: normtijd_id ? Number(normtijd_id) : null,
      eenheid: String(eenheid),
      hoeveelheid: hv,
      tarief: t,
      totaal,
      volgorde: Number(volgorde),
      opmerkingen: opmerkingen ? String(opmerkingen) : null,
      regelnummer: regelnummer ? String(regelnummer) : null,
      muPerEenheid: mu,
      arbeidsTarief: at,
      onderaannemingBedrag: ob,
      isStaartkosten: Boolean(is_staartkosten),
      isBouwplaatskosten: Boolean(is_bouwplaatskosten),
      hoofdstuk: String(hoofdstuk),
      klanttekst: klanttekst ? String(klanttekst) : null,
      btwTarief: String(btw_tarief),
      wandPlafond: wand_plafond ? String(wand_plafond) : null,
      toepassingTekst: toepassing_tekst ? String(toepassing_tekst) : null,
    } as typeof modCalcRegelsTable.$inferInsert).returning();

    res.status(201).json(mapRegel(row));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.patch("/modules/calculaties/:id/regels/:regelId", schrijvenCalc, async (req, res) => {
  try {
    const regelId = parseId(req.params["regelId"]);
    const body = req.body as Record<string, unknown>;

    const [existing] = await db.select().from(modCalcRegelsTable).where(eq(modCalcRegelsTable.id, regelId));
    if (!existing) return res.status(404).json({ error: "Niet gevonden" });

    const { hv, t, mu, at, ob, totaal } = berekenRegelTotaal(body, existing as any);

    const update: Partial<typeof modCalcRegelsTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (body.categorie !== undefined) update.categorie = String(body.categorie);
    if (body.omschrijving !== undefined) update.omschrijving = String(body.omschrijving);
    if (body.normtijd_id !== undefined) update.normtijdId = body.normtijd_id ? Number(body.normtijd_id) : null;
    if (body.eenheid !== undefined) update.eenheid = String(body.eenheid);
    if (body.volgorde !== undefined) update.volgorde = Number(body.volgorde);
    if (body.opmerkingen !== undefined) update.opmerkingen = body.opmerkingen ? String(body.opmerkingen) : null;
    if (body.regelnummer !== undefined) (update as any).regelnummer = body.regelnummer ? String(body.regelnummer) : null;
    if (body.is_staartkosten !== undefined) update.isStaartkosten = Boolean(body.is_staartkosten);
    if (body.is_bouwplaatskosten !== undefined) update.isBouwplaatskosten = Boolean(body.is_bouwplaatskosten);
    if (body.hoofdstuk !== undefined) (update as any).hoofdstuk = String(body.hoofdstuk);
    if (body.klanttekst !== undefined) (update as any).klanttekst = body.klanttekst ? String(body.klanttekst) : null;
    if (body.btw_tarief !== undefined) (update as any).btwTarief = String(body.btw_tarief);
    if (body.wand_plafond !== undefined) (update as any).wandPlafond = body.wand_plafond ? String(body.wand_plafond) : null;
    if (body.toepassing_tekst !== undefined) (update as any).toepassingTekst = body.toepassing_tekst ? String(body.toepassing_tekst) : null;
    update.hoeveelheid = hv;
    update.tarief = t;
    (update as any).muPerEenheid = mu;
    (update as any).arbeidsTarief = at;
    (update as any).onderaannemingBedrag = ob;
    update.totaal = totaal;

    const [row] = await db.update(modCalcRegelsTable).set(update).where(eq(modCalcRegelsTable.id, regelId)).returning();
    res.json(mapRegel(row));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.delete("/modules/calculaties/:id/regels/:regelId", schrijvenCalc, async (req, res) => {
  try {
    const regelId = parseId(req.params["regelId"]);
    await db.delete(modCalcRegelsTable).where(eq(modCalcRegelsTable.id, regelId));
    res.status(204).end();
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── AI-voorstel calculatieregels ───────────────────────────────────────────
router.post("/modules/calculaties/:id/ai-regels", lezenCalc, async (req, res) => {
  try {
    const id = parseId(req.params["id"]);
    const [header] = await db.select().from(modCalcHeadersTable).where(eq(modCalcHeadersTable.id, id));
    if (!header) return res.status(404).json({ error: "Calculatie niet gevonden" });

    const [bestaandeRegels, normtijden, tarieven] = await Promise.all([
      db.select().from(modCalcRegelsTable).where(eq(modCalcRegelsTable.calculatieId, id)).orderBy(asc(modCalcRegelsTable.volgorde)),
      db.select().from(modCalcNormtijdenTable).where(eq(modCalcNormtijdenTable.actief, true)).limit(40),
      db.select().from(modCalcTarievenTable).where(eq(modCalcTarievenTable.actief, true)).orderBy(asc(modCalcTarievenTable.categorie), asc(modCalcTarievenTable.naam)),
    ]);

    let gebouwInfo = "";
    let spotenInfo = "";
    let opnameInfo = "";

    if (header.gebouwId) {
      const gId = header.gebouwId;
      const [[g], spotCounts, spotLabels, opnameItems] = await Promise.all([
        db.select().from(gebouwenTable).where(eq(gebouwenTable.id, gId)).limit(1),

        // Aantal spots per type
        db.select({ type: voorzieningenTable.type, aantal: count() })
          .from(voorzieningenTable)
          .where(and(eq(voorzieningenTable.gebouwId, gId), eq(voorzieningenTable.gearchiveerd, false)))
          .groupBy(voorzieningenTable.type),

        // Producten (labels/toepassingen) per spot type
        db.selectDistinct({
          type: voorzieningenTable.type,
          labelNaam: labelsTable.naam,
          fabrikant: labelsTable.fabrikant,
        })
          .from(voorzieningenTable)
          .innerJoin(voorzieningLabelsTable, eq(voorzieningLabelsTable.voorzieningId, voorzieningenTable.id))
          .innerJoin(labelsTable, eq(labelsTable.id, voorzieningLabelsTable.labelId))
          .where(and(eq(voorzieningenTable.gebouwId, gId), eq(voorzieningenTable.gearchiveerd, false))),

        // Meest recente opname-items (bevindingen uit de veldopname)
        db.select({
          opnameNaam: opnamesTable.naam,
          opnameDatum: opnamesTable.datum,
          spotType: opnameItemsTable.spotType,
          actie: opnameItemsTable.actie,
          bereikbaarheid: opnameItemsTable.bereikbaarheid,
          aantal: opnameItemsTable.aantal,
          afmetingen: opnameItemsTable.afmetingen,
          prioriteit: opnameItemsTable.prioriteit,
          beschrijving: opnameItemsTable.beschrijving,
        })
          .from(opnamesTable)
          .innerJoin(opnameItemsTable, eq(opnameItemsTable.opnameId, opnamesTable.id))
          .where(eq(opnamesTable.gebouwId, gId))
          .orderBy(desc(opnamesTable.datum), asc(opnameItemsTable.id))
          .limit(120),
      ]);

      if (g) {
        gebouwInfo = `Gebouw: ${g.naam}, ${(g as any).adres ?? ""} ${(g as any).stad ?? ""}. Bouwjaar: ${(g as any).bouwjaar ?? "onbekend"}. Type: ${(g as any).gebouwType ?? "onbekend"}.`;
      }

      // Spots samenvatten per type, verrijkt met producten
      if (spotCounts.length > 0) {
        const labelsByType = new Map<string, string[]>();
        for (const l of spotLabels) {
          if (!labelsByType.has(l.type)) labelsByType.set(l.type, []);
          const tekst = l.fabrikant ? `${l.labelNaam} (${l.fabrikant})` : l.labelNaam;
          if (!labelsByType.get(l.type)!.includes(tekst)) labelsByType.get(l.type)!.push(tekst);
        }
        spotenInfo = "Geregistreerde spots in dit gebouw (reeds aangebrachte voorzieningen):\n" +
          spotCounts.map((s) => {
            const producten = labelsByType.get(s.type) ?? [];
            const productStr = producten.length > 0 ? ` — producten: ${producten.join(", ")}` : "";
            return `- ${s.type}: ${s.aantal} stuks${productStr}`;
          }).join("\n");
      }

      // Opname-bevindingen: aangewezen werkzaamheden met aantallen en context
      if (opnameItems.length > 0) {
        const eerste = opnameItems[0]!;
        opnameInfo = `Opname: "${eerste.opnameNaam}" d.d. ${eerste.opnameDatum}\n` +
          "Bevindingen uit de veldopname (dit zijn de concreet te calculeren werkzaamheden):\n" +
          opnameItems.map((item) => {
            const delen: string[] = [`${item.spotType}: ${item.actie} × ${item.aantal}`];
            if (item.afmetingen) delen.push(`afm: ${item.afmetingen}`);
            if (item.bereikbaarheid && item.bereikbaarheid !== "goed") delen.push(`bereikbaarheid: ${item.bereikbaarheid}`);
            if (item.prioriteit === "hoog") delen.push("prioriteit: hoog");
            if (item.beschrijving) delen.push(item.beschrijving);
            return `- ${delen.join(" | ")}`;
          }).join("\n");
      }
    }

    const normtijdLijst = normtijden.map((n) => `${n.code}: ${n.omschrijving} (${n.urenPerEenheid} uur/${n.eenheid})`).join("\n");

    const tarievenLijst = tarieven.length > 0
      ? tarieven.map((t) => `[${t.categorie}] ${t.naam}: €${t.tarief}/${t.eenheid}`).join("\n")
      : "(geen tarieven geconfigureerd — schat op basis van marktprijzen)";

    const standaardArbeidstarief = tarieven.find((t) => t.categorie === "arbeid")?.tarief ?? 65;
    const bestaandeLijst = bestaandeRegels.length > 0
      ? bestaandeRegels.map((r) => `- ${(r as any).hoofdstuk ?? "Overige"} | ${r.categorie} | ${r.omschrijving} | ${r.hoeveelheid} ${r.eenheid}`).join("\n")
      : "(geen)";

    const HOOFDSTUKKEN = ["Brandwerende doorvoeringen", "Deuren en kozijnen", "Wanden en plafonds", "Schachten", "Onderhoud", "Overige werkzaamheden"];
    const CATEGORIEEN = ["arbeid", "materiaal", "onderaanneming", "materieel", "overig"];

    // Instructie afhankelijk van beschikbare data
    const databronInstructie = opnameInfo
      ? "Gebruik de opname-bevindingen als primaire basis voor hoeveelheden en werkzaamheden. De spotaantallen geven aanvullende context over de bestaande situatie."
      : spotenInfo
        ? "Gebruik de geregistreerde spotaantallen als basis voor hoeveelheden."
        : "Er zijn geen spots of opname-bevindingen beschikbaar — schat realistisch op basis van de projectomschrijving.";

    const prompt = `Je bent een calculatie-expert brandpreventie voor het Nederlandse bedrijf FPS Brandpreventie.
${gebouwInfo}
Project: ${header.naam}${header.projectNaam ? ` (${header.projectNaam})` : ""}${header.omschrijving ? `\nOmschrijving: ${header.omschrijving}` : ""}
${spotenInfo ? `\n${spotenInfo}` : ""}${opnameInfo ? `\n\n${opnameInfo}` : ""}

Beschikbare normtijden (gebruik de exacte code als normtijd_code, max 3 selecteren):
${normtijdLijst || "(geen normtijden beschikbaar)"}

Beschikbare tarieven uit de database (gebruik deze prijzen in de calculatie):
${tarievenLijst}

Al aanwezige regels (voeg geen duplicaten toe):
${bestaandeLijst}

${databronInstructie}
Gebruik de beschikbare tarieven voor materiaal (tarief) en arbeid (arbeids_tarief).
Geef 6-14 concrete calculatieregels als JSON. Markeer steigers, bereikbaarheidsmaatregelen en bouwplaatslogistiek als is_bouwplaatskosten: true.
Geef ook max 3 korte waarschuwingen bij ontbrekende posten, lage hoeveelheden of risico's.

JSON formaat (ALLEEN dit object teruggeven, geen uitleg):
{
  "regels": [
    {
      "hoofdstuk": "${HOOFDSTUKKEN[0]}",
      "categorie": "arbeid",
      "omschrijving": "Omschrijving van de werkzaamheid",
      "eenheid": "st",
      "hoeveelheid": 10,
      "tarief": 0,
      "mu_per_eenheid": 0.5,
      "arbeids_tarief": ${standaardArbeidstarief},
      "onderaanneming_bedrag": 0,
      "is_staartkosten": false,
      "is_bouwplaatskosten": false,
      "klanttekst": "Tekst voor in de offerte"
    }
  ],
  "waarschuwingen": ["Controleer hoeveelheid doorvoeringen op tekening"]
}

Toegestane hoofdstukken: ${HOOFDSTUKKEN.join(", ")}
Toegestane categorieën: ${CATEGORIEEN.join(", ")}`;

    if (!heeftGateway()) {
      return res.json({ regels: [], waarschuwingen: ["AI is niet beschikbaar in deze omgeving."] });
    }

    const calcRegelResultaat = await aiGateway.chat("default", {
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 2000,
    });

    const raw = (calcRegelResultaat.ok ? calcRegelResultaat.inhoud : "{}").trim();
    let regels: unknown[] = [];
    let waarschuwingen: string[] = [];
    try {
      const parsed = JSON.parse(raw.startsWith("```") ? raw.replace(/```json?\n?/g, "").replace(/```/g, "") : raw) as Record<string, unknown>;
      regels = Array.isArray(parsed["regels"]) ? (parsed["regels"] as unknown[]) : [];
      waarschuwingen = Array.isArray(parsed["waarschuwingen"]) ? (parsed["waarschuwingen"] as string[]) : [];
    } catch {
      regels = [];
    }

    res.json({ regels, waarschuwingen });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "AI-voorstel mislukt" });
  }
});

// ── Maak offerte vanuit calculatie ─────────────────────────────────────────
router.post("/modules/calculaties/:id/maak-offerte", schrijvenCalc, async (req, res) => {
  try {
    const id = parseId(req.params["id"]);

    const [header] = await db.select().from(modCalcHeadersTable).where(eq(modCalcHeadersTable.id, id));
    if (!header) return res.status(404).json({ error: "Calculatie niet gevonden" });

    const regels = await db.select().from(modCalcRegelsTable)
      .where(eq(modCalcRegelsTable.calculatieId, id))
      .orderBy(asc(modCalcRegelsTable.volgorde));

    const subtotaal = regels.reduce((s, r) => s + (r.totaal ?? 0), 0);
    const opslagAbk = (header as any).opslagAbk ?? 10;
    const akBedrag     = Math.round(subtotaal * (header.opslagAk / 100) * 100) / 100;
    const abkBedrag    = Math.round(subtotaal * (opslagAbk / 100) * 100) / 100;
    const risicoBedrag = Math.round(subtotaal * (header.opslagRisico / 100) * 100) / 100;
    const winstBedrag  = Math.round(subtotaal * (header.opslagWinst / 100) * 100) / 100;
    const totaalVoorKorting = subtotaal + akBedrag + abkBedrag + risicoBedrag + winstBedrag;
    const kortingBedrag = Math.round(totaalVoorKorting * (header.korting / 100) * 100) / 100;
    const bedragExcl = Math.round((totaalVoorKorting - kortingBedrag) * 100) / 100;
    const bedragIncl = Math.round(bedragExcl * 1.21 * 100) / 100;

    let gebouwNaam: string | null = null;
    if (header.gebouwId) {
      const [g] = await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, header.gebouwId));
      gebouwNaam = g?.naam ?? null;
    }

    const vandaag = new Date().toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
    const titel = gebouwNaam ? `${header.naam} — ${gebouwNaam}` : header.naam;

    const [offerte] = await db.insert(offertesTable).values({
      titel,
      gebouwId: header.gebouwId ?? null,
      opdrachtgever: header.klantNaam ?? null,
      onsKenmerk: header.referentie ?? null,
      uwKenmerk: `CALC-${header.id}`,
      datum: vandaag,
      geldigheidDagen: 30,
      bedragExclBtw: bedragExcl,
      btwPercentage: 21,
      bedragInclBtw: bedragIncl,
      calculatieId: header.id,
      status: "concept",
      aangemaaktDoorId: req.session.userId ?? null,
    } as typeof offertesTable.$inferInsert).returning();

    if (regels.length > 0) {
      await db.insert(offerteRegelsTable).values(
        regels.map((r, i) => ({
          offerteId: offerte.id,
          categorie: r.isStaartkosten ? "staartkosten" : "maatregel",
          maatregel: r.omschrijving,
          eenheid: r.eenheid || "st",
          aantal: r.hoeveelheid,
          prijsPerEenheid: r.hoeveelheid > 0 ? Math.round((r.totaal / r.hoeveelheid) * 100) / 100 : r.totaal,
          kosten: r.totaal,
          volgorde: i + 1,
        }))
      );
    }

    const opslagen = [
      { label: `Algemene kosten (${header.opslagAk}%)`, bedrag: akBedrag },
      { label: `Algemene bedrijfskosten (${opslagAbk}%)`, bedrag: abkBedrag },
      { label: `Risico (${header.opslagRisico}%)`, bedrag: risicoBedrag },
      { label: `Winst (${header.opslagWinst}%)`, bedrag: winstBedrag },
    ];
    if (header.korting > 0) {
      opslagen.push({ label: `Korting (${header.korting}%)`, bedrag: -kortingBedrag });
    }
    await db.insert(offerteRegelsTable).values(
      opslagen.map((o, i) => ({
        offerteId: offerte.id,
        categorie: "algemene_kosten",
        maatregel: o.label,
        eenheid: "st",
        aantal: 1,
        prijsPerEenheid: o.bedrag,
        kosten: o.bedrag,
        volgorde: regels.length + i + 1,
      }))
    );

    res.status(201).json({ offerte_id: offerte.id });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Versie opslaan ────────────────────────────────────────────────────────
router.post("/modules/calculaties/:id/versie-opslaan", schrijvenCalc, async (req, res) => {
  try {
    const id = parseId(req.params["id"]);
    const [header] = await db.select().from(modCalcHeadersTable).where(eq(modCalcHeadersTable.id, id));
    if (!header) return res.status(404).json({ error: "Calculatie niet gevonden" });

    const regels = await db.select().from(modCalcRegelsTable)
      .where(eq(modCalcRegelsTable.calculatieId, id))
      .orderBy(asc(modCalcRegelsTable.volgorde));

    const [bestaandeVersies] = await db.select({ max: sql<number>`coalesce(max(versienummer),0)` })
      .from(modCalcVersiesTable)
      .where(eq(modCalcVersiesTable.calculatieId, id));

    const volgendNummer = (bestaandeVersies?.max ?? 0) + 1;
    const label = (req.body as Record<string, unknown>).label as string | undefined;

    const snapshot = {
      header: {
        naam: header.naam, referentie: header.referentie, klantNaam: header.klantNaam,
        projectNaam: header.projectNaam, status: header.status, omschrijving: header.omschrijving,
        opslagAk: header.opslagAk, opslagAbk: header.opslagAbk, opslagRisico: header.opslagRisico,
        opslagWinst: header.opslagWinst, korting: header.korting,
      },
      regels: regels.map((r) => ({
        categorie: r.categorie, omschrijving: r.omschrijving, eenheid: r.eenheid,
        hoeveelheid: r.hoeveelheid, tarief: r.tarief, muPerEenheid: r.muPerEenheid,
        arbeidsTarief: r.arbeidsTarief, onderaannemingBedrag: r.onderaannemingBedrag,
        totaal: r.totaal, isStaartkosten: r.isStaartkosten, hoofdstuk: r.hoofdstuk,
      })),
    };

    const [versie] = await db.insert(modCalcVersiesTable).values({
      calculatieId: id,
      versienummer: volgendNummer,
      label: label ?? `Versie ${volgendNummer}`,
      snapshot: snapshot as Record<string, unknown>,
      aangemaaktDoorId: req.session.userId ?? null,
    }).returning();

    res.status(201).json({
      id: versie.id,
      versienummer: versie.versienummer,
      label: versie.label,
      aangemaakt_op: iso(versie.aangemaaktOp),
    });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.get("/modules/calculaties/:id/versies", lezenCalc, async (req, res) => {
  try {
    const id = parseId(req.params["id"]);
    const rows = await db.select({
      id: modCalcVersiesTable.id,
      versienummer: modCalcVersiesTable.versienummer,
      label: modCalcVersiesTable.label,
      aangemaaktOp: modCalcVersiesTable.aangemaaktOp,
      aangemaaktDoorId: modCalcVersiesTable.aangemaaktDoorId,
    }).from(modCalcVersiesTable)
      .where(eq(modCalcVersiesTable.calculatieId, id))
      .orderBy(desc(modCalcVersiesTable.versienummer));

    res.json(rows.map((v) => ({
      id: v.id,
      versienummer: v.versienummer,
      label: v.label,
      aangemaakt_op: iso(v.aangemaaktOp),
    })));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.get("/modules/calculaties/:id/versies/:versieId", lezenCalc, async (req, res) => {
  try {
    const versieId = parseId(req.params["versieId"]);
    const [v] = await db.select().from(modCalcVersiesTable).where(eq(modCalcVersiesTable.id, versieId));
    if (!v) return res.status(404).json({ error: "Versie niet gevonden" });
    res.json({
      id: v.id,
      versienummer: v.versienummer,
      label: v.label,
      snapshot: v.snapshot,
      aangemaakt_op: iso(v.aangemaaktOp),
    });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Print-data endpoint ────────────────────────────────────────────────────
router.get("/modules/calculaties/:id/print-data", lezenCalc, async (req, res) => {
  try {
    const id = parseId(req.params["id"]);
    const [header] = await db.select().from(modCalcHeadersTable).where(eq(modCalcHeadersTable.id, id));
    if (!header) return res.status(404).json({ error: "Calculatie niet gevonden" });

    const regels = await db.select().from(modCalcRegelsTable)
      .where(eq(modCalcRegelsTable.calculatieId, id))
      .orderBy(asc(modCalcRegelsTable.volgorde));

    let gebouwNaam: string | null = null;
    if (header.gebouwId) {
      const [g] = await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, header.gebouwId));
      gebouwNaam = g?.naam ?? null;
    }

    const subtotaal = regels.filter((r) => !r.isStaartkosten).reduce((s, r) => s + (r.totaal ?? 0), 0);
    const staarttotaal = regels.filter((r) => r.isStaartkosten).reduce((s, r) => s + (r.totaal ?? 0), 0);
    const opslagAbk = header.opslagAbk ?? 10;
    const akBedrag = Math.round(subtotaal * (header.opslagAk / 100) * 100) / 100;
    const abkBedrag = Math.round(subtotaal * (opslagAbk / 100) * 100) / 100;
    const risicoBedrag = Math.round(subtotaal * (header.opslagRisico / 100) * 100) / 100;
    const winstBedrag = Math.round(subtotaal * (header.opslagWinst / 100) * 100) / 100;
    const voorKorting = subtotaal + staarttotaal + akBedrag + abkBedrag + risicoBedrag + winstBedrag;
    const kortingBedrag = Math.round(voorKorting * (header.korting / 100) * 100) / 100;
    const eindtotaal = voorKorting - kortingBedrag;

    res.json({
      header: {
        id: header.id, naam: header.naam, referentie: header.referentie,
        klant_naam: header.klantNaam, project_naam: header.projectNaam,
        status: header.status, omschrijving: header.omschrijving,
        opslag_ak: header.opslagAk, opslag_abk: opslagAbk,
        opslag_risico: header.opslagRisico, opslag_winst: header.opslagWinst,
        korting: header.korting, gebouw_naam: gebouwNaam,
        aangemaakt_op: iso(header.aangemaaktOp),
      },
      regels: regels.map((r) => ({
        id: r.id, categorie: r.categorie, omschrijving: r.omschrijving,
        eenheid: r.eenheid, hoeveelheid: r.hoeveelheid, tarief: r.tarief,
        mu_per_eenheid: r.muPerEenheid, arbeids_tarief: r.arbeidsTarief,
        onderaanneming_bedrag: r.onderaannemingBedrag, totaal: r.totaal,
        is_staartkosten: r.isStaartkosten, hoofdstuk: r.hoofdstuk,
        regelnummer: r.regelnummer,
      })),
      totalen: {
        subtotaal, staarttotaal, ak_bedrag: akBedrag, abk_bedrag: abkBedrag,
        risico_bedrag: risicoBedrag, winst_bedrag: winstBedrag,
        korting_bedrag: kortingBedrag, eindtotaal,
        excl_btw: eindtotaal, incl_btw: Math.round(eindtotaal * 1.21 * 100) / 100,
      },
    });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Calculatie inkoopitems (offertes materialen / onderaannemers) ────────────

router.get("/modules/calculaties/:id/inkoop-items", lezenCalc, async (req, res) => {
  try {
    const id = parseId(req.params["id"]);
    const items = await db
      .select()
      .from(modCalcInkoopItemsTable)
      .where(eq(modCalcInkoopItemsTable.calculatieId, id))
      .orderBy(asc(modCalcInkoopItemsTable.aangemaaktOp));
    res.json(items.map((i) => ({
      id: i.id,
      calculatie_id: i.calculatieId,
      type: i.type,
      omschrijving: i.omschrijving,
      leverancier: i.leverancier,
      status: i.status,
      datum_verstuurd: i.datumVerstuurd,
      datum_ontvangen: i.datumOntvangen,
      bedrag: i.bedrag,
      notities: i.notities,
      aangemaakt_op: iso(i.aangemaaktOp),
      bijgewerkt_op: iso(i.bijgewerktOp),
    })));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.post("/modules/calculaties/:id/inkoop-items", schrijvenCalc, async (req, res) => {
  try {
    const id = parseId(req.params["id"]);
    const [calc] = await db.select({ id: modCalcHeadersTable.id }).from(modCalcHeadersTable).where(eq(modCalcHeadersTable.id, id));
    if (!calc) return res.status(404).json({ error: "Calculatie niet gevonden" });
    const body = req.body as {
      type?: string; omschrijving: string; leverancier?: string;
      status?: string; datum_verstuurd?: string; datum_ontvangen?: string;
      bedrag?: number; notities?: string;
    };
    if (!body.omschrijving?.trim()) return res.status(422).json({ error: "Omschrijving is verplicht" });
    const [item] = await db.insert(modCalcInkoopItemsTable).values({
      calculatieId: id,
      type: body.type ?? "materiaal",
      omschrijving: body.omschrijving.trim(),
      leverancier: body.leverancier ?? null,
      status: body.status ?? "te_versturen",
      datumVerstuurd: body.datum_verstuurd ?? null,
      datumOntvangen: body.datum_ontvangen ?? null,
      bedrag: body.bedrag ?? null,
      notities: body.notities ?? null,
    }).returning();
    res.status(201).json({
      id: item.id, calculatie_id: item.calculatieId, type: item.type,
      omschrijving: item.omschrijving, leverancier: item.leverancier,
      status: item.status, datum_verstuurd: item.datumVerstuurd,
      datum_ontvangen: item.datumOntvangen, bedrag: item.bedrag,
      notities: item.notities, aangemaakt_op: iso(item.aangemaaktOp),
      bijgewerkt_op: iso(item.bijgewerktOp),
    });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.patch("/modules/calculaties/:id/inkoop-items/:itemId", schrijvenCalc, async (req, res) => {
  try {
    const itemId = parseId(req.params["itemId"]);
    const body = req.body as Partial<{
      type: string; omschrijving: string; leverancier: string | null;
      status: string; datum_verstuurd: string | null; datum_ontvangen: string | null;
      bedrag: number | null; notities: string | null;
    }>;
    const upd: Record<string, unknown> = { bijgewerktOp: new Date() };
    if (body.type !== undefined) upd["type"] = body.type;
    if (body.omschrijving !== undefined) upd["omschrijving"] = body.omschrijving;
    if (body.leverancier !== undefined) upd["leverancier"] = body.leverancier;
    if (body.status !== undefined) upd["status"] = body.status;
    if (body.datum_verstuurd !== undefined) upd["datumVerstuurd"] = body.datum_verstuurd;
    if (body.datum_ontvangen !== undefined) upd["datumOntvangen"] = body.datum_ontvangen;
    if (body.bedrag !== undefined) upd["bedrag"] = body.bedrag;
    if (body.notities !== undefined) upd["notities"] = body.notities;
    const [item] = await db.update(modCalcInkoopItemsTable)
      .set(upd)
      .where(eq(modCalcInkoopItemsTable.id, itemId))
      .returning();
    if (!item) return res.status(404).json({ error: "Item niet gevonden" });
    res.json({
      id: item.id, calculatie_id: item.calculatieId, type: item.type,
      omschrijving: item.omschrijving, leverancier: item.leverancier,
      status: item.status, datum_verstuurd: item.datumVerstuurd,
      datum_ontvangen: item.datumOntvangen, bedrag: item.bedrag,
      notities: item.notities, aangemaakt_op: iso(item.aangemaaktOp),
      bijgewerkt_op: iso(item.bijgewerktOp),
    });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.delete("/modules/calculaties/:id/inkoop-items/:itemId", schrijvenCalc, async (req, res) => {
  try {
    const itemId = parseId(req.params["itemId"]);
    await db.delete(modCalcInkoopItemsTable).where(eq(modCalcInkoopItemsTable.id, itemId));
    res.status(204).end();
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── POST /modules/calculaties/:id/ai-chat ─────────────────────────────────
router.post("/modules/calculaties/:id/ai-chat", lezenCalc, async (req, res) => {
  try {
    const id = parseId(req.params["id"]);
    const { berichten, afbeelding_base64 } = req.body as {
      berichten: Array<{ rol: "gebruiker" | "assistent"; inhoud: string }>;
      afbeelding_base64?: string | null;
    };

    if (!Array.isArray(berichten) || berichten.length === 0) {
      res.status(400).json({ error: "Berichten ontbreken" }); return;
    }

    const [header] = await db.select().from(modCalcHeadersTable).where(eq(modCalcHeadersTable.id, id));
    if (!header) { res.status(404).json({ error: "Calculatie niet gevonden" }); return; }

    const [bestaandeRegels, normtijden, tarieven] = await Promise.all([
      db.select().from(modCalcRegelsTable)
        .where(eq(modCalcRegelsTable.calculatieId, id))
        .orderBy(asc(modCalcRegelsTable.volgorde)),
      db.select().from(modCalcNormtijdenTable).where(eq(modCalcNormtijdenTable.actief, true)).limit(40),
      db.select().from(modCalcTarievenTable)
        .where(eq(modCalcTarievenTable.actief, true))
        .orderBy(asc(modCalcTarievenTable.categorie), asc(modCalcTarievenTable.naam)),
    ]);

    let gebouwInfo = "";
    let spotenInfo = "";
    let opnameInfo = "";

    if (header.gebouwId) {
      const gId = header.gebouwId;
      const [[g], spotCounts, opnameItems] = await Promise.all([
        db.select().from(gebouwenTable).where(eq(gebouwenTable.id, gId)).limit(1),
        db.select({ type: voorzieningenTable.type, aantal: count() })
          .from(voorzieningenTable)
          .where(and(eq(voorzieningenTable.gebouwId, gId), eq(voorzieningenTable.gearchiveerd, false)))
          .groupBy(voorzieningenTable.type),
        db.select({
          opnameNaam: opnamesTable.naam,
          opnameDatum: opnamesTable.datum,
          spotType: opnameItemsTable.spotType,
          actie: opnameItemsTable.actie,
          aantal: opnameItemsTable.aantal,
          afmetingen: opnameItemsTable.afmetingen,
          prioriteit: opnameItemsTable.prioriteit,
          beschrijving: opnameItemsTable.beschrijving,
        })
          .from(opnamesTable)
          .innerJoin(opnameItemsTable, eq(opnameItemsTable.opnameId, opnamesTable.id))
          .where(eq(opnamesTable.gebouwId, gId))
          .orderBy(desc(opnamesTable.datum))
          .limit(80),
      ]);
      if (g) {
        gebouwInfo = `Gebouw: ${g.naam}, ${(g as any).adres ?? ""} ${(g as any).stad ?? ""}. Bouwjaar: ${(g as any).bouwjaar ?? "onbekend"}.`;
      }
      if (spotCounts.length > 0) {
        spotenInfo = "Geregistreerde spots in dit gebouw:\n" +
          spotCounts.map((s) => `- ${s.type}: ${s.aantal} stuks`).join("\n");
      }
      if (opnameItems.length > 0) {
        opnameInfo = "Veldopname bevindingen:\n" +
          opnameItems.map((item) => {
            const d: string[] = [`${item.spotType}: ${item.actie} × ${item.aantal}`];
            if (item.afmetingen) d.push(`afm: ${item.afmetingen}`);
            if (item.prioriteit === "hoog") d.push("prioriteit: hoog");
            if (item.beschrijving) d.push(item.beschrijving);
            return `- ${d.join(" | ")}`;
          }).join("\n");
      }
    }

    const regelenLijst = bestaandeRegels.length > 0
      ? bestaandeRegels.map((r) =>
          `- ${(r as any).hoofdstuk ?? "Overige"} | ${r.categorie} | ${r.omschrijving} | ${r.hoeveelheid} ${r.eenheid} | €${r.tarief}${r.muPerEenheid ? ` | MU: ${r.muPerEenheid}` : ""}`
        ).join("\n")
      : "(nog geen regels ingevoerd)";

    const normtijdLijst = normtijden.length > 0
      ? normtijden.map((n) => `${n.code}: ${n.omschrijving} (${n.urenPerEenheid} uur/${n.eenheid})`).join("\n")
      : "(geen normtijden geconfigureerd)";

    const tarievenLijst = tarieven.length > 0
      ? tarieven.map((t) => `[${t.categorie}] ${t.naam}: €${t.tarief}/${t.eenheid}`).join("\n")
      : "(geen tarieven geconfigureerd — gebruik marktprijzen)";

    const systeemPrompt = `Je bent een ervaren calculatie-expert brandpreventie voor FPS Brandpreventie (Nederland).
Je helpt de calculateur bij het opstellen, beoordelen en verbeteren van calculaties voor brandwerende werkzaamheden.

CALCULATIE: ${header.naam}${header.projectNaam ? ` — Project: ${header.projectNaam}` : ""}${header.omschrijving ? `\nOmschrijving: ${header.omschrijving}` : ""}
Status: ${header.status ?? "concept"}
${gebouwInfo ? `\n${gebouwInfo}` : ""}
${spotenInfo ? `\n${spotenInfo}` : ""}
${opnameInfo ? `\n${opnameInfo}` : ""}

HUIDIGE CALCULATIEREGELS (${bestaandeRegels.length} regels):
${regelenLijst}

BESCHIKBARE NORMTIJDEN:
${normtijdLijst}

TARIEVEN UIT HET SYSTEEM:
${tarievenLijst}

Jouw taken als calculatie-assistent:
- Beoordeel technische uitvoering van werkzaamheden (doorvoeringen, brandwerende deuren, wanden, bekleding, manchetten, coatings)
- Signaleer ontbrekende posten (sloop, reinigen, herstel, steigers, bouwplaatskosten, risico-opslagen)
- Controleer eenheden: st = stuks, m² = oppervlakte, m¹ of lm = lijnmeter, uur = arbeidstijd
- Beoordeel realisme van hoeveelheden en tarieven voor brandpreventie-projecten in Nederland
- Adviseer over technische uitvoeringsmethoden conform WBDBO, NEN-EN 1634, EN 13501, BRL 0703 e.d.
- Vergelijk met eerder ingevoerde regels op volledigheid en consistentie
- Analyseer schetsen of tekeningen als die worden gedeeld (benoem spots, aansluitdetails, etc.)

Antwoord altijd in het Nederlands. Geef concrete, praktische adviezen. Wees kritisch maar constructief.`;

    if (!heeftGateway()) {
      res.json({ antwoord: "AI-chat is niet beschikbaar. Controleer de OpenAI-configuratie.", signalen: [] });
      return;
    }

    type Msg = { role: "system" | "user" | "assistant"; content: string | Array<Record<string, unknown>> };
    const messages: Msg[] = [{ role: "system", content: systeemPrompt }];

    for (let i = 0; i < berichten.length; i++) {
      const b = berichten[i]!;
      if (b.rol === "gebruiker") {
        if (i === berichten.length - 1 && afbeelding_base64) {
          messages.push({
            role: "user",
            content: [
              { type: "text", text: b.inhoud },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${afbeelding_base64}` } },
            ],
          });
        } else {
          messages.push({ role: "user", content: b.inhoud });
        }
      } else {
        messages.push({ role: "assistant", content: b.inhoud });
      }
    }

    const calcChatResultaat = await aiGateway.chat("reasoning", {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: messages as any,
      max_completion_tokens: 2000,
    });

    const antwoord = calcChatResultaat.ok ? calcChatResultaat.inhoud : "Geen antwoord ontvangen.";

    const signalen: string[] = [];
    const lw = antwoord.toLowerCase();
    if (lw.includes("ontbreekt") || lw.includes("ontbrekend") || lw.includes("vergeten")) {
      signalen.push("Mogelijke ontbrekende posten gesignaleerd");
    }
    if (lw.includes("eenheid") && (lw.includes("klopt niet") || lw.includes("onjuist") || lw.includes("let op"))) {
      signalen.push("Eenheden controlepunt aangewezen");
    }
    if (lw.includes("tarief") && (lw.includes("laag") || lw.includes("hoog") || lw.includes("afwijkend"))) {
      signalen.push("Tariefafwijking gedetecteerd");
    }

    res.json({ antwoord, signalen });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout bij AI-chat" });
  }
});

export default router;
