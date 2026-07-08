import { useState, type PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

interface HerschikbaarHoofdstukProps {
  /** Stabiele, unieke sleutel voor dit hoofdstuk — losstaand van weergavevolgorde. */
  sleutel: string;
  /** CSS `order`-positie binnen de flex-container van de sidebar. */
  positie: number;
  /** Callback die wordt aangeroepen zodra een hoofdstuk hier naartoe wordt gesleept. */
  onVerplaats: (vanSleutel: string, naarSleutel: string) => void;
}

const DATA_TYPE = "text/fps-sidebar-hoofdstuk";

/**
 * Herbruikbare drag-and-drop bouwsteen voor herschikbare sidebar-hoofdstukken.
 * Plaatst een smalle grip-balk aan de linkerkant (zichtbaar bij hover) die
 * gebruikt kan worden om het hele hoofdstuk — inclusief alle subitems — naar
 * een andere positie te slepen. Alleen bedoeld voor desktop-muisgebruik.
 *
 * Wijzigt nooit óf een hoofdstuk zichtbaar is (dat blijft bepaald door de
 * aanroepende component/bevoegdhedenlogica) — alleen de volgorde ervan.
 */
export function HerschikbaarHoofdstuk({
  sleutel,
  positie,
  onVerplaats,
  children,
}: PropsWithChildren<HerschikbaarHoofdstukProps>) {
  const [wordtOvergeslept, setWordtOvergeslept] = useState(false);

  return (
    <div
      style={{ order: positie }}
      data-hoofdstuk-sleutel={sleutel}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DATA_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!wordtOvergeslept) setWordtOvergeslept(true);
      }}
      onDragLeave={() => setWordtOvergeslept(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes(DATA_TYPE)) return;
        e.preventDefault();
        setWordtOvergeslept(false);
        const vanSleutel = e.dataTransfer.getData(DATA_TYPE);
        if (vanSleutel) onVerplaats(vanSleutel, sleutel);
      }}
      className={cn(
        "group/herschik relative rounded-md transition-colors",
        wordtOvergeslept && "bg-sidebar-accent/50 outline-dashed outline-1 outline-primary/50",
      )}
    >
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData(DATA_TYPE, sleutel);
        }}
        onDragEnd={() => setWordtOvergeslept(false)}
        title="Versleep om dit hoofdstuk te herschikken"
        aria-label="Hoofdstuk verslepen"
        className="absolute left-0.5 top-2 bottom-2 w-1.5 rounded-full bg-sidebar-border opacity-0 cursor-grab transition-opacity group-hover/herschik:opacity-100 hover:bg-primary active:cursor-grabbing group-data-[collapsible=icon]:hidden z-10"
      />
      {children}
    </div>
  );
}
