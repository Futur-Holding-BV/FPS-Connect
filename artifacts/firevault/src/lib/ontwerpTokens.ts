// VORM_01 F2 — de webschil leidt zijn merk- en bewegingsvariabelen af uit de
// ene gedeelde tokenbron (@workspace/ontwerp): primair, destructief, ring,
// radius en de duren/versnelling. De statische waarden in index.css blijven
// als no-JS-terugval; deze injectie overschrijft ze zodra de app laadt, zodat
// de merkkleur en beweging op web en Expo nooit uit elkaar kunnen lopen.
// Oppervlaktekleuren (achtergrond/kaart/popover/sidebar) zijn bewust
// web-eigen en blijven volledig in index.css (zie cssVariabelen()).
import { cssVariabelen } from "@workspace/ontwerp";

function naarCss(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
}

export function injecteerOntwerpTokens(): void {
  const id = "ontwerp-tokens";
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id;
  el.textContent = `:root {\n${naarCss(cssVariabelen("licht"))}\n}\n.dark {\n${naarCss(cssVariabelen("donker"))}\n}`;
  document.head.appendChild(el);
}
