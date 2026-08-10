// VORM_01 F1 — gemeten WCAG-contrastwaarden voor het donkere (en lichte) palet.
// Uitvoer wordt overgenomen in docs/antwoorden/VORM_01.md.
import { contrast, kleuren } from "@workspace/ontwerp";

const paren: Array<[string, string, string, keyof typeof kleuren.licht, keyof typeof kleuren.licht]> = [
  ["tekst op achtergrond", "foreground", "background", "foreground", "background"],
  ["tekst op kaart", "cardForeground", "card", "cardForeground", "card"],
  ["gedempte tekst op achtergrond", "mutedForeground", "background", "mutedForeground", "background"],
  ["gedempte tekst op kaart", "mutedForeground", "card", "mutedForeground", "card"],
  ["tekst op primair (knop)", "primaryForeground", "primary", "primaryForeground", "primary"],
  ["tekst op secundair", "secondaryForeground", "secondary", "secondaryForeground", "secondary"],
  ["tekst op destructief", "destructiveForeground", "destructive", "destructiveForeground", "destructive"],
  ["accenttekst op achtergrond", "accentForeground", "background", "accentForeground", "background"],
  ["succes als tekst op achtergrond", "success", "background", "success", "background"],
  ["waarschuwing als tekst op achtergrond", "warning", "background", "warning", "background"],
  ["tint (links) op achtergrond", "tint", "background", "tint", "background"],
  ["tekst op donker vlak", "darkForeground", "dark", "darkForeground", "dark"],
  ["gedempt op donker vlak", "darkMuted", "dark", "darkMuted", "dark"],
];

for (const schema of ["licht", "donker"] as const) {
  const p = kleuren[schema];
  console.log(`\n== ${schema} ==`);
  let alles = true;
  for (const [naam, , , fgKey, bgKey] of paren) {
    const fg = p[fgKey];
    const bg = (p[bgKey] as string).length > 7 ? p.background : p[bgKey]; // rgba-accent → op achtergrond meten
    const c = contrast(fg.length > 7 ? fg.slice(0, 7) : fg, bg);
    const ok = c >= 4.5;
    if (!ok) alles = false;
    console.log(`${ok ? "✓" : "✗"} ${naam}: ${fg} op ${bg} = ${c.toFixed(2)}:1`);
  }
  console.log(alles ? "ALLES AA" : "NIET ALLES AA");
}
