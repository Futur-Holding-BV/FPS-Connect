import { useWindowDimensions } from "react-native";

const TABLET_MIN_BREEDTE = 768;
const BREED_SCHERM_BREEDTE = 1280;

export type Responsief = {
  breedte: number;
  hoogte: number;
  isTablet: boolean;
  landschap: boolean;
  kolommen: number;
  inhoudMaxBreedte: number | undefined;
  formMaxBreedte: number | undefined;
  leesMaxBreedte: number | undefined;
};

/**
 * Responsieve breekpunten voor telefoon en tablet.
 *
 * - `isTablet` vanaf 768px breedte.
 * - `kolommen`: 1 op telefoon, 2 op tablet, 3 op zeer brede schermen.
 * - De max-breedtes begrenzen en centreren inhoud zodat formulieren en
 *   leesteksten op een tablet niet over de volledige breedte uitrekken.
 *   Op telefoon zijn ze `undefined` (geen begrenzing).
 */
export function useResponsive(): Responsief {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= TABLET_MIN_BREEDTE;
  const landschap = width > height;
  const kolommen = width >= BREED_SCHERM_BREEDTE ? 3 : isTablet ? 2 : 1;
  return {
    breedte: width,
    hoogte: height,
    isTablet,
    landschap,
    kolommen,
    inhoudMaxBreedte: width >= BREED_SCHERM_BREEDTE ? 1200 : undefined,
    formMaxBreedte: isTablet ? 600 : undefined,
    leesMaxBreedte: isTablet ? 760 : undefined,
  };
}
