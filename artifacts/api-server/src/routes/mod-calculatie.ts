// Module Calculatie routes — /api/modules/calculaties/*
// Rijkere calculatiemodule naast bestaande /api/calculaties (FPS Connect).
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

function berekenTotalen(regels: Array<{ totaal: number }>, header: {
  opslagAk: number; opslagRisico: number; opslagWinst: number; korting: number;
}) {
  const subtotaal = regels.reduce((s, r) => s + (r.totaal ?? 0), 0);
  const akBedrag = subtotaal * (header.opslagAk / 100);
  const risicoBedrag = subtotaal * (header.opslagRisico / 100);
  const winstBedrag = subtotaal * (header.opslagWinst / 100);
  const totaalVoorKorting = subtotaal + akBedrag + risicoBedrag + winstBedrag;
  const kortingBedrag = totaalVoorKorting * (header.korting / 100);
  return {
    subtotaal: Math.round(subtotaal * 100) / 100,
    totaal_na_opslagen: Math.round((totaalVoorKorting - kortingBedrag) * 100) / 100,
  };
}

function mapHeader(
  h: typeof modCalcHeadersTable.$inferSelect,
  extra?: { gebouwNaam?: string | null; aangemaaktDoorNaam?: string | null; subtotaal?: number; totaalNaOpslagen?: number },
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
  return {
    id: r.id,
    calculatie_id: r.calculatieId,
    categorie: r.categorie,
    omschrijving: r.omschrijving,
    normtijd_id: r.normtijdId,
    normtijd_code: normtijdCode ?? null,
    eenheid: r.eenheid,
    hoeveelheid: r.hoeveelheid,
    tarief: r.tarief,
    totaal: r.totaal,
    volgorde: r.volgorde,
    opmerkingen: r.opmerkingen,
  };
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

    // Haal subtotalen op per calculatie
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
        opslagAk: header.opslagAk, opslagRisico: header.opslagRisico,
        opslagWinst: header.opslagWinst, korting: header.korting,
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
      omschrijving, opmerkingen, opslag_ak = 15, opslag_risico = 5, opslag_winst = 10, korting = 0,
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
      opslagRisico: Number(opslag_risico),
      opslagWinst: Number(opslag_winst),
      korting: Number(korting),
      aangemaaktDoorId: (req as any).session?.gebruikerId ?? null,
    }).returning();

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
      opslagAk: headerRow.header.opslagAk, opslagRisico: headerRow.header.opslagRisico,
      opslagWinst: headerRow.header.opslagWinst, korting: headerRow.header.korting,
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
      opslagRisico: original.opslagRisico,
      opslagWinst: original.opslagWinst,
      korting: original.korting,
      aangemaaktDoorId: (req as any).session?.gebruikerId ?? null,
    }).returning();

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
        }))
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

    const { categorie = "arbeid", omschrijving, normtijd_id, eenheid = "st", hoeveelheid = 0, tarief = 0, volgorde = 0, opmerkingen } =
      req.body as Record<string, unknown>;
    if (!omschrijving) return res.status(400).json({ error: "omschrijving is verplicht" });

    const hv = Number(hoeveelheid);
    const t = Number(tarief);
    const totaal = Math.round(hv * t * 100) / 100;

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
    }).returning();

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
    const update: Partial<typeof modCalcRegelsTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (body.categorie !== undefined) update.categorie = String(body.categorie);
    if (body.omschrijving !== undefined) update.omschrijving = String(body.omschrijving);
    if (body.normtijd_id !== undefined) update.normtijdId = body.normtijd_id ? Number(body.normtijd_id) : null;
    if (body.eenheid !== undefined) update.eenheid = String(body.eenheid);
    if (body.volgorde !== undefined) update.volgorde = Number(body.volgorde);
    if (body.opmerkingen !== undefined) update.opmerkingen = body.opmerkingen ? String(body.opmerkingen) : null;

    const [existing] = await db.select().from(modCalcRegelsTable).where(eq(modCalcRegelsTable.id, regelId));
    if (!existing) return res.status(404).json({ error: "Niet gevonden" });

    const hv = body.hoeveelheid !== undefined ? Number(body.hoeveelheid) : existing.hoeveelheid;
    const t = body.tarief !== undefined ? Number(body.tarief) : existing.tarief;
    update.hoeveelheid = hv;
    update.tarief = t;
    update.totaal = Math.round(hv * t * 100) / 100;

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
// Leest de mod_calc_headers + regels en genereert een concept-offerte met
// bijbehorende offerte_regels. Arbeid/materiaal/etc. worden maatregel-regels;
// AK, risico, winst en korting worden algemene_kosten-regels.
router.post("/modules/calculaties/:id/maak-offerte", schrijvenCalc, async (req, res) => {
  try {
    const id = parseId(req.params["id"]);

    // Haal header op
    const [header] = await db
      .select()
      .from(modCalcHeadersTable)
      .where(eq(modCalcHeadersTable.id, id));
    if (!header) return res.status(404).json({ error: "Calculatie niet gevonden" });

    // Haal regels op
    const regels = await db
      .select()
      .from(modCalcRegelsTable)
      .where(eq(modCalcRegelsTable.calculatieId, id))
      .orderBy(asc(modCalcRegelsTable.volgorde));

    // Bereken totalen
    const subtotaal = regels.reduce((s, r) => s + (r.totaal ?? 0), 0);
    const akBedrag    = Math.round(subtotaal * (header.opslagAk / 100) * 100) / 100;
    const risicoBedrag = Math.round(subtotaal * (header.opslagRisico / 100) * 100) / 100;
    const winstBedrag  = Math.round(subtotaal * (header.opslagWinst / 100) * 100) / 100;
    const totaalVoorKorting = subtotaal + akBedrag + risicoBedrag + winstBedrag;
    const kortingBedrag = Math.round(totaalVoorKorting * (header.korting / 100) * 100) / 100;
    const bedragExcl = Math.round((totaalVoorKorting - kortingBedrag) * 100) / 100;
    const bedragIncl = Math.round(bedragExcl * 1.21 * 100) / 100;

    // Gebouwnaam ophalen voor de titel
    let gebouwNaam: string | null = null;
    if (header.gebouwId) {
      const [g] = await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, header.gebouwId));
      gebouwNaam = g?.naam ?? null;
    }

    const vandaag = new Date().toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
    const titel = gebouwNaam ? `${header.naam} — ${gebouwNaam}` : header.naam;

    // Maak offerte aan
    const [offerte] = await db
      .insert(offertesTable)
      .values({
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
      } as typeof offertesTable.$inferInsert)
      .returning();

    // Maak offerte_regels aan vanuit calculatieregels (als maatregel-regels)
    let volgorde = 1;
    for (const r of regels) {
      await db.insert(offerteRegelsTable).values({
        offerteId: offerte.id,
        categorie: "maatregel",
        maatregel: r.omschrijving,
        uitgangspunten: r.categorie !== "arbeid" ? r.categorie.charAt(0).toUpperCase() + r.categorie.slice(1) : null,
        eenheid: r.eenheid,
        aantal: r.hoeveelheid,
        prijsPerEenheid: r.tarief,
        kosten: r.totaal,
        volgorde: volgorde++,
      });
    }

    // AK/ABK-opslag als algemene_kosten-regel
    if (header.opslagAk > 0) {
      await db.insert(offerteRegelsTable).values({
        offerteId: offerte.id,
        categorie: "algemene_kosten",
        maatregel: `AK/ABK (${header.opslagAk}%)`,
        eenheid: "ls",
        aantal: 1,
        prijsPerEenheid: akBedrag,
        kosten: akBedrag,
        volgorde: volgorde++,
      });
    }

    // Risico-opslag
    if (header.opslagRisico > 0) {
      await db.insert(offerteRegelsTable).values({
        offerteId: offerte.id,
        categorie: "algemene_kosten",
        maatregel: `Risico-opslag (${header.opslagRisico}%)`,
        eenheid: "ls",
        aantal: 1,
        prijsPerEenheid: risicoBedrag,
        kosten: risicoBedrag,
        volgorde: volgorde++,
      });
    }

    // Winst & risico
    if (header.opslagWinst > 0) {
      await db.insert(offerteRegelsTable).values({
        offerteId: offerte.id,
        categorie: "algemene_kosten",
        maatregel: `Winst & risico (${header.opslagWinst}%)`,
        eenheid: "ls",
        aantal: 1,
        prijsPerEenheid: winstBedrag,
        kosten: winstBedrag,
        volgorde: volgorde++,
      });
    }

    // Korting (als negatief bedrag)
    if (header.korting > 0) {
      await db.insert(offerteRegelsTable).values({
        offerteId: offerte.id,
        categorie: "algemene_kosten",
        maatregel: `Korting (${header.korting}%)`,
        eenheid: "ls",
        aantal: 1,
        prijsPerEenheid: -kortingBedrag,
        kosten: -kortingBedrag,
        volgorde: volgorde++,
      });
    }

    res.status(201).json({ offerte_id: offerte.id });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

export default router;
