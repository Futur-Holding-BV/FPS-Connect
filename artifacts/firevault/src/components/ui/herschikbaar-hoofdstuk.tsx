import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { ChevronDown, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";

interface HerschikbaarHoofdstukProps {
  /** Stabiele, unieke sleutel voor dit hoofdstuk — losstaand van weergavevolgorde. */
  sleutel: string;
  /** CSS `order`-positie binnen de flex-container van de sidebar. */
  positie: number;
  /** Callback die wordt aangeroepen zodra een hoofdstuk hier naartoe wordt gesleept. */
  onVerplaats: (vanSleutel: string, naarSleutel: string) => void;
}

/**
 * Het slepen gebruikt bewust muis-events (mousedown/mousemove/mouseup) in
 * plaats van native HTML5 drag-and-drop: Chromium/Blink weigert een native
 * sleepactie te starten voor elementen die in-flow binnen de scrollbare
 * `SidebarContent` liggen (empirisch vastgesteld; de `dragstart` vuurt daar
 * simpelweg nooit). Muis-events kennen die beperking niet en zijn bovendien
 * deterministisch testbaar.
 *
 * Onderlinge communicatie (welk hoofdstuk is doelwit) verloopt via een
 * CustomEvent op `window`, zodat de hoofdstukken losjes gekoppeld blijven en
 * de aanroepende component geen extra sleepstatus hoeft door te geven.
 */
const SLEEP_EVENT = "fps-sidebar-hoofdstuk-sleep";

interface SleepDetail {
  vanSleutel: string | null;
  doelSleutel: string | null;
}

function meldSleepDoel(vanSleutel: string | null, doelSleutel: string | null) {
  window.dispatchEvent(
    new CustomEvent<SleepDetail>(SLEEP_EVENT, { detail: { vanSleutel, doelSleutel } }),
  );
}

/**
 * Herbruikbare bouwsteen voor herschikbare sidebar-hoofdstukken: dropzone-
 * markering + volgordepositie. De sleepgreep zelf zit in `InklapbaarHoofdstuk`
 * (zichtbaar grip-icoon in de hoofdstukkop). Alleen bedoeld voor desktop-muisgebruik.
 *
 * Wijzigt nooit óf een hoofdstuk zichtbaar is (dat blijft bepaald door de
 * aanroepende component/bevoegdhedenlogica) — alleen de volgorde ervan.
 */
export function HerschikbaarHoofdstuk({
  sleutel,
  positie,
  children,
}: PropsWithChildren<HerschikbaarHoofdstukProps>) {
  const [wordtOvergeslept, setWordtOvergeslept] = useState(false);

  useEffect(() => {
    const bijSleep = (e: Event) => {
      const { vanSleutel, doelSleutel } = (e as CustomEvent<SleepDetail>).detail;
      setWordtOvergeslept(doelSleutel === sleutel && vanSleutel !== sleutel);
    };
    window.addEventListener(SLEEP_EVENT, bijSleep);
    return () => window.removeEventListener(SLEEP_EVENT, bijSleep);
  }, [sleutel]);

  return (
    <div
      style={{ order: positie }}
      data-hoofdstuk-sleutel={sleutel}
      className={cn(
        "group/herschik relative rounded-md transition-colors",
        wordtOvergeslept && "bg-sidebar-accent/50 outline-dashed outline-1 outline-primary/50",
      )}
    >
      {children}
    </div>
  );
}

interface InklapbaarHoofdstukProps extends HerschikbaarHoofdstukProps {
  /** Zichtbare hoofdstuktitel in de kop. */
  titel: string;
  /** Uitgeklapt (true) of ingeklapt (false). */
  open: boolean;
  /** Callback bij open-/dichtklappen. */
  onOpenChange: (open: boolean) => void;
  /** Toont een horizontale scheidingslijn boven het hoofdstuk. */
  metScheiding?: boolean;
  /** Extra element in de kop, direct na de titel (bijv. een badge). */
  kopExtra?: ReactNode;
}

/** Afstand (px) van de rand van de scrollcontainer waarbinnen automatisch gescrold wordt. */
const RANDSCROLL_MARGE = 48;
/** Scrollstap (px) per muisbeweging nabij de rand. */
const RANDSCROLL_STAP = 14;
/** Minimale muisverplaatsing (px) voordat een sleepactie start (voorkomt trillen bij klikken). */
const SLEEP_DREMPEL = 4;

/**
 * Volledig hoofdstuk voor de sidebar: herschikbaar (slepen via een altijd
 * zichtbaar grip-icoon in de kop) én inklapbaar (klik op de kop of het
 * pijltje). Children vormen de hoofdstukinhoud, meestal een `<SidebarMenu>`.
 */
export function InklapbaarHoofdstuk({
  sleutel,
  titel,
  positie,
  onVerplaats,
  open,
  onOpenChange,
  metScheiding = false,
  kopExtra,
  children,
}: PropsWithChildren<InklapbaarHoofdstukProps>) {
  const [aanHetSlepen, setAanHetSlepen] = useState(false);
  // Verwijst tijdens een actieve sleep naar de opruimfunctie, zodat een
  // unmount midden in een sleep de window-listeners en body-stijlen niet lekt.
  const annuleerLopendeSleepRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => annuleerLopendeSleepRef.current?.();
  }, []);

  const startSleep = (startEvent: ReactMouseEvent<HTMLSpanElement>) => {
    if (startEvent.button !== 0) return;
    startEvent.preventDefault();
    const startX = startEvent.clientX;
    const startY = startEvent.clientY;
    const scrollContainer = startEvent.currentTarget.closest(
      '[data-slot="sidebar-content"], [data-sidebar="content"]',
    );
    let actief = false;
    let doel: string | null = null;

    const bijBeweging = (e: MouseEvent) => {
      if (!actief) {
        if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) < SLEEP_DREMPEL) return;
        actief = true;
        setAanHetSlepen(true);
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
      }
      // Automatisch scrollen nabij de boven-/onderrand van de sidebar-inhoud,
      // zodat ook hoofdstukken buiten beeld bereikbaar zijn tijdens het slepen.
      if (scrollContainer) {
        const rect = scrollContainer.getBoundingClientRect();
        if (e.clientY < rect.top + RANDSCROLL_MARGE) {
          scrollContainer.scrollBy({ top: -RANDSCROLL_STAP });
        } else if (e.clientY > rect.bottom - RANDSCROLL_MARGE) {
          scrollContainer.scrollBy({ top: RANDSCROLL_STAP });
        }
      }
      const onderCursor = document.elementFromPoint(e.clientX, e.clientY);
      const kandidaat =
        onderCursor?.closest("[data-hoofdstuk-sleutel]")?.getAttribute("data-hoofdstuk-sleutel") ??
        null;
      doel = kandidaat && kandidaat !== sleutel ? kandidaat : null;
      meldSleepDoel(sleutel, doel);
    };

    const beeindig = (verplaats: boolean) => {
      window.removeEventListener("mousemove", bijBeweging);
      window.removeEventListener("mouseup", bijLoslaten);
      window.removeEventListener("keydown", bijToets);
      window.removeEventListener("blur", bijFocusverlies);
      annuleerLopendeSleepRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setAanHetSlepen(false);
      meldSleepDoel(null, null);
      if (verplaats && actief && doel) onVerplaats(sleutel, doel);
    };

    const bijLoslaten = () => beeindig(true);
    const bijToets = (e: KeyboardEvent) => {
      if (e.key === "Escape") beeindig(false);
    };
    // Vensterwissel (alt-tab) kan de mouseup laten missen; annuleer dan netjes.
    const bijFocusverlies = () => beeindig(false);

    window.addEventListener("mousemove", bijBeweging);
    window.addEventListener("mouseup", bijLoslaten);
    window.addEventListener("keydown", bijToets);
    window.addEventListener("blur", bijFocusverlies);
    annuleerLopendeSleepRef.current = () => beeindig(false);
  };

  return (
    <HerschikbaarHoofdstuk sleutel={sleutel} positie={positie} onVerplaats={onVerplaats}>
      {metScheiding && (
        <div className="mx-4 my-1 h-px bg-border group-data-[collapsible=icon]:hidden" />
      )}
      <Collapsible open={open} onOpenChange={onOpenChange} className="group/collapsible">
        <SidebarGroup>
          {/* De sleepgreep staat naast de CollapsibleTrigger zodat slepen en
              open-/dichtklappen elkaar nooit in de weg zitten. */}
          <SidebarGroupLabel asChild>
            <div className="flex w-full items-center gap-1">
              <span
                onMouseDown={startSleep}
                title="Versleep om dit hoofdstuk te herschikken"
                aria-label={`Hoofdstuk ${titel} verslepen`}
                className={cn(
                  "-ml-1 flex h-5 w-4 shrink-0 cursor-grab items-center justify-center rounded text-sidebar-foreground/40 hover:bg-sidebar-accent hover:text-primary group-data-[collapsible=icon]:hidden",
                  aanHetSlepen && "cursor-grabbing text-primary",
                )}
              >
                <GripVertical className="h-3.5 w-3.5" />
              </span>
              <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-1">
                <span className="truncate">{titel}</span>
                {kopExtra}
                <ChevronDown className="ml-auto h-4 w-4 shrink-0 transition-transform group-data-[state=open]/collapsible:rotate-180 group-data-[collapsible=icon]:hidden" />
              </CollapsibleTrigger>
            </div>
          </SidebarGroupLabel>
          <CollapsibleContent>
            <SidebarGroupContent>{children}</SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
      </Collapsible>
    </HerschikbaarHoofdstuk>
  );
}
