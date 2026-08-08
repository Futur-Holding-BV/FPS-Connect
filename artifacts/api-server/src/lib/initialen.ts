// NOTITIE_01: één plek voor het afleiden van initialen uit een naam,
// zodat "Jan van der Berg" niet per scherm JvdB of JB wordt.
// Zelf ingestelde initialen (gebruikers.initialen) gaan altijd voor.

const TUSSENVOEGSELS = new Set([
  "van", "de", "der", "den", "het", "ter", "ten", "te", "in", "op", "aan", "bij", "tot", "'t",
]);

export function leidInitialenAf(naam: string): string {
  const woorden = naam.trim().split(/\s+/).filter(Boolean);
  if (woorden.length === 0) return "?";
  if (woorden.length === 1) return woorden[0]!.slice(0, 2).toUpperCase();
  const delen = woorden.map((w) =>
    TUSSENVOEGSELS.has(w.toLowerCase()) ? w[0]!.toLowerCase() : w[0]!.toUpperCase(),
  );
  return delen.join("");
}

export function effectieveInitialen(initialen: string | null | undefined, naam: string): string {
  const eigen = (initialen ?? "").trim();
  return eigen !== "" ? eigen : leidInitialenAf(naam);
}
