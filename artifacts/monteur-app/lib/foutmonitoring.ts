/**
 * Veilige foutmonitoring voor FPS Monteur.
 *
 * De publieke mobiele DSN wordt runtime van de API opgehaald. De officiële
 * React Native SDK bewaart gebeurtenissen bij verbindingsverlies op het
 * apparaat en probeert ze bij een volgende verbinding opnieuw te versturen.
 * Zonder DSN of netwerk blijft de bestaande lokale foutafhandeling werken.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Sentry from "@sentry/react-native";
import {
  maakVeiligMonitoringEvent,
  normaliseerMonitoringPad,
} from "@workspace/foutmonitoring";

import { API_DOMEIN } from "@/lib/apiDomein";

const CONFIG_CACHE_SLEUTEL = "fps.monteur.foutmonitoring-config.v1";

interface MonitoringConfig {
  sentry_dsn_mobile: string;
  omgeving: string | null;
  commit: string | null;
}

let actief = false;
let startBelofte: Promise<void> | null = null;
let gewensteGebruiker: { id: number; rol: string } | null = null;
let gewenstScherm: string | null = null;

function isGeldigeConfig(waarde: unknown): waarde is MonitoringConfig {
  if (!waarde || typeof waarde !== "object") return false;
  const config = waarde as Record<string, unknown>;
  return (
    typeof config["sentry_dsn_mobile"] === "string" &&
    /^https:\/\/[^@\s]+@[^/\s]+\/\d+$/.test(config["sentry_dsn_mobile"]) &&
    (config["omgeving"] === null || typeof config["omgeving"] === "string") &&
    (config["commit"] === null || typeof config["commit"] === "string")
  );
}

function initialiseerSdk(config: MonitoringConfig): void {
  if (actief) return;
  Sentry.init({
    dsn: config.sentry_dsn_mobile,
    environment: config.omgeving ?? undefined,
    release: config.commit ?? undefined,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    maxBreadcrumbs: 0,
    enableAutoSessionTracking: false,
    beforeBreadcrumb() {
      return null;
    },
    beforeSend(event) {
      return maakVeiligMonitoringEvent(
        event as unknown as Record<string, unknown>,
      ) as unknown as typeof event;
    },
  });
  actief = true;
  Sentry.setTag("component", "monteur-app");
  Sentry.setTag("handeling", "overig");
  if (gewensteGebruiker) {
    Sentry.setUser({ id: String(gewensteGebruiker.id) });
    Sentry.setTag("rol", gewensteGebruiker.rol);
  }
  if (gewenstScherm) Sentry.setTag("pagina", gewenstScherm);
}

async function laadConfigVanServer(): Promise<MonitoringConfig | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(
      `https://${API_DOMEIN}/api/monitoring-config`,
      { signal: controller.signal },
    );
    if (!response.ok) return null;
    const rauw = await response.json();
    if (!isGeldigeConfig(rauw)) {
      await AsyncStorage.removeItem(CONFIG_CACHE_SLEUTEL);
      return null;
    }
    await AsyncStorage.setItem(CONFIG_CACHE_SLEUTEL, JSON.stringify(rauw));
    return rauw;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function laadConfigUitCache(): Promise<MonitoringConfig | null> {
  try {
    const rauw = await AsyncStorage.getItem(CONFIG_CACHE_SLEUTEL);
    if (!rauw) return null;
    const config = JSON.parse(rauw) as unknown;
    return isGeldigeConfig(config) ? config : null;
  } catch {
    return null;
  }
}

export function startFoutmonitoring(): Promise<void> {
  if (__DEV__) return Promise.resolve();
  if (startBelofte) return startBelofte;
  startBelofte = (async () => {
    // Online configuratie is leidend. Bij time-out/offline mag uitsluitend een
    // eerder succesvol opgehaalde publieke config worden gebruikt.
    const [server, cache] = await Promise.all([
      laadConfigVanServer(),
      laadConfigUitCache(),
    ]);
    const config = server ?? cache;
    if (config) initialiseerSdk(config);
  })();
  return startBelofte;
}

export function zetMonitoringGebruiker(
  gebruiker: { id: number; rol: string } | null,
): void {
  gewensteGebruiker = gebruiker;
  if (!actief) return;
  Sentry.setUser(gebruiker ? { id: String(gebruiker.id) } : null);
  Sentry.setTag("rol", gebruiker?.rol ?? "uitgelogd");
}

export function zetMonitoringScherm(pad: string): void {
  gewenstScherm = normaliseerMonitoringPad(pad) ?? "/onbekend";
  if (!actief) return;
  Sentry.setTag("pagina", gewenstScherm);
}

export function rapporteerFout(fout: unknown): void {
  if (!actief) return;
  Sentry.captureException(fout);
}