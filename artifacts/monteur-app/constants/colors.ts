/**
 * Design tokens voor de FPS Monteur-app.
 * Gesynchroniseerd met de web-artifact (firevault/index.css):
 *   --primary: 12 90% 50%  -> #F23B0D
 *   donkere sidebar: 220 20% 16% -> #212631
 */

const colors = {
  light: {
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

    success: "#22A06B",
    warning: "#E8870E",

    border: "#E2E5EA",
    input: "#E2E5EA",

    // Donkere oppervlakken (kopbalken, login)
    dark: "#212631",
    darkForeground: "#F3F5F8",
    darkMuted: "#9AA3B2",
  },

  radius: 14,
};

export default colors;
