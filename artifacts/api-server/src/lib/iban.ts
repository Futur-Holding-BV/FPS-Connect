// ADMINISTRATIE_01 fase 2 — IBAN-geldigheidscontrole (ISO 13616, mod-97).
// Fail-closed: alles wat niet aantoonbaar geldig is, wordt geweigerd.

export function normaliseerIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

export function isGeldigIban(iban: string): boolean {
  const s = normaliseerIban(iban);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  // Nederlandse IBAN's zijn altijd exact 18 tekens.
  if (s.startsWith("NL") && s.length !== 18) return false;
  const herschikt = s.slice(4) + s.slice(0, 4);
  let rest = 0;
  for (const ch of herschikt) {
    const waarde = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    rest = Number(`${rest}${waarde}`) % 97;
  }
  return rest === 1;
}
