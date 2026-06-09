import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Rol } from "./rol-types";
import { useAuth } from "./auth-context";
import { setRolOverrideGetter } from "@workspace/api-client-react";

export type { Rol };

export const WISSELBARE_ROLLEN: Rol[] = ["beheerder", "monteur", "controleur", "klant"];
const OPSLAG_SLEUTEL = "fps.actieveRol";

type RolContextType = {
  rol: Rol;
  echteRol: Rol;
  kanWisselen: boolean;
  zetRol: (rol: Rol) => void;
};

const RolContext = createContext<RolContextType>({
  rol: "beheerder",
  echteRol: "beheerder",
  kanWisselen: false,
  zetRol: () => {},
});

function leesOpgeslagenRol(): Rol | null {
  if (typeof localStorage === "undefined") return null;
  const opgeslagen = localStorage.getItem(OPSLAG_SLEUTEL);
  return opgeslagen && WISSELBARE_ROLLEN.includes(opgeslagen as Rol)
    ? (opgeslagen as Rol)
    : null;
}

export function RolProvider({ children }: { children: React.ReactNode }) {
  const { gebruiker } = useAuth();
  // Deny-by-default: een ontbrekende of ongeldige rol mag NIET stilzwijgend
  // beheerder worden. We laten de waarde ongeldig zodat Portalen naar
  // GeenToegang valt in plaats van het beheerderportaal te tonen.
  const echteRol = (gebruiker?.rol as Rol) ?? ("" as Rol);
  const kanWisselen = echteRol === "hoofdbeheerder";

  const [override, setOverride] = useState<Rol | null>(() => leesOpgeslagenRol());

  const zetRol = useCallback((nieuw: Rol) => {
    setOverride(nieuw);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(OPSLAG_SLEUTEL, nieuw);
    }
  }, []);

  // De hoofdbeheerder kan in elk portaal kijken; standaard het beheerderportaal.
  // Andere rollen zien altijd hun eigen portaal.
  const rol: Rol = kanWisselen ? (override ?? "beheerder") : echteRol;

  // Synchroniseer de rol-override naar de API-client zodat de backend
  // dezelfde filtering toepast als de frontend laat zien.
  useEffect(() => {
    if (kanWisselen && override && override !== "beheerder") {
      setRolOverrideGetter(() => override);
    } else {
      setRolOverrideGetter(null);
    }
    return () => setRolOverrideGetter(null);
  }, [kanWisselen, override]);

  return (
    <RolContext.Provider value={{ rol, echteRol, kanWisselen, zetRol }}>
      {children}
    </RolContext.Provider>
  );
}

export function useRol() {
  return useContext(RolContext);
}
