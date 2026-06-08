import { createContext, useContext, useState } from "react";
import type { Rol } from "./rol-types";

export type { Rol };

type RolContextType = {
  rol: Rol;
  setRol: (rol: Rol) => void;
};

const RolContext = createContext<RolContextType>({ rol: "beheerder", setRol: () => {} });

export function RolProvider({ children }: { children: React.ReactNode }) {
  const [rol, setRolState] = useState<Rol>(() => {
    const opgeslagen = localStorage.getItem("fps_rol");
    return (opgeslagen as Rol) ?? "beheerder";
  });

  function setRol(nieuweRol: Rol) {
    setRolState(nieuweRol);
    localStorage.setItem("fps_rol", nieuweRol);
  }

  return <RolContext.Provider value={{ rol, setRol }}>{children}</RolContext.Provider>;
}

export function useRol() {
  return useContext(RolContext);
}
