import { useAuth } from "@/context/auth-context";

export function useBevoegdheid() {
  const { gebruiker } = useAuth();
  const rol = gebruiker?.rol ?? "";

  // Toegang komt puur uit de bevoegdheden-matrix.
  const bevoegdheden = (gebruiker?.bevoegdheden ?? {}) as Record<string, number>;

  function heeftNiveau(module: string, minNiveau: number): boolean {
    if (rol === "hoofdbeheerder") return true;
    if (rol === "klant") return false;
    return (bevoegdheden[module] ?? 0) >= minNiveau;
  }

  return { heeftNiveau, bevoegdheden };
}
