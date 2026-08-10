// MATERIAAL_01 fase 0 — read-only telling van het werkelijke inkoopgebruik.
// Doel: op PRODUCTIE meten welk inkoopmodel echt gebruikt wordt, vóórdat er
// een keuze A/B/C (fase 3) gemaakt wordt. Sinds 8 aug 2026 heeft de agent geen
// SSH naar productie; daarom is deze telling een hoofdbeheerder-only endpoint
// dat op elke omgeving hetzelfde meet. Nulwaarden zijn een antwoord, geen
// reden om een regel weg te laten — lege tabellen worden dus ook gemeld.
//
// Daarnaast (fase 1, herstelronde): POST /metingen/materiaal01/herstel sluit
// het bestaande bestand aan open werkbakitems waarvan de materiaal-aanvraag
// al is afgehandeld. Idempotent; gebruikt hetzelfde systeem-afhandelmechanisme
// als de live sluiting in PATCH /materiaal-aanvragen/:id.
import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireRol } from "../middlewares/auth";
import { handelHerkomstenAf } from "../lib/werkbakService";
import { logger } from "../lib/logger";

const router = Router();
const alleenHoofdbeheerder = requireRol("hoofdbeheerder");

const q = async (query: ReturnType<typeof sql>) => (await db.execute(query)).rows;

router.get("/metingen/materiaal01", alleenHoofdbeheerder, async (_req, res): Promise<void> => {
  const [
    t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, herstel,
  ] = await Promise.all([
    // T1 — inkoopbonnen per status per maand (laatste 12 maanden)
    q(sql`SELECT status, to_char(date_trunc('month', aangemaakt_op), 'YYYY-MM') AS maand, count(*)::int AS aantal
          FROM inkoopbonnen WHERE aangemaakt_op >= now() - interval '12 months'
          GROUP BY 1, 2 ORDER BY 2, 1`),
    // T2 — magazijn_inkooporders idem
    q(sql`SELECT status, to_char(date_trunc('month', aangemaakt_op), 'YYYY-MM') AS maand, count(*)::int AS aantal
          FROM magazijn_inkooporders WHERE aangemaakt_op >= now() - interval '12 months'
          GROUP BY 1, 2 ORDER BY 2, 1`),
    // T3 — inkoopplannen totaal + hoeveel tot een inkoopbon leidden
    q(sql`SELECT (SELECT count(*)::int FROM inkoopplannen) AS totaal,
                 (SELECT count(DISTINCT ipr.inkoopplan_id)::int
                  FROM inkoopbon_regels ibr
                  JOIN inkoopplan_regels ipr ON ipr.id = ibr.inkoopplan_regel_id) AS met_inkoopbon`),
    // T4 — reserveringen per status
    q(sql`SELECT status, count(*)::int AS aantal FROM reserveringen GROUP BY 1 ORDER BY 1`),
    // T5 — materiaal_aanvragen per status × soort × volgens_opdracht
    q(sql`SELECT status, soort, coalesce(volgens_opdracht, '(leeg)') AS volgens_opdracht, count(*)::int AS aantal
          FROM materiaal_aanvragen GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`),
    // T6 — goedgekeurde aanvragen: oudste + hoeveel >30 dagen op die status
    q(sql`SELECT min(bijgewerkt_op)::text AS oudste_goedgekeurd,
                 count(*) FILTER (WHERE bijgewerkt_op < now() - interval '30 days')::int AS ouder_dan_30_dagen,
                 count(*)::int AS totaal_goedgekeurd
          FROM materiaal_aanvragen WHERE status = 'goedgekeurd'`),
    // T7 — mod_calc_inkoop_items totaal + offerte_ontvangen
    q(sql`SELECT count(*)::int AS totaal,
                 count(*) FILTER (WHERE offerte_ontvangen = true)::int AS met_offerte_ontvangen
          FROM mod_calc_inkoop_items`),
    // T8 — onderaannemer_orders per status
    q(sql`SELECT status, count(*)::int AS aantal FROM onderaannemer_orders GROUP BY 1 ORDER BY 1`),
    // T9 — algemene_inkopen per soort
    q(sql`SELECT soort, count(*)::int AS aantal FROM algemene_inkopen GROUP BY 1 ORDER BY 1`),
    // T10 — wie maakt ze aan: per tabel de aanmaker herleid naar functietitel(s)
    q(sql`
      SELECT bron, coalesce(functies, '(geen functie/onbekend)') AS profiel, count(*)::int AS aantal FROM (
        -- inkoopbonnen hebben geen maker-kolom; goedkeurder is het dichtstbijzijnde spoor
        SELECT 'inkoopbonnen (goedgekeurd door)' AS bron, ib.goedgekeurd_door_id AS gid FROM inkoopbonnen ib
        UNION ALL
        SELECT 'magazijn_inkooporders', mo.aangemaakt_door_id FROM magazijn_inkooporders mo
        UNION ALL
        SELECT 'reserveringen', r.aangemaakt_door_id FROM reserveringen r
      ) b
      LEFT JOIN LATERAL (
        SELECT string_agg(DISTINCT f.naam, ' + ' ORDER BY f.naam) AS functies
        FROM medewerkers m
        LEFT JOIN medewerker_aanstellingen ma ON ma.medewerker_id = m.id
        LEFT JOIN functies f ON f.id = coalesce(ma.functie_id, m.functie_id)
        WHERE m.gebruiker_id = b.gid
      ) fx ON true
      GROUP BY 1, 2 ORDER BY 1, 3 DESC`),
    // Herstelronde-nulmeting: open werkbakitems waarvan de aanvraag al is afgehandeld
    q(sql`SELECT count(*)::int AS open_bij_afgehandelde_aanvraag
          FROM werkbak_items wi
          JOIN materiaal_aanvragen ma ON ma.id = wi.herkomst_id
          WHERE wi.herkomst_type = 'materiaal_aanvraag' AND wi.status = 'open'
            AND ma.status IN ('goedgekeurd', 'afgewezen')`),
  ]);

  return void res.json({
    gemeten_op: new Date().toISOString(),
    omgeving: process.env["NODE_ENV"] === "production" ? "productie" : "ontwikkel",
    commit: process.env["GIT_COMMIT"] ?? process.env["COMMIT_SHA"] ?? null,
    t1_inkoopbonnen_per_status_maand: t1,
    t2_magazijn_inkooporders_per_status_maand: t2,
    t3_inkoopplannen: t3[0] ?? null,
    t4_reserveringen_per_status: t4,
    t5_materiaal_aanvragen: t5,
    t6_goedgekeurd_ouderdom: t6[0] ?? null,
    t7_mod_calc_inkoop_items: t7[0] ?? null,
    t8_onderaannemer_orders_per_status: t8,
    t9_algemene_inkopen_per_soort: t9,
    t10_aanmakers_per_profiel: t10,
    herstelronde_openstaand: herstel[0] ?? null,
  });
});

// Herstelronde (fase 1 §3.3): sluit open werkbakitems van al afgehandelde
// materiaal-aanvragen. Zelfde systeem-afhandeling als de live sluiting;
// idempotent — nogmaals draaien sluit 0 items.
router.post("/metingen/materiaal01/herstel", alleenHoofdbeheerder, async (req, res): Promise<void> => {
  // Selectie hier (welke aanvragen zijn terminaal), sluiting via het ene
  // systeem-afhandelmechanisme in werkbakService — geen tweede sluitroute.
  const stale = await q(sql`
    SELECT DISTINCT wi.herkomst_id AS id
    FROM werkbak_items wi
    JOIN materiaal_aanvragen ma ON ma.id = wi.herkomst_id
    WHERE wi.herkomst_type = 'materiaal_aanvraag' AND wi.status = 'open'
      AND ma.status IN ('goedgekeurd', 'afgewezen')`) as Array<{ id: number }>;
  const gesloten = await handelHerkomstenAf("materiaal_aanvraag", stale.map((r) => r.id));
  logger.info({ gesloten, door: req.session.userId }, "MATERIAAL_01 herstelronde uitgevoerd");
  return void res.json({ gesloten });
});

export default router;
