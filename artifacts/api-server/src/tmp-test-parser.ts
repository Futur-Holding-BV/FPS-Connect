import { readFileSync } from "fs";
import { parseEnkTekst } from "./lib/enkImport";
import { centenNaarEuroTekst, somCenten } from "./lib/geldCenten";
const tekst = readFileSync("/tmp/enk_tekst.txt", "utf8");
const r = parseEnkTekst(tekst);
console.log("succes:", r.succes, "| calcnr:", r.calculatienummer, "| projnr:", r.projectnummer);
console.log("naam:", r.naam);
console.log("opdrachtgever:", r.opdrachtgever, "| datum:", r.datum);
console.log("totaalEnk:", r.totaalEnkCenten, "=", r.totaalEnkCenten !== null ? centenNaarEuroTekst(r.totaalEnkCenten) : null);
for (const h of r.hoofdstukken) {
  console.log(`H: "${h.naam}" | regels=${h.regels.length} (geprijsd ${h.regels.filter(x=>x.totaalCenten!==0).length}) | som=${centenNaarEuroTekst(h.somRegelsCenten)} | enk=${h.totaalEnkCenten!==null?centenNaarEuroTekst(h.totaalEnkCenten):"-"}`);
}
const alleRegels = r.hoofdstukken.flatMap(h=>h.regels);
console.log("Connect-som (alle regels):", centenNaarEuroTekst(somCenten(alleRegels.map(x=>x.totaalCenten))));
console.log("waarschuwingen:", r.waarschuwingen);
console.log("bewijs:", r.bewijs);
