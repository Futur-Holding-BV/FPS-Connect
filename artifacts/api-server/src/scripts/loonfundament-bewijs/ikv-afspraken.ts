// LOON_02A — Controles (3) IKV en (4) Loonafspraken.

import { eq } from "drizzle-orm";
import {
  db, loonInkomstenverhoudingenTable, loonAfsprakenTable,
  medewerkerAanstellingenTable,
} from "@workspace/db";
import { check, eis, isPostgresCode, registreerOpruimen } from "./harnas";

// ── (3) Inkomstenverhoudingen ─────────────────────────────────────────────────

export async function controleerInkomstenverhoudingen(
  werkgeverId: number,
  medewerkerId: number,
  aanstellingId: number,
): Promise<{ ikvId1: number; ikvId2: number }> {
  console.log("\n── (3) Inkomstenverhoudingen: volgnummers en duplicate ──");

  const basisIkv = {
    werkgeverId, medewerkerId, aanstellingId,
    contractOnbepaaldeTijd: false, schriftelijkeArbeidsovereenkomst: true,
    oproepovereenkomst: false, verzekerdZw: true, verzekerdWw: true, verzekerdWia: true,
  };

  // IKV #1 — volgnummer 1
  const [ikv1] = await db
    .insert(loonInkomstenverhoudingenTable)
    .values({ ...basisIkv, volgnummer: 1, datumAanvang: "2026-01-01" })
    .returning();
  eis(!!ikv1, "IKV #1 aangemaakt");
  registreerOpruimen(() =>
    db.delete(loonInkomstenverhoudingenTable)
      .where(eq(loonInkomstenverhoudingenTable.id, ikv1!.id))
      .then(() => {}),
  );
  check("IKV volgnummer 1 aangemaakt",   ikv1!.volgnummer === 1);
  check("IKV is actief bij aanmaak",     ikv1!.actief === true);

  // IKV #2 — volgnummer 2
  const [ikv2] = await db
    .insert(loonInkomstenverhoudingenTable)
    .values({ ...basisIkv, volgnummer: 2, datumAanvang: "2026-03-01" })
    .returning();
  eis(!!ikv2, "IKV #2 aangemaakt");
  registreerOpruimen(() =>
    db.delete(loonInkomstenverhoudingenTable)
      .where(eq(loonInkomstenverhoudingenTable.id, ikv2!.id))
      .then(() => {}),
  );
  check("IKV volgnummer 2 aangemaakt",            ikv2!.volgnummer === 2);
  check("IKV #1 en #2 hebben verschillende ID's", ikv1!.id !== ikv2!.id);

  // Duplicate volgnummer 1 → geweigerd (PG-23505)
  let duplicateGeweigerd = false;
  try {
    await db
      .insert(loonInkomstenverhoudingenTable)
      .values({ ...basisIkv, volgnummer: 1, datumAanvang: "2026-06-01" })
      .returning();
  } catch (err) {
    duplicateGeweigerd = isPostgresCode(err, "23505");
  }
  check(
    "duplicate volgnummer geweigerd (PG 23505)",
    duplicateGeweigerd,
    "unique constraint loon_ikv_werkgever_medewerker_volgnummer_uniek",
  );

  return { ikvId1: ikv1!.id, ikvId2: ikv2!.id };
}

export async function controleerAanstellingIkvInvariant(
  aanstellingId: number,
  oorspronkelijkeWerkgeverId: number,
  andereWerkgeverId: number,
): Promise<void> {
  console.log("\n── (3b) Aanstelling blijft bij IKV-medewerker en -werkgever ──");
  let verplaatsingGeweigerd = false;
  try {
    await db
      .update(medewerkerAanstellingenTable)
      .set({ werkgeverId: andereWerkgeverId })
      .where(eq(medewerkerAanstellingenTable.id, aanstellingId));
  } catch (err) {
    verplaatsingGeweigerd = isPostgresCode(err, "P0001");
  }
  check("werkgeverwissel met bestaande IKV geweigerd", verplaatsingGeweigerd);

  const [naPoging] = await db
    .select({ werkgeverId: medewerkerAanstellingenTable.werkgeverId })
    .from(medewerkerAanstellingenTable)
    .where(eq(medewerkerAanstellingenTable.id, aanstellingId));
  check(
    "aanstelling houdt oorspronkelijke werkgever na geweigerde wijziging",
    naPoging?.werkgeverId === oorspronkelijkeWerkgeverId,
  );
}

// ── (4) Loonafspraken ─────────────────────────────────────────────────────────

export async function controleerLoonafspraken(ikvId: number): Promise<void> {
  console.log("\n── (4) Loonafspraken: ingangsdatums en centen ──");

  const basisAfspraak = {
    inkomstenverhoudingId: ikvId, loonsoort: "maandloon",
    vasteToeslagen: [], loonheffingskorting: false, tabelkeuze: "wit", anoniementarief: false,
  };

  // Afspraak #1 — €2 750,37
  const bedrag1 = 275037;
  const [af1] = await db
    .insert(loonAfsprakenTable)
    .values({ ...basisAfspraak, ingangsdatum: "2026-01-01", bedragCents: bedrag1 })
    .returning();
  eis(!!af1, "afspraak #1 aangemaakt");
  check("afspraak #1 (2026-01-01)",                af1!.ingangsdatum === "2026-01-01");
  check("bedrag exact 275037 cent (€2750,37)",      af1!.bedragCents === bedrag1);

  // Afspraak #2 — €2 901,00
  const bedrag2 = 290100;
  const [af2] = await db
    .insert(loonAfsprakenTable)
    .values({ ...basisAfspraak, ingangsdatum: "2026-04-01", bedragCents: bedrag2 })
    .returning();
  eis(!!af2, "afspraak #2 aangemaakt");
  check("afspraak #2 (2026-04-01)",                af2!.ingangsdatum === "2026-04-01");
  check("bedrag exact 290100 cent (€2901,00)",      af2!.bedragCents === bedrag2);
  check("twee afspraken hebben verschillende ID's", af1!.id !== af2!.id);

  // Duplicate ingangsdatum → geweigerd
  let duplicateGeweigerd = false;
  try {
    await db
      .insert(loonAfsprakenTable)
      .values({ ...basisAfspraak, ingangsdatum: "2026-01-01", bedragCents: 999 })
      .returning();
  } catch (err) {
    duplicateGeweigerd = isPostgresCode(err, "23505");
  }
  check(
    "duplicate ingangsdatum geweigerd (PG 23505)",
    duplicateGeweigerd,
    "unique constraint loon_afspraken_ikv_ingangsdatum_uniek",
  );

  let updateGeweigerd = false;
  try {
    await db
      .update(loonAfsprakenTable)
      .set({ bedragCents: bedrag1 + 1 })
      .where(eq(loonAfsprakenTable.id, af1!.id));
  } catch (err) {
    updateGeweigerd = isPostgresCode(err, "P0001");
  }
  check("directe wijziging van loonafspraakhistorie geweigerd", updateGeweigerd);

  let deleteGeweigerd = false;
  try {
    await db.delete(loonAfsprakenTable).where(eq(loonAfsprakenTable.id, af1!.id));
  } catch (err) {
    deleteGeweigerd = isPostgresCode(err, "P0001");
  }
  check("direct verwijderen van loonafspraakhistorie geweigerd", deleteGeweigerd);
}
