// Task 844 — server-side beleid voor het AI-afstootadvies.
//
// "Eigen cijfers eerst" wordt hier AFGEDWONGEN, niet alleen gevraagd in de
// prompt: een onbetrouwbaar AI-antwoord kan nooit een vervang-/afstootadvies
// opleveren voor een voertuig zonder voldoende eigen data, of zonder dat de
// eigen cijfers aantoonbaar boven de vlootmediaan liggen. Puur en zonder
// afhankelijkheden zodat het deterministisch te testen is.

export const AFSTOOT_ADVIES_OPTIES = ["behouden", "monitoren", "vervangen", "afstoten"] as const;
export type AfstootAdvies = (typeof AFSTOOT_ADVIES_OPTIES)[number];

/** Minimaal aantal eigen kostenregels vóór een vervang-/afstootadvies mag. */
export const MIN_KOSTENREGELS_VOOR_AFSTOOT = 3;

export interface AfstootBewijsInvoer {
  aantal_kostenregels: number;
  kosten_laatste_12m: number;
  kosten_per_km_totaal: number | null;
}

export interface AfstootMedianen {
  mediaan_kosten_laatste_12m: number | null;
  mediaan_kosten_per_km: number | null;
}

export interface BeleidResultaat {
  advies: AfstootAdvies;
  /** Ingekort/aangevuld wanneer het beleid het AI-advies heeft afgezwakt. */
  onderbouwing: string;
  /** true wanneer het beleid het AI-advies heeft overschreven. */
  afgezwakt: boolean;
}

/** Is er genoeg eigen data om überhaupt vervangen/afstoten te mogen adviseren? */
export function heeftVoldoendeData(c: AfstootBewijsInvoer): boolean {
  return c.aantal_kostenregels >= MIN_KOSTENREGELS_VOOR_AFSTOOT;
}

/** Liggen de eigen cijfers aantoonbaar boven de vlootmediaan? */
export function overschrijdtMediaan(c: AfstootBewijsInvoer, m: AfstootMedianen): boolean {
  const bovenKosten =
    m.mediaan_kosten_laatste_12m !== null && c.kosten_laatste_12m > m.mediaan_kosten_laatste_12m;
  const bovenPerKm =
    m.mediaan_kosten_per_km !== null &&
    c.kosten_per_km_totaal !== null &&
    c.kosten_per_km_totaal > m.mediaan_kosten_per_km;
  return bovenKosten || bovenPerKm;
}

/**
 * Dwingt het uitvoerbeleid af op een (onbetrouwbaar) AI-advies:
 * - onbekende adviezen → "monitoren";
 * - te weinig eigen kostendata → maximaal "monitoren", met expliciete
 *   data-onvoldoende-onderbouwing;
 * - vervangen/afstoten zonder mediaan-overschrijdend bewijs → "monitoren".
 */
export function pasAfstootBeleidToe(
  ruwAdvies: unknown,
  ruweOnderbouwing: unknown,
  cijfers: AfstootBewijsInvoer,
  medianen: AfstootMedianen,
): BeleidResultaat {
  const advies: AfstootAdvies = AFSTOOT_ADVIES_OPTIES.includes(ruwAdvies as AfstootAdvies)
    ? (ruwAdvies as AfstootAdvies)
    : "monitoren";
  const onderbouwing = String(ruweOnderbouwing ?? "").slice(0, 1000);

  const isIngrijpend = advies === "vervangen" || advies === "afstoten";
  if (!isIngrijpend) {
    return { advies, onderbouwing, afgezwakt: advies !== ruwAdvies };
  }

  if (!heeftVoldoendeData(cijfers)) {
    return {
      advies: "monitoren",
      onderbouwing:
        `Te weinig eigen kostendata (${cijfers.aantal_kostenregels} regel(s), ` +
        `minimaal ${MIN_KOSTENREGELS_VOOR_AFSTOOT} vereist) voor een vervang- of ` +
        `afstootadvies — beperkt tot monitoren tot er meer eigen cijfers zijn.` +
        (onderbouwing ? ` AI-toelichting: ${onderbouwing}` : ""),
      afgezwakt: true,
    };
  }

  if (!overschrijdtMediaan(cijfers, medianen)) {
    return {
      advies: "monitoren",
      onderbouwing:
        `De eigen cijfers van dit voertuig liggen niet boven de vlootmediaan ` +
        `(kosten 12 mnd en kosten/km) — een vervang- of afstootadvies is daarmee ` +
        `niet onderbouwd; beperkt tot monitoren.` +
        (onderbouwing ? ` AI-toelichting: ${onderbouwing}` : ""),
      afgezwakt: true,
    };
  }

  return { advies, onderbouwing, afgezwakt: false };
}
