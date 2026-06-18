import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Rol } from "./rol-types";
import { useAuth } from "./auth-context";
import { setGebruikerOverrideGetter } from "@workspace/api-client-react";

export type { Rol };

export type GeimiteerdePersoon = {
  id: number;
  naam: string;
  rol: Rol;
  functietitels: string[];
  bevoegdheden: Record<string, number>;
};

const OPSLAG_SLEUTEL = "fps.bekijkenAlsPersoon";

type RolContextType = {
  rol: Rol;
  echteRol: Rol;
  bevoegdheden: Record<string, number>;
  kanWisselen: boolean;
  persoon: GeimiteerdePersoon | null;
  zetPersoon: (persoon: GeimiteerdePersoon | null) => void;
};

const RolContext = createContext<RolContextType>({
  rol: "beheerder",
  echteRol: "beheerder",
  bevoegdheden: {},
  kanWisselen: false,
  persoon: null,
  zetPersoon: () => {},
});

function leesOpgeslagenPersoon(): GeimiteerdePersoon | null {
  if (typeof localStorage === "undefined") return null;
  const ruw = localStorage.getItem(OPSLAG_SLEUTEL);
  if (!ruw) return null;
  try {
    const p = JSON.parse(ruw) as GeimiteerdePersoon;
    if (typeof p?.id === "number" && typeof p?.rol === "string" && p.rol) {
      return { ...p, bevoegdheden: (p.bevoegdheden ?? {}) as Record<string, number> };
    }
    return null;
  } catch {
    return null;
  }
}

export function RolProvider({ children }: { children: React.ReactNode }) {
  const { gebruiker } = useAuth();
  // Deny-by-default: een ontbrekende of ongeldige rol mag NIET stilzwijgend
  // beheerder worden. We laten de waarde ongeldig zodat Portalen naar
  // GeenToegang valt in plaats van het beheerderportaal te tonen.
  const echteRol = (gebruiker?.rol as Rol) ?? ("" as Rol);
  const echteBevoegdheden = (gebruiker?.bevoegdheden ?? {}) as Record<string, number>;
  const kanWisselen = echteRol === "hoofdbeheerder";

  const [persoon, setPersoon] = useState<GeimiteerdePersoon | null>(() =>
    leesOpgeslagenPersoon(),
  );

  const zetPersoon = useCallback((nieuw: GeimiteerdePersoon | null) => {
    setPersoon(nieuw);
    if (typeof localStorage !== "undefined") {
      if (nieuw) localStorage.setItem(OPSLAG_SLEUTEL, JSON.stringify(nieuw));
      else localStorage.removeItem(OPSLAG_SLEUTEL);
    }
  }, []);

  // Alleen de hoofdbeheerder kan een teamlid nabootsen. Zonder selectie ziet
  // de hoofdbeheerder zijn eigen (beheerder)portaal; andere rollen zien altijd
  // hun eigen portaal.
  const actievePersoon = kanWisselen ? persoon : null;
  const rol: Rol = kanWisselen ? (actievePersoon?.rol ?? "hoofdbeheerder") : echteRol;

  // Bevoegdheden: gebruik de matrix van de geïmiteerde persoon zodat de nav
  // en permissie-guards exact diens weergave spiegelen.
  const bevoegdheden: Record<string, number> =
    kanWisselen && actievePersoon
      ? (actievePersoon.bevoegdheden ?? {})
      : echteBevoegdheden;

  // Synchroniseer de impersonatie naar de API-client zodat de backend exact
  // dezelfde data filtert als het portaal toont (op basis van het teamlid-id).
  useEffect(() => {
    if (kanWisselen && actievePersoon) {
      const id = String(actievePersoon.id);
      setGebruikerOverrideGetter(() => id);
    } else {
      setGebruikerOverrideGetter(null);
    }
    return () => setGebruikerOverrideGetter(null);
  }, [kanWisselen, actievePersoon]);

  return (
    <RolContext.Provider
      value={{ rol, echteRol, bevoegdheden, kanWisselen, persoon: actievePersoon, zetPersoon }}
    >
      {children}
    </RolContext.Provider>
  );
}

export function useRol() {
  return useContext(RolContext);
}
