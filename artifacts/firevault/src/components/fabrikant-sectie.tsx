import { useState } from "react";
import { ExternalLink, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const FABRIKANTEN: { naam: string; url: string | null }[] = [
  { naam: "Mulcol", url: "https://www.mulcol.com/selector" },
  { naam: "Hilti", url: "https://firestop.hilti.com/" },
  { naam: "Promat", url: null },
  { naam: "Rockwool", url: "https://www.rockwool.com/nl/producten/categorieen/fire-protection/" },
  { naam: "Nullifire", url: "https://www.nullifire.com/nl-nl/" },
  { naam: "Flamro", url: "https://flamro.nl/product-selector" },
  { naam: "Red Profs", url: "https://redprofs.com/" },
  { naam: "Overige", url: null },
];

const GEEN = "__geen__";

export function FabrikantSectie() {
  const [gekozen, setGekozen] = useState(GEEN);
  const fabrikant = FABRIKANTEN.find((f) => f.naam === gekozen);

  return (
    <div className="space-y-3">
      <div>
        <Label>Fabrikant (optioneel)</Label>
        <Select value={gekozen} onValueChange={setGekozen}>
          <SelectTrigger>
            <SelectValue placeholder="Kies fabrikant..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={GEEN}>Geen / niet van toepassing</SelectItem>
            {FABRIKANTEN.map((f) => (
              <SelectItem key={f.naam} value={f.naam}>
                {f.naam}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {fabrikant && fabrikant.url && (
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={() => window.open(fabrikant.url!, "_blank", "noopener,noreferrer")}
        >
          <ExternalLink className="h-4 w-4" />
          {fabrikant.naam} selector openen
        </Button>
      )}

      {fabrikant && !fabrikant.url && gekozen !== GEEN && (
        <p className="text-xs text-muted-foreground">
          Geen directe selector beschikbaar. Zoek de documentatie op de website van {fabrikant.naam}.
        </p>
      )}

      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <p>
          Fabrikantselectors zijn hulpmiddelen ter ondersteuning. Het geldige testrapport,
          classificatierapport en verwerkingsvoorschrift van de fabrikant zijn altijd leidend.
          Leg gevonden productadvies vast als opmerking of bijlage bij deze spot.
        </p>
      </div>
    </div>
  );
}
