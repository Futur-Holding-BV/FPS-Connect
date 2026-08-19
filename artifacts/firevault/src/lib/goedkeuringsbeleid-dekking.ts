export interface GoedkeuringsbeleidBand {
  document_type: string;
  werkmaatschappij_id?: number | null;
  ondergrens?: number | null;
  bovengrens?: number | null;
  actief: boolean;
}

export interface GoedkeuringsbeleidDekkingsgat {
  ondergrens: number;
  bovengrens: number | null;
}

const INKOOPFACTUUR = "inkoop_factuur";

/**
 * Bepaalt welke niet-negatieve factuurbedragen niet worden afgedekt door een
 * actieve, algemene inkoopfactuurregel. De factuurstroom zoekt bewust zonder
 * werkmaatschappij, waardoor een bedrijfsspecifieke regel deze poort niet dekt.
 */
export function vindInkoopfactuurDekkingsgaten(
  regels: readonly GoedkeuringsbeleidBand[],
): GoedkeuringsbeleidDekkingsgat[] {
  const banden = regels
    .filter(
      (regel) =>
        regel.actief &&
        regel.document_type === INKOOPFACTUUR &&
        regel.werkmaatschappij_id == null,
    )
    .map((regel) => {
      const ondergrens = Math.max(0, regel.ondergrens ?? 0);
      const bovengrens = regel.bovengrens ?? null;
      return { ondergrens, bovengrens };
    })
    .filter(
      (band) =>
        band.bovengrens == null ||
        (Number.isFinite(band.bovengrens) && band.bovengrens > band.ondergrens),
    )
    .sort((a, b) => {
      if (a.ondergrens !== b.ondergrens) return a.ondergrens - b.ondergrens;
      if (a.bovengrens == null) return -1;
      if (b.bovengrens == null) return 1;
      return b.bovengrens - a.bovengrens;
    });

  const gaten: GoedkeuringsbeleidDekkingsgat[] = [];
  let gedektTot = 0;

  for (const band of banden) {
    if (band.ondergrens > gedektTot) {
      gaten.push({ ondergrens: gedektTot, bovengrens: band.ondergrens });
    }

    if (band.bovengrens == null) {
      return gaten;
    }

    gedektTot = Math.max(gedektTot, band.bovengrens);
  }

  gaten.push({ ondergrens: gedektTot, bovengrens: null });
  return gaten;
}