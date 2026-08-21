import { useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { useNavigatieBewaking } from "@/context/navigatie-bewaking";
import { vervangQueryWaarde } from "@/lib/navigatie-register";

export function useUrlTabNavigatie() {
  const [pad] = useLocation();
  const zoekdeel = useSearch();
  const { requestNavigatie } = useNavigatieBewaking();

  return useCallback(
    (tab: string | null) => {
      const locatie = `${pad}${zoekdeel ? `?${zoekdeel}` : ""}`;
      requestNavigatie(vervangQueryWaarde(locatie, "tab", tab), { vervang: true });
    },
    [pad, requestNavigatie, zoekdeel],
  );
}