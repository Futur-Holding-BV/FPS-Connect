// BEWAKING_02 fase 0 — read-only telling van de commerciële keten, vóórdat de
// zes voeders gebouwd worden. Zelfde patroon als GET /metingen/materiaal01:
// hoofdbeheerder-only, meet op elke omgeving hetzelfde, nul is een antwoord.
//
// Aanname-toetsen die hier expliciet meegemeten worden (opdracht §7.8):
// - T7: bevat workflow_transitie_log echt offerte-overgangen? (op dev: nee —
//   offerte-statuswissels lopen buiten de WorkflowService om; daarom levert
//   T2 naast de log-afleiding ook een fallback op offertes.bijgewerkt_op)
// - T5: er bestaan twee calculatietabellen (calculaties én mod_calc_headers,
//   NUMMER_01: offertes.calculatie_id wijst naar mod_calc_headers); beide
//   worden geteld zodat er niets buiten beeld blijft.
import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireRol } from "../middlewares/auth";

const router = Router();
const alleenHoofdbeheerder = requireRol("hoofdbeheerder");

const q = async (query: ReturnType<typeof sql>) => (await db.execute(query)).rows;

router.get("/metingen/bewaking02", alleenHoofdbeheerder, async (_req, res): Promise<void> => {
  const [t1, t2log, t2fallback, t3, t4, t5, t6, t7] = await Promise.all([
    // T1 — offertes per status
    q(sql`SELECT status, count(*)::int AS aantal FROM offertes GROUP BY 1 ORDER BY 1`),

    // T2 (log-afleiding) — verzonden/bekeken: dagen sinds de laatste transitie
    // naar die status volgens workflow_transitie_log
    q(sql`WITH laatste AS (
            SELECT o.id, o.status,
                   max(l.aangemaakt_op) AS transitie_op
            FROM offertes o
            LEFT JOIN workflow_transitie_log l
              ON l.entity_id = o.id
             AND lower(l.entity_type) = 'offerte'
             AND l.naar_status = o.status
            WHERE o.status IN ('verzonden', 'bekeken')
            GROUP BY o.id, o.status)
          SELECT status,
                 count(*)::int AS aantal,
                 count(transitie_op)::int AS met_logregel,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(day FROM now() - transitie_op))::numeric(10,1) AS mediaan_dagen,
                 max(extract(day FROM now() - transitie_op))::int AS langste_dagen
          FROM laatste GROUP BY 1 ORDER BY 1`),

    // T2 (fallback) — zelfde vraag op offertes.bijgewerkt_op, voor het geval de
    // transitielog leeg is voor offertes (aanname-toets T7)
    q(sql`SELECT status, count(*)::int AS aantal,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(day FROM now() - bijgewerkt_op))::numeric(10,1) AS mediaan_dagen_bijgewerkt,
                 max(extract(day FROM now() - bijgewerkt_op))::int AS langste_dagen_bijgewerkt
          FROM offertes WHERE status IN ('verzonden', 'bekeken')
          GROUP BY 1 ORDER BY 1`),

    // T3 — geldigheid (datum + geldigheid_dagen) verstreken zonder eindstatus;
    // offertes zonder datum apart geteld (niet te beoordelen)
    q(sql`SELECT count(*) FILTER (WHERE datum IS NOT NULL AND (datum::date + geldigheid_dagen) < current_date)::int AS verlopen,
                 count(*) FILTER (WHERE datum IS NULL)::int AS zonder_datum,
                 count(*)::int AS totaal_niet_eindstatus
          FROM offertes
          WHERE status NOT IN ('ondertekend', 'afgewezen', 'ingetrokken')`),

    // T4 — opnames zonder gekoppelde calculatie (beide calculatietabellen), leeftijd
    q(sql`WITH los AS (
            SELECT o.id, o.status, o.aangemaakt_op
            FROM opnames o
            WHERE NOT EXISTS (SELECT 1 FROM calculaties c WHERE c.opname_id = o.id)
              AND NOT EXISTS (SELECT 1 FROM mod_calc_headers h WHERE h.opname_id = o.id))
          SELECT status,
                 count(*)::int AS aantal,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(day FROM now() - aangemaakt_op))::numeric(10,1) AS mediaan_dagen,
                 max(extract(day FROM now() - aangemaakt_op))::int AS langste_dagen
          FROM los GROUP BY 1 ORDER BY 1`),

    // T5 — calculaties per status, met/zonder gekoppelde offerte, per tabel
    q(sql`SELECT 'mod_calc_headers' AS tabel, h.status,
                 count(*)::int AS totaal,
                 count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM offertes f WHERE f.calculatie_id = h.id))::int AS zonder_offerte
          FROM mod_calc_headers h GROUP BY 2
          UNION ALL
          SELECT 'calculaties', c.status, count(*)::int,
                 count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM offertes f WHERE f.calculatie_id = c.id))::int
          FROM calculaties c GROUP BY 2
          ORDER BY 1, 2`),

    // T6 — actieve opdrachten zonder ondertekende offerte + akkoordstand (V6-basis)
    q(sql`SELECT count(*)::int AS actief_totaal,
                 count(*) FILTER (WHERE o.offerte_id IS NULL)::int AS zonder_offerte,
                 count(*) FILTER (WHERE f.id IS NOT NULL AND f.status <> 'ondertekend')::int AS offerte_niet_ondertekend,
                 count(*) FILTER (WHERE o.akkoord_grond IS NULL)::int AS zonder_akkoordgrond
          FROM opdrachten o
          LEFT JOIN offertes f ON f.id = o.offerte_id
          WHERE o.status = 'actief'`),

    // T7 — welke entity_types staan er werkelijk in de transitielog?
    q(sql`SELECT entity_type, count(*)::int AS aantal, max(aangemaakt_op)::text AS laatste
          FROM workflow_transitie_log GROUP BY 1 ORDER BY 2 DESC`),
  ]);

  res.json({
    gemeten_op: new Date().toISOString(),
    t1_offertes_per_status: t1,
    t2_wachttijd_verzonden_bekeken_uit_transitielog: t2log,
    t2_fallback_op_bijgewerkt_op: t2fallback,
    t3_geldigheid_verstreken: t3[0] ?? null,
    t4_opnames_zonder_calculatie: t4,
    t5_calculaties_zonder_offerte: t5,
    t6_actieve_opdrachten: t6[0] ?? null,
    t7_transitielog_entity_types: t7,
  });
});

export default router;
