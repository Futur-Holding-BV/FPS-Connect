import { API_DOMEIN } from "@/lib/apiDomein";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import * as LocalAuthentication from "expo-local-authentication";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";

import { bewaarToken, leesToken as leesOpgeslagenToken, wisToken } from "@/lib/tokenOpslag";

const USER_KEY = "fps.monteur.gebruiker";
const BIOMETRIE_KEY = "fps.monteur.biometrie";

export type Gebruiker = {
  id: number;
  naam: string;
  email: string;
  rol: string;
  avatar_url?: string | null;
  taal?: string | null;
  // Functietitels (uit HRM) — op web gebruikt om buitendienstprofielen te
  // herkennen (lib/buitendienst.ts); komt mee in de login/auth-me payload.
  functietitels?: string[] | null;
  // Serverside afgeleide functieclassificatie; leidend voor het telefoonmenu
  // en gelijk aan de vlag waarmee de desktopomgeving veldfuncties afsluit.
  is_uitvoerend_veld?: boolean | null;
  // Effectieve bevoegdheden (module → niveau), berekend door de server bij
  // login en ververst bij elke app-start. GEEN eigen berekening in de app.
  bevoegdheden?: Record<string, number>;
};

// Module-level token, uitgelezen door de gedeelde fetch-laag (setAuthTokenGetter).
// Blijft null zolang de app vergrendeld is, zodat er geen API-aanroepen met de
// token mogelijk zijn voordat de gebruiker biometrisch ontgrendelt.
let huidigToken: string | null = null;
export function getHuidigToken(): string | null {
  return huidigToken;
}

type Biometrie = { beschikbaar: boolean; type: string };

async function detecteerBiometrie(): Promise<Biometrie> {
  if (Platform.OS === "web") return { beschikbaar: false, type: "biometrie" };
  try {
    const heeftHardware = await LocalAuthentication.hasHardwareAsync();
    const isIngesteld = await LocalAuthentication.isEnrolledAsync();
    const beschikbaar = heeftHardware && isIngesteld;
    let type = "biometrie";
    const soorten = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const heeftGezicht = soorten.includes(
      LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
    );
    const heeftVinger = soorten.includes(
      LocalAuthentication.AuthenticationType.FINGERPRINT,
    );
    if (Platform.OS === "ios") {
      type = heeftGezicht ? "Face ID" : heeftVinger ? "Touch ID" : "biometrie";
    } else {
      type = heeftGezicht ? "gezichtsherkenning" : heeftVinger ? "vingerafdruk" : "biometrie";
    }
    return { beschikbaar, type };
  } catch {
    return { beschikbaar: false, type: "biometrie" };
  }
}

type AuthState = {
  gebruiker: Gebruiker | null;
  token: string | null;
  bezigLaden: boolean;
  vergrendeld: boolean;
  biometrieAan: boolean;
  biometrieBeschikbaar: boolean;
  biometrieType: string;
  inloggen: (email: string, wachtwoord: string, code: string) => Promise<void>;
  uitloggen: () => Promise<void>;
  ontgrendel: () => Promise<boolean>;
  zetBiometrie: (aan: boolean) => Promise<boolean>;
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
  const [vergrendeld, setVergrendeld] = useState(false);
  const [biometrieAan, setBiometrieAan] = useState(false);
  const [biometrieBeschikbaar, setBiometrieBeschikbaar] = useState(false);
  const [biometrieType, setBiometrieType] = useState("biometrie");

  // Bewaart de persisted token tijdens vergrendeling; pas na biometrische
  // ontgrendeling wordt deze in huidigToken/token zichtbaar gemaakt.
  const vergrendeldTokenRef = useRef<string | null>(null);

  useEffect(() => {
    let actief = true;
    (async () => {
      try {
        const bio = await detecteerBiometrie();
        const [t, u, pref] = await Promise.all([
          leesOpgeslagenToken(),
          AsyncStorage.getItem(USER_KEY),
          AsyncStorage.getItem(BIOMETRIE_KEY),
        ]);
        if (!actief) return;

        setBiometrieBeschikbaar(bio.beschikbaar);
        setBiometrieType(bio.type);
        const aan = pref === "1";
        setBiometrieAan(aan);

        if (t && u) {
          const parsed = JSON.parse(u) as Gebruiker;
          setGebruiker(parsed);
          if (aan && bio.beschikbaar) {
            // Vergrendeld starten: token privé houden tot ontgrendeling.
            vergrendeldTokenRef.current = t;
            setVergrendeld(true);
          } else {
            huidigToken = t;
            setToken(t);
          }
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

  // Ververs de gebruiker (incl. effectieve bevoegdheden) zodra er een bruikbare
  // token is. Zo verandert het menu bij de volgende keer openen wanneer iemands
  // profiel is gewijzigd — zonder herinstallatie of opnieuw inloggen.
  useEffect(() => {
    if (!token) return;
    let actief = true;
    (async () => {
      try {
        const basis = `https://${API_DOMEIN}`;
        const resp = await fetch(`${basis}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (resp.status === 401 || resp.status === 403) {
          // Token ingetrokken of account geblokkeerd: niet doorwerken op de
          // oude cache — volledig uitloggen zodat opnieuw ingelogd moet worden.
          if (actief) await uitloggen();
          return;
        }
        if (!resp.ok) return; // transiente serverfout — bestaande gegevens houden
        const vers = (await resp.json()) as Gebruiker;
        if (!actief || !vers?.id) return;
        setGebruiker(vers);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(vers));
      } catch {
        // offline — stil houden, cache blijft gelden
      }
    })();
    return () => { actief = false; };
  }, [token]);

  const inloggen = useCallback(
    async (email: string, wachtwoord: string, code: string) => {
      const basis = `https://${API_DOMEIN}`;
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
      vergrendeldTokenRef.current = null;
      setToken(data.token);
      setGebruiker(data.gebruiker);
      setVergrendeld(false);
      await Promise.all([
        bewaarToken(data.token),
        AsyncStorage.setItem(USER_KEY, JSON.stringify(data.gebruiker)),
      ]);
      // Push-token registreren (niet-blokkerend — fouten negeren)
      const verkregenToken = data.token;
      import("@/lib/pushNotifications")
        .then(({ registreerPushToken }) =>
          registreerPushToken(verkregenToken).catch(() => undefined),
        )
        .catch(() => undefined);
    },
    [],
  );

  const uitloggen = useCallback(async () => {
    huidigToken = null;
    vergrendeldTokenRef.current = null;
    setToken(null);
    setGebruiker(null);
    setVergrendeld(false);
    setBiometrieAan(false);
    // Wis alle gecachte data zodat na uitloggen niets van de vorige
    // gebruiker zichtbaar blijft.
    queryClient.clear();
    await Promise.all([
      wisToken(),
      AsyncStorage.multiRemove([USER_KEY, BIOMETRIE_KEY]),
    ]);
  }, [queryClient]);

  const ontgrendel = useCallback(async () => {
    const opgeslagen = vergrendeldTokenRef.current;
    if (!opgeslagen) return false;
    try {
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: "Ontgrendel FPS Monteur",
        cancelLabel: "Annuleren",
        disableDeviceFallback: false,
      });
      if (!res.success) return false;
    } catch {
      return false;
    }
    huidigToken = opgeslagen;
    vergrendeldTokenRef.current = null;
    setToken(opgeslagen);
    setVergrendeld(false);
    return true;
  }, []);

  const zetBiometrie = useCallback(
    async (aan: boolean) => {
      if (aan) {
        if (!biometrieBeschikbaar) return false;
        try {
          const res = await LocalAuthentication.authenticateAsync({
            promptMessage: "Bevestig om snel ontgrendelen in te schakelen",
            cancelLabel: "Annuleren",
            disableDeviceFallback: false,
          });
          if (!res.success) return false;
        } catch {
          return false;
        }
        await AsyncStorage.setItem(BIOMETRIE_KEY, "1");
        setBiometrieAan(true);
        return true;
      }
      await AsyncStorage.removeItem(BIOMETRIE_KEY);
      setBiometrieAan(false);
      return true;
    },
    [biometrieBeschikbaar],
  );

  return (
    <AuthContext.Provider
      value={{
        gebruiker,
        token,
        bezigLaden,
        vergrendeld,
        biometrieAan,
        biometrieBeschikbaar,
        biometrieType,
        inloggen,
        uitloggen,
        ontgrendel,
        zetBiometrie,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
