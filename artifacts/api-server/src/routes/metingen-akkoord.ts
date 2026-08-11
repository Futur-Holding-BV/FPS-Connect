// AKKOORD_01 §3.2 — read-only meting: uren zonder opdracht (laatste 12 maanden).
// Bewust NIET blokkerend: de opdrachttekst verbiedt het blokkeren van uren
// zonder opdracht; er wordt alleen gemeten. Hoofdbeheerder-only, zelfde
// patroon als /metingen/materiaal01 (sinds 8 aug 2026 geen SSH naar prod).
import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireRol } from "../middlewares/auth";

const router = Router();
const alleenHoofdbeheerder = requireRol("hoofdbeheerder");

const q = async (query: ReturnType<typeof sql>) => (await db.execute(query)).rows;

router.get("/metingen/akkoord01", alleenHoofdbeheerder, async (_req, res): Promise<void> => {
  // uren_registraties.datum is een tekstkolom (YYYY-MM-DD) — vergelijk als tekst.
  const grens = sql`to_char(now() - interval '12 months', 'YYYY-MM-DD')`;
  const [totalen, uitsplitsing, functies, akkoordStand] = await Promise.all([
    // T1 — totalen laatste 12 maanden
    q(sql`SELECT count(*)::int AS totaal,
                 count(*) FILTER (WHERE opdracht_id IS NULL)::int AS zonder_opdracht,
                 count(*) FILTER (WHERE opdracht_id IS NULL AND indirecte_werkzaamheid_id IS NOT NULL)::int AS zonder_opdracht_indirect,
                 count(*) FILTER (WHERE opdracht_id IS NULL AND indirecte_werkzaamheid_id IS NULL)::int AS zonder_opdracht_direct,
                 count(*) FILTER (WHERE opdracht_id IS NULL AND coalesce(project_naam,'') <> '')::int AS zonder_opdracht_met_vrije_projectnaam
          FROM uren_registraties WHERE datum >= ${grens}`),
    // T2 — per maand
    q(sql`SELECT substr(datum, 1, 7) AS maand,
                 count(*)::int AS totaal,
                 count(*) FILTER (WHERE opdracht_id IS NULL)::int AS zonder_opdracht
          FROM uren_registraties WHERE datum >= ${grens}
          GROUP BY 1 ORDER BY 1`),
    // T3 — zonder opdracht, per medewerker-functietitels × indirect
    q(sql`SELECT coalesce(array_to_string(g.functietitels, ', '), '(geen profiel)') AS functietitels,
                 (u.indirecte_werkzaamheid_id IS NOT NULL) AS indirect,
                 count(*)::int AS aantal
          FROM uren_registraties u
          LEFT JOIN medewerkers m ON m.id = u.medewerker_id
          LEFT JOIN gebruikers g ON g.id = m.gebruiker_id
          WHERE u.datum >= ${grens} AND u.opdracht_id IS NULL
          GROUP BY 1, 2 ORDER BY 3 DESC`),
    // T4 — stand van de akkoordpoort: opdrachten met/zonder vastgelegd akkoord
    q(sql`SELECT coalesce(akkoord_grond, '(geen akkoord)') AS grond, status, count(*)::int AS aantal
          FROM opdrachten GROUP BY 1, 2 ORDER BY 1, 2`),
  ]);
  res.json({
    gemeten_op: new Date().toISOString(),
    t1_totalen_12mnd: totalen,
    t2_per_maand: uitsplitsing,
    t3_zonder_opdracht_per_functie: functies,
    t4_opdrachten_akkoordstand: akkoordStand,
  });
});

export default router;
