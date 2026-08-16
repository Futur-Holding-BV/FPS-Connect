// NAV_01 — twee-traps sidebar. De hoofdsidebar toont alleen de hoofdstuknamen;
// een klik opent een uitschuivend paneel naast de sidebar met de onderdelen van
// dát hoofdstuk. Eén hoofdstuk tegelijk open; sluit op Escape, buiten klikken en
// na het kiezen van een onderdeel. Onder het mobiele breekpunt valt het terug op
// de bestaande inklapweergave (`InklapbaarHoofdstuk`).
//
// Bouwt bewust voort op hetzelfde mechanisme: volgorde/slepen blijven bij
// `useSidebarHoofdstukken` + `SleepGreep`; dit component voegt alleen de
// paneelweergave toe (geen tweede menumechanisme — NAV_01 §0).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronRight, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";
import { HOOFDSTUK_STAPPENPLANNEN } from "@/lib/hoofdstuk-stappenplannen";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSidebar } from "@/components/ui/sidebar";
import {
  HerschikbaarHoofdstuk,
  InklapbaarHoofdstuk,
  SleepGreep,
} from "@/components/ui/herschikbaar-hoofdstuk";

// ── Context: één hoofdstuk tegelijk open ────────────────────────────────────

interface TweeTrapsContextWaarde {
  actief: string | null;
  setActief: (sleutel: string | null) => void;
}

const TweeTrapsContext = createContext<TweeTrapsContextWaarde>({
  actief: null,
  setActief: () => {},
});

export function TweeTrapsProvider({ children }: PropsWithChildren) {
  const [actief, setActief] = useState<string | null>(null);
  return (
    <TweeTrapsContext.Provider value={{ actief, setActief }}>
      {children}
    </TweeTrapsContext.Provider>
  );
}

// ── Toetsenbord: pijltjes door de hoofdstukknoppen ──────────────────────────

function focusHoofdstukKnop(richting: 1 | -1, huidige: HTMLElement) {
  const knoppen = Array.from(
    document.querySelectorAll<HTMLElement>("[data-hoofdstuk-knop]"),
  ).filter((k) => k.offsetParent !== null);
  const index = knoppen.indexOf(huidige);
  if (index === -1) return;
  const volgende = knoppen[(index + richting + knoppen.length) % knoppen.length];
  volgende?.focus();
}

function focusbareElementen(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"),
  ).filter((el) => el.offsetParent !== null);
}

// ── Stappenplan: uitklapbaar blok bovenin het paneel ────────────────────────

function StappenplanBlok({ sleutel }: { sleutel: string }) {
  const stappen = HOOFDSTUK_STAPPENPLANNEN[sleutel];
  const [open, setOpen] = useState(false);
  if (!stappen || stappen.length === 0) return null;
  return (
    <div className="border-b border-sidebar-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-sidebar-foreground/70 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring motion-reduce:transition-none"
      >
        <ListOrdered className="h-3.5 w-3.5 shrink-0" />
        <span>Stappenplan</span>
        <ChevronRight
          className={cn(
            "ml-auto h-3.5 w-3.5 shrink-0 transition-transform motion-reduce:transition-none",
            open && "rotate-90",
          )}
        />
      </button>
      {open && (
        <ol className="space-y-1.5 px-3 pb-3 pt-0.5">
          {stappen.map((stap, i) => (
            <li key={i} className="flex gap-2 text-xs leading-relaxed text-sidebar-foreground/85">
              <span
                className="shrink-0 font-semibold tabular-nums"
                style={{ color: `hsl(var(--hoofdstuk-${sleutel}-sidebar))` }}
              >
                {i + 1}.
              </span>
              <span>{stap}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ── Paneel ──────────────────────────────────────────────────────────────────

const PANEEL_BREEDTE = 268;
const PANEEL_MARGE = 8;

interface TweeTrapsHoofdstukProps {
  sleutel: string;
  titel: string;
  positie: number;
  onVerplaats: (van: string, naar: string) => void;
  /** Alleen gebruikt in de mobiele terugvalweergave. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metScheiding?: boolean;
  kopExtra?: ReactNode;
}

/**
 * Eén hoofdstuk in het twee-traps menu. Zelfde props als `InklapbaarHoofdstuk`
 * (drop-in vervanging in de layout); kleur komt uit de ontwerptokens via de
 * CSS-variabelen `--hoofdstuk-<sleutel>(-sidebar)`.
 */
export function TweeTrapsHoofdstuk({
  sleutel,
  titel,
  positie,
  onVerplaats,
  open,
  onOpenChange,
  metScheiding = false,
  kopExtra,
  children,
}: PropsWithChildren<TweeTrapsHoofdstukProps>) {
  const isMobiel = useIsMobile();
  const { state: sidebarStand } = useSidebar();
  const { actief, setActief } = useContext(TweeTrapsContext);
  const isOpen = actief === sleutel;
  const knopRef = useRef<HTMLButtonElement>(null);
  const paneelRef = useRef<HTMLDivElement>(null);
  const [paneelPositie, setPaneelPositie] = useState<{ top: number; left: number } | null>(null);
  // Zichtbaar-vlag ná positionering, zodat de inschuif-animatie vanaf de juiste plek start.
  const [zichtbaar, setZichtbaar] = useState(false);

  const sluit = useCallback(
    (focusTerug = false) => {
      setActief(null);
      if (focusTerug) knopRef.current?.focus();
    },
    [setActief],
  );

  // Positioneren: paneel begint op de hoogte van het aangeklikte hoofdstuk,
  // direct naast de sidebar; onderaan het venster wordt hij omhoog geklemd.
  const herpositioneer = useCallback(() => {
    const knop = knopRef.current;
    const paneel = paneelRef.current;
    if (!knop || !paneel) return;
    const knopRect = knop.getBoundingClientRect();
    const sidebarRect = knop.closest('[data-slot="sidebar"], [data-sidebar="sidebar"]')?.getBoundingClientRect();
    const left = (sidebarRect?.right ?? knopRect.right) + PANEEL_MARGE;
    const paneelHoogte = paneel.offsetHeight;
    let top = knopRect.top;
    if (top + paneelHoogte > window.innerHeight - PANEEL_MARGE) {
      top = Math.max(PANEEL_MARGE, window.innerHeight - PANEEL_MARGE - paneelHoogte);
    }
    setPaneelPositie({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPaneelPositie(null);
      setZichtbaar(false);
      return;
    }
    herpositioneer();
    // Volgende frame zichtbaar maken zodat de CSS-overgang afspeelt.
    const raf = requestAnimationFrame(() => setZichtbaar(true));
    return () => cancelAnimationFrame(raf);
  }, [isOpen, herpositioneer]);

  // Sluiten bij buiten klikken; herpositioneren bij scroll/resize.
  useEffect(() => {
    if (!isOpen) return;
    const bijMuisNeer = (e: MouseEvent) => {
      const doel = e.target as Node;
      if (paneelRef.current?.contains(doel) || knopRef.current?.contains(doel)) return;
      sluit();
    };
    const bijScrollOfResize = () => herpositioneer();
    // Globale Escape: sluit ook wanneer de focus buiten knop/paneel staat
    // (bv. na Tab het paneel uit) — anders blijft het paneel hangen.
    const bijGlobaleToets = (e: KeyboardEvent) => {
      if (e.key === "Escape") sluit(true);
    };
    document.addEventListener("mousedown", bijMuisNeer);
    document.addEventListener("keydown", bijGlobaleToets);
    window.addEventListener("resize", bijScrollOfResize);
    const scrollContainer = knopRef.current?.closest('[data-slot="sidebar-content"], [data-sidebar="content"]');
    scrollContainer?.addEventListener("scroll", bijScrollOfResize);
    return () => {
      document.removeEventListener("mousedown", bijMuisNeer);
      document.removeEventListener("keydown", bijGlobaleToets);
      window.removeEventListener("resize", bijScrollOfResize);
      scrollContainer?.removeEventListener("scroll", bijScrollOfResize);
    };
  }, [isOpen, sluit, herpositioneer]);

  // Mobiel (of ingeklapte icon-sidebar): de bestaande inklapweergave.
  if (isMobiel || sidebarStand === "collapsed") {
    return (
      <InklapbaarHoofdstuk
        sleutel={sleutel}
        titel={titel}
        positie={positie}
        onVerplaats={onVerplaats}
        open={open}
        onOpenChange={onOpenChange}
        metScheiding={metScheiding}
        kopExtra={
          <>
            <span
              aria-hidden
              className="ml-1 h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: `hsl(var(--hoofdstuk-${sleutel}-sidebar))` }}
            />
            {kopExtra}
          </>
        }
      >
        {children}
      </InklapbaarHoofdstuk>
    );
  }

  const bijKnopToets = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusHoofdstukKnop(1, e.currentTarget);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusHoofdstukKnop(-1, e.currentTarget);
    } else if (e.key === "ArrowRight" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setActief(sleutel);
      requestAnimationFrame(() => {
        const paneel = paneelRef.current;
        if (paneel) focusbareElementen(paneel)[0]?.focus();
      });
    } else if (e.key === "Escape") {
      sluit(true);
    }
  };

  const bijPaneelToets = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      sluit(true);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const paneel = paneelRef.current;
    if (!paneel) return;
    const items = focusbareElementen(paneel);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const richting = e.key === "ArrowDown" ? 1 : -1;
    items[(index + richting + items.length) % items.length]?.focus();
  };

  return (
    <HerschikbaarHoofdstuk sleutel={sleutel} positie={positie} onVerplaats={onVerplaats}>
      {metScheiding && <div className="mx-4 my-1 h-px bg-border" />}
      <div className="flex items-center gap-1 px-2 py-0.5">
        <SleepGreep sleutel={sleutel} titel={titel} onVerplaats={onVerplaats} />
        <button
          ref={knopRef}
          type="button"
          data-hoofdstuk-knop
          aria-haspopup="menu"
          aria-expanded={isOpen}
          onClick={() => setActief(isOpen ? null : sleutel)}
          onKeyDown={bijKnopToets}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-sidebar-foreground/70 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring motion-reduce:transition-none",
            isOpen && "bg-sidebar-accent text-sidebar-foreground",
          )}
        >
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: `hsl(var(--hoofdstuk-${sleutel}-sidebar))` }}
          />
          <span className="truncate">{titel}</span>
          {kopExtra}
          <ChevronRight
            className={cn(
              "ml-auto h-3.5 w-3.5 shrink-0 transition-transform motion-reduce:transition-none",
              isOpen && "translate-x-0.5",
            )}
            style={isOpen ? { color: `hsl(var(--hoofdstuk-${sleutel}-sidebar))` } : undefined}
          />
        </button>
      </div>
      {isOpen &&
        createPortal(
          <nav
            ref={paneelRef}
            aria-label={`Onderdelen van ${titel}`}
            onKeyDown={bijPaneelToets}
            onClick={(e) => {
              // Na het kiezen van een onderdeel (link of knop met navigatie) sluit het paneel.
              if ((e.target as HTMLElement).closest("a[href]")) sluit();
            }}
            className={cn(
              "fixed z-50 max-h-[calc(100vh-16px)] overflow-y-auto rounded-lg border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl",
              "transition-[opacity,transform] duration-[var(--duur-normaal)] ease-[var(--versnelling)] motion-reduce:transition-none",
              zichtbaar ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0",
            )}
            style={{
              top: paneelPositie?.top ?? 0,
              left: paneelPositie?.left ?? 0,
              width: PANEEL_BREEDTE,
              visibility: paneelPositie ? "visible" : "hidden",
            }}
          >
            <div
              className="flex items-center gap-2 border-b border-sidebar-border px-3 py-2"
              style={{ boxShadow: `inset 0 3px 0 0 hsl(var(--hoofdstuk-${sleutel}-sidebar))` }}
            >
              <span
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: `hsl(var(--hoofdstuk-${sleutel}-sidebar))` }}
              >
                {titel}
              </span>
            </div>
            <StappenplanBlok sleutel={sleutel} />
            <div className="p-1.5">{children}</div>
          </nav>,
          document.body,
        )}
    </HerschikbaarHoofdstuk>
  );
}
