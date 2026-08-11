// Verificatie — BEWAKING_02 T2-meting telt wachttijden correct over maandgrenzen
// heen en hanteert de juiste max/min-semantiek op offerte_tracking.
//
// Aanleiding (review): dagen moeten als volledige verlopen dagen berekend worden
// (epoch/86400), niet als het dag-component van een interval; een offerte die
// 45 dagen wacht moet dus 45 rapporteren, nooit ~14 of 1.
//
// Scenario (in één transactie, altijd ROLLBACK — laat geen data achter):
//   1. Offerte A: portaal_status 'verzonden', 2x 'bezorgd' (60 en 45 dagen oud)
//      → V1-semantiek: max(bezorgd) = 45 dagen (herbezorging reset de klok).
//   2. Offerte B: portaal_status 'bekeken', 2x 'portaal_bekeken' (40 en 3 dagen oud)
//      → V2-semantiek: min(portaal_bekeken) = 40 dagen (herhaalbezoek stelt niet uit).
//   3. Draai exact de T2-query van GET /api/metingen/bewaking02 en assert de dagen.
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/verificatie-bewaking02-t2.ts
import { sql } from "drizzle-orm";

import { db } from "@workspace/db";

let fouten = 0;
function check(naam: string, conditie: boolean, detail: string): void {
  const status = conditie ? "OK  " : "FOUT";
  if (!conditie) fouten += 1;
  console.log(`[${status}] ${naam} — ${detail}`);
}

async function main(): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = async (q: ReturnType<typeof sql>) => (await tx.execute(q)).rows;

    // Uniek herkenbare titels zodat de assert alleen naar de eigen fixtures kijkt.
    const marker = `verificatie-bewaking02-t2-${Date.now()}`;

    const [a] = await rows(sql`
      INSERT INTO offertes (titel, status, portaal_status)
      VALUES (${marker + "-A"}, 'concept', 'verzonden') RETURNING id`);
    const [b] = await rows(sql`
      INSERT INTO offertes (titel, status, portaal_status)
      VALUES (${marker + "-B"}, 'concept', 'bekeken') RETURNING id`);
    const idA = Number((a as { id: number }).id);
    const idB = Number((b as { id: number }).id);

    await rows(sql`
      INSERT INTO offerte_tracking (offerte_id, event, aangemaakt_op) VALUES
        (${idA}, 'bezorgd', now() - interval '60 days'),
        (${idA}, 'bezorgd', now() - interval '45 days'),
        (${idB}, 'portaal_bekeken', now() - interval '40 days'),
        (${idB}, 'portaal_bekeken', now() - interval '3 days')`);

    // Exact de T2-query uit metingen-bewaking.ts, begrensd tot de twee fixtures.
    const t2 = await rows(sql`
      WITH momenten AS (
        SELECT o.id, o.portaal_status,
               CASE o.portaal_status
                 WHEN 'verzonden' THEN max(t.aangemaakt_op) FILTER (WHERE t.event = 'bezorgd')
                 WHEN 'bekeken'   THEN min(t.aangemaakt_op) FILTER (WHERE t.event = 'portaal_bekeken')
               END AS moment
        FROM offertes o
        LEFT JOIN offerte_tracking t ON t.offerte_id = o.id
        WHERE o.portaal_status IN ('verzonden', 'bekeken')
          AND o.id IN (${idA}, ${idB})
        GROUP BY o.id, o.portaal_status)
      SELECT portaal_status,
             count(*)::int AS aantal,
             count(moment)::int AS met_trackingevent,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY floor(extract(epoch FROM now() - moment) / 86400))::numeric(10,1) AS mediaan_dagen,
             max(floor(extract(epoch FROM now() - moment) / 86400))::int AS langste_dagen
      FROM momenten GROUP BY 1 ORDER BY 1`) as Array<{
        portaal_status: string; aantal: number; met_trackingevent: number;
        mediaan_dagen: string; langste_dagen: number;
      }>;

    const verzonden = t2.find((r) => r.portaal_status === "verzonden");
    const bekeken = t2.find((r) => r.portaal_status === "bekeken");

    check("verzonden geteld", verzonden?.aantal === 1 && verzonden?.met_trackingevent === 1,
      `aantal=${verzonden?.aantal}, met_trackingevent=${verzonden?.met_trackingevent}`);
    check("bezorgd=max (herbezorging reset): 45 dagen, niet 60",
      verzonden?.langste_dagen === 45,
      `langste_dagen=${verzonden?.langste_dagen} (verwacht 45)`);
    check("maandgrens: 45 dagen blijft 45 (geen interval-dagcomponent ~14)",
      Number(verzonden?.mediaan_dagen) === 45,
      `mediaan_dagen=${verzonden?.mediaan_dagen} (verwacht 45.0)`);

    check("bekeken geteld", bekeken?.aantal === 1 && bekeken?.met_trackingevent === 1,
      `aantal=${bekeken?.aantal}, met_trackingevent=${bekeken?.met_trackingevent}`);
    check("portaal_bekeken=min (herhaalbezoek stelt niet uit): 40 dagen, niet 3",
      bekeken?.langste_dagen === 40 && Number(bekeken?.mediaan_dagen) === 40,
      `langste_dagen=${bekeken?.langste_dagen}, mediaan=${bekeken?.mediaan_dagen} (verwacht 40)`);

    // Altijd terugdraaien — dit is een meetverificatie, geen seed.
    tx.rollback();
  }).catch((err: unknown) => {
    // drizzle's tx.rollback() gooit bewust een rollback-error; alles anders is echt fout.
    if (!(err instanceof Error && err.message.toLowerCase().includes("rollback"))) throw err;
  });

  if (fouten > 0) {
    console.error(`\n${fouten} controle(s) gefaald.`);
    process.exit(1);
  }
  console.log("\nAlle T2-controles geslaagd (maandgrens + max/min-semantiek).");
  process.exit(0);
}

main().catch((err) => {
  console.error("Verificatie onverwacht gefaald:", err);
  process.exit(1);
});
