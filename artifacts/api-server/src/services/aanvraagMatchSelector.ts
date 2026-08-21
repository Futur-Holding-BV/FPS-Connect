// Pure klant-selectielogica zonder DB-imports — testbaar zonder mocking.
// AANVRAAG_01 §3 — selecteer de juiste klant uit een lijst kandidaten.

export interface KlantKandidaat {
  id: number;
  naam: string;
  redenen: string[];
  sterkte: "sterk" | "zwak";
}

export interface KlantSelectieResultaat {
  klantId: number | null;
  klantNaam: string | null;
  kandidaten: KlantKandidaat[];
}

/**
 * Pure selectiefunctie — geen DB-calls, direct testbaar.
 * Precies één sterke kandidaat → preselecteren.
 * Kandidaten worden ALTIJD teruggegeven (ook bij preselectie) zodat UI reden/sterkte kan tonen.
 * Meerdere sterken of alleen zwakken → nooit auto-selecteren.
 */
export function selecteerKlantUitKandidaten(kandidaten: KlantKandidaat[]): KlantSelectieResultaat {
  const sterkeKandidaten = kandidaten.filter((k) => k.sterkte === "sterk");
  if (sterkeKandidaten.length === 1) {
    return { klantId: sterkeKandidaten[0].id, klantNaam: sterkeKandidaten[0].naam, kandidaten };
  }
  return { klantId: null, klantNaam: null, kandidaten };
}
