// BEWAKING_02 fase 0 — read-only telling van de commerciële keten, vóórdat de
// zes voeders gebouwd worden. Zelfde patroon als GET /metingen/materiaal01:
// hoofdbeheerder-only, meet op elke omgeving hetzelfde, nul is een antwoord.
//
// Aanname-toetsen die hier expliciet meegemeten worden (opdracht §7.8):
// - T7: bevat workflow_transitie_log echt offerte-overgangen? (dev én prod: nee —
//   offerte-statuswissels lopen buiten de WorkflowService om; daarom leest T2 de
//   momenten uit offerte_tracking, met een fallback op offertes.bijgewerkt_op)
// - De commerciële flow leeft op offertes.portaal_status (verzonden/bekeken/
//   ondertekend/afgewezen/vervallen); status blijft "concept" tot ondertekening.
//   T1–T3 meten daarom (ook) op portaal_status.
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
  const [t1, t1portaal, t2tracking, t2fallback, t3, t4, t5, t6, t7] = await Promise.all([
    // T1 — offertes per status
    q(sql`SELECT status, count(*)::int AS aantal FROM offertes GROUP BY 1 ORDER BY 1`),

    // T1 (portaal) — de werkelijke verzend-/portaalflow leeft op portaal_status
    // (verzonden/bekeken/ondertekend/afgewezen/vervallen); status blijft
    // "concept" tot ondertekening, dus zonder deze telling mist de meting alles.
    q(sql`SELECT portaal_status, count(*)::int AS aantal FROM offertes GROUP BY 1 ORDER BY 1`),

    // T2 (tracking) — verzonden/bekeken op portaal_status; momenten uit
    // offerte_tracking: bezorgd=max (herbezorging reset de klok),
    // portaal_bekeken=min (herhaalbezoek mag niet eindeloos uitstellen).
    // workflow_transitie_log bevat géén offerte-overgangen (aanname-toets T7).
    q(sql`WITH momenten AS (
            SELECT o.id, o.portaal_status,
                   CASE o.portaal_status
                     WHEN 'verzonden' THEN max(t.aangemaakt_op) FILTER (WHERE t.event = 'bezorgd')
                     WHEN 'bekeken'   THEN min(t.aangemaakt_op) FILTER (WHERE t.event = 'portaal_bekeken')
                   END AS moment
            FROM offertes o
            LEFT JOIN offerte_tracking t ON t.offerte_id = o.id
            WHERE o.portaal_status IN ('verzonden', 'bekeken')
            GROUP BY o.id, o.portaal_status)
          SELECT portaal_status,
                 count(*)::int AS aantal,
                 count(moment)::int AS met_trackingevent,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY floor(extract(epoch FROM now() - moment) / 86400))::numeric(10,1) AS mediaan_dagen,
                 max(floor(extract(epoch FROM now() - moment) / 86400))::int AS langste_dagen
          FROM momenten GROUP BY 1 ORDER BY 1`),

    // T2 (fallback) — zelfde vraag op offertes.bijgewerkt_op, voor historische/
    // handmatige rijen zonder tracking-event (indicatief: dit veld wijzigt óók
    // bij andere bewerkingen)
    q(sql`SELECT portaal_status, count(*)::int AS aantal,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY floor(extract(epoch FROM now() - bijgewerkt_op) / 86400))::numeric(10,1) AS mediaan_dagen_bijgewerkt,
                 max(floor(extract(epoch FROM now() - bijgewerkt_op) / 86400))::int AS langste_dagen_bijgewerkt
          FROM offertes WHERE portaal_status IN ('verzonden', 'bekeken')
          GROUP BY 1 ORDER BY 1`),

    // T3 — geldigheid (datum + geldigheid_dagen) verstreken zonder eindstatus;
    // eindstatus op status ÉN portaal_status (ondertekend/afgewezen/vervallen
    // leven op portaal_status); offertes zonder datum apart (niet te beoordelen)
    q(sql`SELECT count(*) FILTER (WHERE datum IS NOT NULL AND (datum::date + geldigheid_dagen) < current_date)::int AS verlopen,
                 count(*) FILTER (WHERE datum IS NULL)::int AS zonder_datum,
                 count(*)::int AS totaal_niet_eindstatus
          FROM offertes
          WHERE status NOT IN ('ondertekend', 'afgewezen', 'ingetrokken')
            AND portaal_status NOT IN ('ondertekend', 'afgewezen', 'vervallen')`),

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
    t1_offertes_per_portaal_status: t1portaal,
    t2_wachttijd_verzonden_bekeken_uit_tracking: t2tracking,
    t2_fallback_op_bijgewerkt_op: t2fallback,
    t3_geldigheid_verstreken: t3[0] ?? null,
    t4_opnames_zonder_calculatie: t4,
    t5_calculaties_zonder_offerte: t5,
    t6_actieve_opdrachten: t6[0] ?? null,
    t7_transitielog_entity_types: t7,
  });
});

export default router;
