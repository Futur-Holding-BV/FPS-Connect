// Gedeelde helpers voor de SCAB-mail route.
// Staan in een apart bestand zodat ze direct door unit tests bereikbaar zijn.

export type WerkgeverBodyInfo = {
  naam: string;
  internContactNaam: string | null;
  internContactEmail: string | null;
} | null;

export type MutatieBodyItem = {
  medewerkerNaam: string | null;
  medewerkerId: number | null;
  type: string;
  omschrijving: string | null;
  ingangsdatum: string | null;
};

export const MAAND_NAMEN_NL = [
  "januari","februari","maart","april","mei","juni",
  "juli","augustus","september","oktober","november","december",
];

/**
 * Genereert een volledige, deterministische mailtekst (aanhef + regellijst +
 * ondertekening). Wordt gebruikt bij zowel genereren als bij het bijwerken van
 * de mutatieselectie zodat de ondertekening altijd server-side met echte
 * werkgeverdata wordt samengesteld.
 */
export function genereerDeterministischeBody(
  werkmaatschappij: string,
  jaar: number,
  maand: number,
  mutaties: MutatieBodyItem[],
  werkgeverInfo: WerkgeverBodyInfo,
): string {
  const periodeLabel = `${MAAND_NAMEN_NL[maand - 1]} ${jaar}`;
  const afzenderBedrijf = werkgeverInfo?.naam ?? werkmaatschappij;
  const afzenderPersoon = werkgeverInfo?.internContactNaam ?? null;
  const ondertekening =
    `\nMet vriendelijke groet,\n` +
    `${afzenderPersoon ? `${afzenderPersoon}\n` : ""}` +
    `${afzenderBedrijf}\nPersoneelszaken` +
    `${werkgeverInfo?.internContactEmail ? `\n${werkgeverInfo.internContactEmail}` : ""}` +
    `\n`;

  let inhoud =
    `Geachte heer/mevrouw,\n\n` +
    `Hierbij de salarismutaties voor ${werkmaatschappij} over de loonperiode ${periodeLabel}.\n\n`;

  if (mutaties.length === 0) {
    inhoud += "Er zijn geen mutaties geselecteerd voor deze periode.\n";
  } else {
    mutaties.forEach((m) => {
      const naam = m.medewerkerNaam ?? `medewerker ${m.medewerkerId}`;
      inhoud += `- ${naam}: ${m.type}`;
      if (m.omschrijving) inhoud += ` (${m.omschrijving})`;
      if (m.ingangsdatum) inhoud += `, ingangsdatum ${m.ingangsdatum}`;
      inhoud += "\n";
    });
  }

  inhoud += ondertekening;
  return inhoud;
}

/**
 * Fail-closed type-validatie: retourneert het eerste element dat geen geheel
 * getal is, of undefined als alles klopt. Stille filtering wordt bewust
 * vermeden: één ongeldig element verwerpt het hele verzoek zodat de
 * boekhoudkundige scope nooit stilzwijgend verkleint.
 */
export function eersteOngeldigeElement(ids: unknown[]): unknown {
  return ids.find(
    (v) => typeof v !== "number" || !Number.isInteger(v) || !Number.isFinite(v),
  );
}

/**
 * Dedupliceert een array gehele getallen terwijl de volgorde bewaard blijft.
 */
export function dedupliceerId(ids: number[]): number[] {
  return [...new Set(ids)];
}
