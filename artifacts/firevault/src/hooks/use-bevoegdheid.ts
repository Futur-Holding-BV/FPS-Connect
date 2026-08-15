import { useRol } from "@/context/rol-context";

export function useBevoegdheid() {
  const { rol, bevoegdheden } = useRol();

  function heeftNiveau(module: string, minNiveau: number): boolean {
    if (rol === "hoofdbeheerder") return true;
    return (bevoegdheden[module] ?? 0) >= minNiveau;
  }

  return { heeftNiveau, bevoegdheden };
}
