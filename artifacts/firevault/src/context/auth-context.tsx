import { createContext, useContext, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getHuidigeGebruiker,
  getGetHuidigeGebruikerQueryKey,
  logout as logoutRequest,
  type AuthGebruiker,
  ApiError,
} from "@workspace/api-client-react";
import { useTaal } from "@/context/taal-context";
import { zetMonitoringGebruiker } from "@/lib/foutmonitoring";
import { isGeldigeTaal } from "@/i18n/talen";

type AuthContextType = {
  gebruiker: AuthGebruiker | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  herlaad: () => void;
  uitloggen: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  gebruiker: null,
  isLoading: true,
  isAuthenticated: false,
  herlaad: () => {},
  uitloggen: async () => {},
});

function hexNaarHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { synchroniseerServerTaal } = useTaal();

  const meKey = getGetHuidigeGebruikerQueryKey();

  const { data, isPending, isError, error } = useQuery({
    queryKey: meKey,
    queryFn: () => getHuidigeGebruiker(),
    retry: (failureCount, err) => {
      if (err instanceof ApiError && err.status === 401) return false;
      return failureCount < 2;
    },
    retryDelay: 3000,
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const isEchte401 = isError && error instanceof ApiError && error.status === 401;
  const gebruiker = isEchte401 ? null : (data ?? null);

  // SENTRY_AAN_01: browserfouten dragen het ingelogde gebruikers-id mee
  // (bewust alleen het id — geen naam/e-mail naar de externe dienst).
  useEffect(() => {
    zetMonitoringGebruiker(gebruiker ? { id: gebruiker.id } : null);
  }, [gebruiker?.id]);

  useEffect(() => {
    if (gebruiker?.taal && isGeldigeTaal(gebruiker.taal)) {
      synchroniseerServerTaal(gebruiker.taal);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gebruiker?.taal]);

  useEffect(() => {
    if (!gebruiker?.bedrijfskleuren) return;
    try {
      const kleuren = JSON.parse(gebruiker.bedrijfskleuren) as Record<string, string>;
      if (kleuren.primair && /^#[0-9a-fA-F]{6}$/.test(kleuren.primair)) {
        const [h, s, l] = hexNaarHsl(kleuren.primair);
        document.documentElement.style.setProperty("--primary", `${h} ${s}% ${l}%`);
      }
    } catch {
      // Ongeldige JSON — behoud standaardkleur
    }
  }, [gebruiker?.bedrijfskleuren]);

  const herlaad = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: meKey });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);

  const uitloggen = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      // Sessie kan al verlopen zijn; we loggen lokaal alsnog uit.
    }
    document.documentElement.style.removeProperty("--primary");
    queryClient.clear();
    // Harde herlaad naar de app-root. De serversessie is nu vernietigd, dus
    // na een volledige herlaad haalt /auth/me een 401 op en verschijnt het
    // loginscherm gegarandeerd. Enkel de React Query-cache legen (of
    // setQueryData/invalidateQueries) bleek de gebruiker in het portaal te
    // laten hangen ("Uitloggen doet niets"): de me-query flipte niet betrouwbaar
    // naar uitgelogd. Een volledige herlaad is de robuuste, standaard uitlog.
    window.location.assign(import.meta.env.BASE_URL);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);

  return (
    <AuthContext.Provider
      value={{
        gebruiker,
        isLoading: isPending,
        isAuthenticated: gebruiker !== null,
        herlaad,
        uitloggen,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
