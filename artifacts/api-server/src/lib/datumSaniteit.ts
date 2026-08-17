// ─── Datum-saniteit voor medewerkerprofiel-velden ────────────────────────────
// Dossier-AI, import en handmatige invoer kunnen onzinjaartallen aanleveren
// (waargenomen: "82026-07-14"). De kolommen zijn text, dus zonder poort landt
// dat gewoon in de database en toont het personeelsdossier "14 jul 82026".
// Elke geschreven datum moet een echte kalenderdatum zijn (JJJJ-MM-DD) met
// jaartal 1900–2100. Alle schrijfpaden (routes, AI-voorstel-doorvoer, import)
// moeten deze helpers gebruiken — nooit een eigen lossere check.

export const DATUMVELDEN_MEDEWERKER = [
  "in_dienst_sinds", "uit_dienst_per", "geboortedatum", "rijbewijs_vervaldatum",
  "vca_vervaldatum", "ehbo_vervaldatum", "bhv_vervaldatum",
] as const;

export function isRedelijkeDatum(w: unknown): boolean {
  if (typeof w !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(w)) return false;
  const jaar = Number(w.slice(0, 4));
  if (jaar < 1900 || jaar > 2100) return false;
  // Kalendervalidatie: 2026-02-30 is regex-geldig maar geen echte datum.
  const d = new Date(`${w}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === w;
}

/** Namen van datumvelden die gevuld maar ongeldig zijn (null/undefined/"" tellen niet mee). */
export function ongeldigeDatumvelden(body: Record<string, unknown>): string[] {
  return DATUMVELDEN_MEDEWERKER.filter((veld) => {
    const w = body[veld];
    return w != null && w !== "" && !isRedelijkeDatum(w);
  });
}
