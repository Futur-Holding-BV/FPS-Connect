// BOUW_01 §4/§5/§6 — meldingen vanaf de bouwplaats richten aan de
// werkvoorbereider (doen) met vaste, niet uitschakelbare cc aan de
// projectleider (weten). Adressering loopt via functietitels: dat is de
// organisatie-inrichting (projectfuncties), niet de rechtenmatrix.
// Vangnet: zijn er geen gebruikers met de functietitel, dan valt het item
// terug op bevoegdheid projecten≥3 zodat de melding nooit stil blijft liggen.
import { db, gebruikersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { meldWerkbakItem, type WerkbakInvoer } from "./werkbakService";

export async function vindGebruikersMetFunctietitel(titel: string): Promise<number[]> {
  const rijen = await db
    .select({ id: gebruikersTable.id })
    .from(gebruikersTable)
    .where(sql`${gebruikersTable.actief} = true AND ${sql.raw("functietitels")} @> ARRAY[${titel}]::text[]`);
  return rijen.map((r) => r.id);
}

type MeldingInvoer = Omit<WerkbakInvoer, "soort" | "gebruikerId" | "vereisteModule" | "vereistNiveau" | "dedupSleutel"> & {
  dedupBasis: string;
};

/**
 * Plaatst een doen-item bij elke werkvoorbereider en een weten-item (cc) bij
 * elke projectleider. De cc is niet uit te zetten (BOUW_01 §8).
 * Retourneert hoeveel items er zijn geplaatst per doelgroep.
 */
export async function meldAanWerkvoorbereiderMetCcProjectleider(
  invoer: MeldingInvoer,
): Promise<{ werkvoorbereiders: number; projectleiders: number }> {
  const [wvbIds, plIds] = await Promise.all([
    vindGebruikersMetFunctietitel("Werkvoorbereider"),
    vindGebruikersMetFunctietitel("Projectleider"),
  ]);

  let wvbCount = 0;
  if (wvbIds.length === 0) {
    // Vangnet: geen werkvoorbereider aangesteld → bevoegdheidsgroep projecten≥3.
    await meldWerkbakItem({
      ...invoer, soort: "doen",
      vereisteModule: "projecten", vereistNiveau: 3,
      dedupSleutel: `${invoer.dedupBasis}:wvb:groep`,
    });
    wvbCount = 1;
  } else {
    for (const id of wvbIds) {
      await meldWerkbakItem({
        ...invoer, soort: "doen", gebruikerId: id,
        dedupSleutel: `${invoer.dedupBasis}:wvb:${id}`,
      });
      wvbCount++;
    }
  }

  let plCount = 0;
  for (const id of plIds) {
    // Vaste cc: informeren, niet behandelen.
    await meldWerkbakItem({
      ...invoer, soort: "weten", gebruikerId: id,
      titel: `cc: ${invoer.titel}`,
      dedupSleutel: `${invoer.dedupBasis}:pl:${id}`,
    });
    plCount++;
  }
  if (plIds.length === 0) {
    // Vangnet-cc zodat de kopie nooit wegvalt zolang er geen projectleider is.
    await meldWerkbakItem({
      ...invoer, soort: "weten",
      titel: `cc: ${invoer.titel}`,
      vereisteModule: "projecten", vereistNiveau: 3,
      dedupSleutel: `${invoer.dedupBasis}:pl:groep`,
    });
    plCount = 1;
  }

  return { werkvoorbereiders: wvbCount, projectleiders: plCount };
}
