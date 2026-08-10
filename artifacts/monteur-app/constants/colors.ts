/**
 * Design tokens voor de FPS Monteur-app.
 *
 * Sinds VORM_01 is dit een doorgeefluik van de ene gedeelde tokenbron
 * (@workspace/ontwerp) die ook de webschil (firevault) voedt. Er valt niets
 * meer te synchroniseren. Voeg hier niets toe — nieuwe tokens horen in
 * lib/ontwerp/src/index.ts.
 */
import { kleuren, radius } from "@workspace/ontwerp";

const colors = {
  light: kleuren.licht,
  dark: kleuren.donker,
  radius,
};

export default colors;
