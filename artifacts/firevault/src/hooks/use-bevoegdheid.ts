import { useAuth } from "@/context/auth-context";
import { bevoegdhedenVoorLegacyRol } from "@workspace/permissies";

export function useBevoegdheid() {
  const { gebruiker } = useAuth();
  const rol = gebruiker?.rol ?? "";
  const rawBevoegdheden = (gebruiker?.bevoegdheden ?? {}) as Record<string, number>;

  // Legacy-fallback: als de bevoegdheden-matrix leeg is (bestaande accounts vóór
  // migratie), worden de rechten afgeleid uit de rol — identiek aan de backend.
  const bevoegdheden: Record<string, number> =
    Object.keys(rawBevoegdheden).length > 0
      ? rawBevoegdheden
      : bevoegdhedenVoorLegacyRol(rol);

  function heeftNiveau(module: string, minNiveau: number): boolean {
    if (rol === "hoofdbeheerder") return true;
    if (rol === "klant") return false;
    return (bevoegdheden[module] ?? 0) >= minNiveau;
  }

  return { heeftNiveau, bevoegdheden };
}
