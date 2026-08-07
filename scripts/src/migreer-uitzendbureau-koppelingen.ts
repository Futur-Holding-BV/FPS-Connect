// FACTUUR_01 — eenmalige migratie: bestaande vrije-tekstwaarden in
// bedrijf_uitzendbureau (gebruikers + medewerkers) koppelen aan organisaties
// in crm_klanten via uitzendbureau_id.
//
// Regels (idempotent, nooit koppelen bij twijfel):
//   - Alleen records zonder uitzendbureau_id worden bekeken.
//   - Match op naam (case-insensitief, getrimd) tegen crm_klanten.naam.
//   - EXACT één organisatie matcht → uitzendbureau_id invullen; staat het
//     organisatietype nog op leverancier/overig/leeg → type = "uitzendbureau".
//   - Geen of meerdere matches → NIET koppelen; de tekst blijft zichtbaar in
//     de beheeromgeving (GET /uitzendbureau-koppelingen) voor handmatige
//     afhandeling.
//
// Draaien: pnpm --filter @workspace/scripts run migreer-uitzendbureau-koppelingen
import { db, gebruikersTable, medewerkersTable, crmKlantenTable, pool } from "@workspace/db";
import { and, eq, isNull, isNotNull, ne, sql } from "drizzle-orm";

async function main(): Promise<void> {
  const organisaties = await db
    .select({ id: crmKlantenTable.id, naam: crmKlantenTable.naam, type: crmKlantenTable.type })
    .from(crmKlantenTable);
  const perNaam = new Map<string, { id: number; type: string | null }[]>();
  for (const o of organisaties) {
    const sleutel = o.naam.trim().toLowerCase();
    if (!sleutel) continue;
    const lijst = perNaam.get(sleutel) ?? [];
    lijst.push({ id: o.id, type: o.type ?? null });
    perNaam.set(sleutel, lijst);
  }

  // Alle openstaande teksten verzamelen uit beide tabellen.
  const teksten = new Set<string>();
  const gebruikersRijen = await db
    .select({ tekst: gebruikersTable.bedrijfUitzendbureau })
    .from(gebruikersTable)
    .where(and(isNotNull(gebruikersTable.bedrijfUitzendbureau), ne(gebruikersTable.bedrijfUitzendbureau, ""), isNull(gebruikersTable.uitzendbureauId)))
    .groupBy(gebruikersTable.bedrijfUitzendbureau);
  const medewerkerRijen = await db
    .select({ tekst: medewerkersTable.bedrijfUitzendbureau })
    .from(medewerkersTable)
    .where(and(isNotNull(medewerkersTable.bedrijfUitzendbureau), ne(medewerkersTable.bedrijfUitzendbureau, ""), isNull(medewerkersTable.uitzendbureauId)))
    .groupBy(medewerkersTable.bedrijfUitzendbureau);
  for (const r of [...gebruikersRijen, ...medewerkerRijen]) {
    const t = (r.tekst ?? "").trim();
    if (t) teksten.add(t);
  }

  let automatisch = 0;
  let gekoppeldGebruikers = 0;
  let gekoppeldMedewerkers = 0;
  const handmatig: string[] = [];

  for (const tekst of [...teksten].sort((a, b) => a.localeCompare(b, "nl"))) {
    const kandidaten = perNaam.get(tekst.toLowerCase()) ?? [];
    if (kandidaten.length !== 1) {
      handmatig.push(`${tekst} (${kandidaten.length === 0 ? "geen match" : `${kandidaten.length} matches`})`);
      continue;
    }
    const org = kandidaten[0];
    let overgeslagen = false;
    await db.transaction(async (tx) => {
      // Race-bescherming: hercontroleer BINNEN de transactie dat er nog steeds
      // exact één organisatie met deze naam bestaat. Een gelijktijdig
      // aangemaakte naamgenoot maakt de match ambigu → niet koppelen.
      const hercheck = await tx
        .select({ id: crmKlantenTable.id })
        .from(crmKlantenTable)
        .where(sql`lower(trim(${crmKlantenTable.naam})) = ${tekst.toLowerCase()}`);
      if (hercheck.length !== 1 || hercheck[0].id !== org.id) {
        overgeslagen = true;
        return;
      }
      const g = await tx
        .update(gebruikersTable)
        .set({ uitzendbureauId: org.id })
        .where(and(
          sql`lower(trim(${gebruikersTable.bedrijfUitzendbureau})) = ${tekst.toLowerCase()}`,
          isNull(gebruikersTable.uitzendbureauId),
        ))
        .returning({ id: gebruikersTable.id });
      const m = await tx
        .update(medewerkersTable)
        .set({ uitzendbureauId: org.id })
        .where(and(
          sql`lower(trim(${medewerkersTable.bedrijfUitzendbureau})) = ${tekst.toLowerCase()}`,
          isNull(medewerkersTable.uitzendbureauId),
        ))
        .returning({ id: medewerkersTable.id });
      if (org.type === "leverancier" || org.type === "overig" || org.type == null) {
        await tx.update(crmKlantenTable).set({ type: "uitzendbureau" }).where(eq(crmKlantenTable.id, org.id));
      }
      gekoppeldGebruikers += g.length;
      gekoppeldMedewerkers += m.length;
    });
    if (overgeslagen) {
      handmatig.push(`${tekst} (match werd ambigu tijdens migratie)`);
      continue;
    }
    automatisch += 1;
    console.log(`[OK] "${tekst}" → crm_klanten #${org.id}`);
  }

  console.log("");
  console.log(`Automatisch gekoppelde teksten: ${automatisch}`);
  console.log(`  waarvan gebruikers-records:   ${gekoppeldGebruikers}`);
  console.log(`  waarvan medewerker-records:   ${gekoppeldMedewerkers}`);
  console.log(`Handmatig te koppelen teksten:  ${handmatig.length}`);
  for (const h of handmatig) console.log(`  - ${h}`);
  if (handmatig.length > 0) {
    console.log("Deze lijst is zichtbaar in de beheeromgeving (Personeel → Uitzendbureau-koppelingen).");
  }
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("Migratie mislukt:", err);
    return pool.end().then(() => process.exit(1));
  });
