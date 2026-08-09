// ─── PRIJS_01 §3–§6: prijsafspraken — geldigheids- en staffelkeuze + vergelijking ───
//
// De kern van deze module: Connect weet wat FPS werkelijk betaalt. Dit bestand
// biedt twee vragen aan de rest van het systeem:
//   1. `vindGeldigeAfspraak` — welke prijs geldt op deze datum, voor dit artikel,
//      bij deze leverancier, op deze staffel? (calculatie §5 + factuurcontrole §6)
//   2. `vergelijkMetVorige` — wat verandert er t.o.v. de vorige afspraak bij het
//      inladen van een nieuwe prijslijst? (controlescherm §4)

import { and, eq, isNull, lte, gte } from "drizzle-orm";
import { db, prijsafsprakenTable } from "@workspace/db";
import type { Prijsafspraak } from "@workspace/db";

export type GeldigeAfspraakInvoer = {
  artikelId?: number | null;
  leverancierId?: number | null;
  leverancierArtikelcode?: string | null;
  datum: string; // 'JJJJ-MM-DD'
  hoeveelheid?: number | null;
};

export type GeldigeAfspraakUitkomst = {
  afspraak: Prijsafspraak | null;
  kandidaten: Prijsafspraak[];
};

/**
 * Vindt de prijsafspraak die geldt op `datum`:
 *  - teruggedraaid_op IS NULL,
 *  - datum in [geldig_van, geldig_tot] (inclusief),
 *  - juiste staffel: hoogste staffel_vanaf <= hoeveelheid (default 0),
 *  - filter op artikelId en/of leverancierArtikelcode en/of leverancierId.
 *
 * Zonder leverancierId (meerdere leveranciers mogelijk): de laagste prijs wint,
 * maar alle kandidaten worden teruggegeven zodat de aanroeper kan tonen wie er
 * nog meer levert.
 */
export async function vindGeldigeAfspraak(invoer: GeldigeAfspraakInvoer): Promise<GeldigeAfspraakUitkomst> {
  const { artikelId, leverancierId, leverancierArtikelcode, datum } = invoer;
  const hoeveelheid = invoer.hoeveelheid ?? 0;

  if (artikelId == null && !leverancierArtikelcode) {
    return { afspraak: null, kandidaten: [] };
  }

  const conds = [
    isNull(prijsafsprakenTable.teruggedraaidOp),
    lte(prijsafsprakenTable.geldigVan, datum),
    gte(prijsafsprakenTable.geldigTot, datum),
    // Alleen staffels die van toepassing zijn op deze hoeveelheid.
    lte(prijsafsprakenTable.staffelVanaf, hoeveelheid),
  ];
  if (artikelId != null) {
    conds.push(eq(prijsafsprakenTable.artikelId, artikelId));
  } else if (leverancierArtikelcode) {
    conds.push(eq(prijsafsprakenTable.leverancierArtikelcode, leverancierArtikelcode));
  }
  if (leverancierId != null) {
    conds.push(eq(prijsafsprakenTable.leverancierId, leverancierId));
  }

  const rijen = await db
    .select()
    .from(prijsafsprakenTable)
    .where(and(...conds));

  if (rijen.length === 0) return { afspraak: null, kandidaten: [] };

  // Per (leverancier, artikel/artikelcode): kies de hoogste geldende staffel.
  const perSleutel = new Map<string, Prijsafspraak>();
  for (const rij of rijen) {
    const sleutel = `${rij.leverancierId}|${rij.artikelId ?? "-"}|${rij.leverancierArtikelcode ?? "-"}`;
    const huidig = perSleutel.get(sleutel);
    if (!huidig || rij.staffelVanaf > huidig.staffelVanaf) {
      perSleutel.set(sleutel, rij);
    }
  }

  const kandidaten = [...perSleutel.values()].sort((a, b) => parseFloat(a.prijs) - parseFloat(b.prijs));
  // Laagste prijs wint; bij expliciete leverancier is er hooguit één kandidaat.
  const afspraak = kandidaten[0] ?? null;
  return { afspraak, kandidaten };
}

// ── §4: vergelijking met de vorige afspraak (controlescherm bij importeren) ──
export type NieuweRegel = {
  artikelId?: number | null;
  leverancierArtikelcode?: string | null;
  prijs: number; // in de eenheid van de nieuwe lijst
};

export type VergelijkingRegel = {
  artikelId: number | null;
  leverancierArtikelcode: string | null;
  oudePrijs: number;
  nieuwePrijs: number;
  verschilPct: number; // (nieuw - oud) / oud * 100
};

export type VergelijkingUitkomst = {
  duurder: number;
  goedkoper: number;
  gelijk: number;
  nieuw: number;
  topVerschillen: VergelijkingRegel[]; // top-10 grootste absolute procentuele verschillen
};

/**
 * Vergelijkt de nieuwe regels met de laatst geldende oude prijs per artikel/
 * artikelcode bij deze leverancier: telling duurder/goedkoper/gelijk/nieuw plus
 * de tien grootste procentuele verschillen (§4-controlescherm).
 *
 * "Laatst geldende oude prijs" = de niet-teruggedraaide regel met de hoogste
 * geldig_van (staffel 0/basisprijs) per artikel/artikelcode bij deze leverancier.
 */
export async function vergelijkMetVorige(nieuweRegels: NieuweRegel[], leverancierId: number): Promise<VergelijkingUitkomst> {
  // Laatst geldende basisprijs (staffel 0) per artikel_id en per artikelcode.
  const bestaand = await db
    .select()
    .from(prijsafsprakenTable)
    .where(and(
      eq(prijsafsprakenTable.leverancierId, leverancierId),
      isNull(prijsafsprakenTable.teruggedraaidOp),
      eq(prijsafsprakenTable.staffelVanaf, 0),
    ));

  const perArtikel = new Map<number, Prijsafspraak>();
  const perCode = new Map<string, Prijsafspraak>();
  for (const rij of bestaand) {
    if (rij.artikelId != null) {
      const h = perArtikel.get(rij.artikelId);
      if (!h || rij.geldigVan > h.geldigVan) perArtikel.set(rij.artikelId, rij);
    } else if (rij.leverancierArtikelcode) {
      const h = perCode.get(rij.leverancierArtikelcode);
      if (!h || rij.geldigVan > h.geldigVan) perCode.set(rij.leverancierArtikelcode, rij);
    }
  }

  let duurder = 0, goedkoper = 0, gelijk = 0, nieuw = 0;
  const verschillen: VergelijkingRegel[] = [];

  for (const regel of nieuweRegels) {
    let oud: Prijsafspraak | undefined;
    if (regel.artikelId != null) oud = perArtikel.get(regel.artikelId);
    else if (regel.leverancierArtikelcode) oud = perCode.get(regel.leverancierArtikelcode);

    if (!oud) {
      nieuw++;
      continue;
    }
    const oudePrijs = parseFloat(oud.prijs);
    const nieuwePrijs = regel.prijs;
    if (nieuwePrijs > oudePrijs) duurder++;
    else if (nieuwePrijs < oudePrijs) goedkoper++;
    else gelijk++;

    const verschilPct = oudePrijs !== 0 ? ((nieuwePrijs - oudePrijs) / oudePrijs) * 100 : 0;
    verschillen.push({
      artikelId: regel.artikelId ?? null,
      leverancierArtikelcode: regel.leverancierArtikelcode ?? null,
      oudePrijs,
      nieuwePrijs,
      verschilPct,
    });
  }

  const topVerschillen = verschillen
    .sort((a, b) => Math.abs(b.verschilPct) - Math.abs(a.verschilPct))
    .slice(0, 10);

  return { duurder, goedkoper, gelijk, nieuw, topVerschillen };
}
