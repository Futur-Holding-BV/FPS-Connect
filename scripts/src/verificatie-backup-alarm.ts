/**
 * Verificatie punt 83 (SCHULD_01): een opzettelijk mislukte back-up levert
 * een in-app melding (gebruikers_meldingen, type backup_alarm) op voor alle
 * hoofdbeheerders, en de backup_record staat op status "fout".
 *
 * Draaien: pnpm --filter @workspace/scripts exec tsx src/verificatie-backup-alarm.ts
 */
import "./lib/prodGuard";
import path from "path";
import { fileURLToPath } from "url";

const WORKSPACE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function main() {
  const { db, gebruikersMeldingenTable, backupRecordsTable } = await import("@workspace/db");
  const { sql, desc, eq } = await import("drizzle-orm");
  const backupService = await import(
    path.join(WORKSPACE, "artifacts/api-server/src/lib/backupService.ts")
  );

  const telAlarmen = async () => {
    const r = await db.execute(sql`SELECT COUNT(*)::int AS n FROM gebruikers_meldingen WHERE type = 'backup_alarm'`);
    return Number((r as unknown as { rows: Array<{ n: number }> }).rows[0].n);
  };

  const voor = await telAlarmen();
  console.log(`Alarmen vooraf: ${voor}`);

  // Sabotage: pg_dump naar een niet-bestaande host. De db-pool zelf is al
  // geconfigureerd met de echte URL, dus records/meldingen schrijven blijft werken.
  const echteUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://fps:fout@host-die-niet-bestaat.invalid:5432/fps";

  let gefaald = false;
  try {
    await backupService.maakBackup("handmatig", null);
  } catch (err) {
    gefaald = true;
    console.log(`maakBackup faalde zoals bedoeld: ${(err as Error).message.slice(0, 120)}`);
  } finally {
    process.env.DATABASE_URL = echteUrl;
  }
  if (!gefaald) {
    console.error("FOUT: maakBackup slaagde terwijl hij moest falen — sabotage werkte niet.");
    process.exit(1);
  }

  const na = await telAlarmen();
  console.log(`Alarmen na mislukte poging: ${na} (nieuw: ${na - voor})`);

  const [record] = await db
    .select({ id: backupRecordsTable.id, status: backupRecordsTable.status, fout: backupRecordsTable.foutTekst })
    .from(backupRecordsTable)
    .orderBy(desc(backupRecordsTable.id))
    .limit(1);
  console.log(`Laatste backup_record: id=${record.id} status=${record.status} fout="${(record.fout ?? "").slice(0, 80)}"`);

  const [melding] = await db
    .select({ omschrijving: gebruikersMeldingenTable.omschrijving, urgentie: gebruikersMeldingenTable.urgentie })
    .from(gebruikersMeldingenTable)
    .where(eq(gebruikersMeldingenTable.type, "backup_alarm"))
    .orderBy(desc(gebruikersMeldingenTable.id))
    .limit(1);
  if (melding) console.log(`Laatste melding (${melding.urgentie}): ${melding.omschrijving.slice(0, 140)}`);

  const geslaagd = na > voor && record.status === "fout";
  console.log(geslaagd ? "\n✅ BEWIJS GELEVERD: mislukte back-up → melding aan hoofdbeheerders" : "\n❌ NIET GESLAAGD");
  process.exit(geslaagd ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
