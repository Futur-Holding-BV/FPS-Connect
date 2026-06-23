// Module Calculatie routes — /api/modules/calculaties/*
// V2.1: ABK, uitgebreide regelkolommen (MU, arbeid, onderaanneming), staartkosten, 3 weergaven.
import { Router } from "express";
import {
  db,
  modCalcHeadersTable,
  modCalcRegelsTable,
  modCalcTarievenTable,
  modCalcNormtijdenTable,
  gebouwenTable,
  gebruikersTable,
  offertesTable,
  offerteRegelsTable,
} from "@workspace/db";
import { eq, desc, asc, ilike, or } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";

const router = Router();
const iso = (d: Date) => d.toISOString();

const lezenCalc = requireBevoegdheid("calculaties", 1);
const schrijvenCalc = requireBevoegdheid("calculaties", 2);
const aanmakenCalc = requireBevoegdheid("calculaties", 3);
const verwijderenCalc = requireBevoegdheid("calculaties", 4);

function parseId(v: unknown): number {
  return parseInt(String(v), 10);
}

function berekenTotalen(
  regels: Array<{ totaal: number }>,
  header: {
    opslagAk: number;
    opslagAbk: number;
    opslagRisico: number;
    opslagWinst: number;
    korting: number;
  },
) {
  const subtotaal = regels.reduce((s, r) => s + (r.totaal ?? 0), 0);
  const akBedrag    = subtotaal * (header.opslagAk / 100);
  const abkBedrag   = subtotaal * (header.opslagAbk / 100);
  const risicoBedrag = subtotaal * (header.opslagRisico / 100);
  const winstBedrag  = subtotaal * (header.opslagWinst / 100);
  const totaalVoorKorting = subtotaal + akBedrag + abkBedrag + risicoBedrag + winstBedrag;
  const kortingBedrag = totaalVoorKorting * (header.korting / 100);
  return {
    subtotaal: Math.round(subtotaal * 100) / 100,
    totaal_na_opslagen: Math.round((totaalVoorKorting - kortingBedrag) * 100) / 100,
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
    opslag_ak: h.opslagAk,
    opslag_abk: (h as any).opslagAbk ?? 10,
    opslag_risico: h.opslagRisico,
    opslag_winst: h.opslagWinst,
    korting: h.korting,
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
    is_staartkosten: (r as any).isStaartkosten ?? false,
    materiaal_totaal: materiaalTotaal,
    mu_totaal: muTotaal,
    arbeidsloon,
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

    const allRegels = await db.select({ cid: modCalcRegelsTable.calculatieId, totaal: modCalcRegelsTable.totaal })
      .from(modCalcRegelsTable);
    const regelsByCalc = new Map<number, number>();
    for (const r of allRegels) {
      regelsByCalc.set(r.cid, (regelsByCalc.get(r.cid) ?? 0) + r.totaal);
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
      const subtotaal = regelsByCalc.get(header.id) ?? 0;
      const { totaal_na_opslagen } = berekenTotalen([{ totaal: subtotaal }], {
        opslagAk: header.opslagAk,
        opslagAbk: (header as any).opslagAbk ?? 10,
        opslagRisico: header.opslagRisico,
        opslagWinst: header.opslagWinst,
        korting: header.korting,
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
      opslag_ak = 15, opslag_abk = 10, opslag_risico = 5, opslag_winst = 10, korting = 0,
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
      opslagAk: Number(opslag_ak),
      opslagAbk: Number(opslag_abk),
      opslagRisico: Number(opslag_risico),
      opslagWinst: Number(opslag_winst),
      korting: Number(korting),
      aangemaaktDoorId: (req as any).session?.gebruikerId ?? null,
    } as typeof modCalcHeadersTable.$inferInsert).returning();

    res.status(201).json(mapHeader(row, { subtotaal: 0, totaalNaOpslagen: 0 }));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

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
    const { subtotaal, totaal_na_opslagen } = berekenTotalen(regels, {
      opslagAk: headerRow.header.opslagAk,
      opslagAbk: (headerRow.header as any).opslagAbk ?? 10,
      opslagRisico: headerRow.header.opslagRisico,
      opslagWinst: headerRow.header.opslagWinst,
      korting: headerRow.header.korting,
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
    if (body.opslag_ak !== undefined) update.opslagAk = Number(body.opslag_ak);
    if (body.opslag_abk !== undefined) (update as any).opslagAbk = Number(body.opslag_abk);
    if (body.opslag_risico !== undefined) update.opslagRisico = Number(body.opslag_risico);
    if (body.opslag_winst !== undefined) update.opslagWinst = Number(body.opslag_winst);
    if (body.korting !== undefined) update.korting = Number(body.korting);
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
      opslagAk: original.opslagAk,
      opslagAbk: (original as any).opslagAbk ?? 10,
      opslagRisico: original.opslagRisico,
      opslagWinst: original.opslagWinst,
      korting: original.korting,
      aangemaaktDoorId: (req as any).session?.gebruikerId ?? null,
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
          isStaartkosten: (r as any).isStaartkosten ?? false,
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
      regelnummer, is_staartkosten = false } = body;
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
    if (body.is_staartkosten !== undefined) (update as any).isStaartkosten = Boolean(body.is_staartkosten);
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
          categorie: (r as any).isStaartkosten ? "staartkosten" : "maatregel",
          omschrijving: r.omschrijving,
          eenheid: r.eenheid,
          hoeveelheid: r.hoeveelheid,
          eenheidsprijs: r.hoeveelheid > 0 ? Math.round((r.totaal / r.hoeveelheid) * 100) / 100 : r.totaal,
          totaalprijs: r.totaal,
          volgorde: i + 1,
        } as typeof offerteRegelsTable.$inferInsert))
      );
    }

    const opslagen = [
      { omschrijving: `Algemene kosten (${header.opslagAk}%)`, bedrag: akBedrag },
      { omschrijving: `Algemene bedrijfskosten (${opslagAbk}%)`, bedrag: abkBedrag },
      { omschrijving: `Risico (${header.opslagRisico}%)`, bedrag: risicoBedrag },
      { omschrijving: `Winst (${header.opslagWinst}%)`, bedrag: winstBedrag },
    ];
    if (header.korting > 0) {
      opslagen.push({ omschrijving: `Korting (${header.korting}%)`, bedrag: -kortingBedrag });
    }
    await db.insert(offerteRegelsTable).values(
      opslagen.map((o, i) => ({
        offerteId: offerte.id,
        categorie: "algemene_kosten",
        omschrijving: o.omschrijving,
        eenheid: "lump_sum",
        hoeveelheid: 1,
        eenheidsprijs: o.bedrag,
        totaalprijs: o.bedrag,
        volgorde: (regels.length + i + 1),
      } as typeof offerteRegelsTable.$inferInsert))
    );

    res.status(201).json({ offerte_id: offerte.id });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

export default router;
