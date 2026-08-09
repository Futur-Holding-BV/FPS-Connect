import { Router } from "express";
import { db } from "@workspace/db";
import {
  loginPogingenTable,
  helpdeskTicketsTable,
  feedbackTable,
  muisGebeurtenissenTable,
  moduleBeoordelingenTable,
  gebruikersTable,
  appInstellingenTable,
} from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";

const router = Router();
const alleenBeheerder = requireBevoegdheid("systeem", 1);

async function huidigeGebruiker(req: { session: { userId?: number } }) {
  const id = req.session.userId;
  if (!id) return null;
  const [g] = await db.select().from(gebruikersTable).where(eq(gebruikersTable.id, id));
  return g ?? null;
}

// ── METING LEVERANCIER_01 (read-only, hoofdbeheerder) ───────────────────────
// Vijf tellingen uit de opdracht LEVERANCIER_01 §2: hoe groot is het probleem
// dat leveranciersfacturen in het klantenregister worden opgezocht? Puur
// SELECT's; verandert niets. De gebruikte SQL wordt meegegeven in de respons.
router.get("/meting-leverancier-registers", async (req, res): Promise<void> => {
  try {
    if (!req.permissies?.isHoofdbeheerder) {
      res.status(403).json({ error: "Alleen de hoofdbeheerder mag deze meting draaien" });
      return;
    }
    const q = async (sql: string) => (await db.execute(sql)).rows;
    const norm = (kol: string) =>
      `lower(regexp_replace(${kol}, '\\s*(b\\.?\\s?v\\.?|v\\.?o\\.?f\\.?|n\\.?v\\.?)\\s*$', '', 'i'))`;
    const sqls = {
      registers: `SELECT 'leveranciers' AS register, count(*)::int AS aantal FROM leveranciers UNION ALL SELECT 'crm_klanten', count(*)::int FROM crm_klanten`,
      factuur_verwijzingen: `SELECT count(*) FILTER (WHERE f.leverancier_id IS NOT NULL)::int AS gevuld, count(*) FILTER (WHERE f.leverancier_id IS NOT NULL AND k.id IS NOT NULL)::int AS wijst_naar_bestaande_crm, count(*) FILTER (WHERE f.leverancier_id IS NOT NULL AND k.id IS NULL)::int AS wijst_nergens_naar FROM facturen f LEFT JOIN crm_klanten k ON k.id = f.leverancier_id`,
      crm_doelen_feitelijk_leverancier: `WITH crm_doelen AS (SELECT DISTINCT k.id, k.naam FROM facturen f JOIN crm_klanten k ON k.id = f.leverancier_id) SELECT count(*)::int AS crm_doelen_totaal, count(*) FILTER (WHERE EXISTS (SELECT 1 FROM leveranciers l WHERE ${norm("l.naam")} = ${norm("crm_doelen.naam")}))::int AS ook_in_leveranciers FROM crm_doelen`,
      omvang_probleem: `SELECT count(*)::int AS onnodig_handmatig FROM facturen f WHERE f.leverancier_id IS NULL AND coalesce(f.relatienaam,'') <> '' AND EXISTS (SELECT 1 FROM leveranciers l WHERE ${norm("l.naam")} = ${norm("f.relatienaam")})`,
      omvang_probleem_namen: `SELECT DISTINCT f.relatienaam FROM facturen f WHERE f.leverancier_id IS NULL AND coalesce(f.relatienaam,'') <> '' AND EXISTS (SELECT 1 FROM leveranciers l WHERE ${norm("l.naam")} = ${norm("f.relatienaam")}) ORDER BY 1 LIMIT 100`,
      crm_vervuiling: `SELECT count(*) FILTER (WHERE k.type = 'leverancier')::int AS crm_type_leverancier, count(*) FILTER (WHERE coalesce(k.bron,'') = 'import')::int AS crm_bron_import, count(*) FILTER (WHERE EXISTS (SELECT 1 FROM leveranciers l WHERE ${norm("l.naam")} = ${norm("k.naam")}))::int AS crm_naam_ook_leverancier FROM crm_klanten k`,
    } as const;
    const resultaat: Record<string, { query: string; uitkomst: unknown }> = {};
    for (const [naam, sql] of Object.entries(sqls)) {
      resultaat[naam] = { query: sql, uitkomst: await q(sql) };
    }
    res.json({ gemeten_op: new Date().toISOString(), meting: resultaat });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Meting mislukt" });
  }
});

// ── LOGIN-POGINGEN ──────────────────────────────────────────────────────────
router.get("/login-pogingen", alleenBeheerder, async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select({
        id: loginPogingenTable.id,
        gebruikerId: loginPogingenTable.gebruikerId,
        naam: gebruikersTable.naam,
        email: loginPogingenTable.email,
        ip: loginPogingenTable.ip,
        userAgent: loginPogingenTable.userAgent,
        gelukt: loginPogingenTable.gelukt,
        nieuwApparaat: loginPogingenTable.nieuwApparaat,
        nieuwIp: loginPogingenTable.nieuwIp,
        tijdstip: loginPogingenTable.tijdstip,
      })
      .from(loginPogingenTable)
      .leftJoin(gebruikersTable, eq(loginPogingenTable.gebruikerId, gebruikersTable.id))
      .orderBy(desc(loginPogingenTable.tijdstip))
      .limit(250);
    res.json(
      rows.map((r) => ({
        id: r.id,
        gebruiker_id: r.gebruikerId,
        naam: r.naam,
        email: r.email,
        ip: r.ip,
        user_agent: r.userAgent,
        gelukt: r.gelukt,
        nieuw_apparaat: r.nieuwApparaat,
        nieuw_ip: r.nieuwIp,
        tijdstip: r.tijdstip.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── HELPDESK ─────────────────────────────────────────────────────────────────
function helpdeskRij(t: typeof helpdeskTicketsTable.$inferSelect) {
  return {
    id: t.id,
    gebruiker_id: t.gebruikerId,
    naam: t.naam,
    email: t.email,
    onderwerp: t.onderwerp,
    bericht: t.bericht,
    status: t.status,
    aangemaakt_op: t.aangemaaktOp.toISOString(),
  };
}

router.get("/helpdesk", alleenBeheerder, async (req, res): Promise<void> => {
  try {
    const rows = await db.select().from(helpdeskTicketsTable).orderBy(desc(helpdeskTicketsTable.aangemaaktOp));
    res.json(rows.map(helpdeskRij));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/helpdesk", async (req, res): Promise<void> => {
  try {
    const { onderwerp, bericht } = req.body ?? {};
    if (!onderwerp || !bericht) {
      return void res.status(400).json({ error: "Onderwerp en bericht zijn verplicht" });
    }
    const g = await huidigeGebruiker(req);
    const [ticket] = await db
      .insert(helpdeskTicketsTable)
      .values({
        gebruikerId: g?.id ?? null,
        naam: g?.naam ?? null,
        email: g?.email ?? null,
        onderwerp: String(onderwerp),
        bericht: String(bericht),
      })
      .returning();
    res.status(201).json(helpdeskRij(ticket!));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/helpdesk/:id", alleenBeheerder, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const { status } = req.body ?? {};
    if (!status) return void res.status(400).json({ error: "Status is verplicht" });
    const [ticket] = await db
      .update(helpdeskTicketsTable)
      .set({ status: String(status), bijgewerktOp: new Date() })
      .where(eq(helpdeskTicketsTable.id, id))
      .returning();
    if (!ticket) return void res.status(404).json({ error: "Ticket niet gevonden" });
    res.json(helpdeskRij(ticket));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── FEEDBACK ──────────────────────────────────────────────────────────────────
function feedbackRij(f: typeof feedbackTable.$inferSelect) {
  return {
    id: f.id,
    gebruiker_id: f.gebruikerId,
    naam: f.naam,
    type: f.type,
    waardering: f.waardering,
    bericht: f.bericht,
    pagina: f.pagina,
    aangemaakt_op: f.aangemaaktOp.toISOString(),
  };
}

router.get("/feedback", alleenBeheerder, async (req, res): Promise<void> => {
  try {
    const rows = await db.select().from(feedbackTable).orderBy(desc(feedbackTable.aangemaaktOp));
    res.json(rows.map(feedbackRij));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/feedback", async (req, res): Promise<void> => {
  try {
    const { type, waardering, bericht, pagina } = req.body ?? {};
    if (!bericht) return void res.status(400).json({ error: "Bericht is verplicht" });
    const g = await huidigeGebruiker(req);
    const [fb] = await db
      .insert(feedbackTable)
      .values({
        gebruikerId: g?.id ?? null,
        naam: g?.naam ?? null,
        type: type ? String(type) : "algemeen",
        waardering: typeof waardering === "number" ? waardering : null,
        bericht: String(bericht),
        pagina: pagina ? String(pagina) : null,
      })
      .returning();
    res.status(201).json(feedbackRij(fb!));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── HEATMAPS (muisgebeurtenissen) ────────────────────────────────────────────
router.post("/muis-gebeurtenissen", async (req, res): Promise<void> => {
  try {
    // AVG-grondslag: alleen opslaan als de beheerder de tracker expliciet heeft ingeschakeld.
    const [instelling] = await db.select({ heatmapTrackingIngeschakeld: appInstellingenTable.heatmapTrackingIngeschakeld })
      .from(appInstellingenTable)
      .orderBy(appInstellingenTable.id)
      .limit(1);
    if (!instelling?.heatmapTrackingIngeschakeld) {
      return void res.status(204).send();
    }

    const { gebeurtenissen } = req.body ?? {};
    if (!Array.isArray(gebeurtenissen) || gebeurtenissen.length === 0) {
      return void res.status(204).send();
    }
    const g = await huidigeGebruiker(req);
    const rijen = gebeurtenissen
      .filter((e: any) => e && typeof e.x === "number" && typeof e.y === "number" && e.pagina && e.type)
      .slice(0, 500)
      .map((e: any) => ({
        gebruikerId: g?.id ?? null,
        pagina: String(e.pagina),
        type: String(e.type),
        x: e.x as number,
        y: e.y as number,
      }));
    if (rijen.length > 0) {
      await db.insert(muisGebeurtenissenTable).values(rijen);
    }
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/muis-gebeurtenissen", alleenBeheerder, async (req, res): Promise<void> => {
  try {
    const pagina = req.query.pagina ? String(req.query.pagina) : null;
    const base = db
      .select({
        pagina: muisGebeurtenissenTable.pagina,
        type: muisGebeurtenissenTable.type,
        x: muisGebeurtenissenTable.x,
        y: muisGebeurtenissenTable.y,
      })
      .from(muisGebeurtenissenTable);
    const rows = pagina
      ? await base.where(eq(muisGebeurtenissenTable.pagina, pagina)).limit(5000)
      : await base.limit(5000);
    res.json(rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/muis-gebeurtenissen/paginas", alleenBeheerder, async (req, res): Promise<void> => {
  try {
    const rows = await db
      .selectDistinct({ pagina: muisGebeurtenissenTable.pagina })
      .from(muisGebeurtenissenTable);
    res.json(rows.map((r) => r.pagina));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Helper: loginpoging vastleggen + risicosignalen bepalen ──────────────────
export async function legLoginPogingVast(opts: {
  gebruikerId: number | null;
  email: string;
  ip: string | null;
  userAgent: string | null;
  gelukt: boolean;
}): Promise<{ nieuwApparaat: boolean; nieuwIp: boolean }> {
  let nieuwApparaat = false;
  let nieuwIp = false;
  if (opts.gebruikerId) {
    const eerdere = await db
      .select({ ip: loginPogingenTable.ip, userAgent: loginPogingenTable.userAgent })
      .from(loginPogingenTable)
      .where(and(eq(loginPogingenTable.gebruikerId, opts.gebruikerId), eq(loginPogingenTable.gelukt, true)));
    if (eerdere.length > 0) {
      nieuwApparaat = !!opts.userAgent && !eerdere.some((e) => e.userAgent === opts.userAgent);
      nieuwIp = !!opts.ip && !eerdere.some((e) => e.ip === opts.ip);
    }
  }
  await db.insert(loginPogingenTable).values({
    gebruikerId: opts.gebruikerId,
    email: opts.email,
    ip: opts.ip,
    userAgent: opts.userAgent,
    gelukt: opts.gelukt,
    nieuwApparaat,
    nieuwIp,
  });
  return { nieuwApparaat, nieuwIp };
}

// ── MODULE-BEOORDELINGEN (sign-off ontwikkelstatus) ──────────────────────────
function moduleBeoordelingRij(b: typeof moduleBeoordelingenTable.$inferSelect) {
  return {
    sleutel: b.moduleSleutel,
    status: b.status,
    opmerking: b.opmerking,
    beoordeeld_door_naam: b.beoordeeldDoorNaam,
    bijgewerkt_op: b.bijgewerktOp.toISOString(),
  };
}

// Lezen mag elke ingelogde gebruiker; schrijven is beheerder-only.
router.get("/module-beoordelingen", async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(moduleBeoordelingenTable)
      .orderBy(desc(moduleBeoordelingenTable.bijgewerktOp));
    return void res.json(rows.map(moduleBeoordelingRij));
  } catch (err) {
    req.log.error(err);
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

router.put("/module-beoordelingen/:sleutel", alleenBeheerder, async (req, res): Promise<void> => {
  try {
    const sleutel = String(req.params.sleutel).trim();
    if (!sleutel) return void res.status(400).json({ error: "Sleutel is verplicht" });
    const { status, opmerking } = req.body ?? {};
    if (status !== "gereed" && status !== "niet_akkoord") {
      return void res.status(400).json({ error: "Status moet 'gereed' of 'niet_akkoord' zijn" });
    }
    const opm = opmerking ? String(opmerking) : null;
    const g = await huidigeGebruiker(req);
    const [rij] = await db
      .insert(moduleBeoordelingenTable)
      .values({
        moduleSleutel: sleutel,
        status,
        opmerking: opm,
        beoordeeldDoorId: g?.id ?? null,
        beoordeeldDoorNaam: g?.naam ?? null,
      })
      .onConflictDoUpdate({
        target: moduleBeoordelingenTable.moduleSleutel,
        set: {
          status,
          opmerking: opm,
          beoordeeldDoorId: g?.id ?? null,
          beoordeeldDoorNaam: g?.naam ?? null,
          bijgewerktOp: new Date(),
        },
      })
      .returning();
    return void res.json(moduleBeoordelingRij(rij!));
  } catch (err) {
    req.log.error(err);
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/module-beoordelingen/:sleutel", alleenBeheerder, async (req, res): Promise<void> => {
  try {
    const sleutel = String(req.params.sleutel).trim();
    await db.delete(moduleBeoordelingenTable).where(eq(moduleBeoordelingenTable.moduleSleutel, sleutel));
    return void res.status(204).send();
  } catch (err) {
    req.log.error(err);
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
