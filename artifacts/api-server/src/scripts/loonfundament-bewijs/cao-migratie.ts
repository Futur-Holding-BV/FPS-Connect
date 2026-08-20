// LOON_02A — Controles (1) CAO-catalogus en (2) Migratiebevinding.

import { eq } from "drizzle-orm";
import {
  db, caoCatalogusTable, loonMigratiebevindingenTable,
} from "@workspace/db";
import { check, eis, registreerOpruimen } from "./harnas";

export const MARK = "VERIF-LOONFUNDAMENT";

// ── (1) CAO-catalogus ─────────────────────────────────────────────────────────

export async function controleerCaoCatalogus(): Promise<void> {
  console.log("\n── (1) CAO-catalogus: drie bindende codes ──");
  const rijen = await db
    .select({ code: caoCatalogusTable.code, naam: caoCatalogusTable.naam })
    .from(caoCatalogusTable)
    .where(eq(caoCatalogusTable.actief, true));

  const codes = new Set(rijen.map((r) => r.code));
  check("code MT aanwezig",       codes.has("MT"),       "Metaal & Techniek");
  check("code BI aanwezig",       codes.has("BI"),       "Bouw & Infra");
  check("code ONBEKEND aanwezig", codes.has("ONBEKEND"), "Onbekend (migratie)");
  check(
    "alle drie bindende codes aanwezig",
    codes.has("MT") && codes.has("BI") && codes.has("ONBEKEND"),
    `${rijen.length} actieve rijen`,
  );
}

// Hulpfunctie voor de runner: geeft de ONBEKEND-catalogus-ID of gooit bij ontbreken.
export async function haalCaoOnbekendId(): Promise<number> {
  const [entry] = await db
    .select({ id: caoCatalogusTable.id })
    .from(caoCatalogusTable)
    .where(eq(caoCatalogusTable.code, "ONBEKEND"));
  if (!entry) {
    throw new Error(
      "CAO ONBEKEND ontbreekt. Voer migratie 0115_loonfundament.sql uit.",
    );
  }
  return entry.id;
}

// ── (2) Migratiebevinding ─────────────────────────────────────────────────────

export async function controleerMigratiebevinding(werkgeverId: number): Promise<void> {
  console.log("\n── (2) Migratiebevinding: onbekende/tegenstrijdige mapping ──");

  const [bev] = await db
    .insert(loonMigratiebevindingenTable)
    .values({
      entiteitType: "werkgever",
      entiteitId: werkgeverId,
      veld: "cao",
      oorspronkelijkeWaarde: `${MARK}-onbekende-cao`,
      reden: `${MARK}: CAO-tekst kon niet worden gemapt op een CAO-catalogusentry`,
    })
    .returning();
  eis(!!bev, "bevinding aangemaakt");
  registreerOpruimen(() =>
    db.delete(loonMigratiebevindingenTable)
      .where(eq(loonMigratiebevindingenTable.id, bev!.id))
      .then(() => {}),
  );

  check("bevinding entiteit_type=werkgever",     bev!.entiteitType === "werkgever");
  check("bevinding veld='cao'",                  bev!.veld === "cao");
  check("bevinding heeft reden",                 bev!.reden.length > 0);
  check("opgelost_op is null",                   bev!.opgelostOp === null);

  const [opgehaald] = await db
    .select()
    .from(loonMigratiebevindingenTable)
    .where(eq(loonMigratiebevindingenTable.id, bev!.id));
  check("bevinding terug te lezen",              !!opgehaald);
  check("oorspronkelijke waarde bewaard",
    opgehaald?.oorspronkelijkeWaarde === `${MARK}-onbekende-cao`,
  );
}
