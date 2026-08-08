// ASSISTENT_01 §4 — de assistent weet waar je bent. Eén centrale afleiding
// van de huidige route naar (scherm, open object). Detailpagina's kunnen een
// mooier etiket zetten via useZetAssistentContext (bv. "offerte 2026-114").
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";

/** Objecttypen die de server-contextmotor kent (lib/aiContext). */
export type AssistentObjectType =
  | "gebouw" | "voorziening" | "offerte" | "medewerker"
  | "document" | "dossier" | "onderhoud" | "klant";

export interface AssistentContextWaarde {
  scherm: string;
  objectType?: AssistentObjectType;
  objectId?: number;
  /** Zichtbaar etiket: "je kijkt naar offerte 2026-114" */
  label: string;
}

// Route-patronen voor objecten die de server-contextmotor kan ophalen
const OBJECT_PATRONEN: Array<{ regex: RegExp; type: AssistentObjectType; naam: string }> = [
  { regex: /^\/gebouwen\/(\d+)/, type: "gebouw", naam: "gebouw" },
  { regex: /^\/voorzieningen\/(\d+)/, type: "voorziening", naam: "spot" },
  { regex: /^\/offertes\/(\d+)/, type: "offerte", naam: "offerte" },
  { regex: /^\/personeel\/(\d+)/, type: "medewerker", naam: "medewerker" },
  { regex: /^\/crm\/(\d+)/, type: "klant", naam: "klant" },
  { regex: /^\/onderhoud\/werkbonnen\/(\d+)/, type: "onderhoud", naam: "werkbon" },
];

// Detailpagina's zonder servertype in de contextmotor: wel een leesbaar
// etiket + schermpad, geen object-context (bewuste keuze — de contextmotor
// kent deze typen (nog) niet; de opdracht-/calculatiepagina's hebben
// bovendien hun eigen ingebedde AI-chat).
const LABEL_PATRONEN: Array<{ regex: RegExp; naam: string }> = [
  { regex: /^\/facturen\/(\d+)/, naam: "factuur" },
  { regex: /^\/opdrachten\/(\d+)/, naam: "opdracht" },
  { regex: /^\/modules\/calculatie\/(\d+)/, naam: "calculatie" },
];

// Eerste padsegment → leesbare schermnaam
const SCHERM_NAMEN: Record<string, string> = {
  "": "het dashboard",
  gebouwen: "Gebouwen",
  voorzieningen: "Spots",
  offertes: "Offertes",
  opdrachten: "Opdrachten",
  facturen: "Facturen",
  crm: "Relaties (CRM)",
  personeel: "Personeel",
  documenten: "Documenten",
  dossiers: "Dossiers",
  onderhoud: "Onderhoud",
  calculaties: "Calculaties",
  planning: "Planning",
  uren: "Uren",
  verlof: "Verlof",
  berichten: "Berichten",
  "werk-inbox": "Werk-inbox",
  instellingen: "Instellingen",
  beheer: "Beheer",
  toolbox: "Toolbox",
  inkoop: "Inkoop",
  magazijn: "Magazijn",
  financieel: "Financieel",
  assistent: "de assistent",
  info: "App-informatie",
};

export function bepaalContextUitRoute(pad: string): AssistentContextWaarde {
  for (const p of OBJECT_PATRONEN) {
    const m = pad.match(p.regex);
    if (m?.[1]) {
      const id = Number(m[1]);
      return { scherm: pad, objectType: p.type, objectId: id, label: `${p.naam} #${id}` };
    }
  }
  for (const p of LABEL_PATRONEN) {
    const m = pad.match(p.regex);
    if (m?.[1]) return { scherm: pad, label: `${p.naam} #${Number(m[1])}` };
  }
  const segment = pad.split("/")[1] ?? "";
  const naam = SCHERM_NAMEN[segment] ?? segment;
  return { scherm: pad, label: naam || "het dashboard" };
}

interface ContextStore {
  waarde: AssistentContextWaarde;
  zetOverride: (o: { label: string } | null) => void;
}

const AssistentContext = createContext<ContextStore | null>(null);

export function AssistentContextProvider({ children }: { children: React.ReactNode }) {
  const [locatie] = useLocation();
  const [override, zetOverride] = useState<{ label: string } | null>(null);

  // Override vervalt bij routewissel
  useEffect(() => { zetOverride(null); }, [locatie]);

  const waarde = useMemo<AssistentContextWaarde>(() => {
    const basis = bepaalContextUitRoute(locatie);
    return override ? { ...basis, label: override.label } : basis;
  }, [locatie, override]);

  const store = useMemo(() => ({ waarde, zetOverride }), [waarde]);
  return <AssistentContext.Provider value={store}>{children}</AssistentContext.Provider>;
}

export function useAssistentContext(): AssistentContextWaarde {
  const ctx = useContext(AssistentContext);
  return ctx?.waarde ?? { scherm: "/", label: "het dashboard" };
}

/** Detailpagina's zetten hiermee een leesbaar etiket, bv. "offerte 2026-114". */
export function useZetAssistentLabel(label: string | null | undefined): void {
  const ctx = useContext(AssistentContext);
  const zet = ctx?.zetOverride;
  useEffect(() => {
    if (label && zet) zet({ label });
  }, [label, zet]);
}
