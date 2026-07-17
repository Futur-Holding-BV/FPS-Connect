import { useState } from "react";
import { Sparkles, Check, X, Clock, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface AiVoorstelItem {
  id: number;
  veld: string;
  huidige_waarde?: string | null;
  voorgestelde_waarde?: string | null;
  reden?: string | null;
  brondocument?: string | null;
  paginanummer?: number | null;
  bewijskenmerken?: unknown;
  impact?: string | null;
  status: string;
  confidence?: number | null;
  vertrouwen_score?: number | null;
}

interface Props {
  voorstellen: AiVoorstelItem[];
  onBeoordeel: (id: number, status: "goedgekeurd" | "afgewezen" | "later", correctieTekst?: string) => void;
  onBulkAccepteerAanvullingen?: () => Promise<void> | void;
  magSchrijven?: boolean;
  isLoading?: boolean;
}

const IMPACT_STIJL: Record<string, string> = {
  hoog: "bg-red-100 text-red-700",
  gemiddeld: "bg-amber-100 text-amber-700",
  laag: "bg-gray-100 text-gray-600",
};

const VELD_LABELS: Record<string, string> = {
  naam: "Naam",
  email: "E-mailadres",
  telefoon: "Telefoon",
  mobiel: "Mobiel",
  adres: "Adres",
  postcode: "Postcode",
  woonplaats: "Woonplaats",
  geboortedatum: "Geboortedatum",
  bsn: "BSN",
  rijbewijs: "Rijbewijs",
  rijbewijs_vervaldatum: "Rijbewijs vervaldatum",
  vca_vervaldatum: "VCA vervaldatum",
  bhv_vervaldatum: "BHV vervaldatum",
  ehbo_vervaldatum: "EHBO vervaldatum",
  cv_tekst: "CV-tekst",
  in_dienst_sinds: "In dienst sinds",
  noodcontact_naam: "Noodcontact naam",
  noodcontact_telefoon: "Noodcontact telefoon",
};

function VoorstelRegel({
  item,
  onBeoordeel,
  magSchrijven,
}: {
  item: AiVoorstelItem;
  onBeoordeel: Props["onBeoordeel"];
  magSchrijven?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [correctie, setCorrectie] = useState("");
  const [metCorrectie, setMetCorrectie] = useState(false);

  const bezig = item.status !== "open";
  const label = VELD_LABELS[item.veld] ?? item.veld;
  const isAfwijking = item.reden?.startsWith("Afwijking") ?? false;
  const zekerheid = item.vertrouwen_score ?? item.confidence;
  const zekerheidPct = zekerheid != null ? Math.round(zekerheid * 100) : null;
  const bewijs =
    Array.isArray(item.bewijskenmerken) && item.bewijskenmerken.length > 0
      ? (item.bewijskenmerken as Array<{ stap: string; resultaat: string }>)
      : null;
  const heeftDetails = !!(item.reden || item.brondocument || bewijs);

  return (
    <div
      className={cn(
        "rounded-lg border p-4 space-y-2",
        bezig
          ? "opacity-60 bg-muted/30 border-muted"
          : isAfwijking
            ? "bg-orange-50/60 border-orange-200"
            : "bg-amber-50/60 border-amber-200",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
          <Sparkles
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              isAfwijking ? "text-orange-700" : "text-amber-700",
            )}
          />
          <span
            className={cn(
              "text-sm font-medium",
              isAfwijking ? "text-orange-900" : "text-amber-900",
            )}
          >
            {label}
          </span>
          {isAfwijking ? (
            <Badge className="text-xs bg-orange-100 text-orange-700 border-orange-200">
              Afwijking
            </Badge>
          ) : (
            <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200">
              Aanvulling
            </Badge>
          )}
          {item.impact && (
            <Badge className={cn("text-xs", IMPACT_STIJL[item.impact] ?? IMPACT_STIJL.laag)}>
              {item.impact}
            </Badge>
          )}
          {zekerheidPct != null && (
            <span className="text-xs text-muted-foreground">{zekerheidPct}% zekerheid</span>
          )}
          {bezig && (
            <Badge variant="secondary" className="text-xs">
              {item.status === "goedgekeurd"
                ? "Overgenomen"
                : item.status === "afgewezen"
                  ? "Afgewezen"
                  : "Uitgesteld"}
            </Badge>
          )}
        </div>
        {heeftDetails && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground shrink-0"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        )}
      </div>

      <div className="text-sm space-y-1">
        {item.huidige_waarde && (
          <p className="text-muted-foreground text-xs">
            Huidig: <span className="line-through">{item.huidige_waarde}</span>
          </p>
        )}
        <p className={cn("font-medium", isAfwijking ? "text-orange-900" : "text-amber-900")}>
          Voorstel: {item.voorgestelde_waarde ?? "—"}
        </p>
      </div>

      {open && (
        <div className="space-y-1.5 pt-1 text-xs text-muted-foreground border-t border-muted/50">
          {item.reden && <p>{item.reden}</p>}
          {item.brondocument && (
            <p>
              Bron: {item.brondocument}
              {item.paginanummer ? ` (p. ${item.paginanummer})` : ""}
            </p>
          )}
          {bewijs && (
            <ul className="mt-1 space-y-0.5 pl-2 border-l-2 border-muted">
              {bewijs.map((b, i) => (
                <li key={i}>
                  <span className="font-medium">{b.stap}:</span> {b.resultaat}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!bezig && magSchrijven !== false && (
        <div className="space-y-2 pt-1">
          {metCorrectie && (
            <Textarea
              value={correctie}
              onChange={(e) => setCorrectie(e.target.value)}
              placeholder="Gecorrigeerde waarde..."
              rows={2}
              className="text-sm"
            />
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
              onClick={() =>
                onBeoordeel(item.id, "goedgekeurd", metCorrectie ? correctie : undefined)
              }
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              {metCorrectie ? "Bevestig gecorrigeerde waarde" : "Overnemen"}
            </Button>
            {!metCorrectie && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setMetCorrectie(true)}
              >
                Aanpassen en overnemen
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => onBeoordeel(item.id, "later")}
            >
              <Clock className="h-3.5 w-3.5 mr-1" />
              Later
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-destructive"
              onClick={() => onBeoordeel(item.id, "afgewezen")}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Afwijzen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AiVoorstelKaart({
  voorstellen,
  onBeoordeel,
  onBulkAccepteerAanvullingen,
  magSchrijven,
  isLoading,
}: Props) {
  const openVoorstellen = voorstellen.filter((v) => v.status === "open");
  const behandeld = voorstellen.filter((v) => v.status !== "open");
  const heeftOpenAanvullingen = openVoorstellen.some(
    (v) => !(v.reden?.startsWith("Afwijking") ?? false),
  );

  if (isLoading) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-600 animate-pulse" />
          <span className="text-sm text-amber-700">AI-analyse bezig...</span>
        </div>
      </div>
    );
  }

  if (voorstellen.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Sparkles className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-900">
          AI-analyse van het medewerkerdossier
        </h3>
        <span className="text-xs text-muted-foreground">
          {openVoorstellen.length} openstaand
        </span>
        {magSchrijven !== false &&
          heeftOpenAanvullingen &&
          onBulkAccepteerAanvullingen && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-7 text-xs gap-1"
              onClick={async () => {
                await onBulkAccepteerAanvullingen();
              }}
            >
              <CheckCircle2 className="h-3 w-3" />
              Alle aanvullingen accepteren
            </Button>
          )}
      </div>
      <p className="text-xs text-amber-700">
        U bepaalt zelf wat overgenomen wordt. Niets wordt automatisch gewijzigd.
      </p>
      <div className="space-y-2">
        {[...openVoorstellen, ...behandeld].map((v) => (
          <VoorstelRegel
            key={v.id}
            item={v}
            onBeoordeel={onBeoordeel}
            magSchrijven={magSchrijven}
          />
        ))}
      </div>
    </div>
  );
}
