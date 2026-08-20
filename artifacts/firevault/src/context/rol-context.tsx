import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Rol } from "./rol-types";
import { useAuth } from "./auth-context";
import { BEKIJKEN_ALS_OPSLAG_SLEUTEL } from "./bekijken-als-opslag";
import { setGebruikerOverrideGetter } from "@workspace/api-client-react";

export type { Rol };

// GEBRUIKERS_01 v2: UITVOERENDE_FUNCTIES hardcoded lijst verwijderd.
// De server bepaalt `is_uitvoerend_veld` op basis van de uitvoerend-vlag van de functie.
// Bij impersonatie: als het teamlid-object de vlag heeft, gebruik die; anders false.

export type GeimiteerdePersoon = {
  id: number;
  naam: string;
  rol: Rol;
  functietitels: string[];
  bevoegdheden: Record<string, number>;
  // GEBRUIKERS_01 v2: server-vlag indien beschikbaar, anders false
  is_uitvoerend_veld?: boolean;
};

type RolContextType = {
  rol: Rol;
  echteRol: Rol;
  functietitels: string[];
  bevoegdheden: Record<string, number>;
  kanWisselen: boolean;
  persoon: GeimiteerdePersoon | null;
  zetPersoon: (persoon: GeimiteerdePersoon | null) => void;
  /**
   * Eén bron van waarheid voor de buitendienst-check.
   * De server bepaalt deze vlag op basis van de uitvoerend-vlag van de functie
   * (niet meer op basis van een hardcoded titellijst).
   * - Zonder impersonatie: server-berekende vlag uit de auth-payload.
   * - Bij impersonatie (hoofdbeheerder bekijkt als teamlid): de server-vlag op
   *   het teamlid-object indien aanwezig, anders false.
   */
  is_uitvoerend_veld: boolean;
  heeftLoonfundamentToegang: boolean;
};

const RolContext = createContext<RolContextType>({
  rol: "gebruiker",
  echteRol: "gebruiker",
  functietitels: [],
  bevoegdheden: {},
  kanWisselen: false,
  persoon: null,
  zetPersoon: () => {},
  is_uitvoerend_veld: false,
  heeftLoonfundamentToegang: false,
});

function leesOpgeslagenPersoon(): GeimiteerdePersoon | null {
  if (typeof localStorage === "undefined") return null;
  const ruw = localStorage.getItem(BEKIJKEN_ALS_OPSLAG_SLEUTEL);
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
      if (nieuw) localStorage.setItem(BEKIJKEN_ALS_OPSLAG_SLEUTEL, JSON.stringify(nieuw));
      else localStorage.removeItem(BEKIJKEN_ALS_OPSLAG_SLEUTEL);
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

  // Functietitels van de actieve persoon (bij impersonatie: het teamlid),
  // zodat de nav ook functie-afhankelijke weergave exact kan spiegelen.
  const functietitels: string[] =
    kanWisselen && actievePersoon
      ? (actievePersoon.functietitels ?? [])
      : ((gebruiker?.functietitels as string[] | undefined) ?? []);

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

  // GEBRUIKERS_01 v2: server-vlag is leidend; bij impersonatie use is_uitvoerend_veld ?? false
  const is_uitvoerend_veld: boolean = kanWisselen && actievePersoon
    ? (actievePersoon.is_uitvoerend_veld ?? false)
    : (gebruiker?.is_uitvoerend_veld ?? false);
  const heeftLoonfundamentToegang: boolean =
    rol === "hoofdbeheerder" ||
    (!actievePersoon && gebruiker?.heeft_loonfundament_toegang === true);

  return (
    <RolContext.Provider
      value={{ rol, echteRol, functietitels, bevoegdheden, kanWisselen, persoon: actievePersoon, zetPersoon, is_uitvoerend_veld, heeftLoonfundamentToegang }}
    >
      {children}
    </RolContext.Provider>
  );
}

export function useRol() {
  return useContext(RolContext);
}
