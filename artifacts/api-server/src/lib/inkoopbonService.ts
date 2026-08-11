// MATERIAAL_01 fase 3 / INKOOP: één gedeelde aanmaakroute voor concept-
// inkoopbonnen. Zowel de handmatige POST (werkvoorbereiding) als de
// automatische aanmaak bij een goedgekeurde materiaal-aanvraag lopen hier
// doorheen — er bestaat bewust géén vierde bestelpad (§7.5).
import {
  db,
  inkoopbonnenTable,
  inkoopbonRegelsTable,
  inkoopplannenTable,
  opdrachtenTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { formatNummer } from "./kenmerk";
import { heeftAkkoord, GeenAkkoordFout } from "./akkoordPoort";

type Uitvoerder = Pick<typeof db, "select" | "insert" | "update">;

export interface ConceptBonRegel {
  inkoopplan_regel_id?: number | null;
  omschrijving: string;
  hoeveelheid: number;
  eenheid: string;
  prijs?: number | null;
}

export interface ConceptBonInvoer {
  opdrachtId: number;
  leverancier: string;
  gewensteLeverdatum?: string | null;
  opmerkingen?: string | null;
  regels?: ConceptBonRegel[];
}

/**
 * Maakt een concept-inkoopbon op een opdracht, met I-nummer uit de gedeelde
 * DB-sequence (NUMMER_01) en offerte-koppeling van de opdracht. Draait binnen
 * de meegegeven transactie als die er is.
 */
export async function maakConceptInkoopbon(
  invoer: ConceptBonInvoer,
  uitvoerder: Uitvoerder = db,
): Promise<typeof inkoopbonnenTable.$inferSelect> {
  // AKKOORD_01 §3.3: geen inkoopbon zonder vastgelegd akkoord op de opdracht.
  // Dit is de ENE poort — hij dekt daarmee zowel de handmatige POST als de
  // automatische bon uit een goedgekeurde materiaal-aanvraag.
  const toets = await heeftAkkoord(invoer.opdrachtId, uitvoerder);
  if (!toets.akkoord) throw new GeenAkkoordFout(toets.melding);

  const [plan] = await uitvoerder.select().from(inkoopplannenTable)
    .where(eq(inkoopplannenTable.opdrachtId, invoer.opdrachtId));

  // NUMMER_01 §4.5: projectinkoop hangt aan de offerte van de opdracht.
  const [opdrachtRij] = await uitvoerder
    .select({ offerteId: opdrachtenTable.offerteId })
    .from(opdrachtenTable)
    .where(eq(opdrachtenTable.id, invoer.opdrachtId));

  const inputRegels = invoer.regels ?? [];
  const totaalBedrag = inputRegels.reduce(
    (acc, r) => acc + (r.prijs ?? 0) * r.hoeveelheid, 0);

  let [bon] = await uitvoerder.insert(inkoopbonnenTable).values({
    inkoopplanId: plan?.id ?? null,
    opdrachtId: invoer.opdrachtId,
    offerteId: opdrachtRij?.offerteId ?? null,
    leverancier: invoer.leverancier,
    gewensteLeverdatum: invoer.gewensteLeverdatum ?? null,
    totaalBedrag: totaalBedrag > 0 ? totaalBedrag : null,
    status: "concept",
    opmerkingen: invoer.opmerkingen ?? null,
  }).returning();

  // Legacy weergaveveld meezetten op basis van het echte sequencenummer.
  [bon] = await uitvoerder.update(inkoopbonnenTable)
    .set({ bonNummer: formatNummer("I", bon.nummer) })
    .where(eq(inkoopbonnenTable.id, bon.id))
    .returning();

  if (inputRegels.length > 0) {
    await uitvoerder.insert(inkoopbonRegelsTable).values(
      inputRegels.map((r, i) => ({
        inkoopbonId: bon.id,
        inkoopplanRegelId: r.inkoopplan_regel_id ?? null,
        omschrijving: r.omschrijving,
        hoeveelheid: r.hoeveelheid,
        eenheid: r.eenheid,
        prijs: r.prijs ?? null,
        totaal: r.prijs != null ? r.hoeveelheid * r.prijs : null,
        volgorde: i,
      }))
    );
  }

  return bon;
}
