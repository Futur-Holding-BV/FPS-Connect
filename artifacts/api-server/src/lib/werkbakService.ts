// WERKBAK_01 — centrale schrijf-/reconciliatiehelper voor de werkbak.
// Eén open item per dedup-sleutel (partiële unieke index, DB-afgedwongen).
// Items verdwijnen nooit vanzelf: alleen afhandelen of bewust wegzetten.
// Bron-reconciliatie: als de bron zelf is opgelost (bijv. verlofaanvraag in de
// HRM-module goedgekeurd) wordt het werkbak-item afgehandeld gemarkeerd —
// dat is afhandeling met herleidbare oorzaak, geen uitdoven.
import { db, werkbakItemsTable } from "@workspace/db";
import { and, eq, inArray, notInArray } from "drizzle-orm";

export type WerkbakSoort = "doen" | "weten";

export type WerkbakInvoer = {
  soort: WerkbakSoort;
  bron: string;
  titel: string;
  omschrijving?: string | null;
  gebruikerId?: number | null;
  vereisteModule?: string | null;
  vereistNiveau?: number | null;
  alleenHoofdbeheerder?: boolean;
  gewicht?: number;
  actiePad?: string | null;
  actieType?: string | null;
  herkomstType: string;
  herkomstId?: number | null;
  dedupSleutel: string;
};

// Vaste bronnenlijst (§5 WERKBAK_01). Niets erin buiten deze lijst om —
// uitbreiden is een besluit, geen module die zichzelf toevoegt.
export const WERKBAK_BRONNEN = [
  "goedkeuringsaanvraag",
  "verlofaanvraag",
  "factuur_goedkeuring",
  "betaalbatch",
  "conceptantwoord",
  "mail_antwoord",
  "contractbesluit",
  "poortwachter",
  "verloopdatum",
  "verlofverjaring",
  "factuursignaal",
  "contract_verlenging",
  "bewakingsloop",
  // WAGENPARK_01 §6.1: garagemail die niet verstuurd kon worden mag nooit stil blijven.
  "wagenpark_garagemail",
] as const;

export async function meldWerkbakItem(invoer: WerkbakInvoer): Promise<boolean> {
  if (!(WERKBAK_BRONNEN as readonly string[]).includes(invoer.bron)) {
    throw new Error(`Onbekende werkbak-bron: ${invoer.bron} — uitbreiden vereist een besluit (WERKBAK_01 §5)`);
  }
  const rijen = await db
    .insert(werkbakItemsTable)
    .values({
      soort: invoer.soort,
      bron: invoer.bron,
      titel: invoer.titel,
      omschrijving: invoer.omschrijving ?? null,
      gebruikerId: invoer.gebruikerId ?? null,
      vereisteModule: invoer.vereisteModule ?? null,
      vereistNiveau: invoer.vereistNiveau ?? null,
      alleenHoofdbeheerder: invoer.alleenHoofdbeheerder ?? false,
      gewicht: invoer.gewicht ?? 0,
      actiePad: invoer.actiePad ?? null,
      actieType: invoer.actieType ?? null,
      herkomstType: invoer.herkomstType,
      herkomstId: invoer.herkomstId ?? null,
      dedupSleutel: invoer.dedupSleutel,
    })
    .onConflictDoNothing()
    .returning({ id: werkbakItemsTable.id });
  return rijen.length > 0;
}

// Bron opgelost → open item(s) met deze sleutel afgehandeld markeren (systeem).
export async function handelBronAf(dedupSleutel: string): Promise<void> {
  await db
    .update(werkbakItemsTable)
    .set({ status: "afgehandeld", afgehandeldOp: new Date(), bijgewerktOp: new Date() })
    .where(and(eq(werkbakItemsTable.dedupSleutel, dedupSleutel), eq(werkbakItemsTable.status, "open")));
}

// Reconciliatie per bron: alles wat open staat in de werkbak maar waarvan de
// bron niet meer in de actuele open-set zit, wordt afgehandeld gemarkeerd.
export async function reconcilieerBron(bron: string, actueleSleutels: string[]): Promise<number> {
  const voorwaarden = [eq(werkbakItemsTable.bron, bron), eq(werkbakItemsTable.status, "open")];
  const stale = actueleSleutels.length > 0
    ? and(...voorwaarden, notInArray(werkbakItemsTable.dedupSleutel, actueleSleutels))
    : and(...voorwaarden);
  const rijen = await db
    .update(werkbakItemsTable)
    .set({ status: "afgehandeld", afgehandeldOp: new Date(), bijgewerktOp: new Date() })
    .where(stale)
    .returning({ id: werkbakItemsTable.id });
  return rijen.length;
}

// Sync-helper: zet de volledige actuele open-set voor een bron (aanmaken wat
// nieuw is, afhandelen wat verdwenen is). Idempotent.
export async function syncBron(bron: string, items: WerkbakInvoer[]): Promise<{ nieuw: number; afgehandeld: number }> {
  for (const item of items) {
    if (!(WERKBAK_BRONNEN as readonly string[]).includes(item.bron)) {
      throw new Error(`Onbekende werkbak-bron: ${item.bron} — uitbreiden vereist een besluit (WERKBAK_01 §5)`);
    }
  }
  // Transactioneel: aanmaken en reconciliëren als één geheel, zodat een
  // overlappende draai nooit een zojuist aangemaakte set als stale afsluit.
  return db.transaction(async (tx) => {
    let nieuw = 0;
    for (const item of items) {
      const rijen = await tx
        .insert(werkbakItemsTable)
        .values({
          soort: item.soort,
          bron: item.bron,
          titel: item.titel,
          omschrijving: item.omschrijving ?? null,
          gebruikerId: item.gebruikerId ?? null,
          vereisteModule: item.vereisteModule ?? null,
          vereistNiveau: item.vereistNiveau ?? null,
          alleenHoofdbeheerder: item.alleenHoofdbeheerder ?? false,
          gewicht: item.gewicht ?? 0,
          actiePad: item.actiePad ?? null,
          actieType: item.actieType ?? null,
          herkomstType: item.herkomstType,
          herkomstId: item.herkomstId ?? null,
          dedupSleutel: item.dedupSleutel,
        })
        .onConflictDoNothing()
        .returning({ id: werkbakItemsTable.id });
      if (rijen.length > 0) nieuw += 1;
    }
    const actueleSleutels = items.map((i) => i.dedupSleutel);
    const voorwaarden = [eq(werkbakItemsTable.bron, bron), eq(werkbakItemsTable.status, "open")];
    const stale = actueleSleutels.length > 0
      ? and(...voorwaarden, notInArray(werkbakItemsTable.dedupSleutel, actueleSleutels))
      : and(...voorwaarden);
    const afgehandeldRijen = await tx
      .update(werkbakItemsTable)
      .set({ status: "afgehandeld", afgehandeldOp: new Date(), bijgewerktOp: new Date() })
      .where(stale)
      .returning({ id: werkbakItemsTable.id });
    return { nieuw, afgehandeld: afgehandeldRijen.length };
  });
}

export async function haalOpenItems(ids: number[]) {
  if (ids.length === 0) return [];
  return db.select().from(werkbakItemsTable)
    .where(and(inArray(werkbakItemsTable.id, ids), eq(werkbakItemsTable.status, "open")));
}
