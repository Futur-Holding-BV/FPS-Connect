import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useListMagazijnPicklijsten } from "@workspace/api-client-react";
import { useAuth } from "@/context/auth";

const GEZIEN_SLEUTEL = "fps_picklijsten_gezien";
const STANDAARD_POLL_MS = 10 * 60 * 1000;

/**
 * Bewaakt of er nieuwe, aan een opdracht gekoppelde picklijsten voor de monteur
 * klaarstaan. Deelt de React Query-cache met de picklijstenpagina, zodat een
 * enkele poll volstaat. Een picklijst geldt als "nieuw" zolang hij openstaat
 * (status concept) en de monteur de picklijstenpagina nog niet heeft bezocht.
 */
export function usePicklijstMelding(pollMs: number = STANDAARD_POLL_MS) {
  const { token } = useAuth();
  const { data: picklijsten = [], refetch } = useListMagazijnPicklijsten(
    {},
    { query: { enabled: !!token } } as any,
  );

  const [gezienIds, setGezienIds] = useState<number[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(GEZIEN_SLEUTEL)
      .then((raw) => {
        if (!raw) return;
        try {
          const ids = JSON.parse(raw) as number[];
          if (Array.isArray(ids)) setGezienIds(ids);
        } catch {
          // stil falen — bij twijfel tonen we de badge
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => void refetch(), pollMs);
    return () => clearInterval(timer);
  }, [token, refetch, pollMs]);

  const openIds = useMemo(
    () =>
      picklijsten
        .filter((p) => p.opdracht_id != null && p.status === "concept")
        .map((p) => p.id),
    [picklijsten],
  );

  const nieuwAantal = useMemo(
    () => openIds.filter((id) => !gezienIds.includes(id)).length,
    [openIds, gezienIds],
  );

  const markeerGezien = useCallback(async () => {
    setGezienIds(openIds);
    try {
      await AsyncStorage.setItem(GEZIEN_SLEUTEL, JSON.stringify(openIds));
    } catch {
      // stil falen — markeren werkt ook zonder persistentie
    }
  }, [openIds]);

  return {
    nieuwAantal,
    openAantal: openIds.length,
    markeerGezien,
    refetch,
  };
}
