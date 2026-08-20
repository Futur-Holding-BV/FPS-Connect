/**
 * Browserkant van de foutmonitoring (SENTRY_AAN_01).
 *
 * - De configuratie (publieke browser-DSN + versie) komt van de server via
 *   GET /api/monitoring-config, zodat een DSN-wijziging géén rebuild vergt.
 *   Zonder DSN gebeurt er niets — identiek aan de serverkant.
 * - Elke fout draagt pagina (tag), gebruiker (alleen id), rol en versie
 *   (release = commit) mee. Meer niet: net als op de server is de scrub
 *   allowlist-gedacht — geen breadcrumbs, geen extra, geen request-data.
 * - Daarnaast houdt dit bestand de "laatste handeling" bij (laatst aangeklikte
 *   knop/link) voor de "Dit werkt niet"-melding.
 */
import * as Sentry from "@sentry/react";
import {
  maakVeiligMonitoringEvent,
  normaliseerMonitoringPad,
} from "@workspace/foutmonitoring";

let actief = false;
// De config-fetch is async terwijl de app direct rendert: gebruiker en pagina
// kunnen dus al gezet zijn vóór Sentry.init. Buffer ze en pas ze ná init toe.
let gewensteGebruiker: { id: number; rol: string } | null = null;
let gewenstePagina: string | null = null;

export async function startFoutmonitoring(): Promise<void> {
  try {
    const resp = await fetch("/api/monitoring-config", { credentials: "include" });
    if (!resp.ok) return;
    const cfg = (await resp.json()) as { sentry_dsn_web: string | null; omgeving: string | null; commit: string | null };
    if (!cfg.sentry_dsn_web) return;
    Sentry.init({
      dsn: cfg.sentry_dsn_web,
      environment: cfg.omgeving ?? undefined,
      release: cfg.commit ?? undefined,
      tracesSampleRate: 0,
      sendDefaultPii: false,
      maxBreadcrumbs: 0,
      beforeSend(event) {
        return maakVeiligMonitoringEvent(
          event as unknown as Record<string, unknown>,
        ) as unknown as typeof event;
      },
      beforeBreadcrumb() {
        return null;
      },
    });
    actief = true;
    Sentry.setTag("component", "firevault");
    Sentry.setTag("handeling", "overig");
    // Init-race: alles wat vóór init al bekend was alsnog toepassen.
    if (gewensteGebruiker) {
      Sentry.setUser({ id: String(gewensteGebruiker.id) });
      Sentry.setTag("rol", gewensteGebruiker.rol);
    }
    if (gewenstePagina) Sentry.setTag("pagina", gewenstePagina);
  } catch {
    // Monitoring mag het laden van de app nooit hinderen.
  }
}

/** Ná login aanroepen: koppel het gebruikers-id (pseudoniem) aan meldingen. */
export function zetMonitoringGebruiker(
  gebruiker: { id: number; rol: string } | null,
): void {
  gewensteGebruiker = gebruiker;
  if (!actief) return;
  Sentry.setUser(gebruiker ? { id: String(gebruiker.id) } : null);
  Sentry.setTag("rol", gebruiker?.rol ?? "uitgelogd");
}

/** Bij elke routewissel aanroepen: pagina-tag voor volgende meldingen. */
export function zetMonitoringPagina(pad: string): void {
  const schoon = normaliseerMonitoringPad(pad) ?? "/onbekend";
  gewenstePagina = schoon;
  if (!actief) return;
  Sentry.setTag("pagina", schoon);
}

/** Voor de ErrorBoundary: door React opgevangen renderfouten ook rapporteren. */
export function rapporteerFout(fout: unknown): void {
  if (!actief) return;
  Sentry.captureException(fout);
}

// ── "Laatste handeling"-registratie (voor de Dit werkt niet-knop) ────────────
let laatsteHandeling: { tekst: string; op: string } | null = null;

export function leesLaatsteHandeling(): { tekst: string; op: string } | null {
  return laatsteHandeling;
}

export function startHandelingRegistratie(): void {
  document.addEventListener(
    "click",
    (e) => {
      const el = (e.target as HTMLElement | null)?.closest?.("button, a, [role='button'], [role='menuitem'], [role='tab']");
      if (!el) return;
      const label = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("data-testid") || "").trim().replace(/\s+/g, " ").slice(0, 120);
      if (!label) return;
      laatsteHandeling = { tekst: label, op: new Date().toISOString() };
    },
    { capture: true, passive: true },
  );
}
