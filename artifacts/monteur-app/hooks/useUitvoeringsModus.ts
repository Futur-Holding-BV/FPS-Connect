import { useEffect, useRef } from "react";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";

import { useUitvoeringTheme } from "@/context/UitvoeringThemeContext";

const KEEP_AWAKE_TAG = "fps_uitvoering";

export type UitvoeringsModus = {
  hoogContrast: boolean;
  activeerModus: () => Promise<void>;
  deactiveerModus: () => Promise<void>;
};

/**
 * Beheert de Uitvoeringsmodus: scherm actief houden (expo-keep-awake) en
 * hoog-contrast theme inschakelen.
 *
 * Aanroepen bij starten van een opdracht op tablet; deactiveren bij afronden
 * of verlaten van de uitvoering.
 */
export function useUitvoeringsModus(): UitvoeringsModus {
  const { hoogContrast, setHoogContrast } = useUitvoeringTheme();
  const actief = useRef(false);

  useEffect(() => {
    return () => {
      if (actief.current) {
        void deactivateKeepAwake(KEEP_AWAKE_TAG);
        actief.current = false;
      }
    };
  }, []);

  async function activeerModus() {
    if (actief.current) return;
    actief.current = true;
    setHoogContrast(true);
    await activateKeepAwakeAsync(KEEP_AWAKE_TAG);
  }

  async function deactiveerModus() {
    if (!actief.current) return;
    actief.current = false;
    setHoogContrast(false);
    await deactivateKeepAwake(KEEP_AWAKE_TAG);
  }

  return {
    hoogContrast,
    activeerModus,
    deactiveerModus,
  };
}
