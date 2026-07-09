// Pure hulpfuncties voor de rapporten-module.
// Geïsoleerd zodat ze unit-testbaar zijn zonder DB- of storage-imports.
import type { opleverrapportenTable } from "@workspace/db";

/**
 * Bouwt de insert-waarden voor een nieuwe conceptversie van een bestaand rapport.
 *
 * Bewust GEEN kopie van reactietermijn_melding_verzond_op: de melding-markering
 * hoort uitsluitend bij de versie waarop de termijn verstrijkt, niet bij een
 * opvolgende versie. De nieuwe rij krijgt NULL via de DB-default.
 *
 * Bevriezings- en reactietermijn-velden worden evenmin gekopieerd: de nieuwe
 * versie is een concept en heeft die toestand nog niet bereikt.
 */
export function bouwNieuweVersieWaarden(
  huidig: typeof opleverrapportenTable.$inferSelect,
  aangemaaktDoor: number | null,
  nu: Date,
): typeof opleverrapportenTable.$inferInsert {
  return {
    gebouwId: huidig.gebouwId,
    rapportType: huidig.rapportType,
    versie: huidig.versie + 1,
    status: "concept",
    titel: huidig.titel,
    secties: (huidig.secties ?? {}) as Record<string, unknown>,
    spotSelectie: (huidig.spotSelectie ?? {}) as Record<string, unknown>,
    bijlagenIds: huidig.bijlagenIds ?? [],
    tekeningIds: huidig.tekeningIds ?? [],
    aangemaaktDoor,
    bijgewerktOp: nu,
    // reactietermijnMeldingVerzondOp wordt bewust weggelaten (blijft NULL)
    // bevrorenOp, bevrorenDocumentRevisies, reactietermijnDatum,
    // reactietermijnGestarteOp: hoort bij definitief-maken, niet bij aanmaken
  };
}
