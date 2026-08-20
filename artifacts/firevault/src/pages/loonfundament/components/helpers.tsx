/**
 * Loonfundament — gedeelde helpers en constanten.
 * Geen domeinlogica; alleen presentatieprimitieven.
 */

import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle } from "lucide-react";

export const HUIDIG_JAAR = new Date().getFullYear();

export function DatumLabel({ iso }: { iso?: string | null }) {
  if (!iso) return <span className="text-muted-foreground">—</span>;
  return (
    <>
      {new Date(iso).toLocaleString("nl-NL", {
        dateStyle: "medium",
        timeStyle: "short",
      })}
    </>
  );
}

export function StatusBadge({ volledig }: { volledig: boolean }) {
  return volledig ? (
    <Badge className="bg-green-100 text-green-800 border-green-200">
      <CheckCircle2 className="w-3 h-3 mr-1" />
      Volledig
    </Badge>
  ) : (
    <Badge variant="outline" className="border-amber-400 text-amber-700">
      <AlertCircle className="w-3 h-3 mr-1" />
      Onvolledig
    </Badge>
  );
}

export const STATUS_LABEL: Record<string, string> = {
  concept: "Concept",
  volledig: "Volledig",
  onvolledig: "Onvolledig",
  bron_gewijzigd: "Bron gewijzigd",
  vervangen: "Vervangen",
};

export const GEREED_LABEL: Record<string, string> = {
  volledig: "Volledig",
  ontbreekt: "Ontbreekt",
  onvolledig: "Onvolledig",
  bron_gewijzigd: "Bron gewijzigd",
  niet_herleidbaar: "Niet herleidbaar",
};

export const BRONSOORT_LABELS: Record<string, string> = {
  primaire_xlsx: "Primaire XLSX (parameters)",
  rekenvoorschriften: "Rekenvoorschriften",
  parameterbijlage: "Parameterbijlage",
  gegevensspecificaties: "Gegevensspecificaties",
  loonbelastingtabellen: "Loonbelastingtabellen",
  cijferbijlage: "Cijferbijlage",
  handboek: "Handboek loonaangifte",
};

/** Vaste volgorde van de 7 officiële bronsoorten (API-contract: minItems/maxItems 7). */
export const BRON_VOLGORDE = [
  "primaire_xlsx",
  "rekenvoorschriften",
  "parameterbijlage",
  "gegevensspecificaties",
  "loonbelastingtabellen",
  "cijferbijlage",
  "handboek",
] as const;

export type BronsoortSleutel = (typeof BRON_VOLGORDE)[number];

export type BronVeldWaarden = {
  bron_url: string;
  officiele_bestandsnaam: string;
  officiele_versie: string;
  verwachte_sha256: string;
  vindplaats: string;
};

export const LEEG_BRON: BronVeldWaarden = {
  bron_url: "",
  officiele_bestandsnaam: "",
  officiele_versie: "",
  verwachte_sha256: "",
  vindplaats: "",
};

export function leegBronnenRecord(): Record<string, BronVeldWaarden> {
  return Object.fromEntries(BRON_VOLGORDE.map((b) => [b, { ...LEEG_BRON }]));
}
