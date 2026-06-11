import { useCallback, useState } from "react";

const PREFIX = "fps_voorkeur_";

function leesVoorkeur<T>(sleutel: string, standaard: T): T {
  if (typeof window === "undefined") return standaard;
  try {
    const ruw = window.localStorage.getItem(PREFIX + sleutel);
    if (ruw == null) return standaard;
    return JSON.parse(ruw) as T;
  } catch {
    return standaard;
  }
}

/**
 * useState-variant die de waarde bewaart in localStorage zodat filter- en
 * sorteerkeuzes behouden blijven tussen paginaweergaven.
 *
 * Retourneert dezelfde tuple-vorm als useState, plus een derde `wis`-functie
 * die zowel de UI terugzet naar de standaardwaarde als de bewaarde voorkeur
 * verwijdert.
 */
export function useVoorkeur<T>(
  sleutel: string,
  standaard: T,
): [T, (waarde: T | ((huidig: T) => T)) => void, () => void] {
  const [waarde, setWaardeState] = useState<T>(() =>
    leesVoorkeur(sleutel, standaard),
  );

  const setWaarde = useCallback(
    (nieuw: T | ((huidig: T) => T)) => {
      setWaardeState((huidig) => {
        const volgend =
          typeof nieuw === "function"
            ? (nieuw as (h: T) => T)(huidig)
            : nieuw;
        try {
          window.localStorage.setItem(
            PREFIX + sleutel,
            JSON.stringify(volgend),
          );
        } catch {
          /* opslag niet beschikbaar — negeer */
        }
        return volgend;
      });
    },
    [sleutel],
  );

  const wis = useCallback(() => {
    try {
      window.localStorage.removeItem(PREFIX + sleutel);
    } catch {
      /* opslag niet beschikbaar — negeer */
    }
    setWaardeState(standaard);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleutel]);

  return [waarde, setWaarde, wis];
}
