import type { Rol } from "./rol-types";
import { useAuth } from "./auth-context";

export type { Rol };

export function useRol(): { rol: Rol } {
  const { gebruiker } = useAuth();
  return { rol: (gebruiker?.rol as Rol) ?? "beheerder" };
}
