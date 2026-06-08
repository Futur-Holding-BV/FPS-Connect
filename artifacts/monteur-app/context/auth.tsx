import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

const TOKEN_KEY = "fps.monteur.token";
const USER_KEY = "fps.monteur.gebruiker";

export type Gebruiker = {
  id: number;
  naam: string;
  email: string;
  rol: string;
  avatar_url?: string | null;
  taal?: string | null;
};

// Module-level token, uitgelezen door de gedeelde fetch-laag (setAuthTokenGetter).
let huidigToken: string | null = null;
export function getHuidigToken(): string | null {
  return huidigToken;
}

type AuthState = {
  gebruiker: Gebruiker | null;
  token: string | null;
  bezigLaden: boolean;
  inloggen: (email: string, wachtwoord: string, code: string) => Promise<void>;
  uitloggen: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth moet binnen AuthProvider gebruikt worden");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [gebruiker, setGebruiker] = useState<Gebruiker | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [bezigLaden, setBezigLaden] = useState(true);

  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const [t, u] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY),
        ]);
        if (!actief) return;
        if (t) {
          huidigToken = t;
          setToken(t);
          if (u) setGebruiker(JSON.parse(u) as Gebruiker);
        }
      } catch {
        // genegeerd — gebruiker logt opnieuw in
      } finally {
        if (actief) setBezigLaden(false);
      }
    })();
    return () => {
      actief = false;
    };
  }, []);

  const inloggen = useCallback(
    async (email: string, wachtwoord: string, code: string) => {
      const basis = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
      const resp = await fetch(`${basis}/api/auth/mobile/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), wachtwoord, code }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        token?: string;
        gebruiker?: Gebruiker;
        error?: string;
      };
      if (!resp.ok || !data.token || !data.gebruiker) {
        throw new Error(data.error || "Inloggen mislukt");
      }
      huidigToken = data.token;
      setToken(data.token);
      setGebruiker(data.gebruiker);
      await AsyncStorage.multiSet([
        [TOKEN_KEY, data.token],
        [USER_KEY, JSON.stringify(data.gebruiker)],
      ]);
    },
    [],
  );

  const uitloggen = useCallback(async () => {
    huidigToken = null;
    setToken(null);
    setGebruiker(null);
    // Wis alle gecachte data zodat na uitloggen niets van de vorige
    // gebruiker zichtbaar blijft.
    queryClient.clear();
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
  }, [queryClient]);

  return (
    <AuthContext.Provider
      value={{ gebruiker, token, bezigLaden, inloggen, uitloggen }}
    >
      {children}
    </AuthContext.Provider>
  );
}
