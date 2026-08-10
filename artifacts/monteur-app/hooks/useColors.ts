import { useColorScheme } from "react-native";

import colors from "@/constants/colors";

/**
 * Geeft de ontwerptokens (kleuren) voor het actieve kleurschema, plus
 * schema-onafhankelijke waarden zoals `radius`.
 *
 * Sinds VORM_01 heeft de gedeelde tokenbron een volwaardig donker palet
 * (WCAG AA gemeten). Het volgen van de systeeminstelling staat bewust nog
 * UIT tot F6: zolang schermen nog ~1.200 hardgecodeerde kleuren bevatten
 * (nulmeting) zou donker een onleesbare mengvorm opleveren. Zet
 * DONKER_ACTIEF op true zodra F6 (schermmigratie) is afgerond.
 *
 * F6 is afgerond (10-08-2026): alle schermen en componenten lopen via de
 * tokens/bouwstenen — donker volgt nu de systeeminstelling.
 */
const DONKER_ACTIEF = true;

export function useColors() {
  const scheme = useColorScheme();
  const palette = DONKER_ACTIEF && scheme === "dark" ? colors.dark : colors.light;
  return { ...palette, radius: colors.radius };
}
