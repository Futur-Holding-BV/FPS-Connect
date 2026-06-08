import { createContext, useContext, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getHuidigeGebruiker,
  getGetHuidigeGebruikerQueryKey,
  logout as logoutRequest,
  type AuthGebruiker,
} from "@workspace/api-client-react";

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

  const meKey = getGetHuidigeGebruikerQueryKey();

  const { data, isLoading, isError } = useQuery({
    queryKey: meKey,
    queryFn: () => getHuidigeGebruiker(),
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const gebruiker = isError ? null : (data ?? null);

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
    queryClient.invalidateQueries({ queryKey: meKey });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);

  return (
    <AuthContext.Provider
      value={{
        gebruiker,
        isLoading,
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
