import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { isVeiligInternNavigatiepad } from "@/lib/navigatie-register";

type OpslaanFn = (() => void | Promise<void>) | null;

export interface NavigatieInstroom {
  label: string;
  pad: string;
}

export interface RequestNavigatieOpties {
  vervang?: boolean;
  instroom?: NavigatieInstroom;
  wisInstroom?: boolean;
}

interface NavigatieBewakingCtxType {
  isDirty: boolean;
  instroom: NavigatieInstroom | null;
  meldDirty: (dirty: boolean, onSave?: OpslaanFn) => void;
  requestNavigatie: (pad: string, opties?: RequestNavigatieOpties) => void;
  requestTerug: (pad: string) => void;
}

const NavigatieBewakingCtx = createContext<NavigatieBewakingCtxType | null>(null);

const HISTORIE_INDEX_SLEUTEL = "__fpsNavigatieIndex";
const POPSTATE_REGISTER_SLEUTEL = "__fpsNavigatiePopstateRegister";

interface PopstateRegister {
  handler: ((event: PopStateEvent) => void) | null;
}

interface NavigationMetIndex {
  currentEntry?: { index?: number } | null;
}

function leesBrowserHistorieIndex(): number | null {
  const navigation = (window as typeof window & {
    navigation?: NavigationMetIndex;
  }).navigation;
  const index = navigation?.currentEntry?.index;
  return typeof index === "number" && Number.isInteger(index) ? index : null;
}

function maakVroegPopstateRegister(): PopstateRegister | null {
  if (typeof window === "undefined") return null;
  const venster = window as typeof window & {
    [POPSTATE_REGISTER_SLEUTEL]?: PopstateRegister;
  };
  if (venster[POPSTATE_REGISTER_SLEUTEL]) {
    return venster[POPSTATE_REGISTER_SLEUTEL];
  }

  const register: PopstateRegister = { handler: null };
  venster[POPSTATE_REGISTER_SLEUTEL] = register;
  window.addEventListener(
    "popstate",
    (event) => register.handler?.(event),
    true,
  );
  return register;
}

// Module-import gebeurt vóórdat Wouter zijn useSyncExternalStore-listeners
// monteert. Zo kan een vuile historie-overgang eerst worden teruggezet zonder
// dat de doelroute het formulier al unmount.
const VROEG_POPSTATE_REGISTER = maakVroegPopstateRegister();

function leesHistorieIndex(state: unknown): number | null {
  if (!state || typeof state !== "object") return null;
  const waarde = (state as Record<string, unknown>)[HISTORIE_INDEX_SLEUTEL];
  return typeof waarde === "number" && Number.isInteger(waarde) ? waarde : null;
}

function metHistorieIndex(state: unknown, index: number): Record<string, unknown> {
  return {
    ...(state && typeof state === "object" ? state as Record<string, unknown> : {}),
    [HISTORIE_INDEX_SLEUTEL]: index,
  };
}

function internPadVanUrl(url: string | URL | null | undefined): string | null {
  if (url == null) return null;
  let doel: URL;
  try {
    doel = new URL(String(url), window.location.href);
  } catch {
    return null;
  }
  if (doel.origin !== window.location.origin) return null;

  const basispad = import.meta.env.BASE_URL.replace(/\/$/, "");
  let pad = doel.pathname;
  if (
    basispad &&
    (pad === basispad || pad.startsWith(`${basispad}/`))
  ) {
    pad = pad.slice(basispad.length) || "/";
  }
  const internPad = `${pad}${doel.search}${doel.hash}`;
  return isVeiligInternNavigatiepad(internPad) ? internPad : null;
}

export function NavigatieBewakingProvider({ children }: { children: React.ReactNode }) {
  const [location, navigeer] = useLocation();
  const [isDirty, setIsDirty] = useState(false);
  const [heeftOpslaanFn, setHeeftOpslaanFn] = useState(false);
  const opslaanRef = useRef<OpslaanFn>(null);
  const [dialoogOpen, setDialoogOpen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [instroom, setInstroom] = useState<NavigatieInstroom | null>(null);
  const instroomBestemmingRef = useRef<string | null>(null);
  const pendingRef = useRef<{ pad: string; opties: RequestNavigatieOpties } | null>(null);
  const pendingHistorieDeltaRef = useRef<number | null>(null);
  const herstelHistorieRef = useRef<{
    delta: number;
    huidigeIndex: number;
    huidigeBrowserIndex: number | null;
  } | null>(null);
  const zoekOnbekendHistorieHerstelRef = useRef<{
    stappenVooruit: number;
    huidigeIndex: number;
    huidigeBrowserIndex: number | null;
    huidigePad: string;
  } | null>(null);
  const historieIndexRef = useRef(0);
  const browserHistorieIndexRef = useRef<number | null>(null);
  const historieBypassRef = useRef(false);
  const interneNavigatieRef = useRef(false);
  const isDirtyRef = useRef(isDirty);
  const locationRef = useRef(location);
  isDirtyRef.current = isDirty;
  locationRef.current = location;

  const meldDirty = useCallback((dirty: boolean, onSave?: OpslaanFn) => {
    setIsDirty(dirty);
    setHeeftOpslaanFn(dirty && !!onSave);
    opslaanRef.current = dirty ? (onSave ?? null) : null;
  }, []);

  useEffect(() => {
    if (!instroomBestemmingRef.current) return;
    const huidigPad = location.split(/[?#]/, 1)[0];
    if (huidigPad !== instroomBestemmingRef.current) {
      instroomBestemmingRef.current = null;
      setInstroom(null);
    }
  }, [location]);

  const voerNavigatieUit = useCallback(
    (pad: string, opties: RequestNavigatieOpties = {}) => {
      if (!isVeiligInternNavigatiepad(pad)) return;

      if (opties.wisInstroom) {
        instroomBestemmingRef.current = null;
        setInstroom(null);
      }

      if (
        opties.instroom &&
        isVeiligInternNavigatiepad(opties.instroom.pad)
      ) {
        instroomBestemmingRef.current = pad.split(/[?#]/, 1)[0];
        setInstroom(opties.instroom);
      }

      interneNavigatieRef.current = true;
      try {
        navigeer(pad, { replace: opties.vervang ?? false });
      } finally {
        interneNavigatieRef.current = false;
      }
    },
    [navigeer],
  );

  const requestNavigatie = useCallback((pad: string, opties: RequestNavigatieOpties = {}) => {
    if (!isVeiligInternNavigatiepad(pad)) return;
    if (!isDirty) {
      voerNavigatieUit(pad, opties);
      return;
    }
    pendingRef.current = { pad, opties };
    setDialoogOpen(true);
  }, [isDirty, voerNavigatieUit]);

  useEffect(() => {
    const originelePushState = window.history.pushState;
    const origineleReplaceState = window.history.replaceState;
    const bestaandeIndex = leesHistorieIndex(window.history.state);
    historieIndexRef.current = bestaandeIndex ?? 0;
    browserHistorieIndexRef.current = leesBrowserHistorieIndex();

    if (bestaandeIndex === null) {
      origineleReplaceState.call(
        window.history,
        metHistorieIndex(window.history.state, historieIndexRef.current),
        "",
        window.location.href,
      );
    }

    function blokkeerAppNavigatie(
      url: string | URL | null | undefined,
      vervang: boolean,
    ): boolean {
      if (!isDirtyRef.current || interneNavigatieRef.current) return false;
      const pad = internPadVanUrl(url);
      if (!pad || pad === locationRef.current) return false;
      pendingRef.current = { pad, opties: { vervang } };
      setDialoogOpen(true);
      return true;
    }

    const bewaaktePushState: History["pushState"] = function (
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ) {
      if (blokkeerAppNavigatie(url, false)) return;
      const volgendeIndex = historieIndexRef.current + 1;
      historieIndexRef.current = volgendeIndex;
      const resultaat = originelePushState.call(
        window.history,
        metHistorieIndex(data, volgendeIndex),
        unused,
        url,
      );
      browserHistorieIndexRef.current = leesBrowserHistorieIndex();
      return resultaat;
    };
    const bewaakteReplaceState: History["replaceState"] = function (
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ) {
      if (blokkeerAppNavigatie(url, true)) return;
      const resultaat = origineleReplaceState.call(
        window.history,
        metHistorieIndex(data, historieIndexRef.current),
        unused,
        url,
      );
      browserHistorieIndexRef.current = leesBrowserHistorieIndex();
      return resultaat;
    };

    window.history.pushState = bewaaktePushState;
    window.history.replaceState = bewaakteReplaceState;

    function bewaakHistorie(event: PopStateEvent) {
      const doelIndex = leesHistorieIndex(event.state);
      const doelBrowserIndex = leesBrowserHistorieIndex();

      if (historieBypassRef.current) {
        historieBypassRef.current = false;
        if (doelIndex !== null) historieIndexRef.current = doelIndex;
        browserHistorieIndexRef.current = doelBrowserIndex;
        return;
      }

      const herstel = herstelHistorieRef.current;
      if (herstel) {
        event.stopImmediatePropagation();
        historieIndexRef.current = herstel.huidigeIndex;
        browserHistorieIndexRef.current = herstel.huidigeBrowserIndex;
        pendingHistorieDeltaRef.current = herstel.delta;
        herstelHistorieRef.current = null;
        setDialoogOpen(true);
        return;
      }

      const onbekendHerstel = zoekOnbekendHistorieHerstelRef.current;
      if (onbekendHerstel) {
        event.stopImmediatePropagation();
        onbekendHerstel.stappenVooruit += 1;
        const huidigPad = internPadVanUrl(window.location.href);
        if (
          doelIndex === onbekendHerstel.huidigeIndex &&
          huidigPad === onbekendHerstel.huidigePad
        ) {
          historieIndexRef.current = onbekendHerstel.huidigeIndex;
          browserHistorieIndexRef.current =
            onbekendHerstel.huidigeBrowserIndex;
          pendingHistorieDeltaRef.current =
            -onbekendHerstel.stappenVooruit;
          zoekOnbekendHistorieHerstelRef.current = null;
          setDialoogOpen(true);
          return;
        }
        window.history.forward();
        return;
      }

      const huidigeIndex = historieIndexRef.current;
      const huidigeBrowserIndex = browserHistorieIndexRef.current;
      const delta =
        doelBrowserIndex !== null && huidigeBrowserIndex !== null
          ? doelBrowserIndex - huidigeBrowserIndex
          : (doelIndex === null ? null : doelIndex - huidigeIndex);
      if (!isDirtyRef.current || delta === 0) {
        if (doelIndex !== null) historieIndexRef.current = doelIndex;
        browserHistorieIndexRef.current = doelBrowserIndex;
        return;
      }

      event.stopImmediatePropagation();
      if (delta === null) {
        // Onbekende entry van vóór deze app-sessie: loop zonder historie te
        // muteren vooruit tot de gemarkeerde huidige route terug is. De
        // gemeten afstand brengt Verlaten exact terug naar het gekozen doel;
        // Annuleren laat de volledige Back/Forward-keten intact.
        zoekOnbekendHistorieHerstelRef.current = {
          stappenVooruit: 0,
          huidigeIndex,
          huidigeBrowserIndex,
          huidigePad: locationRef.current,
        };
        window.history.forward();
        return;
      }

      herstelHistorieRef.current = {
        delta,
        huidigeIndex,
        huidigeBrowserIndex,
      };
      window.history.go(-delta);
    }

    function bewaakPaginaVerlaten(event: BeforeUnloadEvent) {
      if (!isDirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }

    if (VROEG_POPSTATE_REGISTER) {
      VROEG_POPSTATE_REGISTER.handler = bewaakHistorie;
    }
    window.addEventListener("beforeunload", bewaakPaginaVerlaten);
    return () => {
      window.removeEventListener("beforeunload", bewaakPaginaVerlaten);
      if (VROEG_POPSTATE_REGISTER?.handler === bewaakHistorie) {
        VROEG_POPSTATE_REGISTER.handler = null;
      }
      if (window.history.pushState === bewaaktePushState) {
        window.history.pushState = originelePushState;
      }
      if (window.history.replaceState === bewaakteReplaceState) {
        window.history.replaceState = origineleReplaceState;
      }
    };
  }, []);

  useEffect(() => {
    if (!isDirty) return;

    function bewaakInterneLink(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      ) {
        return;
      }

      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (
        !link ||
        link.hasAttribute("download") ||
        (link.target && link.target !== "_self")
      ) {
        return;
      }

      const href = link.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;

      const basispad = import.meta.env.BASE_URL.replace(/\/$/, "");
      let pad = url.pathname;
      if (
        basispad &&
        (pad === basispad || pad.startsWith(`${basispad}/`))
      ) {
        pad = pad.slice(basispad.length) || "/";
      }
      const doel = `${pad}${url.search}${url.hash}`;
      if (
        !isVeiligInternNavigatiepad(doel) ||
        doel === location
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      requestNavigatie(doel);
    }

    document.addEventListener("click", bewaakInterneLink, true);
    return () => {
      document.removeEventListener("click", bewaakInterneLink, true);
    };
  }, [isDirty, location, requestNavigatie]);

  const requestTerug = useCallback((pad: string) => {
    requestNavigatie(pad);
  }, [requestNavigatie]);

  function voltooiPendingNavigatie() {
    const pending = pendingRef.current;
    const historieDelta = pendingHistorieDeltaRef.current;
    pendingRef.current = null;
    pendingHistorieDeltaRef.current = null;
    setIsDirty(false);
    setHeeftOpslaanFn(false);
    opslaanRef.current = null;
    setDialoogOpen(false);
    if (historieDelta !== null) {
      historieBypassRef.current = true;
      window.history.go(historieDelta);
      return;
    }
    if (pending) voerNavigatieUit(pending.pad, pending.opties);
  }

  async function handleOpslaanEnVerlaten() {
    if (opslaanRef.current) {
      setBezig(true);
      try {
        await opslaanRef.current();
      } catch {
        return;
      } finally {
        setBezig(false);
      }
    }
    voltooiPendingNavigatie();
  }

  function handleVerlaten() {
    voltooiPendingNavigatie();
  }

  return (
    <NavigatieBewakingCtx.Provider
      value={{ isDirty, instroom, meldDirty, requestNavigatie, requestTerug }}
    >
      {children}
      <AlertDialog
        open={dialoogOpen}
        onOpenChange={(open) => {
          if (bezig) return;
          if (!open) {
            pendingRef.current = null;
            pendingHistorieDeltaRef.current = null;
          }
          setDialoogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Niet-opgeslagen wijzigingen</AlertDialogTitle>
            <AlertDialogDescription>
              {heeftOpslaanFn
                ? "Wilt u de wijzigingen opslaan voordat u de pagina verlaat?"
                : "U heeft niet-opgeslagen wijzigingen. Als u verdergaat, gaan deze verloren."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bezig}>Annuleren</AlertDialogCancel>
            <Button variant="outline" onClick={handleVerlaten} disabled={bezig}>
              Verlaten
            </Button>
            {heeftOpslaanFn && (
              <AlertDialogAction onClick={handleOpslaanEnVerlaten} disabled={bezig}>
                {bezig ? "Opslaan..." : "Opslaan en verlaten"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </NavigatieBewakingCtx.Provider>
  );
}

export function useNavigatieBewaking(): NavigatieBewakingCtxType {
  const ctx = useContext(NavigatieBewakingCtx);
  if (!ctx) throw new Error("useNavigatieBewaking: geen NavigatieBewakingProvider gevonden");
  return ctx;
}
