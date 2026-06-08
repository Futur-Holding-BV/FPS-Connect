import { createContext, useContext, useCallback } from "react";
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
