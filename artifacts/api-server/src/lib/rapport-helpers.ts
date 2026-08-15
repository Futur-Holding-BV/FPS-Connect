// Pure hulpfuncties voor de rapporten-module.
// Geïsoleerd zodat ze unit-testbaar zijn zonder DB- of storage-imports.
import type { opleverrapportenTable } from "@workspace/db";

/**
 * Dedupliceert een lijst van partijen op e-mailadres (case-insensitief).
 * Bij meerdere rijen met hetzelfde adres wordt alleen de eerste rij bewaard.
 * Rijen zonder e-mailadres worden gefilterd.
 */
export function dedupeerPartijEmails<T extends { email: string | null }>(
  partijen: T[],
): T[] {
  const gezien = new Set<string>();
  const resultaat: T[] = [];
  for (const partij of partijen) {
    if (!partij.email) continue;
    const genormaliseerd = partij.email.trim().toLowerCase();
    if (gezien.has(genormaliseerd)) continue;
    gezien.add(genormaliseerd);
    resultaat.push(partij);
  }
  return resultaat;
}

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
