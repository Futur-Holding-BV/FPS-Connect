/**
 * @workspace/ontwerp — de ene tokenbron voor FPS Connect (web) én FPS Monteur
 * (Expo). VORM_01: kleur bestond al; hier komen hoogte, ruimte, typografie,
 * beweging en het donkere palet bij. Er valt niets meer te synchroniseren:
 * beide schillen lezen dit bestand.
 *
 * Harde regels:
 * - Geen kleurwaarde, maat of duur buiten dit bestand in schermen/bouwstenen.
 * - Donker palet: tekst op elke achtergrond haalt WCAG AA (4,5:1) — gemeten
 *   in docs/antwoorden/VORM_01.md.
 */

export type Palet = {
  text: string;
  tint: string;
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  success: string;
  successForeground: string;
  warning: string;
  warningForeground: string;
  border: string;
  input: string;
  dark: string;
  darkForeground: string;
  darkMuted: string;
};

// ── Kleur ────────────────────────────────────────────────────────────────────

// Bewust géén `as const`: schermen typen tegen `string`, anders wordt elke
// bestaande (nog niet omgezette) kleurwaarde een compile-fout.
export const kleuren: { licht: Palet; donker: Palet } = {
  licht: {
    text: "#1A1D23",
    tint: "#F23B0D",

    background: "#F6F7F9",
    foreground: "#1A1D23",

    card: "#FFFFFF",
    cardForeground: "#1A1D23",

    primary: "#F23B0D",
    primaryForeground: "#FFFFFF",

    secondary: "#EDEFF2",
    secondaryForeground: "#1A1D23",

    muted: "#EDEFF2",
    mutedForeground: "#6B7280",

    accent: "#FCE9E2",
    accentForeground: "#9A2A0C",

    destructive: "#E5484D",
    destructiveForeground: "#FFFFFF",

    // Foregrounds op succes/waarschuwing: wit haalt op deze middentinten geen
    // AA voor kleine tekst; donkere inkt wel (gemeten ≥7:1 op beide).
    success: "#22A06B",
    successForeground: "#0B2B1C",
    warning: "#E8870E",
    warningForeground: "#33200A",

    border: "#E2E5EA",
    input: "#E2E5EA",

    // Donkere oppervlakken (kopbalken, login) — bewuste contrastlaag.
    dark: "#212631",
    darkForeground: "#F3F5F8",
    darkMuted: "#9AA3B2",
  },

  // Donker palet, afgeleid van #212631 (de bestaande contrastlaag) als basis.
  // Elke *Foreground haalt AA (≥4,5:1) op zijn eigen achtergrond; gemeten in
  // docs/antwoorden/VORM_01.md. Statuskleuren zijn iets lichter dan in licht
  // zodat ze op donker leesbaar blijven als tekstkleur. primary/destructive
  // zijn hier iets verdiept (zelfde tint) omdat wit op #F23B0D maar 3,88:1
  // haalt — de merkkleur zelf blijft als `tint` aanwezig via #FF7A52.
  donker: {
    text: "#F3F5F8",
    tint: "#FF7A52",

    background: "#212631",
    foreground: "#F3F5F8",

    card: "#2A3140",
    cardForeground: "#F3F5F8",

    primary: "#D93509",
    primaryForeground: "#FFFFFF",

    secondary: "#343C4E",
    secondaryForeground: "#F3F5F8",

    muted: "#343C4E",
    mutedForeground: "#A9B2C0",

    accent: "#43282033",
    accentForeground: "#FFA184",

    destructive: "#D33036",
    destructiveForeground: "#FFFFFF",

    success: "#4CC08E",
    successForeground: "#0B2B1C",
    warning: "#F0A045",
    warningForeground: "#33200A",

    border: "#3C4557",
    input: "#3C4557",

    dark: "#171B23",
    darkForeground: "#F3F5F8",
    darkMuted: "#A9B2C0",
  },
};

// ── Vorm ─────────────────────────────────────────────────────────────────────

export const radius = 14;

// ── Hoogte/diepte — vijf niveaus (0 t/m 4) ──────────────────────────────────
// 0 = vlak op de achtergrond · 1 = kaart · 2 = zwevende knop · 3 = blad/modaal
// · 4 = melding over alles heen. Eén token levert iOS-schaduw én Android-
// elevation; op web vertaalt React Native Web de iOS-velden naar box-shadow.

export type HoogteToken = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

const schaduwKleur = "#101319";

export const hoogte: readonly [HoogteToken, HoogteToken, HoogteToken, HoogteToken, HoogteToken] = [
  { shadowColor: schaduwKleur, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
  { shadowColor: schaduwKleur, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 1 },
  { shadowColor: schaduwKleur, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 },
  { shadowColor: schaduwKleur, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 16, elevation: 8 },
  { shadowColor: schaduwKleur, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.22, shadowRadius: 24, elevation: 12 },
] as const;

// ── Ruimte — de enige toegestane maten ──────────────────────────────────────

export const ruimte = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 24,
  xxl: 32,
} as const;

// ── Typografie — zes stappen (Inter zit al in beide schillen) ───────────────

export type TypografieToken = {
  fontSize: number;
  lineHeight: number;
  fontWeight: "400" | "500" | "600" | "700";
};

export const typografie = {
  schermtitel: { fontSize: 24, lineHeight: 30, fontWeight: "700" },
  sectiekop: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  nadruk: { fontSize: 15, lineHeight: 21, fontWeight: "600" },
  standaard: { fontSize: 15, lineHeight: 21, fontWeight: "400" },
  klein: { fontSize: 13, lineHeight: 18, fontWeight: "400" },
  bijschrift: { fontSize: 11, lineHeight: 15, fontWeight: "500" },
} as const satisfies Record<string, TypografieToken>;

// ── Beweging ─────────────────────────────────────────────────────────────────
// Drie duren + één standaard-versnelling. Alles wat beweegt gebruikt deze
// waarden; staat "verminderde beweging" van het OS aan, dan bewegen we niet.

export const beweging = {
  snel: 120,
  normaal: 200,
  traag: 320,
  // cubic-bezier — standaard "uitrollen": vlot starten, zacht landen.
  versnelling: [0.2, 0, 0, 1] as const,
  versnellingCss: "cubic-bezier(0.2, 0, 0, 1)",
} as const;

// ── Webafleiding — CSS-variabelen (HSL-tripletten, zoals firevault/index.css) ─

function hexNaarHslTriplet(hex: string): string {
  const h = hex.replace("#", "");
  const vol = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const r = parseInt(vol.slice(0, 2), 16) / 255;
  const g = parseInt(vol.slice(2, 4), 16) / 255;
  const b = parseInt(vol.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let hgr = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) hgr = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) hgr = ((b - r) / d + 2) * 60;
    else hgr = ((r - g) / d + 4) * 60;
  }
  return `${Math.round(hgr)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * CSS-variabelen voor de webschil, afgeleid uit hetzelfde palet.
 *
 * Bewust beperkt tot de MERK- en BEWEGINGstokens (primair, destructief, ring,
 * radius, duren, versnelling): daar mag web nooit van de bron afwijken. De
 * oppervlaktekleuren van web (achtergrond/kaart/secundair/popover/sidebar)
 * zijn web-eigen nuances in index.css en vallen buiten de gedeelde claim —
 * die gelijktrekken zou de bestaande webstijl stilzwijgend wijzigen (verboden
 * in VORM_01: basis blijft basis).
 */
export function cssVariabelen(schema: "licht" | "donker"): Record<string, string> {
  const p = schema === "donker" ? kleuren.donker : kleuren.licht;
  return {
    "--primary": hexNaarHslTriplet(p.primary),
    "--primary-foreground": hexNaarHslTriplet(p.primaryForeground),
    "--destructive": hexNaarHslTriplet(p.destructive),
    "--destructive-foreground": hexNaarHslTriplet(p.destructiveForeground),
    "--ring": hexNaarHslTriplet(p.primary),
    "--radius": `${radius}px`,
    "--duur-snel": `${beweging.snel}ms`,
    "--duur-normaal": `${beweging.normaal}ms`,
    "--duur-traag": `${beweging.traag}ms`,
    "--versnelling": beweging.versnellingCss,
  };
}

// ── Contrast (WCAG) — gebruikt voor de gemeten AA-bewijzen ──────────────────

function relatieveLuminantie(hex: string): number {
  const h = hex.replace("#", "").slice(0, 6);
  const kanaal = (i: number) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * kanaal(0) + 0.7152 * kanaal(2) + 0.0722 * kanaal(4);
}

/** WCAG-contrastverhouding tussen twee hex-kleuren (1..21). */
export function contrast(voorgrond: string, achtergrond: string): number {
  const l1 = relatieveLuminantie(voorgrond);
  const l2 = relatieveLuminantie(achtergrond);
  const [licht, donker] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (licht + 0.05) / (donker + 0.05);
}
